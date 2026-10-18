import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../site/asset-panel-core.js', import.meta.url), 'utf8');
const ctx = vm.createContext({}); vm.runInContext(source, ctx);
const { compare, daily } = ctx.MMAssetPanelCore;
const t = [1,2,3,4].map(d => Date.UTC(2026, 9, d, 14) / 1000);
test('compara somente datas em comum, ambas começando em 100', () => {
  const a = {t,c:[10,12,15,18]}, b = {t:t.slice(1),c:[20,22,24]};
  const r = compare(a,b);
  assert.equal(r.dates.length,3); assert.equal(r.first[0],100); assert.equal(r.second[0],100);
  assert.equal(r.first.at(-1),150); assert.equal(r.second.at(-1),120);
  assert.equal(a.c[0],10);
});
test('filtra ausências sem fabricar pontos ou interpretar null como zero', () => {
  const r = compare({t,c:[10,null,20,30]},{t,c:[10,11,12,13]});
  assert.equal(r.dates.length,3); assert.equal(r.first[1],200);
  assert.equal(daily({t,c:[0,NaN,-1,null]}).size,0);
});
test('rejeita séries incompatíveis e menos de duas datas comuns', () => {
  assert.throws(()=>compare({t:[t[0]],c:[10]},{t:[t[1]],c:[10]}));
  assert.throws(()=>compare({t,c:[10]},{t,c:[10,11,12,13]}));
});
test('alinha pela data da bolsa, não pela posição dos pontos', () => {
  const a={t:[t[0]+12*3600,t[1]+12*3600],c:[10,11],off:-3*3600};
  const b={t:t.slice(0,2),c:[20,22]};
  const r=compare(a,b);assert.equal(r.dates.length,2);assert.ok(Math.abs(r.first[1]-110)<1e-10);
});
test('snapshot de fundamentos usa a empresa selecionada e preserva ausência de múltiplos', async () => {
  const s=readFileSync(new URL('../site/fundamentos.js', import.meta.url),'utf8');
  const start=s.indexOf('  const assetJobs =');const end=s.indexOf('  /* ---------------- desenho',start);
  const context=vm.createContext({window:{},idx:{empresas:[{cvm:'1',tickers:['PETR4']}]},quotes:new Map(),
    loadIndex:async()=>true,loadDoc:async()=>({nome:'Petrobras',tickers:['PETR4'],financeira:false,ttm:{lucro:20,ebitda:40},balanco:{pl:100,div_liq:10,ref:'2026-06-30'}}),
    loadQuotes:async()=>{},mercado:()=>({mcap:null,aprox:false}),dmy:x=>x,
    div:(a,b,k=1)=>typeof a==='number'&&typeof b==='number'&&b!==0?a/b*k:null,
    xx:x=>x==null?'—':String(x),pc:x=>x==null?'—':String(x)});
  vm.runInContext(s.slice(start,end),context);
  const r=await context.window.getAssetFundamentals('PETR4.SA');assert.equal(r.name,'Petrobras');assert.equal(r.metrics[0][1],'—');assert.equal(r.metrics[2][1],'20');
  assert.equal(await context.window.getAssetFundamentals('MSFT'),null);
  assert.equal(await context.window.getAssetFundamentals('VALE3.SA'),null);
});
