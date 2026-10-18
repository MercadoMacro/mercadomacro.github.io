/* Cálculo puro: variação observada versus percentil 95 de retornos absolutos anteriores. */
globalThis.MMWatchRadar = (() => {
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const day = (seconds, offset) => new Date((seconds + offset) * 1000).toISOString().slice(0, 10);
  function analyse(quote, history, now = Date.now()) {
    if (!quote?.fresh) return { status: 'quote', reason: 'Aguardando cotação válida' };
    if (!finite(quote.value) || quote.value <= 0 || !finite(quote.quoteAt) || quote.quoteAt > now + 900000 || now - quote.quoteAt > 96 * 3600000)
      return { status: 'quote', reason: 'Cotação sem horário válido ou antiga' };
    if (!Array.isArray(history?.t) || !Array.isArray(history?.c) || history.t.length !== history.c.length)
      return { status: 'history', reason: 'Histórico indisponível' };
    const offset = finite(history.off) && Math.abs(history.off) <= 50400 ? history.off : 0;
    const asOf = day(quote.quoteAt / 1000, offset), points = [];
    let lastT = -Infinity, lastDay = '';
    for (let i = 0; i < history.t.length; i++) {
      const t = history.t[i], c = history.c[i];
      if (!finite(t) || t <= 0 || t > now / 1000 + 7 * 86400 || !finite(c) || c <= 0 || t <= lastT) return { status: 'history', reason: 'Histórico inconsistente' };
      const d = day(t, offset);
      if (d === lastDay) return { status: 'history', reason: 'Histórico com datas repetidas' };
      lastT = t; lastDay = d;
      if (d < asOf) points.push({ t, c });
    }
    const prior = points.slice(-61);
    if (prior.length < 41) return { status: 'history', reason: 'Histórico insuficiente: mínimo de 40 retornos' };
    if (quote.quoteAt / 1000 - prior.at(-1).t > 7 * 86400) return { status: 'history', reason: 'Histórico sem fechamento recente' };
    if (!finite(quote.referenceClose) || quote.referenceClose <= 0 || Math.abs(prior.at(-1).c / quote.referenceClose - 1) > .003)
      return { status: 'history', reason: 'Fechamento de referência não confirmado pelo histórico' };
    const returns = [];
    for (let i = 1; i < prior.length; i++) {
      if (prior[i].t - prior[i - 1].t > 7 * 86400) return { status: 'history', reason: 'Histórico com lacunas' };
      const r = Math.abs((prior[i].c / prior[i - 1].c - 1) * 100);
      if (r > 40) return { status: 'history', reason: 'Salto no histórico: requer revisão de ajustes' };
      returns.push(r);
    }
    returns.sort((a, b) => a - b);
    const threshold = returns[Math.ceil(returns.length * .95) - 1];
    const change = (quote.value / prior.at(-1).c - 1) * 100;
    if (Math.abs(change) > 40) return { status: 'quote', reason: 'Movimento extremo: conferir ajustes e cotação' };
    return { status: Math.abs(change) > threshold ? 'unusual' : 'normal', change, threshold, count: returns.length,
      asOf, quoteAt: quote.quoteAt, previousClose: prior.at(-1).c };
  }
  const pct = n => (n > 0 ? '+' : '') + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  function summary(rows) {
    const selected = rows.filter(r => r.status === 'unusual');
    if (!selected.length) return 'Nenhum movimento incomum selecionado.';
    return 'Radar da watchlist | Mercado Macro\n\n' + selected.map(r => {
      const time = new Date(r.quoteAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      return `${r.symbol.replace(/\.SA$/, '')}: ${pct(r.change)} em relação ao fechamento anterior. Cotação de ${time} (Brasília).\nOscilação acima do percentil 95 dos ${r.count} retornos diários anteriores (limiar absoluto: ${pct(r.threshold)}).`;
    }).join('\n\n') + '\n\nFonte: Yahoo Finance. Cotações podem ter atraso. O radar destaca oscilações; não determina suas causas.\nConteúdo informativo.';
  }
  return { analyse, summary, pct };
})();
