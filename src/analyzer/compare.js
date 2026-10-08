import { CATEGORIES } from './scoring.js';
import { displayHost } from '../utils/url.js';
import { kb, sec } from './checks/common.js';

// Métricas comparáveis: direção "lower" = menor é melhor.
const METRICS = [
  { key: 'overall', label: 'Nota geral', dir: 'higher', fmt: 'score' },
  { key: 'loadMobileMs', label: 'Carregamento no celular', dir: 'lower', fmt: 'ms', minGap: 0.15, minAbs: 500 },
  { key: 'lcpMs', label: 'Conteúdo principal visível (LCP)', dir: 'lower', fmt: 'ms', minGap: 0.15, minAbs: 300 },
  { key: 'ttfbMs', label: 'Resposta do servidor (TTFB)', dir: 'lower', fmt: 'ms', minGap: 0.25, minAbs: 200 },
  { key: 'totalBytes', label: 'Peso da página', dir: 'lower', fmt: 'bytes', minGap: 0.2, minAbs: 150 * 1024 },
  { key: 'requests', label: 'Requisições', dir: 'lower', fmt: 'int', minGap: 0.25, minAbs: 10 },
  { key: 'imageBytes', label: 'Peso das imagens', dir: 'lower', fmt: 'bytes', minGap: 0.2, minAbs: 100 * 1024 },
  { key: 'nextGenShare', label: 'Imagens em WebP/AVIF', dir: 'higher', fmt: 'pct', minGap: 0.2 },
  { key: 'ctaCount', label: 'Chamadas para ação', dir: 'higher', fmt: 'int', minGap: 0.3 },
  { key: 'words', label: 'Palavras de conteúdo', dir: 'higher', fmt: 'int', minGap: 0.3, minAbs: 100 },
  { key: 'fontFamilies', label: 'Famílias de fonte', dir: 'lower', fmt: 'int', minGap: 0.01 },
  { key: 'accentColors', label: 'Cores de destaque', dir: 'lower', fmt: 'int', minGap: 0.01 },
  { key: 'lowContrastShare', label: 'Texto com baixo contraste', dir: 'lower', fmt: 'pct', minGap: 0.05 },
  { key: 'consoleErrors', label: 'Erros de JavaScript', dir: 'lower', fmt: 'int', minGap: 0.01 },
  { key: 'brokenLinks', label: 'Links quebrados', dir: 'lower', fmt: 'int', minGap: 0.01 },
];

export function compareSites(main, competitors) {
  const sites = [main, ...competitors].filter((s) => !s.error);
  if (sites.length < 2) return null;
  // Usa o domínio como nome; se dois sites tiverem o mesmo domínio, inclui o caminho.
  const hosts = sites.map((s) => displayHost(s.finalUrl || s.url));
  const names = new Map(sites.map((s, i) => {
    if (hosts.filter((h) => h === hosts[i]).length === 1) return [s, hosts[i]];
    const u = new URL(s.finalUrl || s.url);
    return [s, `${hosts[i]}${u.port ? ':' + u.port : ''}${u.pathname === '/' ? '' : u.pathname}`];
  }));
  const name = (s) => names.get(s);

  const categoryTable = CATEGORIES.map((c) => ({
    id: c.id,
    label: c.label,
    values: sites.map((s) => s.score.categories[c.id]),
  })).filter((row) => row.values.some((v) => v != null));

  const metricTable = METRICS.map((m) => {
    const values = sites.map((s) => (m.key === 'overall' ? s.score.overall : s.metrics[m.key] ?? null));
    const valid = values.filter((v) => v != null);
    const best = valid.length ? (m.dir === 'lower' ? Math.min(...valid) : Math.max(...valid)) : null;
    return { ...m, values, best, bestIndex: best == null ? -1 : values.indexOf(best) };
  }).filter((r) => r.values.filter((v) => v != null).length >= 2);

  // Ranking pela nota geral
  const ranking = sites
    .map((s, i) => ({ name: name(s), overall: s.score.overall, isMain: i === 0 }))
    .sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1))
    .map((r, i) => ({ ...r, position: i + 1 }));

  const insights = [];
  const mainValues = (k) => (k === 'overall' ? main.score.overall : main.metrics[k]);
  for (const row of metricTable) {
    if (row.key === 'overall') continue;
    const mine = mainValues(row.key);
    if (mine == null || row.best == null || row.bestIndex === 0) continue;
    const better = row.dir === 'lower' ? mine > row.best : mine < row.best;
    const ref = Math.max(Math.abs(mine), Math.abs(row.best), 1e-9);
    const gap = Math.abs(mine - row.best) / ref;
    if (better && gap >= row.minGap && Math.abs(mine - row.best) >= (row.minAbs || 0)) {
      insights.push({
        type: 'metric',
        key: row.key,
        competitor: name(sites[row.bestIndex]),
        text: `${row.label}: você tem ${fmt(mine, row.fmt)}, enquanto ${name(sites[row.bestIndex])} tem ${fmt(row.best, row.fmt)}.`,
        gap,
      });
    }
  }
  insights.sort((a, b) => b.gap - a.gap);

  // O que concorrentes fazem bem e você não
  const theyDo = [];
  const mainChecks = new Map(main.checks.map((c) => [c.id, c]));
  for (const comp of competitors.filter((c) => !c.error)) {
    for (const c of comp.checks) {
      const mine = mainChecks.get(c.id);
      if (c.status === 'ok' && mine && (mine.status === 'fail' || (mine.status === 'warn' && mine.impact === 'alta'))) {
        const existing = theyDo.find((t) => t.id === c.id);
        if (existing) existing.competitors.push(name(comp));
        else theyDo.push({ id: c.id, title: c.title, category: c.category, impact: mine.impact, competitors: [name(comp)], mine: mine.value, fix: mine.fix });
      }
    }
  }
  const order = { alta: 0, media: 1, baixa: 2 };
  theyDo.sort((a, b) => order[a.impact] - order[b.impact] || b.competitors.length - a.competitors.length);

  // Onde você está à frente
  const advantages = [];
  for (const row of categoryTable) {
    const mine = row.values[0];
    const others = row.values.slice(1).filter((v) => v != null);
    if (mine != null && others.length && mine > Math.max(...others) + 5) advantages.push(`${row.label}: sua nota ${mine} supera todos os concorrentes (melhor deles: ${Math.max(...others)}).`);
  }

  return {
    sites: sites.map((s, i) => ({ name: name(s), url: s.finalUrl || s.url, isMain: i === 0, overall: s.score.overall, screenshot: s.screenshots?.mobile || null })),
    categoryTable,
    metricTable,
    ranking,
    insights: insights.slice(0, 10),
    theyDo: theyDo.slice(0, 12),
    advantages,
  };
}

export function fmt(v, kind) {
  if (v == null) return '—';
  switch (kind) {
    case 'ms': return sec(v);
    case 'bytes': return kb(v);
    case 'pct': return `${Math.round(v * 100)}%`;
    case 'score': return `${v}/100`;
    default: return String(Math.round(v));
  }
}
