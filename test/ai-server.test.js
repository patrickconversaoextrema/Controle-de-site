import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../src/store.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiox-ai-'));
const port = 3990 + Math.floor(Math.random() * 9);
const base = `http://127.0.0.1:${port}`;
const REPORT = '22222222-2222-2222-2222-222222222222';
let server;

const H = { 'content-type': 'application/json', 'x-requested-with': 'raio-x' };
async function call(p, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(base + p, { method, headers: { ...H, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
const login = async (email, password) => (await call('/api/login', { method: 'POST', body: { email, password } })).cookie;

before(async () => {
  const s = openStore(dataDir);
  s.save({
    id: REPORT, createdAt: new Date().toISOString(), images: [{ type: 'image/jpeg', buf: Buffer.from([0xff, 0xd8, 0xff]) }],
    result: { main: { url: 'https://site.com', finalUrl: 'https://site.com', score: { overall: 50, categories: {} }, checks: [], metrics: {}, extra: {}, screenshots: { desktop: `/api/reports/${REPORT}/img/0` } }, competitors: [], comparison: null, categories: [], aiError: 'falhou antes' },
  });
  s.close();
  server = spawn(process.execPath, ['--import', './test/support/mock-ai.mjs', 'server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ADMIN_EMAIL: 'admin@exemplo.com', ADMIN_PASSWORD: 'senha-forte-1', DISABLE_BROWSER: '1', NODE_ENV: 'test', SERPER_API_KEY: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(base + '/api/health')).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('servidor não subiu');
});
after(() => {
  server?.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('sem chave de IA o sistema não analisa', async () => {
  const admin = await login('admin@exemplo.com', 'senha-forte-1');
  const r = await call('/api/analyze', { method: 'POST', cookie: admin, body: { url: 'https://site.com', competitors: ['https://a.com'] } });
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'ai_required');
  assert.equal((await call('/api/config', { cookie: admin })).json.ai.configured, false);
});

test('salva a chave da equipe cifrada, testa e lista modelos', async () => {
  const admin = await login('admin@exemplo.com', 'senha-forte-1');
  const bad = await call('/api/ai', { method: 'PUT', cookie: admin, body: { scope: 'team', provider: 'anthropic', apiKey: 'sk-ant-chave-errada-000000' } });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /recusada/);

  const test1 = await call('/api/ai/test', { method: 'POST', cookie: admin, body: { scope: 'team', provider: 'anthropic', apiKey: 'sk-ant-minha-chave-valida' } });
  assert.equal(test1.json.defaultModel, 'claude-sonnet-5-5');

  const ok = await call('/api/ai', { method: 'PUT', cookie: admin, body: { scope: 'team', provider: 'anthropic', apiKey: 'sk-ant-minha-chave-valida', model: 'claude-opus-5-5' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.saved.model, 'claude-opus-5-5');
  assert.equal(ok.json.saved.keyMask, 'sk-ant-…lida');
  assert.ok(!ok.text.includes('minha-chave'));

  const info = await call('/api/ai', { cookie: admin });
  assert.equal(info.json.active, 'team');
  assert.ok(!info.text.includes('minha-chave'));

  // Trocar só o modelo mantém a chave guardada
  const m = await call('/api/ai', { method: 'PUT', cookie: admin, body: { scope: 'team', provider: 'anthropic', model: 'claude-haiku-5-5' } });
  assert.equal(m.json.saved.model, 'claude-haiku-5-5');

  // No banco a chave não está em texto puro
  const db = new DatabaseSync(path.join(dataDir, 'relatorios.db'));
  const raw = db.prepare("SELECT value FROM settings WHERE key = 'ai.team'").get().value;
  db.close();
  assert.ok(!raw.includes('minha-chave'));
});

test('membro usa a chave da equipe; a dele tem prioridade; não altera a da equipe', async () => {
  const admin = await login('admin@exemplo.com', 'senha-forte-1');
  await call('/api/users', { method: 'POST', cookie: admin, body: { name: 'Ana', email: 'ana@exemplo.com', password: 'provisoria9' } });
  const ana = await login('ana@exemplo.com', 'provisoria9');
  assert.equal((await call('/api/config', { cookie: ana })).json.ai.source, 'team');
  assert.equal((await call('/api/ai', { method: 'PUT', cookie: ana, body: { scope: 'team', provider: 'openai', apiKey: 'sk-qualquer-coisa-valida' } })).status, 403);

  const own = await call('/api/ai', { method: 'PUT', cookie: ana, body: { scope: 'user', provider: 'openai', apiKey: 'sk-da-ana-12345-valida' } });
  assert.equal(own.json.saved.model, 'gpt-5');
  const cfg = (await call('/api/config', { cookie: ana })).json.ai;
  assert.deepEqual([cfg.source, cfg.provider], ['user', 'openai']);

  await call('/api/ai?scope=user', { method: 'DELETE', cookie: ana });
  assert.equal((await call('/api/config', { cookie: ana })).json.ai.source, 'team');
});

test('gera de novo o diagnóstico de um relatório salvo', async () => {
  const admin = await login('admin@exemplo.com', 'senha-forte-1');
  const r = await call(`/api/reports/${REPORT}/ai`, { method: 'POST', cookie: admin });
  assert.equal(r.status, 200);
  assert.match(r.json.ai.resumo, /prova social/);
  const rep = await call(`/api/reports/${REPORT}`, { cookie: admin });
  assert.equal(rep.json.aiError, undefined);
  assert.equal(rep.json.ai.prioridades.length, 2);
  assert.equal(rep.json.ai.model, 'claude-haiku-5-5');
});
