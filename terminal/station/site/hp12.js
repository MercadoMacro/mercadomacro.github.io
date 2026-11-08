'use strict';
const $=id=>document.getElementById(id), F=MMFinance;
let s=[0,0,0,0],entry='',editing=false,lift=true,mode='',v={n:0,i:0,PV:0,PMT:0,FV:0,begin:false};
const fmt=x=>x.toLocaleString('pt-BR',{maximumFractionDigits:8});
const rows=[['n','i','PV','PMT','FV'],['CALC','RCL','BEGIN','C','RESET'],['yˣ','1/x','√x','%','÷'],['7','8','9','CHS','×'],['4','5','6','x↔y','−'],['1','2','3','R↓','+'],['0',',','⌫','ENTER','x²']];
rows.flat().forEach(k=>{const b=document.createElement('button');b.textContent=k;b.type='button';b.className=['n','i','PV','PMT','FV','CALC'].includes(k)?'gold':k==='ENTER'?'enter':/^[0-9,]$/.test(k)?'':'blue';b.onclick=()=>press(k);$('keys').appendChild(b);});
function draw(){ $('display').textContent=editing?entry.replace('.',','):fmt(s[0]);$('status').textContent=(v.begin?'BEGIN':'END')+' · RPN'+(mode?' · '+mode:'');$('stack').textContent=`Y ${fmt(s[1])} · Z ${fmt(s[2])} · T ${fmt(s[3])}`;$('regs').replaceChildren(...['n','i','PV','PMT','FV'].map(k=>{const d=document.createElement('div'),b=document.createElement('b');b.textContent=k;d.append(b,document.createTextNode(fmt(v[k])));return d;}));}
function commit(){if(editing){s[0]=Number(entry);if(!Number.isFinite(s[0]))throw Error('Número inválido');editing=false;entry='';}}
function result(x){if(!Number.isFinite(x))throw Error('Operação inválida ou resultado fora do limite');s[0]=x;editing=false;entry='';lift=true;}
function press(k){const old={s:[...s],entry,editing,lift,mode,v:{...v}};try{
 if(/^[0-9,]$/.test(k)){if(mode)mode='';if(!editing){if(lift)s=[s[0],s[0],s[1],s[2]];entry='';editing=true;lift=false;}if(k===','){if(!entry.includes('.'))entry=(entry||'0')+'.';}else if(entry.length<16)entry+=k;}
 else if(k==='⌫'){if(editing){entry=entry.slice(0,-1)||'0';}else{s[0]=0;lift=false;}}
 else if(k==='CHS'){if(editing)entry=entry.startsWith('-')?entry.slice(1):'-'+(entry||'0');else s[0]=-s[0];}
 else if(k==='C'){s[0]=0;entry='';editing=false;lift=false;mode='';}
 else if(k==='RESET'){s=[0,0,0,0];v={n:0,i:0,PV:0,PMT:0,FV:0,begin:false};entry='';editing=false;lift=true;mode='';}
 else{commit();if(k==='CALC'||k==='RCL')mode=k;
 else if(k in v && k!=='begin'){if(mode==='CALC'){const x=F.solve(v,k);v[k]=x;result(x);$('note').textContent=k+' = '+fmt(x)+(k==='i'?'% por período':'');}else if(mode==='RCL'){if(lift)s=[s[0],s[0],s[1],s[2]];result(v[k]);}else{v[k]=s[0];lift=true;$('note').textContent=k+' armazenado: '+fmt(s[0]);}mode='';}
 else if(k==='BEGIN'){v.begin=!v.begin;mode='';}
 else if(k==='ENTER'){s=[s[0],s[0],s[1],s[2]];lift=false;}
 else if(k==='x↔y'){[s[0],s[1]]=[s[1],s[0]];lift=true;}
 else if(k==='R↓'){s=[s[1],s[2],s[3],s[0]];lift=true;}
 else if(['+','−','×','÷','yˣ'].includes(k)){const [x,y]=s;const z=k==='+'?y+x:k==='−'?y-x:k==='×'?y*x:k==='÷'?y/x:Math.pow(y,x);result(z);s=[z,s[2],s[3],s[3]];}
 else result(k==='%'?s[1]*s[0]/100:k==='1/x'?1/s[0]:k==='√x'?Math.sqrt(s[0]):s[0]*s[0]);}
 draw();}catch(e){({s,entry,editing,lift,mode,v}=old);$('note').textContent=e.message;draw();}}
function flows(){const a=$('flows').value.trim().split(/\n|;/).map(t=>{t=t.trim();if(!t)throw Error('Preencha todos os fluxos');return Number(t.includes(',')?t.replace(/\./g,'').replace(',','.'):t);});if(a.length<2||a.some(x=>!Number.isFinite(x)))throw Error('Informe ao menos dois fluxos válidos');return a;}
for(const [id,fn]of [['npv',()=>F.npv(flows(),v.i)],['irr',()=>F.irr(flows())]])$(id).onclick=()=>{try{const x=fn();if(lift)s=[s[0],s[0],s[1],s[2]];result(x);$('note').textContent=(id==='irr'?'TIR: ':'VPL: ')+fmt(x)+(id==='irr'?'% por período':'');draw();}catch(e){$('note').textContent=e.message;}};
document.addEventListener('keydown',e=>{if(/TEXTAREA|INPUT/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;const k={Enter:'ENTER',Backspace:'⌫',Escape:'C','-':'−','*':'×','/':'÷','.':','}[e.key]||e.key;if(/^[0-9,+]$/.test(k)||['ENTER','⌫','C','−','×','÷'].includes(k)){e.preventDefault();press(k);}});draw();
