import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const initial=()=>({version:1,lists:[{id:'main',name:'Minha lista',items:[{s:'AAPL',n:'Apple'}]}]});
function setup(handler,local=[]) {
 const data=new Map(local),writes=[],timers=new Map();let id=0;
 const ctx=vm.createContext({window:{},localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id),fetch:async(url,opts)=>{if(opts.method==='PUT')writes.push(JSON.parse(opts.body));return handler(url,opts);}});
 vm.runInContext(read('site/watchlists-core.js')+'\n'+read('site/watchlists-store.js'),ctx);
 return {ctx,data,writes,core:ctx.MMWatchlists,store:new ctx.MMWatchlistsStore(),flush:async()=>{for(const [i,fn]of [...timers]){timers.delete(i);await fn();}}};
}
const response=(v,usuario=2,ts=100)=>({ok:true,status:200,json:async()=>({usuario,v,ts})});
test('CRUD preserves original, isolates items and rejects duplicate names and last deletion',()=>{
 const {core}=setup(()=>{}), original=initial();let doc=core.create(original,'Brasil','br');
 assert.equal(original.lists.length,1);assert.equal(doc.lists[1].items.length,0);
 doc=core.rename(doc,'br','Ações');assert.throws(()=>core.create(doc,'ACOES','x'));
 assert.equal(core.remove(doc,'main').lists[0].id,'br');assert.throws(()=>core.remove(original,'main'));
});
test('schema enforces ten lists, thirty assets, unique IDs and per-list symbols',()=>{
 const {core}=setup(()=>{});let doc=initial();for(let i=1;i<10;i++)doc=core.create(doc,'Lista '+i,'l'+i);
 assert.throws(()=>core.create(doc,'Extra','extra'));
 doc.lists[1].items=[{s:'AAPL'}];assert.equal(core.valid(doc),true);
 doc.lists[0].items.push({s:'AAPL'});assert.equal(core.valid(doc),false);
 doc=initial();doc.lists[0].items=Array.from({length:31},(_,i)=>({s:'X'+i}));assert.equal(core.valid(doc),false);
});
test('migration uses only account-owned cache and preserves legacy backup',async()=>{
 const old=JSON.stringify([{s:'PETR4.SA'}]);const w=setup((url,opts)=>response(opts.method==='PUT'?null:null),[['trader_watchlist_v2:2',old],['trader_watchlist_ts_v2:2','200'],['trader_watchlist_v1','[{"s":"OTHER"}]']]);
 await w.store.sync();assert.equal(w.store.items[0].s,'PETR4.SA');assert.equal(w.store.writable,false);
 assert.throws(()=>w.store.create('Teste','test'));await w.flush();assert.equal(w.store.writable,true);
 assert.equal(w.writes[0].migracao,true);assert.equal(w.data.get('trader_watchlist_v2:2'),old);
});
test('create, rename, selection and deletion persist the right active list',async()=>{
 const w=setup(()=>response(initial()));await w.store.sync();w.store.create('Brasil','br');w.store.saveItems([{s:'PETR4.SA'}]);
 w.store.select('main');assert.equal(w.store.items[0].s,'AAPL');w.store.rename('br','Bolsa');await w.flush();
 assert.equal(w.writes.at(-1).v.lists[1].items[0].s,'PETR4.SA');assert.equal(w.writes.at(-1).v.lists[1].name,'Bolsa');
 w.store.select('br');w.store.remove('br');assert.equal(w.store.active,'main');assert.equal(w.store.items[0].s,'AAPL');
 assert.equal(JSON.parse(w.data.get('trader_watchlists_active_v1:2')),'main');
});
test('identity mismatch during migration blocks loading and writing',async()=>{
 const w=setup(url=>response(null,url.endsWith('k=watchlists')?2:1));await w.store.sync();await w.flush();
 assert.equal(w.store.ready,false);assert.equal(w.writes.length,0);assert.equal(w.data.size,0);
});
test('failed legacy read cannot replace the existing list with empty data',async()=>{
 const w=setup(url=>url.endsWith('k=watchlists')?response(null):{ok:false});await w.store.sync();await w.flush();
 assert.equal(w.store.ready,false);assert.equal(w.writes.length,0);
});
test('migration collision reloads authoritative collection and keeps legacy backup',async()=>{
 let migrated=false;const backup=JSON.stringify([{s:'OLD'}]);const remote=initial();remote.lists[0].name='Outro aparelho';
 const w=setup((url,opts)=>{if(opts.method==='PUT'){migrated=true;return {ok:false,status:409,json:async()=>({codigo:'listas-existem'})};}return response(url.endsWith('k=watchlists')?(migrated?remote:null):[{s:'OLD'}]);},[['trader_watchlist_v2:2',backup]]);
 await w.store.sync();await w.flush();assert.equal(w.store.doc.lists[0].name,'Outro aparelho');assert.equal(w.store.writable,true);assert.equal(w.writes.length,1);assert.equal(w.data.get('trader_watchlist_v2:2'),backup);
});
test('logout blocks pending updates and new loads',async()=>{
 const w=setup(()=>response(initial()));await w.store.sync();w.store.create('Brasil','br');w.ctx.window.__mmLoggingOut=true;await w.flush();await w.store.sync();assert.equal(w.writes.length,0);assert.equal(w.store.ready,false);
});
const source=read('src/index.js'),api=source.slice(source.indexOf('const CHAVES_DADOS'),source.indexOf('/* ---------------- cadastro, login'));
async function server(body,{migrated=false,changes=1}={}){
 const queries=[];const ctx=vm.createContext({URL,json:(o,status=200)=>({o,status}),mesmaOrigem:()=>true});vm.runInContext(api,ctx);
 ctx.req=new Request('https://mercadomacro.com.br/api/conta/dados',{method:'PUT',body:JSON.stringify({usuario:2,k:'watchlists',v:initial(),ts:200,...body})});ctx.u={id:2};ctx.env={DB:{prepare:sql=>{queries.push(sql);return {bind(){return this;},first:async()=>migrated?{ts:100}:null,run:async()=>({meta:{changes}})};}}};
 return {...await vm.runInContext('apiDados(req,env,u)',ctx),queries};
}
test('server rejects malformed and duplicate collections before database access',async()=>{
 for(const v of [{version:2,lists:[]},{version:1,lists:[...initial().lists,...initial().lists]}]){const r=await server({v});assert.equal(r.status,400);assert.equal(r.queries.length,0);}
});
test('old tabs cannot write legacy data after migration',async()=>{const r=await server({k:'watchlist',v:[{s:'OLD'}]},{migrated:true});assert.equal(r.status,409);assert.equal(r.queries.length,1);});
test('migration uses atomic insert-only and reports competing migration',async()=>{const r=await server({migracao:true},{changes:0});assert.equal(r.status,409);assert.equal(r.o.codigo,'listas-existem');assert.match(r.queries[0],/INSERT OR IGNORE/);});
test('all ten full lists fit server payload limit and retain account guard',async()=>{
 const v={version:1,lists:Array.from({length:10},(_,i)=>({id:'l'+i,name:'Lista '+i,items:Array.from({length:30},(_,j)=>({s:'SYMBOL'+j,n:'N'.repeat(80)}))}))};
 assert.equal((await server({v})).status,200);const r=await server({v,usuario:1});assert.equal(r.status,409);assert.equal(r.queries.length,0);
});
