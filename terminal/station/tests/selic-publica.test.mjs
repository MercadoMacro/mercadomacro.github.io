import test from 'node:test';
import assert from 'node:assert/strict';
import { selecionarSelic, respostaSelic } from '../src/selic-publica.js';
const NOW=Date.parse('2026-10-18T17:30:00Z');
const record=(data='16/10/2026',taxa=13.65,ops=748)=>({dataCotacao:data,taxaAnual:taxa,qtdOperacoes:ops});
const sample={registros:[record('19/10/2026',0,0),record()]};
test('skips weekend placeholder and returns the actual completed observation',()=>{
  const j=selecionarSelic(sample,NOW);assert.equal(j.data,'16/10/2026');assert.equal(j.valor,13.65);
});
test('chooses the latest date independently of source order',()=>{
  assert.equal(selecionarSelic({registros:[record('14/10/2026'),record(),record('15/10/2026')]},NOW).data,'16/10/2026');
});
test('rejects no observations, stale data and invalid dates',()=>{
  for(const j of [{},{registros:[]},{registros:[record('01/09/2026')]},{registros:[record('31/02/2026')]}]) assert.throws(()=>selecionarSelic(j,NOW));
});
test('does not convert null into a zero rate or accept future observations',()=>{
  for(const r of [record('16/10/2026',null),record('19/10/2026'),record('16/10/2026',13.65,0)]) assert.throws(()=>selecionarSelic({registros:[r]},NOW));
});
test('zero rate is valid only when there are completed operations',()=>{
  assert.equal(selecionarSelic({registros:[record('16/10/2026',0,1)]},NOW).valor,0);
});
async function withRuntime(fn) {
  const prevFetch=globalThis.fetch,prevCaches=globalThis.caches,prevNow=Date.now;
  const data=new Map(),pending=[];let calls=0,failed=false;
  globalThis.caches={default:{match:async req=>data.get(req.url)?.clone(),put:async(req,res)=>{data.set(req.url,res.clone());}}};
  globalThis.fetch=async(url,opts)=>{
    calls++;assert.match(url,/^https:\/\/www3\.bcb\.gov\.br\/novoselic\//);assert.equal(opts.method,'POST');
    return new Response(JSON.stringify(failed?{erro:'offline'}:sample),{status:failed?503:200});
  };
  Date.now=()=>NOW;
  const req=new Request('http://localhost:8787/api/publico/selic');
  const ctx={waitUntil:p=>pending.push(p)};
  try {await fn({req,ctx,data,fail:()=>{failed=true;},calls:()=>calls,settle:()=>Promise.all(pending)});}
  finally {globalThis.fetch=prevFetch; if(prevCaches===undefined)delete globalThis.caches;else globalThis.caches=prevCaches;Date.now=prevNow;}
}
test('endpoint serves official data and reuses its fresh cache',async()=>withRuntime(async r=>{
  const first=await respostaSelic(r.req,r.ctx);assert.equal(first.status,200);assert.equal((await first.json()).valor,13.65);
  await r.settle();assert.equal((await respostaSelic(r.req,r.ctx)).status,200);assert.equal(r.calls(),1);
}));
test('source failure returns a validated reserve with explicit flag',async()=>withRuntime(async r=>{
  await respostaSelic(r.req,r.ctx);await r.settle();r.data.delete(r.req.url);r.fail();
  const res=await respostaSelic(r.req,r.ctx);assert.equal(res.status,200);const j=await res.json();assert.equal(j.reserva,true);assert.equal(j.data,'16/10/2026');
}));
test('source failure without a valid reserve returns 503, never a fabricated rate',async()=>withRuntime(async r=>{
  r.fail();const res=await respostaSelic(r.req,r.ctx);assert.equal(res.status,503);assert.equal((await res.json()).valor,undefined);
}));
test('endpoint refuses writes before accessing the source',async()=>withRuntime(async r=>{
  const res=await respostaSelic(new Request(r.req.url,{method:'POST'}),r.ctx);assert.equal(res.status,405);assert.equal(r.calls(),0);
}));
