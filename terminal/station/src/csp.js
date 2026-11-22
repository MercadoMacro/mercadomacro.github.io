/* Regra de scripts (CSP), etapa 1: só avisar (12/11/2026).
   As páginas HTML levam Content-Security-Policy-Report-Only: o navegador não bloqueia nada, só manda para /api/csp
   o que a regra abaixo TERIA bloqueado. Os avisos ficam somados por dia na tabela csp_avisos (tipo de recurso,
   endereço de origem e página), sem nada da pessoa. Depois de uma semana de uso real, a lista é completada e a
   regra passa a valer de verdade (etapa 2: trocar o cabeçalho para Content-Security-Policy).
   Para consultar: SELECT diretiva, bloqueado, SUM(n) FROM csp_avisos GROUP BY 1, 2 ORDER BY 3 DESC.
   Etapa 2, preparação (22/11/2026): os scripts e ações escritos dentro das páginas foram para arquivos (boot.js,
   noticias.js, letras.js, /js/pg/<nome>.js...) e a lista abaixo foi completada com a estatística da Cloudflare,
   o Google Ads e o WebAssembly. Ainda só avisando por alguns dias; depois o cabeçalho passa a bloquear. */
const LISTA = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'report-sample'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com', 'https://s3.tradingview.com', 'https://challenges.cloudflare.com',
    // estatística de visitas da Cloudflare (Web Analytics) e WebAssembly (avisos de 14 a 22/11)
    'https://static.cloudflareinsights.com', "'wasm-unsafe-eval'",
    // TV da Schwab Network na aba Notícias, em teste até 04/12/2026 (schwab-tv.js)
    'https://www.youtube.com',
    // tag do Google Ads na vitrine e no /assinar (22/11/2026)
    'https://www.googletagmanager.com'],
  // estilos escritos dentro das páginas são muitos (e de baixo risco): ficam liberados
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
  'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
  // fotos das notícias vêm de qualquer site
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'connect-src': ["'self'", 'https://shrill-meadow-89c1.danilo-nillo.workers.dev', 'https://news.cota-cotacao10.workers.dev', 'https://raw.githubusercontent.com',
    'https://olinda.bcb.gov.br', 'https://api.bcb.gov.br', 'https://translate.googleapis.com', 'https://clients5.google.com', 'wss://api.hyperliquid.xyz',
    'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com',
    // achados na prévia local de 12/11 (todas as abas abertas uma vez)
    'https://mercadomacro-vitrine.cota-cotacao10.workers.dev', 'https://fred-proxy.cota-cotacao10.workers.dev', 'https://apisidra.ibge.gov.br',
    'https://economia.awesomeapi.com.br', 'https://latest.currency-api.pages.dev', 'wss://data-stream.binance.vision', 'wss://api.derivws.com',
    // tag do Google Ads (22/11/2026)
    'https://www.googletagmanager.com', 'https://www.google-analytics.com', 'https://www.googleadservices.com', 'https://www.google.com', 'https://googleads.g.doubleclick.net', 'https://*.doubleclick.net', 'https://pagead2.googlesyndication.com',
    'https://cloudflareinsights.com'],
  'frame-src': ["'self'", 'https://s.tradingview.com', 'https://www.tradingview-widget.com', 'https://sslecal2.investing.com', 'https://open.spotify.com', 'https://challenges.cloudflare.com',
    'https://td.doubleclick.net', 'https://www.googletagmanager.com', 'https://www.youtube.com'],
  'worker-src': ["'self'"],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'report-uri': ['/api/csp'],
};
// caixa fechada das Notícias Agrícolas (/vitrine/na-caixa, aberta pela aba Notícias num quadro com sandbox):
// regra própria e já valendo, só com o widget deles e o na-ponte.js
export const CSP_CAIXA_NA = "default-src 'none'; script-src 'self' https://www.noticiasagricolas.com.br; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
export const CSP_SO_AVISO = Object.entries(LISTA).map(([k, v]) => k + ' ' + v.join(' ')).join('; ');

const MAX_LINHAS = 3000; // teto de linhas por segurança (um site hostil poderia mandar avisos sem parar)
let tabelaPronta = false;
const curto = (s, n) => String(s || '').slice(0, n);
// só a origem (sem caminho nem parâmetros): nada de endereço com dado de alguém
function origem(u) {
  const s = String(u || '');
  if (!s || /^(inline|eval|data|blob|wasm-eval|trusted-types-sink)$/.test(s)) return s || 'inline';
  try { const x = new URL(s); return x.protocol === 'https:' || x.protocol === 'wss:' || x.protocol === 'http:' ? x.origin : x.protocol.replace(':', ''); } catch (e) { return curto(s, 60); }
}
function pagina(u) { try { return curto(new URL(u).pathname, 80); } catch (e) { return ''; } }

// POST /api/csp: aceita o formato antigo (report-uri, um aviso) e o novo (Reporting API, uma lista)
export async function receberAvisoCsp(req, env) {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const corpo = await req.text().catch(() => '');
  if (!corpo || corpo.length > 20000) return new Response(null, { status: 204 });
  let lista = [];
  try {
    const j = JSON.parse(corpo);
    lista = Array.isArray(j) ? j.map((x) => x && x.body).filter(Boolean) : (j && j['csp-report'] ? [j['csp-report']] : []);
  } catch (e) { return new Response(null, { status: 204 }); }
  const dia = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const linhas = [];
  for (const r of lista.slice(0, 20)) {
    const diretiva = curto(r['effective-directive'] || r.effectiveDirective || r['violated-directive'] || r.violatedDirective, 40).split(' ')[0];
    const bloq = origem(r['blocked-uri'] || r.blockedURL);
    const fonte = curto(r['source-file'] || r.sourceFile, 200);
    // extensões do navegador da pessoa não são problema do site
    if (/^(chrome|moz|safari|safari-web)-extension/.test(bloq) || /^(chrome|moz|safari|safari-web)-extension:/.test(fonte)) continue;
    if (!diretiva) continue;
    linhas.push([dia, diretiva, bloq, pagina(r['document-uri'] || r.documentURL), curto(r['script-sample'] || r.sample, 60)]);
  }
  if (!linhas.length) return new Response(null, { status: 204 });
  try {
    if (!tabelaPronta) {
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS csp_avisos (dia TEXT NOT NULL, diretiva TEXT NOT NULL, bloqueado TEXT NOT NULL, pagina TEXT NOT NULL, exemplo TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, diretiva, bloqueado, pagina, exemplo))').run();
      tabelaPronta = true;
    }
    await env.DB.batch(linhas.map((l) => env.DB.prepare(`INSERT INTO csp_avisos (dia, diretiva, bloqueado, pagina, exemplo, n)
      SELECT ?, ?, ?, ?, ?, 1 WHERE (SELECT COUNT(*) FROM csp_avisos) < ${MAX_LINHAS}
      ON CONFLICT(dia, diretiva, bloqueado, pagina, exemplo) DO UPDATE SET n = n + 1`).bind(...l)));
  } catch (e) { console.error('csp:', e.message); }
  return new Response(null, { status: 204 });
}
