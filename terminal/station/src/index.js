import { buscarAtivos } from './busca-ativos.js';
export { CapitalRelay } from './capital.js';
import { noticiasCache, noticiasSoCache } from './noticias.js';
import { respostaSelic } from './selic-publica.js';
import { ligarComunicado, apiComunicado, paginaSairDaLista } from './comunicado.js';
import { ligarBoasVindas, apiBoasVindas } from './boasvindas.js';
import { apiAssistente, apiAdminAssistente, ligarAssistente } from './assistente.js';
import { apiCartao, apiAdminStripe, webhookStripe, situacaoCartao, stripeLigado, ligarStripe } from './stripe.js';
import { PLANOS, planosVitrine, ligarAssinatura, emailsDeTeste, garantirAssinatura, contaDaSessao, apiAssinatura, apiAdminAssinatura, paginaAssinar, rotinaAssinaturas, GRATIS_DIAS, registrar, normalizarCelular } from './assinatura.js';
import { salvarFechamento, paginaFechamentoPublico, diasParaSitemap, completarJuros } from './fechamento-publico.js';
import { paginaBalanca } from './balanca-publica.js';
/* Mercado Macro: porteiro do site.
   Só entra quem tem cadastro liberado pelo administrador. Sem login, a pessoa vê apenas /entrar.
   Usuários e sessões ficam no banco D1 "mercadomacro-usuarios" (binding DB).
   Senhas: PBKDF2-SHA256 com sal. Sessão: cookie HttpOnly; no banco fica só o hash do token. */

const COOKIE = 'mm_s';
const SESSAO_DIAS = 90;
const SESSAO_DIAS_ADMIN = 30; // conta de administrador: sessão mais curta (auditoria de 28/10/2026)
// cada conta fica aberta em até 2 aparelhos; o 3º login encerra a sessão mais antiga (30/10/2026, contra senha dividida)
const LIMITE_APARELHOS = 2;
const ALERTA_TROCAS = 4; // trocas de aparelho em 7 dias que aparecem no /admin como possível senha dividida
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
const ROTAS_LOGADO = /^\/(admin|conta|fechamento|abertura|assinar)$/;
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
    // todo dia às 9h17 (Brasília): avisa por e-mail quem vence em 3 dias e desativa quem venceu (src/assinatura.js)
    // a cada 15 minutos: notícias de alto impacto no canal público do Telegram;
    // no minuto 15 de cada hora dispara o vigia (o agendador do GitHub chega a pular 5 a 10 horas);
    // às 12:15 UTC também roda a rotina das assinaturas e a abertura do mercado
    if (ev.cron === '*/15 * * * *') {
      const quando = new Date(ev.scheduledTime);
      // às 12:15 UTC a rodada já leva assinaturas, vigia e abertura; as notícias ficam para a próxima
      if (!(quando.getUTCHours() === 12 && quando.getUTCMinutes() === 15)) ctx.waitUntil(noticiasNoCanal(env, ctx).catch((e) => console.error('notícias no canal:', e.message)));
      if (quando.getUTCMinutes() !== 15) return;
      ctx.waitUntil(dispararRobo(env, 'vigia.yml', {}));
      if (quando.getUTCHours() === 12) {
        ctx.waitUntil(rotinaAssinaturas(env).catch((e) => console.error('assinaturas:', e.message)));
        // 9h15 de Brasília em dia útil: robô da abertura do mercado (canal público do Telegram)
        if (quando.getUTCDay() >= 1 && quando.getUTCDay() <= 5 && !feriadoB3(new Date(quando - 3 * 3600000).toISOString().slice(0, 10))) ctx.waitUntil(dispararRobo(env, 'abertura.yml', { site: true }));
      }
      return;
    }
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
      if (p === '/api/robo/passe') return await passeDoRobo(req, env);
      if (p === '/api/stripe/webhook') return await webhookStripe(req, env);
      if (p === '/api/robo/fechamento') return await roboFechamento(req, env);
      if (p === '/api/robo/abertura') return await roboAbertura(req, env);
      if (p === '/robots.txt') return texto(ROBOTS, 'text/plain');
      if (p === '/sitemap.xml') return await naBorda(req, ctx, async () => texto(await sitemap(env), 'application/xml'));
      if (p === '/api/publico/selic') return await respostaSelic(req, ctx);
      if (p === '/api/publico/serie') return await serieCincoDias(req, ctx);
      if (p === '/api/publico/passe-chave') return json(await chavePublicaPasse(env), 200, { 'Cache-Control': 'public, max-age=3600' });
      if (p === '/fechamento-do-mercado' || p.startsWith('/fechamento-do-mercado/')) return await naBorda(req, ctx, () => paginaFechamentoPublico(req, env, ctx, p, dadosFechamento, jurosTesouro, () => paginaFixa(req, env, '/vitrine/404', 404)));
      if (p === '/balanca-comercial') { if (navegacao(req)) contar(env, ctx, req, 'balanca'); return await naBorda(req, ctx, paginaBalanca); }
      if (p === '/privacidade') return paginaFixa(req, env, '/vitrine/privacidade', 200);
      if (p === '/planos' || p === '/termos') return await paginaPlanos(req, env);
      if (p === '/telegram') return await irParaCanal(req, env, ctx, url);
      if (p === '/api/publico/canal') return await previaCanal(env);
      if (p === '/confirmar') return await paginaConfirmar(req, env, ctx);
      if (p === '/esqueci') return paginaEsqueci();
      if (p === '/sair-da-lista') return await paginaSairDaLista(req, env, paginaLink);
      if (p === '/nova-senha') return await paginaNovaSenha(req, env);
      if (PUBLICAS[p]) { if (navegacao(req)) contar(env, ctx, req, PUBLICAS[p][1]); return paginaFixa(req, env, PUBLICAS[p][0], 200); }
      if (p.startsWith('/api/auth/')) return await apiAuth(req, env, p.slice(10), ctx);
      if (PUBLICO.test(p)) return env.ASSETS.fetch(req);

      const u = await usuarioDaSessao(req, env);
      // conta que entrou mas não tem acesso (aguardando liberação ou validade vencida): só a página de assinatura
      const conta = u ? { ...u, status: 'ativo' } : await contaDaSessao(req, env);
      if (conta) {
        if (p === '/assinar') return paginaAssinar();
        if (p === '/conta') return html(PAGINA_CONTA); // trocar senha e excluir a conta valem mesmo com o acesso vencido
        if ((p === '/api/assinatura/cartao' || p === '/api/assinatura/cartao-gerenciar') && req.method === 'POST' && mesmaOrigem(req)) return await apiCartao(req, env, conta, p.slice(16));
        if (p === '/api/assinatura' || p.startsWith('/api/assinatura/')) return await apiAssinatura(req, env, conta, p.slice(16).replace(/^\//, ''));
      }
      if (!u && conta) return navegacao(req) ? redirect('/assinar') : json({ erro: 'Seu acesso não está ativo.', assinar: true }, 403);
      if (!u && (await foiDerrubada(req, env))) {
        // a conta entrou em outro aparelho e esta sessão foi encerrada: volta ao login com o aviso
        const limpa = cookieSessao('', 0);
        if (navegacao(req)) return new Response(null, { status: 302, headers: { Location: '/entrar?aparelho=1', 'Cache-Control': 'no-store', 'Set-Cookie': limpa } });
        return json({ erro: 'Sua conta foi aberta em outro aparelho. Entre de novo.', codigo: 'aparelho' }, 401, { 'X-MM-Sessao': 'aparelho', 'Set-Cookie': limpa });
      }
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
      if (p === '/fechamento' || p.startsWith('/fechamento/') || p === '/abertura' || p.startsWith('/abertura/')) { if (!u.admin) return redirect('/'); }
      if (p === '/conta') return html(PAGINA_CONTA);
      if (p === '/api/ativos/buscar') {
        // cada busca nova consulta o Yahoo: limite por conta
        if (!(await dentroDoLimite(env, 'busca:' + u.id, 120, 600))) return json({ erro: 'Muitas buscas seguidas. Espere alguns minutos.' }, 429);
        return await buscarAtivos(req);
      }
      if (p === '/api/conta/dados') return await apiDados(req, env, u);
      if (p === '/api/passe') return await emitirPasse(env, u);
      if (p === '/api/assistente') return await apiAssistente(req, env, u, soGratis(u));
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
      out.headers.set('X-Content-Type-Options', 'nosniff');
      if ((out.headers.get('Content-Type') || '').includes('text/html')) {
        out.headers.set('X-Frame-Options', 'DENY');
        out.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
        out.headers.set('Referrer-Policy', 'same-origin');
      }
      return out;
    } catch (e) {
      return json({ erro: 'Erro no servidor. Tente de novo.' }, 500);
    }
  },
};

// páginas públicas iguais para todos: guarda 10 minutos no servidor da Cloudflare (poupa leituras do banco)
async function naBorda(req, ctx, gerar) {
  if (req.method !== 'GET') return gerar();
  const chave = new Request(new URL(req.url).origin + new URL(req.url).pathname);
  const salvo = await caches.default.match(chave);
  if (salvo) return salvo;
  const r = await gerar();
  if (r.status === 200) {
    const c = new Response(r.clone().body, r);
    c.headers.set('Cache-Control', 'public, max-age=600');
    ctx.waitUntil(caches.default.put(chave, c).catch(() => {}));
  }
  return r;
}

/* ---------------- contador de visitas (só números por dia, nada pessoal) ---------------- */
const ROBO = /bot|crawl|spider|slurp|lighthouse|headless|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|node-fetch|vigia/i;
const diaBrasilia = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
function contar(env, ctx, req, tipo) {
  if (ROBO.test(req.headers.get('User-Agent') || '')) return;
  const dia = diaBrasilia();
  ctx.waitUntil(env.DB.prepare('INSERT INTO visitas (dia, tipo, n) VALUES (?, ?, 1) ON CONFLICT(dia, tipo) DO UPDATE SET n = n + 1')
    .bind(dia, tipo).run().catch(() => {}));
  // de onde veio a visita às páginas públicas (só o site de origem, nada da pessoa)
  if (tipo !== 'terminal') {
    const u = new URL(req.url);
    contarOrigem(env, ctx, origemDe(req.headers.get('Referer'), u.searchParams.get('utm_source') || u.searchParams.get('origem')), 'visita');
  }
}
/* ---------------- de onde vêm os visitantes (26/10/2026) ----------------
   Guarda por dia só o nome do site que mandou a pessoa (Google, Telegram, WhatsApp...), vindo do cabeçalho
   Referer ou de ?utm_source= / ?origem= no link. Sem IP, sem endereço completo, sem ligar a ninguém.
   tipo 'visita' = abriu a vitrine ou uma página pública; 'cadastro' = pediu acesso (a vitrine manda a origem da sessão). */
const ORIGENS = [
  [/^mail\.google\.|android\.gm$|outlook\.|(^|\.)mail\./, 'E-mail'], [/(^|\.)google\.|googlequicksearchbox/, 'Google'], [/(^|\.)bing\.com$/, 'Bing'], [/duckduckgo/, 'DuckDuckGo'], [/(^|\.)yahoo\./, 'Yahoo'],
  [/(^|\.)t\.me$|telegram/, 'Telegram'], [/whatsapp|(^|\.)wa\.me$/, 'WhatsApp'], [/instagram/, 'Instagram'], [/facebook|(^|\.)fb\.(com|me)$|katana$/, 'Facebook'],
  [/(^|\.)t\.co$|twitter|(^|\.)x\.com$/, 'X (Twitter)'], [/youtube|youtu\.be/, 'YouTube'], [/linkedin|lnkd\.in/, 'LinkedIn'], [/reddit/, 'Reddit'],
  [/tiktok|musically/, 'TikTok'], [/discord/, 'Discord'], [/chatgpt|openai/, 'ChatGPT'], [/perplexity/, 'Perplexity'], [/mercadomacro\.github\.io/, 'Site antigo (GitHub)'],
];
function origemDe(ref, utm) {
  const nome = (h) => { for (const [re, n] of ORIGENS) if (re.test(h)) return n; return null; };
  const u = String(utm || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30);
  if (u) return nome(u) || 'Link: ' + u;
  let h = '';
  try { h = new URL(String(ref || '')).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { /* sem origem */ }
  if (!h) return 'Direto ou app';
  if (h === 'mercadomacro.com.br' || h.endsWith('.mercadomacro.com.br') || h.endsWith('.workers.dev') || h === 'localhost') return null; // andou dentro do site
  return nome(h) || h.slice(0, 60);
}
let tabelaOrigens = false;
function contarOrigem(env, ctx, origem, tipo) {
  if (!origem) return;
  const dia = diaBrasilia();
  ctx.waitUntil((async () => {
    if (!tabelaOrigens) {
      await env.DB.prepare('CREATE TABLE IF NOT EXISTS origens (dia TEXT NOT NULL, origem TEXT NOT NULL, tipo TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, origem, tipo))').run();
      tabelaOrigens = true;
    }
    await env.DB.prepare('INSERT INTO origens (dia, origem, tipo, n) VALUES (?, ?, ?, 1) ON CONFLICT(dia, origem, tipo) DO UPDATE SET n = n + 1').bind(dia, origem, tipo).run();
  })().catch(() => {}));
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
  const org = await env.DB.prepare(`SELECT origem, SUM(CASE WHEN tipo = 'visita' THEN n ELSE 0 END) v, SUM(CASE WHEN tipo = 'cadastro' THEN n ELSE 0 END) c
    FROM origens WHERE dia BETWEEN ? AND ? GROUP BY origem ORDER BY v DESC, c DESC LIMIT 6`).bind(de, ate).all().then((r) => r.results).catch(() => []);
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
    ...(org.length ? ['De onde vieram (visitas / pedidos de acesso):', ...org.map((o) => `- ${o.origem}: ${o.v} / ${o.c}`), ''] : []),
    `Aguardando liberação agora: ${pend}${pend ? ' (https://mercadomacro.com.br/admin)' : ''}`,
    `Usuários liberados no total: ${ativos}`,
    '',
    'Mais detalhes (países, aparelhos): painel da Cloudflare > Web Analytics.',
  ].join('\n') + await especuladores();
  const enviado = await avisar(env, 'Resumo semanal do Mercado Macro', txt);
  await env.DB.prepare('DELETE FROM visitas WHERE dia < ?').bind(new Date(hoje.getTime() - 400 * 86400000).toISOString().slice(0, 10)).run();
  await env.DB.prepare('DELETE FROM origens WHERE dia < ?').bind(new Date(hoje.getTime() - 400 * 86400000).toISOString().slice(0, 10)).run().catch(() => {});
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
  ['euro', 'Euro', 'EURBRL=X'], ['tnx', 'Treasury 10 anos', '^TNX'], ['stoxx', 'Euro Stoxx 50', '^STOXX50E'],
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
    const req = new Request(await urlDados(env, '/tesouro'), { headers: { Origin: ORIGEM_SITE } });
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
    const req = new Request(await urlDados(env, rota), { headers: { Origin: ORIGEM_SITE } });
    const r = env.API ? await env.API.fetch(req) : await fetch(req);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  };
  const meta = (j, s) => {
    const m = j?.[s]?.chart?.result?.[0]?.meta;
    if (!m || typeof m.regularMarketPrice !== 'number') return null;
    const ant = m.chartPreviousClose ?? m.previousClose;
    const dia = m.regularMarketTime ? new Date((m.regularMarketTime + (m.gmtoffset || 0)) * 1000).toISOString().slice(0, 10) : null;
    return { v: m.regularMarketPrice, ch: ant ? (m.regularMarketPrice / ant - 1) * 100 : null, dia, a: ant ?? null };
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
  // sem cotação do Ibovespa não dá para saber se houve pregão (o robô tenta de novo mais tarde)
  out.semDados = out.cards.ibov.v == null;
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
  out.fluxo = await fluxoEstrangeiro();
  // IPCA em 12 meses (Banco Central, série 13522), para o texto do canal
  try {
    const j = await api('/bcb?c=13522&q=' + encodeURIComponent('/ultimos/1'));
    const v = parseFloat(j?.[0]?.valor);
    if (isFinite(v)) out.juros.ipca12 = v;
  } catch (e) { /* fica de fora */ }
  out.noticias = await noticiasDoDia().catch(() => []);
  out.notAcoes = await noticiasDasAcoes([...out.altas, ...out.baixas].map((a) => a.t)).catch(() => ({}));
  return out;
}
// lista de notícias do site (cache) ou do worker antigo; só links http(s)
async function listaNoticias() {
  let lista = await noticiasSoCache();
  if (!lista) {
    const r = await fetch('https://news.cota-cotacao10.workers.dev/', { cf: { cacheTtl: 120 } });
    if (!r.ok) return [];
    lista = await r.json();
  }
  return Array.isArray(lista) ? lista.filter((n) => n && /^https?:\/\//i.test(n.link || '')) : [];
}
// para cada ação das maiores altas e baixas: a notícia do dia (fonte em português) que cita o código dela
async function noticiasDasAcoes(tickers) {
  const lista = await listaNoticias();
  const desde = Date.now() - 16 * 3600000;
  const out = {};
  for (const t of tickers) {
    const re = new RegExp('\\b' + t + '\\b', 'i');
    const n = lista.filter((x) => x.titulo && +x.data >= desde && FONTES_PT.has(x.fonte) && re.test(x.titulo)).sort((a, b) => b.data - a.data)[0];
    if (n) out[t] = { t: n.titulo.trim(), f: (n.fonte === 'Google News' ? n.veiculo : n.fonte) || '' };
  }
  return out;
}
// principais notícias do dia: as de maior nota da aba Notícias (worker news, mesmas fontes e mesma nota do site),
// publicadas nas últimas 16 horas, sem repetir assunto e só em português (título traduzido ou fonte brasileira)
const FONTES_PT = new Set(['Valor Econômico', 'InfoMoney', 'Investing.com BR', 'ADVFN BR', 'Notícia Brasil', 'BeInCrypto BR', 'Cointelegraph BR', 'Google News', 'Money Times', 'InvestNews', 'Valor Investe', 'Bloomberg Línea', 'Suno', 'BMC News']);
async function noticiasDoDia() {
  // usa a lista do site se estiver no cache (ler os 25 feeds aqui passaria do limite de pedidos do fechamento)
  const lista = await listaNoticias();
  if (!lista.length) return [];
  const desde = Date.now() - 16 * 3600000;
  const PT = FONTES_PT;
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
// saldo do investidor estrangeiro na B3 (fluxo.json do robô da B3): último dia, mês e ano, em R$ mil; null se falhar
async function fluxoEstrangeiro() {
  try {
    const f = await (await fetch('https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/fluxo/fluxo.json', { cf: { cacheTtl: 120 } })).json();
    const ult = f.dias[f.dias.length - 1], mes = ult.data.slice(0, 7), ano = ult.data.slice(0, 4);
    return {
      data: ult.data,
      dia: ult.tipos?.estrangeiro?.saldo ?? null,
      mes: f.meses?.[mes]?.tipos?.estrangeiro?.saldo ?? null,
      ano: (() => {
        const v = Object.entries(f.meses || {}).filter(([k]) => k.startsWith(ano)).map(([, m]) => m.tipos?.estrangeiro?.saldo).filter((x) => typeof x === 'number');
        return v.length ? v.reduce((a, b) => a + b, 0) : null;
      })(),
    };
  } catch (e) { return null; }
}
// feriados sem pregão na B3 (nacionais, Carnaval, Sexta-feira Santa, Corpus Christi, 24 e 31 de dezembro);
// mesma conta de terminal/curva/gerar_curva.py
function feriadoB3(iso) {
  const a = +iso.slice(0, 4);
  // Páscoa (algoritmo de Meeus/Jones/Butcher)
  const g = a % 19, b = Math.floor(a / 100), c = a % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), gg = Math.floor((b - f + 1) / 3), h = (19 * g + b - d - gg + 15) % 30;
  const l = (32 + 2 * e + 2 * Math.floor(c / 4) - h - (c % 4)) % 7, m = Math.floor((g + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  const p = Date.UTC(a, mes - 1, dia);
  const rel = (n) => new Date(p + n * 864e5).toISOString().slice(5, 10);
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-24', '12-25', '12-31'];
  return fixos.includes(iso.slice(5, 10)) || [-48, -47, -2, 60].map(rel).includes(iso.slice(5, 10));
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
/* ---------------- abertura do mercado ----------------
   Cartão da manhã (/abertura, só administrador): futuros de Nova York, Europa e Ásia agora, dólar, commodities,
   como o Ibovespa fechou no último pregão, agenda do dia (Brasil e EUA) e notícias. O admin baixa ou manda no Telegram.
   Valor que falhar fica null e aparece como "—"; nada é inventado. */
const ABRE_CARDS = [
  ['ibov', 'Ibovespa', '^BVSP'], ['ewz', 'EWZ (Brasil em NY)', 'EWZ'], ['dolar', 'Dólar', 'BRL=X'], ['dxy', 'DXY', 'DX-Y.NYB'],
  ['spf', 'S&P 500 futuro', 'ES=F'], ['nqf', 'Nasdaq futuro', 'NQ=F'], ['dowf', 'Dow futuro', 'YM=F'], ['tnx', 'Treasury 10 anos', '^TNX'],
  ['stoxx', 'Euro Stoxx 50', '^STOXX50E'], ['dax', 'DAX (Alemanha)', '^GDAXI'], ['ftse', 'FTSE (Londres)', '^FTSE'],
  ['nikkei', 'Nikkei (Japão)', '^N225'], ['hsi', 'Hang Seng', '^HSI'], ['xangai', 'Xangai', '000001.SS'],
  ['brent', 'Petróleo Brent', 'BZ=F'], ['ouro', 'Ouro', 'GC=F'], ['btc', 'Bitcoin', 'BTC-USD'],
];
async function dadosAbertura(env) {
  const api = async (rota) => {
    const req = new Request(await urlDados(env, rota), { headers: { Origin: ORIGEM_SITE } });
    const r = env.API ? await env.API.fetch(req) : await fetch(req);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  };
  const meta = (j, s) => {
    const m = j?.[s]?.chart?.result?.[0]?.meta;
    if (!m || typeof m.regularMarketPrice !== 'number') return null;
    const ant = m.chartPreviousClose ?? m.previousClose;
    const dia = m.regularMarketTime ? new Date((m.regularMarketTime + (m.gmtoffset || 0)) * 1000).toISOString().slice(0, 10) : null;
    return { v: m.regularMarketPrice, ch: ant ? (m.regularMarketPrice / ant - 1) * 100 : null, a: ant ?? null, dia };
  };
  const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const out = { data: hoje, gerado: new Date().toISOString(), cards: {}, agenda: [], agendaCanal: [], semana: [] };
  const [jc, cal] = await Promise.all([
    api('/quotes?symbols=' + ABRE_CARDS.map((c) => encodeURIComponent(c[2])).join(',')).catch(() => ({})),
    api('/calendar').catch(() => null),
  ]);
  for (const [k, nome, s] of ABRE_CARDS) out.cards[k] = { nome, ...(meta(jc, s) || { v: null, ch: null, a: null, dia: null }) };
  // agenda de hoje (horário de Brasília): Brasil de média e alta importância, EUA só alta
  if (Array.isArray(cal)) {
    const PAIS = { BRL: 'BR', USD: 'EUA', BR: 'BR', US: 'EUA' };
    out.agenda = cal.map((e) => {
      const t = Date.parse(e.date);
      const p = PAIS[e.country];
      if (!p || !isFinite(t)) return null;
      const b = new Date(t - 3 * 3600000);
      if (b.toISOString().slice(0, 10) !== hoje) return null;
      if (!(e.impact === 'High' || (p === 'BR' && e.impact === 'Medium'))) return null;
      return { t, hora: b.toISOString().slice(11, 16), pais: p, titulo: String(e.title || '').slice(0, 90), proj: String(e.forecast || '').slice(0, 14), ant: String(e.previous || '').slice(0, 14) };
    }).filter(Boolean).sort((a, b) => a.t - b.t).slice(0, 8).map(({ t, ...x }) => x);
  }
  // para o texto do canal: hoje com as outras economias grandes (só alta importância; Brasil também média)
  // e o resto da semana (Brasil e EUA, alta importância)
  if (Array.isArray(cal)) {
    const PAISC = { BRL: 'BR', USD: 'EUA', EUR: 'Zona do euro', GBP: 'Reino Unido', JPY: 'Japão', CNY: 'China' };
    const evs = cal.map((e) => {
      const t = Date.parse(e.date), p = PAISC[e.country];
      if (!p || !isFinite(t) || !e.title) return null;
      if (!(e.impact === 'High' || (p === 'BR' && e.impact === 'Medium'))) return null;
      const b = new Date(t - 3 * 3600000);
      return { t, dia: b.toISOString().slice(0, 10), hora: b.toISOString().slice(11, 16), pais: p, titulo: String(e.title).slice(0, 90), proj: String(e.forecast || '').slice(0, 14), alta: e.impact === 'High' };
    }).filter(Boolean).sort((a, b) => a.t - b.t);
    out.agendaCanal = evs.filter((e) => e.dia === hoje).slice(0, 10).map(({ t, dia, alta, ...x }) => x);
    const fimSemana = new Date(Date.parse(hoje + 'T12:00:00Z') + (6 - new Date(hoje + 'T12:00:00Z').getUTCDay()) * 86400000).toISOString().slice(0, 10);
    const porDia = {};
    for (const e of evs) {
      if (!(e.dia > hoje && e.dia < fimSemana && e.alta && (e.pais === 'BR' || e.pais === 'EUA'))) continue;
      const l = (porDia[e.dia] = porDia[e.dia] || []);
      if (l.length < 5 && !l.some((x) => x.titulo === e.titulo && x.pais === e.pais)) l.push({ pais: e.pais, titulo: e.titulo });
    }
    out.semana = Object.keys(porDia).sort().map((dia) => ({ dia, eventos: porDia[dia] }));
  }
  out.agendaOk = Array.isArray(cal);
  [out.noticias, out.fluxo] = await Promise.all([noticiasDoDia().catch(() => []), fluxoEstrangeiro()]);
  return out;
}
function textoAbertura(d, curto) {
  const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const pct = (v) => (v == null || !isFinite(v) ? '' : ` (${v > 0 ? '+' : v < 0 ? '−' : ''}${brn(Math.abs(v), 2)}%)`);
  const c = d.cards;
  const l = (k, fmt, nome) => `${nome || c[k].nome}: ${c[k].v != null ? fmt(c[k].v) + pct(c[k].ch) : '—'}`;
  const n0 = (v) => brn(v, 0), n2 = (v) => brn(v, 2);
  const linhas = [
    `Mercado Macro | Abertura de ${ddmm(d.data)}`,
    '',
    l('ibov', (v) => brn(v, 0) + ' pts', `Ibovespa (fechamento${c.ibov.dia ? ' de ' + ddmm(c.ibov.dia) : ''})`),
    l('dolar', (v) => 'R$ ' + brn(v, 4)), l('ewz', (v) => 'US$ ' + n2(v)),
    '', 'Futuros em Nova York', l('spf', n2, 'S&P 500'), l('nqf', n2, 'Nasdaq'), l('dowf', n0, 'Dow Jones'),
  ];
  if (!curto) {
    linhas.push('', 'Europa', l('stoxx', n2), l('dax', n2), l('ftse', n2),
      '', 'Ásia (fechamento)', l('nikkei', n0), l('hsi', n0), l('xangai', n2),
      '', l('brent', (v) => 'US$ ' + n2(v)), l('ouro', (v) => 'US$ ' + n0(v)), l('btc', (v) => 'US$ ' + n0(v)),
      `Treasury 10 anos: ${c.tnx.v != null ? n2(c.tnx.v) + '%' : '—'}`);
    if (d.agenda && d.agenda.length) linhas.push('', 'Agenda de hoje', ...d.agenda.map((a) => `${a.hora} ${a.pais} ${a.titulo}${a.proj ? ` (proj. ${a.proj})` : ''}`));
    if (d.noticias && d.noticias.length) linhas.push('', 'Principais notícias', ...d.noticias.map((n) => `- ${n.t}${n.f ? ` (${n.f})` : ''}`));
  }
  linhas.push('', 'Painel completo: https://mercadomacro.com.br');
  return linhas.join('\n');
}
// abertura no canal público: só texto (HTML do Telegram), no modelo que o Severino escolheu
function textoCanalAbertura(d) {
  const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const BAND = { BR: '🇧🇷', EUA: '🇺🇸', 'Zona do euro': '🇪🇺', 'Reino Unido': '🇬🇧', 'Japão': '🇯🇵', China: '🇨🇳' };
  const e = (t) => String(t).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const pct = (v) => (v == null || !isFinite(v) ? '' : ` (${v > 0 ? '+' : v < 0 ? '−' : ''}${brn(Math.abs(v), 2)}%)`);
  const c = d.cards;
  const l = (k, fmt, nome) => `• ${e(nome || (c[k] && c[k].nome) || k)}: ${c[k] && c[k].v != null ? fmt(c[k].v) + pct(c[k].ch) : '—'}`;
  const n0 = (v) => brn(v, 0), n2 = (v) => brn(v, 2);
  const tnx = c.tnx || {};
  const bp = tnx.v != null && tnx.a != null ? Math.round((tnx.v - tnx.a) * 100) : null;
  const bi = (mil) => (mil == null ? '—' : `${mil > 0 ? '+' : mil < 0 ? '−' : ''}R$ ${brn(Math.abs(mil) / 1e6, 2)} bi`);
  const dt = new Date(d.data + 'T12:00:00Z');
  const L = [
    `☀️ <b>Abertura de mercado</b> — ${DIAS[dt.getUTCDay()]}, ${ddmm(d.data)}`,
    '', '<b>Ásia (fechamento)</b>',
    l('nikkei', n0, 'Nikkei (Japão)'), l('hsi', n0, 'Hang Seng (Hong Kong)'), l('xangai', n0, 'Xangai (China)'),
    '', '<b>Europa</b>',
    l('stoxx', n0), l('dax', n0), l('ftse', n0, 'FTSE 100 (Reino Unido)'),
    '', '<b>EUA (pré-abertura)</b>',
    l('spf', n0), l('nqf', n0), l('dowf', n0),
    `• Treasury 10Y: ${tnx.v != null ? n2(tnx.v) + '%' + (bp != null ? ` (${bp > 0 ? '+' : bp < 0 ? '−' : ''}${Math.abs(bp)} bp)` : '') : '—'}`,
    l('dxy', n2, 'DXY (dólar global)'),
    '', '<b>Brasil</b>',
    l('ibov', n0, 'Ibovespa (último fechamento)'), l('dolar', (v) => 'R$ ' + brn(v, 4)), l('ewz', (v) => 'US$ ' + n2(v), `EWZ (Brasil em NY${c.ewz && c.ewz.dia && c.ewz.dia !== d.data ? ', fechamento de ' + ddmm(c.ewz.dia) : ''})`),
  ];
  if (d.fluxo) L.push(`• Estrangeiro na B3 (até ${ddmm(d.fluxo.data)}): ${bi(d.fluxo.dia)} no dia, ${bi(d.fluxo.mes)} no mês, ${bi(d.fluxo.ano)} no ano`);
  L.push('', '<b>Commodities e cripto</b>',
    l('brent', (v) => 'US$ ' + n2(v)), l('ouro', (v) => 'US$ ' + n2(v)), l('btc', (v) => 'US$ ' + n0(v)));
  // agenda, radar e destaques: se a mensagem passar do limite do Telegram, saem itens inteiros do fim
  // (nunca se corta no meio de uma linha, o que quebraria o HTML)
  const ag = (d.agendaCanal || []).map((a) => `• ${a.hora} ${BAND[a.pais] || ''} ${e(a.titulo)}${a.proj ? ` (proj. ${e(a.proj)})` : ''}`);
  const sem = (d.semana || []).map((s) => `• ${CURTO[new Date(s.dia + 'T12:00:00Z').getUTCDay()]} ${ddmm(s.dia)}: ${s.eventos.slice(0, 3).map((x) => `${BAND[x.pais] || ''} ${e(x.titulo)}`).join(', ')}`);
  const dest = (d.noticias || []).slice(0, 4).map((n) => `• ${e(n.t)}${n.f ? ` (${e(n.f)})` : ''}`);
  const fim = ['', 'Painel completo: <a href="https://mercadomacro.com.br">mercadomacro.com.br</a>'];
  const monta = () => [...L,
    ...(ag.length ? ['', '🗓️ <b>Agenda de hoje (horário de Brasília)</b>', ...ag] : []),
    ...(sem.length ? ['', '<b>No radar da semana</b>', ...sem] : []),
    ...(dest.length ? ['', '<b>Destaques</b>', ...dest] : []), ...fim].join('\n');
  let t = monta();
  while (t.length > 3900 && (sem.length || dest.length || ag.length)) { (sem.length ? sem : dest.length ? dest : ag).pop(); t = monta(); }
  return t;
}
// destino 'canal' = canal público do Telegram (config tg_canal); sem destino = conversa do administrador
// fechamento no canal público: só texto (HTML do Telegram), no modelo que o Severino escolheu
function textoCanalFechamento(d) {
  const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const e = (t) => String(t).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  const dt = new Date(d.data + 'T12:00:00Z');
  const pct = (v) => (v == null || !isFinite(v) ? '' : ` (${v > 0 ? '+' : v < 0 ? '−' : ''}${brn(Math.abs(v), 2)}%)`);
  const c = d.cards, j = d.juros || {};
  const l = (k, fmt, nome) => `• ${e(nome || (c[k] && c[k].nome) || k)}: ${c[k] && c[k].v != null ? fmt(c[k].v) + pct(c[k].ch) : '—'}`;
  const acao = (a) => {
    const n = d.notAcoes && d.notAcoes[a.t];
    return `• ${a.t}: R$ ${brn(a.v, 2)}${pct(a.ch)}` + (n ? `\n   ↳ ${e(n.t)}${n.f ? ` (${e(n.f)})` : ''}` : '');
  };
  const tnx = c.tnx || {};
  const bp = tnx.v != null && tnx.a != null ? Math.round((tnx.v - tnx.a) * 100) : null;
  const bi = (mil) => (mil == null ? '—' : `${mil > 0 ? '+' : mil < 0 ? '−' : ''}R$ ${brn(Math.abs(mil) / 1e6, 2)} bi`);
  const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const L = [
    `🌙 <b>Fechamento de mercado</b> — ${DIAS[dt.getUTCDay()]}, ${ddmm(d.data)}${!d.pregao && d.pregaoDia ? ` (sem pregão hoje; números de ${ddmm(d.pregaoDia)})` : ''}`,
    '', '<b>Brasil</b>',
    l('ibov', (v) => brn(v, 0)), l('dolar', (v) => 'R$ ' + brn(v, 4)), l('euro', (v) => 'R$ ' + brn(v, 4)),
    `• Selic (meta): ${j.selic != null ? brn(j.selic, 2) + '% a.a.' : '—'}${j.ipca12 != null ? ` | IPCA (12 meses): ${brn(j.ipca12, 2)}%` : ''}`,
  ];
  if (d.altas && d.altas.length) L.push('', '📈 <b>Maiores altas do Ibovespa</b>', ...d.altas.slice(0, 3).map(acao));
  if (d.baixas && d.baixas.length) L.push('', '📉 <b>Maiores baixas do Ibovespa</b>', ...d.baixas.slice(0, 3).map(acao));
  L.push('', '<b>Exterior</b>',
    l('sp', (v) => brn(v, 2)), l('nasdaq', (v) => brn(v, 2)), l('dow', (v) => brn(v, 2)), l('stoxx', (v) => brn(v, 0)),
    `• Treasury 10Y: ${tnx.v != null ? brn(tnx.v, 2) + '%' + (bp != null ? ` (${bp > 0 ? '+' : bp < 0 ? '−' : ''}${Math.abs(bp)} bp)` : '') : '—'}`,
    '', '<b>Commodities e cripto</b>',
    l('brent', (v) => 'US$ ' + brn(v, 2)), l('ouro', (v) => 'US$ ' + brn(v, 2)), l('btc', (v) => 'US$ ' + brn(v, 0)),
    '', '<b>Juros no Tesouro</b>',
    `• ${e(j.pre ? j.pre.nome : 'Tesouro Prefixado')}: ${j.pre ? brn(j.pre.taxa, 2) + '% a.a.' : '—'}`,
    `• ${e(j.ipca ? j.ipca.nome : 'Tesouro IPCA+')}: ${j.ipca ? 'IPCA + ' + brn(j.ipca.taxa, 2) + '%' : '—'}`);
  if (d.fluxo) L.push('', `<b>Estrangeiro na B3</b> (até ${ddmm(d.fluxo.data)}; a B3 publica com atraso)`, `• No dia: ${bi(d.fluxo.dia)}`, `• No mês: ${bi(d.fluxo.mes)}`, `• No ano: ${bi(d.fluxo.ano)}`);
  L.push('', 'Painel completo: <a href="https://mercadomacro.com.br">mercadomacro.com.br</a>');
  return L.join('\n').slice(0, 4000);
}
async function telegramFoto(env, png, legenda, destino) {
  const c = await config(env);
  const chat = destino === 'canal' ? c.tg_canal : c.tg_chat;
  if (!(c.tg_token && chat)) return { ok: false, erro: destino === 'canal' ? 'Conecte o canal do Telegram primeiro (Ajustes, Avisos no Telegram).' : 'Conecte o Telegram primeiro.' };
  const fd = new FormData();
  fd.append('chat_id', chat);
  fd.append('caption', String(legenda || '').slice(0, 1024));
  fd.append('photo', new Blob([png], { type: 'image/png' }), 'fechamento.png');
  const r = await fetch(`https://api.telegram.org/bot${c.tg_token}/sendPhoto`, { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({ ok: false }));
  return j.ok ? { ok: true } : { ok: false, erro: 'O Telegram recusou a imagem.' };
}
// várias imagens numa postagem só (álbum); a legenda vai na primeira
async function telegramAlbum(env, pngs, legenda, destino) {
  if (pngs.length === 1) return telegramFoto(env, pngs[0], legenda, destino);
  const c = await config(env);
  const chat = destino === 'canal' ? c.tg_canal : c.tg_chat;
  if (!(c.tg_token && chat)) return { ok: false, erro: destino === 'canal' ? 'Conecte o canal do Telegram primeiro (Ajustes, Avisos no Telegram).' : 'Conecte o Telegram primeiro.' };
  const fd = new FormData();
  fd.append('chat_id', chat);
  fd.append('media', JSON.stringify(pngs.map((_, i) => ({ type: 'photo', media: 'attach://f' + i, ...(i === 0 && legenda ? { caption: String(legenda).slice(0, 1024) } : {}) }))));
  pngs.forEach((p, i) => fd.append('f' + i, new Blob([p], { type: 'image/png' }), 'pagina-' + (i + 1) + '.png'));
  const r = await fetch(`https://api.telegram.org/bot${c.tg_token}/sendMediaGroup`, { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({ ok: false }));
  return j.ok ? { ok: true } : { ok: false, erro: 'O Telegram recusou as imagens.' };
}

// avisa o relay da Capital que a chave mudou ou foi apagada: ele descarta a sessão antiga na hora
async function reiniciarCapital(env) {
  try { await env.CAPITAL.get(env.CAPITAL.idFromName('main')).fetch('https://capital/reiniciar', { method: 'POST' }); } catch (_) { /* o relay também confere a chave ao reabrir */ }
}

/* ---------------- passe do servidor de dados (26/10/2026) ----------------
   Quem está logado recebe um passe assinado (ECDSA P-256) que vale 10 minutos; o site o manda em cada
   pedido ao servidor de dados (shrill-meadow-89c1), que confere a assinatura com a chave pública
   (/api/publico/passe-chave). A chave privada é gerada aqui na primeira vez e fica só no D1 (config passe_jwk).
   Bloquear alguém no /admin corta o passe seguinte. */
const PASSE_VALE = 600;
let chavesPasse = null;
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function chavesDoPasse(env) {
  if (chavesPasse) return chavesPasse;
  let jwk = (await env.DB.prepare("SELECT valor FROM config WHERE chave = 'passe_jwk'").first())?.valor;
  if (!jwk) {
    const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    // INSERT OR IGNORE: se duas instâncias gerarem ao mesmo tempo, fica a primeira e as duas leem a mesma
    await env.DB.prepare("INSERT OR IGNORE INTO config (chave, valor) VALUES ('passe_jwk', ?)").bind(JSON.stringify(await crypto.subtle.exportKey('jwk', par.privateKey))).run();
    jwk = (await env.DB.prepare("SELECT valor FROM config WHERE chave = 'passe_jwk'").first()).valor;
  }
  const priv = JSON.parse(jwk);
  const { d, ...pub } = priv;
  chavesPasse = {
    privada: await crypto.subtle.importKey('jwk', priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']),
    publica: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }
  };
  return chavesPasse;
}
async function chavePublicaPasse(env) {
  return (await chavesDoPasse(env)).publica;
}
async function emitirPasse(env, u) {
  const { privada } = await chavesDoPasse(env);
  const exp = Math.floor(Date.now() / 1000) + PASSE_VALE;
  const corpo = b64u(new TextEncoder().encode(JSON.stringify({ u: u.id, exp })));
  const ass = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privada, new TextEncoder().encode(corpo));
  return json({ passe: corpo + '.' + b64u(ass), exp }, 200, { 'Cache-Control': 'no-store' });
}

// pedidos do próprio servidor do site ao servidor de dados (fechamento, abertura, Tesouro) levam um passe "site"
let passeSite = null;
async function urlDados(env, rota) {
  const base = 'https://shrill-meadow-89c1.danilo-nillo.workers.dev' + rota;
  try {
    if (!passeSite || passeSite.exp - Date.now() / 1000 < 120) passeSite = await (await emitirPasse(env, { id: 'site' })).json();
    return base + (rota.includes('?') ? '&' : '?') + 'mmp=' + encodeURIComponent(passeSite.passe);
  } catch (e) {
    return base;
  }
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
    `SELECT u.id, u.nome, u.email, u.admin, u.expira, u.plano FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token = ? AND s.expira > ? AND u.status = 'ativo' AND (u.admin = 1 OR u.expira IS NULL OR u.expira > ?)`).bind(h, agora, new Date(agora).toISOString()).first();
  if (u) {
    if (cacheSessao.size > 500) cacheSessao.clear();
    cacheSessao.set(tok, { u, ate: agora + 10000 }); // curto: bloqueio, saída e troca de senha valem em até 10 s em todas as instâncias
  }
  return u || null;
}
// plano grátis de 48 horas: só Mesa, Notícias e Educação; o Gemini fica para quem assina
const soGratis = (u) => !!u && !u.admin && u.plano === 'gratis' && !!u.expira;
// sessões encerradas por login em outro aparelho: guardadas 30 dias para avisar quem caiu e contar as trocas no /admin
let derrubadasOk = false;
async function garantirDerrubadas(env) {
  if (derrubadasOk) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS sessoes_derrubadas (token TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL, quando INTEGER NOT NULL)').run();
  derrubadasOk = true;
}
async function limitarAparelhos(env, uid) {
  await garantirDerrubadas(env);
  // a sessão mais antiga é a que vence primeiro (todas da conta duram o mesmo tanto)
  const velhas = (await env.DB.prepare('SELECT token FROM sessoes WHERE usuario_id = ? ORDER BY expira DESC LIMIT -1 OFFSET ?').bind(uid, LIMITE_APARELHOS).all()).results;
  if (!velhas.length) return 0;
  const agora = Date.now();
  await env.DB.batch([
    ...velhas.map((v) => env.DB.prepare('INSERT OR REPLACE INTO sessoes_derrubadas (token, usuario_id, quando) VALUES (?, ?, ?)').bind(v.token, uid, agora)),
    ...velhas.map((v) => env.DB.prepare('DELETE FROM sessoes WHERE token = ?').bind(v.token)),
    env.DB.prepare('DELETE FROM sessoes_derrubadas WHERE quando < ?').bind(agora - 30 * 864e5),
  ]);
  cacheSessao.clear();
  await registrar(env, uid, `Entrou em outro aparelho: ${velhas.length === 1 ? 'a sessão mais antiga foi encerrada' : velhas.length + ' sessões antigas foram encerradas'} (limite de ${LIMITE_APARELHOS} aparelhos)`);
  return velhas.length;
}
async function foiDerrubada(req, env) {
  const tok = lerCookie(req);
  if (!tok) return false;
  await garantirDerrubadas(env);
  return !!(await env.DB.prepare('SELECT 1 FROM sessoes_derrubadas WHERE token = ?').bind(await sha256hex(tok)).first());
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
  },
  // progresso da aba Educação: lições feitas, respostas do quiz e a última aberta
  edu: v => {
    const id = k => /^[a-z0-9-]{1,40}$/.test(k), obj = o => o && typeof o === 'object' && !Array.isArray(o);
    if (!obj(v) || !obj(v.feitas) || !obj(v.quiz) || !(v.ultima == null || typeof v.ultima === 'string' && id(v.ultima))) return false;
    const f = Object.keys(v.feitas), q = Object.keys(v.quiz);
    return f.length <= 200 && q.length <= 200 && f.every(k => id(k) && v.feitas[k] === true)
      && q.every(k => id(k) && obj(v.quiz[k]) && Object.keys(v.quiz[k]).length <= 10
        && Object.entries(v.quiz[k]).every(([i, o]) => /^\d$/.test(i) && Number.isInteger(o) && o >= 0 && o < 10));
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
  const v = b.k === 'edu' ? { feitas: b.v.feitas, quiz: b.v.quiz, ultima: b.v.ultima || null }
    : b.k === 'watchlists'
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
  if (res.meta?.changes === 0) return json({ erro: b.k === 'edu' ? 'Seu progresso mudou em outro aparelho.' : 'Suas listas mudaram em outro aparelho.', codigo: 'versao-mais-nova' }, 409);
  return json({ ok: true });
}

/* ---------------- cadastro, login, saída ---------------- */
async function apiAuth(req, env, acao, ctx) {
  if (acao === 'eu' && req.method === 'GET') {
    const u = await usuarioDaSessao(req, env);
    if (!u) return json({ logado: false }, 401);
    const out = { logado: true, nome: u.nome, email: u.email, admin: !!u.admin, expira: u.admin ? null : u.expira || null, gratis: soGratis(u) };
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
    const celular = normalizarCelular(b.celular);
    if (celular === null) return json({ erro: 'Celular inválido. Digite com DDD, por exemplo (11) 91234-5678, ou deixe em branco.' }, 400);
    await garantirAssinatura(env);
    // cadastros que não confirmaram o e-mail em 7 dias são apagados
    await env.DB.prepare(`DELETE FROM usuarios WHERE status = 'confirmar' AND criado < ?`).bind(new Date(Date.now() - 7 * 864e5).toISOString()).run();
    // depois do cadastro a pessoa entra e escolhe um plano; desde 29/10/2026 quem nunca assinou pode começar com 48 horas grátis
    const MSG_FILA = 'Cadastro feito. Agora é só entrar com seu e-mail e senha para começar.';
    const MSG_CONF = 'Enviamos um link para ' + email + '. Confirme o e-mail e depois entre para começar. Não chegou? Veja o spam.';
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
    const ins = await env.DB.prepare(`INSERT INTO usuarios (nome, email, senha, status, criado, celular) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(nome, email, await hashSenha(senha), comEmail ? 'confirmar' : 'pendente', new Date().toISOString(), celular || null).run();
    if (comEmail) {
      const r = await emailConfirmar(env, req, ins.meta.last_row_id, nome, email).catch(() => ({ ok: false }));
      if (r.ok) return json({ ok: true, confirmar: true, msg: MSG_CONF });
      // se o e-mail falhar, o pedido vai direto para a fila (como antes)
      await env.DB.batch([
        env.DB.prepare(`UPDATE usuarios SET status = 'pendente' WHERE id = ?`).bind(ins.meta.last_row_id),
        env.DB.prepare('DELETE FROM links_email WHERE usuario_id = ?').bind(ins.meta.last_row_id),
      ]);
    }
    // de onde veio quem pediu acesso: a vitrine manda o Referer e o ?utm_source da primeira página da visita
    contarOrigem(env, ctx, origemDe(b.ref, b.utm) || 'Páginas do site', 'cadastro');
    ctx.waitUntil(avisar(env, 'Novo pedido de acesso', `${nome} pediu acesso ao Mercado Macro.\nA pessoa vai escolher um plano; o comprovante do Pix chega aqui.`).catch(() => {}));
    return json({ ok: true, msg: MSG_FILA });
  }

  if (acao === 'celular') {
    // a própria pessoa informa ou apaga o celular (opcional)
    const eu = (await usuarioDaSessao(req, env)) || (await contaDaSessao(req, env));
    if (!eu) return json({ erro: 'Faça login para continuar.' }, 401);
    await garantirAssinatura(env);
    if (b.ler) return json({ celular: (await env.DB.prepare('SELECT celular FROM usuarios WHERE id = ?').bind(eu.id).first()).celular || '' });
    const celular = normalizarCelular(b.celular);
    if (celular === null) return json({ erro: 'Celular inválido. Digite com DDD, por exemplo (11) 91234-5678.' }, 400);
    await env.DB.prepare('UPDATE usuarios SET celular = ? WHERE id = ?').bind(celular || null, eu.id).run();
    return json({ ok: true, celular });
  }

  if (acao === 'senha') {
    // a própria pessoa troca a senha (precisa estar logada e saber a senha atual)
    const eu = (await usuarioDaSessao(req, env)) || (await contaDaSessao(req, env));
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

  if (acao === 'aparelhos') {
    // aparelhos com a conta aberta: { ler: 1 } conta; { sair: 1 } encerra todos menos este
    const eu = (await usuarioDaSessao(req, env)) || (await contaDaSessao(req, env));
    if (!eu) return json({ erro: 'Faça login para continuar.' }, 401);
    const meu = await sha256hex(lerCookie(req));
    if (b.sair) {
      const r = await env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ? AND token != ?').bind(eu.id, meu).run();
      cacheSessao.clear();
      if (r.meta.changes) await registrar(env, eu.id, `Saiu dos outros aparelhos (${r.meta.changes})`);
      return json({ ok: true, encerradas: r.meta.changes, outros: 0 });
    }
    const n = await env.DB.prepare('SELECT COUNT(*) n FROM sessoes WHERE usuario_id = ? AND token != ? AND expira > ?').bind(eu.id, meu, Date.now()).first();
    return json({ ok: true, outros: n.n });
  }

  if (acao === 'excluir') {
    // a própria pessoa apaga a conta (precisa estar logada e confirmar a senha); vale também com o acesso vencido
    const eu = (await usuarioDaSessao(req, env)) || (await contaDaSessao(req, env));
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
      env.DB.prepare('DELETE FROM historico WHERE usuario_id = ?').bind(eu.id),
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
    // quem está com o acesso vencido ou aguardando também precisa entrar (para assinar)
    const u = await env.DB.prepare(`SELECT id, nome FROM usuarios WHERE email = ? AND status IN ('ativo', 'pendente', 'expirado')`).bind(email).first();
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
    return json({ ok: true, msg: 'Se esse e-mail tiver cadastro, enviamos um link para criar uma senha nova. Ele vale por 1 hora. Não chegou? Veja o spam.' });
  }

  if (acao === 'nova-senha') {
    if (!(await dentroDoLimite(env, 'nsen:' + ip, 10, 900))) return json({ erro: 'Muitas tentativas. Espere 15 minutos.' }, 429);
    if (senha.length < 8) return json({ erro: 'A senha precisa ter pelo menos 8 caracteres.' }, 400);
    if (senha.length > 200) return json({ erro: 'Senha longa demais.' }, 400);
    const l = await lerLink(env, b.t, 'senha');
    if (!l || !['ativo', 'pendente', 'expirado'].includes(l.status)) return json({ erro: 'Este link não vale mais. Peça outro em Esqueci minha senha.' }, 400);
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
    // também por conta: acertar a senha de OUTRA conta não zera os erros desta (senão dava para tentar sem parar)
    const chave = 'ent:' + ip, chaveU = 'entu:' + email;
    const agoraS = Math.floor(Date.now() / 1000);
    for (const [k, max] of [[chave, 10], [chaveU, 20]]) {
      const t = await env.DB.prepare('SELECT n, janela FROM tentativas WHERE chave = ?').bind(k).first();
      if (t && agoraS - t.janela <= 900 && t.n >= max) return json({ erro: 'Muitas senhas erradas seguidas. Espere 15 minutos.' }, 429);
    }
    const u = await env.DB.prepare('SELECT id, senha, status, admin FROM usuarios WHERE email = ?').bind(email).first();
    if (!u || !(await conferirSenha(senha, u.senha))) {
      await dentroDoLimite(env, chave, 10, 900);
      await dentroDoLimite(env, chaveU, 20, 900);
      return json({ erro: 'E-mail ou senha incorretos.' }, 401);
    }
    await env.DB.prepare('DELETE FROM tentativas WHERE chave IN (?, ?)').bind(chave, chaveU).run();
    if (u.status === 'confirmar') return json({ erro: 'Falta confirmar seu e-mail: abra o link que enviamos quando você pediu acesso (veja também o spam). Para receber outro link, peça acesso de novo com o mesmo e-mail.' }, 403);
    // aguardando liberação ou com a validade vencida também entra, mas só vê a página de assinatura
    if (!['ativo', 'pendente', 'expirado'].includes(u.status)) return json({ erro: 'Seu acesso não está liberado.' }, 403);
    const tok = hex(crypto.getRandomValues(new Uint8Array(32)));
    const agora = Date.now(), dias = u.admin ? SESSAO_DIAS_ADMIN : SESSAO_DIAS;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessoes WHERE expira < ?').bind(agora),
      env.DB.prepare('INSERT INTO sessoes (token, usuario_id, expira) VALUES (?, ?, ?)').bind(await sha256hex(tok), u.id, agora + dias * 864e5),
      env.DB.prepare('UPDATE usuarios SET ultimo_acesso = ? WHERE id = ?').bind(new Date().toISOString(), u.id),
    ]);
    if (!u.admin) await limitarAparelhos(env, u.id).catch(() => 0);
    return json({ ok: true }, 200, { 'Set-Cookie': cookieSessao(tok, dias * 86400) });
  }
  return json({ erro: 'Não encontrado.' }, 404);
}

/* ---------------- administração ---------------- */
async function apiAdmin(req, env, acao, eu) {
  if (acao === 'fechamento' && req.method === 'GET') {
    const [d, c] = await Promise.all([dadosFechamento(env), config(env)]);
    return json({ ...d, texto: textoFechamento(d), legenda: textoFechamento(d, true), textoCanal: textoCanalFechamento(d), modo: c.fech_modo === 'texto' ? 'texto' : 'imagem' }, 200, { 'Cache-Control': 'no-store' });
  }
  if (acao === 'abertura' && req.method === 'GET') {
    const d = await dadosAbertura(env);
    return json({ ...d, texto: textoAbertura(d), legenda: textoAbertura(d, true), textoCanal: textoCanalAbertura(d) }, 200, { 'Cache-Control': 'no-store' });
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
    const t = String(b.texto || '').slice(0, 4000);
    if (!t) return json({ erro: 'Sem texto.' }, 400);
    const c = await config(env);
    const chat = b.destino === 'canal' ? c.tg_canal : c.tg_chat;
    if (!(c.tg_token && chat)) return json({ erro: b.destino === 'canal' ? 'Conecte o canal do Telegram primeiro (Ajustes, Avisos no Telegram).' : 'Conecte o Telegram primeiro.' }, 400);
    const r = await telegram(c.tg_token, 'sendMessage', { chat_id: chat, text: t, disable_web_page_preview: true, ...(b.html ? { parse_mode: 'HTML' } : {}) });
    return r.ok ? json({ ok: true }) : json({ erro: 'O Telegram não recebeu.' }, 502);
  }
  if (acao === 'fechamento-foto' && req.method === 'POST') {
    if (!mesmaOrigem(req)) return json({ erro: 'Origem não permitida.' }, 403);
    const fd = await req.formData().catch(() => null);
    const fotos = fd ? fd.getAll('foto') : [];
    if (!fotos.length || fotos.length > 4 || fotos.some((f) => !f || typeof f === 'string' || f.size > 5e6)) return json({ erro: 'Imagem inválida.' }, 400);
    const pngs = await Promise.all(fotos.map((f) => f.arrayBuffer()));
    const r = await telegramAlbum(env, pngs, fd.get('legenda'), fd.get('destino') === 'canal' ? 'canal' : '');
    return r.ok ? json({ ok: true }) : json({ erro: r.erro }, 502);
  }
  if (acao === 'comunicado') return apiComunicado(req, env, eu);
  if (acao === 'boasvindas') return apiBoasVindas(req, env, eu);
  const ass = await apiAdminAssinatura(req, env, acao);
  if (ass) return ass;
  // registro do servidor de dados: pedidos que chegaram sem o passe de quem está logado (últimos 14 dias)
  if (acao === 'origens' && req.method === 'GET') {
    const desde = new Date(Date.now() - 3 * 3600000 - 29 * 864e5).toISOString().slice(0, 10);
    try {
      const r = await env.DB.prepare('SELECT dia, origem, tipo, n FROM origens WHERE dia >= ?').bind(desde).all();
      return json({ hoje: diaBrasilia(), linhas: r.results });
    } catch (e) {
      return json({ hoje: diaBrasilia(), linhas: [] }); // a tabela nasce na primeira visita contada
    }
  }
  if (acao === 'passe' && req.method === 'GET') {
    const desde = new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 10);
    try {
      const r = await env.DB.prepare('SELECT dia, rota, motivo, quem, n FROM passe_registro WHERE dia >= ? ORDER BY dia DESC, n DESC LIMIT 500').bind(desde).all();
      return json({ linhas: r.results });
    } catch (e) {
      return json({ linhas: [] }); // a tabela nasce no primeiro pedido sem passe
    }
  }
  if (acao === 'usuarios' && req.method === 'GET') {
    await garantirAssinatura(env);
    await garantirDerrubadas(env);
    const r = await env.DB.prepare(
      `SELECT u.id, u.nome, u.email, u.celular, u.status, u.admin, u.criado, u.decidido, u.ultimo_acesso, u.expira,
        COALESCE(u.plano, (SELECT p.plano FROM pagamentos p WHERE p.usuario_id = u.id AND p.status = 'aprovado' ORDER BY p.id DESC LIMIT 1)) plano,
        (SELECT COUNT(*) FROM sessoes_derrubadas d WHERE d.usuario_id = u.id AND d.quando > ?) trocas
        FROM usuarios u ORDER BY u.criado DESC`).bind(Date.now() - 7 * 864e5).all();
    return json({ eu: eu.id, usuarios: r.results, alertaTrocas: ALERTA_TROCAS });
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
      await garantirAssinatura(env);
      await registrar(env, id, 'Senha provisória criada pelo administrador');
      return json({ ok: true, senha });
    }
    const novo = { liberar: 'ativo', recusar: 'recusado', bloquear: 'bloqueado' }[b.acao];
    const agora = new Date().toISOString();
    if (b.acao === 'excluir') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ?').bind(id),
        env.DB.prepare('DELETE FROM dados_usuario WHERE usuario_id = (SELECT id FROM usuarios WHERE id = ? AND admin = 0)').bind(id),
        env.DB.prepare('DELETE FROM pagamentos WHERE usuario_id = (SELECT id FROM usuarios WHERE id = ? AND admin = 0)').bind(id),
        env.DB.prepare('DELETE FROM historico WHERE usuario_id = (SELECT id FROM usuarios WHERE id = ? AND admin = 0)').bind(id),
        env.DB.prepare('DELETE FROM usuarios WHERE id = ? AND admin = 0').bind(id),
      ]);
      await garantirLinks(env);
      await env.DB.prepare('DELETE FROM links_email WHERE usuario_id = ?').bind(id).run();
      // registros de envio (só o número da conta): as tabelas podem ainda não existir
      for (const t of ['comunicados_envios', 'boasvindas_envios']) await env.DB.prepare(`DELETE FROM ${t} WHERE usuario_id = ?`).bind(id).run().catch(() => {});
    } else if (novo) {
      await garantirAssinatura(env);
      const antes = await env.DB.prepare('SELECT nome, email, status, expira FROM usuarios WHERE id = ? AND admin = 0').bind(id).first();
      const q = [env.DB.prepare('UPDATE usuarios SET status = ?, decidido = ? WHERE id = ? AND admin = 0').bind(novo, agora, id)];
      // liberação grátis vale GRATIS_DIAS (1 dia desde 26/10/2026), se a conta não tiver uma validade ainda valendo
      let validade = antes && antes.expira > agora ? antes.expira : null;
      if (novo === 'ativo' && antes && antes.status !== 'ativo' && !validade) {
        validade = new Date(Date.now() + GRATIS_DIAS * 864e5).toISOString();
        q.push(env.DB.prepare(`UPDATE usuarios SET expira = ?, plano = 'cortesia' WHERE id = ? AND admin = 0`).bind(validade, id));
      }
      if (novo !== 'ativo') q.push(env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ?').bind(id));
      await env.DB.batch(q);
      cacheSessao.clear();
      await registrar(env, id, { ativo: 'Acesso liberado' + (validade ? ' até ' + new Date(validade).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''), recusado: 'Cadastro recusado', bloqueado: 'Acesso bloqueado' }[novo]);
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
    if (req.method === 'GET') {
      // robô salvo e ainda sem conversa: um código de 6 números que você manda ao robô para provar que a conversa é sua
      let codigo = null;
      if (c.tg_token && !c.tg_chat) {
        codigo = c.tg_codigo || String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
        if (!c.tg_codigo) await salvarConfig(env, { tg_codigo: codigo });
      }
      return json({ bot: c.tg_bot || null, conectado: !!(c.tg_token && c.tg_chat), codigo, canal: c.tg_canal_nome || null, canalNoticias: c.tg_canal_noticias !== 'nao' });
    }
    if (req.method !== 'POST' || !mesmaOrigem(req)) return json({ erro: 'Método não permitido.' }, 405);
    const b = await req.json().catch(() => ({}));
    if (b.acao === 'token') {
      const token = String(b.token || '').trim();
      if (!/^\d{5,15}:[\w-]{30,60}$/.test(token)) return json({ erro: 'Esse código não parece o token do BotFather. Copie a linha inteira, com os números, os dois-pontos e as letras.' }, 400);
      const me = await telegram(token, 'getMe', {});
      if (!me.ok) return json({ erro: 'O Telegram não aceitou esse token. Confira se copiou certo.' }, 400);
      // bot novo: a conversa e o canal do bot antigo deixam de valer (o canal precisa ser ligado de novo com o bot novo)
      await salvarConfig(env, { tg_token: token, tg_bot: me.result.username, tg_chat: null, tg_canal: null, tg_canal_nome: null, tg_codigo: null });
      return json({ ok: true, bot: me.result.username });
    }
    if (b.acao === 'conectar') {
      if (!c.tg_token) return json({ erro: 'Cole o token do robô primeiro.' }, 400);
      const up = await telegram(c.tg_token, 'getUpdates', { allowed_updates: ['message'] });
      // só vale a conversa que mandou o código desta página (outra pessoa que fale com o robô não é ligada)
      const msgs = (up.result || []).map((u) => u.message).filter((m) => m && m.chat && m.chat.type === 'private' && c.tg_codigo && String(m.text || '').includes(c.tg_codigo));
      if (!msgs.length) return json({ erro: 'Ainda não achei o código. No Telegram, abra @' + c.tg_bot + ', toque em Iniciar, mande o código ' + (c.tg_codigo || '') + ' e tente de novo.' }, 400);
      const chat = String(msgs[msgs.length - 1].chat.id);
      await salvarConfig(env, { tg_chat: chat, tg_codigo: null });
      await telegram(c.tg_token, 'sendMessage', { chat_id: chat, text: 'Pronto. Os avisos de cadastro novo do Mercado Macro vão chegar aqui.' });
      return json({ ok: true });
    }
    if (b.acao === 'desligar') { await salvarConfig(env, { tg_token: null, tg_bot: null, tg_chat: null, tg_canal: null, tg_canal_nome: null, tg_codigo: null }); return json({ ok: true }); }
    // canal público: o robô precisa ser administrador do canal; aceita @usuario ou o link t.me
    if (b.acao === 'canal') {
      if (!c.tg_token) return json({ erro: 'Conecte o Telegram primeiro.' }, 400);
      const m = String(b.canal || '').trim().match(/^(?:https?:\/\/)?(?:t\.me\/|@)?([A-Za-z][A-Za-z0-9_]{4,31})$/);
      if (!m) return json({ erro: 'Escreva o usuário do canal, por exemplo @mercadomacro ou t.me/mercadomacro.' }, 400);
      const ch = await telegram(c.tg_token, 'getChat', { chat_id: '@' + m[1] });
      if (!ch.ok || ch.result.type !== 'channel') return json({ erro: 'Não achei esse canal. Confira se ele é público e se o usuário está certo.' }, 400);
      const eu = await telegram(c.tg_token, 'getChatMember', { chat_id: ch.result.id, user_id: Number(String(c.tg_token).split(':')[0]) });
      if (!eu.ok || eu.result.status !== 'administrator' || eu.result.can_post_messages === false) return json({ erro: 'Achei o canal, mas o robô @' + c.tg_bot + ' ainda não é administrador com permissão de publicar. Adicione nas configurações do canal e tente de novo.' }, 400);
      await salvarConfig(env, { tg_canal: String(ch.result.id), tg_canal_nome: '@' + (ch.result.username || m[1]) });
      return json({ ok: true, canal: '@' + (ch.result.username || m[1]) });
    }
    if (b.acao === 'canal-sair') { await salvarConfig(env, { tg_canal: null, tg_canal_nome: null }); return json({ ok: true }); }
    if (b.acao === 'canal-noticias') { await salvarConfig(env, { tg_canal_noticias: b.ligar ? null : 'nao' }); return json({ ok: true }); }
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
  if (acao === 'assistente') return await apiAdminAssistente(req, env);
  if (acao === 'stripe') return await apiAdminStripe(req, env);
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
async function enviarEmail(env, req, { para, nome, assunto, paragrafos, botao, link, nota, canal }) {
  const c = await config(env);
  if (!c.mail_key) return { ok: false, desligado: true };
  const site = siteDe(req);
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || 'olá';
  // convite para o canal do Telegram (passa por /telegram para contar o clique)
  const tg = canal && c.tg_canal ? site + '/telegram?de=email' : null;
  const TG = 'Abertura às 9h15, fechamento às 18h e as notícias que mexem com o mercado, de graça no nosso canal do Telegram';
  const texto = `Olá, ${primeiro}.\n\n${paragrafos.join('\n\n')}\n\n${botao}: ${link}\n\n${nota ? nota + '\n\n' : ''}${tg ? TG + ': ' + tg + '\n\n' : ''}Mercado Macro`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;max-width:520px">
<p>Olá, ${escH(primeiro)}.</p>
${paragrafos.map((x) => `<p>${escH(x)}</p>`).join('\n')}
<p style="margin:22px 0"><a href="${escH(link)}" style="background:#f5b83d;color:#111;text-decoration:none;font-weight:700;padding:11px 20px;border-radius:8px;display:inline-block">${escH(botao)}</a></p>
${nota ? `<p style="color:#6b7280;font-size:13px">${escH(nota)}</p>` : ''}
${tg ? `<p style="font-size:14px;border-top:1px solid #e5e7eb;padding-top:14px">${escH(TG)}: <a href="${escH(tg)}" style="color:#1d4ed8;font-weight:700">entrar no canal</a></p>` : ''}
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
    botao: 'Entrar no Mercado Macro', link: siteDe(req) + '/entrar', canal: true,
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
    paragrafos: ['Recebemos seu pedido de acesso ao Mercado Macro. Para continuar, confirme que este e-mail é seu.', 'Depois de confirmar, é só entrar e escolher seu plano. Para conhecer, você pode começar com 48 horas grátis.'],
    botao: 'Confirmar meu e-mail', link: siteDe(req) + '/confirmar?t=' + tok,
    nota: 'O link vale por 3 dias. Se você não pediu acesso, ignore este e-mail.', canal: true,
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
  if (!l) return paginaLink('Link vencido', '<div class="caixa"><p>Este link não vale mais. Ele pode ter vencido ou já ter sido usado.</p><p>Se você já confirmou, é só entrar e escolher seu plano. Se não, peça acesso de novo com o mesmo e-mail para receber outro link.</p><a class="bt" href="/entrar?volta=%2Fassinar">Entrar e escolher meu plano</a></div>');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM links_email WHERE token = ?').bind(l.token),
    env.DB.prepare(`UPDATE usuarios SET status = 'pendente' WHERE id = ? AND status = 'confirmar'`).bind(l.id),
  ]);
  if (l.status === 'confirmar') ctx.waitUntil(avisar(env, 'Novo pedido de acesso', `${l.nome} pediu acesso ao Mercado Macro (e-mail confirmado).\nA pessoa vai escolher um plano; o comprovante do Pix chega aqui.`).catch(() => {}));
  return paginaLink('E-mail confirmado', '<div class="caixa"><p>Pronto, seu e-mail foi confirmado.</p><p>Agora é só entrar com seu e-mail e senha e escolher seu plano. Para conhecer, você pode começar com 48 horas grátis.</p>'
    + '<p>Por trás do Mercado Macro tem gente de verdade, atualizando o painel todo dia. O valor da assinatura é simbólico e ajuda a manter tudo no ar e a trazer novidades.</p>'
    + '<a class="bt" href="/entrar?volta=%2Fassinar">Escolher meu plano</a></div>');
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
/* ---------------- divulgação do canal público do Telegram (26/10/2026) ----------------
   Todo link do site para o canal passa por /telegram?de=<lugar>: conta o clique (tabela origens, tipo 'canal')
   e manda para um link de convite só daquele lugar, criado pelo robô do canal (createChatInviteLink).
   No Telegram (canal > Links de convite) aparece quantas pessoas entraram por cada link.
   Sem permissão para criar convites, vai para o endereço público do canal. Sem canal ligado, volta para o site. */
const LUGARES_CANAL = { cadastro: 'Tela de cadastro', email: 'E-mails do site', rodape: 'Rodapé das páginas públicas', terminal: 'Rodapé do terminal' };
let conviteFalhou = 0;
async function conviteDoCanal(env, lugar) {
  const c = await config(env);
  if (!(c.tg_token && c.tg_canal)) return null;
  const publico = c.tg_canal_nome ? 'https://t.me/' + c.tg_canal_nome.replace(/^@/, '') : null;
  const k = 'tg_conv_' + lugar, [canal, link] = String(c[k] || '').split('|');
  if (canal === c.tg_canal && link) return link;
  if (Date.now() - conviteFalhou < 3600000) return publico;
  const r = await telegram(c.tg_token, 'createChatInviteLink', { chat_id: c.tg_canal, name: ('Site: ' + LUGARES_CANAL[lugar]).slice(0, 32) }).catch(() => ({}));
  if (!(r.ok && r.result && r.result.invite_link)) { conviteFalhou = Date.now(); return publico; }
  await salvarConfig(env, { [k]: c.tg_canal + '|' + r.result.invite_link });
  return r.result.invite_link;
}
async function irParaCanal(req, env, ctx, url) {
  const lugar = LUGARES_CANAL[url.searchParams.get('de')] ? url.searchParams.get('de') : 'rodape';
  const link = await conviteDoCanal(env, lugar).catch(() => null);
  if (!link) return redirect('/');
  if (!ROBO.test(req.headers.get('User-Agent') || '')) contarOrigem(env, ctx, LUGARES_CANAL[lugar], 'canal');
  return new Response(null, { status: 302, headers: { Location: link, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
// tela "cadastro enviado": os planos (os mesmos preços de /assinar) e se o canal está ligado (o convite só aparece com canal)
async function previaCanal(env) {
  const c = await config(env);
  const planos = Object.entries(PLANOS).filter(([, p]) => !p.oculto && !p.soCartao).map(([id, p]) => ({ id, nome: p.nome, periodo: p.periodo, valor: p.valor, meses: p.meses || 0 }));
  return json({ canal: !!(c.tg_token && c.tg_canal), planos }, 200, { 'Cache-Control': 'public, max-age=600' });
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
const ROBOS_AVISO = ['vigia.yml', 'resumo.yml', 'abertura.yml']; // robôs que podem mandar mensagem no Telegram
// robôs do GitHub que buscam dados no servidor de dados: trocam o token OIDC do GitHub (audience mercadomacro-passe)
// por um passe "robo:<arquivo>" em /api/robo/passe. Nenhuma chave guardada: o GitHub assina o token.
const GH_AUD_PASSE = 'mercadomacro-passe';
const ROBOS_PASSE = ['vigia.yml', 'historico.yml'];
async function passeDoRobo(req, env) {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const quem = await tokenDoGitHub(tok, GH_AUD_PASSE, ROBOS_PASSE).catch(() => null);
  if (!quem) return json({ erro: 'Não autorizado.' }, 401);
  const arq = (String(quem.workflow_ref || '').match(/workflows\/([\w.-]+)\.yml@/) || [])[1] || 'robo';
  return emitirPasse(env, { id: 'robo:' + arq });
}
let jwksCache = null; // { chaves, ate }
const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
async function tokenDoGitHub(tok, aud = GH_AUD, robos = ROBOS_AVISO) {
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
  // chave desconhecida: busca de novo no máximo uma vez por minuto (um token falso não força downloads seguidos)
  if (!jwk) { if (jwksCache.ate - 3600e3 < Date.now() - 60e3) jwksCache.ate = 0; return null; }
  const chave = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', chave, b64url(sig), new TextEncoder().encode(h + '.' + p));
  const agora = Date.now() / 1000;
  if (!ok || dados.iss !== GH_ISS || dados.aud !== aud || dados.repository !== GH_REPO || dados.ref !== 'refs/heads/main'
    || !robos.some((w) => String(dados.workflow_ref || '').startsWith(GH_REPO + '/.github/workflows/' + w + '@')) || !(dados.exp > agora) || (dados.nbf && dados.nbf > agora + 60)) return null;
  return dados;
}
async function avisoDoVigia(req, env) {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const quem = await tokenDoGitHub(tok).catch(() => null);
  if (!quem) return json({ erro: 'Não autorizado.' }, 401);
  const b = await req.json().catch(() => ({}));
  // o canal público só recebe o fechamento e a abertura (nunca os alertas do vigia)
  const canal = b.canal === true && !String(quem.workflow_ref || '').includes('/vigia.yml@');
  const cfg = await config(env);
  if (canal && !cfg.tg_canal) return json({ ok: true, pulado: 'sem canal' });
  // chave do dia (ex.: fechamento-2026-10-22): o canal recebe cada postagem uma vez só, mesmo que o robô rode de novo
  const chave = canal && /^[a-z]{3,20}-\d{4}-\d{2}-\d{2}$/.test(String(b.chave || '')) ? String(b.chave) : null;
  const ck = chave ? 'canal_ult_' + chave.split('-')[0] : null;
  if (ck && cfg[ck] === chave) return json({ ok: true, pulado: 'já postado' });
  const feito = async (r) => { if (ck && r.ok) await salvarConfig(env, { [ck]: chave }); return r; };
  const fotos = b.fotos || (b.foto ? [b.foto] : null);
  if (fotos) {
    // cartões em PNG (base64) com a legenda
    let pngs;
    try { pngs = fotos.slice(0, 4).map((f) => Uint8Array.from(atob(String(f)), (ch) => ch.charCodeAt(0))); } catch (e) { return json({ erro: 'Imagem inválida.' }, 400); }
    if (pngs.some((p) => p.length > 5e6)) return json({ erro: 'Imagem grande demais.' }, 413);
    const r = await feito(await telegramAlbum(env, pngs, b.texto, canal ? 'canal' : ''));
    return r.ok ? json({ ok: true }) : json({ erro: r.erro }, 502);
  }
  const texto = String(b.texto || '').slice(0, 4000);
  if (!texto) return json({ erro: 'Sem texto.' }, 400);
  const c = cfg;
  const chat = canal ? c.tg_canal : c.tg_chat;
  if (!(c.tg_token && chat)) return json({ erro: 'Telegram não conectado.' }, 409);
  const r = await feito(await telegram(c.tg_token, 'sendMessage', { chat_id: chat, text: texto, disable_web_page_preview: true, ...(b.html ? { parse_mode: 'HTML' } : {}) }));
  return r.ok ? json({ ok: true }) : json({ erro: 'Telegram recusou.' }, 502);
}

// precisa do segredo GH_TOKEN no worker (token do GitHub só com Actions: leitura e escrita neste repositório).
// Sem ele, fica valendo só o agendador do próprio GitHub.
async function dispararFechamento(env) { return dispararRobo(env, 'resumo.yml', { site: true }); }
async function dispararRobo(env, arquivo, inputs) {
  if (!env.GH_TOKEN) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/${arquivo}/dispatches`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env.GH_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'mercadomacro-station', 'X-GitHub-Api-Version': '2022-11-28' },
      body: JSON.stringify({ ref: 'main', inputs }),
    });
    if (r.status !== 204) console.error('disparo de ' + arquivo + ':', r.status, await r.text());
  } catch (e) { console.error('disparo de ' + arquivo + ':', e.message); }
}
async function roboFechamento(req, env) {
  const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!(await tokenDoGitHub(tok).catch(() => null))) return json({ erro: 'Não autorizado.' }, 401);
  const [d, c] = await Promise.all([dadosFechamento(env), config(env)]);
  await salvarFechamento(env, d).catch(() => {}); // também vira página pública
  return json({ ...d, texto: textoFechamento(d), legenda: textoFechamento(d, true), textoCanal: textoCanalFechamento(d), modo: c.fech_modo === 'texto' ? 'texto' : 'imagem' }, 200, { 'Cache-Control': 'no-store' });
}

// notícias em tempo real no canal público: só as de impacto alto ou crítico, de fontes em português,
// publicadas há menos de 45 minutos, das 7h às 22h de Brasília; no máximo 2 entregues e 3 tentativas por rodada,
// 2 por hora e 20 por dia, sem repetir link nem assunto (tabela canal_noticias). Liga e desliga em /admin (config tg_canal_noticias).
// Seleção: fica de fora matéria educativa ou de opinião/expectativa, e o título precisa trazer um fato
// (número ou verbo de acontecimento), não só uma palavra forte como "Selic" ou "balanço".
// Entrega: a linha nasce 'reservada' e vira 'enviada' só com o ok do Telegram; reserva sem confirmação há mais de
// 10 minutos (rodada interrompida) é solta e a notícia volta. Recusa da própria mensagem (400) vira 'falhou' e não
// ocupa vaga; erro de permissão (401/403/404) pausa o canal por 1 hora e avisa o administrador; 429, Telegram fora
// do ar ou demora acima de 10 segundos soltam a reserva e pausam pelo retry_after (config tg_canal_pausa).
const CANAL_EDUCATIVO = /\?|^(como|por que|porque|o que|quanto|qual|quais|onde|quando|vale a pena|entenda|aprenda|saiba|veja|confira|descubra|guia|tutorial)\b|\b(dicas?|passo a passo|guia|aprenda|entenda|tire suas duvidas|para iniciantes|como investir|como funciona|vale a pena|quanto rende|melhores (investimentos|acoes|fundos|ativos|cdbs?|fiis)|onde investir|o que e|o que sao)\b/;
const CANAL_OPINIAO = /\b(pode|podem|poderia|poderiam|deve|devem|deveria|deveriam|o que esperar|expectativa|expectativas|projeta|projetam|projecao|preve|preveem|previsao|analistas?|analise|opiniao|coluna|artigo|perspectiva|perspectivas|cenario|tendencia|estrategia|recomenda|recomendacao|carteira recomendada|previa|agenda|em foco|no radar|fique de olho)\b/;
const CANAL_FATO = /\d|\b(eleva|elevou|corta|cortou|mantem|manteve|reduz|reduziu|aprova|aprovou|anuncia|anunciou|divulga|divulgou|decide|decidiu|decisao|confirma|confirmou|renuncia|renunciou|demite|demitiu|nomeia|compra|comprou|vende|vendeu|adquire|adquiriu|fecha|fechou|sobe|subiu|cai|caiu|dispara|disparou|despenca|despencou|recua|recuou|avanca|avancou|registra|registrou|atinge|atingiu|supera|superou|surpreende|rebaixa|rebaixou|suspende|suspendeu|proibe|sanciona|sancionou|veta|vetou|tarifa|tarifas|ataque|ataca|guerra|cessar-fogo|acordo|default|calote|falencia|recuperacao judicial|lucro|prejuizo|receita|dividendos|jcp|recompra|oferta|ipo|fusao|investigacao|prisao|preso|morre|morreu|renunci)\b/;
const CANAL_SOBE = /\b(eleva|elevam|elevou|sobe|sobem|subiu|alta|altas|aumenta|aumentam|aumentou|amplia|acelera|acelerou|dispara|disparou|salta|saltou|avanca|avancou|ganha|ganhou|cresce|cresceu|recorde|maxima)\b/;
const CANAL_DESCE = /\b(reduz|reduzem|reduziu|corta|cortam|cortou|corte|cai|caem|caiu|queda|baixa|baixas|diminui|diminuiu|recua|recuam|recuou|desacelera|desacelerou|despenca|despencou|tomba|tombou|perde|perdeu|encolhe|encolheu|minima)\b/;
const CANAL_VAZIAS = new Set('para pela pelo pelos pelas como com sem sobre entre apos ante ate desde que diz dizem afirma segundo apos mais menos muito ainda este esta isso essa esse seus suas dele dela nesta neste numa num uma uns umas the and'.split(' '));
const CANAL_TRAVA = 10 * 60000; // reserva sem confirmação depois disso = rodada interrompida
async function noticiasNoCanal(env, ctx) {
  const c = await config(env);
  if (!(c.tg_token && c.tg_canal) || c.tg_canal_noticias === 'nao') return;
  const agora = Date.now();
  if (+c.tg_canal_pausa > agora) return;
  const hora = new Date(agora - 3 * 3600000).getUTCHours();
  if (hora < 7 || hora >= 22) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS canal_noticias (link TEXT PRIMARY KEY, titulo TEXT NOT NULL, quando INTEGER NOT NULL)').run();
  // coluna do estado da entrega (as linhas de antes já tinham sido entregues)
  await env.DB.prepare("ALTER TABLE canal_noticias ADD COLUMN estado TEXT NOT NULL DEFAULT 'enviada'").run().catch(() => {});
  await env.DB.prepare("DELETE FROM canal_noticias WHERE estado = 'reservada' AND quando < ?").bind(agora - CANAL_TRAVA).run();
  const { lista } = await noticiasCache(ctx);
  const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const cands = (lista || []).filter((n) => {
    if (!(n && n.titulo && /^https?:\/\//i.test(n.link || '') && FONTES_PT.has(n.fonte))) return false;
    if (!(n.nivel === 'CRITICO' || n.nivel === 'ALTO') || !(+n.data >= agora - 45 * 60000)) return false;
    const t = norm(n.titulo);
    return !CANAL_EDUCATIVO.test(t) && !CANAL_OPINIAO.test(t) && CANAL_FATO.test(t);
  }).sort((a, b) => (b.finalScore - a.finalScore) || (b.data - a.data));
  if (!cands.length) return;
  const ja = (await env.DB.prepare('SELECT link, titulo, quando, estado FROM canal_noticias WHERE quando > ?').bind(agora - 86400000).all()).results || [];
  const hojeIni = Date.parse(new Date(agora - 3 * 3600000).toISOString().slice(0, 10) + 'T03:00:00Z');
  // assunto: radicais das palavras (sem as vazias), números e direção (sobe/desce) do título
  const assunto = (t) => {
    const s = norm(t);
    const sobe = CANAL_SOBE.test(s), desce = CANAL_DESCE.test(s);
    return {
      w: new Set(s.split(/[^a-z0-9]+/).filter((x) => x.length > 2 && !/^\d/.test(x) && !CANAL_VAZIAS.has(x)).map((x) => x.slice(0, 5))),
      sujeito: (s.match(/[a-z]{3,}/) || [''])[0].slice(0, 5),
      num: new Set((s.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.'))),
      dir: sobe === desce ? 0 : (sobe ? 1 : -1),
    };
  };
  const links = new Set(ja.map((x) => x.link));
  const vistos = ja.filter((x) => x.estado !== 'falhou').map((x) => assunto(x.titulo));
  // mesma notícia: números diferentes ou direção oposta é notícia nova; senão, mesmas palavras (Jaccard >= 0,5,
  // ou, com o mesmo sujeito, 75% do título menor ou os mesmos números com duas palavras em comum
  const parecida = (a) => vistos.some((e) => {
    if (a.dir && e.dir && a.dir !== e.dir) return false;
    const nums = a.num.size && e.num.size;
    if (nums && [...a.num].some((x) => !e.num.has(x))) return false;
    let k = 0; for (const x of a.w) if (e.w.has(x)) k++;
    const menor = Math.min(a.w.size, e.w.size), uniao = a.w.size + e.w.size - k;
    return (uniao && k / uniao >= 0.5) || (a.sujeito === e.sujeito && ((menor >= 3 && k / menor >= 0.75) || (nums && k >= 2)));
  });
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const conta = "(SELECT COUNT(*) FROM canal_noticias WHERE quando >= ? AND estado IN ('enviada', 'reservada'))";
  // vagas espalhadas no dia: no máximo 2 por hora cheia de Brasília, para não gastar as 20 de manhã
  const horaIni = agora - (agora % 3600000);
  let postadas = 0, tentativas = 0;
  for (const n of cands) {
    if (postadas >= 2 || tentativas >= 3) break;
    const a = assunto(n.titulo);
    if (links.has(n.link) || parecida(a)) continue;
    // reserva num INSERT só, que também confere o teto de 20 do dia: duas rodadas ao mesmo tempo não passam de 20
    const ins = await env.DB.prepare(`INSERT OR IGNORE INTO canal_noticias (link, titulo, quando, estado) SELECT ?, ?, ?, 'reservada' WHERE ${conta} < 20 AND ${conta} < 2`)
      .bind(n.link, n.titulo, agora, hojeIni, horaIni).run();
    if (!ins.meta || !ins.meta.changes) {
      const t = await env.DB.prepare(`SELECT ${conta} AS d, ${conta} AS h`).bind(hojeIni, horaIni).first();
      if (t && (t.d >= 20 || t.h >= 2)) break;
      continue;
    }
    tentativas++;
    links.add(n.link);
    const veiculo = (n.fonte === 'Google News' ? n.veiculo : n.fonte) || '';
    const r = await fetch(`https://api.telegram.org/bot${c.tg_token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        chat_id: c.tg_canal, parse_mode: 'HTML',
        text: `<b>${esc(n.titulo.trim())}</b>\n\n${veiculo ? esc(veiculo) + ' · ' : ''}<a href="${esc(n.link)}">Ler a notícia</a>\n\nMercado Macro | <a href="https://mercadomacro.com.br">mercadomacro.com.br</a>`,
        link_preview_options: { url: n.link, prefer_large_media: true },
      }),
    }).then((x) => x.json()).catch((e) => ({ ok: false, description: String(e) }));
    if (r && r.ok) {
      await env.DB.prepare("UPDATE canal_noticias SET estado = 'enviada' WHERE link = ?").bind(n.link).run();
      vistos.push(a);
      postadas++;
      continue;
    }
    console.error('canal recusou a notícia:', JSON.stringify(r).slice(0, 200));
    const cod = (r && +r.error_code) || 0;
    if (cod === 400) {
      // problema desta mensagem: não volta e não ocupa vaga do dia
      await env.DB.prepare("UPDATE canal_noticias SET estado = 'falhou' WHERE link = ?").bind(n.link).run();
      continue;
    }
    await env.DB.prepare('DELETE FROM canal_noticias WHERE link = ?').bind(n.link).run();
    if (cod === 401 || cod === 403 || cod === 404) {
      // o bot perdeu acesso ao canal: nenhuma notícia sai até alguém resolver; tenta de novo em 1 hora
      await salvarConfig(env, { tg_canal_pausa: String(agora + 3600000) });
      await avisar(env, 'Canal do Telegram recusou as notícias', `O Telegram respondeu "${String((r && r.description) || cod).slice(0, 150)}". Confira se o bot ainda é administrador do canal com permissão de publicar. As notícias ficam paradas por 1 hora e o robô tenta de novo.`).catch(() => {});
      break;
    }
    // limite (429), Telegram fora do ar, rede ou demora: a notícia volta na próxima rodada
    const espera = r && r.parameters && +r.parameters.retry_after;
    if (espera > 0) await salvarConfig(env, { tg_canal_pausa: String(agora + espera * 1000) });
    break;
  }
  await env.DB.prepare('DELETE FROM canal_noticias WHERE quando < ?').bind(agora - 7 * 86400000).run();
}
async function roboAbertura(req, env) {
  const tok = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!(await tokenDoGitHub(tok).catch(() => null))) return json({ erro: 'Não autorizado.' }, 401);
  const [d, c] = await Promise.all([dadosAbertura(env), config(env)]);
  return json({ ...d, texto: textoAbertura(d), legenda: textoAbertura(d, true), textoCanal: textoCanalAbertura(d), canal: !!c.tg_canal, feriado: feriadoB3(d.data) }, 200, { 'Cache-Control': 'no-store' });
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
// gráfico de 5 dias para a vitrine quando o do dia está parado (o dólar fica sem negócio à noite)
const SERIE_OK = new Set(['^BVSP', 'BRL=X', '^GSPC', 'BTC-USD', 'BZ=F', 'GC=F', 'EURBRL=X', 'DX-Y.NYB', 'ETH-USD']);
async function serieCincoDias(req, ctx) {
  const s = new URL(req.url).searchParams.get('s') || '';
  if (!SERIE_OK.has(s)) return json({ erro: 'Símbolo inválido.' }, 400);
  const chave = new Request('https://cache.local/serie5d?s=' + encodeURIComponent(s));
  const hit = await caches.default.match(chave);
  if (hit) return hit;
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(s) + '?interval=30m&range=5d', { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const c = ((j.chart?.result?.[0]?.indicators?.quote?.[0]?.close) || []).filter((v) => v != null);
    if (c.length < 2) throw new Error('sem dados');
    const out = new Response(JSON.stringify({ c }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
    ctx.waitUntil(caches.default.put(chave, out.clone()));
    return out;
  } catch (e) { return json({ erro: 'Fonte indisponível.' }, 502); }
}

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
  corpo = corpo.replace('<!--PLANOS-->', () => planosVitrine());
  return new Response(corpo, { status: r.status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Frame-Options': 'DENY' } });
}

// /planos: preços (do mesmo PLANOS de assinatura.js), pagamento, cancelamento e reembolso; pública (o Stripe confere)
async function paginaPlanos(req, env) {
  const r = await env.ASSETS.fetch(new Request(new URL('/vitrine/termos', req.url)));
  const cartao = await stripeLigado(env).catch(() => false);
  const corpo = (await r.text()).replace('<!--PLANOS-->', () => planosVitrine(cartao));
  return new Response(corpo, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Frame-Options': 'DENY' } });
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
Disallow: /telegram

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
  <url><loc>https://mercadomacro.com.br/balanca-comercial</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
</urlset>
`;
// sitemap com uma página por fechamento guardado
async function sitemap(env) {
  const dias = await diasParaSitemap(env);
  return SITEMAP.replace('</urlset>', dias.map((d) => `  <url><loc>https://mercadomacro.com.br/fechamento-do-mercado/${d}</loc><lastmod>${d}</lastmod><changefreq>never</changefreq><priority>0.6</priority></url>\n`).join('') + '</urlset>');
}

/* ---------------- páginas ---------------- */
const BASE_CSS = `
html[data-tema=dark]{--bg:#070b14;--surface:#0e1524;--surface-2:#121a2b;--line:#1c2740;--line-2:#24304d;--text:#e6ecf5;--text-2:#a8b3c7;--text-3:#8591a8;--accent:#f0b90b;--accent-text:#f0b90b;--on-accent:#111;--pos:#16c784;--neg:#ff6b73;color-scheme:dark}
html[data-tema=light]{--bg:#f5f7fb;--surface:#fff;--surface-2:#f7f9fc;--line:#dfe5ee;--line-2:#cfd7e3;--text:#0b1220;--text-2:#4a5568;--text-3:#5f6a7d;--accent:#b8860b;--accent-text:#7a5a00;--on-accent:#111;--pos:#0b7a4f;--neg:#c0262f;color-scheme:light}
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
<title>Administração | Mercado Macro</title>
<script>try{var t=localStorage.getItem('trader_theme');if(t==='dark'||t==='light')document.documentElement.dataset.tema=t;}catch(e){}</script>
<meta name="robots" content="noindex">
<link rel="icon" type="image/png" href="/icone-mercado-macro.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${BASE_CSS}
[data-segredo]{-webkit-text-security:disc;text-security:disc}
main{max-width:1180px;margin:0 auto;padding:0 20px 56px}
.top{display:flex;align-items:center;gap:14px;padding:18px 0 12px}
.marca{flex:1;display:flex;align-items:baseline;gap:10px;min-width:0}
.marca b{white-space:nowrap;font-size:13px;letter-spacing:.22em;font-weight:700;color:var(--text)}
.marca span{font-size:13px;color:var(--text-3)}
a.vol{color:var(--accent-text);font-size:13px;white-space:nowrap}
.abas{position:sticky;top:0;z-index:5;display:flex;gap:2px;overflow-x:auto;background:var(--bg);border-bottom:1px solid var(--line);margin:0 -20px 18px;padding:0 20px;scrollbar-width:none}
.abas::-webkit-scrollbar{display:none}
@media (max-width:760px){.abas{-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 36px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 36px),transparent)}}
.abas button{background:none;border:0;border-bottom:2px solid transparent;color:var(--text-2);padding:12px 14px;font-weight:600;font-size:14px;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:7px}
.abas button[aria-selected=true]{color:var(--text);border-bottom-color:var(--accent)}
.abas button:hover{color:var(--text)}
.cnt{background:var(--accent);color:var(--on-accent);border-radius:10px;font-size:11px;font-weight:700;padding:1px 7px;line-height:1.5}
.cnt:empty{display:none}
#msg{position:sticky;top:48px;z-index:4;margin:0 0 10px}
#msg:empty{display:none}
#msg.ok,#msg.erro{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:9px 12px}
h2{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3);margin:22px 0 10px;font-weight:700}
h2 b{color:var(--text);background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:1px 8px;margin-left:6px;letter-spacing:0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;text-align:left;color:var(--text);cursor:pointer;font:inherit}
.kpi:hover{border-color:var(--line-2)}
.kpi.alerta{border-color:var(--accent)}
.kpi small{display:block;color:var(--text-3);font-size:12px;margin-bottom:6px}
.kpi strong{font-size:26px;font-weight:700;letter-spacing:-.01em}
.kpi em{display:block;font-style:normal;color:var(--text-3);font-size:12px;margin-top:4px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 24px}
.lista{display:grid;gap:8px}
.u{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.u .q{flex:1;min-width:180px}
.u .n{font-weight:600}.u .e{color:var(--text-2);font-size:13px;word-break:break-all}.u .d{color:var(--text-3);font-size:12px}
.u .bts{display:flex;gap:6px;flex-wrap:wrap}
button.b{border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);border-radius:7px;padding:6px 11px;cursor:pointer;font-weight:600;font-size:13px;min-height:34px;white-space:nowrap}
.u button,.caixa button{border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);border-radius:7px;padding:7px 12px;cursor:pointer;font-weight:600;font-size:13px;min-height:36px}
button.lib,.u button.lib{background:var(--accent);color:var(--on-accent);border-color:transparent}
button.del,.u button.del{color:var(--neg)}
.ferr{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 12px}
.ferr input{flex:1;min-width:220px;background:var(--surface);border:1px solid var(--line-2);border-radius:8px;color:var(--text);padding:9px 12px;min-height:40px}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chips button{white-space:nowrap;flex:none;border:1px solid var(--line-2);background:var(--surface);color:var(--text-2);border-radius:20px;padding:6px 12px;font-size:13px;font-weight:600;cursor:pointer}
.chips button[aria-pressed=true]{background:var(--surface-2);color:var(--text);border-color:var(--accent)}
.chips i{font-style:normal;color:var(--text-3);margin-left:5px;font-weight:500}
table.t{width:100%;border-collapse:separate;border-spacing:0;background:var(--surface);border:1px solid var(--line);border-radius:12px}
.t th:first-child{border-top-left-radius:11px}.t th:last-child{border-top-right-radius:11px}
.t th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3);font-weight:700;text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);background:var(--surface-2)}
.t th .ord{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font:inherit;letter-spacing:inherit;text-transform:inherit;color:inherit}.t th .ord:hover,.t th .ord.on{color:var(--text)}.t th .ord i{font-style:normal;font-size:9px;opacity:.45}.t th .ord.on i{opacity:1;color:var(--accent,var(--text))}.t th .ord:focus-visible{outline:2px solid var(--accent,#888);outline-offset:2px;border-radius:3px}
.t td{padding:10px 14px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:middle}
.t tr:last-child td{border-bottom:0}
.t td.p b{display:block;font-size:14px}.t td.p span{color:var(--text-2);word-break:break-all}
.t td.c{color:var(--text-2);white-space:nowrap}
.t td.ac{text-align:right;white-space:nowrap}
.t td.ac .bx{display:inline-flex;gap:6px;align-items:center}
.pill{display:inline-block;font-size:11.5px;font-weight:700;border-radius:20px;padding:2px 9px;border:1px solid currentColor;white-space:nowrap}
.pill.pendente{color:var(--accent-text)}.pill.ativo{color:var(--pos)}.pill.expirado,.pill.bloqueado,.pill.recusado{color:var(--neg)}.pill.confirmar,.pill.admin{color:var(--text-3)}
.venc{color:var(--accent-text);font-weight:600}
details.mais{position:relative;display:inline-block}
details.mais summary{list-style:none;cursor:pointer;border:1px solid var(--line-2);background:var(--surface-2);border-radius:7px;padding:6px 10px;font-weight:700;min-height:34px;display:flex;align-items:center}
details.mais summary::-webkit-details-marker{display:none}
details.mais[open] .menu{display:flex}
.menu{display:none;position:absolute;right:0;top:calc(100% + 4px);z-index:6;flex-direction:column;min-width:170px;background:var(--surface);border:1px solid var(--line-2);border-radius:9px;padding:5px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
.menu button{background:none;border:0;color:var(--text);text-align:left;padding:8px 10px;border-radius:6px;cursor:pointer;font-weight:500;font-size:13px}
.menu button:hover{background:var(--surface-2)}
.menu button.del{color:var(--neg)}
.tag{font-size:11px;border:1px solid var(--line-2);border-radius:10px;padding:1px 8px;color:var(--text-2)}
.vazio{color:var(--text-3);font-size:13px;margin:0}
.caixa{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin:0 0 8px}
.caixa p{margin:0 0 8px;color:var(--text-2);font-size:13px}.caixa p:last-child{margin-bottom:0}
.caixa b{color:var(--text)}
.prov{border-color:var(--accent)}
.cod{font:600 18px/1.3 ui-monospace,Menlo,Consolas,monospace;letter-spacing:.04em;color:var(--text);background:var(--surface-2);border:1px solid var(--line-2);border-radius:7px;padding:6px 10px;display:inline-block;word-break:break-all;user-select:all}
.linha{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}
.cfg{display:grid;grid-template-columns:1fr 1fr;gap:0 24px;align-items:start}
.cfg>div>h2:first-child{margin-top:4px}
ol{margin:6px 0 0;padding-left:20px;color:var(--text-2);font-size:13px}
[data-p][hidden]{display:none}
button.nm{background:none;border:0;padding:0;color:var(--text);font:inherit;font-weight:600;font-size:14px;cursor:pointer;text-align:left;display:block}
button.nm:hover{color:var(--accent-text);text-decoration:underline}
.t td.p .cel{display:block;color:var(--text-3);font-size:12px}
dialog#dlg-hist{border:1px solid var(--line-2);border-radius:14px;background:var(--surface);color:var(--text);padding:0;width:min(640px,calc(100vw - 24px));max-height:calc(100vh - 24px)}
dialog#dlg-hist::backdrop{background:rgba(3,6,12,.6)}
.hs-dados{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin:12px 0}
.hs-dados div{background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:8px 10px}
.hs-dados small{display:block;color:var(--text-3);font-size:11.5px}.hs-dados b{font-size:13px}
.hs-bts{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 6px}
.linha-t{list-style:none;margin:0;padding:0;border-left:2px solid var(--line-2)}
.linha-t li{position:relative;padding:0 0 12px 16px;font-size:13px}
.linha-t li::before{content:"";position:absolute;left:-6px;top:4px;width:10px;height:10px;border-radius:50%;background:var(--surface);border:2px solid var(--line-2)}
.linha-t li.pg::before{border-color:var(--pos)}.linha-t li.adm::before{border-color:var(--accent)}
.linha-t time{display:block;color:var(--text-3);font-size:11.5px}
#hs .menu{left:0;right:auto}
#hs .menu button[data-a=hist]{display:none}
.fun{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px}
.fun div{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.fun small{display:block;color:var(--text-3);font-size:12px}.fun strong{font-size:22px}.fun em{display:block;font-style:normal;color:var(--text-3);font-size:12px}
.mm{width:100%;border-collapse:separate;border-spacing:0;background:var(--surface);border:1px solid var(--line);border-radius:12px;font-size:13px}
.mm th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-3);text-align:right;padding:9px 12px;border-bottom:1px solid var(--line)}
.mm th:first-child,.mm td:first-child{text-align:left}
.mm td{padding:8px 12px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
.mm tr:last-child td{border-bottom:0}
.mm .bar{display:inline-block;height:8px;border-radius:4px;background:var(--accent);vertical-align:middle;margin-right:8px;min-width:2px}
.mm td.rc{width:38%}
.mmw{overflow-x:auto}
@media (max-width:820px){.fun{grid-template-columns:1fr 1fr}.mm td.rc .bar{display:none}.mm td.rc{width:auto}.mm th,.mm td{padding:8px 6px}.mm th{letter-spacing:0;font-size:10px}.mm .x30{display:none}}
dialog#dlg-acesso{border:1px solid var(--line-2);border-radius:14px;background:var(--surface);color:var(--text);padding:0;width:min(640px,calc(100vw - 24px));max-height:calc(100vh - 24px)}
dialog#dlg-acesso::backdrop{background:rgba(3,6,12,.6)}
.dl{padding:20px}
.dl-top{display:flex;gap:12px;align-items:flex-start}.dl-top>div{flex:1;min-width:0}
.dl h3{margin:0;font-size:18px}.dl .e{margin:2px 0 0;color:var(--text-2);font-size:13px;word-break:break-all}
.dl .x{background:none;border:0;color:var(--text-2);font-size:24px;line-height:1;cursor:pointer;padding:0 4px}
.dl .hoje{margin:12px 0;font-size:13px;color:var(--text-2);background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:8px 10px}
.ops{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.op{display:flex;flex-direction:column;gap:2px;text-align:left;padding:10px 12px;border:1px solid var(--line-2);border-radius:10px;background:var(--surface-2);color:var(--text);cursor:pointer;font:inherit}
.op[aria-pressed=true]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.op b{font-size:13px}.op strong{font-size:17px}.op span{font-size:11.5px;color:var(--text-3)}.op em{font-style:normal;font-size:12px;color:var(--accent-text);font-weight:600;margin-top:2px}
.lin{margin:12px 0 0;font-size:13px;color:var(--text-2);border:0;padding:0;display:flex;gap:14px;flex-wrap:wrap;align-items:center}
.lin legend{float:left;margin-right:4px;color:var(--text-3);padding:0}
.lin input[type=date]{background:var(--surface-2);border:1px solid var(--line-2);border-radius:7px;color:var(--text);padding:6px 8px;margin-left:6px;color-scheme:dark light}
.lin.pg{display:block;background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:9px 10px;line-height:1.45}
.lin[hidden]{display:none}
.am{color:var(--neg);font-size:13px;margin:10px 0 0}.am:empty{display:none}
.dl-ac{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
@media (max-width:820px){
  .grid2,.cfg{grid-template-columns:1fr}
  table.t,.t tbody,.t tr,.t td{display:block;width:100%}
  .t thead{display:none}
  table.t{background:none;border:0;border-radius:0}
  .t tr{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px}
  .t td{border:0;padding:3px 0}
  .t td.ac{text-align:left;padding-top:8px}
  .t td.c[data-r]::before{content:attr(data-r) ": ";color:var(--text-3)}
  .menu{left:0;right:auto}
  .marca span{display:none}
  .chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 -20px;padding:0 20px}
  .ferr input{min-width:0;width:100%}
}
/* visual 2026-10-30: barra lateral no computador, cartões e tabela mais limpos */
.app{max-width:1180px;margin:0 auto;padding:0 20px}
.lado{display:contents}
main{max-width:none;margin:0;padding:0 0 56px}
.marca img{display:none;border-radius:8px}
.ic{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex:none}
.abas .ic{display:none}
a.vol{display:inline-flex;align-items:center;gap:4px;text-decoration:none}
a.vol .ic{width:15px;height:15px}
a.vol:hover{text-decoration:underline}
.cab{margin:4px 0 16px}
.cab h1{margin:0;font-size:22px;font-weight:700;letter-spacing:-.01em}
.cab p{margin:2px 0 0;color:var(--text-3);font-size:13px}
.kpi,.fun div,.u,.caixa,table.t,.mm{box-shadow:0 1px 2px rgba(0,0,0,.12)}
.kpi{border-radius:14px;padding:16px 18px;transition:border-color .15s,transform .15s,box-shadow .15s}
.kpi:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,.18)}
.kpi:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.kpi strong{font-size:clamp(22px,1.8vw,28px);white-space:nowrap;font-variant-numeric:tabular-nums}
.kpi.alerta{border-color:var(--accent);background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 9%,var(--surface)),var(--surface))}
.fun div{border-radius:14px;padding:14px 16px}.fun strong{font-variant-numeric:tabular-nums}
.u,.caixa{border-radius:12px}
.caixa{padding:16px 18px}
h2{margin:26px 0 10px}
button.b,.u button,.caixa button,details.mais summary{border-radius:8px;transition:border-color .15s,background .15s,filter .15s}
button.b:hover,.u button:hover,.caixa button:hover,details.mais summary:hover{border-color:var(--text-3)}
button.lib:hover,.u button.lib:hover{filter:brightness(1.07);border-color:transparent}
button:focus-visible,summary:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.ferr input{border-radius:10px;min-height:42px}
.ferr input:focus,.caixa input:focus,.caixa select:focus,.caixa textarea:focus{outline:0;border-color:var(--accent)}
.chips button{transition:border-color .15s,color .15s}.chips button:hover{color:var(--text)}
table.t{border-radius:14px}
.t th:first-child{border-top-left-radius:13px}.t th:last-child{border-top-right-radius:13px}
.t td{padding:11px 14px}
.t tbody tr:hover td{background:color-mix(in srgb,var(--surface-2) 80%,transparent)}
.t td.c{font-variant-numeric:tabular-nums}
.pp{display:flex;gap:11px;align-items:center;min-width:0}.pp>div{min-width:0}
.av{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;flex:none;font-size:12px;font-weight:700;letter-spacing:.02em;color:var(--accent-text);background:color-mix(in srgb,var(--accent) 15%,var(--surface-2));border:1px solid color-mix(in srgb,var(--accent) 30%,transparent)}
.pill{border:0;background:color-mix(in srgb,currentColor 13%,transparent);padding:3px 10px 3px 8px}
.pill::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:6px;vertical-align:1px}
.menu{border-radius:11px;box-shadow:0 14px 34px rgba(0,0,0,.35)}
dialog#dlg-hist,dialog#dlg-acesso{border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.45)}
dialog#dlg-hist::backdrop,dialog#dlg-acesso::backdrop{backdrop-filter:blur(2px)}
.lin input[type=number]{background:var(--surface-2);border:1px solid var(--line-2);border-radius:7px;color:var(--text);padding:6px 8px;margin-left:6px}
@media (max-width:820px){
  .t td{padding:3px 0}
  .t tbody tr:hover td{background:none}
  .t td.p{padding-bottom:6px}
}
@media (min-width:1000px){
  .app{display:grid;grid-template-columns:236px minmax(0,1fr);max-width:none;padding:0;min-height:100vh;background:linear-gradient(90deg,var(--surface) 235px,var(--line) 235px 236px,transparent 236px)}
  .lado{display:flex;flex-direction:column;position:sticky;top:0;height:100vh;overflow-y:auto;padding:20px 12px 16px}
  .top{display:contents}
  .marca{order:0;flex:none;display:grid;grid-template-columns:30px 1fr;column-gap:10px;align-items:center;padding:0 8px 18px;border-bottom:1px solid var(--line)}
  .marca img{display:block;grid-row:span 2}
  .marca b{font-size:12px;letter-spacing:.2em}
  .marca span{font-size:12px;line-height:1.2}
  .abas{order:1;position:static;flex-direction:column;gap:2px;margin:14px 0 0;padding:0;border:0;background:none;overflow:visible}
  .abas button{border:0;border-radius:9px;padding:9px 12px;font-size:14px;font-weight:500;gap:11px;width:100%;text-align:left;color:var(--text-2)}
  .abas button:hover{background:var(--surface-2);color:var(--text)}
  .abas button[aria-selected=true]{background:color-mix(in srgb,var(--accent) 12%,var(--surface-2));color:var(--text);font-weight:600;box-shadow:inset 3px 0 0 var(--accent)}
  .abas button[aria-selected=true] .ic{color:var(--accent-text)}
  .abas .ic{display:block}
  .abas .cnt{margin-left:auto}
  a.vol{order:2;margin-top:auto;padding:10px 12px;border-top:1px solid var(--line);color:var(--text-2);font-size:13px}
  a.vol:hover{color:var(--text)}
  main{padding:30px 40px 64px;max-width:1280px;width:100%}
  .cab{margin:0 0 20px}
  .cab h1{font-size:26px}
  #msg{top:12px}
}
</style></head><body><div class="app"><aside class="lado">
<header class="top"><div class="marca"><img src="/icone-mercado-macro.png" alt="" width="30" height="30"><b>MERCADO MACRO</b><span>Administração</span></div><a class="vol" href="/"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>Voltar ao site</a></header>
<nav class="abas" role="tablist" aria-label="Seções">
  <button type="button" role="tab" data-aba="geral" aria-selected="true"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg><span class="rot">Visão geral</span></button>
  <button type="button" role="tab" data-aba="pessoas" aria-selected="false"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.8 2.6 2.5 3 5.2"/></svg><span class="rot">Pessoas</span> <span class="cnt" id="cnt-pessoas"></span></button>
  <button type="button" role="tab" data-aba="pagamentos" aria-selected="false"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/></svg><span class="rot">Pagamentos</span> <span class="cnt" id="cnt-pag"></span></button>
  <button type="button" role="tab" data-aba="comunicado" aria-selected="false"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg><span class="rot">E-mails</span></button>
  <button type="button" role="tab" data-aba="passe" aria-selected="false"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z"/><path d="M12 9v4M12 16h.01"/></svg><span class="rot">Acessos sem passe</span></button>
  <button type="button" role="tab" data-aba="ajustes" aria-selected="false"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg><span class="rot">Ajustes</span></button>
</nav>
</aside><main>
<div class="cab"><h1 id="tit">Visão geral</h1><p id="sub"></p></div>
<p class="msg" id="msg" role="status" aria-live="polite"></p>
<div id="prov"></div>
<section data-p="geral">
  <div class="kpis" id="kpis"></div>
  <div class="grid2">
    <div><h2>Precisa de você</h2><div id="acao"><p class="vazio">Carregando…</p></div></div>
    <div><h2>Vencem nos próximos 7 dias</h2><div id="venc"><p class="vazio">Carregando…</p></div></div>
  </div>
  <h2>Mês a mês</h2><div id="funil"><p class="vazio">Carregando…</p></div>
  <h2>De onde vêm os visitantes</h2>
  <p class="vazio" style="text-align:left;margin:0 0 10px;font-size:13px">Visitas à vitrine e às páginas públicas, e pedidos de acesso, pelo site que mandou a pessoa. Só o nome do site é guardado, sem IP e sem ligar a ninguém. <b>Direto ou app</b>: digitou o endereço, usou um favorito ou abriu o link num app que não informa a origem (o WhatsApp costuma cair aqui). Para saber de um link seu, acrescente <b>?origem=nome</b> ao endereço. Contando desde 26/10/2026.</p>
  <div id="origens"><p class="vazio">Carregando…</p></div>
</section>
<section data-p="pessoas" hidden>
  <div class="ferr"><input id="busca" type="search" name="filtro-pessoas" placeholder="Buscar por nome ou e-mail" autocomplete="off" data-lpignore="true" data-1p-ignore readonly aria-label="Buscar pessoa"><div class="chips" id="chips"></div><button type="button" class="b" id="csv-pessoas">Baixar planilha</button></div>
  <div id="raiz"><p class="vazio">Carregando…</p></div>
  <p class="vazio" id="nota-pessoas" style="margin-top:10px;font-size:12px"></p>
</section>
<section data-p="pagamentos" hidden><div class="ferr" style="justify-content:flex-end"><button type="button" class="b" id="csv-pags">Baixar planilha de pagamentos</button></div><div id="pags"><p class="vazio">Carregando…</p></div></section>
<section data-p="comunicado" hidden><h2>E-mail de boas-vindas para quem assinou</h2><div id="bv"><p class="vazio">Carregando…</p></div><h2>Comunicado de novidades</h2><div id="com"><p class="vazio">Carregando…</p></div></section>
<section data-p="passe" hidden>
  <h2>Pedidos ao servidor de dados sem o passe de login</h2>
  <p class="vazio" style="text-align:left;margin:0 0 12px;font-size:13px">Por enquanto o servidor só anota (não bloqueia). Mostra os últimos 14 dias, sem IP. <b>faltou</b>: chegou sem passe · <b>invalido</b>: passe falso · <b>vencido</b>: passe velho · <b>vitrine</b>: páginas públicas · <b>sem-chave</b>: o servidor não conseguiu conferir. Em "De onde", <b>navegador</b> é alguém num navegador, <b>script</b> é programa ou robô de fora e <b>robo:</b> são os nossos robôs do GitHub.</p>
  <div class="kpis" id="passe-res" style="margin-bottom:14px"></div>
  <div id="passe-tab"><p class="vazio">Carregando…</p></div>
</section>
<section data-p="ajustes" hidden>
  <div class="cfg">
    <div><h2>Pix para assinaturas</h2><div id="pix"><p class="vazio">Carregando…</p></div>
      <h2>Cartão (Stripe)</h2><div id="stripe"><p class="vazio">Carregando…</p></div>
      <h2>E-mail (Resend)</h2><div id="email"><p class="vazio">Carregando…</p></div></div>
    <div><h2>Avisos no Telegram</h2><div id="avisos"><p class="vazio">Carregando…</p></div>
      <h2>Assistente (Google Gemini)</h2><div id="assistente"><p class="vazio">Carregando…</p></div>
      <h2>Capital.com (cotações ao vivo)</h2><div id="capital"><p class="vazio">Carregando…</p></div>
      <h2>Sua conta de administrador</h2><div id="aparelhos"><p class="vazio">Carregando…</p></div></div>
  </div>
</section>
<dialog id="dlg-hist" aria-labelledby="hs-t"><div class="dl" id="hs"></div></dialog>
<dialog id="dlg-acesso" aria-labelledby="ac-t">
  <div class="dl">
    <div class="dl-top"><div><h3 id="ac-t"></h3><p id="ac-e" class="e"></p></div><button type="button" class="x" data-fechar aria-label="Fechar">&times;</button></div>
    <p id="ac-hoje" class="hoje"></p>
    <div class="ops" id="ac-opc"></div>
    <div id="ac-dt" class="lin" hidden><label>Vale até <input type="date" id="ac-data"></label></div>
    <div id="ac-cd" class="lin" hidden><label>Dias de cortesia <input type="number" id="ac-dias" min="1" max="30" step="1" value="1" inputmode="numeric" style="width:84px"></label></div>
    <fieldset id="ac-ini" class="lin"><legend>Começa</legend>
      <label><input type="radio" name="ac-ini" value="hoje" checked> hoje</label>
      <label><input type="radio" name="ac-ini" value="somar"> depois de <span id="ac-somar-d"></span> (soma ao que já tem)</label>
    </fieldset>
    <label id="ac-pg" class="lin pg" hidden><input type="checkbox" id="ac-pago"> Recebi <span id="ac-pg-v"></span> por fora: contar em "Recebido no mês" e mandar o e-mail de pagamento confirmado</label>
    <p id="ac-msg" class="am" role="alert"></p>
    <div class="dl-ac"><button type="button" class="b" data-fechar>Cancelar</button><button type="button" class="b lib" id="ac-salvar">Salvar</button></div>
  </div>
</dialog>
</main></div>
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
    pendente: [['acesso','Liberar com plano',''],['recusar','Recusar',''],['excluir','Excluir','del']],
    ativo: [['acesso','Acesso',''],['senha','Nova senha',''],['bloquear','Bloquear',''],['excluir','Excluir','del']],
    expirado: [['acesso','Renovar','lib'],['excluir','Excluir','del']],
    recusado: [['acesso','Liberar com plano',''],['excluir','Excluir','del']],
    bloqueado: [['liberar','Liberar de novo','lib'],['acesso','Liberar com plano',''],['excluir','Excluir','del']],
    confirmar: [['liberar','Liberar mesmo assim','lib'],['acesso','Liberar com plano',''],['excluir','Excluir','del']]
  };
  var US = [], PG = [], MES = null, filtro = 'todos', ALERTA = 4;
  var SIT = { pendente: 'Sem plano', ativo: 'Liberado', expirado: 'Vencido', confirmar: 'Sem confirmar e-mail', recusado: 'Recusado', bloqueado: 'Bloqueado' };
  var semAc = function(t){ return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); };
  var agora = function(){ return new Date().toISOString(); };
  var em7 = function(u){ return u.status === 'ativo' && !u.admin && u.expira && u.expira > agora() && u.expira <= new Date(Date.now() + 7 * 864e5).toISOString(); };
  var FILTROS = [
    ['todos', 'Todos', function(){ return true; }],
    ['pendente', 'Sem plano', function(u){ return u.status === 'pendente'; }],
    ['ativo', 'Liberados', function(u){ return u.status === 'ativo' && !u.admin; }],
    ['vence', 'Vencem em 7 dias', em7],
    ['expirado', 'Vencidos', function(u){ return u.status === 'expirado'; }],
    ['confirmar', 'Sem confirmar', function(u){ return u.status === 'confirmar'; }],
    ['fora', 'Recusados e bloqueados', function(u){ return u.status === 'recusado' || u.status === 'bloqueado'; }]
  ];
  // botão principal de cada situação; o resto fica no menu (...)
  var PRINCIPAL = { pendente: ['acesso'], ativo: ['acesso'], expirado: ['acesso'], confirmar: ['liberar'], recusado: ['acesso'], bloqueado: ['liberar'] };
  function botoes(u, zapPrincipal){
    if (u.id === eu || u.admin) return '<span class="pill admin">administrador</span>';
    var todos = (BT[u.status] || []).slice(), pri = (PRINCIPAL[u.status] || []).slice();
    // WhatsApp entra antes de Excluir; nas listas de "precisa de você" e "vencem" fica à vista
    if (u.celular) { todos.splice(todos.length - 1, 0, ['zap', 'WhatsApp', '']); if (zapPrincipal) pri.push('zap'); }
    todos.splice(todos.length - 1, 0, ['hist', 'Histórico', '']);
    var at = function(b, menu){ return '<button type="button" class="' + (menu ? (b[2] === 'del' ? 'del' : '') : 'b ' + b[2]) + '" data-id="' + u.id + '" data-a="' + b[0] + '" data-n="' + esc(u.nome) + '">' + b[1] + '</button>'; };
    var resto = todos.filter(function(b){ return pri.indexOf(b[0]) < 0; });
    return '<span class="bx">' + todos.filter(function(b){ return pri.indexOf(b[0]) >= 0; }).map(function(b){ return at(b); }).join('')
      + (resto.length ? '<details class="mais"><summary aria-label="Mais ações">&middot;&middot;&middot;</summary><div class="menu">' + resto.map(function(b){ return at(b, true); }).join('') + '</div></details>' : '') + '</span>';
  }
  function validade(u){
    if (u.admin) return '—';
    if (u.status === 'expirado') return 'venceu ' + dia(u.expira);
    if (u.status !== 'ativo') return '—';
    if (!u.expira) return 'sem validade';
    return '<span class="' + (em7(u) ? 'venc' : '') + '">até ' + dia(u.expira) + '</span>';
  }
  var NOMEP = { cortesia: 'Cortesia', gratis: 'Grátis 48h', degustacao: 'Degustação', mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual', sem: 'Sem validade', data: 'Data definida' };
  function plano(u){
    if (u.admin) return '—';
    if (u.plano) return NOMEP[u.plano] || u.plano;
    return u.status === 'ativo' && !u.expira ? 'Sem validade' : '—';
  }
  // ordem escolhida clicando no título da coluna (1 = crescente, -1 = decrescente); vazio fica sempre embaixo
  var ORD = { c: '', d: 1 };
  var COLS = [['nome', 'Pessoa', 1], ['sit', 'Situação', 1], ['plano', 'Plano', 1], ['val', 'Validade', -1], ['acesso', 'Último acesso', -1], ['criado', 'Cadastro', -1]];
  function valorOrd(u, c){
    if (c === 'nome') return semAc(u.nome || '');
    if (c === 'sit') return u.admin ? 'administrador' : semAc(SIT[u.status] || u.status || '');
    if (c === 'plano') { var p = plano(u); return p === '—' ? null : semAc(p); }
    if (c === 'val') return u.admin || (u.status !== 'ativo' && u.status !== 'expirado') ? null : (u.expira || (u.status === 'ativo' ? '9999' : null));
    if (c === 'acesso') return u.ultimo_acesso || null;
    if (c === 'criado') return u.criado || null;
    return null;
  }
  function pessoas(){
    var q = semAc(document.getElementById('busca').value.trim());
    var f = (FILTROS.filter(function(x){ return x[0] === filtro; })[0] || FILTROS[0])[2];
    var ordem = { pendente: 0, confirmar: 1, expirado: 2, ativo: 3, recusado: 4, bloqueado: 5 };
    var lista = US.filter(f).filter(function(u){ return !q || semAc(u.nome + ' ' + u.email).indexOf(q) >= 0; })
      .sort(function(a, b){ return (ordem[a.status] - ordem[b.status]) || (a.criado < b.criado ? 1 : -1); });
    if (ORD.c) lista.sort(function(a, b){
      var x = valorOrd(a, ORD.c), y = valorOrd(b, ORD.c);
      if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1;
      return x < y ? -ORD.d : x > y ? ORD.d : 0;
    });
    document.getElementById('chips').innerHTML = FILTROS.map(function(x){ return '<button type="button" data-f="' + x[0] + '" aria-pressed="' + (filtro === x[0]) + '">' + x[1] + '<i>' + US.filter(x[2]).length + '</i></button>'; }).join('');
    raiz.innerHTML = lista.length ? '<table class="t"><thead><tr>' + COLS.map(function(c){ var on = ORD.c === c[0]; return '<th' + (on ? ' aria-sort="' + (ORD.d > 0 ? 'ascending' : 'descending') + '"' : '') + '><button type="button" class="ord' + (on ? ' on' : '') + '" data-o="' + c[0] + '">' + c[1] + '<i>' + (on ? (ORD.d > 0 ? '&#9650;' : '&#9660;') : '&#8597;') + '</i></button></th>'; }).join('') + '<th></th></tr></thead><tbody>'
      + lista.map(function(u){
        return '<tr><td class="p"><div class="pp"><span class="av" aria-hidden="true">' + esc(iniciais(u.nome)) + '</span><div><button type="button" class="nm" data-h="' + u.id + '">' + esc(u.nome) + '</button><span>' + esc(u.email) + '</span>' + (u.celular ? '<span class="cel">' + celFmt(u.celular) + '</span>' : '') + '</div></div></td>'
          + '<td><span class="pill ' + (u.admin ? 'admin' : u.status) + '">' + (u.admin ? 'Administrador' : SIT[u.status] || u.status) + '</span></td>'
          + '<td class="c" data-r="Plano">' + plano(u) + '</td><td class="c" data-r="Validade">' + validade(u) + '</td><td class="c" data-r="Último acesso">' + data(u.ultimo_acesso) + '</td><td class="c" data-r="Cadastro">' + dia(u.criado) + '</td>'
          + '<td class="ac">' + botoes(u) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p class="vazio">Ninguém ' + (q ? 'com essa busca' : 'nesta lista') + '.</p>';
    document.getElementById('nota-pessoas').textContent = US.some(function(u){ return u.status === 'confirmar'; }) ? 'Quem está "Sem confirmar e-mail" pediu acesso mas não clicou no link de confirmação; some sozinho depois de 7 dias.' : '';
  }
  function geral(){
    var pend = US.filter(function(u){ return u.status === 'pendente'; }), env = PG.filter(function(p){ return p.status === 'enviado'; });
    var lib = US.filter(function(u){ return u.status === 'ativo' && !u.admin; }), venc = US.filter(em7).sort(function(a, b){ return a.expira < b.expira ? -1 : 1; });
    var rec = MES ? MES.total : 0, nrec = MES ? MES.n : 0;
    var novos = US.filter(function(u){ return u.criado > new Date(Date.now() - 7 * 864e5).toISOString(); }).length;
    var k = function(ir, rot, val, nota, alerta){ return '<button type="button" class="kpi' + (alerta ? ' alerta' : '') + '" data-ir="' + ir + '"><small>' + rot + '</small><strong>' + val + '</strong><em>' + nota + '</em></button>'; };
    document.getElementById('kpis').innerHTML = k('pessoas:pendente', 'Pediram acesso', pend.length, 'ainda sem plano')
      + k('pagamentos', 'Pagamentos para conferir', env.length, env.length ? 'comprovantes novos' : 'tudo conferido', env.length)
      + k('pessoas:ativo', 'Com acesso liberado', lib.length, lib.filter(function(u){ return !u.expira; }).length + ' sem validade')
      + k('pessoas:vence', 'Vencem em 7 dias', venc.length, venc.length ? 'toque para ver' : 'nenhum')
      + k('pagamentos', 'Recebido no mês', MES ? reais(rec) : '—', nrec + ' aprovado(s)')
      + k('pessoas:todos', 'Cadastros na semana', novos, US.length + ' no total');
    // desde 26/10/2026 não há liberação grátis: quem pede acesso escolhe um plano, e aqui fica só o Pix para conferir
    // contas que trocam muito de aparelho (o 3º login derruba o mais antigo): possível senha dividida
    var dividem = US.filter(function(u){ return (u.trocas || 0) >= ALERTA; }).sort(function(a, b){ return b.trocas - a.trocas; });
    document.getElementById('acao').innerHTML = env.length || dividem.length ? '<div class="lista">'
      + env.map(function(p){ return '<div class="u"><div class="q"><div class="n">' + esc(p.nome) + '</div><div class="d">Comprovante · ' + esc(p.nome_plano) + ' ' + reais(p.valor) + ' · ' + data(p.enviado) + '</div></div><div class="bts"><button type="button" class="lib" data-ir="pagamentos">Conferir</button></div></div>'; }).join('')
      + dividem.map(function(u){ return '<div class="u"><div class="q"><button type="button" class="nm n" data-h="' + u.id + '">' + esc(u.nome) + '</button><div class="d">Possível senha dividida · ' + u.trocas + ' trocas de aparelho em 7 dias</div></div><div class="bts"><button type="button" class="lib" data-h="' + u.id + '">Ver histórico</button></div></div>'; }).join('')
      + '</div>'
      : '<p class="vazio">Nenhum Pix para conferir e nenhuma conta suspeita de senha dividida. Tudo em dia.</p>';
    document.getElementById('venc').innerHTML = venc.length ? '<div class="lista">' + venc.map(function(u){ return '<div class="u"><div class="q"><button type="button" class="nm n" data-h="' + u.id + '">' + esc(u.nome) + '</button><div class="d">Vence ' + dia(u.expira) + '</div></div><div class="bts">' + botoes(u, true) + '</div></div>'; }).join('') + '</div>' : '<p class="vazio">Ninguém vence nos próximos 7 dias.</p>';
    document.getElementById('cnt-pessoas').textContent = '';
    document.getElementById('cnt-pag').textContent = env.length || '';
  }
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function funil(){
    fetch('/api/admin/numeros', { credentials: 'same-origin' }).then(function(r){ if (!r.ok) throw r; return r.json(); }).then(function(j){
      // meses antes do primeiro movimento ficam de fora
      var ms = j.meses.slice(); while (ms.length > 1 && !ms[0].cadastros && !ms[0].pagamentos) ms.shift();
      var conv = j.liberados ? Math.round(100 * j.pagantes / j.liberados) + '%' : '—';
      var max = Math.max.apply(null, j.meses.map(function(m){ return m.receita; }).concat([1]));
      document.getElementById('funil').innerHTML = '<div class="fun">'
        + '<div><small>Já tiveram acesso</small><strong>' + j.liberados + '</strong><em>liberados ou vencidos</em></div>'
        + '<div><small>Já pagaram</small><strong>' + j.pagantes + '</strong><em>' + conv + ' de quem teve acesso</em></div>'
        + '<div><small>Assinantes agora</small><strong>' + j.assinantes + '</strong><em>pagaram e estão com acesso</em></div>'
        + '<div><small>Receita total</small><strong>' + reais(j.receita) + '</strong><em>desde o início</em></div></div>'
        + '<div class="mmw"><table class="mm"><thead><tr><th>Mês</th><th>Cadastros</th><th title="Pessoas que pagaram pela primeira vez">1º pag.</th><th title="Pagamentos aprovados">Pagos</th><th>Receita</th></tr></thead><tbody>'
        + ms.slice().reverse().map(function(m){
          var x = m.mes.split('-');
          return '<tr><td>' + MESES[+x[1] - 1] + '/' + x[0].slice(2) + '</td><td>' + m.cadastros + '</td><td>' + m.novos_pagantes + '</td><td>' + m.pagamentos + '</td><td class="rc"><span class="bar" style="width:' + Math.round(60 * m.receita / max) + '%"></span>' + reais(m.receita) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }).catch(function(){ document.getElementById('funil').innerHTML = '<p class="vazio">Não foi possível carregar os números.</p>'; });
  }
  function origens(){
    var raiz = document.getElementById('origens');
    fetch('/api/admin/origens', { credentials: 'same-origin' }).then(function(r){ if (!r.ok) throw r; return r.json(); }).then(function(j){
      var hoje = j.hoje, d7 = new Date(Date.parse(hoje + 'T12:00:00Z') - 6 * 864e5).toISOString().slice(0, 10), T = {}, TG = {};
      (j.linhas || []).forEach(function(l){
        if (l.tipo === 'canal') { var t = TG[l.origem] || (TG[l.origem] = { s: 0, m: 0 }); t.m += l.n; if (l.dia >= d7) t.s += l.n; return; }
        var o = T[l.origem] || (T[l.origem] = { o: l.origem, h: 0, s: 0, m: 0, c: 0, c7: 0 });
        if (l.tipo === 'cadastro') { o.c += l.n; if (l.dia >= d7) o.c7 += l.n; return; }
        o.m += l.n; if (l.dia >= d7) o.s += l.n; if (l.dia === hoje) o.h += l.n;
      });
      var L = Object.keys(T).map(function(k){ return T[k]; }).sort(function(a, b){ return b.s - a.s || b.m - a.m || b.c - a.c; });
      var max = Math.max.apply(null, L.map(function(o){ return o.s; }).concat([1])), f = function(v){ return v ? v.toLocaleString('pt-BR') : '<span style="color:var(--text-3)">0</span>'; };
      raiz.innerHTML = (!L.length ? '<p class="vazio">Ainda nenhuma visita contada.</p>' : '<div class="mmw"><table class="mm"><thead><tr><th>Origem</th><th>Hoje</th><th>7 dias</th><th class="x30">30 dias</th><th title="Pedidos de acesso nos últimos 7 dias">Pedidos 7d</th><th class="x30" title="Pedidos de acesso nos últimos 30 dias">Pedidos 30d</th></tr></thead><tbody>'
        + L.map(function(o){ return '<tr><td>' + esc(o.o) + '</td><td>' + f(o.h) + '</td><td class="rc"><span class="bar" style="width:' + Math.round(50 * o.s / max) + '%"></span>' + f(o.s) + '</td><td class="x30">' + f(o.m) + '</td><td>' + f(o.c7) + '</td><td class="x30">' + f(o.c) + '</td></tr>'; }).join('')
        + '</tbody></table></div>') + canal();
      function canal(){
        var k = Object.keys(TG);
        return '<h2 style="margin-top:22px">Cliques no convite do canal do Telegram</h2>' + (k.length ? '<div class="mmw"><table class="mm"><thead><tr><th>Onde clicou</th><th>7 dias</th><th>30 dias</th></tr></thead><tbody>'
          + k.sort(function(a, b){ return TG[b].m - TG[a].m; }).map(function(n){ return '<tr><td>' + esc(n) + '</td><td>' + f(TG[n].s) + '</td><td>' + f(TG[n].m) + '</td></tr>'; }).join('') + '</tbody></table></div>'
          : '<p class="vazio" style="text-align:left">Nenhum clique ainda.</p>')
          + '<p class="vazio" style="text-align:left;margin-top:8px;font-size:13px">Quantos entraram de fato aparece no próprio Telegram: no canal, Links de convite, um link para cada lugar (nome começa com "Site:").</p>';
      }
    }).catch(function(){ raiz.innerHTML = '<p class="vazio">Não foi possível carregar as origens.</p>'; });
  }
  function carregar(){
    funil(); origens();
    fetch('/api/admin/usuarios', { credentials: 'same-origin' }).then(function(r){ if (!r.ok) throw r; return r.json(); }).then(function(j){
      eu = j.eu; US = j.usuarios; ALERTA = j.alertaTrocas || 4;
      // validade já passou mas o robô diário ainda não marcou: mostra como vencido (o acesso já está cortado)
      US.forEach(function(u){ if (u.status === 'ativo' && !u.admin && u.expira && u.expira <= agora()) u.status = 'expirado'; });
      pessoas(); geral();
    }).catch(function(){ raiz.innerHTML = '<p class="vazio">Não foi possível carregar os cadastros.</p>'; });
  }
  // abas (lembradas no endereço: /admin#pessoas)
  var SUBT = { geral: 'Resumo de cadastros, pagamentos e visitas.', pessoas: 'Todos os cadastros, com plano, validade e ações.', pagamentos: 'Comprovantes de Pix para conferir e o que já foi decidido.', comunicado: 'Boas-vindas para quem assina e comunicados de novidades.', passe: 'Pedidos ao servidor de dados sem o passe de login.', ajustes: 'Pix, cartão, e-mail, Telegram, assistente e sua conta.' };
  function iniciais(n){ var p = String(n || '?').trim().split(/\s+/); return ((p[0] || '?').charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase(); }
  function aba(n, f){
    if (!document.querySelector('[data-p="' + n + '"]')) n = 'geral';
    document.querySelectorAll('[data-p]').forEach(function(x){ x.hidden = x.dataset.p !== n; });
    document.querySelectorAll('.abas button').forEach(function(x){ x.setAttribute('aria-selected', x.dataset.aba === n); if (x.dataset.aba === n && x.scrollIntoView) x.scrollIntoView({ block: 'nearest', inline: 'center' }); });
    var bt = document.querySelector('.abas button[data-aba="' + n + '"] .rot');
    document.getElementById('tit').textContent = bt ? bt.textContent : '';
    document.getElementById('sub').textContent = SUBT[n] || '';
    if (f) { filtro = f; pessoas(); }
    if (n === 'passe') passe();
    if (location.hash.slice(1) !== n) history.replaceState(null, '', '#' + n);
  }
  function passe(){
    var tab = document.getElementById('passe-tab'), res = document.getElementById('passe-res');
    fetch('/api/admin/passe', { credentials: 'same-origin' }).then(function(r){ return r.json(); }).then(function(j){
      var L = j.linhas || [], hoje = new Date(), sete = new Date(hoje.getTime() - 6 * 864e5).toISOString().slice(0, 10), soma = {};
      L.forEach(function(l){ if (l.dia >= sete) soma[l.motivo] = (soma[l.motivo] || 0) + l.n; });
      var nomes = { faltou: 'Sem passe', invalido: 'Passe falso', vencido: 'Passe vencido', vitrine: 'Páginas públicas', 'sem-chave': 'Sem conferir' };
      res.innerHTML = Object.keys(nomes).filter(function(k){ return soma[k]; }).map(function(k){ return '<div class="kpi" style="cursor:default"><small>' + nomes[k] + '</small><strong>' + soma[k].toLocaleString('pt-BR') + '</strong><em>últimos 7 dias</em></div>'; }).join('');
      if (!L.length) { tab.innerHTML = '<p class="vazio">Nenhum pedido sem passe nos últimos 14 dias.</p>'; return; }
      tab.innerHTML = '<table class="t"><thead><tr><th>Dia</th><th>Rota</th><th>Motivo</th><th>De onde</th><th style="text-align:right">Vezes</th></tr></thead><tbody>' + L.map(function(l){
        return '<tr><td class="c" data-r="Dia">' + esc(l.dia.split('-').reverse().join('/')) + '</td><td data-r="Rota">' + esc(l.rota) + '</td><td class="c" data-r="Motivo">' + esc(l.motivo) + '</td><td class="c" data-r="De onde">' + esc(l.quem) + '</td><td class="c" data-r="Vezes" style="text-align:right">' + l.n.toLocaleString('pt-BR') + '</td></tr>';
      }).join('') + '</tbody></table>';
    }).catch(function(){ tab.innerHTML = '<p class="vazio">Não foi possível carregar o registro.</p>'; });
  }
  document.querySelector('.abas').addEventListener('click', function(e){ var b = e.target.closest('button[data-aba]'); if (b) aba(b.dataset.aba); });
  document.getElementById('chips').addEventListener('click', function(e){ var b = e.target.closest('button[data-f]'); if (b) { filtro = b.dataset.f; pessoas(); } });
  raiz.addEventListener('click', function(e){
    var b = e.target.closest('button[data-o]'); if (!b) return;
    var c = b.dataset.o, def = COLS.filter(function(x){ return x[0] === c; })[0][2];
    if (ORD.c !== c) ORD = { c: c, d: def }; else if (ORD.d === def) ORD.d = -def; else ORD = { c: '', d: 1 };
    pessoas();
  });
  document.getElementById('busca').addEventListener('input', pessoas);
  // o navegador preenche a busca sozinho (o gerenciador de senhas acha que é o campo de e-mail das caixas de chave,
  // e ao recarregar a página ele devolve o que estava digitado): começa sempre vazia, a não ser que você esteja digitando nela
  (function(){
    var bq = document.getElementById('busca');
    // só aceita texto depois que você toca nela: campo somente leitura o navegador não preenche
    ['focus', 'pointerdown', 'keydown'].forEach(function(ev){ bq.addEventListener(ev, function(){ bq.removeAttribute('readonly'); }); });
    function limpa(){ if (bq.value && document.activeElement !== bq) { bq.value = ''; pessoas(); } }
    [0, 400, 1200, 2500].forEach(function(t){ setTimeout(limpa, t); });
    window.addEventListener('pageshow', limpa);
  })();
  document.querySelector('main').addEventListener('click', function(e){
    var b = e.target.closest('[data-ir]'); if (!b) return;
    var x = b.dataset.ir.split(':'); aba(x[0], x[1]); window.scrollTo(0, 0);
  });
  // fecha o menu (...) ao clicar fora
  document.addEventListener('click', function(e){ document.querySelectorAll('details.mais[open]').forEach(function(d){ if (!d.contains(e.target)) d.open = false; }); });
  aba(location.hash.slice(1) || 'geral');
  document.querySelector('main').addEventListener('click', function(ev){
    var b = ev.target.closest('button[data-a]'); if (!b) return;
    var dm = b.closest('details'); if (dm) dm.open = false;
    var a = b.dataset.a;
    if (a === 'senha') return novaSenha(b);
    if (a === 'acesso') return abrirAcesso(+b.dataset.id);
    if (a === 'zap') return zap(+b.dataset.id);
    if (a === 'hist') return abrirHistorico(+b.dataset.id);
    if ((a === 'excluir' || a === 'bloquear') && !confirm((a === 'excluir' ? 'Excluir de vez o cadastro de ' + b.dataset.n + '? Nome, e-mail e senha são apagados e não dá para desfazer.' : 'Bloquear o acesso de ' + b.dataset.n + '?'))) return;
    b.disabled = true;
    fetch('/api/admin/decidir', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: +b.dataset.id, acao: a }) })
      .then(function(r){ return r.json().then(function(j){ if (!r.ok) throw j; return j; }); })
      .then(function(j){ msg.className = 'msg ok'; msg.textContent = { liberar: 'Acesso liberado para ', recusar: 'Cadastro recusado: ', bloquear: 'Acesso bloqueado: ', excluir: 'Cadastro excluído: ' }[a] + b.dataset.n + (j && j.validade ? ' até ' + dia(j.validade) : '') + '.' + (j && j.email === 'enviado' ? EMAIL.enviado : j && j.email === 'falhou' ? EMAIL.falhou : ''); carregar(); })
      .catch(function(j){ msg.className = 'msg erro'; msg.textContent = (j && j.erro) || 'Não foi possível. Tente de novo.'; b.disabled = false; });
  });
  // janela "Acesso": define o plano/validade de uma pessoa
  var OPC = [
    ['cortesia', 'Cortesia', '1 dia grátis', 0, { dias: 1 }],
    ['degustacao', 'Degustação', '7 dias', 499, { dias: 7 }],
    ['mensal', 'Mensal', '1 mês', 2990, { meses: 1 }],
    ['semestral', 'Semestral', '6 meses', 14990, { meses: 6 }],
    ['anual', 'Anual', '12 meses', 24990, { meses: 12 }],
    ['sem', 'Sem validade', 'não vence', 0, null],
    ['data', 'Até uma data', 'você escolhe o dia', 0, null]
  ];
  var dlg = document.getElementById('dlg-acesso'), AU = null, AT = 'cortesia';
  // dias da cortesia: você escolhe (1 a 30); o último número usado fica lembrado neste navegador
  function diasCortesia(){ var n = Math.round(+document.getElementById('ac-dias').value); return n >= 1 && n <= 30 ? n : 1; }
  function ajustarCortesia(){ var n = diasCortesia(), o = OPC[0]; o[2] = n + (n === 1 ? ' dia grátis' : ' dias grátis'); o[4] = { dias: n }; }
  try { var cdl = +localStorage.getItem('mm_cortesia_dias'); if (cdl >= 1 && cdl <= 30) document.getElementById('ac-dias').value = cdl; } catch (e) {}
  ajustarCortesia();
  function somar(base, per){ var d = new Date(base), n = d.getUTCDate(); if (per.dias) d.setTime(d.getTime() + per.dias * 864e5); else { d.setUTCMonth(d.getUTCMonth() + per.meses); if (d.getUTCDate() !== n) d.setUTCDate(0); } return d.toISOString(); }
  function vigente(u){ return u.status === 'ativo' && u.expira && u.expira > agora(); }
  function abrirAcesso(id){
    AU = US.filter(function(u){ return u.id === id; })[0]; if (!AU) return;
    AT = AU.status === 'ativo' && AU.plano && AU.plano !== 'cortesia' && AU.plano !== 'sem' && AU.plano !== 'data' ? AU.plano : AU.status === 'ativo' ? 'mensal' : 'cortesia';
    // plano que não está na janela (grátis 48h, trimestral antigo): começa no mensal (antes travava e a janela não abria)
    if (!OPC.some(function(o){ return o[0] === AT; })) AT = 'mensal';
    document.getElementById('ac-t').textContent = AU.nome;
    document.getElementById('ac-e').textContent = AU.email;
    document.getElementById('ac-hoje').textContent = 'Situação: ' + (SIT[AU.status] || AU.status) + (AU.plano ? ' · ' + (NOMEP[AU.plano] || AU.plano) : '') + ' · ' + (AU.status === 'ativo' ? (AU.expira ? 'vale até ' + dia(AU.expira) : 'sem validade') : AU.status === 'expirado' ? 'venceu ' + dia(AU.expira) : 'sem acesso');
    document.getElementById('ac-ini').hidden = !vigente(AU);
    document.getElementById('ac-somar-d').textContent = vigente(AU) ? dia(AU.expira) : '';
    document.querySelector('input[name=ac-ini][value=hoje]').checked = true;
    document.getElementById('ac-pago').checked = false;
    document.getElementById('ac-data').value = '';
    document.getElementById('ac-msg').textContent = '';
    desenharAcesso();
    dlg.showModal();
  }
  function desenharAcesso(){
    var somarIni = vigente(AU) && document.querySelector('input[name=ac-ini]:checked').value === 'somar';
    var base = somarIni ? AU.expira : agora();
    document.getElementById('ac-opc').innerHTML = OPC.map(function(o){
      var ate = o[4] ? 'até ' + dia(somar(base, o[4])) : o[0] === 'sem' ? 'não vence' : 'escolha abaixo';
      return '<button type="button" class="op" data-t="' + o[0] + '" aria-pressed="' + (AT === o[0]) + '"><b>' + o[1] + '</b><strong>' + (o[3] ? reais(o[3]) : o[0] === 'cortesia' ? 'Grátis' : '—') + '</strong><span>' + o[2] + '</span><em>' + ate + '</em></button>';
    }).join('');
    var o = OPC.filter(function(x){ return x[0] === AT; })[0];
    document.getElementById('ac-dt').hidden = AT !== 'data';
    document.getElementById('ac-cd').hidden = AT !== 'cortesia';
    document.getElementById('ac-ini').style.display = (vigente(AU) && o[4]) ? '' : 'none';
    document.getElementById('ac-pg').hidden = !o[3];
    document.getElementById('ac-pg-v').textContent = o[3] ? reais(o[3]) : '';
  }
  dlg.addEventListener('click', function(e){
    var op = e.target.closest('.op'); if (op) { AT = op.dataset.t; desenharAcesso(); return; }
    if (e.target === dlg || e.target.closest('[data-fechar]')) dlg.close();
  });
  dlg.addEventListener('change', function(e){ if (e.target.name === 'ac-ini') desenharAcesso(); });
  document.getElementById('ac-dias').addEventListener('input', function(){ ajustarCortesia(); desenharAcesso(); try { localStorage.setItem('mm_cortesia_dias', diasCortesia()); } catch (e) {} });
  document.getElementById('ac-salvar').addEventListener('click', function(){
    var b = this, m = document.getElementById('ac-msg');
    var corpo = { id: AU.id, tipo: AT, inicio: document.querySelector('input[name=ac-ini]:checked').value, dias: diasCortesia(), pago: document.getElementById('ac-pago').checked && !document.getElementById('ac-pg').hidden, ate: document.getElementById('ac-data').value };
    if (AT === 'data' && !corpo.ate) { m.textContent = 'Escolha a data.'; return; }
    if (AT === 'sem' && !confirm('Deixar o acesso de ' + AU.nome + ' sem data para terminar?')) return;
    b.disabled = true; m.textContent = '';
    post('/api/admin/acesso', corpo).then(function(j){
      dlg.close(); msg.className = 'msg ok';
      msg.textContent = AU.nome + ': ' + (NOMEP[AT] || AT) + (AT === 'cortesia' ? ' de ' + corpo.dias + (corpo.dias === 1 ? ' dia' : ' dias') : '') + ', ' + (j.expira ? 'acesso até ' + dia(j.expira) : 'acesso sem validade') + '.' + (corpo.pago ? ' Pagamento registrado em Recebido no mês.' : '') + (EMAIL[j.email] || '');
      carregar(); if (corpo.pago) pagamentos();
    }).catch(function(j){ m.textContent = (j && j.erro) || 'Não foi possível. Tente de novo.'; }).then(function(){ b.disabled = false; });
  });
  // celular 5511912345678 -> (11) 91234-5678
  function celFmt(c){ var d = String(c || '').slice(2); return d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7) : d.length === 10 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6) : c; }
  // WhatsApp com a mensagem pronta conforme a situação da pessoa
  function zap(id){
    var u = US.filter(function(x){ return x.id === id; })[0]; if (!u || !u.celular) return;
    var n = String(u.nome).split(' ')[0], site = 'https://mercadomacro.com.br/assinar', t;
    if (u.status === 'expirado') t = 'Oi, ' + n + '! Aqui é do Mercado Macro. Seu acesso terminou' + (u.expira ? ' em ' + dia(u.expira) : '') + '. Seus dados e listas continuam guardados. Para voltar, é só escolher um plano em ' + site;
    else if (u.status === 'ativo' && u.expira) t = 'Oi, ' + n + '! Aqui é do Mercado Macro. Seu acesso vai até ' + dia(u.expira) + '. Para continuar sem interrupção, é só escolher um plano em ' + site + ' (se renovar antes, o novo período começa depois dessa data).';
    else if (u.status === 'pendente' || u.status === 'confirmar') t = 'Oi, ' + n + '! Aqui é do Mercado Macro. Recebemos seu pedido de acesso. Para entrar agora, é só escolher um plano em ' + site;
    else t = 'Oi, ' + n + '! Aqui é do Mercado Macro.';
    window.open('https://wa.me/' + u.celular + '?text=' + encodeURIComponent(t), '_blank', 'noopener');
  }
  // histórico da pessoa
  var dh = document.getElementById('dlg-hist');
  var STP = { aguardando: 'aguardando comprovante', enviado: 'comprovante para conferir', aprovado: 'aprovado', recusado: 'recusado', vencido: 'pedido vencido' };
  function abrirHistorico(id){
    var hs = document.getElementById('hs');
    hs.innerHTML = '<p class="vazio">Carregando…</p>'; dh.showModal();
    fetch('/api/admin/historico?id=' + id, { credentials: 'same-origin' }).then(function(r){ if (!r.ok) throw r; return r.json(); }).then(function(j){
      var u = j.usuario, ev = [];
      ev.push({ q: u.criado, t: 'Pediu acesso (cadastro)' });
      if (u.ultimo_acesso) ev.push({ q: u.ultimo_acesso, t: 'Último acesso ao site' });
      j.pagamentos.forEach(function(p){
        ev.push({ q: p.criado, t: 'Gerou o Pix do plano ' + esc(p.nome_plano) + ' (' + reais(p.valor) + ')' + (p.enviado ? '' : ' · ' + (STP[p.status] || p.status)), c: 'pg' });
      });
      j.historico.forEach(function(h){ ev.push({ q: h.quando, t: esc(h.texto), c: /^Pagamento|comprovante/.test(h.texto) ? 'pg' : 'adm' }); });
      ev.sort(function(a, b){ return a.q < b.q ? 1 : -1; });
      var vis = US.filter(function(x){ return x.id === id; })[0] || u;
      hs.innerHTML = '<div class="dl-top"><div><h3 id="hs-t">' + esc(u.nome) + '</h3><p class="e">' + esc(u.email) + (u.celular ? ' · ' + celFmt(u.celular) : '') + '</p></div><button type="button" class="x" data-fechar aria-label="Fechar">&times;</button></div>'
        + '<div class="hs-dados"><div><small>Situação</small><b>' + (u.admin ? 'Administrador' : SIT[vis.status] || vis.status) + '</b></div><div><small>Plano</small><b>' + plano(vis) + '</b></div><div><small>Validade</small><b>' + validade(vis) + '</b></div><div><small>Pagou no total</small><b>' + reais(j.pagamentos.filter(function(p){ return p.status === 'aprovado'; }).reduce(function(a, p){ return a + p.valor; }, 0)) + '</b></div></div>'
        + '<div class="hs-bts">' + botoes(vis, true) + '</div>'
        + '<h2>Linha do tempo</h2><ul class="linha-t">' + ev.map(function(e){ return '<li class="' + (e.c || '') + '"><time>' + data(e.q) + '</time>' + e.t + '</li>'; }).join('') + '</ul>'
        + '<p class="vazio" style="margin-top:6px;font-size:12px">O que o administrador fez aparece a partir de 21/10/2026.</p>';
    }).catch(function(){ hs.innerHTML = '<p class="vazio">Não foi possível carregar o histórico.</p><div class="dl-ac"><button type="button" class="b" data-fechar>Fechar</button></div>'; });
  }
  dh.addEventListener('click', function(e){
    if (e.target === dh || e.target.closest('[data-fechar]')) return dh.close();
    var b = e.target.closest('button[data-a]');
    if (b && b.dataset.a !== 'zap' && b.dataset.a !== 'hist') dh.close();
  });
  document.querySelector('main').addEventListener('click', function(e){ var b = e.target.closest('button[data-h]'); if (b) abrirHistorico(+b.dataset.h); });
  // planilhas (CSV com ; e vírgula decimal, abre direto no Excel em português)
  function baixarCsv(nome, cab, linhas){
    // valor que começa com = + - @ tab ou CR vira texto (o Excel não executa como fórmula)
    var q = function(v){ v = v === null || v === undefined ? '' : String(v); if (/^[=+\\-@\\t\\r]/.test(v)) v = "'" + v; return /[;"\\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var txt = '\ufeff' + [cab].concat(linhas).map(function(l){ return l.map(q).join(';'); }).join('\\r\\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = nome + '-' + agora().slice(0, 10) + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  var num = function(c){ return (c / 100).toFixed(2).replace('.', ','); };
  document.getElementById('csv-pessoas').addEventListener('click', function(){
    baixarCsv('pessoas', ['Nome', 'E-mail', 'Celular', 'Situação', 'Plano', 'Válido até', 'Cadastro', 'Último acesso'], US.filter(function(u){ return !u.admin; }).map(function(u){
      return [u.nome, u.email, u.celular ? celFmt(u.celular) : '', SIT[u.status] || u.status, plano(u), u.expira ? dia(u.expira) : (u.status === 'ativo' ? 'sem validade' : ''), dia(u.criado), u.ultimo_acesso ? data(u.ultimo_acesso) : ''];
    }));
  });
  document.getElementById('csv-pags').addEventListener('click', function(){
    var b = this; b.disabled = true;
    fetch('/api/admin/pagamentos?todos=1', { credentials: 'same-origin' }).then(function(r){ if (!r.ok) throw r; return r.json(); }).then(function(j){
      baixarCsv('pagamentos', ['Pedido', 'Nome', 'E-mail', 'Plano', 'Valor (R$)', 'Situação', 'Criado', 'Comprovante enviado', 'Decidido', 'Válido até'], j.pagamentos.map(function(p){
        return ['MM' + String(p.id).padStart(6, '0'), p.nome, p.email, p.nome_plano, num(p.valor), STP[p.status] || p.status, data(p.criado), p.enviado ? data(p.enviado) : '', p.decidido ? data(p.decidido) : '', p.validade ? dia(p.validade) : ''];
      }));
    }).catch(function(){ msg.className = 'msg erro'; msg.textContent = 'Não foi possível baixar a planilha.'; }).then(function(){ b.disabled = false; });
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
          + '<div class="linha"><button type="button" id="av-teste" style="' + bt + '">Enviar aviso de teste</button><a href="/abertura" style="' + bt + ';text-decoration:none;display:inline-block">Abertura do mercado (imagem)</a><a href="/fechamento" style="' + bt + ';text-decoration:none;display:inline-block">Fechamento do mercado (imagem)</a><button type="button" id="av-resumo" style="' + bt + '">Enviar resumo da semana agora</button><button type="button" id="av-off" style="' + bt + '">Desligar</button></div><p class="d" style="margin:8px 0 0">O fechamento do mercado chega sozinho em dia de pregão às 18h; o resumo da semana, toda segunda às 8h.</p>'
          + '<p style="margin:14px 0 6px"><b>Canal público (divulgação)</b></p>'
          + (j.canal
            ? '<p class="d" style="margin:0 0 8px">Ligado em <a href="https://t.me/' + encodeURIComponent(j.canal.slice(1)) + '" target="_blank" rel="noopener" style="color:var(--accent-text)">' + esc(j.canal) + '</a>. Em dia útil o robô posta sozinho a abertura do mercado (9h15) e o fechamento (18h), com o link do site.</p>'
              + '<label class="d" style="display:flex;gap:8px;align-items:flex-start;margin:0 0 10px"><input type="checkbox" id="av-canal-not"' + (j.canalNoticias ? ' checked' : '') + ' style="margin-top:3px"><span>Postar também as notícias de alto impacto em tempo real (fontes em português, das 7h às 22h, no máximo 2 a cada 15 minutos e 20 por dia, sem repetir assunto).</span></label>'
              + '<div class="linha"><button type="button" id="av-canal-sair" style="' + bt + '">Desligar o canal</button></div>'
            : '<ol style="margin:0 0 8px"><li>No Telegram, crie um canal <b>público</b> (por exemplo, Mercado Macro).</li><li>Nas configurações do canal, em Administradores, adicione o robô <b>@' + esc(j.bot) + '</b>.</li><li>Escreva aqui o usuário do canal:</li></ol>'
              + '<div class="linha"><input id="av-canal" autocomplete="off" spellcheck="false" placeholder="@mercadomacro" style="flex:1;min-width:180px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:7px;color:var(--text);padding:8px 10px;min-height:36px"><button type="button" id="av-canal-ok" style="' + bt + '">Conectar canal</button></div>')
          + '</div>';
      } else if (j.bot) {
        h = '<div class="caixa"><p>Robô <b>@' + esc(j.bot) + '</b> encontrado. Falta um passo:</p><ol>'
          + '<li>No Telegram, abra <a href="https://t.me/' + encodeURIComponent(j.bot) + '" target="_blank" rel="noopener" style="color:var(--accent-text)">@' + esc(j.bot) + '</a> e toque em <b>Iniciar</b>.</li>'
          + '<li>Mande para o robô este código: <b style="font-size:16px;letter-spacing:.12em">' + esc(j.codigo || '') + '</b></li>'
          + '<li>Volte aqui e toque em Conectar. Só a conversa que mandou o código recebe os avisos.</li></ol>'
          + '<div class="linha"><button type="button" id="av-con" style="' + bt + '">Conectar</button><button type="button" id="av-off" style="' + bt + '">Usar outro robô</button></div></div>';
      } else {
        h = '<div class="caixa"><p>Receba uma mensagem no Telegram sempre que alguém pedir acesso. Para ligar:</p><ol>'
          + '<li>No Telegram, abra <a href="https://t.me/BotFather" target="_blank" rel="noopener" style="color:var(--accent-text)">@BotFather</a> e mande <b>/newbot</b>.</li>'
          + '<li>Ele pede um nome (por exemplo, Avisos Mercado Macro) e depois um usuário terminado em bot (por exemplo, avisos_mercadomacro_bot).</li>'
          + '<li>Ele responde com um token, uma linha parecida com 1234567890:AAH... Copie e cole aqui:</li></ol>'
          + '<div class="linha"><input id="av-token" aria-label="Token do robô do Telegram" autocomplete="off" spellcheck="false" placeholder="cole o token aqui" style="flex:1;min-width:220px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:7px;color:var(--text);padding:8px 10px;min-height:36px"><button type="button" id="av-salvar" style="' + bt + '">Salvar</button></div>'
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
      if ((el = document.getElementById('av-canal-ok'))) el.onclick = function(){ acao({ acao: 'canal', canal: document.getElementById('av-canal').value }, this, avisos); };
      if ((el = document.getElementById('av-canal-not'))) el.onchange = function(){ var on = this.checked; acao({ acao: 'canal-noticias', ligar: on }, null, function(){ diz(true, on ? 'Notícias no canal ligadas.' : 'Notícias no canal desligadas.'); }); };
      if ((el = document.getElementById('av-canal-sair'))) el.onclick = function(){ if (confirm('Parar de postar no canal público?')) acao({ acao: 'canal-sair' }, this, avisos); };
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
  var ia = document.getElementById('assistente');
  function assistente(){
    fetch('/api/admin/assistente', { credentials: 'same-origin' }).then(function(r){ if (!r.ok) throw r; return r.json(); }).then(function(j){
      var bt = 'border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);border-radius:7px;padding:7px 12px;cursor:pointer;font-weight:600;font-size:13px;min-height:36px';
      var inp = 'flex:1;min-width:200px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:7px;color:var(--text);padding:8px 10px;min-height:36px';
      ia.innerHTML = (j.ligado
        ? '<div class="caixa"><p>Ligado' + (j.desde ? ' desde ' + data(j.desde) : '') + '. Quem está logado vê o botão Assistente e pode fazer 25 perguntas por dia; você não tem limite.' + (j.modelo ? ' Modelo em uso: ' + esc(j.modelo) + '.' : '') + ' O botão Testar mede quanto cada modelo demora.</p><div class="linha"><button type="button" id="ia-testar" style="' + bt + '">Testar</button><button type="button" id="ia-off" style="' + bt + '">Desligar e apagar a chave</button></div><div id="ia-res"></div></div>'
        : '<div class="caixa"><p>Cole a chave da API do Gemini (Google AI Studio, botão "Get API key"). Na faixa grátis o Google limita os pedidos por dia e pode usar as conversas para melhorar os produtos dele; a página de privacidade avisa isso.</p>'
          + '<div class="linha"><input id="ia-chave" aria-label="Chave da API do Gemini" type="text" data-segredo autocomplete="off" spellcheck="false" placeholder="chave da API do Gemini" style="' + inp + '"><button type="button" id="ia-salvar" style="' + bt + '">Salvar e conferir</button></div>'
          + '<p>Fica guardada só no servidor do site e não aparece de novo nesta página.</p></div>') + '<p class="msg" id="ia-msg"></p>';
      var m = document.getElementById('ia-msg');
      function diz(ok, t){ m.className = 'msg ' + (ok ? 'ok' : 'erro'); m.textContent = t; }
      function acao(corpo, b, depois){ if (b) b.disabled = true; diz(true, 'Aguarde…');
        fetch('/api/admin/assistente', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
          .then(function(r){ return r.json().then(function(x){ if (!r.ok) throw x; return x; }); })
          .then(function(r){ diz(true, ''); depois(r); }, function(e){ diz(false, (e && e.erro) || 'Não foi possível.'); }).then(function(){ if (b) b.disabled = false; }); }
      var el;
      if ((el = document.getElementById('ia-salvar'))) el.onclick = function(){ acao({ acao: 'chave', chave: document.getElementById('ia-chave').value }, this, assistente); };
      if ((el = document.getElementById('ia-off'))) el.onclick = function(){ if (confirm('Desligar o assistente e apagar a chave do Gemini?')) acao({ acao: 'desligar' }, this, assistente); };
      if ((el = document.getElementById('ia-testar'))) el.onclick = function(){ acao({ acao: 'testar' }, this, function(r){
        var res = document.getElementById('ia-res');
        res.innerHTML = '<p style="margin-top:10px">Pergunta de teste: "Em uma frase: o que é a taxa Selic?"</p><table style="width:100%;border-collapse:collapse;font-size:13px"><tr><th style="text-align:left;padding:6px 4px">Modelo</th><th style="text-align:right;padding:6px 4px">Tempo</th><th style="text-align:left;padding:6px 4px">Resultado</th><th></th></tr>'
          + r.resultados.map(function(x){
            var usado = x.modelo === r.preferido;
            return '<tr style="border-top:1px solid var(--line-2)"><td style="padding:6px 4px;white-space:nowrap">' + esc(x.modelo) + '</td><td style="padding:6px 4px;text-align:right;white-space:nowrap">' + (x.ms / 1000).toFixed(1).replace('.', ',') + ' s</td><td style="padding:6px 4px">' + (x.ok ? esc(x.resposta) : '<span style="color:var(--down)">' + esc(x.erro) + '</span>') + '</td><td style="padding:6px 4px;white-space:nowrap">'
              + (usado ? '<b>em uso</b>' : x.ok ? '<button type="button" data-preferir="' + esc(x.modelo) + '" style="' + bt + '">Usar este</button>' : '') + '</td></tr>';
          }).join('') + '</table>';
        res.querySelectorAll('[data-preferir]').forEach(function(bb){ bb.onclick = function(){ acao({ acao: 'preferir', modelo: bb.getAttribute('data-preferir') }, bb, function(){ diz(true, 'Pronto: o assistente usa ' + bb.getAttribute('data-preferir') + ' primeiro.'); document.getElementById('ia-testar').click(); }); }; });
      }); };
    }).catch(function(){ ia.innerHTML = '<p class="vazio">Não foi possível carregar.</p>'; });
  }
  var st = document.getElementById('stripe');
  function stripeBox(){
    fetch('/api/admin/stripe', { credentials: 'same-origin' }).then(function(r){ if (!r.ok) throw r; return r.json(); }).then(function(j){
      var bt = 'border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);border-radius:7px;padding:7px 12px;cursor:pointer;font-weight:600;font-size:13px;min-height:36px';
      var inp = 'flex:1;min-width:200px;background:var(--surface-2);border:1px solid var(--line-2);border-radius:7px;color:var(--text);padding:8px 10px;min-height:36px';
      st.innerHTML = (j.ligado
        ? '<div class="caixa"><p>Ligado' + (j.desde ? ' desde ' + data(j.desde) : '') + ', <b>' + (j.modo === 'real' ? 'modo real' : 'modo de teste (nenhum cartão é cobrado de verdade)') + '</b>. Em /assinar aparece o botão "Pagar com cartão" nos planos mensal, semestral e anual, com renovação automática. Assinantes no cartão agora: ' + j.assinantes + '.</p>'
          + '<div class="linha"><input id="st-chave" aria-label="Trocar a chave do Stripe" type="text" data-segredo autocomplete="off" spellcheck="false" placeholder="trocar a chave (sk_live_...)" style="' + inp + '"><button type="button" id="st-salvar" style="' + bt + '">Trocar</button><button type="button" id="st-off" style="' + bt + '">Desligar</button></div></div>'
        : '<div class="caixa"><p>Cole a chave secreta do Stripe (no painel do Stripe: Desenvolvedores, Chaves de API, "Chave secreta", começa com sk_live_ ou sk_test_ para testar). O site confere a chave e cria sozinho o aviso de pagamentos (webhook).</p>'
          + '<div class="linha"><input id="st-chave" aria-label="Chave secreta do Stripe" type="text" data-segredo autocomplete="off" spellcheck="false" placeholder="sk_live_..." style="' + inp + '"><button type="button" id="st-salvar" style="' + bt + '">Salvar e conferir</button></div>'
          + '<p>Fica guardada só no servidor do site e não aparece de novo nesta página.</p></div>') + '<p class="msg" id="st-msg"></p>';
      var m = document.getElementById('st-msg');
      function diz(ok, t){ m.className = 'msg ' + (ok ? 'ok' : 'erro'); m.textContent = t; }
      function acao(corpo, b){ if (b) b.disabled = true; diz(true, 'Aguarde…');
        fetch('/api/admin/stripe', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
          .then(function(r){ return r.json().then(function(x){ if (!r.ok) throw x; return x; }); })
          .then(function(){ stripeBox(); }, function(e){ diz(false, (e && e.erro) || 'Não foi possível.'); if (b) b.disabled = false; }); }
      var el;
      if ((el = document.getElementById('st-salvar'))) el.onclick = function(){ acao({ acao: 'chave', chave: document.getElementById('st-chave').value }, this); };
      if ((el = document.getElementById('st-off'))) el.onclick = function(){ if (confirm('Desligar o pagamento com cartão? Quem já assina continua sendo cobrado pelo Stripe, mas o site deixa de receber os avisos.')) acao({ acao: 'desligar' }, this); };
    }).catch(function(){ st.innerHTML = '<p class="vazio">Não foi possível carregar.</p>'; });
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
          + '<div class="linha"><input id="cp-chave" aria-label="Chave da API da Capital.com" autocomplete="off" spellcheck="false" placeholder="chave da API" style="' + inp + '"></div>'
          + '<div class="linha"><input id="cp-login" aria-label="E-mail de login da Capital.com" autocomplete="off" spellcheck="false" placeholder="e-mail de login da Capital.com" style="' + inp + '"></div>'
          + '<div class="linha"><input id="cp-senha" aria-label="Senha personalizada da API" type="text" data-segredo autocomplete="off" spellcheck="false" placeholder="senha personalizada da API" style="' + inp + '"></div>'
          + '<div class="linha"><select id="cp-amb" aria-label="Ambiente da conta Capital.com" style="' + inp + ';flex:0 0 auto"><option value="demo">Conta demo (recomendado)</option><option value="real">Conta real</option></select><button type="button" id="cp-salvar" style="' + bt + '">Salvar e conferir</button></div>'
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
      PG = j.pagamentos; MES = j.mes || null; geral();
      var abertos = j.pagamentos.filter(function(p){ return p.status === 'enviado'; }), feitos = j.pagamentos.filter(function(p){ return p.status !== 'enviado'; });
      var linha = function(p){
        return '<div class="u"><div class="q"><div class="n">' + esc(p.nome) + ' · ' + esc(p.nome_plano) + ' ' + reais(p.valor) + '</div><div class="e">' + esc(p.email) + '</div>'
          + '<div class="d">Pedido MM' + String(p.id).padStart(6, '0') + (p.enviado ? ' · comprovante enviado ' + data(p.enviado) : ' · registrado por você') + (p.status === 'aprovado' ? ' · aprovado, vale até ' + dia(p.validade) : p.status === 'recusado' ? ' · não confirmado' : '') + '</div></div>'
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
      var h = '<div class="caixa">' + (j.chave ? '<p>Ligado. A página <a href="/assinar" style="color:var(--accent-text)">/assinar</a> mostra o QR Code do Pix para a chave <b>' + esc(j.chave) + '</b> (' + esc(j.nome) + ', ' + esc(j.cidade) + '). Planos: 48 horas grátis (sem Pix, só para quem nunca usou nem assinou), degustação 7 dias R$ 4,99 (só para quem nunca assinou), 1 mês R$ 29,90 e 6 meses R$ 149,90 (no cartão: R$ 19,90 e R$ 99,90; 12 meses só no cartão, R$ 179,90).</p>' + (j.alterada ? '<p class="d">Última troca da chave: ' + data(j.alterada) + '. Toda troca avisa no seu Telegram.</p>' : '') + '<p>Para trocar, preencha de novo:</p>'
          : '<p>Para as pessoas pagarem a assinatura pelo Pix, preencha a chave que vai receber e o nome e a cidade como aparecem no seu banco. Celular: escreva com +55 ou com o DDD entre parênteses.</p>')
        + '<div class="linha"><input id="px-chave" aria-label="Chave Pix" autocomplete="off" spellcheck="false" placeholder="chave Pix" style="' + inp + '"></div>'
        + '<div class="linha"><input id="px-nome" aria-label="Nome de quem recebe" autocomplete="off" placeholder="nome de quem recebe" maxlength="25" style="' + inp + '"><input id="px-cidade" aria-label="Cidade de quem recebe" autocomplete="off" placeholder="cidade" maxlength="15" style="' + inp + ';flex:0 1 160px;min-width:120px"></div>'
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
  var cm = document.getElementById('com');
  function comunicado(){
    fetch('/api/admin/comunicado', { credentials: 'same-origin' }).then(function(r){ if (!r.ok) throw r; return r.json(); }).then(function(j){
      var bt = 'border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);border-radius:7px;padding:7px 12px;cursor:pointer;font-weight:600;font-size:13px;min-height:36px';
      cm.innerHTML = '<div class="caixa"><p>Assunto: <b>' + esc(j.assunto) + '</b></p>'
        + '<p>Vai para quem tem cadastro confirmado (fora você): <b>' + j.total + '</b> pessoas. Já enviados: <b>' + j.enviados + '</b>. Faltam: <b>' + j.pendentes + '</b>.' + (j.sairam ? ' Pediram para não receber: ' + j.sairam + '.' : '') + '</p>'
        + (j.ligado ? '' : '<p>Ligue o e-mail (Resend) abaixo para poder enviar.</p>')
        + '<div class="linha"><a href="/api/admin/comunicado?previa=1" target="_blank" rel="noopener" style="' + bt + ';text-decoration:none;display:inline-block">Ver o e-mail</a><button type="button" id="cm-teste" style="' + bt + '">Enviar teste para mim</button>'
        + (j.pendentes ? '<button type="button" id="cm-enviar" style="' + bt + ';background:var(--accent);color:var(--on-accent);border-color:transparent">Enviar para ' + j.pendentes + ' pessoas</button>' : '') + '</div>'
        + '<p class="d" style="margin:8px 0 0">Cada pessoa recebe uma vez só. O e-mail tem um link para parar de receber novidades.</p></div><p class="msg" id="cm-msg"></p>';
      var m = document.getElementById('cm-msg');
      function diz(ok, t){ m.className = 'msg ' + (ok ? 'ok' : 'erro'); m.textContent = t; }
      document.getElementById('cm-teste').onclick = function(){ var b = this; b.disabled = true; diz(true, 'Enviando…');
        post('/api/admin/comunicado', { acao: 'teste' }).then(function(r){ diz(true, 'Teste enviado para ' + r.para + '. Confira a caixa de entrada (e o spam).'); }, function(e){ diz(false, (e && e.erro) || 'Não foi possível.'); }).then(function(){ b.disabled = false; }); };
      var en = document.getElementById('cm-enviar');
      if (en) en.onclick = function(){
        if (!confirm('Enviar o comunicado para ' + j.pendentes + ' pessoas agora? Não dá para desfazer.')) return;
        en.disabled = true; diz(true, 'Enviando… pode levar alguns segundos.');
        post('/api/admin/comunicado', { acao: 'enviar' }).then(function(r){
          comunicado();
          setTimeout(function(){ var mm = document.getElementById('cm-msg'); mm.className = 'msg ' + (r.falhas ? 'erro' : 'ok'); mm.textContent = 'Enviados agora: ' + r.enviados_agora + '.' + (r.falhas ? ' Falharam ' + r.falhas + ' (' + (r.erro || '') + '); toque em Enviar de novo para tentar só esses.' : '') + (r.pendentes && !r.falhas ? ' Ainda faltam ' + r.pendentes + ': toque em Enviar de novo.' : ''); }, 400);
        }, function(e){ diz(false, (e && e.erro) || 'Não foi possível.'); en.disabled = false; });
      };
    }).catch(function(){ cm.innerHTML = '<p class="vazio">Não foi possível carregar.</p>'; });
  }
  comunicado();
  // e-mail de boas-vindas (src/boasvindas.js): texto editável, envio sozinho no primeiro pagamento e para quem já pagou
  function boasVindas(){
    var raiz = document.getElementById('bv');
    fetch('/api/admin/boasvindas', { credentials: 'same-origin' }).then(function(r){ if (!r.ok) throw r; return r.json(); }).then(function(j){
      var bt = 'border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);border-radius:7px;padding:7px 12px;cursor:pointer;font-weight:600;font-size:13px;min-height:36px';
      var cx = 'width:100%;background:var(--surface-2);border:1px solid var(--line-2);border-radius:8px;color:var(--text);padding:10px 12px;font:inherit;font-size:14px';
      raiz.innerHTML = '<div class="caixa">'
        + '<p>Vai uma vez para cada pessoa. No primeiro pagamento aprovado ele sai sozinho, no lugar do e-mail de pagamento confirmado, com o plano e a validade no topo.</p>'
        + '<label style="display:flex;gap:8px;align-items:center;margin:0 0 12px;cursor:pointer"><input type="checkbox" id="bv-auto"' + (j.auto ? ' checked' : '') + '> Mandar sozinho no primeiro pagamento</label>'
        + '<label for="bv-assunto" class="d" style="display:block;margin:0 0 4px">Assunto</label><input id="bv-assunto" style="' + cx + '" maxlength="150" value="' + esc(j.assunto) + '">'
        + '<label for="bv-texto" class="d" style="display:block;margin:12px 0 4px">Texto ({nome} vira o primeiro nome; linha começando com "- " vira item de lista)</label><textarea id="bv-texto" rows="16" style="' + cx + ';line-height:1.5;resize:vertical">' + esc(j.texto) + '</textarea>'
        + '<div class="linha" style="margin-top:10px"><button type="button" id="bv-salvar" style="' + bt + '">Salvar texto</button>' + (j.padrao ? '' : '<button type="button" id="bv-padrao" style="' + bt + '">Voltar ao texto original</button>') + '<a href="/api/admin/boasvindas?previa=1" target="_blank" rel="noopener" style="' + bt + ';text-decoration:none;display:inline-block">Ver o e-mail</a><button type="button" id="bv-teste" style="' + bt + '">Enviar teste para mim</button>'
        + (j.faltam ? '<button type="button" id="bv-enviar" style="' + bt + ';background:var(--accent);color:var(--on-accent);border-color:transparent">Enviar para ' + j.faltam + ' que já pagaram</button>' : '') + '</div>'
        + '<p class="d" style="margin:8px 0 0">Já pagaram: <b>' + j.pagaram + '</b> pessoas. Ainda não receberam: <b>' + j.faltam + '</b>.' + (j.ligado ? '' : ' Ligue o e-mail (Resend) em Ajustes para poder enviar.') + ' Salve o texto antes de ver ou enviar.</p></div><p class="msg" id="bv-msg"></p>';
      var m = document.getElementById('bv-msg');
      function diz(ok, t){ m.className = 'msg ' + (ok ? 'ok' : 'erro'); m.textContent = t; }
      function faz(corpo, b, ok){ b.disabled = true; diz(true, 'Aguarde…'); post('/api/admin/boasvindas', corpo).then(ok, function(e){ diz(false, (e && e.erro) || 'Não foi possível.'); }).then(function(){ b.disabled = false; }); }
      document.getElementById('bv-auto').onchange = function(){ var c = this; post('/api/admin/boasvindas', { acao: 'auto', ligar: c.checked }).then(function(){ diz(true, c.checked ? 'Ligado: as boas-vindas saem sozinhas no primeiro pagamento.' : 'Desligado: no primeiro pagamento vai só o e-mail de pagamento confirmado.'); }, function(){ c.checked = !c.checked; diz(false, 'Não foi possível.'); }); };
      document.getElementById('bv-salvar').onclick = function(){ faz({ acao: 'salvar', assunto: document.getElementById('bv-assunto').value, texto: document.getElementById('bv-texto').value }, this, function(){ boasVindas(); setTimeout(function(){ var mm = document.getElementById('bv-msg'); mm.className = 'msg ok'; mm.textContent = 'Texto salvo.'; }, 300); }); };
      var pd = document.getElementById('bv-padrao');
      if (pd) pd.onclick = function(){ if (confirm('Voltar ao texto original? O seu texto será apagado.')) faz({ acao: 'padrao' }, this, function(){ boasVindas(); }); };
      document.getElementById('bv-teste').onclick = function(){ faz({ acao: 'teste' }, this, function(r){ diz(true, 'Teste enviado para ' + r.para + '. Confira a caixa de entrada (e o spam).'); }); };
      var en = document.getElementById('bv-enviar');
      if (en) en.onclick = function(){
        if (!confirm('Enviar as boas-vindas para ' + j.faltam + ' pessoas que já pagaram? Não dá para desfazer.')) return;
        faz({ acao: 'enviar' }, en, function(r){ boasVindas(); setTimeout(function(){ var mm = document.getElementById('bv-msg'); mm.className = 'msg ' + (r.falhas ? 'erro' : 'ok'); mm.textContent = 'Enviados agora: ' + r.enviados_agora + '.' + (r.falhas ? ' Falharam ' + r.falhas + ' (' + (r.erro || '') + '); toque em Enviar de novo.' : '') + (r.faltam && !r.falhas ? ' Ainda faltam ' + r.faltam + ': toque em Enviar de novo.' : ''); }, 300); });
      };
    }).catch(function(){ raiz.innerHTML = '<p class="vazio">Não foi possível carregar.</p>'; });
  }
  // aparelhos com a conta do administrador aberta (a sessão do admin vale 30 dias)
  function aparelhos(){
    var ap = document.getElementById('aparelhos');
    var bt = 'border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);border-radius:7px;padding:7px 12px;cursor:pointer;font-weight:600;font-size:13px;min-height:36px';
    post('/api/auth/aparelhos', { ler: 1 }).then(function(j){
      ap.innerHTML = '<div class="caixa"><p>' + (j.outros ? 'Além deste, sua conta está aberta em <b>' + j.outros + (j.outros === 1 ? ' outro aparelho' : ' outros aparelhos') + '</b>.' : 'Sua conta está aberta só neste aparelho.') + ' Cada entrada do administrador vale 30 dias.</p>'
        + (j.outros ? '<div class="linha"><button type="button" id="ap-sair" style="' + bt + '">Sair dos outros aparelhos</button></div>' : '')
        + '<p class="d" style="margin:8px 0 0">Para trocar a senha, use <a href="/conta" style="color:var(--accent-text)">Minha conta</a>.</p></div><p class="msg" id="ap-msg"></p>';
      var b = document.getElementById('ap-sair');
      if (b) b.onclick = function(){
        if (!confirm('Sair da conta em todos os outros aparelhos? Este continua conectado.')) return;
        b.disabled = true;
        post('/api/auth/aparelhos', { sair: 1 }).then(function(r){ aparelhos(); setTimeout(function(){ var m = document.getElementById('ap-msg'); m.className = 'msg ok'; m.textContent = r.encerradas + (r.encerradas === 1 ? ' aparelho desconectado.' : ' aparelhos desconectados.'); }, 300); },
          function(e){ b.disabled = false; var m = document.getElementById('ap-msg'); m.className = 'msg erro'; m.textContent = (e && e.erro) || 'Não foi possível.'; });
      };
    }).catch(function(){ ap.innerHTML = '<p class="vazio">Não foi possível carregar.</p>'; });
  }
  boasVindas();
  pix();
  aparelhos();
  pagamentos();
  capital();
  assistente();
  stripeBox();
  email();
  avisos();
  carregar();
})();
</script></body></html>`;

const PAGINA_CONTA = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Minha conta | Mercado Macro</title>
<script>try{var t=localStorage.getItem('trader_theme');if(t==='dark'||t==='light')document.documentElement.dataset.tema=t;}catch(e){}</script>
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
<h2>Celular (opcional)</h2>
<form id="fc" novalidate>
  <label for="cel">Celular com DDD, para avisos sobre seu acesso pelo WhatsApp</label><input id="cel" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(11) 91234-5678" maxlength="20">
  <button type="submit">Salvar celular</button>
  <p class="msg" id="msgc" role="status" aria-live="polite"></p>
  <p class="nota">Usado só para avisar sobre o vencimento e a renovação do acesso. Deixe em branco e salve para apagar.</p>
</form>
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
  var fc = document.getElementById('fc'), mc = document.getElementById('msgc');
  function cel(c){ var d = String(c || '').slice(2); return d.length === 11 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7) : d.length === 10 ? '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6) : ''; }
  function pc(corpo){ return fetch('/api/auth/celular', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(function(r){ return r.json().then(function(j){ if (!r.ok) throw j; return j; }); }); }
  pc({ ler: 1 }).then(function(j){ fc.cel.value = cel(j.celular); }).catch(function(){});
  fc.addEventListener('submit', function(e){
    e.preventDefault();
    var b = fc.querySelector('button'); b.disabled = true; mc.textContent = '';
    pc({ celular: fc.cel.value }).then(function(j){ fc.cel.value = cel(j.celular); mc.className = 'msg ok'; mc.textContent = j.celular ? 'Celular salvo.' : 'Celular apagado.'; })
      .catch(function(j){ mc.className = 'msg erro'; mc.textContent = (j && j.erro) || 'Não foi possível. Tente de novo.'; }).then(function(){ b.disabled = false; });
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
ligarAssistente({ json, mesmaOrigem, config, salvarConfig, dentroDoLimite });
ligarStripe({ json, mesmaOrigem, config, salvarConfig, avisar, limparCacheSessao, dentroDoLimite });
ligarAssinatura({ json, html, mesmaOrigem, config, salvarConfig, enviarEmail, avisar, escH, BASE_CSS, lerCookie, sha256hex, limparCacheSessao, emailLiberado, dentroDoLimite, situacaoCartao });
ligarComunicado({ json, html, mesmaOrigem, config, sha256hex });
ligarBoasVindas({ json, html, mesmaOrigem, config, salvarConfig });
