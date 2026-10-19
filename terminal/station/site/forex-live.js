/* Moedas emergentes da Mesa: consulta o lote /quotes do worker (Yahoo) a cada 30 s com a aba aberta.
   Sem chave no navegador. O worker guarda cada lote por até 60 s, então o valor muda no máximo uma vez por minuto. */
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
      this.startFastPoll();
    }

    startFastPoll() {
      if (this.pollTimer) return;
      this.status = 'polling';
      this.onChange({ type: 'state', state: this.state() });
      const symList = Object.keys(PAIRS);

      const run = async () => {
        if (!this.active) return;
        try {
          const proxy = (typeof CORS_PROXY !== 'undefined' && CORS_PROXY) || 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
          const res = await fetch(`${proxy}/quotes?symbols=${encodeURIComponent(symList.join(','))}`);
          if (!res.ok) return;
          const json = await res.json();
          symList.forEach(s => {
            const meta = json[s]?.chart?.result?.[0]?.meta;
            if (meta?.regularMarketPrice != null && isFinite(meta.regularMarketPrice)) {
              const val = meta.regularMarketPrice;
              const base = meta.chartPreviousClose ?? meta.previousClose;
              const change = base ? (val / base - 1) * 100 : null;
              const prev = this.quotes.get(s);
              const dir = prev && prev.value !== val ? Math.sign(val - prev.value) : 0;
              const quote = {
                symbol: s,
                pair: PAIRS[s],
                value: val,
                change,
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
      this.pollTimer = setInterval(run, 30000);
    }
  }

  return { PAIRS, REVERSE_PAIRS, Client };
})();