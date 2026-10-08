import * as cheerio from 'cheerio';
import { fetchDocument, fetchText, checkLink, mapLimit } from './http.js';
import { collectWithBrowser } from './browser.js';
import { runPageSpeed } from './pagespeed.js';
import { sameSite } from '../utils/url.js';

const MAX_CSS_FILES = 12;
const MAX_LINKS = 30;

/** Reúne todos os dados brutos de uma página. */
export async function collect(url, { onStep = () => {}, checkLinks = true } = {}) {
  onStep('Baixando o HTML');
  const doc = await fetchDocument(url);
  const base = doc.finalUrl;
  const $ = cheerio.load(doc.html);

  onStep('Abrindo a página no navegador (desktop e celular)');
  const psiPromise = runPageSpeed(base, 'mobile');
  const [desktop, mobile] = await Promise.all([
    collectWithBrowser(base, 'desktop').catch((e) => ({ navError: e.message })),
    collectWithBrowser(base, 'mobile').catch((e) => ({ navError: e.message })),
  ]);

  onStep('Lendo CSS, fontes, robots.txt e sitemap');
  const cssUrls = $('link[rel~="stylesheet"][href]')
    .map((_, el) => abs($(el).attr('href'), base))
    .get()
    .filter(Boolean)
    .slice(0, MAX_CSS_FILES);
  const cssFiles = await mapLimit(cssUrls, 6, async (u) => {
    const r = await fetchText(u);
    return { url: u, ok: r.ok, status: r.status, text: r.text, bytes: r.text.length };
  });
  const inlineCss = $('style').map((_, el) => $(el).html()).get().join('\n');
  const styleAttrs = $('[style]').map((_, el) => $(el).attr('style')).get().join(';\n');

  const origin = new URL(base).origin;
  const [robots, sitemap] = await Promise.all([fetchText(origin + '/robots.txt'), fetchText(origin + '/sitemap.xml')]);
  let sitemapOk = sitemap.ok && /<(urlset|sitemapindex)/i.test(sitemap.text);
  if (!sitemapOk && robots.ok) {
    const sm = robots.text.match(/^\s*sitemap:\s*(\S+)/im);
    if (sm) {
      const r = await fetchText(sm[1]);
      sitemapOk = r.ok && /<(urlset|sitemapindex)/i.test(r.text);
    }
  }

  let links = [];
  if (checkLinks) {
    onStep('Verificando links quebrados');
    const all = [...new Set(
      $('a[href]')
        .map((_, el) => abs($(el).attr('href'), base))
        .get()
        .filter((u) => u && /^https?:/.test(u))
        .map((u) => u.split('#')[0]),
    )].filter((u) => u !== base);
    const internal = all.filter((u) => sameSite(u, base));
    const external = all.filter((u) => !sameSite(u, base));
    const sample = [...internal.slice(0, 20), ...external.slice(0, MAX_LINKS - Math.min(20, internal.length))].slice(0, MAX_LINKS);
    links = await mapLimit(sample, 6, (u) => checkLink(u));
    links.totalFound = all.length;
    links.internalCount = internal.length;
    links.externalCount = external.length;
  }

  onStep('Consultando PageSpeed');
  const psi = await psiPromise;

  return {
    url,
    finalUrl: base,
    doc,
    $,
    desktop,
    mobile,
    psi,
    css: { files: cssFiles, inline: inlineCss, styleAttrs, all: [cssFiles.map((f) => f.text).join('\n'), inlineCss, styleAttrs].join('\n') },
    robots: { ok: robots.ok && !/<html/i.test(robots.text), text: robots.text.slice(0, 5000) },
    sitemapOk,
    links,
  };
}

export function abs(href, base) {
  if (!href) return null;
  const h = href.trim();
  if (/^(javascript|mailto|tel|data|#)/i.test(h)) return null;
  try {
    return new URL(h, base).toString();
  } catch {
    return null;
  }
}
