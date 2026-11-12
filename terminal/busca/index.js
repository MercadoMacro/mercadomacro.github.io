// Busca inteligente da Jade (worker "mercadomacro-busca", 11/11/2026). AI Search da Cloudflare, com armazenamento próprio.
// Fica separado do site porque o AI Search exige compatibility_date 2026-03-27 ou mais nova, e trocar a data do
// site inteiro mudaria o comportamento de outras partes. Não tem endereço público: só o site (station) chama,
// pelo service binding BUSCA.
// Dois índices: mm-aulas (as lições da aba Educação, de aulas.json) e mm-noticias (um arquivo por dia com as
// manchetes guardadas pelo site na tabela noticias_hist do D1).
// Cobrança do AI Search começa em 1º/12/2026. Incluído por mês: 5 milhões de tokens de indexação, 10 GB e
// 1.000 buscas semânticas; depois US$ 0,75 por mil buscas. O limite de buscas por mês fica no site (config busca_limite).
import AULAS from './aulas.json';

const AULAS_ID = 'mm-aulas', NOTICIAS_ID = 'mm-noticias';

async function indice(env, id) {
  const h = env.AI_SEARCH.get(id);
  try { await h.info(); return h; } catch (e) { /* ainda não existe */ }
  try { return await env.AI_SEARCH.create({ id }); }
  catch (e) { const h2 = env.AI_SEARCH.get(id); await h2.info(); return h2; } // criado por outra chamada ao mesmo tempo
}

async function tabela(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS busca_itens (chave TEXT PRIMARY KEY, item_key TEXT, item_id TEXT, hash TEXT, quando INTEGER)').run();
}

// sobe só as aulas novas ou alteradas (o AI Search recusa repetir o nome: a versão nova ganha o hash no nome e a velha é apagada)
async function sincronizarAulas(env) {
  await tabela(env);
  const idx = await indice(env, AULAS_ID);
  const salvas = Object.fromEntries((await env.DB.prepare("SELECT chave, item_key, item_id, hash FROM busca_itens WHERE chave LIKE 'aula:%'").all()).results.map((r) => [r.chave, r]));
  let enviadas = 0, apagadas = 0, erros = 0;
  for (const a of AULAS) {
    const chave = 'aula:' + a.id, antes = salvas[chave];
    if (antes && antes.hash === a.hash) continue;
    const key = `aulas/${a.id}-${a.hash}.md`;
    try {
      const item = await idx.items.upload(key, a.texto);
      if (antes?.item_id) { await idx.items.delete(antes.item_id).catch(() => {}); apagadas++; }
      await env.DB.prepare('INSERT OR REPLACE INTO busca_itens (chave, item_key, item_id, hash, quando) VALUES (?, ?, ?, ?, ?)').bind(chave, key, item?.id || '', a.hash, Date.now()).run();
      enviadas++;
    } catch (e) {
      if (/already_exist|7042|409/.test(String(e.message))) {
        await env.DB.prepare('INSERT OR REPLACE INTO busca_itens (chave, item_key, item_id, hash, quando) VALUES (?, ?, ?, ?, ?)').bind(chave, key, '', a.hash, Date.now()).run();
      } else { erros++; console.error('aula', a.id, e.message); }
    }
  }
  // aula que saiu do site sai da busca
  const ativas = new Set(AULAS.map((a) => 'aula:' + a.id));
  for (const [chave, r] of Object.entries(salvas)) {
    if (ativas.has(chave)) continue;
    if (r.item_id) await idx.items.delete(r.item_id).catch(() => {});
    await env.DB.prepare('DELETE FROM busca_itens WHERE chave = ?').bind(chave).run();
    apagadas++;
  }
  if (enviadas || apagadas || erros) console.log(`aulas: ${enviadas} enviadas, ${apagadas} apagadas, ${erros} com erro, ${AULAS.length} no total`);
  return { enviadas, apagadas, erros, total: AULAS.length };
}

// um arquivo por dia de Brasília com as manchetes guardadas; o dia só é enviado depois que acaba (uma vez)
const diaBR = (ms) => new Date(ms - 3 * 3600000).toISOString().slice(0, 10);
async function enviarNoticias(env, dia) {
  await tabela(env);
  const chave = 'noticias:' + dia;
  if (await env.DB.prepare('SELECT 1 FROM busca_itens WHERE chave = ?').bind(chave).first()) return { dia, pulado: 'já enviado' };
  const r = await env.DB.prepare('SELECT titulo, fonte, link, data, resumo FROM noticias_hist WHERE dia = ? ORDER BY data').bind(dia).all().catch(() => ({ results: [] }));
  const ns = r.results || [];
  if (!ns.length) return { dia, pulado: 'sem notícias guardadas' };
  const hora = (ms) => new Date(ms - 3 * 3600000).toISOString().slice(11, 16);
  const texto = [`# Notícias do mercado em ${dia.split('-').reverse().join('/')}`, `Manchetes guardadas pelo terminal Mercado Macro nesse dia (${ns.length}), em ordem de horário (Brasília).`,
    ...ns.map((n) => `- ${hora(n.data)} | ${n.fonte}: ${n.titulo}${n.resumo ? ' — ' + String(n.resumo).slice(0, 300) : ''} (${n.link})`)].join('\n');
  const idx = await indice(env, NOTICIAS_ID);
  const key = `noticias/${dia}.md`;
  let item = null;
  try { item = await idx.items.upload(key, texto); }
  catch (e) { if (!/already_exist|7042|409/.test(String(e.message))) throw e; }
  await env.DB.prepare('INSERT OR REPLACE INTO busca_itens (chave, item_key, item_id, hash, quando) VALUES (?, ?, ?, ?, ?)').bind(chave, key, item?.id || '', String(ns.length), Date.now()).run();
  console.log(`notícias de ${dia}: ${ns.length} manchetes enviadas`);
  return { dia, manchetes: ns.length };
}

async function buscar(env, b) {
  const q = String(b.q || '').slice(0, 500).trim();
  if (!q) return { erro: 'pergunta vazia' };
  const max = Math.min(Math.max(Number(b.max) || 5, 1), 8);
  const ids = b.onde === 'aulas' ? [AULAS_ID] : b.onde === 'noticias' ? [NOTICIAS_ID] : [AULAS_ID, NOTICIAS_ID];
  const res = await Promise.all(ids.map(async (id) => {
    try {
      const r = await env.AI_SEARCH.get(id).search({ messages: [{ role: 'user', content: q }], ai_search_options: { retrieval: { max_num_results: max } } });
      return (r.chunks || []).map((c) => ({ indice: id === AULAS_ID ? 'aulas' : 'noticias', arquivo: c.item?.key || '', nota: Math.round((c.score ?? c.scoring_details?.vector_score ?? 0) * 100) / 100, texto: String(c.text || '').slice(0, 1500) }));
    } catch (e) { console.error('busca em', id, e.message); return []; }
  }));
  return { trechos: res.flat().sort((a, b) => b.nota - a.nota).slice(0, max), buscas: ids.length };
}

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });

export default {
  async fetch(req, env) {
    const p = new URL(req.url).pathname;
    try {
      if (p === '/buscar' && req.method === 'POST') return json(await buscar(env, await req.json().catch(() => ({}))));
      if (p === '/sincronizar' && req.method === 'POST') {
        const ontem = diaBR(Date.now() - 86400000);
        return json({ aulas: await sincronizarAulas(env), noticias: await enviarNoticias(env, ontem) });
      }
      if (p === '/situacao') {
        const out = {};
        for (const id of [AULAS_ID, NOTICIAS_ID]) { try { out[id] = await env.AI_SEARCH.get(id).stats(); } catch (e) { out[id] = { erro: e.message }; } }
        return json(out);
      }
      return json({ erro: 'rota desconhecida' }, 404);
    } catch (e) { console.error('busca:', e.message); return json({ erro: e.message }, 500); }
  },
  // 03:05 UTC (00:05 em Brasília): manda as manchetes do dia que acabou e confere se alguma aula mudou
  async scheduled(ev, env, ctx) {
    const ontem = diaBR(ev.scheduledTime - 3600000);
    ctx.waitUntil(enviarNoticias(env, ontem).catch((e) => console.error('notícias:', e.message)));
    ctx.waitUntil(sincronizarAulas(env).catch((e) => console.error('aulas:', e.message)));
  },
};
