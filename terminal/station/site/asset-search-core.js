/* Catálogo local de nomes; não faz chamadas de rede enquanto a pessoa digita. */
globalThis.MMAssetSearch = (() => {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
  // Classes confirmadas em abc.xyz/investor. Expandir aliases sem confundir classes.
  const seed = [
    {symbol:'GOOGL',name:'Alphabet (Google) · Classe A',aliases:['google','alphabet'],market:'Nasdaq · USD'},
    {symbol:'GOOG',name:'Alphabet (Google) · Classe C',aliases:['google','alphabet'],market:'Nasdaq · USD'}
  ];
  function catalog(sections = []) {
    const map = new Map([...seed,...(globalThis.MMAssetCatalog || [])].map(x => [x.symbol,{...x,market:x.market || [x.exchange,x.type,x.currency].filter(Boolean).join(' · ')}]));
    for (const section of sections) for (const item of section.items || []) {
      if (typeof item.symbol !== 'string' || !item.symbol || typeof item.name !== 'string') continue;
      if (!map.has(item.symbol)) map.set(item.symbol,{symbol:item.symbol,name:item.name,aliases:[],market:item.symbol.endsWith('.SA')?'B3':''});
    }
    return [...map.values()];
  }
  const code = s => normalize(s).replace(/\.sa$/,'');
  function search(query, entries) {
    const q=normalize(query); if(q.length<2)return [];
    const tokens=q.split(' ');
    return entries.map((item,index)=>{
      const ticker=code(item.symbol), name=normalize(item.name), aliases=(item.aliases||[]).map(normalize);
      const hay=[ticker,name,...aliases].join(' ');
      const rank=code(q)===ticker?0:aliases.includes(q)?1:ticker.startsWith(q)?2:name.startsWith(q)?3:4;
      return {item,index,rank,match:tokens.every(t=>hay.includes(t))};
    }).filter(x=>x.match).sort((a,b)=>a.rank-b.rank||a.index-b.index).slice(0,8).map(x=>x.item);
  }
  const exactCode=(query,entries)=>entries.find(x=>code(x.symbol)===code(query));
  function remoteQuery(query,entries) {
    const q=normalize(query), match=entries.find(x=>(x.aliases||[]).some(a=>normalize(a)===q));
    return match ? match.name.split(' · ')[0].replace(/\(Google\)/g,'').trim() : query.trim();
  }
  function combine(local,remote) {
    const map=new Map(local.map(x=>[x.symbol,x]));
    for(const x of remote || [])if(x && typeof x.symbol==='string' && /^[A-Z0-9][A-Z0-9.^=_-]{0,23}$/.test(x.symbol) && typeof x.name==='string' && !map.has(x.symbol))map.set(x.symbol,x);
    return [...map.values()].slice(0,8);
  }
  return {normalize,catalog,search,exactCode,remoteQuery,combine};
})();
