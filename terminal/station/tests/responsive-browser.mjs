// Inspeção visual da prévia local; não usa sessão, conta ou dados privados.
import {createServer} from 'node:http';
import {readFileSync,existsSync,statSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,resolve,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const modules=process.env.MM_BROWSER_MODULES;
if(!modules)throw Error('Defina MM_BROWSER_MODULES.');
const {chromium}=await import(pathToFileURL(join(modules,'playwright/index.mjs')).href);
const site=fileURLToPath(new URL('../site/',import.meta.url));
const out=process.env.MM_BROWSER_OUTPUT||'/tmp/mm-responsive-review';mkdirSync(out,{recursive:true});
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};
const server=createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=resolve(site,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(site)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const tabs=['market','mesa','watch','heatmap','news','weekly','calendar','analysis','fund','indicators','calculator','options','edu'].map(x=>x+'-panel');
const results=[],browser=await chromium.launch({headless:true});
try{
 for(const [orientation,viewport] of [['portrait',{width:390,height:844}],['landscape',{width:844,height:390}]]){
  for(const theme of ['dark','light']){
   const ctx=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1,locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
   await ctx.addInitScript(theme=>{localStorage.setItem('trader_theme',theme);localStorage.setItem('trader_prefs_v1',JSON.stringify({mode:'manual',motion:'off'}));},theme);
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base,{waitUntil:'domcontentloaded'});
   await page.locator('#mobile-navigation').waitFor({state:'visible'});
   for(const id of tabs){
    const record={orientation,viewport,theme,tab:id};
    try{
     await page.locator('#mobile-navigation .mn-all').click();
     await page.locator('#mobile-navigation .mn-list [data-mobile-tab="'+id+'"]').click();
     await page.locator('#'+id+'.active').waitFor({state:'visible'});
     await page.waitForTimeout(700);
     Object.assign(record,await page.evaluate(id=>{
      const p=document.getElementById(id),nav=document.getElementById('mobile-navigation');
      const visible=e=>!!e&&e.getBoundingClientRect().width>0&&getComputedStyle(e).display!=='none';
      const outside=[];
      for(const e of p.querySelectorAll('button,input,select,table,h2,h3')){
       const r=e.getBoundingClientRect();if(!r.width||!r.height||r.right<=innerWidth+2&&r.left>=-2)continue;
       let parent=e.parentElement,scrollable=false;while(parent&&parent!==p){if(/auto|scroll/.test(getComputedStyle(parent).overflowX)){scrollable=true;break;}parent=parent.parentElement;}
       if(!scrollable)outside.push({tag:e.tagName,cls:e.className,text:e.textContent.trim().slice(0,65),left:Math.round(r.left),right:Math.round(r.right)});
      }
      return {bodyLight:document.body.classList.contains('light'),pageWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,panelWidth:p.clientWidth,panelScrollWidth:p.scrollWidth,navVisible:visible(nav),summaryVisible:visible(document.getElementById('fab-summary')),assistantVisible:visible(document.getElementById('ia-fab')),outside:outside.slice(0,12),previewText:p.innerText.slice(0,240)};
     },id));
     record.screenshot=theme+'-'+orientation+'-'+id+'.png';await page.screenshot({path:join(out,record.screenshot)});
    }catch(e){record.error=e.message;}
    results.push(record);console.log(JSON.stringify(record));
   }
   // Tema e engrenagem devem continuar acessíveis sem sobreposição entre si.
   results.push({orientation,theme,header:await page.locator('.topbar-right').evaluate(e=>Array.from(e.querySelectorAll('button')).filter(x=>x.getBoundingClientRect().width>0&&getComputedStyle(x).display!=='none').map(x=>({id:x.id,rect:{x:x.getBoundingClientRect().x,y:x.getBoundingClientRect().y,w:x.getBoundingClientRect().width,h:x.getBoundingClientRect().height}}))),errors});
   await ctx.close();
  }
 }
}finally{
 writeFileSync(join(out,'review.json'),JSON.stringify({note:'Prévia local do código, sem sessão de usuário. Fontes externas podem estar indisponíveis; não valida a exatidão dos dados.',results},null,2));
 await browser.close();await new Promise(r=>server.close(r));
}
if(results.some(x=>x.error))process.exitCode=1;
