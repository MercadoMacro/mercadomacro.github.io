/* Fonte oficial alternativa ao SGS, usada pela calculadora pública.
   Apenas consulta pública: não recebe URLs, datas ou outros destinos do visitante. */
const DIA = 86400000;
const FONTE = 'Banco Central — Selic apurada';
const ENDPOINT = 'https://www3.bcb.gov.br/novoselic/rest/taxaSelicApurada/pub/search?page=1&pageSize=30';

function diaBrasilia(agora) {
  return Date.parse(new Date(agora - 3 * 3600000).toISOString().slice(0, 10) + 'T00:00:00Z');
}
function dataBR(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || ''));
  if (!m) return NaN;
  const t = Date.UTC(+m[3], +m[2] - 1, +m[1]);
  return new Date(t).toISOString().slice(0, 10) === `${m[3]}-${m[2]}-${m[1]}` ? t : NaN;
}
const br = t => new Date(t).toISOString().slice(0, 10).split('-').reverse().join('/');

export function selecionarSelic(j, agora = Date.now()) {
  const hoje = diaBrasilia(agora);
  if (!j || !Array.isArray(j.registros)) throw new Error('Formato da Selic apurada inválido');
  const registros = j.registros.filter(r => {
    if (!r || typeof r !== 'object') return false;
    const d = dataBR(r.dataCotacao);
    // A API inclui a próxima data útil com zero operações nos fins de semana.
    return Number.isFinite(d) && d <= hoje && d >= hoje - 14 * DIA
      && Number.isFinite(r.taxaAnual) && r.taxaAnual >= 0
      && Number.isFinite(r.qtdOperacoes) && r.qtdOperacoes > 0;
  }).sort((a,b) => dataBR(b.dataCotacao) - dataBR(a.dataCotacao));
  if (!registros.length) throw new Error('Nenhuma Selic apurada recente');
  const r = registros[0];
  return { valor:r.taxaAnual, data:r.dataCotacao, fonte:FONTE, origem:'https://www.bcb.gov.br/estabilidadefinanceira/selicdadosdiarios' };
}

function resposta(j, status = 200, reserva = false) {
  return new Response(JSON.stringify({...j, reserva}), {status, headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store',
    'X-Content-Type-Options':'nosniff'
  }});
}
function recente(j, agora) {
  const d = dataBR(j?.data);
  const hoje = diaBrasilia(agora);
  return Number.isFinite(j?.valor) && j.valor >= 0 && Number.isFinite(d) && d <= hoje && d >= hoje - 14 * DIA;
}
export async function respostaSelic(req, ctx) {
  if (req.method !== 'GET') return new Response(null,{status:405,headers:{Allow:'GET'}});
  const agora = Date.now();
  const cache = caches.default;
  const key = new Request(new URL('/api/publico/selic',req.url));
  const reservaKey = new Request(new URL('/api/publico/selic/reserva-interna',req.url));
  try {
    const hit = await cache.match(key);
    if (hit) { const j = await hit.json(); if (recente(j,agora)) return resposta(j); }
  } catch (_) { /* cache indisponível não impede a consulta */ }
  try {
    const hoje = diaBrasilia(agora);
    const r = await fetch(ENDPOINT, {
      method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({dataInicial:br(hoje - 21 * DIA),dataFinal:br(hoje)}),
      signal:AbortSignal.timeout(7000)
    });
    if (!r.ok) throw new Error('Fonte Selic indisponível');
    const j = {...selecionarSelic(await r.json(),agora), consultado:new Date(agora).toISOString()};
    // Cache curto para uso normal e última observação válida para falhas da fonte.
    ctx.waitUntil(Promise.all([
      cache.put(key,new Response(JSON.stringify(j),{headers:{'Cache-Control':'public, max-age=1800'}})),
      cache.put(reservaKey,new Response(JSON.stringify(j),{headers:{'Cache-Control':'public, max-age=1209600'}}))
    ]).catch(() => {}));
    return resposta(j);
  } catch (_) {
    try {
      const hit = await cache.match(reservaKey);
      if (hit) { const j = await hit.json(); if (recente(j,agora)) return resposta(j,200,true); }
    } catch (_) { /* sem reserva válida */ }
    return resposta({erro:'Selic efetiva indisponível no momento.'},503);
  }
}
