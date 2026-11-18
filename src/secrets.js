// Cifra as chaves de API guardadas no banco (AES-256-GCM).
// A chave-mestra vem de SECRET_KEY ou é gerada uma vez em DATA_DIR/.secret-key.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

let master;

export function masterKey(dir = process.env.DATA_DIR || path.resolve('data')) {
  if (master) return master;
  if (process.env.SECRET_KEY) {
    master = crypto.createHash('sha256').update(process.env.SECRET_KEY).digest();
    return master;
  }
  const file = path.join(dir, '.secret-key');
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
  master = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
  return master;
}

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const data = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}

export function decrypt(blob) {
  const [v, iv, tag, data] = String(blob || '').split('.');
  if (v !== 'v1') throw new Error('formato de segredo desconhecido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

/** Para mostrar na tela sem revelar a chave: "sk-ant-…a1b2". */
export function maskKey(key) {
  const k = String(key || '');
  if (k.length < 12) return '••••';
  return `${k.slice(0, k.startsWith('sk-ant-') ? 7 : 3)}…${k.slice(-4)}`;
}

export function resetMasterKeyForTests() {
  master = undefined;
}
