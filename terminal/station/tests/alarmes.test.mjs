// Alarmes da Jade no servidor e avisos por push (src/alarmes.js, 11/11/2026)
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { checarAlarmes, apiAlarmes, jwtVapid } from '../src/alarmes.js';

// D1 de mentira em cima do SQLite do Node
function d1() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL)');
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  });
  return { prepare: (sql) => st(sql), batch: async (l) => { for (const x of l) await x.run(); }, exec: (s) => db.exec(s) };
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
const req = (method, body) => new Request('https://mercadomacro.com.br/x', { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const sim = () => true;

test('guarda a lista, dispara uma vez só e manda push assinado', async () => {
  const env = { DB: d1() }, u = { id: 7 };
  let r = await apiAlarmes(req('PUT', { lista: [
    { id: 'a1', sym: 'BRL=X', nome: 'Dólar', alvo: 5.5, dir: 'acima' },
    { id: 'a2', sym: '^BVSP', nome: 'Ibovespa', alvo: 120000, dir: 'abaixo' },
    { id: 'ruim', sym: 'x y', nome: 'X', alvo: 1, dir: 'acima' },
  ] }), env, u, '/api/alarmes', sim, json);
  assert.equal((await r.json()).n, 2);
  r = await apiAlarmes(req('POST', { endpoint: 'https://fcm.googleapis.com/fcm/send/abc' }), env, u, '/api/push/inscrever', sim, json);
  assert.equal(r.status, 200);
  r = await apiAlarmes(req('POST', { endpoint: 'https://127.0.0.1/x' }), env, u, '/api/push/inscrever', sim, json);
  assert.equal(r.status, 400);

  const pushes = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, o) => { pushes.push({ url, o }); return new Response(null, { status: 201 }); };
  try {
    const precos = { 'BRL=X': 5.61, '^BVSP': 125000 };
    assert.equal(await checarAlarmes(env, async (syms) => Object.fromEntries(syms.map((s) => [s, precos[s]]))), 1);
    assert.equal(await checarAlarmes(env, async (syms) => Object.fromEntries(syms.map((s) => [s, precos[s]]))), 0); // não repete
  } finally { globalThis.fetch = orig; }
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].url, 'https://fcm.googleapis.com/fcm/send/abc');
  assert.match(pushes[0].o.headers.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]{87}$/);

  r = await apiAlarmes(req('GET'), env, u, '/api/alarmes', sim, json);
  const j = await r.json();
  assert.deepEqual(j.lista.map((a) => a.id), ['a2']);
  assert.deepEqual(j.disparados.map((a) => a.id), ['a1']);
  r = await apiAlarmes(req('GET'), env, u, '/api/push/pendentes', sim, json);
  const av = (await r.json()).avisos;
  assert.equal(av.length, 1);
  assert.equal(av[0].texto, 'Dólar passou de 5,5000. Agora: 5,6100.');
});

test('o JWT do VAPID confere com a chave pública', async () => {
  const env = { DB: d1() };
  const { jwt, publica } = await jwtVapid(env, 'https://web.push.apple.com/abc');
  const [h, p, s] = jwt.split('.');
  const dec = (x) => Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((x.length + 3) % 4)), (c) => c.charCodeAt(0));
  const corpo = JSON.parse(new TextDecoder().decode(dec(p)));
  assert.equal(corpo.aud, 'https://web.push.apple.com');
  const chave = await crypto.subtle.importKey('raw', dec(publica), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, chave, dec(s), new TextEncoder().encode(h + '.' + p)));
});
