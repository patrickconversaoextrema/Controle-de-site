const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const dec = (n, d = 1) => n.toFixed(d).replace('.', ',');
const dateBR = (iso, withTime = false) => {
  const d = new Date(iso);
  return withTime
    ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const STATUS = {
  ok: { label: 'Bom', icon: 'check' },
  warn: { label: 'Atenção', icon: 'warning' },
  fail: { label: 'Corrigir', icon: 'x' },
  info: { label: 'Info', icon: 'info' },
};
const statusBadge = (s) => `<span class="badge st-${s}"><i class="ph ph-${STATUS[s].icon}"></i>${STATUS[s].label}</span>`;
const IMPACT_LABEL = { alta: 'Impacto alto', media: 'Impacto médio', baixa: 'Impacto baixo' };
const EFFORT_LABEL = { baixo: 'Esforço baixo', medio: 'Esforço médio', alto: 'Esforço alto' };
const CAT_ICON = {
  desempenho: 'lightning', conversao: 'target', seo: 'magnifying-glass', mobile: 'device-mobile', imagens: 'image',
  erros: 'bug', tipografia: 'text-aa', cores: 'palette', acessibilidade: 'wheelchair', seguranca: 'lock',
};
// Paleta categórica de 3 matizes em ordem fixa; a 4ª série usa codificação composta (neutro + hachura) — §3.4
const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'url(#hatch)'];
const SERIES_SWATCH = (i) => (i < 3 ? `<i style="background:${SERIES[i]}"></i>` : '<i class="swatch-hatch"></i>');
const SYSTEM_FONTS = /^(arial|helvetica|times new roman|times|georgia|verdana|tahoma|trebuchet ms|segoe ui|system-ui|-apple-system|blinkmacsystemfont|sans-serif|serif|monospace|courier new|courier|impact|comic sans ms|cursive)$/i;

const level = (s) => (s == null ? 'none' : s >= 70 ? 'good' : s >= 50 ? 'warning' : 'critical');
const levelBadge = (s) => {
  if (s == null) return '<span class="badge badge-neutral">Sem dados</span>';
  if (s >= 85) return '<span class="badge badge-success"><i class="ph ph-check"></i>Excelente</span>';
  if (s >= 70) return '<span class="badge badge-success"><i class="ph ph-check"></i>Bom</span>';
  if (s >= 50) return '<span class="badge badge-warning"><i class="ph ph-warning"></i>Regular</span>';
  return '<span class="badge badge-danger"><i class="ph ph-x"></i>Crítico</span>';
};

/** Delta: a seta vem do sinal, a cor vem de sinal × higherIsBetter (§6.1 MetricCard). */
function deltaHtml(delta, higherIsBetter = true) {
  if (delta == null) return '';
  if (delta === 0) return '<span class="delta flat">= 0</span>';
  const good = delta > 0 === higherIsBetter;
  return `<span class="delta ${good ? 'good' : 'bad'}"><i class="ph ph-arrow-${delta > 0 ? 'up' : 'down'}-right"></i>${delta > 0 ? '+' : '−'}${Math.abs(delta)}</span>`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- Tema (§5) ----------
const themeBtn = $('#theme-toggle');
function syncThemeIcon() {
  const dark = document.documentElement.classList.contains('dark');
  themeBtn.innerHTML = `<i class="ph ph-${dark ? 'sun' : 'moon'}"></i>`;
  themeBtn.setAttribute('aria-label', dark ? 'Usar tema claro' : 'Usar tema escuro');
}
themeBtn.addEventListener('click', () => {
  const dark = document.documentElement.classList.toggle('dark');
  try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch {}
  syncThemeIcon();
});
syncThemeIcon();

// Luz que segue o cursor nos cards premium (useSpotlight)
document.addEventListener('pointermove', (e) => {
  const card = e.target.closest?.('.premium-card, .card-glow');
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty('--spot-x', `${e.clientX - r.left}px`);
  card.style.setProperty('--spot-y', `${e.clientY - r.top}px`);
});

// ---------- Rotas ----------
function route() {
  const m = location.pathname.match(/^\/r\/([0-9a-f-]{36})$/);
  if (m) return loadReport(m[1]);
  showStart();
  if (location.hash === '#historico') $('#historico').scrollIntoView();
}
window.addEventListener('popstate', route);
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-nav]');
  if (!a) return;
  e.preventDefault();
  history.pushState({}, '', a.getAttribute('href'));
  route();
  if (a.dataset.nav === 'history') $('#historico').scrollIntoView({ behavior: 'smooth' });
  else window.scrollTo({ top: 0 });
});

function showStart() {
  $('#start').hidden = false;
  $('#progress').hidden = true;
  $('#report').hidden = true;
  document.title = 'Raio-X do Site';
  loadHistory();
}

// ---------- Histórico ----------
let historyTimer;
$('#history-q').addEventListener('input', () => {
  clearTimeout(historyTimer);
  historyTimer = setTimeout(loadHistory, 250);
});

async function loadHistory() {
  const box = $('#history-list');
  try {
    const q = $('#history-q').value.trim();
    const res = await fetch(`/api/reports?limit=30&q=${encodeURIComponent(q)}`);
    const rows = await res.json();
    if (!rows.length) {
      box.innerHTML = `<div class="empty">${q ? 'Nenhuma análise encontrada para esse filtro.' : 'Nenhuma análise salva ainda. Faça a primeira acima.'}</div>`;
      return;
    }
    box.innerHTML = `<table class="ds-table">
      <thead><tr><th>Página</th><th class="num">Nota</th><th>Concorrentes</th><th>Data</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr>
            <td class="url" title="${esc(r.url)}"><a href="/r/${r.id}" data-nav="report">${esc(host(r.url))}${esc(pathOf(r.url))}</a></td>
            <td class="num">${r.overall ?? '<span class="dash">—</span>'}</td>
            <td>${r.competitors.length ? r.competitors.map((c) => `<span class="badge badge-neutral" title="${esc(c.url)}">${esc(host(c.url))}${c.overall != null ? ` · ${c.overall}` : ''}</span>`).join(' ') : '<span class="dash">—</span>'}</td>
            <td style="white-space:nowrap">${dateBR(r.createdAt, true)}</td>
            <td class="num"><button class="btn btn-danger-ghost btn-sm btn-icon" data-delete="${r.id}" aria-label="Excluir análise de ${esc(host(r.url))}"><i class="ph ph-trash"></i></button></td>
          </tr>`,
        )
        .join('')}</tbody></table>`;
  } catch {
    box.innerHTML = '<div class="empty">Não foi possível carregar o histórico.</div>';
  }
}
const pathOf = (u) => { try { const p = new URL(u).pathname; return p === '/' ? '' : p; } catch { return ''; } };

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-delete]');
  if (!b) return;
  if (!confirm('Excluir esta análise? O link dela deixará de funcionar.')) return;
  const res = await fetch(`/api/reports/${b.dataset.delete}`, { method: 'DELETE' });
  if (res.ok) {
    toast('Análise excluída');
    loadHistory();
  }
});

// ---------- Nova análise ----------
const form = $('#form');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#form-error');
  err.hidden = true;
  const url = form.url.value.trim();
  if (!url) {
    err.textContent = 'Informe o endereço do site.';
    err.hidden = false;
    return;
  }
  const competitors = ['c1', 'c2', 'c3'].map((n) => form[n].value.trim()).filter(Boolean);
  try {
    const res = await fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, competitors }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Não foi possível iniciar a análise.');
    showProgress(1 + competitors.length);
    poll(data.id);
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

function showProgress(total) {
  $('#start').hidden = true;
  $('#report').hidden = true;
  $('#progress').hidden = false;
  $('#progress-step').textContent = total > 1 ? `Analisando seu site e ${total - 1} concorrente(s)` : 'Analisando seu site';
  $('#progress-bar').style.width = '5%';
  window.scrollTo({ top: 0 });
}

async function poll(id) {
  let tick = 0;
  while (true) {
    await new Promise((r) => setTimeout(r, 1500));
    tick++;
    let job;
    try {
      const res = await fetch(`/api/jobs/${id}`);
      job = await res.json();
      if (!res.ok) throw new Error(job.error);
    } catch (ex) {
      return fail(ex.message || 'Falha de conexão.');
    }
    if (job.status === 'queued') {
      $('#progress-step').textContent = `Na fila (posição ${job.position})…`;
    } else if (job.status === 'running' && job.progress) {
      const p = job.progress;
      $('#progress-step').textContent = `${host(p.site)} — ${p.step}`;
      const pct = Math.min(95, ((p.done + 0.5) / p.total) * 100);
      $('#progress-bar').style.width = `${Math.max(pct, Math.min(90, tick * 2))}%`;
    } else if (job.status === 'done') {
      $('#progress-bar').style.width = '100%';
      history.pushState({}, '', `/r/${job.reportId}`);
      return loadReport(job.reportId);
    } else if (job.status === 'error') {
      return fail(job.error);
    }
  }
}

function fail(msg) {
  showStart();
  const err = $('#form-error');
  err.textContent = msg;
  err.hidden = false;
}

async function loadReport(id) {
  $('#start').hidden = true;
  $('#progress').hidden = true;
  const el = $('#report');
  el.hidden = false;
  el.innerHTML = '<div class="card"><div class="empty">Carregando relatório…</div></div>';
  try {
    const res = await fetch(`/api/reports/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    renderReport(data);
  } catch (ex) {
    el.innerHTML = `<div class="card"><div class="empty">${esc(ex.message || 'Relatório não encontrado.')}<br><br><a class="btn btn-secondary btn-sm" href="/" data-nav="home">Fazer uma nova análise</a></div></div>`;
  }
}

// ---------- Relatório ----------
let CATS = [];
let COMPARE = null;
const catLabel = (id) => CATS.find((c) => c.id === id)?.label || id;

function renderReport(data) {
  const { main, comparison, categories } = data;
  CATS = categories;
  COMPARE = comparison;
  document.title = `Raio-X · ${host(main.finalUrl)}`;
  const hist = data.history || [];
  const idx = hist.findIndex((h) => h.id === data.id);
  const previous = idx > 0 ? hist[idx - 1] : null;

  const el = $('#report');
  el.innerHTML = [
    headSection(main, data, previous),
    categorySection(main, categories, previous),
    hist.length > 1 ? evolutionSection(hist, data.id) : '',
    comparison ? comparisonSection(comparison, data.competitors) : '',
    planSection(main),
    identitySection(main),
    detailSection(main, categories),
  ].join('');
  wire(el, comparison, hist, data.id);
  loadFontPreviews(main);
  window.scrollTo({ top: 0 });
}

function gauge(score) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const v = score ?? 0;
  return `<div class="gauge lvl-${level(score)}" role="img" aria-label="Nota geral ${v} de 100">
    <svg width="128" height="128" viewBox="0 0 128 128"><circle cx="64" cy="64" r="${r}" fill="none" stroke="rgb(var(--c-hairline))" stroke-width="10"/>
    <circle cx="64" cy="64" r="${r}" fill="none" stroke="var(--lvl)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(c * v) / 100} ${c}"/></svg>
    <div class="gauge-value"><div><b>${score ?? '–'}</b><span>de 100</span></div></div></div>`;
}

function headSection(r, data, previous) {
  const s = r.summary;
  const notices = [];
  if (!r.browser) notices.push('A análise com navegador real não estava disponível; métricas de velocidade, fontes e cores ficaram limitadas.');
  if (!r.pagespeed) notices.push('Configure uma chave do Google PageSpeed (PAGESPEED_API_KEY) para incluir a nota oficial do Google e dados de usuários reais.');
  const delta = previous && r.score.overall != null && previous.overall != null ? r.score.overall - previous.overall : null;
  return `<section class="card">
    <div class="report-head">
      <div>
        <span class="eyebrow">Raio-X da página</span>
        <div class="report-url"><i class="ph ph-globe"></i>${esc(r.finalUrl)}</div>
        <h1 style="margin:0">${esc(host(r.finalUrl))}</h1>
        <div class="caption" style="margin-top:4px">Analisado em ${dateBR(data.createdAt, true)}</div>
        <div class="score-row">
          ${gauge(r.score.overall)}
          <div class="score-meta">
            <div>${levelBadge(r.score.overall)}</div>
            ${delta != null ? `<div>${deltaHtml(delta)} <span class="delta-base">vs. análise de ${dateBR(previous.createdAt)}</span></div>` : ''}
            <div class="chips">
              <span class="badge st-fail">${s.fails} para corrigir</span>
              <span class="badge st-warn">${s.warns} de atenção</span>
              <span class="badge st-ok">${r.checks.filter((c) => c.status === 'ok').length} ok</span>
            </div>
          </div>
        </div>
        <ul class="summary-list">${s.text.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <div class="actions">
          <button class="btn btn-sm shiny-cta" data-action="share"><span class="shiny-dots" aria-hidden="true"></span><span class="shiny-cta-content"><i class="ph ph-link"></i>Copiar link do relatório</span></button>
          <button class="btn btn-sm btn-secondary" data-action="print"><i class="ph ph-file-pdf"></i>Salvar em PDF</button>
          <a class="btn btn-sm btn-ghost" href="/" data-nav="home"><i class="ph ph-plus"></i>Nova análise</a>
        </div>
        ${notices.map((n) => `<div class="notice no-print"><i class="ph ph-info"></i><span>${esc(n)}</span></div>`).join('')}
      </div>
      <div class="shots">
        ${r.screenshots.desktop ? `<figure class="shot shot-desktop"><img src="${esc(r.screenshots.desktop)}" alt="Primeira tela no desktop"><figcaption>Desktop</figcaption></figure>` : ''}
        ${r.screenshots.mobile ? `<figure class="shot shot-mobile"><img src="${esc(r.screenshots.mobile)}" alt="Primeira tela no celular"><figcaption>Celular</figcaption></figure>` : ''}
      </div>
    </div>
  </section>`;
}

function categorySection(r, categories, previous) {
  const cards = categories
    .filter((c) => r.score.categories[c.id] != null)
    .map((c) => {
      const v = r.score.categories[c.id];
      const prev = previous?.categories?.[c.id];
      const d = prev != null && v !== prev ? v - prev : null;
      return `<button class="cat-card" data-goto="${c.id}" aria-label="${esc(c.label)}: ${v} de 100">
        <span class="cat-name"><i class="ph ph-${CAT_ICON[c.id]}"></i>${esc(c.label)}</span>
        <div class="cat-score"><b>${v}</b>${deltaHtml(d)}</div>
        <div class="meter lvl-${level(v)}"><i style="width:${v}%"></i></div>
        <div class="cat-foot">${levelBadge(v)}</div>
      </button>`;
    })
    .join('');
  return `<section class="card">
    <div class="card-title"><h2>Panorama por área</h2><span class="caption">${previous ? `Variação vs. análise de ${dateBR(previous.createdAt)} · ` : ''}Clique para ver os detalhes</span></div>
    <div class="cat-grid">${cards}</div>
  </section>`;
}

function evolutionSection(hist, currentId) {
  const cur = hist.find((h) => h.id === currentId);
  const first = hist[0];
  const d = cur && first && cur.overall != null && first.overall != null ? cur.overall - first.overall : null;
  return `<section class="card">
    <div class="card-title"><h2>Evolução da nota</h2><span class="caption">${hist.length} análises desta página</span></div>
    <div class="evo">
      <div class="chart" id="evo-chart"></div>
      <div class="evo-stat">
        <span class="caption">Desde a primeira análise (${dateBR(first.createdAt)})</span>
        <b>${first.overall ?? '—'} → ${cur?.overall ?? '—'}</b>
        ${deltaHtml(d)}
        <p class="caption" style="margin-top:12px">Clique em uma coluna para abrir aquela análise.</p>
      </div>
    </div>
  </section>`;
}

function comparisonSection(cmp, competitors) {
  const failed = competitors.filter((c) => c.error);
  const legend = cmp.sites.map((s, i) => `<span>${SERIES_SWATCH(i)}${esc(s.name)}${s.isMain ? ' (você)' : ''}</span>`).join('');
  const ranking = cmp.ranking.map((r) => `<div class="rank ${r.isMain ? 'me' : ''}"><span class="caption">${r.position}º lugar</span><br><b>${r.overall ?? '–'}</b><small>${esc(r.name)}${r.isMain ? ' · você' : ''}</small></div>`).join('');

  const head = `<tr><th>Métrica</th>${cmp.sites.map((s) => `<th class="num">${esc(s.name)}${s.isMain ? ' (você)' : ''}</th>`).join('')}</tr>`;
  const metricRows = cmp.metricTable
    .map((m) => `<tr><td>${esc(m.label)}</td>${m.values.map((v, i) => `<td class="num ${i === m.bestIndex ? 'best' : ''}">${v == null ? '<span class="dash">—</span>' : fmt(v, m.fmt)}${i === m.bestIndex ? ' <i class="ph ph-star" aria-label="melhor"></i>' : ''}</td>`).join('')}</tr>`)
    .join('');
  const catRows = cmp.categoryTable
    .map((row) => {
      const best = Math.max(...row.values.filter((v) => v != null));
      return `<tr><td>${esc(row.label)}</td>${row.values.map((v) => `<td class="num ${v === best ? 'best' : ''}">${v ?? '<span class="dash">—</span>'}</td>`).join('')}</tr>`;
    })
    .join('');

  const insights = cmp.insights.length ? cmp.insights.map((i) => `<li>${esc(i.text)}</li>`).join('') : '<li>Nenhuma métrica em que você esteja muito atrás.</li>';
  const theyDo = cmp.theyDo.length
    ? cmp.theyDo.map((t) => `<li><b>${esc(t.title)}</b><span class="caption">Feito por: ${esc(t.competitors.join(', '))}</span><br>${esc(t.fix)}</li>`).join('')
    : '<li>Seus concorrentes não fazem nada de importante que você não faça.</li>';
  const adv = cmp.advantages.length ? `<h3 class="sub-title">Onde você está à frente</h3><ul class="insight-list">${cmp.advantages.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : '';

  return `<section class="card" id="comparacao">
    <div class="card-title"><h2>Comparação com concorrentes</h2></div>
    ${failed.map((f) => `<div class="error-box"><i class="ph ph-warning"></i>Não foi possível analisar ${esc(host(f.url))}: ${esc(f.error)}</div>`).join('')}
    <div class="ranking">${ranking}</div>
    <h3>Notas por área</h3>
    <div class="legend">${legend}</div>
    <div class="chart" id="cmp-chart"></div>
    <details style="margin-top:10px"><summary class="caption" style="cursor:pointer">Ver como tabela</summary><div class="table-wrap" style="margin-top:8px"><table class="ds-table"><thead>${head}</thead><tbody>${catRows}</tbody></table></div></details>
    <div class="cmp-grid">
      <div><h3>Onde você perde para a concorrência</h3><ul class="insight-list">${insights}</ul></div>
      <div><h3>O que os concorrentes fazem e você não</h3><ul class="insight-list">${theyDo}</ul></div>
    </div>
    ${adv}
    <h3 class="sub-title">Números lado a lado</h3>
    <div class="table-wrap"><table class="ds-table"><thead>${head}</thead><tbody>${metricRows}</tbody></table></div>
    ${galleryHtml(cmp)}
  </section>`;
}

function galleryHtml(cmp) {
  if (!cmp.gallery?.length) return '';
  const tabs = cmp.gallery.map((g, i) => `<button class="tab" role="tab" aria-selected="${i === 0}" data-gtab="${g.id}">${esc(g.label)}</button>`).join('');
  const panels = cmp.gallery
    .map((g, i) => `<div class="gallery-panel" data-gpanel="${g.id}" ${i === 0 ? '' : 'hidden'}>
      <h4 class="print-only">${esc(g.label)}</h4>
      <div class="gallery ${g.id === 'mobileFull' ? 'gallery-full' : ''} ${g.id === 'mobile' ? 'gallery-narrow' : ''}" style="--cols:${cmp.sites.length}">
        ${g.items
          .map((it, si) => `<figure class="${cmp.sites[si].isMain ? 'me' : ''}">
            <figcaption>${SERIES_SWATCH(si)}${esc(cmp.sites[si].name)}${cmp.sites[si].isMain ? ' (você)' : ''}</figcaption>
            ${it ? `<div class="gallery-img"><button class="ev-open" data-full="${esc(it.img)}" data-caption="${esc(cmp.sites[si].name + ' — ' + g.label)}"><img src="${esc(it.img)}" alt="${esc(g.label)} de ${esc(cmp.sites[si].name)}" loading="lazy"></button></div>${it.caption ? `<p class="caption">${esc(it.caption)}</p>` : ''}${it.truncated ? '<p class="caption">(página cortada no limite de altura)</p>' : ''}` : '<div class="gallery-empty">Não encontrado</div>'}
          </figure>`)
          .join('')}
      </div>
    </div>`)
    .join('');
  return `<h3 class="sub-title">Comparação visual lado a lado</h3>
    <p class="caption" style="margin:-4px 0 12px">Clique em uma imagem para ampliar.</p>
    <div class="tabs" role="tablist">${tabs}</div>${panels}`;
}

function planCompetitors(id) {
  const rows = COMPARE?.byCheck?.[id]?.filter((r) => r.status === 'ok');
  if (!rows?.length) return '';
  return `<p class="vs-note"><i class="ph ph-flag-checkered"></i><span>Já fazem bem: ${rows.map((r) => `<b>${esc(r.name)}</b>${r.value != null && r.value !== '' ? ` (${esc(r.value)})` : ''}`).join(', ')}</span></p>`;
}

function planSection(r) {
  const p = r.actionPlan;
  const group = (title, icon, items, note) =>
    items.length
      ? `<div><div class="plan-group-head"><div class="icon-seal"><i class="ph ph-${icon}"></i></div><div><h3>${title} <span class="badge badge-neutral">${items.length}</span></h3><span class="caption">${note}</span></div></div>
        <div class="plan-items">${items
          .map(
            (i) => `<div class="plan-item">
              <h4>${esc(i.title)}</h4>
              <p>${esc(i.problem)}</p>
              <p class="how"><b>O que fazer:</b> ${esc(i.fix)}</p>
              ${evidenceHtml(r.checks.find((c) => c.id === i.id)?.evidence, 2)}
              ${planCompetitors(i.id)}
              <div class="tags">${statusBadge(i.status)}<span class="badge badge-neutral">${IMPACT_LABEL[i.impact]}</span><span class="badge badge-neutral">${EFFORT_LABEL[i.effort]}</span><span class="badge badge-neutral"><i class="ph ph-${CAT_ICON[i.category]}"></i>${esc(catLabel(i.category))}</span></div>
            </div>`,
          )
          .join('')}</div></div>`
      : '';
  return `<section class="card" id="plano">
    <div class="card-title"><h2>Plano de ação: o que mudar</h2><span class="caption">${p.total} melhoria(s), em ordem de prioridade</span></div>
    <div class="plan">
      ${group('Faça agora', 'rocket-launch', p.now, 'Alto impacto e fácil de resolver — comece por aqui.')}
      ${group('Próximos passos', 'calendar', p.next, 'Importante, mas exige um pouco mais de trabalho.')}
      ${group('Melhorias contínuas', 'wrench', p.later, 'Ajustes finos para lapidar a página.')}
      ${p.total === 0 ? '<p>Nenhuma melhoria pendente. Excelente trabalho!</p>' : ''}
    </div>
  </section>`;
}

function identitySection(r) {
  const palette = r.extra.palette || [];
  const fams = r.extra.families || [];
  const pairs = r.extra.contrastPairs || [];
  const kinds = { sans: 'sem serifa', serif: 'serifada', display: 'decorativa', mono: 'monoespaçada' };
  const sw = palette.map((p) => `<div class="swatch"><i style="background:${esc(p.hex)}"></i><span>${esc(p.hex)}</span><small>${Math.round(p.share * 100)}% · ${p.neutral ? 'neutra' : 'destaque'}</small></div>`).join('');
  const fonts = fams
    .slice(0, 5)
    .map((f) => `<div class="font-sample"><div class="fs-name"><span>${esc(f.name)} · ${kinds[f.kind] || ''}</span><span>${Math.round(f.share * 100)}% do texto${f.name === r.extra.heading ? ' · títulos' : ''}${f.name === r.extra.body ? ' · textos' : ''}</span></div><div class="fs-text" style="font-family:'${esc(f.name)}', sans-serif">Sua marca merece ser lida</div></div>`)
    .join('');
  const contrast = pairs.length
    ? `<h4 style="margin-top:20px">Combinações com pouco contraste</h4><div class="contrast-pairs">${pairs.map((p) => `<div class="contrast-pair"><span class="demo" style="color:${esc(p.fg)};background:${esc(p.bg)}">Texto exemplo</span><span>${esc(p.fg)} sobre ${esc(p.bg)} — <b>${dec(p.ratio)}:1</b> <span class="faint">(mín. 4,5:1)</span></span></div>`).join('')}</div>`
    : '';
  return `<section class="card" id="identidade">
    <div class="card-title"><h2>Identidade visual</h2></div>
    <div class="identity">
      <div><h3>Paleta de cores detectada</h3>${sw ? `<div class="swatches">${sw}</div>` : '<p class="mute">Não foi possível extrair as cores.</p>'}${contrast}</div>
      <div><h3>Fontes em uso</h3>${fonts || '<p class="mute">Não foi possível identificar as fontes.</p>'}</div>
    </div>
  </section>`;
}

function evidenceHtml(list, max = 4) {
  if (!list?.length) return '';
  return `<div class="ev-grid">${list
    .slice(0, max)
    .map((e) => `<figure class="ev"><button class="ev-open" data-full="${esc(e.img)}" data-caption="${esc(e.caption || '')}" aria-label="Ampliar imagem"><img src="${esc(e.img)}" alt="${esc(e.caption || 'Recorte da página')}" loading="lazy"></button>${e.caption ? `<figcaption>${esc(e.caption)}</figcaption>` : ''}</figure>`)
    .join('')}</div>`;
}

const rank = (s) => ({ fail: 0, warn: 1, info: 1, ok: 2 }[s] ?? -1);
function competitorRows(id, mine) {
  const rows = COMPARE?.byCheck?.[id];
  if (!rows?.length) return '';
  const better = rows.filter((r) => rank(r.status) > rank(mine.status));
  const sideBySide = mine.evidence?.length
    ? [{ ...mine.evidence[0], caption: `Você — ${mine.evidence[0].caption || ''}` }, ...rows.filter((r) => r.evidence).slice(0, 3).map((r) => ({ ...r.evidence, caption: `${r.name} — ${r.evidence.caption || ''}` }))]
    : [];
  return `<div class="vs">
    <div class="vs-title">Concorrentes nesta verificação${better.length ? ` <span class="badge badge-danger">${better.length} melhor(es) que você</span>` : ''}</div>
    <div class="vs-rows">
      <div class="vs-row me"><span class="vs-name">Você</span>${statusBadge(mine.status)}<span class="vs-val">${esc(mine.value ?? '')}</span></div>
      ${rows.map((r) => `<div class="vs-row"><span class="vs-name">${esc(r.name)}</span>${r.status ? statusBadge(r.status) : '<span class="badge badge-neutral">sem dados</span>'}<span class="vs-val">${esc(r.value ?? '')}</span></div>`).join('')}
    </div>
    ${sideBySide.length > 1 ? `<div class="vs-sub">Você × concorrentes</div>${evidenceHtml(sideBySide, 4)}` : ''}
  </div>`;
}

function detailSection(r, categories) {
  const cats = categories.filter((c) => r.checks.some((k) => k.category === c.id));
  const tabs = cats.map((c, i) => `<button class="tab" role="tab" aria-selected="${i === 0}" data-tab="${c.id}"><i class="ph ph-${CAT_ICON[c.id]}"></i>${esc(c.label)} <span class="tab-count">${r.score.categories[c.id] ?? '–'}</span></button>`).join('');
  const order = { fail: 0, warn: 1, info: 2, ok: 3 };
  const panels = cats
    .map((c, i) => {
      const items = r.checks.filter((k) => k.category === c.id).sort((a, b) => order[a.status] - order[b.status]);
      return `<div class="tab-panel" role="tabpanel" data-panel="${c.id}" ${i === 0 ? '' : 'hidden'}>
        <h3 class="print-only">${esc(c.label)}</h3>
        ${items
          .map(
            (k) => `<div class="check">
              <div>${statusBadge(k.status)}</div>
              <div>
                <div class="check-head"><h4>${esc(k.title)}</h4>${k.value != null && k.value !== '' ? `<span class="val">${esc(k.value)}</span>` : ''}</div>
                ${k.detail ? `<p>${esc(k.detail)}</p>` : ''}
                ${k.fix && k.status !== 'ok' ? `<p class="fix"><b>Como melhorar:</b> ${esc(k.fix)}</p>` : ''}
                ${evidenceHtml(k.evidence)}
                ${k.items?.length ? `<details><summary>Ver itens (${k.items.length})</summary><ul>${k.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
                ${competitorRows(k.id, k)}
              </div>
            </div>`,
          )
          .join('')}
      </div>`;
    })
    .join('');
  return `<section class="card" id="detalhes"><div class="card-title"><h2>Análise detalhada</h2></div><div class="tabs" role="tablist">${tabs}</div>${panels}</section>`;
}

function wire(root, cmp, hist, currentId) {
  const selectTab = (id) => {
    $$('.tab[data-tab]', root).forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === id)));
    $$('.tab-panel', root).forEach((p) => (p.hidden = p.dataset.panel !== id));
  };
  $$('.tab[data-tab]', root).forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));
  $$('.tab[data-gtab]', root).forEach((t) =>
    t.addEventListener('click', () => {
      $$('.tab[data-gtab]', root).forEach((x) => x.setAttribute('aria-selected', String(x === t)));
      $$('.gallery-panel', root).forEach((p) => (p.hidden = p.dataset.gpanel !== t.dataset.gtab));
    }),
  );
  $$('[data-goto]', root).forEach((b) =>
    b.addEventListener('click', () => {
      selectTab(b.dataset.goto);
      $('#detalhes').scrollIntoView({ behavior: 'smooth' });
    }),
  );
  $$('[data-action="print"]', root).forEach((b) => b.addEventListener('click', () => window.print()));
  $$('[data-action="share"]', root).forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        toast('Link copiado');
      } catch {
        prompt('Copie o link do relatório:', location.href);
      }
    }),
  );
  // Gráficos desenhados na largura real (texto fica no tamanho do sistema) e refeitos ao redimensionar
  const draw = () => {
    if (cmp) drawComparisonChart($('#cmp-chart'), cmp);
    if (hist.length > 1) drawEvolutionChart($('#evo-chart'), hist, currentId);
  };
  draw();
  chartObserver?.disconnect();
  let lastW = root.clientWidth;
  chartObserver = new ResizeObserver(() => {
    if (root.clientWidth === lastW) return;
    lastW = root.clientWidth;
    draw();
  });
  chartObserver.observe(root);
}
let chartObserver;

// ---------- Gráficos ----------
function placeTooltip(container, tip, x, y, html) {
  // Ao lado da marca, virando para a esquerda na metade direita (§9)
  tip.innerHTML = html;
  tip.classList.add('show');
  const w = container.clientWidth;
  const right = x > w / 2;
  tip.style.top = `${y}px`;
  tip.style.left = right ? 'auto' : `${x + 12}px`;
  tip.style.right = right ? `${w - x + 12}px` : 'auto';
  tip.style.transform = 'translateY(-50%)';
}

// Barras agrupadas horizontais: uma faixa por área, uma barra por site.
function drawComparisonChart(container, cmp) {
  const rows = cmp.categoryTable;
  const n = cmp.sites.length;
  const barH = 10;
  const gap = 2;
  const groupGap = 18;
  const W = Math.max(300, container.clientWidth);
  const labelW = W < 520 ? 96 : 120;
  const plotW = W - labelW - 24;
  const groupH = n * barH + (n - 1) * gap;
  const top = 6;
  const H = top + rows.length * (groupH + groupGap) + 20;
  const x = (v) => labelW + (v / 100) * plotW;
  // Arredonda só a ponta do dado; a base fica reta no eixo (§9)
  const barPath = (x0, y, w, h) => {
    if (w <= 0) return '';
    const rr = Math.min(4, w, h / 2);
    return `M${x0},${y}H${x0 + w - rr}A${rr},${rr} 0 0 1 ${x0 + w},${y + rr}V${y + h - rr}A${rr},${rr} 0 0 1 ${x0 + w - rr},${y + h}H${x0}Z`;
  };
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Notas por área de cada site">
    <defs><pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="rgb(var(--c-mute) / 0.35)"/><rect width="2" height="4" fill="rgb(var(--c-mute))"/></pattern></defs>`;
  rows.forEach((row, ri) => {
    const gy = top + ri * (groupH + groupGap);
    svg += `<rect class="band" data-row="${ri}" x="0" y="${gy - groupGap / 2 + 2}" width="${W}" height="${groupH + groupGap - 4}" rx="6"/>`;
  });
  for (const t of [0, 25, 50, 75, 100]) {
    svg += `<line class="gridline" x1="${x(t)}" x2="${x(t)}" y1="0" y2="${H - 18}"/><text class="axis-label" x="${x(t)}" y="${H - 4}" text-anchor="middle">${t}</text>`;
  }
  rows.forEach((row, ri) => {
    const gy = top + ri * (groupH + groupGap);
    svg += `<text class="row-label" x="${labelW - 12}" y="${gy + groupH / 2 + 4}" text-anchor="end">${esc(row.label)}</text>`;
    row.values.forEach((v, si) => {
      if (v == null) return;
      const y = gy + si * (barH + gap);
      svg += `<path d="${barPath(x(0), y, x(v) - x(0), barH)}" fill="${SERIES[si]}"/>`;
    });
  });
  // Alvo de hover = faixa inteira
  rows.forEach((row, ri) => {
    const gy = top + ri * (groupH + groupGap);
    svg += `<rect class="hit" data-row="${ri}" x="0" y="${gy - groupGap / 2}" width="${W}" height="${groupH + groupGap}" fill="transparent"/>`;
  });
  svg += '</svg><div class="tooltip" role="status"></div>';
  container.innerHTML = svg;
  const tip = $('.tooltip', container);
  const svgEl = $('svg', container);
  $$('.hit', container).forEach((h) => {
    const ri = Number(h.dataset.row);
    const row = rows[ri];
    const band = $(`.band[data-row="${ri}"]`, container);
    h.addEventListener('mousemove', (e) => {
      band.classList.add('hover');
      const box = svgEl.getBoundingClientRect();
      const html = `<b>${esc(row.label)}</b><br>${row.values.map((v, si) => `${esc(cmp.sites[si].name)}${cmp.sites[si].isMain ? ' (você)' : ''}: <b>${v ?? '—'}</b>`).join('<br>')}`;
      placeTooltip(container, tip, e.clientX - box.left, e.clientY - box.top, html);
    });
    h.addEventListener('mouseleave', () => {
      band.classList.remove('hover');
      tip.classList.remove('show');
    });
  });
}

// Colunas da nota geral ao longo do tempo (uma série: esta página)
function drawEvolutionChart(container, hist, currentId) {
  const W = Math.max(260, container.clientWidth);
  const H = 180;
  const padL = 32;
  const padB = 24;
  const plotH = H - padB - 12;
  const n = hist.length;
  const slot = (W - padL) / n;
  const bw = Math.min(24, slot * 0.6); // teto de 24px (§9)
  const y = (v) => 12 + plotH - (v / 100) * plotH;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução da nota geral">`;
  for (const t of [0, 50, 100]) svg += `<line class="gridline" x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text class="axis-label" x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`;
  hist.forEach((h, i) => {
    const cx = padL + slot * i + slot / 2;
    const v = h.overall ?? 0;
    const top = y(v);
    const rr = Math.min(4, bw / 2, (y(0) - top) / 2);
    const path = v > 0 ? `M${cx - bw / 2},${y(0)}V${top + rr}A${rr},${rr} 0 0 1 ${cx - bw / 2 + rr},${top}H${cx + bw / 2 - rr}A${rr},${rr} 0 0 1 ${cx + bw / 2},${top + rr}V${y(0)}Z` : '';
    const isCur = h.id === currentId;
    svg += `<rect class="band" data-i="${i}" x="${padL + slot * i + 2}" y="4" width="${slot - 4}" height="${H - padB}" rx="6"/>`;
    svg += `<path d="${path}" fill="var(--chart-1)" opacity="${isCur ? 1 : 0.55}"/>`;
    if (isCur || i === n - 1) svg += `<text class="direct-label" x="${cx}" y="${top - 6}" text-anchor="middle">${h.overall ?? '—'}</text>`;
    if (n <= 12 || i % Math.ceil(n / 12) === 0) svg += `<text class="axis-label" x="${cx}" y="${H - 6}" text-anchor="middle">${dateBR(h.createdAt)}</text>`;
    svg += `<rect class="hit" data-i="${i}" x="${padL + slot * i}" y="0" width="${slot}" height="${H}" fill="transparent" style="cursor:pointer"/>`;
  });
  svg += '</svg><div class="tooltip" role="status"></div>';
  container.innerHTML = svg;
  const tip = $('.tooltip', container);
  const svgEl = $('svg', container);
  $$('.hit', container).forEach((hEl) => {
    const i = Number(hEl.dataset.i);
    const h = hist[i];
    const band = $(`.band[data-i="${i}"]`, container);
    hEl.addEventListener('mousemove', (e) => {
      band.classList.add('hover');
      const box = svgEl.getBoundingClientRect();
      placeTooltip(container, tip, e.clientX - box.left, e.clientY - box.top, `${dateBR(h.createdAt, true)}<br>Nota <b>${h.overall ?? '—'}</b>${h.id === currentId ? ' · esta análise' : ''}`);
    });
    hEl.addEventListener('mouseleave', () => {
      band.classList.remove('hover');
      tip.classList.remove('show');
    });
    hEl.addEventListener('click', () => {
      if (h.id === currentId) return;
      history.pushState({}, '', `/r/${h.id}`);
      loadReport(h.id);
    });
  });
}

// ---------- Ampliar imagem ----------
function openLightbox(src, caption) {
  let dlg = document.getElementById('lightbox');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'lightbox';
    dlg.innerHTML = '<form method="dialog"><button class="btn btn-ghost btn-icon btn-sm" aria-label="Fechar"><i class="ph ph-x"></i></button></form><img alt=""><p></p>';
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
  }
  $('img', dlg).src = src;
  $('img', dlg).alt = caption;
  $('p', dlg).textContent = caption;
  dlg.showModal();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('.ev-open');
  if (b) openLightbox(b.dataset.full, b.dataset.caption);
});

function loadFontPreviews(r) {
  for (const f of (r.extra.families || []).slice(0, 5)) {
    if (SYSTEM_FONTS.test(f.name)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.name).replace(/%20/g, '+')}:wght@400;700&display=swap`;
    link.onerror = () => link.remove();
    document.head.appendChild(link);
  }
}

function fmt(v, kind) {
  if (v == null) return '—';
  switch (kind) {
    case 'ms': return `${dec(v / 1000)} s`;
    case 'bytes': return v >= 1024 * 1024 ? `${dec(v / 1024 / 1024)} MB` : `${Math.round(v / 1024)} KB`;
    case 'pct': return `${Math.round(v * 100)}%`;
    default: return String(Math.round(v));
  }
}

route();
