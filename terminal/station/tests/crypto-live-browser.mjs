import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const modules=process.env.MM_BROWSER_MODULES;
if(!modules)throw Error('Defina MM_BROWSER_MODULES.');
const {chromium}=await import(pathToFileURL(join(modules,'playwright/index.mjs')).href);
const site=fileURLToPath(new URL('../site/',import.meta.url));
const browser=await chromium.launch({headless:true});
const fixturePage='<html><head></head><body><section id="mesa-panel" class="active"><div id="mesa-root" style="height:700px"></div></section></body></html>';
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[],sockets=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('http://127.0.0.1:8787/**',route=>route.fulfill({contentType:'text/html',body:fixturePage}));
 await page.routeWebSocket('wss://data-stream.binance.vision/**',socket=>sockets.push(socket));
 await page.goto('http://127.0.0.1:8787/');
 await page.addStyleTag({content:':root{--text:#ddd;--text-2:#aaa;--text-3:#888;--pos:#10b981;--neg:#ef4444;--accent:#eab308;--surface:#0e1524;--surface-2:#121a2b;--line:#1c2740;--line-2:#29364b}body{background:#0e1524;color:#ddd}'+readFileSync(join(site,'crypto-live.css'),'utf8')});
 await page.evaluate(()=>{
  window.fetchT=async url=>{
   const u=new URL(url);let data={};
   if(u.pathname==='/quotes')data=Object.fromEntries((u.searchParams.get('symbols')||'').split(',').map(s=>[s,{value:s==='BTC-USD'?90:10,change:1,ts:Date.now(),sparkline:[9,10]}]));
   return new Response(JSON.stringify(data),{status:200});
  };
  window.parseYahooChart=x=>x;
 });
 await page.addScriptTag({path:join(site,'crypto-live.js')});
 await page.addScriptTag({path:join(site,'mesa.js')});
 await page.waitForFunction(()=>document.querySelector('.ms-cr b')?.textContent.includes('US$'));
 for(let i=0;i<100&&!sockets.length;i++)await page.waitForTimeout(20);
 assert.equal(sockets.length,1);
 const send=(pair,value)=>sockets.at(-1).send(JSON.stringify({stream:pair.toLowerCase()+'@ticker',data:{e:'24hrTicker',E:Date.now(),s:pair,c:String(value),P:'2.5'}}));
 const pairs=await page.evaluate(()=>Object.entries(MMCryptoLive.PAIRS));
 for(const [symbol,pair]of pairs){send(pair,100);await page.waitForFunction(s=>[...document.querySelectorAll('.ms-cr')].find(n=>n.dataset.sym===s)?.querySelector('b').textContent.includes('USDT'),symbol);}
 assert.match(await page.locator('.ms-live-status').innerText(),/8 pares em USDT/);
 assert.match(await page.locator('.ms-cr[data-sym="USDT-USD"] b').innerText(),/US\$/);
 send('BTCUSDT',101);await page.waitForFunction(()=>document.querySelector('.ms-cr[data-sym="BTC-USD"] b').classList.contains('ms-tick-up'));
 send('BTCUSDT',99);await page.waitForFunction(()=>document.querySelector('.ms-cr[data-sym="BTC-USD"] b').classList.contains('ms-tick-down'));
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mesa_cache_v1')).q['BTC-USD'].v),90,'Stream não pode contaminar o cache Yahoo em USD');
 await page.evaluate(()=>{document.getElementById('mesa-panel').classList.remove('active');});
 await page.waitForFunction(()=>!document.querySelector('.ms-cr[data-sym="BTC-USD"] b').textContent.includes('USDT'));
 assert.match(await page.locator('.ms-cr[data-sym="BTC-USD"] b').innerText(),/US\$/);
 await page.evaluate(()=>{document.getElementById('mesa-panel').classList.add('active');});
 for(let i=0;i<100&&sockets.length<2;i++)await page.waitForTimeout(20);
 assert.equal(sockets.length,2);
 await page.setViewportSize({width:390,height:780});send('BTCUSDT',102);
 await page.waitForFunction(()=>document.querySelector('.ms-cr[data-sym="BTC-USD"] b').textContent.includes('USDT'));
 if(process.env.MM_BROWSER_OUTPUT){mkdirSync(process.env.MM_BROWSER_OUTPUT,{recursive:true});await page.screenshot({path:join(process.env.MM_BROWSER_OUTPUT,'crypto-local-fixture.png')});}
 for(const host of ['mercadomacro.com.br','www.mercadomacro.com.br','example.com']){
  const prod=await browser.newPage(),productionSockets=[],prodErrors=[];
  prod.on('pageerror',e=>prodErrors.push(e.message));
  await prod.route('https://'+host+'/**',route=>route.fulfill({contentType:'text/html',body:fixturePage}));
  await prod.routeWebSocket('wss://data-stream.binance.vision/**',socket=>productionSockets.push(socket));
  await prod.goto('https://'+host+'/');await prod.addScriptTag({path:join(site,'crypto-live.js')});
  await prod.evaluate(()=>{window.fetchT=async()=>new Response('{}');window.parseYahooChart=x=>x;});
  await prod.addScriptTag({path:join(site,'mesa.js')});
  await prod.waitForSelector('.ms-cr');
  const expected=host!=='example.com';
  assert.equal(await prod.evaluate(()=>MMCryptoLive.hostAllowed(location.hostname)),expected);
  if(expected){
   await prod.waitForSelector('.ms-live-status');
   for(let i=0;i<100&&!productionSockets.length;i++)await prod.waitForTimeout(20);
   assert.equal(productionSockets.length,1);
   for(const [symbol,pair]of pairs){
    productionSockets[0].send(JSON.stringify({stream:pair.toLowerCase()+'@ticker',data:{e:'24hrTicker',E:Date.now(),s:pair,c:'100',P:'2.5'}}));
    await prod.waitForFunction(s=>[...document.querySelectorAll('.ms-cr')].find(n=>n.dataset.sym===s)?.querySelector('b').textContent.includes('USDT'),symbol);
   }
   assert.match(await prod.locator('.ms-live-status').innerText(),/Binance · 8 pares em USDT · 24h · ao vivo/);
   assert.doesNotMatch(await prod.locator('.ms-live-status').innerText(),/Prévia/);
   await prod.evaluate(()=>{window.__mmLoggingOut=true;});
   await prod.waitForFunction(()=>document.querySelector('.ms-live-status')?.textContent==='Cripto · Yahoo periódico');
   assert.equal(await prod.locator('.ms-cr b').filter({hasText:'USDT'}).count(),0);
  }else{
   await prod.waitForTimeout(1200);
   assert.equal(productionSockets.length,0);assert.equal(await prod.locator('.ms-live-status').count(),0);
  }
  assert.deepEqual(prodErrors,[]);await prod.close();
 }
 assert.deepEqual(errors,[]);
 console.log('Cripto: 8 pares simulados em Chromium; USD/USDT separados, flash, pausa/retomada, domínios oficiais, logout e bloqueio de domínio desconhecido aprovados.');
 // Sonda externa de leitura: indisponibilidade regional não altera o resultado dos testes determinísticos.
 const network=await browser.newPage();
 await network.route('http://127.0.0.1:8787/**',route=>route.fulfill({contentType:'text/html',body:'<html><head></head><body>Verificação da conexão</body></html>'}));
 await network.goto('http://127.0.0.1:8787/');await network.addScriptTag({path:join(site,'crypto-live.js')});
 const result=await network.evaluate(()=>new Promise(resolve=>{
  let done=false;const received=new Set(),wanted=Object.values(MMCryptoLive.PAIRS);const ws=new WebSocket('wss://data-stream.binance.vision/stream?streams='+wanted.map(s=>s.toLowerCase()+'@ticker').join('/'));
  const finish=result=>{if(done)return;done=true;clearTimeout(timer);ws.close();resolve(result);};
  const timer=setTimeout(()=>finish({ok:false,reason:'timeout ou bloqueio regional',received:[...received],missing:wanted.filter(s=>!received.has(s))}),12000);
  ws.onmessage=e=>{try{const q=MMCryptoLive.parse(JSON.parse(e.data));if(q){received.add(q.pair);if(received.size===wanted.length)finish({ok:true,pairs:[...received],currency:q.currency});}}catch{}};
  ws.onerror=()=>finish({ok:false,reason:'conexão indisponível neste ambiente'});
 }));
 console.log('Sonda externa Binance: '+JSON.stringify(result));
}finally{await browser.close();}
