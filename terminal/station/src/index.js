import { buscarAtivos } from './busca-ativos.js';
export { CapitalRelay } from './capital.js';
import { noticiasCache, noticiasSoCache } from './noticias.js';
import { respostaSelic } from './selic-publica.js';
import { ligarAssinatura, emailsDeTeste, garantirAssinatura, contaDaSessao, apiAssinatura, apiAdminAssinatura, paginaAssinar, rotinaAssinaturas, GRATIS_DIAS } from './assinatura.js';
import { salvarFechamento, paginaFechamentoPublico, diasParaSitemap, completarJuros } from './fechamento-publico.js';
/* Mercado Macro: porteiro do site.
   Só entra quem tem cadastro liberado pelo administrador. Sem login, a pessoa vê apenas /entrar.
   Usuários e sessões ficam no banco D1 "mercadomacro-usuarios" (binding DB).
   Senhas: PBKDF2-SHA256 com sal. Sessão: cookie HttpOnly; no banco fica só o hash do token. */

const COOKIE = 'mm_s';
const SESSAO_DIAS = 90;
const ITER = 30000;
// arquivos que podem ser vistos sem login (vitrine, ícones, logos, prévia de link e o service worker)
const PUBLICO = /^\/(vitrine\/[\w./-]*|icone-[\w-]+\.png|logo-[\w-]+\.png|previa-link-mercado-macro\.png|manifest\.webmanifest|sw\.js|favicon\.ico|robots\.txt)$/;
// ferramentas abertas ao público (sem login): endereço -> [arquivo na pasta vitrine, nome no contador de visitas]
const PUBLICAS = {
  '/calculadora-renda-fixa': ['/vitrine/calculadora', 'calculadora'],
  '/calculadora-juros-compostos': ['/vitrine/juros-compostos', 'juros'],
  '/calculadora-aposentadoria': ['/vitrine/aposentadoria', 'aposentadoria'],
  '/indicadores-hoje': ['/vitrine/indicadores', 'indicadores'],
};
// páginas que existem só para quem entrou (não são arquivos)
const ROTAS_LOGADO = /^\/(admin|conta|fechamento|assinar)$/;
const cacheSessao = new Map(); // token -> { u, ate }
const limparCacheSessao = () => cacheSessao.clear();

// Consolida apenas endereços de páginas; CSS, scripts, imagens e login continuam nas próprias rotas.
function enderecoPublico(p) {
  if (['/index.html', '/vitrine', '/vitrine/', '/vitrine/index', '/vitrine/index.html'].includes(p)) return '/';
  const paginas = { ...PUBLICAS, '/privacidade': ['/vitrine/privacidade'] };
  for (const [destino, [arquivo]] of Object.entries(paginas)) {
    if ([arquivo, arquivo + '/', arquivo + '.html', destino + '/', destino + '.html'].includes(p)) return destino;
  }
  return null;
}


export default {
  // toda segunda às 8h (Brasília) manda o resumo da semana no Telegram (cron em wrangler.jsonc)
  async scheduled(ev, env, ctx) {
    // todo dia às 9h (Brasília): avisa por e-mail quem vence em 3 dias e desativa quem venceu (src/assinatura.js)
    if (ev.cron === '0 12 * * *') { ctx.waitUntil(rotinaAssinaturas(env).catch((e) => console.error('assinaturas:', e.message))); return; }
    // 18:00 (Brasília) nos dias úteis: dispara o robô do fechamento (resumo.yml) na hora certa, porque o agendador
    // do GitHub às vezes atrasa, e guarda o fechamento do dia para a página pública /fechamento-do-mercado
    if (ev.cron === '0 23 * * 1-5') { ctx.waitUntil(completarJuros(env, jurosTesouro).catch(() => {})); return; }
    if (ev.cron === '0 21 * * 1-5') {
      ctx.waitUntil(dispararFechamento(env));
      ctx.waitUntil(dadosFechamento(env).then((d) => salvarFechamento(env, d)).catch(() => {}));
      return;
    }
    ctx.waitUntil(resumoSemanal(env));
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;
    // Os arquivos internos continuam disponíveis ao binding ASSETS, sem expor URLs duplicadas.
    if (req.method === 'GET' || req.method === 'HEAD') {
      const destino = enderecoPublico(p);
      if (destino) return Response.redirect('https://mercadomacro.com.br' + destino + url.search, 301);
    }
    // um endereço só para o Google: www vai para o endereço sem www
    // endereços do site antigo que o Google ainda conhece vão para a página nova equivalente
    // os PDFs de relatórios antigos não existem mais: 410 avisa o Google para tirar da busca
    if (/^\/reports\/[\w-]+\.pdf$/.test(p)) return new Response('Este relatório não está mais disponível.', { status: 410, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    const antigo = enderecoAntigo(p);
    if (antigo) return Response.redirect(antigo, 301);
    if (url.hostname === 'www.mercadomacro.com.br') return Response.redirect('https://mercadomacro.com.br' + p + url.search, 301);
    try {
      if (p === '/entrar') return paginaEntrar(req, env);
      if (p === '/api/vigia') return await avisoDoVigia(req, env);
      if (p === '/api/robo/fechamento') return await roboFechamento(req, env);
      if (p === '/robots.txt') return texto(ROBOTS, 'text/plain');
      if (p === '/sitemap.xml') return texto(await sitemap(env), 'application/xml');
      if (p === '/api/publico/selic') return await respostaSelic(req, ctx);
      if (p === '/fechamento-do-mercado' || p.startsWith('/fechamento-do-mercado/')) return await paginaFechamentoPublico(req, env, ctx, p, dadosFechamento, jurosTesouro, () => paginaFixa(req, env, '/vitrine/404', 404));
      if (p === '/privacidade') return paginaFixa(req, env, '/vitrine/privacidade', 200);
      if (p === '/confirmar') return await paginaConfirmar(req, env, ctx);
      if (p === '/esqueci') return paginaEsqueci();
      if (p === '/nova-senha') return await paginaNovaSenha(req, env);
      if (PUBLICAS[p]) { if (navegacao(req)) contar(env, ctx, req, PUBLICAS[p][1]); return paginaFixa(req, env, PUBLICAS[p][0], 200); }
      if (p.startsWith('/api/auth/')) return await apiAuth(req, env, p.slice(10), ctx);
      if (PUBLICO.test(p)) return env.ASSETS.fetch(req);

      const u = await usuarioDaSessao(req, env);
      // conta que entrou mas não tem acesso (aguardando liberação ou validade vencida): só a página de assinatura
      const conta = u ? { ...u, status: 'ativo' } : await contaDaSessao(req, env);
      if (conta) {
        if (p === '/assinar') return paginaAssinar();
        if (p === '/api/assinatura' || p.startsWith('/api/assinatura/')) return await apiAssinatura(req, env, conta, p.slice(16).replace(/^\//, ''));
      }
      if (!u && conta) return navegacao(req) ? redirect('/assinar') : json({ erro: 'Seu acesso não está ativo.', assinar: true }, 403);
      if (!u) {
        // a página inicial mostra a vitrine para quem não entrou (e para o Google), sem redirecionar
        if ((p === '/' || p === '/index.html') && navegacao(req)) { contar(env, ctx, req, 'vitrine'); return paginaEntrar(req, env, true); }
        if (navegacao(req)) {
          // endereço que não existe mostra a página de erro (e não manda para o login)
          if (!ROTAS_LOGADO.test(p) && !(await existeArquivo(req, env))) return paginaFixa(req, env, '/vitrine/404', 404);
          const volta = p === '/' || p === '/index.html' ? '' : '?volta=' + encodeURIComponent(p + url.search);
          return redirect('/entrar' + volta);
        }
        return json({ erro: 'Faça login para continuar.' }, 401);
      }
      if (p === '/admin') return u.admin ? html(PAGINA_ADMIN) : redirect('/');
      if (p === '/fechamento' || p.startsWith('/fechamento/')) { if (!u.admin) return redirect('/'); }
      if (p === '/conta') return html(PAGINA_CONTA);
      if (p === '/api/ativos/buscar') {
        // cada busca nova consulta o Yahoo: limite por conta
        if (!(await dentroDoLimite(env, 'busca:' + u.id, 120, 600))) return json({ erro: 'Muitas buscas seguidas. Espere alguns minutos.' }, 429);
        return await buscarAtivos(req);
      }
      if (p === '/api/conta/dados') return await apiDados(req, env, u);
      // preços ao vivo da Capital.com: uma conexão só no servidor, repassada a quem está logado
      if (p === '/api/capital/ws') {
        if (req.headers.get('Upgrade') !== 'websocket' || !mesmaOrigem(req)) return json({ erro: 'Use WebSocket a partir do site.' }, 400);
        // a conexão leva a sessão do site (hash) para o relay poder fechá-la se a pessoa sair ou for bloqueada
        const h = new Headers(req.headers);
        h.set('X-MM-Sessao', await sha256hex(lerCookie(req)));
        return env.CAPITAL.get(env.CAPITAL.idFromName('main')).fetch(new Request(req, { headers: h }));
      }
      if (p === '/api/noticias') {
        const { lista, cache, falharam } = await noticiasCache(ctx);
        if (!lista.length) return json({ erro: 'Nenhum feed respondeu.' }, 503); // o navegador usa o worker antigo
        return new Response(JSON.stringify(lista), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=60', 'X-Cache': cache, 'X-Falharam': falharam } });
      }
      if (p.startsWith('/api/admin/')) {
        if (!u.admin) return json({ erro: 'Sem permissão.' }, 403);
        return await apiAdmin(req, env, p.slice(11), u);
      }
      if ((p === '/' || p === '/index.html') && navegacao(req)) contar(env, ctx, req, 'terminal');
      const r = await env.ASSETS.fetch(req);
      if (r.status === 404 && navegacao(req)) return paginaFixa(req, env, '/vitrine/404', 404);
      const out = new Response(r.body, r);
      out.headers.set('Cache-Control', 'private, no-cache');
      return out;
    } catch (e) {
      return json({ erro: 'Erro no servidor. Tente de novo.' }, 500);
    }
  },
};

/* ---------------- contador de visitas (só números por dia, nada pessoal) ---------------- */
const ROBO = /bot|crawl|spider|slurp|lighthouse|headless|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|node-fetch|vigia/i;
function contar(env, ctx, req, tipo) {
  if (ROBO.test(req.headers.get('User-Agent') || '')) return;
  const dia = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10); // dia no horário de Brasília
  ctx.waitUntil(env.DB.prepare('INSERT INTO visitas (dia, tipo, n) VALUES (?, ?, 1) ON CONFLICT(dia, tipo) DO UPDATE SET n = n + 1')
    .bind(dia, tipo).run().catch(() => {}));
}
// bloco do resumo semanal: posição dos especuladores (CFTC) em real, dólar, euro, ouro, petróleo e S&P,
// com aviso quando algum está no extremo de 3 anos (0 a 10 = perto do mais vendido, 90 a 100 = perto do mais comprado)
const COT_RESUMO = ['brl', 'dxy', 'eur', 'ouro', 'wti', 'spx'];
async function especuladores() {
  try {
    const r = await fetch('https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/posicoes/cot.json', { cf: { cacheTtl: 600 } });
    if (!r.ok) return '';
    const j = await r.json();
    const fmt = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toLocaleString('pt-BR');
    let data = '';
    const linhas = [], extremos = [];
    for (const k of COT_RESUMO) {
      const m = (j.mercados || []).find((x) => x.k === k);
      const ss = m && m.semanas;
      if (!ss || ss.length < 21) continue;
      const nets = ss.map((w) => w.el - w.es);
      const net = nets[nets.length - 1], ant = nets[nets.length - 2];
      const min = Math.min(...nets), max = Math.max(...nets);
      const idx = max > min ? Math.round((net - min) / (max - min) * 100) : null;
      data = ss[ss.length - 1].d;
      linhas.push(`- ${m.nome}: ${fmt(net)} contratos (${fmt(net - ant)} na semana)${idx != null ? `, ${idx} de 100 em 3 anos` : ''}`);
      if (idx != null && idx >= 90) extremos.push(`${m.nome} perto do mais comprado em 3 anos`);
      if (idx != null && idx <= 10) extremos.push(`${m.nome} perto do mais vendido em 3 anos`);
    }
    if (!linhas.length) return '';
    return ['', '', `Especuladores nos futuros (CFTC, posição de ${data.slice(8, 10)}/${data.slice(5, 7)}):`, ...linhas, '',
      extremos.length ? 'Atenção: ' + extremos.join('; ') + '.' : 'Nenhum desses mercados está num extremo de 3 anos.'].join('\n');
  } catch (e) {
    return '';
  }
}

async function resumoSemanal(env) {
  const hoje = new Date(Date.now() - 3 * 3600000);
  const ate = new Date(hoje.getTime() - 86400000).toISOString().slice(0, 10); // ontem (domingo)
  const de = new Date(hoje.getTime() - 7 * 86400000).toISOString().slice(0, 10); // segunda passada
  const isoDe = new Date(Date.parse(de + 'T03:00:00Z')).toISOString(), isoAte = new Date(Date.parse(ate + 'T03:00:00Z') + 86400000).toISOString();
  const v = await env.DB.prepare('SELECT tipo, SUM(n) n FROM visitas WHERE dia BETWEEN ? AND ? GROUP BY tipo').bind(de, ate).all();
  const n = (t) => (v.results.find((x) => x.tipo === t) || {}).n || 0;
  const um = (q, ...a) => env.DB.prepare(q).bind(...a).first().then((r) => r.n);
  const pedidos = await um('SELECT COUNT(*) n FROM usuarios WHERE criado >= ? AND criado < ?', isoDe, isoAte);
  const logins = await um('SELECT COUNT(*) n FROM usuarios WHERE ultimo_acesso >= ? AND ultimo_acesso < ?', isoDe, isoAte);
  const pend = await um(`SELECT COUNT(*) n FROM usuarios WHERE status = 'pendente'`);
  const ativos = await um(`SELECT COUNT(*) n FROM usuarios WHERE status = 'ativo'`);
  const br = (d) => d.slice(8, 10) + '/' + d.slice(5, 7);
  const txt = [
    `Semana de ${br(de)} a ${br(ate)}:`,
    '',
    `Vitrine (página de entrada) aberta: ${n('vitrine')} vezes`,
    'Páginas abertas ao público:',
    `- Calculadora de renda fixa: ${n('calculadora')}`,
    `- Calculadora de juros compostos: ${n('juros')}`,
    `- Calculadora de aposentadoria: ${n('aposentadoria')}`,
    `- Indicadores de hoje: ${n('indicadores')}`,
    '',
    `Terminal aberto por quem tem acesso: ${n('terminal')} vezes`,
    `Pessoas que fizeram login: ${logins}`,
    `Pedidos de acesso novos: ${pedidos}`,
    '',
    `Aguardando liberação agora: ${pend}${pend ? ' (https://mercadomacro.com.br/admin)' : ''}`,
    `Usuários liberados no total: ${ativos}`,
    '',
    'Mais detalhes (países, aparelhos): painel da Cloudflare > Web Analytics.',
  ].join('\n') + await especuladores();
  const enviado = await avisar(env, 'Resumo semanal do Mercado Macro', txt);
  await env.DB.prepare('DELETE FROM visitas WHERE dia < ?').bind(new Date(hoje.getTime() - 400 * 86400000).toISOString().slice(0, 10)).run();
  return enviado;
}

/* ---------------- fechamento do mercado ----------------
   dadosFechamento() junta os números (cotações do worker shrill-meadow pela ligação de serviço API,
   Selic do Banco Central, Tesouro, fluxo.json do robô da B3). Usado por:
   - /fechamento (página com o cartão em imagem; o admin baixa ou manda no Telegram)
   - /api/robo/fechamento (robô resumo.yml, às 18h, que fotografa o mesmo cartão)
   Valor que falhar fica null e aparece como "—"; nada é inventado. */
const ORIGEM_SITE = 'https://station.danilo-nillo.workers.dev';
const FECH_CARDS = [
  ['ibov', 'Ibovespa', '^BVSP'], ['dolar', 'Dólar', 'BRL=X'], ['sp', 'S&P 500', '^GSPC'], ['nasdaq', 'Nasdaq', '^IXIC'],
  ['dow', 'Dow Jones', '^DJI'], ['brent', 'Petróleo Brent', 'BZ=F'], ['ouro', 'Ouro', 'GC=F'], ['btc', 'Bitcoin', 'BTC-USD'],
  ['euro', 'Euro', 'EURBRL=X'], ['tnx', 'Treasury 10 anos', '^TNX'],
];
// as mesmas 45 ações do Ibovespa de "maiores altas e baixas" do site (app.js, IBOV_STOCKS)
const FECH_ACOES = ['PETR4', 'PETR3', 'VALE3', 'ITUB4', 'BBDC4', 'BBAS3', 'B3SA3', 'ABEV3', 'WEGE3', 'ITSA4', 'SUZB3', 'RENT3', 'PRIO3',
  'GGBR4', 'BPAC11', 'EQTL3', 'RDOR3', 'RADL3', 'SBSP3', 'VIVT3', 'CMIG4', 'LREN3', 'HAPV3', 'CSAN3', 'UGPA3', 'KLBN11', 'TOTS3', 'ENEV3',
  'BBSE3', 'CSNA3', 'USIM5', 'MGLU3', 'CYRE3', 'ASAI3', 'HYPE3', 'VBBR3', 'BRAP4', 'SANB11', 'TIMS3', 'EGIE3', 'CPFE3', 'GOAU4', 'RAIL3',
  'MULT3', 'CXSE3'];
// taxa do título prefixado e do IPCA+ mais longos do Tesouro Direto (o que não vier fica de fora)
async function jurosTesouro(env) {
  const out = {};
  try {
    const req = new Request('https://shrill-meadow-89c1.danilo-nillo.workers.dev/tesouro', { headers: { Origin: ORIGEM_SITE } });
    const r = env.API ? await env.API.fetch(req) : await fetch(req);
    if (!r.ok) return out;
    const j = await r.json();
    const ano = (t) => +String(t.vencimento || '').slice(6);
    const maisLongo = (re) => (j.titulos || []).filter((t) => re.test(t.nome) && ano(t) && typeof t.taxa === 'number').sort((a, b) => ano(b) - ano(a))[0];
    const pre = maisLongo(/^tesouro prefixado \d{4}$/i), ipca = maisLongo(/^tesouro ipca\+ \d{4}$/i);
    if (pre) out.pre = { nome: pre.nome, taxa: pre.taxa };
    if (ipca) out.ipca = { nome: ipca.nome, taxa: ipca.taxa };
  } catch (e) { /* fica "—" */ }
  return out;
}
async function dadosFechamento(env) {
  const api = async (rota) => {
    const req = new Request('https://shrill-meadow-89c1.danilo-nillo.workers.dev' + rota, { headers: { Origin: ORIGEM_SITE } });
    const r = env.API ? await env.API.fetch(req) : await fetch(req);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  };
  const meta = (j, s) => {
    const m = j?.[s]?.chart?.result?.[0]?.meta;
    if (!m || typeof m.regularMarketPrice !== 'number') return null;
    const ant = m.chartPreviousClose ?? m.previousClose;
    const dia = m.regularMarketTime ? new Date((m.regularMarketTime + (m.gmtoffset || 0)) * 1000).toISOString().slice(0, 10) : null;
    return { v: m.regularMarketPrice, ch: ant ? (m.regularMarketPrice / ant - 1) * 100 : null, dia };
  };
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const out = { data: hoje, gerado: new Date().toISOString(), cards: {}, altas: [], baixas: [], juros: {}, fluxo: null };
  const [jc, ja] = await Promise.all([
    api('/quotes?symbols=' + FECH_CARDS.map((c) => encodeURIComponent(c[2])).join(',')).catch(() => ({})),
    api('/quotes?symbols=' + FECH_ACOES.map((t) => encodeURIComponent(t + '.SA')).join(',')).catch(() => ({})),
  ]);
  for (const [k, nome, s] of FECH_CARDS) out.cards[k] = { nome, ...(meta(jc, s) || { v: null, ch: null, dia: null }) };
  out.pregaoDia = out.cards.ibov.dia;
  out.pregao = out.cards.ibov.dia === hoje;
  // altas e baixas: só ações com cotação do mesmo pregão do Ibovespa
  const acoes = FECH_ACOES.map((t) => ({ t, ...(meta(ja, t + '.SA') || {}) })).filter((a) => a.v != null && a.ch != null && a.dia === out.pregaoDia);
  acoes.sort((x, y) => y.ch - x.ch);
  out.altas = acoes.filter((a) => a.ch > 0).slice(0, 5).map(({ t, v, ch }) => ({ t, v, ch }));
  out.baixas = acoes.filter((a) => a.ch < 0).reverse().slice(0, 5).map(({ t, v, ch }) => ({ t, v, ch }));
  out.nAcoes = acoes.length;
  const SGS = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json';
  for (const via of ['api', 'bcb', 'api']) {
    try {
      const j = via === 'api' ? await api('/bcb?c=432&q=' + encodeURIComponent('/ultimos/1')) : await (await fetch(SGS)).json();
      const v = parseFloat(j?.[0]?.valor);
      if (isFinite(v)) { out.juros.selic = v; break; }
    } catch (e) { /* tenta a próxima */ }
  }
  // o arquivo do Tesouro às vezes vem sem taxas bem às 18h; tenta de novo uma vez
  let tj = await jurosTesouro(env);
  if (!tj.pre || !tj.ipca) { await new Promise((r) => setTimeout(r, 15000)); const t2 = await jurosTesouro(env); tj = { pre: tj.pre || t2.pre, ipca: tj.ipca || t2.ipca }; }
  if (tj.pre) out.juros.pre = tj.pre;
  if (tj.ipca) out.juros.ipca = tj.ipca;
  try {
    const f = await (await fetch('https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/fluxo/fluxo.json', { cf: { cacheTtl: 120 } })).json();
    const ult = f.dias[f.dias.length - 1], mes = ult.data.slice(0, 7), ano = ult.data.slice(0, 4);
    out.fluxo = {
      data: ult.data,
      dia: ult.tipos?.estrangeiro?.saldo ?? null,
      mes: f.meses?.[mes]?.tipos?.estrangeiro?.saldo ?? null,
      ano: Object.entries(f.meses || {}).filter(([k]) => k.startsWith(ano)).reduce((s, [, m]) => s + (m.tipos?.estrangeiro?.saldo || 0), 0),
    };
  } catch (e) { /* fica "—" */ }
  out.noticias = await noticiasDoDia().catch(() => []);
  return out;
}
// principais notícias do dia: as de maior nota da aba Notícias (worker news, mesmas fontes e mesma nota do site),
// publicadas nas últimas 16 horas, sem repetir assunto e só em português (título traduzido ou fonte brasileira)
async function noticiasDoDia() {
  // usa a lista do site se estiver no cache (ler os 25 feeds aqui passaria do limite de pedidos do fechamento)
  let lista = await noticiasSoCache();
  if (!lista) {
    const r = await fetch('https://news.cota-cotacao10.workers.dev/', { cf: { cacheTtl: 120 } });
    if (!r.ok) return [];
    lista = await r.json();
  }
  if (!Array.isArray(lista)) return [];
  const desde = Date.now() - 16 * 3600000;
  const PT = new Set(['Valor Econômico', 'InfoMoney', 'Investing.com BR', 'ADVFN BR', 'Notícia Brasil', 'BeInCrypto BR', 'Cointelegraph BR', 'Google News', 'Money Times', 'InvestNews', 'Valor Investe', 'Bloomberg Línea', 'Suno', 'BMC News']);
  const palavras = (t) => new Set(t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  const escolhidas = [];
  const cands = lista.filter((n) => n && n.titulo && n.link && +n.data >= desde && (n.traduzido || PT.has(n.fonte)))
    .sort((a, b) => (b.finalScore - a.finalScore) || (b.data - a.data));
  for (const n of cands) {
    const w = palavras(n.titulo);
    const parecida = escolhidas.some((e) => { let c = 0; for (const x of w) if (e.w.has(x)) c++; return c / Math.max(1, Math.min(w.size, e.w.size)) >= 0.4; });
    const f = (n.fonte === 'Google News' ? n.veiculo : n.fonte) || '';
    // no máximo 2 do mesmo veículo, para variar as fontes
    if (parecida || escolhidas.filter((e) => e.f === f).length >= 2) continue;
    escolhidas.push({ w, t: n.titulo.trim(), f, link: n.link });
    if (escolhidas.length === 4) break;
  }
  return escolhidas.map(({ t, f, link }) => ({ t, f, link }));
}
const brn = (v, c) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
function textoFechamento(d, curto) {
  const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const pct = (v) => (v == null || !isFinite(v) ? '' : ` (${v > 0 ? '+' : v < 0 ? '−' : ''}${brn(Math.abs(v), 2)}%)`);
  const c = d.cards;
  const l = (k, fmt) => `${c[k].nome}: ${c[k].v != null ? fmt(c[k].v) + pct(c[k].ch) : '—'}`;
  const bi = (mil) => (mil == null ? '—' : `${mil > 0 ? '+' : mil < 0 ? '−' : ''}R$ ${brn(Math.abs(mil) / 1e6, 2)} bi`);
  const j = d.juros;
  const linhas = [
    `Mercado Macro | Fechamento de ${ddmm(d.data)}${!d.pregao && d.pregaoDia ? ` (sem pregão hoje; Ibovespa de ${ddmm(d.pregaoDia)})` : ''}`,
    '',
    l('ibov', (v) => brn(v, 0) + ' pts'), l('dolar', (v) => 'R$ ' + brn(v, 4)), l('euro', (v) => 'R$ ' + brn(v, 4)),
    l('sp', (v) => brn(v, 2)), l('nasdaq', (v) => brn(v, 2)), l('dow', (v) => brn(v, 2)),
    l('brent', (v) => 'US$ ' + brn(v, 2)), l('ouro', (v) => 'US$ ' + brn(v, 2)), l('btc', (v) => 'US$ ' + brn(v, 0)),
  ];
  if (!curto) {
    if (d.altas.length) linhas.push('', 'Maiores altas: ' + d.altas.slice(0, 3).map((a) => `${a.t} +${brn(a.ch, 2)}%`).join(', '));
    if (d.baixas.length) linhas.push('Maiores baixas: ' + d.baixas.slice(0, 3).map((a) => `${a.t} −${brn(-a.ch, 2)}%`).join(', '));
    if (d.noticias && d.noticias.length) linhas.push('', 'Principais notícias', ...d.noticias.map((n) => `- ${n.t}${n.f ? ` (${n.f})` : ''}`));
  }
  linhas.push('', 'Juros',
    `Selic: ${j.selic != null ? brn(j.selic, 2) + '%' : '—'}`,
    `${j.pre ? j.pre.nome : 'Tesouro Prefixado'}: ${j.pre ? brn(j.pre.taxa, 2) + '% a.a.' : '—'}`,
    `${j.ipca ? j.ipca.nome : 'Tesouro IPCA+'}: ${j.ipca ? 'IPCA + ' + brn(j.ipca.taxa, 2) + '%' : '—'}`,
    `Treasury 10 anos (EUA): ${c.tnx.v != null ? brn(c.tnx.v, 2) + '%' : '—'}`,
    '');
  if (d.fluxo) linhas.push(`Estrangeiro na B3 (dados até ${ddmm(d.fluxo.data)}; a B3 publica com atraso)`, `No dia: ${bi(d.fluxo.dia)}`, `No mês: ${bi(d.fluxo.mes)}`, `No ano: ${bi(d.fluxo.ano)}`);
  else linhas.push('Estrangeiro na B3: —');
  linhas.push('', 'Painel completo: https://mercadomacro.com.br');
  return linhas.join('\n');
}
async function telegramFoto(env, png, legenda) {
  const c = await config(env);
  if (!(c.tg_token && c.tg_chat)) return { ok: false, erro: 'Conecte o Telegram primeiro.' };
  const fd = new FormData();
  fd.append('chat_id', c.tg_chat);
  fd.append('caption', String(legenda || '').slice(0, 1024));
  fd.append('photo', new Blob([png], { type: 'image/png' }), 'fechamento.png');
  const r = await fetch(`https://api.telegram.org/bot${c.tg_token}/sendPhoto`, { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({ ok: false }));
  return j.ok ? { ok: true } : { ok: false, erro: 'O Telegram recusou a imagem.' };
}

// avisa o relay da Capital que a chave mudou ou foi apagada: ele descarta a sessão antiga na hora
async function reiniciarCapital(env) {
  try { await env.CAPITAL.get(env.CAPITAL.idFromName('main')).fetch('https://capital/reiniciar', { method: 'POST' }); } catch (_) { /* o relay também confere a chave ao reabrir */ }
}

/* ---------------- sessões ---------------- */
function lerCookie(req) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-f0-9]{64})'));
  return m ? m[1] : null;
}
async function usuarioDaSessao(req, env) {
  const tok = lerCookie(req);
  if (!tok) return null;
  const agora = Date.now();
  const c = cacheSessao.get(tok);
  if (c && c.ate > agora) return c.u;
  const h = await sha256hex(tok);
  await garantirAssinatura(env);
  // validade vencida corta o acesso na hora, mesmo antes do robô diário marcar a conta como expirada
  const u = await env.DB.prepare(
    `SELECT u.id, u.nome, u.email, u.admin, u.expira FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token = ? AND s.expira > ? AND u.status = 'ativo' AND (u.admin = 1 OR u.expira IS NULL OR u.expira > ?)`).bind(h, agora, new Date(agora).toISOString()).first();
  if (u) {
    if (cacheSessao.size > 500) cacheSessao.clear();
    cacheSessao.set(tok, { u, ate: agora + 10000 }); // curto: bloqueio, saída e troca de senha valem em até 10 s em todas as instâncias
  }
  return u || null;
}
function cookieSessao(tok, maxAge) {
  return `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/* ---------------- dados do usuário guardados na conta (hoje só a watchlist) ---------------- */
// tabela dados_usuario(usuario_id, chave, valor, ts): o site manda a lista ao mudar e busca ao abrir,
// e fica com a versão mais nova (ts em milissegundos, do navegador que mudou por último)
const CHAVES_DADOS = {
  watchlist: v => Array.isArray(v) && v.length <= 30 && v.every(x => x && typeof x.s === 'string' && x.s.length <= 24 && (x.n == null || typeof x.n === 'string' && x.n.length <= 80)),
  watchlists: v => {
    if (!v || v.version !== 1 || !Array.isArray(v.lists) || !v.lists.length || v.lists.length > 10) return false;
    const ids = new Set(), names = new Set();
    return v.lists.every(l => {
      const name = typeof l?.name === 'string' ? l.name.trim().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';
      if (!l || typeof l.id !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(l.id) || ids.has(l.id) || !name || l.name.length > 30 || names.has(name) || !CHAVES_DADOS.watchlist(l.items) || l.items.some(x => !x.s.length) || new Set(l.items.map(x => x.s)).size !== l.items.length) return false;
      ids.add(l.id); names.add(name); return true;
    });
  }
};
async function apiDados(req, env, u) {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const k = url.searchParams.get('k') || '';
    if (!CHAVES_DADOS[k]) return json({ erro: 'Chave desconhecida.' }, 400);
    const r = await env.DB.prepare('SELECT valor, ts FROM dados_usuario WHERE usuario_id = ? AND chave = ?').bind(u.id, k).first();
    return json(r ? { usuario: u.id, k, v: JSON.parse(r.valor), ts: r.ts } : { usuario: u.id, k, v: null, ts: 0 }, 200, { 'Cache-Control': 'no-store' });
  }
  if (req.method !== 'PUT') return json({ erro: 'Método não permitido.' }, 405);
  if (!mesmaOrigem(req)) return json({ erro: 'Origem não permitida.' }, 403);
  const txt = await req.text();
  if (txt.length > 64000) return json({ erro: 'Lista grande demais.' }, 413);
  let b;
  try { b = JSON.parse(txt); } catch (e) { return json({ erro: 'Dados inválidos.' }, 400); }
  // Uma aba antiga não pode gravar dados depois que outra conta entrou neste navegador.
  if (!b || b.usuario !== u.id) return json({ erro: 'A conta mudou. Reabra o painel antes de salvar.' }, 409);
  const ok = CHAVES_DADOS[b && b.k];
  const ts = Math.floor(Number(b && b.ts));
  if (!ok || !ok(b.v) || (!Number.isSafeInteger(ts) || ts <= 0)) return json({ erro: 'Dados inválidos.' }, 400);
  if (b.k === 'watchlist' && txt.length > 8000) return json({ erro: 'Lista grande demais.' }, 413);
  // Abas anteriores à migração não podem gravar na lista antiga e aparentar salvar.
  if (b.k === 'watchlist') {
    const migrated = await env.DB.prepare('SELECT ts FROM dados_usuario WHERE usuario_id = ? AND chave = ?').bind(u.id, 'watchlists').first();
    if (migrated) return json({ erro: 'Suas listas usam uma versão mais nova. Recarregue o painel.' }, 409);
  }
  const cleanItems = items => items.map(x => x.n ? { s: x.s, n: x.n } : { s: x.s });
  const v = b.k === 'watchlists'
    ? { version: 1, lists: b.v.lists.map(l => ({ id: l.id, name: l.name.trim().replace(/\s+/g, ' '), items: cleanItems(l.items) })) }
    : cleanItems(b.v);
  if (b.k === 'watchlists' && b.migracao === true) {
    const result = await env.DB.prepare('INSERT OR IGNORE INTO dados_usuario (usuario_id, chave, valor, ts) VALUES (?, ?, ?, ?)')
      .bind(u.id, b.k, JSON.stringify(v), ts).run();
    if (result.meta?.changes === 0) return json({ erro: 'As listas já existem. Atualize a versão da conta.', codigo: 'listas-existem' }, 409);
    return json({ ok: true });
  }
  // só grava se for mais nova que a guardada (dois aparelhos mudando ao mesmo tempo)
  const res = await env.DB.prepare(`INSERT INTO dados_usuario (usuario_id, chave, valor, ts) VALUES (?, ?, ?, ?)
    ON CONFLICT(usuario_id, chave) DO UPDATE SET valor = excluded.valor, ts = excluded.ts WHERE excluded.ts > dados_usuario.ts`)
    .bind(u.id, b.k, JSON.stringify(v), ts).run();
  // nada gravado: a conta já tem uma versão mais nova (de outro aparelho); o site deve recarregar a da conta
  if (res.meta?.changes === 0) return json({ erro: 'Suas listas mudaram em outro aparelho.', codigo: 'versao-mais-nova' }, 409);
  return json({ ok: true });
}

/* ---------------- cadastro, login, saída ---------------- */
async function apiAuth(req, env, acao, ctx) {
  if (acao === 'eu' && req.method === 'GET') {
    const u = await usuarioDaSessao(req, env);
    if (!u) return json({ logado: false }, 401);
    const out = { logado: true, nome: u.nome, email: u.email, admin: !!u.admin, expira: u.admin ? null : u.expira || null };
    if (u.admin) out.pendentes = (await env.DB.prepare(`SELECT COUNT(*) n FROM usuarios WHERE status = 'pendente'`).first()).n;
    return json(out);
  }
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  if (!mesmaOrigem(req)) return json({ erro: 'Origem não permitida.' }, 403);
  const ip = req.headers.get('CF-Connecting-IP') || 'local';

  if (acao === 'sair') {
    const tok = lerCookie(req);
    if (tok) { cacheSessao.delete(tok); await env.DB.prepare('DELETE FROM sessoes WHERE token = ?').bind(await sha256hex(tok)).run(); }
    return json({ ok: true }, 200, { 'Set-Cookie': cookieSessao('', 0) });
  }

  const b = await req.json().catch(() => ({}));
  const email = String(b.email || '').trim().toLowerCase().slice(0, 120);
  const senha = String(b.senha || '');

  if (acao === 'cadastrar') {
    if (!(await dentroDoLimite(env, 'cad:' + ip, 5, 3600))) return json({ erro: 'Muitos cadastros deste endereço. Tente mais tarde.' }, 429);
    const nome = String(b.nome || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (nome.length < 2) return json({ erro: 'Digite seu nome.' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ erro: 'E-mail inválido.' }, 400);
    if (senha.length < 8) return json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' }, 400);
    if (senha.length > 200) return json({ erro: 'Senha longa demais.' }, 400);
    // cadastros que não confirmaram o e-mail em 7 dias são apagados
    await env.DB.prepare(`DELETE FROM usuarios WHERE status = 'confirmar' AND criado < ?`).bind(new Date(Date.now() - 7 * 864e5).toISOString()).run();
    const MSG_FILA = 'Cadastro enviado. Você já pode entrar com seu e-mail e senha e escolher um plano, ou aguardar a liberação do administrador.';
    const MSG_CONF = 'Enviamos um link para ' + email + '. Abra o e-mail e confirme para seu pedido seguir para a liberação. Não chegou? Veja o spam.';
    const existe = await env.DB.prepare('SELECT id, nome, status FROM usuarios WHERE email = ?').bind(email).first();
    if (existe && existe.status === 'confirmar') {
      // pediu de novo sem ter confirmado: manda outro link
      const r = await emailConfirmar(env, req, existe.id, existe.nome, email).catch(() => ({ ok: false }));
      if (r.ok) return json({ ok: true, confirmar: true, msg: MSG_CONF });
      await env.DB.prepare(`UPDATE usuarios SET status = 'pendente' WHERE id = ?`).bind(existe.id).run();
      return json({ ok: true, msg: MSG_FILA });
    }
    if (existe) return json({ erro: existe.status === 'pendente' ? 'Este e-mail já está cadastrado e aguarda liberação.' : 'Este e-mail já está cadastrado. Use Entrar.' }, 409);
    // com o e-mail ligado em /admin, o cadastro só vai para a fila depois que a pessoa confirma o e-mail
    const comEmail = !!(await config(env)).mail_key;
    const ins = await env.DB.prepare(`INSERT INTO usuarios (nome, email, senha, status, criado) VALUES (?, ?, ?, ?, ?)`)
      .bind(nome, email, await hashSenha(senha), comEmail ? 'confirmar' : 'pendente', new Date().toISOString()).run();
    if (comEmail) {
      const r = await emailConfirmar(env, req, ins.meta.last_row_id, nome, email).catch(() => ({ ok: false }));
      if (r.ok) return json({ ok: true, confirmar: true, msg: MSG_CONF });
      // se o e-mail falhar, o pedido vai direto para a fila (como antes)
      await env.DB.batch([
        env.DB.prepare(`UPDATE usuarios SET status = 'pendente' WHERE id = ?`).bind(ins.meta.last_row_id),
        env.DB.prepare('DELETE FROM links_email WHERE usuario_id = ?').bind(ins.meta.last_row_id),
      ]);
    }
    ctx.waitUntil(avisar(env, 'Novo pedido de acesso', `${nome} pediu acesso ao Mercado Macro.\nPara liberar: https://mercadomacro.com.br/admin`).catch(() => {}));
    return json({ ok: true, msg: MSG_FILA });
  }

  if (acao === 'senha') {
    // a própria pessoa troca a senha (precisa estar logada e saber a senha atual)
    const eu = await usuarioDaSessao(req, env);
    if (!eu) return json({ erro: 'Faça login para continuar.' }, 401);
    if (!(await dentroDoLimite(env, 'sen:' + eu.id, 10, 900))) return json({ erro: 'Muitas tentativas. Espere 15 minutos.' }, 429);
    const nova = String(b.nova || '');
    if (nova.length < 8) return json({ erro: 'A senha nova precisa ter pelo menos 8 caracteres.' }, 400);
    if (nova.length > 200) return json({ erro: 'Senha longa demais.' }, 400);
    const r = await env.DB.prepare('SELECT senha FROM usuarios WHERE id = ?').bind(eu.id).first();
    if (!r || !(await conferirSenha(String(b.atual || ''), r.senha))) return json({ erro: 'A senha atual não confere.' }, 400);
    const tok = lerCookie(req);
    await env.DB.batch([
      env.DB.prepare('UPDATE usuarios SET senha = ? WHERE id = ?').bind(await hashSenha(nova), eu.id),
      // encerra as outras sessões (outros aparelhos), mantém esta
      env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ? AND token != ?').bind(eu.id, await sha256hex(tok)),
    ]);
    cacheSessao.clear();
    return json({ ok: true });
  }

  if (acao === 'excluir') {
    // a própria pessoa apaga a conta (precisa estar logada e confirmar a senha)
    const eu = await usuarioDaSessao(req, env);
    if (!eu) return json({ erro: 'Faça login para continuar.' }, 401);
    if (eu.admin) return json({ erro: 'A conta de administrador não pode ser excluída por aqui.' }, 400);
    if (!(await dentroDoLimite(env, 'sen:' + eu.id, 10, 900))) return json({ erro: 'Muitas tentativas. Espere 15 minutos.' }, 429);
    const r = await env.DB.prepare('SELECT senha FROM usuarios WHERE id = ?').bind(eu.id).first();
    if (!r || !(await conferirSenha(senha, r.senha))) return json({ erro: 'A senha não confere.' }, 400);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ?').bind(eu.id),
      env.DB.prepare('DELETE FROM tentativas WHERE chave = ?').bind('sen:' + eu.id),
      env.DB.prepare('DELETE FROM dados_usuario WHERE usuario_id = ?').bind(eu.id),
      env.DB.prepare('DELETE FROM pagamentos WHERE usuario_id = ?').bind(eu.id),
      env.DB.prepare('DELETE FROM usuarios WHERE id = ? AND admin = 0').bind(eu.id),
    ]);
    cacheSessao.clear();
    ctx.waitUntil(avisar(env, 'Conta excluída', `${eu.nome} excluiu a própria conta no Mercado Macro.`).catch(() => {}));
    return json({ ok: true }, 200, { 'Set-Cookie': cookieSessao('', 0) });
  }

  if (acao === 'esqueci') {
    if (!(await dentroDoLimite(env, 'esq:' + ip, 5, 3600))) return json({ erro: 'Muitos pedidos deste endereço. Tente mais tarde.' }, 429);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ erro: 'Digite seu e-mail.' }, 400);
    if (!(await config(env)).mail_key) return json({ erro: 'A troca de senha por e-mail ainda não está ligada. Escreva para contato@mercadomacro.com.br.' }, 400);
    const u = await env.DB.prepare(`SELECT id, nome FROM usuarios WHERE email = ? AND status = 'ativo'`).bind(email).first();
    // a resposta é a mesma exista ou não a conta, para ninguém descobrir quem tem cadastro
    if (u && (await dentroDoLimite(env, 'esqu:' + u.id, 3, 3600))) {
      const tok = await criarLink(env, u.id, 'senha', 1);
      ctx.waitUntil(enviarEmail(env, req, {
        para: email, nome: u.nome, assunto: 'Criar senha nova no Mercado Macro',
        paragrafos: ['Recebemos um pedido para criar uma senha nova na sua conta do Mercado Macro.'],
        botao: 'Criar senha nova', link: siteDe(req) + '/nova-senha?t=' + tok,
        nota: 'O link vale por 1 hora e só pode ser usado uma vez. Se não foi você, ignore este e-mail: sua senha continua a mesma.',
      }).catch(() => {}));
    }
    return json({ ok: true, msg: 'Se esse e-mail tiver acesso liberado, enviamos um link para criar uma senha nova. Ele vale por 1 hora. Não chegou? Veja o spam.' });
  }

  if (acao === 'nova-senha') {
    if (!(await dentroDoLimite(env, 'nsen:' + ip, 10, 900))) return json({ erro: 'Muitas tentativas. Espere 15 minutos.' }, 429);
    if (senha.length < 8) return json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' }, 400);
    if (senha.length > 200) return json({ erro: 'Senha longa demais.' }, 400);
    const l = await lerLink(env, b.t, 'senha');
    if (!l || l.status !== 'ativo') return json({ erro: 'Este link não vale mais. Peça outro em Esqueci minha senha.' }, 400);
    await env.DB.batch([
      env.DB.prepare('UPDATE usuarios SET senha = ? WHERE id = ?').bind(await hashSenha(senha), l.id),
      env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ?').bind(l.id),
      env.DB.prepare(`DELETE FROM links_email WHERE usuario_id = ? AND tipo = 'senha'`).bind(l.id),
    ]);
    cacheSessao.clear();
    return json({ ok: true });
  }

  if (acao === 'entrar') {
    // só senhas erradas contam: 10 erros em 15 minutos bloqueiam este endereço; acertar zera a conta
    const chave = 'ent:' + ip;
    const t = await env.DB.prepare('SELECT n, janela FROM tentativas WHERE chave = ?').bind(chave).first();
    const agoraS = Math.floor(Date.now() / 1000);
    if (t && agoraS - t.janela <= 900 && t.n >= 10) return json({ erro: 'Muitas senhas erradas seguidas. Espere 15 minutos.' }, 429);
    const u = await env.DB.prepare('SELECT id, senha, status FROM usuarios WHERE email = ?').bind(email).first();
    if (!u || !(await conferirSenha(senha, u.senha))) {
      await dentroDoLimite(env, chave, 10, 900);
      return json({ erro: 'E-mail ou senha incorretos.' }, 401);
    }
    await env.DB.prepare('DELETE FROM tentativas WHERE chave = ?').bind(chave).run();
    if (u.status === 'confirmar') return json({ erro: 'Falta confirmar seu e-mail: abra o link que enviamos quando você pediu acesso (veja também o spam). Para receber outro link, peça acesso de novo com o mesmo e-mail.' }, 403);
    // aguardando liberação ou com a validade vencida também entra, mas só vê a página de assinatura
    if (!['ativo', 'pendente', 'expirado'].includes(u.status)) return json({ erro: 'Seu acesso não está liberado.' }, 403);
    const tok = hex(crypto.getRandomValues(new Uint8Array(32)));
    const agora = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessoes WHERE expira < ?').bind(agora),
      env.DB.prepare('INSERT INTO sessoes (token, usuario_id, expira) VALUES (?, ?, ?)').bind(await sha256hex(tok), u.id, agora + SESSAO_DIAS * 864e5),
      env.DB.prepare('UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?').bind(new Date().toISOString(), u.id),
    ]);
    return json({ ok: true }, 200, { 'Set-Cookie': cookieSessao(tok, SESSAO_DIAS * 86400) });
  }
  return json({ erro: 'Não encontrado.' }, 404);
}

/* ---------------- administração ---------------- */
async function apiAdmin(req, env, acao, eu) {
  if (acao === 'fechamento' && req.method === 'GET') {
    const [d, c] = await Promise.all([dadosFechamento(env), config(env)]);
    return json({ ...d, texto: textoFechamento(d), legenda: textoFechamento(d, true), modo: c.fech_modo === 'texto' ? 'texto' : 'imagem' }, 200, { 'Cache-Control': 'no-store' });
  }
  if (acao === 'fechamento-modo' && req.method === 'POST') {
    // como o robô das 18h manda o fechamento: 'imagem' (cartão com legenda) ou 'texto' (só a mensagem)
    if (!mesmaOrigem(req)) return json({ erro: 'Origem não permitida.' }, 403);
    const b = await req.json().catch(() => ({}));
    if (!['imagem', 'texto'].includes(b.modo)) return json({ erro: 'Modo inválido.' }, 400);
    await salvarConfig(env, { fech_modo: b.modo });
    return json({ ok: true, modo: b.modo });
  }
  if (acao === 'fechamento-texto' && req.method === 'POST') {
    if (!mesmaOrigem(req)) return json({ erro: 'Origem não permitida.' }, 403);
    const b = await req.json().catch(() => ({}));
    const t = String(b.texto || '').slice(0, 3500);
    if (!t) return json({ erro: 'Sem texto.' }, 400);
    const c = await config(env);
    if (!(c.tg_token && c.tg_chat)) return json({ erro: 'Conecte o Telegram primeiro.' }, 400);
    const r = await telegram(c.tg_token, 'sendMessage', { chat_id: c.tg_chat, text: t, disable_web_page_preview: true });
    return r.ok ? json({ ok: true }) : json({ erro: 'O Telegram não recebeu.' }, 502);
  }
  if (acao === 'fechamento-foto' && req.method === 'POST') {
    if (!mesmaOrigem(req)) return json({ erro: 'Origem não permitida.' }, 403);
    const fd = await req.formData().catch(() => null);
    const foto = fd && fd.get('foto');
    if (!foto || typeof foto === 'string' || foto.size > 5e6) return json({ erro: 'Imagem inválida.' }, 400);
    const r = await telegramFoto(env, await foto.arrayBuffer(), fd.get('legenda'));
    return r.ok ? json({ ok: true }) : json({ erro: r.erro }, 502);
  }
  const ass = await apiAdminAssinatura(req, env, acao);
  if (ass) return ass;
  if (acao === 'usuarios' && req.method === 'GET') {
    await garantirAssinatura(env);
    const r = await env.DB.prepare(
      'SELECT id, nome, email, status, admin, criado, decidido, ultimo_acesso, expira FROM usuarios ORDER BY criado DESC').all();
    return json({ eu: eu.id, usuarios: r.results });
  }
  if (acao === 'decidir' && req.method === 'POST') {
    if (!mesmaOrigem(req)) return json({ erro: 'Origem não permitida.' }, 403);
    const b = await req.json().catch(() => ({}));
    const id = Number(b.id);
    if (!Number.isInteger(id) || id === eu.id) return json({ erro: 'Usuário inválido.' }, 400);
    if (b.acao === 'senha') {
      // senha provisória para quem esqueceu; o administrador repassa e a pessoa troca em Ajustes > Conta
      const senha = senhaProvisoria();
      const r = await env.DB.prepare('UPDATE usuarios SET senha = ? WHERE id = ? AND admin = 0').bind(await hashSenha(senha), id).run();
      if (!r.meta.changes) return json({ erro: 'Usuário inválido.' }, 400);
      await env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ?').bind(id).run();
      cacheSessao.clear();
      return json({ ok: true, senha });
    }
    if (b.acao === 'validade') {
      // validade da conta: +3 dias, +1 mês ou sem validade (a partir de hoje ou do fim da validade atual)
      await garantirAssinatura(env);
      const v = await env.DB.prepare(`SELECT status, expira FROM usuarios WHERE id = ? AND admin = 0`).bind(id).first();
      if (!v || !['ativo', 'expirado'].includes(v.status)) return json({ erro: 'Usuário inválido.' }, 400);
      const base = new Date(v.expira && v.expira > new Date().toISOString() ? v.expira : Date.now());
      if (b.mais === 'dias3') base.setTime(base.getTime() + 3 * 864e5);
      else if (b.mais === 'mes1') base.setUTCMonth(base.getUTCMonth() + 1);
      else if (b.mais !== 'sem') return json({ erro: 'Ação inválida.' }, 400);
      const expira = b.mais === 'sem' ? null : base.toISOString();
      await env.DB.prepare(`UPDATE usuarios SET status = 'ativo', expira = ? WHERE id = ? AND admin = 0`).bind(expira, id).run();
      cacheSessao.clear();
      return json({ ok: true, expira });
    }
    const novo = { liberar: 'ativo', recusar: 'recusado', bloquear: 'bloqueado' }[b.acao];
    const agora = new Date().toISOString();
    if (b.acao === 'excluir') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ?').bind(id),
        env.DB.prepare('DELETE FROM dados_usuario WHERE usuario_id = (SELECT id FROM usuarios WHERE id = ? AND admin = 0)').bind(id),
        env.DB.prepare('DELETE FROM pagamentos WHERE usuario_id = (SELECT id FROM usuarios WHERE id = ? AND admin = 0)').bind(id),
        env.DB.prepare('DELETE FROM usuarios WHERE id = ? AND admin = 0').bind(id),
      ]);
      await garantirLinks(env);
      await env.DB.prepare('DELETE FROM links_email WHERE usuario_id = ?').bind(id).run();
    } else if (novo) {
      await garantirAssinatura(env);
      const antes = await env.DB.prepare('SELECT nome, email, status, expira FROM usuarios WHERE id = ? AND admin = 0').bind(id).first();
      const q = [env.DB.prepare('UPDATE usuarios SET status = ?, decidido = ? WHERE id = ? AND admin = 0').bind(novo, agora, id)];
      // liberação grátis vale 3 dias (se a conta não tiver uma validade ainda valendo)
      let validade = antes && antes.expira > agora ? antes.expira : null;
      if (novo === 'ativo' && antes && antes.status !== 'ativo' && !validade) {
        validade = new Date(Date.now() + GRATIS_DIAS * 864e5).toISOString();
        q.push(env.DB.prepare('UPDATE usuarios SET expira = ? WHERE id = ? AND admin = 0').bind(validade, id));
      }
      if (novo !== 'ativo') q.push(env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ?').bind(id));
      await env.DB.batch(q);
      cacheSessao.clear();
      // ao liberar, avisa a pessoa por e-mail (se o envio estiver ligado em /admin)
      if (novo === 'ativo' && antes && antes.status !== 'ativo') {
        const r = await emailLiberado(env, req, antes.nome, antes.email, false, validade).catch(() => ({ ok: false }));
        return json({ ok: true, validade, email: r.ok ? 'enviado' : r.desligado ? 'desligado' : 'falhou' });
      }
    } else return json({ erro: 'Ação inválida.' }, 400);
    cacheSessao.clear();
    return json({ ok: true });
  }
  if (acao === 'avisos') {
    const c = await config(env);
    if (req.method === 'GET') return json({ bot: c.tg_bot || null, conectado: !!(c.tg_token && c.tg_chat) });
    if (req.method !== 'POST' || !mesmaOrigem(req)) return json({ erro: 'Método não permitido.' }, 405);
    const b = await req.json().catch(() => ({}));
    if (b.acao === 'token') {
      const token = String(b.token || '').trim();
      if (!/^\d{5,15}:[\w-]{30,60}$/.test(token)) return json({ erro: 'Esse código não parece o token do BotFather. Copie a linha inteira, com os números, os dois-pontos e as letras.' }, 400);
      const me = await telegram(token, 'getMe', {});
      if (!me.ok) return json({ erro: 'O Telegram não aceitou esse token. Confira se copiou certo.' }, 400);
      await salvarConfig(env, { tg_token: token, tg_bot: me.result.username, tg_chat: null });
      return json({ ok: true, bot: me.result.username });
    }
    if (b.acao === 'conectar') {
      if (!c.tg_token) return json({ erro: 'Cole o token do robô primeiro.' }, 400);
      const up = await telegram(c.tg_token, 'getUpdates', { allowed_updates: ['message'] });
      const msgs = (up.result || []).map((u) => u.message).filter((m) => m && m.chat && m.chat.type === 'private');
      if (!msgs.length) return json({ erro: 'Ainda não achei sua mensagem. No Telegram, abra @' + c.tg_bot + ', toque em Iniciar (ou mande qualquer mensagem) e tente de novo.' }, 400);
      const chat = String(msgs[msgs.length - 1].chat.id);
      await salvarConfig(env, { tg_chat: chat });
      await telegram(c.tg_token, 'sendMessage', { chat_id: chat, text: 'Pronto. Os avisos de cadastro novo do Mercado Macro vão chegar aqui.' });
      return json({ ok: true });
    }
    if (b.acao === 'desligar') { await salvarConfig(env, { tg_token: null, tg_bot: null, tg_chat: null }); return json({ ok: true }); }
    if (b.acao === 'teste') {
      if (!(c.tg_token && c.tg_chat)) return json({ erro: 'Conecte o Telegram primeiro.' }, 400);
      const ok = await avisar(env, 'Teste do Mercado Macro', 'Se chegou, os avisos de cadastro novo estão funcionando.').catch(() => false);
      if (!ok) return json({ erro: 'O Telegram não entregou o aviso. Tente conectar de novo.' }, 502);
      return json({ ok: true });
    }
    if (b.acao === 'resumo') {
      if (!(c.tg_token && c.tg_chat)) return json({ erro: 'Conecte o Telegram primeiro.' }, 400);
      const ok = await resumoSemanal(env).catch(() => false);
      if (!ok) return json({ erro: 'O Telegram não entregou o resumo. Tente de novo.' }, 502);
      return json({ ok: true });
    }
    return json({ erro: 'Ação inválida.' }, 400);
  }
  if (acao === 'email') {
    const c = await config(env);
    if (req.method === 'GET') {
      if (!c.mail_key) return json({ ligado: false });
      return json({ ligado: true, de: MAIL_DE, dominio: await dominioResend(c.mail_key) });
    }
    if (req.method !== 'POST' || !mesmaOrigem(req)) return json({ erro: 'Método não permitido.' }, 405);
    const b = await req.json().catch(() => ({}));
    if (b.acao === 'chave') {
      const chave = String(b.chave || '').trim();
      if (!/^re_[\w-]{10,80}$/.test(chave)) return json({ erro: 'Essa chave não parece do Resend. Ela começa com re_ e tem letras e números.' }, 400);
      const dom = await dominioResend(chave);
      if (dom === 'chave_invalida') return json({ erro: 'O Resend não aceitou essa chave. Confira se copiou inteira.' }, 400);
      await salvarConfig(env, { mail_key: chave });
      return json({ ok: true, dominio: dom });
    }
    if (b.acao === 'desligar') { await salvarConfig(env, { mail_key: null }); return json({ ok: true }); }
    if (b.acao === 'teste-assinatura') {
      if (!c.mail_key) return json({ erro: 'Cole a chave do Resend primeiro.' }, 400);
      const r = await emailsDeTeste(env, req, eu);
      return r.enviados === 3 ? json({ ok: true, para: eu.email }) : json({ erro: 'Foram enviados ' + r.enviados + ' de 3. O Resend respondeu: ' + (r.erro || 'erro desconhecido') + '.' }, 502);
    }
    if (b.acao === 'teste') {
      if (!c.mail_key) return json({ erro: 'Cole a chave do Resend primeiro.' }, 400);
      const r = await emailLiberado(env, req, eu.nome, eu.email, true).catch((e) => ({ ok: false, erro: String(e) }));
      return r.ok ? json({ ok: true, para: eu.email }) : json({ erro: 'O Resend não enviou: ' + (r.erro || 'erro desconhecido') + '.' }, 502);
    }
    return json({ erro: 'Ação inválida.' }, 400);
  }
  if (acao === 'capital') {
    const c = await config(env);
    if (req.method === 'GET') return json(c.cap_key ? { ligado: true, login: mascarar(c.cap_id), ambiente: c.cap_amb || 'demo' } : { ligado: false });
    if (req.method !== 'POST' || !mesmaOrigem(req)) return json({ erro: 'Método não permitido.' }, 405);
    const b = await req.json().catch(() => ({}));
    if (b.acao === 'chave') {
      const cfg = { cap_key: String(b.chave || '').trim(), cap_id: String(b.login || '').trim(), cap_pw: String(b.senha || ''), cap_amb: b.ambiente === 'real' ? 'real' : 'demo' };
      if (!/^[\w-]{8,100}$/.test(cfg.cap_key)) return json({ erro: 'Cole a chave da API como aparece na Capital.com.' }, 400);
      if (!cfg.cap_id || cfg.cap_id.length > 120 || !cfg.cap_pw || cfg.cap_pw.length > 200) return json({ erro: 'Preencha o login e a senha da API.' }, 400);
      const ses = await sessaoCapital(cfg);
      if (!ses.ok) return json({ erro: 'A Capital.com não aceitou: ' + ses.erro }, 400);
      await salvarConfig(env, cfg);
      await reiniciarCapital(env);
      return json({ ok: true });
    }
    if (b.acao === 'desligar') { await salvarConfig(env, { cap_key: null, cap_id: null, cap_pw: null, cap_amb: null }); await reiniciarCapital(env); return json({ ok: true }); }
    if (b.acao === 'testar') {
      if (!c.cap_key) return json({ erro: 'Salve a chave primeiro.' }, 400);
      const ses = await sessaoCapital(c);
      if (!ses.ok) return json({ erro: 'A Capital.com não aceitou: ' + ses.erro }, 502);
      const achados = [];
      for (const termo of BUSCA_CAPITAL) {
        const r = await fetch(ses.base + '/api/v1/markets?searchTerm=' + encodeURIComponent(termo), { headers: ses.h }).catch(() => null);
        const j = r && r.ok ? await r.json().catch(() => ({})) : {};
        achados.push({ termo, itens: (j.markets || []).slice(0, 4).map((m) => ({ epic: m.epic, nome: m.instrumentName, tipo: m.instrumentType, situacao: m.marketStatus, compra: m.bid, venda: m.offer })) });
        await new Promise((ok) => setTimeout(ok, 150)); // limite da Capital: 10 pedidos por segundo
      }
      return json({ ok: true, ambiente: c.cap_amb || 'demo', achados });
    }
    return json({ erro: 'Ação inválida.' }, 400);
  }
  return json({ erro: 'Não encontrado.' }, 404);
}

/* ---------------- Capital.com (teste de cotações) ----------------
   Chave, login e senha da API ficam só no banco D1, colados em /admin, e nunca vão para o navegador:
   com eles dá para operar a conta. Por isso o recomendado é usar a conta demo. */
const BUSCA_CAPITAL = ['USD/BRL', 'EUR/BRL', 'Brazil', 'US500', 'US Tech 100', 'Germany 40', 'Brent', 'Crude', 'Natural Gas', 'Gold', 'Silver', 'Copper', 'Iron', 'Soybean', 'Coffee', 'VIX'];
const mascarar = (x) => { const t = String(x || ''); const [a, d] = t.split('@'); return d ? a.slice(0, 2) + '***@' + d : t.slice(0, 2) + '***'; };
async function sessaoCapital(c) {
  const base = c.cap_amb === 'real' ? 'https://api-capital.backend-capital.com' : 'https://demo-api-capital.backend-capital.com';
  const r = await fetch(base + '/api/v1/session', {
    method: 'POST', headers: { 'X-CAP-API-KEY': c.cap_key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: c.cap_id, password: c.cap_pw, encryptedPassword: false }),
  }).catch(() => null);
  if (!r) return { ok: false, erro: 'sem resposta do servidor deles.' };
  if (!r.ok) { const j = await r.json().catch(() => ({})); return { ok: false, erro: (j.errorCode || 'HTTP ' + r.status) + '.' }; }
  const cst = r.headers.get('CST'), sec = r.headers.get('X-SECURITY-TOKEN');
  if (!cst || !sec) return { ok: false, erro: 'sessão sem os códigos de acesso.' };
  return { ok: true, base, h: { CST: cst, 'X-SECURITY-TOKEN': sec } };
}

/* ---------------- e-mail de acesso liberado (Resend) ----------------
   O administrador cria uma conta no resend.com, verifica o domínio mercadomacro.com.br lá e cola a chave em /admin.
   A chave fica só no banco D1 (nunca no código público) e não volta para o navegador. */
const MAIL_DE = 'Mercado Macro <acesso@mercadomacro.com.br>';
const MAIL_RESPONDER = 'contato@mercadomacro.com.br';
// situação do domínio no Resend: verified, pending, not_started, failed, ausente, desconhecido (chave só de envio) ou chave_invalida
async function dominioResend(chave) {
  const r = await fetch('https://api.resend.com/domains', { headers: { Authorization: 'Bearer ' + chave } }).catch(() => null);
  if (!r) return 'desconhecido';
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && /restricted/i.test(JSON.stringify(j))) return 'desconhecido';
  if (r.status === 401 || r.status === 403) return /restricted/i.test(JSON.stringify(j)) ? 'desconhecido' : 'chave_invalida';
  if (!r.ok) return 'desconhecido';
  const d = (j.data || []).find((x) => x.name === 'mercadomacro.com.br');
  return d ? d.status : 'ausente';
}
const siteDe = (req) => (new URL(req.url).origin.includes('mercadomacro.com.br') ? 'https://mercadomacro.com.br' : new URL(req.url).origin);
const escH = (x) => String(x).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
// monta e manda um e-mail simples: saudação, parágrafos, um botão e uma nota
async function enviarEmail(env, req, { para, nome, assunto, paragrafos, botao, link, nota }) {
  const c = await config(env);
  if (!c.mail_key) return { ok: false, desligado: true };
  const site = siteDe(req);
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || 'olá';
  const texto = `Olá, ${primeiro}.\n\n${paragrafos.join('\n\n')}\n\n${botao}: ${link}\n\n${nota ? nota + '\n\n' : ''}Mercado Macro`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;max-width:520px">
<p>Olá, ${escH(primeiro)}.</p>
${paragrafos.map((x) => `<p>${escH(x)}</p>`).join('\n')}
<p style="margin:22px 0"><a href="${escH(link)}" style="background:#f5b83d;color:#111;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:8px;display:inline-block">${escH(botao)}</a></p>
${nota ? `<p style="color:#6b7280;font-size:13px">${escH(nota)}</p>` : ''}
<p style="color:#6b7280;font-size:13px">Mercado Macro · <a href="${site}" style="color:#6b7280">mercadomacro.com.br</a></p></div>`;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + c.mail_key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_DE, to: [para], reply_to: MAIL_RESPONDER, subject: assunto, text: texto, html }),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true } : { ok: false, erro: j.message || ('HTTP ' + r.status) };
}
function emailLiberado(env, req, nome, email, teste = false, validade = null) {
  const ate = validade ? ' Ele vale até ' + new Date(validade).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + '; depois, é só escolher um plano em ' + siteDe(req) + '/assinar para continuar.' : '';
  return enviarEmail(env, req, {
    para: email, nome, assunto: (teste ? '[Teste] ' : '') + 'Seu acesso ao Mercado Macro foi liberado',
    paragrafos: ['Seu acesso ao Mercado Macro foi liberado. Já dá para entrar com o e-mail e a senha que você cadastrou.' + ate],
    botao: 'Entrar no Mercado Macro', link: siteDe(req) + '/entrar',
    nota: 'Se esquecer a senha, use "Esqueci minha senha" na tela de entrar.',
  });
}

/* ---------------- links por e-mail (confirmar cadastro e criar senha nova) ----------------
   O link leva um código aleatório; no banco fica só o hash dele, com o tipo, a pessoa e a validade. Vale uma vez. */
let tabelaLinks = false;
async function garantirLinks(env) {
  if (tabelaLinks) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS links_email (token TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL, tipo TEXT NOT NULL, expira INTEGER NOT NULL)').run();
  tabelaLinks = true;
}
async function criarLink(env, usuarioId, tipo, horas) {
  await garantirLinks(env);
  const tok = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM links_email WHERE expira < ? OR (usuario_id = ? AND tipo = ?)').bind(Date.now(), usuarioId, tipo),
    env.DB.prepare('INSERT INTO links_email (token, usuario_id, tipo, expira) VALUES (?, ?, ?, ?)').bind(await sha256hex(tok), usuarioId, tipo, Date.now() + horas * 3600e3),
  ]);
  return tok;
}
async function lerLink(env, tok, tipo) {
  if (!/^[a-f0-9]{64}$/.test(String(tok || ''))) return null;
  await garantirLinks(env);
  return env.DB.prepare(`SELECT l.token, u.id, u.nome, u.email, u.status FROM links_email l JOIN usuarios u ON u.id = l.usuario_id
    WHERE l.token = ? AND l.tipo = ? AND l.expira > ?`).bind(await sha256hex(tok), tipo, Date.now()).first();
}
async function emailConfirmar(env, req, id, nome, email) {
  const tok = await criarLink(env, id, 'confirmar', 72);
  return enviarEmail(env, req, {
    para: email, nome, assunto: 'Confirme seu e-mail no Mercado Macro',
    paragrafos: ['Recebemos seu pedido de acesso ao Mercado Macro. Para ele seguir para a liberação, confirme que este e-mail é seu.'],
    botao: 'Confirmar meu e-mail', link: siteDe(req) + '/confirmar?t=' + tok,
    nota: 'O link vale por 3 dias. Se você não pediu acesso, ignore este e-mail.',
  });
}
// página simples (mesmo visual de Minha conta) para os links do e-mail
function paginaLink(titulo, corpo, script = '') {
  return html(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escH(titulo)} | Mercado Macro</title>
<meta name="robots" content="noindex">
<link rel="icon" type="image/png" href="/icone-mercado-macro.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${BASE_CSS}
main{max-width:420px;margin:0 auto;padding:28px 16px 48px}
header{display:flex;align-items:center;gap:12px;margin-bottom:18px}
header h1{font-size:19px;margin:0;flex:1}
a.vol{color:var(--accent-text);font-size:13px}
.caixa,form{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px}
.caixa p{margin:0 0 10px;color:var(--text-2);font-size:14px;line-height:1.5}.caixa p:last-child{margin:0}
label{display:block;font-size:13px;color:var(--text-2);margin:12px 0 5px}label:first-child{margin-top:0}
input{width:100%;background:var(--surface-2);border:1px solid var(--line-2);border-radius:8px;color:var(--text);padding:10px 12px;min-height:42px}
input:focus{outline:2px solid var(--accent);outline-offset:1px}
button,.bt{display:block;text-align:center;text-decoration:none;margin-top:16px;width:100%;background:var(--accent);color:var(--on-accent);border:0;border-radius:8px;padding:11px;font-weight:700;cursor:pointer;min-height:44px;font:inherit;font-weight:700}
button:disabled{opacity:.6;cursor:default}
.nota{color:var(--text-3);font-size:12.5px;margin:12px 0 0}
.msg{font-size:13px;margin:12px 0 0;min-height:1.2em}.msg.erro{color:var(--neg)}.msg.ok{color:var(--pos)}
</style></head><body><main>
<header><h1>${escH(titulo)}</h1><a class="vol" href="/entrar">Ir para Entrar</a></header>
${corpo}
</main>${script ? '<script>' + script + '</script>' : ''}</body></html>`);
}
async function paginaConfirmar(req, env, ctx) {
  const t = new URL(req.url).searchParams.get('t');
  const l = await lerLink(env, t, 'confirmar');
  if (!l) return paginaLink('Link vencido', '<div class="caixa"><p>Este link não vale mais. Ele pode ter vencido ou já ter sido usado.</p><p>Se você já confirmou, é só aguardar a liberação. Se não, peça acesso de novo com o mesmo e-mail para receber outro link.</p><a class="bt" href="/entrar#cadastrar">Pedir acesso</a></div>');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM links_email WHERE token = ?').bind(l.token),
    env.DB.prepare(`UPDATE usuarios SET status = 'pendente' WHERE id = ? AND status = 'confirmar'`).bind(l.id),
  ]);
  if (l.status === 'confirmar') ctx.waitUntil(avisar(env, 'Novo pedido de acesso', `${l.nome} pediu acesso ao Mercado Macro (e-mail confirmado).\nPara liberar: https://mercadomacro.com.br/admin`).catch(() => {}));
  return paginaLink('E-mail confirmado', '<div class="caixa"><p>Pronto, seu e-mail foi confirmado e seu pedido está na fila de liberação.</p><p>Quando o administrador liberar, você recebe um e-mail avisando e já pode entrar com seu e-mail e senha.</p></div>');
}
function paginaEsqueci() {
  return paginaLink('Esqueci minha senha', `<form id="f" novalidate>
  <label for="em">Seu e-mail</label><input id="em" type="email" autocomplete="email" required>
  <button type="submit">Enviar link para criar senha nova</button>
  <p class="msg" id="msg" role="status" aria-live="polite"></p>
</form>`, `(function(){var f=document.getElementById('f'),m=document.getElementById('msg');
f.addEventListener('submit',function(e){e.preventDefault();var b=f.querySelector('button');b.disabled=true;m.className='msg';m.textContent='';
fetch('/api/auth/esqueci',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('em').value})})
.then(function(r){return r.json().then(function(j){if(!r.ok)throw j;return j;});})
.then(function(j){m.className='msg ok';m.textContent=j.msg;})
.catch(function(j){m.className='msg erro';m.textContent=(j&&j.erro)||'Não foi possível. Tente de novo.';})
.then(function(){b.disabled=false;});});})();`);
}
async function paginaNovaSenha(req, env) {
  const l = await lerLink(env, new URL(req.url).searchParams.get('t'), 'senha');
  if (!l) return paginaLink('Link vencido', '<div class="caixa"><p>Este link não vale mais. Ele vence em 1 hora e só pode ser usado uma vez.</p><a class="bt" href="/esqueci">Pedir outro link</a></div>');
  return paginaLink('Criar senha nova', `<form id="f" novalidate>
  <p class="nota" style="margin:0 0 4px">Conta: ${escH(l.email)}</p>
  <label for="nova">Senha nova (mínimo 8 caracteres)</label><input id="nova" type="password" autocomplete="new-password" required minlength="8">
  <label for="nova2">Repita a senha nova</label><input id="nova2" type="password" autocomplete="new-password" required minlength="8">
  <button type="submit">Salvar senha nova</button>
  <p class="msg" id="msg" role="status" aria-live="polite"></p>
  <p class="nota">Ao salvar, os aparelhos onde você estava conectado saem da conta.</p>
</form>`, `(function(){var f=document.getElementById('f'),m=document.getElementById('msg'),t=new URLSearchParams(location.search).get('t');
function diz(ok,x){m.className='msg '+(ok?'ok':'erro');m.textContent=x;}
f.addEventListener('submit',function(e){e.preventDefault();var n=f.nova.value;
if(n.length<8)return diz(false,'A senha precisa ter pelo menos 8 caracteres.');
if(n!==f.nova2.value)return diz(false,'As duas senhas não são iguais.');
var b=f.querySelector('button');b.disabled=true;diz(true,'');
fetch('/api/auth/nova-senha',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({t:t,senha:n})})
.then(function(r){return r.json().then(function(j){if(!r.ok)throw j;});})
.then(function(){document.querySelector('main').innerHTML='<header><h1>Senha criada</h1></header><div class="caixa"><p>Sua senha nova está valendo.</p><a class="bt" href="/entrar">Entrar no Mercado Macro</a></div>';})
.catch(function(j){diz(false,(j&&j.erro)||'Não foi possível. Tente de novo.');b.disabled=false;});});})();`);
}

/* ---------------- avisos pelo Telegram ----------------
   O administrador cria um robô no @BotFather e cola o token em /admin. O token fica só no banco D1
   (nunca no código público) e não volta para o navegador. */
async function config(env) {
  const r = await env.DB.prepare('SELECT chave, valor FROM config').all();
  return Object.fromEntries(r.results.map((x) => [x.chave, x.valor]));
}
async function salvarConfig(env, o) {
  await env.DB.batch(Object.entries(o).map(([k, v]) => v == null
    ? env.DB.prepare('DELETE FROM config WHERE chave = ?').bind(k)
    : env.DB.prepare('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)').bind(k, v)));
}
async function telegram(token, metodo, corpo) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  return r.json().catch(() => ({ ok: false }));
}
async function avisar(env, titulo, texto) {
  const c = await config(env);
  if (!(c.tg_token && c.tg_chat)) return false;
  const r = await telegram(c.tg_token, 'sendMessage', { chat_id: c.tg_chat, text: titulo + '\n\n' + texto });
  return !!r.ok;
}

/* ---------------- aviso do vigia (GitHub Actions) ----------------
   Os robôs vigia.yml e resumo.yml mandam o texto com um token OIDC do GitHub. O token é assinado pelo GitHub
   e só vale para este repositório, ramo main e esses arquivos, então não há senha guardada em lugar nenhum. */
const GH_ISS = 'https://token.actions.githubusercontent.com';
const GH_AUD = 'mercadomacro-vigia';
const GH_REPO = 'MercadoMacro/mercadomacro.github.io';
const ROBOS_AVISO = ['vigia.yml', 'resumo.yml']; // robôs que podem mandar mensagem no Telegram
let jwksCache = null; // { chaves, ate }
const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
async function tokenDoGitHub(tok) {
  const [h, p, sig] = String(tok).split('.');
  if (!h || !p || !sig) return null;
  const cab = JSON.parse(new TextDecoder().decode(b64url(h)));
  const dados = JSON.parse(new TextDecoder().decode(b64url(p)));
  if (cab.alg !== 'RS256') return null;
  if (!jwksCache || jwksCache.ate < Date.now()) {
    const r = await fetch(GH_ISS + '/.well-known/jwks');
    jwksCache = { chaves: (await r.json()).keys || [], ate: Date.now() + 3600e3 };
  }
  const jwk = jwksCache.chaves.find((k) => k.kid === cab.kid);
  if (!jwk) { jwksCache = null; return null; }
  const chave = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', chave, b64url(sig), new TextEncoder().encode(h + '.' + p));
  const agora = Date.now() / 1000;
  if (!ok || dados.iss !== GH_ISS || dados.aud !== GH_AUD || dados.repository !== GH_REPO || dados.ref !== 'refs/heads/main'
    || !ROBOS_AVISO.some((w) => String(dados.workflow_ref || '').startsWith(GH_REPO + '/.github/workflows/' + w + '@')) || !(dados.exp > agora) || (dados.nbf && dados.nbf > agora + 60)) return null;
  return dados;
}
async function avisoDoVigia(req, env) {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const quem = await tokenDoGitHub(tok).catch(() => null);
  if (!quem) return json({ erro: 'Não autorizado.' }, 401);
  const b = await req.json().catch(() => ({}));
  if (b.foto) {
    // fechamento das 18h: o robô manda o cartão em PNG (base64) com a legenda
    let png;
    try { png = Uint8Array.from(atob(String(b.foto)), (ch) => ch.charCodeAt(0)); } catch (e) { return json({ erro: 'Imagem inválida.' }, 400); }
    if (png.length > 5e6) return json({ erro: 'Imagem grande demais.' }, 413);
    const r = await telegramFoto(env, png, b.texto);
    return r.ok ? json({ ok: true }) : json({ erro: r.erro }, 502);
  }
  const texto = String(b.texto || '').slice(0, 3500);
  if (!texto) return json({ erro: 'Sem texto.' }, 400);
  const c = await config(env);
  if (!(c.tg_token && c.tg_chat)) return json({ erro: 'Telegram não conectado.' }, 409);
  const r = await telegram(c.tg_token, 'sendMessage', { chat_id: c.tg_chat, text: texto, disable_web_page_preview: true });
  return r.ok ? json({ ok: true }) : json({ erro: 'Telegram recusou.' }, 502);
}

// precisa do segredo GH_TOKEN no worker (token do GitHub só com Actions: leitura e escrita neste repositório).
// Sem ele, fica valendo só o agendador do próprio GitHub.
async function dispararFechamento(env) {
  if (!env.GH_TOKEN) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/resumo.yml/dispatches`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.GH_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'mercadomacro-station', 'X-GitHub-Api-Version': '2022-11-28' },
      body: JSON.stringify({ ref: 'main', inputs: { site: true } }),
    });
    if (r.status !== 204) console.error('disparo do fechamento:', r.status, await r.text());
  } catch (e) { console.error('disparo do fechamento:', e.message); }
}
async function roboFechamento(req, env) {
  const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!(await tokenDoGitHub(tok).catch(() => null))) return json({ erro: 'Não autorizado.' }, 401);
  const [d, c] = await Promise.all([dadosFechamento(env), config(env)]);
  await salvarFechamento(env, d).catch(() => {}); // também vira página pública
  return json({ ...d, texto: textoFechamento(d), legenda: textoFechamento(d, true), modo: c.fech_modo === 'texto' ? 'texto' : 'imagem' }, 200, { 'Cache-Control': 'no-store' });
}

/* ---------------- utilidades ---------------- */
function senhaProvisoria() {
  const A = 'abcdefghjkmnpqrstuvwxyz23456789'; // sem letras e números que se confundem (l, 1, o, 0, i)
  const v = crypto.getRandomValues(new Uint8Array(10));
  const s = [...v].map((x) => A[x % A.length]).join('');
  return s.slice(0, 5) + '-' + s.slice(5);
}
async function dentroDoLimite(env, chave, max, seg) {
  const agora = Math.floor(Date.now() / 1000);
  const r = await env.DB.prepare('SELECT n, janela FROM tentativas WHERE chave = ?').bind(chave).first();
  if (!r || agora - r.janela > seg) {
    // registros de limite (alguns guardam IP) não passam de um dia, como diz a página /privacidade
    await env.DB.batch([
      env.DB.prepare('DELETE FROM tentativas WHERE janela < ?').bind(agora - 86400),
      env.DB.prepare('INSERT OR REPLACE INTO tentativas (chave, n, janela) VALUES (?, 1, ?)').bind(chave, agora)]);
    return true;
  }
  if (r.n >= max) return false;
  await env.DB.prepare('UPDATE tentativas SET n = n + 1 WHERE chave = ?').bind(chave).run();
  return true;
}
function mesmaOrigem(req) {
  const o = req.headers.get('Origin');
  return !o || o === new URL(req.url).origin;
}
function navegacao(req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const modo = req.headers.get('Sec-Fetch-Mode');
  if (modo === 'navigate' || (req.headers.get('Accept') || '').includes('text/html')) return true;
  // robôs de busca (Google na "inspeção de URL", curl...) nem sempre mandam esses cabeçalhos: endereço de página
  // (sem extensão de arquivo e fora de /api/) também conta como abrir uma página
  const p = new URL(req.url).pathname;
  return !modo && !p.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(p);
}
const hex = (a) => [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (a) => btoa(String.fromCharCode(...a));
const deb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function sha256hex(s) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}
async function pbkdf2(senha, sal, iter) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iter }, k, 256));
}
async function hashSenha(senha) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(sal)}$${b64(await pbkdf2(senha, sal, ITER))}`;
}
async function conferirSenha(senha, guardado) {
  const [tipo, it, sal, h] = String(guardado).split('$');
  if (tipo !== 'pbkdf2') return false;
  const a = await pbkdf2(senha, deb64(sal), Number(it)), b = deb64(h);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}
function json(o, status = 200, extra = {}) {
  return new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra } });
}
function html(s) {
  return new Response(s, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' } });
}
const ANTIGOS = {
  'termo/politica': '/privacidade', 'termo/termos': '/privacidade', 'termo/contato': '/', 'termo/sobre': '/',
  'contato': '/', 'obrigado': '/', 'analises': '/', 'terminal-news': '/', 'opcoes2': '/', 'api': '/',
  'indicadores': '/indicadores-hoje', 'calculadoras': '/calculadora-renda-fixa', 'calculadoras/calculadoras': '/calculadora-renda-fixa',
  'relatorios': '/',
};
function enderecoAntigo(p) {
  const k = p.replace(/^\/+|\/+$/g, '').replace(/\.html$/, '');
  const d = ANTIGOS[k];
  return d ? 'https://mercadomacro.com.br' + d : null;
}

function redirect(to) {
  return new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store' } });
}
// a tela de entrada é a vitrine (station/site/vitrine/index.html)
async function paginaEntrar(req, env, jaSemLogin) {
  if (!jaSemLogin && (await usuarioDaSessao(req, env))) return redirect('/');
  const r = await env.ASSETS.fetch(new Request(new URL('/vitrine/', req.url)));
  let corpo = await r.text();
  // o estilo vai dentro da página: o navegador desenha sem esperar outro arquivo
  const m = corpo.match(/<link rel="stylesheet" href="(\/vitrine\/vitrine\.css[^"]*)">/);
  if (m) {
    const css = await env.ASSETS.fetch(new Request(new URL(m[1], req.url)));
    if (css.ok) { const texto = await css.text(); corpo = corpo.replace(m[0], () => '<style>' + texto + '</style>'); }
  }
  return new Response(corpo, { status: r.status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Frame-Options': 'DENY' } });
}

// páginas públicas fixas da pasta vitrine (privacidade e erro)
async function paginaFixa(req, env, caminho, status) {
  const r = await env.ASSETS.fetch(new Request(new URL(caminho, req.url), { headers: req.headers }));
  const out = new Response(r.body, { status, headers: r.headers });
  out.headers.set('Cache-Control', 'no-cache');
  out.headers.set('X-Frame-Options', 'DENY');
  return out;
}
async function existeArquivo(req, env) {
  const r = await env.ASSETS.fetch(new Request(req.url, { method: 'HEAD' }));
  return r.status !== 404;
}

function texto(s, tipo) {
  return new Response(s, { headers: { 'Content-Type': tipo + '; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
const ROBOTS = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin
Disallow: /conta

Sitemap: https://mercadomacro.com.br/sitemap.xml
`;
const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://mercadomacro.com.br/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>https://mercadomacro.com.br/calculadora-renda-fixa</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>https://mercadomacro.com.br/calculadora-juros-compostos</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>https://mercadomacro.com.br/calculadora-aposentadoria</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>https://mercadomacro.com.br/indicadores-hoje</loc><changefreq>daily</changefreq><priority>0.8</priority></url>
  <url><loc>https://mercadomacro.com.br/privacidade</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>
  <url><loc>https://mercadomacro.com.br/fechamento-do-mercado</loc><changefreq>daily</changefreq><priority>0.9</priority></url>
</urlset>
`;
// sitemap com uma página por fechamento guardado
async function sitemap(env) {
  const dias = await diasParaSitemap(env);
  return SITEMAP.replace('</urlset>', dias.map((d) => `  <url><loc>https://mercadomacro.com.br/fechamento-do-mercado/${d}</loc><lastmod>${d}</lastmod><changefreq>never</changefreq><priority>0.6</priority></url>\n`).join('') + '</urlset>');
}

/* ---------------- páginas ---------------- */
const BASE_CSS = `
:root{--bg:#070b14;--surface:#0e1524;--surface-2:#121a2b;--line:#1c2740;--line-2:#24304d;--text:#e6ecf5;--text-2:#a8b3c7;--text-3:#8591a8;--accent:#f0b90b;--accent-text:#f0b90b;--on-accent:#111;--pos:#16c784;--neg:#ff6b73;color-scheme:dark}
@media (prefers-color-scheme: light){:root{--bg:#f5f7fb;--surface:#fff;--surface-2:#f7f9fc;--line:#dfe5ee;--line-2:#cfd7e3;--text:#0b1220;--text-2:#4a5568;--text-3:#5f6a7d;--accent:#b8860b;--accent-text:#7a5a00;--on-accent:#111;--pos:#0b7a4f;--neg:#c0262f;color-scheme:light}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--text);font:14px/1.5 Inter,system-ui,-apple-system,sans-serif}
button,input{font:inherit}
.msg{font-size:13px;margin:12px 0 0;min-height:1.2em}
.msg.erro{color:var(--neg)}.msg.ok{color:var(--pos)}
`;

const PAGINA_ADMIN = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cadastros | Mercado Macro</title>
<meta name="robots" content="noindex">
<link rel="icon" type="image/png" href="/icone-mercado-macro.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${BASE_CSS}
main{max-width:860px;margin:0 auto;padding:20px 16px 48px}
header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px}
header h1{font-size:19px;margin:0;flex:1}
a.vol{color:var(--accent-text);font-size:13px}
h2{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3);margin:26px 0 10px;font-weight:700}
h2 b{color:var(--text);background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:1px 8px;margin-left:6px;letter-spacing:0}
.lista{display:grid;gap:8px}
.u{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.u .q{flex:1;min-width:200px}
.u .n{font-weight:600}.u .e{color:var(--text-2);font-size:13px;word-break:break-all}.u .d{color:var(--text-3);font-size:12px}
.u .bts{display:flex;gap:6px;flex-wrap:wrap}
.u button{border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);border-radius:7px;padding:7px 12px;cursor:pointer;font-weight:600;font-size:13px;min-height:36px}
.u button.lib{background:var(--accent);color:var(--on-accent);border-color:transparent}
.u button.del{color:var(--neg)}
.tag{font-size:11px;border:1px solid var(--line-2);border-radius:10px;padding:1px 8px;color:var(--text-2)}
.vazio{color:var(--text-3);font-size:13px;margin:0}
.caixa{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:0 0 8px}
.caixa p{margin:0 0 8px;color:var(--text-2);font-size:13px}.caixa p:last-child{margin-bottom:0}
.caixa b{color:var(--text)}
.prov{border-color:var(--accent)}
.cod{font:600 18px/1.3 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.04em;color:var(--text);background:var(--surface-2);border:1px solid var(--line-2);border-radius:7px;padding:6px 10px;display:inline-block;word-break:break-all;user-select:all}
.linha{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
.caixa button{border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);border-radius:7px;padding:7px 12px;cursor:pointer;font-weight:600;font-size:13px;min-height:36px}
ol{margin:6px 0 0;padding-left:20px;color:var(--text-2);font-size:13px}
</style></head><body><main>
<header><h1>Cadastros do Mercado Macro</h1><a class="vol" href="/">Voltar ao site</a></header>
<p class="msg" id="msg" role="status" aria-live="polite"></p>
<div id="prov"></div>
<div id="pags"></div>
<div id="raiz"><p class="vazio">Carregando…</p></div>
<h2>Pix para assinaturas</h2>
<div id="pix"><p class="vazio">Carregando…</p></div>
<h2>Avisos de cadastro novo</h2>
<div id="avisos"><p class="vazio">Carregando…</p></div>
<h2>E-mail de acesso liberado</h2>
<div id="email"><p class="vazio">Carregando…</p></div>
<h2>Capital.com (teste de cotações)</h2>
<div id="capital"><p class="vazio">Carregando…</p></div>
</main>
<script>
(function(){
  var raiz = document.getElementById('raiz'), msg = document.getElementById('msg'), eu = 0;
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function data(s){ if (!s) return '—'; var d = new Date(s); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  function dia(s){ return s ? new Date(s).toLocaleDateString('pt-BR') : '—'; }
  function reais(c){ return 'R$ ' + (c / 100).toFixed(2).replace('.', ','); }
  function post(u, corpo){ return fetch(u, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(function(r){ return r.json().then(function(j){ if (!r.ok) throw j; return j; }); }); }
  var EMAIL = { enviado: ' A pessoa recebeu um e-mail avisando.', falhou: ' O e-mail de aviso não foi enviado; avise a pessoa por outro meio.', desligado: ' (E-mail desligado: avise a pessoa por outro meio.)' };
  var BT = {
    pendente: [['liberar','Liberar','lib'],['recusar','Recusar',''],['excluir','Excluir','del']],
    ativo: [['v:dias3','+3 dias',''],['v:mes1','+1 mês',''],['v:sem','Sem validade',''],['senha','Nova senha',''],['bloquear','Bloquear',''],['excluir','Excluir','del']],
    expirado: [['v:dias3','Liberar 3 dias','lib'],['v:mes1','Liberar 1 mês',''],['excluir','Excluir','del']],
    recusado: [['liberar','Liberar','lib'],['excluir','Excluir','del']],
    bloqueado: [['liberar','Liberar de novo','lib'],['excluir','Excluir','del']],
    confirmar: [['liberar','Liberar mesmo assim','lib'],['excluir','Excluir','del']]
  };
  function bloco(titulo, us, vazio){
    return '<h2>' + titulo + '<b>' + us.length + '</b></h2><div class="lista">' + (us.length ? us.map(function(u){
      return '<div class="u"><div class="q"><div class="n">' + esc(u.nome) + (u.admin ? ' <span class="tag">administrador</span>' : '') + (u.status === 'bloqueado' ? ' <span class="tag">bloqueado</span>' : u.status === 'recusado' ? ' <span class="tag">recusado</span>' : '') + '</div>'
        + '<div class="e">' + esc(u.email) + '</div>'
        + '<div class="d">Cadastro ' + data(u.criado) + (u.status === 'ativo' ? ' · Último acesso ' + data(u.ultimo_acesso) : '') + (u.admin ? '' : u.status === 'ativo' ? ' · ' + (u.expira ? 'Vale até <b>' + dia(u.expira) + '</b>' : 'Sem validade') : u.status === 'expirado' ? ' · Venceu em ' + dia(u.expira) : '') + '</div></div>'
        + (u.id === eu || u.admin ? '' : '<div class="bts">' + (BT[u.status] || []).map(function(b){ return '<button type="button" class="' + b[2] + '" data-id="' + u.id + '" data-a="' + b[0] + '" data-n="' + esc(u.nome) + '">' + b[1] + '</button>'; }).join('') + '</div>')
        + '</div>';
    }).join('') : '<p class="vazio">' + vazio + '</p>') + '</div>';
  }
  function carregar(){
    fetch('/api/admin/usuarios', { credentials: 'same-origin' }).then(function(r){ if (!r.ok) throw r; return r.json(); }).then(function(j){
      eu = j.eu; var us = j.usuarios;
      var f = function(st){ return us.filter(function(u){ return st.indexOf(u.status) >= 0; }); };
      raiz.innerHTML = bloco('Aguardando liberação', f(['pendente']), 'Nenhum pedido novo.')
        + bloco('Liberados', f(['ativo']), 'Ninguém liberado ainda.')
        + (f(['expirado']).length ? bloco('Acesso vencido', f(['expirado']), '') : '')
        + bloco('Recusados e bloqueados', f(['recusado','bloqueado']), 'Nenhum.')
        + (f(['confirmar']).length ? bloco('E-mail ainda não confirmado', f(['confirmar']), '') + '<p class="d" style="color:var(--text-3);font-size:12px;margin:6px 0 0">Essas pessoas pediram acesso mas ainda não clicaram no link de confirmação. Somem sozinhas depois de 7 dias.</p>' : '');
    }).catch(function(){ raiz.innerHTML = '<p class="vazio">Não foi possível carregar os cadastros.</p>'; });
  }
  raiz.addEventListener('click', function(ev){
    var b = ev.target.closest('button[data-a]'); if (!b) return;
    var a = b.dataset.a;
    if (a === 'senha') return novaSenha(b);
    if (a.indexOf('v:') === 0) {
      if (a === 'v:sem' && !confirm('Deixar o acesso de ' + b.dataset.n + ' sem data para terminar?')) return;
      b.disabled = true;
      return post('/api/admin/decidir', { id: +b.dataset.id, acao: 'validade', mais: a.slice(2) })
        .then(function(j){ msg.className = 'msg ok'; msg.textContent = b.dataset.n + ': ' + (j.expira ? 'acesso vale até ' + dia(j.expira) + '.' : 'acesso sem validade.'); carregar(); })
        .catch(function(j){ msg.className = 'msg erro'; msg.textContent = (j && j.erro) || 'Não foi possível. Tente de novo.'; b.disabled = false; });
    }
    if ((a === 'excluir' || a === 'bloquear') && !confirm((a === 'excluir' ? 'Excluir de vez o cadastro de ' + b.dataset.n + '? Nome, e-mail e senha são apagados e não dá para desfazer.' : 'Bloquear o acesso de ' + b.dataset.n + '?'))) return;
    b.disabled = true;
    fetch('/api/admin/decidir', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: +b.dataset.id, acao: a }) })
      .then(function(r){ return r.json().then(function(j){ if (!r.ok) throw j; return j; }); })
      .then(function(j){ msg.className = 'msg ok'; msg.textContent = { liberar: 'Acesso liberado para ', recusar: 'Cadastro recusado: ', bloquear: 'Acesso bloqueado: ', excluir: 'Cadastro excluído: ' }[a] + b.dataset.n + (j && j.validade ? ' até ' + dia(j.validade) : '') + '.' + (j && j.email === 'enviado' ? EMAIL.enviado : j && j.email === 'falhou' ? EMAIL.falhou : ''); carregar(); })
      .catch(function(j){ msg.className = 'msg erro'; msg.textContent = (j && j.erro) || 'Não foi possível. Tente de novo.'; b.disabled = false; });
  });
  var prov = document.getElementById('prov');
  function novaSenha(b){
    if (!confirm('Criar uma senha nova para ' + b.dataset.n + '? A senha atual dessa pessoa deixa de funcionar.')) return;
    b.disabled = true;
    fetch('/api/admin/decidir', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: +b.dataset.id, acao: 'senha' }) })
      .then(function(r){ return r.json().then(function(j){ if (!r.ok) throw j; return j; }); })
      .then(function(j){
        msg.textContent = '';
        prov.innerHTML = '<div class="caixa prov"><p>Senha nova de <b>' + esc(b.dataset.n) + '</b>:</p>'
          + '<div class="linha"><span class="cod" id="cod">' + esc(j.senha) + '</span><button type="button" id="copiar">Copiar</button><button type="button" id="fechar">Fechar</button></div>'
          + '<p>Mande para a pessoa. Ela entra com essa senha e troca em Ajustes, Conta, Trocar senha. A senha só aparece agora; se perder, é só gerar outra.</p></div>';
        document.getElementById('copiar').onclick = function(){ var t = this; (navigator.clipboard ? navigator.clipboard.writeText(j.senha) : Promise.reject()).then(function(){ t.textContent = 'Copiada'; }, function(){ t.textContent = 'Selecione e copie'; }); };
        document.getElementById('fechar').onclick = function(){ prov.innerHTML = ''; };
        prov.scrollIntoView({ block: 'nearest' });
        b.disabled = false;
      })
      .catch(function(j){ msg.className = 'msg erro'; msg.textContent = (j && j.erro) || 'Não foi possível. Tente de novo.'; b.disabled = false; });
  }

  var av = document.getElementById('avisos');
  function postAviso(corpo){
    return fetch('/api/admin/avisos', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      .then(function(r){ return r.json().then(function(j){ if (!r.ok) throw j; return j; }); });
  }
  function avisos(){
    fetch('/api/admin/avisos', { credentials: 'same-origin' }).then(function(r){ if (!r.ok) throw r; return r.json(); }).then(function(j){
      var bt = 'border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);border-radius:7px;padding:7px 12px;cursor:pointer;font-weight:600;font-size:13px;min-height:36px';
      var h;
      if (j.conectado) {
        h = '<div class="caixa"><p>Ligado. Quando alguém pedir acesso, chega uma mensagem no seu Telegram pelo robô <b>@' + esc(j.bot) + '</b>.</p>'
          + '<div class="linha"><button type="button" id="av-teste" style="' + bt + '">Enviar aviso de teste</button><a href="/fechamento" style="' + bt + ';text-decoration:none;display:inline-block">Fechamento do mercado (imagem)</a><button type="button" id="av-resumo" style="' + bt + '">Enviar resumo da semana agora</button><button type="button" id="av-off" style="' + bt + '">Desligar</button></div><p class="d" style="margin:8px 0 0">O fechamento do mercado chega sozinho em dia de pregão às 18h; o resumo da semana, toda segunda às 8h.</p></div>';
      } else if (j.bot) {
        h = '<div class="caixa"><p>Robô <b>@' + esc(j.bot) + '</b> encontrado. Falta um passo:</p><ol>'
          + '<li>No Telegram, abra <a href="https://t.me/' + encodeURIComponent(j.bot) + '" target="_blank" rel="noopener" style="color:var(--accent-text)">@' + esc(j.bot) + '</a> e toque em <b>Iniciar</b>.</li>'
          + '<li>Volte aqui e toque em Conectar.</li></ol>'
          + '<div class="linha"><button type="button" id="av-con" style="' + bt + '">Conectar</button><button type="button" id="av-off" style="' + bt + '">Usar outro robô</button></div></div>';
      } else {
        h = '<div class="caixa"><p>Receba uma mensagem no Telegram sempre que alguém pedir acesso. Para ligar:</p><ol>'
          + '<li>No Telegram, abra <a href="https://t.me/BotFather" target="_blank" rel="noopener" style="color:var(--accent-text)">@BotFather</a> e mande <b>/newbot</b>.</li>'
          + '<li>Ele pede um nome (por exemplo, Avisos Mercado Macro) e depois um usuário terminado em bot (por exemplo, avisos_mercadomacro_bot).</li>'
          + '<li>Ele responde com um token, uma linha parecida com 1234567890:AAH... Copie e cole aqui:</li></ol>'
          + '<div class="linha"><input id="av-token" autocomplete="off" spellcheck="false" placeholder="cole o token aqui" style="flex:1;min-width:220px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:7px;color:var(--text);padding:8px 10px;min-height:36px"><button type="button" id="av-salvar" style="' + bt + '">Salvar</button></div>'
          + '<p>O token fica guardado só no servidor do site e não aparece de novo nesta página.</p></div>';
      }
      av.innerHTML = h + '<p class="msg" id="av-msg"></p>';
      var am = document.getElementById('av-msg');
      function diz(ok, t){ am.className = 'msg ' + (ok ? 'ok' : 'erro'); am.textContent = t; }
      function acao(corpo, bt, depois){ if (bt) bt.disabled = true; diz(true, 'Aguarde…');
        postAviso(corpo).then(function(){ diz(true, ''); depois(); }, function(e){ diz(false, (e && e.erro) || 'Não foi possível.'); }).then(function(){ if (bt) bt.disabled = false; }); }
      var el;
      if ((el = document.getElementById('av-salvar'))) el.onclick = function(){ acao({ acao: 'token', token: document.getElementById('av-token').value }, this, avisos); };
      if ((el = document.getElementById('av-con'))) el.onclick = function(){ acao({ acao: 'conectar' }, this, avisos); };
      if ((el = document.getElementById('av-off'))) el.onclick = function(){ if (confirm('Desligar os avisos pelo Telegram?')) acao({ acao: 'desligar' }, this, avisos); };
      if ((el = document.getElementById('av-resumo'))) el.onclick = function(){ acao({ acao: 'resumo' }, this, function(){ diz(true, 'Resumo enviado. Confira o Telegram.'); }); };
      if ((el = document.getElementById('av-teste'))) el.onclick = function(){ acao({ acao: 'teste' }, this, function(){ diz(true, 'Aviso enviado. Confira o Telegram.'); }); };
    }).catch(function(){ av.innerHTML = '<p class="vazio">Não foi possível carregar os avisos.</p>'; });
  }
  var em = document.getElementById('email');
  var ESTADO = { verified: 'verificado', pending: 'aguardando verificação', not_started: 'ainda não verificado', failed: 'falhou a verificação', ausente: 'não adicionado no Resend', desconhecido: 'não consegui consultar (chave só de envio)' };
  function postEmail(corpo){
    return fetch('/api/admin/email', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      .then(function(r){ return r.json().then(function(j){ if (!r.ok) throw j; return j; }); });
  }
  function email(){
    fetch('/api/admin/email', { credentials: 'same-origin' }).then(function(r){ if (!r.ok) throw r; return r.json(); }).then(function(j){
      var bt = 'border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);border-radius:7px;padding:7px 12px;cursor:pointer;font-weight:600;font-size:13px;min-height:36px';
      var h;
      if (j.ligado) {
        var okDom = j.dominio === 'verified' || j.dominio === 'desconhecido';
        h = '<div class="caixa"><p>Ligado. Quando você toca em Liberar, a pessoa recebe um e-mail de <b>' + esc(j.de) + '</b> avisando que o acesso foi liberado, com o link para entrar.</p>'
          + '<p>Domínio mercadomacro.com.br no Resend: <b>' + esc(ESTADO[j.dominio] || j.dominio) + '</b>.' + (okDom ? '' : ' Enquanto o domínio não estiver verificado, o Resend não entrega os e-mails. No resend.com, abra Domains, mercadomacro.com.br, e use a configuração automática com a Cloudflare.') + '</p>'
          + '<div class="linha"><button type="button" id="em-teste" style="' + bt + '">Enviar e-mail de teste para mim</button><button type="button" id="em-ass" style="' + bt + '">Testar e-mails da assinatura</button><button type="button" id="em-off" style="' + bt + '">Desligar</button></div></div>';
      } else {
        h = '<div class="caixa"><p>Mande um e-mail automático para a pessoa quando você liberar o acesso. Para ligar:</p><ol>'
          + '<li>Crie uma conta grátis em <a href="https://resend.com/signup" target="_blank" rel="noopener" style="color:var(--accent-text)">resend.com</a>.</li>'
          + '<li>Em <b>Domains</b>, adicione <b>mercadomacro.com.br</b> e escolha a configuração automática com a Cloudflare (ela cria os registros de DNS sozinha).</li>'
          + '<li>Em <b>API Keys</b>, crie uma chave (pode ser só de envio). Ela começa com re_. Copie e cole aqui:</li></ol>'
          + '<div class="linha"><input id="em-chave" autocomplete="off" spellcheck="false" placeholder="cole a chave re_..." style="flex:1;min-width:220px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:7px;color:var(--text);padding:8px 10px;min-height:36px"><button type="button" id="em-salvar" style="' + bt + '">Salvar</button></div>'
          + '<p>A chave fica guardada só no servidor do site e não aparece de novo nesta página.</p></div>';
      }
      em.innerHTML = h + '<p class="msg" id="em-msg"></p>';
      var m = document.getElementById('em-msg');
      function diz(ok, t){ m.className = 'msg ' + (ok ? 'ok' : 'erro'); m.textContent = t; }
      function acao(corpo, b, depois){ if (b) b.disabled = true; diz(true, 'Aguarde…');
        postEmail(corpo).then(function(r){ diz(true, ''); depois(r); }, function(e){ diz(false, (e && e.erro) || 'Não foi possível.'); }).then(function(){ if (b) b.disabled = false; }); }
      var el;
      if ((el = document.getElementById('em-salvar'))) el.onclick = function(){ acao({ acao: 'chave', chave: document.getElementById('em-chave').value }, this, email); };
      if ((el = document.getElementById('em-off'))) el.onclick = function(){ if (confirm('Desligar o e-mail de acesso liberado?')) acao({ acao: 'desligar' }, this, email); };
      if ((el = document.getElementById('em-ass'))) el.onclick = function(){ acao({ acao: 'teste-assinatura' }, this, function(r){ diz(true, 'Enviados 3 e-mails para ' + r.para + ': vence em 3 dias, acesso terminou e pagamento confirmado. Confira a caixa de entrada (e o spam).'); }); };
      if ((el = document.getElementById('em-teste'))) el.onclick = function(){ acao({ acao: 'teste' }, this, function(r){ diz(true, 'E-mail de teste enviado para ' + r.para + '. Confira a caixa de entrada (e o spam).'); }); };
    }).catch(function(){ em.innerHTML = '<p class="vazio">Não foi possível carregar.</p>'; });
  }
  var cp = document.getElementById('capital');
  function postCap(corpo){
    return fetch('/api/admin/capital', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      .then(function(r){ return r.json().then(function(j){ if (!r.ok) throw j; return j; }); });
  }
  function capital(){
    fetch('/api/admin/capital', { credentials: 'same-origin' }).then(function(r){ if (!r.ok) throw r; return r.json(); }).then(function(j){
      var bt = 'border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);border-radius:7px;padding:7px 12px;cursor:pointer;font-weight:600;font-size:13px;min-height:36px';
      var inp = 'flex:1;min-width:200px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:7px;color:var(--text);padding:8px 10px;min-height:36px';
      var h;
      if (j.ligado) {
        h = '<div class="caixa"><p>Chave salva (login ' + esc(j.login) + ', conta ' + (j.ambiente === 'real' ? '<b>real</b>' : 'demo') + '). O botão abaixo mostra quais ativos a Capital.com tem e o preço agora. Nada aparece no site ainda.</p>'
          + '<div class="linha"><button type="button" id="cp-testar" style="' + bt + '">Testar</button><button type="button" id="cp-off" style="' + bt + '">Apagar chave</button></div><div id="cp-res"></div></div>';
      } else {
        h = '<div class="caixa"><p>Para testar as cotações da Capital.com. Na Capital.com, em Configurações, API, gere uma chave com uma <b>senha personalizada</b> (diferente da senha da conta). Use de preferência a <b>conta demo</b>: com esses dados dá para operar a conta.</p>'
          + '<div class="linha"><input id="cp-chave" autocomplete="off" spellcheck="false" placeholder="chave da API" style="' + inp + '"></div>'
          + '<div class="linha"><input id="cp-login" autocomplete="off" spellcheck="false" placeholder="e-mail de login da Capital.com" style="' + inp + '"></div>'
          + '<div class="linha"><input id="cp-senha" type="password" autocomplete="new-password" placeholder="senha personalizada da API" style="' + inp + '"></div>'
          + '<div class="linha"><select id="cp-amb" style="' + inp + ';flex:0 0 auto"><option value="demo">Conta demo (recomendado)</option><option value="real">Conta real</option></select><button type="button" id="cp-salvar" style="' + bt + '">Salvar e conferir</button></div>'
          + '<p>Fica guardado só no servidor do site e não aparece de novo nesta página.</p></div>';
      }
      cp.innerHTML = h + '<p class="msg" id="cp-msg"></p>';
      var m = document.getElementById('cp-msg');
      function diz(ok, t){ m.className = 'msg ' + (ok ? 'ok' : 'erro'); m.textContent = t; }
      function acao(corpo, b, depois){ if (b) b.disabled = true; diz(true, 'Aguarde…');
        postCap(corpo).then(function(r){ diz(true, ''); depois(r); }, function(e){ diz(false, (e && e.erro) || 'Não foi possível.'); }).then(function(){ if (b) b.disabled = false; }); }
      var el;
      if ((el = document.getElementById('cp-salvar'))) el.onclick = function(){
        var amb = document.getElementById('cp-amb').value;
        if (amb === 'real' && !confirm('Usar a conta REAL? Com esses dados dá para operar a conta. A conta demo é mais segura para isso.')) return;
        acao({ acao: 'chave', chave: document.getElementById('cp-chave').value, login: document.getElementById('cp-login').value, senha: document.getElementById('cp-senha').value, ambiente: amb }, this, capital); };
      if ((el = document.getElementById('cp-off'))) el.onclick = function(){ if (confirm('Apagar a chave da Capital.com do servidor?')) acao({ acao: 'desligar' }, this, capital); };
      if ((el = document.getElementById('cp-testar'))) el.onclick = function(){ acao({ acao: 'testar' }, this, function(r){
        var t = '<table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px"><tr style="color:var(--text-3);text-align:left"><th>Busca</th><th>Ativo (código)</th><th>Situação</th><th style="text-align:right">Compra / venda</th></tr>';
        r.achados.forEach(function(a){
          if (!a.itens.length) t += '<tr><td>' + esc(a.termo) + '</td><td colspan="3" style="color:var(--text-3)">não encontrado</td></tr>';
          a.itens.forEach(function(x, i){ t += '<tr style="border-top:1px solid var(--line)"><td>' + (i ? '' : esc(a.termo)) + '</td><td>' + esc(x.nome) + ' <span style="color:var(--text-3)">(' + esc(x.epic) + ')</span></td><td>' + esc(x.situacao || '—') + '</td><td style="text-align:right">' + (x.compra == null ? '—' : esc(x.compra) + ' / ' + esc(x.venda)) + '</td></tr>'; });
        });
        document.getElementById('cp-res').innerHTML = t + '</table>';
      }); };
    }).catch(function(){ cp.innerHTML = '<p class="vazio">Não foi possível carregar.</p>'; });
  }
  var pg = document.getElementById('pags');
  function pagamentos(){
    fetch('/api/admin/pagamentos', { credentials: 'same-origin' }).then(function(r){ if (!r.ok) throw r; return r.json(); }).then(function(j){
      var abertos = j.pagamentos.filter(function(p){ return p.status === 'enviado'; }), feitos = j.pagamentos.filter(function(p){ return p.status !== 'enviado'; });
      var linha = function(p){
        return '<div class="u"><div class="q"><div class="n">' + esc(p.nome) + ' · ' + esc(p.nome_plano) + ' ' + reais(p.valor) + '</div><div class="e">' + esc(p.email) + '</div>'
          + '<div class="d">Pedido MM' + String(p.id).padStart(6, '0') + ' · comprovante enviado ' + data(p.enviado) + (p.status === 'aprovado' ? ' · aprovado, vale até ' + dia(p.validade) : p.status === 'recusado' ? ' · não confirmado' : '') + '</div></div>'
          + '<div class="bts">' + (p.tem_arq ? '<a href="/api/admin/comprovante?id=' + p.id + '" target="_blank" rel="noopener"><button type="button">Ver comprovante</button></a>' : '')
          + (p.status === 'enviado' ? '<button type="button" class="lib" data-pg="aprovar" data-id="' + p.id + '" data-n="' + esc(p.nome) + '">Aprovar</button><button type="button" data-pg="recusar" data-id="' + p.id + '" data-n="' + esc(p.nome) + '">Recusar</button>' : '') + '</div></div>';
      };
      pg.innerHTML = '<h2>Pagamentos para conferir<b>' + abertos.length + '</b></h2><div class="lista">' + (abertos.length ? abertos.map(linha).join('') : '<p class="vazio">Nenhum comprovante novo. Confira no extrato do banco antes de aprovar.</p>') + '</div>'
        + (feitos.length ? '<details style="margin-top:8px"><summary style="cursor:pointer;color:var(--text-3);font-size:12.5px">Decididos nos últimos 60 dias (' + feitos.length + ')</summary><div class="lista" style="margin-top:8px">' + feitos.map(linha).join('') + '</div></details>' : '');
    }).catch(function(){ pg.innerHTML = '<p class="vazio">Não foi possível carregar os pagamentos.</p>'; });
  }
  pg.addEventListener('click', function(ev){
    var b = ev.target.closest('button[data-pg]'); if (!b) return;
    var a = b.dataset.pg;
    if (!confirm((a === 'aprovar' ? 'Aprovar o pagamento de ' : 'Recusar o pagamento de ') + b.dataset.n + '?' + (a === 'aprovar' ? ' Confira antes se o valor entrou na sua conta.' : ''))) return;
    b.disabled = true;
    post('/api/admin/pagamentos', { id: +b.dataset.id, acao: a }).then(function(j){
      msg.className = 'msg ok'; msg.textContent = (a === 'aprovar' ? 'Pagamento aprovado: ' + b.dataset.n + ' tem acesso até ' + dia(j.validade) + '.' : 'Pagamento recusado.') + (EMAIL[j.email] || '');
      pagamentos(); carregar();
    }).catch(function(j){ msg.className = 'msg erro'; msg.textContent = (j && j.erro) || 'Não foi possível. Tente de novo.'; b.disabled = false; });
  });
  var px = document.getElementById('pix');
  function pix(){
    fetch('/api/admin/pix', { credentials: 'same-origin' }).then(function(r){ if (!r.ok) throw r; return r.json(); }).then(function(j){
      var bt = 'border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);border-radius:7px;padding:7px 12px;cursor:pointer;font-weight:600;font-size:13px;min-height:36px';
      var inp = 'flex:1;min-width:200px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:7px;color:var(--text);padding:8px 10px;min-height:36px';
      var h = '<div class="caixa">' + (j.chave ? '<p>Ligado. A página <a href="/assinar" style="color:var(--accent-text)">/assinar</a> mostra o QR Code do Pix para a chave <b>' + esc(j.chave) + '</b> (' + esc(j.nome) + ', ' + esc(j.cidade) + '). Planos: degustação 7 dias R$ 4,99 (só para quem nunca assinou), mensal R$ 29,90, trimestral R$ 79,90 e semestral R$ 149,90.</p><p>Para trocar, preencha de novo:</p>'
          : '<p>Para as pessoas pagarem a assinatura pelo Pix, preencha a chave que vai receber e o nome e a cidade como aparecem no seu banco. Celular: escreva com +55 ou com o DDD entre parênteses.</p>')
        + '<div class="linha"><input id="px-chave" autocomplete="off" spellcheck="false" placeholder="chave Pix" style="' + inp + '"></div>'
        + '<div class="linha"><input id="px-nome" autocomplete="off" placeholder="nome de quem recebe" maxlength="25" style="' + inp + '"><input id="px-cidade" autocomplete="off" placeholder="cidade" maxlength="15" style="' + inp + ';flex:0 1 160px;min-width:120px"></div>'
        + '<div class="linha"><button type="button" id="px-salvar" style="' + bt + '">Salvar</button>' + (j.chave ? '<button type="button" id="px-off" style="' + bt + '">Desligar o Pix</button>' : '') + '</div></div>';
      px.innerHTML = h + '<p class="msg" id="px-msg"></p>';
      var m = document.getElementById('px-msg');
      function diz(ok, t){ m.className = 'msg ' + (ok ? 'ok' : 'erro'); m.textContent = t; }
      document.getElementById('px-salvar').onclick = function(){ var b = this; b.disabled = true;
        post('/api/admin/pix', { chave: document.getElementById('px-chave').value, nome: document.getElementById('px-nome').value, cidade: document.getElementById('px-cidade').value })
          .then(function(){ pix(); }, function(e){ diz(false, (e && e.erro) || 'Não foi possível.'); b.disabled = false; }); };
      var off = document.getElementById('px-off');
      if (off) off.onclick = function(){ if (confirm('Desligar o pagamento por Pix? A página de assinatura deixa de mostrar o QR Code.')) post('/api/admin/pix', { acao: 'desligar' }).then(pix); };
    }).catch(function(){ px.innerHTML = '<p class="vazio">Não foi possível carregar.</p>'; });
  }
  pix();
  pagamentos();
  capital();
  email();
  avisos();
  carregar();
})();
</script></body></html>`;

const PAGINA_CONTA = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Minha conta | Mercado Macro</title>
<meta name="robots" content="noindex">
<link rel="icon" type="image/png" href="/icone-mercado-macro.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${BASE_CSS}
main{max-width:420px;margin:0 auto;padding:28px 16px 48px}
header{display:flex;align-items:center;gap:12px;margin-bottom:18px}
header h1{font-size:19px;margin:0;flex:1}
a.vol{color:var(--accent-text);font-size:13px}
form{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px}
label{display:block;font-size:13px;color:var(--text-2);margin:12px 0 5px}label:first-child{margin-top:0}
input{width:100%;background:var(--surface-2);border:1px solid var(--line-2);border-radius:8px;color:var(--text);padding:10px 12px;min-height:42px}
input:focus{outline:2px solid var(--accent);outline-offset:1px}
button{margin-top:16px;width:100%;background:var(--accent);color:var(--on-accent);border:0;border-radius:8px;padding:11px;font-weight:700;cursor:pointer;min-height:44px}
button:disabled{opacity:.6;cursor:default}
.nota{color:var(--text-3);font-size:12.5px;margin:12px 0 0}
h2{font-size:15px;margin:22px 0 10px}
.nota a{color:var(--text-2)}
button.del{background:transparent;color:var(--neg);border:1px solid var(--neg)}
</style></head><body><main>
<header><h1>Minha conta</h1><a class="vol" href="/">Voltar ao site</a></header>
<h2>Trocar senha</h2>
<form id="f" novalidate>
  <label for="atual">Senha atual</label><input id="atual" type="password" autocomplete="current-password" required>
  <label for="nova">Senha nova (mínimo 8 caracteres)</label><input id="nova" type="password" autocomplete="new-password" required minlength="8">
  <label for="nova2">Repita a senha nova</label><input id="nova2" type="password" autocomplete="new-password" required minlength="8">
  <button type="submit">Salvar senha nova</button>
  <p class="msg" id="msg" role="status" aria-live="polite"></p>
  <p class="nota">Ao trocar, os outros aparelhos onde você estava conectado saem da conta. Este continua conectado.</p>
</form>
<h2>Excluir minha conta</h2>
<form id="fx" novalidate>
  <p class="nota" style="margin-top:0">Apaga de vez seu nome, e-mail e senha do Mercado Macro e desconecta todos os aparelhos. Não dá para desfazer. Os ajustes guardados neste navegador não são afetados. Veja a <a href="/privacidade">política de privacidade</a>.</p>
  <label for="sx">Digite sua senha para confirmar</label><input id="sx" type="password" autocomplete="current-password" required>
  <button type="submit" class="del">Excluir minha conta</button>
  <p class="msg" id="msgx" role="status" aria-live="polite"></p>
</form>
</main>
<script>
(function(){
  var f = document.getElementById('f'), msg = document.getElementById('msg');
  function diz(ok, t){ msg.className = 'msg ' + (ok ? 'ok' : 'erro'); msg.textContent = t; }
  f.addEventListener('submit', function(e){
    e.preventDefault();
    var atual = f.atual.value, nova = f.nova.value;
    if (!atual) return diz(false, 'Digite a senha atual.');
    if (nova.length < 8) return diz(false, 'A senha nova precisa ter pelo menos 8 caracteres.');
    if (nova !== f.nova2.value) return diz(false, 'As duas senhas novas não são iguais.');
    var b = f.querySelector('button'); b.disabled = true; diz(true, '');
    fetch('/api/auth/senha', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ atual: atual, nova: nova }) })
      .then(function(r){ return r.json().then(function(j){ if (!r.ok) throw j; }); })
      .then(function(){ f.reset(); diz(true, 'Senha trocada. Use a nova senha da próxima vez que entrar.'); })
      .catch(function(j){ diz(false, (j && j.erro) || 'Não foi possível. Tente de novo.'); })
      .then(function(){ b.disabled = false; });
  });
  var fx = document.getElementById('fx'), mx = document.getElementById('msgx');
  fx.addEventListener('submit', function(e){
    e.preventDefault();
    var s = fx.sx.value;
    if (!s) { mx.className = 'msg erro'; mx.textContent = 'Digite sua senha.'; return; }
    if (!confirm('Excluir sua conta de vez? Não dá para desfazer.')) return;
    var b = fx.querySelector('button'); b.disabled = true; mx.textContent = '';
    fetch('/api/auth/excluir', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senha: s }) })
      .then(function(r){ return r.json().then(function(j){ if (!r.ok) throw j; }); })
      .then(function(){ document.querySelector('main').innerHTML = '<h1>Conta excluída</h1><p class="nota">Seus dados foram apagados. Obrigado por ter usado o Mercado Macro.</p><p class="nota"><a href="/">Ir para o início</a></p>'; })
      .catch(function(j){ mx.className = 'msg erro'; mx.textContent = (j && j.erro) || 'Não foi possível. Tente de novo.'; b.disabled = false; });
  });
})();
</script></body></html>`;

// o módulo da assinatura usa estas utilidades (o arquivo principal do worker só pode exportar o handler)
ligarAssinatura({ json, html, mesmaOrigem, config, salvarConfig, enviarEmail, avisar, escH, BASE_CSS, lerCookie, sha256hex, limparCacheSessao });
