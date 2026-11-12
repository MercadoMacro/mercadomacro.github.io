// Texto da manhã na abertura (O que esperar hoje + 5 notícias), 12/11/2026
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ligarAssistente, manhaIA, lerManha, dadosParaManha } from '../src/assistente.js';

function d1() {
  const db = new DatabaseSync(':memory:');
  const st = (sql, args = []) => ({
    bind: (...a) => st(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  });
  return { prepare: (sql) => st(sql) };
}
let cfg = { gemini_key: 'k'.repeat(30) };
ligarAssistente({ json: (o, s = 200) => new Response(JSON.stringify(o), { status: s }), mesmaOrigem: () => true, config: async () => cfg, salvarConfig: async () => {}, dentroDoLimite: async () => true });

const RESPOSTA = `VISAO: Os futuros em Nova York sobem 0,40% e a Europa opera em alta. Às 10h30 sai o CPI dos EUA, o dado mais esperado do dia. No Brasil, o mercado acompanha o resultado da Petrobras divulgado ontem à noite.
NOTICIAS:
- Petrobras lucra R$ 20 bi no terceiro trimestre (Valor Investe)
- **Fed**: dirigente diz que juros podem cair em dezembro (Financial Juice)
- Minério de ferro sobe em Dalian com estímulos na China (Money Times)
- Dólar fecha em queda ontem com fluxo estrangeiro (InfoMoney)
- Bitcoin volta a US$ 100 mil (Bloomberg Línea)
- Sexta notícia que deve sair do texto (Suno)`;

test('lê o formato e descarta o que vier fora', () => {
  const m = lerManha(RESPOSTA);
  assert.match(m.visao, /^Os futuros/);
  assert.equal(m.noticias.length, 5);
  assert.equal(m.noticias[1], 'Fed: dirigente diz que juros podem cair em dezembro (Financial Juice)');
  assert.equal(lerManha('Bom dia! Hoje o mercado...'), null);
  assert.equal(lerManha('VISAO: curto\nNOTICIAS:\n- a\n'), null);
});

test('dados da manhã só com o que existe', () => {
  const t = dadosParaManha({ data: '2026-11-12', cards: { spf: { nome: 'S&P 500 futuro', v: 6000.5, ch: 0.4 }, dax: { nome: 'DAX', v: null } }, agendaCanal: [{ hora: '10:30', pais: 'EUA', titulo: 'CPI', proj: '0,3%' }] });
  assert.match(t, /S&P 500 futuro: 6\.000,50 \(\+0,40%\)/);
  assert.ok(!t.includes('DAX'));
  assert.match(t, /10:30 EUA: CPI \(projeção 0,3%\)/);
});

test('gera uma vez, reaproveita e cai para null sem chave ou com resposta ruim', async () => {
  const agora = Date.now();
  const lista = Array.from({ length: 8 }, (_, i) => ({ titulo: 'Manchete ' + i, fonte: 'Valor Investe', data: agora - i * 600000, finalScore: 40 }));
  const d = { data: '2026-11-12', cards: {}, agendaCanal: [] };
  const env = { DB: d1() };
  const orig = globalThis.fetch;
  let chamadas = 0, resposta = RESPOSTA;
  globalThis.fetch = async () => { chamadas++; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: resposta }] } }] }), { status: 200 }); };
  try {
    const m = await manhaIA(env, d, lista, agora);
    assert.equal(m.noticias.length, 5);
    assert.equal(chamadas, 1);
    assert.deepEqual((await manhaIA(env, d, lista, agora + 60000)).visao, m.visao);
    assert.equal(chamadas, 1, 'reaproveita dentro de 45 min');
    // depois de 45 min tenta de novo; resposta ruim mantém a do dia
    resposta = 'texto qualquer';
    assert.equal((await manhaIA(env, d, lista, agora + 50 * 60000)).visao, m.visao);
    assert.equal(chamadas, 2);
    // outro dia com resposta ruim: null (a abertura sai com os Destaques de antes)
    assert.equal(await manhaIA(env, { ...d, data: '2026-11-13' }, lista, agora + 60 * 60000), null);
    cfg = {};
    assert.equal(await manhaIA({ DB: d1() }, d, lista, agora), null);
    assert.equal(await manhaIA({ DB: d1() }, d, [], agora), null);
  } finally { globalThis.fetch = orig; cfg = { gemini_key: 'k'.repeat(30) }; }
});
