import { kb, sec } from './checks/common.js';

export const CATEGORIES = [
  { id: 'desempenho', label: 'Velocidade', weight: 20, icon: '⚡' },
  { id: 'conversao', label: 'Conversão', weight: 20, icon: '🎯' },
  { id: 'seo', label: 'SEO', weight: 14, icon: '🔎' },
  { id: 'mobile', label: 'Celular', weight: 12, icon: '📱' },
  { id: 'imagens', label: 'Imagens', weight: 8, icon: '🖼️' },
  { id: 'erros', label: 'Erros', weight: 8, icon: '🐞' },
  { id: 'tipografia', label: 'Fontes', weight: 6, icon: '🔤' },
  { id: 'cores', label: 'Cores', weight: 6, icon: '🎨' },
  { id: 'acessibilidade', label: 'Acessibilidade', weight: 3, icon: '♿' },
  { id: 'seguranca', label: 'Segurança', weight: 3, icon: '🔒' },
];

const IMPACT_W = { alta: 3, media: 2, baixa: 1 };
const EFFORT_W = { baixo: 1, medio: 2, alto: 3 };
const STATUS_V = { ok: 1, warn: 0.5, fail: 0 };

export function scoreCategories(checks, psi) {
  const scores = {};
  for (const cat of CATEGORIES) {
    const items = checks.filter((c) => c.category === cat.id && c.status in STATUS_V);
    if (!items.length) {
      scores[cat.id] = null;
      continue;
    }
    const total = items.reduce((s, c) => s + IMPACT_W[c.impact], 0);
    const got = items.reduce((s, c) => s + IMPACT_W[c.impact] * STATUS_V[c.status], 0);
    scores[cat.id] = Math.round((got / total) * 100);
  }
  // Se houver nota oficial do Google, ela pesa metade na velocidade.
  if (psi?.scores?.performance != null && scores.desempenho != null) {
    scores.desempenho = Math.round((scores.desempenho + psi.scores.performance) / 2);
  }
  let wSum = 0;
  let sSum = 0;
  for (const cat of CATEGORIES) {
    if (scores[cat.id] == null) continue;
    wSum += cat.weight;
    sSum += cat.weight * scores[cat.id];
  }
  return { categories: scores, overall: wSum ? Math.round(sSum / wSum) : null };
}

export function gradeLabel(score) {
  if (score == null) return { label: 'Sem dados', level: 'none' };
  if (score >= 85) return { label: 'Excelente', level: 'good' };
  if (score >= 70) return { label: 'Bom', level: 'good' };
  if (score >= 50) return { label: 'Regular', level: 'warning' };
  return { label: 'Crítico', level: 'critical' };
}

/** Plano de ação priorizado: impacto alto e esforço baixo primeiro. */
export function buildActionPlan(checks) {
  const items = checks
    .filter((c) => (c.status === 'fail' || c.status === 'warn') && c.fix)
    .map((c) => {
      const priority = (IMPACT_W[c.impact] * (c.status === 'fail' ? 2 : 1)) / EFFORT_W[c.effort];
      return { id: c.id, category: c.category, title: c.title, status: c.status, impact: c.impact, effort: c.effort, problem: c.detail, fix: c.fix, priority };
    })
    .sort((a, b) => b.priority - a.priority);
  const now = items.filter((i) => i.priority >= 3);
  const next = items.filter((i) => i.priority >= 1.5 && i.priority < 3);
  const later = items.filter((i) => i.priority < 1.5);
  return { now, next, later, total: items.length };
}

export function buildSummary(result) {
  const { score, checks, metrics, extra } = result;
  const cats = CATEGORIES.filter((c) => score.categories[c.id] != null).map((c) => ({ ...c, score: score.categories[c.id] }));
  const strengths = [...cats].sort((a, b) => b.score - a.score).filter((c) => c.score >= 75).slice(0, 3);
  const weaknesses = [...cats].sort((a, b) => a.score - b.score).filter((c) => c.score < 70).slice(0, 3);
  const g = gradeLabel(score.overall);
  const fails = checks.filter((c) => c.status === 'fail').length;
  const warns = checks.filter((c) => c.status === 'warn').length;

  const lines = [];
  lines.push(`A página recebeu nota ${score.overall}/100 (${g.label.toLowerCase()}), com ${fails} problema(s) crítico(s) e ${warns} ponto(s) de atenção.`);
  if (metrics.loadMobileMs) lines.push(`No celular ela termina de carregar em ${sec(metrics.loadMobileMs)}${metrics.lcpMs ? ` e o conteúdo principal aparece em ${sec(metrics.lcpMs)}` : ''}${metrics.totalBytes ? `, baixando ${kb(metrics.totalBytes)}` : ''}.`);
  if (strengths.length) lines.push(`Pontos fortes: ${strengths.map((s) => s.label.toLowerCase()).join(', ')}.`);
  if (weaknesses.length) lines.push(`Onde mais perde resultado: ${weaknesses.map((s) => `${s.label.toLowerCase()} (${s.score})`).join(', ')}.`);
  if (extra.platform) lines.push(`Plataforma identificada: ${extra.platform}.`);
  return { grade: g, text: lines, strengths, weaknesses, fails, warns };
}
