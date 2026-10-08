import { check, STATUS } from './common.js';

const C = 'seguranca';

export function securityChecks(ctx) {
  const { doc, $, desktop } = ctx;
  const out = [];
  const h = doc.headers;
  const https = doc.finalUrl.startsWith('https://');

  out.push(check(C, 'https', {
    title: 'Conexão segura (HTTPS)',
    status: https ? STATUS.OK : STATUS.FAIL,
    impact: 'alta', effort: 'baixo',
    value: https ? 'HTTPS' : 'HTTP',
    detail: https ? 'O site usa HTTPS (cadeado).' : 'O site não usa HTTPS: navegadores exibem “Não seguro” e o Google penaliza.',
    fix: 'Instale um certificado SSL (gratuito com Let’s Encrypt/Cloudflare) e redirecione todo HTTP para HTTPS.',
  }));

  if (https) {
    const mixed = (desktop?.requests || []).filter((r) => r.url.startsWith('http://')).map((r) => r.url);
    const mixedHtml = $('img[src^="http://"], script[src^="http://"], link[href^="http://"][rel="stylesheet"], iframe[src^="http://"]').map((_, el) => $(el).attr('src') || $(el).attr('href')).get();
    const all = [...new Set([...mixed, ...mixedHtml])];
    out.push(check(C, 'mixed', {
      title: 'Conteúdo misto (HTTP dentro de HTTPS)',
      status: all.length ? STATUS.FAIL : STATUS.OK,
      impact: 'media', effort: 'baixo',
      value: all.length,
      detail: all.length ? 'Arquivos carregados por HTTP podem ser bloqueados e quebram o cadeado.' : 'Nenhum recurso inseguro.',
      fix: 'Troque os endereços http:// por https:// (no WordPress, o plugin Better Search Replace ajuda).',
      items: all.slice(0, 10),
    }));
  }

  const headers = [
    ['strict-transport-security', 'HSTS'],
    ['content-security-policy', 'Content-Security-Policy'],
    ['x-content-type-options', 'X-Content-Type-Options'],
    ['referrer-policy', 'Referrer-Policy'],
  ];
  const frameOk = h['x-frame-options'] || /frame-ancestors/i.test(h['content-security-policy'] || '');
  const present = headers.filter(([k]) => h[k]).map(([, n]) => n);
  if (frameOk) present.push('Proteção contra iframe');
  const missing = [...headers.filter(([k]) => !h[k]).map(([, n]) => n), ...(frameOk ? [] : ['X-Frame-Options'])];
  out.push(check(C, 'headers', {
    title: 'Cabeçalhos de segurança',
    status: missing.length <= 1 ? STATUS.OK : missing.length <= 3 ? STATUS.WARN : STATUS.FAIL,
    impact: 'baixa', effort: 'baixo',
    value: `${present.length}/5`,
    detail: missing.length ? `Ausentes: ${missing.join(', ')}.` : 'Principais cabeçalhos de segurança configurados.',
    fix: 'Configure no servidor/CDN (Cloudflare, .htaccess ou plugin de segurança): HSTS, X-Content-Type-Options: nosniff, X-Frame-Options: SAMEORIGIN e Referrer-Policy.',
  }));

  const server = [h.server, h['x-powered-by']].filter((v) => v && /\d/.test(v));
  if (server.length) {
    out.push(check(C, 'version-leak', {
      title: 'Versão do servidor exposta',
      status: STATUS.WARN, impact: 'baixa', effort: 'baixo',
      value: server.join(' · '),
      detail: 'Expor versões de software facilita ataques automatizados a falhas conhecidas.',
      fix: 'Oculte as versões (ServerTokens Prod no Apache, server_tokens off no Nginx, expose_php = Off).',
    }));
  }

  const gen = $('meta[name="generator"]').attr('content');
  if (gen && /wordpress\s*\d/i.test(gen)) {
    out.push(check(C, 'generator', {
      title: 'Versão do WordPress exposta',
      status: STATUS.WARN, impact: 'baixa', effort: 'baixo',
      value: gen,
      detail: 'A versão do CMS está visível no código.',
      fix: 'Mantenha o WordPress atualizado e oculte a meta generator (plugins de segurança fazem isso).',
    }));
  }

  return { checks: out, metrics: { https }, extra: { platform: detectPlatform(doc.html, gen) } };
}

function detectPlatform(html, gen) {
  if (/wp-content|wp-includes/.test(html)) return 'WordPress' + (/elementor/i.test(html) ? ' + Elementor' : '');
  if (/cdn\.shopify\.com/.test(html)) return 'Shopify';
  if (/static\.wixstatic\.com|wix\.com/.test(html)) return 'Wix';
  if (/nuvemshop|lojanuvem/.test(html)) return 'Nuvemshop';
  if (/vtex/i.test(html)) return 'VTEX';
  if (/webflow/i.test(html)) return 'Webflow';
  if (/rdstation|rd-station/i.test(html) && /landing/i.test(html)) return 'RD Station (landing page)';
  if (/leadpages/i.test(html)) return 'Leadpages';
  if (/_next\/static/.test(html)) return 'Next.js';
  if (/squarespace/i.test(html)) return 'Squarespace';
  if (/hotmart/i.test(html)) return 'Hotmart';
  if (gen) return gen;
  return null;
}
