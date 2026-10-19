(() => {
  const grid = document.getElementById('grid-watch');
  if (!grid || document.getElementById('watchlists-controls')) return;
  const root = document.createElement('div'); root.id = 'watchlists-controls'; root.className = 'wls';
  root.innerHTML = `<div class="wls-bar"><label for="wls-select">Lista</label><select id="wls-select" aria-label="Lista de ativos"></select>
    
    <button type="button" class="btn-sm" data-wls="menu" aria-label="Gerenciar lista atual" aria-expanded="false" aria-controls="wls-menu">⋯</button></div>
    <div id="wls-menu" class="wls-menu" hidden><button type="button" class="btn-sm" data-wls="new">Nova lista</button><button type="button" class="btn-sm" data-wls="rename">Renomear lista</button><button type="button" class="btn-sm" data-wls="delete">Excluir lista</button></div>
    <form class="wls-form" hidden><label for="wls-name">Nome da lista</label><input id="wls-name" maxlength="30" required autocomplete="off"><button type="submit" class="btn-sm">Salvar</button><button type="button" class="btn-sm" data-wls="cancel">Cancelar</button></form>
    <div class="wls-confirm" hidden><span></span><button type="button" class="btn-sm" data-wls="confirm-delete">Excluir</button><button type="button" class="btn-sm" data-wls="cancel">Cancelar</button></div>
    <div class="wls-status" role="status"></div><button type="button" class="btn-sm" data-wls="retry" hidden>Tentar novamente</button>`;
  grid.before(root);
  const bar = root.querySelector('.wls-bar'), addForm = document.getElementById('wl-form'), refresh = document.getElementById('wl-refresh-btn');
  if (addForm) { bar.append(addForm); addForm.querySelector('input').placeholder = 'Adicionar ativo…'; const add = addForm.querySelector('button'); add.innerHTML = '<i class="fas fa-plus" aria-hidden="true"></i>'; add.setAttribute('aria-label','Adicionar ativo'); add.title = 'Adicionar ativo'; }
  if (refresh) { bar.append(refresh); refresh.innerHTML = '<i class="fas fa-sync-alt" aria-hidden="true"></i>'; refresh.setAttribute('aria-label','Atualizar cotações'); }

  const picker = root.querySelector('select'), menu = root.querySelector('.wls-menu'), form = root.querySelector('.wls-form');
  const input = form.querySelector('input'), confirm = root.querySelector('.wls-confirm'), status = root.querySelector('.wls-status');
  let state = { user:null, active:'main', lists:[], ready:false, writable:false }, editing = null, editId = null;
  const current = () => state.lists.find(l => l.id === state.active);
  function action(value) { window.dispatchEvent(new CustomEvent('mm-watchlists-action', { detail:value })); }
  function close() {
    menu.hidden = form.hidden = confirm.hidden = true; editing = editId = null; input.setCustomValidity('');
    root.querySelector('[data-wls="menu"]').setAttribute('aria-expanded','false');
  }
  function render() {
    picker.replaceChildren();
    for (const list of state.lists) { const o = document.createElement('option'); o.value = list.id; o.textContent = list.name + ' · ' + list.count; picker.append(o); }
    picker.value = state.active; picker.disabled = !state.ready;
    for (const b of root.querySelectorAll('button[data-wls], .wls-form button')) {
      b.disabled = !state.writable;
      if (b.dataset.wls === 'cancel') b.disabled = false;
      if (b.dataset.wls === 'retry') { b.disabled = false; b.hidden = !state.error; }
    }
    root.querySelector('[data-wls="new"]').disabled = !state.writable || state.lists.length >= 10;
    root.querySelector('[data-wls="delete"]').disabled = !state.writable || state.lists.length <= 1;
    status.textContent = state.error || (state.migrating ? 'Preparando suas listas na conta…' : !state.ready ? 'Confirmando a conta…' : '');
  }
  function edit(kind) {
    if (!state.writable) return;
    close(); editing = kind; editId = state.active;
    form.hidden = false; input.value = kind === 'create' ? '' : current()?.name || '';
    form.querySelector('label').textContent = kind === 'create' ? 'Nome da nova lista' : 'Novo nome da lista';
    input.focus(); input.select();
  }
  picker.addEventListener('change', () => { close(); action({type:'select',id:picker.value}); });
  root.addEventListener('click', e => {
    const b = e.target.closest('button[data-wls]'); if (!b || b.disabled) return;
    const kind = b.dataset.wls;
    if (kind === 'new') return edit('create');
    if (kind === 'rename') return edit('rename');
    if (kind === 'menu') { const show = menu.hidden; close(); menu.hidden = !show; b.setAttribute('aria-expanded',String(show)); return; }
    if (kind === 'cancel') { close(); picker.focus(); return; }
    if (kind === 'retry') { close(); action({type:'retry'}); return; }
    if (kind === 'delete' && state.lists.length > 1) {
      close(); editId = state.active; confirm.hidden = false;
      confirm.querySelector('span').textContent = `Excluir “${current().name}” e seus ${current().count} ativos desta lista?`;
      confirm.querySelector('[data-wls="cancel"]').focus(); return;
    }
    if (kind === 'confirm-delete') { const id = editId; close(); action({type:'remove',id}); picker.focus(); }
  });
  form.addEventListener('submit', e => {
    e.preventDefault(); if (!state.writable) return;
    const name = input.value.trim().replace(/\s+/g,' ');
    const fold = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if (!name || state.lists.some(l => (editing === 'create' || l.id !== editId) && fold(l.name) === fold(name))) {
      input.setCustomValidity('Preencha um nome diferente das outras listas.'); input.reportValidity(); return;
    }
    const request = editing === 'create' ? {type:'create',name,id:crypto.randomUUID?.() || 'list-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)} : {type:'rename',name,id:editId};
    close(); action(request); picker.focus();
  });
  input.addEventListener('input', () => input.setCustomValidity(''));
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { close(); picker.focus(); } });
  window.addEventListener('mm-watchlists-state', e => {
    if (state.user !== e.detail.user || state.active !== e.detail.active) close();
    state = e.detail; render();
  });
  document.addEventListener('click', e => { if (e.target.closest?.('[data-act="sair"]')) { close(); state = {...state,user:null,lists:[],ready:false,writable:false}; render(); } });
  document.addEventListener('click', e => { if (!root.contains(e.target)) close(); });
  render(); window.dispatchEvent(new Event('mm-watchlists-request'));
})();
