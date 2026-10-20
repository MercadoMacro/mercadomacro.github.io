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
    'AUD=X': { s: 'frxAUDUSD', inv: true }
  });
  const YAHOO = Object.freeze(['BRL=X', 'MXN=X', 'CLP=X', 'COP=X', 'ARS=X', 'CNY=X', 'INR=X', 'ZAR=X', 'TRY=X', 'AUD=X', 'EURBRL=X',
    'EUR=X', 'JPY=X', 'GBP=X', 'CAD=X', 'SEK=X', 'CHF=X']);
  const DE_DERIV = Object.freeze(Object.fromEntries(Object.entries(DERIV).map(([k, v]) => [v.s, k])));
  const WS_URL = 'wss://api.derivws.com/trading/v1/options/ws/public';
  const VELHO = 20000; // preço da Deriv sem atualizar há 20 s deixa de valer (mercado fechado ou conexão parada)

  class Client {
    constructor({ enabled = true, onChange = () => {} } = {}) {
      this.enabled = enabled;
      this.onChange = onChange;
      this.active = false;
      this.socket = null;
      this.live = new Map();   // Deriv: símbolo Yahoo -> { value, ts, received }
      this.polled = new Map(); // Yahoo: símbolo -> { value, change, base, ts }
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

    // o que a Mesa mostra: o preço da Deriv quando está chegando, senão o do Yahoo
    quote(symbol) {
      const l = this.liveQuote(symbol), p = this.polled.get(symbol);
      if (l) {
        const change = p && p.base ? (l.value / p.base - 1) * 100 : null;
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
    }

    stop() {
      this.closeSocket();
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
        for (const { s } of Object.values(DERIV)) ws.send(JSON.stringify({ ticks: s, subscribe: 1 }));
        // a Deriv fecha conexões paradas: um ping a cada 30 s mantém aberta
        this.pingTimer = setInterval(() => { try { ws.send('{"ping":1}'); } catch (_) {} }, 30000);
      };
      ws.onmessage = (ev) => {
        if (this.socket !== ws || typeof ev.data !== 'string' || ev.data.length > 8000) return;
        let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
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

  return { DERIV, YAHOO, Client };
})();
