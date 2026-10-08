// Google PageSpeed Insights (Lighthouse + dados reais de usuários do Chrome/CrUX).
// Ativado quando PAGESPEED_API_KEY está definido.

const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export async function runPageSpeed(url, strategy = 'mobile') {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) return null;
  const params = new URLSearchParams({ url, strategy, key, locale: 'pt_BR' });
  for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) params.append('category', c);
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(90000) });
    if (!res.ok) return { error: `PageSpeed respondeu ${res.status}` };
    const json = await res.json();
    const lh = json.lighthouseResult || {};
    const cats = lh.categories || {};
    const audits = lh.audits || {};
    const num = (id) => audits[id]?.numericValue ?? null;
    const field = json.loadingExperience?.metrics || null;
    const opportunities = Object.values(audits)
      .filter((a) => a.details?.type === 'opportunity' && (a.details.overallSavingsMs || 0) > 150)
      .sort((a, b) => b.details.overallSavingsMs - a.details.overallSavingsMs)
      .slice(0, 8)
      .map((a) => ({ title: a.title, savingsMs: Math.round(a.details.overallSavingsMs) }));
    return {
      strategy,
      scores: {
        performance: pct(cats.performance?.score),
        accessibility: pct(cats.accessibility?.score),
        bestPractices: pct(cats['best-practices']?.score),
        seo: pct(cats.seo?.score),
      },
      lab: {
        fcp: num('first-contentful-paint'),
        lcp: num('largest-contentful-paint'),
        tbt: num('total-blocking-time'),
        cls: num('cumulative-layout-shift'),
        speedIndex: num('speed-index'),
      },
      field: field
        ? {
            lcp: field.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
            inp: field.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
            cls: field.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null ? field.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100 : null,
            overall: json.loadingExperience?.overall_category || null,
          }
        : null,
      opportunities,
    };
  } catch (err) {
    return { error: err.message };
  }
}

function pct(v) {
  return typeof v === 'number' ? Math.round(v * 100) : null;
}
