// Coleta com navegador real (Chromium via playwright-core). Opcional: se não houver
// navegador disponível, o analisador segue apenas com a análise do HTML.
import fs from 'node:fs';
import { isAllowedUrl } from '../utils/url.js';
import { USER_AGENT } from './http.js';
import { parseColor, blend, contrastRatio, toHex } from '../utils/color.js';

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
    const buf = await page.screenshot({ type: 'jpeg', quality: 55, fullPage: false, scale: 'css' });
    screenshot = toDataUri(buf);
  } catch {}

  const reqs = [...requests.values()];

  // Recortes com o elemento de cada problema destacado ("imagem do erro").
  let evidence = {};
  if (data) {
    try {
      evidence = await captureEvidence(page, pickTargets(profileName, data, reqs), profile.viewport);
    } catch (err) {
      console.warn('[browser] falha ao capturar evidências:', err.message.split('\n')[0]);
    }
  }

  // Página inteira no celular, para comparação lado a lado com concorrentes.
  let fullPage = null;
  if (profileName === 'mobile' && data) {
    try {
      fullPage = await captureFullPage(page, profile.viewport);
    } catch {}
  }

  await context.close().catch(() => {});

  return {
    profile: profileName,
    loadMs,
    navError,
    screenshot,
    fullPage,
    evidence,
    consoleErrors,
    requests: reqs,
    ...data,
  };
}

const toDataUri = (buf) => 'data:image/jpeg;base64,' + buf.toString('base64');
const MAX_FULLPAGE_HEIGHT = 9000;
const kbStr = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.round(b / 1024)} KB`);
const cut = (t, n = 50) => (t.length > n ? t.slice(0, n - 1) + '…' : t);

/**
 * Decide quais elementos fotografar. Cada alvo: { kind, selector, caption }.
 * kind é usado depois para ligar a imagem à checagem correspondente.
 */
export function pickTargets(profileName, data, requests) {
  const targets = [];
  const add = (kind, selector, caption) => targets.push({ kind, selector, caption });
  const samples = data.textSamples || [];
  const images = data.images || [];
  const ctas = data.ctas || [];

  if (profileName === 'desktop') {
    // Contraste: as combinações ruins com mais texto
    const white = { r: 255, g: 255, b: 255, a: 1 };
    const groups = new Map();
    samples.forEach((s, i) => {
      if (!s.bg || s.bgImage) return;
      const bg0 = parseColor(s.bg);
      const fg0 = parseColor(s.color);
      if (!bg0 || !fg0) return;
      const bg = bg0.a < 1 ? blend(bg0, white) : bg0;
      const fg = fg0.a < 1 ? blend(fg0, bg) : fg0;
      const ratio = contrastRatio(fg, bg);
      const large = s.size >= 24 || (s.size >= 18.6 && Number(s.weight) >= 700);
      if (ratio >= (large ? 3 : 4.5)) return;
      const key = toHex(fg) + toHex(bg);
      const g = groups.get(key) || { chars: 0, best: null, ratio, fg: toHex(fg), bg: toHex(bg) };
      g.chars += s.chars;
      if (!g.best || s.chars > samples[g.best].chars) g.best = i;
      groups.set(key, g);
    });
    [...groups.values()].sort((a, b) => b.chars - a.chars).slice(0, 2).forEach((g) =>
      add('contrast', `[data-rx-t="${g.best}"]`, `Texto ${g.fg} sobre ${g.bg} — contraste ${g.ratio.toFixed(1).replace('.', ',')}:1 (mínimo 4,5:1)`),
    );

    const primary = ctas.findIndex((c) => c.aboveFold && c.matchesKeyword);
    const ctaIdx = primary >= 0 ? primary : ctas.findIndex((c) => c.matchesKeyword) >= 0 ? ctas.findIndex((c) => c.matchesKeyword) : ctas.length ? 0 : -1;
    if (ctaIdx >= 0) add('cta', `[data-rx-cta="${ctaIdx}"]`, `Botão principal: “${cut(ctas[ctaIdx].text)}”`);

    if (data.hasH1) add('h1', 'h1', 'Título principal (H1)');

    let body = -1;
    samples.forEach((s, i) => {
      if (!s.heading && s.chars >= 80 && (body < 0 || s.chars > samples[body].chars)) body = i;
    });
    if (body >= 0) add('bodyText', `[data-rx-t="${body}"]`, `Texto corrido em ${samples[body].family.split(',')[0].replace(/["']/g, '')}, ${Math.round(samples[body].size)}px`);

    if (data.formFields) add('form', '[data-rx-form]', `Formulário com ${data.formFields} campo(s)`);

    const bytesBySrc = new Map(requests.filter((r) => r.type === 'Image').map((r) => [r.url, r.bytes]));
    const visible = images.map((img, i) => ({ ...img, i })).filter((img) => img.visible && img.width >= 8 && img.height >= 8);
    images.forEach((img, i) => {
      if (img.broken && img.width >= 8 && img.height >= 8 && targets.filter((t) => t.kind === 'brokenImage').length < 2) {
        add('brokenImage', `[data-rx-img="${i}"]`, `Imagem quebrada: ${cut(img.src.split('/').pop() || img.src, 60)}`);
      }
    });
    visible
      .map((img) => ({ ...img, bytes: bytesBySrc.get(img.src) || 0 }))
      .filter((img) => img.bytes > 200 * 1024)
      .sort((a, b) => b.bytes - a.bytes)
      .slice(0, 2)
      .forEach((img) => add('heavyImage', `[data-rx-img="${img.i}"]`, `Imagem de ${kbStr(img.bytes)} — ${cut(img.src.split('/').pop().split('?')[0], 50)}`));
    visible
      .filter((img) => img.naturalWidth > img.width * 1.8 && img.naturalWidth > 600)
      .slice(0, 2)
      .forEach((img) => add('oversizedImage', `[data-rx-img="${img.i}"]`, `Arquivo com ${img.naturalWidth}px exibido em ${img.width}px`));
    visible
      .filter((img) => img.alt == null && img.width >= 100)
      .slice(0, 2)
      .forEach((img) => add('noAlt', `[data-rx-img="${img.i}"]`, 'Imagem sem texto alternativo (alt)'));
  } else {
    (data.overflowCount ? [...Array(Math.min(2, data.overflowCount)).keys()] : []).forEach((i) =>
      add('overflow', `[data-rx-of="${i}"]`, 'Elemento mais largo que a tela do celular'),
    );
    (data.smallTargets || []).slice(0, 2).forEach((label, i) => add('smallTarget', `[data-rx-tap="${i}"]`, `Alvo de toque pequeno: “${cut(label, 40)}”`));
    const tiny = samples.map((s, i) => ({ ...s, i })).filter((s) => s.size < 12 && s.chars > 15).slice(0, 2);
    tiny.forEach((s) => add('tinyText', `[data-rx-t="${s.i}"]`, `Texto com ${Math.round(s.size)}px no celular`));
    const mPrimary = ctas.findIndex((c) => c.matchesKeyword);
    if (mPrimary >= 0) add('ctaMobile', `[data-rx-cta="${mPrimary}"]`, `Botão no celular: “${cut(ctas[mPrimary].text)}”`);
  }
  return targets;
}

async function captureEvidence(page, targets, viewport) {
  const out = {};
  const MAX_W = 1366;
  const MAX_H = 520;
  const PAD = 20;
  const MIN_H = 150;
  const MIN_W = 360;
  for (const t of targets) {
    try {
      const loc = page.locator(t.selector).first();
      if (!(await loc.count())) continue;
      await loc.evaluate((el) => {
        el.scrollIntoView({ block: 'center', inline: 'nearest' });
        el.setAttribute('data-rx-prev-outline', el.style.outline + '|' + el.style.outlineOffset);
        el.style.outline = '3px solid #e5383b';
        el.style.outlineOffset = '3px';
      });
      await page.waitForTimeout(150);
      const box = await loc.boundingBox();
      if (box && box.width >= 2 && box.height >= 2) {
        // Garante um mínimo de contexto ao redor de elementos muito finos.
        const wantH = Math.min(Math.max(box.height + PAD * 2, MIN_H), MAX_H);
        const wantW = Math.min(Math.max(box.width + PAD * 2, MIN_W), MAX_W, viewport.width);
        // Elementos largos: alinha pela esquerda para não cortar o início do texto.
        const x = box.width + PAD * 2 >= wantW ? Math.max(0, box.x - PAD) : Math.max(0, Math.min(box.x + box.width / 2 - wantW / 2, viewport.width - wantW));
        const y = Math.max(0, Math.min(box.y + box.height / 2 - wantH / 2, viewport.height - wantH));
        const width = Math.min(viewport.width - x, wantW);
        const height = Math.min(viewport.height - y, wantH);
        if (width > 10 && height > 10) {
          const buf = await page.screenshot({ type: 'jpeg', quality: 62, clip: { x, y, width, height }, scale: 'css' });
          (out[t.kind] ??= []).push({ img: toDataUri(buf), caption: t.caption });
        }
      }
      await loc.evaluate((el) => {
        const [o, off] = (el.getAttribute('data-rx-prev-outline') || '|').split('|');
        el.style.outline = o;
        el.style.outlineOffset = off;
      });
    } catch {
      // Elemento sumiu ou mudou (carrossel, pop-up): segue para o próximo.
    }
  }
  return out;
}

async function captureFullPage(page, viewport) {
  // Rola a página para disparar imagens com lazy loading.
  await page.evaluate(async (max) => {
    const step = window.innerHeight * 0.9;
    for (let y = 0; y < Math.min(document.documentElement.scrollHeight, max); y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  }, MAX_FULLPAGE_HEIGHT);
  await page.waitForTimeout(300);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const buf = await page.screenshot({
    type: 'jpeg',
    quality: 45,
    fullPage: true,
    scale: 'css',
    clip: { x: 0, y: 0, width: viewport.width, height: Math.min(height, MAX_FULLPAGE_HEIGHT) },
  });
  return { img: toDataUri(buf), truncated: height > MAX_FULLPAGE_HEIGHT };
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
    el.setAttribute('data-rx-t', String(textSamples.length));
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
  const images = [...document.images].slice(0, 300).map((img, i) => {
    img.setAttribute('data-rx-img', String(i));
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
      if (r.width < 24 || r.height < 24) {
        el.setAttribute('data-rx-tap', String(smallTargets.length));
        smallTargets.push(label.slice(0, 40) || el.tagName.toLowerCase());
      }
    }
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    const isButtonLike = el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.getAttribute('role') === 'button' ||
      (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg) && r.height >= 30 && r.width >= 80);
    const href = el.getAttribute('href') || '';
    if ((isButtonLike && label.length > 1 && label.length < 60) || /wa\.me|whatsapp|tel:/i.test(href)) {
      if (ctaRe.test(label) || /wa\.me|whatsapp|tel:/i.test(href) || isButtonLike) {
        el.setAttribute('data-rx-cta', String(ctas.length));
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

  // Elementos que "vazam" para a direita (causa da rolagem lateral no celular)
  let overflowCount = 0;
  if (document.documentElement.scrollWidth > vw + 2) {
    const culprits = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= vw + 2) continue;
      const pr = el.parentElement?.getBoundingClientRect();
      if (pr && pr.right > vw + 2 && el.parentElement !== document.body) continue;
      culprits.push({ el, over: r.right - vw });
    }
    culprits.sort((a, b) => b.over - a.over).slice(0, 3).forEach((c, i) => c.el.setAttribute('data-rx-of', String(i)));
    overflowCount = Math.min(3, culprits.length);
  }

  // Maior formulário
  let formFields = 0;
  for (const f of document.querySelectorAll('form')) {
    const n = f.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select').length;
    const r = f.getBoundingClientRect();
    if (n > formFields && r.width > 0 && r.height > 0) {
      document.querySelector('[data-rx-form]')?.removeAttribute('data-rx-form');
      f.setAttribute('data-rx-form', '1');
      formFields = n;
    }
  }
  const h1 = document.querySelector('h1');
  const hasH1 = !!(h1 && h1.getBoundingClientRect().height > 0);

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
    overflowCount,
    formFields,
    hasH1,
    fontsLoaded: fontsLoaded.slice(0, 60),
  };
}
