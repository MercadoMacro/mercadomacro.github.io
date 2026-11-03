// Somente runtime local de teste. Nunca importado pelo Worker de produção.
import {NewsRelay} from '../src/news-relay.js';
export class NewsRelayFixture extends NewsRelay {
 constructor(ctx,env){super(ctx,env);this.env={DB:{prepare:()=>({bind:()=>({all:async()=>({results:await ctx.storage.get('revoked')?[]:[{token:'a'.repeat(64)}]})})})}};}
 async readSource(){
  await this.ctx.storage.put('calls',(await this.ctx.storage.get('calls')||0)+1);
  const version=await this.ctx.storage.get('version')||1;
  return [{titulo:'Notícia local '+version,link:'https://example.test/'+version,data:1700000000000+version,nivel:'ALTO',fonte:'Teste'}].map(n=>({...n,data:Date.now()}));
 }
 async fetch(req){
  const url=new URL(req.url),cmd=url.searchParams.get('cmd');
  if(url.pathname==='/test'){
   if(cmd==='version')await this.ctx.storage.put('version',2);
   if(cmd==='revoke'){await this.ctx.storage.put('revoked',true);for(const ws of this.sockets()){const a=ws.deserializeAttachment();a.validated=0;ws.serializeAttachment(a);}await this.alarm();}
   return Response.json({calls:await this.ctx.storage.get('calls')||0,sockets:this.sockets().length,alarm:await this.ctx.storage.getAlarm()});
  }
  return super.fetch(req);
 }
}
export default {fetch(req,env){const u=new URL(req.url);if(u.pathname==='/health')return new Response('ok');const h=new Headers(req.headers);if(u.pathname==='/ws')h.set('X-MM-Sessao','a'.repeat(64));return env.NEWS.get(env.NEWS.idFromName('main')).fetch(new Request(req,{headers:h}));}};
