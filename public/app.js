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

// ---------- API e sessão ----------
const DEMO = Boolean(window.RX_DEMO); // demonstração estática (sem servidor): rotas por hash
let ME = null;
let PUBLIC = false;

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'x-requested-with': 'raio-x', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 401 && path !== '/api/login' && !path.startsWith('/api/public')) {
    ME = null;
    showLogin(data);
    throw new Error(data?.error || 'Faça login para continuar.');
  }
  if (!res.ok) throw new Error(data?.error || 'Algo deu errado. Tente novamente.');
  return data;
}

const VIEWS = ['login', 'start', 'progress', 'report', 'team', 'account'];
function show(view) {
  for (const v of VIEWS) $(`#${v}`).hidden = v !== view;
  $('#nav-app').hidden = view === 'login' || PUBLIC;
}

// ---------- Rotas ----------
// Na demonstração as rotas ficam só em memória (o visualizador não permite mudar a URL)
let demoPath = DEMO ? window.RX_DEMO.start || '/' : null;
const currentPath = () => (DEMO ? demoPath : location.pathname);
function go(path) {
  if (DEMO) demoPath = path;
  else history.pushState({}, '', path);
  route();
}

async function route() {
  const path = currentPath();
  const pub = path.match(/^\/p\/([A-Za-z0-9_-]{20,64})$/);
  PUBLIC = Boolean(pub);
  if (pub) return loadPublic(pub[1]);
  if (!ME) {
    try {
      ME = (await api('/api/me')).user;
    } catch {
      return;
    }
  }
  renderUserMenu();
  const m = path.match(/^\/r\/([0-9a-f-]{36})$/);
  if (m) return loadReport(m[1]);
  if (path === '/equipe') return ME.role === 'admin' ? showTeam() : go('/');
  if (path === '/conta') return showAccount();
  if (path === '/login') return go('/');
  showStart();
  if (location.hash === '#historico' || path === '/#historico') $('#historico').scrollIntoView();
}
if (!DEMO) window.addEventListener('popstate', route);
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-nav]');
  if (!a) return;
  e.preventDefault();
  $('#user-menu')?.removeAttribute('open');
  const href = a.getAttribute('href');
  go(href === '/#historico' ? '/' : href);
  if (a.dataset.nav === 'history') setTimeout(() => $('#historico').scrollIntoView({ behavior: 'smooth' }), 50);
  else window.scrollTo({ top: 0 });
});

// ---------- Login ----------
function showLogin(info) {
  show('login');
  document.title = 'Entrar · Raio-X do Site';
  $('#login-setup').hidden = !info?.setupNeeded;
  setTimeout(() => $('#login-email').focus(), 50);
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-error');
  err.hidden = true;
  const btn = $('#login-form button[type=submit]');
  btn.disabled = true;
  try {
    const { user } = await api('/api/login', { method: 'POST', body: { email: $('#login-email').value, password: $('#login-password').value } });
    ME = user;
    $('#login-password').value = '';
    if (currentPath() === '/login') go('/');
    else route();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  } finally {
    btn.disabled = false;
  }
});

function renderUserMenu() {
  const menu = $('#user-menu');
  menu.hidden = !ME;
  if (!ME) return;
  $('#user-name').textContent = ME.name.split(' ')[0];
  $('#user-initials').textContent = ME.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  $('#user-full').textContent = ME.name;
  $('#user-email').textContent = ME.email;
  $('#menu-team').hidden = ME.role !== 'admin';
}
document.addEventListener('click', (e) => {
  const menu = $('#user-menu');
  if (menu?.open && !menu.contains(e.target)) menu.removeAttribute('open');
});
$('#logout').addEventListener('click', async () => {
  $('#user-menu').removeAttribute('open');
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  ME = null;
  if (!DEMO) history.pushState({}, '', '/');
  showLogin();
});

let SEARCH_ON = true;
async function loadConfig() {
  try {
    SEARCH_ON = Boolean((await api('/api/config')).search);
  } catch {
    return;
  }
  $('#search-off').hidden = SEARCH_ON;
  $('#niche').closest('.field').hidden = !SEARCH_ON;
  if (!SEARCH_ON) $('#manual-competitors').open = true;
}

function showStart() {
  show('start');
  document.title = 'Raio-X do Site';
  loadConfig();
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
    const rows = await api(`/api/reports?limit=30&q=${encodeURIComponent(q)}`);
    if (!rows.length) {
      box.innerHTML = `<div class="empty">${q ? 'Nenhuma análise encontrada para esse filtro.' : 'Nenhuma análise salva ainda. Faça a primeira acima.'}</div>`;
      return;
    }
    box.innerHTML = `<table class="ds-table">
      <thead><tr><th>Página</th><th class="num">Nota</th><th>Concorrentes</th><th>Por</th><th>Data</th><th></th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr>
            <td class="url" title="${esc(r.url)}"><a href="/r/${r.id}" data-nav="report">${esc(host(r.url))}${esc(pathOf(r.url))}</a>${r.shared ? ' <i class="ph ph-link faint" title="Compartilhado com o cliente"></i>' : ''}${r.niche ? `<span class="niche-tag">${esc(r.niche)}</span>` : ''}</td>
            <td class="num">${r.overall ?? '<span class="dash">—</span>'}</td>
            <td>${r.competitors.length ? r.competitors.map((c) => `<span class="badge badge-neutral" title="${esc(c.url)}">${esc(host(c.url))}${c.overall != null ? ` · ${c.overall}` : ''}</span>`).join(' ') : '<span class="dash">—</span>'}</td>
            <td>${r.author ? esc(r.author) : '<span class="dash">—</span>'}</td>
            <td style="white-space:nowrap">${dateBR(r.createdAt, true)}</td>
            <td class="num">${ME?.role === 'admin' || r.createdBy === ME?.id ? `<button class="btn btn-danger-ghost btn-sm btn-icon" data-delete="${r.id}" aria-label="Excluir análise de ${esc(host(r.url))}"><i class="ph ph-trash"></i></button>` : ''}</td>
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
  if (!confirm('Excluir esta análise? Os links dela deixarão de funcionar.')) return;
  try {
    await api(`/api/reports/${b.dataset.delete}`, { method: 'DELETE' });
    toast('Análise excluída');
    if (currentPath().startsWith('/r/')) go('/');
    else loadHistory();
  } catch (ex) {
    toast(ex.message);
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
  const niche = form.niche.value.trim();
  if (!competitors.length && !niche) {
    err.textContent = SEARCH_ON ? 'Informe o nicho (ex.: clínica odontológica em Campinas) para encontrarmos os concorrentes.' : 'Informe ao menos um concorrente.';
    err.hidden = false;
    (SEARCH_ON ? form.niche : form.c1).focus();
    return;
  }
  try {
    const data = await api('/api/analyze', { method: 'POST', body: { url, niche, competitors } });
    showProgress(competitors.length ? 1 + competitors.length : 4, !competitors.length);
    poll(data.id);
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

function showProgress(total, auto = false) {
  show('progress');
  $('#progress-step').textContent = auto ? 'Analisando seu site; depois buscamos os concorrentes no Google' : total > 1 ? `Analisando seu site e ${total - 1} concorrente(s)` : 'Analisando seu site';
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
      job = await api(`/api/jobs/${id}`);
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
      return go(`/r/${job.reportId}`);
    } else if (job.status === 'error') {
      return fail(job.error);
    }
  }
}

function fail(msg) {
  if (!ME) return;
  showStart();
  const err = $('#form-error');
  err.textContent = msg;
  err.hidden = false;
}

async function loadReport(id) {
  show('report');
  const el = $('#report');
  el.innerHTML = '<div class="card"><div class="empty">Carregando relatório…</div></div>';
  try {
    renderReport(await api(`/api/reports/${id}`));
  } catch (ex) {
    if (!ME) return;
    el.innerHTML = `<div class="card"><div class="empty">${esc(ex.message || 'Relatório não encontrado.')}<br><br><a class="btn btn-secondary btn-sm" href="/" data-nav="home">Fazer uma nova análise</a></div></div>`;
  }
}

async function loadPublic(token) {
  show('report');
  renderUserMenu();
  const el = $('#report');
  el.innerHTML = '<div class="card"><div class="empty">Carregando relatório…</div></div>';
  try {
    renderReport(await api(`/api/public/${token}`));
  } catch (ex) {
    el.innerHTML = `<div class="card"><div class="empty"><i class="ph ph-link-break" style="font-size:28px"></i><br>${esc(ex.message)}</div></div>`;
  }
}

// ---------- Equipe (admin) ----------
async function showTeam() {
  show('team');
  document.title = 'Equipe · Raio-X do Site';
  const box = $('#team-list');
  box.innerHTML = '<div class="empty">Carregando…</div>';
  try {
    const users = await api('/api/users');
    box.innerHTML = `<table class="ds-table">
      <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Situação</th><th>Desde</th><th></th></tr></thead>
      <tbody>${users
        .map(
          (u) => `<tr>
            <td style="color:rgb(var(--c-ink));font-weight:500">${esc(u.name)}${u.id === ME.id ? ' <span class="badge badge-neutral">você</span>' : ''}</td>
            <td>${esc(u.email)}</td>
            <td>${u.role === 'admin' ? '<span class="badge badge-emerald">Administrador</span>' : '<span class="badge badge-neutral">Membro</span>'}</td>
            <td>${u.disabled ? '<span class="badge badge-danger">Desativado</span>' : '<span class="badge badge-success">Ativo</span>'}</td>
            <td style="white-space:nowrap">${dateBR(u.createdAt)}</td>
            <td class="num" style="white-space:nowrap">${
              u.id === ME.id
                ? ''
                : `<button class="btn btn-ghost btn-sm btn-icon" data-user-action="reset" data-id="${u.id}" data-name="${esc(u.name)}" title="Gerar nova senha" aria-label="Gerar nova senha para ${esc(u.name)}"><i class="ph ph-key"></i></button>
                   <button class="btn btn-ghost btn-sm btn-icon" data-user-action="role" data-id="${u.id}" data-role="${u.role}" title="${u.role === 'admin' ? 'Tornar membro' : 'Tornar administrador'}" aria-label="${u.role === 'admin' ? 'Tornar membro' : 'Tornar administrador'}"><i class="ph ph-${u.role === 'admin' ? 'user' : 'shield-check'}"></i></button>
                   <button class="btn btn-ghost btn-sm btn-icon" data-user-action="toggle" data-id="${u.id}" data-disabled="${u.disabled}" title="${u.disabled ? 'Reativar' : 'Desativar'}" aria-label="${u.disabled ? 'Reativar' : 'Desativar'} ${esc(u.name)}"><i class="ph ph-${u.disabled ? 'check-circle' : 'prohibit'}"></i></button>
                   <button class="btn btn-danger-ghost btn-sm btn-icon" data-user-action="delete" data-id="${u.id}" data-name="${esc(u.name)}" title="Excluir" aria-label="Excluir ${esc(u.name)}"><i class="ph ph-trash"></i></button>`
            }</td>
          </tr>`,
        )
        .join('')}</tbody></table>`;
  } catch (ex) {
    box.innerHTML = `<div class="empty">${esc(ex.message)}</div>`;
  }
}

const randomPassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = crypto.getRandomValues(new Uint32Array(12));
  return [...buf].map((n) => chars[n % chars.length]).join('');
};
$('#gen-password').addEventListener('click', () => {
  const f = $('#user-form');
  f.password.value = randomPassword();
  f.password.type = 'text';
});

$('#user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $('#user-error');
  err.hidden = true;
  try {
    const body = { name: f.name.value, email: f.email.value, password: f.password.value, role: f.role.value };
    await api('/api/users', { method: 'POST', body });
    showCredentials(body.name, body.email, body.password);
    f.reset();
    f.password.type = 'password';
    showTeam();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

function showCredentials(name, email, password) {
  const box = $('#credentials');
  const url = DEMO ? 'https://seu-raio-x.onrender.com/' : location.origin + '/';
  const text = `Olá, ${name.split(' ')[0]}! Seu acesso ao Raio-X do Site:\n${url}\nE-mail: ${email}\nSenha provisória: ${password}\nTroque a senha em "Minha conta" no primeiro acesso.`;
  box.hidden = false;
  $('#credentials-text').textContent = text;
  $('#credentials-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(text); toast('Dados de acesso copiados'); } catch { prompt('Copie os dados de acesso:', text); }
  };
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-user-action]');
  if (!b) return;
  const { id, name } = b.dataset;
  try {
    if (b.dataset.userAction === 'reset') {
      const pw = randomPassword();
      if (!confirm(`Gerar uma nova senha para ${name}? A senha atual deixará de funcionar.`)) return;
      await api(`/api/users/${id}`, { method: 'PATCH', body: { password: pw } });
      const u = (await api('/api/users')).find((x) => x.id === id);
      showCredentials(u.name, u.email, pw);
    } else if (b.dataset.userAction === 'role') {
      await api(`/api/users/${id}`, { method: 'PATCH', body: { role: b.dataset.role === 'admin' ? 'member' : 'admin' } });
    } else if (b.dataset.userAction === 'toggle') {
      await api(`/api/users/${id}`, { method: 'PATCH', body: { disabled: b.dataset.disabled !== 'true' } });
    } else if (b.dataset.userAction === 'delete') {
      if (!confirm(`Excluir a conta de ${name}? As análises feitas por essa pessoa continuam salvas.`)) return;
      await api(`/api/users/${id}`, { method: 'DELETE' });
    }
    showTeam();
  } catch (ex) {
    toast(ex.message);
  }
});

// ---------- Minha conta ----------
function showAccount() {
  show('account');
  document.title = 'Minha conta · Raio-X do Site';
  $('#account-name').textContent = ME.name;
  $('#account-email').textContent = ME.email;
  $('#account-role').innerHTML = ME.role === 'admin' ? '<span class="badge badge-emerald">Administrador</span>' : '<span class="badge badge-neutral">Membro</span>';
}
$('#password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const err = $('#password-error');
  err.hidden = true;
  if (f.password.value !== f.confirm.value) {
    err.textContent = 'A confirmação não confere com a nova senha.';
    err.hidden = false;
    return;
  }
  try {
    await api('/api/me/password', { method: 'POST', body: { current: f.current.value, password: f.password.value } });
    f.reset();
    toast('Senha alterada');
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

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
  const competitorsCount = comparison ? comparison.sites.length - 1 : 0;

  const sections = [
    { id: 'geral', label: 'Visão geral', icon: 'squares-four', html: overviewSection(main, categories, previous, comparison, data.discovery) },
    { id: 'plano', label: 'Plano de ação', icon: 'list-checks', count: main.actionPlan.total, html: planSection(main) },
    comparison || data.discovery
      ? { id: 'concorrentes', label: 'Concorrentes', icon: 'flag-checkered', count: competitorsCount || null, html: comparison ? comparisonSection(comparison, data.competitors, data.discovery) : discoveryOnlySection(data.discovery) }
      : null,
    { id: 'detalhes', label: 'Análise detalhada', icon: 'magnifying-glass', count: main.checks.filter((c) => c.status === 'fail' || c.status === 'warn').length, html: detailSection(main, categories) },
    { id: 'identidade', label: 'Identidade visual', icon: 'palette', html: identitySection(main) },
    hist.length > 1 ? { id: 'evolucao', label: 'Evolução', icon: 'chart-line-up', count: hist.length, html: evolutionSection(hist, data.id) } : null,
  ].filter(Boolean);

  const el = $('#report');
  el.innerHTML = `${headSection(main, data, previous)}
    <nav class="rtabs no-print" role="tablist" aria-label="Seções do relatório">
      ${sections.map((s, i) => `<button class="rtab" role="tab" data-tg="main" data-tk="${s.id}" aria-selected="${i === 0}"><i class="ph ph-${s.icon}"></i>${s.label}${s.count ? `<span class="rtab-count">${s.count}</span>` : ''}</button>`).join('')}
    </nav>
    ${sections.map((s, i) => `<div class="rtab-panel" role="tabpanel" data-tgp="main" data-tk="${s.id}" ${i === 0 ? '' : 'hidden'}><h2 class="print-only">${s.label}</h2>${s.html}</div>`).join('')}`;
  wire(el, comparison, hist, data);
  loadFontPreviews(main);
  window.scrollTo({ top: 0 });
}

function gauge(score, size = 104) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  const v = score ?? 0;
  return `<div class="gauge lvl-${level(score)}" style="width:${size}px;height:${size}px" role="img" aria-label="Nota geral ${v} de 100">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgb(var(--c-hairline))" stroke-width="9"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--lvl)" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(c * v) / 100} ${c}"/></svg>
    <div class="gauge-value"><div><b>${score ?? '–'}</b><span>de 100</span></div></div></div>`;
}

const absUrl = (p) => (DEMO ? `https://seu-raio-x.onrender.com${p}` : location.origin + p);
function shareBoxHtml(shareUrl) {
  if (!shareUrl) return '';
  return `<div class="share-head"><i class="ph ph-share-network"></i><b>Link do cliente</b><span class="caption">Abre sem login, só leitura, apenas este relatório.</span></div>
    <div class="share-row"><input class="input" readonly value="${esc(absUrl(shareUrl))}" aria-label="Link do cliente">
    <button class="btn btn-sm btn-secondary" data-action="copy-share"><i class="ph ph-copy"></i>Copiar</button>
    <button class="btn btn-sm btn-danger-ghost" data-action="revoke-share">Desativar link</button></div>`;
}

// Cabeçalho compacto: nota, identificação, resumo e ações numa faixa só
function headSection(r, data, previous) {
  const s = r.summary;
  const notices = [];
  if (!r.browser) notices.push('A análise com navegador real não estava disponível; velocidade, fontes e cores ficaram limitadas.');
  if (!r.pagespeed && !data.public) notices.push('Configure a PAGESPEED_API_KEY para incluir a nota oficial do Google.');
  const actions = data.public
    ? `<button class="btn btn-sm btn-secondary" data-action="print"><i class="ph ph-file-pdf"></i>Salvar em PDF</button>`
    : `<button class="btn btn-sm shiny-cta" data-action="share-client"><span class="shiny-dots" aria-hidden="true"></span><span class="shiny-cta-content"><i class="ph ph-share-network"></i>Compartilhar com o cliente</span></button>
       <button class="btn btn-sm btn-secondary" data-action="print"><i class="ph ph-file-pdf"></i>PDF</button>
       <button class="btn btn-sm btn-ghost" data-action="copy-internal"><i class="ph ph-link"></i>Link interno</button>
       ${data.canDelete ? `<button class="btn btn-sm btn-danger-ghost btn-icon" data-delete="${data.id}" title="Excluir análise" aria-label="Excluir análise"><i class="ph ph-trash"></i></button>` : ''}`;
  const delta = previous && r.score.overall != null && previous.overall != null ? r.score.overall - previous.overall : null;
  return `<section class="card head-card">
    <div class="head-grid">
      ${gauge(r.score.overall)}
      <div class="head-id">
        <span class="eyebrow">Raio-X da página</span>
        <h1>${esc(host(r.finalUrl))}</h1>
        <div class="report-url"><i class="ph ph-globe"></i><span>${esc(r.finalUrl)}</span></div>
        <div class="caption">Analisado em ${dateBR(data.createdAt, true)}${data.author ? ` por ${esc(data.author)}` : ''}${data.niche || data.discovery?.query ? ` · nicho: ${esc(data.niche || data.discovery.query)}` : ''}</div>
        <div class="chips" style="margin-top:8px">
          ${levelBadge(r.score.overall)}
          ${delta != null ? `<span class="badge badge-neutral">${deltaHtml(delta)}&nbsp;vs. ${dateBR(previous.createdAt)}</span>` : ''}
          <span class="badge st-fail">${s.fails} para corrigir</span>
          <span class="badge st-warn">${s.warns} de atenção</span>
          <span class="badge st-ok">${r.checks.filter((c) => c.status === 'ok').length} ok</span>
        </div>
      </div>
      <ul class="summary-list head-summary">${s.text.slice(1).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <div class="shots">
        ${r.screenshots.desktop ? `<figure class="shot shot-desktop"><button class="ev-open" data-full="${esc(r.screenshots.desktop)}" data-caption="Primeira tela no desktop"><img src="${esc(r.screenshots.desktop)}" alt="Primeira tela no desktop"></button></figure>` : ''}
        ${r.screenshots.mobile ? `<figure class="shot shot-mobile"><button class="ev-open" data-full="${esc(r.screenshots.mobile)}" data-caption="Primeira tela no celular"><img src="${esc(r.screenshots.mobile)}" alt="Primeira tela no celular"></button></figure>` : ''}
      </div>
    </div>
    <div class="head-foot">
      <div class="actions">${actions}</div>
      ${notices.length ? `<details class="notices no-print"><summary class="caption"><i class="ph ph-info"></i>${notices.length} aviso(s) sobre esta análise</summary>${notices.map((n) => `<p class="caption">${esc(n)}</p>`).join('')}</details>` : ''}
    </div>
    ${data.public ? '' : `<div id="share-box" class="share-box no-print" ${data.shareUrl ? '' : 'hidden'}>${shareBoxHtml(data.shareUrl)}</div>`}
  </section>`;
}

function categoryCards(r, categories, previous) {
  return categories
    .filter((c) => r.score.categories[c.id] != null)
    .map((c) => {
      const v = r.score.categories[c.id];
      const prev = previous?.categories?.[c.id];
      const d = prev != null && v !== prev ? v - prev : null;
      return `<button class="cat-card" data-goto="${c.id}" aria-label="${esc(c.label)}: ${v} de 100. Ver detalhes">
        <span class="cat-name"><i class="ph ph-${CAT_ICON[c.id]}"></i>${esc(c.label)}</span>
        <div class="cat-score"><b>${v}</b>${deltaHtml(d)}</div>
        <div class="meter lvl-${level(v)}"><i style="width:${v}%"></i></div>
        <div class="cat-foot">${levelBadge(v)}</div>
      </button>`;
    })
    .join('');
}

// Aba "Visão geral": notas por área, 3 prioridades e posição frente aos concorrentes
function overviewSection(r, categories, previous, cmp, discovery) {
  const top = [...r.actionPlan.now, ...r.actionPlan.next].slice(0, 3);
  const prio = top.length
    ? `<div class="prio-grid">${top
        .map((i, n) => `<div class="prio">
          <div class="prio-head"><span class="prio-n">${n + 1}</span>${statusBadge(i.status)}<span class="badge badge-neutral"><i class="ph ph-${CAT_ICON[i.category]}"></i>${esc(catLabel(i.category))}</span></div>
          <h4>${esc(i.title)}</h4>
          <p>${esc(i.fix)}</p>
        </div>`)
        .join('')}</div>`
    : '<p class="mute">Nenhuma melhoria pendente.</p>';
  let rival = '';
  if (cmp) {
    const me = cmp.ranking.find((x) => x.isMain);
    const best = cmp.ranking[0];
    rival = `<section class="card">
      <div class="card-title"><h2>Frente aos concorrentes</h2><button class="btn btn-sm btn-ghost" data-gotab="concorrentes">Ver comparação<i class="ph ph-arrow-right btn-icon-slide"></i></button></div>
      <div class="rival-row">
        <div class="rank me"><span class="caption">${me.position}º de ${cmp.ranking.length} na nota</span><br><b>${me.overall ?? '–'}</b><small>você</small></div>
        ${best.isMain ? '' : `<div class="rank"><span class="caption">Melhor concorrente</span><br><b>${best.overall ?? '–'}</b><small>${esc(best.name)}</small></div>`}
        ${discovery && !discovery.error ? `<div class="rank"><span class="caption">No Google para “${esc(discovery.query)}”</span><br><b>${discovery.clientPosition ? `${discovery.clientPosition}º` : '—'}</b><small>${serpBadge(discovery)}</small></div>` : ''}
        ${cmp.insights[0] ? `<div class="rival-insight"><span class="caption">Maior diferença</span><p>${esc(cmp.insights[0].text)}</p></div>` : ''}
      </div>
    </section>`;
  } else if (discovery?.error) {
    rival = `<div class="error-box"><i class="ph ph-warning"></i>${esc(discovery.error)}</div>`;
  }
  return `<section class="card">
      <div class="card-title"><h2>Nota por área</h2><span class="caption">${previous ? `Variação vs. ${dateBR(previous.createdAt)} · ` : ''}Clique numa área para ver os detalhes</span></div>
      <div class="cat-grid">${categoryCards(r, categories, previous)}</div>
    </section>
    <section class="card">
      <div class="card-title"><h2>Comece por aqui</h2><button class="btn btn-sm btn-ghost" data-gotab="plano">Plano completo (${r.actionPlan.total})<i class="ph ph-arrow-right btn-icon-slide"></i></button></div>
      ${prio}
    </section>
    ${rival}`;
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

function discoveryHtml(d, cmp) {
  if (!d) return '';
  if (d.error) return `<div class="error-box"><i class="ph ph-warning"></i>${esc(d.error)}</div>`;
  const colorOf = (url) => {
    const i = cmp?.sites?.findIndex((s) => s.url === url || host(s.url) === host(url));
    if (!(i > 0)) return '';
    return i < 3 ? `<i class="sw" style="background:${SERIES[i]}"></i>` : '<i class="sw swatch-hatch"></i>';
  };
  const mine = d.clientPosition ? `<b>${d.clientPosition}º</b> lugar no Google` : `não aparece entre os ${d.searchedResults || 20} primeiros resultados`;
  const rows = d.competitors
    .map((c) => `<li><div class="serp-pos"><b>${c.position}º</b><span>no Google</span></div>
      <div class="serp-main"><b>${colorOf(c.url)}${esc(host(c.url))}</b><span title="${esc(c.title)}">${esc(c.title)}</span>${c.note ? `<span class="caption">${esc(c.note)}</span>` : ''}</div></li>`)
    .join('');
  const failed = (d.failed || []).length ? `<span class="caption">Não abriram e foram trocados pelo próximo resultado: ${d.failed.map((f) => esc(host(f.url))).join(', ')}.</span>` : '';
  const skipped = (d.skipped || []).length ? `<span class="caption">Ignorados por serem diretórios, redes sociais ou portais: ${[...new Set(d.skipped.map((x) => host(x.url)))].slice(0, 6).map(esc).join(', ')}.</span>` : '';
  return `<div class="discovery">
    <div class="discovery-head">
      <div><span class="eyebrow">Busca no Google</span><h3 style="margin:6px 0 0">“${esc(d.query)}”</h3><p class="mute body-sm">Seu site: ${mine}.</p></div>
      ${serpBadge(d)}
    </div>
    ${rows ? `<ul class="serp">${rows}</ul>` : '<p class="mute">Nenhum concorrente direto encontrado nos resultados. Tente um nicho mais específico, com a cidade.</p>'}
    <div class="discovery-foot">${failed}${skipped}</div>
  </div>`;
}

function serpBadge(d) {
  const ahead = d.competitors.filter((c) => !d.clientPosition || c.position < d.clientPosition).length;
  if (!d.clientPosition) return '<span class="badge badge-danger"><i class="ph ph-x"></i>Fora dos primeiros resultados</span>';
  if (!ahead) return '<span class="badge badge-success"><i class="ph ph-check"></i>À frente dos concorrentes</span>';
  return `<span class="badge badge-warning"><i class="ph ph-warning"></i>Atrás de ${ahead} concorrente${ahead > 1 ? 's' : ''}</span>`;
}

function discoveryOnlySection(d) {
  if (!d) return '';
  return `<section class="card" id="comparacao"><div class="card-title"><h2>Concorrentes</h2></div>${discoveryHtml(d, null)}</section>`;
}

/** Subabas horizontais: [{ id, label, count?, html }] */
function subTabs(group, items, extraClass = '') {
  const list = items.filter(Boolean);
  return `<div class="tabs ${extraClass}" role="tablist">${list.map((t, i) => `<button class="tab" role="tab" data-tg="${group}" data-tk="${t.id}" aria-selected="${i === 0}">${t.icon ? `<i class="ph ph-${t.icon}"></i>` : ''}${t.label}${t.count != null ? ` <span class="tab-count">${t.count}</span>` : ''}</button>`).join('')}</div>
    ${list.map((t, i) => `<div class="sub-panel" role="tabpanel" data-tgp="${group}" data-tk="${t.id}" ${i === 0 ? '' : 'hidden'}><h3 class="print-only">${t.label}</h3>${t.html}</div>`).join('')}`;
}

function comparisonSection(cmp, competitors, discovery) {
  const failed = competitors.filter((c) => c.error);
  const legend = cmp.sites.map((s, i) => `<span>${SERIES_SWATCH(i)}${esc(s.name)}${s.isMain ? ' (você)' : ''}</span>`).join('');
  const ranking = cmp.ranking.map((r) => `<div class="rank ${r.isMain ? 'me' : ''}"><span class="caption">${r.position}º na nota</span><br><b>${r.overall ?? '–'}</b><small>${esc(r.name)}${r.isMain ? ' · você' : ''}</small></div>`).join('');
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
    ${failed.map((f) => `<div class="error-box"><i class="ph ph-warning"></i>Não foi possível analisar ${esc(host(f.url))}: ${esc(f.error)}</div>`).join('')}
    ${subTabs('cmp', [
      {
        id: 'resumo', label: 'Resumo', icon: 'trophy',
        html: `<div class="cmp-summary">
          <div>${discoveryHtml(discovery, cmp)}<div class="ranking">${ranking}</div></div>
          <div><h3>Notas por área</h3><div class="legend">${legend}</div><div class="chart" id="cmp-chart"></div>
          <details style="margin-top:10px"><summary class="caption" style="cursor:pointer">Ver como tabela</summary><div class="table-wrap" style="margin-top:8px"><table class="ds-table"><thead>${head}</thead><tbody>${catRows}</tbody></table></div></details></div>
        </div>`,
      },
      {
        id: 'perde', label: 'Onde você perde', icon: 'trend-down', count: cmp.insights.length + cmp.theyDo.length,
        html: `<div class="cmp-grid" style="margin-top:0">
          <div><h3>Números em que você fica atrás</h3><ul class="insight-list">${insights}</ul></div>
          <div><h3>O que eles fazem e você não</h3><ul class="insight-list">${theyDo}</ul></div>
        </div>${adv}`,
      },
      { id: 'numeros', label: 'Números lado a lado', icon: 'table', html: `<div class="table-wrap"><table class="ds-table"><thead>${head}</thead><tbody>${metricRows}</tbody></table></div><p class="caption" style="margin-top:8px">★ melhor resultado entre os sites.</p>` },
      cmp.gallery?.length ? { id: 'visual', label: 'Visual lado a lado', icon: 'images', html: galleryHtml(cmp) } : null,
    ])}
  </section>`;
}

function galleryHtml(cmp) {
  const tabs = cmp.gallery.map((g, i) => `<button class="tab tab-sm" role="tab" data-tg="gal" data-tk="${g.id}" aria-selected="${i === 0}">${esc(g.label)}</button>`).join('');
  const panels = cmp.gallery
    .map((g, i) => `<div class="gallery-panel" data-tgp="gal" data-tk="${g.id}" ${i === 0 ? '' : 'hidden'}>
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
  return `<div class="tabs tabs-sub" role="tablist">${tabs}</div>${panels}<p class="caption" style="margin-top:8px">Clique numa imagem para ampliar.</p>`;
}

function planCompetitors(id) {
  const rows = COMPARE?.byCheck?.[id]?.filter((r) => r.status === 'ok');
  if (!rows?.length) return '';
  return `<p class="vs-note"><i class="ph ph-flag-checkered"></i><span>Já fazem bem: ${rows.map((r) => `<b>${esc(r.name)}</b>${r.value != null && r.value !== '' ? ` (${esc(r.value)})` : ''}`).join(', ')}</span></p>`;
}

// Item recolhível: a linha mostra o essencial; o conteúdo abre ao clicar
function accordionRow({ status, title, value, tags = '', body, open = false }) {
  return `<details class="acc"${open ? ' open' : ''}>
    <summary><span class="acc-status">${statusBadge(status)}</span><span class="acc-title">${esc(title)}</span>${tags ? `<span class="acc-tags">${tags}</span>` : ''}${value != null && value !== '' ? `<span class="acc-val">${esc(value)}</span>` : ''}<i class="ph ph-caret-down acc-caret"></i></summary>
    <div class="acc-body">${body}</div>
  </details>`;
}

function planSection(r) {
  const p = r.actionPlan;
  const list = (items, note) =>
    items.length
      ? `<p class="caption" style="margin:0 0 10px">${note}</p><div class="acc-list">${items
          .map((i, n) =>
            accordionRow({
              status: i.status,
              title: i.title,
              tags: `<span class="badge badge-neutral">${IMPACT_LABEL[i.impact]}</span><span class="badge badge-neutral">${EFFORT_LABEL[i.effort]}</span><span class="badge badge-neutral"><i class="ph ph-${CAT_ICON[i.category]}"></i>${esc(catLabel(i.category))}</span>`,
              open: n === 0,
              body: `<p>${esc(i.problem)}</p><p class="how"><b>O que fazer:</b> ${esc(i.fix)}</p>${evidenceHtml(r.checks.find((c) => c.id === i.id)?.evidence, 2)}${planCompetitors(i.id)}`,
            }),
          )
          .join('')}</div>`
      : '<p class="mute">Nada nesta etapa.</p>';
  return `<section class="card" id="plano">
    ${p.total === 0 ? '<p>Nenhuma melhoria pendente. Excelente trabalho!</p>' : subTabs('plan', [
      { id: 'agora', label: 'Faça agora', icon: 'rocket-launch', count: p.now.length, html: list(p.now, 'Alto impacto e fácil de resolver. Comece por aqui.') },
      { id: 'proximos', label: 'Próximos passos', icon: 'calendar', count: p.next.length, html: list(p.next, 'Importante, mas exige um pouco mais de trabalho.') },
      { id: 'continuas', label: 'Melhorias contínuas', icon: 'wrench', count: p.later.length, html: list(p.later, 'Ajustes finos para lapidar a página.') },
    ])}
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

const competitorMini = (id) => {
  const rows = COMPARE?.byCheck?.[id];
  if (!rows?.length) return '';
  return rows.map((r) => `<span class="dot-st st-${r.status || 'info'}" title="${esc(r.name)}: ${r.status ? STATUS[r.status].label : 'sem dados'}"></span>`).join('');
};

function detailSection(r, categories) {
  const cats = categories.filter((c) => r.checks.some((k) => k.category === c.id));
  const order = { fail: 0, warn: 1, info: 2, ok: 3 };
  return `<section class="card" id="detalhes">
    <div class="detail-tools"><span class="caption">${COMPARE ? 'Os pontos à direita mostram como cada concorrente foi no mesmo item. ' : ''}Clique num item para ver detalhes, imagem e como corrigir.</span>
      <button class="btn btn-sm btn-ghost" data-action="toggle-all"><i class="ph ph-arrows-out-simple"></i><span>Abrir todos</span></button></div>
    ${subTabs(
      'cat',
      cats.map((c) => {
        const items = r.checks.filter((k) => k.category === c.id).sort((a, b) => order[a.status] - order[b.status]);
        return {
          id: c.id,
          label: esc(c.label),
          icon: CAT_ICON[c.id],
          count: r.score.categories[c.id] ?? '–',
          html: `<div class="acc-list">${items
            .map((k) =>
              accordionRow({
                status: k.status,
                title: k.title,
                value: k.value,
                tags: competitorMini(k.id),
                body: `${k.detail ? `<p>${esc(k.detail)}</p>` : ''}
                  ${k.fix && k.status !== 'ok' ? `<p class="how"><b>Como melhorar:</b> ${esc(k.fix)}</p>` : ''}
                  ${evidenceHtml(k.evidence)}
                  ${k.items?.length ? `<details class="items"><summary>Ver itens (${k.items.length})</summary><ul>${k.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}
                  ${competitorRows(k.id, k)}`,
              }),
            )
            .join('')}</div>`,
        };
      }),
      'tabs-cat',
    )}
  </section>`;
}

function wire(root, cmp, hist, data) {
  const currentId = data.id;
  // Abas e subabas: botões [data-tg][data-tk] controlam painéis [data-tgp][data-tk] do mesmo grupo
  const selectTab = (group, key) => {
    $$(`[data-tg="${group}"]`, root).forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tk === key)));
    $$(`[data-tgp="${group}"]`, root).forEach((p) => (p.hidden = p.dataset.tk !== key));
    // Na barra que rola de lado (celular), mantém a aba escolhida à vista
    $(`[data-tg="${group}"][data-tk="${key}"]`, root)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    draw();
  };
  $$('[data-tg]', root).forEach((t) =>
    t.addEventListener('click', () => {
      selectTab(t.dataset.tg, t.dataset.tk);
      if (t.dataset.tg === 'main') scrollToTabs();
    }),
  );
  const scrollToTabs = () => {
    const bar = $('.rtabs', root);
    const top = bar.getBoundingClientRect().top + window.scrollY - 64;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  };
  $$('[data-gotab]', root).forEach((b) => b.addEventListener('click', () => { selectTab('main', b.dataset.gotab); scrollToTabs(); }));
  $$('[data-goto]', root).forEach((b) =>
    b.addEventListener('click', () => {
      selectTab('main', 'detalhes');
      selectTab('cat', b.dataset.goto);
      scrollToTabs();
    }),
  );
  $$('[data-action="toggle-all"]', root).forEach((b) =>
    b.addEventListener('click', () => {
      const panel = $$('.sub-panel[data-tgp="cat"]', root).find((p) => !p.hidden);
      const items = $$('details.acc', panel);
      const open = !items.every((d) => d.open);
      items.forEach((d) => (d.open = open));
      b.innerHTML = `<i class="ph ph-arrows-${open ? 'in' : 'out'}-simple"></i><span>${open ? 'Fechar todos' : 'Abrir todos'}</span>`;
    }),
  );
  $$('[data-action="print"]', root).forEach((b) => b.addEventListener('click', () => window.print()));
  const copy = async (text, msg) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(msg);
    } catch {
      prompt('Copie o link:', text);
    }
  };
  $$('[data-action="copy-internal"]', root).forEach((b) => b.addEventListener('click', () => copy(absUrl(`/r/${currentId}`), 'Link interno copiado (exige login)')));
  const box = $('#share-box', root);
  $$('[data-action="share-client"]', root).forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        const { shareUrl } = await api(`/api/reports/${currentId}/share`, { method: 'POST' });
        box.innerHTML = shareBoxHtml(shareUrl);
        box.hidden = false;
        copy(absUrl(shareUrl), 'Link do cliente copiado');
      } catch (ex) {
        toast(ex.message);
      }
    }),
  );
  box?.addEventListener('click', async (e) => {
    if (e.target.closest('[data-action="copy-share"]')) copy($('input', box).value, 'Link do cliente copiado');
    if (e.target.closest('[data-action="revoke-share"]')) {
      if (!confirm('Desativar o link? Quem tiver o endereço não conseguirá mais abrir o relatório.')) return;
      try {
        await api(`/api/reports/${currentId}/share`, { method: 'DELETE' });
        box.hidden = true;
        box.innerHTML = '';
        toast('Link desativado');
      } catch (ex) {
        toast(ex.message);
      }
    }
  });
  // Gráficos desenhados na largura real (texto no tamanho do sistema), só quando visíveis,
  // e refeitos ao trocar de aba ou redimensionar
  function draw() {
    const cmpEl = $('#cmp-chart', root);
    const evoEl = $('#evo-chart', root);
    if (cmp && cmpEl?.offsetParent) drawComparisonChart(cmpEl, cmp);
    if (hist.length > 1 && evoEl?.offsetParent) drawEvolutionChart(evoEl, hist, currentId);
  }
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
      go(`/r/${h.id}`);
    });
  });
}

// Impressão/PDF: abre todos os itens recolhidos e volta ao estado anterior depois
let printOpened = [];
window.addEventListener('beforeprint', () => {
  printOpened = $$('#report details:not([open])');
  printOpened.forEach((d) => (d.open = true));
});
window.addEventListener('afterprint', () => printOpened.forEach((d) => (d.open = false)));

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
