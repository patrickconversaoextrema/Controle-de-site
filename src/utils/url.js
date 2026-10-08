import dns from 'node:dns/promises';
import net from 'node:net';

export function normalizeUrl(input) {
  if (!input || typeof input !== 'string') throw new Error('Informe uma URL.');
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new Error(`URL inválida: ${input}`);
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Apenas URLs http(s) são aceitas.');
  u.hash = '';
  return u.toString();
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true;
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
  }
  return false;
}

const dnsCache = new Map();

/**
 * Impede que o servidor seja usado para acessar a rede interna (SSRF).
 * Pode ser desativado com ALLOW_PRIVATE_URLS=1 (útil em testes locais).
 */
export async function isAllowedUrl(url) {
  if (process.env.ALLOW_PRIVATE_URLS === '1') return true;
  let host;
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return u.protocol === 'data:' || u.protocol === 'blob:';
    host = u.hostname.replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return false;
  if (net.isIP(host)) return !isPrivateIp(host);
  if (dnsCache.has(host)) return dnsCache.get(host);
  let ok;
  try {
    const addrs = await dns.lookup(host, { all: true });
    ok = addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    // Sem DNS local (ex.: atrás de proxy) deixamos a requisição decidir.
    ok = true;
  }
  dnsCache.set(host, ok);
  return ok;
}

export async function assertAllowedUrl(url) {
  if (!(await isAllowedUrl(url))) throw new Error('Endereços internos/privados não podem ser analisados.');
}

export function sameSite(a, b) {
  try {
    const ha = new URL(a).hostname.replace(/^www\./, '');
    const hb = new URL(b).hostname.replace(/^www\./, '');
    return ha === hb;
  } catch {
    return false;
  }
}

export function displayHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
