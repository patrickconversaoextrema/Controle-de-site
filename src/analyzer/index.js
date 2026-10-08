import { collect } from './collect.js';
import { performanceChecks } from './checks/performance.js';
import { seoChecks } from './checks/seo.js';
import { imageChecks } from './checks/images.js';
import { typographyChecks } from './checks/typography.js';
import { colorChecks } from './checks/colors.js';
import { conversionChecks } from './checks/conversion.js';
import { mobileChecks } from './checks/mobile.js';
import { accessibilityChecks } from './checks/accessibility.js';
import { securityChecks } from './checks/security.js';
import { errorChecks } from './checks/errors.js';
import { scoreCategories, buildActionPlan, buildSummary, CATEGORIES } from './scoring.js';
import { compareSites } from './compare.js';
import { normalizeUrl } from '../utils/url.js';

// Qual recorte de tela ilustra cada checagem. always=true: mostra mesmo quando está tudo bem
// (útil para comparar com concorrentes, ex.: o botão principal de cada um).
const EVIDENCE_MAP = {
  'cores.contrast': [{ profile: 'desktop', kind: 'contrast' }],
  'cores.cta-color': [{ profile: 'desktop', kind: 'cta', always: true }],
  'conversao.cta-count': [{ profile: 'desktop', kind: 'cta', always: true }],
  'conversao.cta-above-fold': [{ profile: 'mobile', kind: 'ctaMobile', always: true }],
  'conversao.form-fields': [{ profile: 'desktop', kind: 'form', always: true }],
  'conversao.headline': [{ profile: 'desktop', kind: 'h1', always: true }],
  'seo.h1': [{ profile: 'desktop', kind: 'h1', always: true }],
  'tipografia.pairing': [{ profile: 'desktop', kind: 'h1', always: true }, { profile: 'desktop', kind: 'bodyText', always: true }],
  'tipografia.mobile-size': [{ profile: 'mobile', kind: 'tinyText' }],
  'imagens.broken': [{ profile: 'desktop', kind: 'brokenImage' }],
  'imagens.weight': [{ profile: 'desktop', kind: 'heavyImage' }],
  'imagens.oversized': [{ profile: 'desktop', kind: 'oversizedImage' }],
  'imagens.alt': [{ profile: 'desktop', kind: 'noAlt' }],
  'mobile.overflow': [{ profile: 'mobile', kind: 'overflow' }],
  'mobile.tap-targets': [{ profile: 'mobile', kind: 'smallTarget' }],
};

function attachEvidence(checks, ctx) {
  for (const c of checks) {
    const rules = EVIDENCE_MAP[c.id];
    if (!rules) continue;
    const ev = [];
    for (const r of rules) {
      if (!r.always && c.status === 'ok') continue;
      ev.push(...(ctx[r.profile]?.evidence?.[r.kind] || []));
    }
    if (c.id === 'conversao.cta-above-fold') {
      // A prova aqui é a primeira tela inteira.
      if (ctx.mobile?.screenshot) ev.unshift({ img: ctx.mobile.screenshot, caption: 'Primeira tela no celular' });
      if (ctx.desktop?.screenshot) ev.unshift({ img: ctx.desktop.screenshot, caption: 'Primeira tela no desktop' });
    }
    if (ev.length) c.evidence = ev.slice(0, 4);
  }
}

const MODULES = [performanceChecks, seoChecks, imageChecks, typographyChecks, colorChecks, conversionChecks, mobileChecks, accessibilityChecks, securityChecks, errorChecks];

/** Executa as checagens sobre dados já coletados (útil para testes). */
export function evaluate(ctx) {
  const checks = [];
  const metrics = {};
  const extra = {};
  for (const mod of MODULES) {
    try {
      const r = mod(ctx);
      checks.push(...r.checks);
      Object.assign(metrics, r.metrics);
      Object.assign(extra, r.extra);
    } catch (err) {
      console.error(`[analyzer] falha em ${mod.name}:`, err);
    }
  }
  attachEvidence(checks, ctx);
  const score = scoreCategories(checks, ctx.psi);
  const result = {
    url: ctx.url,
    finalUrl: ctx.finalUrl,
    analyzedAt: new Date().toISOString(),
    browser: Boolean(ctx.desktop?.viewport || ctx.mobile?.viewport),
    pagespeed: Boolean(ctx.psi && !ctx.psi.error),
    score,
    checks,
    metrics,
    extra,
    screenshots: {
      desktop: ctx.desktop?.screenshot || null,
      mobile: ctx.mobile?.screenshot || null,
      mobileFull: ctx.mobile?.fullPage || null,
    },
    // Recortes usados na galeria de comparação visual
    highlights: {
      cta: ctx.desktop?.evidence?.cta?.[0] || null,
      h1: ctx.desktop?.evidence?.h1?.[0] || null,
      bodyText: ctx.desktop?.evidence?.bodyText?.[0] || null,
      form: ctx.desktop?.evidence?.form?.[0] || null,
    },
  };
  result.actionPlan = buildActionPlan(checks);
  result.summary = buildSummary(result);
  return result;
}

export async function analyzeSite(url, opts = {}) {
  const ctx = await collect(normalizeUrl(url), opts);
  if (ctx.doc.status >= 400) throw new Error(`A página respondeu com erro HTTP ${ctx.doc.status}. Confira o endereço.`);
  return evaluate(ctx);
}

/**
 * Analisa o site principal e os concorrentes.
 * onProgress({ site, step, done, total })
 */
export async function analyzeWithCompetitors(mainUrl, competitorUrls = [], onProgress = () => {}) {
  const urls = [mainUrl, ...competitorUrls].map(normalizeUrl);
  const total = urls.length;
  let done = 0;
  const run = async (u, i) => {
    try {
      const r = await analyzeSite(u, { onStep: (step) => onProgress({ site: u, index: i, step, done, total }) });
      return r;
    } catch (err) {
      return { url: u, error: humanError(err) };
    } finally {
      done++;
      onProgress({ site: u, index: i, step: 'Concluído', done, total });
    }
  };
  // O principal primeiro; concorrentes em paralelo (2 por vez, ou 1 com LOW_MEMORY=1).
  const main = await run(urls[0], 0);
  if (main.error) throw new Error(main.error);
  const competitors = [];
  const rest = urls.slice(1);
  const step = process.env.LOW_MEMORY === '1' ? 1 : 2;
  for (let i = 0; i < rest.length; i += step) {
    competitors.push(...(await Promise.all(rest.slice(i, i + step).map((u, j) => run(u, i + j + 1)))));
  }
  return { main, competitors, comparison: compareSites(main, competitors), categories: CATEGORIES };
}

function humanError(err) {
  const msg = err?.message || String(err);
  if (/ENOTFOUND|getaddrinfo/.test(msg)) return 'Domínio não encontrado. Confira o endereço.';
  if (/Timeout|aborted/i.test(msg)) return 'O site demorou demais para responder.';
  if (/certificate|SSL|TLS/i.test(msg)) return 'Problema no certificado de segurança (SSL) do site.';
  if (/ECONNREFUSED/.test(msg)) return 'O servidor recusou a conexão.';
  if (/fetch failed/.test(msg)) return `Não foi possível acessar o site (${err?.cause?.code || err?.cause?.message || 'falha de rede'}).`;
  return msg;
}
