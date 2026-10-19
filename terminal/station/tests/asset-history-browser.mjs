// Verificação em Chromium com a biblioteca real e séries sintéticas identificadas.
// O teste não consulta nem altera contas ou dados publicados.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import vm from 'node:vm';
const modules=process.env.MM_BROWSER_MODULES;
if(!modules)throw Error('Defina MM_BROWSER_MODULES com as dependências da verificação.');
const {chromium}=await import(pathToFileURL(join(modules,'playwright/index.mjs')).href);
const site=fileURLToPath(new URL('../site/',import.meta.url));
const source=readFileSync(join(site,'mesa.js'),'utf8'),context=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('  const CRYPTO ='),source.indexOf('  /* ---------------- dados'))+';globalThis.symbols=SYMS;',context);
const symbols=Array.from(context.symbols);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1100,height:720}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.setContent('<html><head></head><body><main id="chart" style="width:100%;height:650px"></main></body></html>');
 await page.addStyleTag({content:':root{--text:#a7b1c3;--text-2:#a7b1c3;--text-3:#8290a8;--surface:#0e1524;--surface-2:#121a2b;--line:#1c2740;--accent:#4d9eff}body{background:#0e1524;color:#a7b1c3;font-family:Arial}button{cursor:pointer}'+readFileSync(join(site,'asset-history.css'),'utf8')});
 await page.addScriptTag({path:join(modules,'lightweight-charts/dist/lightweight-charts.standalone.production.js')});
 await page.addScriptTag({path:join(site,'asset-history.js')});
 await page.evaluate(()=>{
  window.__viewer=new MMAssetHistory.Viewer(async symbol=>({[symbol]:{t:Array.from({length:65},(_,i)=>Date.UTC(2026,6,1+i,16)/1000),c:Array.from({length:65},(_,i)=>100+i*.4+Math.sin(i)*2),off:0}}));
 });
 for(const symbol of symbols){
  await page.evaluate(async symbol=>{await window.__viewer.show(document.getElementById('chart'),symbol,symbol+' (teste)',false);if(!window.__viewer.chart)throw Error('Falhou: '+symbol);},symbol);
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('#chart canvas')).some(c=>c.width>100&&c.height>100));
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.ok(await page.locator('.wlh-credit a[href="https://www.tradingview.com/"]').isVisible());
 }
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await settle();
 const initial=await page.evaluate(()=>window.__viewer.chart.timeScale().getVisibleLogicalRange());
 await page.locator('[data-days="31"]').click();await settle();
 const month=await page.evaluate(()=>window.__viewer.chart.timeScale().getVisibleLogicalRange());
 assert.ok(month.to-month.from<initial.to-initial.from,'1M precisa reduzir o intervalo');
 await page.locator('[data-days="93"]').click();await settle();
 const before=await page.evaluate(()=>window.__viewer.chart.timeScale().getVisibleLogicalRange());
 const bounds=await page.locator('.wlh-canvas').boundingBox();
 await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
 await page.mouse.wheel(0,-400);
 await page.waitForTimeout(150);
 const zoom=await page.evaluate(()=>window.__viewer.chart.timeScale().getVisibleLogicalRange());
 assert.ok(zoom.to-zoom.from<before.to-before.from,'Zoom com a roda deve aproximar a série');
 await page.locator('[data-reset]').click();await settle();
 const reset=await page.evaluate(()=>window.__viewer.chart.timeScale().getVisibleLogicalRange());
 assert.ok(Math.abs((reset.to-reset.from)-(before.to-before.from))<.01,'Ajustar deve restaurar o intervalo');
 await page.setViewportSize({width:390,height:780});
 await page.waitForTimeout(150);
 assert.ok(await page.locator('.wlh-canvas canvas').count()>0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Sem transbordamento horizontal no celular');
 if(process.env.MM_BROWSER_OUTPUT){
  mkdirSync(process.env.MM_BROWSER_OUTPUT,{recursive:true});
  await page.screenshot({path:join(process.env.MM_BROWSER_OUTPUT,'lightweight-mobile-fixture.png')});
 }
 await page.evaluate(async()=>{await window.__viewer.show(document.getElementById('chart'),'^VIX','VIX (teste)',true);});
 assert.ok(await page.locator('.wlh-credit').isVisible());
 await page.evaluate(()=>{window.__viewer.destroy();});
 assert.equal(await page.locator('#chart canvas').count(),0,'Fechar deve remover os canvases');
 assert.deepEqual(errors,[]);
 console.log('Lightweight Charts 5.0.9: '+symbols.length+' símbolos com séries sintéticas renderizados; períodos, zoom, reset, celular, tema e limpeza aprovados.');
}finally{await browser.close();}
