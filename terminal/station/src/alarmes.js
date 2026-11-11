/* Alarmes de preço da Jade no servidor (11/11/2026).
   Antes os alarmes ficavam só no navegador e só eram conferidos com o terminal aberto.
   Agora a lista de cada conta fica no D1 (tabela alarmes), o relógio do site confere os preços a cada minuto
   e, quando um alarme bate, manda um aviso (Web Push) para os aparelhos em que a pessoa ligou os avisos.
   O aviso vai sem conteúdo (não precisa de criptografia); o service worker busca o texto em /api/push/pendentes.
   Chaves VAPID: geradas aqui na primeira vez e guardadas só no D1 (config vapid_jwk). */

const MAX_ALARMES = 12;
const MAX_APARELHOS = 5;
// só serviços de push conhecidos (o endereço vem do navegador; nada de mandar pedido para outro lugar)
const PUSH_HOSTS = /^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[\w-]+\.push\.services\.mozilla\.com|web\.push\.apple\.com|[\w-]+\.notify\.windows\.com)$/;

let pronto = false;
export async function garantirAlarmes(env) {
  if (pronto) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS alarmes (id TEXT NOT NULL, usuario_id INTEGER NOT NULL, sym TEXT NOT NULL, nome TEXT NOT NULL,
      alvo REAL NOT NULL, dir TEXT NOT NULL, criado INTEGER NOT NULL, disparado INTEGER, preco REAL, PRIMARY KEY (usuario_id, id))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS push_inscricoes (endpoint TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL, criado INTEGER NOT NULL, ultimo INTEGER)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS push_fila (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, titulo TEXT NOT NULL,
      texto TEXT NOT NULL, criado INTEGER NOT NULL, entregue INTEGER)`),
  ]);
  pronto = true;
}

const SYM_OK = /^[\w^=.\-]{1,20}$/;
function limpaAlarme(a) {
  if (!a || typeof a !== 'object') return null;
  const id = String(a.id || '').slice(0, 24), sym = String(a.sym || ''), nome = String(a.nome || '').slice(0, 40);
  const alvo = Number(a.alvo), dir = a.dir === 'abaixo' ? 'abaixo' : a.dir === 'acima' ? 'acima' : '';
  if (!/^[\w-]{1,24}$/.test(id) || !SYM_OK.test(sym) || !nome || !(alvo > 0) || !isFinite(alvo) || !dir) return null;
  return { id, sym, nome, alvo, dir, criado: Number(a.criado) > 0 ? Math.floor(Number(a.criado)) : Date.now() };
}

/* ---------------- rotas (pessoa logada) ---------------- */
export async function apiAlarmes(req, env, u, p, mesmaOrigem, json) {
  await garantirAlarmes(env);
  if (req.method !== 'GET' && !mesmaOrigem(req)) return json({ erro: 'Origem não permitida.' }, 403);
  if (p === '/api/alarmes') {
    if (req.method === 'GET') {
      const r = await env.DB.prepare('SELECT id, sym, nome, alvo, dir, criado FROM alarmes WHERE usuario_id = ? AND disparado IS NULL ORDER BY criado DESC').bind(u.id).all();
      // disparados nos últimos 30 minutos: o site aberto mostra o aviso da Jade na tela
      const d = await env.DB.prepare('SELECT id, preco FROM alarmes WHERE usuario_id = ? AND disparado > ?').bind(u.id, Date.now() - 30 * 60000).all();
      return json({ lista: r.results, disparados: d.results }, 200, { 'Cache-Control': 'no-store' });
    }
    if (req.method === 'PUT') {
      const b = await req.json().catch(() => null);
      if (!b || !Array.isArray(b.lista)) return json({ erro: 'Lista inválida.' }, 400);
      const lista = b.lista.map(limpaAlarme).filter(Boolean).slice(0, MAX_ALARMES);
      await env.DB.batch([
        env.DB.prepare('DELETE FROM alarmes WHERE usuario_id = ? AND disparado IS NULL').bind(u.id),
        ...lista.map((a) => env.DB.prepare('INSERT OR REPLACE INTO alarmes (id, usuario_id, sym, nome, alvo, dir, criado) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(a.id, u.id, a.sym, a.nome, a.alvo, a.dir, a.criado)),
      ]);
      return json({ ok: true, n: lista.length });
    }
    return json({ erro: 'Método não permitido.' }, 405);
  }
  if (p === '/api/push/chave') return json({ chave: (await chavesVapid(env)).publica }, 200, { 'Cache-Control': 'no-store' });
  if (p === '/api/push/inscrever' && req.method === 'POST') {
    const b = await req.json().catch(() => null);
    const ep = String(b?.endpoint || '');
    let host = '';
    try { const x = new URL(ep); if (x.protocol === 'https:') host = x.hostname; } catch (e) { host = ''; }
    if (!host || !PUSH_HOSTS.test(host) || ep.length > 1000) return json({ erro: 'Este navegador usa um serviço de avisos que o site não conhece.' }, 400);
    await env.DB.prepare('INSERT OR REPLACE INTO push_inscricoes (endpoint, usuario_id, criado) VALUES (?, ?, ?)').bind(ep, u.id, Date.now()).run();
    // no máximo 5 aparelhos por conta: sai o mais antigo
    await env.DB.prepare('DELETE FROM push_inscricoes WHERE usuario_id = ? AND endpoint NOT IN (SELECT endpoint FROM push_inscricoes WHERE usuario_id = ? ORDER BY criado DESC LIMIT ?)')
      .bind(u.id, u.id, MAX_APARELHOS).run();
    return json({ ok: true });
  }
  if (p === '/api/push/sair' && req.method === 'POST') {
    const b = await req.json().catch(() => null);
    await env.DB.prepare('DELETE FROM push_inscricoes WHERE endpoint = ? AND usuario_id = ?').bind(String(b?.endpoint || ''), u.id).run();
    return json({ ok: true });
  }
  if (p === '/api/push/teste' && req.method === 'POST') {
    const tem = (await env.DB.prepare('SELECT COUNT(*) AS n FROM push_inscricoes WHERE usuario_id = ?').bind(u.id).first())?.n || 0;
    if (!tem) return json({ erro: 'Nenhum aparelho com avisos ligados.' }, 404);
    const n = await avisarPessoa(env, u.id, 'Mercado Macro', 'Pronto. Os alarmes da Jade vão chegar assim, mesmo com o site fechado.');
    return n ? json({ ok: true, n }) : json({ erro: 'O serviço de avisos do navegador não respondeu. Tente de novo em instantes.' }, 502);
  }
  if (p === '/api/push/pendentes') {
    // o service worker pega aqui o texto dos avisos (o push chega vazio); fica marcado como entregue
    const agora = Date.now();
    const r = await env.DB.prepare('SELECT id, titulo, texto, criado FROM push_fila WHERE usuario_id = ? AND entregue IS NULL AND criado > ? ORDER BY id LIMIT 5').bind(u.id, agora - 6 * 3600000).all();
    if (r.results.length) await env.DB.prepare(`UPDATE push_fila SET entregue = ? WHERE id IN (${r.results.map(() => '?').join(',')})`).bind(agora, ...r.results.map((x) => x.id)).run();
    return json({ avisos: r.results }, 200, { 'Cache-Control': 'no-store' });
  }
  return null;
}

/* ---------------- conferência a cada minuto (cron) ---------------- */
// cotacoes(simbolos) -> { sym: preço } (o index.js passa uma função que usa o servidor de dados)
export async function checarAlarmes(env, cotacoes) {
  await garantirAlarmes(env);
  const r = await env.DB.prepare('SELECT id, usuario_id, sym, nome, alvo, dir FROM alarmes WHERE disparado IS NULL LIMIT 2000').all();
  const lista = r.results;
  if (!lista.length) return 0;
  const syms = [...new Set(lista.map((a) => a.sym))];
  const preco = {};
  for (let i = 0; i < syms.length; i += 40) Object.assign(preco, await cotacoes(syms.slice(i, i + 40)).catch(() => ({})));
  const agora = Date.now();
  let n = 0;
  for (const a of lista) {
    const v = preco[a.sym];
    if (!(typeof v === 'number' && isFinite(v) && v > 0)) continue;
    if (!(a.dir === 'acima' ? v >= a.alvo : v <= a.alvo)) continue;
    // marca primeiro: se duas rodadas se cruzarem, só uma avisa
    const m = await env.DB.prepare('UPDATE alarmes SET disparado = ?, preco = ? WHERE usuario_id = ? AND id = ? AND disparado IS NULL').bind(agora, v, a.usuario_id, a.id).run();
    if (!m.meta?.changes) continue;
    const c = casas(a.sym);
    await avisarPessoa(env, a.usuario_id, 'Alarme de preço',
      `${a.nome} ${a.dir === 'acima' ? 'passou de' : 'caiu abaixo de'} ${numBR(a.alvo, c)}. Agora: ${numBR(v, c)}.`);
    n++;
  }
  // limpeza: alarmes disparados e avisos com mais de 7 dias
  if (new Date(agora).getUTCMinutes() === 7) await env.DB.batch([
    env.DB.prepare('DELETE FROM alarmes WHERE disparado IS NOT NULL AND disparado < ?').bind(agora - 7 * 864e5),
    env.DB.prepare('DELETE FROM push_fila WHERE criado < ?').bind(agora - 7 * 864e5),
  ]);
  return n;
}
export const casas = (sym) => /=X$/.test(sym) ? 4 : /^\^(BVSP|DJI)$/.test(sym) ? 0 : 2;
export const numBR = (v, c) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });

// guarda o texto e acorda os aparelhos da pessoa; devolve quantos aceitaram
export async function avisarPessoa(env, uid, titulo, texto) {
  await garantirAlarmes(env);
  await env.DB.prepare('INSERT INTO push_fila (usuario_id, titulo, texto, criado) VALUES (?, ?, ?, ?)').bind(uid, titulo, texto, Date.now()).run();
  const subs = (await env.DB.prepare('SELECT endpoint FROM push_inscricoes WHERE usuario_id = ?').bind(uid).all()).results;
  let ok = 0;
  for (const s of subs) {
    const st = await enviarPush(env, s.endpoint).catch(() => 0);
    if (st >= 200 && st < 300) { ok++; await env.DB.prepare('UPDATE push_inscricoes SET ultimo = ? WHERE endpoint = ?').bind(Date.now(), s.endpoint).run(); }
    else if (st === 404 || st === 410) await env.DB.prepare('DELETE FROM push_inscricoes WHERE endpoint = ?').bind(s.endpoint).run();
    else console.error('push: HTTP ' + st);
  }
  return ok;
}

/* ---------------- Web Push sem conteúdo, assinado com VAPID (RFC 8292) ---------------- */
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uDec = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
let vapid = null;
async function chavesVapid(env) {
  if (vapid) return vapid;
  let jwk = (await env.DB.prepare("SELECT valor FROM config WHERE chave = 'vapid_jwk'").first())?.valor;
  if (!jwk) {
    const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    await env.DB.prepare("INSERT OR IGNORE INTO config (chave, valor) VALUES ('vapid_jwk', ?)").bind(JSON.stringify(await crypto.subtle.exportKey('jwk', par.privateKey))).run();
    jwk = (await env.DB.prepare("SELECT valor FROM config WHERE chave = 'vapid_jwk'").first()).valor;
  }
  const priv = JSON.parse(jwk);
  // chave pública "crua" (0x04 + x + y), no formato que o navegador pede em applicationServerKey
  const raw = new Uint8Array(65); raw[0] = 4; raw.set(b64uDec(priv.x), 1); raw.set(b64uDec(priv.y), 33);
  vapid = { privada: await crypto.subtle.importKey('jwk', priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']), publica: b64u(raw) };
  return vapid;
}
export async function jwtVapid(env, endpoint, agora = Date.now()) {
  const { privada, publica } = await chavesVapid(env);
  const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
  const corpo = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc({ aud: new URL(endpoint).origin, exp: Math.floor(agora / 1000) + 12 * 3600, sub: 'https://mercadomacro.com.br' });
  const ass = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privada, new TextEncoder().encode(corpo));
  return { jwt: corpo + '.' + b64u(ass), publica };
}
async function enviarPush(env, endpoint) {
  const { jwt, publica } = await jwtVapid(env, endpoint);
  const r = await fetch(endpoint, { method: 'POST', headers: { TTL: '21600', Urgency: 'high', Authorization: `vapid t=${jwt}, k=${publica}`, 'Content-Length': '0' } });
  return r.status;
}
