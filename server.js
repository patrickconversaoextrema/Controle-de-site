import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeWithCompetitors } from './src/analyzer/index.js';
import { browserAvailable, closeBrowser } from './src/analyzer/browser.js';
import { normalizeUrl } from './src/utils/url.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const MAX_COMPETITORS = 3;
const MAX_RUNNING = Number(process.env.MAX_CONCURRENT_JOBS) || 2;
const JOB_TTL_MS = 6 * 60 * 60 * 1000;

const app = express();
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

/** @type {Map<string, any>} */
const jobs = new Map();
const queue = [];
let running = 0;

function pump() {
  while (running < MAX_RUNNING && queue.length) {
    const job = queue.shift();
    running++;
    job.status = 'running';
    analyzeWithCompetitors(job.main, job.competitors, (p) => {
      job.progress = p;
      job.log.push(`${p.site}: ${p.step}`);
      if (job.log.length > 50) job.log.shift();
    })
      .then((result) => {
        job.images = [];
        job.result = extractImages(result, job);
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

/**
 * Troca as imagens embutidas (data URI) por URLs servidas pelo servidor,
 * deixando o JSON do relatório leve. Imagens repetidas são guardadas uma vez.
 */
function extractImages(value, job, seen = new Map()) {
  if (typeof value === 'string' && value.startsWith('data:image/')) {
    if (!seen.has(value)) {
      const [meta, b64] = value.split(',', 2);
      job.images.push({ type: meta.slice(5).split(';')[0], buf: Buffer.from(b64, 'base64') });
      seen.set(value, `/api/img/${job.id}/${job.images.length - 1}`);
    }
    return seen.get(value);
  }
  if (Array.isArray(value)) return value.map((v) => extractImages(v, job, seen));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = extractImages(v, job, seen);
    return out;
  }
  return value;
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
  const job = { id, main, competitors: comps, status: 'queued', createdAt: Date.now(), progress: null, log: [] };
  jobs.set(id, job);
  queue.push(job);
  pump();
  res.status(202).json({ id });
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Análise não encontrada ou expirada.' });
  const position = job.status === 'queued' ? queue.indexOf(job) + 1 : 0;
  res.json({ id: job.id, status: job.status, position, progress: job.progress, error: job.error, result: job.status === 'done' ? job.result : undefined });
});

app.get('/api/img/:id/:n', (req, res) => {
  const img = jobs.get(req.params.id)?.images?.[Number(req.params.n)];
  if (!img) return res.status(404).end();
  res.set({ 'content-type': img.type, 'cache-control': 'private, max-age=21600' });
  res.send(img.buf);
});

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
    process.exit(0);
  });
}
