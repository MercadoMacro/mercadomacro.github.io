/* Mercado Macro Classic — implementação independente. Sem código de terceiros. */
(function (root) {
  'use strict';
  const FIN = ['n', 'i', 'PV', 'PMT', 'FV'];
  const MAX = 9.999999999e99;
  const number = x => { if (!Number.isFinite(x) || Math.abs(x) > MAX) throw Error('Resultado fora do limite numérico.'); return Object.is(x, -0) ? 0 : x; };
  const integer = (x, lo, hi) => { if (!Number.isInteger(x) || x < lo || x > hi) throw Error(`Informe um inteiro entre ${lo} e ${hi}.`); return x; };
  const round = (x, d = 2) => number(Number(x.toFixed(d)));
  function coefficients(v, rate = v.i) {
    const n = integer(v.n, 0, 10000), i = rate / 100;
    if (i <= -1) throw Error('A taxa deve superar −100% por período.');
    const t = n * Math.log1p(i), begin = v.begin ? 1 + i : 1;
    if (Math.abs(i) < 1e-14) return [1, n, 1];
    // Normalização evita estouro ao resolver taxas e prazos longos.
    if (t >= 0) return [1, -Math.expm1(-t) / i * begin, Math.exp(-t)];
    return [Math.exp(t), Math.expm1(t) / i * begin, 1];
  }
  function balance(v, rate) { const [a, b, c] = coefficients(v, rate); const scale = Math.max(1, Math.abs(v.PV), Math.abs(v.PMT), Math.abs(v.FV)); return (v.PV / scale) * a + (v.PMT / scale) * b + (v.FV / scale) * c; }
  function bisect(fn, a, b) {
    let fa = fn(a); if (fa === 0) return a; if (fn(b) === 0) return b;
    for (let j = 0; j < 160; j++) { const m = (a + b) / 2, fm = fn(m); if (!Number.isFinite(fm)) throw Error('Não foi possível resolver estes valores.'); if (fm === 0 || b - a < 1e-12) return m; if (Math.sign(fa) !== Math.sign(fm)) b = m; else { a = m; fa = fm; } }
    return (a + b) / 2;
  }
  function rateRoot(fn) {
    // Busca em log(1+i), de −99,9999% até 10.000% por período.
    const lo = Math.log(0.000001), hi = Math.log(101), roots = [];
    let a = lo, fa = fn(Math.expm1(a) * 100);
    const points = [0, ...Array.from({ length: 321 }, (_, k) => lo + (hi - lo) * k / 320)].sort((a, b) => a - b);
    for (const b of points) {
      const fb = fn(Math.expm1(b) * 100);
      if (fb === 0) roots.push(b);
      else if (Number.isFinite(fa) && Number.isFinite(fb) && Math.sign(fa) !== Math.sign(fb) && fa !== 0) roots.push(bisect(u => fn(Math.expm1(u) * 100), a, b));
      a = b; fa = fb;
    }
    const unique = roots.filter((r, k) => !roots.slice(0, k).some(x => Math.abs(x - r) < 1e-7));
    if (unique.length !== 1) throw Error(unique.length ? 'Mais de uma taxa possível. Revise o fluxo de caixa.' : 'Taxa não encontrada entre −99,9999% e 10.000%.');
    return number(Math.expm1(unique[0]) * 100);
  }
  function solve(v, key) {
    FIN.forEach(k => number(v[k]));
    if (key === 'n') {
      const i = v.i / 100; if (i <= -1) throw Error('Taxa inválida.');
      let n;
      if (Math.abs(i) < 1e-14) { if (!v.PMT) throw Error('Prazo indeterminado.'); n = -(v.PV + v.FV) / v.PMT; }
      else { const p = v.PMT * (v.begin ? 1 + i : 1) / i; const q = (p - v.FV) / (v.PV + p); if (!(q > 0)) throw Error('Não há prazo válido para estes sinais e valores.'); n = Math.log(q) / Math.log1p(i); }
      if (!Number.isFinite(n) || n < 0 || n > 10000) throw Error('Prazo fora do intervalo de 0 a 10.000 períodos.');
      return Math.ceil(n - 1e-9 * Math.max(1, n));
    }
    if (key === 'i') { if (v.n === 0 || [v.PV, v.PMT, v.FV].every(x => x === 0)) throw Error('Taxa indeterminada.'); return rateRoot(r => balance(v, r)); }
    const [a, b, c] = coefficients(v), coef = { PV: a, PMT: b, FV: c }, z = { ...v, [key]: 0 };
    if (!coef[key]) throw Error('Não há solução única.');
    return number(-(z.PV * a + z.PMT * b + z.FV * c) / coef[key]);
  }
  function npv(flows, rate) {
    if (!(rate > -100)) throw Error('Taxa deve superar −100%.');
    let sum = 0, correction = 0;
    flows.forEach((x, t) => { const term = x * Math.exp(-t * Math.log1p(rate / 100)) - correction, next = sum + term; correction = (next - sum) - term; sum = next; });
    return number(sum);
  }
  function irr(flows) {
    if (flows.length < 2 || flows.some(x => !Number.isFinite(x))) throw Error('Informe pelo menos dois fluxos válidos.');
    const a = flows.filter(x => x !== 0); let changes = 0;
    for (let j = 1; j < a.length; j++) if (Math.sign(a[j]) !== Math.sign(a[j - 1])) changes++;
    if (changes !== 1) throw Error('Esta versão exige uma única mudança de sinal para calcular a TIR.');
    const scale = Math.max(...flows.map(Math.abs));
    return rateRoot(r => { const log = Math.log1p(r / 100), offset = log < 0 ? -(flows.length - 1) * log : 0; return flows.reduce((s, x, t) => s + x / scale * Math.exp(-t * log - offset), 0); });
  }
  function decodeDate(x, format) {
    if (x <= 0) throw Error('Data inválida. Use DD,MMAAAA.');
    const first = Math.trunc(x), rest = Math.round((x - first) * 1e6), second = Math.trunc(rest / 10000), year = rest % 10000;
    const day = format === 'DMY' ? first : second, month = format === 'DMY' ? second : first;
    const d = new Date(Date.UTC(year, month - 1, day));
    if (year < 1900 || year > 9999 || d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) throw Error('Data inválida. Use '+(format === 'DMY' ? 'DD,MMAAAA.' : 'MM,DDAAAA.'));
    return d;
  }
  function encodeDate(d, format) { const day = d.getUTCDate(), month = d.getUTCMonth() + 1, year = d.getUTCFullYear(); if (year < 1900 || year > 9999) throw Error('Data fora do intervalo de 1900 a 9999.'); return format === 'DMY' ? day + (month * 10000 + year) / 1e6 : month + (day * 10000 + year) / 1e6; }
  class Calculator {
    constructor() { this.reset(); }
    reset() {
      this.s = [0, 0, 0, 0]; this.lastX = 0; this.entry = ''; this.editing = false; this.lift = false; this.dirty = false;
      this.fin = { n: 0, i: 0, PV: 0, PMT: 0, FV: 0, begin: false }; this.mem = Array(20).fill(0); this.repeats = Array(21).fill(1);
      this.shift = ''; this.pending = ''; this.decimals = 2; this.dateFormat = 'DMY'; this.error = ''; this.message = 'Pronta. Use o teclado ou os botões.';
      this.history = []; this.program = []; this.pc = 0; this.recording = false; this.running = false; this.off = false; this.statCount = 0; this.cashCount = 0;
    }
    snapshot() { return JSON.parse(JSON.stringify(this)); }
    restore(data) {
      if (!data || data.version !== 2 || !data.state) return false;
      const a = data.state;
      if (!Array.isArray(a.s) || a.s.length !== 4 || a.s.some(x => !Number.isFinite(x)) || !Array.isArray(a.mem) || a.mem.length !== 20 || a.mem.some(x => !Number.isFinite(x)) || !a.fin || FIN.some(k => !Number.isFinite(a.fin[k])) || typeof a.fin.begin !== 'boolean' || !Number.isInteger(a.decimals) || a.decimals < 0 || a.decimals > 9 || !['DMY', 'MDY'].includes(a.dateFormat)) return false;
      if (!Array.isArray(a.repeats) || a.repeats.length !== 21 || a.repeats.some(x => !Number.isInteger(x) || x < 1 || x > 99) || !Array.isArray(a.program) || a.program.length > 99 || a.program.some(x => typeof x !== 'string' || x.length > 30)) return false;
      this.s = a.s; this.mem = a.mem; this.fin = a.fin; this.repeats = a.repeats; this.program = a.program; this.decimals = a.decimals; this.dateFormat = a.dateFormat;
      this.cashCount = Number.isInteger(a.cashCount) && a.cashCount >= 0 && a.cashCount <= 20 ? a.cashCount : 0;
      this.lastX = Number.isFinite(a.lastX) ? a.lastX : 0; this.lift = true; this.message = 'Memória restaurada neste navegador.'; return true;
    }
    export() { return { version: 2, state: { s: this.s, lastX: this.lastX, cashCount: this.cashCount, fin: this.fin, mem: this.mem, repeats: this.repeats, program: this.program, decimals: this.decimals, dateFormat: this.dateFormat } }; }
    get x() { return this.editing ? Number(this.entry) : this.s[0]; }
    commit() { if (this.editing) { this.s[0] = number(Number(this.entry)); this.entry = ''; this.editing = false; } }
    push(x) { this.s = [number(x), this.s[0], this.s[1], this.s[2]]; }
    result(x, dirty = true) { this.s[0] = number(x); this.entry = ''; this.editing = false; this.lift = true; this.dirty = dirty; }
    recall(x) { if (this.lift) this.push(x); else this.s[0] = x; this.result(x); }
    unary(fn) { const x = this.s[0]; const value = number(fn(x)); this.lastX = x; this.result(value); }
    binary(fn, drop = true) { const [x, y, z, t] = this.s, result = number(fn(y, x)); this.lastX = x; this.s = drop ? [result, z, t, t] : [result, y, z, t]; this.result(result); }
    digit(k) {
      if (!this.editing) { if (this.lift) this.push(this.s[0]); this.entry = ''; this.editing = true; this.lift = false; }
      if (k === '.') { if (!this.entry.includes('.') && !/e/i.test(this.entry)) this.entry = (this.entry || '0') + '.'; }
      else if (this.entry.length < 18) { if (/e[+-]?0$/i.test(this.entry)) this.entry = this.entry.replace(/0$/, k); else this.entry += k; }
      this.dirty = true;
    }
    press(key) {
      if (this.off && key !== 'ON') return;
      const before = this.snapshot(); this.error = '';
      try { this.handle(key); this.s.forEach(number); if (this.history.length > 200) this.history.shift(); }
      catch (e) { Object.assign(this, before); this.error = e.message; this.shift = ''; this.pending = ''; this.running = false; }
    }
    handle(key) {
      if (key === 'ON') { this.off = !this.off; this.shift = ''; this.pending = ''; this.message = this.off ? 'Desligada. A memória foi mantida.' : 'Pronta.'; return; }
      if (key === 'BACKSPACE') {
        if (this.pending || this.shift) { this.pending = ''; this.shift = ''; return; }
        if (this.editing) { this.entry = this.entry.slice(0, -1); if (!this.entry || this.entry === '-') this.entry = '0'; this.entry = this.entry.replace(/e[+-]?$/i, ''); }
        else { this.s[0] = 0; this.lift = false; this.dirty = true; } return;
      }
      if (key === 'f' || key === 'g') { this.shift = this.shift === key ? '' : key; return; }
      if (this.pending.startsWith('GTO')) { if (!/^\d$/.test(key)) throw Error('GTO: informe dois dígitos.'); this.pending += key; if (this.pending.length === 5) { const target = Number(this.pending.slice(3)); integer(target, 0, this.recording ? 99 : this.program.length); this.pending = ''; if (this.recording) this.dispatch('goto:' + target); else this.pc = target === 0 ? 0 : target - 1; } return; }
      if (this.pending.startsWith('STO') || this.pending.startsWith('RCL')) {
        if (key === '.' && !this.pending.endsWith('.')) { this.pending += '.'; return; }
        if (['+', '-', '*', '/'].includes(key) && this.pending === 'STO') { this.pending += key; return; }
        if (this.shift === 'g' && ['n', 'i', 'PV', 'PMT', 'FV'].includes(key) && this.pending === 'RCL') {
          const cmd = { n: 'recallYears', i: 'recallAnnual', PV: 'recallCF0', PMT: 'recallCFj', FV: 'recallNj' }[key]; this.shift = ''; this.pending = ''; this.dispatch(cmd); return;
        }
        if (!/^\d$/.test(key) && !FIN.includes(key)) throw Error('Escolha um registro: 0–9, .0–.9 ou n/i/PV/PMT/FV.');
        this.commit(); const p = this.pending, recall = p.startsWith('RCL'), index = /^\d$/.test(key) ? Number(key) + (p.endsWith('.') ? 10 : 0) : key;
        const cmd = (recall ? 'rcl:' : 'sto:') + index + (['+', '-', '*', '/'].includes(p[3]) ? ':' + p[3] : '');
        this.pending = ''; this.shift = ''; this.dispatch(cmd); return;
      }
      let command = key;
      if (this.shift) { if (this.shift === 'f' && /^\d$/.test(key)) command = 'digits:' + key; else command = (this.shift === 'f' ? Calculator.fMap : Calculator.gMap)[key]; this.shift = ''; if (!command) throw Error('Esta combinação não possui função implementada.'); }
      this.dispatch(command);
    }
    dispatch(command, fromProgram = false) {
      if (command === 'record') { this.commit(); this.recording = !this.recording; this.running = false; this.pc = this.recording ? this.program.length : 0; this.message = this.recording ? 'PRGM: as próximas teclas serão gravadas. f R/S encerra.' : 'Programa pronto. R/S executa.'; return; }
      if (command === 'clearProgram') { this.program = []; this.pc = 0; this.message = 'Programa apagado.'; return; }
      if (command === 'GTO') { this.pending = 'GTO'; return; }
      if (command === 'STO' || command === 'RCL') { this.commit(); this.pending = command; return; }
      if (this.recording && !fromProgram) { if (this.program.length >= 99) throw Error('Limite de 99 instruções.'); this.program.push(command); this.pc = this.program.length; this.message = 'Gravada: ' + command; return; }
      if (/^\d$/.test(command) || command === '.') { this.digit(command); return; }
      if (command === 'CHS') {
        if (this.editing) { if (/e/i.test(this.entry)) this.entry = this.entry.replace(/e([+-]?)/i, (_, sign) => 'e' + (sign === '-' ? '+' : '-')); else this.entry = this.entry.startsWith('-') ? this.entry.slice(1) : '-' + (this.entry || '0'); }
        else this.s[0] = -this.s[0]; this.dirty = true; return;
      }
      if (command === 'EEX') { if (!this.editing) { if (this.lift) this.push(this.s[0]); this.entry = '1'; this.editing = true; this.lift = false; } if (!/e/i.test(this.entry)) this.entry = (this.entry || '1') + 'e+0'; this.dirty = true; return; }
      if (command === 'CLX') { this.s[0] = 0; this.editing = false; this.entry = ''; this.lift = false; this.dirty = false; return; }
      this.commit();
      if (command.startsWith('goto:')) { const target = Number(command.slice(5)); integer(target, 0, this.program.length); this.pc = target === 0 ? 0 : target - 1; if (target === 0) this.running = false; return; }
      const previous = this.s[0];
      if (FIN.includes(command)) {
        if (this.dirty) { if (command === 'n') integer(this.s[0], 0, 10000); this.fin[command] = this.s[0]; this.lift = true; this.dirty = false; this.message = command + ' armazenado.'; }
        else { const x = solve(this.fin, command); this.fin[command] = x; this.result(x, false); this.message = command + ' calculado' + (command === 'i' ? ' (% por período).' : '.'); }
      } else if (command.startsWith('sto:') || command.startsWith('rcl:')) {
        const [op, raw, arithmetic] = command.split(':'), index = /^\d+$/.test(raw) ? integer(Number(raw), 0, 19) : raw;
        if (typeof index !== 'number' && !FIN.includes(index)) throw Error('Registro inválido.');
        const current = typeof index === 'number' ? this.mem[index] : this.fin[index];
        if (op === 'rcl') this.recall(current);
        else { let x = this.s[0]; if (arithmetic) x = number(({ '+': () => current + x, '-': () => current - x, '*': () => current * x, '/': () => current / x })[arithmetic]()); if (index === 'n') integer(x, 0, 10000); if (typeof index === 'number') this.mem[index] = x; else this.fin[index] = x; this.lift = true; this.dirty = false; }
        this.message = (op === 'rcl' ? 'Consultado ' : 'Armazenado ') + (typeof index === 'number' ? 'R' + (index > 9 ? '.' + (index - 10) : index) : index) + '.';
      } else if (command.startsWith('digits:')) { this.decimals = Number(command.slice(7)); this.message = this.decimals + ' casas no visor. A precisão interna foi mantida.'; }
      else switch (command) {
        case 'ENTER': this.push(this.s[0]); this.lift = false; this.dirty = true; break;
        case '+': this.binary((y, x) => y + x); break;
        case '-': this.binary((y, x) => y - x); break;
        case '*': this.binary((y, x) => y * x); break;
        case '/': this.binary((y, x) => y / x); break;
        case 'power': this.binary((y, x) => Math.pow(y, x)); break;
        case 'reciprocal': this.unary(x => 1 / x); break;
        case 'sqrt': this.unary(Math.sqrt); break;
        case 'ln': this.unary(Math.log); break;
        case 'exp': this.unary(Math.exp); break;
        case 'frac': this.unary(x => x - Math.trunc(x)); break;
        case 'int': this.unary(Math.trunc); break;
        case 'factorial': this.unary(x => { integer(x, 0, 69); let p = 1; for (let j = 2; j <= x; j++) p *= j; return p; }); break;
        case 'percent': this.binary((y, x) => y * x / 100, false); break;
        case 'deltaPercent': this.binary((y, x) => 100 * (x - y) / y, false); break;
        case 'percentTotal': this.binary((y, x) => 100 * x / y, false); break;
        case 'swap': [this.s[0], this.s[1]] = [this.s[1], this.s[0]]; this.lift = true; this.dirty = true; break;
        case 'roll': this.s = [this.s[1], this.s[2], this.s[3], this.s[0]]; this.lift = true; this.dirty = true; break;
        case 'lastX': this.recall(this.lastX); break;
        case 'round': this.unary(x => round(x, this.decimals)); break;
        case 'begin': this.fin.begin = true; this.message = 'BEGIN: parcelas no início de cada período.'; break;
        case 'end': this.fin.begin = false; this.message = 'END: parcelas no fim de cada período.'; break;
        case 'times12': this.result(this.s[0] * 12, false); this.fin.n = integer(this.s[0], 0, 10000); break;
        case 'divide12': this.result(this.s[0] / 12, false); this.fin.i = this.s[0]; break;
        case 'recallYears': this.recall(this.fin.n / 12); break;
        case 'recallAnnual': this.recall(this.fin.i * 12); break;
        case 'clearFin': for (const k of FIN) this.fin[k] = 0; this.dirty = false; this.message = 'Registros financeiros zerados.'; break;
        case 'clearReg': this.cashCount = 0; this.s = [0, 0, 0, 0]; this.mem.fill(0); this.repeats.fill(1); for (const k of FIN) this.fin[k] = 0; this.lastX = 0; this.lift = false; this.dirty = false; this.message = 'Registros e fluxos zerados. Programa e configurações mantidos.'; break;
        case 'CF0': this.cashCount = 0; this.mem[0] = this.s[0]; this.fin.n = 0; this.repeats.fill(1); this.lift = true; this.dirty = false; this.message = 'CF₀ armazenado. Digite o próximo fluxo e use g PMT.'; break;
        case 'CFj': { const j = integer(this.fin.n + 1, 1, 20); if (j === 20) this.fin.FV = this.s[0]; else this.mem[j] = this.s[0]; this.repeats[j] = 1; this.fin.n = j; this.cashCount = Math.max(this.cashCount, j); this.lift = true; this.dirty = false; this.message = 'CF' + j + ' armazenado.'; break; }
        case 'Nj': { const j = integer(this.fin.n, 1, 20); this.repeats[j] = integer(this.s[0], 1, 99); this.lift = true; this.dirty = false; this.message = 'CF' + j + ': ' + this.repeats[j] + ' repetições.'; break; }
        case 'recallCF0': this.recall(this.mem[0]); break;
        case 'recallCFj': { const j = integer(this.fin.n, 0, 20); this.recall(j === 20 ? this.fin.FV : this.mem[j]); if (j > 0) this.fin.n--; break; }
        case 'recallNj': this.recall(this.repeats[integer(this.fin.n, 0, 20)]); break;
        case 'NPV': { const x = npv(this.cashFlows(), this.fin.i); this.fin.PV = x; this.result(x, false); this.message = 'VPL à taxa de ' + this.fin.i + '% por período.'; break; }
        case 'IRR': { const x = irr(this.cashFlows()); this.fin.i = x; this.result(x, false); this.message = 'TIR em % por período; taxa armazenada em i.'; break; }
        case 'simpleInterest': { const principal = -this.fin.PV, interest = principal * this.fin.i / 100 * this.fin.n; this.lastX = previous; this.s = [number(interest / 360), principal, number(interest / 365), this.s[3]]; this.lift = true; this.dirty = true; this.message = 'X: juros 360 dias · Y: principal · Z: juros 365 dias.'; break; }
        case 'amort': this.amortize(); break;
        case 'SL': case 'SOYD': case 'DB': this.depreciation(command); break;
        case 'DMY': this.dateFormat = 'DMY'; this.message = 'Datas: DD,MMAAAA (ex.: 08,112026).'; break;
        case 'MDY': this.dateFormat = 'MDY'; this.message = 'Datas: MM,DDAAAA (ex.: 11,082026).'; break;
        case 'DATE': { const date = decodeDate(this.s[1], this.dateFormat); integer(this.s[0], -1000000, 1000000); date.setUTCDate(date.getUTCDate() + this.s[0]); this.binary(() => encodeDate(date, this.dateFormat)); this.message = date.toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' }); break; }
        case 'days': { const d1 = decodeDate(this.s[1], this.dateFormat), d2 = decodeDate(this.s[0], this.dateFormat); const a = d1.getUTCDate(), b = d2.getUTCDate(); const d30 = (d2.getUTCFullYear() - d1.getUTCFullYear()) * 360 + (d2.getUTCMonth() - d1.getUTCMonth()) * 30 + (a === 31 && b === 31 ? 0 : (b === 31 && a >= 30 ? 30 : b) - Math.min(a, 30)); this.lastX = previous; this.s[0] = (d2 - d1) / 86400000; this.s[1] = d30; this.lift = true; this.dirty = true; this.message = 'X: dias corridos · Y: dias na base 30/360.'; break; }
        case 'sigmaPlus': this.accumulate(1); break;
        case 'sigmaMinus': this.accumulate(-1); break;
        case 'clearStats': for (let k = 1; k <= 6; k++) this.mem[k] = 0; this.message = 'Estatística zerada (R1 a R6).'; break;
        case 'mean': this.statResult('mean'); break;
        case 'std': this.statResult('std'); break;
        case 'weighted': if (this.mem[2] === 0) throw Error('A soma dos pesos é zero.'); this.result(this.mem[6] / this.mem[2]); this.message = 'Média de Y ponderada por X.'; break;
        case 'estimateX': case 'estimateY': this.statResult(command); break;
        case 'memory': this.message = this.program.length + '/99 instruções · 20 memórias · 20 grupos de fluxos.'; break;
        case 'prefix': this.message = 'Prefixo cancelado. Use f + 0…9 para definir as casas decimais.'; break;
        case 'unsupported': throw Error('PRICE/YTM de títulos não fazem parte desta versão.');
        case 'R/S': if (fromProgram) { this.running = false; break; } this.running = !this.running; if (this.pc >= this.program.length) this.pc = 0; this.message = this.running ? 'Executando programa…' : 'Programa interrompido.'; break;
        case 'SST': if (this.pc >= this.program.length) this.pc = 0; this.step(); break;
        case 'BST': this.pc = Math.max(0, this.pc - 1); this.message = 'Passo ' + this.pc + '.'; break;
        case 'pause': if (fromProgram) this.pauseUntil = Date.now() + 1000; break;
        case 'xLEy': if (fromProgram && !(this.s[0] <= this.s[1])) this.pc++; break;
        case 'xEQ0': if (fromProgram && this.s[0] !== 0) this.pc++; break;
        default: throw Error('Função indisponível nesta versão.');
      }
      if (!fromProgram && !['SST', 'BST', 'memory'].includes(command)) this.history.push({ key: command, x: this.s[0] });
    }
    cashFlows() { const groups = integer(this.fin.n, 1, 20), flows = [this.mem[0]]; if (groups > this.cashCount) throw Error('Cadastre CF₀ e CFj antes de calcular VPL/TIR; n deve apontar o último grupo.'); for (let j = 1; j <= groups; j++) for (let k = 0; k < this.repeats[j]; k++) flows.push(j === 20 ? this.fin.FV : this.mem[j]); return flows; }
    amortize() {
      const count = integer(this.s[0], 1, 10000), i = this.fin.i / 100; if (i <= -1) throw Error('Taxa inválida.');
      let pv = round(this.fin.PV, this.decimals), interestTotal = 0, principalTotal = 0;
      const payment = round(this.fin.PMT, this.decimals);
      for (let k = 0; k < count; k++) { const interest = this.fin.begin && this.fin.n === 0 && k === 0 ? 0 : round(-pv * i, this.decimals); const principal = round(payment - interest, this.decimals); pv = round(pv + principal, this.decimals); interestTotal += interest; principalTotal += principal; }
      this.fin.PV = number(pv); this.fin.n += count; this.lastX = this.s[0]; this.s = [round(interestTotal, this.decimals), round(principalTotal, this.decimals), count, this.s[3]]; this.lift = true; this.dirty = false; this.message = 'X: juros · Y: principal · PV: saldo restante. n acumula as parcelas amortizadas.';
    }
    depreciation(method) {
      const year = integer(this.s[0], 1, 10000), life = integer(this.fin.n, 1, 10000), cost = this.fin.PV, salvage = this.fin.FV;
      if (year > life || cost < salvage || salvage < 0 || cost < 0) throw Error('Revise custo PV, residual FV, vida útil n e ano X.');
      let book = cost, dep = 0;
      for (let k = 1; k <= year; k++) { dep = method === 'SL' ? (cost - salvage) / life : method === 'SOYD' ? (cost - salvage) * (life - k + 1) / (life * (life + 1) / 2) : book * this.fin.i / 100 / life; if (dep < 0) throw Error('Fator DB inválido.'); dep = Math.min(dep, book - salvage); book -= dep; }
      this.lastX = this.s[0]; this.s[0] = number(dep); this.s[1] = number(book - salvage); this.lift = true; this.dirty = true; this.message = 'X: depreciação do ano · Y: saldo depreciável restante.';
    }
    accumulate(sign) {
      const [x, y] = this.s, m = this.mem;
      if (m[1] + sign < 0) throw Error('Nenhum ponto para remover.');
      m[1] += sign; m[2] += sign * x; m[3] += sign * x * x; m[4] += sign * y; m[5] += sign * y * y; m[6] += sign * x * y;
      m.forEach(number); this.lastX = x; this.result(m[1]); this.lift = false; this.message = m[1] + ' observações. Estatística usa R1 a R6.';
    }
    statResult(kind) {
      const m = this.mem, n = m[1]; if (n < (kind === 'mean' ? 1 : 2)) throw Error('Observações insuficientes.');
      const vx = n * m[3] - m[2] ** 2, vy = n * m[5] - m[4] ** 2, cov = n * m[6] - m[2] * m[4];
      let x, y;
      if (kind === 'mean') { x = m[2] / n; y = m[4] / n; }
      else if (kind === 'std') { x = Math.sqrt(Math.max(0, vx) / (n * (n - 1))); y = Math.sqrt(Math.max(0, vy) / (n * (n - 1))); }
      else { if (vx <= 0 || vy <= 0 || cov === 0) throw Error('Regressão indefinida para estes pontos.'); const slope = cov / vx, intercept = (m[4] - slope * m[2]) / n; x = kind === 'estimateX' ? (this.s[0] - intercept) / slope : intercept + slope * this.s[0]; y = cov / Math.sqrt(vx * vy); }
      this.lastX = this.s[0]; this.s[0] = number(x); this.s[1] = number(y); this.lift = true; this.dirty = true; this.message = kind === 'mean' ? 'X: média de X · Y: média de Y.' : kind === 'std' ? 'X: desvio amostral de X · Y: desvio amostral de Y.' : 'X: estimativa · Y: correlação r.';
    }
    step() {
      if (this.pc >= this.program.length) { this.running = false; this.pc = 0; return; }
      const command = this.program[this.pc++], before = this.snapshot();
      try { this.dispatch(command, true); this.s.forEach(number); if (this.pc >= this.program.length) { this.running = false; this.pc = 0; this.message = 'Programa concluído.'; } }
      catch (e) { Object.assign(this, before); this.running = false; this.error = 'Programa: ' + e.message; }
    }
  }
  Calculator.fMap = { n: 'amort', i: 'simpleInterest', PV: 'NPV', PMT: 'round', FV: 'IRR', power: 'unsupported', reciprocal: 'unsupported', percentTotal: 'SL', deltaPercent: 'SOYD', percent: 'DB', 'R/S': 'record', SST: 'clearStats', roll: 'clearProgram', swap: 'clearFin', CLX: 'clearReg', ENTER: 'prefix' };
  Calculator.gMap = { n: 'times12', i: 'divide12', PV: 'CF0', PMT: 'CFj', FV: 'Nj', CHS: 'DATE', '7': 'begin', '8': 'end', '9': 'memory', power: 'sqrt', reciprocal: 'exp', percentTotal: 'ln', deltaPercent: 'frac', percent: 'int', EEX: 'days', '4': 'DMY', '5': 'MDY', '6': 'weighted', 'R/S': 'pause', SST: 'BST', roll: 'GTO', swap: 'xLEy', CLX: 'xEQ0', ENTER: 'lastX', '1': 'estimateX', '2': 'estimateY', '3': 'factorial', '0': 'mean', '.': 'std', sigmaPlus: 'sigmaMinus' };
  const api = { Calculator, solve, npv, irr, decodeDate, encodeDate, number };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.MMFinance = api;
})(typeof globalThis === 'object' ? globalThis : this);
