// 24/11/2026: erros de JavaScript dos navegadores chegam ao /admin (só mensagem, arquivo do site, linha, aba e aparelho)
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { receberErroJs, errosRecentes } from '../src/erros-js.js';

const db = new DatabaseSync(':memory:');
const prep = (sql) => { let a = []; const o = {
  bind: (...x) => { a = x; return o; },
  first: async () => db.prepare(sql).get(...a) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...a) }),
  run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: r.changes } }; },
}; return o; };
const env = { DB: { prepare: prep } };
const avisos = [];
const avisar = async (e, t, m) => avisos.push(t + ' | ' + m);
const manda = (itens, h = { Origin: 'https://mercadomacro.com.br' }) => receberErroJs(new Request('https://mercadomacro.com.br/api/erro-js', { method: 'POST', headers: h, body: JSON.stringify({ itens }) }), env, avisar);

test('guarda erros do site, ignora os de fora e avisa no Telegram na 3ª vez do dia', async () => {
  const erro = { m: "Cannot read properties of undefined (reading 'x')", a: 'https://mercadomacro.com.br/app.js?v=227', l: 120, aba: 'news-panel', ap: 'celular' };
  await manda([erro]); await manda([erro]);
  assert.equal(avisos.length, 0);
  await manda([erro]);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /\/app\.js:120/);
  await manda([erro]); assert.equal(avisos.length, 1); // só uma vez por dia
  // fora do site, extensão, queda de rede e outra origem: nada entra
  await manda([{ m: 'x is not defined', a: 'chrome-extension://abc/c.js', l: 1 }, { m: 'Failed to fetch', a: '', l: 0 }, { m: 'boom', a: 'https://outro.com/a.js', l: 2 }]);
  await manda([{ m: 'de outro site', a: '', l: 0 }], { Origin: 'https://malicioso.com' });
  const l = await errosRecentes(env);
  assert.equal(l.length, 1);
  assert.equal(l[0].n, 4); assert.equal(l[0].arquivo, '/app.js'); assert.equal(l[0].aba, 'news-panel');
});
