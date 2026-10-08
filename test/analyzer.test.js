import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startFixtureServer } from './serve-fixtures.js';

process.env.ALLOW_PRIVATE_URLS = '1';
// Os testes de navegador são opcionais: use TEST_BROWSER=1 para incluí-los.
if (process.env.TEST_BROWSER !== '1') process.env.DISABLE_BROWSER = '1';

const { analyzeWithCompetitors } = await import('../src/analyzer/index.js');
const { closeBrowser } = await import('../src/analyzer/browser.js');
const { isAllowedUrl } = await import('../src/utils/url.js');

let server;
let base;
before(async () => {
  server = await startFixtureServer();
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await closeBrowser();
});

const statusOf = (r, id) => r.checks.find((c) => c.id === id)?.status;

test('página boa pontua mais que a ruim e a comparação aponta as diferenças', async () => {
  const { main, competitors, comparison } = await analyzeWithCompetitors(`${base}/ruim`, [`${base}/boa`]);
  const good = competitors[0];
  assert.ok(main.score.overall < good.score.overall, `${main.score.overall} < ${good.score.overall}`);

  assert.equal(statusOf(main, 'seo.h1'), 'fail');
  assert.equal(statusOf(good, 'seo.h1'), 'ok');
  assert.equal(statusOf(main, 'mobile.viewport'), 'fail');
  assert.equal(statusOf(main, 'conversao.form-fields'), 'fail');
  assert.equal(statusOf(good, 'conversao.social-proof'), 'ok');
  assert.equal(statusOf(good, 'conversao.tracking'), 'ok');
  assert.equal(statusOf(main, 'desempenho.render-blocking'), 'warn');

  assert.ok(main.actionPlan.total > 10);
  assert.ok(main.actionPlan.now.length > 0);
  assert.ok(comparison.theyDo.some((t) => t.id === 'conversao.social-proof'));
  assert.equal(comparison.ranking[0].isMain, false);

  // Cada checagem traz o resultado dos concorrentes na mesma verificação.
  const sp = comparison.byCheck['conversao.social-proof'];
  assert.equal(sp.length, 1);
  assert.equal(sp[0].status, 'ok');

  if (process.env.TEST_BROWSER === '1') {
    const contrast = main.checks.find((c) => c.id === 'cores.contrast');
    assert.ok(contrast.evidence?.length, 'contraste deve ter imagem do erro');
    assert.match(contrast.evidence[0].img, /^data:image\/jpeg;base64,/);
    assert.ok(good.checks.find((c) => c.id === 'conversao.form-fields').evidence?.length);
    assert.ok(main.screenshots.mobileFull?.img);
    assert.ok(comparison.gallery.some((g) => g.id === 'cta'));
  }
});

test('concorrente com erro não derruba a análise', async () => {
  const { main, competitors } = await analyzeWithCompetitors(`${base}/boa`, [`${base}/nao-existe.html`]);
  assert.ok(main.score.overall > 0);
  assert.match(competitors[0].error, /404/);
});

test('bloqueia endereços internos quando a proteção está ativa', async () => {
  process.env.ALLOW_PRIVATE_URLS = '0';
  try {
    assert.equal(await isAllowedUrl('http://127.0.0.1/'), false);
    assert.equal(await isAllowedUrl('http://localhost:3000/'), false);
    assert.equal(await isAllowedUrl('http://192.168.0.10/'), false);
    assert.equal(await isAllowedUrl('http://8.8.8.8/'), true);
  } finally {
    process.env.ALLOW_PRIVATE_URLS = '1';
  }
});

test('busca pelo nicho: concorrente que não abre é trocado pelo próximo resultado', async () => {
  const findFn = async ({ niche, clientUrl, max }) => {
    assert.equal(niche, 'clínica odontológica');
    assert.match(clientUrl, /\/ruim$/);
    assert.equal(max, 4);
    return {
      query: niche,
      provider: 'serper',
      clientPosition: 7,
      searchedResults: 20,
      skipped: [],
      competitors: [
        { url: `${base}/nao-existe.html`, title: 'Fora do ar', position: 1 },
        { url: `${base}/boa`, title: 'Boa', position: 2 },
        { url: `${base}/media`, title: 'Média', position: 3 },
      ],
    };
  };
  const r = await analyzeWithCompetitors(`${base}/ruim`, [], () => {}, { niche: 'clínica odontológica', maxCompetitors: 1, findFn });
  assert.equal(r.competitors.length, 1);
  assert.match(r.competitors[0].finalUrl, /\/boa$/);
  assert.equal(r.discovery.failed.length, 1);
  assert.deepEqual(r.discovery.competitors.map((c) => c.position), [2]);
  assert.equal(r.discovery.clientPosition, 7);
});

test('busca pelo nicho sem configuração: relatório sai sem concorrentes e com o aviso', async () => {
  const findFn = async () => { throw new Error('A busca automática de concorrentes não está configurada'); };
  const r = await analyzeWithCompetitors(`${base}/boa`, [], () => {}, { niche: 'x', findFn });
  assert.equal(r.competitors.length, 0);
  assert.match(r.discovery.error, /não está configurada/);
  assert.equal(r.comparison, null);
});
