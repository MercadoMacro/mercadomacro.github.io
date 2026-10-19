import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../site/crypto-live.js',import.meta.url),'utf8');
function env(){
 let now=1792368000000,id=0;const timers=new Map(),events=[],sockets=[];
 const clock={now:()=>now,setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:i=>timers.delete(i),setInterval:(fn,ms)=>{timers.set(++id,{fn,at:now+ms,repeat:ms});return id;},clearInterval:i=>timers.delete(i)};
 const tick=ms=>{const target=now+ms;for(;;){const found=[...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at)[0];if(!found)break;const [i,t]=found;now=t.at;if(t.repeat)t.at+=t.repeat;else timers.delete(i);t.fn();}now=target;};
 class Socket{constructor(url){this.url=url;this.closed=false;sockets.push(this);}close(){this.closed=true;}}
 const ctx=vm.createContext({});vm.runInContext(source,ctx);const core=ctx.MMCryptoLive;
 const client=new core.Client({enabled:true,clock,Socket,random:()=>0,onChange:e=>events.push(e)});
 const message=(symbol='BTCUSDT',value='100',change='2.5',ts=now)=>({stream:symbol.toLowerCase()+'@ticker',data:{e:'24hrTicker',s:symbol,E:ts,c:value,P:change}});
 const send=(m=message(),socket=sockets.at(-1))=>socket.onmessage({data:JSON.stringify(m)});
 const start=()=>{client.setActive(true);sockets.at(-1).onopen();};
 return {core,client,sockets,events,clock,timers,tick,message,send,start};
}
test('official and local domains activate the stream; unknown hosts and disabled clients do not',()=>{
 const {core}=env();for(const host of ['localhost.evil','mercadomacro.com.br.evil','evilmercadomacro.com.br','example.com',''])assert.equal(core.hostAllowed(host),false);for(const host of ['mercadomacro.com.br','www.mercadomacro.com.br','localhost','127.0.0.1','[::1]','::1'])assert.equal(core.hostAllowed(host),true);
 let count=0;const client=new core.Client({enabled:false,Socket:class{constructor(){count++;}}});client.setActive(true);assert.equal(count,0);
});
test('all eight pairs preserve USDT and rolling 24h semantics; Tether/USD is not invented',()=>{
 const e=env();assert.equal(Object.keys(e.core.PAIRS).length,8);assert.equal(e.core.PAIRS['USDT-USD'],undefined);
 for(const [symbol,pair]of Object.entries(e.core.PAIRS)){const q=e.core.parse(e.message(pair),e.clock.now());assert.equal(q.symbol,symbol);assert.equal(q.currency,'USDT');assert.equal(q.window,'24h');assert.equal(q.source,'Binance');}
});
test('malformed, unknown, stale, future and empty values are rejected',()=>{
 const e=env();for(const m of [e.message('BADUSDT'),e.message('BTCUSDT',''),e.message('BTCUSDT','-1'),e.message('BTCUSDT','1',''),e.message('BTCUSDT','1','1',e.clock.now()-16000),e.message('BTCUSDT','1','1',e.clock.now()+6000),{}])assert.equal(e.core.parse(m,e.clock.now()),null);
 const bad=e.message();bad.stream='ethusdt@ticker';assert.equal(e.core.parse(bad,e.clock.now()),null);
});
test('single combined connection updates prices and only flashes changed prices from the same feed',()=>{
 const e=env();e.start();assert.equal(e.sockets.length,1);assert.match(e.sockets[0].url,/^wss:\/\/data-stream\.binance\.vision\/stream\?streams=/);assert.equal((e.sockets[0].url.match(/@ticker/g)||[]).length,8);
 e.send();assert.equal(e.client.quote('BTC-USD').direction,0);e.send(e.message('BTCUSDT','101'));assert.equal(e.client.quote('BTC-USD').direction,1);e.send(e.message('BTCUSDT','100'));assert.equal(e.client.quote('BTC-USD').direction,-1);e.send();assert.equal(e.client.quote('BTC-USD').direction,0);assert.equal(e.client.state().count,1);
});
test('late or invalid events cannot overwrite a newer quote',()=>{
 const e=env();e.start();e.send();e.tick(100);e.send(e.message('BTCUSDT','105'));e.send(e.message('BTCUSDT','999','2',e.clock.now()-100));assert.equal(e.client.quote('BTC-USD').value,105);
 e.sockets[0].onmessage({data:'bad json'});assert.equal(e.client.quote('BTC-USD').value,105);
});
test('disconnect immediately clears live data, reconnects with backoff, and does not flash a source switch',()=>{
 const e=env();e.start();e.send();e.sockets[0].onclose();assert.equal(e.client.quote('BTC-USD'),null);assert.equal(e.client.status,'reconnecting');e.tick(1000);assert.equal(e.sockets.length,2);e.sockets[1].onopen();e.send(e.message('BTCUSDT','900'));assert.equal(e.client.quote('BTC-USD').direction,0);
});
test('stale data expires per pair and a silent connection is restarted',()=>{
 const e=env();e.start();e.send();e.tick(16000);assert.equal(e.client.quote('BTC-USD'),null);assert.equal(e.sockets[0].closed,true);assert.notEqual(e.client.status,'live');
});
test('pausing closes the socket, cancels timers and rejects any late callbacks',()=>{
 const e=env();e.start();e.send();const late=e.sockets[0].onmessage;e.client.setActive(false);late({data:JSON.stringify(e.message('BTCUSDT','999'))});assert.equal(e.client.quote('BTC-USD'),null);assert.equal(e.sockets[0].closed,true);assert.equal(e.timers.size,0);e.tick(60000);assert.equal(e.sockets.length,1);
});
test('connection timeout and server shutdown trigger a controlled retry',()=>{
 const e=env();e.client.setActive(true);e.tick(8000);assert.equal(e.sockets[0].closed,true);e.tick(1000);e.sockets[1].onopen();e.send({data:{e:'serverShutdown'}});assert.equal(e.client.status,'reconnecting');assert.equal(e.sockets[1].closed,true);
});
