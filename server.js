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
const JOB_TTL_MS = 60 * 60 * 1000;

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
        job.status = 'done';
        job.result = result;
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
