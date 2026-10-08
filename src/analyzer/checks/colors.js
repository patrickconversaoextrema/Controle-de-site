import { check, dec, STATUS } from './common.js';
import { parseColor, blend, contrastRatio, clusterPalette, harmonyOf, toHex } from '../../utils/color.js';

const C = 'cores';
const WHITE = { r: 255, g: 255, b: 255, a: 1 };

export function colorChecks(ctx) {
  const { desktop, css } = ctx;
  const out = [];
  const entries = [];
  const rootBg = parseColor(desktop?.rootBg) || WHITE;
  const solid = (c, bg = rootBg) => (c ? (c.a < 1 ? blend(c, bg.a < 1 ? WHITE : bg) : c) : null);

  if (desktop?.bgAreas?.length) {
    const maxArea = Math.max(...desktop.bgAreas.map((b) => b.area));
    for (const b of desktop.bgAreas) {
      const c = solid(parseColor(b.color));
      // Raiz em escala logarítmica para não deixar só o fundo dominar.
      if (c) entries.push({ color: c, weight: Math.sqrt(b.area / maxArea) * 100 });
    }
    for (const t of desktop.textSamples || []) {
      const c = solid(parseColor(t.color));
      if (c) entries.push({ color: c, weight: t.chars / 20 });
    }
    for (const cta of desktop.ctas || []) {
      const c = solid(parseColor(cta.bg));
      if (c) entries.push({ color: c, weight: 6 });
    }
  } else {
    // Sem navegador: frequência de cores declaradas no CSS.
    const re = /(#[0-9a-f]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\))/gi;
    for (const m of css.all.matchAll(re)) {
      const c = parseColor(m[1]);
      if (c && c.a > 0.3) entries.push({ color: solid(c, WHITE), weight: 1 });
    }
  }

  const palette = clusterPalette(entries, 45).filter((p) => p.share >= 0.006).slice(0, 14);
  const accents = palette.filter((p) => !p.neutral && p.share >= 0.01);

  if (palette.length) {
    out.push(check(C, 'palette-size', {
      title: 'Quantidade de cores de destaque',
      status: accents.length <= 3 ? STATUS.OK : accents.length <= 5 ? STATUS.WARN : STATUS.FAIL,
      impact: 'media', effort: 'medio',
      value: `${accents.length} destaque(s)`,
      detail: accents.length ? `Cores de destaque: ${accents.map((a) => a.hex).join(', ')}.` : 'A página usa apenas tons neutros (preto, branco, cinza).',
      fix: accents.length > 3
        ? 'Defina uma paleta: 1 cor principal (marca), 1 cor de ação (botões) e neutros. Cores demais competem pela atenção e enfraquecem o botão.'
        : accents.length === 0 ? 'Escolha uma cor de destaque para botões e elementos-chave — ela guia o olhar até a ação.' : '',
    }));
    const harmony = harmonyOf(accents.map((a) => a.hsl.h));
    out.push(check(C, 'harmony', {
      title: 'Harmonia da paleta',
      status: harmony.type === 'dispersa' ? STATUS.WARN : STATUS.OK,
      impact: 'baixa', effort: 'medio',
      value: harmony.label.split(' (')[0],
      detail: harmony.label + '.',
      fix: harmony.type === 'dispersa' ? 'Reduza as cores de destaque para 2–3 com relação clara (análogas ou complementares). Ferramentas: coolors.co, Adobe Color.' : '',
    }));
  }

  // Contraste do texto
  const samples = (desktop?.textSamples || []).filter((s) => s.bg && !s.bgImage);
  let lowShare = null;
  const badPairs = new Map();
  if (samples.length) {
    let totalChars = 0;
    let badChars = 0;
    for (const s of samples) {
      const bg = solid(parseColor(s.bg));
      const fg = parseColor(s.color);
      if (!bg || !fg) continue;
      const fgSolid = fg.a < 1 ? blend(fg, bg) : fg;
      const ratio = contrastRatio(fgSolid, bg);
      const large = s.size >= 24 || (s.size >= 18.6 && Number(s.weight) >= 700);
      const min = large ? 3 : 4.5;
      totalChars += s.chars;
      if (ratio < min) {
        badChars += s.chars;
        const key = `${toHex(fgSolid)} sobre ${toHex(bg)}`;
        const prev = badPairs.get(key) || { fg: toHex(fgSolid), bg: toHex(bg), ratio, chars: 0, example: s.text };
        prev.chars += s.chars;
        badPairs.set(key, prev);
      }
    }
    lowShare = totalChars ? badChars / totalChars : 0;
    const worst = [...badPairs.values()].sort((a, b) => b.chars - a.chars).slice(0, 6);
    out.push(check(C, 'contrast', {
      title: 'Contraste entre texto e fundo (legibilidade)',
      status: lowShare <= 0.03 ? STATUS.OK : lowShare <= 0.15 ? STATUS.WARN : STATUS.FAIL,
      impact: 'alta', effort: 'baixo',
      value: `${Math.round(lowShare * 100)}% do texto com baixo contraste`,
      detail: worst.length ? `Combinações difíceis de ler: ${worst.slice(0, 3).map((p) => `${p.fg} sobre ${p.bg} (${dec(p.ratio)}:1)`).join('; ')}. O mínimo recomendado (WCAG) é 4,5:1.` : 'Textos com contraste adequado.',
      fix: 'Escureça textos cinza-claro (use no mínimo #595959 sobre branco) e evite texto branco sobre cores claras (amarelo, verde-claro, laranja-claro).',
      items: worst.map((p) => `${p.fg} sobre ${p.bg} — ${dec(p.ratio, 2)}:1 — “${p.example}”`),
    }));
    out.contrastPairs = worst;
  }

  // Botão de ação se destaca?
  const ctas = (desktop?.ctas || []).filter((c) => parseColor(c.bg) && parseColor(c.bg).a > 0.5);
  if (ctas.length) {
    const primary = ctas.find((c) => c.aboveFold && c.matchesKeyword) || ctas.find((c) => c.matchesKeyword) || ctas[0];
    const bg = solid(parseColor(primary.bg));
    const around = solid(parseColor(primary.parentBg)) || rootBg;
    const pop = contrastRatio(bg, around);
    const text = parseColor(primary.color);
    const textRatio = text ? contrastRatio(text.a < 1 ? blend(text, bg) : text, bg) : null;
    const status = pop >= 3 && (textRatio ?? 5) >= 4.5 ? STATUS.OK : pop >= 1.8 && (textRatio ?? 5) >= 3 ? STATUS.WARN : STATUS.FAIL;
    out.push(check(C, 'cta-color', {
      title: 'Botão principal se destaca do fundo',
      status, impact: 'alta', effort: 'baixo',
      value: `${toHex(bg)} · ${dec(pop)}:1`,
      detail: `Botão “${primary.text}” em ${toHex(bg)} sobre fundo ${toHex(around)} (contraste ${dec(pop)}:1)${textRatio ? `; texto do botão ${dec(textRatio)}:1` : ''}.`,
      fix: 'O botão deve ter a cor mais chamativa da página, usada só em ações (contraste ≥ 3:1 com o fundo e texto ≥ 4,5:1 sobre o botão).',
    }));
  }

  return {
    checks: out,
    metrics: { accentColors: palette.length ? accents.length : null, lowContrastShare: lowShare },
    extra: { palette, contrastPairs: out.contrastPairs || [] },
  };
}
