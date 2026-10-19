(() => {
  const core=globalThis.MMAssetSearch, input=document.getElementById('wl-input'), form=document.getElementById('wl-form');
  if(!core||!input||!form)return;
  const entries=core.catalog(typeof MARKET_SECTIONS!=='undefined'?MARKET_SECTIONS:[]);
  const popup=document.createElement('div');popup.id='wl-asset-suggestions';popup.className='asset-suggestions';popup.hidden=true;popup.setAttribute('role','listbox');popup.setAttribute('aria-label','Ativos encontrados');form.append(popup);
  const status=document.createElement('div');status.className='asset-search-status';status.setAttribute('role','status');form.append(status);
  input.placeholder='Nome ou código do ativo…';input.setAttribute('aria-label','Nome ou código do ativo para a Watchlist');input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',popup.id);input.setAttribute('aria-expanded','false');input.setAttribute('autocomplete','off');
  let shownQuery='',results=[],selected=-1,generation=0,timer=null,controller=null,loading=false,failed=false;
  const memory=new Map();
  function close(){generation++;clearTimeout(timer);controller?.abort();loading=false;popup.hidden=true;status.textContent='';input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');selected=-1;}
  function mark(){[...popup.children].forEach((row,i)=>{row.classList.toggle('selected',i===selected);row.setAttribute('aria-selected',String(i===selected));});if(selected>=0)input.setAttribute('aria-activedescendant','wl-suggestion-'+selected);else input.removeAttribute('aria-activedescendant');}
  function choose(i){const item=results[i];if(!item)return;input.value=item.symbol;if(!entries.some(x=>x.symbol===item.symbol))entries.push(item);close();form.requestSubmit();}
  function draw(){
    const active=results[selected]?.symbol;popup.replaceChildren();
    results.forEach((item,i)=>{const row=document.createElement('div');row.id='wl-suggestion-'+i;row.className='asset-suggestion';row.setAttribute('role','option');row.setAttribute('aria-selected','false');const symbol=document.createElement('b'),name=document.createElement('span'),market=document.createElement('small');symbol.textContent=item.symbol.replace(/\.SA$/,'');name.textContent=item.name;market.textContent=item.market || [item.exchange,item.type,item.currency].filter(Boolean).join(' · ');row.append(symbol,name,market);row.addEventListener('mousedown',e=>e.preventDefault());row.addEventListener('click',()=>choose(i));popup.append(row);});
    selected=active?results.findIndex(x=>x.symbol===active):-1;mark();popup.hidden=!results.length;input.setAttribute('aria-expanded',String(!!results.length));
    status.textContent=failed?'Busca complementar indisponível. Use as opções locais ou tente novamente.':loading&&!results.length?'Buscando ativos…':!results.length&&input.value.trim().length>=2?'Nenhum ativo encontrado. Tente o nome completo ou o código.':'';
  }
  function show(){
    const q=input.value.trim();shownQuery=q;close();failed=false;results=core.search(q,entries);selected=-1;
    if(q.length<2||q.length>64||/[,;]/.test(q)){results=[];return;}
    const key=core.normalize(q), saved=memory.get(key);
    if(saved&&saved.until>Date.now()){results=core.combine(results,saved.results);draw();return;}
    loading=true;draw();const current=generation;
    timer=setTimeout(async()=>{
      controller=new AbortController();const signal=controller.signal;
      try{
        const query=core.remoteQuery(q,entries);
        const r=await fetch('/api/ativos/buscar?q='+encodeURIComponent(query),{credentials:'same-origin',cache:'no-store',signal});
        if(!r.ok)throw Error('Fonte indisponível');const j=await r.json();if(!Array.isArray(j.results))throw Error('Resposta inválida');
        if(current!==generation||input.value.trim()!==q||signal.aborted)return;
        const remote=core.combine([],j.results);if(memory.size>=40)memory.delete(memory.keys().next().value);memory.set(key,{until:Date.now()+300000,results:remote});
        const active=results[selected]?.symbol;results=core.combine(core.search(q,entries),remote);selected=active?results.findIndex(x=>x.symbol===active):-1;loading=false;draw();
      }catch(e){if(current!==generation||signal.aborted)return;loading=false;failed=true;draw();}
    },300);
  }
  input.addEventListener('input',show);input.addEventListener('focus',show);
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'){close();e.stopPropagation();return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(popup.hidden)show();if(!results.length)return;e.preventDefault();selected=(selected+(e.key==='ArrowDown'?1:-1)+results.length)%results.length;mark();return;}
    if(e.key==='Enter'&&!popup.hidden&&selected>=0){e.preventDefault();choose(selected);}
  });
  form.addEventListener('submit',e=>{
    const q=input.value.trim();
    if(core.exactCode(q,entries)||(shownQuery===q&&core.exactCode(q,results))||/[,;]/.test(q)){close();return;}
    // Um código explicitamente em maiúsculas continua utilizável fora do catálogo.
    if(!core.search(q,entries).length&&/^[A-Z^][A-Z0-9.^=_-]{0,23}$/.test(q)){close();return;}
    e.preventDefault();e.stopImmediatePropagation();input.focus();
    if(shownQuery!==q||(!results.length&&!loading))show();
    if(results.length){selected=0;mark();}else if(!loading)draw();
  },true);
  document.addEventListener('click',e=>{if(!form.contains(e.target))close();});
  input.addEventListener('blur',close);
  window.addEventListener('mm-watchlists-state',e=>{if(!e.detail.writable)close();});
})();
