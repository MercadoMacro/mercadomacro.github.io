import test from 'node:test';
import assert from 'node:assert/strict';
import {buscarAtivos,limparResultados} from '../src/busca-ativos.js';
const quote=(symbol='TEST',other={})=>({symbol,shortname:'Test Company',exchange:'NYQ',exchDisp:'NYSE',quoteType:'EQUITY',isYahooFinance:true,...other});
const req=(q,method='GET')=>new Request('https://mercadomacro.com.br/api/ativos/buscar?q='+encodeURIComponent(q),{method});
test('sanitizes provider data and rejects futures, nonfinancial results and invalid symbols',()=>{
 const out=limparResultados({quotes:[quote('NVDA'),quote('NVDA'),quote('NVDC34.SA',{exchange:'SAO',exchDisp:'São Paulo'}),quote('NVDA=F',{quoteType:'FUTURE'}),quote('BAD',{isYahooFinance:false}),quote('<script>')]});
 assert.deepEqual(out.map(x=>x.symbol),['NVDA','NVDC34.SA']);assert.equal(out[0].currency,'USD');assert.equal(out[1].currency,'BRL');assert.equal(out[1].type,'BDR');
 assert.equal(limparResultados({quotes:[quote('X.L',{exchange:'LSE'})]})[0].currency,'');
});
test('rejects invalid requests before contacting the provider',async()=>{
 const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('must not fetch');};try{for(const q of ['a','x'.repeat(65),'<script>'])assert.equal((await buscarAtivos(req(q))).status,400);assert.equal((await buscarAtivos(req('valid','POST'))).status,405);}finally{globalThis.fetch=original;}
});
test('fixed upstream, encoding, cache and identical concurrent queries use one request',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async url=>{calls++;assert.equal(url.hostname,'query1.finance.yahoo.com');assert.equal(url.searchParams.get('q'),'cache test & company');return {ok:true,json:async()=>({quotes:[quote()]})};};
 try{const [a,b]=await Promise.all([buscarAtivos(req('Cache test & company')),buscarAtivos(req('Cache test & company'))]);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(calls,1);assert.equal((await a.json()).results[0].symbol,'TEST');assert.equal((await buscarAtivos(req('Cache test & company'))).status,200);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('upstream failure is explicit and never cached as an empty successful search',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('offline');};
 try{assert.equal((await buscarAtivos(req('offline unique'))).status,503);assert.equal((await buscarAtivos(req('offline unique'))).status,503);assert.equal(calls,2);}finally{globalThis.fetch=original;}
});
test('the endpoint rejects unauthenticated requests without accessing the upstream',async()=>{
 const {default:worker}=await import('../src/index.js');const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected fetch');};
 try{const result=await worker.fetch(req('nvidia'),{DB:{prepare(){throw Error('No cookie should need no DB');}}},{});assert.equal(result.status,401);assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
