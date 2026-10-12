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
  async fetch(req, env) {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p === '/entrar') return paginaEntrar(req, env);
      if (p.startsWith('/api/auth/')) return await apiAuth(req, env, p.slice(10));
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
async function apiAuth(req, env, acao) {
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
    return json({ ok: true, msg: 'Cadastro enviado. Você poderá entrar assim que o administrador liberar seu acesso.' });
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
  return json({ erro: 'Não encontrado.' }, 404);
}

/* ---------------- utilidades ---------------- */
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
</style></head><body><main>
<header><h1>Cadastros do Mercado Macro</h1><a class="vol" href="/">Voltar ao site</a></header>
<p class="msg" id="msg" role="status" aria-live="polite"></p>
<div id="raiz"><p class="vazio">Carregando…</p></div>
</main>
<script>
(function(){
  var raiz = document.getElementById('raiz'), msg = document.getElementById('msg'), eu = 0;
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function data(s){ if (!s) return '—'; var d = new Date(s); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  var BT = {
    pendente: [['liberar','Liberar','lib'],['recusar','Recusar','']],
    ativo: [['bloquear','Bloquear','']],
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
    if ((a === 'excluir' || a === 'bloquear') && !confirm((a === 'excluir' ? 'Excluir o cadastro de ' : 'Bloquear o acesso de ') + b.dataset.n + '?')) return;
    b.disabled = true;
    fetch('/api/admin/decidir', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: +b.dataset.id, acao: a }) })
      .then(function(r){ return r.json().then(function(j){ if (!r.ok) throw j; }); })
      .then(function(){ msg.className = 'msg ok'; msg.textContent = { liberar: 'Acesso liberado para ', recusar: 'Cadastro recusado: ', bloquear: 'Acesso bloqueado: ', excluir: 'Cadastro excluído: ' }[a] + b.dataset.n + '.'; carregar(); })
      .catch(function(j){ msg.className = 'msg erro'; msg.textContent = (j && j.erro) || 'Não foi possível. Tente de novo.'; b.disabled = false; });
  });
  carregar();
})();
</script></body></html>`;
