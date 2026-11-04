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
 if(req.url==='/api/noticias'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify([
    {titulo:'Prévia: juros e câmbio no radar dos investidores',fonte:'Valor Econômico',data:Date.now()-900000,link:'https://example.test/noticia-1',resumo:'Texto demonstrativo para avaliar a leitura no celular. Título, fonte e horário recebem prioridade visual.',tags:['Juros'],nivel:'alto',trecho:'Texto demonstrativo para avaliar a hierarquia e a leitura dos cards no celular.',impactScore:8,finalScore:20},
    {titulo:'Prévia: bolsas globais acompanham os indicadores econômicos',fonte:'InfoMoney',data:Date.now()-1800000,link:'https://example.test/noticia-2',resumo:'Exemplo de cartão de notícia para a revisão de interface. Este conteúdo não representa uma notícia publicada.',tags:['Bolsa'],nivel:'medio',impactScore:5,finalScore:10}
   ]));return;}
 if(req.url==='/api/assistente'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ligado:false,assinante:true}));return;}
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
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));page.on('console',m=>{if(m.text().includes('[News]'))console.log(m.text());});
   await page.addInitScript(()=>localStorage.setItem('market_pulse_cache_v9',JSON.stringify({timestamp:Date.now(),data:[
    {titulo:'Prévia: juros e câmbio no radar dos investidores',fonte:'Valor Econômico',data:Date.now()-900000,link:'https://example.test/noticia-1',resumo:'Texto demonstrativo para avaliar a leitura no celular. Título, fonte e horário recebem prioridade visual.',tags:['Juros'],nivel:'alto',trecho:'Texto demonstrativo para avaliar a hierarquia e a leitura dos cards no celular.',impactScore:8,finalScore:20},
    {titulo:'Prévia: bolsas globais acompanham os indicadores econômicos',fonte:'InfoMoney',data:Date.now()-1800000,link:'https://example.test/noticia-2',resumo:'Exemplo de cartão de notícia para a revisão de interface. Este conteúdo não representa uma notícia publicada.',tags:['Bolsa'],nivel:'medio',impactScore:5,finalScore:10}
   ]})));
   let liveWorkerCalls=0,stream=null,streamConnections=0,streamClosures=0;
   const pushed=(title='Prévia: manchete enviada pelo WebSocket')=>({titulo:title,link:'https://example.test/push',fonte:'InfoMoney',data:Date.now(),nivel:'ALTO',impactScore:7,finalScore:70,tags:[]});
   await page.routeWebSocket('**/api/noticias/ws',ws=>{
    stream=ws;streamConnections++;
    ws.onMessage(message=>{if(message==='ping')ws.send('pong');});
    ws.onClose(()=>{streamClosures++;});
    ws.send(JSON.stringify({type:'snapshot',items:[pushed()],at:Date.now()}));
   });
   await page.route('https://news.cota-cotacao10.workers.dev/**',route=>{
    liveWorkerCalls++;
    return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify([{titulo:'Prévia: manchete do Worker ao vivo',link:'https://example.test/live',fonte:'InfoMoney',data:Date.now(),nivel:'ALTO',impactScore:7,finalScore:70,tags:[]}])});
   });
   // Séries demonstrativas só nesta prévia: não representam preços atuais.
   const sample={'^N225':[63081.86,-.33],'^HSI':[23393.32,.42],'000001.SS':[3638.03,1.08],'^KS11':[5859.08,2.24]};
   const fixture=(symbol)=>sample[symbol]||[100+(symbol.length*7),1.25];
   await page.route('**/quotes?*',async route=>{
    const symbols=(new URL(route.request().url()).searchParams.get('symbols')||'').split(',');
    const payload=Object.fromEntries(symbols.map(symbol=>{const [price,change]=fixture(symbol);return [symbol,{chart:{result:[{meta:{regularMarketPrice:price,chartPreviousClose:price/(1+change/100),regularMarketTime:Math.floor(Date.now()/1000),gmtoffset:0},timestamp:[2,1,0].map(i=>Math.floor(Date.now()/1000)-i*3600),indicators:{quote:[{close:[price*.98,price*.99,price],volume:[1,1,1]}]}}]}}];}));
    await route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(payload)});
   });
   await page.route('**/history?*',async route=>{
    const symbols=(new URL(route.request().url()).searchParams.get('symbols')||'').split(',');
    const payload=Object.fromEntries(symbols.map(symbol=>{const [v]=fixture(symbol);return [symbol,{off:0,p:v,pt:Math.floor(Date.now()/1000),t:Array.from({length:32},(_,i)=>Math.floor(Date.now()/1000)-(31-i)*3600),c:Array.from({length:32},(_,i)=>v*(.98+i*.0006+Math.sin(i)*.001))}];}));
    await route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(payload)});
   });
   await page.addInitScript(()=>localStorage.setItem('mercado_novo_v1',JSON.stringify({as:{s:'^KS11',f:'1d'}})));

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
      return {bodyLight:document.body.classList.contains('light'),pageWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,panelTop:Math.round(p.getBoundingClientRect().top),panelWidth:p.clientWidth,panelScrollWidth:p.scrollWidth,navVisible:visible(nav),summaryVisible:visible(document.getElementById('fab-summary')),assistantVisible:visible(document.getElementById('ia-fab')),outside:outside.slice(0,12),previewText:p.innerText.slice(0,240)};
     },id));
     if(id==='mesa-panel') {
      const first=page.locator('.ms-fold-toggle').first();
      const before=await first.getAttribute('aria-expanded');
      await first.click();
      if(await first.getAttribute('aria-expanded')===before)throw Error('Mesa não recolheu/expandiu');
      const after=await first.getAttribute('aria-expanded');
      await page.evaluate(()=>window.dispatchEvent(new Event('mesa-layout-changed')));
      if(await page.locator('.ms-fold-toggle').first().getAttribute('aria-expanded')!==after)throw Error('Mesa perdeu estado ao atualizar');
      await page.locator('.ms-fold-toggle').first().click();
     }
     record.screenshot=theme+'-'+orientation+'-'+id+'.png';await page.screenshot({path:join(out,record.screenshot)});
     if(id==='mesa-panel') {
      const first=page.locator('.ms-fold-toggle').first();
      if(await first.getAttribute('aria-expanded')==='true')await first.click();
      await page.locator('.ms-tb').first().evaluate(e=>e.scrollIntoView({block:'start'}));
      await page.waitForTimeout(4500);
      await page.screenshot({path:join(out,theme+'-'+orientation+'-mesa-groups.png')});
      await first.click();
     }
     if(id==='news-panel') {
      await page.locator('#news-view .nc-card').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(4500);
      await page.screenshot({path:join(out,theme+'-'+orientation+'-news-cards.png')});
      await page.locator('#nm-toggle [data-mode="live"]').click();
      await page.waitForFunction(()=>document.querySelector('#live-container')?.textContent.includes('enviada pelo WebSocket'));
      if(!streamConnections)throw Error('Ao vivo não abriu WebSocket');
      stream.send(JSON.stringify({type:'delta',items:[pushed('Prévia: novidade recebida sem atualizar a página')],at:Date.now()}));
      await page.waitForFunction(()=>document.querySelector('#live-container')?.textContent.includes('novidade recebida sem atualizar'));
      if(theme==='dark'&&orientation==='portrait') {
       const calls=liveWorkerCalls;await page.waitForTimeout(18000);
       if(liveWorkerCalls!==calls)throw Error('Polling continuou apesar de WebSocket saudável');
      }
      await page.screenshot({path:join(out,theme+'-'+orientation+'-live-news.png')});
      results.push({liveNews:true,theme,orientation,websocket:true,connections:streamConnections,httpCalls:liveWorkerCalls});
      await page.locator('#nm-toggle [data-mode="news"]').click();
      await page.waitForTimeout(200);if(!streamClosures)throw Error('WebSocket não pausou ao sair do Ao vivo');
     }
    }catch(e){record.error=e.message;}
    results.push(record);console.log(JSON.stringify(record));
   }
   await page.locator('#settings-btn').click();
   const settings=page.locator('.aj:not([hidden])');await settings.waitFor({state:'visible'});
   const names=await settings.locator('.aj-group > summary').allTextContents();
   // grupos de 04/11/2026: "Minha conta" só aparece com login
   if(!['Aparência|Meu painel|Dados|Ajuda|Sobre','Minha conta|Aparência|Meu painel|Dados|Ajuda|Sobre'].includes(names.join('|')))throw Error('Grupos de ajustes incompletos: '+names.join('|'));
   await settings.locator('[data-group="appearance"] > summary').click();
   await page.screenshot({path:join(out,theme+'-'+orientation+'-settings-overview.png')});
   await settings.locator('[data-group="panel"] > summary').click();
   await page.screenshot({path:join(out,theme+'-'+orientation+'-settings.png')});
   await settings.locator('button[data-act="close"]').click();
   // Tema e engrenagem devem continuar acessíveis sem sobreposição entre si.
   results.push({orientation,theme,header:await page.locator('.topbar-right').evaluate(e=>Array.from(e.querySelectorAll('button')).filter(x=>x.getBoundingClientRect().width>0&&getComputedStyle(x).display!=='none').map(x=>({id:x.id,rect:{x:x.getBoundingClientRect().x,y:x.getBoundingClientRect().y,w:x.getBoundingClientRect().width,h:x.getBoundingClientRect().height}}))),errors});
   // Exercita as abas recolhíveis com o assistente local de respostas prontas.
   for(const id of ['fab-summary','ia-fab']){
    const button=page.locator('#'+id);await button.waitFor({state:'visible'});
    await button.click();if(!(await button.getAttribute('class')).includes('aba-aberta'))throw Error('Primeiro toque não expandiu '+id);
    await button.click();
    const modal=id==='ia-fab'?'#ia-painel.aberto':'#summary-modal.visible';
    await page.locator(modal).waitFor({state:'visible'});
    if(id==='ia-fab')await page.locator('#ia-painel [data-ia="fechar"]').click();else await page.locator('#summary-close').click();
   }
   await ctx.close();
  }
 }
 // Ajustes no computador: categorias, persistência de controles e retorno ao mobile.
 for(const width of [1280,1920])for(const theme of ['dark','light']) {
  const ctx=await browser.newContext({viewport:{width,height:900},locale:'pt-BR',serviceWorkers:'block'});
  await ctx.addInitScript(theme=>{localStorage.setItem('trader_theme',theme);localStorage.setItem('trader_prefs_v1',JSON.stringify({mode:'manual',motion:'off'}));},theme);
  const page=await ctx.newPage();await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('.mn-root .mn-regional .mn-row.on').first().waitFor({state:'visible'});
  for(const checkWidth of [900,901,width]) {
   await page.setViewportSize({width:checkWidth,height:900});
   // O card pode ser renderizado novamente durante o resize; lê sempre o nó atual.
   await page.waitForFunction(mobile=>{
    const e=document.querySelector('.mn-root .mn-regional .mn-row.on');if(!e?.isConnected)return false;
    const style=getComputedStyle(e);
    return mobile?style.borderRadius==='8px'&&style.backgroundImage.includes('linear-gradient'):style.borderRadius==='0px'&&style.backgroundImage==='none';
   },checkWidth<=900);
  }
  const region=page.locator('.mn-root .mn-regional').first(),other=region.locator('.mn-row').nth(1);
  await other.click();
  if(!(await other.getAttribute('class')).split(' ').includes('on'))throw Error('Desktop: seleção do ativo deixou de funcionar');
  await page.screenshot({path:join(out,theme+'-desktop-'+width+'-market-selection.png')});
  await page.waitForFunction(()=>typeof window.openSettings==='function');await page.evaluate(()=>window.openSettings());
  const settings=page.locator('.aj:not([hidden])');
  // sem login, "Minha conta" é um link para /conta, não uma categoria (04/11/2026)
  for(const id of ['appearance','panel','data','help','about']) {
   await settings.locator('[data-aj-category="'+id+'"]').click();
   if(await settings.locator('.aj-group:visible').count()!==1)throw Error('Desktop: mais de uma categoria visível');
   if(!(await settings.locator('[data-group="'+id+'"]').isVisible()))throw Error('Desktop: categoria errada');
   if(id==='panel') {
    await settings.locator('[data-toggle="cardSource"]').click();
    if(await settings.locator('[data-aj-category="panel"]').getAttribute('aria-current')!=='true')throw Error('Desktop: perdeu categoria após alterar controle');
    if(!(await page.evaluate(()=>JSON.parse(localStorage.getItem('trader_prefs_v1')).cardSource)))throw Error('Desktop: controle não foi salvo');
    await settings.locator('[data-toggle="cardSource"]').click();
   }
   const bounds=await settings.locator('.aj-body').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));
   if(bounds.scroll>bounds.width+2)throw Error('Desktop: conteúdo saiu da largura em '+id);
   await page.screenshot({path:join(out,theme+'-desktop-'+width+'-settings-'+id+'.png')});
  }
  await page.setViewportSize({width:390,height:844});
  if(await settings.locator('.aj-categories').isVisible())throw Error('Mobile: categorias desktop visíveis');
  if(await settings.locator('.aj-group > summary:visible').count()!==5)throw Error('Mobile: grupos sumiram após redimensionar');
  await settings.locator('button[data-act="close"]').click();
  results.push({desktopSettings:true,width,theme,categories:4,controlsSaved:true,mobileReturn:true});
  await ctx.close();
 }
}finally{
 writeFileSync(join(out,'review.json'),JSON.stringify({note:'Prévia local sem sessão. Cotações, séries e notícias são demonstrativas para avaliação visual, não preços ou notícias atuais. Outras fontes podem estar indisponíveis.',results},null,2));
 await browser.close();await new Promise(r=>server.close(r));
}
const panels=results.filter(x=>x.tab),headers=results.filter(x=>x.header);
if(panels.length!==52||panels.some(x=>x.error||x.pageWidth>x.viewportWidth+2||!x.summaryVisible||!x.assistantVisible))process.exitCode=1;
if(headers.some(x=>x.errors.length||x.header.some(b=>b.rect.w<44||b.rect.h<44)))process.exitCode=1;
if(panels.some(x=>x.orientation==='landscape'&&x.panelTop>215))process.exitCode=1;
console.log('Resumo: '+panels.length+' cenários; navegação, larguras, áreas de toque, botões e altura em paisagem conferidos.');
