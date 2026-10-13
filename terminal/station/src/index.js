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
    try {
      if (p === '/entrar') return paginaEntrar(req, env);
      if (p.startsWith('/api/auth/')) return await apiAuth(req, env, p.slice(10), ctx);
      if (PUBLICO.test(p)) return env.ASSETS.fetch(req);

      const u = await usuarioDaSessao(req, env);
      if (!u) {
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
    ctx.waitUntil(avisar(env, 'Novo pedido de acesso', `${nome} pediu acesso ao Mercado Macro. Para liberar, abra mercadomacro.com.br/admin`).catch(() => {}));
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
    if (!(await dentroDoLimite(env, 'ent:' + ip, 10, 900))) return json({ erro: 'Muitas tentativas. Espere 15 minutos.' }, 429);
    const u = await env.DB.prepare('SELECT id, senha, status FROM usuarios WHERE email = ?').bind(email).first();
    if (!u || !(await conferirSenha(senha, u.senha))) return json({ erro: 'E-mail ou senha incorretos.' }, 401);
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
    if (req.method === 'GET') {
      const c = await config(env);
      return json({ topico: c.ntfy_topico, email: c.aviso_email !== 'nao', para: await emailAdmin(env) });
    }
    if (req.method !== 'POST' || !mesmaOrigem(req)) return json({ erro: 'Método não permitido.' }, 405);
    const b = await req.json().catch(() => ({}));
    if (b.acao === 'email') await env.DB.prepare('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)').bind('aviso_email', b.on ? 'sim' : 'nao').run();
    else if (b.acao === 'novo-topico') await env.DB.prepare('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)').bind('ntfy_topico', novoTopico()).run();
    else if (b.acao === 'teste') {
      const ok = await avisar(env, 'Teste do Mercado Macro', 'Se chegou, os avisos de cadastro novo estão funcionando.').catch(() => false);
      if (!ok) return json({ erro: 'O serviço de avisos não respondeu. Tente de novo em alguns minutos.' }, 502);
    } else return json({ erro: 'Ação inválida.' }, 400);
    return json({ ok: true });
  }
  return json({ erro: 'Não encontrado.' }, 404);
}

/* ---------------- avisos (ntfy.sh: celular pelo app ntfy e e-mail) ---------------- */
// o nome do canal funciona como senha: só quem sabe o nome recebe os avisos. Ele só aparece em /admin.
const novoTopico = () => 'mercadomacro-' + hex(crypto.getRandomValues(new Uint8Array(10)));
async function config(env) {
  const r = await env.DB.prepare('SELECT chave, valor FROM config').all();
  const c = Object.fromEntries(r.results.map((x) => [x.chave, x.valor]));
  if (!c.ntfy_topico) {
    c.ntfy_topico = novoTopico();
    await env.DB.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)').bind('ntfy_topico', c.ntfy_topico).run();
  }
  return c;
}
async function emailAdmin(env) {
  const r = await env.DB.prepare(`SELECT email FROM usuarios WHERE admin = 1 AND status = 'ativo' ORDER BY id LIMIT 1`).first();
  return r ? r.email : null;
}
async function avisar(env, titulo, texto) {
  const c = await config(env);
  const h = { Title: titulo, Click: 'https://mercadomacro.com.br/admin' };
  const para = c.aviso_email !== 'nao' ? await emailAdmin(env) : null;
  if (para) h.Email = para;
  const r = await fetch('https://ntfy.sh/' + c.ntfy_topico, { method: 'POST', headers: h, body: texto });
  return r.ok;
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
async function paginaEntrar(req, env) {
  if (await usuarioDaSessao(req, env)) return redirect('/');
  const r = await env.ASSETS.fetch(new Request(new URL('/vitrine/', req.url), { headers: req.headers }));
  const out = new Response(r.body, r);
  out.headers.set('Cache-Control', 'no-cache');
  out.headers.set('X-Frame-Options', 'DENY');
  return out;
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
.chk{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--text);cursor:pointer}
.chk input{width:18px;height:18px;accent-color:var(--accent)}
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
      av.innerHTML = '<div class="caixa"><p><b>Por e-mail.</b> Quando alguém pedir acesso, chega um e-mail para ' + (j.para ? '<b>' + esc(j.para) + '</b>' : 'o administrador') + '. Ele vem do serviço ntfy (no-reply@ntfy.sh); se não aparecer, olhe a caixa de spam.</p>'
        + '<label class="chk"><input type="checkbox" id="av-email"' + (j.email ? ' checked' : '') + '> Receber por e-mail</label></div>'
        + '<div class="caixa"><p><b>No celular.</b> Para receber uma notificação na hora:</p><ol>'
        + '<li>Instale o app gratuito <b>ntfy</b> (Play Store ou App Store).</li>'
        + '<li>Toque em + (Subscribe to topic) e digite o canal abaixo. Deixe o servidor como ntfy.sh.</li></ol>'
        + '<div class="linha"><span class="cod">' + esc(j.topico) + '</span><button type="button" id="av-copiar">Copiar</button></div>'
        + '<p>O nome do canal funciona como senha: não mostre a ninguém. Se precisar, <button type="button" id="av-novo" style="min-height:0;padding:2px 8px">troque o canal</button> e inscreva o celular de novo.</p></div>'
        + '<div class="linha"><button type="button" id="av-teste" style="border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);border-radius:7px;padding:7px 12px;cursor:pointer;font-weight:600;font-size:13px;min-height:36px">Enviar aviso de teste</button><span class="msg" id="av-msg" style="margin:0"></span></div>';
      var am = document.getElementById('av-msg');
      function diz(ok, t){ am.className = 'msg ' + (ok ? 'ok' : 'erro'); am.textContent = t; }
      document.getElementById('av-email').onchange = function(){ var on = this.checked; postAviso({ acao: 'email', on: on }).then(function(){ diz(true, on ? 'E-mail ligado.' : 'E-mail desligado.'); }, function(e){ diz(false, (e && e.erro) || 'Não foi possível salvar.'); }); };
      document.getElementById('av-copiar').onclick = function(){ var t = this; (navigator.clipboard ? navigator.clipboard.writeText(j.topico) : Promise.reject()).then(function(){ t.textContent = 'Copiado'; }, function(){ t.textContent = 'Selecione e copie'; }); };
      document.getElementById('av-novo').onclick = function(){ if (confirm('Trocar o canal? O celular inscrito no canal atual para de receber avisos.')) postAviso({ acao: 'novo-topico' }).then(avisos); };
      document.getElementById('av-teste').onclick = function(){ var t = this; t.disabled = true; diz(true, 'Enviando…');
        postAviso({ acao: 'teste' }).then(function(){ diz(true, 'Aviso enviado. Confira o celular e o e-mail.'); }, function(e){ diz(false, (e && e.erro) || 'Não foi possível enviar.'); }).then(function(){ t.disabled = false; }); };
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
