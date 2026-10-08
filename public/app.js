const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

const STATUS_LABEL = { ok: '✓ Bom', warn: '! Atenção', fail: '✕ Corrigir', info: 'i Info' };
const IMPACT_LABEL = { alta: 'Impacto alto', media: 'Impacto médio', baixa: 'Impacto baixo' };
const EFFORT_LABEL = { baixo: 'Esforço baixo', medio: 'Esforço médio', alto: 'Esforço alto' };
const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];
const SYSTEM_FONTS = /^(arial|helvetica|times new roman|times|georgia|verdana|tahoma|trebuchet ms|segoe ui|system-ui|-apple-system|blinkmacsystemfont|sans-serif|serif|monospace|courier new|courier|impact|comic sans ms|cursive)$/i;

const level = (s) => (s == null ? 'none' : s >= 70 ? 'good' : s >= 50 ? 'warning' : 'critical');
const levelLabel = (s) => (s == null ? 'Sem dados' : s >= 85 ? 'Excelente' : s >= 70 ? 'Bom' : s >= 50 ? 'Regular' : 'Crítico');
const levelIcon = (s) => (s == null ? '–' : s >= 70 ? '✓' : s >= 50 ? '!' : '✕');

// ---------- Fluxo ----------
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
      try { localStorage.setItem('raiox:last', JSON.stringify(job.result)); } catch {}
      return renderReport(job.result);
    } else if (job.status === 'error') {
      return fail(job.error);
    }
  }
}

function fail(msg) {
  $('#progress').hidden = true;
  $('#start').hidden = false;
  const err = $('#form-error');
  err.textContent = msg;
  err.hidden = false;
}

// ---------- Relatório ----------
function renderReport(data) {
  const { main, comparison, categories } = data;
  CATS = categories;
  $('#progress').hidden = true;
  const el = $('#report');
  el.hidden = false;
  el.innerHTML = [
    headSection(main),
    categorySection(main, categories),
    comparison ? comparisonSection(comparison, data.competitors, categories) : '',
    planSection(main),
    identitySection(main),
    detailSection(main, categories),
  ].join('');
  wire(el, main, comparison, categories);
  loadFontPreviews(main);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function gauge(score) {
  const r = 58;
  const c = 2 * Math.PI * r;
  const v = score ?? 0;
  const color = { good: 'var(--good)', warning: 'var(--warn)', critical: 'var(--bad)', none: 'var(--info)' }[level(score)];
  return `<div class="gauge" role="img" aria-label="Nota geral ${v} de 100">
    <svg width="136" height="136" viewBox="0 0 136 136"><circle cx="68" cy="68" r="${r}" fill="none" stroke="var(--grid)" stroke-width="12"/>
    <circle cx="68" cy="68" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(c * v) / 100} ${c}"/></svg>
    <div class="gauge-value"><div><b>${score ?? '–'}</b><span>de 100</span></div></div></div>`;
}

function headSection(r) {
  const s = r.summary;
  const notices = [];
  if (!r.browser) notices.push('A análise com navegador real não estava disponível; métricas de velocidade, fontes e cores ficaram limitadas.');
  if (!r.pagespeed) notices.push('Dica: configure uma chave do Google PageSpeed (PAGESPEED_API_KEY) para incluir a nota oficial do Google e dados de usuários reais.');
  return `<section class="card">
    <div class="report-head">
      <div>
        <div class="report-url">${esc(r.finalUrl)}</div>
        <h1>Raio-X da página</h1>
        <div class="score-row">
          ${gauge(r.score.overall)}
          <div>
            <span class="grade lvl-${level(r.score.overall)}">${levelIcon(r.score.overall)} ${esc(s.grade.label)}</span>
            <div class="counts" style="margin-top:10px">
              <span class="st st-fail">${s.fails} para corrigir</span>
              <span class="st st-warn">${s.warns} de atenção</span>
              <span class="st st-ok">${r.checks.filter((c) => c.status === 'ok').length} ok</span>
            </div>
          </div>
        </div>
        <ul class="summary-list">${s.text.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
        <div class="actions">
          <button class="btn" data-action="print">Salvar relatório em PDF</button>
          <button class="btn" data-action="new">Nova análise</button>
        </div>
        ${notices.map((n) => `<div class="notice">${esc(n)}</div>`).join('')}
      </div>
      <div class="shots">
        ${r.screenshots.desktop ? `<figure class="shot shot-desktop"><img src="${r.screenshots.desktop}" alt="Primeira tela no desktop"><figcaption>Desktop</figcaption></figure>` : ''}
        ${r.screenshots.mobile ? `<figure class="shot shot-mobile"><img src="${r.screenshots.mobile}" alt="Primeira tela no celular"><figcaption>Celular</figcaption></figure>` : ''}
      </div>
    </div>
  </section>`;
}

function categorySection(r, categories) {
  const cards = categories
    .filter((c) => r.score.categories[c.id] != null)
    .map((c) => {
      const v = r.score.categories[c.id];
      return `<button class="cat-card" data-goto="${c.id}" aria-label="${esc(c.label)}: ${v} de 100, ${levelLabel(v)}">
        <span class="cat-name">${c.icon} ${esc(c.label)}</span>
        <div class="cat-score">${v}</div>
        <div class="meter"><i class="lvl-${level(v)}" style="width:${v}%"></i></div>
        <div class="small" style="margin-top:6px;color:var(--${level(v) === 'good' ? 'good' : level(v) === 'warning' ? 'warn' : 'bad'})">${levelIcon(v)} ${levelLabel(v)}</div>
      </button>`;
    })
    .join('');
  return `<section class="card"><div class="section-title"><h2>Panorama por área</h2><span class="muted small">Clique para ver os detalhes</span></div><div class="cat-grid">${cards}</div></section>`;
}

function comparisonSection(cmp, competitors, categories) {
  const failed = competitors.filter((c) => c.error);
  const legend = cmp.sites.map((s, i) => `<span><i style="background:${SERIES[i]}"></i>${esc(s.name)}${s.isMain ? ' (você)' : ''}</span>`).join('');
  const ranking = cmp.ranking.map((r) => `<div class="rank ${r.isMain ? 'me' : ''}"><span class="muted small">${r.position}º lugar</span><br><b>${r.overall ?? '–'}</b><small>${esc(r.name)}${r.isMain ? ' · você' : ''}</small></div>`).join('');

  const head = `<tr><th>Métrica</th>${cmp.sites.map((s) => `<th class="${s.isMain ? 'me' : ''}">${esc(s.name)}${s.isMain ? '<br><small>(você)</small>' : ''}</th>`).join('')}</tr>`;
  const metricRows = cmp.metricTable
    .map((m) => `<tr><td>${esc(m.label)}</td>${m.values.map((v, i) => `<td class="${i === m.bestIndex ? 'best' : ''} ${i === 0 ? 'me' : ''}">${fmt(v, m.fmt)}</td>`).join('')}</tr>`)
    .join('');
  const catRows = cmp.categoryTable
    .map((row) => {
      const valid = row.values.filter((v) => v != null);
      const best = Math.max(...valid);
      return `<tr><td>${esc(row.label)}</td>${row.values.map((v, i) => `<td class="${v === best ? 'best' : ''} ${i === 0 ? 'me' : ''}">${v ?? '—'}</td>`).join('')}</tr>`;
    })
    .join('');

  const insights = cmp.insights.length
    ? cmp.insights.map((i) => `<li>${esc(i.text)}</li>`).join('')
    : '<li>Nenhuma métrica em que você esteja muito atrás. 👏</li>';
  const theyDo = cmp.theyDo.length
    ? cmp.theyDo.map((t) => `<li><b>${esc(t.title)}</b><span class="muted small">Feito por: ${esc(t.competitors.join(', '))}</span><br>${esc(t.fix)}</li>`).join('')
    : '<li>Seus concorrentes não fazem nada de importante que você não faça.</li>';
  const adv = cmp.advantages.length ? `<h3 style="margin-top:20px">Onde você está à frente</h3><ul class="insight-list">${cmp.advantages.map((a) => `<li>✓ ${esc(a)}</li>`).join('')}</ul>` : '';

  const shots = cmp.sites.filter((s) => s.screenshot).map((s) => `<figure><img src="${s.screenshot}" alt="Primeira tela de ${esc(s.name)} no celular" loading="lazy"><figcaption>${esc(s.name)}${s.isMain ? ' (você)' : ''}</figcaption></figure>`).join('');

  return `<section class="card" id="comparacao">
    <div class="section-title"><h2>Comparação com concorrentes</h2></div>
    ${failed.map((f) => `<div class="error-box">Não foi possível analisar ${esc(host(f.url))}: ${esc(f.error)}</div>`).join('')}
    <div class="ranking">${ranking}</div>
    <h3>Notas por área</h3>
    <div class="legend">${legend}</div>
    <div class="chart" id="cmp-chart"></div>
    <details style="margin-top:8px"><summary>Ver como tabela</summary><div class="table-wrap"><table class="cmp"><thead>${head}</thead><tbody>${catRows}</tbody></table></div></details>
    <div class="cmp-grid">
      <div><h3>Onde você perde para a concorrência</h3><ul class="insight-list">${insights}</ul></div>
      <div><h3>O que os concorrentes fazem e você não</h3><ul class="insight-list">${theyDo}</ul></div>
    </div>
    ${adv}
    <h3 style="margin-top:24px">Números lado a lado</h3>
    <div class="table-wrap"><table class="cmp"><thead>${head}</thead><tbody>${metricRows}</tbody></table></div>
    <p class="muted small">★ = melhor resultado entre os sites analisados.</p>
    ${shots ? `<h3 style="margin-top:20px">Primeira tela no celular</h3><div class="comp-shots">${shots}</div>` : ''}
  </section>`;
}

function planSection(r) {
  const p = r.actionPlan;
  const group = (title, emoji, items, note) =>
    items.length
      ? `<div class="plan-group"><h3>${emoji} ${title} <span class="pill">${items.length}</span></h3><p class="muted small" style="margin-top:-4px">${note}</p><div class="plan-items">${items
          .map(
            (i) => `<div class="plan-item pi-${i.status}">
              <h4>${esc(i.title)}</h4>
              <p>${esc(i.problem)}</p>
              <p class="how"><b>O que fazer:</b> ${esc(i.fix)}</p>
              <div class="tags"><span class="st st-${i.status}">${STATUS_LABEL[i.status]}</span><span class="pill">${IMPACT_LABEL[i.impact]}</span><span class="pill">${EFFORT_LABEL[i.effort]}</span><span class="pill">${esc(catLabel(i.category))}</span></div>
            </div>`,
          )
          .join('')}</div></div>`
      : '';
  return `<section class="card" id="plano">
    <div class="section-title"><h2>Plano de ação: o que mudar</h2><span class="muted small">${p.total} melhoria(s), em ordem de prioridade</span></div>
    <div class="plan">
      ${group('Faça agora', '🚀', p.now, 'Alto impacto e fácil de resolver — comece por aqui.')}
      ${group('Próximos passos', '📅', p.next, 'Importante, mas exige um pouco mais de trabalho.')}
      ${group('Melhorias contínuas', '🔧', p.later, 'Ajustes finos para lapidar a página.')}
      ${p.total === 0 ? '<p>Nenhuma melhoria pendente. Excelente trabalho!</p>' : ''}
    </div>
  </section>`;
}

let CATS = [];
const catLabel = (id) => CATS.find((c) => c.id === id)?.label || id;

function identitySection(r) {
  const palette = r.extra.palette || [];
  const fams = r.extra.families || [];
  const pairs = r.extra.contrastPairs || [];
  const sw = palette.map((p) => `<div class="swatch"><i style="background:${p.hex}"></i><span>${p.hex}</span><small>${Math.round(p.share * 100)}% · ${p.neutral ? 'neutra' : 'destaque'}</small></div>`).join('');
  const kinds = { sans: 'sem serifa', serif: 'serifada', display: 'decorativa', mono: 'monoespaçada' };
  const fonts = fams.slice(0, 5).map((f) => `<div class="font-sample"><div class="fs-name"><span>${esc(f.name)} · ${kinds[f.kind] || ''}</span><span>${Math.round(f.share * 100)}% do texto${f.name === r.extra.heading ? ' · títulos' : ''}${f.name === r.extra.body ? ' · textos' : ''}</span></div><div class="fs-text" style="font-family:'${esc(f.name)}', sans-serif">Sua marca merece ser lida</div></div>`).join('');
  const contrast = pairs.length
    ? `<h3 style="margin-top:16px">Combinações com pouco contraste</h3><div class="contrast-pairs">${pairs.map((p) => `<div class="contrast-pair"><span class="demo" style="color:${p.fg};background:${p.bg}">Texto exemplo</span><span>${p.fg} sobre ${p.bg} — <b>${p.ratio.toFixed(1).replace('.', ',')}:1</b> <span class="muted">(mín. 4,5:1)</span></span></div>`).join('')}</div>`
    : '';
  return `<section class="card" id="identidade">
    <div class="section-title"><h2>Identidade visual</h2></div>
    <div class="identity">
      <div><h3>Paleta de cores detectada</h3>${sw ? `<div class="swatches">${sw}</div>` : '<p class="muted">Não foi possível extrair as cores.</p>'}${contrast}</div>
      <div><h3>Fontes em uso</h3>${fonts || '<p class="muted">Não foi possível identificar as fontes.</p>'}</div>
    </div>
  </section>`;
}

function detailSection(r, categories) {
  const cats = categories.filter((c) => r.checks.some((k) => k.category === c.id));
  const tabs = cats.map((c, i) => `<button class="tab" role="tab" aria-selected="${i === 0}" data-tab="${c.id}">${c.icon} ${esc(c.label)} · ${r.score.categories[c.id] ?? '–'}</button>`).join('');
  const order = { fail: 0, warn: 1, info: 2, ok: 3 };
  const panels = cats
    .map((c, i) => {
      const items = r.checks.filter((k) => k.category === c.id).sort((a, b) => order[a.status] - order[b.status]);
      return `<div class="tab-panel" role="tabpanel" data-panel="${c.id}" ${i === 0 ? '' : 'hidden'}>
        <h3 class="print-only">${c.icon} ${esc(c.label)}</h3>
        ${items
          .map(
            (k) => `<div class="check">
              <div><span class="st st-${k.status}">${STATUS_LABEL[k.status]}</span></div>
              <div>
                <h4><span>${esc(k.title)}</span>${k.value != null && k.value !== '' ? `<span class="val">${esc(k.value)}</span>` : ''}</h4>
                ${k.detail ? `<p>${esc(k.detail)}</p>` : ''}
                ${k.fix && k.status !== 'ok' ? `<p class="fix"><b>Como melhorar:</b> ${esc(k.fix)}</p>` : ''}
                ${k.items?.length ? `<details><summary>Ver itens (${k.items.length})</summary><ul>${k.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
              </div>
            </div>`,
          )
          .join('')}
      </div>`;
    })
    .join('');
  return `<section class="card" id="detalhes"><div class="section-title"><h2>Análise detalhada</h2></div><div class="tabs" role="tablist">${tabs}</div>${panels}</section>`;
}

function wire(root, main, cmp, categories) {
  root.querySelectorAll('[data-action="print"]').forEach((b) => b.addEventListener('click', () => window.print()));
  root.querySelectorAll('[data-action="new"]').forEach((b) =>
    b.addEventListener('click', () => {
      root.hidden = true;
      $('#start').hidden = false;
      window.scrollTo({ top: 0 });
    }),
  );
  const selectTab = (id) => {
    root.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === id)));
    root.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = p.dataset.panel !== id));
  };
  root.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));
  root.querySelectorAll('[data-goto]').forEach((b) =>
    b.addEventListener('click', () => {
      selectTab(b.dataset.goto);
      $('#detalhes').scrollIntoView({ behavior: 'smooth' });
    }),
  );
  if (cmp) drawComparisonChart($('#cmp-chart'), cmp);
}

// Barras agrupadas horizontais: uma linha por área, uma barra por site.
function drawComparisonChart(container, cmp) {
  const rows = cmp.categoryTable;
  const n = cmp.sites.length;
  const barH = 9;
  const gap = 2;
  const groupGap = 16;
  const labelW = 120;
  const W = 720;
  const plotW = W - labelW - 40;
  const groupH = n * barH + (n - 1) * gap;
  const top = 8;
  const H = top + rows.length * (groupH + groupGap) + 20;
  const x = (v) => labelW + (v / 100) * plotW;
  const r = 4;
  const barPath = (x0, y, w, h) => {
    if (w <= 0) return '';
    const rr = Math.min(r, w, h / 2);
    return `M${x0},${y}H${x0 + w - rr}A${rr},${rr} 0 0 1 ${x0 + w},${y + rr}V${y + h - rr}A${rr},${rr} 0 0 1 ${x0 + w - rr},${y + h}H${x0}Z`;
  };
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Notas por área de cada site">`;
  for (const t of [0, 25, 50, 75, 100]) {
    svg += `<line class="gridline" x1="${x(t)}" x2="${x(t)}" y1="0" y2="${H - 18}"/><text class="axis-label" x="${x(t)}" y="${H - 4}" text-anchor="middle">${t}</text>`;
  }
  rows.forEach((row, ri) => {
    const gy = top + ri * (groupH + groupGap);
    svg += `<text class="row-label" x="${labelW - 10}" y="${gy + groupH / 2 + 4}" text-anchor="end">${esc(row.label)}</text>`;
    row.values.forEach((v, si) => {
      if (v == null) return;
      const y = gy + si * (barH + gap);
      const tip = `${cmp.sites[si].name}${cmp.sites[si].isMain ? ' (você)' : ''} · ${row.label}: ${v}`;
      svg += `<path class="bar-rect" d="${barPath(x(0), y, x(v) - x(0), barH)}" fill="${SERIES[si]}"/>`;
      svg += `<rect class="hit" x="${x(0)}" y="${y - 1}" width="${plotW}" height="${barH + 2}" fill="transparent" data-tip="${esc(tip)}" data-x="${x(v)}" data-y="${y}"/>`;
    });
  });
  svg += '</svg><div class="tooltip" role="status"></div>';
  container.innerHTML = svg;
  const tipEl = container.querySelector('.tooltip');
  const svgEl = container.querySelector('svg');
  container.querySelectorAll('.hit').forEach((h) => {
    const show = () => {
      const scale = svgEl.getBoundingClientRect().width / W;
      tipEl.textContent = h.dataset.tip;
      tipEl.style.left = `${Number(h.dataset.x) * scale}px`;
      tipEl.style.top = `${Number(h.dataset.y) * scale}px`;
      tipEl.classList.add('show');
      h.previousElementSibling?.classList.add('hover');
    };
    const hide = () => {
      tipEl.classList.remove('show');
      h.previousElementSibling?.classList.remove('hover');
    };
    h.addEventListener('mouseenter', show);
    h.addEventListener('mouseleave', hide);
  });
}

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
  const dec = (n) => n.toFixed(1).replace('.', ',');
  switch (kind) {
    case 'ms': return `${dec(v / 1000)} s`;
    case 'bytes': return v >= 1024 * 1024 ? `${dec(v / 1024 / 1024)} MB` : `${Math.round(v / 1024)} KB`;
    case 'pct': return `${Math.round(v * 100)}%`;
    case 'score': return `${v}`;
    default: return String(Math.round(v));
  }
}

// Reabrir último relatório com ?ultimo
if (new URLSearchParams(location.search).has('ultimo')) {
  try {
    const last = JSON.parse(localStorage.getItem('raiox:last'));
    if (last) {
      $('#start').hidden = true;
      renderReport(last);
    }
  } catch {}
}
