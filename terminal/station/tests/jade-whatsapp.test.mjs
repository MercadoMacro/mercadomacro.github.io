import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/jade-whatsapp.js', import.meta.url), 'utf8');
const stub = 'class WorkerEntrypoint { constructor(ctx, env) { this.env = env; } }';
const moduleURL = 'data:text/javascript;base64,' + Buffer.from(source.replace("import { WorkerEntrypoint } from 'cloudflare:workers';", stub)).toString('base64');
const { jadeAccount, JadeWatchlist } = await import(moduleURL);

test('Jade vincula uma vez, isola contas e revoga o acesso', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec("CREATE TABLE usuarios (id TEXT, admin INTEGER, plano TEXT, status TEXT, expira TEXT); CREATE TABLE dados_usuario (usuario_id TEXT, chave TEXT, valor TEXT); INSERT INTO usuarios VALUES ('a',0,'premium','ativo',NULL), ('b',0,'premium','ativo',NULL);");
  const insert = sql.prepare('INSERT INTO dados_usuario VALUES (?, ?, ?)');
  insert.run('a', 'watchlists', JSON.stringify({ lists: [{ items: [{s:'PETR4.SA'}] }] }));
  insert.run('b', 'watchlist', JSON.stringify([{s:'VALE3.SA'}]));
  const env = {
    JADE_PHONE_HASH_KEY: 'test-key',
    DB: { prepare(query) {
      const statement = sql.prepare(query);
      const bind = (...args) => ({
        run: () => ({meta: {changes: statement.run(...args).changes}}),
        first: () => statement.get(...args),
        all: () => ({results: statement.all(...args)})
      });
      return {...bind(), bind};
    } }
  };
  const api = new JadeWatchlist({}, env);
  const call = (method, id, plan = 'premium') => jadeAccount(
    new Request('https://example.test/api/conta/jade-whatsapp', {method, headers: {Origin:'https://example.test'}}),
    env, {id, plano:plan}, (body, status = 200) => ({body,status})
  );
  const code = async id => new URL((await call('POST', id)).body.link).searchParams.get('text').split(' ')[1];
  const a = '5511999991234', b = '5511999991235';
  const token = await code('a');
  assert.equal(await api.link(a, token), true);
  assert.equal(await api.link(b, token), false);
  const bToken = await code('b');
  assert.equal(await api.link(a, bToken), false);
  assert.equal(await api.link(b, bToken), true);
  assert.deepEqual((await api.watchlist(a)).map(x => x.s), ['PETR4.SA']);
  assert.deepEqual((await api.watchlist(b)).map(x => x.s), ['VALE3.SA']);
  sql.exec("UPDATE usuarios SET status = 'inativo' WHERE id = 'a'");
  assert.equal(await api.watchlist(a), null);
  await call('DELETE', 'a');
  assert.equal((await call('GET', 'a')).body.vinculado, false);
  const expiring = await code('b');
  sql.exec("UPDATE jade_whatsapp SET expira = 0 WHERE usuario_id = 'b'");
  assert.equal(await api.link(b, expiring), false);
  assert.equal((await call('POST', 'a', 'gratis')).status, 403);
  sql.close();
});
