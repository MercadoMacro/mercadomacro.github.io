import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../site/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('// NEWS_LIVE_START'),source.indexOf('// NEWS_LIVE_END'));
const worker='https://news.cota-cotacao10.workers.dev/';
const item=(link='https://example.test/a',data=100000)=>({link,titulo:'Notícia de teste',data,nivel:'NORMAL',fonte:'Fonte'});
function setup(overrides={}) {
 let time=100000,active=true;
 class Clock extends Date {static now(){return time;}}
 const ctx=vm.createContext({Date:Clock,liveMode:true,newsCurrentMode:'live',document:{hidden:false,getElementById:()=>({classList:{contains:()=>active}})},NEWS_WORKER_URL:worker,NEWS_MAX_IDADE:172800000,fetchT:async()=>({ok:true,json:async()=>[item()]}),fetchNewsOnce:async()=>{},...overrides});
 vm.runInContext(code,ctx);
 return {ctx,run:s=>vm.runInContext(s,ctx),time:v=>{time=v;},active:v=>{active=v;}};
}
test('Ao vivo prioriza Worker direto; modo normal usa endpoint do site',async()=>{
 const calls=[];const s=setup({fetchT:async(url,opts,ms)=>{calls.push({url,opts,ms});return {ok:true,json:async()=>[item()]};}});
 await s.run('newsFetchPayload(true)');assert.equal(calls[0].url,worker);assert.equal(calls[0].opts.cache,'no-store');assert.equal(calls[0].ms,12000);
 await s.run('newsFetchPayload(false)');assert.equal(calls[1].url,'/api/noticias');
});
test('Worker lento, inválido ou vazio usa endpoint próprio como reserva',async()=>{
 for(const response of [null,[],{erro:'falha'},[{titulo:'incompleta'}]]) {
  const calls=[];const s=setup({fetchT:async url=>{calls.push(url);if(url===worker){if(response===null)throw Error('timeout');return {ok:true,json:async()=>response};}return {ok:true,json:async()=>[item()]};}});
  const result=await s.run('newsFetchPayload(true)');assert.equal(result.data.length,1);assert.deepEqual(calls,[worker,'/api/noticias']);
 }
});
test('falha das duas fontes é reportada em vez de entregar lista inválida',async()=>{
 const s=setup({fetchT:async()=>({ok:false,status:503})});await assert.rejects(s.run('newsFetchPayload(true)'),/503/);
});
test('consultas concorrentes compartilham a mesma busca e liberam após falha',async()=>{
 let calls=0,reject;const s=setup({fetchNewsOnce:()=>{calls++;return new Promise((_,r)=>{reject=r;});}});
 const a=s.run('fetchNewsFromWorker(true)'),b=s.run('fetchNewsFromWorker(false)');assert.equal(a,b);assert.equal(calls,1);
 reject(Error('falha'));await assert.rejects(a);assert.equal(s.run('newsFetchInFlight'),null);
});
test('polling respeita 60 segundos e pausa fora do Ao vivo, oculto ou desligado',async()=>{
 let calls=0;const s=setup({fetchNewsOnce:async()=>{calls++;}});
 await s.run('newsLiveTick()');assert.equal(calls,1);
 s.time(159999);await s.run('newsLiveTick()');assert.equal(calls,1);
 s.time(160000);await s.run('newsLiveTick()');assert.equal(calls,2);
 s.time(220000);
 for(const expression of ["document.hidden=true","document.hidden=false;liveMode=false","liveMode=true;newsCurrentMode='news'"]) {s.run(expression);await s.run('newsLiveTick()');assert.equal(calls,2);}
 s.run("newsCurrentMode='live'");s.active(false);await s.run('newsLiveTick()');assert.equal(calls,2);
 s.active(true);await s.run('newsLiveTick()');assert.equal(calls,3);
});
test('união preserva fontes locais, atualiza duplicatas e limita idade e volume',()=>{
 const s=setup();s.ctx.previous=[item('local'),item('duplicate'),item('old',-172800000)];s.ctx.incoming=[{...item('duplicate'),titulo:'Atualizada',fonte:'Outra'},...Array.from({length:40},(_,i)=>item('new'+i,100000-i))];
 const out=s.run('newsMergeLive(previous,incoming)');assert.ok(out.some(n=>n.link==='local'));assert.equal(out.find(n=>n.link==='duplicate').titulo,'Atualizada');assert.equal(out.some(n=>n.link==='old'),false);assert.equal(out.filter(n=>n.fonte==='Fonte').length,30);
});
