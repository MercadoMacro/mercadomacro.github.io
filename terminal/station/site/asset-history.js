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
  /* Indicadores técnicos (17/11/2026, pedido do Dante; cálculos adaptados do OpenTerminal, licença MIT,
     github.com/ErTasselli/OpenTerminal, web/lib/indicators.ts). Entram só os fechamentos (é o que o histórico traz),
     por isso não há VWAP (precisa de volume). Cada função recebe [{time,value}] e devolve [{time,value}]. */
  const IND={
    sma(d,n){const o=[];let s=0;for(let i=0;i<d.length;i++){s+=d[i].value;if(i>=n)s-=d[i-n].value;if(i>=n-1)o.push({time:d[i].time,value:s/n});}return o;},
    ema(d,n){const o=[],k=2/(n+1);let p=null;d.forEach((x,i)=>{p=p===null?x.value:x.value*k+p*(1-k);if(i>=n-1)o.push({time:x.time,value:p});});return o;},
    boll(d,n=20,m=2){const sup=[],inf=[];for(let i=n-1;i<d.length;i++){let s=0,q=0;for(let j=i-n+1;j<=i;j++){s+=d[j].value;q+=d[j].value*d[j].value;}const md=s/n,dp=Math.sqrt(Math.max(0,q/n-md*md));sup.push({time:d[i].time,value:md+m*dp});inf.push({time:d[i].time,value:md-m*dp});}return{sup,inf};},
    rsi(d,n=14){const o=[];let g=0,l=0;for(let i=1;i<d.length;i++){const v=d[i].value-d[i-1].value,ga=Math.max(v,0),pe=Math.max(-v,0);if(i<=n){g+=ga/n;l+=pe/n;if(i===n)o.push({time:d[i].time,value:l===0?100:100-100/(1+g/l)});}else{g=(g*(n-1)+ga)/n;l=(l*(n-1)+pe)/n;o.push({time:d[i].time,value:l===0?100:100-100/(1+g/l)});}}return o;},
    macd(d,r=12,l=26,si=9){const er=IND.ema(d,r),el=IND.ema(d,l),mr=new Map(er.map(x=>[x.time,x.value]));const linha=el.filter(x=>mr.has(x.time)).map(x=>({time:x.time,value:mr.get(x.time)-x.value}));const sinal=IND.ema(linha,si),ms=new Map(sinal.map(x=>[x.time,x.value]));const hist=linha.filter(x=>ms.has(x.time)).map(x=>({time:x.time,value:x.value-ms.get(x.time)}));return{linha,sinal,hist};}
  };
  const IND_COR={mm20:'#f59e0b',mm50:'#a855f7',mm200:'#3b82f6',boll:'#94a3b8',rsi:'#a855f7',macd:'#3b82f6',sinal:'#f59e0b'};
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
          layout:{background:{type:'solid',color:background},textColor:text,attributionLogo:true,panes:{separatorColor:light?'rgba(15,23,42,.10)':'rgba(255,255,255,.08)',separatorHoverColor:light?'rgba(15,23,42,.18)':'rgba(255,255,255,.16)'}},
          grid:sutil?{vertLines:{visible:false},horzLines:{color:tracejado,style:L.LineStyle.Dashed}}:{vertLines:{color:grid},horzLines:{color:grid}},
          rightPriceScale:{borderColor:grid,...(sutil?{visible:false}:{})},
          ...(sutil?{leftPriceScale:{visible:true,borderVisible:false,scaleMargins:{top:.14,bottom:.06}}}:{}),
          timeScale:{borderColor:grid,timeVisible:intra,...(sutil?{borderVisible:false,tickMarkFormatter:marca,fixLeftEdge:true,fixRightEdge:true}:{})},
          localization:{locale:'pt-BR',dateFormat:'dd/MM/yyyy',...(sutil?{priceFormatter:p=>p.toLocaleString('pt-BR',{maximumFractionDigits:Math.abs(p)>=1000?0:Math.abs(p)>=10?2:4})}:{})},
          // Mesa 2 (16/11/2026): a rodinha do mouse rola a página em vez de ficar presa no gráfico (o período já mostra tudo)
          handleScroll:{mouseWheel:!sutil,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
          handleScale:{mouseWheel:!sutil,pinch:true,axisPressedMouseMove:true},
          crosshair:sutil?{mode:L.CrosshairMode.Magnet,vertLine:{style:L.LineStyle.Dashed,labelVisible:false},horzLine:{visible:false,labelVisible:false}}:{mode:L.CrosshairMode.Normal}
        });
        const precision=all.some(p=>Math.abs(p.c)>0&&Math.abs(p.c)<1)?6:all.some(p=>Math.abs(p.c)>0&&Math.abs(p.c)<10)?4:2;
        const line=this.chart.addSeries(L.AreaSeries,{
          lineColor:'#4d9eff',topColor:light?'rgba(77,158,255,.18)':'rgba(77,158,255,.25)',bottomColor:'rgba(77,158,255,0)',
          lineWidth:2,priceFormat:{type:'price',precision,minMove:Math.pow(10,-precision)},
          ...(sutil?{priceScaleId:'left',lastValueVisible:false,priceLineVisible:false,crosshairMarkerRadius:4}:{})
        });
        // indicadores escolhidos (opts.indicadores: mm20, mm50, mm200, boll, rsi, macd); IFR e MACD ganham painel próprio embaixo
        const escolhidos=new Set(opts?.indicadores||[]),ser={},num=(v,c=2)=>v.toLocaleString('pt-BR',{minimumFractionDigits:c,maximumFractionDigits:c});
        const linhaInd=(cor,painel=0,extra={})=>this.chart.addSeries(L.LineSeries,{color:cor,lineWidth:1.5,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false,...(painel===0&&sutil?{priceScaleId:'left'}:{}),...extra},painel);
        for(const k of ['mm20','mm50','mm200'])if(escolhidos.has(k))ser[k]=linhaInd(IND_COR[k]);
        if(escolhidos.has('boll')){ser.bsup=linhaInd(IND_COR.boll,0,{lineStyle:L.LineStyle.Dashed,lineWidth:1});ser.binf=linhaInd(IND_COR.boll,0,{lineStyle:L.LineStyle.Dashed,lineWidth:1});}
        let painel=0;
        if(escolhidos.has('rsi')){painel++;ser.rsi=linhaInd(IND_COR.rsi,painel,{priceFormat:{type:'price',precision:0,minMove:1}});ser.rsi.createPriceLine({price:70,color:'rgba(239,68,68,.55)',lineStyle:L.LineStyle.Dashed,lineWidth:1,axisLabelVisible:false});ser.rsi.createPriceLine({price:30,color:'rgba(34,197,94,.55)',lineStyle:L.LineStyle.Dashed,lineWidth:1,axisLabelVisible:false});}
        if(escolhidos.has('macd')){painel++;ser.mhist=this.chart.addSeries(L.HistogramSeries,{lastValueVisible:false,priceLineVisible:false,priceFormat:{type:'price',precision,minMove:Math.pow(10,-precision)}},painel);ser.macd=linhaInd(IND_COR.macd,painel);ser.msinal=linhaInd(IND_COR.sinal,painel);}
        if(painel){const ps=this.chart.panes();ps[0].setStretchFactor(painel===1?3:2.4);for(let i=1;i<ps.length;i++)ps[i].setStretchFactor(1);}
        let shown=[];
        const describe=p=>{legend.textContent=p?name+' · '+displayDay(p.time)+' · '+p.value.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:precision}):name;};
        // opts.aoMover(ponto | null): o ponto sob o mouse (data e valor) e a variação desde o começo do período
        const rotulo=t=>{const d=quando(t);return intra?d.getUTCDate()+' de '+MES[d.getUTCMonth()]+', '+marca(t,3):d.getUTCDate()+' de '+MES[d.getUTCMonth()]+' de '+d.getUTCFullYear();};
        this.chart.subscribeCrosshairMove(param=>{
          const p=param.time&&param.seriesData?.get(line);
          describe(p&&typeof p.value==='number'?{time:param.time,value:p.value}:shown.at(-1));
          const v=k=>{const x=ser[k]&&param.seriesData?.get(ser[k]);return x&&typeof x.value==='number'?x.value:null;},pr=x=>x.toLocaleString('pt-BR',{maximumFractionDigits:Math.abs(x)>=1000?0:Math.abs(x)>=10?2:4});
          const ind=[['mm20','MM20'],['mm50','MM50'],['mm200','MM200']].filter(([k])=>v(k)!==null).map(([k,r])=>r+' '+pr(v(k)));
          if(v('bsup')!==null)ind.push('Bollinger '+pr(v('binf'))+' a '+pr(v('bsup')));
          if(v('rsi')!==null)ind.push('IFR '+num(v('rsi'),0));
          if(v('macd')!==null&&v('msinal')!==null)ind.push('MACD '+(v('macd')>=v('msinal')?'acima':'abaixo')+' do sinal');
          if(opts?.aoMover)opts.aoMover(p&&typeof p.value==='number'&&shown.length?{data:rotulo(param.time),valor:p.value,desde:(p.value/shown[0].value-1)*100,ind:ind.join(' · ')}:null);
        });
        const render=days=>{
          // opts.desde (17/11/2026): começo exato do período (1º de janeiro no YTD; mesmo dia 1 ou 3 meses atrás), em segundos no
          // fuso da bolsa. Sem isso, contar dias para trás a partir do último pregão pegava o fim de dezembro no YTD quando o
          // histórico buscado era maior (indicadores ligados buscam 1 ano para aquecer as médias)
          const subset=serie(all.filter(p=>opts?.desde?p.t+off>=opts.desde:p.t>=all.at(-1).t-days*86400),off);
          if(subset.length<2)throw Error('Sem dados suficientes para este período');
          shown=subset;line.setData(subset);
          if(Object.keys(ser).length){
            const full=serie(all,off),ini=subset[0].time,corta=a=>a.filter(x=>x.time>=ini);
            if(ser.mm20)ser.mm20.setData(corta(IND.sma(full,20)));if(ser.mm50)ser.mm50.setData(corta(IND.sma(full,50)));if(ser.mm200)ser.mm200.setData(corta(IND.sma(full,200)));
            if(ser.bsup){const b=IND.boll(full);ser.bsup.setData(corta(b.sup));ser.binf.setData(corta(b.inf));}
            if(ser.rsi)ser.rsi.setData(corta(IND.rsi(full)));
            if(ser.macd){const m=IND.macd(full);ser.macd.setData(corta(m.linha));ser.msinal.setData(corta(m.sinal));ser.mhist.setData(corta(m.hist).map(x=>({...x,color:x.value>=0?'rgba(34,197,94,.55)':'rgba(239,68,68,.55)'})));}
          }
          this.chart.timeScale().fitContent();describe(shown.at(-1));
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
  return {canEmbed,defaultMode,points,date,dayKey,seriesData,Viewer,IND};
})();
