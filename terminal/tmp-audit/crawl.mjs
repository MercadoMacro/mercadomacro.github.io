import { chromium } from 'playwright';
import fs from 'fs';
const B='https://mercadomacro.com.br'; const OUT='terminal/tmp-audit/out'; fs.mkdirSync(OUT,{recursive:true});
const log=[]; const say=(...a)=>{const s=a.join(' '); console.log(s); log.push(s);};
const sm=await (await fetch(B+'/sitemap.xml')).text();
const locs=[...sm.matchAll(/<loc>([^<]+)/g)].map(m=>m[1].replace(B,''));
const dias=locs.filter(l=>/fechamento-do-mercado\/\d/.test(l));
say('SITEMAP', locs.length, 'urls,', dias.length, 'fechamentos; ultimos', dias.slice(-3).join(' '));
const pages=[...locs.filter(l=>!/fechamento-do-mercado\/\d/.test(l)), ...dias.slice(-3), '/planos','/termos','/pagina-que-nao-existe'];
const b=await chromium.launch(); const links=new Set();
for (const w of [360,1366]) {
  const ctx=await b.newContext({viewport:{width:w,height:860},locale:'pt-BR',timezoneId:'America/Sao_Paulo'});
  for (const u of pages) {
    const p=await ctx.newPage(); const errs=[]; const bad=[];
    p.on('pageerror',e=>errs.push('JS '+e.message.slice(0,150)));
    p.on('console',m=>{ if(m.type()==='error') errs.push('console '+m.text().slice(0,150)); });
    p.on('response',r=>{ if(r.status()>=400 && !r.url().endsWith('/pagina-que-nao-existe')) bad.push(r.status()+' '+r.url().slice(0,120)); });
    p.on('requestfailed',r=>bad.push('FAIL '+r.failure()?.errorText+' '+r.url().slice(0,120)));
    const r=await p.goto(B+u,{waitUntil:'load',timeout:60000}).catch(e=>null);
    await p.waitForTimeout(7000);
    await p.evaluate(async()=>{ for(let y=0;y<document.body.scrollHeight;y+=600){scrollTo(0,y); await new Promise(r=>setTimeout(r,150));} scrollTo(0,0); });
    await p.waitForTimeout(2500);
    const info=await p.evaluate(()=>{ const de=document.documentElement; const vis=e=>{const r=e.getBoundingClientRect(); return r.width>0&&r.height>0;};
      const over=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect(); return r.right>innerWidth+1 && r.width>0 && getComputedStyle(e).position!=='fixed'}).slice(0,4).map(e=>e.tagName+'.'+String(e.className).slice(0,30));
      const txt=document.body.innerText; const sus=[];
      for (const re of [/000\.000/g,/Carregando[^\n]{0,40}/g,/\bNaN\b/g,/undefined/g,/Invalid Date/g,/null\b/g,/Infinity/g]) { const m=txt.match(re); if(m) sus.push(m[0]+' x'+m.length); }
      const dashes=(txt.match(/(^|\s)—(\s|$)/g)||[]).length;
      return {sw:de.scrollWidth, title:document.title, desc:document.querySelector('meta[name=description]')?.content?.length||0, canon:document.querySelector('link[rel=canonical]')?.href||'', h1:[...document.querySelectorAll('h1')].length, links:[...document.querySelectorAll('a[href]')].map(a=>a.href), imgsSemAlt:[...document.querySelectorAll('img:not([alt])')].length, over, sus, dashes};
    });
    info.links.forEach(l=>links.add(l));
    say(`\n[${w}] ${u} -> ${r?.status()} | ${info.title} | desc ${info.desc} | canon ${info.canon} | h1 ${info.h1} | sw ${info.sw}${info.sw>w?' OVERFLOW '+info.over.join(','):''} | travessoes ${info.dashes} | imgs sem alt ${info.imgsSemAlt}`);
    if (info.sus.length) say('   SUSPEITO', info.sus.join(' | '));
    if (errs.length) say('   ERR', [...new Set(errs)].join(' || '));
    if (bad.length) say('   BAD', [...new Set(bad)].join(' || '));
    const nome=(u.replace(/\W+/g,'_')||'home')+'-'+w;
    await p.screenshot({path:`${OUT}/${nome}.png`,fullPage:true});
    await p.close();
  }
  await ctx.close();
}
say('\n== LINKS');
for (const l of [...new Set([...links].map(l=>l.split('#')[0]))]) {
  if (!/^https?:/.test(l)) continue;
  let st='';
  try { const r=await fetch(l,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) Chrome/130 Safari/537.36'}}); st=r.status+(r.status>=300&&r.status<400?' -> '+r.headers.get('location'):''); } catch(e){ st='ERRO '+e.message; }
  say(st, l);
}
fs.writeFileSync(OUT+'/relatorio.txt', log.join('\n'));
await b.close();
