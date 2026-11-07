// Uma coleta para todos os leitores; SQLite guarda o snapshot entre hibernações.
import { noticiasRapidas } from './noticias.js';
const SOURCE = 'https://news.cota-cotacao10.workers.dev/';
const PERIOD = 15000, MAX_AGE = 48 * 3600000;
export function cleanNews(value, now = Date.now()) {
  if (!Array.isArray(value)) throw Error('Lista inválida');
  const seen = new Set(), out = [];
  for (const n of value) {
    if (!n || typeof n.titulo !== 'string' || typeof n.link !== 'string' || !/^https?:\/\//i.test(n.link) || !Number.isFinite(n.data) || now-n.data > MAX_AGE || n.data > now+600000 || !['NORMAL','MEDIO','ALTO','CRITICO'].includes(String(n.nivel).toUpperCase()) || seen.has(n.link)) continue;
    seen.add(n.link);
    const item = {link:n.link.slice(0,2000),titulo:n.titulo.slice(0,600),data:n.data,nivel:String(n.nivel).toUpperCase(),fonte:String(n.fonte||'').slice(0,120),veiculo:String(n.veiculo||'').slice(0,120),resumo:String(n.resumo||'').slice(0,6000),trecho:String(n.trecho||'').slice(0,600),imagem:typeof n.imagem==='string'&&/^https:\/\//i.test(n.imagem)?n.imagem.slice(0,2000):null,palavras:Number(n.palavras)||0,impactScore:Number(n.impactScore)||0,finalScore:Number(n.finalScore)||0,tags:Array.isArray(n.tags)?n.tags.filter(t=>typeof t==='string').slice(0,10).map(t=>t.slice(0,50)):[]};
    out.push(item);if(out.length===250)break;
  }
  if (!out.length) throw Error('Sem notícias recentes');
  out.sort((a,b)=>b.data-a.data);
  // Mantém a linha SQLite e os frames abaixo de 1 MiB, incluindo UTF-8.
  while(new TextEncoder().encode(JSON.stringify(out)).length>900000)out.pop();
  return out;
}
export class NewsRelay {
  constructor(ctx,env) {
    this.ctx=ctx;this.env=env;this.inflight=null;
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS news_snapshot (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, checked INTEGER NOT NULL)');
    const row=ctx.storage.sql.exec('SELECT payload, checked FROM news_snapshot WHERE id=1').toArray()[0];
    this.items=row?JSON.parse(row.payload):[];this.checked=row?.checked||0;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
  }
  sockets(){return this.ctx.getWebSockets().filter(ws=>ws.readyState===1);}
  send(ws,data){try{ws.send(JSON.stringify(data));return true;}catch{try{ws.close(1011,'Conexão indisponível');}catch{}return false;}}
  async fetch(req) {
    const token=req.headers.get('X-MM-Sessao')||'';
    if(req.method!=='GET'||req.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('Use WebSocket',{status:400});
    if(!/^[a-f0-9]{64}$/.test(token))return new Response('Sem sessão',{status:401});
    if(this.sockets().length>=1000)return new Response('Tente novamente',{status:503});
    const pair=new WebSocketPair(),[client,server]=Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({token,validated:Date.now(),snapshot:!this.items.length});
    if(this.items.length)this.send(server,{type:'snapshot',items:this.items,at:this.checked});
    await this.schedule();
    if(Date.now()-this.checked>=PERIOD)this.ctx.waitUntil(this.collect());
    return new Response(null,{status:101,webSocket:client});
  }
  async schedule(at=Date.now()+PERIOD) {
    if(!this.sockets().length){await this.ctx.storage.deleteAlarm();return;}
    const current=await this.ctx.storage.getAlarm();
    if(!current||current>at)await this.ctx.storage.setAlarm(at);
  }
  async readSource() {
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);
    try {
      const r=await fetch(SOURCE,{signal:ctrl.signal,cache:'no-store'});
      if(!r.ok)throw Error('Fonte indisponível');return await r.json();
    }finally{clearTimeout(timer);}
  }
  // feed lido direto a cada rodada (Financial Juice), para a manchete chegar sem o atraso do servidor de notícias
  async readFast() { try { return await noticiasRapidas(); } catch { return []; } }
  collect() {
    if(this.inflight)return this.inflight;
    this.inflight=this.collectOnce().finally(()=>{this.inflight=null;});return this.inflight;
  }
  async collectOnce() {
    if(!this.sockets().length)return;
    try {
      // as duas leituras juntas; a direta vem primeiro, então ganha quando a mesma manchete chega pelas duas
      const [fonte,rapidas]=await Promise.allSettled([this.readSource(),this.readFast()]);
      const lista=[...(rapidas.status==='fulfilled'?rapidas.value:[]),...(fonte.status==='fulfilled'?fonte.value:[])];
      if(fonte.status!=='fulfilled'&&!lista.length)throw Error('Fonte indisponível');
      // sem o servidor de notícias, mantém as que já estavam e soma as novas da leitura direta
      const items=cleanNews(fonte.status==='fulfilled'?lista:[...lista,...this.items]),now=Date.now();
      const before=new Map(this.items.map(n=>[n.link,JSON.stringify(n)]));
      const delta=items.filter(n=>before.get(n.link)!==JSON.stringify(n));
      const payload=JSON.stringify(items);
      if(payload!==JSON.stringify(this.items))this.ctx.storage.sql.exec('INSERT INTO news_snapshot(id,payload,checked) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,checked=excluded.checked',payload,now);
      else this.ctx.storage.sql.exec('UPDATE news_snapshot SET checked=? WHERE id=1',now);
      this.items=items;this.checked=now;
      for(const ws of this.sockets()) {
        const a=ws.deserializeAttachment();
        if(a?.snapshot){this.send(ws,{type:'snapshot',items,at:now});a.snapshot=false;ws.serializeAttachment(a);}
        else if(delta.length)this.send(ws,{type:'delta',items:delta,at:now});
        else this.send(ws,{type:'status',ok:true,at:now});
      }
    }catch{for(const ws of this.sockets())this.send(ws,{type:'status',ok:false,at:Date.now()});}
  }
  async validateSessions() {
    const due=this.sockets().filter(ws=>!ws.deserializeAttachment()?.validated||Date.now()-ws.deserializeAttachment().validated>=60000);
    const tokens=[...new Set(due.map(ws=>ws.deserializeAttachment()?.token).filter(Boolean))],valid=new Set();
    for(let i=0;i<tokens.length;i+=50){
      const batch=tokens.slice(i,i+50);
      const r=await this.env.DB.prepare(`SELECT s.token FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token IN (${batch.map(()=>'?').join(',')}) AND s.expira>? AND u.status='ativo' AND (u.admin=1 OR u.expira IS NULL OR u.expira>?)`).bind(...batch,Date.now(),new Date().toISOString()).all();
      for(const row of r.results)valid.add(row.token);
    }
    for(const ws of due){const a=ws.deserializeAttachment();if(!a||!valid.has(a.token)){ws.close(4001,'Sessão encerrada');}else{a.validated=Date.now();ws.serializeAttachment(a);}}
  }
  async alarm() {
    const started=Date.now();if(!this.sockets().length){await this.ctx.storage.deleteAlarm();return;}
    try{await this.validateSessions();await this.collect();}
    catch{for(const ws of this.sockets())try{ws.close(1011,'Não foi possível conferir a sessão');}catch{}}
    finally{await this.schedule(Math.max(Date.now()+1000,started+PERIOD));}
  }
  async webSocketClose(ws,code){try{ws.close(code===1005?1000:code);}catch{}await this.schedule();}
  async webSocketError(ws){try{ws.close(1011,'Conexão interrompida');}catch{}await this.schedule();}
  webSocketMessage(ws){ws.close(1008,'Mensagem não permitida');}
}
