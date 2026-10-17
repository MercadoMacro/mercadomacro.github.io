/* Mercado Macro 2.0 — Curva DI1 por dados importados explicitamente pelo usuário.
 * Sem scraping da B3, sem estimativas, sem armazenamento remoto.
 */
(() => {
'use strict';
const $=s=>document.querySelector(s);
const status=(s)=>{const el=$('#mm2-di-status');if(el)el.textContent=s};
let chart=null;
const parseNumber=(s)=>{let t=String(s||'').trim().replace(/[%\s]/g,'');if(t.includes(',')&&t.includes('.'))t=t.lastIndexOf(',')>t.lastIndexOf('.')?t.replace(/\./g,'').replace(',','.'):t.replace(/,/g,'');else if(t.includes(','))t=t.replace(',','.');return Number(t)};
function parseDate(s){
 const t=String(s||'').trim();
 let m=t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
 if(m)return new Date(+m[3],+m[2]-1,+m[1]);
 m=t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(m)return new Date(+m[1],+m[2]-1,+m[3]);
 return null;
}
const validDate=d=>d instanceof Date&&!Number.isNaN(d.getTime())&&d.getFullYear()>2000;
function parseCSV(text){
 const rows=text.trim().split(/\r?\n/).filter(Boolean);
 if(rows.length<3)throw Error('Informe cabeçalho e pelo menos dois vencimentos.');
 const delimiter=rows[0].includes(';')?';':',';
 const split=s=>s.split(delimiter).map(x=>x.trim().replace(/^"|"$/g,''));
 const headers=split(rows.shift()).map(x=>x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''));
 const column=(aliases)=>headers.findIndex(h=>aliases.some(a=>h===a));
 const venc=column(['vencimento','maturity','data_vencimento']),taxa=column(['taxa','taxa_aa','taxa_ajuste','taxa (% a.a.)','taxa (% aa)','yield']),contrato=column(['contrato','codigo','ticker','instrumento']);
 if(venc<0||taxa<0)throw Error('Cabeçalho necessário: vencimento;taxa (opcional: contrato).');
 const points=rows.map((row,i)=>{
   const cols=split(row),d=parseDate(cols[venc]),rate=parseNumber(cols[taxa]);
   if(!validDate(d)||!Number.isFinite(rate)||rate<=0||rate>100)throw Error('Linha '+(i+2)+': data ou taxa inválida.');
   const code=contrato<0?'':cols[contrato];
   if(code&&!/^DI1[A-Z0-9-]*$/i.test(code))throw Error('Linha '+(i+2)+': contrato diferente de DI1.');
   return {date:d,rate,code};
 }).sort((a,b)=>a.date-b.date);
 if(points.length>50)throw Error('Máximo de 50 vencimentos.');
 if(points.some((p,i)=>i>0&&p.date.getTime()===points[i-1].date.getTime()))throw Error('Existem vencimentos duplicados.');
 return points;
}
function draw(points,ref){
 if(typeof Chart==='undefined')throw Error('Biblioteca de gráficos indisponível.');
 const canvas=$('#mm2-di-chart');if(!canvas)return;
 if(chart)chart.destroy();
 chart=new Chart(canvas.getContext('2d'),{
  type:'line',data:{labels:points.map(p=>p.date.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'})),datasets:[{label:'Taxa DI1 (% a.a. base 252)',data:points.map(p=>p.rate),borderColor:'#f0b75e',backgroundColor:'rgba(240,183,94,.10)',borderWidth:2,pointRadius:4,fill:false,tension:0}]},
  options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#aab4c6'}},tooltip:{callbacks:{title:(items)=>points[items[0].dataIndex].date.toLocaleDateString('pt-BR'),label:(item)=>item.parsed.y.toLocaleString('pt-BR',{maximumFractionDigits:3})+'% a.a.'}}},scales:{x:{ticks:{color:'#aab4c6',maxTicksLimit:10},grid:{color:'rgba(150,170,190,.10)'}},y:{ticks:{color:'#aab4c6',callback:v=>v+'%'},grid:{color:'rgba(150,170,190,.10)'}}}}
 });
 status('Curva importada: '+points.length+' vencimentos · Data de referência informada: '+ref+' · Fonte: arquivo local escolhido pelo usuário. Não é cotação em tempo real.');
}
async function importFile(){
 const file=$('#mm2-di-file')?.files?.[0],date=$('#mm2-di-date')?.value;
 if(!file){status('Selecione um arquivo CSV.');return;}
 if(!date){status('Informe a data de referência do pregão.');return;}
 if(file.size>100000){status('O arquivo deve ter até 100 KB.');return;}
 try{const text=await file.text(),points=parseCSV(text);const ref=parseDate(date);
 if(!validDate(ref))throw Error('Data de referência inválida.');
 if(ref>new Date())throw Error('A data de referência não pode estar no futuro.');
 if(points.some(p=>p.date<=ref))throw Error('Todos os vencimentos devem ser posteriores à data de referência.');
 draw(points,ref.toLocaleDateString('pt-BR'));
 }catch(e){status('Importação rejeitada: '+e.message);}
}
$('#mm2-di-import')?.addEventListener('click',importFile);
$('#mm2-di-clear')?.addEventListener('click',()=>{if(chart){chart.destroy();chart=null;}$('#mm2-di-file').value='';status('Nenhuma curva importada.');});
})();
