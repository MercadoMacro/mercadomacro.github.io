// Lista pronta "ETFs dos EUA" (10/11/2026): só leitura, fora do documento da conta, mesmos códigos no servidor e no navegador.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {ETFS_EUA} from '../src/capital.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const doc=()=>({version:1,lists:[{id:'main',name:'Minha lista',items:[{s:'AAPL',n:'Apple'}]}]});
function setup(){
 const data=new Map(),writes=[],timers=new Map();let id=0;
 const ctx=vm.createContext({window:{},localStorage:{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:i=>timers.delete(i),
  fetch:async(url,opts={})=>{if(opts.method==='PUT'){writes.push(JSON.parse(opts.body));return{ok:true,status:200,json:async()=>({ok:true})};}return{ok:true,status:200,json:async()=>({usuario:2,v:doc(),ts:100})};}});
 vm.runInContext(read('site/watchlists-core.js')+'\n'+read('site/watchlists-store.js'),ctx);
 return {ctx,data,writes,core:ctx.MMWatchlists,store:new ctx.MMWatchlistsStore(),flush:async()=>{for(const [i,fn]of [...timers]){timers.delete(i);await fn();}}};
}
test('mesmos ETFs no servidor (Capital), no navegador (forex-live) e na lista pronta',()=>{
 const {core}=setup();
 assert.deepEqual([...core.ETFS_EUA],ETFS_EUA);
 const fx=read('site/forex-live.js');
 for(const t of ETFS_EUA)assert.match(fx,new RegExp(`'${t}'`),t);
 assert.ok(ETFS_EUA.length<=30);
});
test('lista pronta aparece, é só leitura e não vai para a conta',async()=>{
 const w=setup();await w.store.sync();
 const st=w.store.state();
 assert.equal(st.lists.at(-1).id,'pronta-etfs-eua');assert.equal(st.lists.at(-1).pronta,true);assert.equal(st.lists.at(-1).count,22);
 w.store.select('pronta-etfs-eua');
 assert.equal(w.store.state().pronta,true);assert.equal(w.store.items[0].s,'SPY');
 assert.throws(()=>w.store.saveItems([{s:'X'}]),/lista pronta/);
 w.store.saveItems([{s:'X'}],false); // nomes vindos das cotações: ignora sem erro
 assert.throws(()=>w.store.rename('pronta-etfs-eua','Outra'));assert.throws(()=>w.store.remove('pronta-etfs-eua'));
 w.store.items[0].s='MUDOU';assert.equal(w.store.items[0].s,'SPY'); // cópia, não a lista original
 // escolher a lista pronta fica lembrado; criar lista nova continua contando só as da conta
 assert.equal(JSON.parse(w.data.get('trader_watchlists_active_v1:2')),'pronta-etfs-eua');
 w.store.create('Brasil','br');await w.flush();
 const enviado=w.writes.at(-1).v;
 assert.equal(enviado.lists.length,2);assert.ok(!enviado.lists.some(l=>l.id.startsWith('pronta')));
 w.store.select('main');assert.equal(w.store.items[0].s,'AAPL');
});
