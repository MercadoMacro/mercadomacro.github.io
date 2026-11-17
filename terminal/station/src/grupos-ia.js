/* Assuntos do dia (16/11/2026, pedido do Dante): a mesma notícia contada por várias fontes vira um assunto só,
   e os assuntos mais noticiados ganham uma linha "Por que importa".
   1) Cada manchete vira uma "impressão digital" de sentido (embedding, modelo bge-m3, que entende inglês e português
      juntos). É calculada uma vez por notícia e guardada (tabela noticia_grupo, 3 dias).
   2) Notícia nova com sentido muito parecido com outra das últimas 12 horas entra no mesmo grupo.
   3) Grupo com 2 fontes ou mais ganha uma frase curta da IA explicando por que importa (tabela grupo_porque),
      uma vez por grupo, e todo assinante recebe pronta.
   Tudo dentro do mesmo limite diário de neurônios da tradução (src/traducao-ia.js). Custo típico: < 100 neurônios/dia. */
import { usoHoje, somarUso, LIMITE_DIA, MODELOS, FONTES_BR } from './traducao-ia.js';

const MODELO_VET = '@cf/baai/bge-m3';
const NEUR_VET = 1075; // neurônios por milhão de pedaços de texto
export const LIMIAR_PADRAO = 0.8; // parecido a partir daqui = mesmo assunto (ajustável em config: grupo_limiar)
const JANELA = 12 * 3600 * 1000;
const MIN_FONTES = 2; // 17/11/2026: era 3, e quase nenhum assunto ganhava a frase
const POR_DIA = 80; // no máximo 80 frases "por que importa" por dia
const pedacos = (t) => Math.ceil(String(t || '').length / 4);
let trabalhando = false;

export async function tabelasGrupos(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS noticia_grupo (id TEXT PRIMARY KEY, grupo TEXT NOT NULL, data INTEGER NOT NULL, fonte TEXT, titulo TEXT, v BLOB NOT NULL, ts INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS noticia_grupo_data ON noticia_grupo (data)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS grupo_porque (grupo TEXT PRIMARY KEY, texto TEXT NOT NULL, ts INTEGER NOT NULL)'),
  ]);
}

// vetor normalizado guardado em 1 byte por número (-127..127): 1 KB por notícia em vez de 4 KB
const paraBytes = (v) => { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; return Int8Array.from(v, (x) => Math.max(-127, Math.min(127, Math.round((x / s) * 127)))); };
const deBytes = (b) => new Int8Array(b instanceof ArrayBuffer ? b : new Uint8Array(b).buffer);
function similar(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s / (127 * 127); }

async function limiar(env) {
  const r = await env.DB.prepare("SELECT valor FROM config WHERE chave = 'grupo_limiar'").first().catch(() => null);
  const x = Number(r && r.valor);
  return x > 0.5 && x < 0.99 ? x : LIMIAR_PADRAO;
}
const textoDe = (n) => String(n.tituloPt || n.titulo || '').replace(/^FinancialJuice:\s*/i, '').trim().slice(0, 300);

// põe grupo e "por que importa" na lista; o que falta é calculado em segundo plano
export async function aplicarGrupos(env, ctx, lista) {
  if (!env?.DB || !Array.isArray(lista)) return;
  const itens = lista.filter((n) => n && n.id && n.titulo);
  if (!itens.length) return;
  try {
    await tabelasGrupos(env);
    const ids = [...new Set(itens.map((n) => n.id))], grupo = new Map();
    for (let i = 0; i < ids.length; i += 90) {
      const parte = ids.slice(i, i + 90);
      const r = await env.DB.prepare(`SELECT id, grupo FROM noticia_grupo WHERE id IN (${parte.map(() => '?').join(',')})`).bind(...parte).all();
      (r.results || []).forEach((x) => grupo.set(x.id, x.grupo));
    }
    const faltam = [];
    for (const n of itens) { const g = grupo.get(n.id); if (g) n.grupo = g; else faltam.push(n); }
    // frases prontas dos grupos presentes
    const gs = [...new Set(itens.map((n) => n.grupo).filter(Boolean))], porque = new Map();
    for (let i = 0; i < gs.length; i += 90) {
      const parte = gs.slice(i, i + 90);
      const r = await env.DB.prepare(`SELECT grupo, texto FROM grupo_porque WHERE grupo IN (${parte.map(() => '?').join(',')})`).bind(...parte).all();
      (r.results || []).forEach((x) => porque.set(x.grupo, x.texto));
    }
    for (const n of itens) if (n.grupo && porque.has(n.grupo)) n.porque = porque.get(n.grupo);
    if (env.AI && !trabalhando) {
      trabalhando = true;
      const job = trabalhar(env, faltam, itens, porque).catch((e) => console.error('grupos:', e.message)).finally(() => { trabalhando = false; });
      if (ctx?.waitUntil) ctx.waitUntil(job); else await job;
    }
  } catch (e) { /* sem grupos do servidor: o aparelho agrupa pelas palavras, como antes */ }
}

async function trabalhar(env, faltam, itens, porqueFeito) {
  if ((await usoHoje(env)).neuronios >= LIMITE_DIA) return;
  if (faltam.length) await agrupar(env, faltam.sort((a, b) => (a.data || 0) - (b.data || 0)).slice(-90));
  await explicar(env, itens, porqueFeito);
}

async function agrupar(env, novos) {
  const textos = novos.map(textoDe);
  const vets = [];
  for (let i = 0; i < textos.length; i += 30) {
    const r = await env.AI.run(MODELO_VET, { text: textos.slice(i, i + 30) });
    (r && r.data || []).forEach((v) => vets.push(paraBytes(v)));
  }
  if (vets.length !== novos.length) throw new Error('vetores desalinhados');
  await somarUso(env, textos.reduce((s, t) => s + pedacos(t), 0) * NEUR_VET / 1e6, 0);
  const lim = await limiar(env);
  const desde = Math.min(...novos.map((n) => n.data || Date.now())) - JANELA;
  const r = await env.DB.prepare('SELECT id, grupo, data, v FROM noticia_grupo WHERE data >= ? ORDER BY data DESC LIMIT 1500').bind(desde).all();
  const base = (r.results || []).map((x) => ({ id: x.id, grupo: x.grupo, data: x.data, v: deBytes(x.v) }));
  const agora = Date.now(), st = [];
  novos.forEach((n, k) => {
    const v = vets[k], d = n.data || agora;
    let melhor = null, ms = lim;
    for (const b of base) {
      if (Math.abs(b.data - d) > JANELA) continue;
      const s = similar(v, b.v);
      if (s >= ms) { ms = s; melhor = b; }
    }
    const g = melhor ? melhor.grupo : n.id;
    n.grupo = g;
    base.push({ id: n.id, grupo: g, data: d, v });
    st.push(env.DB.prepare('INSERT OR REPLACE INTO noticia_grupo (id, grupo, data, fonte, titulo, v, ts) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(n.id, g, d, String(n.fonte || '').slice(0, 60), textos[k].slice(0, 160), new Uint8Array(v.buffer), agora));
  });
  for (let i = 0; i < st.length; i += 50) await env.DB.batch(st.slice(i, i + 50));
}

// grupos com 2 fontes ou mais, sem frase ainda: até 6 por vez, no máximo POR_DIA por dia
async function explicar(env, itens, feito) {
  const porGrupo = new Map();
  for (const n of itens) if (n.grupo) { if (!porGrupo.has(n.grupo)) porGrupo.set(n.grupo, []); porGrupo.get(n.grupo).push(n); }
  const candidatos = [...porGrupo.entries()]
    .filter(([g, ns]) => !feito.has(g) && new Set(ns.map((n) => n.fonte)).size >= MIN_FONTES)
    .sort((a, b) => b[1].length - a[1].length).slice(0, 6);
  if (!candidatos.length) return;
  const hoje = Date.now() - 864e5;
  const r = await env.DB.prepare('SELECT COUNT(*) n FROM grupo_porque WHERE ts > ?').bind(hoje).first();
  let resta = POR_DIA - (r ? r.n : 0);
  const M = MODELOS.llama;
  for (const [g, ns] of candidatos) {
    if (resta-- <= 0) return;
    if ((await usoHoje(env)).neuronios >= LIMITE_DIA) return;
    // manchetes em português primeiro (as do Brasil e as já traduzidas)
    const tit = ns.slice().sort((a, b) => (FONTES_BR.has(b.fonte) ? 1 : 0) - (FONTES_BR.has(a.fonte) ? 1 : 0)).map(textoDe).filter(Boolean).slice(0, 6);
    const sistema = 'Você é um analista do mercado financeiro brasileiro. Recebe manchetes sobre o MESMO fato e responde, em português do Brasil, '
      + 'UMA frase curta (no máximo 22 palavras) explicando por que isso importa para quem investe no Brasil: efeito provável em juros, dólar, '
      + 'bolsa, inflação ou setores. Não repita a manchete, não invente números nem fatos, não use "pode ser que". Sem aspas, sem ponto de exclamação.';
    const usuario = tit.map((t, i) => `${i + 1}. ${t}`).join('\n');
    const out = await env.AI.run(M.id, { messages: [{ role: 'system', content: sistema }, { role: 'user', content: usuario }], max_tokens: 90, temperature: 0.2 });
    let texto = String(out && (out.response ?? out.result?.response) || '').replace(/\s+/g, ' ').trim().replace(/^["'“]|["'”]$/g, '');
    await somarUso(env, ((pedacos(sistema) + pedacos(usuario)) * M.ent + pedacos(texto) * M.sai) / 1e6, 0);
    if (texto.length < 20) continue;
    if (texto.length > 220) texto = texto.slice(0, 217).replace(/\s+\S*$/, '') + '…';
    await env.DB.prepare('INSERT OR REPLACE INTO grupo_porque (grupo, texto, ts) VALUES (?, ?, ?)').bind(g, texto, Date.now()).run();
    ns.forEach((n) => { n.porque = texto; });
  }
}

export async function limparGrupos(env) {
  await tabelasGrupos(env);
  await env.DB.prepare('DELETE FROM noticia_grupo WHERE ts < ?').bind(Date.now() - 3 * 864e5).run();
  await env.DB.prepare('DELETE FROM grupo_porque WHERE ts < ?').bind(Date.now() - 3 * 864e5).run();
}

// admin: como os assuntos das últimas N horas ficariam com outro limiar (não grava nada)
export async function testeGrupos(env, lim = LIMIAR_PADRAO, horas = 12) {
  await tabelasGrupos(env);
  const r = await env.DB.prepare('SELECT id, data, fonte, titulo, v FROM noticia_grupo WHERE data >= ? ORDER BY data').bind(Date.now() - horas * 3600e3).all().catch(() => ({ results: [] }));
  const itens = (r.results || []).map((x) => ({ ...x, v: deBytes(x.v) }));
  const grupos = [];
  for (const n of itens) {
    let melhor = null, ms = lim;
    for (const g of grupos) for (const m of g) { if (Math.abs(m.data - n.data) > JANELA) continue; const s = similar(n.v, m.v); if (s >= ms) { ms = s; melhor = g; } }
    if (melhor) melhor.push({ ...n, s: ms }); else grupos.push([{ ...n, s: 1 }]);
  }
  const multi = grupos.filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
  return { limiar: lim, noticias: itens.length, assuntos: grupos.length, juntados: multi.length,
    exemplos: multi.slice(0, 25).map((g) => g.map((n) => `${n.fonte} (${n.s.toFixed(2)}): ${String(n.titulo || n.id).slice(0, 100)}`)) };
}
