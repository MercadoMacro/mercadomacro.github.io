(() => {
  const core=globalThis.MMAssetSearch, input=document.getElementById('wl-input'), form=document.getElementById('wl-form');
  if(!core||!input||!form)return;
  const entries=core.catalog(typeof MARKET_SECTIONS!=='undefined'?MARKET_SECTIONS:[]);
  const popup=document.createElement('div');popup.id='wl-asset-suggestions';popup.className='asset-suggestions';popup.hidden=true;popup.setAttribute('role','listbox');popup.setAttribute('aria-label','Ativos encontrados');form.append(popup);
  input.placeholder='Nome ou código do ativo…';input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',popup.id);input.setAttribute('aria-expanded','false');input.setAttribute('autocomplete','off');
  let results=[],selected=-1;
  function close(){popup.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');selected=-1;}
  function mark(){[...popup.children].forEach((row,i)=>{row.classList.toggle('selected',i===selected);row.setAttribute('aria-selected',String(i===selected));});if(selected>=0)input.setAttribute('aria-activedescendant','wl-suggestion-'+selected);else input.removeAttribute('aria-activedescendant');}
  function choose(i){const item=results[i];if(!item)return;input.value=item.symbol;close();form.requestSubmit();}
  function show(){
    const q=input.value.trim();results=core.search(q,entries);popup.replaceChildren();selected=-1;
    if(!results.length||/[,;]/.test(q)){close();return;}
    results.forEach((item,i)=>{const row=document.createElement('div');row.id='wl-suggestion-'+i;row.className='asset-suggestion';row.setAttribute('role','option');row.setAttribute('aria-selected','false');const symbol=document.createElement('b'),name=document.createElement('span'),market=document.createElement('small');symbol.textContent=item.symbol.replace(/\.SA$/,'');name.textContent=item.name;market.textContent=item.market;row.append(symbol,name,market);row.addEventListener('mousedown',e=>e.preventDefault());row.addEventListener('click',()=>choose(i));popup.append(row);});
    popup.hidden=false;input.setAttribute('aria-expanded','true');
  }
  input.addEventListener('input',show);input.addEventListener('focus',show);
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'){close();e.stopPropagation();return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(popup.hidden)show();if(!results.length)return;e.preventDefault();selected=(selected+(e.key==='ArrowDown'?1:-1)+results.length)%results.length;mark();return;}
    if(e.key==='Enter'&&!popup.hidden&&selected>=0){e.preventDefault();choose(selected);}
  });
  // Um nome ambíguo mostra as opções; nunca escolhe uma classe de ação sozinho.
  form.addEventListener('submit',e=>{
    const q=input.value.trim();if(core.exactCode(q,entries)||/[,;]/.test(q)){close();return;}
    const matches=core.search(q,entries);if(!matches.length){close();return;}
    e.preventDefault();e.stopImmediatePropagation();input.focus();show();selected=0;mark();
  },true);
  document.addEventListener('click',e=>{if(!form.contains(e.target))close();});
  input.addEventListener('blur',close);
  window.addEventListener('mm-watchlists-state',e=>{if(!e.detail.writable)close();});
})();
