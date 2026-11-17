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
    + 'Responda só com as traduções, uma por linha, com o mesmo número na frente, sem comentários.';
  const r = await env.AI.run(M.id, { messages: [{ role: 'system', content: sistema }, { role: 'user', content: linhas }], max_tokens: Math.min(4000, 60 + pedacos(linhas) * 2), temperature: 0.1 });
  const resp = String(r && (r.response ?? r.result?.response) || '');
  const mapa = {};
  resp.split('\n').forEach((l) => { const m = l.match(/^\s*(\d+)[.)]\s*(.+)$/); if (m) mapa[+m[1]] = m[2].trim(); });
  const out = textos.map((t, i) => (t ? mapa[i + 1] || '' : ''));
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
