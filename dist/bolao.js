'use strict';
(() => {
  const apiUrl = (window.BOLAO_CONFIG?.apiUrl || '').replace(/\/$/, '');
  let session = null, config = null, participants = [], dirty = false, busy = false, invitation = null;
  const originalRender = render, originalSave = save;
  const panel = document.createElement('section');
  panel.id = 'bolao-panel'; panel.className = 'bolao-panel';
  panel.setAttribute('aria-label', 'Bolão compartilhado');
  $('header').after(panel);
  $('.sidebar-bottom small').textContent = 'Envie seus palpites para participar do bolão.';
  const nav = document.createElement('button');
  nav.dataset.view = 'bolao'; nav.innerHTML = '♜ <span>Bolão</span>';
  $('nav').append(nav);
  const stamp = value => value ? new Date(value).toLocaleString('pt-BR') : 'Ainda não enviado';
  const blankPicks = () => defaults().picks;

  async function request(path, method = 'GET', payload) {
    if (!apiUrl) throw new Error('O bolão ainda não foi publicado.');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(apiUrl + path, {
        method, signal: controller.signal, cache: 'no-store',
        headers: { Authorization: `Bearer ${session.token}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
        ...(payload ? { body: JSON.stringify(payload) } : {})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível acessar o bolão.');
      return result;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('O serviço demorou a responder. Seu rascunho continua neste navegador.');
      if (e instanceof TypeError) throw new Error('Sem conexão com o bolão. Seu rascunho continua neste navegador.');
      throw e;
    } finally { clearTimeout(timer); }
  }
  function remember() {
    // O código do organizador fica apenas na memória da página.
    try {
      if (session && !session.admin) sessionStorage.setItem('nba-bolao-session', JSON.stringify({ token: session.token }));
      else sessionStorage.removeItem('nba-bolao-session');
    } catch { /* A sessão ainda funciona quando o armazenamento está bloqueado. */ }
  }
  function cacheState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Exportar backup continua disponível. */ }
  }
  function applySettings(next) {
    config = next;
    state.results = structuredClone(next.results);
    state.points = structuredClone(next.points);
  }
  async function load(restoreDraft = false) {
    if (session.admin) {
      const data = await request('/admin/dashboard');
      participants = data.participants;
      KEY = 'nba-awards-bolao-admin'; state = defaults(); applySettings(data.settings);
    } else {
      const data = await request('/me');
      session.participant = data.participant;
      KEY = 'nba-awards-bolao-' + data.participant.id;
      state = defaults(); state.picks = data.participant.picks || blankPicks();
      applySettings(data.settings);
      if (restoreDraft && !config.closed) {
        try {
          const draft = localStorage.getItem(KEY);
          if (draft) {
            const cached = validate(JSON.parse(draft));
            if (JSON.stringify(cached.picks) !== JSON.stringify(state.picks)) {
              if (confirm('Há um rascunho diferente neste navegador. Deseja recuperá-lo? Ele só será enviado ao clicar em Enviar palpites.')) {
                state.picks = cached.picks; dirty = true;
              }
            }
          }
        } catch { toast('Não foi possível recuperar o rascunho local.'); }
      }
    }
    cacheState(); render();
  }
  function controls() {
    panel.innerHTML = !apiUrl ? '<strong>Bolão em preparação</strong><p>Esta é uma prévia local. Os palpites ainda não são enviados ao organizador.</p>' : !session ? `
      <strong>Entre no bolão</strong><p>Use o código individual recebido do organizador. Guarde seu código para acessar em outro dispositivo.</p>
      <form id="bolao-login" class="bolao-form"><label>Código de acesso<input name="code" type="password" autocomplete="off" required maxlength="256"></label>
      <label class="bolao-check"><input name="admin" type="checkbox"> Sou o organizador</label><button ${busy ? 'disabled' : ''}>${busy ? 'Entrando…' : 'Entrar'}</button></form>` : `
      <strong>${session.admin ? 'Painel do organizador' : 'Olá, ' + esc(session.participant?.name || '')}</strong>
      <p>${config?.closed ? 'Envios encerrados.' : 'Envios abertos.'} ${session.admin ? 'Regras e resultados são compartilhados com todos.' : 'Último envio: ' + esc(stamp(session.participant?.updatedAt)) + '. Alterações ficam como rascunho até você enviar.'}</p>
      <div class="bolao-actions">${session.admin ? '<button data-bolao="settings">Publicar regras e resultados</button><button data-bolao="toggle">' + (config?.closed ? 'Reabrir envios' : 'Encerrar envios') + '</button>' : '<button data-bolao="submit" ' + (config?.closed ? 'disabled' : '') + '>Enviar palpites</button>'}
      <button data-bolao="refresh">Atualizar dados</button><button data-bolao="logout">Sair</button></div>`;
    panel.querySelectorAll('button').forEach(button => { if (busy) button.disabled = true; });
    if (apiUrl) {
      const restricted = !session || busy;
      document.querySelectorAll('[data-pick], [data-clear], [data-points]').forEach(element => {
        const field = element.dataset.field;
        element.disabled = restricted || (session?.admin ? field === 'picks' : element.matches('[data-points]') || field === 'results' || config?.closed);
      });
    }
    if (session) $('#save-state').textContent = busy ? 'Acessando bolão…' : dirty ? 'Rascunho — ainda não publicado' : session.admin ? 'Regras carregadas do bolão' : 'Dados carregados do bolão';
  }
  function dashboard() {
    if (!session?.admin) return heading('Bolão da temporada.', 'Entre com seu convite para enviar os palpites. O organizador acompanha todos pelo painel.') + '<div class="notice">Seus resultados e a pontuação seguem as regras compartilhadas do bolão.</div>';
    return heading('Todos os palpites.', 'Crie um convite para cada participante e acompanhe os envios e a pontuação.') + `
      <form id="bolao-invite" class="bolao-form card"><label>Nome do participante<input name="name" required maxlength="60" placeholder="Nome do seu amigo"></label><button ${busy ? 'disabled' : ''}>Criar convite</button></form>
      ${invitation ? '<div class="notice"><strong>Convite para ' + esc(invitation.name) + '</strong><p>Copie e envie este código em particular. Ele dá acesso aos palpites dessa pessoa e será exibido somente nesta sessão.</p><textarea readonly aria-label="Código do convite">' + esc(invitation.token) + '</textarea><button data-bolao="copy">Copiar código</button></div>' : ''}
      <div class="table-wrap"><table><thead><tr><th>PARTICIPANTE</th><th>PONTOS</th><th>ÚLTIMO ENVIO</th><th>PALPITES</th></tr></thead><tbody>${participants.map(p => '<tr><td>' + esc(p.name) + '</td><td>' + p.score + '</td><td>' + esc(stamp(p.updatedAt)) + '</td><td>' + (p.picks ? '<details><summary>Ver 18 escolhas</summary>' + AWARDS.map(([id, code]) => '<p><b>' + code + '</b>: ' + p.picks[id].map((v, i) => (i + 1) + 'º ' + esc(lookup.get(v)?.name || '—')).join(' · ') + '</p>').join('') + '</details>' : 'Aguardando envio') + '</td></tr>').join('') || '<tr><td colspan="4">Nenhum participante cadastrado.</td></tr>'}</tbody></table></div>
      <button data-bolao="export-all">Exportar todos os palpites</button>`;
  }
  render = function () {
    originalRender();
    if (view === 'bolao') {
      $('#section-label').textContent = 'BOLÃO'; $('#app').innerHTML = dashboard();
    }
    controls();
  };
  save = function () {
    originalSave();
    if (session) { dirty = true; $('#save-state').textContent = 'Rascunho — ainda não publicado'; }
  };
  window.bolaoImport = function (next) {
    if (!apiUrl) return next;
    if (!session) throw new Error('Entre no bolão antes de importar seu backup.');
    if (session.admin) return { ...next, picks: state.picks };
    if (config.closed) throw new Error('Os envios estão encerrados.');
    return { ...next, results: state.results, points: state.points };
  };
  async function perform(action) {
    if (busy) return;
    busy = true; controls();
    try { await action(); }
    catch (e) { toast(e.message); }
    finally { busy = false; render(); }
  }
  document.addEventListener('submit', event => {
    if (event.target.id === 'bolao-login') {
      event.preventDefault();
      const fields = new FormData(event.target), token = String(fields.get('code')).trim(), admin = fields.has('admin');
      perform(async () => {
        session = { token, admin }; dirty = false;
        try { await load(true); remember(); view = admin ? 'bolao' : 'palpites'; location.hash = view; }
        catch (e) { session = null; remember(); throw e; }
      });
    }
    if (event.target.id === 'bolao-invite') {
      event.preventDefault(); const name = new FormData(event.target).get('name');
      perform(async () => {
        if (dirty) throw new Error('Publique as alterações de regras e resultados antes de criar um convite.');
        invitation = await request('/admin/participants', 'POST', { name }); await load();
      });
    }
  });
  document.addEventListener('click', event => {
    const action = event.target.closest('[data-bolao]')?.dataset.bolao;
    if (!action) return;
    if (action === 'logout') {
      if (dirty && !confirm('Sair sem enviar as alterações? O rascunho permanece neste navegador.')) return;
      session = null; config = null; participants = []; invitation = null; dirty = false; remember();
      KEY = 'nba-awards-2026-27-v1'; state = defaults(); view = 'palpites'; location.hash = view; render(); return;
    }
    if (action === 'export-all') {
      const blob = new Blob([JSON.stringify({ season: '2026-27', settings: config, participants }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'nba-bolao-todos.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
    }
    perform(async () => {
      if (action === 'copy') { await navigator.clipboard.writeText(invitation.token); toast('Código copiado.'); return; }
      if (action === 'refresh') {
        if (dirty && !confirm('Descartar as alterações locais e carregar os dados salvos no bolão?')) return;
        await load(); dirty = false; return;
      }
      if (action === 'submit') {
        if (AWARDS.some(([id]) => state.picks[id].some(v => !v))) throw new Error('Complete as 18 escolhas antes de enviar.');
        const result = await request('/picks', 'PUT', { picks: state.picks, revision: session.participant.revision });
        Object.assign(session.participant, result, { picks: structuredClone(state.picks) }); dirty = false; cacheState(); toast('Seus palpites foram salvos no bolão.'); return;
      }
      if (action === 'settings' || action === 'toggle') {
        const closed = action === 'toggle' ? !config.closed : config.closed;
        if (action === 'toggle' && !confirm(closed ? 'Encerrar os envios de todos os participantes e publicar as regras e resultados atuais?' : 'Reabrir os envios e publicar as regras e resultados atuais?')) return;
        const result = await request('/admin/settings', 'PUT', { results: state.results, points: state.points, closed, revision: config.revision });
        applySettings(result.settings); dirty = false; await load(); toast('Bolão atualizado.');
      }
    });
  });
  // Impede ações de edição enquanto uma requisição está em andamento ou sem permissão.
  document.addEventListener('click', event => {
    if (!apiUrl) return;
    const target = event.target.closest('[data-pick], [data-clear], [data-candidate]');
    if (!target) return;
    const field = target.dataset.field || active?.field;
    if (!session || busy || (session.admin ? field === 'picks' : field === 'results' || config?.closed)) {
      event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('hashchange', () => {
    if (location.hash === '#bolao') { view = 'bolao'; render(); }
  });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  if (location.hash === '#bolao') view = 'bolao';
  render();
  try {
    const saved = apiUrl && sessionStorage.getItem('nba-bolao-session');
    if (saved) {
      session = { ...JSON.parse(saved), admin: false };
      perform(async () => { try { await load(true); } catch (e) { session = null; remember(); throw e; } });
    }
  } catch { /* O participante pode entrar novamente com seu código. */ }
})();
