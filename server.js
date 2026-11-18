import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeWithCompetitors } from './src/analyzer/index.js';
import { browserAvailable, closeBrowser } from './src/analyzer/browser.js';
import { normalizeUrl } from './src/utils/url.js';
import { openStore } from './src/store.js';
import { searchProvider } from './src/analyzer/competitors.js';
import { PROVIDERS, listModels, pickDefaultModel, generateDiagnosis } from './src/ai.js';
import { encrypt, decrypt, maskKey, masterKey } from './src/secrets.js';
import {
  SESSION_COOKIE, SESSION_TTL_MS, hashPassword, checkLogin, verifyPassword, validatePassword, validEmail,
  parseCookies, sessionCookie, createRateLimiter, ensureAdmin,
} from './src/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MAX_COMPETITORS = 3;
const MAX_RUNNING = Number(process.env.MAX_CONCURRENT_JOBS) || 2;
const JOB_TTL_MS = 60 * 60 * 1000;
const ID_RE = /^[0-9a-f-]{36}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const INDEX = path.join(__dirname, 'public', 'index.html');

const store = openStore();
masterKey(); // cria a chave-mestra de cifragem na primeira execução
ensureAdmin(store);
setInterval(() => store.purgeExpiredSessions(), 6 * 60 * 60 * 1000).unref();
const loginLimiter = createRateLimiter({ max: 8, windowMs: 15 * 60 * 1000 });

const app = express();
// Atrás de proxy (Render, Railway, Nginx) para req.secure e req.ip corretos
if (process.env.TRUST_PROXY !== '0' && (process.env.TRUST_PROXY || process.env.NODE_ENV === 'production')) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set({
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
    'x-frame-options': 'DENY',
  });
  next();
});
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));
// Fonte e ícones do design system servidos localmente (sem CDN)
app.use('/vendor/geist', express.static(path.join(__dirname, 'node_modules/geist/dist/fonts'), { maxAge: '30d' }));
app.use('/vendor/phosphor', express.static(path.join(__dirname, 'node_modules/@phosphor-icons/web/src'), { maxAge: '30d' }));

// ---------- Sessão ----------
app.use((req, _res, next) => {
  req.sessionToken = parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
  req.user = store.userBySession(req.sessionToken);
  next();
});

// Proteção contra CSRF: requisições que alteram dados precisam de um cabeçalho que
// formulários de outros sites não conseguem enviar sem passar pelo CORS.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'raio-x') return res.status(403).json({ error: 'Requisição não permitida.' });
  next();
});

const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Faça login para continuar.' }));
const requireAdmin = (req, res, next) =>
  !req.user ? res.status(401).json({ error: 'Faça login para continuar.' }) : req.user.role !== 'admin' ? res.status(403).json({ error: 'Apenas administradores.' }) : next();

app.post('/api/login', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const key = `${req.ip}|${email}`;
  if (loginLimiter.tooMany(key)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' });
  const user = email && password ? checkLogin(store, email, password) : null;
  if (!user) {
    loginLimiter.fail(key);
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }
  loginLimiter.clear(key);
  const token = store.createSession(user.id, SESSION_TTL_MS);
  res.set('set-cookie', sessionCookie(token, { secure: req.secure }));
  res.json({ user: store.userBySession(token) });
});

app.post('/api/logout', (req, res) => {
  if (req.sessionToken) store.deleteSession(req.sessionToken);
  res.set('set-cookie', sessionCookie('', { secure: req.secure, maxAgeMs: 0 }));
  res.status(204).end();
});

app.get('/api/me', (req, res) => (req.user ? res.json({ user: req.user }) : res.status(401).json({ error: 'Não autenticado.', setupNeeded: store.countUsers() === 0 })));

app.post('/api/me/password', requireAuth, (req, res) => {
  const { current, password } = req.body || {};
  const full = store.userById(req.user.id);
  if (!verifyPassword(String(current || ''), full.password_hash)) return res.status(400).json({ error: 'Senha atual incorreta.' });
  const err = validatePassword(password);
  if (err) return res.status(400).json({ error: err });
  store.updateUser(req.user.id, { passwordHash: hashPassword(password) }); // encerra todas as sessões
  const token = store.createSession(req.user.id, SESSION_TTL_MS);
  res.set('set-cookie', sessionCookie(token, { secure: req.secure }));
  res.json({ ok: true });
});

// ---------- Equipe (admin) ----------
// ---------- Inteligência artificial (chave da pessoa ou da equipe) ----------
const TEAM_AI = 'ai.team';
const storedAi = (scope, userId) => (scope === 'team' ? store.getSetting(TEAM_AI) : store.getUserAi(userId));
const saveAi = (scope, userId, cfg) => (scope === 'team' ? store.setSetting(TEAM_AI, cfg) : store.setUserAi(userId, cfg));

/** Configuração em uso: a da pessoa tem prioridade sobre a da equipe. */
function resolveAi(userId) {
  for (const scope of ['user', 'team']) {
    const cfg = storedAi(scope, userId);
    if (!cfg?.key) continue;
    try {
      return { provider: cfg.provider, model: cfg.model, apiKey: decrypt(cfg.key), source: scope };
    } catch {
      console.warn(`[ai] não foi possível ler a chave (${scope}); a SECRET_KEY mudou?`);
    }
  }
  return null;
}

function publicAi(cfg) {
  if (!cfg?.key) return null;
  return { provider: cfg.provider, providerLabel: PROVIDERS[cfg.provider]?.label, model: cfg.model, keyMask: cfg.mask, updatedAt: cfg.updatedAt, updatedBy: cfg.updatedBy || null };
}

const scopeOf = (req, res) => {
  const scope = req.body?.scope || req.query.scope;
  if (scope !== 'user' && scope !== 'team') {
    res.status(400).json({ error: 'Escolha se a chave é sua ou da equipe.' });
    return null;
  }
  if (scope === 'team' && req.user.role !== 'admin') {
    res.status(403).json({ error: 'Só administradores alteram a chave da equipe.' });
    return null;
  }
  return scope;
};

app.get('/api/ai', requireAuth, (req, res) => {
  const active = resolveAi(req.user.id);
  res.json({
    user: publicAi(storedAi('user', req.user.id)),
    team: publicAi(storedAi('team')),
    active: active ? active.source : null,
    canEditTeam: req.user.role === 'admin',
    providers: Object.fromEntries(Object.entries(PROVIDERS).map(([k, v]) => [k, { label: v.label, keyHint: v.keyHint }])),
  });
});

// Testa a chave (nova ou a já salva) e lista os modelos da conta
app.post('/api/ai/test', requireAuth, async (req, res) => {
  const scope = scopeOf(req, res);
  if (!scope) return;
  const provider = String(req.body?.provider || '');
  let apiKey = String(req.body?.apiKey || '').trim();
  if (!apiKey) {
    const saved = storedAi(scope, req.user.id);
    if (saved?.key && saved.provider === provider) apiKey = decrypt(saved.key);
  }
  try {
    const models = await listModels(provider, apiKey);
    res.json({ models, defaultModel: pickDefaultModel(provider, models) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/ai', requireAuth, async (req, res) => {
  const scope = scopeOf(req, res);
  if (!scope) return;
  const provider = String(req.body?.provider || '');
  const model = String(req.body?.model || '').trim();
  let apiKey = String(req.body?.apiKey || '').trim();
  const saved = storedAi(scope, req.user.id);
  if (!PROVIDERS[provider]) return res.status(400).json({ error: 'Escolha Anthropic ou OpenAI.' });
  if (!apiKey && saved?.key && saved.provider === provider) apiKey = decrypt(saved.key);
  if (!apiKey) return res.status(400).json({ error: 'Cole a chave de API.' });
  let models;
  try {
    models = await listModels(provider, apiKey);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const chosen = model && models.includes(model) ? model : pickDefaultModel(provider, models);
  if (!chosen) return res.status(400).json({ error: 'Nenhum modelo de texto disponível nesta conta.' });
  saveAi(scope, req.user.id, { provider, model: chosen, key: encrypt(apiKey), mask: maskKey(apiKey), updatedAt: new Date().toISOString(), updatedBy: req.user.name });
  res.json({ saved: publicAi(storedAi(scope, req.user.id)), models });
});

app.delete('/api/ai', requireAuth, (req, res) => {
  const scope = scopeOf(req, res);
  if (!scope) return;
  saveAi(scope, req.user.id, null);
  res.status(204).end();
});

// O que a interface precisa saber sobre o servidor
app.get('/api/config', requireAuth, (req, res) => {
  const ai = resolveAi(req.user.id);
  res.json({ search: searchProvider(), ai: ai ? { configured: true, source: ai.source, provider: ai.provider, providerLabel: PROVIDERS[ai.provider].label, model: ai.model } : { configured: false } });
});

app.get('/api/users', requireAdmin, (_req, res) => res.json(store.listUsers()));

app.post('/api/users', requireAdmin, (req, res) => {
  const { email, name, password, role } = req.body || {};
  if (!validEmail(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Informe o nome.' });
  const err = validatePassword(password);
  if (err) return res.status(400).json({ error: err });
  if (store.userByEmail(email)) return res.status(409).json({ error: 'Já existe uma conta com esse e-mail.' });
  const user = store.createUser({ email: email.toLowerCase(), name, passwordHash: hashPassword(password), role: role === 'admin' ? 'admin' : 'member' });
  res.status(201).json(user);
});

app.patch('/api/users/:id', requireAdmin, (req, res) => {
  const target = store.userById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const { name, role, disabled, password } = req.body || {};
  const losingAdmin = target.role === 'admin' && !target.disabled && ((role && role !== 'admin') || disabled === true);
  if (losingAdmin && store.countActiveAdmins() <= 1) return res.status(400).json({ error: 'É preciso manter pelo menos um administrador ativo.' });
  if (req.params.id === req.user.id && disabled === true) return res.status(400).json({ error: 'Você não pode desativar a própria conta.' });
  let passwordHash;
  if (password != null) {
    const err = validatePassword(password);
    if (err) return res.status(400).json({ error: err });
    passwordHash = hashPassword(password);
  }
  res.json(
    store.updateUser(req.params.id, {
      name: name != null ? String(name).trim() || target.name : undefined,
      role: role === 'admin' || role === 'member' ? role : undefined,
      disabled: typeof disabled === 'boolean' ? disabled : undefined,
      passwordHash,
    }),
  );
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const target = store.userById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Você não pode excluir a própria conta.' });
  if (target.role === 'admin' && !target.disabled && store.countActiveAdmins() <= 1) return res.status(400).json({ error: 'É preciso manter pelo menos um administrador ativo.' });
  store.deleteUser(req.params.id);
  res.status(204).end();
});

// ---------- Análises ----------
/** @type {Map<string, any>} */
const jobs = new Map();
const queue = [];
let running = 0;

/**
 * Separa as imagens embutidas (data URI) do relatório: elas vão para o banco
 * e o JSON passa a apontar para /api/reports/:id/img/:n. Repetidas são guardadas uma vez.
 */
function extractImages(value, id, images, seen = new Map()) {
  if (typeof value === 'string' && value.startsWith('data:image/')) {
    if (!seen.has(value)) {
      const [meta, b64] = value.split(',', 2);
      images.push({ type: meta.slice(5).split(';')[0], buf: Buffer.from(b64, 'base64') });
      seen.set(value, `/api/reports/${id}/img/${images.length - 1}`);
    }
    return seen.get(value);
  }
  if (Array.isArray(value)) return value.map((v) => extractImages(v, id, images, seen));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = extractImages(v, id, images, seen);
    return out;
  }
  return value;
}

function pump() {
  while (running < MAX_RUNNING && queue.length) {
    const job = queue.shift();
    running++;
    job.status = 'running';
    analyzeWithCompetitors(job.main, job.competitors, (p) => {
      job.progress = p;
    }, { niche: job.niche })
      .then(async (raw) => {
        job.progress = { ...(job.progress || {}), site: job.main, step: `Escrevendo o diagnóstico com ${PROVIDERS[job.ai.provider].label}`, done: job.progress?.total || 1, total: job.progress?.total || 1 };
        try {
          raw.ai = await generateDiagnosis(job.ai, raw);
        } catch (err) {
          raw.aiError = err.message;
        }
        return raw;
      })
      .then((raw) => {
        const images = [];
        const result = extractImages(raw, job.id, images);
        store.save({ id: job.id, createdAt: new Date().toISOString(), result, images, createdBy: job.userId, niche: job.niche || null });
        job.status = 'done';
      })
      .catch((err) => {
        job.status = 'error';
        job.error = err.message;
      })
      .finally(() => {
        running--;
        job.finishedAt = Date.now();
        job.ai = null; // não mantém a chave na memória do job
        pump();
      });
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) if (job.finishedAt && now - job.finishedAt > JOB_TTL_MS) jobs.delete(id);
}, 5 * 60 * 1000).unref();

app.post('/api/analyze', requireAuth, (req, res) => {
  const { url, competitors = [] } = req.body || {};
  const niche = String(req.body?.niche || '').trim().replace(/\s+/g, ' ');
  if (niche.length > 120) return res.status(400).json({ error: 'Nicho longo demais (máximo de 120 caracteres).' });
  let main;
  let comps;
  try {
    main = normalizeUrl(url);
    comps = (Array.isArray(competitors) ? competitors : [])
      .map((c) => (typeof c === 'string' ? c.trim() : ''))
      .filter(Boolean)
      .slice(0, MAX_COMPETITORS)
      .map(normalizeUrl);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const ai = resolveAi(req.user.id);
  if (!ai) return res.status(400).json({ code: 'ai_required', error: 'Para analisar, cadastre uma chave de API da Anthropic ou da OpenAI em Inteligência artificial.' });
  if (!comps.length && !niche) return res.status(400).json({ error: 'Informe o nicho para encontrarmos os concorrentes, ou digite os concorrentes manualmente.' });
  if (!comps.length && !searchProvider()) return res.status(400).json({ error: 'A busca automática de concorrentes não está configurada no servidor. Informe os concorrentes manualmente ou peça ao administrador para configurar a SERPER_API_KEY.' });
  if (queue.length > 20) return res.status(503).json({ error: 'Muitas análises na fila. Tente novamente em instantes.' });
  const id = crypto.randomUUID();
  const job = { id, main, competitors: comps, niche: comps.length ? '' : niche, status: 'queued', createdAt: Date.now(), progress: null, userId: req.user.id, ai };
  jobs.set(id, job);
  queue.push(job);
  pump();
  res.status(202).json({ id });
});

app.get('/api/jobs/:id', requireAuth, (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    // Job já expirou da memória, mas o relatório pode estar salvo.
    if (ID_RE.test(req.params.id) && store.get(req.params.id)) return res.json({ id: req.params.id, status: 'done', reportId: req.params.id });
    return res.status(404).json({ error: 'Análise não encontrada ou expirada.' });
  }
  const position = job.status === 'queued' ? queue.indexOf(job) + 1 : 0;
  res.json({ id: job.id, status: job.status, position, progress: job.progress, error: job.error, reportId: job.status === 'done' ? job.id : undefined });
});

// ---------- Relatórios salvos (equipe) ----------
app.get('/api/reports', requireAuth, (req, res) => {
  res.json(store.list({ limit: req.query.limit, q: String(req.query.q || '') }));
});

app.get('/api/reports/:id', requireAuth, (req, res) => {
  const rep = ID_RE.test(req.params.id) ? store.get(req.params.id) : null;
  if (!rep) return res.status(404).json({ error: 'Relatório não encontrado.' });
  const author = rep.createdBy ? store.userById(rep.createdBy) : null;
  res.json({
    id: rep.id,
    createdAt: rep.createdAt,
    author: author?.name || null,
    shareUrl: rep.shareToken ? `/p/${rep.shareToken}` : null,
    canDelete: req.user.role === 'admin' || rep.createdBy === req.user.id,
    history: store.history(rep.pageKey),
    ...rep.result,
  });
});

app.get('/api/reports/:id/img/:n', requireAuth, (req, res) => sendImage(res, ID_RE.test(req.params.id) ? req.params.id : null, req.params.n));

app.delete('/api/reports/:id', requireAuth, (req, res) => {
  const rep = ID_RE.test(req.params.id) ? store.get(req.params.id) : null;
  if (!rep) return res.status(404).json({ error: 'Relatório não encontrado.' });
  if (req.user.role !== 'admin' && rep.createdBy !== req.user.id) return res.status(403).json({ error: 'Só quem criou a análise ou um administrador pode excluí-la.' });
  store.remove(req.params.id);
  res.status(204).end();
});

// Refaz o diagnóstico da IA de um relatório salvo (com a chave de quem pediu)
const aiRunning = new Set();
app.post('/api/reports/:id/ai', requireAuth, async (req, res) => {
  const rep = ID_RE.test(req.params.id) ? store.get(req.params.id) : null;
  if (!rep) return res.status(404).json({ error: 'Relatório não encontrado.' });
  const ai = resolveAi(req.user.id);
  if (!ai) return res.status(400).json({ code: 'ai_required', error: 'Cadastre uma chave de API da Anthropic ou da OpenAI em Inteligência artificial.' });
  if (aiRunning.has(rep.id)) return res.status(409).json({ error: 'O diagnóstico deste relatório já está sendo gerado.' });
  aiRunning.add(rep.id);
  try {
    // As capturas salvas voltam a ser imagens para a IA ver
    const toData = (u) => {
      const m = /\/img\/(\d+)$/.exec(u || '');
      const img = m ? store.image(rep.id, Number(m[1])) : null;
      return img ? `data:${img.type};base64,${Buffer.from(img.data).toString('base64')}` : null;
    };
    const withShots = (site) => site && { ...site, screenshots: { desktop: toData(site.screenshots?.desktop), mobile: toData(site.screenshots?.mobile) } };
    const analysis = { ...rep.result, main: withShots(rep.result.main), competitors: (rep.result.competitors || []).map(withShots) };
    const diagnosis = await generateDiagnosis(ai, analysis);
    const { aiError, ...rest } = rep.result;
    store.updateResult(rep.id, { ...rest, ai: diagnosis });
    res.json({ ai: diagnosis });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    aiRunning.delete(rep.id);
  }
});

// Link público de leitura para o cliente
app.post('/api/reports/:id/share', requireAuth, (req, res) => {
  const rep = ID_RE.test(req.params.id) ? store.get(req.params.id) : null;
  if (!rep) return res.status(404).json({ error: 'Relatório não encontrado.' });
  const token = rep.shareToken || crypto.randomBytes(24).toString('base64url');
  if (!rep.shareToken) store.setShareToken(rep.id, token);
  res.json({ shareUrl: `/p/${token}` });
});

app.delete('/api/reports/:id/share', requireAuth, (req, res) => {
  const rep = ID_RE.test(req.params.id) ? store.get(req.params.id) : null;
  if (!rep) return res.status(404).json({ error: 'Relatório não encontrado.' });
  store.setShareToken(rep.id, null);
  res.status(204).end();
});

// ---------- Visualização pública (sem login, só leitura) ----------
app.get('/api/public/:token', (req, res) => {
  const rep = TOKEN_RE.test(req.params.token) ? store.getByShareToken(req.params.token) : null;
  if (!rep) return res.status(404).json({ error: 'Este link não existe ou foi desativado.' });
  // As imagens passam a ser servidas pelo token público
  const json = JSON.stringify(rep.result).replaceAll(`/api/reports/${rep.id}/img/`, `/api/public/${req.params.token}/img/`);
  res.set('cache-control', 'no-store');
  res.type('json').send(`{"public":true,"createdAt":${JSON.stringify(rep.createdAt)},"history":[],${json.slice(1)}`);
});

app.get('/api/public/:token/img/:n', (req, res) => {
  const rep = TOKEN_RE.test(req.params.token) ? store.getByShareToken(req.params.token) : null;
  sendImage(res, rep?.id || null, req.params.n);
});

function sendImage(res, id, n) {
  const img = id ? store.image(id, Number(n)) : null;
  if (!img) return res.status(404).end();
  res.set({ 'content-type': img.type, 'cache-control': 'private, max-age=86400' });
  res.send(Buffer.from(img.data));
}

// Rotas da interface (a própria página decide o que mostrar)
for (const route of ['/r/:id', '/p/:token', '/login', '/equipe', '/conta', '/ia']) app.get(route, (_req, res) => res.sendFile(INDEX));

// Verificação de saúde (usada pelo Render) — leve, não abre o navegador
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/status', requireAdmin, async (_req, res) => {
  res.json({ browser: await browserAvailable(), pagespeed: Boolean(process.env.PAGESPEED_API_KEY), search: searchProvider(), maxConcurrentJobs: MAX_RUNNING, queue: queue.length, running });
});

const server = app.listen(PORT, () => {
  console.log(`Analisador de sites rodando em http://localhost:${PORT}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    server.close();
    await closeBrowser();
    store.close();
    process.exit(0);
  });
}
