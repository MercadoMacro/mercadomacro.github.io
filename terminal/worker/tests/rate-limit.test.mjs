import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { grupoConsumo, limitarConsumo } from '../rate-limit.js';
import worker from '../shrill-meadow-89c1.js';
const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8').replace(/\/\/[^\n]*/g,''));
const req=(path='/quotes?symbols=PETR4.SA',ip='192.0.2.1',extra={})=>new Request('https://api.example.test'+path,{headers:{Origin:'https://mercadomacro.com.br','CF-Connecting-IP':ip,...extra}});
function env() {
  const e={};
  for(const c of config.ratelimits){
    const counts=new Map();
    e[c.name]={counts,limit:async({key})=>{const n=(counts.get(key)||0)+1;counts.set(key,n);return {success:n<=c.simple.limit};}};
  }
  return e;
}
const cors={'Access-Control-Allow-Origin':'https://mercadomacro.com.br'};
test('general limit allows 600 queries, then gives non-cacheable 429 with retry hint',async()=>{
  const e=env();for(let i=0;i<600;i++)assert.equal(await limitarConsumo(req(),e,cors),null);
  const r=await limitarConsumo(req(),e,cors);assert.equal(r.status,429);
  assert.equal(r.headers.get('Retry-After'),'60');assert.equal(r.headers.get('Cache-Control'),'no-store');
  assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://mercadomacro.com.br');assert.equal((await r.json()).retryAfter,60);
});
test('historical requests have their own 180/minute group',async()=>{
  const e=env();for(let i=0;i<180;i++)assert.equal(await limitarConsumo(req('/history?symbols=AAPL'),e,cors),null);
  assert.equal((await limitarConsumo(req('/ind/bundle?g=br'),e,cors)).status,429);
  assert.equal(await limitarConsumo(req('/quotes?symbols=AAPL'),e,cors),null);
});
test('paid-provider endpoints share 60/minute group without blocking normal quotes',async()=>{
  const e=env();for(let i=0;i<60;i++)assert.equal(await limitarConsumo(req('/finnhub/fund?s=AAPL'),e,cors),null);
  assert.equal((await limitarConsumo(req('/td?s=USD/BRL'),e,cors)).status,429);
  assert.equal(await limitarConsumo(req(),e,cors),null);
});
test('changing symbol, origin or query cannot reset the same IP counter',async()=>{
  const e=env();for(let i=0;i<60;i++)assert.equal(await limitarConsumo(req('/finnhub/fund?s=AAA'+i),e),null);
  const r=await limitarConsumo(req('/finnhub/search?q=apple','192.0.2.1',{Origin:'http://localhost:8787'}),e);
  assert.equal(r.status,429);
});
test('another connecting IP gets a separate counter',async()=>{
  const e=env();for(let i=0;i<60;i++)await limitarConsumo(req('/finnhub/fund?s=AAPL'),e);
  assert.equal(await limitarConsumo(req('/finnhub/fund?s=AAPL','192.0.2.2'),e),null);
});
test('spoofed X-Forwarded-For is not used as identity',async()=>{
  const e=env();await limitarConsumo(req('/quotes','192.0.2.1',{'X-Forwarded-For':'198.51.100.1'}),e);
  await limitarConsumo(req('/quotes','192.0.2.1',{'X-Forwarded-For':'198.51.100.2'}),e);
  assert.equal(e.API_RATE_GENERAL.counts.size,1);assert.equal([...e.API_RATE_GENERAL.counts.values()][0],2);
});
test('preflight does not consume the allowance',async()=>{
  const e=env();assert.equal(await limitarConsumo(new Request(req().url,{method:'OPTIONS'}),e),null);
  assert.equal(e.API_RATE_GENERAL.counts.size,0);
});
test('internal calls without IP share a separate key',async()=>{
  const e=env();await limitarConsumo(new Request(req().url),e);
  await limitarConsumo(req(),e);assert.equal(e.API_RATE_GENERAL.counts.size,2);
});
test('all expensive entry points are classified, including the generic proxy',()=>{
  for(const path of ['/history','/ind/bundle','/?url=https://query1.finance.yahoo.com/a'])assert.equal(grupoConsumo(new URL('https://a.test'+path)),'historicos');
  for(const path of ['/td','/finnhub/fund','/finnhub/search','/finnhub/earnings'])assert.equal(grupoConsumo(new URL('https://a.test'+path)),'premium');
});
test('missing binding fails closed instead of silently calling providers',async t=>{
  t.mock.method(console,'error',()=>{});assert.equal((await limitarConsumo(req(),{})).status,503);
});
test('limiter failure also fails closed',async t=>{
  t.mock.method(console,'error',()=>{});
  const e={API_RATE_GENERAL:{limit:async()=>{throw Error('unavailable');}}};assert.equal((await limitarConsumo(req(),e)).status,503);
});
test('invalid limiter response is a service error, not a false success',async t=>{
  t.mock.method(console,'error',()=>{});
  assert.equal((await limitarConsumo(req(),{API_RATE_GENERAL:{limit:async()=>({})}})).status,503);
});
test('integration: denied request is rejected before provider fetch',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('must not fetch');});
  const e=env();e.API_RATE_GENERAL.limit=async()=>({success:false});
  const r=await worker.fetch(req(),e,{waitUntil(){}});assert.equal(r.status,429);assert.equal(calls,0);
  assert.match(r.headers.get('Access-Control-Expose-Headers'),/Retry-After/);
});
test('integration: invalid origin is denied before counters or upstream calls',async()=>{
  const e=env();const r=await worker.fetch(req('/quotes','192.0.2.1',{Origin:'https://other.test'}),e,{waitUntil(){}});
  assert.equal(r.status,403);assert.equal(e.API_RATE_GENERAL.counts.size,0);
});
test('integration: POST cannot call quote handlers or consume provider budget',async()=>{
  const e=env();const r=await worker.fetch(new Request(req(),{method:'POST'}),e,{waitUntil(){}});
  assert.equal(r.status,405);assert.equal(e.API_RATE_GENERAL.counts.size,0);
});
test('integration: preflight works even without limiter bindings',async()=>{
  const r=await worker.fetch(new Request(req(),{method:'OPTIONS'}),{},{waitUntil(){}});
  assert.equal(r.status,204);
});
test('integration: valid request can use the existing quotes cache',async t=>{
  const e=env();let fetches=0;t.mock.method(globalThis,'fetch',async()=>{fetches++;throw Error('should use cache');});
  const prev=globalThis.caches;globalThis.caches={default:{match:async()=>new Response('{"PETR4.SA":{"ok":true}}')}};
  try{const r=await worker.fetch(req(),e,{waitUntil(){}});assert.equal(r.status,200);assert.equal(fetches,0);assert.equal(r.headers.get('X-Cache'),'HIT');}
  finally{if(prev===undefined)delete globalThis.caches;else globalThis.caches=prev;}
});
test('integration: reserve cache cannot turn a 429 into a successful response',async()=>{
  const e=env();e.API_RATE_GENERAL.limit=async()=>({success:false});let matches=0;
  const prev=globalThis.caches;globalThis.caches={default:{match:async()=>{matches++;return new Response('[]');}}};
  try{const r=await worker.fetch(req('/bcb?c=432'),e,{waitUntil(){}});assert.equal(r.status,429);assert.equal(matches,0);}
  finally{if(prev===undefined)delete globalThis.caches;else globalThis.caches=prev;}
});
