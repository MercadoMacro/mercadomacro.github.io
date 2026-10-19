/* Histórico do mesmo código usado nas cotações, independente do widget incorporado. */
globalThis.MMAssetHistory = (() => {
  const canEmbed = (tv,symbol='') => !symbol.endsWith('=F') && !['TVC:VIX','BMV:ME'].includes(tv);
  function defaultMode(symbol,tv) {
    return symbol.endsWith('=F') || symbol.startsWith('^') || /^(TVC|BMV|BME|SIX|INDEX):/.test(tv) || /\.(MI|SS|SZ|L|DE|HK|TO|AX)$/.test(symbol) ? 'history' : 'tradingview';
  }
  function points(raw) {
    if(!Array.isArray(raw?.t)||!Array.isArray(raw?.c)||raw.t.length!==raw.c.length)return [];
    const map=new Map();raw.t.forEach((t,i)=>{const c=raw.c[i];if(typeof t==='number'&&Number.isFinite(t)&&t>0&&typeof c==='number'&&Number.isFinite(c))map.set(t,c);});
    return [...map].sort((a,b)=>a[0]-b[0]).map(([t,c])=>({t,c}));
  }
  const date=(t,off=0)=>new Date((t+off)*1000).toLocaleDateString('pt-BR',{timeZone:'UTC'});
  const dayKey=(t,off=0)=>new Date((t+off)*1000).toISOString().slice(0,10);
  function seriesData(values,off=0) {
    const days=new Map();
    for(const p of values) { const key=dayKey(p.t,off); days.set(key,{time:key,value:p.c}); }
    return [...days.values()].sort((a,b)=>a.time.localeCompare(b.time));
  }
  const displayDay=time=>typeof time==='string'?time.split('-').reverse().join('/'):time&&typeof time==='object'?[time.day,time.month,time.year].map((n,i)=>i<2?String(n).padStart(2,'0'):n).join('/'):'';
  let libraryLoading=null;
  function loadLibrary() {
    if(globalThis.LightweightCharts?.createChart)return Promise.resolve(globalThis.LightweightCharts);
    if(libraryLoading)return libraryLoading;
    libraryLoading=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/lightweight-charts@5.0.9/dist/lightweight-charts.standalone.production.js';script.async=true;
      const fail=()=>{clearTimeout(timer);script.remove();reject(Error('Biblioteca do gráfico indisponível'));};
      const timer=setTimeout(fail,10000);
      script.onerror=fail;
      script.onload=()=>{clearTimeout(timer);if(globalThis.LightweightCharts?.createChart)resolve(globalThis.LightweightCharts);else fail();};
      document.head.appendChild(script);
    }).catch(error=>{libraryLoading=null;throw error;});
    return libraryLoading;
  }
  class Viewer {
    constructor(fetchHistory){this.fetchHistory=fetchHistory;this.cache=new Map();this.chart=null;this.generation=0;}
    destroy(){this.generation++;this.chart?.remove();this.chart=null;}
    async show(box,symbol,name,light){
      this.destroy();const generation=this.generation;box.innerHTML='<div class="wlc-load" role="status">Carregando histórico do ativo…</div>';
      try{
        const L=await loadLibrary();
        if(generation!==this.generation)return;
        let saved=this.cache.get(symbol);
        if(!saved||saved.until<Date.now()){
          const payload=await this.fetchHistory(symbol),raw=payload?.[symbol];
          if(points(raw).length<2)throw Error('Histórico indisponível');
          saved={raw,until:Date.now()+21600000};
          if(this.cache.size>=80)this.cache.delete(this.cache.keys().next().value);
          this.cache.set(symbol,saved);
        }
        if(generation!==this.generation)return;
        const all=points(saved.raw),off=Number.isFinite(saved.raw.off)?saved.raw.off:0;
        box.innerHTML='<div class="wlh"><div class="wlh-tools"><span class="wlh-caption"></span><div role="group" aria-label="Período do histórico"><button type="button" class="wlc-b" data-days="31">1M</button><button type="button" class="wlc-b" data-days="93">3M</button><button type="button" class="wlc-b" data-reset title="Restaurar zoom">Ajustar</button></div></div><div class="wlh-legend" role="status" aria-live="off"></div><div class="wlh-canvas" role="group"></div><div class="wlh-note"></div><small class="wlh-credit">TradingView Lightweight Charts™<br>Copyright (с) 2025 TradingView, Inc. <a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView</a></small></div>';
        const host=box.querySelector('.wlh-canvas'),legend=box.querySelector('.wlh-legend');
        host.setAttribute('aria-label','Histórico diário de '+name);
        box.querySelector('.wlh-caption').textContent='Fechamentos diários · Yahoo Finance';
        box.querySelector('.wlh-note').textContent='Até '+date(all.at(-1).t,off)+' · Arraste para navegar; use o zoom para aproximar. Dados diários, sem atualização em tempo real.';
        const text=light?'#46526a':'#a7b1c3',grid=light?'#e5e7eb':'#1c2740',background=light?'#ffffff':'#0e1524';
        this.chart=L.createChart(host,{
          autoSize:true,
          layout:{background:{type:'solid',color:background},textColor:text,attributionLogo:true},
          grid:{vertLines:{color:grid},horzLines:{color:grid}},
          rightPriceScale:{borderColor:grid},timeScale:{borderColor:grid,timeVisible:false},
          localization:{locale:'pt-BR',dateFormat:'dd/MM/yyyy'},
          handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
          handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:true},
          crosshair:{mode:L.CrosshairMode.Normal}
        });
        const precision=all.some(p=>Math.abs(p.c)>0&&Math.abs(p.c)<1)?6:all.some(p=>Math.abs(p.c)>0&&Math.abs(p.c)<10)?4:2;
        const line=this.chart.addSeries(L.AreaSeries,{
          lineColor:'#4d9eff',topColor:light?'rgba(77,158,255,.18)':'rgba(77,158,255,.25)',bottomColor:'rgba(77,158,255,0)',
          lineWidth:2,priceFormat:{type:'price',precision,minMove:Math.pow(10,-precision)}
        });
        let shown=[];
        const describe=p=>{legend.textContent=p?name+' · '+displayDay(p.time)+' · '+p.value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:precision}):name;};
        this.chart.subscribeCrosshairMove(param=>{
          const p=param.time&&param.seriesData?.get(line);
          describe(p&&typeof p.value==='number'?{time:param.time,value:p.value}:shown.at(-1));
        });
        const render=days=>{
          const subset=seriesData(all.filter(p=>p.t>=all.at(-1).t-days*86400),off);
          if(subset.length<2)throw Error('Sem dados suficientes para este período');
          shown=subset;line.setData(subset);this.chart.timeScale().fitContent();describe(shown.at(-1));
          box.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.days===days)));
        };
        box.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',()=>{try{render(+b.dataset.days);}catch{box.querySelector('.wlh-note').textContent='Sem dados suficientes para este período.';}}));
        box.querySelector('[data-reset]').addEventListener('click',()=>this.chart?.timeScale().fitContent());
        render(93);
      }catch{
        if(generation!==this.generation)return;
        this.chart?.remove();this.chart=null;
        box.innerHTML='<div class="wlh-error" role="status"><b>Não foi possível carregar o gráfico agora.</b><span>Tente novamente ou use o link TradingView no topo.</span><button type="button" class="wlc-b">Tentar novamente</button></div>';
        box.querySelector('button').addEventListener('click',()=>this.show(box,symbol,name,light));
      }
    }
  }
  return {canEmbed,defaultMode,points,date,dayKey,seriesData,Viewer};
})();
