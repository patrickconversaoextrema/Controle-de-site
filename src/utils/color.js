// Utilitários de cor: parsing, contraste WCAG, matiz e agrupamento de paleta.

const NAMED = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0],
  blue: [0, 0, 255], gray: [128, 128, 128], grey: [128, 128, 128], yellow: [255, 255, 0],
  orange: [255, 165, 0], purple: [128, 0, 128], navy: [0, 0, 128], silver: [192, 192, 192],
  teal: [0, 128, 128], maroon: [128, 0, 0], olive: [128, 128, 0], lime: [0, 255, 0],
  aqua: [0, 255, 255], cyan: [0, 255, 255], fuchsia: [255, 0, 255], magenta: [255, 0, 255],
};

export function parseColor(input) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  if (s === 'transparent' || s === 'none' || s === 'inherit' || s === 'currentcolor') return null;
  if (NAMED[s]) return { r: NAMED[s][0], g: NAMED[s][1], b: NAMED[s][2], a: 1 };

  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }

  m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const ch = (v) => (v.endsWith('%') ? (parseFloat(v) * 255) / 100 : parseFloat(v));
    const a = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    return { r: ch(parts[0]), g: ch(parts[1]), b: ch(parts[2]), a };
  }

  m = s.match(/^hsla?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const [r, g, b] = hslToRgb(parseFloat(parts[0]), parseFloat(parts[1]) / 100, parseFloat(parts[2]) / 100);
    const a = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    return { r, g, b, a };
  }
  return null;
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function toHex({ r, g, b }) {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
}

/** Mistura uma cor semitransparente sobre um fundo opaco. */
export function blend(fg, bg) {
  const a = fg.a ?? 1;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance({ r, g, b }) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export function toHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/** Distância perceptual simples (redmean), suficiente para agrupar tons quase iguais. */
export function colorDistance(a, b) {
  const rm = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}

export function isNeutral(c) {
  const { s, l } = toHsl(c);
  return s < 0.12 || l < 0.08 || l > 0.96;
}

/**
 * Agrupa cores com peso (ex.: área ou número de elementos) em uma paleta.
 * entries: [{ color: {r,g,b}, weight }]
 */
export function clusterPalette(entries, threshold = 40) {
  const sorted = [...entries].sort((a, b) => b.weight - a.weight);
  const clusters = [];
  for (const e of sorted) {
    const hit = clusters.find((c) => colorDistance(c.color, e.color) < threshold);
    if (hit) hit.weight += e.weight;
    else clusters.push({ color: e.color, weight: e.weight });
  }
  const total = clusters.reduce((s, c) => s + c.weight, 0) || 1;
  return clusters
    .sort((a, b) => b.weight - a.weight)
    .map((c) => ({ hex: toHex(c.color), share: c.weight / total, neutral: isNeutral(c.color), hsl: toHsl(c.color) }));
}

/** Classifica a harmonia entre as cores de destaque (não neutras). */
export function harmonyOf(accentHues) {
  const hues = accentHues.slice(0, 4);
  if (hues.length === 0) return { type: 'neutra', label: 'Paleta neutra (sem cor de destaque)' };
  if (hues.length === 1) return { type: 'monocromatica', label: 'Monocromática (uma cor de destaque)' };
  const diff = (a, b) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };
  const pairs = [];
  for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++) pairs.push(diff(hues[i], hues[j]));
  const maxD = Math.max(...pairs);
  if (maxD <= 40) return { type: 'analoga', label: 'Análoga (tons vizinhos, visual harmônico)' };
  if (hues.length === 2 && maxD >= 150) return { type: 'complementar', label: 'Complementar (alto contraste entre destaque e base)' };
  if (hues.length === 3 && pairs.every((d) => d >= 100 && d <= 140)) return { type: 'triadica', label: 'Triádica (três cores equilibradas)' };
  if (hues.length >= 3 && pairs.filter((d) => d > 60).length >= 3) return { type: 'dispersa', label: 'Dispersa (muitas cores competindo por atenção)' };
  return { type: 'mista', label: 'Mista (destaques com relação parcial)' };
}
