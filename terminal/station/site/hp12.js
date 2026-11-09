/* Mercado Macro Classic — interface local. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), C = MMFinance.Calculator, calc = new C(), storageKey = 'mercadomacro_macro12_v2';
  const fmt = (x, decimals = calc.decimals) => calc.scientific ? x.toExponential(6).replace('.', ',') : Math.abs(x) >= 1e10 || (x !== 0 && Math.abs(x) < 10 ** -Math.max(decimals, 7)) ? x.toExponential(6).replace('.', ',') : x.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const compact = x => x.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
  const keys = [
    ['n','n','AMORT','12×'],['i','i','INT','12÷'],['PV','PV','NPV','CF₀'],['PMT','PMT','RND','CFj'],['FV','FV','IRR','Nj'],['CHS','CHS','','DATE'],['7','7','','BEG'],['8','8','','END'],['9','9','','MEM'],['/','÷','',''],
    ['power','yˣ','PRICE','√x'],['reciprocal','1/x','YTM','eˣ'],['percentTotal','%T','SL','LN'],['deltaPercent','Δ%','SOYD','FRAC'],['percent','%','DB','INTG'],['EEX','EEX','','ΔDYS'],['4','4','','D.MY'],['5','5','','M.DY'],['6','6','','x̄w'],['*','×','',''],
    ['R/S','R/S','P/R','PSE'],['SST','SST','CLEAR Σ','BST'],['roll','R↓','PRGM','GTO'],['swap','x↔y','FIN','x≤y'],['CLX','CLx','REG','x=0'],['ENTER','ENTER','PREFIX','LST x'],['1','1','','x̂,r'],['2','2','','ŷ,r'],['3','3','','n!'],['-','−','',''],
    ['ON','ON','',''],['f','f','',''],['g','g','',''],['STO','STO','',''],['RCL','RCL','',''],['0','0','','x̄'],['.','•','','s'],['sigmaPlus','Σ+','','Σ−'],['+','+','','']
  ];
  if (new URLSearchParams(location.search).get('embed') === '1') document.body.classList.add('embedded');
  const buttons = new Map(), names = Object.fromEntries(keys.map(([key, label]) => [key, label]));
  keys.forEach(([key, label, f, g], index) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'key' + (/^\d$/.test(key) ? ' num' : '') + (key === 'ENTER' ? ' enter' : '') + (key === 'ON' ? ' on' : '') + (key === 'f' || key === 'g' ? ' shift-' + key : ''); b.dataset.key = key;
    if (index >= 30) { b.style.gridRow = 4; b.style.gridColumn = index < 35 ? index - 29 : index - 28; }
    const top = document.createElement('span'); top.className = 'flabel'; top.textContent = f;
    const center = document.createElement('span'); center.textContent = label;
    const bottom = document.createElement('span'); bottom.className = 'glabel'; bottom.textContent = g;
    b.append(top, center, bottom); b.setAttribute('aria-label', label + (f ? '; f: ' + f : '') + (g ? '; g: ' + g : '')); b.onclick = () => press(key); buttons.set(key, b); $('keys').appendChild(b);
  });
  try { const saved = localStorage.getItem(storageKey); if (saved && !calc.restore(JSON.parse(saved))) $('save-state').textContent = 'Memória anterior incompatível; iniciada vazia.'; } catch { $('save-state').textContent = 'Armazenamento local indisponível.'; }
  function save() { try { localStorage.setItem(storageKey, JSON.stringify(calc.export())); $('save-state').textContent = 'Memória salva neste navegador'; } catch { $('save-state').textContent = 'Sessão sem salvamento automático'; } }
  function element(tag, text, cls) { const x = document.createElement(tag); x.textContent = text; if (cls) x.className = cls; return x; }
  function register(label, value, cls) { const div = element('div', '', 'reg' + (cls ? ' ' + cls : '')); div.append(element('b', label), document.createTextNode(compact(value))); return div; }
  function draw() {
    $('display').textContent = calc.off ? '' : calc.error ? (/Error \d/.exec(calc.error)?.[0] || 'Erro') : calc.recording ? calc.programDisplay() : calc.special ? calc.special : calc.editing ? calc.entry.replace('.', ',').replace('e', ' E') : fmt(calc.s[0]);
    $('status').textContent = calc.off ? 'OFF' : [calc.fin.begin ? 'BEGIN' : 'END', calc.fin.compound ? 'C' : '', calc.dateFormat === 'DMY' ? 'D.MY' : 'M.DY', calc.shift, calc.pending, calc.recording ? 'PRGM ' + String(calc.pc).padStart(2, '0') : '', calc.running ? 'RUN ' + String(calc.pc).padStart(2, '0') : ''].filter(Boolean).join(' · ');
    $('stack').textContent = calc.off ? '' : 'Y ' + compact(calc.s[1]) + ' · Z ' + compact(calc.s[2]) + ' · T ' + compact(calc.s[3]);
    $('note').textContent = calc.error || calc.message; $('note').classList.toggle('error', !!calc.error);
    buttons.get('f').classList.toggle('selected', calc.shift === 'f'); buttons.get('g').classList.toggle('selected', calc.shift === 'g');
    $('registers').replaceChildren(...['n','i','PV','PMT','FV'].map(k => register(k + (k === 'i' ? ' (%)' : ''), calc.fin[k])));
    $('mem-grid').replaceChildren(...calc.mem.slice(0,calc.availableRegisters()).map((v, i) => register('R' + (i > 9 ? '.' + (i - 10) : i), v, 'memory')));
    $('steps').replaceChildren(...calc.history.slice(-10).reverse().map(h => { const li = element('li', names[h.key] || h.key); li.append(element('span', fmt(h.x))); return li; }));
    if (!calc.history.length) $('steps').append(element('li', 'Nenhuma operação.'));
    const count = Math.min(calc.cashCount, calc.availableRegisters()), flows = [];
    for (let j = 0; j <= count; j++) { const tr = document.createElement('tr'); tr.append(element('td', 'CF' + j), element('td', fmt(j === calc.availableRegisters() ? calc.fin.FV : calc.mem[j])), element('td', j === 0 ? '1' : String(calc.repeats[j]))); flows.push(tr); }
    $('flows-body').replaceChildren(...flows);
    $('program').replaceChildren(...calc.program.map((p, i) => element('li', String(i + 1).padStart(2, '0') + '  ' + calc.programCode(i) + '  ·  ' + (names[p] || p))));
    if (!calc.program.length) $('program').append(element('li', 'Nenhuma instrução gravada.'));
  }
  let timer = null, iterations = 0;
  function tick() { if (!calc.running) { clearTimeout(timer); timer = null; return; } if (calc.pauseUntil > Date.now()) { timer = setTimeout(tick, 80); return; } calc.step(); iterations++; if (iterations >= 10000) { calc.running = false; calc.error = 'Programa interrompido após 10.000 instruções.'; } draw(); save(); if (calc.running) timer = setTimeout(tick, 30); else timer = null; }
  function press(key) {
    calc.press(key); draw(); save();
    if (calc.running && timer === null) { iterations = 0; timer = setTimeout(tick, 30); }
    const b = buttons.get(key); if (b) { b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 90); }
  }
  $('backspace').onclick = () => press('BACKSPACE');
  $('toggle-memory').onclick = () => { $('memories').hidden = !$('memories').hidden; $('toggle-memory').textContent = $('memories').hidden ? 'Ver memórias' : 'Ocultar memórias'; $('toggle-memory').setAttribute('aria-expanded', String(!$('memories').hidden)); };
  $('copy').onclick = async () => { const text = String(calc.x).replace('.', ','); try { await navigator.clipboard.writeText(text); calc.message = 'Resultado copiado: ' + text; } catch { calc.message = 'Resultado: ' + text + '. A cópia automática não está disponível neste ambiente.'; } draw(); };
  $('clear-history').onclick = () => { calc.history = []; draw(); };
  $('reset').onclick = () => $('reset-dialog').showModal(); $('cancel-reset').onclick = () => $('reset-dialog').close(); $('confirm-reset').onclick = () => { clearTimeout(timer); timer = null; calc.reset(); save(); draw(); $('reset-dialog').close(); };
  function download(name, content) { const blob = new Blob([content], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  $('export-memory').onclick = () => download('mercado-macro-memoria.json', JSON.stringify(calc.export(), null, 2));
  $('import-memory').onclick = () => $('memory-file').click();
  $('memory-file').onchange = async event => { const file = event.target.files[0]; if (!file) return; try { if (file.size > 100000) throw Error('Arquivo de memória grande demais.'); const fresh = new C(); if (!fresh.restore(JSON.parse(await file.text()))) throw Error('Arquivo de memória inválido.'); clearTimeout(timer); timer = null; Object.assign(calc, fresh); calc.message = 'Memória importada.'; save(); } catch (e) { calc.error = e.message; } draw(); event.target.value = ''; };
  const parse = s => { s = s.trim(); if (!s || !/^[+-]?[\d.,]+$/.test(s)) throw Error('Valor inválido no fluxo de caixa.'); const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return MMFinance.number(n); };
  $('apply-flows').onclick = () => {
    try { const lines = $('flow-input').value.trim().split(/\n/); if (lines.length < 1 || lines.length > calc.availableRegisters()+1) throw Error('Informe CF₀ e até ' + calc.availableRegisters() + ' grupos de fluxos.'); const flows = lines.map((line, j) => { const parts = line.split(';'); if (parts.length > 2) throw Error('Use valor;repetições em cada linha.'); const value = parse(parts[0]), count = parts.length > 1 ? parse(parts[1]) : 1; if (!Number.isInteger(count) || count < 0 || count > 99 || (j === 0 && count !== 1)) throw Error('Repetições: 0 a 99; CF₀ deve ter uma.'); return { value, count }; });
      if (calc.recording || calc.running) throw Error('Encerre o programa antes de editar os fluxos.'); calc.mem.fill(0); calc.repeats.fill(1); flows.forEach((f,j) => { if (j === calc.availableRegisters()) calc.fin.FV = f.value; else calc.mem[j] = f.value; calc.repeats[j] = f.count; }); calc.cashCount = flows.length - 1; calc.fin.n = calc.cashCount; calc.dirty = false; calc.message = 'Fluxos aplicados. Cadastre a taxa em i e use f PV para o VPL.'; calc.error = ''; save();
    } catch (e) { calc.error = e.message; } draw();
  };
  const examples = {
    compound: { keys: ['f','CLX','1','2','n','1','i','1','0','0','0','CHS','PV','0','PMT','FV'], caption: '12 n · 1 i · 1000 CHS PV · 0 PMT · FV → 1.126,83' },
    loan: { keys: ['f','CLX','1','2','n','1','i','1','0','0','0','0','PV','0','FV','PMT'], caption: '12 n · 1 i · 10000 PV · 0 FV · PMT → −888,49 por mês (END).' },
    cash: { keys: ['f','CLX','1','0','0','0','CHS','g','PV','6','0','0','g','PMT','2','g','FV','1','0','i','f','PV'], caption: 'CF₀ −1.000 · CFj 600 · Nj 2 · i 10% → VPL 41,32. Agora f FV → TIR 13,07%.' },
    bond: { keys: ['f','CLX','8','.','2','5','i','6','.','7','5','PMT','g','4','2','8','.','0','4','2','0','0','4','ENTER','4','.','0','6','2','0','1','8','f','power'], caption: 'Cupom 6,75% · YTM 8,25% · 28/04/2004 a 04/06/2018 → PRICE 87,62 por 100 de face. x↔y mostra os juros acumulados.' },
    odd: { keys: ['f','CLX','3','6','.','5','n','1','.','2','5','i','4','5','0','0','PV','0','FV','PMT'], caption: '36,5 períodos · i 1,25% · PV 4.500 → PMT; STO EEX alterna o indicador C. Recalcule PMT após mudar o modo.' },
    date: { keys: ['f','CLX','g','4','8','.','1','1','2','0','2','6','ENTER','8','.','1','2','2','0','2','6','g','EEX'], caption: '08/11/2026 ENTER 08/12/2026 · g EEX → 30 dias corridos.' }
  };
  document.querySelectorAll('[data-example]').forEach(b => { b.onclick = () => { clearTimeout(timer); timer = null; calc.running = false; calc.recording = false; calc.off = false; calc.pending = ''; calc.shift = ''; const ex = examples[b.dataset.example]; calc.fin.begin = false; ex.keys.forEach(key => calc.press(key)); $('example-caption').textContent = ex.caption; save(); draw(); }; });
  document.addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey || $('reset-dialog').open) return;
    const map = { Enter: 'ENTER', Backspace: 'BACKSPACE', Escape: calc.pending || calc.shift ? 'BACKSPACE' : 'CLX', ',': '.', '%': 'percent', f: 'f', g: 'g', n: 'n', i: 'i', p: 'PV', v: 'FV', m: 'PMT', c: 'CHS', e: 'EEX' };
    const key = map[e.key] || (/^[0-9.+*/-]$/.test(e.key) ? e.key : null); if (!key) return; e.preventDefault(); press(key);
  });
  draw();
})();
