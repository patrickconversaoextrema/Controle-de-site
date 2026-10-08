// Coleta com navegador real (Chromium via playwright-core). Opcional: se não houver
// navegador disponível, o analisador segue apenas com a análise do HTML.
import fs from 'node:fs';
import { isAllowedUrl } from '../utils/url.js';
import { USER_AGENT } from './http.js';

let chromiumPromise;
let browserPromise;

const CANDIDATE_PATHS = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);

async function getBrowser() {
  if (process.env.DISABLE_BROWSER === '1') return null;
  if (!browserPromise) {
    browserPromise = (async () => {
      chromiumPromise ??= import('playwright-core').then((m) => m.chromium).catch(() => null);
      const chromium = await chromiumPromise;
      if (!chromium) return null;
      const executablePath = CANDIDATE_PATHS.find((p) => {
        try {
          return fs.existsSync(p);
        } catch {
          return false;
        }
      });
      try {
        return await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
      } catch (err) {
        console.warn('[browser] Chromium indisponível:', err.message.split('\n')[0]);
        return null;
      }
    })();
  }
  const b = await browserPromise;
  if (b && !b.isConnected()) {
    browserPromise = null;
    return getBrowser();
  }
  return b;
}

export async function browserAvailable() {
  return Boolean(await getBrowser());
}

export async function closeBrowser() {
  const b = await browserPromise;
  await b?.close().catch(() => {});
  browserPromise = null;
}

const PROFILES = {
  desktop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, userAgent: USER_AGENT },
  mobile: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 AnalisadorDeSite/1.0',
  },
};

/** Visita a página em um perfil (desktop/mobile) e coleta métricas, recursos e estilos. */
export async function collectWithBrowser(url, profileName = 'desktop') {
  const browser = await getBrowser();
  if (!browser) return null;
  const profile = PROFILES[profileName];
  const context = await browser.newContext({ ...profile, locale: 'pt-BR', ignoreHTTPSErrors: false });
  const page = await context.newPage();

  await page.route('**/*', async (route) => {
    if (await isAllowedUrl(route.request().url())) return route.continue();
    return route.abort('blockedbyclient');
  });

  // Coleta de LCP/CLS desde o início da navegação.
  await page.addInitScript(() => {
    window.__perf = { lcp: 0, lcpEl: null, cls: 0 };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__perf.lcp = e.startTime;
          const el = e.element;
          window.__perf.lcpEl = el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.currentSrc ? ' (' + el.currentSrc.split('/').pop().slice(0, 60) + ')' : ''}` : null;
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  if (profileName === 'mobile') {
    // Simulação aproximada de 4G e de um celular intermediário.
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: (6 * 1024 * 1024) / 8, uploadThroughput: (2 * 1024 * 1024) / 8 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 2 });
  }

  const requests = new Map();
  cdp.on('Network.requestWillBeSent', (e) => {
    if (!requests.has(e.requestId)) requests.set(e.requestId, { url: e.request.url, type: e.type || 'Other', bytes: 0, status: null, failed: false });
  });
  cdp.on('Network.responseReceived', (e) => {
    const r = requests.get(e.requestId);
    if (r) {
      r.status = e.response.status;
      r.mime = e.response.mimeType;
      r.type = e.type || r.type;
      r.protocol = e.response.protocol;
      r.cache = e.response.headers?.['cache-control'] || e.response.headers?.['Cache-Control'] || null;
    }
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = requests.get(e.requestId);
    if (r) r.bytes = e.encodedDataLength;
  });
  cdp.on('Network.loadingFailed', (e) => {
    const r = requests.get(e.requestId);
    if (r && !e.canceled && e.blockedReason !== 'inspector') {
      r.failed = true;
      r.error = e.errorText;
    }
  });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && consoleErrors.length < 30) consoleErrors.push(msg.text().slice(0, 300));
  });
  page.on('pageerror', (err) => {
    if (consoleErrors.length < 30) consoleErrors.push('Erro de JavaScript: ' + String(err.message).slice(0, 300));
  });

  const started = Date.now();
  let navError = null;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  } catch (err) {
    navError = err.message.split('\n')[0];
  }
  const loadMs = Date.now() - started;
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(500);

  let data = null;
  try {
    data = await page.evaluate(extractInPage);
  } catch (err) {
    navError ??= err.message.split('\n')[0];
  }

  let screenshot = null;
  try {
    const buf = await page.screenshot({ type: 'jpeg', quality: 55, fullPage: false });
    screenshot = 'data:image/jpeg;base64,' + buf.toString('base64');
  } catch {}

  await context.close().catch(() => {});

  const reqs = [...requests.values()];
  return {
    profile: profileName,
    loadMs,
    navError,
    screenshot,
    consoleErrors,
    requests: reqs,
    ...data,
  };
}

// Executado dentro da página. Precisa ser autocontido.
function extractInPage() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const nav = performance.getEntriesByType('navigation')[0];
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];

  const isVisible = (el, rect) => {
    if (!rect.width || !rect.height) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };

  const effectiveBg = (el) => {
    let node = el;
    while (node && node.nodeType === 1) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return { color: null, image: true };
      const bg = cs.backgroundColor;
      if (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg)) {
        return { color: bg, image: false };
      }
      node = node.parentElement;
    }
    return { color: 'rgb(255, 255, 255)', image: false };
  };

  // Textos visíveis
  const textSamples = [];
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let n;
  while ((n = walker.nextNode()) && textSamples.length < 1500) {
    const txt = n.textContent.trim();
    if (txt.length < 2) continue;
    const el = n.parentElement;
    if (!el || seen.has(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG'].includes(el.tagName)) continue;
    seen.add(el);
    const rect = el.getBoundingClientRect();
    if (!isVisible(el, rect)) continue;
    const cs = getComputedStyle(el);
    const bg = effectiveBg(el);
    textSamples.push({
      tag: el.tagName.toLowerCase(),
      heading: /^H[1-6]$/.test(el.tagName) || !!el.closest('h1,h2,h3,h4,h5,h6'),
      family: cs.fontFamily,
      size: parseFloat(cs.fontSize),
      weight: cs.fontWeight,
      lineHeight: cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight),
      color: cs.color,
      bg: bg.color,
      bgImage: bg.image,
      chars: Math.min(txt.length, 400),
      text: txt.slice(0, 60),
      top: rect.top + window.scrollY,
    });
  }

  // Cores de fundo por área
  const bgAreas = [];
  for (const el of document.querySelectorAll('body, body *')) {
    if (bgAreas.length > 800) break;
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area < 2000) continue;
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    if (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg)) bgAreas.push({ color: bg, area });
  }
  const rootBg = getComputedStyle(document.body || document.documentElement).backgroundColor;

  // Imagens
  const images = [...document.images].slice(0, 300).map((img) => {
    const r = img.getBoundingClientRect();
    return {
      src: img.currentSrc || img.src,
      alt: img.getAttribute('alt'),
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      width: Math.round(r.width),
      height: Math.round(r.height),
      loading: img.getAttribute('loading'),
      aboveFold: r.top + window.scrollY < vh,
      broken: img.complete && img.naturalWidth === 0 && !!(img.currentSrc || img.src),
      visible: r.width > 0 && r.height > 0,
    };
  });

  // CTAs e alvos de toque
  const ctaRe = /(compr|assin|quero|garant|cadastr|inscrev|agend|solicit|fale|contato|whats|orçamento|orcamento|comece|começ|baix|download|teste|experimente|saiba mais|reserv|ligue|pedir|peça|peca|matricul|adquir|aproveit|buy|sign ?up|start|get started|try|book|subscribe|contact|join|registr|enviar|acessar|conhecer)/i;
  const clickables = [...document.querySelectorAll('a[href], button, input[type=submit], input[type=button], [role=button]')];
  const ctas = [];
  const smallTargets = [];
  for (const el of clickables) {
    const r = el.getBoundingClientRect();
    if (!isVisible(el, r)) continue;
    const label = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
    if (r.width < 40 || r.height < 40) {
      if (r.width < 24 || r.height < 24) smallTargets.push(label.slice(0, 40) || el.tagName.toLowerCase());
    }
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    const isButtonLike = el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.getAttribute('role') === 'button' ||
      (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg) && r.height >= 30 && r.width >= 80);
    const href = el.getAttribute('href') || '';
    if ((isButtonLike && label.length > 1 && label.length < 60) || /wa\.me|whatsapp|tel:/i.test(href)) {
      if (ctaRe.test(label) || /wa\.me|whatsapp|tel:/i.test(href) || isButtonLike) {
        ctas.push({
          text: label.slice(0, 60),
          href: href.slice(0, 200),
          aboveFold: r.top + window.scrollY < vh,
          bg,
          color: cs.color,
          parentBg: effectiveBg(el.parentElement || document.body).color,
          width: Math.round(r.width),
          height: Math.round(r.height),
          matchesKeyword: ctaRe.test(label),
        });
      }
    }
  }

  const fontsLoaded = [];
  try {
    document.fonts.forEach((f) => {
      if (f.status === 'loaded') fontsLoaded.push({ family: f.family.replace(/["']/g, ''), weight: f.weight, style: f.style, display: f.display });
    });
  } catch {}

  return {
    viewport: { width: vw, height: vh },
    timing: {
      ttfb: nav ? Math.round(nav.responseStart) : null,
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      load: nav ? Math.round(nav.loadEventEnd) : null,
      fcp: fcp ? Math.round(fcp.startTime) : null,
      lcp: window.__perf ? Math.round(window.__perf.lcp) || null : null,
      lcpElement: window.__perf?.lcpEl || null,
      cls: window.__perf ? Math.round(window.__perf.cls * 1000) / 1000 : null,
    },
    pageHeight: document.documentElement.scrollHeight,
    horizontalOverflow: document.documentElement.scrollWidth > vw + 2,
    scrollWidth: document.documentElement.scrollWidth,
    textSamples,
    bgAreas,
    rootBg,
    images,
    ctas: ctas.slice(0, 60),
    smallTargets: smallTargets.slice(0, 40),
    fontsLoaded: fontsLoaded.slice(0, 60),
  };
}
