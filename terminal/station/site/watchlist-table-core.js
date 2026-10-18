globalThis.MMWatchTable = (() => {
  const number = n => typeof n === 'number' && Number.isFinite(n);
  function preferences(value) {
    const p = value && typeof value === 'object' ? value : {};
    return { mode: p.mode === 'cards' ? 'cards' : 'table', sort: ['symbol', 'price', 'change'].includes(p.sort) ? p.sort : 'change',
      direction: p.direction === 1 ? 1 : -1 };
  }
  function sorted(rows, prefs) {
    return [...rows].sort((a, b) => {
      if (prefs.sort === 'symbol') return prefs.direction * a.symbol.localeCompare(b.symbol);
      const key = prefs.sort === 'price' ? 'value' : 'change';
      const x = a.quote?.[key], y = b.quote?.[key];
      if (!number(x) || !number(y)) return number(x) ? -1 : number(y) ? 1 : a.symbol.localeCompare(b.symbol);
      return prefs.direction * (x - y) || a.symbol.localeCompare(b.symbol);
    });
  }
  function price(q) {
    if (!number(q?.value)) return '—';
    const opts = { minimumFractionDigits: 2, maximumFractionDigits: Math.abs(q.value) < 100 ? 4 : 2 };
    if (typeof q.currency === 'string' && /^[A-Z]{3}$/.test(q.currency)) {
      opts.style = 'currency'; opts.currency = q.currency;
    }
    return q.value.toLocaleString('pt-BR', opts);
  }
  const change = q => number(q?.change) ? (q.change > 0 ? '+' : '') + q.change.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—';
  const time = q => number(q?.quoteAt) && q.quoteAt > 0 && q.quoteAt < 8640000000000000
    ? new Date(q.quoteAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—';
  return { number, preferences, sorted, price, change, time };
})();
