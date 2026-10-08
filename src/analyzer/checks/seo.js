import { check, STATUS } from './common.js';

const C = 'seo';

export function seoChecks(ctx) {
  const { $, doc, robots, sitemapOk } = ctx;
  const out = [];

  const title = $('head > title').first().text().trim();
  out.push(check(C, 'title', {
    title: 'Título da página (title)',
    status: !title ? STATUS.FAIL : title.length < 25 || title.length > 65 ? STATUS.WARN : STATUS.OK,
    impact: 'alta', effort: 'baixo',
    value: title ? `${title.length} caracteres` : 'ausente',
    detail: title ? `“${title}”` : 'A página não tem título. É o texto azul que aparece no Google.',
    fix: 'Escreva um título de 30 a 60 caracteres com a palavra-chave principal + benefício + marca. Ex.: “Clareamento Dental em SP | Resultado em 1 Sessão – Clínica X”.',
  }));

  const desc = $('meta[name="description" i]').attr('content')?.trim() || '';
  out.push(check(C, 'description', {
    title: 'Meta descrição',
    status: !desc ? STATUS.FAIL : desc.length < 70 || desc.length > 165 ? STATUS.WARN : STATUS.OK,
    impact: 'media', effort: 'baixo',
    value: desc ? `${desc.length} caracteres` : 'ausente',
    detail: desc ? `“${desc.slice(0, 200)}”` : 'Sem meta descrição: o Google escolhe um trecho aleatório da página.',
    fix: 'Escreva de 120 a 160 caracteres resumindo a oferta, com chamada para ação (“Agende sua avaliação gratuita”).',
  }));

  const h1s = $('h1').map((_, el) => $(el).text().trim().replace(/\s+/g, ' ')).get();
  out.push(check(C, 'h1', {
    title: 'Título principal (H1)',
    status: h1s.length === 1 ? STATUS.OK : h1s.length === 0 ? STATUS.FAIL : STATUS.WARN,
    impact: 'alta', effort: 'baixo',
    value: h1s.length,
    detail: h1s.length === 0 ? 'A página não tem H1.' : h1s.length === 1 ? `H1: “${h1s[0].slice(0, 120)}”` : `${h1s.length} H1 encontrados: ${h1s.slice(0, 4).map((t) => `“${t.slice(0, 50)}”`).join(', ')}.`,
    fix: 'Use exatamente um H1 com a promessa principal da página. Os demais títulos devem ser H2/H3.',
  }));

  const levels = $('h1,h2,h3,h4,h5,h6').map((_, el) => Number(el.tagName[1])).get();
  let skips = 0;
  for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) skips++;
  out.push(check(C, 'headings', {
    title: 'Hierarquia de títulos (H1 → H2 → H3)',
    status: levels.length < 3 ? STATUS.WARN : skips > 2 ? STATUS.WARN : STATUS.OK,
    impact: 'baixa', effort: 'baixo',
    value: `${levels.length} títulos`,
    detail: levels.length < 3 ? 'Poucos subtítulos: o conteúdo fica difícil de escanear (para pessoas e para o Google).' : skips ? `${skips} salto(s) de nível (ex.: H2 direto para H4).` : 'Estrutura de títulos organizada.',
    fix: 'Divida a página em seções com H2 claros (benefícios, como funciona, depoimentos, perguntas frequentes).',
  }));

  const canonical = $('link[rel="canonical"]').attr('href');
  out.push(check(C, 'canonical', {
    title: 'URL canônica',
    status: canonical ? STATUS.OK : STATUS.WARN,
    impact: 'baixa', effort: 'baixo',
    value: canonical || 'ausente',
    detail: canonical ? `Canônica: ${canonical}` : 'Sem link canônico; versões com parâmetros (UTM, fbclid) podem dividir a relevância.',
    fix: 'Adicione <link rel="canonical" href="URL-oficial-da-página">.',
  }));

  const robotsMeta = ($('meta[name="robots" i]').attr('content') || '') + ' ' + (doc.headers['x-robots-tag'] || '');
  const noindex = /noindex/i.test(robotsMeta);
  out.push(check(C, 'indexable', {
    title: 'Página pode aparecer no Google',
    status: noindex ? STATUS.FAIL : doc.status >= 400 ? STATUS.FAIL : STATUS.OK,
    impact: 'alta', effort: 'baixo',
    value: noindex ? 'noindex' : 'indexável',
    detail: noindex ? 'A página está marcada com “noindex” e NÃO aparece no Google.' : 'A página não bloqueia indexação.',
    fix: 'Se a página deve ser encontrada no Google, remova o noindex (no WordPress: Configurações › Leitura e no plugin de SEO).',
  }));

  const lang = $('html').attr('lang');
  out.push(check(C, 'lang', {
    title: 'Idioma declarado',
    status: lang ? STATUS.OK : STATUS.WARN,
    impact: 'baixa', effort: 'baixo',
    value: lang || 'ausente',
    detail: lang ? `Idioma: ${lang}` : 'O idioma não está declarado no <html>.',
    fix: 'Use <html lang="pt-BR">.',
  }));

  const og = ['og:title', 'og:description', 'og:image'].filter((p) => $(`meta[property="${p}"]`).attr('content'));
  out.push(check(C, 'open-graph', {
    title: 'Prévia ao compartilhar (WhatsApp, Facebook, LinkedIn)',
    status: og.length === 3 ? STATUS.OK : og.length ? STATUS.WARN : STATUS.FAIL,
    impact: 'media', effort: 'baixo',
    value: `${og.length}/3 tags`,
    detail: og.length === 3 ? 'Título, descrição e imagem de compartilhamento configurados.' : `Faltam: ${['og:title', 'og:description', 'og:image'].filter((p) => !og.includes(p)).join(', ')}. Links enviados no WhatsApp ficam sem imagem/título atrativo.`,
    fix: 'Configure og:title, og:description e og:image (1200×630 px) — plugins como Yoast/RankMath fazem isso.',
  }));

  const ld = $('script[type="application/ld+json"]').map((_, el) => $(el).html()).get();
  const types = [];
  for (const raw of ld) {
    try {
      const j = JSON.parse(raw);
      const walk = (o) => {
        if (Array.isArray(o)) return o.forEach(walk);
        if (o && typeof o === 'object') {
          if (o['@type']) types.push([].concat(o['@type']).join('/'));
          if (o['@graph']) walk(o['@graph']);
        }
      };
      walk(j);
    } catch {}
  }
  out.push(check(C, 'structured-data', {
    title: 'Dados estruturados (schema.org)',
    status: types.length ? STATUS.OK : STATUS.WARN,
    impact: 'baixa', effort: 'medio',
    value: types.length ? [...new Set(types)].slice(0, 5).join(', ') : 'nenhum',
    detail: types.length ? 'A página informa ao Google o tipo de negócio/conteúdo.' : 'Sem dados estruturados: perde chances de estrelas, FAQ e informações do negócio nos resultados.',
    fix: 'Adicione schema LocalBusiness/Organization, Product ou FAQPage em JSON-LD.',
  }));

  const text = $('body').clone().find('script,style,noscript,svg').remove().end().text().replace(/\s+/g, ' ').trim();
  const words = text ? text.split(' ').length : 0;
  out.push(check(C, 'content-length', {
    title: 'Quantidade de texto',
    status: words >= 400 ? STATUS.OK : words >= 200 ? STATUS.WARN : STATUS.FAIL,
    impact: 'media', effort: 'medio',
    value: `${words} palavras`,
    detail: words < 200 ? 'Pouco texto: o Google tem dificuldade de entender sobre o que é a página e o visitante tem poucos argumentos para decidir.' : `${words} palavras de conteúdo.`,
    fix: 'Inclua seções com benefícios, como funciona, perguntas frequentes e provas — com as palavras que o cliente usa para buscar.',
  }));

  out.push(check(C, 'robots-sitemap', {
    title: 'robots.txt e sitemap.xml',
    status: robots.ok && sitemapOk ? STATUS.OK : STATUS.WARN,
    impact: 'baixa', effort: 'baixo',
    value: `robots ${robots.ok ? '✓' : '✗'} · sitemap ${sitemapOk ? '✓' : '✗'}`,
    detail: `${robots.ok ? 'robots.txt encontrado' : 'robots.txt não encontrado'}; ${sitemapOk ? 'sitemap encontrado' : 'sitemap.xml não encontrado'}.`,
    fix: 'Publique robots.txt e sitemap.xml e envie o sitemap no Google Search Console.',
  }));

  const favicon = $('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').length > 0;
  out.push(check(C, 'favicon', {
    title: 'Ícone do site (favicon)',
    status: favicon ? STATUS.OK : STATUS.WARN,
    impact: 'baixa', effort: 'baixo',
    value: favicon ? 'presente' : 'ausente',
    detail: favicon ? 'Favicon configurado.' : 'Sem favicon declarado: aba do navegador e resultado mobile do Google ficam sem a marca.',
    fix: 'Adicione um favicon (48×48 ou maior) e apple-touch-icon (180×180).',
  }));

  return {
    checks: out,
    metrics: { titleLength: title.length, descriptionLength: desc.length, h1Count: h1s.length, words, hasStructuredData: types.length > 0 },
    extra: { title, description: desc, h1: h1s[0] || null, headings: $('h1,h2,h3').slice(0, 30).map((_, el) => ({ level: el.tagName.toLowerCase(), text: $(el).text().trim().replace(/\s+/g, ' ').slice(0, 100) })).get() },
  };
}
