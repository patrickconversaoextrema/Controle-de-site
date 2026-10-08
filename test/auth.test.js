import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../src/store.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raiox-auth-'));
const port = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${port}`;
let server;

const H = { 'content-type': 'application/json', 'x-requested-with': 'raio-x' };
async function call(p, { method = 'GET', body, cookie, headers = H } = {}) {
  const res = await fetch(base + p, { method, headers: { ...headers, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
const login = async (email, password) => (await call('/api/login', { method: 'POST', body: { email, password } })).cookie;

before(async () => {
  // Um relatório salvo antes, para testar acesso e compartilhamento
  const s = openStore(dataDir);
  s.save({ id: '11111111-1111-1111-1111-111111111111', createdAt: new Date().toISOString(), images: [{ type: 'image/jpeg', buf: Buffer.from([9]) }],
    result: { main: { url: 'https://site.com', finalUrl: 'https://site.com', score: { overall: 50, categories: {} }, shot: '/api/reports/11111111-1111-1111-1111-111111111111/img/0' }, competitors: [], comparison: null, categories: [] } });
  s.close();
  server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, ADMIN_EMAIL: 'admin@exemplo.com', ADMIN_PASSWORD: 'senha-forte-1', DISABLE_BROWSER: '1', NODE_ENV: 'test' },
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

test('sem login a API de dados é bloqueada', async () => {
  assert.equal((await call('/api/reports')).status, 401);
  assert.equal((await call('/api/analyze', { method: 'POST', body: { url: 'https://x.com' } })).status, 401);
  assert.equal((await call('/api/reports/11111111-1111-1111-1111-111111111111/img/0')).status, 401);
});

test('login, sessão e logout', async () => {
  assert.equal((await call('/api/login', { method: 'POST', body: { email: 'admin@exemplo.com', password: 'errada123' } })).status, 401);
  const cookie = await login('ADMIN@exemplo.com', 'senha-forte-1');
  assert.ok(cookie?.startsWith('rx_session='));
  const me = await call('/api/me', { cookie });
  assert.equal(me.json.user.role, 'admin');
  assert.equal((await call('/api/reports', { cookie })).json.length, 1);
  await call('/api/logout', { method: 'POST', cookie });
  assert.equal((await call('/api/me', { cookie })).status, 401);
});

test('exige cabeçalho anti-CSRF em requisições que alteram dados', async () => {
  const r = await call('/api/login', { method: 'POST', body: { email: 'admin@exemplo.com', password: 'senha-forte-1' }, headers: { 'content-type': 'application/json' } });
  assert.equal(r.status, 403);
});

test('admin cadastra membro; membro não gerencia equipe nem apaga análise alheia', async () => {
  const admin = await login('admin@exemplo.com', 'senha-forte-1');
  const created = await call('/api/users', { method: 'POST', cookie: admin, body: { name: 'Maria Souza', email: 'maria@exemplo.com', password: 'provisoria9', role: 'member' } });
  assert.equal(created.status, 201);
  assert.equal((await call('/api/users', { method: 'POST', cookie: admin, body: { name: 'X', email: 'maria@exemplo.com', password: 'provisoria9' } })).status, 409);

  const maria = await login('maria@exemplo.com', 'provisoria9');
  assert.equal((await call('/api/users', { cookie: maria })).status, 403);
  assert.equal((await call('/api/reports/11111111-1111-1111-1111-111111111111', { method: 'DELETE', cookie: maria })).status, 403);

  // Troca de senha
  assert.equal((await call('/api/me/password', { method: 'POST', cookie: maria, body: { current: 'errada', password: 'nova-senha-1' } })).status, 400);
  assert.equal((await call('/api/me/password', { method: 'POST', cookie: maria, body: { current: 'provisoria9', password: 'nova-senha-1' } })).status, 200);
  assert.ok(await login('maria@exemplo.com', 'nova-senha-1'));

  // Desativar encerra o acesso
  await call(`/api/users/${created.json.id}`, { method: 'PATCH', cookie: admin, body: { disabled: true } });
  assert.equal(await login('maria@exemplo.com', 'nova-senha-1'), undefined);
});

test('não deixa remover o último administrador', async () => {
  const admin = await login('admin@exemplo.com', 'senha-forte-1');
  const me = (await call('/api/me', { cookie: admin })).json.user;
  assert.equal((await call(`/api/users/${me.id}`, { method: 'DELETE', cookie: admin })).status, 400);
  assert.equal((await call(`/api/users/${me.id}`, { method: 'PATCH', cookie: admin, body: { role: 'member' } })).status, 400);
});

test('link público: abre sem login, só aquele relatório, e pode ser revogado', async () => {
  const admin = await login('admin@exemplo.com', 'senha-forte-1');
  const id = '11111111-1111-1111-1111-111111111111';
  const { json } = await call(`/api/reports/${id}/share`, { method: 'POST', cookie: admin });
  const token = json.shareUrl.split('/p/')[1];
  const pub = await call(`/api/public/${token}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.json.public, true);
  assert.equal(pub.json.main.shot, `/api/public/${token}/img/0`);
  assert.equal((await call(`/api/public/${token}/img/0`)).status, 200);
  assert.equal((await call(`/api/reports/${id}`)).status, 401);

  await call(`/api/reports/${id}/share`, { method: 'DELETE', cookie: admin });
  assert.equal((await call(`/api/public/${token}`)).status, 404);
});

test('limita tentativas de login', async () => {
  let last;
  for (let i = 0; i < 9; i++) last = await call('/api/login', { method: 'POST', body: { email: 'alvo@exemplo.com', password: 'xxxxxxxx' } });
  assert.equal(last.status, 429);
});
