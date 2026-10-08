import { check, kb, STATUS } from './common.js';
import { abs } from '../collect.js';

const C = 'imagens';

export function imageChecks(ctx) {
  const { $, desktop, mobile, finalUrl } = ctx;
  const out = [];

  const htmlImgs = $('img').map((_, el) => {
    const $el = $(el);
    return {
      src: abs($el.attr('src') || $el.attr('data-src') || '', finalUrl),
      alt: $el.attr('alt'),
      width: $el.attr('width'),
      height: $el.attr('height'),
      loading: $el.attr('loading'),
    };
  }).get();

  const live = (mobile?.images?.length ? mobile.images : desktop?.images) || [];
  const reqs = (desktop?.requests || mobile?.requests || []).filter((r) => r.type === 'Image');
  const bytesBySrc = new Map(reqs.map((r) => [r.url, r.bytes]));
  const imgs = live.length ? live.filter((i) => i.src) : htmlImgs.filter((i) => i.src);
  const count = imgs.length;

  if (!count && !reqs.length) {
    out.push(check(C, 'none', { title: 'Imagens', status: STATUS.INFO, value: 0, detail: 'Nenhuma imagem encontrada na página.' }));
    return { checks: out, metrics: { imageCount: 0, imageBytes: 0, nextGenShare: null }, extra: { heavy: [] } };
  }

  const noAlt = imgs.filter((i) => i.alt == null || (i.alt === '' && (i.width || 0) > 80));
  out.push(check(C, 'alt', {
    title: 'Texto alternativo (alt) nas imagens',
    status: noAlt.length === 0 ? STATUS.OK : noAlt.length / count < 0.25 ? STATUS.WARN : STATUS.FAIL,
    impact: 'media', effort: 'baixo',
    value: `${noAlt.length} de ${count} sem alt`,
    detail: noAlt.length ? 'Imagens sem descrição prejudicam SEO (Google Imagens) e acessibilidade para leitores de tela.' : 'Todas as imagens têm texto alternativo.',
    fix: 'Descreva cada imagem relevante no atributo alt (ex.: alt="Fachada da clínica no centro de Campinas"). Imagens decorativas: alt="".',
    items: noAlt.slice(0, 10).map((i) => i.src),
  }));

  const allSrcs = [...new Set([...imgs.map((i) => i.src), ...reqs.map((r) => r.url)])].filter((s) => !s.startsWith('data:'));
  const fmt = (u, mime) => {
    const m = (mime || '').toLowerCase();
    if (m.includes('webp') || /\.webp(\?|$)/i.test(u)) return 'webp';
    if (m.includes('avif') || /\.avif(\?|$)/i.test(u)) return 'avif';
    if (m.includes('svg') || /\.svg(\?|$)/i.test(u)) return 'svg';
    if (m.includes('png') || /\.png(\?|$)/i.test(u)) return 'png';
    if (m.includes('gif') || /\.gif(\?|$)/i.test(u)) return 'gif';
    if (m.includes('jpeg') || /\.jpe?g(\?|$)/i.test(u)) return 'jpg';
    return 'outro';
  };
  const mimeBySrc = new Map(reqs.map((r) => [r.url, r.mime]));
  const formats = {};
  for (const s of allSrcs) {
    const f = fmt(s, mimeBySrc.get(s));
    formats[f] = (formats[f] || 0) + 1;
  }
  const raster = allSrcs.filter((s) => !['svg', 'outro'].includes(fmt(s, mimeBySrc.get(s))));
  const legacy = raster.filter((s) => ['jpg', 'png', 'gif'].includes(fmt(s, mimeBySrc.get(s))));
  const nextGenShare = raster.length ? 1 - legacy.length / raster.length : null;
  out.push(check(C, 'formats', {
    title: 'Formatos modernos (WebP/AVIF)',
    status: nextGenShare == null ? STATUS.INFO : nextGenShare >= 0.8 ? STATUS.OK : nextGenShare >= 0.4 ? STATUS.WARN : STATUS.FAIL,
    impact: 'media', effort: 'baixo',
    value: Object.entries(formats).map(([k, v]) => `${k}: ${v}`).join(' · '),
    detail: legacy.length ? `${legacy.length} imagem(ns) em JPG/PNG/GIF. WebP/AVIF costumam ser 25–50% menores com a mesma qualidade.` : 'Imagens já em formatos modernos.',
    fix: 'Converta para WebP (Squoosh.app, TinyPNG ou plugin como ShortPixel/Imagify no WordPress). GIFs animados → vídeo MP4/WebM.',
    items: legacy.slice(0, 10),
  }));

  const imgBytes = reqs.reduce((s, r) => s + (r.bytes || 0), 0);
  const heavy = reqs.filter((r) => r.bytes > 200 * 1024).sort((a, b) => b.bytes - a.bytes);
  if (reqs.length) {
    out.push(check(C, 'weight', {
      title: 'Imagens pesadas (acima de 200 KB)',
      status: heavy.length === 0 ? STATUS.OK : heavy.length <= 2 ? STATUS.WARN : STATUS.FAIL,
      impact: 'alta', effort: 'baixo',
      value: `${heavy.length} pesadas · ${kb(imgBytes)} no total`,
      detail: heavy.length ? `As imagens somam ${kb(imgBytes)}. As maiores: ${heavy.slice(0, 3).map((r) => `${r.url.split('/').pop().split('?')[0].slice(0, 40)} (${kb(r.bytes)})`).join(', ')}.` : `As imagens somam ${kb(imgBytes)}, sem arquivos exagerados.`,
      fix: 'Comprima e redimensione: banner principal até ~150 KB, demais imagens até ~100 KB.',
      items: heavy.slice(0, 10).map((r) => `${r.url} — ${kb(r.bytes)}`),
    }));
  }

  if (live.length) {
    const dpr = mobile?.images?.length ? 2 : 1;
    const oversized = live.filter((i) => i.visible && i.naturalWidth > 0 && i.width > 0 && i.naturalWidth > i.width * dpr * 1.8 && i.naturalWidth > 600);
    out.push(check(C, 'oversized', {
      title: 'Imagens maiores do que o espaço exibido',
      status: oversized.length === 0 ? STATUS.OK : oversized.length <= 2 ? STATUS.WARN : STATUS.FAIL,
      impact: 'media', effort: 'baixo',
      value: oversized.length,
      detail: oversized.length ? `${oversized.length} imagem(ns) são muito maiores que o tamanho em que aparecem — o visitante baixa pixels que não vê.` : 'Imagens com dimensões adequadas.',
      fix: 'Redimensione para no máximo 2× a largura exibida e use srcset/sizes para servir versões menores no celular.',
      items: oversized.slice(0, 10).map((i) => `${i.src} — real ${i.naturalWidth}px, exibida ${i.width}px`),
    }));

    const below = live.filter((i) => i.visible && !i.aboveFold);
    const notLazy = below.filter((i) => i.loading !== 'lazy');
    if (below.length >= 3) {
      out.push(check(C, 'lazy', {
        title: 'Carregamento sob demanda (lazy loading)',
        status: notLazy.length / below.length < 0.3 ? STATUS.OK : STATUS.WARN,
        impact: 'media', effort: 'baixo',
        value: `${notLazy.length} de ${below.length} sem lazy`,
        detail: 'Imagens abaixo da primeira tela deveriam carregar apenas quando o visitante rolar a página.',
        fix: 'Adicione loading="lazy" às imagens abaixo da dobra (nunca na imagem principal do topo).',
      }));
    }
    const heroLazy = live.filter((i) => i.visible && i.aboveFold && i.loading === 'lazy' && i.width > 300);
    if (heroLazy.length) {
      out.push(check(C, 'hero-lazy', {
        title: 'Imagem do topo com lazy loading',
        status: STATUS.WARN,
        impact: 'media', effort: 'baixo',
        value: heroLazy.length,
        detail: 'A imagem principal (primeira tela) está com loading="lazy", o que atrasa o LCP.',
        fix: 'Remova loading="lazy" da imagem do topo e adicione fetchpriority="high".',
      }));
    }
    const broken = live.filter((i) => i.broken);
    if (broken.length) {
      out.push(check(C, 'broken', {
        title: 'Imagens quebradas',
        status: STATUS.FAIL,
        impact: 'alta', effort: 'baixo',
        value: broken.length,
        detail: 'Imagens que não carregaram passam impressão de site abandonado.',
        fix: 'Corrija o caminho ou reenvie os arquivos.',
        items: broken.slice(0, 10).map((i) => i.src),
      }));
    }
  }

  const noDims = htmlImgs.filter((i) => i.src && (!i.width || !i.height));
  out.push(check(C, 'dimensions', {
    title: 'Largura/altura definidas nas imagens',
    status: noDims.length === 0 ? STATUS.OK : noDims.length / htmlImgs.length < 0.4 ? STATUS.WARN : STATUS.FAIL,
    impact: 'baixa', effort: 'baixo',
    value: `${noDims.length} de ${htmlImgs.length} sem dimensões`,
    detail: 'Sem width/height o navegador não reserva espaço, e o conteúdo “pula” ao carregar (CLS).',
    fix: 'Informe width e height em cada <img> (o CSS pode continuar responsivo com height:auto).',
  }));

  return {
    checks: out,
    metrics: { imageCount: count, imageBytes: reqs.length ? imgBytes : null, nextGenShare, heavyImages: heavy.length, imagesWithoutAlt: noAlt.length },
    extra: { formats, heavy: heavy.slice(0, 8).map((r) => ({ url: r.url, bytes: r.bytes })) },
  };
}
