globalThis.MMAssetPanelCore = (() => {
  function daily(h) {
    if (!Array.isArray(h?.t) || !Array.isArray(h?.c) || h.t.length !== h.c.length) return new Map();
    const out = new Map(), offset = Number.isFinite(h.off) && Math.abs(h.off) <= 50400 ? h.off : 0;
    for (let i = 0; i < h.t.length; i++) {
      const t = h.t[i], c = h.c[i];
      if (!Number.isFinite(t) || t <= 0 || t > 8640000000000 || !Number.isFinite(c) || c <= 0) continue;
      out.set(new Date((t + offset) * 1000).toISOString().slice(0, 10), c);
    }
    return out;
  }
  function compare(first, second) {
    const a = daily(first), b = daily(second);
    const dates = [...a.keys()].filter(d => b.has(d)).sort();
    if (dates.length < 2) throw new Error('Não há pelo menos duas datas em comum para comparar.');
    const result = { dates, first: dates.map(d => a.get(d) / a.get(dates[0]) * 100), second: dates.map(d => b.get(d) / b.get(dates[0]) * 100) };
    if (![...result.first, ...result.second].every(Number.isFinite)) throw new Error('Valores de histórico inconsistentes para comparação.');
    return result;
  }
  return { daily, compare };
})();
