import {spawn} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const state=mkdtempSync(join(tmpdir(),'mm-news-runtime-')),base='http://127.0.0.1:8793',sockets=[];
const child=spawn('npx',['--yes','wrangler@4.149.0','dev','--local','--config','tests/wrangler.news.json','--persist-to',state,'--ip','127.0.0.1','--port','8793'],{cwd:fileURLToPath(new URL('../',import.meta.url)),stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
let log='';for(const stream of [child.stdout,child.stderr])stream.on('data',d=>{log+=d;});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,timeout=25000){const end=Date.now()+timeout;while(Date.now()<end){const r=await fn();if(r)return r;await pause(100);}throw Error('Tempo limite no runtime local\n'+log.slice(-5000));}
async function stats(cmd=''){return (await fetch(base+'/test?cmd='+cmd)).json();}
function connect(){const ws=new WebSocket(base.replace('http','ws')+'/ws'),messages=[];ws.addEventListener('message',e=>{try{if(e.data==='pong')ws.pong=true;else messages.push(JSON.parse(e.data));}catch{}});ws.addEventListener('close',e=>{ws.closedCode=e.code;});sockets.push(ws);return {ws,messages};}
try{
 await waitFor(async()=>{try{return (await fetch(base+'/health')).ok;}catch{return false;}},120000);
 const a=connect();await waitFor(()=>a.messages.some(m=>m.type==='snapshot'));
 const b=connect();await waitFor(()=>b.messages.some(m=>m.type==='snapshot'));
 assert.equal((await stats()).calls,1,'Uma coleta compartilhada ao conectar dois leitores');
 a.ws.send('ping');await waitFor(()=>a.ws.pong);
 await stats('version');
 await waitFor(()=>a.messages.some(m=>m.type==='delta'&&m.items.some(n=>n.titulo==='Notícia local 2')));
 await waitFor(()=>b.messages.some(m=>m.type==='delta'&&m.items.some(n=>n.titulo==='Notícia local 2')));
 assert.equal((await stats()).calls,2,'Alarme coleta uma vez e distribui aos dois leitores');
 await stats('revoke');await waitFor(()=>a.ws.closedCode===4001&&b.ws.closedCode===4001);
 await waitFor(async()=>{const s=await stats();return s.sockets===0&&s.alarm===null;});
 console.log('Relay local aprovado: SQLite, WebSocketPair, dois leitores, alarme, broadcast, auto-resposta e revogação.');
}finally{for(const ws of sockets)try{ws.close();}catch{}try{if(process.platform==='win32')child.kill('SIGTERM');else process.kill(-child.pid,'SIGTERM');}catch{}await pause(500);rmSync(state,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
