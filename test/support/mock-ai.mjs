// Só para testes: simula as APIs da Anthropic e da OpenAI (carregado com `node --import`).
// Chaves que terminam em "valida" são aceitas; as demais recebem 401.
const DIAGNOSIS = {
  resumo: 'A página carrega rápido, mas perde clientes por falta de prova social e de um botão claro na primeira tela.',
  pontos_fortes: ['Carregamento rápido no celular'],
  prioridades: [
    { titulo: 'Colocar um botão de WhatsApp na primeira tela', por_que: 'Nenhuma chamada para ação aparece sem rolar.', como_fazer: 'Adicionar botão verde abaixo do título.', impacto: 'alto', area: 'Conversão' },
    { titulo: 'Adicionar depoimentos', por_que: 'Não há prova social.', como_fazer: 'Inserir 3 depoimentos com foto.', impacto: 'alto', area: 'Conversão' },
  ],
  copy: { headlines: ['Sorriso mais branco em uma sessão'], ctas: ['Quero agendar minha avaliação'], meta_title: 'Clareamento em Campinas', meta_description: 'Agende sua avaliação gratuita.' },
  visual: 'Cores demais competindo com o botão.',
  concorrentes: 'Os concorrentes mostram preço e garantia.',
  plano_30_dias: [{ semana: 'Semana 1', acoes: ['Botão de WhatsApp'] }, { semana: 'Semana 2', acoes: ['Depoimentos'] }],
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const real = globalThis.fetch;
globalThis.calls = [];

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const headers = Object.fromEntries(Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  if (u.startsWith('https://api.anthropic.com/')) {
    if (!String(headers['x-api-key'] || '').endsWith('valida')) return json({ error: { message: 'invalid x-api-key' } }, 401);
    if (u.includes('/models')) return json({ data: [{ id: 'claude-haiku-5-5' }, { id: 'claude-sonnet-5-5' }, { id: 'claude-opus-5-5' }] });
    return json({ content: [{ type: 'text', text: JSON.stringify(DIAGNOSIS) }], stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 500 } });
  }
  if (u.startsWith('https://api.openai.com/')) {
    if (!String(headers.authorization || '').endsWith('valida')) return json({ error: { message: 'Incorrect API key' } }, 401);
    if (u.includes('/models')) return json({ data: [{ id: 'gpt-5' }, { id: 'gpt-5-mini' }, { id: 'whisper-1' }, { id: 'text-embedding-3-small' }] });
    return json({ choices: [{ message: { content: JSON.stringify(DIAGNOSIS) }, finish_reason: 'stop' }], usage: {} });
  }
  return real(url, opts);
};
