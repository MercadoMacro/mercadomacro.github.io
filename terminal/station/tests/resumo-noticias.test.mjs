import test from 'node:test'; import assert from 'node:assert/strict';
import { ligarAssistente, apiResumoNoticias, manchetesParaResumo } from '../src/assistente.js';

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
let cfg = { gemini_key: 'k'.repeat(30) };
ligarAssistente({ json, mesmaOrigem: () => true, config: async () => cfg, salvarConfig: async () => {}, dentroDoLimite: async () => true });

// D1 de mentira, só com o que a rota usa
function banco() {
  let row = null;
  const prep = (sql) => ({ args: [], bind(...a) { this.args = a; return this; },
    async run() {
      if (sql.startsWith('CREATE')) return { meta: { changes: 0 } };
      if (sql.startsWith('INSERT')) {
        const [agora, limite] = this.args;
        if (!row) { row = { texto: null, gerado: null, manchetes: null, gerando: agora }; return { meta: { changes: 1 } }; }
        if (row.gerando == null || row.gerando < limite) { row.gerando = agora; return { meta: { changes: 1 } }; }
        return { meta: { changes: 0 } };
      }
      if (sql.includes('SET texto')) { const [texto, gerado, manchetes] = this.args; Object.assign(row, { texto, gerado, manchetes, gerando: null }); return { meta: { changes: 1 } }; }
      if (sql.includes('SET gerando = NULL')) { row.gerando = null; return { meta: { changes: 1 } }; }
      throw Error('SQL inesperado: ' + sql);
    },
    async first() { return row ? { ...row } : null; } });
  return { DB: { prepare: prep }, row: () => row };
}
const agora = Date.now();
const lista = Array.from({ length: 12 }, (_, i) => ({ titulo: 'Manchete ' + i, fonte: i % 2 ? 'Financial Juice' : 'Valor Investe', data: agora - i * 60000, finalScore: 50, link: 'https://x.test/' + i }));
const req = () => new Request('https://mm.test/api/noticias/resumo');
const u = { id: 7, admin: 0 };

test('filtra janela de 12 h, política e repetidas', () => {
  const l = [...lista, { titulo: 'Velha', fonte: 'Suno', data: agora - 13 * 3600000 }, { titulo: 'Eleição', fonte: 'Poder360', data: agora }, { ...lista[0] }];
  const m = manchetesParaResumo(l, agora);
  assert.equal(m.length, 12);
  assert.ok(!m.some((n) => n.titulo === 'Velha' || n.titulo === 'Eleição'));
  assert.ok(m[0].data >= m[1].data);
});

test('gera uma vez e reaproveita por 15 minutos; grátis não acessa', async () => {
  const env = banco(); let chamadas = 0, pedido = '';
  globalThis.fetch = async (url, o) => { chamadas++; pedido = JSON.parse(o.body); return json({ candidates: [{ content: { parts: [{ text: 'Em resumo: **teste**.\n## Brasil\n- Item (Valor Investe)' }] } }] }); };
  const r1 = await (await apiResumoNoticias(req(), env, u, false, async () => lista)).json();
  assert.equal(r1.texto, 'Em resumo: teste.\n## Brasil\n- Item (Valor Investe)');
  assert.equal(r1.manchetes, 12);
  assert.match(pedido.systemInstruction.parts[0].text, /resumo das notícias/);
  assert.match(pedido.contents[0].parts[0].text, /Financial Juice: Manchete 1/);
  const r2 = await (await apiResumoNoticias(req(), env, u, false, async () => lista)).json();
  assert.equal(r2.texto, r1.texto); assert.equal(chamadas, 1);
  const g = await apiResumoNoticias(req(), env, u, true, async () => lista);
  assert.equal(g.status, 403); assert.equal((await g.json()).codigo, 'assinar');
});

test('falha do Google devolve o resumo anterior e solta a trava', async () => {
  const env = banco();
  globalThis.fetch = async () => json({ candidates: [{ content: { parts: [{ text: 'Primeiro' }] } }] });
  await apiResumoNoticias(req(), env, u, false, async () => lista);
  env.row().gerado -= 16 * 60000;
  globalThis.fetch = async () => json({ error: { message: 'limite' } }, 429);
  const r = await (await apiResumoNoticias(req(), env, u, false, async () => lista)).json();
  assert.equal(r.texto, 'Primeiro'); assert.equal(r.antigo, true); assert.equal(env.row().gerando, null);
});

test('outro pedido gerando: recebe o anterior sem chamar o Google', async () => {
  const env = banco();
  globalThis.fetch = async () => json({ candidates: [{ content: { parts: [{ text: 'Primeiro' }] } }] });
  await apiResumoNoticias(req(), env, u, false, async () => lista);
  env.row().gerado -= 16 * 60000; env.row().gerando = Date.now();
  let chamou = false; globalThis.fetch = async () => { chamou = true; return json({}); };
  const r = await (await apiResumoNoticias(req(), env, u, false, async () => lista)).json();
  assert.equal(r.antigo, true); assert.equal(chamou, false);
});

test('sem manchetes suficientes nem resumo anterior: erro claro', async () => {
  const env = banco();
  const r = await apiResumoNoticias(req(), env, u, false, async () => lista.slice(0, 3));
  assert.equal(r.status, 503); assert.match((await r.json()).erro, /manchetes suficientes/); assert.equal(env.row().gerando, null);
});
