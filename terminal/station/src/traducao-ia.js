/* Tradução das notícias no servidor com a IA da Cloudflare (Workers AI), 16/11/2026, pedido do Dante.
   Cada notícia em inglês é traduzida UMA vez e guardada no banco (tabela traducao_ia); todo assinante recebe a lista
   já traduzida. Limitador: no máximo LIMITE_DIA neurônios por dia (a cota grátis do plano é 10.000); passou disso, o
   servidor para de traduzir até a meia-noite UTC e o aparelho de cada pessoa traduz como antes (Google).
   O gasto é estimado pelo tamanho do texto (a IA não devolve a conta): ~4 letras por pedaço de texto em inglês. */

export const LIMITE_DIA = 9000;
// modelos e quanto cada um gasta, em neurônios por milhão de pedaços de texto (tabela de preços da Cloudflare)
export const MODELOS = {
  m2m: { id: '@cf/meta/m2m100-1.2b', ent: 31050, sai: 31050 },
  llama: { id: '@cf/meta/llama-3.1-8b-instruct-fast', ent: 4119, sai: 34868 },
};
export const MODELO_PADRAO = 'llama';

const pedacos = (t) => Math.ceil(String(t || '').length / 4);
const hojeUTC = () => new Date().toISOString().slice(0, 10);

export async function tabelas(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS traducao_ia (id TEXT PRIMARY KEY, titulo TEXT, trecho TEXT, modelo TEXT, ts INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS ia_uso (dia TEXT PRIMARY KEY, neuronios INTEGER NOT NULL DEFAULT 0, itens INTEGER NOT NULL DEFAULT 0)'),
  ]);
}
export async function usoHoje(env) {
  const r = await env.DB.prepare('SELECT neuronios, itens FROM ia_uso WHERE dia = ?').bind(hojeUTC()).first().catch(() => null);
  return { neuronios: r ? r.neuronios : 0, itens: r ? r.itens : 0, limite: LIMITE_DIA };
}
async function somarUso(env, neuronios, itens) {
  await env.DB.prepare('INSERT INTO ia_uso (dia, neuronios, itens) VALUES (?, ?, ?) ON CONFLICT(dia) DO UPDATE SET neuronios = neuronios + excluded.neuronios, itens = itens + excluded.itens')
    .bind(hojeUTC(), Math.ceil(neuronios), itens).run();
}
const custo = (m, ent, sai) => (ent * MODELOS[m].ent + sai * MODELOS[m].sai) / 1e6;

// traduz uma lista de textos curtos (inglês -> português do Brasil). Devolve { textos, neuronios }
export async function traduzir(env, textos, modelo = MODELO_PADRAO) {
  const M = MODELOS[modelo];
  if (!env.AI || !M) throw new Error('IA indisponível');
  if (modelo === 'm2m') {
    const out = [];
    let n = 0;
    for (const t of textos) {
      if (!t) { out.push(''); continue; }
      const r = await env.AI.run(M.id, { text: t, source_lang: 'english', target_lang: 'portuguese' });
      const pt = String(r && r.translated_text || '').trim();
      out.push(pt);
      n += custo('m2m', pedacos(t), pedacos(pt));
    }
    return { textos: out, neuronios: n };
  }
  // modelo de conversa: uma chamada por lote, com as linhas numeradas para não embaralhar
  const linhas = textos.map((t, i) => `${i + 1}. ${String(t || '').replace(/\s+/g, ' ').trim()}`).join('\n');
  const sistema = 'Você traduz manchetes e trechos de notícias financeiras do inglês para o português do Brasil. '
    + 'Mantenha nomes de empresas, siglas, tickers e números como estão. Use o vocabulário do mercado financeiro brasileiro '
    + '(ex.: "yields" = rendimentos, "Treasuries" = títulos do Tesouro americano, "earnings" = resultados, "Fed" fica Fed). '
    + 'Glossário obrigatório: "minutes" (do Fed, do BCE, do Copom etc.) = ata; "bullish" = de alta / otimista ("bullish USD" = dólar em alta); "bearish" = de baixa / pessimista; '
    + '"rate cut" = corte de juros; "rate hike" = alta de juros; "hawkish" = mais duro (contra a inflação); "dovish" = mais brando; '
    + '"payrolls" ou "nonfarm payrolls" = payroll (vagas fora do setor agrícola); "jobless claims" = pedidos de seguro-desemprego; '
    + '"guidance" = projeção da empresa; "beats" / "misses" (estimates) = supera / fica abaixo das estimativas; "stocks" = ações; '
    + '"shares" = ações; "bonds" = títulos; "rally" = alta forte; "sell-off" = onda de vendas; "crude" = petróleo; "bps" = pontos-base; '
    + '"retail sales" = vendas no varejo; "lows" / "highs" = mínimas / máximas; "print" (de um indicador) = leitura ou dado; '
    + '"safe haven" ou "haven" = porto seguro; "hot" (inflação) = acima do esperado. '
    + 'Escreva sempre em português do Brasil, nunca de Portugal (varejo e não retalho; ações e não acções). '
    + 'Estilo de manchete: direto, sem acrescentar palavras, sem ponto final no fim. '
    + 'Responda só com as traduções, uma por linha, com o mesmo número na frente, sem comentários.';
  const r = await env.AI.run(M.id, { messages: [{ role: 'system', content: sistema }, { role: 'user', content: linhas }], max_tokens: Math.min(4000, 60 + pedacos(linhas) * 2), temperature: 0.1 });
  const resp = String(r && (r.response ?? r.result?.response) || '');
  const mapa = {};
  resp.split('\n').forEach((l) => { const m = l.match(/^\s*(\d+)[.)]\s*(.+)$/); if (m) mapa[+m[1]] = m[2].trim(); });
  // sem ponto final quando o original não tinha (manchete)
  const out = textos.map((t, i) => { let x = t ? mapa[i + 1] || '' : ''; if (x && !/[.!?]$/.test(String(t).trim())) x = x.replace(/\.$/, ''); return x; });
  const ent = pedacos(sistema) + pedacos(linhas);
  return { textos: out, neuronios: custo(modelo, ent, pedacos(resp)) };
}

// admin: 20 manchetes em inglês recentes, traduzidas pelos dois modelos, para comparar (não guarda nada)
export async function testeAdmin(env, fontesBR) {
  const r = await env.DB.prepare(`SELECT titulo, fonte FROM noticias_hist WHERE dia >= date('now', '-1 day') AND fonte NOT IN (${fontesBR.map(() => '?').join(',')}) ORDER BY data DESC LIMIT 20`)
    .bind(...fontesBR).all();
  const tit = (r.results || []).map((x) => x.titulo);
  const fontes = (r.results || []).map((x) => x.fonte);
  const res = {};
  for (const m of Object.keys(MODELOS)) {
    const t0 = Date.now();
    try { const t = await traduzir(env, tit, m); res[m] = { textos: t.textos, neuronios: Math.round(t.neuronios), ms: Date.now() - t0 }; }
    catch (e) { res[m] = { erro: String(e.message || e).slice(0, 200) }; }
  }
  return { originais: tit, fontes, res };
}

/* ---------- uso no site: a lista de notícias sai com tituloPt e trechoPt ---------- */
export const FONTES_BR = new Set(['Valor Econômico', 'InfoMoney', 'Investing.com BR', 'ADVFN BR', 'Notícia Brasil', 'BeInCrypto BR', 'Cointelegraph BR', 'Google News', 'Money Times', 'InvestNews', 'Valor Investe', 'Bloomberg Línea', 'Suno', 'BMC News', 'Invezz', 'Notícias Agrícolas', 'Folha', 'O Antagonista', 'Poder360', 'G1 Política', 'Agência Brasil']);
const limpaTit = (t) => String(t || '').replace(/^FinancialJuice:\s*/i, '').trim();
let traduzindo = false;

// põe as traduções guardadas na lista e, em segundo plano, traduz as que faltam (no máximo 36 por vez)
export async function aplicarTraducoes(env, ctx, lista) {
  if (!env?.DB || !Array.isArray(lista)) return;
  const en = lista.filter((n) => n && n.id && n.titulo && !FONTES_BR.has(n.fonte));
  if (!en.length) return;
  try {
    await tabelas(env);
    const ids = [...new Set(en.map((n) => n.id))], achou = new Map();
    for (let i = 0; i < ids.length; i += 90) {
      const parte = ids.slice(i, i + 90);
      const r = await env.DB.prepare(`SELECT id, titulo, trecho FROM traducao_ia WHERE id IN (${parte.map(() => '?').join(',')})`).bind(...parte).all();
      (r.results || []).forEach((x) => achou.set(x.id, x));
    }
    const faltam = [];
    for (const n of en) {
      const t = achou.get(n.id);
      if (t && t.titulo) { n.tituloPt = t.titulo; if (t.trecho) n.trechoPt = t.trecho; } else faltam.push(n);
    }
    if (faltam.length && env.AI && !traduzindo) {
      traduzindo = true;
      const job = traduzirPendentes(env, faltam.sort((a, b) => (b.data || 0) - (a.data || 0)).slice(0, 36)).catch(() => {}).finally(() => { traduzindo = false; });
      if (ctx?.waitUntil) ctx.waitUntil(job); else await job;
    }
  } catch (e) { /* sem tradução do servidor: o aparelho traduz como antes */ }
}

async function traduzirPendentes(env, itens) {
  for (let i = 0; i < itens.length; i += 12) {
    const uso = await usoHoje(env);
    if (uso.neuronios >= LIMITE_DIA) return; // limitador: acabou a cota do dia
    const lote = itens.slice(i, i + 12);
    const textos = [];
    lote.forEach((n) => { textos.push(limpaTit(n.titulo)); textos.push(String(n.trecho || '').replace(/\s+/g, ' ').trim()); });
    const r = await traduzir(env, textos, MODELO_PADRAO);
    const agora = Date.now(), st = [];
    lote.forEach((n, k) => {
      const tit = r.textos[k * 2], tre = r.textos[k * 2 + 1];
      if (tit) st.push(env.DB.prepare('INSERT OR REPLACE INTO traducao_ia (id, titulo, trecho, modelo, ts) VALUES (?, ?, ?, ?, ?)').bind(n.id, tit.slice(0, 400), (tre || '').slice(0, 600), MODELO_PADRAO, agora));
    });
    if (st.length) await env.DB.batch(st);
    await somarUso(env, r.neuronios, st.length);
  }
}

// limpeza: traduções com mais de 30 dias saem do banco (as notícias já saíram da lista)
export async function limparTraducoes(env) {
  await tabelas(env);
  await env.DB.prepare('DELETE FROM traducao_ia WHERE ts < ?').bind(Date.now() - 30 * 864e5).run();
  await env.DB.prepare("DELETE FROM ia_uso WHERE dia < date('now', '-90 day')").run();
}
