import {readFileSync} from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';
const source=readFileSync(new URL('../site/news-stream.js',import.meta.url),'utf8');
function setup(){let now=100000,id=0;const timers=new Map(),sockets=[],events=[],data=[];let auth=0;
 const clock={now:()=>now,setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)};
 const tick=ms=>{const end=now+ms;for(;;){const e=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!e)break;now=e[1].at;timers.delete(e[0]);e[1].fn();}now=end;};
 class Socket{constructor(url){this.url=url;this.readyState=0;sockets.push(this);}send(m){this.sent=m;}close(){this.closed=true;this.readyState=3;}}
 const ctx=vm.createContext({});vm.runInContext(source,ctx);const client=new ctx.MMNewsStream.Client({url:'ws://local/api/noticias/ws',Socket,clock,random:()=>0,onData:n=>data.push(n),onState:s=>events.push(s),onAuth:()=>auth++});
 const send=(payload,ws=sockets.at(-1))=>ws.onmessage({data:typeof payload==='string'?payload:JSON.stringify(payload)});
 const frame=()=>({type:'snapshot',at:now,items:[{titulo:'Teste',link:'https://example.test/a',data:now,nivel:'ALTO'}]});
 const start=()=>{client.setActive(true);sockets.at(-1).readyState=1;sockets.at(-1).onopen();};return{client,sockets,events,data,tick,send,frame,start,auth:()=>auth,timers};}
test('snapshot e delta atualizam a tela e marcam conexão saudável',()=>{const s=setup();s.start();assert.equal(s.client.healthy(),false);s.send(s.frame());assert.equal(s.client.healthy(),true);s.send({...s.frame(),type:'delta'});assert.equal(s.data.length,2);});
test('frames inválidos/antigos não desativam a reserva HTTP',()=>{const s=setup();s.start();for(const m of ['invalid',{type:'snapshot',at:0,items:[]},{...s.frame(),items:[{}]}])s.send(m);assert.equal(s.data.length,0);assert.equal(s.client.healthy(),false);});
test('falha da fonte ativa reserva; recuperação volta ao push',()=>{const s=setup();s.start();s.send(s.frame());s.send({type:'status',ok:false,at:100000});assert.equal(s.client.healthy(),false);s.send({type:'status',ok:true,at:100000});assert.equal(s.client.healthy(),true);});
test('queda reconecta com espera e ignora mensagens da conexão antiga',()=>{const s=setup();s.start();const old=s.sockets[0];old.onclose({code:1006});assert.equal(s.client.status,'fallback');s.tick(1000);assert.equal(s.sockets.length,2);s.send(s.frame(),old);assert.equal(s.data.length,0);s.send(s.frame());assert.equal(s.client.healthy(),true);});
test('pausar fecha conexão, cancela reconexão e permite retomar',()=>{const s=setup();s.start();s.sockets[0].onclose({code:1006});s.client.setActive(false);s.tick(60000);assert.equal(s.sockets.length,1);assert.equal(s.timers.size,0);s.client.setActive(true);assert.equal(s.sockets.length,2);});
test('sessão revogada encerra transporte sem reconectar',()=>{const s=setup();s.start();s.sockets[0].onclose({code:4001});s.tick(60000);s.client.setActive(true);assert.equal(s.auth(),1);assert.equal(s.sockets.length,1);assert.equal(s.client.denied,true);});
test('conexão sem mensagens expira e tenta recuperar',()=>{const s=setup();s.start();s.send(s.frame());s.tick(50000);assert.equal(s.client.healthy(),false);assert.ok(s.events.includes('fallback'));});
