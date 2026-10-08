import { check, dec, grade, kb, sec, STATUS } from './common.js';

const C = 'desempenho';

export function performanceChecks(ctx) {
  const { doc, $, desktop, mobile, psi } = ctx;
  const out = [];
  const h = doc.headers;

  out.push(check(C, 'ttfb', {
    title: 'Tempo de resposta do servidor (TTFB)',
    status: grade(doc.ttfbMs, 600, 1500),
    impact: 'alta', effort: 'medio',
    value: sec(doc.ttfbMs),
    detail: `O servidor levou ${sec(doc.ttfbMs)} para começar a responder. O ideal é abaixo de 0,6 s.`,
    fix: 'Use cache de página (plugin de cache/CDN como Cloudflare), hospedagem mais rápida e reduza consultas ao banco/plug-ins pesados.',
  }));

  const enc = h['content-encoding'];
  out.push(check(C, 'compression', {
    title: 'Compressão do HTML (gzip/brotli)',
    status: enc ? STATUS.OK : doc.htmlBytes > 20000 ? STATUS.FAIL : STATUS.WARN,
    impact: 'media', effort: 'baixo',
    value: enc || 'nenhuma',
    detail: enc ? `HTML entregue com compressão ${enc}.` : 'O HTML é entregue sem compressão, deixando o download maior.',
    fix: 'Ative gzip ou brotli no servidor/CDN (no Cloudflare já vem ativado; no Apache use mod_deflate, no Nginx "gzip on").',
  }));

  out.push(check(C, 'html-size', {
    title: 'Tamanho do HTML',
    status: grade(doc.htmlBytes, 150 * 1024, 400 * 1024),
    impact: 'baixa', effort: 'medio',
    value: kb(doc.htmlBytes),
    detail: `O documento HTML tem ${kb(doc.htmlBytes)}.`,
    fix: 'Remova CSS/JS inline desnecessário, SVGs gigantes embutidos e blocos ocultos que não são usados.',
  }));

  const blocking = $('head script[src]:not([async]):not([defer]):not([type="module"])').length;
  out.push(check(C, 'render-blocking', {
    title: 'Scripts bloqueando a renderização',
    status: blocking === 0 ? STATUS.OK : blocking <= 2 ? STATUS.WARN : STATUS.FAIL,
    impact: 'alta', effort: 'baixo',
    value: blocking,
    detail: blocking ? `${blocking} script(s) no <head> sem async/defer travam a exibição da página.` : 'Nenhum script bloqueante no <head>.',
    fix: 'Adicione o atributo defer (ou async para scripts independentes como analytics) ou mova os scripts para o final do <body>.',
  }));

  const redirects = doc.redirects.length;
  if (redirects) {
    out.push(check(C, 'redirects', {
      title: 'Redirecionamentos antes de chegar à página',
      status: redirects > 1 ? STATUS.FAIL : STATUS.WARN,
      impact: 'media', effort: 'baixo',
      value: redirects,
      detail: `${redirects} redirecionamento(s): ${doc.redirects.map((r) => `${r.status} → ${r.to}`).join(', ')}.`,
      fix: 'Divulgue sempre a URL final (com https e o www correto) em anúncios e links para evitar saltos extras.',
    }));
  }

  const m = mobile?.timing ? mobile : null;
  const d = desktop?.timing ? desktop : null;
  const lab = psi?.lab;
  const lcp = lab?.lcp ?? m?.timing.lcp ?? d?.timing.lcp;
  if (lcp != null) {
    out.push(check(C, 'lcp', {
      title: 'Maior elemento visível (LCP) no celular',
      status: grade(lcp, 2500, 4000),
      impact: 'alta', effort: 'medio',
      value: sec(lcp),
      detail: `O conteúdo principal aparece em ${sec(lcp)}${m?.timing.lcpElement ? ` (elemento: ${m.timing.lcpElement})` : ''}. Google recomenda até 2,5 s.`,
      fix: 'Otimize a imagem/banner do topo (WebP/AVIF, tamanho correto, fetchpriority="high"), evite carrossel no topo e reduza CSS/JS bloqueante.',
    }));
  }
  const fcp = lab?.fcp ?? m?.timing.fcp ?? d?.timing.fcp;
  if (fcp != null) {
    out.push(check(C, 'fcp', {
      title: 'Primeira exibição de conteúdo (FCP)',
      status: grade(fcp, 1800, 3000),
      impact: 'media', effort: 'medio',
      value: sec(fcp),
      detail: `O visitante vê algo na tela após ${sec(fcp)}.`,
      fix: 'Reduza CSS crítico, use cache e CDN, pré-conecte domínios de fontes (preconnect) e adie scripts.',
    }));
  }
  const cls = lab?.cls ?? m?.timing.cls ?? d?.timing.cls;
  if (cls != null) {
    out.push(check(C, 'cls', {
      title: 'Estabilidade visual (CLS)',
      status: grade(cls, 0.1, 0.25),
      impact: 'media', effort: 'baixo',
      value: dec(cls, 3),
      detail: `Elementos "pulam" na tela (índice ${dec(cls, 3)}). Até 0,1 é bom.`,
      fix: 'Defina width/height em imagens e vídeos, reserve espaço para banners/pop-ups e use font-display: swap com fontes semelhantes.',
    }));
  }
  if (lab?.tbt != null) {
    out.push(check(C, 'tbt', {
      title: 'Tempo de bloqueio por JavaScript (TBT)',
      status: grade(lab.tbt, 200, 600),
      impact: 'media', effort: 'alto',
      value: `${Math.round(lab.tbt)} ms`,
      detail: `A página fica travada para cliques por ${Math.round(lab.tbt)} ms durante o carregamento.`,
      fix: 'Remova scripts e plug-ins não usados, adie pixels/chat para depois do carregamento e divida JS pesado.',
    }));
  }
  if (m?.loadMs) {
    out.push(check(C, 'load-mobile', {
      title: 'Carregamento completo no celular (4G simulado)',
      status: grade(m.loadMs, 3000, 6000),
      impact: 'alta', effort: 'medio',
      value: sec(m.loadMs),
      detail: `A página terminou de carregar em ${sec(m.loadMs)} em um celular com 4G simulado. Cada segundo extra reduz conversões.`,
      fix: 'Comprima imagens, reduza scripts de terceiros (chats, pixels, widgets) e use cache/CDN.',
    }));
  }

  const reqs = (d || m)?.requests || [];
  const totalBytes = reqs.reduce((s, r) => s + (r.bytes || 0), 0);
  const byType = {};
  for (const r of reqs) {
    const t = normalizeType(r.type);
    byType[t] ??= { count: 0, bytes: 0 };
    byType[t].count++;
    byType[t].bytes += r.bytes || 0;
  }
  if (reqs.length) {
    out.push(check(C, 'weight', {
      title: 'Peso total da página',
      status: grade(totalBytes, 2 * 1024 * 1024, 5 * 1024 * 1024),
      impact: 'alta', effort: 'medio',
      value: kb(totalBytes),
      detail: `A página baixa ${kb(totalBytes)} no total (imagens ${kb(byType.Imagem?.bytes || 0)}, scripts ${kb(byType.Script?.bytes || 0)}, fontes ${kb(byType.Fonte?.bytes || 0)}).`,
      fix: 'Meta: menos de 2 MB. Comece pelas imagens (maior peso na maioria das landing pages) e por scripts de terceiros.',
    }));
    out.push(check(C, 'requests', {
      title: 'Quantidade de requisições',
      status: grade(reqs.length, 70, 140),
      impact: 'baixa', effort: 'medio',
      value: reqs.length,
      detail: `${reqs.length} arquivos são baixados para montar a página.`,
      fix: 'Remova plug-ins e widgets que não ajudam a vender, junte ícones em uma única fonte/SVG sprite e evite carregar bibliotecas inteiras.',
    }));
    const thirdParty = reqs.filter((r) => { try { return new URL(r.url).hostname.replace(/^www\./, '') !== new URL(ctx.finalUrl).hostname.replace(/^www\./, ''); } catch { return false; } });
    const tpHosts = [...new Set(thirdParty.map((r) => { try { return new URL(r.url).hostname; } catch { return ''; } }))].filter(Boolean);
    out.push(check(C, 'third-party', {
      title: 'Scripts e serviços de terceiros',
      status: grade(tpHosts.length, 10, 20),
      impact: 'media', effort: 'medio',
      value: tpHosts.length,
      detail: `${tpHosts.length} domínios externos carregados (${tpHosts.slice(0, 8).join(', ')}${tpHosts.length > 8 ? '…' : ''}).`,
      fix: 'Mantenha só o essencial (analytics, pixel principal). Carregue chat e widgets após interação ou alguns segundos depois.',
    }));
    const noCache = reqs.filter((r) => ['Imagem', 'Script', 'CSS', 'Fonte'].includes(normalizeType(r.type)) && r.status === 200 && (!r.cache || /no-cache|no-store|max-age=0\b/.test(r.cache)) && isSameSite(r.url, ctx.finalUrl));
    if (reqs.some((r) => isSameSite(r.url, ctx.finalUrl) && ['Imagem', 'Script', 'CSS'].includes(normalizeType(r.type)))) {
      out.push(check(C, 'cache', {
        title: 'Cache de arquivos estáticos',
        status: noCache.length === 0 ? STATUS.OK : noCache.length <= 5 ? STATUS.WARN : STATUS.FAIL,
        impact: 'media', effort: 'baixo',
        value: `${noCache.length} sem cache`,
        detail: noCache.length ? `${noCache.length} arquivo(s) estáticos do próprio site sem cache no navegador. Visitantes que voltam baixam tudo de novo.` : 'Arquivos estáticos com cache configurado.',
        fix: 'Configure Cache-Control: max-age=31536000 para imagens, CSS, JS e fontes (via .htaccess, Nginx, plugin de cache ou CDN).',
        items: noCache.slice(0, 10).map((r) => r.url),
      }));
    }
    const http1 = reqs.filter((r) => r.protocol && /^http\/1/.test(r.protocol) && isSameSite(r.url, ctx.finalUrl)).length;
    if (http1 > 3) {
      out.push(check(C, 'http2', {
        title: 'Protocolo HTTP/2 ou HTTP/3',
        status: STATUS.WARN,
        impact: 'baixa', effort: 'baixo',
        value: 'HTTP/1.1',
        detail: 'O servidor ainda usa HTTP/1.1, que baixa arquivos de forma menos eficiente.',
        fix: 'Ative HTTP/2 ou HTTP/3 na hospedagem ou use uma CDN (Cloudflare ativa automaticamente).',
      }));
    }
  }

  if (psi?.opportunities?.length) {
    out.push(check(C, 'psi-opportunities', {
      title: 'Oportunidades apontadas pelo Google PageSpeed',
      status: STATUS.INFO,
      impact: 'media',
      value: psi.opportunities.length,
      detail: 'Itens com maior potencial de economia de tempo segundo o Lighthouse.',
      items: psi.opportunities.map((o) => `${o.title} (−${sec(o.savingsMs)})`),
    }));
  }

  return {
    checks: out,
    metrics: {
      ttfbMs: doc.ttfbMs,
      lcpMs: lcp ?? null,
      fcpMs: fcp ?? null,
      cls: cls ?? null,
      loadMobileMs: m?.loadMs ?? null,
      loadDesktopMs: d?.loadMs ?? null,
      totalBytes: reqs.length ? totalBytes : null,
      requests: reqs.length || null,
      psiPerformance: psi?.scores?.performance ?? null,
    },
    extra: { byType, psi },
  };
}

function isSameSite(a, b) {
  try {
    return new URL(a).hostname.replace(/^www\./, '') === new URL(b).hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
}

export function normalizeType(t) {
  switch (t) {
    case 'Image': return 'Imagem';
    case 'Script': return 'Script';
    case 'Stylesheet': return 'CSS';
    case 'Font': return 'Fonte';
    case 'Document': return 'Documento';
    case 'Media': return 'Vídeo/Áudio';
    case 'XHR':
    case 'Fetch': return 'Dados (XHR)';
    default: return 'Outros';
  }
}
