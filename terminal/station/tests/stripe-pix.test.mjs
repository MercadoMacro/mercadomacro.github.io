import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ligarStripe, webhookStripe, situacaoCartao, apiPix } from '../src/stripe.js';

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

// 22/11/2026: Pix pelo Stripe (Checkout em modo pagamento) libera o acesso sozinho, uma vez só
const sessaoPix = (extra) => ({ id: 'cs_pix_1', mode: 'payment', payment_status: 'paid', currency: 'brl', amount_total: 2490, payment_intent: 'pi_1', customer: null,
  metadata: { usuario_id: '7', plano: 'mensal', tipo: 'pix' }, ...extra });
const pagos = () => db.prepare(`SELECT ref, valor, plano, status FROM pagamentos WHERE ref LIKE 'stripe:pi_%' ORDER BY id`).all();

test('Pix pago libera 1 mês uma vez só, mesmo com o aviso repetido', async () => {
  await situacaoCartao(env, 7); // cria as colunas e tabelas
  const antes = db.prepare('SELECT expira FROM usuarios WHERE id = 7').get().expira;
  assert.equal((await evento('checkout.session.completed', sessaoPix())).status, 200);
  assert.equal((await evento('checkout.session.async_payment_succeeded', sessaoPix())).status, 200);
  const p = pagos();
  assert.equal(p.length, 1);
  assert.equal(p[0].ref, 'stripe:pi_1'); assert.equal(p[0].valor, 2490); assert.equal(p[0].status, 'aprovado');
  const depois = db.prepare('SELECT expira FROM usuarios WHERE id = 7').get().expira;
  assert.ok(depois > antes);
  assert.ok(avisos.some((t) => t === 'Pix pago (Stripe)'));
});

test('Pix ainda não pago não libera; o aviso de pagamento assíncrono libera depois', async () => {
  const s = sessaoPix({ id: 'cs_pix_2', payment_intent: 'pi_2', payment_status: 'unpaid' });
  await evento('checkout.session.completed', s);
  assert.equal(pagos().filter((x) => x.ref === 'stripe:pi_2').length, 0);
  await evento('checkout.session.async_payment_succeeded', { ...s, payment_status: 'paid' });
  assert.equal(pagos().filter((x) => x.ref === 'stripe:pi_2').length, 1);
});

test('pagamento que não é o Pix do site (sem tipo, outra moeda ou plano só no cartão) é ignorado', async () => {
  await evento('checkout.session.completed', sessaoPix({ payment_intent: 'pi_3', metadata: { usuario_id: '7', plano: 'mensal' } }));
  await evento('checkout.session.completed', sessaoPix({ payment_intent: 'pi_4', currency: 'usd' }));
  await evento('checkout.session.completed', sessaoPix({ payment_intent: 'pi_5', metadata: { usuario_id: '7', plano: 'anual', tipo: 'pix' } }));
  assert.equal(pagos().filter((x) => ['stripe:pi_3', 'stripe:pi_4', 'stripe:pi_5'].includes(x.ref)).length, 0);
});

test('pedir Pix cria a página de pagamento do Stripe só com Pix, no preço do Pix', async () => {
  const fetchAntes = globalThis.fetch;
  let corpo = '';
  globalThis.fetch = async (u, o) => {
    if (String(u).endsWith('/account')) return new Response(JSON.stringify({ country: 'BR' }), { status: 200 });
    corpo = String(o.body); return new Response(JSON.stringify({ id: 'cs_x', url: 'https://checkout.stripe.com/c/pay/cs_x' }), { status: 200 });
  };
  try {
    const r = await (await apiPix(new Request('https://x/api/assinatura/pix', { method: 'POST', body: JSON.stringify({ plano: 'semestral' }) }), env, { id: 7 })).json();
    assert.equal(r.sessao, 'cs_x');
    const f = new URLSearchParams(corpo);
    assert.equal(f.get('mode'), 'payment');
    assert.equal(f.get('payment_method_types[0]'), 'pix');
    assert.equal(f.get('line_items[0][price_data][unit_amount]'), '13900');
    assert.equal(f.get('metadata[tipo]'), 'pix');
    // plano só no cartão não sai no Pix
    const n = await apiPix(new Request('https://x/api/assinatura/pix', { method: 'POST', body: JSON.stringify({ plano: 'anual' }) }), env, { id: 7 });
    assert.equal(n.status, 400);
  } finally { globalThis.fetch = fetchAntes; }
});

test('Pix não ligado no Stripe: a página volta para o Pix manual', async () => {
  const fetchAntes = globalThis.fetch;
  let chamadas = 0;
  globalThis.fetch = async () => { chamadas++; return new Response(JSON.stringify({ error: { message: 'The payment method type "pix" is invalid.' } }), { status: 400 }); };
  try {
    const pedir = () => apiPix(new Request('https://x/api/assinatura/pix', { method: 'POST', body: JSON.stringify({ plano: 'mensal' }) }), env, { id: 7 });
    assert.deepEqual(await (await pedir()).json(), { manual: true });
    // não tenta de novo logo em seguida
    assert.deepEqual(await (await pedir()).json(), { manual: true });
    assert.equal(chamadas, 1);
  } finally { globalThis.fetch = fetchAntes; }
});
