/* Cotações Forex em tempo real para Moedas Emergentes via WebSocket Twelve Data / streaming. */
globalThis.MMForexLive = (() => {
  const PAIRS = Object.freeze({
    'BRL=X': 'USD/BRL',
    'MXN=X': 'USD/MXN',
    'CLP=X': 'USD/CLP',
    'COP=X': 'USD/COP',
    'ARS=X': 'USD/ARS',
    'CNY=X': 'USD/CNY',
    'INR=X': 'USD/INR',
    'ZAR=X': 'USD/ZAR',
    'TRY=X': 'USD/TRY',
    'AUD=X': 'USD/AUD',
    'EURBRL=X': 'EUR/BRL'
  });

  const REVERSE_PAIRS = Object.freeze(
    Object.fromEntries(Object.entries(PAIRS).map(([k, v]) => [v, k]))
  );

  const getKey = () => {
    try {
      return localStorage.getItem('twelvedata_api_key') || localStorage.getItem('trader_td_key') || window.TD_API_KEY || '';
    } catch (_) { return ''; }
  };

  class Client {
    constructor({ enabled = true, onChange = () => {} } = {}) {
      this.enabled = enabled;
      this.onChange = onChange;
      this.active = false;
      this.socket = null;
      this.quotes = new Map();
      this.status = 'paused';
      this.pollTimer = null;
    }

    state() {
      return { status: this.status, count: this.quotes.size };
    }

    quote(symbol) {
      return this.quotes.get(symbol) || null;
    }

    setActive(value) {
      value = !!value && this.enabled;
      if (value === this.active) return;
      this.active = value;
      if (!value) {
        this.disconnect();
        return;
      }
      this.connect();
    }

    disconnect() {
      if (this.socket) {
        this.socket.onopen = this.socket.onmessage = this.socket.onclose = this.socket.onerror = null;
        try { this.socket.close(); } catch (_) {}
        this.socket = null;
      }
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      this.status = 'paused';
      this.onChange({ type: 'state', state: this.state() });
    }

    connect() {
      if (!this.active) return;
      const key = getKey();
      if (key) {
        this.connectWS(key);
      } else {
        // Sem chave Twelve Data: polling rápido com diff de cotações para piscar a cada variação
        this.startFastPoll();
      }
    }

    connectWS(key) {
      try {
        const ws = new WebSocket(`wss://ws.twelvedata.com/v1/quotes/price?apikey=${encodeURIComponent(key)}`);
        this.socket = ws;
        this.status = 'connecting';
        this.onChange({ type: 'state', state: this.state() });

        ws.onopen = () => {
          if (!this.active || this.socket !== ws) return;
          this.status = 'connected';
          const symbols = Object.values(PAIRS).join(',');
          ws.send(JSON.stringify({ action: 'subscribe', params: { symbols } }));
          this.onChange({ type: 'state', state: this.state() });
        };

        ws.onmessage = (event) => {
          if (!this.active || this.socket !== ws) return;
          try {
            const data = JSON.parse(event.data);
            if (data.event === 'price' && data.symbol && data.price != null) {
              const yahooSym = REVERSE_PAIRS[data.symbol];
              if (!yahooSym) return;
              const val = parseFloat(data.price);
              if (!Number.isFinite(val) || val <= 0) return;

              const prev = this.quotes.get(yahooSym);
              const dir = prev && prev.value !== val ? Math.sign(val - prev.value) : 0;
              const quote = {
                symbol: yahooSym,
                pair: data.symbol,
                value: val,
                ts: data.timestamp ? data.timestamp * 1000 : Date.now(),
                direction: dir
              };
              this.quotes.set(yahooSym, quote);
              this.onChange({ type: 'quote', symbol: yahooSym, quote });
            }
          } catch (_) {}
        };

        ws.onclose = () => {
          this.socket = null;
          if (this.active) {
            this.status = 'reconnecting';
            this.onChange({ type: 'state', state: this.state() });
            setTimeout(() => { if (this.active) this.connect(); }, 5000);
          }
        };

        ws.onerror = () => {
          try { ws.close(); } catch (_) {}
        };
      } catch (_) {
        this.startFastPoll();
      }
    }

    startFastPoll() {
      if (this.pollTimer) return;
      this.status = 'polling';
      this.onChange({ type: 'state', state: this.state() });
      const symList = Object.keys(PAIRS);

      const run = async () => {
        if (!this.active) return;
        try {
          const res = await fetch(`https://shrill-meadow-89c1.danilo-nillo.workers.dev/quotes?symbols=${encodeURIComponent(symList.join(','))}`);
          if (!res.ok) return;
          const json = await res.json();
          symList.forEach(s => {
            const chart = json[s];
            const meta = chart?.chart?.result?.[0]?.meta;
            if (meta?.regularMarketPrice != null) {
              const val = meta.regularMarketPrice;
              const prev = this.quotes.get(s);
              const dir = prev && prev.value !== val ? Math.sign(val - prev.value) : 0;
              const quote = {
                symbol: s,
                pair: PAIRS[s],
                value: val,
                ts: meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now(),
                direction: dir
              };
              this.quotes.set(s, quote);
              if (dir !== 0) {
                this.onChange({ type: 'quote', symbol: s, quote });
              }
            }
          });
        } catch (_) {}
      };

      run();
      this.pollTimer = setInterval(run, 10000);
    }
  }

  return { PAIRS, REVERSE_PAIRS, Client, getKey };
})();