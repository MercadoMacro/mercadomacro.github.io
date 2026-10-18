/* Enriquece o gráfico existente com dados reais, mantendo um único ativo selecionado. */
(() => {
  const core = globalThis.MMAssetPanelCore;
  if (!core) return;
  let fundJob = null;
  function ensureFund() {
    if (window.getAssetFundamentals) return Promise.resolve();
    if (fundJob) return fundJob;
    fundJob = new Promise((resolve, reject) => {
      // A guarda do módulo evita inicialização duplicada, inclusive se a aba carregar em paralelo.
      const sc = document.createElement('script'); sc.src = 'fundamentos.js?v=6';
      const timer = setTimeout(() => { fundJob = null; reject(new Error('O carregamento dos fundamentos demorou. Tente novamente.')); }, 20000);
      const done = () => { clearTimeout(timer); if (window.getAssetFundamentals) resolve(); else { fundJob = null; reject(new Error('Fundamentos não disponíveis.')); } };
      sc.addEventListener('load', done, { once: true });
      sc.addEventListener('error', () => { clearTimeout(timer); fundJob = null; sc.remove(); reject(new Error('Não foi possível carregar os fundamentos.')); }, { once: true });
      document.body.appendChild(sc);
    });
    return fundJob;
  }
  const el = (tag, text, cls) => { const e = document.createElement(tag); e.textContent = text; if (cls) e.className = cls; return e; };
  const histories = new Map();
  async function history(symbol) {
    const cached = histories.get(symbol);
    if (cached && Date.now() - cached.time < 15 * 60000) return cached.value;
    const proxy = typeof CORS_PROXY !== 'undefined' ? CORS_PROXY : 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
    const r = await fetchT(proxy + '/history?symbols=' + encodeURIComponent(symbol), {}, 20000);
    if (!r.ok) throw new Error('Histórico indisponível agora.');
    const h = (await r.json())[symbol];
    if (h?.error || !h?.c) throw new Error('Sem histórico para ' + symbol);
    histories.set(symbol, { time: Date.now(), value: h }); return h;
  }
  function draw(container, data, symbol, peer) {
    const ns = 'http://www.w3.org/2000/svg', make = (tag, attrs) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
    const width = Math.max(280, container.clientWidth), height = width < 500 ? 250 : 300;
    const left = 48, right = 16, top = 18, bottom = 38;
    const all = [...data.first, ...data.second], min = Math.min(...all), max = Math.max(...all), pad = Math.max((max - min) * .12, 1);
    const low = min - pad, high = max + pad;
    const dates = data.dates.map(d => Date.parse(d + 'T12:00:00Z')), start = dates[0], end = dates.at(-1);
    const x = i => left + (dates[i] - start) / (end - start) * (width - left - right);
    const y = v => height - bottom - (v - low) / (high - low) * (height - top - bottom);
    const svg = make('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${symbol} e ${peer}, variação de preço em base 100 em datas comuns` });
    const title = make('title', {}); title.textContent = 'Comparação de preços em datas comuns. Sem reinvestimento de proventos.'; svg.append(title);
    for (let i = 0; i < 4; i++) {
      const v = low + (high - low) * i / 3;
      svg.append(make('line', { x1: left, x2: width - right, y1: y(v), y2: y(v), class: 'asset-grid' }));
      const label = make('text', { x: left - 7, y: y(v) + 4, 'text-anchor': 'end' }); label.textContent = v.toFixed(1); svg.append(label);
    }
    for (const [j, values] of [data.first, data.second].entries()) {
      svg.append(make('path', { d: values.map((v, i) => (i ? 'L' : 'M') + x(i) + ',' + y(v)).join(' '), class: j ? 'asset-second' : 'asset-first' }));
    }
    for (const i of [0, data.dates.length - 1]) {
      const label = make('text', { x: x(i), y: height - 12, 'text-anchor': i ? 'end' : 'start' });
      label.textContent = data.dates[i].slice(8) + '/' + data.dates[i].slice(5, 7); svg.append(label);
    }
    container.replaceChildren(svg);
  }
  window.enhanceAssetPanel = (box, symbol, list, normalize) => {
    const dialog = box.querySelector('.wlc-box'), chart = box.querySelector('.wlc-chart');
    let state = box._assetPanel;
    if (!state) {
      const tabs = document.createElement('div'); tabs.className = 'asset-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Informações do ativo');
      const panels = { chart };
      for (const [id, label] of [['chart', 'Gráfico'], ['fund', 'Fundamentos'], ['compare', 'Comparar']]) {
        const button = el('button', label); button.type = 'button'; button.id = 'asset-tab-' + id; button.dataset.assetTab = id;
        button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'asset-panel-' + id); tabs.append(button);
        if (id !== 'chart') { panels[id] = document.createElement('div'); panels[id].className = 'asset-section'; panels[id].hidden = true; dialog.append(panels[id]); }
        panels[id].id = 'asset-panel-' + id; panels[id].setAttribute('role', 'tabpanel'); panels[id].setAttribute('aria-labelledby', button.id);
      }
      chart.before(tabs);
      state = box._assetPanel = { tabs, panels, epoch: 0, symbol, normalize, chartData: null };
      state.select = async id => {
        const epoch = ++state.epoch;
        state.tabs.querySelectorAll('button').forEach(b => { const selected = b.dataset.assetTab === id; b.setAttribute('aria-selected', String(selected)); b.tabIndex = selected ? 0 : -1; });
        for (const [key, panel] of Object.entries(state.panels)) panel.hidden = key !== id;
        if (id === 'chart') { requestAnimationFrame(() => window.dispatchEvent(new Event('resize'))); return; }
        const target = state.panels[id]; target.replaceChildren();
        if (id === 'fund') {
          target.append(el('div', 'Carregando os fundamentos…', 'asset-message'));
          try {
            const requestedSymbol = state.symbol;
            await ensureFund();
            if (state.epoch !== epoch || box.hidden) return;
            const data = await window.getAssetFundamentals(requestedSymbol);
            if (state.epoch !== epoch || box.hidden) return;
            target.replaceChildren();
            if (!data) { target.append(el('p', 'Fundamentos integrados disponíveis para ações brasileiras com cobertura nos dados da CVM. Não há dados para este ativo.')); return; }
            target.append(el('h3', data.name), el('p', `Balanço: ${data.reference || 'não informado'} · Fonte: CVM. ${data.approx ? 'Indicadores de preço aproximados: uma classe sem cotação.' : ''}`));
            const dl = document.createElement('dl'); dl.className = 'asset-kpis';
            for (const [name, value] of data.metrics) { const pair = document.createElement('div'); pair.append(el('dt', name), el('dd', value)); dl.append(pair); }
            target.append(dl, el('p', 'Indicadores de preço usam as cotações disponíveis. Dados ausentes aparecem como —.'));
          } catch (e) { if (state.epoch === epoch) { target.replaceChildren(el('p', e.message)); } }
        } else {
          const form = document.createElement('form'); form.className = 'asset-compare-form';
          const label = el('label', 'Comparar com'); label.htmlFor = 'asset-peer';
          const input = document.createElement('input'); input.id = 'asset-peer'; input.placeholder = 'Ex.: VALE3 ou AAPL'; input.autocomplete = 'off'; input.maxLength = 24;
          input.value = state.list.find(x => x.s !== state.symbol)?.s.replace(/\.SA$/, '') || '';
          const go = el('button', 'Comparar', 'btn-sm'); go.type = 'submit'; form.append(label, input, go);
          const message = el('div', 'Escolha outro ativo para comparar preços em base 100.', 'asset-message'); message.setAttribute('role', 'status');
          const legend = el('div', '', 'asset-legend'), canvas = el('div', '', 'asset-comparison'); target.append(form, message, legend, canvas, el('p', 'Últimos três meses, apenas datas comuns. Fonte: Yahoo Finance. Preços nas moedas de origem, sem conversão cambial ou reinvestimento de proventos.'));
          const run = async () => {
            const peer = state.normalize(input.value);
            if (!peer || peer === state.symbol || !/^[A-Z0-9^=._-]{1,24}$/.test(peer)) { message.textContent = 'Escolha um código válido e diferente do ativo atual.'; return; }
            const token = ++state.epoch; go.disabled = true; message.textContent = 'Carregando históricos…'; canvas.replaceChildren(); legend.replaceChildren(); state.chartData = null;
            try {
              const [a, b] = await Promise.all([history(state.symbol), history(peer)]);
              if (state.epoch !== token || box.hidden) return;
              const data = core.compare(a, b); state.chartData = { canvas, data, symbol: state.symbol, peer };
              for (const [i, name] of [state.symbol, peer].entries()) { const item = el('span', ''); item.append(el('i', '', i ? 'asset-peer' : ''), el('span', name.replace(/\.SA$/, ''))); legend.append(item); }
              draw(canvas, data, state.symbol, peer); message.textContent = `${data.dates.length} datas em comum · ambas as séries começam em 100.`;
            } catch (e) { if (state.epoch === token) message.textContent = e.message; }
            finally { go.disabled = false; }
          };
          form.addEventListener('submit', e => { e.preventDefault(); run(); });
          if (input.value) run();
        }
      };
      tabs.addEventListener('click', e => { const b = e.target.closest('button[data-asset-tab]'); if (b) state.select(b.dataset.assetTab); });
      tabs.addEventListener('keydown', e => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault(); const buttons = [...tabs.querySelectorAll('button')]; const index = buttons.indexOf(document.activeElement);
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus(); state.select(buttons[next].dataset.assetTab);
      });
      new ResizeObserver(() => { const c = state.chartData; if (c && !box.hidden && !state.panels.compare.hidden) draw(c.canvas, c.data, c.symbol, c.peer); }).observe(state.panels.compare);
    }
    state.symbol = symbol; state.list = list; state.normalize = normalize; state.chartData = null; state.select('chart');
  };
})();
