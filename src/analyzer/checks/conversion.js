import { check, STATUS } from './common.js';

const C = 'conversao';

const TRACKERS = [
  { name: 'Google Analytics 4', re: /gtag\/js\?id=G-|googletagmanager\.com\/gtag|google-analytics\.com\/(g\/)?collect/i },
  { name: 'Google Tag Manager', re: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/ },
  { name: 'Meta Pixel (Facebook)', re: /connect\.facebook\.net\/[^/]+\/fbevents\.js|fbq\(/ },
  { name: 'Google Ads', re: /gtag\/js\?id=AW-|googleadservices\.com/ },
  { name: 'TikTok Pixel', re: /analytics\.tiktok\.com/ },
  { name: 'Hotjar', re: /static\.hotjar\.com/ },
  { name: 'Microsoft Clarity', re: /clarity\.ms/ },
  { name: 'LinkedIn Insight', re: /snap\.licdn\.com/ },
  { name: 'RD Station', re: /rdstation|d335luupugsy2\.cloudfront\.net/ },
];

export function conversionChecks(ctx) {
  const { $, doc, desktop, mobile } = ctx;
  const out = [];
  const html = doc.html;
  const text = $('body').text().replace(/\s+/g, ' ').toLowerCase();

  // CTAs
  const dCtas = desktop?.ctas || [];
  const mCtas = mobile?.ctas || [];
  const strong = dCtas.filter((c) => c.matchesKeyword || /wa\.me|whatsapp|tel:/i.test(c.href));
  const fallbackCount = $('a, button').filter((_, el) => /(compr|quero|agend|fale|whats|cadastr|inscrev|orçamento|comece|garant|assin|solicit)/i.test($(el).text())).length;
  const ctaCount = desktop ? strong.length : fallbackCount;
  out.push(check(C, 'cta-count', {
    title: 'Chamadas para ação (botões)',
    status: ctaCount >= 3 ? STATUS.OK : ctaCount >= 1 ? STATUS.WARN : STATUS.FAIL,
    impact: 'alta', effort: 'baixo',
    value: ctaCount,
    detail: ctaCount ? `Encontramos ${ctaCount} chamada(s) para ação, ex.: ${[...new Set(strong.map((c) => `“${c.text}”`))].slice(0, 4).join(', ') || '—'}.` : 'Nenhum botão claro de ação (“Quero…”, “Agendar”, “Falar no WhatsApp”).',
    fix: 'Repita o botão principal a cada 1–2 seções, sempre com verbo de ação + benefício (“Quero minha avaliação grátis”).',
  }));

  if (desktop || mobile) {
    const aboveD = strong.some((c) => c.aboveFold);
    const aboveM = mCtas.some((c) => c.aboveFold && (c.matchesKeyword || /wa\.me|whatsapp|tel:/i.test(c.href)));
    out.push(check(C, 'cta-above-fold', {
      title: 'Botão de ação visível sem rolar a página',
      status: aboveD && aboveM ? STATUS.OK : aboveD || aboveM ? STATUS.WARN : STATUS.FAIL,
      impact: 'alta', effort: 'baixo',
      value: `desktop ${aboveD ? '✓' : '✗'} · celular ${aboveM ? '✓' : '✗'}`,
      detail: aboveD && aboveM ? 'O visitante vê a ação principal logo na primeira tela.' : `A primeira tela ${!aboveM ? 'do celular ' : ''}${!aboveD && !aboveM ? 'e do desktop ' : !aboveD ? 'do desktop ' : ''}não mostra um botão de ação.`,
      fix: 'Coloque título + subtítulo + botão na primeira dobra. No celular, reduza o banner para o botão aparecer sem rolar.',
    }));

    const generic = strong.filter((c) => /^(saiba mais|clique aqui|enviar|ver mais|leia mais|submit|send)$/i.test(c.text.trim()));
    if (strong.length && generic.length / strong.length > 0.5) {
      out.push(check(C, 'cta-copy', {
        title: 'Texto dos botões',
        status: STATUS.WARN, impact: 'media', effort: 'baixo',
        value: `${generic.length} genéricos`,
        detail: `Botões com texto genérico (${[...new Set(generic.map((c) => c.text))].join(', ')}) convertem menos.`,
        fix: 'Troque “Enviar/Saiba mais” por algo específico: “Receber orçamento em 24h”, “Quero começar agora”.',
      }));
    }
  }

  // Formulários
  const forms = $('form').filter((_, f) => $(f).find('input:not([type=hidden]):not([type=search]), textarea, select').length > 0);
  if (forms.length) {
    const counts = forms.map((_, f) => $(f).find('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]), textarea, select').length).get();
    const max = Math.max(...counts);
    out.push(check(C, 'form-fields', {
      title: 'Tamanho do formulário',
      status: max <= 4 ? STATUS.OK : max <= 7 ? STATUS.WARN : STATUS.FAIL,
      impact: 'alta', effort: 'baixo',
      value: `${max} campos`,
      detail: `${forms.length} formulário(s); o maior tem ${max} campos. Cada campo extra reduz o preenchimento.`,
      fix: 'Peça só o essencial (nome, WhatsApp/e-mail). Demais informações podem ser coletadas depois, no atendimento.',
    }));
  }

  const whatsapp = $('a[href*="wa.me"], a[href*="whatsapp"], a[href*="api.whatsapp"]').length;
  const phone = $('a[href^="tel:"]').length;
  const email = $('a[href^="mailto:"]').length;
  out.push(check(C, 'contact', {
    title: 'Canais de contato rápidos',
    status: whatsapp || phone || forms.length ? STATUS.OK : email ? STATUS.WARN : STATUS.FAIL,
    impact: 'alta', effort: 'baixo',
    value: [whatsapp && 'WhatsApp', phone && 'telefone', email && 'e-mail', forms.length && 'formulário'].filter(Boolean).join(', ') || 'nenhum',
    detail: whatsapp ? 'Há link direto para WhatsApp.' : 'Não há link direto para WhatsApp — o canal preferido do público brasileiro.',
    fix: whatsapp ? '' : 'Adicione botão de WhatsApp (https://wa.me/55DDDNUMERO?text=mensagem) com mensagem pré-preenchida e um botão flutuante no celular.',
  }));

  const proofRe = /(depoimento|o que (nossos )?clientes|avalia[çc][õo]es|testemunh|clientes satisfeitos|cases? de sucesso|resultados reais|★|estrelas|google reviews|reclame aqui|nota \d|\+ ?\d+[.,]?\d* ?(mil )?(clientes|alunos|pacientes|vendas))/i;
  const hasProof = proofRe.test(text) || $('[class*="testimonial" i], [class*="depoimento" i], [class*="review" i]').length > 0;
  out.push(check(C, 'social-proof', {
    title: 'Prova social (depoimentos, avaliações, números)',
    status: hasProof ? STATUS.OK : STATUS.FAIL,
    impact: 'alta', effort: 'medio',
    value: hasProof ? 'presente' : 'ausente',
    detail: hasProof ? 'A página mostra provas de que outras pessoas confiam no negócio.' : 'Não encontramos depoimentos, avaliações ou números de clientes.',
    fix: 'Inclua depoimentos com foto e nome, avaliações do Google, logos de clientes e números (“+2.000 clientes atendidos”).',
  }));

  const trustRe = /(garantia|satisfa[çc][ãa]o garantida|devolu[çc][ãa]o|reembolso|compra segura|site seguro|cnpj|pol[íi]tica de privacidade|termos de uso|selo|certificad|anos de experi[êe]ncia|desde \d{4})/i;
  const trustHits = (text.match(new RegExp(trustRe.source, 'gi')) || []).map((s) => s.toLowerCase());
  out.push(check(C, 'trust', {
    title: 'Elementos de confiança (garantia, CNPJ, privacidade)',
    status: trustHits.length >= 2 ? STATUS.OK : trustHits.length === 1 ? STATUS.WARN : STATUS.FAIL,
    impact: 'media', effort: 'baixo',
    value: [...new Set(trustHits)].slice(0, 4).join(', ') || 'nenhum',
    detail: trustHits.length ? 'A página apresenta sinais de segurança e credibilidade.' : 'Faltam sinais que reduzam o medo de comprar/contatar.',
    fix: 'Mostre garantia, tempo de mercado, CNPJ/endereço no rodapé, link de política de privacidade (exigido pela LGPD) e selos.',
  }));

  const hasFaq = /(perguntas frequentes|d[úu]vidas frequentes|faq)/i.test(text) || $('details').length >= 3;
  out.push(check(C, 'faq', {
    title: 'Perguntas frequentes (quebra de objeções)',
    status: hasFaq ? STATUS.OK : STATUS.WARN,
    impact: 'media', effort: 'medio',
    value: hasFaq ? 'presente' : 'ausente',
    detail: hasFaq ? 'Há seção de dúvidas frequentes.' : 'Sem seção de dúvidas: objeções ficam sem resposta e o visitante sai para “pensar”.',
    fix: 'Responda as 5–8 perguntas que mais chegam no atendimento (preço, prazo, forma de pagamento, garantia, como funciona).',
  }));

  const hasVideo = $('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="youtu.be"], iframe[data-src*="youtube"]').length > 0;
  out.push(check(C, 'video', {
    title: 'Vídeo de apresentação',
    status: hasVideo ? STATUS.OK : STATUS.INFO,
    impact: 'baixa', effort: 'alto',
    value: hasVideo ? 'sim' : 'não',
    detail: hasVideo ? 'A página tem vídeo.' : 'Não há vídeo. Um vídeo curto (até 90 s) costuma aumentar confiança e tempo na página.',
    fix: hasVideo ? '' : 'Considere um vídeo curto mostrando o produto/serviço ou um depoimento real (carregue sob demanda para não pesar).',
  }));

  const trackers = TRACKERS.filter((t) => t.re.test(html) || (desktop?.requests || []).some((r) => t.re.test(r.url))).map((t) => t.name);
  out.push(check(C, 'tracking', {
    title: 'Mensuração (Analytics, Pixel, Tag Manager)',
    status: trackers.length >= 2 ? STATUS.OK : trackers.length === 1 ? STATUS.WARN : STATUS.FAIL,
    impact: 'alta', effort: 'baixo',
    value: trackers.join(', ') || 'nenhuma',
    detail: trackers.length ? `Ferramentas detectadas: ${trackers.join(', ')}.` : 'Nenhuma ferramenta de mensuração detectada: não é possível saber de onde vêm os clientes nem otimizar anúncios.',
    fix: 'Instale Google Tag Manager + GA4 e, se anuncia, o Pixel da Meta / tag do Google Ads com eventos de conversão (clique no WhatsApp, envio de formulário).',
  }));

  const h1 = $('h1').first().text().trim().replace(/\s+/g, ' ');
  if (h1) {
    const words = h1.split(' ').length;
    out.push(check(C, 'headline', {
      title: 'Clareza da promessa principal (headline)',
      status: words >= 4 && words <= 16 ? STATUS.OK : STATUS.WARN,
      impact: 'alta', effort: 'baixo',
      value: `${words} palavras`,
      detail: `Headline: “${h1.slice(0, 140)}”. ${words < 4 ? 'Muito curta: provavelmente não explica o benefício.' : words > 16 ? 'Longa demais para ser entendida em 3 segundos.' : 'Tamanho adequado.'}`,
      fix: 'Estrutura que funciona: [Resultado desejado] + [para quem/em quanto tempo] + [sem a objeção]. Ex.: “Aprenda inglês em 6 meses, mesmo sem tempo”.',
    }));
  }

  return {
    checks: out,
    metrics: { ctaCount, formFields: forms.length ? Math.max(...forms.map((_, f) => $(f).find('input:not([type=hidden]), textarea, select').length).get()) : null, hasWhatsapp: whatsapp > 0, hasSocialProof: hasProof, trackers: trackers.length },
    extra: { trackers, ctas: dCtas.slice(0, 12) },
  };
}
