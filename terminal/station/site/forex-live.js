/* Câmbio da Mesa (Cesta do DXY e Moedas emergentes).
   - Ao vivo: os pares que a Deriv transmite (WebSocket público, sem chave nem conta), um preço por segundo.
   - O resto: lote /quotes do worker (Yahoo) a cada 30 s; o worker guarda cada lote por até 60 s.
   A variação do dia de um par ao vivo usa o fechamento anterior do Yahoo. Sem esse fechamento, mostra só o preço. */
globalThis.MMForexLive = (() => {
  // símbolo do Yahoo usado na Mesa -> par da Deriv; inv = a Mesa mostra o inverso (USD/EUR = 1 / EUR/USD)
  const DERIV = Object.freeze({
    'EUR=X': { s: 'frxEURUSD', inv: true },
    'JPY=X': { s: 'frxUSDJPY' },
    'GBP=X': { s: 'frxGBPUSD', inv: true },
    'CAD=X': { s: 'frxUSDCAD' },
    'CHF=X': { s: 'frxUSDCHF' },
    'MXN=X': { s: 'frxUSDMXN' },
    'AUD=X': { s: 'frxAUDUSD', inv: true },
    // metais à vista: não têm par no Yahoo; a variação é contra o fechamento diário da própria Deriv (00h GMT)
    '__xau': { s: 'frxXAUUSD', spot: true },
    '__xag': { s: 'frxXAGUSD', spot: true },
    '__xpt': { s: 'frxXPTUSD', spot: true },
    '__xpd': { s: 'frxXPDUSD', spot: true }
  });
  const YAHOO = Object.freeze(['BRL=X', 'MXN=X', 'CLP=X', 'COP=X', 'ARS=X', 'CNY=X', 'INR=X', 'ZAR=X', 'TRY=X', 'AUD=X', 'EURBRL=X',
    'EUR=X', 'JPY=X', 'GBP=X', 'CAD=X', 'SEK=X', 'CHF=X']);
  const DE_DERIV = Object.freeze(Object.fromEntries(Object.entries(DERIV).map(([k, v]) => [v.s, k])));
  const WS_URL = 'wss://api.derivws.com/trading/v1/options/ws/public';
  const VELHO = 20000; // preço da Deriv sem atualizar há 20 s deixa de valer (mercado fechado ou conexão parada)

  // Capital.com (repasse do servidor do site em /api/capital/ws): USD/BRL, VIX e futuros
  const CAPITAL = Object.freeze(['BRL=X', '^VIX', 'GC=F', 'SI=F', 'HG=F', 'BZ=F', 'CL=F', 'NG=F', 'KC=F', 'ES=F', 'NQ=F', 'YM=F', 'RTY=F']);
  const CAP_VELHO = 10 * 60000; // preço da Capital parado há 10 min deixa de valer

  class Client {
    // ref(símbolo) -> { v, c } do Yahoo que a Mesa já tem: escolhe o contrato certo e dá o fechamento anterior
    constructor({ enabled = true, onChange = () => {}, ref = () => null } = {}) {
      this.enabled = enabled;
      this.onChange = onChange;
      this.ref = ref;
      this.cap = null; this.capMapa = {}; this.capPreco = {}; this.capRetry = null; this.capTent = 0; this.capErro = '';
      this.active = false;
      this.socket = null;
      this.live = new Map();   // Deriv: símbolo Yahoo -> { value, ts, received }
      this.polled = new Map(); // Yahoo: símbolo -> { value, change, base, ts }
      this.spotBase = new Map(); // metais: símbolo -> fechamento do dia anterior na Deriv
      this.status = 'paused';
      this.pollTimer = null;
      this.pingTimer = null;
      this.retry = null;
      this.attempt = 0;
    }

    state() {
      return { status: this.status, count: [...this.live.keys()].filter((s) => this.liveQuote(s)).length };
    }

    liveQuote(symbol) {
      const q = this.live.get(symbol);
      return q && Date.now() - q.received <= VELHO ? q : null;
    }

    covers(symbol) { return symbol in DERIV || YAHOO.includes(symbol) || CAPITAL.includes(symbol); }

    // contrato da Capital para o símbolo: aberto, recente e com preço até 3% do Yahoo (o mesmo contrato que o Yahoo mostra)
    capQuote(symbol) {
      const eps = this.capMapa[symbol];
      if (!eps) return null;
      const r = this.polled.get(symbol)?.value ?? this.ref(symbol)?.v;
      let melhor = null, dist = Infinity;
      for (const e of eps) {
        const q = this.capPreco[e];
        if (!q || q.st !== 'TRADEABLE' || !(q.b > 0) || !(q.o > 0) || Date.now() - q.t > CAP_VELHO) continue;
        const mid = (q.b + q.o) / 2, d = r ? Math.abs(mid / r - 1) : (eps.length === 1 ? 0 : Infinity);
        if (d < dist) { dist = d; melhor = { e, mid, t: q.t, dir: q.dir || 0 }; }
      }
      return melhor && dist <= 0.03 ? melhor : null;
    }
    base(symbol) {
      const p = this.polled.get(symbol);
      if (p && p.base) return p.base;
      const r = this.ref(symbol);
      return r && r.v > 0 && r.c != null && isFinite(r.c) ? r.v / (1 + r.c / 100) : null;
    }

    // o que a Mesa mostra: Deriv ao vivo, senão Capital ao vivo, senão o Yahoo
    quote(symbol) {
      const l = this.liveQuote(symbol), p = this.polled.get(symbol);
      const c = !l && this.capQuote(symbol);
      if (c) {
        const b = this.base(symbol);
        return { symbol, value: c.mid, change: b ? (c.mid / b - 1) * 100 : null, ts: c.t, source: 'Capital.com', epic: c.e, direction: c.dir };
      }
      if (l) {
        const base = DERIV[symbol]?.spot ? this.spotBase.get(symbol) : p && p.base;
        const change = base ? (l.value / base - 1) * 100 : null;
        return { symbol, value: l.value, change, ts: l.ts, source: 'Deriv', direction: l.direction || 0 };
      }
      return p ? { symbol, value: p.value, change: p.change, ts: p.ts, source: 'Yahoo', direction: p.direction || 0 } : null;
    }

    emit(event) { this.onChange({ ...event, state: this.state() }); }

    setActive(value) {
      value = !!value && this.enabled;
      if (value === this.active) return;
      this.active = value;
      if (!value) { this.stop(); return; }
      this.startPoll();
      this.connect();
      this.capLigar();
    }

    capLigar() {
      if (!this.active || this.cap || typeof WebSocket === 'undefined' || !/^https?:$/.test(location.protocol)) return;
      let ws;
      try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/capital/ws'); } catch (_) { return; }
      this.cap = ws;
      ws.onmessage = (ev) => {
        if (this.cap !== ws) return;
        let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
        if (m.tipo === 'mapa' || m.tipo === 'precos') {
          if (m.mapa) this.capMapa = m.mapa;
          for (const [e, q] of Object.entries(m.precos || {})) this.capPreco[e] = { ...q, dir: 0 };
          this.capTent = 0; this.capErro = '';
          for (const s of Object.keys(this.capMapa)) this.emit({ type: 'quote', symbol: s, quote: this.quote(s) });
        } else if (m.tipo === 'q' && m.e) {
          const v = this.capPreco[m.e] || {};
          const mid = (m.b + m.o) / 2, old = v.b > 0 ? (v.b + v.o) / 2 : null;
          this.capPreco[m.e] = { b: m.b, o: m.o, t: m.t || Date.now(), st: m.st ?? v.st, dir: old && old !== mid ? Math.sign(mid - old) : 0 };
          for (const [s, eps] of Object.entries(this.capMapa)) if (eps.includes(m.e) && this.capQuote(s)?.e === m.e) this.emit({ type: 'quote', symbol: s, quote: this.quote(s) });
        } else if (m.tipo === 'erro') this.capErro = m.erro;
      };
      ws.onclose = ws.onerror = () => {
        if (this.cap !== ws) return;
        this.cap = null;
        if (!this.active) return;
        clearTimeout(this.capRetry);
        this.capRetry = setTimeout(() => { this.capRetry = null; this.capLigar(); }, Math.min(120000, 5000 * 2 ** Math.min(this.capTent++, 5)));
      };
    }

    stop() {
      this.closeSocket();
      clearTimeout(this.capRetry); this.capRetry = null;
      const c = this.cap; this.cap = null;
      if (c) { c.onmessage = c.onclose = c.onerror = null; try { c.close(); } catch (_) {} }
      clearTimeout(this.retry); this.retry = null;
      clearInterval(this.pollTimer); this.pollTimer = null;
      this.live.clear();
      this.status = 'paused';
      this.emit({ type: 'state' });
    }

    closeSocket() {
      clearInterval(this.pingTimer); this.pingTimer = null;
      const old = this.socket; this.socket = null;
      if (old) { old.onopen = old.onmessage = old.onclose = old.onerror = null; try { old.close(); } catch (_) {} }
    }

    connect() {
      if (!this.active || this.socket || typeof WebSocket === 'undefined') return;
      let ws;
      try { ws = new WebSocket(WS_URL); } catch (_) { this.reconnect(); return; }
      this.socket = ws;
      this.status = 'connecting';
      this.emit({ type: 'state' });
      ws.onopen = () => {
        if (this.socket !== ws) return;
        for (const { s, spot } of Object.values(DERIV)) {
          ws.send(JSON.stringify({ ticks: s, subscribe: 1 }));
          // velas diárias: a penúltima fecha o dia anterior
          if (spot) ws.send(JSON.stringify({ ticks_history: s, style: 'candles', granularity: 86400, count: 2, end: 'latest' }));
        }
        // a Deriv fecha conexões paradas: um ping a cada 30 s mantém aberta
        this.pingTimer = setInterval(() => { try { ws.send('{"ping":1}'); } catch (_) {} }, 30000);
      };
      ws.onmessage = (ev) => {
        if (this.socket !== ws || typeof ev.data !== 'string' || ev.data.length > 8000) return;
        let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
        if (m.msg_type === 'candles' && Array.isArray(m.candles) && m.candles.length >= 2) {
          const sym = DE_DERIV[m.echo_req?.ticks_history], close = Number(m.candles[m.candles.length - 2].close);
          if (sym && isFinite(close) && close > 0) { this.spotBase.set(sym, close); if (this.liveQuote(sym)) this.emit({ type: 'quote', symbol: sym, quote: this.quote(sym) }); }
          return;
        }
        if (m.msg_type !== 'tick' || !m.tick) return; // erros (mercado fechado etc.) só deixam o Yahoo valendo
        const sym = DE_DERIV[m.tick.symbol], cfg = DERIV[sym];
        const raw = Number(m.tick.quote);
        if (!sym || !isFinite(raw) || raw <= 0) return;
        const value = cfg.inv ? 1 / raw : raw;
        const prev = this.liveQuote(sym);
        const direction = prev && prev.value !== value ? Math.sign(value - prev.value) : 0;
        this.live.set(sym, { value, ts: (Number(m.tick.epoch) || Date.now() / 1000) * 1000, received: Date.now(), direction });
        this.attempt = 0;
        if (this.status !== 'live') { this.status = 'live'; this.emit({ type: 'state' }); }
        this.emit({ type: 'quote', symbol: sym, quote: this.quote(sym) });
      };
      ws.onerror = ws.onclose = () => { if (this.socket === ws) this.reconnect(); };
    }

    reconnect() {
      this.closeSocket();
      if (!this.active) return;
      this.status = 'reconnecting';
      this.emit({ type: 'state' });
      clearTimeout(this.retry);
      const wait = Math.min(60000, 2000 * 2 ** Math.min(this.attempt++, 5));
      this.retry = setTimeout(() => { this.retry = null; this.connect(); }, wait);
    }

    startPoll() {
      if (this.pollTimer) return;
      const run = async () => {
        if (!this.active) return;
        try {
          const proxy = (typeof CORS_PROXY !== 'undefined' && CORS_PROXY) || 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
          const res = await fetch(`${proxy}/quotes?symbols=${encodeURIComponent(YAHOO.join(','))}`);
          if (!res.ok) return;
          const json = await res.json();
          for (const s of YAHOO) {
            const meta = json[s]?.chart?.result?.[0]?.meta;
            if (meta?.regularMarketPrice == null || !isFinite(meta.regularMarketPrice)) continue;
            const value = meta.regularMarketPrice;
            const base = meta.chartPreviousClose ?? meta.previousClose ?? null;
            const change = base ? (value / base - 1) * 100 : null;
            const prev = this.polled.get(s);
            const direction = prev && prev.value !== value ? Math.sign(value - prev.value) : 0;
            this.polled.set(s, { value, change, base, ts: meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now(), direction });
            // par ao vivo: quem pisca é a Deriv; aqui só avisa os pares do Yahoo que mudaram
            if (direction !== 0 && !this.liveQuote(s)) this.emit({ type: 'quote', symbol: s, quote: this.quote(s) });
          }
        } catch (_) { /* fica o último valor */ }
      };
      run();
      this.pollTimer = setInterval(run, 30000);
    }
  }

  return { DERIV, YAHOO, CAPITAL, Client };
})();
