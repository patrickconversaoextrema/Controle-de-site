import { check, STATUS } from './common.js';

const C = 'erros';

export function errorChecks(ctx) {
  const { doc, desktop, mobile, links, css } = ctx;
  const out = [];

  out.push(check(C, 'status', {
    title: 'Página responde corretamente',
    status: doc.status < 300 ? STATUS.OK : STATUS.FAIL,
    impact: 'alta', effort: 'baixo',
    value: `HTTP ${doc.status}`,
    detail: doc.status < 300 ? 'O servidor respondeu com sucesso.' : `O servidor respondeu com erro ${doc.status}.`,
    fix: 'Verifique se o endereço está correto e se a página está publicada.',
  }));

  if (desktop?.navError || mobile?.navError) {
    out.push(check(C, 'navigation', {
      title: 'Carregamento no navegador',
      status: STATUS.WARN, impact: 'media',
      value: 'com problemas',
      detail: `O navegador teve dificuldade para carregar a página: ${desktop?.navError || mobile?.navError}.`,
      fix: 'Verifique scripts que mantêm a página carregando indefinidamente ou bloqueios de firewall.',
    }));
  }

  const consoleErrors = [...new Set([...(desktop?.consoleErrors || []), ...(mobile?.consoleErrors || [])])];
  if (desktop || mobile) {
    out.push(check(C, 'console', {
      title: 'Erros de JavaScript no navegador',
      status: consoleErrors.length === 0 ? STATUS.OK : consoleErrors.length <= 3 ? STATUS.WARN : STATUS.FAIL,
      impact: 'media', effort: 'medio',
      value: consoleErrors.length,
      detail: consoleErrors.length ? 'Erros de script podem quebrar formulários, botões, pixels de rastreamento e pop-ups.' : 'Nenhum erro registrado no console.',
      fix: 'Peça ao desenvolvedor para abrir o DevTools (F12 › Console) e corrigir os erros listados; atualize/remova plug-ins com falha.',
      items: consoleErrors.slice(0, 10),
    }));
  }

  const failedReqs = [...(desktop?.requests || []), ...(mobile?.requests || [])].filter((r) => (r.status && r.status >= 400) || (r.failed && !/ERR_BLOCKED_BY_CLIENT|ERR_ABORTED/.test(r.error || '')));
  const failedUnique = [...new Map(failedReqs.map((r) => [r.url, r])).values()];
  if (desktop || mobile) {
    out.push(check(C, 'resources', {
      title: 'Arquivos que falharam ao carregar',
      status: failedUnique.length === 0 ? STATUS.OK : failedUnique.length <= 2 ? STATUS.WARN : STATUS.FAIL,
      impact: 'media', effort: 'baixo',
      value: failedUnique.length,
      detail: failedUnique.length ? 'Imagens, scripts ou estilos que retornam erro (404/500) deixam partes da página quebradas e desperdiçam tempo.' : 'Todos os arquivos carregaram.',
      fix: 'Corrija ou remova as referências aos arquivos listados.',
      items: failedUnique.slice(0, 12).map((r) => `${r.status || r.error} — ${r.url}`),
    }));
  }

  const cssBroken = css.files.filter((f) => !f.ok);
  if (cssBroken.length) {
    out.push(check(C, 'css', {
      title: 'Folhas de estilo indisponíveis',
      status: STATUS.FAIL, impact: 'media', effort: 'baixo',
      value: cssBroken.length,
      detail: 'Arquivos CSS que não carregam podem desconfigurar o layout.',
      items: cssBroken.map((f) => `${f.status || 'erro'} — ${f.url}`),
      fix: 'Corrija o caminho dos arquivos CSS.',
    }));
  }

  if (links?.length) {
    const broken = links.filter((l) => !l.ok && !l.skipped && l.status !== 429 && l.status !== 999);
    out.push(check(C, 'links', {
      title: 'Links quebrados',
      status: broken.length === 0 ? STATUS.OK : broken.length <= 2 ? STATUS.WARN : STATUS.FAIL,
      impact: 'media', effort: 'baixo',
      value: `${broken.length} de ${links.length} verificados`,
      detail: broken.length ? 'Links que levam a páginas de erro frustram o visitante e prejudicam o SEO.' : `Verificamos ${links.length} de ${links.totalFound} links e todos funcionam.`,
      fix: 'Atualize ou remova os links listados.',
      items: broken.slice(0, 12).map((l) => `${l.status || l.error} — ${l.url}`),
    }));
  }

  return { checks: out, metrics: { consoleErrors: desktop || mobile ? consoleErrors.length : null, brokenLinks: links?.length ? links.filter((l) => !l.ok && !l.skipped).length : null, failedResources: desktop || mobile ? failedUnique.length : null }, extra: {} };
}
