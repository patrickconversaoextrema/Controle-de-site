// Descobre concorrentes a partir do nicho: busca no Google (via Serper) ou no Brave Search
// e filtra diretórios, redes sociais e marketplaces, que não são concorrentes diretos.
import { normalizeUrl, isAllowedUrl } from '../utils/url.js';

// Domínios que aparecem nas buscas mas não são concorrentes (agregadores, redes, imprensa…)
const EXCLUDED = [
  'google.', 'youtube.', 'youtu.be', 'facebook.', 'fb.com', 'instagram.', 'linkedin.', 'twitter.', 'x.com', 'tiktok.', 'pinterest.',
  'threads.net', 'whatsapp.', 'wa.me', 'wikipedia.', 'wikiwand.', 'reddit.', 'quora.', 'medium.com', 'blogspot.',
  'reclameaqui.', 'doctoralia.', 'boaconsulta.', 'drconsulta.', 'mercadolivre.', 'mercadolibre.', 'olx.', 'amazon.', 'magazineluiza.',
  'magalu.', 'americanas.', 'shopee.', 'aliexpress.', 'casasbahia.', 'submarino.', 'ifood.', 'rappi.', 'booking.', 'tripadvisor.',
  'airbnb.', 'trivago.', 'decolar.', 'hoteis.com', 'expedia.', 'guiamais.', 'apontador.', 'telelistas.', 'solutudo.', 'cylex',
  'yelp.', 'foursquare.', 'waze.', 'getninjas.', 'habitissimo.', 'zapimoveis.', 'vivareal.', 'imovelweb.', 'quintoandar.',
  'webmotors.', 'icarros.', 'olx.', 'hotmart.', 'udemy.', 'sympla.', 'eventbrite.', 'groupon.', 'peixeurbano.', 'glassdoor.',
  'indeed.', 'catho.', 'infojobs.', 'vagas.com', 'jusbrasil.', 'uol.com.br', 'globo.com', 'terra.com.br', 'estadao.', 'folha.',
  'exame.', 'veja.', 'cnnbrasil.', 'r7.com', 'metropoles.', 'g1.', 'gov.br', 'jus.br', 'mp.br', 'leg.br', 'edu.br', 'apple.com',
  'play.google', 'spotify.', 'canva.', 'freepik.', 'shutterstock.', 'istockphoto.', 'gettyimages.', 'clinicaexperts.',
];

/** Provedor configurado (ou null). */
export function searchProvider(env = process.env) {
  if (env.SERPER_API_KEY) return 'serper';
  if (env.BRAVE_API_KEY) return 'brave';
  return null;
}

async function searchSerper(query, { fetchFn, env }) {
  const res = await fetchFn('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'x-api-key': env.SERPER_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ q: query, gl: 'br', hl: 'pt-br', num: 20 }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`a busca respondeu ${res.status}${res.status === 401 || res.status === 403 ? ' (confira a SERPER_API_KEY)' : ''}`);
  const data = await res.json();
  return (data.organic || []).map((r, i) => ({ url: r.link, title: r.title || '', snippet: r.snippet || '', position: r.position || i + 1 }));
}

async function searchBrave(query, { fetchFn, env }) {
  const params = new URLSearchParams({ q: query, country: 'BR', search_lang: 'pt-br', count: '20' });
  const res = await fetchFn(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: { 'x-subscription-token': env.BRAVE_API_KEY, accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`a busca respondeu ${res.status}${res.status === 401 || res.status === 403 ? ' (confira a BRAVE_API_KEY)' : ''}`);
  const data = await res.json();
  return (data.web?.results || []).map((r, i) => ({ url: r.url, title: r.title || '', snippet: r.description || '', position: i + 1 }));
}

const hostOf = (u) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** Domínio "principal" aproximado (ignora subdomínios comuns), para não repetir o mesmo site. */
export function siteKey(u) {
  const h = hostOf(u);
  if (/^[\d.]+$/.test(h) || h.includes(':')) return h; // endereço IP: o próprio IP
  const parts = h.split('.');
  const brLike = parts.length >= 3 && ['com', 'net', 'org', 'adv', 'med', 'odo', 'eng', 'arq', 'art', 'blog', 'ind', 'eco'].includes(parts[parts.length - 2]);
  return parts.slice(brLike ? -3 : -2).join('.');
}

export function excludedReason(url, extra = []) {
  const h = hostOf(url);
  if (!h) return 'endereço inválido';
  const hit = [...EXCLUDED, ...extra].find((d) => {
    if (d.endsWith('.')) return h.startsWith(d) || h.includes('.' + d); // nome em qualquer TLD: "google." → google.com.br, maps.google.com
    if (d.includes('.')) return h === d || h.endsWith('.' + d); // domínio exato e subdomínios
    return h.includes(d); // fragmento: "cylex" → cylex-brasil.com.br
  });
  if (hit) return 'diretório, rede social ou portal';
  if (/\.(pdf|docx?|xlsx?)(\?|$)/i.test(url)) return 'arquivo, não é página';
  return null;
}

/** Artigos de blog rankeiam pelo conteúdo; para comparar a página de vendas usamos a home do site. */
function landingFor(url) {
  try {
    const u = new URL(url);
    if (/\/(blog|artigos?|noticias?|post|posts|news|tag|categoria|category)\//i.test(u.pathname) || /\/20\d{2}\/\d{2}\//.test(u.pathname)) {
      return { url: `${u.origin}/`, note: 'resultado era um artigo; usamos a página inicial' };
    }
    u.hash = '';
    return { url: u.toString(), note: null };
  } catch {
    return { url, note: null };
  }
}

/**
 * Busca o nicho e devolve os primeiros concorrentes válidos.
 * @returns {{ query, provider, competitors: {url,title,position,note}[], clientPosition: number|null, skipped: {url,reason}[] }}
 */
export async function findCompetitors({ niche, clientUrl, max = 3 }, { fetchFn = fetch, env = process.env } = {}) {
  const query = String(niche || '').trim().replace(/\s+/g, ' ');
  if (!query) throw new Error('Informe o nicho para buscar concorrentes.');
  const provider = searchProvider(env);
  if (!provider) {
    throw new Error('A busca automática de concorrentes não está configurada (defina SERPER_API_KEY ou BRAVE_API_KEY no servidor). Informe os concorrentes manualmente.');
  }
  let results;
  try {
    results = provider === 'serper' ? await searchSerper(query, { fetchFn, env }) : await searchBrave(query, { fetchFn, env });
  } catch (err) {
    throw new Error(`Não foi possível buscar concorrentes: ${err.message}.`);
  }

  const extra = String(env.EXCLUDED_DOMAINS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const clientKey = siteKey(clientUrl);
  let clientPosition = null;
  const seen = new Set();
  const competitors = [];
  const skipped = [];

  for (const r of results) {
    const key = siteKey(r.url);
    if (key === clientKey) {
      clientPosition ??= r.position;
      continue;
    }
    if (seen.has(key)) continue;
    const reason = excludedReason(r.url, extra);
    if (reason) {
      skipped.push({ url: r.url, reason });
      continue;
    }
    let url;
    try {
      url = normalizeUrl(r.url);
    } catch {
      continue;
    }
    if (!(await isAllowedUrl(url))) continue;
    seen.add(key);
    if (competitors.length < max) {
      const landing = landingFor(url);
      competitors.push({ url: landing.url, title: r.title.slice(0, 140), position: r.position, note: landing.note });
    }
  }
  return { query, provider, competitors, clientPosition, skipped: skipped.slice(0, 10), searchedResults: results.length };
}
