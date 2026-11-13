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
    async show(box,symbol,name,light,opts){
      // opts.sutil (Mesa 2, 12/11/2026): sem grade, linha verde ou vermelha conforme o período sobe ou cai
      // opts.intraday: pontos de 5 ou 30 minutos (eixo com hora); opts.dias: quantos dias mostrar (padrão 93)
      const sutil=!!opts?.sutil,intra=!!opts?.intraday,serie=(v,o)=>intra?[...new Map(v.map(p=>[p.t+o,{time:p.t+o,value:p.c}])).values()].sort((a,b)=>a.time-b.time):seriesData(v,o);
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
        box.innerHTML='<div class="wlh"><div class="wlh-tools"><span class="wlh-caption"></span></div><div class="wlh-legend" role="status" aria-live="off"></div><div class="wlh-canvas" role="group"></div><div class="wlh-range" role="group" aria-label="Período do histórico"><button type="button" class="wlc-b" data-days="31">1M</button><button type="button" class="wlc-b" data-days="93">3M</button><button type="button" class="wlc-b" data-reset title="Restaurar zoom">Ajustar</button></div><div class="wlh-note"></div><small class="wlh-credit">TradingView Lightweight Charts™<br>Copyright (с) 2025 TradingView, Inc. <a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView</a></small></div>';
        const host=box.querySelector('.wlh-canvas'),legend=box.querySelector('.wlh-legend');
        host.setAttribute('aria-label','Histórico diário de '+name);
        box.querySelector('.wlh-caption').textContent='Fechamentos diários · Yahoo Finance';
        box.querySelector('.wlh-note').textContent='Até '+date(all.at(-1).t,off)+' · Arraste para navegar; use o zoom para aproximar. Dados diários, sem atualização em tempo real.';
        const text=light?'#46526a':'#a7b1c3',grid=sutil?'rgba(0,0,0,0)':light?'#e5e7eb':'#1c2740',background=sutil?'rgba(0,0,0,0)':light?'#ffffff':'#0e1524';
        // modo sutil (Mesa 2, 13/11/2026, no estilo do gráfico do MSN): escala à esquerda, só linhas horizontais tracejadas,
        // datas em português ("mar. de 2026", "13 de out.", "14:30")
        const MES=['jan.','fev.','mar.','abr.','mai.','jun.','jul.','ago.','set.','out.','nov.','dez.'];
        const quando=t=>typeof t==='number'?new Date(t*1000):typeof t==='string'?new Date(t+'T12:00:00Z'):new Date(Date.UTC(t.year,t.month-1,t.day,12));
        const marca=(t,tipo)=>{const d=quando(t),dia=d.getUTCDate(),m=MES[d.getUTCMonth()],a=d.getUTCFullYear();
          if(tipo===0)return String(a);if(tipo===1)return m+' de '+a;if(tipo===2)return intra||(opts?.dias||93)<=40?dia+' de '+m:String(dia);return String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0');};
        const tracejado=light?'rgba(15,23,42,.09)':'rgba(255,255,255,.08)';
        this.chart=L.createChart(host,{
          autoSize:true,
          layout:{background:{type:'solid',color:background},textColor:text,attributionLogo:true},
          grid:sutil?{vertLines:{visible:false},horzLines:{color:tracejado,style:L.LineStyle.Dashed}}:{vertLines:{color:grid},horzLines:{color:grid}},
          rightPriceScale:{borderColor:grid,...(sutil?{visible:false}:{})},
          ...(sutil?{leftPriceScale:{visible:true,borderVisible:false,scaleMargins:{top:.14,bottom:.06}}}:{}),
          timeScale:{borderColor:grid,timeVisible:intra,...(sutil?{borderVisible:false,tickMarkFormatter:marca,fixLeftEdge:true,fixRightEdge:true}:{})},
          localization:{locale:'pt-BR',dateFormat:'dd/MM/yyyy',...(sutil?{priceFormatter:p=>p.toLocaleString('pt-BR',{maximumFractionDigits:Math.abs(p)>=1000?0:Math.abs(p)>=10?2:4})}:{})},
          handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
          handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:true},
          crosshair:sutil?{mode:L.CrosshairMode.Magnet,vertLine:{style:L.LineStyle.Dashed,labelVisible:false},horzLine:{visible:false,labelVisible:false}}:{mode:L.CrosshairMode.Normal}
        });
        const precision=all.some(p=>Math.abs(p.c)>0&&Math.abs(p.c)<1)?6:all.some(p=>Math.abs(p.c)>0&&Math.abs(p.c)<10)?4:2;
        const line=this.chart.addSeries(L.AreaSeries,{
          lineColor:'#4d9eff',topColor:light?'rgba(77,158,255,.18)':'rgba(77,158,255,.25)',bottomColor:'rgba(77,158,255,0)',
          lineWidth:2,priceFormat:{type:'price',precision,minMove:Math.pow(10,-precision)},
          ...(sutil?{priceScaleId:'left',lastValueVisible:false,priceLineVisible:false,crosshairMarkerRadius:4}:{})
        });
        let shown=[];
        const describe=p=>{legend.textContent=p?name+' · '+displayDay(p.time)+' · '+p.value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:precision}):name;};
        // opts.aoMover(ponto | null): o ponto sob o mouse (data e valor) e a variação desde o começo do período
        const rotulo=t=>{const d=quando(t);return intra?d.getUTCDate()+' de '+MES[d.getUTCMonth()]+', '+marca(t,3):d.getUTCDate()+' de '+MES[d.getUTCMonth()]+' de '+d.getUTCFullYear();};
        this.chart.subscribeCrosshairMove(param=>{
          const p=param.time&&param.seriesData?.get(line);
          describe(p&&typeof p.value==='number'?{time:param.time,value:p.value}:shown.at(-1));
          if(opts?.aoMover)opts.aoMover(p&&typeof p.value==='number'&&shown.length?{data:rotulo(param.time),valor:p.value,desde:(p.value/shown[0].value-1)*100}:null);
        });
        const render=days=>{
          const subset=serie(all.filter(p=>p.t>=all.at(-1).t-days*86400),off);
          if(subset.length<2)throw Error('Sem dados suficientes para este período');
          shown=subset;line.setData(subset);this.chart.timeScale().fitContent();describe(shown.at(-1));
          if(opts?.aoPeriodo)opts.aoPeriodo({inicio:subset[0].value,fim:subset.at(-1).value,variacao:(subset.at(-1).value/subset[0].value-1)*100});
          if(sutil){const sobe=subset.at(-1).value>=subset[0].value,c=sobe?'#22c55e':'#ef4444';line.applyOptions({lineColor:c,topColor:sobe?'rgba(34,197,94,.15)':'rgba(239,68,68,.15)',bottomColor:'rgba(0,0,0,0)'});}
          box.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.days===days)));
        };
        box.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',()=>{try{render(+b.dataset.days);}catch{box.querySelector('.wlh-note').textContent='Sem dados suficientes para este período.';}}));
        box.querySelector('[data-reset]').addEventListener('click',()=>this.chart?.timeScale().fitContent());
        render(opts?.dias||93);
      }catch{
        if(generation!==this.generation)return;
        this.chart?.remove();this.chart=null;
        box.innerHTML='<div class="wlh-error" role="status"><b>Não foi possível carregar o gráfico agora.</b><span>Tente novamente ou use o link TradingView no topo.</span><button type="button" class="wlc-b">Tentar novamente</button></div>';
        box.querySelector('button').addEventListener('click',()=>this.show(box,symbol,name,light,opts));
      }
    }
  }
  return {canEmbed,defaultMode,points,date,dayKey,seriesData,Viewer};
})();
