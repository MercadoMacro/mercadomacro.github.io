/* Cotações cripto por conexão pública de mercado, sem conta, chave ou ordens. */
globalThis.MMCryptoLive = (() => {
  const PAIRS=Object.freeze({'BTC-USD':'BTCUSDT','ETH-USD':'ETHUSDT','BNB-USD':'BNBUSDT','XRP-USD':'XRPUSDT','SOL-USD':'SOLUSDT','DOGE-USD':'DOGEUSDT','USDC-USD':'USDCUSDT','ADA-USD':'ADAUSDT'});
  const hostAllowed=host=>['mercadomacro.com.br','www.mercadomacro.com.br','localhost','127.0.0.1','[::1]','::1'].includes(host);
  const number=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))?Number(v):null;
  function parse(message,now=Date.now()){
    const data=message?.data||message;if(data?.e!=='24hrTicker')return null;
    const symbol=Object.keys(PAIRS).find(k=>PAIRS[k]===data.s);if(!symbol)return null;
    if(message.stream&&message.stream!==data.s.toLowerCase()+'@ticker')return null;
    const value=number(data.c),change=number(data.P),ts=data.E;
    if(value==null||value<=0||change==null||!Number.isSafeInteger(ts)||ts<=0||now-ts>15000||ts-now>5000)return null;
    return {symbol,pair:data.s,value,change,ts,currency:'USDT',source:'Binance',window:'24h'};
  }
  class Client{
    constructor({enabled=false,onChange=()=>{},Socket=globalThis.WebSocket,clock,random=Math.random}={}){
      this.enabled=enabled;this.onChange=onChange;this.Socket=Socket;this.random=random;
      this.clock=clock||{now:()=>Date.now(),setTimeout:(f,t)=>setTimeout(f,t),clearTimeout:t=>clearTimeout(t),setInterval:(f,t)=>setInterval(f,t),clearInterval:t=>clearInterval(t)};
      this.active=false;this.socket=null;this.quotes=new Map();this.status=enabled?'paused':'disabled';this.token=0;this.attempt=0;this.retry=null;this.connectTimer=null;this.monitor=null;this.lastMessage=0;
    }
    state(){return {status:this.status,count:[...this.quotes.keys()].filter(s=>this.quote(s)).length};}
    emit(event={type:'state'}){this.onChange({...event,state:this.state()});}
    quote(symbol){
      const q=this.quotes.get(symbol),now=this.clock.now();
      return this.active&&q&&now-q.received<=15000&&now-q.ts<=15000?{...q}:null;
    }
    setActive(value){
      value=!!value&&this.enabled;if(value===this.active)return;
      this.active=value;
      if(!value){this.disconnect();this.clock.clearInterval(this.monitor);this.monitor=null;this.quotes.clear();this.status=this.enabled?'paused':'disabled';this.emit();return;}
      this.monitor=this.clock.setInterval(()=>this.inspect(),1000);this.connect();
    }
    disconnect(){
      this.token++;this.clock.clearTimeout(this.retry);this.clock.clearTimeout(this.connectTimer);this.retry=this.connectTimer=null;
      const old=this.socket;this.socket=null;
      if(old){old.onopen=old.onmessage=old.onclose=old.onerror=null;try{old.close();}catch{}}
    }
    reconnect(){
      if(!this.active)return;
      this.disconnect();this.quotes.clear();this.status='reconnecting';this.emit();
      const wait=Math.min(30000,1000*2**Math.min(this.attempt++,5))+Math.floor(this.random()*250);
      this.retry=this.clock.setTimeout(()=>{this.retry=null;this.connect();},wait);
    }
    connect(){
      if(!this.active||this.socket)return;
      this.status='connecting';this.emit();const token=++this.token;
      let socket;
      try{
        const streams=Object.values(PAIRS).map(s=>s.toLowerCase()+'@ticker').join('/');
        socket=new this.Socket('wss://data-stream.binance.vision/stream?streams='+streams);this.socket=socket;
      }catch{this.reconnect();return;}
      const current=()=>this.active&&this.socket===socket&&token===this.token;
      this.connectTimer=this.clock.setTimeout(()=>{if(current())this.reconnect();},8000);
      socket.onopen=()=>{if(!current())return;this.clock.clearTimeout(this.connectTimer);this.connectTimer=null;this.lastMessage=this.clock.now();this.status='waiting';this.emit();};
      socket.onmessage=event=>{
        if(!current()||typeof event.data!=='string'||event.data.length>12000)return;
        let message;try{message=JSON.parse(event.data);}catch{return;}
        if((message?.data||message)?.e==='serverShutdown'){this.reconnect();return;}
        const q=parse(message,this.clock.now());if(!q)return;
        const previous=this.quote(q.symbol);if(previous&&q.ts<previous.ts)return;
        q.received=this.clock.now();q.direction=previous?Math.sign(q.value-previous.value):0;
        this.quotes.set(q.symbol,q);this.lastMessage=this.clock.now();this.attempt=0;this.status='live';this.emit({type:'quote',symbol:q.symbol,quote:{...q}});
      };
      socket.onerror=socket.onclose=()=>{if(current())this.reconnect();};
    }
    inspect(){
      if(!this.active)return;
      let expired=false;
      for(const [s]of this.quotes)if(!this.quote(s)){this.quotes.delete(s);expired=true;}
      if(this.socket&&this.status!=='connecting'&&this.clock.now()-this.lastMessage>15000){this.reconnect();return;}
      if(expired)this.emit({type:'stale'});
    }
    destroy(){this.setActive(false);this.disconnect();this.clock.clearInterval(this.monitor);}
  }
  return {PAIRS,hostAllowed,parse,Client};
})();
