const ws = new WebSocket('wss://api.derivws.com/trading/v1/options/ws/public');
const t = setTimeout(() => { console.log('timeout'); process.exit(1); }, 20000);
ws.onopen = () => ws.send(JSON.stringify({ active_symbols: 'brief' }));
ws.onerror = (e) => { console.log('erro', e.message || e.type); process.exit(1); };
ws.onmessage = (m) => { const j = JSON.parse(m.data); if (j.error) { console.log(JSON.stringify(j.error)); process.exit(1); }
  const l = j.active_symbols || []; const g = {};
  for (const s of l) (g[(s.market||s.market_display_name)+' / '+(s.submarket||s.submarket_display_name)] ||= []).push((s.symbol||s.underlying_symbol)+'='+(s.display_name||s.underlying_symbol_name||''));
  for (const [k,v] of Object.entries(g)) console.log(k, v.length, '\n  ', v.join(' | '));
  console.log('keys', Object.keys(l[0]||{}).join(','));
  clearTimeout(t); process.exit(0); };
