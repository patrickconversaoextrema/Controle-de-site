// Gera uma demonstração estática (sem servidor) a partir de relatórios salvos.
// Uso: DATA_DIR=./data node scripts/build-demo.mjs <id-do-relatorio> <pasta-de-saida>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../src/store.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [mainId, outDir] = process.argv.slice(2);
if (!mainId || !outDir) throw new Error('Uso: node scripts/build-demo.mjs <id> <saida>');

// Troca os endereços das páginas de exemplo por domínios fictícios
const RENAMES = JSON.parse(process.env.DEMO_RENAMES || '[]');
const rename = (s) => RENAMES.reduce((acc, [from, to]) => acc.split(from).join(to), s);

const store = openStore();
const main = store.get(mainId);
if (!main) throw new Error('Relatório não encontrado');
const hist = store.history(main.pageKey);
const ids = [...new Set([...hist.map((h) => h.id), mainId])];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'img'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'vendor'), { recursive: true });

const reports = {};
for (const id of ids) {
  const rep = store.get(id);
  let json = JSON.stringify(rep.result);
  json = json.replace(new RegExp(`/api/reports/${id}/img/(\\d+)`, 'g'), (_, n) => {
    const img = store.image(id, Number(n));
    const file = `img/${id.slice(0, 8)}-${n}.jpg`;
    if (img && !fs.existsSync(path.join(outDir, file))) fs.writeFileSync(path.join(outDir, file), Buffer.from(img.data));
    return file;
  });
  reports[id] = { id, createdAt: rep.createdAt, author: 'Patrick', shareUrl: null, history: hist, ...JSON.parse(rename(json)) };
}
const list = store.list({ limit: 50 }).filter((r) => reports[r.id]).map((r) => ({ ...JSON.parse(rename(JSON.stringify(r))), author: 'Patrick', createdBy: 'u-admin' }));
store.close();

const users = [
  { id: 'u-admin', name: 'Patrick', email: 'patrick@conversaoextrema.com.br', role: 'admin', disabled: false, createdAt: '2026-10-08T12:00:00Z' },
  { id: 'u-maria', name: 'Maria Souza (exemplo)', email: 'maria@exemplo.com', role: 'member', disabled: false, createdAt: '2026-10-08T12:30:00Z' },
];
const data = { start: '/', reports, list, users };

// Fontes e ícones como arquivos ao lado da página
fs.copyFileSync(path.join(root, 'node_modules/@phosphor-icons/web/src/regular/Phosphor.woff2'), path.join(outDir, 'vendor/Phosphor.woff2'));
const phosphorCss = fs.readFileSync(path.join(root, 'node_modules/@phosphor-icons/web/src/regular/style.css'), 'utf8')
  .replace(/src:[^;]+;/, 'src: url("vendor/Phosphor.woff2") format("woff2");');

let css = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8').replace(/@font-face\s*{[^}]*}/g, '');
css += '\n/* demonstração */\n[data-action="print"] { display: none !important; }\n.demo-ribbon { background: rgb(var(--emerald) / 0.1); color: var(--emerald-deep); font-size: 13px; text-align: center; padding: 8px 16px; border-bottom: 1px solid rgb(var(--emerald) / 0.25); }\n';

const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const bodyInner = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace('<script src="/app.js" type="module"></script>', '')
  .replace('<div class="dot-grid" aria-hidden="true"></div>', '<div class="dot-grid" aria-hidden="true"></div>\n  <div class="demo-ribbon">Demonstração com páginas de exemplo. Entre com o e-mail já preenchido e qualquer senha. As análises novas funcionam só no site hospedado.</div>');

const page = `<title>Raio-X do Site</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap">
<script>
  (function () {
    try {
      var r = document.documentElement, t = r.getAttribute('data-theme') || localStorage.getItem('theme');
      if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) r.classList.add('dark');
    } catch (e) {}
  })();
</script>
<style>
${phosphorCss}
${css}
</style>
${bodyInner}
<script src="demo-data.js"></script>
<script>
${fs.readFileSync(path.join(root, 'scripts/demo/demo-runtime.js'), 'utf8')}
</script>
<script src="app.js" type="module"></script>
<script>
  // Preenche o login da demonstração
  document.getElementById('login-email').value = 'patrick@conversaoextrema.com.br';
  document.getElementById('login-password').value = 'demonstracao';
</script>
`;
fs.writeFileSync(path.join(outDir, 'index.html'), page);
fs.writeFileSync(path.join(outDir, 'demo-data.js'), `window.RX_DEMO = ${JSON.stringify(data)};\n`);
fs.copyFileSync(path.join(root, 'public/app.js'), path.join(outDir, 'app.js'));
console.log(`Demo gerada em ${outDir}: ${ids.length} relatório(s), ${fs.readdirSync(path.join(outDir, 'img')).length} imagens`);
