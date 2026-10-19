/* Histórico do mesmo código usado nas cotações, independente do widget incorporado. */
globalThis.MMAssetHistory = (() => {
  const canEmbed = tv => !['TVC:VIX','BMV:ME'].includes(tv);
  function defaultMode(symbol,tv) {
    return symbol.startsWith('^') || /^(TVC|BMV|BME|SIX|INDEX):/.test(tv) || /\.(MI|SS|SZ|L|DE|HK|TO|AX)$/.test(symbol) ? 'history' : 'tradingview';
  }
  function points(raw) {
    if(!Array.isArray(raw?.t)||!Array.isArray(raw?.c)||raw.t.length!==raw.c.length)return [];
    const map=new Map();raw.t.forEach((t,i)=>{const c=raw.c[i];if(typeof t==='number'&&Number.isFinite(t)&&t>0&&typeof c==='number'&&Number.isFinite(c))map.set(t,c);});
    return [...map].sort((a,b)=>a[0]-b[0]).map(([t,c])=>({t,c}));
  }
  const date=(t,off=0)=>new Date((t+off)*1000).toLocaleDateString('pt-BR',{timeZone:'UTC'});
  class Viewer {
    constructor(fetchHistory){this.fetchHistory=fetchHistory;this.cache=new Map();this.chart=null;this.generation=0;}
    destroy(){this.generation++;this.chart?.destroy();this.chart=null;}
    async show(box,symbol,name,light){
      this.destroy();const generation=this.generation;box.innerHTML='<div class="wlc-load" role="status">Carregando histórico do ativo…</div>';
      try{
        let saved=this.cache.get(symbol);if(!saved||saved.until<Date.now()){const payload=await this.fetchHistory(symbol);const raw=payload?.[symbol];if(points(raw).length<2)throw Error('Histórico indisponível');saved={raw,until:Date.now()+21600000};if(this.cache.size>=80)this.cache.delete(this.cache.keys().next().value);this.cache.set(symbol,saved);}
        if(generation!==this.generation)return;
        const all=points(saved.raw),off=Number.isFinite(saved.raw.off)?saved.raw.off:0;
        box.innerHTML='<div class="wlh"><div class="wlh-tools"><span class="wlh-caption"></span><div role="group" aria-label="Período do histórico"><button type="button" class="wlc-b" data-days="31">1M</button><button type="button" class="wlc-b" data-days="93">3M</button></div></div><div class="wlh-canvas"><canvas role="img"></canvas></div><div class="wlh-note"></div></div>';
        const canvas=box.querySelector('canvas');canvas.setAttribute('aria-label','Histórico diário de '+name);
        box.querySelector('.wlh-caption').textContent='Fechamentos diários · Yahoo Finance';
        box.querySelector('.wlh-note').textContent='Até '+date(all.at(-1).t,off)+' · O histórico não representa cotações em tempo real.';
        const render=days=>{
          this.chart?.destroy();this.chart=null;const subset=all.filter(p=>p.t>=all.at(-1).t-days*86400);if(subset.length<2)throw Error('Sem dados suficientes para este período');
          box.querySelectorAll('[data-days]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.days===days)));
          const text=light?'#46526a':'#a7b1c3',grid=light?'#e5e7eb':'#1c2740';
          this.chart=new Chart(canvas,{type:'line',data:{labels:subset.map(p=>date(p.t,off)),datasets:[{label:name,data:subset.map(p=>p.c),borderColor:'#4d9eff',backgroundColor:light?'#4d9eff15':'#4d9eff20',fill:true,tension:0,pointRadius:0,pointHitRadius:12,borderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>ctx.parsed.y.toLocaleString('pt-BR',{maximumFractionDigits:4})}}},scales:{x:{ticks:{color:text,maxTicksLimit:8,maxRotation:0},grid:{display:false}},y:{ticks:{color:text,callback:v=>v.toLocaleString('pt-BR',{maximumFractionDigits:4})},grid:{color:grid}}}}});
        };
        box.querySelectorAll('[data-days]').forEach(b=>b.addEventListener('click',()=>{try{render(+b.dataset.days);}catch{box.querySelector('.wlh-note').textContent='Sem dados suficientes para este período.';}}));
        render(93);
      }catch{
        if(generation!==this.generation)return;
        this.chart?.destroy();this.chart=null;box.innerHTML='<div class="wlh-error" role="status"><b>Não foi possível carregar o histórico agora.</b><span>Tente novamente ou use o link TradingView no topo.</span><button type="button" class="wlc-b">Tentar novamente</button></div>';
        box.querySelector('button').addEventListener('click',()=>this.show(box,symbol,name,light));
      }
    }
  }
  return {canEmbed,defaultMode,points,date,Viewer};
})();
