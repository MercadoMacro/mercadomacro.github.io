// O caminho de origem é fixo; a pesquisa não aceita URLs ou outros destinos.
const cache = new Map(), pending = new Map();
const TTL = 3600000, MAX = 200;
const TYPES = new Set(['EQUITY','ETF']);
export function limparResultados(payload) {
  const seen = new Set();
  return (Array.isArray(payload?.quotes) ? payload.quotes : []).filter(x => {
    if (!x || x.isYahooFinance !== true || !TYPES.has(x.quoteType) || typeof x.symbol !== 'string' || !/^[A-Z0-9][A-Z0-9.^=_-]{0,23}$/.test(x.symbol) || seen.has(x.symbol)) return false;
    seen.add(x.symbol); return true;
  }).slice(0,8).map(x => {
    const br=x.symbol.endsWith('.SA'), exchange=String(x.exchDisp || x.exchange || '').slice(0,60);
    const currency=br?'BRL':['NMS','NGM','NCM','NYQ','ASE','PCX','BTS'].includes(x.exchange)?'USD':'';
    const name=String(x.longname || x.shortname || x.symbol).slice(0,140);
    // Códigos 32 a 35 identificam os BDRs de ações na B3.
    const type=x.quoteType==='ETF'?'ETF':br&&/^[A-Z]{4}3[2345]\.SA$/.test(x.symbol)?'BDR':'Ação';
    return {symbol:x.symbol,name,exchange,currency,type,market:[exchange,type,currency].filter(Boolean).join(' · ')};
  });
}
async function consultar(q) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(),4500);
  try {
    const url = new URL('https://query1.finance.yahoo.com/v1/finance/search');
    url.searchParams.set('q',q);url.searchParams.set('quotesCount','12');url.searchParams.set('newsCount','0');url.searchParams.set('enableFuzzyQuery','false');
    const r=await fetch(url,{signal:controller.signal,headers:{'User-Agent':'Mozilla/5.0','Accept':'application/json'}});
    if(!r.ok)throw Error('Fonte indisponível');
    const j=await r.json();if(!Array.isArray(j?.quotes))throw Error('Resposta inválida');
    const results=limparResultados(j);
    if(cache.size>=MAX)cache.delete(cache.keys().next().value);
    cache.set(q,{until:Date.now()+TTL,results});return results;
  }finally{clearTimeout(timer);}
}
export async function buscarAtivos(req) {
  const answer=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});
  if(req.method!=='GET')return answer({erro:'Método não permitido.'},405);
  const q=(new URL(req.url).searchParams.get('q')||'').normalize('NFC').trim().replace(/\s+/g,' ');
  if(q.length<2||q.length>64||/[\u0000-\u001f<>]/.test(q))return answer({erro:'Digite entre 2 e 64 caracteres.'},400);
  const key=q.toLowerCase(), saved=cache.get(key);
  if(saved&&saved.until>Date.now())return answer({results:saved.results});
  try {
    if(!pending.has(key))pending.set(key,consultar(key).finally(()=>pending.delete(key)));
    return answer({results:await pending.get(key)});
  }catch{return answer({erro:'Busca complementar indisponível. As sugestões locais continuam disponíveis.'},503);}
}
