/* Radar da lista confirmada da conta. O rascunho fica somente na página atual. */
(() => {
  const core = globalThis.MMWatchRadar, panel = document.getElementById('watch-panel');
  if (!core || !panel) return;
  const section = document.createElement('section'); section.className = 'wr';
  section.setAttribute('aria-label', 'Radar da watchlist');
  section.innerHTML = `<div class="wr-head"><h2>Radar da watchlist</h2><span class="wr-count"></span></div>
    <p class="wr-lead">Movimentos acima do percentil 95 do próprio histórico diário.</p>
    <div class="wr-rows"></div>
    <details class="wr-method"><summary>Como o radar funciona</summary><p>Compara a variação em relação ao fechamento anterior com até 60 retornos diários anteriores, exigindo pelo menos 40. Exclui o pregão analisado, confere o fechamento de referência e rejeita séries com lacunas ou grandes saltos que exigem revisão de ajustes. Fonte: Yahoo Finance. Pode haver atraso. A oscilação parcial do pregão não é uma previsão de fechamento nem explica sua causa.</p></details>
    <div class="wr-actions"><button type="button" class="btn-sm" data-wr-generate>Gerar resumo dos selecionados</button><span class="wr-status" role="status"></span></div>
    <div class="wr-editor" hidden><label for="wr-draft">Resumo para cliente · editável</label><textarea id="wr-draft" rows="7"></textarea><div class="wr-actions"><button type="button" class="btn-sm" data-wr-copy>Copiar texto</button></div></div>`;
  panel.querySelector('#watch-section')?.before(section);
  const rowsEl = section.querySelector('.wr-rows'), count = section.querySelector('.wr-count');
  const generate = section.querySelector('[data-wr-generate]'), editor = section.querySelector('.wr-editor');
  const draft = section.querySelector('textarea'), status = section.querySelector('.wr-status');
  let state = { user: null, rows: [] }, results = [], identity = '', selected = new Set(), seen = new Set();
  const text = (tag, value, cls) => { const el = document.createElement(tag); el.textContent = value; if (cls) el.className = cls; return el; };
  function render() {
    if (window.__mmLoggingOut) { state = { user: null, rows: [] }; }
    const key = String(state.user) + ':' + state.rows.map(r => r.symbol).sort().join(',');
    if (identity !== key) { identity = key; selected.clear(); seen.clear(); draft.value = ''; editor.hidden = true; status.textContent = ''; }
    results = state.rows.map(r => ({ ...r, ...core.analyse(r.quote, r.history) }));
    const unusual = results.filter(r => r.status === 'unusual').sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    for (const r of unusual) if (!seen.has(r.symbol)) { seen.add(r.symbol); selected.add(r.symbol); }
    for (const symbol of selected) if (!unusual.some(r => r.symbol === symbol)) selected.delete(symbol);
    count.textContent = unusual.length ? `${unusual.length} em destaque` : '';
    rowsEl.replaceChildren();
    if (!state.user) rowsEl.append(text('p', 'Aguardando a identificação da conta.', 'wr-muted'));
    else if (!results.length) rowsEl.append(text('p', 'Adicione ativos à sua watchlist para acompanhar os movimentos.', 'wr-muted'));
    else if (!unusual.length) rowsEl.append(text('p', state.loading ? 'Conferindo cotações e histórico…' : 'Nenhum movimento incomum nos ativos com dados válidos.', 'wr-muted'));
    for (const r of unusual) {
      const row = text('div', '', 'wr-row'), label = text('label', '');
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = selected.has(r.symbol);
      checkbox.addEventListener('change', () => { checkbox.checked ? selected.add(r.symbol) : selected.delete(r.symbol); updateButton(); });
      label.append(checkbox, text('span', r.symbol.replace(/\.SA$/, '')));
      const head = text('div', '', 'wr-row-head'); head.append(label, text('strong', core.pct(r.change), r.change < 0 ? 'wr-down' : 'wr-up'));
      const details = document.createElement('details');
      details.append(text('summary', 'Por que apareceu?'), text('p', `Oscilação absoluta de ${Math.abs(r.change).toFixed(2)}%, acima do percentil 95 (${r.threshold.toFixed(2)}%) dos ${r.count} retornos anteriores. Cotação: ${new Date(r.quoteAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília).`));
      row.append(head, details); rowsEl.append(row);
    }
    const unavailable = results.filter(r => !['normal', 'unusual'].includes(r.status));
    if (unavailable.length) {
      const details = document.createElement('details'); details.className = 'wr-unavailable';
      details.append(text('summary', `${unavailable.length} ativo(s) sem comparação válida`));
      unavailable.forEach(r => details.append(text('p', `${r.symbol.replace(/\.SA$/, '')}: ${r.reason}`)));
      rowsEl.append(details);
    }
    updateButton();
  }
  function updateButton() { generate.disabled = !state.user || !selected.size || !!window.__mmLoggingOut; }
  generate.addEventListener('click', () => {
    render();
    if (generate.disabled) return;
    draft.value = core.summary(results.filter(r => selected.has(r.symbol)));
    editor.hidden = false; status.textContent = 'Resumo gerado. Revise e edite antes de copiar.';
    draft.focus();
  });
  section.querySelector('[data-wr-copy]').addEventListener('click', async () => {
    if (window.__mmLoggingOut || !state.user) return;
    try { await navigator.clipboard.writeText(draft.value); status.textContent = 'Texto copiado.'; }
    catch { draft.focus(); draft.select(); status.textContent = 'Texto selecionado. Use Ctrl+C ou Copiar.'; }
  });
  window.addEventListener('mm-watchlist-radar', e => {
    state = e.detail;
    if (!editor.hidden) status.textContent = 'Dados atualizados; o rascunho foi preservado. Gere novamente se desejar.';
    render();
  });
  document.addEventListener('click', e => {
    if (e.target.closest?.('[data-act="sair"]')) {
      state = { user: null, rows: [] };
      render();
    }
  });
  // Fecha dados pessoais e reavalia a idade da cotação mesmo sem novas consultas.
  setInterval(() => { if (window.__mmLoggingOut || panel.classList.contains('active')) render(); }, 30000);
  render();
  window.dispatchEvent(new Event('mm-watchlist-radar-request'));
})();
