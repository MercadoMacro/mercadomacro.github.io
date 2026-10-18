import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../site/vitrine/calc-rf.js', import.meta.url), 'utf8');
const fixture = {4389:10, 432:14, 1178:13, 13522:4.5};
async function calculator({ rates = fixture, rejectProxy = false } = {}) {
  const els = new Map(), calls = [];
  const get = id => {
    if (!els.has(id)) els.set(id, { value:id==='valor'?'10.000':id==='prazo'?'12':'', textContent:'', innerHTML:'', addEventListener() {} });
    return els.get(id);
  };
  const ctx = vm.createContext({
    document:{getElementById:get,querySelectorAll:()=>[],activeElement:null},
    fetch:async url=>{
      calls.push(url);
      const u=new URL(url), c=+(u.searchParams.get('c')||u.pathname.match(/sgs\.(\d+)/)?.[1]);
      const fail=!(c in rates)||(rejectProxy&&!u.hostname.includes('api.bcb.gov.br'));
      return {ok:!fail,status:fail?503:200,json:async()=>[{data:'16/10/2026',valor:String(rates[c])}]};
    }
  });
  const marker="  $('valor').addEventListener";
  assert.ok(source.includes(marker));
  vm.runInContext(source.replace(marker,"  globalThis.calc = { M: M, LINHAS: LINHAS, taxas: taxas, linha: linha };\n"+marker),ctx);
  await new Promise(resolve=>setImmediate(resolve));
  return {ctx,els,calls,result:(id,days=365,principal=10000)=>ctx.calc.linha(ctx.calc.LINHAS.find(l=>l[0]===id),principal,days)};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('Tesouro uses effective Selic, with CDI and Selic target deliberately different',async()=>{
  const c=await calculator(); const r=c.result('tselic');
  near(r.bruto,1300);near(r.imp,227.5);near(r.liq,11072.5);
  assert.notEqual(r.bruto,c.result('cdb').bruto);
  assert.match(c.els.get('linhas').innerHTML,/13,00% a.a. \(Selic efetiva\)/);
  assert.equal(c.els.get('m-selic-efetiva').title,'Referência: 16/10/2026');
});
test('CDB stays linked to CDI and LCI keeps its CDI percentage',async()=>{
  const c=await calculator();near(c.result('cdb').bruto,1000);
  near(c.result('lci').bruto,10000*((1+((1.10**(1/252))-1)*.9)**252-1));
  near(c.result('lci').imp,0);
});
test('savings uses the Selic target even when effective Selic is below the threshold',async()=>{
  const c=await calculator({rates:{...fixture,432:10,1178:7}});
  near(c.result('poup').bruto,10000*(1.005**12-1));
});
test('missing effective Selic does not fall back to CDI or target',async()=>{
  const c=await calculator({rates:{4389:10,432:14,13522:4.5}});
  assert.equal(c.result('tselic'),null);assert.ok(c.result('cdb'));
  assert.match(c.els.get('m-fonte').textContent,/Indisponível: Selic efetiva/);
  assert.match(c.els.get('linhas').innerHTML,/Selic efetiva indisponível/);
});
test('missing CDI and target do not disable Tesouro when effective Selic is available',async()=>{
  const c=await calculator({rates:{1178:13,13522:4.5}});
  near(c.result('tselic').bruto,1300);assert.equal(c.result('cdb'),null);assert.equal(c.result('poup'),null);
});
test('zero effective Selic is valid and has no yield or tax',async()=>{
  const c=await calculator({rates:{...fixture,1178:0}});
  const r=c.result('tselic');near(r.bruto,0);near(r.imp,0);near(r.liq,10000);
});
test('direct BCB fallback loads effective Selic when the proxy fails',async()=>{
  const c=await calculator({rejectProxy:true});near(c.result('tselic').bruto,1300);
  assert.ok(c.calls.some(u=>u.includes('api.bcb.gov.br/dados/serie/bcdata.sgs.1178/')));
  assert.ok(!c.calls.some(u=>u.includes('mercadomacro-vitrine')&&u.includes('c=1178')));
});
test('all unavailable indicators give a clear message without inventing rates',async()=>{
  const c=await calculator({rates:{}});assert.equal(c.result('tselic'),null);
  assert.match(c.els.get('m-fonte').textContent,/fora do ar/);
});
test('IR boundaries still apply to effective-Selic yield',async()=>{
  const c=await calculator();
  for(const [days,tax] of [[180,.225],[181,.2],[360,.2],[361,.175],[720,.175],[721,.15]]) {
    const r=c.result('tselic',days);near(r.imp,r.bruto*tax);
  }
});
test('IOF applies before IR on a one-day simulation and ends at day 30',async()=>{
  const c=await calculator();const r=c.result('tselic',1);
  near(r.imp,r.bruto*.96+r.bruto*.04*.225);
  const day30=c.result('tselic',30);near(day30.imp,day30.bruto*.225);
});
