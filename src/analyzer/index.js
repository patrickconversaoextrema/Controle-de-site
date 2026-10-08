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
    screenshots: { desktop: ctx.desktop?.screenshot || null, mobile: ctx.mobile?.screenshot || null },
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
  // O principal primeiro; concorrentes em paralelo (2 por vez) para não sobrecarregar.
  const main = await run(urls[0], 0);
  if (main.error) throw new Error(main.error);
  const competitors = [];
  const rest = urls.slice(1);
  for (let i = 0; i < rest.length; i += 2) {
    competitors.push(...(await Promise.all(rest.slice(i, i + 2).map((u, j) => run(u, i + j + 1)))));
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
