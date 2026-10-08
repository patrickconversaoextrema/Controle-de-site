// Autenticação: senhas com scrypt, sessão em cookie HttpOnly e limite de tentativas de login.
import crypto from 'node:crypto';

export const SESSION_COOKIE = 'rx_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
export const MIN_PASSWORD = 8;

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [alg, saltB64, hashB64] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltB64, 'base64'), expected.length, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return crypto.timingSafeEqual(actual, expected);
}

// Hash fixo usado quando o e-mail não existe, para o tempo de resposta não revelar contas.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));
export function checkLogin(store, email, password) {
  const user = store.userByEmail(email);
  const ok = verifyPassword(password, user?.password_hash || DUMMY_HASH);
  if (!user || !ok || user.disabled) return null;
  return user;
}

export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < MIN_PASSWORD) return `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`;
  if (pw.length > 200) return 'Senha longa demais.';
  return null;
}

export function validEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.length <= 200;
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(token, { secure, maxAgeMs = SESSION_TTL_MS } = {}) {
  const attrs = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

/** Limite simples em memória: N tentativas por janela, por chave (IP + e-mail). */
export function createRateLimiter({ max = 8, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }, windowMs).unref();
  return {
    tooMany(key) {
      const h = hits.get(key);
      return Boolean(h && h.reset > Date.now() && h.count >= max);
    },
    fail(key) {
      const now = Date.now();
      const h = hits.get(key);
      if (!h || h.reset < now) hits.set(key, { count: 1, reset: now + windowMs });
      else h.count++;
    },
    clear(key) {
      hits.delete(key);
    },
  };
}

/** Cria o primeiro administrador a partir de ADMIN_EMAIL/ADMIN_PASSWORD quando ainda não há usuários. */
export function ensureAdmin(store, env = process.env) {
  if (store.countUsers() > 0) return null;
  const email = env.ADMIN_EMAIL?.trim();
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('[auth] Nenhum usuário cadastrado. Defina ADMIN_EMAIL e ADMIN_PASSWORD para criar o administrador.');
    return null;
  }
  const err = !validEmail(email) ? 'ADMIN_EMAIL inválido.' : validatePassword(password);
  if (err) {
    console.warn(`[auth] Administrador não criado: ${err}`);
    return null;
  }
  const user = store.createUser({ email, name: env.ADMIN_NAME?.trim() || 'Administrador', passwordHash: hashPassword(password), role: 'admin' });
  console.log(`[auth] Administrador criado: ${user.email}`);
  return user;
}
