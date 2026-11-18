// Simula a API do servidor dentro da demonstração estática (sem backend).
(function () {
  const D = window.RX_DEMO;
  let me = null;
  const json = (data, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
  // O visualizador bloqueia diálogos nativos; na demo as confirmações são aceitas.
  window.confirm = () => true;
  window.prompt = () => null;

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api/')) return realFetch(input, init);
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : {};
    const path = url.split('?')[0];
    const q = new URLSearchParams(url.split('?')[1] || '');
    let m;

    if (path === '/api/login' && method === 'POST') {
      const u = D.users.find((x) => x.email.toLowerCase() === String(body.email || '').trim().toLowerCase() && !x.disabled);
      if (!u || !body.password) return json({ error: 'E-mail ou senha incorretos.' }, 401);
      me = u;
      return json({ user: u });
    }
    if (path === '/api/logout') { me = null; return json(null, 204); }
    if (path === '/api/me') return me ? json({ user: me }) : json({ error: 'Não autenticado.' }, 401);
    if ((m = path.match(/^\/api\/public\/([^/]+)$/))) {
      const rep = Object.values(D.reports).find((r) => r.shareUrl === `/p/${m[1]}`);
      return rep ? json({ ...rep, public: true, history: [], shareUrl: null, author: null }) : json({ error: 'Este link não existe ou foi desativado.' }, 404);
    }
    if (!me) return json({ error: 'Faça login para continuar.' }, 401);

    if (path === '/api/me/password') return body.current ? json({ ok: true }) : json({ error: 'Senha atual incorreta.' }, 400);
    if (path === '/api/config') {
      const a = D.ai.user || D.ai.team;
      return json({ search: 'serper', ai: a ? { configured: true, source: D.ai.user ? 'user' : 'team', provider: a.provider, providerLabel: a.providerLabel, model: a.model } : { configured: false } });
    }
    if (path === '/api/ai' && method === 'GET') {
      return json({ user: D.ai.user, team: D.ai.team, active: D.ai.user ? 'user' : D.ai.team ? 'team' : null, canEditTeam: me.role === 'admin', providers: D.aiProviders });
    }
    if (path === '/api/ai/test' || (path === '/api/ai' && method === 'PUT')) {
      const models = body.provider === 'openai' ? ['gpt-5', 'gpt-5-mini', 'gpt-4.1'] : ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'];
      const saved = D.ai[body.scope];
      if (!body.apiKey && !(saved && saved.provider === body.provider)) return json({ error: 'Cole a chave de API.' }, 400);
      if (body.apiKey && body.apiKey.length < 20) return json({ error: 'Cole a chave de API completa.' }, 400);
      if (path === '/api/ai/test') return json({ models, defaultModel: models[0] });
      const k = body.apiKey || '';
      D.ai[body.scope] = {
        provider: body.provider,
        providerLabel: D.aiProviders[body.provider].label,
        model: models.includes(body.model) ? body.model : models[0],
        keyMask: k ? `${k.slice(0, k.startsWith('sk-ant-') ? 7 : 3)}…${k.slice(-4)}` : saved.keyMask,
        updatedAt: new Date().toISOString(),
        updatedBy: me.name,
      };
      return json({ saved: D.ai[body.scope], models });
    }
    if (path === '/api/ai' && method === 'DELETE') { D.ai[q.get('scope')] = null; return json(null, 204); }
    if ((m = path.match(/^\/api\/reports\/([^/]+)\/ai$/))) {
      await new Promise((r) => setTimeout(r, 1500));
      return json({ ai: D.reports[m[1]].ai });
    }
    if (path === '/api/analyze') return json({ error: 'Esta é uma demonstração: as análises e a busca de concorrentes rodam no servidor. Abra um dos relatórios do histórico abaixo.' }, 400);
    if (path === '/api/reports') {
      const term = (q.get('q') || '').toLowerCase();
      return json(D.list.filter((r) => D.reports[r.id] && (r.url + ' ' + (r.niche || '')).toLowerCase().includes(term)).map((r) => ({ ...r, shared: !!D.reports[r.id].shareUrl })));
    }
    if ((m = path.match(/^\/api\/reports\/([^/]+)\/share$/))) {
      const rep = D.reports[m[1]];
      if (method === 'POST') { rep.shareUrl ||= `/p/${uid().replace(/-/g, '').slice(0, 24)}`; return json({ shareUrl: rep.shareUrl }); }
      rep.shareUrl = null;
      return json(null, 204);
    }
    if ((m = path.match(/^\/api\/reports\/([^/]+)$/))) {
      if (method === 'DELETE') { delete D.reports[m[1]]; return json(null, 204); }
      const rep = D.reports[m[1]];
      return rep ? json({ ...rep, canDelete: me.role === 'admin', history: rep.history.filter((h) => D.reports[h.id]) }) : json({ error: 'Relatório não encontrado.' }, 404);
    }
    if (path === '/api/users') {
      if (me.role !== 'admin') return json({ error: 'Apenas administradores.' }, 403);
      if (method === 'POST') {
        if (D.users.some((u) => u.email.toLowerCase() === String(body.email).toLowerCase())) return json({ error: 'Já existe uma conta com esse e-mail.' }, 409);
        if (!body.name || !/@/.test(body.email || '')) return json({ error: 'Informe nome e e-mail válidos.' }, 400);
        if (String(body.password || '').length < 8) return json({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400);
        const u = { id: uid(), name: body.name, email: body.email, role: body.role === 'admin' ? 'admin' : 'member', disabled: false, createdAt: new Date().toISOString() };
        D.users.push(u);
        return json(u, 201);
      }
      return json(D.users);
    }
    if ((m = path.match(/^\/api\/users\/([^/]+)$/))) {
      const i = D.users.findIndex((u) => u.id === m[1]);
      if (method === 'DELETE') { D.users.splice(i, 1); return json(null, 204); }
      const u = D.users[i];
      if (body.role) u.role = body.role;
      if (typeof body.disabled === 'boolean') u.disabled = body.disabled;
      return json(u);
    }
    return json({ error: 'Não disponível na demonstração.' }, 404);
  };
})();
