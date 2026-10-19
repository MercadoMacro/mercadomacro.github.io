/* Outra apresentação para os mesmos dados da watchlist confirmada da conta. */
(() => {
  const core = globalThis.MMWatchTable, grid = document.getElementById('grid-watch');
  if (!core || !grid) return;
  const root = document.createElement('div'); root.className = 'wt';
  root.innerHTML = `<div class="wt-toolbar"><div class="wt-modes" role="group" aria-label="Visualização da watchlist">
    <button type="button" class="btn-sm" data-wt-mode="table">Tabela</button><button type="button" class="btn-sm" data-wt-mode="cards">Cards</button></div>
    </div>
    <div class="wt-table-wrap"><table aria-label="Minha watchlist"><thead><tr>
      <th scope="col" data-wt-col="symbol"><button type="button" data-wt-sort="symbol">Ativo</button></th>
      <th scope="col" data-wt-col="price"><button type="button" data-wt-sort="price" title="Ordenação numérica; moedas diferentes não são convertidas">Preço</button></th>
      <th scope="col" data-wt-col="change"><button type="button" data-wt-sort="change">Dia</button></th>
      <th scope="col"><span class="wt-sr">Ações</span></th>
    </tr></thead><tbody></tbody></table></div><div class="wt-status" role="status"></div>`;
  grid.before(root);
  const modes = root.querySelector('.wt-modes'), bar = document.querySelector('#watchlists-controls .wls-bar');
  if (bar) { bar.insertBefore(modes, bar.querySelector('#wl-form')); root.querySelector('.wt-toolbar').remove(); }

  const wrap = root.querySelector('.wt-table-wrap'), body = root.querySelector('tbody'), status = root.querySelector('.wt-status');
  let user = null, state = { rows: [], loading: false }, prefs = core.preferences();
  const key = () => 'trader_watch_table_v1:' + user;
  function save() { if (!user || window.__mmLoggingOut) return; try { localStorage.setItem(key(), JSON.stringify(prefs)); } catch { /* sem armazenamento */ } }
  const text = (tag, value, cls) => { const e = document.createElement(tag); e.textContent = value; if (cls) e.className = cls; return e; };
  function original(symbol) { return [...grid.querySelectorAll('.wl-card')].find(c => c.dataset.symbol === symbol); }
  function render() {
    grid.hidden = prefs.mode === 'table'; wrap.hidden = prefs.mode !== 'table';
    modes.querySelectorAll('[data-wt-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.wtMode === prefs.mode)));
    for (const h of root.querySelectorAll('[data-wt-col]')) {
      const active = h.dataset.wtCol === prefs.sort;
      if (active) h.setAttribute('aria-sort', prefs.direction === 1 ? 'ascending' : 'descending'); else h.removeAttribute('aria-sort');
      h.querySelector('button').textContent = ({ symbol: 'Ativo', price: 'Preço', change: 'Dia' })[h.dataset.wtCol] + (active ? prefs.direction === 1 ? ' ↑' : ' ↓' : ' ↕');
    }
    body.replaceChildren();
    if (!user || window.__mmLoggingOut) { status.textContent = 'Aguardando a identificação da conta.'; return; }
    status.textContent = state.rows.length ? state.loading ? 'Atualizando cotações…' : '' : 'Adicione ativos à sua watchlist acima.';
    for (const r of core.sorted(state.rows, prefs)) {
      const tr = document.createElement('tr'), name = document.createElement('td');
      const open = text('button', r.symbol.replace(/\.SA$/, ''), 'wt-symbol'); open.type = 'button';
      open.setAttribute('aria-label', 'Abrir gráfico de ' + r.symbol.replace(/\.SA$/, ''));
      open.addEventListener('click', () => original(r.symbol)?.click());
      name.append(open, text('div', r.name, 'wt-name'));
      if (!r.fresh && r.quote) name.append(text('span', 'Salvo', 'wt-saved'));
      else if (!core.number(r.quote?.value)) name.append(text('span', state.loading ? 'Carregando' : 'Sem dados', 'wt-saved'));
      tr.append(name, text('td', core.price(r.quote), 'wt-number'), text('td', core.change(r.quote), 'wt-number ' + (core.number(r.quote?.change) ? r.quote.change > 0 ? 'wt-up' : r.quote.change < 0 ? 'wt-down' : '' : '')));
      const actions = document.createElement('td'), remove = text('button', '×', 'wt-remove'); remove.type = 'button';
      remove.setAttribute('aria-label', 'Remover ' + r.symbol.replace(/\.SA$/, '') + ' da watchlist');
      remove.addEventListener('click', () => original(r.symbol)?.querySelector('[data-wlrm]')?.click()); actions.append(remove); tr.append(actions); body.append(tr);
    }
  }
  modes.querySelectorAll('[data-wt-mode]').forEach(b => b.addEventListener('click', () => { prefs.mode = b.dataset.wtMode; save(); render(); }));
  root.querySelectorAll('[data-wt-sort]').forEach(b => b.addEventListener('click', () => {
    const sort = b.dataset.wtSort; prefs.direction = prefs.sort === sort ? -prefs.direction : sort === 'symbol' ? 1 : -1;
    prefs.sort = sort; save(); render();
  }));
  window.addEventListener('mm-watchlist-table', e => {
    if (user !== e.detail.user) {
      user = e.detail.user; prefs = core.preferences();
      if (user) { try { prefs = core.preferences(JSON.parse(localStorage.getItem(key()) || 'null')); } catch { /* preferências padrão */ } }
    }
    state = e.detail; render();
  });
  document.addEventListener('click', e => { if (e.target.closest?.('[data-act="sair"]')) { user = null; state = { rows: [] }; render(); } });
  render();
  window.dispatchEvent(new Event('mm-watchlist-table-request'));
})();
