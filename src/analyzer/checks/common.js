export const STATUS = { OK: 'ok', WARN: 'warn', FAIL: 'fail', INFO: 'info' };

/**
 * Cria um item de checagem.
 * impact: 'alta' | 'media' | 'baixa' — quanto afeta resultados (vendas, SEO, experiência)
 * effort: 'baixo' | 'medio' | 'alto' — esforço estimado para corrigir
 */
export function check(category, id, { title, status, impact = 'media', effort = 'medio', value = null, detail = '', fix = '', items = null }) {
  return { id: `${category}.${id}`, category, title, status, impact, effort, value, detail, fix, items };
}

export const dec = (n, digits = 1) => n.toFixed(digits).replace('.', ',');
export const kb = (bytes) => (bytes == null ? '—' : bytes >= 1024 * 1024 ? `${dec(bytes / 1024 / 1024)} MB` : `${Math.round(bytes / 1024)} KB`);
export const sec = (ms) => (ms == null ? '—' : `${dec(ms / 1000)} s`);

export function grade(value, good, poor, lowerIsBetter = true) {
  if (value == null || Number.isNaN(value)) return STATUS.INFO;
  if (lowerIsBetter) return value <= good ? STATUS.OK : value <= poor ? STATUS.WARN : STATUS.FAIL;
  return value >= good ? STATUS.OK : value >= poor ? STATUS.WARN : STATUS.FAIL;
}

export function firstFamily(fontFamily) {
  if (!fontFamily) return null;
  return fontFamily.split(',')[0].replace(/["']/g, '').trim();
}
