/* Erros de JavaScript no navegador de quem usa o terminal (24/11/2026, pedido do Dante: "como eu sei se tem outros bugs?").
   O site manda só: a mensagem do erro, o arquivo do site e a linha, a aba aberta e o tipo de aparelho. Nada de nome,
   conta, IP ou endereço completo. Tabela erros_js, uma linha por dia e por erro (com a contagem); some depois de 30 dias.
   /admin > Visão geral mostra os últimos 7 dias. Um erro que aparece 3 vezes no dia avisa no Telegram (uma vez por dia). */
const MAX_LINHAS = 3000;
const AVISAR_EM = 3;
let pronta = false;
const curto = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
// erros que não são do site: extensões do navegador, scripts de outros domínios, quedas de rede, avisos inofensivos
const IGNORA = /ResizeObserver loop|^Script error\.?$|extension|Failed to fetch|NetworkError|Load failed|network error|AbortError|aborted|The user aborted|Timeout|timed out|cancelad|cancelled|Non-Error promise rejection|webkit-masked-url|Importing a module script failed/i;
const APARELHOS = new Set(['celular', 'tablet', 'computador']);

async function tabela(env) {
  if (pronta) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS erros_js (dia TEXT NOT NULL, msg TEXT NOT NULL, arquivo TEXT NOT NULL, linha INTEGER NOT NULL,
    aba TEXT, aparelho TEXT, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, msg, arquivo, linha))`).run();
  pronta = true;
}
// só arquivos do próprio site, sem ?v= (o número da versão fica de fora para juntar o mesmo erro)
function arquivoDoSite(a, origem) {
  const s = String(a || '');
  if (!s) return '';
  try { const u = new URL(s); return u.origin === origem ? curto(u.pathname, 80) : null; } catch (e) { return null; }
}

export async function receberErroJs(req, env, avisar) {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const url = new URL(req.url), o = req.headers.get('Origin'), site = req.headers.get('Sec-Fetch-Site');
  if ((o && o !== url.origin) || (site && site !== 'same-origin')) return new Response(null, { status: 204 });
  const corpo = await req.text().catch(() => '');
  if (!corpo || corpo.length > 8000) return new Response(null, { status: 204 });
  let itens = [];
  try { const j = JSON.parse(corpo); itens = Array.isArray(j?.itens) ? j.itens.slice(0, 5) : []; } catch (e) { return new Response(null, { status: 204 }); }
  const dia = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const linhas = [];
  for (const x of itens) {
    const msg = curto(x?.m, 200), arquivo = arquivoDoSite(x?.a, url.origin);
    if (!msg || arquivo === null || IGNORA.test(msg)) continue;
    const linha = Number.isInteger(x?.l) && x.l >= 0 && x.l < 1e6 ? x.l : 0;
    const aba = curto(x?.aba, 40).replace(/[^\w\/-]/g, '');
    const aparelho = APARELHOS.has(x?.ap) ? x.ap : '';
    linhas.push([dia, msg, arquivo, linha, aba, aparelho]);
  }
  if (!linhas.length) return new Response(null, { status: 204 });
  try {
    await tabela(env);
    for (const l of linhas) {
      await env.DB.prepare(`INSERT INTO erros_js (dia, msg, arquivo, linha, aba, aparelho, n)
        SELECT ?, ?, ?, ?, ?, ?, 1 WHERE (SELECT COUNT(*) FROM erros_js) < ${MAX_LINHAS}
        ON CONFLICT(dia, msg, arquivo, linha) DO UPDATE SET n = n + 1, aba = excluded.aba, aparelho = excluded.aparelho`).bind(...l).run();
      const r = await env.DB.prepare('SELECT n FROM erros_js WHERE dia = ? AND msg = ? AND arquivo = ? AND linha = ?').bind(l[0], l[1], l[2], l[3]).first();
      if (r && r.n === AVISAR_EM && avisar) {
        await avisar(env, 'Erro no site', `Um erro apareceu ${AVISAR_EM} vezes hoje no navegador de quem usa o terminal:\n${l[1]}\n${l[2] || 'sem arquivo'}${l[3] ? ':' + l[3] : ''} · aba ${l[4] || '?'} · ${l[5] || 'aparelho ?'}\n\nVeja em /admin > Visão geral.`).catch(() => {});
      }
    }
  } catch (e) { console.error('erros-js:', e.message); }
  return new Response(null, { status: 204 });
}

// /admin: os erros dos últimos 7 dias, do mais frequente para o menos
export async function errosRecentes(env) {
  try {
    await tabela(env);
    const hoje = new Date(Date.now() - 3 * 3600000), d7 = new Date(hoje - 6 * 864e5).toISOString().slice(0, 10), d30 = new Date(hoje - 30 * 864e5).toISOString().slice(0, 10);
    await env.DB.prepare('DELETE FROM erros_js WHERE dia < ?').bind(d30).run();
    return (await env.DB.prepare(`SELECT msg, arquivo, linha, SUM(n) n, MAX(dia) ultimo, COUNT(*) dias, MAX(aba) aba, MAX(aparelho) aparelho
      FROM erros_js WHERE dia >= ? GROUP BY msg, arquivo, linha ORDER BY n DESC LIMIT 20`).bind(d7).all()).results;
  } catch (e) { return []; }
}
