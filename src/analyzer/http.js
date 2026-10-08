import { assertAllowedUrl, isAllowedUrl } from '../utils/url.js';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 AnalisadorDeSite/1.0';

/** fetch com timeout e verificação de URL a cada redirecionamento. */
export async function safeFetch(url, { method = 'GET', timeout = 15000, maxRedirects = 6, headers = {} } = {}) {
  const redirects = [];
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    await assertAllowedUrl(current);
    const res = await fetch(current, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeout),
      headers: { 'user-agent': USER_AGENT, 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8', ...headers },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), current).toString();
      redirects.push({ from: current, to: next, status: res.status });
      await res.body?.cancel();
      current = next;
      continue;
    }
    return { res, finalUrl: current, redirects };
  }
  throw new Error('Redirecionamentos demais.');
}

/** Baixa o HTML principal medindo TTFB e tempo total. */
export async function fetchDocument(url) {
  const start = performance.now();
  const { res, finalUrl, redirects } = await safeFetch(url, {
    headers: { accept: 'text/html,application/xhtml+xml', 'accept-encoding': 'gzip, deflate, br' },
  });
  const ttfb = performance.now() - start;
  const buf = Buffer.from(await res.arrayBuffer());
  const total = performance.now() - start;
  const headers = Object.fromEntries(res.headers.entries());
  return {
    url,
    finalUrl,
    status: res.status,
    redirects,
    headers,
    html: buf.toString('utf8'),
    htmlBytes: buf.length,
    // Node descomprime automaticamente; content-length (se houver) reflete o tamanho trafegado.
    transferBytes: Number(headers['content-length']) || null,
    ttfbMs: Math.round(ttfb),
    downloadMs: Math.round(total),
  };
}

/** Verifica se um link responde (HEAD, com fallback para GET). */
export async function checkLink(url, timeout = 8000) {
  if (!(await isAllowedUrl(url))) return { url, ok: true, skipped: true };
  try {
    let { res } = await safeFetch(url, { method: 'HEAD', timeout });
    if (res.status === 405 || res.status === 403 || res.status === 501) {
      ({ res } = await safeFetch(url, { method: 'GET', timeout }));
      await res.body?.cancel();
    }
    return { url, ok: res.status < 400, status: res.status, bytes: Number(res.headers.get('content-length')) || null, type: res.headers.get('content-type') };
  } catch (err) {
    return { url, ok: false, status: null, error: err.name === 'TimeoutError' ? 'tempo esgotado' : err.message };
  }
}

export async function fetchText(url, timeout = 8000) {
  try {
    const { res } = await safeFetch(url, { timeout });
    if (!res.ok) return { ok: false, status: res.status, text: '' };
    const text = await res.text();
    return { ok: true, status: res.status, text: text.slice(0, 500_000), type: res.headers.get('content-type') || '' };
  } catch (err) {
    return { ok: false, status: null, text: '', error: err.message };
  }
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}
