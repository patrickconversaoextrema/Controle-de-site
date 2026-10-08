import { check, STATUS } from './common.js';

const C = 'acessibilidade';

export function accessibilityChecks(ctx) {
  const { $ } = ctx;
  const out = [];

  const inputs = $('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]), textarea, select');
  const unlabeled = inputs.filter((_, el) => {
    const $el = $(el);
    const id = $el.attr('id');
    return !$el.attr('aria-label') && !$el.attr('aria-labelledby') && !$el.attr('title') && !(id && $(`label[for="${id}"]`).length) && !$el.closest('label').length;
  });
  if (inputs.length) {
    out.push(check(C, 'labels', {
      title: 'Campos de formulário com rótulo',
      status: unlabeled.length === 0 ? STATUS.OK : unlabeled.length / inputs.length < 0.5 ? STATUS.WARN : STATUS.FAIL,
      impact: 'media', effort: 'baixo',
      value: `${unlabeled.length} de ${inputs.length} sem rótulo`,
      detail: 'Campos só com placeholder somem ao digitar e não são lidos por leitores de tela.',
      fix: 'Use <label> visível para cada campo (ou aria-label quando o layout não permitir).',
    }));
  }

  const emptyButtons = $('button, a[href]').filter((_, el) => {
    const $el = $(el);
    return !$el.text().trim() && !$el.attr('aria-label') && !$el.attr('title') && !$el.find('img[alt]:not([alt=""])').length;
  });
  out.push(check(C, 'button-names', {
    title: 'Links e botões com nome acessível',
    status: emptyButtons.length === 0 ? STATUS.OK : emptyButtons.length <= 5 ? STATUS.WARN : STATUS.FAIL,
    impact: 'baixa', effort: 'baixo',
    value: emptyButtons.length,
    detail: emptyButtons.length ? `${emptyButtons.length} link(s)/botão(ões) só com ícone e sem descrição (ex.: ícones de redes sociais).` : 'Todos os links e botões têm texto.',
    fix: 'Adicione aria-label (ex.: aria-label="Instagram da empresa") em botões/links de ícone.',
  }));

  const landmarks = ['header', 'nav', 'main', 'footer'].filter((t) => $(t).length || $(`[role="${t === 'header' ? 'banner' : t === 'footer' ? 'contentinfo' : t === 'nav' ? 'navigation' : 'main'}"]`).length);
  out.push(check(C, 'landmarks', {
    title: 'Estrutura semântica (header, main, footer)',
    status: landmarks.includes('main') ? STATUS.OK : STATUS.WARN,
    impact: 'baixa', effort: 'baixo',
    value: landmarks.join(', ') || 'nenhuma',
    detail: landmarks.includes('main') ? 'A página usa marcações semânticas.' : 'Sem <main>, leitores de tela e o Google têm mais dificuldade de achar o conteúdo principal.',
    fix: 'Envolva o conteúdo principal em <main> e use <header>/<footer>.',
  }));

  return { checks: out, metrics: {}, extra: {} };
}
