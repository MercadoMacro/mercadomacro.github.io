// Transporte do Ao vivo: WebSocket autenticado, recuperação por snapshot e reserva HTTP.
globalThis.MMNewsStream=(()=>{
 class Client {
  constructor({url,Socket=globalThis.WebSocket,clock,onData=()=>{},onState=()=>{},onAuth=()=>{},random=Math.random}={}){
   this.url=url;this.Socket=Socket;this.clock=clock||{now:()=>Date.now(),setTimeout:(f,t)=>setTimeout(f,t),clearTimeout:t=>clearTimeout(t)};
   this.onData=onData;this.onState=onState;this.onAuth=onAuth;this.random=random;this.active=false;this.socket=null;this.retry=null;this.timer=null;this.generation=0;this.attempt=0;this.lastGood=0;this.lastMessage=0;this.status='paused';this.denied=false;
  }
  healthy(){return this.active&&this.status==='live'&&this.clock.now()-this.lastGood<45000;}
  state(status){this.status=status;this.onState(status);}
  setActive(value){if(this.denied)value=false;if(value===this.active)return;this.active=value;if(value)this.connect();else{this.stop();this.state('paused');}}
  stop(){this.generation++;this.clock.clearTimeout(this.retry);this.clock.clearTimeout(this.timer);this.retry=this.timer=null;const ws=this.socket;this.socket=null;if(ws)try{ws.close(1000,'Pausado');}catch{}}
  connect(){
   if(!this.active)return;
   const gen=++this.generation;this.state('connecting');let ws;
   const fail=()=>{if(gen!==this.generation)return;this.stop();if(!this.active)return;this.state('fallback');this.retry=this.clock.setTimeout(()=>this.connect(),Math.min(30000,1000*2**Math.min(this.attempt++,5))+Math.floor(this.random()*500));};
   try{ws=new this.Socket(this.url);this.socket=ws;}catch{fail();return;}
   this.lastMessage=this.clock.now();
   const monitor=()=>{
    if(gen!==this.generation||!this.active)return;
    if(this.clock.now()-this.lastMessage>=45000){fail();return;}
    if(this.status==='live'&&this.clock.now()-this.lastGood>=45000)this.state('fallback');
    if(ws.readyState===1)try{ws.send('ping');}catch{fail();return;}
    this.timer=this.clock.setTimeout(monitor,10000);
   };
   this.timer=this.clock.setTimeout(monitor,10000);
   ws.onopen=()=>{if(gen!==this.generation)return;this.lastMessage=this.clock.now();};
   ws.onmessage=e=>{
    if(gen!==this.generation||!this.active)return;
    if(e.data==='pong'){this.lastMessage=this.clock.now();return;}
    let m;try{m=JSON.parse(e.data);}catch{return;}
    if(!m||!Number.isFinite(m.at)||this.clock.now()-m.at>45000||m.at>this.clock.now()+600000)return;
    if(m.type==='snapshot'||m.type==='delta'){
     if(!Array.isArray(m.items)||m.items.length>250||m.items.some(n=>!n||typeof n.titulo!=='string'||typeof n.link!=='string'||!Number.isFinite(n.data)||typeof n.nivel!=='string'))return;
     try{this.onData(m.items,m.type);}catch{this.state('fallback');return;}
    }else if(m.type!=='status')return;
    this.lastMessage=this.clock.now();
    if(m.type==='status'&&!m.ok){this.state('fallback');return;}
    this.lastGood=this.clock.now();this.attempt=0;this.state('live');
   };
   ws.onerror=fail;
   ws.onclose=e=>{if(gen!==this.generation)return;if(e.code===4001){this.denied=true;this.active=false;this.stop();this.state('auth');this.onAuth();}else fail();};
  }
 }
 return {Client};
})();
