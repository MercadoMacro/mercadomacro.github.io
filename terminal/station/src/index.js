/* Mercado Macro: porteiro do site.
   Só entra quem tem cadastro liberado pelo administrador. Sem login, a pessoa vê apenas /entrar.
   Usuários e sessões ficam no banco D1 "mercadomacro-usuarios" (binding DB).
   Senhas: PBKDF2-SHA256 com sal. Sessão: cookie HttpOnly; no banco fica só o hash do token. */

const COOKIE = 'mm_s';
const SESSAO_DIAS = 90;
const ITER = 30000;
// arquivos que podem ser vistos sem login (vitrine, ícones, logos, prévia de link e o service worker)
const PUBLICO = /^\/(vitrine\/[\w./-]*|icone-[\w-]+\.png|logo-[\w-]+\.png|previa-link-mercado-macro\.png|manifest\.webmanifest|sw\.js|favicon\.ico|robots\.txt)$/;
const cacheSessao = new Map(); // token -> { u, ate }

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;
    // um endereço só para o Google: www vai para o endereço sem www
    if (url.hostname === 'www.mercadomacro.com.br') return Response.redirect('https://mercadomacro.com.br' + p + url.search, 301);
    try {
      if (p === '/entrar') return paginaEntrar(req, env);
      if (p === '/api/vigia') return await avisoDoVigia(req, env);
      if (p === '/robots.txt') return texto(ROBOTS, 'text/plain');
      if (p === '/sitemap.xml') return texto(SITEMAP, 'application/xml');
      if (p.startsWith('/api/auth/')) return await apiAuth(req, env, p.slice(10), ctx);
      if (PUBLICO.test(p)) return env.ASSETS.fetch(req);

      const u = await usuarioDaSessao(req, env);
      if (!u) {
        // a página inicial mostra a vitrine para quem não entrou (e para o Google), sem redirecionar
        if ((p === '/' || p === '/index.html') && navegacao(req)) return paginaEntrar(req, env, true);
        if (navegacao(req)) {
          const volta = p === '/' || p === '/index.html' ? '' : '?volta=' + encodeURIComponent(p + url.search);
          return redirect('/entrar' + volta);
        }
        return json({ erro: 'Faça login para continuar.' }, 401);
      }
      if (p === '/admin') return u.admin ? html(PAGINA_ADMIN) : redirect('/');
      if (p === '/conta') return html(PAGINA_CONTA);
      if (p.startsWith('/api/admin/')) {
        if (!u.admin) return json({ erro: 'Sem permissão.' }, 403);
        return await apiAdmin(req, env, p.slice(11), u);
      }
      const r = await env.ASSETS.fetch(req);
      const out = new Response(r.body, r);
      out.headers.set('Cache-Control', 'private, no-cache');
      return out;
    } catch (e) {
      return json({ erro: 'Erro no servidor. Tente de novo.' }, 500);
    }
  },
};

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
  const u = await env.DB.prepare(
    `SELECT u.id, u.nome, u.email, u.admin FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token = ? AND s.expira > ? AND u.status = 'ativo'`).bind(h, agora).first();
  if (u) {
    if (cacheSessao.size > 500) cacheSessao.clear();
    cacheSessao.set(tok, { u, ate: agora + 60000 });
  }
  return u || null;
}
function cookieSessao(tok, maxAge) {
  return `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/* ---------------- cadastro, login, saída ---------------- */
async function apiAuth(req, env, acao, ctx) {
  if (acao === 'eu' && req.method === 'GET') {
    const u = await usuarioDaSessao(req, env);
    if (!u) return json({ logado: false }, 401);
    const out = { logado: true, nome: u.nome, email: u.email, admin: !!u.admin };
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
    const existe = await env.DB.prepare('SELECT status FROM usuarios WHERE email = ?').bind(email).first();
    if (existe) return json({ erro: existe.status === 'pendente' ? 'Este e-mail já está cadastrado e aguarda liberação.' : 'Este e-mail já está cadastrado. Use Entrar.' }, 409);
    await env.DB.prepare(`INSERT INTO usuarios (nome, email, senha, status, criado) VALUES (?, ?, ?, 'pendente', ?)`)
      .bind(nome, email, await hashSenha(senha), new Date().toISOString()).run();
    ctx.waitUntil(avisar(env, 'Novo pedido de acesso', `${nome} pediu acesso ao Mercado Macro.\nPara liberar: https://mercadomacro.com.br/admin`).catch(() => {}));
    return json({ ok: true, msg: 'Cadastro enviado. Você poderá entrar assim que o administrador liberar seu acesso.' });
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
    if (u.status === 'pendente') return json({ erro: 'Seu cadastro ainda aguarda liberação do administrador.' }, 403);
    if (u.status !== 'ativo') return json({ erro: 'Seu acesso não está liberado.' }, 403);
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
  if (acao === 'usuarios' && req.method === 'GET') {
    const r = await env.DB.prepare(
      'SELECT id, nome, email, status, admin, criado, decidido, ultimo_acesso FROM usuarios ORDER BY criado DESC').all();
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
    const novo = { liberar: 'ativo', recusar: 'recusado', bloquear: 'bloqueado' }[b.acao];
    const agora = new Date().toISOString();
    if (b.acao === 'excluir') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ?').bind(id),
        env.DB.prepare('DELETE FROM usuarios WHERE id = ? AND admin = 0').bind(id),
      ]);
    } else if (novo) {
      const q = [env.DB.prepare('UPDATE usuarios SET status = ?, decidido = ? WHERE id = ? AND admin = 0').bind(novo, agora, id)];
      if (novo !== 'ativo') q.push(env.DB.prepare('DELETE FROM sessoes WHERE usuario_id = ?').bind(id));
      await env.DB.batch(q);
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
    return json({ erro: 'Ação inválida.' }, 400);
  }
  return json({ erro: 'Não encontrado.' }, 404);
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
  const texto = String(b.texto || '').slice(0, 1500);
  if (!texto) return json({ erro: 'Sem texto.' }, 400);
  const c = await config(env);
  if (!(c.tg_token && c.tg_chat)) return json({ erro: 'Telegram não conectado.' }, 409);
  const r = await telegram(c.tg_token, 'sendMessage', { chat_id: c.tg_chat, text: texto, disable_web_page_preview: true });
  return r.ok ? json({ ok: true }) : json({ erro: 'Telegram recusou.' }, 502);
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
    await env.DB.prepare('INSERT OR REPLACE INTO tentativas (chave, n, janela) VALUES (?, 1, ?)').bind(chave, agora).run();
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
  return req.method === 'GET' && (req.headers.get('Sec-Fetch-Mode') === 'navigate' || (req.headers.get('Accept') || '').includes('text/html'));
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
function redirect(to) {
  return new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store' } });
}
// a tela de entrada é a vitrine (station/site/vitrine/index.html)
async function paginaEntrar(req, env, jaSemLogin) {
  if (!jaSemLogin && (await usuarioDaSessao(req, env))) return redirect('/');
  const r = await env.ASSETS.fetch(new Request(new URL('/vitrine/', req.url), { headers: req.headers }));
  const out = new Response(r.body, r);
  out.headers.set('Cache-Control', 'no-cache');
  out.headers.set('X-Frame-Options', 'DENY');
  return out;
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
</urlset>
`;

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
<div id="raiz"><p class="vazio">Carregando…</p></div>
<h2>Avisos de cadastro novo</h2>
<div id="avisos"><p class="vazio">Carregando…</p></div>
</main>
<script>
(function(){
  var raiz = document.getElementById('raiz'), msg = document.getElementById('msg'), eu = 0;
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function data(s){ if (!s) return '—'; var d = new Date(s); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  var BT = {
    pendente: [['liberar','Liberar','lib'],['recusar','Recusar','']],
    ativo: [['senha','Nova senha',''],['bloquear','Bloquear','']],
    recusado: [['liberar','Liberar','lib'],['excluir','Excluir','del']],
    bloqueado: [['liberar','Liberar de novo','lib'],['excluir','Excluir','del']]
  };
  function bloco(titulo, us, vazio){
    return '<h2>' + titulo + '<b>' + us.length + '</b></h2><div class="lista">' + (us.length ? us.map(function(u){
      return '<div class="u"><div class="q"><div class="n">' + esc(u.nome) + (u.admin ? ' <span class="tag">administrador</span>' : '') + (u.status === 'bloqueado' ? ' <span class="tag">bloqueado</span>' : u.status === 'recusado' ? ' <span class="tag">recusado</span>' : '') + '</div>'
        + '<div class="e">' + esc(u.email) + '</div>'
        + '<div class="d">Cadastro ' + data(u.criado) + (u.status === 'ativo' ? ' · Último acesso ' + data(u.ultimo_acesso) : '') + '</div></div>'
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
        + bloco('Recusados e bloqueados', f(['recusado','bloqueado']), 'Nenhum.');
    }).catch(function(){ raiz.innerHTML = '<p class="vazio">Não foi possível carregar os cadastros.</p>'; });
  }
  raiz.addEventListener('click', function(ev){
    var b = ev.target.closest('button[data-a]'); if (!b) return;
    var a = b.dataset.a;
    if (a === 'senha') return novaSenha(b);
    if ((a === 'excluir' || a === 'bloquear') && !confirm((a === 'excluir' ? 'Excluir o cadastro de ' : 'Bloquear o acesso de ') + b.dataset.n + '?')) return;
    b.disabled = true;
    fetch('/api/admin/decidir', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: +b.dataset.id, acao: a }) })
      .then(function(r){ return r.json().then(function(j){ if (!r.ok) throw j; }); })
      .then(function(){ msg.className = 'msg ok'; msg.textContent = { liberar: 'Acesso liberado para ', recusar: 'Cadastro recusado: ', bloquear: 'Acesso bloqueado: ', excluir: 'Cadastro excluído: ' }[a] + b.dataset.n + '.'; carregar(); })
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
          + '<div class="linha"><button type="button" id="av-teste" style="' + bt + '">Enviar aviso de teste</button><button type="button" id="av-off" style="' + bt + '">Desligar</button></div></div>';
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
      if ((el = document.getElementById('av-teste'))) el.onclick = function(){ acao({ acao: 'teste' }, this, function(){ diz(true, 'Aviso enviado. Confira o Telegram.'); }); };
    }).catch(function(){ av.innerHTML = '<p class="vazio">Não foi possível carregar os avisos.</p>'; });
  }
  avisos();
  carregar();
})();
</script></body></html>`;

const PAGINA_CONTA = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Trocar senha | Mercado Macro</title>
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
</style></head><body><main>
<header><h1>Trocar senha</h1><a class="vol" href="/">Voltar ao site</a></header>
<form id="f" novalidate>
  <label for="atual">Senha atual</label><input id="atual" type="password" autocomplete="current-password" required>
  <label for="nova">Senha nova (mínimo 8 caracteres)</label><input id="nova" type="password" autocomplete="new-password" required minlength="8">
  <label for="nova2">Repita a senha nova</label><input id="nova2" type="password" autocomplete="new-password" required minlength="8">
  <button type="submit">Salvar senha nova</button>
  <p class="msg" id="msg" role="status" aria-live="polite"></p>
  <p class="nota">Ao trocar, os outros aparelhos onde você estava conectado saem da conta. Este continua conectado.</p>
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
})();
</script></body></html>`;
