/* Tradução das notícias de fora no próprio site, com a IA da Cloudflare (binding AI, Workers AI).
   Cada notícia é traduzida uma vez e fica guardada no D1 (tabela traducoes, por link, 7 dias).
   Roda em segundo plano depois de uma resposta de /api/noticias, no máximo uma vez a cada 2 minutos. */

const MODELO = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
// fontes que chegam em inglês
export const FONTES_EN = new Set(['Bloomberg', 'Financial Juice', 'ForexLive', 'Zero Hedge', 'FXStreet', 'FX Markets', 'ING Think', 'CNBC', 'MarketWatch', 'Yahoo Finance']);
const POR_LOTE = 20;

async function tabela(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS traducoes (link TEXT PRIMARY KEY, titulo TEXT, trecho TEXT, criado INTEGER NOT NULL)').run();
}

// põe na lista o que já foi traduzido (título em português, original guardado, trecho traduzido)
export async function aplicarTraducoes(env, lista) {
  if (!env.DB || !Array.isArray(lista)) return lista;
  try {
    await tabela(env);
    const r = await env.DB.prepare('SELECT link, titulo, trecho FROM traducoes WHERE criado > ?').bind(Date.now() - 7 * 86400000).all();
    const m = new Map((r.results || []).map((x) => [x.link, x]));
    return lista.map((n) => {
      const t = n && m.get(n.link);
      if (!t || n.traduzido) return n;
      const o = { ...n };
      if (t.titulo) { o.tituloOriginal = n.titulo; o.titulo = t.titulo; o.traduzido = true; }
      if (t.trecho) o.trechoPt = t.trecho;
      return o;
    });
  } catch (e) { return lista; }
}

async function traduzLote(env, textos) {
  const r = await env.AI.run(MODELO, {
    messages: [
      { role: 'system', content: 'Você traduz manchetes e resumos de notícias do mercado financeiro do inglês para o português do Brasil, em linguagem jornalística. Use português do Brasil correto (nada de espanhol) e maiúscula só no início da frase e em nomes próprios. Mantenha nomes de empresas, pessoas, siglas, tickers e números. Responda apenas com um array JSON de strings, na mesma ordem e com a mesma quantidade de itens recebidos.' },
      { role: 'user', content: JSON.stringify(textos) },
    ],
    max_tokens: 4096, temperature: 0.1,
  });
  const txt = typeof r?.response === 'string' ? r.response : JSON.stringify(r?.response ?? '');
  const ini = txt.indexOf('['), fim = txt.lastIndexOf(']');
  const arr = JSON.parse(txt.slice(ini, fim + 1));
  if (!Array.isArray(arr) || arr.length !== textos.length) throw new Error('tradução desalinhada');
  return arr.map((x) => String(x || '').trim());
}

// traduz o que falta (títulos das mais recentes e trechos das mais relevantes), em poucos lotes por vez
export async function traduzirFaltantes(env, lista, semTrava) {
  if (!env.AI || !env.DB || !Array.isArray(lista)) return;
  const trava = new Request('https://cache.local/traducao-trava');
  if (!semTrava && await caches.default.match(trava)) return;
  await caches.default.put(trava, new Response('1', { headers: { 'Cache-Control': 'public, max-age=120' } }));
  await tabela(env);
  const ja = new Map(((await env.DB.prepare('SELECT link, titulo, trecho FROM traducoes WHERE criado > ?').bind(Date.now() - 7 * 86400000).all()).results || []).map((x) => [x.link, x]));
  const en = lista.filter((n) => n && n.link && FONTES_EN.has(n.fonte) && Date.now() - n.data < 48 * 3600000);
  const titulos = en.filter((n) => !ja.get(n.link)?.titulo).sort((a, b) => b.data - a.data).slice(0, POR_LOTE * 3);
  const trechos = en.filter((n) => n.trecho && !ja.get(n.link)?.trecho && ja.get(n.link)?.titulo).sort((a, b) => (b.finalScore - a.finalScore) || (b.data - a.data)).slice(0, POR_LOTE);
  const agora = Date.now();
  const grava = (link, titulo, trecho) => env.DB.prepare('INSERT INTO traducoes (link, titulo, trecho, criado) VALUES (?, ?, ?, ?) ON CONFLICT(link) DO UPDATE SET titulo = COALESCE(excluded.titulo, titulo), trecho = COALESCE(excluded.trecho, trecho)')
    .bind(link, titulo, trecho, agora);
  for (let i = 0; i < titulos.length; i += POR_LOTE) {
    const lote = titulos.slice(i, i + POR_LOTE);
    try {
      const tr = await traduzLote(env, lote.map((n) => n.titulo.replace(/^FinancialJuice:\s*/i, '')));
      await env.DB.batch(lote.map((n, k) => grava(n.link, tr[k] || null, null)));
    } catch (e) { console.error('tradução de títulos:', e.message); break; }
  }
  if (trechos.length) {
    try {
      const tr = await traduzLote(env, trechos.map((n) => n.trecho.slice(0, 400)));
      await env.DB.batch(trechos.map((n, k) => grava(n.link, null, tr[k] || null)));
    } catch (e) { console.error('tradução de trechos:', e.message); }
  }
  // limpeza de vez em quando
  if (Math.random() < 0.05) await env.DB.prepare('DELETE FROM traducoes WHERE criado < ?').bind(agora - 7 * 86400000).run();
}
