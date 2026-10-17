/* Radar Macro 2.0: histórico oficial BCB (SGS), sem dados simulados. */
(() => {
  'use strict';
  const series = {
    selic: {code:432, label:'Selic meta', unit:'% a.a.', months:36},
    ipca: {code:433, label:'IPCA mensal', unit:'% no mês', months:60},
    ipca12: {code:13522, label:'IPCA acumulado em 12 meses', unit:'%', months:60},
    cdi: {code:12, label:'CDI diário', unit:'% a.d.', months:12}
  };
  let chart = null, requestId = 0;
  const $ = (s) => document.querySelector(s);
  const fmtDate = (d) => d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
  function status(message) { const el=$('#mm2-history-status'); if(el) el.textContent=message; }
  async function load() {
    const select=$('#mm2-history-series'), canvas=$('#mm2-history-chart');
    if(!select||!canvas||typeof Chart==='undefined') return;
    const config=series[select.value]; if(!config) return;
    const id=++requestId;
    const start=new Date(); start.setMonth(start.getMonth()-config.months);
    const query='?dataInicial='+fmtDate(start);
    status('Carregando série oficial do Banco Central…');
    try {
      const data=typeof bcbSerie==='function'
        ? await bcbSerie(config.code,query)
        : await (async()=>{const u='https://api.bcb.gov.br/dados/serie/bcdata.sgs.'+config.code+'/dados'+query+'&formato=json';const r=await fetch(u);if(!r.ok)throw Error('HTTP '+r.status);return r.json();})();
      if(id!==requestId) return;
      const points=(Array.isArray(data)?data:[]).map(row=>{
        const [day,month,year]=String(row.data||'').split('/');
        return {date:new Date(Number(year),Number(month)-1,Number(day)),value:Number(String(row.valor||'').replace(',','.'))};
      }).filter(x=>Number.isFinite(x.value)&&!Number.isNaN(x.date.getTime())).sort((a,b)=>a.date-b.date);
      if(!points.length) throw Error('Série sem observações disponíveis');
      if(chart) chart.destroy();
      chart=new Chart(canvas.getContext('2d'),{
        type:'line',
        data:{labels:points.map(p=>p.date.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'})),datasets:[{label:config.label+' ('+config.unit+')',data:points.map(p=>p.value),borderColor:'#5ac8fa',backgroundColor:'rgba(90,200,250,.08)',borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.15,fill:true}]},
        options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{labels:{color:'#aab4c6'}},tooltip:{callbacks:{title:(items)=>points[items[0].dataIndex].date.toLocaleDateString('pt-BR'),label:(item)=>config.label+': '+item.parsed.y.toLocaleString('pt-BR',{maximumFractionDigits:4})+' '+config.unit}}},scales:{x:{ticks:{color:'#9ca9bc',maxTicksLimit:8},grid:{color:'rgba(160,170,190,.09)'}},y:{ticks:{color:'#9ca9bc'},grid:{color:'rgba(160,170,190,.12)'}}}}
      });
      const last=points[points.length-1];
      status('Fonte: Banco Central (SGS '+config.code+') · Última observação: '+fmtDate(last.date)+' · '+points.length+' pontos. Série '+config.unit+'.');
    }catch(err){if(id!==requestId)return;status('Não foi possível carregar a série agora. Tente novamente. ('+String(err.message||'falha de rede')+')');if(chart){chart.destroy();chart=null;}}
  }
  let loaded=false;
  document.addEventListener('click',e=>{
    if(e.target.closest('#tab-radar2-panel')){if(!loaded){loaded=true;load();}}
    if(e.target.closest('#mm2-history-reload')) load();
  });
  $('#mm2-history-series')?.addEventListener('change',load);
  if($('#radar2-panel')?.classList.contains('active')){loaded=true;load();}
})();
