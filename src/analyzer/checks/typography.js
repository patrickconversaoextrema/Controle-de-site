import { check, dec, firstFamily, STATUS } from './common.js';

const C = 'tipografia';

const SERIF = ['playfair display', 'merriweather', 'lora', 'georgia', 'times new roman', 'times', 'libre baskerville', 'cormorant', 'cormorant garamond', 'eb garamond', 'garamond', 'pt serif', 'noto serif', 'crimson text', 'dm serif display', 'source serif pro', 'source serif 4', 'roboto slab', 'bitter', 'zilla slab', 'prata', 'cinzel', 'frank ruhl libre', 'spectral', 'fraunces', 'abril fatface', 'arvo', 'domine', 'serif'];
const DISPLAY = ['lobster', 'pacifico', 'dancing script', 'great vibes', 'bebas neue', 'anton', 'oswald', 'righteous', 'satisfy', 'sacramento', 'caveat', 'permanent marker', 'alfa slab one', 'bangers', 'shadows into light', 'amatic sc', 'kaushan script', 'comic sans ms', 'impact', 'cursive', 'fantasy', 'allura', 'parisienne', 'yellowtail', 'courgette', 'cookie', 'tangerine'];
const MONO = ['courier new', 'courier', 'roboto mono', 'source code pro', 'fira code', 'jetbrains mono', 'ibm plex mono', 'space mono', 'monospace', 'consolas'];
const SYSTEM_DEFAULT = ['arial', 'helvetica', 'times new roman', 'times', 'verdana', 'tahoma', 'sans-serif', 'serif', '-apple-system', 'system-ui', 'segoe ui', 'blinkmacsystemfont'];
const ICON_FONTS = /(awesome|icon|dashicons|glyph|eicons|material symbols|fontello|ionicons|feather|elementskit|themify|linearicons|socicon|swiper-icons|slick)/i;

export function classifyFont(name) {
  const n = (name || '').toLowerCase();
  if (MONO.includes(n)) return 'mono';
  if (DISPLAY.includes(n)) return 'display';
  if (SERIF.includes(n) || (/serif| slab/.test(n) && !/sans/.test(n))) return 'serif';
  if (/script|hand|brush|signature/.test(n)) return 'display';
  return 'sans';
}

const LABEL = { sans: 'sem serifa', serif: 'serifada', display: 'decorativa/manuscrita', mono: 'monoespaçada' };

export function typographyChecks(ctx) {
  const { desktop, mobile, css, $ } = ctx;
  const out = [];
  const samples = desktop?.textSamples || [];

  // Famílias usadas, ponderadas pela quantidade de texto
  const byFamily = new Map();
  const headingFam = new Map();
  const bodyFam = new Map();
  for (const s of samples) {
    const f = firstFamily(s.family);
    if (!f || ICON_FONTS.test(f)) continue;
    byFamily.set(f, (byFamily.get(f) || 0) + s.chars);
    (s.heading ? headingFam : bodyFam).set(f, ((s.heading ? headingFam : bodyFam).get(f) || 0) + s.chars);
  }

  // Sem navegador: lê font-family do CSS
  if (!samples.length) {
    for (const m of css.all.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
      const f = firstFamily(m[1]);
      if (f && !ICON_FONTS.test(f) && !/^(inherit|initial|var\()/i.test(f)) byFamily.set(f, (byFamily.get(f) || 0) + 1);
    }
  }

  const total = [...byFamily.values()].reduce((a, b) => a + b, 0) || 1;
  const families = [...byFamily.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, w]) => ({ name, share: w / total, kind: classifyFont(name) }));
  const relevant = families.filter((f) => f.share >= 0.02);
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const body = top(bodyFam) || families[0]?.name || null;
  const heading = top(headingFam) || body;

  out.push(check(C, 'family-count', {
    title: 'Quantidade de fontes diferentes',
    status: relevant.length === 0 ? STATUS.INFO : relevant.length <= 2 ? STATUS.OK : relevant.length === 3 ? STATUS.WARN : STATUS.FAIL,
    impact: 'media', effort: 'medio',
    value: relevant.length,
    detail: relevant.length ? `Fontes em uso: ${relevant.map((f) => `${f.name} (${Math.round(f.share * 100)}%)`).join(', ')}.` : 'Não foi possível identificar as fontes.',
    fix: 'Use no máximo 2 famílias: uma para títulos e outra para textos. Mais que isso deixa o visual poluído e a página mais lenta.',
  }));

  // Combinação
  if (body) {
    const kb = classifyFont(body);
    const kh = classifyFont(heading);
    let status = STATUS.OK;
    let detail;
    let fix = '';
    if (kb === 'display') {
      status = STATUS.FAIL;
      detail = `O texto corrido usa uma fonte ${LABEL[kb]} (${body}), difícil de ler em blocos.`;
      fix = 'Reserve fontes decorativas apenas para títulos curtos; use uma fonte sem serifa legível (Inter, Roboto, Open Sans, Lato) nos textos.';
    } else if (heading === body) {
      detail = `Títulos e textos usam ${body} (${LABEL[kb]}). Visual consistente — a hierarquia depende de tamanho e peso.`;
      if (SYSTEM_DEFAULT.includes(body.toLowerCase())) {
        status = STATUS.WARN;
        detail += ' Porém é uma fonte padrão do sistema, que transmite pouca identidade de marca.';
        fix = 'Considere uma fonte com personalidade para títulos, por exemplo Montserrat, Poppins ou Playfair Display, mantendo a atual nos textos.';
      }
    } else if (kh === kb && kh === 'sans') {
      status = STATUS.WARN;
      detail = `Títulos em ${heading} e textos em ${body}: duas fontes sem serifa parecidas podem parecer inconsistentes em vez de intencionais.`;
      fix = 'Use uma única família sem serifa com pesos diferentes, ou crie contraste real (ex.: títulos serifados + texto sem serifa).';
    } else {
      detail = `Títulos em ${heading} (${LABEL[kh]}) e textos em ${body} (${LABEL[kb]}): combinação com bom contraste.`;
    }
    out.push(check(C, 'pairing', {
      title: 'Combinação de fontes (títulos × textos)',
      status, impact: 'media', effort: 'medio',
      value: heading === body ? body : `${heading} + ${body}`,
      detail, fix,
    }));
  }

  // Tamanho da fonte no celular
  const mSamples = mobile?.textSamples || [];
  if (mSamples.length) {
    const bodyLike = mSamples.filter((s) => !s.heading && s.chars > 40);
    const totalChars = bodyLike.reduce((a, s) => a + s.chars, 0) || 1;
    const avg = bodyLike.reduce((a, s) => a + s.size * s.chars, 0) / totalChars;
    const tiny = mSamples.filter((s) => s.size < 12 && s.chars > 15);
    out.push(check(C, 'mobile-size', {
      title: 'Tamanho do texto no celular',
      status: avg >= 15.5 && tiny.length <= 2 ? STATUS.OK : avg >= 14 ? STATUS.WARN : STATUS.FAIL,
      impact: 'alta', effort: 'baixo',
      value: `${avg ? dec(avg) : '—'} px (média)`,
      detail: `Texto corrido com média de ${dec(avg)} px no celular${tiny.length ? `; ${tiny.length} trecho(s) abaixo de 12 px` : ''}. Abaixo de 16 px o visitante precisa dar zoom.`,
      fix: 'Use pelo menos 16 px nos parágrafos no celular e 14 px em textos auxiliares.',
      items: tiny.slice(0, 8).map((s) => `“${s.text}” — ${s.size}px`),
    }));

    const withLh = bodyLike.filter((s) => s.lineHeight && s.size);
    if (withLh.length) {
      const ratio = withLh.reduce((a, s) => a + s.lineHeight / s.size, 0) / withLh.length;
      out.push(check(C, 'line-height', {
        title: 'Espaçamento entre linhas',
        status: ratio >= 1.4 && ratio <= 1.9 ? STATUS.OK : ratio >= 1.25 ? STATUS.WARN : STATUS.FAIL,
        impact: 'baixa', effort: 'baixo',
        value: `${dec(ratio, 2)}×`,
        detail: `Altura de linha média de ${dec(ratio, 2)}× o tamanho da fonte. O confortável é entre 1,4 e 1,8.`,
        fix: 'Defina line-height: 1.5 nos parágrafos.',
      }));
    }
  }

  // Escala tipográfica
  if (samples.length) {
    const sizes = new Map();
    for (const s of samples) sizes.set(Math.round(s.size), (sizes.get(Math.round(s.size)) || 0) + s.chars);
    const used = [...sizes.entries()].filter(([, c]) => c > 20).map(([s]) => s).sort((a, b) => a - b);
    out.push(check(C, 'scale', {
      title: 'Consistência dos tamanhos de fonte',
      status: used.length <= 7 ? STATUS.OK : used.length <= 11 ? STATUS.WARN : STATUS.FAIL,
      impact: 'baixa', effort: 'medio',
      value: `${used.length} tamanhos`,
      detail: `Tamanhos usados: ${used.join(', ')} px. Muitos tamanhos diferentes indicam falta de padrão visual.`,
      fix: 'Adote uma escala fixa (ex.: 14, 16, 20, 28, 40, 56 px) e aplique em toda a página.',
    }));
  }

  // Pesos carregados
  const loaded = desktop?.fontsLoaded || [];
  const weights = new Map();
  for (const f of loaded) {
    if (ICON_FONTS.test(f.family)) continue;
    weights.set(f.family, (weights.get(f.family) || new Set()).add(`${f.weight}${f.style === 'italic' ? 'i' : ''}`));
  }
  const totalVariants = [...weights.values()].reduce((a, s) => a + s.size, 0);
  if (loaded.length) {
    out.push(check(C, 'variants', {
      title: 'Variações de fonte carregadas (pesos/estilos)',
      status: totalVariants <= 6 ? STATUS.OK : totalVariants <= 10 ? STATUS.WARN : STATUS.FAIL,
      impact: 'baixa', effort: 'baixo',
      value: totalVariants,
      detail: [...weights.entries()].map(([f, s]) => `${f}: ${[...s].join(', ')}`).join(' · ') || '—',
      fix: 'Carregue apenas os pesos usados (normalmente 400, 600/700). Cada peso extra é um arquivo a mais.',
    }));
  }

  // font-display e preconnect
  const googleFonts = $('link[href*="fonts.googleapis.com"]').map((_, el) => $(el).attr('href')).get();
  const fontFaces = [...css.all.matchAll(/@font-face\s*{([^}]*)}/gi)].map((m) => m[1]).filter((b) => !ICON_FONTS.test(b));
  const swapFaces = fontFaces.filter((b) => /font-display\s*:\s*(swap|optional|fallback)/i.test(b)).length;
  const gfSwap = googleFonts.every((u) => /display=(swap|optional|fallback)/.test(u));
  if (googleFonts.length || fontFaces.length) {
    const ok = gfSwap && (fontFaces.length === 0 || swapFaces / fontFaces.length >= 0.8);
    out.push(check(C, 'font-display', {
      title: 'Texto visível enquanto a fonte carrega',
      status: ok ? STATUS.OK : STATUS.WARN,
      impact: 'media', effort: 'baixo',
      value: ok ? 'font-display ok' : 'sem font-display: swap',
      detail: ok ? 'As fontes usam font-display, o texto aparece imediatamente.' : 'Sem font-display: swap o texto pode ficar invisível até a fonte baixar.',
      fix: 'Adicione &display=swap no link do Google Fonts e font-display: swap em cada @font-face.',
    }));
  }
  if (googleFonts.length) {
    const pre = $('link[rel="preconnect"][href*="fonts.gstatic.com"]').length > 0;
    out.push(check(C, 'preconnect', {
      title: 'Pré-conexão com Google Fonts',
      status: pre ? STATUS.OK : STATUS.WARN,
      impact: 'baixa', effort: 'baixo',
      value: pre ? 'sim' : 'não',
      detail: pre ? 'Pré-conexão configurada.' : 'Sem preconnect, o navegador demora mais para começar a baixar as fontes.',
      fix: 'Adicione <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin> no <head>.',
    }));
  }

  return {
    checks: out,
    metrics: { fontFamilies: relevant.length || families.length || null, fontVariants: loaded.length ? totalVariants : null },
    extra: { families: families.slice(0, 8), body, heading, googleFonts },
  };
}
