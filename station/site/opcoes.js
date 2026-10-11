/* =========================================================
   OPÇÕES (aba Opções)
   Arquivo separado do index.html: só é baixado quando a aba é aberta.
   Montador de estratégias com payoff, gregas, cenários, cadeia teórica,
   volatilidade, probabilidades, ferramentas da B3 e trilha de estudo.
   Regra do painel: nada de cotação inventada. Preço do ativo, histórico e Selic
   vêm de fontes reais; prêmios são digitados por você ou calculados pelo
   modelo Black-Scholes e marcados como "teórico".
   ========================================================= */
(() => {
  if (window.__opcoesLoaded) return;
  window.__opcoesLoaded = true;

  const root = document.getElementById('opt-root');
  if (!root) return;

  const PROXY = (typeof CORS_PROXY !== 'undefined' && CORS_PROXY) || 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  const KEY = 'opt_state_v1', SAVED_KEY = 'opt_saved_v1', QUIZ_KEY = 'opt_quiz_v1';
  const DAY = 86400000;

  /* ---------------- utilidades ---------------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (v, d = 2) => (v == null || !isFinite(v)) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const brl = (v, d = 2) => (v == null || !isFinite(v)) ? '—' : (v < 0 ? '−R$ ' : 'R$ ') + nf(Math.abs(v), d);
  const sbrl = (v, d = 2) => (v == null || !isFinite(v)) ? '—' : (Math.abs(v) < 0.005 ? 'R$ 0,00' : (v > 0 ? '+R$ ' : '−R$ ') + nf(Math.abs(v), d));
  const pct = (v, d = 1) => (v == null || !isFinite(v)) ? '—' : nf(v * 100, d) + '%';
  const num = (v, def = 0) => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : def; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const $o = (s, el = root) => el.querySelector(s);
  const $$o = (s, el = root) => [...el.querySelectorAll(s)];
  const uid = () => Math.random().toString(36).slice(2, 9);

  /* ---------------- matemática: normal e Black-Scholes ---------------- */
  // erf com erro < 1,5e-7 (Abramowitz-Stegun 7.1.26)
  function erf(x) {
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const N = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
  const npdf = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

  // preço e gregas por unidade. T em anos, r e q contínuos, sig anual.
  // theta por dia corrido, vega e rho por 1 ponto percentual
  function bs(type, S, K, T, r, sig, q = 0) {
    if (type === 'stock') return { price: S, delta: 1, gamma: 0, theta: 0, vega: 0, rho: 0 };
    const call = type === 'call';
    if (T <= 0 || sig <= 0 || S <= 0 || K <= 0) {
      const iv = call ? Math.max(0, S - K) : Math.max(0, K - S);
      return { price: iv, delta: call ? (S > K ? 1 : 0) : (S < K ? -1 : 0), gamma: 0, theta: 0, vega: 0, rho: 0 };
    }
    const sq = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r - q + sig * sig / 2) * T) / (sig * sq);
    const d2 = d1 - sig * sq;
    const dq = Math.exp(-q * T), dr = Math.exp(-r * T);
    const price = call ? S * dq * N(d1) - K * dr * N(d2) : K * dr * N(-d2) - S * dq * N(-d1);
    const delta = call ? dq * N(d1) : dq * (N(d1) - 1);
    const gamma = dq * npdf(d1) / (S * sig * sq);
    const vega = S * dq * npdf(d1) * sq / 100;
    const thetaY = call
      ? -S * dq * npdf(d1) * sig / (2 * sq) - r * K * dr * N(d2) + q * S * dq * N(d1)
      : -S * dq * npdf(d1) * sig / (2 * sq) + r * K * dr * N(-d2) - q * S * dq * N(-d1);
    const rho = (call ? K * T * dr * N(d2) : -K * T * dr * N(-d2)) / 100;
    return { price, delta, gamma, theta: thetaY / 365, vega, rho, d1, d2 };
  }
  // volatilidade implícita por bisseção (robusta; 0,1% a 500%)
  function impliedVol(type, price, S, K, T, r, q = 0) {
    const intr = type === 'call' ? Math.max(0, S * Math.exp(-q * T) - K * Math.exp(-r * T)) : Math.max(0, K * Math.exp(-r * T) - S * Math.exp(-q * T));
    if (!(price > intr) || T <= 0) return null;
    let lo = 0.001, hi = 5;
    if (bs(type, S, K, T, r, hi, q).price < price) return null;
    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (bs(type, S, K, T, r, mid, q).price > price) hi = mid; else lo = mid;
      if (hi - lo < 1e-6) break;
    }
    return (lo + hi) / 2;
  }
  // probabilidade (neutra a risco, lognormal) de o preço terminar acima de X
  const probAbove = (S, X, T, r, sig, q = 0) => {
    if (T <= 0 || sig <= 0) return S > X ? 1 : 0;
    const d2 = (Math.log(S / X) + (r - q - sig * sig / 2) * T) / (sig * Math.sqrt(T));
    return N(d2);
  };
  const yearsOf = (days) => Math.max(0, days) / 365;

  // passo de strike "redondo" para o preço do ativo
  const strikeStep = (S) => (S < 5 ? 0.25 : S < 20 ? 0.5 : S < 60 ? 1 : S < 150 ? 2 : S < 400 ? 5 : S < 1500 ? 10 : S < 5000 ? 50 : S < 20000 ? 100 : 500);
  const roundK = (x, S) => { const st = strikeStep(S); return Math.round(x / st) * st; };

  /* ---------------- estado ---------------- */
  const DEF = {
    asset: 'PETR4', S: 38, sSrc: '', r: 0.15, rSrc: '', q: 0, vol: 0.30, days: 30, lot: 100,
    tEval: 0, volShift: 0, preset: 'long_call', legs: [], capital: 50000, riskPct: 2, sub: 'builder', hv: null
  };
  let st;
  try { st = { ...DEF, ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) }; } catch (e) { st = { ...DEF }; }
  if (!Array.isArray(st.legs)) st.legs = [];
  let saveT;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* sem espaço */ } }, 250); };
  const rC = () => Math.log(1 + st.r); // Selic anual → taxa contínua

  /* ---------------- biblioteca de estratégias ---------------- */
  // cada perna: { type: call|put|stock, side: +1 compra / -1 venda, K, days, iv, prem, qty, theo }
  const L = (type, side, kMul, extra = {}) => ({ type, side, kMul, ...extra });
  const STRATS = [
    { id: 'long_call', nome: 'Compra de call', bias: 'alta', nivel: 1, legs: [L('call', 1, 1.02)],
      quando: 'Você espera alta forte e quer risco limitado ao prêmio pago.', risco: 'Perde o prêmio se o ativo não passar do strike até o vencimento. O tempo corre contra.' },
    { id: 'long_put', nome: 'Compra de put', bias: 'baixa', nivel: 1, legs: [L('put', 1, 0.98)],
      quando: 'Você espera queda forte, ou quer proteger uma carteira.', risco: 'Perde o prêmio se o ativo não cair abaixo do strike.' },
    { id: 'short_call', nome: 'Venda de call a seco', bias: 'baixa', nivel: 3, legs: [L('call', -1, 1.05)],
      quando: 'Você acha que o ativo não sobe além do strike e quer embolsar o prêmio.', risco: 'Perda ilimitada se o ativo disparar. Exige margem.' },
    { id: 'short_put', nome: 'Venda de put', bias: 'alta', nivel: 2, legs: [L('put', -1, 0.95)],
      quando: 'Você aceitaria comprar o ativo no strike e quer receber para esperar.', risco: 'Se o ativo despencar, você compra no strike (perda até strike menos prêmio). Exige margem ou caixa.' },
    { id: 'covered_call', nome: 'Lançamento coberto', bias: 'neutro', nivel: 1, legs: [L('stock', 1, 1), L('call', -1, 1.05)],
      quando: 'Você tem a ação e quer renda extra, aceitando vendê-la no strike.', risco: 'Limita o ganho na alta e não protege bem uma queda forte da ação.' },
    { id: 'protective_put', nome: 'Put de proteção', bias: 'alta', nivel: 1, legs: [L('stock', 1, 1), L('put', 1, 0.95)],
      quando: 'Você tem a ação e quer um seguro contra queda.', risco: 'O custo do seguro reduz o retorno se nada acontecer.' },
    { id: 'collar', nome: 'Collar (financiado)', bias: 'neutro', nivel: 2, legs: [L('stock', 1, 1), L('put', 1, 0.93), L('call', -1, 1.07)],
      quando: 'Você quer proteção barata: a call vendida paga a put comprada.', risco: 'Abre mão da alta acima do strike da call.' },
    { id: 'bull_call', nome: 'Trava de alta com call', bias: 'alta', nivel: 2, legs: [L('call', 1, 1.0), L('call', -1, 1.08)],
      quando: 'Alta moderada, gastando menos que na call seca.', risco: 'Ganho e perda limitados; perde o débito se não subir.' },
    { id: 'bull_put', nome: 'Trava de alta com put', bias: 'alta', nivel: 2, legs: [L('put', -1, 0.98), L('put', 1, 0.91)],
      quando: 'Você acha que não cai e quer receber crédito.', risco: 'Perda limitada à diferença dos strikes menos o crédito.' },
    { id: 'bear_put', nome: 'Trava de baixa com put', bias: 'baixa', nivel: 2, legs: [L('put', 1, 1.0), L('put', -1, 0.92)],
      quando: 'Queda moderada com custo menor que a put seca.', risco: 'Ganho e perda limitados.' },
    { id: 'bear_call', nome: 'Trava de baixa com call', bias: 'baixa', nivel: 2, legs: [L('call', -1, 1.02), L('call', 1, 1.09)],
      quando: 'Você acha que não sobe e quer receber crédito.', risco: 'Perda limitada à diferença dos strikes menos o crédito.' },
    { id: 'long_straddle', nome: 'Straddle comprado', bias: 'vol', nivel: 2, legs: [L('call', 1, 1), L('put', 1, 1)],
      quando: 'Espera um movimento grande (resultado, Copom) sem saber a direção.', risco: 'Perde os dois prêmios se o ativo ficar parado. Sofre com a queda da volatilidade depois do evento.' },
    { id: 'short_straddle', nome: 'Straddle vendido', bias: 'neutro', nivel: 3, legs: [L('call', -1, 1), L('put', -1, 1)],
      quando: 'Espera o ativo parado e volatilidade caindo.', risco: 'Perda ilimitada para cima e grande para baixo. Só para experientes.' },
    { id: 'long_strangle', nome: 'Strangle comprado', bias: 'vol', nivel: 2, legs: [L('call', 1, 1.06), L('put', 1, 0.94)],
      quando: 'Espera movimento muito grande, gastando menos que no straddle.', risco: 'Precisa de um movimento ainda maior para lucrar.' },
    { id: 'short_strangle', nome: 'Strangle vendido', bias: 'neutro', nivel: 3, legs: [L('call', -1, 1.07), L('put', -1, 0.93)],
      quando: 'Espera o ativo dentro de uma faixa larga.', risco: 'Perda ilimitada fora da faixa. Exige margem.' },
    { id: 'butterfly', nome: 'Borboleta com call', bias: 'neutro', nivel: 2, legs: [L('call', 1, 0.95), L('call', -1, 1, { qtyMul: 2 }), L('call', 1, 1.05)],
      quando: 'Acha que o ativo termina perto de um preço alvo.', risco: 'Perda limitada ao débito; ganho máximo só no strike do meio.' },
    { id: 'iron_condor', nome: 'Iron condor', bias: 'neutro', nivel: 3, legs: [L('put', 1, 0.88), L('put', -1, 0.94), L('call', -1, 1.06), L('call', 1, 1.12)],
      quando: 'Espera o ativo dentro de uma faixa e quer crédito com risco definido.', risco: 'Perda limitada à largura da trava menos o crédito.' },
    { id: 'iron_fly', nome: 'Iron butterfly', bias: 'neutro', nivel: 3, legs: [L('put', 1, 0.92), L('put', -1, 1), L('call', -1, 1), L('call', 1, 1.08)],
      quando: 'Espera o ativo bem perto do preço atual.', risco: 'Perda limitada; a faixa de lucro é estreita.' },
    { id: 'ratio_call', nome: 'Ratio 1x2 com call', bias: 'alta', nivel: 3, legs: [L('call', 1, 1.0), L('call', -1, 1.08, { qtyMul: 2 })],
      quando: 'Alta moderada até o segundo strike, muitas vezes montada sem custo.', risco: 'Perda ilimitada se o ativo disparar acima do segundo strike.' },
    { id: 'calendar', nome: 'Trava de calendário', bias: 'neutro', nivel: 3, legs: [L('call', -1, 1, { dMul: 1 }), L('call', 1, 1, { dMul: 2 })],
      quando: 'Espera o ativo parado até o vencimento curto e lucra com o tempo.', risco: 'Perde se o ativo andar muito em qualquer direção.' },
    { id: 'synthetic_long', nome: 'Compra sintética', bias: 'alta', nivel: 3, legs: [L('call', 1, 1), L('put', -1, 1)],
      quando: 'Replica a compra da ação usando opções (paridade put-call).', risco: 'Mesmo risco de ter a ação, com exigência de margem na put vendida.' }
  ];
  const BIAS = { alta: ['Alta', 'up'], baixa: ['Baixa', 'dn'], neutro: ['Neutro', 'nt'], vol: ['Volatilidade', 'vl'] };

  function buildPreset(id) {
    const s = STRATS.find((x) => x.id === id);
    if (!s) return;
    st.preset = id;
    st.tEval = 0; st.volShift = 0;
    st.legs = s.legs.map((l) => ({
      id: uid(), type: l.type, side: l.side,
      K: l.type === 'stock' ? null : roundK(st.S * l.kMul, st.S),
      days: l.type === 'stock' ? null : Math.round(st.days * (l.dMul || 1)),
      iv: st.vol, qty: st.lot * (l.qtyMul || 1), theo: true, prem: null
    }));
    reprice();
  }
  // perna "teórica": prêmio = Black-Scholes com a vol da perna; perna de ação: preço de entrada = spot
  function reprice() {
    st.legs.forEach((l) => {
      if (l.type === 'stock') { if (l.theo || l.prem == null) { l.prem = st.S; l.theo = true; } return; }
      if (l.theo || l.prem == null) { l.prem = +bs(l.type, st.S, l.K, yearsOf(l.days), rC(), l.iv, st.q).price.toFixed(2); l.theo = true; }
    });
  }

  /* ---------------- avaliação da posição ---------------- */
  const minDays = () => Math.min(...st.legs.filter((l) => l.type !== 'stock').map((l) => l.days), Infinity);
  // valor (P/L em R$) da posição se o ativo estiver em S daqui a t dias
  function plAt(S, t, volShift = st.volShift) {
    let v = 0;
    for (const l of st.legs) {
      if (l.type === 'stock') { v += l.side * (S - l.prem) * l.qty; continue; }
      const rem = l.days - t;
      const val = rem <= 0 ? (l.type === 'call' ? Math.max(0, S - l.K) : Math.max(0, l.K - S))
        : bs(l.type, S, l.K, yearsOf(rem), rC(), Math.max(0.01, l.iv + volShift), st.q).price;
      v += l.side * (val - l.prem) * l.qty;
    }
    return v;
  }
  function greeksAt(S, t) {
    const g = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
    for (const l of st.legs) {
      if (l.type === 'stock') { g.delta += l.side * l.qty; continue; }
      const rem = l.days - t;
      if (rem <= 0) continue;
      const b = bs(l.type, S, l.K, yearsOf(rem), rC(), Math.max(0.01, l.iv + st.volShift), st.q);
      ['delta', 'gamma', 'theta', 'vega', 'rho'].forEach((k) => { g[k] += l.side * b[k] * l.qty; });
    }
    return g;
  }
  const netCost = () => st.legs.reduce((a, l) => a + l.side * (l.prem || 0) * l.qty, 0); // >0 débito, <0 crédito
  // vol de referência para probabilidades: média das pernas de opção ponderada pela quantidade
  const refVol = () => {
    const op = st.legs.filter((l) => l.type !== 'stock');
    if (!op.length) return st.vol;
    const w = op.reduce((a, l) => a + l.qty, 0);
    return op.reduce((a, l) => a + l.iv * l.qty, 0) / w + st.volShift;
  };
  function analyze() {
    if (!st.legs.length) return null;
    const tExp = isFinite(minDays()) ? minDays() : 0;
    const S = st.S;
    // grade fina para máximos, mínimos e pontos de equilíbrio
    const hi = S * 4, n = 1600;
    const xs = [], ys = [];
    for (let i = 0; i <= n; i++) { const x = (hi * i) / n; xs.push(x); ys.push(plAt(x, tExp)); }
    const far = plAt(S * 12, tExp), farPrev = plAt(S * 10, tExp);
    const slopeUp = (far - farPrev) / (S * 2);
    let maxG = Math.max(...ys), maxL = Math.min(...ys);
    const unlimG = slopeUp > 1e-6, unlimL = slopeUp < -1e-6;
    const bes = [];
    for (let i = 1; i <= n; i++) {
      if ((ys[i - 1] < 0 && ys[i] >= 0) || (ys[i - 1] >= 0 && ys[i] < 0)) {
        const x = xs[i - 1] + (xs[i] - xs[i - 1]) * (0 - ys[i - 1]) / ((ys[i] - ys[i - 1]) || 1);
        if (x > 0.0001) bes.push(x);
      }
    }
    // probabilidade de lucro no vencimento (lognormal, vol de referência)
    const sig = refVol(), T = yearsOf(tExp);
    let pop = null, ev = null;
    if (T > 0 && sig > 0) {
      const m = 1400, sd = sig * Math.sqrt(T), mu = Math.log(S) + (rC() - st.q - sig * sig / 2) * T;
      let p = 0, e = 0, tot = 0;
      for (let i = 0; i <= m; i++) {
        const z = -6 + (12 * i) / m, x = Math.exp(mu + z * sd), w = npdf(z);
        const y = plAt(x, tExp);
        tot += w; e += w * y; if (y > 0) p += w;
      }
      pop = p / tot; ev = e / tot;
    }
    return { tExp, maxG, maxL, unlimG, unlimL, bes, pop, ev, cost: netCost(), g: greeksAt(S, st.tEval), sig };
  }

  /* ---------------- dados reais: preço do ativo, histórico e Selic ---------------- */
  const yahooSym = (a) => { const s = String(a || '').trim().toUpperCase(); return !s ? '' : /[.^=]/.test(s) ? s : /^[A-Z]{4}\d{1,2}$/.test(s) ? s + '.SA' : s; };
  async function getJ(url, ms = 15000) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
    try { const r = await fetch(url, { signal: c.signal }); const j = await r.json().catch(() => null); if (!r.ok || !j) throw new Error(`HTTP ${r.status}`); return j; }
    finally { clearTimeout(t); }
  }
  let hist = null; // { sym, t:[], c:[], p, ts }
  async function loadAsset(sym) {
    const ys = yahooSym(sym);
    if (!ys) return;
    setStatus(`buscando ${ys}…`);
    try {
      const y = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ys)}?interval=1d&range=1y`;
      const j = await getJ(`${PROXY}/?url=${encodeURIComponent(y)}`);
      const r = j?.chart?.result?.[0];
      if (!r) throw new Error('ativo não encontrado');
      const ts = r.timestamp || [], cl = r.indicators?.quote?.[0]?.close || [];
      const t = [], c = [];
      for (let i = 0; i < ts.length; i++) if (cl[i] != null && isFinite(cl[i])) { t.push(ts[i] * 1000); c.push(cl[i]); }
      const p = r.meta?.regularMarketPrice ?? c[c.length - 1];
      if (!isFinite(p)) throw new Error('sem preço');
      hist = { sym: ys, t, c, p, ts: Date.now(), pt: (r.meta?.regularMarketTime || 0) * 1000 };
      const prevAsset = st.asset, prevS = st.S;
      st.asset = String(sym).trim().toUpperCase();
      st.S = +p.toFixed(2);
      // trocou de ativo (ou o preço andou muito): remonta os strikes em volta do preço novo
      if (prevAsset !== st.asset || Math.abs(st.S / prevS - 1) > 0.2) { if (st.preset) buildPreset(st.preset); else st.legs.forEach((l) => { if (l.K) l.K = roundK(l.K * st.S / prevS, st.S); }); }
      st.sSrc = `Yahoo · ${new Date(hist.pt || Date.now()).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
      const hv = histVol(c, 21);
      st.hv = { v21: hv, v63: histVol(c, 63), v252: histVol(c, 252) };
      reprice(); save(); renderAll();
      setStatus(`${ys} carregado`);
    } catch (e) {
      setStatus(`não foi possível buscar ${ys} (${e.name === 'AbortError' ? 'tempo esgotado' : /fetch|network/i.test(e.message) ? 'sem conexão com a fonte' : e.message}). Digite o preço à mão.`, true);
    }
  }
  // volatilidade histórica anualizada (retornos logarítmicos diários, 252 pregões)
  function histVol(c, n) {
    if (!c || c.length < n + 1) return null;
    const r = [];
    for (let i = c.length - n; i < c.length; i++) r.push(Math.log(c[i] / c[i - 1]));
    const m = r.reduce((a, b) => a + b, 0) / r.length;
    const v = r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1);
    return Math.sqrt(v * 252);
  }
  function rollingHV(c, n = 21) {
    const out = [];
    for (let i = n; i < c.length; i++) out.push(histVol(c.slice(0, i + 1), n));
    return out;
  }
  async function loadSelic() {
    try {
      const j = await getJ('https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json', 12000);
      const last = Array.isArray(j) ? j[j.length - 1] : null, v = parseFloat(last?.valor);
      if (!isFinite(v)) throw new Error('sem valor');
      if (!st.rManual) { st.r = v / 100; st.rSrc = `Selic meta · BCB ${last.data}`; reprice(); save(); renderAll(); }
    } catch (e) { if (!st.rSrc) st.rSrc = 'Selic indisponível agora: ajuste à mão'; renderTop(); }
  }
  let statusMsg = '', statusErr = false;
  function setStatus(m, err = false) { statusMsg = m; statusErr = err; const el = $o('#opt-status'); if (el) { el.textContent = m; el.classList.toggle('err', err); } }

  /* ---------------- estrutura da página ---------------- */
  const SUBS = [
    ['builder', 'fa-chess-knight', 'Montador'],
    ['chain', 'fa-table', 'Cadeia teórica'],
    ['vol', 'fa-wave-square', 'Volatilidade'],
    ['prob', 'fa-dice', 'Probabilidades'],
    ['b3', 'fa-landmark', 'Ferramentas B3'],
    ['learn', 'fa-graduation-cap', 'Aprender']
  ];
  root.innerHTML = `
    <div class="opt-head">
      <div class="opt-title"><h2>Opções</h2><p>Monte, simule e entenda qualquer estrutura com opções da B3</p></div>
      <div class="opt-subs" role="tablist">${SUBS.map(([id, ic, l]) => `<button data-sub="${id}" role="tab"><i class="fas ${ic}"></i><span>${l}</span></button>`).join('')}<span class="opt-subs-bar" aria-hidden="true"></span></div>
    </div>
    <section class="opt-top ana-card" id="opt-top"></section>
    <div id="opt-body"></div>`;
  const body = $o('#opt-body');

  // barra comum: ativo, preço, juros, vol, dias
  function renderTop() {
    const hv = st.hv && st.hv.v21;
    $o('#opt-top').innerHTML = `
      <div class="opt-fields">
        <label class="opt-f opt-asset"><span>Ativo</span><div class="opt-inp"><input id="opt-asset" value="${esc(st.asset)}" spellcheck="false" autocomplete="off" aria-label="Código do ativo"><button class="opt-go" id="opt-load" title="Buscar preço e histórico"><i class="fas fa-search"></i></button></div></label>
        <label class="opt-f"><span>Preço do ativo</span><div class="opt-inp"><em>R$</em><input id="opt-S" type="number" step="0.01" value="${st.S}"></div></label>
        <label class="opt-f"><span>Juros (a.a.)</span><div class="opt-inp"><input id="opt-r" type="number" step="0.05" value="${nf(st.r * 100, 2).replace(',', '.')}"><em>%</em></div></label>
        <label class="opt-f"><span>Volatilidade (a.a.)</span><div class="opt-inp"><input id="opt-vol" type="number" step="0.5" value="${+(st.vol * 100).toFixed(1)}"><em>%</em></div></label>
        <label class="opt-f"><span>Prazo</span><div class="opt-inp"><input id="opt-days" type="number" step="1" min="1" value="${st.days}"><em>dias</em></div></label>
        <label class="opt-f"><span>Lote padrão</span><div class="opt-inp"><input id="opt-lot" type="number" step="100" min="1" value="${st.lot}"><em>opções</em></div></label>
      </div>
      <div class="opt-meta">
        <span id="opt-status" class="${statusErr ? 'err' : ''}">${esc(statusMsg || st.sSrc || 'Digite um código (ex.: PETR4, VALE3, BOVA11) e busque o preço')}</span>
        <span>${esc(st.rSrc || '')}</span>
        ${hv ? `<span>Vol histórica 21d: <b>${pct(hv)}</b> <button class="opt-link" data-usehv>usar</button></span>` : ''}
      </div>`;
  }

  /* =========================================================
     MONTADOR DE ESTRATÉGIAS
     ========================================================= */
  function renderBuilder() {
    const s = STRATS.find((x) => x.id === st.preset);
    const groups = [['alta', 'Para alta'], ['baixa', 'Para baixa'], ['neutro', 'Para mercado parado'], ['vol', 'Para movimento forte']];
    body.innerHTML = `
      <div class="opt-grid">
        <section class="ana-card opt-lib">
          <div class="opt-h"><h3>Estratégias</h3><span>${STRATS.length} prontas · clique para montar</span></div>
          ${groups.map(([b, lbl]) => `<div class="opt-lib-g"><div class="opt-lib-t">${lbl}</div><div class="opt-chips">${STRATS.filter((x) => x.bias === b).map((x) => `<button class="opt-chip${x.id === st.preset ? ' on' : ''}" data-preset="${x.id}" title="${esc(x.quando)}">${esc(x.nome)}<i class="lv lv${x.nivel}" title="Nível ${x.nivel} de 3"></i></button>`).join('')}</div></div>`).join('')}
        </section>
        <div class="opt-col"><section class="ana-card opt-legs">
          <div class="opt-h"><h3>${s ? esc(s.nome) : 'Estratégia personalizada'}</h3>${s ? `<span class="opt-bias ${BIAS[s.bias][1]}">${BIAS[s.bias][0]}</span>` : ''}
            <span class="sp"></span>
            <button class="btn-sm" data-addleg><i class="fas fa-plus"></i> Perna</button>
            <button class="btn-sm" data-save><i class="fas fa-bookmark"></i> Salvar</button></div>
          ${s ? `<p class="opt-why"><b>Quando usar:</b> ${esc(s.quando)} <b>Risco:</b> ${esc(s.risco)}</p>` : ''}
          <div class="opt-legs-wrap"><table class="opt-tbl"><thead><tr><th>Lado</th><th>Tipo</th><th>Strike</th><th>Dias</th><th>Vol %</th><th>Prêmio / preço</th><th>Qtd</th><th></th></tr></thead><tbody id="opt-legs"></tbody></table></div>
          <p class="opt-note">Prêmios em <i>itálico</i> são teóricos (Black-Scholes com a vol da perna). Para operar, digite o prêmio real do book da sua corretora.</p>
        </section>
        <section class="ana-card opt-res" id="opt-res"></section></div>
      </div>
      <section class="ana-card opt-chartc">
        <div class="opt-h"><h3>Gráfico de resultado</h3><span id="opt-chart-sub"></span><span class="sp"></span>
          <div class="opt-leg"><span><i class="l-exp"></i>No vencimento</span><span><i class="l-now"></i>Na data simulada</span><span><i class="l-sd"></i>±1 desvio</span></div></div>
        <div class="opt-sliders">
          <label><span>Data simulada: <b id="opt-tev-l"></b></span><input type="range" id="opt-tev" min="0" step="1"></label>
          <label><span>Choque de volatilidade: <b id="opt-vs-l"></b></span><input type="range" id="opt-vs" min="-30" max="30" step="1"></label>
        </div>
        <div class="opt-chart" id="opt-chart"><div class="opt-tip" hidden></div></div>
      </section>
      <div class="opt-grid2">
        <section class="ana-card" id="opt-greeks"></section>
        <section class="ana-card" id="opt-risk"></section>
      </div>
      <section class="ana-card" id="opt-matrix"></section>
      <section class="ana-card" id="opt-saved"></section>`;
    renderLegs(); renderResults();
  }

  function legRow(l, i) {
    const opt = l.type !== 'stock';
    return `<tr data-leg="${l.id}">
      <td><button class="opt-side ${l.side > 0 ? 'buy' : 'sell'}" data-f="side">${l.side > 0 ? 'Compra' : 'Venda'}</button></td>
      <td><select data-f="type"><option value="call" ${l.type === 'call' ? 'selected' : ''}>Call</option><option value="put" ${l.type === 'put' ? 'selected' : ''}>Put</option><option value="stock" ${l.type === 'stock' ? 'selected' : ''}>Ação</option></select></td>
      <td>${opt ? `<input type="number" step="${strikeStep(st.S)}" data-f="K" value="${l.K}">` : '<span class="mut">—</span>'}</td>
      <td>${opt ? `<input type="number" step="1" min="1" data-f="days" value="${l.days}">` : '<span class="mut">—</span>'}</td>
      <td>${opt ? `<input type="number" step="0.5" data-f="iv" value="${+(l.iv * 100).toFixed(1)}">` : '<span class="mut">—</span>'}</td>
      <td><input type="number" step="0.01" data-f="prem" class="${l.theo ? 'theo' : ''}" value="${l.prem != null ? (+l.prem).toFixed(2) : ''}">${opt && !l.theo ? `<button class="opt-link" data-f="theo" title="Voltar ao prêmio teórico">B-S</button>` : ''}</td>
      <td><input type="number" step="100" min="1" data-f="qty" value="${l.qty}"></td>
      <td><button class="opt-x" data-f="del" title="Remover perna" aria-label="Remover perna ${i + 1}">✕</button></td>
    </tr>`;
  }
  function renderLegs() {
    const tb = $o('#opt-legs');
    if (!tb) return;
    tb.innerHTML = st.legs.length ? st.legs.map(legRow).join('') : '<tr><td colspan="8" class="mut" style="text-align:center;padding:18px">Nenhuma perna. Escolha uma estratégia ou adicione uma perna.</td></tr>';
  }

  const fmtMax = (v, unl) => (unl ? 'Ilimitado' : brl(v));
  function renderResults() {
    const a = analyze();
    const res = $o('#opt-res');
    if (!res) return;
    if (!a) { res.innerHTML = '<p class="mut">Monte uma estratégia para ver o resultado.</p>'; ['#opt-greeks', '#opt-risk', '#opt-matrix'].forEach((s) => { const e = $o(s); if (e) e.innerHTML = ''; }); drawChart(null); renderSaved(); return; }
    const cost = a.cost;
    const rr = !a.unlimG && !a.unlimL && a.maxL < 0 ? a.maxG / -a.maxL : null;
    const sd = st.S * a.sig * Math.sqrt(yearsOf(a.tExp));
    res.innerHTML = `
      <div class="opt-kpis">
        <div><span>${cost >= 0 ? 'Custo (débito)' : 'Crédito recebido'}</span><b class="${cost >= 0 ? '' : 'pos'}">${brl(Math.abs(cost))}</b></div>
        <div><span>Ganho máximo</span><b class="pos">${fmtMax(a.maxG, a.unlimG)}</b></div>
        <div><span>Perda máxima</span><b class="neg">${a.unlimL ? 'Ilimitada' : brl(a.maxL)}</b></div>
        <div><span>Ponto${a.bes.length > 1 ? 's' : ''} de equilíbrio</span><b>${a.bes.length ? a.bes.slice(0, 3).map((x) => 'R$ ' + nf(x)).join(' · ') : '—'}</b></div>
        <div><span>Chance de lucro</span><b>${a.pop != null ? pct(a.pop, 0) : '—'}</b></div>
        <div><span>Ganho ÷ risco</span><b>${rr != null && isFinite(rr) ? nf(rr, 2) + 'x' : '—'}</b></div>
      </div>
      <p class="opt-note">No vencimento mais curto (${a.tExp} dias). A chance de lucro usa distribuição lognormal com vol de ${pct(a.sig)} e não é previsão: é o que o preço das opções implica. Movimento esperado (1 desvio): ±R$ ${nf(sd)} (${pct(sd / st.S)}).</p>`;
    const g = a.g;
    $o('#opt-greeks').innerHTML = `
      <div class="opt-h"><h3>Gregas da posição</h3><span>na data simulada</span></div>
      <div class="opt-gk">
        <div><i>Δ</i><b>${nf(g.delta, 0)}</b><span>Delta: equivale a ${nf(Math.abs(g.delta), 0)} ações ${g.delta >= 0 ? 'compradas' : 'vendidas'}. Ganha ${sbrl(g.delta)} se o ativo subir R$ 1.</span></div>
        <div><i>Γ</i><b>${nf(g.gamma, 1)}</b><span>Gamma: quanto o delta muda a cada R$ 1 no ativo.</span></div>
        <div><i>Θ</i><b class="${g.theta >= 0 ? 'pos' : 'neg'}">${sbrl(g.theta)}</b><span>Theta: ${g.theta >= 0 ? 'ganha' : 'perde'} isso por dia corrido só com a passagem do tempo.</span></div>
        <div><i>V</i><b class="${g.vega >= 0 ? 'pos' : 'neg'}">${sbrl(g.vega)}</b><span>Vega: resultado se a volatilidade subir 1 ponto.</span></div>
        <div><i>ρ</i><b>${sbrl(g.rho)}</b><span>Rho: resultado se os juros subirem 1 ponto.</span></div>
      </div>`;
    // tamanho de posição pela perda máxima
    const lossPerSet = a.unlimL ? null : -a.maxL;
    const budget = st.capital * st.riskPct / 100;
    const sets = lossPerSet > 0 ? Math.floor(budget / lossPerSet) : null;
    $o('#opt-risk').innerHTML = `
      <div class="opt-h"><h3>Gestão de risco</h3><span>quanto montar</span></div>
      <div class="opt-fields sm">
        <label class="opt-f"><span>Capital</span><div class="opt-inp"><em>R$</em><input type="number" id="opt-cap" step="1000" value="${st.capital}"></div></label>
        <label class="opt-f"><span>Risco por operação</span><div class="opt-inp"><input type="number" id="opt-rp" step="0.5" value="${st.riskPct}"><em>%</em></div></label>
      </div>
      <p class="opt-big">${a.unlimL ? 'Perda máxima ilimitada: defina um stop, porque não dá para dimensionar pela perda máxima.' : sets != null ? `Cabem <b>${sets}</b> ${sets === 1 ? 'vez' : 'vezes'} esta montagem no seu limite de ${brl(budget)}.` : '—'}</p>
      <p class="opt-note">${a.unlimL ? '' : `Cada montagem arrisca até ${brl(lossPerSet)}. `}Regra comum: não arriscar mais de 1% a 2% do capital por operação.</p>`;
    renderMatrix(a);
    drawChart(a);
    renderSaved();
  }

  /* ---------- gráfico de resultado (SVG próprio) ---------- */
  let geo = null;
  function drawChart(a) {
    const wrap = $o('#opt-chart');
    if (!wrap) return;
    const tip = wrap.querySelector('.opt-tip');
    wrap.querySelectorAll('svg, .opt-empty').forEach((n) => n.remove());
    const tev = $o('#opt-tev'), vs = $o('#opt-vs');
    if (!a) { wrap.insertAdjacentHTML('afterbegin', '<div class="opt-empty">Sem pernas para desenhar.</div>'); return; }
    if (tev) { tev.max = Math.max(0, a.tExp); tev.value = st.tEval = clamp(st.tEval, 0, a.tExp); $o('#opt-tev-l').textContent = st.tEval === 0 ? 'hoje' : st.tEval >= a.tExp ? 'vencimento' : `daqui a ${st.tEval} dias`; }
    if (vs) { vs.value = Math.round(st.volShift * 100); $o('#opt-vs-l').textContent = st.volShift === 0 ? 'nenhum' : `${st.volShift > 0 ? '+' : ''}${Math.round(st.volShift * 100)} pts`; }
    const S = st.S, sd = S * a.sig * Math.sqrt(Math.max(yearsOf(a.tExp), 1 / 365));
    const strikes = st.legs.filter((l) => l.K).map((l) => l.K);
    let x0 = Math.min(S - 2.6 * sd, ...strikes.map((k) => k * 0.9)), x1 = Math.max(S + 2.6 * sd, ...strikes.map((k) => k * 1.1));
    x0 = Math.max(0, x0);
    const Wd = Math.max(300, wrap.clientWidth), Ht = Math.max(230, Math.min(400, Math.round(Wd * 0.42)));
    const Lm = 66, R = 14, T = 16, B = 28;
    const n = Math.min(500, Math.round(Wd));
    const pts = [];
    for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; pts.push([x, plAt(x, a.tExp), plAt(x, st.tEval)]); }
    let lo = Math.min(...pts.map((p) => Math.min(p[1], p[2]))), hi = Math.max(...pts.map((p) => Math.max(p[1], p[2])));
    lo = Math.min(lo, 0); hi = Math.max(hi, 0);
    const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    const X = (x) => Lm + ((x - x0) / (x1 - x0)) * (Wd - Lm - R);
    const Y = (y) => T + (1 - (y - lo) / (hi - lo)) * (Ht - T - B);
    geo = { X, Y, x0, x1, Lm, R, T, B, Wd, Ht, a, pts };
    let g = '';
    // faixa de ±1 desvio
    g += `<rect x="${X(Math.max(x0, S - sd)).toFixed(1)}" y="${T}" width="${(X(Math.min(x1, S + sd)) - X(Math.max(x0, S - sd))).toFixed(1)}" height="${Ht - T - B}" class="sdb"/>`;
    // grade
    for (let i = 0; i <= 5; i++) {
      const yv = lo + ((hi - lo) * i) / 5, y = Y(yv);
      g += `<line x1="${Lm}" x2="${Wd - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="gr"/><text x="${Lm - 8}" y="${(y + 3.5).toFixed(1)}" class="ax" text-anchor="end">${Math.abs(hi - lo) >= 10000 ? nf(yv / 1000, 1) + 'k' : nf(yv, 0)}</text>`;
    }
    const nx = Wd < 520 ? 4 : 6;
    for (let i = 0; i <= nx; i++) {
      const xv = x0 + ((x1 - x0) * i) / nx, x = X(xv);
      g += `<text x="${x.toFixed(1)}" y="${Ht - 8}" class="ax" text-anchor="${i === 0 ? 'start' : i === nx ? 'end' : 'middle'}">${nf(xv, xv >= 1000 ? 0 : 2)}</text>`;
    }
    const z = Y(0);
    // áreas de lucro e prejuízo no vencimento
    let pathE = '', pathN = '';
    pts.forEach((p, i) => { pathE += (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); pathN += (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[2]).toFixed(1); });
    const area = `${pathE}L${X(x1).toFixed(1)},${z.toFixed(1)}L${X(x0).toFixed(1)},${z.toFixed(1)}Z`;
    g += `<defs><clipPath id="opt-cp-up"><rect x="0" y="0" width="${Wd}" height="${z.toFixed(1)}"/></clipPath><clipPath id="opt-cp-dn"><rect x="0" y="${z.toFixed(1)}" width="${Wd}" height="${Ht}"/></clipPath></defs>`;
    g += `<path d="${area}" class="ar-up" clip-path="url(#opt-cp-up)"/><path d="${area}" class="ar-dn" clip-path="url(#opt-cp-dn)"/>`;
    g += `<line x1="${Lm}" x2="${Wd - R}" y1="${z.toFixed(1)}" y2="${z.toFixed(1)}" class="zl"/>`;
    // strikes, pontos de equilíbrio e preço atual
    [...new Set(strikes)].forEach((k) => { if (k > x0 && k < x1) g += `<line x1="${X(k).toFixed(1)}" x2="${X(k).toFixed(1)}" y1="${T}" y2="${Ht - B}" class="kl"/><text x="${X(k).toFixed(1)}" y="${T + 10}" class="kt" text-anchor="middle">K ${nf(k, k >= 1000 ? 0 : 2)}</text>`; });
    a.bes.forEach((b) => { if (b > x0 && b < x1) g += `<circle cx="${X(b).toFixed(1)}" cy="${z.toFixed(1)}" r="4" class="be"/>`; });
    g += `<line x1="${X(S).toFixed(1)}" x2="${X(S).toFixed(1)}" y1="${T}" y2="${Ht - B}" class="sl"/><text x="${X(S).toFixed(1)}" y="${Ht - B - 6}" class="st" text-anchor="middle">hoje R$ ${nf(S)}</text>`;
    g += `<path d="${pathE}" class="ln-exp"/>`;
    if (st.tEval < a.tExp || st.volShift) g += `<path d="${pathN}" class="ln-now"/>`;
    g += `<line class="hx" x1="-10" x2="-10" y1="${T}" y2="${Ht - B}"/><circle class="hd1" r="4" cx="-10" cy="-10"/><circle class="hd2" r="4" cx="-10" cy="-10"/>`;
    wrap.insertAdjacentHTML('afterbegin', `<svg width="${Wd}" height="${Ht}" viewBox="0 0 ${Wd} ${Ht}" role="img" aria-label="Gráfico de lucro e prejuízo">${g}</svg>`);
    tip.hidden = true;
    $o('#opt-chart-sub').textContent = `${st.asset || 'ativo'} entre R$ ${nf(x0)} e R$ ${nf(x1)}`;
  }
  function chartHover(e) {
    const svg = e.target.closest?.('#opt-chart svg');
    if (!svg || !geo) return;
    const r = svg.getBoundingClientRect(), px = e.clientX - r.left;
    if (px < geo.Lm || px > geo.Wd - geo.R) return;
    const x = geo.x0 + ((px - geo.Lm) / (geo.Wd - geo.Lm - geo.R)) * (geo.x1 - geo.x0);
    const ye = plAt(x, geo.a.tExp), yn = plAt(x, st.tEval);
    svg.querySelector('.hx').setAttribute('x1', px); svg.querySelector('.hx').setAttribute('x2', px);
    const h1 = svg.querySelector('.hd1'), h2 = svg.querySelector('.hd2');
    h1.setAttribute('cx', px); h1.setAttribute('cy', geo.Y(ye));
    const showNow = st.tEval < geo.a.tExp || st.volShift;
    h2.setAttribute('cx', showNow ? px : -10); h2.setAttribute('cy', geo.Y(yn));
    const tip = $o('#opt-chart .opt-tip');
    const chg = x / st.S - 1;
    tip.innerHTML = `<b>R$ ${nf(x)}</b> <span>(${chg >= 0 ? '+' : ''}${nf(chg * 100, 1)}%)</span><br>Vencimento: <b class="${ye >= 0 ? 'pos' : 'neg'}">${sbrl(ye)}</b>${showNow ? `<br>Data simulada: <b class="${yn >= 0 ? 'pos' : 'neg'}">${sbrl(yn)}</b>` : ''}`;
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = clamp(px - w / 2, 4, r.width - w - 4) + 'px';
    tip.style.top = Math.max(4, Math.min(geo.Y(ye), geo.Y(yn)) - 64) + 'px';
  }

  /* ---------- matriz de cenários: preço x tempo ---------- */
  function renderMatrix(a) {
    const el = $o('#opt-matrix');
    if (!el) return;
    const moves = [-0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2];
    const tt = [...new Set([0, Math.round(a.tExp * 0.25), Math.round(a.tExp * 0.5), Math.round(a.tExp * 0.75), a.tExp])];
    const vals = moves.map((m) => tt.map((t) => plAt(st.S * (1 + m), t)));
    const mx = Math.max(1, ...vals.flat().map(Math.abs));
    const cell = (v) => { const k = clamp(Math.abs(v) / mx, 0, 1); return `<td class="${v >= 0 ? 'p' : 'n'}" style="--k:${(0.08 + k * 0.5).toFixed(2)}">${sbrl(v, 0)}</td>`; };
    el.innerHTML = `
      <div class="opt-h"><h3>Mapa de cenários</h3><span>resultado conforme o preço do ativo e o tempo${st.volShift ? `, com choque de vol de ${Math.round(st.volShift * 100)} pts` : ''}</span></div>
      <div class="opt-mx-wrap"><table class="opt-mx"><thead><tr><th>Ativo</th>${tt.map((t) => `<th>${t === 0 ? 'Hoje' : t === a.tExp ? 'Vencimento' : `+${t} dias`}</th>`).join('')}</tr></thead>
      <tbody>${moves.map((m, i) => `<tr class="${m === 0 ? 'cur' : ''}"><th>${m === 0 ? 'Atual' : (m > 0 ? '+' : '') + Math.round(m * 100) + '%'}<small>R$ ${nf(st.S * (1 + m))}</small></th>${vals[i].map(cell).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  /* ---------- estratégias salvas ---------- */
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]') || []; } catch (e) { saved = []; }
  const saveSaved = () => { try { localStorage.setItem(SAVED_KEY, JSON.stringify(saved.slice(0, 30))); } catch (e) { /* sem espaço */ } };
  function renderSaved() {
    const el = $o('#opt-saved');
    if (!el) return;
    el.innerHTML = `<div class="opt-h"><h3>Minhas estratégias</h3><span>salvas neste navegador</span></div>` + (saved.length
      ? `<div class="opt-saved">${saved.map((x, i) => `<div class="opt-sv"><button data-load="${i}"><b>${esc(x.nome)}</b><span>${esc(x.asset)} · R$ ${nf(x.S)} · ${x.legs.length} perna${x.legs.length > 1 ? 's' : ''} · ${new Date(x.ts).toLocaleDateString('pt-BR')}</span></button><button class="opt-x" data-delsv="${i}" title="Apagar">✕</button></div>`).join('')}</div>`
      : '<p class="mut">Nenhuma ainda. Use "Salvar" para guardar uma montagem e comparar depois.</p>');
  }

  /* =========================================================
     CADEIA TEÓRICA
     ========================================================= */
  let chainSide = 1;
  function renderChain() {
    const S = st.S, step = strikeStep(S);
    let k0 = roundK(S * 0.8, S), k1 = roundK(S * 1.2, S);
    let stp = step;
    while ((k1 - k0) / stp > 26) stp *= 2;
    const ks = [];
    for (let k = k0; k <= k1 + 1e-9; k += stp) ks.push(+k.toFixed(2));
    const T = yearsOf(st.days), r = rC();
    const row = (k) => {
      const c = bs('call', S, k, T, r, st.vol, st.q), p = bs('put', S, k, T, r, st.vol, st.q);
      const itmC = S > k, itmP = S < k, atm = Math.abs(k - S) < stp / 2;
      const pc = probAbove(S, k, T, r, st.vol, st.q);
      return `<tr class="${atm ? 'atm' : ''}">
        <td class="${itmC ? 'itm' : ''}"><button data-chain="call" data-k="${k}">${nf(c.price)}</button></td><td class="${itmC ? 'itm' : ''}">${nf(c.delta, 2)}</td><td class="${itmC ? 'itm' : ''}">${nf(c.theta, 3)}</td><td class="${itmC ? 'itm' : ''}">${pct(pc, 0)}</td>
        <th>${nf(k, k >= 1000 ? 0 : 2)}</th>
        <td class="${itmP ? 'itm' : ''}">${pct(1 - pc, 0)}</td><td class="${itmP ? 'itm' : ''}">${nf(p.theta, 3)}</td><td class="${itmP ? 'itm' : ''}">${nf(p.delta, 2)}</td><td class="${itmP ? 'itm' : ''}"><button data-chain="put" data-k="${k}">${nf(p.price)}</button></td>
      </tr>`;
    };
    body.innerHTML = `
      <section class="ana-card">
        <div class="opt-h"><h3>Cadeia teórica</h3><span>${esc(st.asset)} a R$ ${nf(S)} · ${st.days} dias · vol ${pct(st.vol)} · juros ${pct(st.r)}</span><span class="sp"></span>
          <div class="opt-seg"><span>Clique no prêmio para</span><button data-cs="1" class="${chainSide > 0 ? 'on' : ''}">comprar</button><button data-cs="-1" class="${chainSide < 0 ? 'on' : ''}">vender</button></div></div>
        <p class="opt-warn"><i class="fas fa-info-circle"></i> Estes preços são calculados pelo modelo Black-Scholes com os parâmetros acima. Não são cotações da B3: servem para comparar strikes e entender as gregas. Opções da B3 têm liquidez concentrada em poucos strikes, então confira sempre o book.</p>
        <div class="opt-chain-wrap"><table class="opt-chain">
          <thead><tr><th colspan="4" class="c">CALL</th><th></th><th colspan="4" class="p">PUT</th></tr>
          <tr><th>Prêmio</th><th>Delta</th><th>Theta/dia</th><th>Chance ITM</th><th>Strike</th><th>Chance ITM</th><th>Theta/dia</th><th>Delta</th><th>Prêmio</th></tr></thead>
          <tbody>${ks.map(row).join('')}</tbody></table></div>
        <p class="opt-note">Linha destacada: strike mais perto do preço atual (no dinheiro). Fundo colorido: dentro do dinheiro (ITM). "Chance ITM" é a probabilidade, implícita no modelo, de a opção terminar dentro do dinheiro.</p>
      </section>`;
  }

  /* =========================================================
     VOLATILIDADE
     ========================================================= */
  const ivc = { type: 'call', K: null, days: null, prem: null };
  function renderVol() {
    const hv = st.hv || {};
    const K = ivc.K ?? roundK(st.S, st.S), days = ivc.days ?? st.days;
    const T = yearsOf(days);
    const iv = ivc.prem != null ? impliedVol(ivc.type, ivc.prem, st.S, K, T, rC(), st.q) : null;
    const rolling = hist && hist.c && hist.c.length > 40 ? rollingHV(hist.c, 21) : null;
    const spark = rolling ? sparkSVG(rolling.filter((x) => x != null)) : '';
    const horizons = [[1, '1 dia'], [5, '1 semana'], [st.days, `Vencimento (${st.days}d)`], [30, '1 mês'], [91, '3 meses'], [365, '1 ano']];
    body.innerHTML = `
      <div class="opt-grid2">
        <section class="ana-card">
          <div class="opt-h"><h3>Volatilidade histórica</h3><span>${hist ? esc(hist.sym) + ' · último ano' : 'busque um ativo no topo'}</span></div>
          <div class="opt-kpis k3">
            <div><span>21 pregões (1 mês)</span><b>${pct(hv.v21)}</b></div>
            <div><span>63 pregões (3 meses)</span><b>${pct(hv.v63)}</b></div>
            <div><span>252 pregões (1 ano)</span><b>${pct(hv.v252)}</b></div>
          </div>
          ${spark ? `<div class="opt-spark">${spark}<div class="opt-spark-ax"><span>há 1 ano</span><span>vol de 21 pregões, janela móvel</span><span>hoje</span></div></div>` : '<p class="mut">Sem histórico carregado. A volatilidade histórica mede quanto o ativo oscilou de verdade; a implícita é o que o mercado cobra nas opções.</p>'}
        </section>
        <section class="ana-card">
          <div class="opt-h"><h3>Calculadora de volatilidade implícita</h3><span>a partir do prêmio do book</span></div>
          <div class="opt-fields sm">
            <label class="opt-f"><span>Tipo</span><div class="opt-inp"><select id="ivc-type"><option value="call" ${ivc.type === 'call' ? 'selected' : ''}>Call</option><option value="put" ${ivc.type === 'put' ? 'selected' : ''}>Put</option></select></div></label>
            <label class="opt-f"><span>Strike</span><div class="opt-inp"><input id="ivc-K" type="number" step="0.01" value="${K}"></div></label>
            <label class="opt-f"><span>Dias</span><div class="opt-inp"><input id="ivc-days" type="number" step="1" value="${days}"></div></label>
            <label class="opt-f"><span>Prêmio de mercado</span><div class="opt-inp"><em>R$</em><input id="ivc-prem" type="number" step="0.01" value="${ivc.prem ?? ''}" placeholder="ex.: 1,25"></div></label>
          </div>
          <p class="opt-big">${ivc.prem == null ? 'Digite o prêmio negociado para descobrir a volatilidade que o mercado está cobrando.' : iv == null ? 'Prêmio abaixo do valor intrínseco ou fora do possível: confira os números.' : `Volatilidade implícita: <b>${pct(iv)}</b>`}</p>
          ${iv != null && hv.v21 ? `<p class="opt-note">Isso é ${iv > hv.v21 ? 'acima' : 'abaixo'} da vol histórica de 1 mês (${pct(hv.v21)}) em ${nf(Math.abs(iv - hv.v21) * 100, 1)} pontos. ${iv > hv.v21 ? 'Opção relativamente cara: costuma favorecer quem vende.' : 'Opção relativamente barata: costuma favorecer quem compra.'}</p>` : ''}
          ${iv != null ? `<button class="btn-sm" data-useiv="${iv}"><i class="fas fa-check"></i> Usar ${pct(iv)} no simulador</button>` : ''}
        </section>
      </div>
      <section class="ana-card">
        <div class="opt-h"><h3>Movimento esperado</h3><span>pela vol de ${pct(st.vol)} · ${esc(st.asset)} a R$ ${nf(st.S)}</span></div>
        <div class="opt-mx-wrap"><table class="opt-tbl em"><thead><tr><th>Horizonte</th><th>1 desvio (≈68%)</th><th>Faixa de preço</th><th>2 desvios (≈95%)</th><th>Faixa de preço</th></tr></thead>
        <tbody>${horizons.map(([d, l]) => { const s1 = st.vol * Math.sqrt(d / 365); return `<tr><td>${l}</td><td>±${pct(s1)}</td><td>R$ ${nf(st.S * Math.exp(-s1))} a ${nf(st.S * Math.exp(s1))}</td><td>±${pct(2 * s1)}</td><td>R$ ${nf(st.S * Math.exp(-2 * s1))} a ${nf(st.S * Math.exp(2 * s1))}</td></tr>`; }).join('')}</tbody></table></div>
        <p class="opt-note">Faixas lognormais: o preço tem mais espaço para subir que para cair. É estatística, não previsão; eventos (balanço, Copom) costumam gerar movimentos maiores que o normal.</p>
      </section>`;
  }
  function sparkSVG(v) {
    if (v.length < 2) return '';
    const W = 600, H = 90, lo = Math.min(...v), hi = Math.max(...v);
    const X = (i) => (i / (v.length - 1)) * W, Y = (y) => 6 + (1 - (y - lo) / ((hi - lo) || 1)) * (H - 12);
    const d = v.map((y, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(y).toFixed(1)).join('');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}L${W},${H}L0,${H}Z" class="ar"/><path d="${d}" class="ln"/></svg><div class="opt-spark-r"><span>máx ${pct(hi)}</span><span>mín ${pct(lo)}</span></div>`;
  }

  /* =========================================================
     PROBABILIDADES
     ========================================================= */
  let probX = null;
  function renderProb() {
    const X = probX ?? roundK(st.S * 1.05, st.S);
    const T = yearsOf(st.days), r = rC(), v = st.vol;
    const pa = probAbove(st.S, X, T, r, v, st.q);
    const touch = Math.min(1, 2 * (X >= st.S ? pa : 1 - pa));
    const tg = [-0.2, -0.15, -0.1, -0.05, 0.05, 0.1, 0.15, 0.2];
    body.innerHTML = `
      <section class="ana-card">
        <div class="opt-h"><h3>Calculadora de probabilidades</h3><span>${esc(st.asset)} a R$ ${nf(st.S)} · ${st.days} dias · vol ${pct(v)}</span></div>
        <div class="opt-fields sm">
          <label class="opt-f"><span>Preço alvo</span><div class="opt-inp"><em>R$</em><input id="prob-X" type="number" step="0.01" value="${X}"></div></label>
        </div>
        <div class="opt-kpis k3">
          <div><span>Terminar acima de R$ ${nf(X)}</span><b>${pct(pa, 1)}</b></div>
          <div><span>Terminar abaixo de R$ ${nf(X)}</span><b>${pct(1 - pa, 1)}</b></div>
          <div><span>Tocar R$ ${nf(X)} antes do vencimento</span><b>${pct(touch, 1)}</b></div>
        </div>
        <p class="opt-note">Probabilidades neutras a risco do modelo lognormal (as mesmas que estão embutidas no preço das opções). A chance de tocar usa a aproximação de 2 vezes a chance de terminar além do alvo.</p>
      </section>
      <section class="ana-card">
        <div class="opt-h"><h3>Tabela de alvos</h3><span>no vencimento em ${st.days} dias</span></div>
        <div class="opt-mx-wrap"><table class="opt-tbl em"><thead><tr><th>Movimento</th><th>Preço</th><th>Chance de terminar além</th><th>Chance de tocar</th></tr></thead>
        <tbody>${tg.map((m) => { const x = st.S * (1 + m), p = m > 0 ? probAbove(st.S, x, T, r, v, st.q) : 1 - probAbove(st.S, x, T, r, v, st.q); return `<tr><td class="${m > 0 ? 'pos' : 'neg'}">${m > 0 ? '+' : ''}${Math.round(m * 100)}%</td><td>R$ ${nf(x)}</td><td>${pct(p, 1)}</td><td>${pct(Math.min(1, 2 * p), 1)}</td></tr>`; }).join('')}</tbody></table></div>
      </section>`;
  }

  /* =========================================================
     FERRAMENTAS DA B3
     ========================================================= */
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const CALL_L = 'ABCDEFGHIJKL', PUT_L = 'MNOPQRSTUVWX';
  // vencimento das opções de ações na B3: terceira sexta-feira do mês
  function thirdFriday(y, m) { const d = new Date(y, m, 1); const add = (5 - d.getDay() + 7) % 7; return new Date(y, m, 1 + add + 14); }
  let decodeIn = 'PETRK400';
  function decode(code) {
    const c = String(code || '').trim().toUpperCase();
    const m = /^([A-Z]{4})([A-X])(\d{1,4})([A-Z]?)$/.exec(c);
    if (!m) return null;
    const [, base, let_, n, suf] = m;
    const call = CALL_L.includes(let_);
    const mes = (call ? CALL_L : PUT_L).indexOf(let_);
    return { base, call, mes, n, suf };
  }
  function renderB3() {
    const now = new Date();
    const vencs = [];
    for (let i = 0; vencs.length < 12 && i < 14; i++) {
      const y = now.getFullYear() + Math.floor((now.getMonth() + i) / 12), m = (now.getMonth() + i) % 12;
      const d = thirdFriday(y, m);
      if (d >= new Date(now.getFullYear(), now.getMonth(), now.getDate())) vencs.push(d);
    }
    const dd = decode(decodeIn);
    body.innerHTML = `
      <div class="opt-grid2">
        <section class="ana-card">
          <div class="opt-h"><h3>Decodificador de código</h3><span>o que o ticker da opção diz</span></div>
          <div class="opt-fields sm"><label class="opt-f"><span>Código da opção</span><div class="opt-inp"><input id="b3-code" value="${esc(decodeIn)}" spellcheck="false" autocomplete="off"></div></label></div>
          ${dd ? `<div class="opt-kpis k3">
              <div><span>Ativo-objeto</span><b>${esc(dd.base)}</b></div>
              <div><span>Tipo</span><b class="${dd.call ? 'pos' : 'neg'}">${dd.call ? 'Call (compra)' : 'Put (venda)'}</b></div>
              <div><span>Mês de vencimento</span><b>${MESES[dd.mes]}</b></div>
            </div>
            <p class="opt-note">O número (${esc(dd.n)}) é a série e costuma lembrar o strike, mas não é o strike exato: ele muda com dividendos e ajustes. Confira o strike no site da B3 ou no home broker.${dd.suf ? ` A letra final (${esc(dd.suf)}) indica uma série ajustada ou especial.` : ''}</p>`
            : '<p class="mut">Formato esperado: 4 letras do ativo + letra do mês + número. Exemplo: PETRK400, VALEW650.</p>'}
        </section>
        <section class="ana-card">
          <div class="opt-h"><h3>Próximos vencimentos</h3><span>opções de ações · 3ª sexta-feira do mês</span></div>
          <ul class="opt-venc">${vencs.map((d) => { const days = Math.round((d - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / DAY); return `<li><b>${d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '')}</b><span>${days === 0 ? 'hoje' : `em ${days} dias`}</span><span class="lt">Call ${CALL_L[d.getMonth()]} · Put ${PUT_L[d.getMonth()]}</span><button class="opt-link" data-setdays="${days}">usar</button></li>`; }).join('')}</ul>
          <p class="opt-note">Se a sexta for feriado, o vencimento passa para o dia útil anterior. Confira o calendário oficial da B3.</p>
        </section>
      </div>
      <section class="ana-card">
        <div class="opt-h"><h3>Letras de vencimento</h3><span>a 5ª letra do código</span></div>
        <div class="opt-mx-wrap"><table class="opt-tbl em letters"><thead><tr><th></th>${MESES.map((m) => `<th>${m.slice(0, 3)}</th>`).join('')}</tr></thead>
        <tbody><tr><th class="pos">Call</th>${[...CALL_L].map((c) => `<td>${c}</td>`).join('')}</tr><tr><th class="neg">Put</th>${[...PUT_L].map((c) => `<td>${c}</td>`).join('')}</tr></tbody></table></div>
      </section>
      <div class="opt-grid2">
        <section class="ana-card">
          <div class="opt-h"><h3>Regras práticas da B3</h3></div>
          <ul class="opt-ul">
            <li><b>Lote:</b> as opções de ações são negociadas em quantidades de opções (lote padrão de 100). Cada opção dá direito sobre 1 ação.</li>
            <li><b>Estilo:</b> na B3, as calls de ações costumam ser americanas (exercício a qualquer momento) e as puts, europeias (só no vencimento). Confira a especificação de cada série.</li>
            <li><b>Exercício:</b> no dia do vencimento, posições dentro do dinheiro podem ser exercidas automaticamente. Se não quiser ser exercido, zere antes ou fale com a corretora.</li>
            <li><b>Margem:</b> venda a seco exige garantia depositada na B3. A corretora pode encerrar a posição se a garantia ficar insuficiente.</li>
            <li><b>Dividendos:</b> proventos ajustam o strike das séries. Por isso o número do código deixa de bater com o strike.</li>
          </ul>
        </section>
        <section class="ana-card">
          <div class="opt-h"><h3>Imposto de renda</h3><span>pessoa física, simplificado</span></div>
          <div class="opt-fields sm">
            <label class="opt-f"><span>Lucro no mês</span><div class="opt-inp"><em>R$</em><input id="ir-lucro" type="number" step="100" value="${st.irLucro ?? 1000}"></div></label>
            <label class="opt-f"><span>Prejuízo acumulado a compensar</span><div class="opt-inp"><em>R$</em><input id="ir-prej" type="number" step="100" value="${st.irPrej ?? 0}"></div></label>
          </div>
          ${(() => { const base = Math.max(0, (st.irLucro ?? 1000) - (st.irPrej ?? 0)); return `<div class="opt-kpis k2"><div><span>Swing trade (15%)</span><b>${brl(base * 0.15)}</b></div><div><span>Day trade (20%)</span><b>${brl(base * 0.2)}</b></div></div>`; })()}
          <p class="opt-note">Ganhos com opções não têm a isenção de R$ 20 mil por mês das ações à vista. O imposto é pago por DARF até o último dia útil do mês seguinte. Prejuízo de swing só compensa swing, e de day trade só compensa day trade. Para casos específicos, consulte um contador.</p>
        </section>
      </div>`;
  }

  /* =========================================================
     APRENDER: trilha de estudo + quiz
     ========================================================= */
  const TRILHA = [
    { t: 'Fundamentos', n: 1, itens: [
      ['O que é uma opção', 'Um contrato que dá a quem compra o <b>direito</b>, e não a obrigação, de comprar (call) ou vender (put) um ativo por um preço combinado (strike) até uma data (vencimento). Quem vende a opção (lançador) recebe o prêmio e assume a <b>obrigação</b> correspondente.'],
      ['Os quatro papéis', '<b>Comprar call:</b> aposta na alta com risco limitado ao prêmio. <b>Vender call:</b> recebe o prêmio e se obriga a vender no strike; sem a ação, o risco é ilimitado. <b>Comprar put:</b> aposta na queda ou faz seguro da carteira. <b>Vender put:</b> recebe o prêmio e se obriga a comprar no strike.'],
      ['Valor intrínseco e extrínseco', 'Prêmio = valor intrínseco + valor extrínseco. Intrínseco é o que a opção valeria se vencesse agora (call: ativo menos strike; put: strike menos ativo; nunca negativo). Extrínseco é o "valor do tempo e da incerteza", e vai a zero no vencimento.'],
      ['Dentro, no e fora do dinheiro', '<b>ITM</b> (dentro): já tem valor intrínseco. <b>ATM</b> (no dinheiro): strike perto do preço atual, onde o valor extrínseco é máximo. <b>OTM</b> (fora): só valor extrínseco; mais barata, mas precisa de movimento para valer algo.'],
      ['Ponto de equilíbrio', 'Para a call comprada: strike + prêmio. Para a put comprada: strike menos prêmio. O ativo precisa passar desse ponto até o vencimento só para você empatar.']
    ] },
    { t: 'Precificação e gregas', n: 2, itens: [
      ['O que move o prêmio', 'Seis fatores: preço do ativo, strike, tempo até o vencimento, volatilidade, juros e dividendos. O modelo Black-Scholes junta todos numa fórmula; as gregas medem a sensibilidade a cada um.'],
      ['Delta', 'Quanto o prêmio muda quando o ativo sobe R$ 1. Call vai de 0 a 1, put de −1 a 0. Também funciona como aproximação grosseira da chance de terminar dentro do dinheiro, e como "quantidade equivalente de ações" da posição.'],
      ['Gamma', 'Quanto o delta muda a cada R$ 1 no ativo. É maior no dinheiro e perto do vencimento. Comprado em opções você tem gamma positivo (o delta trabalha a seu favor); vendido, gamma negativo (o delta trabalha contra).'],
      ['Theta', 'Quanto a posição ganha ou perde por dia só com a passagem do tempo. O decaimento acelera nas últimas semanas. É o aluguel que o comprador paga e o vendedor recebe.'],
      ['Vega', 'Quanto a posição ganha ou perde se a volatilidade implícita subir 1 ponto. Quem compra opção quer vol subindo; quem vende, caindo. Opções longas têm mais vega.'],
      ['Rho', 'Sensibilidade aos juros. Com Selic alta, calls ficam um pouco mais caras e puts um pouco mais baratas. Costuma ser a grega menos relevante para prazos curtos.']
    ] },
    { t: 'Volatilidade', n: 2, itens: [
      ['Histórica x implícita', 'A <b>histórica</b> mede quanto o ativo oscilou no passado. A <b>implícita</b> é a vol que, colocada no modelo, reproduz o prêmio negociado: é o preço do seguro. Comparar as duas diz se a opção está cara ou barata.'],
      ['Esmagamento de vol', 'Antes de eventos (balanço, Copom) a implícita sobe. Logo depois, despenca. Quem comprou straddle pode acertar o movimento e ainda perder, porque a vol caiu. Simule isso com o "choque de volatilidade" no Montador.'],
      ['Sorriso de volatilidade', 'Na prática, strikes diferentes negociam com vols implícitas diferentes. Puts muito fora do dinheiro costumam ser mais caras (o mercado paga por proteção contra quedas fortes).'],
      ['Movimento esperado', 'Um desvio em N dias ≈ preço × vol × √(N/365). Com vol de 30% e 30 dias, cerca de ±8,6%. Cerca de 68% das vezes o ativo termina dentro dessa faixa, segundo o modelo.']
    ] },
    { t: 'Estratégias', n: 2, itens: [
      ['Direcionais com risco definido', 'Travas de alta e de baixa limitam ganho e perda. Custam menos que a opção seca e sofrem menos com theta e vega, mas o ganho tem teto.'],
      ['Renda', 'Lançamento coberto e venda de put geram prêmio todo mês. O preço disso é abrir mão da alta (coberto) ou aceitar comprar o ativo no strike (put).'],
      ['Volatilidade', 'Straddle e strangle comprados ganham com movimento grande em qualquer direção. Vendidos ganham com o ativo parado, com risco alto. Iron condor e borboleta vendem volatilidade com risco definido.'],
      ['Proteção', 'Put de proteção é um seguro. Collar financia esse seguro vendendo uma call acima, travando o resultado numa faixa.'],
      ['Tempo', 'Trava de calendário vende o vencimento curto e compra o longo no mesmo strike. Lucra com o decaimento mais rápido da opção curta se o ativo ficar perto do strike.']
    ] },
    { t: 'Risco e operação', n: 3, itens: [
      ['Liquidez', 'Na B3 a liquidez se concentra em poucos ativos e em strikes perto do dinheiro, no vencimento mais próximo. Spread largo entre compra e venda é custo escondido: prefira séries com negócios.'],
      ['Exercício e designação', 'Calls de ações são normalmente americanas: quem vendeu pode ser exercido antes do vencimento, principalmente na véspera de dividendos. No vencimento, opções ITM tendem a ser exercidas automaticamente.'],
      ['Margem', 'Vender sem cobertura exige garantia. Se o mercado anda contra, a margem pedida sobe e a corretora pode zerar a posição no pior momento.'],
      ['Tamanho de posição', 'Dimensione pela perda máxima, não pelo prêmio. Arriscar 1% a 2% do capital por operação permite errar muitas vezes seguidas sem quebrar.'],
      ['Plano de saída', 'Defina antes de entrar: alvo de lucro (por exemplo, 50% do ganho máximo em travas de crédito), stop e o que fazer perto do vencimento. Rolar uma posição é fechar a atual e abrir outra mais longa.']
    ] }
  ];
  const QUIZ = [
    ['Você comprou uma call de strike R$ 40 por R$ 1,50. Qual o ponto de equilíbrio no vencimento?', ['R$ 38,50', 'R$ 40,00', 'R$ 41,50', 'R$ 43,00'], 2, 'Na call comprada, o ativo precisa subir até strike + prêmio: 40 + 1,50 = 41,50.'],
    ['Quem vende uma put assume qual obrigação?', ['Vender o ativo no strike', 'Comprar o ativo no strike', 'Pagar o prêmio', 'Nenhuma'], 1, 'O comprador da put tem o direito de vender; quem vendeu a put é obrigado a comprar no strike se for exercido.'],
    ['Qual grega mede o ganho ou a perda diária só pela passagem do tempo?', ['Delta', 'Gamma', 'Theta', 'Vega'], 2, 'Theta é o decaimento temporal. Positivo para quem vende opções, negativo para quem compra.'],
    ['Uma call fora do dinheiro, faltando 1 dia para o vencimento, tem prêmio formado por:', ['Só valor intrínseco', 'Só valor extrínseco', 'Metade de cada', 'Zero sempre'], 1, 'Fora do dinheiro não há valor intrínseco. Tudo que sobra é extrínseco, que vai a zero no vencimento.'],
    ['Antes do balanço a vol implícita está em 60%. Depois cai para 35%. O que acontece com um straddle comprado se o ativo não se mexer?', ['Ganha com a vol', 'Perde com a queda da vol e com o tempo', 'Fica igual', 'Ganha com theta'], 1, 'Straddle comprado tem vega positivo e theta negativo: perde nas duas frentes quando a vol cai e o ativo fica parado.'],
    ['Na B3, qual letra indica uma put com vencimento em março?', ['C', 'O', 'P', 'X'], 1, 'Puts usam M a X para janeiro a dezembro. Março é a terceira letra: O.'],
    ['Qual estrutura tem ganho limitado e perda ilimitada?', ['Compra de call', 'Trava de alta com call', 'Venda de call a seco', 'Compra de put'], 2, 'Na call vendida sem a ação, o ganho é o prêmio recebido e a perda cresce sem limite com a alta.'],
    ['Delta de uma posição de −250 significa que ela se comporta como:', ['250 ações compradas', '250 ações vendidas', '250 opções compradas', 'Nada, delta não se soma'], 1, 'Delta negativo equivale a estar vendido no ativo. −250 ≈ 250 ações vendidas a descoberto.'],
    ['Por que o comprador de uma call americana raramente exerce antes do vencimento?', ['É proibido', 'Perde o valor extrínseco que ainda existe', 'Paga imposto maior', 'A B3 cobra multa'], 1, 'Exercer joga fora o valor extrínseco. Normalmente é melhor vender a opção no mercado. A exceção comum é a véspera de dividendos.'],
    ['Com vol de 30% ao ano, qual o movimento esperado de 1 desvio em 30 dias, aproximadamente?', ['±2,5%', '±8,6%', '±15%', '±30%'], 1, '30% × √(30/365) ≈ 30% × 0,287 ≈ 8,6%.'],
    ['Um iron condor ganha o máximo quando:', ['O ativo dispara', 'O ativo despenca', 'O ativo termina entre os strikes vendidos', 'A vol sobe muito'], 2, 'O iron condor vende uma call e uma put fora do dinheiro, compradas as asas. Lucro máximo = crédito, se o ativo ficar dentro da faixa.'],
    ['O ganho com opções de ações por pessoa física tem a isenção de R$ 20 mil por mês?', ['Sim', 'Não', 'Só no day trade', 'Só para puts'], 1, 'A isenção de R$ 20 mil vale para vendas de ações no mercado à vista. Opções são tributadas sempre: 15% swing e 20% day trade.']
  ];
  let quiz;
  try { quiz = JSON.parse(localStorage.getItem(QUIZ_KEY) || 'null') || { ans: {}, best: 0, read: {} }; } catch (e) { quiz = { ans: {}, best: 0, read: {} }; }
  if (!quiz.read) quiz.read = {};
  const saveQuiz = () => { try { localStorage.setItem(QUIZ_KEY, JSON.stringify(quiz)); } catch (e) { /* sem espaço */ } };
  function renderLearn() {
    const total = TRILHA.reduce((a, m) => a + m.itens.length, 0), lidos = Object.keys(quiz.read).length;
    const nAns = Object.keys(quiz.ans).length, nOk = Object.entries(quiz.ans).filter(([i, v]) => QUIZ[i] && QUIZ[i][2] === v).length;
    body.innerHTML = `
      <section class="ana-card">
        <div class="opt-h"><h3>Trilha do trader de opções</h3><span>${lidos} de ${total} tópicos marcados como entendidos</span></div>
        <div class="opt-prog"><i style="width:${(lidos / total * 100).toFixed(0)}%"></i></div>
        <div class="opt-mods">${TRILHA.map((m, mi) => `
          <div class="opt-mod"><div class="opt-mod-h"><b>${mi + 1}. ${m.t}</b><span class="lv lv${m.n}"></span><span>${m.itens.filter((_, ii) => quiz.read[mi + '.' + ii]).length}/${m.itens.length}</span></div>
          ${m.itens.map(([h, tx], ii) => { const k = mi + '.' + ii; return `<details class="opt-tp${quiz.read[k] ? ' ok' : ''}"><summary><i class="fas fa-${quiz.read[k] ? 'check-circle' : 'circle'}"></i>${h}</summary><div><p>${tx}</p><button class="opt-link" data-read="${k}">${quiz.read[k] ? 'desmarcar' : 'entendi'}</button></div></details>`; }).join('')}
          </div>`).join('')}</div>
        <p class="opt-note">Para fixar: abra o Montador, escolha a estratégia citada e mexa na data simulada e no choque de volatilidade.</p>
      </section>
      <section class="ana-card">
        <div class="opt-h"><h3>Teste seus conhecimentos</h3><span>${nAns ? `${nOk} de ${nAns} certas` : `${QUIZ.length} perguntas`}${quiz.best ? ` · melhor resultado completo: ${quiz.best}/${QUIZ.length}` : ''}</span><span class="sp"></span>${nAns ? '<button class="btn-sm" data-qreset><i class="fas fa-redo"></i> Recomeçar</button>' : ''}</div>
        <ol class="opt-quiz">${QUIZ.map(([q, ops, ok, ex], i) => { const a = quiz.ans[i]; const done = a != null; return `<li class="${done ? (a === ok ? 'right' : 'wrong') : ''}"><p>${q}</p><div class="opt-qops">${ops.map((o, j) => `<button data-q="${i}" data-a="${j}" ${done ? 'disabled' : ''} class="${done && j === ok ? 'ok' : ''}${done && j === a && a !== ok ? ' no' : ''}">${o}</button>`).join('')}</div>${done ? `<p class="opt-ex"><b>${a === ok ? 'Certo.' : 'Não foi dessa vez.'}</b> ${ex}</p>` : ''}</li>`; }).join('')}</ol>
      </section>`;
  }

  /* =========================================================
     RENDER GERAL E NAVEGAÇÃO
     ========================================================= */
  const RENDER = { builder: renderBuilder, chain: renderChain, vol: renderVol, prob: renderProb, b3: renderB3, learn: renderLearn };
  function moveBar() {
    const btn = $o(`.opt-subs [data-sub="${st.sub}"]`), bar = $o('.opt-subs-bar');
    if (!btn || !bar) return;
    bar.style.width = btn.offsetWidth + 'px';
    bar.style.transform = `translateX(${btn.offsetLeft}px)`;
  }
  function renderAll() {
    if (!RENDER[st.sub]) st.sub = 'builder';
    $$o('.opt-subs [data-sub]').forEach((b) => { const on = b.dataset.sub === st.sub; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    renderTop();
    RENDER[st.sub]();
    moveBar();
  }
  // re-render só da parte variável, preservando o foco do campo que está sendo digitado
  function refresh() {
    if (st.sub === 'builder') { renderLegs(); renderResults(); } else RENDER[st.sub]();
  }
  function keepFocus(fn) {
    const a = document.activeElement, id = a && a.id, pos = a && a.selectionStart;
    fn();
    if (id) { const n = document.getElementById(id); if (n && n !== a) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* number */ } } }
  }

  /* ---------------- eventos ---------------- */
  root.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t || !root.contains(t)) return;
    const d = t.dataset;
    if (d.sub) { st.sub = d.sub; save(); renderAll(); return; }
    if (t.id === 'opt-load') { const v = $o('#opt-asset').value; if (v.trim()) loadAsset(v); return; }
    if ('usehv' in d && st.hv && st.hv.v21) { st.vol = +st.hv.v21.toFixed(4); st.legs.forEach((l) => { if (l.type !== 'stock') l.iv = st.vol; }); reprice(); save(); renderAll(); return; }
    if (d.preset) { buildPreset(d.preset); save(); renderBuilder(); return; }
    if ('addleg' in d) {
      const last = st.legs.filter((l) => l.type !== 'stock').slice(-1)[0];
      st.legs.push({ id: uid(), type: 'call', side: 1, K: last ? roundK(last.K * 1.05, st.S) : roundK(st.S, st.S), days: last ? last.days : st.days, iv: st.vol, qty: st.lot, theo: true, prem: null });
      st.preset = null; reprice(); save(); renderBuilder(); return;
    }
    if ('save' in d) {
      if (!st.legs.length) return;
      const s = STRATS.find((x) => x.id === st.preset);
      const nome = (prompt('Nome para esta montagem:', s ? s.nome : 'Minha estratégia') || '').trim();
      if (!nome) return;
      saved.unshift({ nome, asset: st.asset, S: st.S, ts: Date.now(), preset: st.preset, legs: JSON.parse(JSON.stringify(st.legs)) });
      saveSaved(); renderSaved(); return;
    }
    if (d.load != null) {
      const x = saved[+d.load]; if (!x) return;
      st.legs = JSON.parse(JSON.stringify(x.legs)); st.preset = x.preset || null;
      if (x.asset !== st.asset) { st.asset = x.asset; st.S = x.S; }
      st.tEval = 0; save(); renderAll(); return;
    }
    if (d.delsv != null) { saved.splice(+d.delsv, 1); saveSaved(); renderSaved(); return; }
    if (d.f) {
      const row = t.closest('[data-leg]'), l = row && st.legs.find((x) => x.id === row.dataset.leg);
      if (!l) return;
      if (d.f === 'side') { l.side = -l.side; st.preset = null; }
      else if (d.f === 'del') { st.legs = st.legs.filter((x) => x !== l); st.preset = null; }
      else if (d.f === 'theo') { l.theo = true; reprice(); }
      save(); renderBuilder(); return;
    }
    if (d.cs) { chainSide = +d.cs; renderChain(); return; }
    if (d.chain) {
      const k = +d.k;
      if (st.preset) st.legs = [];
      st.preset = null;
      st.legs.push({ id: uid(), type: d.chain, side: chainSide, K: k, days: st.days, iv: st.vol, qty: st.lot, theo: true, prem: null });
      reprice(); save();
      t.classList.add('added'); setTimeout(() => t.classList.remove('added'), 700);
      const n = st.legs.length;
      setStatus(`${chainSide > 0 ? 'Compra' : 'Venda'} de ${d.chain} ${nf(k)} adicionada ao Montador (${n} perna${n > 1 ? 's' : ''}).`);
      return;
    }
    if (d.useiv) { st.vol = +(+d.useiv).toFixed(4); st.legs.forEach((l) => { if (l.type !== 'stock') l.iv = st.vol; }); reprice(); save(); renderTop(); setStatus(`Vol de ${pct(st.vol)} aplicada.`); return; }
    if (d.setdays) { st.days = Math.max(1, +d.setdays); st.legs.forEach((l) => { if (l.type !== 'stock' && l.theo) l.days = st.days; }); reprice(); save(); renderTop(); setStatus(`Prazo ajustado para ${st.days} dias.`); return; }
    if (d.read) { if (quiz.read[d.read]) delete quiz.read[d.read]; else quiz.read[d.read] = 1; saveQuiz(); const open = $$o('details.opt-tp').map((x) => x.open); renderLearn(); $$o('details.opt-tp').forEach((x, i) => { x.open = open[i]; }); return; }
    if (d.q != null) {
      quiz.ans[+d.q] = +d.a;
      if (Object.keys(quiz.ans).length === QUIZ.length) quiz.best = Math.max(quiz.best || 0, Object.entries(quiz.ans).filter(([i, v]) => QUIZ[i][2] === v).length);
      saveQuiz(); const y = window.scrollY; renderLearn(); window.scrollTo(0, y); return;
    }
    if ('qreset' in d) { quiz.ans = {}; saveQuiz(); renderLearn(); }
  });

  // campos: atualiza o estado a cada digitação, sem perder o foco
  root.addEventListener('input', (e) => {
    const t = e.target, v = t.value;
    if (t.id === 'opt-S') { const x = num(v, 0); if (x > 0) { st.S = x; st.sSrc = 'digitado à mão'; reprice(); save(); keepFocus(refresh); } return; }
    if (t.id === 'opt-r') { const x = num(v, NaN); if (isFinite(x) && x >= 0) { st.r = x / 100; st.rManual = true; st.rSrc = 'juros digitados à mão'; reprice(); save(); keepFocus(refresh); } return; }
    if (t.id === 'opt-vol') { const x = num(v, 0); if (x > 0) { const old = st.vol; st.vol = x / 100; st.legs.forEach((l) => { if (l.type !== 'stock' && Math.abs(l.iv - old) < 1e-9) l.iv = st.vol; }); reprice(); save(); keepFocus(refresh); } return; }
    if (t.id === 'opt-days') { const x = Math.round(num(v, 0)); if (x >= 1) { const old = st.days; st.days = x; st.legs.forEach((l) => { if (l.type !== 'stock' && l.days > 0) l.days = Math.max(1, Math.round(l.days * x / old)); }); reprice(); save(); keepFocus(refresh); } return; }
    if (t.id === 'opt-lot') { const x = Math.round(num(v, 0)); if (x >= 1) { const old = st.lot; st.lot = x; st.legs.forEach((l) => { l.qty = Math.max(1, Math.round(l.qty * x / old)); }); save(); keepFocus(refresh); } return; }
    if (t.id === 'opt-tev') { st.tEval = +v; save(); renderResults(); return; }
    if (t.id === 'opt-vs') { st.volShift = +v / 100; save(); renderResults(); return; }
    if (t.id === 'opt-cap') { st.capital = Math.max(0, num(v, 0)); save(); keepFocus(renderResults); return; }
    if (t.id === 'opt-rp') { st.riskPct = clamp(num(v, 0), 0, 100); save(); keepFocus(renderResults); return; }
    if (t.id && t.id.startsWith('ivc-')) {
      const f = t.id.slice(4);
      if (f === 'type') ivc.type = v; else if (f === 'prem') ivc.prem = v === '' ? null : num(v, null); else ivc[f] = num(v, null);
      keepFocus(renderVol); return;
    }
    if (t.id === 'prob-X') { const x = num(v, 0); if (x > 0) { probX = x; keepFocus(renderProb); } return; }
    if (t.id === 'b3-code') { decodeIn = v; keepFocus(renderB3); return; }
    if (t.id === 'ir-lucro' || t.id === 'ir-prej') { st[t.id === 'ir-lucro' ? 'irLucro' : 'irPrej'] = num(v, 0); save(); keepFocus(renderB3); return; }
    const row = t.closest('[data-leg]');
    if (row && t.dataset.f) {
      const l = st.legs.find((x) => x.id === row.dataset.leg); if (!l) return;
      const f = t.dataset.f;
      if (f === 'type') { l.type = v; if (v === 'stock') { l.K = null; l.days = null; l.prem = st.S; } else { l.K = l.K || roundK(st.S, st.S); l.days = l.days || st.days; l.iv = l.iv || st.vol; } l.theo = true; st.preset = null; reprice(); save(); renderBuilder(); return; }
      const x = num(v, NaN);
      if (!isFinite(x)) return;
      if (f === 'K' && x > 0) { l.K = x; }
      else if (f === 'days' && x >= 1) { l.days = Math.round(x); }
      else if (f === 'iv' && x > 0) { l.iv = x / 100; }
      else if (f === 'prem' && x >= 0) { l.prem = x; l.theo = false; t.classList.remove('theo'); }
      else if (f === 'qty' && x >= 1) { l.qty = Math.round(x); }
      else return;
      if (f !== 'prem') reprice();
      save();
      // atualiza o prêmio teórico na própria linha sem redesenhar a tabela (mantém o foco)
      if (l.theo && f !== 'prem') { const p = row.querySelector('[data-f="prem"]'); if (p) p.value = (+l.prem).toFixed(2); }
      renderResults();
    }
  });
  root.addEventListener('change', (e) => {
    if (e.target.id === 'ivc-type') { ivc.type = e.target.value; renderVol(); }
    if (e.target.dataset.f === 'prem') renderLegs(); // mostra o botão B-S depois de editar
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'opt-asset') { e.preventDefault(); const v = e.target.value; if (v.trim()) loadAsset(v); } });
  root.addEventListener('pointermove', (e) => { if (e.target.closest && e.target.closest('#opt-chart')) chartHover(e); });
  root.addEventListener('pointerleave', (e) => { if (e.target.id !== 'opt-chart') return; const tip = $o('#opt-chart .opt-tip'); if (tip) tip.hidden = true; }, true);
  let rzT, lastW = root.clientWidth;
  window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (root.clientWidth === lastW) return; lastW = root.clientWidth; moveBar(); if (st.sub === 'builder') renderResults(); }, 150); });

  /* ---------------- estilos (no mesmo arquivo para o index.html não crescer) ---------------- */
  const css = document.createElement('style');
  css.textContent = `
  #opt-root { --mono:'JetBrains Mono',monospace; }
  #opt-root .mut { color:var(--text-3); font-size:12.5px; }
  #opt-root .pos { color:var(--pos); } #opt-root .neg { color:var(--neg); }
  .opt-head { display:flex; align-items:center; gap:14px 18px; flex-wrap:wrap; margin:4px 0 16px; }
  .opt-title { flex:1 1 260px; min-width:0; }
  .opt-title h2 { margin:0; font-size:20px; letter-spacing:-.015em; color:var(--text); }
  .opt-title p { margin:4px 0 0; font-size:12px; color:var(--text-3); font-family:var(--mono); }
  .opt-subs { position:relative; display:flex; padding:3px; border:1px solid var(--line); border-radius:12px; background:var(--surface); overflow-x:auto; scrollbar-width:none; max-width:100%; }
  .opt-subs::-webkit-scrollbar { display:none; }
  .opt-subs button { position:relative; z-index:1; flex:0 0 auto; border:0; background:transparent; color:var(--text-3); font:inherit; font-size:12.5px; font-weight:600; padding:7px 13px; border-radius:9px; cursor:pointer; transition:color .18s; display:flex; align-items:center; gap:7px; white-space:nowrap; }
  .opt-subs button i { font-size:11px; opacity:.8; }
  .opt-subs button.on { color:var(--text); }
  .opt-subs button.on i { color:var(--accent); opacity:1; }
  .opt-subs-bar { position:absolute; top:3px; bottom:3px; left:0; width:0; border-radius:9px; background:var(--surface-2); box-shadow:inset 0 0 0 1px var(--line-2), inset 0 -2px 0 var(--accent); transition:transform .3s var(--ease,ease), width .3s var(--ease,ease); }
  #opt-root .ana-card { margin-bottom:14px; }
  .opt-top { padding:14px 16px 10px; }
  .opt-fields { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:10px 12px; }
  .opt-fields.sm { grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); margin-bottom:12px; }
  .opt-f { display:flex; flex-direction:column; gap:5px; min-width:0; }
  .opt-f > span { font-size:10.5px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--text-3); }
  .opt-inp { display:flex; align-items:center; gap:6px; height:36px; padding:0 10px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); transition:border-color .16s, box-shadow .16s; min-width:0; }
  .opt-inp:focus-within { border-color:var(--accent-line); box-shadow:0 0 0 3px var(--accent-soft); }
  .opt-inp em { font-style:normal; font-size:11px; color:var(--text-3); font-family:var(--mono); }
  #opt-root .opt-inp input, #opt-root .opt-inp select { flex:1; min-width:0; width:100%; height:100%; border:0 !important; background:transparent !important; box-shadow:none !important; color:var(--text); font-family:var(--mono); font-size:13.5px; outline:none; padding:0; border-radius:0 !important; }
  #opt-root .opt-inp select { font-family:inherit; cursor:pointer; }
  .opt-asset input { text-transform:uppercase; font-weight:600; }
  .opt-go { border:0; background:var(--accent-soft); color:var(--accent); width:28px; height:26px; border-radius:7px; cursor:pointer; flex:0 0 auto; margin-right:-4px; }
  .opt-go:hover { background:var(--accent); color:#1a1205; }
  .opt-meta { display:flex; flex-wrap:wrap; gap:6px 18px; margin-top:10px; font-size:11.5px; color:var(--text-3); font-family:var(--mono); }
  .opt-meta b { color:var(--text-2); }
  .opt-meta .err { color:var(--neg); }
  .opt-link { border:0; background:none; color:var(--accent); font:inherit; font-size:11.5px; font-weight:600; cursor:pointer; padding:0 2px; text-decoration:underline; text-underline-offset:2px; }
  .opt-h { display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; margin-bottom:12px; }
  .opt-h h3 { margin:0; font-size:14.5px; font-weight:600; color:var(--text); }
  .opt-h > span:not(.sp):not(.opt-bias) { font-size:11.5px; color:var(--text-3); font-family:var(--mono); }
  .opt-h .sp { flex:1; }
  .opt-grid { display:grid; grid-template-columns:minmax(0, 1fr) minmax(0, 1.55fr); gap:14px; }
  .opt-grid2 { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px; }
  .opt-grid > .ana-card, .opt-grid2 > .ana-card, .opt-col > .ana-card { margin-bottom:14px; }
  .opt-col { min-width:0; display:flex; flex-direction:column; }
  .opt-col .opt-legs { flex:0 0 auto; }
  .opt-col .opt-kpis { grid-template-columns:repeat(3, minmax(0, 1fr)); }
  .opt-grid > .opt-lib { align-self:start; }
  .opt-lib-g + .opt-lib-g { margin-top:12px; }
  .opt-lib-t { font-size:10.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--text-3); margin-bottom:7px; }
  .opt-chips { display:flex; flex-wrap:wrap; gap:6px; }
  .opt-chip { display:inline-flex; align-items:center; gap:7px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); font:inherit; font-size:12px; padding:6px 10px; border-radius:99px; cursor:pointer; transition:all .16s; }
  .opt-chip:hover { color:var(--text); border-color:var(--line-2); }
  .opt-chip.on { background:var(--accent-soft); border-color:var(--accent-line); color:var(--accent); }
  .lv { display:inline-block; width:14px; height:6px; border-radius:2px; background:linear-gradient(90deg, currentColor 0 30%, transparent 30% 35%, var(--line-2) 35% 65%, transparent 65% 70%, var(--line-2) 70%); opacity:.7; }
  .lv2 { background:linear-gradient(90deg, currentColor 0 30%, transparent 30% 35%, currentColor 35% 65%, transparent 65% 70%, var(--line-2) 70%); }
  .lv3 { background:linear-gradient(90deg, currentColor 0 30%, transparent 30% 35%, currentColor 35% 65%, transparent 65% 70%, currentColor 70%); }
  .opt-bias { font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; padding:3px 8px; border-radius:6px; }
  .opt-bias.up { color:var(--pos); background:color-mix(in srgb, var(--pos) 12%, transparent); }
  .opt-bias.dn { color:var(--neg); background:color-mix(in srgb, var(--neg) 12%, transparent); }
  .opt-bias.nt { color:var(--info); background:color-mix(in srgb, var(--info) 12%, transparent); }
  .opt-bias.vl { color:var(--accent); background:var(--accent-soft); }
  .opt-why { font-size:12.5px; color:var(--text-2); line-height:1.55; margin:0 0 12px; }
  .opt-why b { color:var(--text); font-weight:600; }
  .opt-legs-wrap, .opt-mx-wrap, .opt-chain-wrap { overflow-x:auto; margin:0 -4px; padding:0 4px; }
  .opt-tbl { width:100%; border-collapse:collapse; font-size:12.5px; }
  .opt-tbl th { text-align:left; font-size:10px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; color:var(--text-3); padding:0 6px 7px; white-space:nowrap; border-bottom:1px solid var(--line); }
  .opt-tbl td { padding:6px; border-bottom:1px solid var(--line); vertical-align:middle; white-space:nowrap; }
  .opt-tbl tr:last-child td { border-bottom:0; }
  #opt-legs input, #opt-legs select { width:78px; height:30px; padding:0 8px; border:1px solid var(--line) !important; border-radius:8px !important; background:var(--surface-2) !important; color:var(--text); font-family:var(--mono); font-size:12.5px; outline:none; }
  #opt-legs select { width:86px; font-family:inherit; }
  #opt-legs input:focus, #opt-legs select:focus { border-color:var(--accent-line) !important; box-shadow:0 0 0 3px var(--accent-soft); }
  #opt-legs input[data-f="qty"] { width:72px; } #opt-legs input[data-f="days"] { width:58px; } #opt-legs input[data-f="iv"] { width:62px; }
  #opt-legs input.theo { font-style:italic; color:var(--text-3); }
  .opt-side { border:0; font:inherit; font-size:11.5px; font-weight:700; padding:6px 10px; border-radius:8px; cursor:pointer; min-width:72px; }
  .opt-side.buy { color:var(--pos); background:color-mix(in srgb, var(--pos) 13%, transparent); }
  .opt-side.sell { color:var(--neg); background:color-mix(in srgb, var(--neg) 13%, transparent); }
  .opt-x { border:0; background:transparent; color:var(--text-3); cursor:pointer; font-size:13px; width:26px; height:26px; border-radius:7px; }
  .opt-x:hover { color:var(--neg); background:color-mix(in srgb, var(--neg) 10%, transparent); }
  .opt-note { font-size:11.5px; color:var(--text-3); line-height:1.55; margin:10px 0 0; }
  .opt-warn { font-size:12px; color:var(--text-2); line-height:1.55; margin:0 0 12px; padding:9px 12px; border-radius:10px; border:1px solid var(--accent-line); background:var(--accent-soft); }
  .opt-warn i { color:var(--accent); margin-right:4px; }
  .opt-kpis { display:grid; grid-template-columns:repeat(6, minmax(0, 1fr)); gap:10px; }
  .opt-kpis.k3 { grid-template-columns:repeat(3, minmax(0, 1fr)); } .opt-kpis.k2 { grid-template-columns:repeat(2, minmax(0, 1fr)); }
  .opt-kpis > div { padding:11px 12px; border:1px solid var(--line); border-radius:11px; background:var(--surface-2); min-width:0; }
  .opt-kpis span { display:block; font-size:10.5px; color:var(--text-3); font-weight:600; letter-spacing:.04em; margin-bottom:5px; }
  .opt-kpis b { display:block; font-family:var(--mono); font-size:16px; font-weight:600; color:var(--text); font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
  .opt-kpis b.pos { color:var(--pos); } .opt-kpis b.neg { color:var(--neg); }
  .opt-leg { display:flex; gap:14px; font-size:11px; color:var(--text-3); flex-wrap:wrap; }
  .opt-leg span { display:inline-flex; align-items:center; gap:6px; }
  .opt-leg i { display:inline-block; width:16px; height:0; border-top:2px solid var(--accent); }
  .opt-leg .l-now { border-top:2px dashed var(--info); }
  .opt-leg .l-sd { height:9px; border:0; background:color-mix(in srgb, var(--info) 14%, transparent); border-radius:2px; }
  .opt-sliders { display:grid; grid-template-columns:1fr 1fr; gap:10px 22px; margin-bottom:8px; }
  .opt-sliders label { display:flex; flex-direction:column; gap:4px; font-size:11.5px; color:var(--text-3); }
  .opt-sliders b { color:var(--text); font-family:var(--mono); font-weight:600; }
  .opt-sliders input[type=range] { width:100%; accent-color:var(--accent); }
  .opt-chart { position:relative; min-height:230px; }
  .opt-chart svg { display:block; touch-action:pan-y; }
  .opt-chart .gr { stroke:var(--line); }
  .opt-chart .zl { stroke:var(--line-2); stroke-width:1.2; }
  .opt-chart .ax { fill:var(--text-3); font-size:10.5px; font-family:'JetBrains Mono',monospace; }
  .opt-chart .sdb { fill:color-mix(in srgb, var(--info) 8%, transparent); }
  .opt-chart .ar-up { fill:color-mix(in srgb, var(--pos) 16%, transparent); }
  .opt-chart .ar-dn { fill:color-mix(in srgb, var(--neg) 16%, transparent); }
  .opt-chart .ln-exp { fill:none; stroke:var(--accent); stroke-width:2.2; stroke-linejoin:round; }
  .opt-chart .ln-now { fill:none; stroke:var(--info); stroke-width:1.8; stroke-dasharray:5 4; }
  .opt-chart .kl { stroke:var(--text-3); stroke-dasharray:2 4; opacity:.6; }
  .opt-chart .kt { fill:var(--text-3); font-size:10px; font-family:'JetBrains Mono',monospace; }
  .opt-chart .sl { stroke:var(--text-2); stroke-width:1; }
  .opt-chart .st { fill:var(--text-2); font-size:10.5px; font-family:'JetBrains Mono',monospace; font-weight:600; }
  .opt-chart .be { fill:var(--bg); stroke:var(--accent); stroke-width:2; }
  .opt-chart .hx { stroke:var(--text-3); stroke-dasharray:3 3; }
  .opt-chart .hd1 { fill:var(--accent); } .opt-chart .hd2 { fill:var(--info); }
  .opt-tip { position:absolute; pointer-events:none; padding:8px 10px; border-radius:9px; background:var(--surface-3, var(--surface-2)); border:1px solid var(--line-2); font-size:11.5px; line-height:1.5; color:var(--text-2); white-space:nowrap; box-shadow:var(--shadow-lg); font-family:var(--mono); }
  .opt-tip b { color:var(--text); }
  .opt-empty { padding:60px 0; text-align:center; color:var(--text-3); font-size:13px; }
  .opt-gk { display:flex; flex-direction:column; gap:9px; }
  .opt-gk > div { display:grid; grid-template-columns:28px 92px minmax(0, 1fr); align-items:baseline; gap:8px; font-size:12px; }
  .opt-gk i { font-style:normal; font-family:var(--mono); font-weight:700; color:var(--accent); font-size:14px; text-align:center; }
  .opt-gk b { font-family:var(--mono); font-size:13.5px; color:var(--text); text-align:right; }
  .opt-gk span { color:var(--text-3); line-height:1.45; }
  .opt-big { font-size:14px; color:var(--text-2); line-height:1.5; margin:4px 0 0; }
  .opt-big b { color:var(--text); font-family:var(--mono); font-size:17px; }
  .opt-mx { width:100%; border-collapse:separate; border-spacing:3px; font-family:var(--mono); font-size:11.5px; }
  .opt-mx th { font-size:10.5px; color:var(--text-3); font-weight:600; padding:4px 6px; white-space:nowrap; text-align:center; }
  .opt-mx tbody th { text-align:left; color:var(--text-2); }
  .opt-mx th small { display:block; font-size:9.5px; color:var(--text-3); font-weight:400; }
  .opt-mx td { text-align:center; padding:7px 6px; border-radius:6px; white-space:nowrap; color:var(--text); }
  .opt-mx td.p { background:color-mix(in srgb, var(--pos) calc(var(--k) * 100%), transparent); }
  .opt-mx td.n { background:color-mix(in srgb, var(--neg) calc(var(--k) * 100%), transparent); }
  .opt-mx tr.cur th { color:var(--accent); }
  .opt-saved { display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:8px; }
  .opt-sv { display:flex; align-items:center; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); }
  .opt-sv > button:first-child { flex:1; min-width:0; text-align:left; border:0; background:none; color:var(--text); font:inherit; padding:9px 11px; cursor:pointer; }
  .opt-sv b { display:block; font-size:12.5px; font-weight:600; }
  .opt-sv span { display:block; font-size:11px; color:var(--text-3); font-family:var(--mono); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .opt-sv:hover { border-color:var(--accent-line); }
  .opt-seg { display:inline-flex; align-items:center; gap:4px; font-size:11.5px; color:var(--text-3); }
  .opt-seg button { border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); font:inherit; font-size:11.5px; font-weight:600; padding:5px 10px; border-radius:8px; cursor:pointer; }
  .opt-seg button.on { border-color:var(--accent-line); color:var(--accent); background:var(--accent-soft); }
  .opt-chain { width:100%; border-collapse:collapse; font-family:var(--mono); font-size:12px; }
  .opt-chain th { font-size:10px; font-weight:600; color:var(--text-3); padding:6px; text-align:center; white-space:nowrap; letter-spacing:.04em; }
  .opt-chain thead th.c { color:var(--pos); border-bottom:2px solid color-mix(in srgb, var(--pos) 40%, transparent); }
  .opt-chain thead th.p { color:var(--neg); border-bottom:2px solid color-mix(in srgb, var(--neg) 40%, transparent); }
  .opt-chain td { padding:4px 6px; text-align:center; border-top:1px solid var(--line); color:var(--text-2); white-space:nowrap; }
  .opt-chain tbody th { border-top:1px solid var(--line); color:var(--text); font-size:12.5px; background:var(--surface-2); }
  .opt-chain td.itm { background:color-mix(in srgb, var(--accent) 6%, transparent); }
  .opt-chain tr.atm th { color:var(--accent); box-shadow:inset 0 0 0 1px var(--accent-line); }
  .opt-chain td button { border:1px solid transparent; background:none; color:var(--text); font:inherit; font-weight:600; padding:4px 8px; border-radius:7px; cursor:pointer; }
  .opt-chain td button:hover { border-color:var(--accent-line); color:var(--accent); }
  .opt-chain td button.added { background:var(--accent); color:#1a1205; }
  .opt-spark { margin-top:12px; }
  .opt-spark svg { width:100%; height:90px; display:block; }
  .opt-spark .ln { fill:none; stroke:var(--accent); stroke-width:1.6; vector-effect:non-scaling-stroke; }
  .opt-spark .ar { fill:var(--accent-soft); }
  .opt-spark-r, .opt-spark-ax { display:flex; justify-content:space-between; font-size:10.5px; color:var(--text-3); font-family:var(--mono); margin-top:4px; }
  .opt-tbl.em td { font-family:var(--mono); font-size:12px; }
  .opt-tbl.letters td, .opt-tbl.letters th { text-align:center; }
  .opt-venc { list-style:none; margin:0; padding:0; }
  .opt-venc li { display:flex; align-items:center; gap:10px; padding:7px 0; border-bottom:1px solid var(--line); font-size:12.5px; }
  .opt-venc li:last-child { border-bottom:0; }
  .opt-venc b { color:var(--text); font-weight:600; min-width:150px; font-family:var(--mono); font-size:12px; }
  .opt-venc span { color:var(--text-3); font-family:var(--mono); font-size:11.5px; }
  .opt-venc .lt { margin-left:auto; }
  .opt-ul { margin:0; padding-left:18px; display:flex; flex-direction:column; gap:8px; font-size:12.5px; color:var(--text-2); line-height:1.55; }
  .opt-ul b { color:var(--text); }
  .opt-prog { height:6px; border-radius:99px; background:var(--surface-2); overflow:hidden; margin-bottom:14px; border:1px solid var(--line); }
  .opt-prog i { display:block; height:100%; background:linear-gradient(90deg, var(--accent), var(--accent-2, var(--accent))); transition:width .4s var(--ease,ease); }
  .opt-mods { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:12px; }
  .opt-mod { border:1px solid var(--line); border-radius:12px; padding:12px; background:var(--surface-2); }
  .opt-mod-h { display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:13px; color:var(--text); }
  .opt-mod-h .lv { color:var(--accent); }
  .opt-mod-h span:last-child { margin-left:auto; font-family:var(--mono); font-size:11px; color:var(--text-3); }
  .opt-tp { border-top:1px solid var(--line); }
  .opt-tp summary { list-style:none; cursor:pointer; padding:8px 2px; font-size:12.5px; color:var(--text-2); display:flex; align-items:center; gap:8px; }
  .opt-tp summary::-webkit-details-marker { display:none; }
  .opt-tp summary i { font-size:11px; color:var(--text-3); }
  .opt-tp.ok summary i { color:var(--pos); }
  .opt-tp[open] summary { color:var(--text); }
  .opt-tp > div { padding:0 2px 10px 21px; }
  .opt-tp p { margin:0 0 6px; font-size:12.5px; line-height:1.6; color:var(--text-2); }
  .opt-tp p b { color:var(--text); }
  .opt-quiz { margin:0; padding-left:20px; display:flex; flex-direction:column; gap:14px; }
  .opt-quiz li { font-size:13px; color:var(--text); }
  .opt-quiz li > p { margin:0 0 7px; line-height:1.5; }
  .opt-qops { display:flex; flex-wrap:wrap; gap:6px; }
  .opt-qops button { border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); font:inherit; font-size:12px; padding:6px 11px; border-radius:9px; cursor:pointer; }
  .opt-qops button:not([disabled]):hover { border-color:var(--accent-line); color:var(--text); }
  .opt-qops button[disabled] { cursor:default; opacity:.55; }
  .opt-qops button.ok { opacity:1; border-color:color-mix(in srgb, var(--pos) 50%, transparent); color:var(--pos); background:color-mix(in srgb, var(--pos) 10%, transparent); }
  .opt-qops button.no { opacity:1; border-color:color-mix(in srgb, var(--neg) 50%, transparent); color:var(--neg); background:color-mix(in srgb, var(--neg) 10%, transparent); }
  .opt-ex { margin:8px 0 0; font-size:12px; color:var(--text-2); line-height:1.55; }
  #opt-root .ind-boot { padding:60px 20px; text-align:center; color:var(--text-3); font-size:13px; }
  @media (max-width: 1180px) { .opt-kpis { grid-template-columns:repeat(3, minmax(0, 1fr)); } .opt-grid { grid-template-columns:1fr; } }
  @media (max-width: 760px) { .opt-grid2 { grid-template-columns:1fr; } }
  @media (max-width: 640px) {
    .opt-head { margin-bottom:12px; }
    .opt-subs { width:100%; }
    .opt-fields { grid-template-columns:repeat(2, minmax(0, 1fr)); }
    .opt-asset { grid-column:1 / -1; }
    .opt-kpis, .opt-kpis.k3 { grid-template-columns:repeat(2, minmax(0, 1fr)); }
    .opt-kpis b { font-size:14.5px; }
    .opt-sliders { grid-template-columns:1fr; }
    .opt-leg { width:100%; }
    .opt-gk > div { grid-template-columns:24px 80px minmax(0, 1fr); }
    .opt-venc b { min-width:0; }
    .opt-venc .lt { display:none; }
    .opt-mods { grid-template-columns:1fr; }
  }
  @media (prefers-reduced-motion: reduce) { .opt-subs-bar, .opt-prog i { transition:none; } }
  `;
  document.head.appendChild(css);

  /* ---------------- início ---------------- */
  if (!st.legs.length) buildPreset(st.preset && STRATS.some((x) => x.id === st.preset) ? st.preset : 'long_call');
  else reprice();
  renderAll();
  loadSelic();
  if (st.asset) loadAsset(st.asset);
  // a barra das sub-abas precisa medir os botões quando o painel fica visível
  const panel = document.getElementById('options-panel');
  if (panel) new MutationObserver(() => { if (panel.classList.contains('active')) requestAnimationFrame(() => { moveBar(); if (st.sub === 'builder' && root.clientWidth !== lastW) { lastW = root.clientWidth; renderResults(); } }); }).observe(panel, { attributes: true, attributeFilter: ['class'] });
})();
