import { check, dec, STATUS } from './common.js';

const C = 'mobile';

export function mobileChecks(ctx) {
  const { $, mobile } = ctx;
  const out = [];
  const vp = $('meta[name="viewport"]').attr('content') || '';
  out.push(check(C, 'viewport', {
    title: 'Página adaptada para celular (viewport)',
    status: /width\s*=\s*device-width/i.test(vp) ? STATUS.OK : STATUS.FAIL,
    impact: 'alta', effort: 'baixo',
    value: vp || 'ausente',
    detail: vp ? `viewport: ${vp}` : 'Sem meta viewport, o celular mostra a versão desktop em miniatura.',
    fix: 'Adicione <meta name="viewport" content="width=device-width, initial-scale=1">.',
  }));
  if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(vp)) {
    out.push(check(C, 'zoom', {
      title: 'Zoom bloqueado no celular',
      status: STATUS.WARN, impact: 'baixa', effort: 'baixo',
      value: 'bloqueado',
      detail: 'O zoom está desativado, o que atrapalha pessoas com dificuldade de visão.',
      fix: 'Remova user-scalable=no e maximum-scale=1 da meta viewport.',
    }));
  }
  if (mobile?.viewport) {
    out.push(check(C, 'overflow', {
      title: 'Rolagem lateral no celular',
      status: mobile.horizontalOverflow ? STATUS.FAIL : STATUS.OK,
      impact: 'alta', effort: 'medio',
      value: mobile.horizontalOverflow ? `${mobile.scrollWidth}px > ${mobile.viewport.width}px` : 'não',
      detail: mobile.horizontalOverflow ? 'Algum elemento é mais largo que a tela, e a página “escorrega” para os lados.' : 'O conteúdo cabe na largura da tela.',
      fix: 'Procure imagens, tabelas, iframes ou seções com largura fixa; use max-width: 100% e teste em 360 px.',
    }));
    const small = mobile.smallTargets || [];
    out.push(check(C, 'tap-targets', {
      title: 'Botões e links fáceis de tocar',
      status: small.length <= 3 ? STATUS.OK : small.length <= 10 ? STATUS.WARN : STATUS.FAIL,
      impact: 'media', effort: 'baixo',
      value: `${small.length} pequenos`,
      detail: small.length ? `${small.length} elemento(s) clicáveis menores que 24 px — difícil acertar com o dedo.` : 'Elementos clicáveis com tamanho adequado.',
      fix: 'Botões com pelo menos 44×44 px e espaço entre links no celular.',
      items: small.slice(0, 10),
    }));
    const height = mobile.pageHeight;
    if (height) {
      const screens = height / mobile.viewport.height;
      out.push(check(C, 'length', {
        title: 'Comprimento da página no celular',
        status: STATUS.INFO, impact: 'baixa',
        value: `${dec(screens)} telas`,
        detail: `A página tem cerca de ${screens.toFixed(0)} telas de rolagem no celular.${screens > 25 ? ' Páginas muito longas precisam de botões de ação repetidos ao longo do conteúdo.' : ''}`,
      }));
    }
  }
  return { checks: out, metrics: { mobileOverflow: mobile?.viewport ? mobile.horizontalOverflow : null, smallTapTargets: mobile?.smallTargets?.length ?? null }, extra: {} };
}
