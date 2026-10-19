import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../site/'+p,import.meta.url),'utf8');
const ctx=vm.createContext({});vm.runInContext(read('asset-search-core.js'),ctx);const core=ctx.MMAssetSearch;
const catalog=core.catalog([{items:[{symbol:'PETR4.SA',name:'Petrobras PN'},{symbol:'PETR3.SA',name:'Petrobras ON'},{symbol:'AAPL',name:'Apple'},{symbol:'GOOG',name:'Alphabet'},{name:'Sem código'}]}]);
test('Google and Alphabet return both explicitly named classes without automatic choice',()=>{
 for(const query of ['google','GOOGLE','  Alphabet '])assert.deepEqual(Array.from(core.search(query,catalog),x=>x.symbol),['GOOGL','GOOG']);
 assert.equal(core.exactCode('google',catalog),undefined);assert.equal(core.exactCode('GOOG',catalog).symbol,'GOOG');
});
test('existing panel names and tickers are searchable, with deduplication',()=>{
 assert.equal(core.search('petrobras',catalog).length,2);assert.equal(core.search('petr4',catalog)[0].symbol,'PETR4.SA');assert.equal(core.exactCode('PETR4',catalog).symbol,'PETR4.SA');assert.equal(catalog.filter(x=>x.symbol==='GOOG').length,1);
});
test('normalization accepts accents and extra spaces and unknown queries remain unknown',()=>{
 assert.equal(core.normalize('  AÇÕES   Brasil '),'acoes brasil');assert.equal(core.search('zzzz',catalog).length,0);assert.equal(core.search('',catalog).length,0);assert.equal(core.search('<script>',catalog).length,0);
});
function ui(fetcher=async()=>({ok:true,json:async()=>({results:[]})})){
 const timers=new Map();let timer=0;
 const listeners=new Map();
 class Node{
  constructor(){this.attrs={};this.children=[];this.hidden=false;this.value='';this.classList={toggle(){}};this.events={};}
  setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}addEventListener(k,fn){(this.events[k]??=[]).push(fn);}focus(){}contains(){return true;}
 }
 const input=new Node(),form=new Node();let submissions=0;const nodes=[];
 const c=vm.createContext({MMAssetSearch:core,MARKET_SECTIONS:[],AbortController,fetch:fetcher,setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),window:{addEventListener(){}},document:{getElementById:id=>id==='wl-input'?input:form,createElement:()=>{const n=new Node();nodes.push(n);return n;},addEventListener:(k,fn)=>listeners.set(k,fn)}});
 const submit=()=>{const e={prevented:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){}};for(const fn of form.events.submit||[])fn(e);if(!e.prevented)submissions++;return e;};form.requestSubmit=submit;
 vm.runInContext(read('asset-search.js'),c);
 return {input,form,popup:nodes[0],status:nodes[1],flush:async()=>{for(const [id,fn]of [...timers]){timers.delete(id);await fn();}},submit,submissions:()=>submissions,event:(key)=>{const e={key,preventDefault(){},stopPropagation(){}};for(const fn of input.events.keydown||[])fn(e);}};
}
test('typing a company name then Enter displays choices without submitting a bad ticker',()=>{
 const u=ui();u.input.value='google';assert.equal(u.submit().prevented,true);assert.equal(u.submissions(),0);assert.equal(u.popup.children.length,2);assert.equal(u.popup.hidden,false);
 u.event('ArrowDown');u.event('Enter');assert.equal(u.input.value,'GOOG');assert.equal(u.submissions(),1);
});
test('direct ticker and bulk additions keep their original submit flow; Escape closes choices',()=>{
 const u=ui();for(const q of ['GOOGL','PETR4','AAPL, MSFT']){u.input.value=q;assert.equal(u.submit().prevented,false);}assert.equal(u.submissions(),3);
 u.input.value='google';u.submit();u.event('Escape');assert.equal(u.popup.hidden,true);assert.equal(u.input.attrs['aria-expanded'],'false');
});
test('expanded catalog resolves Nvidia and BofA, distinguishing US shares and BDRs',()=>{
 const context=vm.createContext({});vm.runInContext(read('asset-catalog.js')+'\n'+read('asset-search-core.js'),context);const c=context.MMAssetSearch,all=c.catalog();
 assert.equal(context.MMAssetCatalog.length,50);
 for(const [q,code,bdr]of [['nvidia','NVDA','NVDC34.SA'],['bofa','BAC','BOAC34.SA']]){
  const found=c.search(q,all);assert.ok(found.some(x=>x.symbol===code&&x.currency==='USD'));assert.ok(found.some(x=>x.symbol===bdr&&x.type==='BDR'&&x.currency==='BRL'));
 }
 assert.match(c.remoteQuery('bofa',all),/Bank of America/);
});
test('remote results extend the catalog and a selected result submits its real ticker',async()=>{
 const u=ui(async()=>({ok:true,json:async()=>({results:[{symbol:'NEW',name:'New Company',market:'NYSE · Ação · USD'}]})}));
 u.input.value='New Company';u.submit();assert.equal(u.submissions(),0);await u.flush();assert.equal(u.popup.children.length,1);
 u.event('ArrowDown');u.event('Enter');assert.equal(u.input.value,'NEW');assert.equal(u.submissions(),1);
});
test('late results and closing the popup cannot overwrite a newer query',async()=>{
 let resolve;const u=ui(()=>new Promise(r=>{resolve=r;}));u.input.value='First company';u.submit();const pending=u.flush();
 u.input.value='google';u.submit();resolve({ok:true,json:async()=>({results:[{symbol:'OLD',name:'First company'}]})});await pending;
 assert.equal(u.popup.children[0].children[0].textContent,'GOOGL');u.event('Escape');assert.equal(u.popup.hidden,true);
});
test('remote failure keeps local suggestions and reports unavailable unknown names',async()=>{
 const u=ui(async()=>{throw Error('offline');});u.input.value='google';u.submit();await u.flush();assert.equal(u.popup.children.length,2);
 u.input.value='Unknown Company';for(const fn of u.input.events.input)fn();await u.flush();assert.match(u.status.textContent,/indisponível/);assert.equal(u.submissions(),0);
});
test('repeated search uses browser memory instead of another request',async()=>{
 let calls=0;const u=ui(async()=>{calls++;return {ok:true,json:async()=>({results:[]})};});u.input.value='google';u.submit();await u.flush();
 for(const fn of u.input.events.input)fn();await u.flush();assert.equal(calls,1);
});
