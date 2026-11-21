import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { reciboAds, ligarStripe, webhookStripe, situacaoCartao, apiAdminStripe } from '../src/stripe.js';

// D1 de mentira em cima do SQLite do Node
function d1() {
  const db = new DatabaseSync(':memory:');
  const prep = (sql) => { let a = []; const o = {
    bind: (...x) => { a = x; return o; },
    // espera um ciclo, como a rede do D1 de verdade: deixa dois pedidos ao mesmo tempo se intercalarem
    first: async () => { await new Promise((r) => setImmediate(r)); return db.prepare(sql).get(...a) ?? null; },
    all: async () => ({ results: db.prepare(sql).all(...a) }),
    run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: r.changes } }; },
  }; return o; };
  return { db, DB: { prepare: prep, batch: async (qs) => { await new Promise((r) => setTimeout(r, 5)); db.exec('BEGIN'); try { const r = []; for (const q of qs) r.push(await q.run()); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } } } };
}
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s });
const avisos = [];
const { db, DB } = d1();
db.exec(`CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT);
  CREATE TABLE usuarios (id INTEGER PRIMARY KEY, nome TEXT, email TEXT, status TEXT, expira TEXT, admin INTEGER DEFAULT 0, decidido TEXT, codigo TEXT);
  INSERT INTO usuarios (id, nome, email, status, expira) VALUES (7, 'Teste', 't@x.com', 'ativo', '2026-12-05T22:22:04.499Z');
  INSERT INTO config VALUES ('stripe_key', 'sk_test_x'), ('stripe_whsec', 'whsec_teste');`);
const env = { DB };
const config = async () => Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map((x) => [x.chave, x.valor]));
ligarStripe({ json, mesmaOrigem: () => true, config, salvarConfig: async () => {}, avisar: async (e, t) => avisos.push(t), limparCacheSessao: () => {}, dentroDoLimite: async () => true });

async function evento(type, object) {
  const corpo = JSON.stringify({ type, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('whsec_teste'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const v1 = Buffer.from(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${t}.${corpo}`))).toString('hex');
  return webhookStripe(new Request('https://x/api/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${t},v1=${v1}` }, body: corpo }), env);
}
const sub = (extra) => ({ id: 'sub_1', customer: 'cus_1', metadata: { usuario_id: '7', plano: 'mensal' }, current_period_end: 1796076000, ...extra });

test('cancelar no portal marca a data em que a renovação para, e reativar desmarca', async () => {
  await situacaoCartao(env, 7); // cria a coluna
  db.exec(`UPDATE usuarios SET stripe_cliente = 'cus_1', stripe_assinatura = 'sub_1' WHERE id = 7`);
  globalThis.fetch = async () => new Response(JSON.stringify(sub({ cancel_at_period_end: false })));
  assert.equal((await situacaoCartao(env, 7)).cancelaEm, null);
  assert.equal((await (await evento('customer.subscription.updated', sub({ cancel_at_period_end: true, cancel_at: 1796076000 }))).json()).ok, true);
  assert.equal(db.prepare('SELECT stripe_cancela c FROM usuarios WHERE id = 7').get().c, new Date(1796076000e3).toISOString());
  assert.ok(avisos.some((t) => /cancelou/i.test(t)));
  // a página de assinatura confere no Stripe mesmo sem o aviso do webhook
  globalThis.fetch = async () => new Response(JSON.stringify(sub({ cancel_at_period_end: false })));
  assert.equal((await situacaoCartao(env, 7)).cancelaEm, null);
  globalThis.fetch = async () => new Response(JSON.stringify(sub({ cancel_at_period_end: true })));
  const s = await situacaoCartao(env, 7);
  assert.equal(s.renovaCartao, true); assert.ok(s.cancelaEm);
  // Stripe fora do ar: usa o que está guardado
  globalThis.fetch = async () => { throw new Error('rede'); };
  assert.ok((await situacaoCartao(env, 7)).cancelaEm);
});
test('assinatura encerrada limpa a renovação e a data de cancelamento', async () => {
  await evento('customer.subscription.deleted', sub({ status: 'canceled' }));
  const u = db.prepare('SELECT stripe_assinatura a, stripe_cancela c FROM usuarios WHERE id = 7').get();
  assert.equal(u.a, null); assert.equal(u.c, null);
  globalThis.fetch = async () => { throw new Error('não deveria chamar o Stripe'); };
  const s = await situacaoCartao(env, 7);
  assert.equal(s.renovaCartao, false); assert.equal(s.cancelaEm, null);
});

// 04/11/2026: pagamento e acesso gravados juntos (batch = transação)
test('fatura paga grava pagamento e acesso juntos; repetida não soma de novo; falha no meio não deixa pagamento sem acesso', async () => {
  db.exec(`CREATE TABLE IF NOT EXISTS pagamentos (id INTEGER PRIMARY KEY, usuario_id INTEGER, plano TEXT, valor INTEGER, status TEXT, criado TEXT, enviado TEXT, decidido TEXT, validade TEXT, ref TEXT, arquivo BLOB, tipo_arq TEXT);
    CREATE TABLE IF NOT EXISTS historico (id INTEGER PRIMARY KEY, usuario_id INTEGER, quando TEXT, texto TEXT);`);
  for (const c of ['plano TEXT', 'aviso_venc TEXT']) { try { db.exec(`ALTER TABLE usuarios ADD COLUMN ${c}`); } catch (e) { /* já existe */ } }
  db.exec(`UPDATE usuarios SET expira = '2026-12-05T22:22:04.499Z', status = 'ativo' WHERE id = 7`);
  const fatura = (id) => ({ id, customer: 'cus_1', amount_paid: 1990, billing_reason: 'subscription_cycle', parent: { subscription_details: { subscription: 'sub_1', metadata: { usuario_id: '7', plano: 'mensal' } } }, lines: { data: [] } });
  globalThis.fetch = async () => new Response('{}');
  const r1 = await evento('invoice.paid', fatura('in_A'));
  assert.equal(r1.status, 200);
  const exp1 = db.prepare('SELECT expira e FROM usuarios WHERE id = 7').get().e;
  assert.ok(exp1 > '2027-01-01', exp1);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM pagamentos WHERE ref = 'stripe:in_A'`).get().n, 1);
  // reenvio da mesma fatura: não soma outro mês
  await evento('invoice.paid', fatura('in_A'));
  assert.equal(db.prepare('SELECT expira e FROM usuarios WHERE id = 7').get().e, exp1);
  // falha ao liberar o acesso: o pagamento também não fica gravado, e o reenvio libera tudo
  db.exec(`CREATE TRIGGER falha BEFORE UPDATE OF expira ON usuarios BEGIN SELECT RAISE(ABORT, 'falha simulada'); END;`);
  const r3 = await evento('invoice.paid', fatura('in_B')).catch(() => ({ status: 500 }));
  assert.notEqual(r3.status, 200);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM pagamentos WHERE ref = 'stripe:in_B'`).get().n, 0);
  db.exec('DROP TRIGGER falha');
  await evento('invoice.paid', fatura('in_B'));
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM pagamentos WHERE ref = 'stripe:in_B'`).get().n, 1);
  assert.ok(db.prepare('SELECT expira e FROM usuarios WHERE id = 7').get().e > exp1);
});

test('duas faturas ao mesmo tempo somam dois períodos', async () => {
  db.exec(`UPDATE usuarios SET expira = '2027-02-05T12:00:00.000Z', status = 'ativo' WHERE id = 7`);
  const fatura = (id) => ({ id, customer: 'cus_1', amount_paid: 1990, billing_reason: 'subscription_cycle', parent: { subscription_details: { subscription: 'sub_1', metadata: { usuario_id: '7', plano: 'mensal' } } }, lines: { data: [] } });
  const rs = await Promise.all([evento('invoice.paid', fatura('in_C')), evento('invoice.paid', fatura('in_D'))]);
  assert.deepEqual(rs.map((r) => r.status), [200, 200]);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM pagamentos WHERE ref IN ('stripe:in_C', 'stripe:in_D')`).get().n, 2);
  assert.equal(db.prepare('SELECT expira e FROM usuarios WHERE id = 7').get().e.slice(0, 10), '2027-04-05');
});

test('fatura paga sem conta fica na lista do /admin e libera ao ligar pelo e-mail', async () => {
  db.exec(`INSERT INTO usuarios (id, nome, email, status, expira) VALUES (8, 'Outra', 'outra@x.com', 'pendente', NULL)`);
  const f = { id: 'in_ORF', customer: 'cus_9', customer_email: 'Outra@x.com', amount_paid: 1990, billing_reason: 'subscription_create', parent: { subscription_details: { subscription: 'sub_9', metadata: { usuario_id: '999', plano: 'mensal' } } }, lines: { data: [] } };
  const r = await (await evento('invoice.paid', f)).json();
  assert.equal(r.semConta, true);
  await evento('invoice.paid', f); // reenvio não duplica
  const adm = (corpo) => apiAdminStripe(new Request('https://x/api/admin/stripe', corpo ? { method: 'POST', body: JSON.stringify(corpo) } : {}), env).then((x) => x.json());
  globalThis.fetch = async () => new Response('{}');
  const lista = (await adm()).orfas;
  assert.equal(lista.length, 1);
  assert.equal((await adm({ acao: 'ligar', id: lista[0].id, email: 'ninguem@x.com' })).erro, 'Não achei conta com esse e-mail.');
  const ok = await adm({ acao: 'ligar', id: lista[0].id, email: 'OUTRA@x.com' });
  assert.equal(ok.ok, true); assert.ok(ok.validade);
  const u = db.prepare('SELECT status, expira, stripe_cliente FROM usuarios WHERE id = 8').get();
  assert.equal(u.status, 'ativo'); assert.equal(u.stripe_cliente, 'cus_9');
  assert.equal((await adm()).orfas.length, 0);
  assert.equal((await adm({ acao: 'ligar', id: lista[0].id, email: 'outra@x.com' })).erro, 'Essa fatura já foi resolvida.');
});

test('fatura da lista já creditada para outra conta não é ligada a uma segunda conta', async () => {
  db.exec(`INSERT INTO usuarios (id, nome, email, status, expira) VALUES (9, 'Conta B', 'b@x.com', 'pendente', NULL)`);
  db.exec(`INSERT INTO pagamentos (usuario_id, plano, valor, status, criado, decidido, validade, ref) VALUES (8, 'mensal', 1990, 'aprovado', '2026-11-04', '2026-11-04', '2026-12-05', 'stripe:in_DUP')`);
  db.exec(`INSERT INTO stripe_orfas (fatura, cliente, assinatura, email, valor, plano, primeira, criado, status) VALUES ('in_DUP', 'cus_d', 'sub_d', 'b@x.com', 1990, 'mensal', 1, '2026-11-04', 'aberta')`);
  const chamadas = [];
  globalThis.fetch = async (url) => { chamadas.push(String(url)); return new Response('{}'); };
  const adm = (corpo) => apiAdminStripe(new Request('https://x/api/admin/stripe', corpo ? { method: 'POST', body: JSON.stringify(corpo) } : {}), env).then((x) => x.json());
  const id = (await adm()).orfas.find((o) => o.fatura === 'in_DUP').id;
  const r = await adm({ acao: 'ligar', id, email: 'b@x.com' });
  assert.match(r.erro, /já foi creditada para outra conta: Outra/);
  assert.equal(db.prepare(`SELECT status FROM stripe_orfas WHERE id = ?`).get(id).status, 'aberta');
  assert.equal(db.prepare('SELECT status FROM usuarios WHERE id = 9').get().status, 'pendente');
  assert.equal(chamadas.filter((u) => u.includes('subscriptions/')).length, 0);
  // ligar à conta dona fecha a pendência sem creditar de novo
  const ok = await adm({ acao: 'ligar', id, email: 'outra@x.com' });
  assert.equal(ok.ok, true); assert.equal(ok.repetido, true);
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM pagamentos WHERE ref = 'stripe:in_DUP'`).get().n, 1);
});

test('se o Stripe recusar a marcação da conta, o admin é avisado', async () => {
  db.exec(`INSERT INTO stripe_orfas (fatura, cliente, assinatura, email, valor, plano, primeira, criado, status) VALUES ('in_SF', 'cus_s', 'sub_s', 'b@x.com', 1990, 'mensal', 1, '2026-11-04', 'aberta')`);
  globalThis.fetch = async (url) => String(url).includes('subscriptions/') ? new Response('{"error":{"message":"fora do ar"}}', { status: 500 }) : new Response('{}');
  const adm = (corpo) => apiAdminStripe(new Request('https://x/api/admin/stripe', corpo ? { method: 'POST', body: JSON.stringify(corpo) } : {}), env).then((x) => x.json());
  const id = (await adm()).orfas.find((o) => o.fatura === 'in_SF').id;
  const r = await adm({ acao: 'ligar', id, email: 'b@x.com' });
  assert.equal(r.ok, true); assert.equal(r.stripeFalhou, true);
  assert.equal(db.prepare('SELECT status FROM usuarios WHERE id = 9').get().status, 'ativo');
});

test('recibo do Ads exige a primeira fatura paga da própria conta em modo real', async (t) => {
  db.exec("INSERT INTO usuarios (id, nome, email, status) VALUES (21, 'Simulada', 'simulada@example.test', 'pendente')");
  db.exec("UPDATE config SET valor = 'sk_live_simulada' WHERE chave = 'stripe_key'");
  t.after(() => db.exec("UPDATE config SET valor = 'sk_test_x' WHERE chave = 'stripe_key'"));
  const fatura = {
    id: 'in_ads_simulada', customer: 'cus_simulado', amount_paid: 1990, currency: 'brl',
    status: 'paid', billing_reason: 'subscription_create', subscription: 'sub_simulada',
    subscription_details: { metadata: { usuario_id: '21', plano: 'mensal' } }
  };
  const checkout = { id: 'cs_live_simulada', livemode: true, mode: 'subscription', status: 'complete',
    client_reference_id: '21', payment_status: 'paid', invoice: fatura };
  const chamadas = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    chamadas.push(String(url));
    return Response.json(checkout);
  });
  const consultar = async (sessao = checkout.id) => {
    const req = new Request('https://example.test', { method: 'POST', body: JSON.stringify({ sessao }) });
    return (await reciboAds(req, env, { id: 21 })).json();
  };
  await evento('checkout.session.completed', { ...checkout, metadata: { usuario_id: '21' } });
  await evento('invoice.payment_failed', fatura);
  assert.deepEqual(await consultar(), { pendente: true });
  assert.equal(chamadas.length, 0);
  await evento('invoice.paid', fatura);
  await evento('invoice.paid', fatura);
  const esperado = { recibo: { transaction_id: fatura.id, currency: 'BRL', value: 19.9 } };
  assert.deepEqual(await consultar(), esperado);
  assert.deepEqual(await consultar(), esperado);
  checkout.invoice = { ...fatura, id: 'in_renovacao', billing_reason: 'subscription_cycle' };
  await evento('invoice.paid', checkout.invoice);
  assert.deepEqual(await consultar(), { recibo: null });
  checkout.invoice = { ...fatura, id: 'in_reassinatura' };
  await evento('invoice.paid', checkout.invoice);
  assert.deepEqual(await consultar(), { recibo: null });
  checkout.invoice = fatura;
  checkout.client_reference_id = '99';
  assert.deepEqual(await consultar(), { recibo: null });
  assert.deepEqual(await consultar('cs_test_simulada'), { recibo: null });
  checkout.client_reference_id = '21';
  db.exec("INSERT INTO pagamentos(usuario_id, plano, status, valor, criado, decidido) VALUES(21, 'mensal', 'aprovado', 2490, '2025', '2025')");
  assert.deepEqual(await consultar(), { recibo: null });
});
