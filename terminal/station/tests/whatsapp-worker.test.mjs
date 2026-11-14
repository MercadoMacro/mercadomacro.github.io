// Robô da Jade no WhatsApp (terminal/whatsapp/worker.js): assinatura da Meta, limite por número,
// atendimento humano com aviso à equipe, preços vindos do site e memória do ticker da conversa.
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { LIMITE_HORA, reais } from '../../whatsapp/worker.js';

function d1() {
  const sql = new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE jade_handoff (conversation_key TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)');
  const prep = (q) => {
    const st = sql.prepare(q);
    const b = (...a) => ({
      run: async () => ({ meta: { changes: st.run(...a).changes } }),
      first: async () => st.get(...a) ?? null,
      all: async () => ({ results: st.all(...a) }),
      _run: () => st.run(...a),
    });
    return { ...b(), bind: b };
  };
  return { sql, prepare: prep, batch: async (l) => l.map((x) => x._run()) };
}

const SEGREDO = 'segredo-teste';
async function assinar(corpo) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(SEGREDO), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(corpo)));
  return 'sha256=' + Array.from(s, (b) => b.toString(16).padStart(2, '0')).join('');
}
async function mensagem(env, texto, de = '5511999990001') {
  const corpo = JSON.stringify({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1342951915577900' }, messages: [{ type: 'text', from: de, text: { body: texto } }] } }] }] });
  return worker.fetch(new Request('https://x.workers.dev/webhook', { method: 'POST', body: corpo, headers: { 'X-Hub-Signature-256': await assinar(corpo) } }), env);
}

function ambiente() {
  const enviadas = [], avisos = [];
  globalThis.fetch = async (url, op = {}) => {
    const u = String(url);
    if (u.startsWith('https://graph.facebook.com/')) { enviadas.push(JSON.parse(op.body).text.body); return new Response('{}'); }
    if (u.startsWith('https://news.cota-cotacao10.workers.dev')) return new Response(JSON.stringify([{ titulo: 'Petrobras anuncia dividendos', link: 'https://x.test/1', data: Date.now() - 60000, fonte: 'Valor' }]));
    if (u.includes('finance.yahoo.com')) return new Response(JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: 11, regularMarketTime: Math.floor(Date.now() / 1000), exchangeTimezoneName: 'America/Sao_Paulo' }, timestamp: [Math.floor(Date.now() / 1000) - 86400 * 2], indicators: { quote: [{ close: [10] }] } }] } }));
    throw new Error('fetch inesperado ' + u);
  };
  const env = {
    META_APP_SECRET: SEGREDO, WHATSAPP_PRODUCTION_ACCESS_TOKEN: 't', HANDOFF_DB: d1(),
    JADE: {
      precos: async () => ({ cartao: { mensal: 2190, semestral: 9990, anual: 17990 }, pix: { mensal: 2490, semestral: 13900 }, gratisHoras: 48 }),
      avisarEquipe: async (tipo, final, texto) => { avisos.push([tipo, final, texto]); return true; },
      watchlist: async () => null, link: async () => false,
    },
  };
  return { env, enviadas, avisos };
}

test('assinatura errada é recusada', async () => {
  const { env } = ambiente();
  const r = await worker.fetch(new Request('https://x.workers.dev/webhook', { method: 'POST', body: '{}', headers: { 'X-Hub-Signature-256': 'sha256=' + '0'.repeat(64) } }), env);
  assert.equal(r.status, 401);
});

test('preços vêm do site (não ficam escritos no robô)', async () => {
  const { env, enviadas } = ambiente();
  await mensagem(env, 'Quanto custa?');
  assert.match(enviadas[0], /Mensal: R\$ 21,90 por mês/);
  assert.match(enviadas[0], /1 mês: R\$ 24,90/);
  assert.equal(reais(17990), 'R$ 179,90');
  // se o site não responder, a Jade manda para a página de planos em vez de inventar valor
  env.JADE.precos = async () => { throw new Error('fora'); };
  const { env: env2, enviadas: e2 } = ambiente();
  env2.JADE.precos = async () => { throw new Error('fora'); };
  await mensagem(env2, 'pix');
  assert.match(e2[0], /valores atualizados estão em https:\/\/mercadomacro\.com\.br\/planos/);
  assert.doesNotMatch(e2[0], /R\$ \d/);
});

test('SIM QUERO avisa a equipe; mensagens na pausa vão para a equipe e a Jade fica quieta', async () => {
  const { env, enviadas, avisos } = ambiente();
  await mensagem(env, 'SIM QUERO');
  assert.equal(enviadas.length, 1);
  assert.deepEqual(avisos[0], ['pedido', '0001', 'SIM QUERO']);
  await mensagem(env, 'Quero saber do plano anual para minha equipe');
  assert.equal(enviadas.length, 1);
  assert.deepEqual(avisos[1], ['mensagem', '0001', 'Quero saber do plano anual para minha equipe']);
  await mensagem(env, 'voltar para a jade');
  assert.equal(enviadas.length, 2);
  assert.match(enviadas[1], /Voltei/);
});

test('limite por número: aviso na primeira mensagem acima do limite e depois silêncio', async () => {
  const { env, enviadas } = ambiente();
  for (let i = 0; i < LIMITE_HORA + 3; i++) await mensagem(env, 'obrigado', '5511999990002');
  assert.equal(enviadas.length, LIMITE_HORA + 1);
  assert.match(enviadas.at(-1), /muitas mensagens/);
  // outro número não é afetado
  await mensagem(env, 'obrigado', '5511999990003');
  assert.equal(enviadas.length, LIMITE_HORA + 2);
});

test('ticker da conversa fica guardado para "e as notícias?"', async () => {
  const { env, enviadas } = ambiente();
  await mensagem(env, 'PETR4', '5511999990004');
  assert.match(enviadas[0], /PETR4 \| Jade/);
  assert.match(enviadas[0], /\+10,00%/);
  await mensagem(env, 'e as notícias?', '5511999990004');
  assert.match(enviadas[1], /Petrobras anuncia dividendos/);
});
