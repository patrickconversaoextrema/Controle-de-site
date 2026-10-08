import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeWithCompetitors } from './src/analyzer/index.js';
import { browserAvailable, closeBrowser } from './src/analyzer/browser.js';
import { normalizeUrl } from './src/utils/url.js';
import { openStore } from './src/store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MAX_COMPETITORS = 3;
const MAX_RUNNING = Number(process.env.MAX_CONCURRENT_JOBS) || 2;
const JOB_TTL_MS = 60 * 60 * 1000;
const ID_RE = /^[0-9a-f-]{36}$/;

const store = openStore();
const app = express();
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));
// Fonte e ícones do design system servidos localmente (sem CDN)
app.use('/vendor/geist', express.static(path.join(__dirname, 'node_modules/geist/dist/fonts'), { maxAge: '30d' }));
app.use('/vendor/phosphor', express.static(path.join(__dirname, 'node_modules/@phosphor-icons/web/src'), { maxAge: '30d' }));

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
        store.save({ id: job.id, createdAt: new Date().toISOString(), result, images });
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

app.post('/api/analyze', (req, res) => {
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
  const job = { id, main, competitors: comps, status: 'queued', createdAt: Date.now(), progress: null };
  jobs.set(id, job);
  queue.push(job);
  pump();
  res.status(202).json({ id });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    // Job já expirou da memória, mas o relatório pode estar salvo.
    if (ID_RE.test(req.params.id) && store.get(req.params.id)) return res.json({ id: req.params.id, status: 'done', reportId: req.params.id });
    return res.status(404).json({ error: 'Análise não encontrada ou expirada.' });
  }
  const position = job.status === 'queued' ? queue.indexOf(job) + 1 : 0;
  res.json({ id: job.id, status: job.status, position, progress: job.progress, error: job.error, reportId: job.status === 'done' ? job.id : undefined });
});

// ---------- Relatórios salvos ----------
app.get('/api/reports', (req, res) => {
  res.json(store.list({ limit: req.query.limit, q: String(req.query.q || '') }));
});

app.get('/api/reports/:id', (req, res) => {
  const rep = ID_RE.test(req.params.id) ? store.get(req.params.id) : null;
  if (!rep) return res.status(404).json({ error: 'Relatório não encontrado.' });
  res.json({ id: rep.id, createdAt: rep.createdAt, history: store.history(rep.pageKey), ...rep.result });
});

app.get('/api/reports/:id/img/:n', (req, res) => {
  const img = ID_RE.test(req.params.id) ? store.image(req.params.id, Number(req.params.n)) : null;
  if (!img) return res.status(404).end();
  res.set({ 'content-type': img.type, 'cache-control': 'public, max-age=31536000, immutable' });
  res.send(Buffer.from(img.data));
});

app.delete('/api/reports/:id', (req, res) => {
  if (!ID_RE.test(req.params.id) || !store.remove(req.params.id)) return res.status(404).json({ error: 'Relatório não encontrado.' });
  res.status(204).end();
});

// Link permanente do relatório
app.get('/r/:id', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, browser: await browserAvailable(), pagespeed: Boolean(process.env.PAGESPEED_API_KEY) });
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
