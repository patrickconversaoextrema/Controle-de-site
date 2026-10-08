import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeWithCompetitors } from './src/analyzer/index.js';
import { browserAvailable, closeBrowser } from './src/analyzer/browser.js';
import { normalizeUrl } from './src/utils/url.js';
import { openStore } from './src/store.js';
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
    })
      .then((raw) => {
        const images = [];
        const result = extractImages(raw, job.id, images);
        store.save({ id: job.id, createdAt: new Date().toISOString(), result, images, createdBy: job.userId });
        job.status = 'done';
      })
      .catch((err) => {
        job.status = 'error';
        job.error = err.message;
      })
      .finally(() => {
        running--;
        job.finishedAt = Date.now();
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
  if (queue.length > 20) return res.status(503).json({ error: 'Muitas análises na fila. Tente novamente em instantes.' });
  const id = crypto.randomUUID();
  const job = { id, main, competitors: comps, status: 'queued', createdAt: Date.now(), progress: null, userId: req.user.id };
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
for (const route of ['/r/:id', '/p/:token', '/login', '/equipe', '/conta']) app.get(route, (_req, res) => res.sendFile(INDEX));

// Verificação de saúde (usada pelo Render) — leve, não abre o navegador
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/status', requireAdmin, async (_req, res) => {
  res.json({ browser: await browserAvailable(), pagespeed: Boolean(process.env.PAGESPEED_API_KEY), maxConcurrentJobs: MAX_RUNNING, queue: queue.length, running });
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
