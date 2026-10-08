import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCompetitors, excludedReason, siteKey, searchProvider } from '../src/analyzer/competitors.js';

process.env.ALLOW_PRIVATE_URLS = '1';

const serperResponse = {
  organic: [
    { position: 1, link: 'https://www.doctoralia.com.br/dentista/campinas', title: 'Dentistas em Campinas - Doctoralia' },
    { position: 2, link: 'https://sorrisoperfeito.com.br/', title: 'Sorriso Perfeito | Clínica em Campinas' },
    { position: 3, link: 'https://www.instagram.com/clinica.x/', title: 'Clínica X (@clinica.x)' },
    { position: 4, link: 'https://www.meucliente.com.br/clareamento', title: 'Meu Cliente' },
    { position: 5, link: 'https://odontocentro.com.br/blog/2025/03/clareamento-funciona/', title: 'Clareamento funciona? - OdontoCentro' },
    { position: 6, link: 'https://sorrisoperfeito.com.br/contato', title: 'Contato - Sorriso Perfeito' },
    { position: 7, link: 'https://www.box.com.br/', title: 'Box Odonto' },
    { position: 8, link: 'https://campinas.sp.gov.br/saude', title: 'Prefeitura' },
    { position: 9, link: 'https://dentalvida.odo.br/', title: 'Dental Vida' },
  ],
};
const fakeFetch = async (url, opts) => {
  assert.equal(url, 'https://google.serper.dev/search');
  const body = JSON.parse(opts.body);
  assert.equal(body.q, 'clínica odontológica em Campinas');
  assert.equal(body.gl, 'br');
  assert.equal(opts.headers['x-api-key'], 'k');
  return new Response(JSON.stringify(serperResponse), { status: 200 });
};

test('encontra concorrentes reais, ignora diretórios/redes e acha a posição do cliente', async () => {
  const r = await findCompetitors(
    { niche: '  clínica   odontológica em Campinas ', clientUrl: 'https://meucliente.com.br/', max: 3 },
    { fetchFn: fakeFetch, env: { SERPER_API_KEY: 'k' } },
  );
  assert.equal(r.provider, 'serper');
  assert.equal(r.clientPosition, 4);
  assert.deepEqual(r.competitors.map((c) => c.url), ['https://sorrisoperfeito.com.br/', 'https://odontocentro.com.br/', 'https://www.box.com.br/']);
  assert.match(r.competitors[1].note, /artigo/);
  assert.deepEqual(r.competitors.map((c) => c.position), [2, 5, 7]);
  assert.ok(r.skipped.some((s) => s.url.includes('doctoralia')));
  assert.ok(r.skipped.some((s) => s.url.includes('instagram')));
});

test('sem chave de busca dá erro claro', async () => {
  assert.equal(searchProvider({}), null);
  await assert.rejects(findCompetitors({ niche: 'x', clientUrl: 'https://a.com' }, { env: {} }), /SERPER_API_KEY/);
});

test('erro de autenticação da busca vira mensagem útil', async () => {
  const f = async () => new Response('{}', { status: 403 });
  await assert.rejects(findCompetitors({ niche: 'x', clientUrl: 'https://a.com' }, { fetchFn: f, env: { SERPER_API_KEY: 'k' } }), /confira a SERPER_API_KEY/);
});

test('Brave Search como alternativa', async () => {
  const f = async (url, opts) => {
    assert.match(url, /^https:\/\/api\.search\.brave\.com\/res\/v1\/web\/search\?q=pizzaria/);
    assert.equal(opts.headers['x-subscription-token'], 'b');
    return new Response(JSON.stringify({ web: { results: [{ url: 'https://ifood.com.br/x', title: 'iFood' }, { url: 'https://pizzabella.com.br/', title: 'Bella' }] } }), { status: 200 });
  };
  const r = await findCompetitors({ niche: 'pizzaria em Santos', clientUrl: 'https://outra.com' }, { fetchFn: f, env: { BRAVE_API_KEY: 'b' } });
  assert.equal(r.provider, 'brave');
  assert.deepEqual(r.competitors.map((c) => c.url), ['https://pizzabella.com.br/']);
  assert.equal(r.clientPosition, null);
});

test('regras de domínio', () => {
  assert.equal(siteKey('https://www.loja.com.br/x'), 'loja.com.br');
  assert.equal(siteKey('https://blog.loja.com.br/'), 'loja.com.br');
  assert.equal(siteKey('https://app.exemplo.com/'), 'exemplo.com');
  assert.ok(excludedReason('https://maps.google.com/x'));
  assert.ok(excludedReason('https://www.reclameaqui.com.br/empresa'));
  assert.ok(excludedReason('https://sp.gov.br/'));
  assert.equal(excludedReason('https://www.box.com.br/'), null);
  assert.equal(excludedReason('https://googlemente.com.br/'), null);
});
