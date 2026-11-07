// Assistente com dados de agora e ferramentas (07/11/2026): Google, servidor de dados e GitHub simulados
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ligarAssistente, apiAssistente } from '../src/assistente.js';
import { executar, ligarDados, retrato } from '../src/assistente-dados.js';

const RAIZ = new URL('../../', import.meta.url);
const quotes = (mapa) => Object.fromEntries(Object.entries(mapa).map(([s, [p, a]]) => [s, { chart: { result: [{ meta: { regularMarketPrice: p, chartPreviousClose: a, regularMarketTime: 1794067200, currency: 'BRL' } }] } }]));
const fontes = {
  api: async (rota) => {
    if (rota.startsWith('/quotes')) return quotes({ '^BVSP': [131250, 130144], 'BRL=X': [5.41, 5.43], 'PETR4.SA': [38.2, 37.9] });
    if (rota.startsWith('/calendar')) return [{ date: new Date(Date.now() + 3600000).toISOString(), title: 'CPI m/m', country: 'USD', impact: 'High', forecast: '0.3%', previous: '0.4%' }];
    if (rota.startsWith('/history')) return { '^BVSP': { t: [1790000000, 1790086400, 1790172800], c: [128000, 132000, 131250], off: -10800 } };
    throw new Error('rota ' + rota);
  },
  noticias: async () => [{ titulo: 'Copom mantém Selic', fonte: 'Teste', data: Date.now() - 600000, nivel: 'CRITICO', finalScore: 10 }],
  fluxo: async () => ({ data: '2026-11-05', dia: -120000, mes: 900000, ano: 2000000 }),
};
const fetchOriginal = globalThis.fetch;
function simulaGitHub(url) {
  const m = String(url).match(/\/main\/terminal\/(.+)$/);
  if (!m) return null;
  return new Response(readFileSync(new URL(m[1], RAIZ)), { status: 200 });
}

test('ferramentas leem os arquivos dos robôs e não inventam', async () => {
  globalThis.fetch = async (u) => simulaGitHub(u) || new Response('', { status: 404 });
  ligarDados(fontes);
  const cp = await executar('probabilidades_copom');
  assert.ok(cp.reunioes.length >= 1 && cp.selic_atual > 0);
  const fd = await executar('probabilidades_fed');
  assert.ok(fd.faixa_atual && fd.reunioes.length >= 1, JSON.stringify(fd).slice(0, 200));
  const soma = Object.values(fd.reunioes[0].chances).reduce((a, b) => a + b, 0);
  assert.ok(soma > 98 && soma < 101, 'chances do Fed somam ~100: ' + soma);
  const fu = await executar('fundamentos', { ticker: 'PETR4' });
  assert.match(fu.empresa, /PETROBRAS/);
  assert.equal(fu.cotacao.preco, 38.2);
  assert.match((await executar('fundamentos', { ticker: 'ZZZZ3' })).erro, /não está/);
  const h = await executar('historico', { simbolo: '^BVSP' });
  assert.equal(h.maxima.valor, 132000);
  assert.equal((await executar('cotacoes', { simbolos: ['XPTO11.SA'] }))['XPTO11.SA'], 'sem dado');
  const r = await retrato();
  assert.match(r, /Ibovespa: 131250; \+0\.85%/);
  assert.match(r, /CPI m\/m/);
  assert.match(r, /Copom mantém Selic/);
  globalThis.fetch = fetchOriginal;
});

test('pergunta: Gemini pede cotação, servidor busca e devolve, resposta em texto', async () => {
  const pedidos = [];
  globalThis.fetch = async (u, o) => {
    const g = simulaGitHub(u); if (g) return g;
    if (!String(u).includes('generativelanguage')) return new Response('', { status: 404 });
    const corpo = JSON.parse(o.body); pedidos.push(corpo);
    if (pedidos.length === 1) return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'cotacoes', args: { simbolos: ['PETR4.SA'] } }, thoughtSignature: 'abc' }] } }] }), { status: 200 });
    return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'PETR4 está em R$ 38,20.' }] } }] }), { status: 200 });
  };
  const env = {}; const cfg = { gemini_key: 'k'.repeat(30) };
  ligarAssistente({ json: (o, s = 200) => new Response(JSON.stringify(o), { status: s }), mesmaOrigem: () => true, config: async () => cfg, salvarConfig: async () => {}, dentroDoLimite: async () => true });
  const req = new Request('https://x/api/assistente', { method: 'POST', body: JSON.stringify({ pergunta: 'quanto está PETR4?', historico: [], stream: true }) });
  const r = await apiAssistente(req, env, { id: 1, admin: 0 }, false, fontes);
  assert.equal(await r.text(), 'PETR4 está em R$ 38,20.');
  assert.ok(pedidos[0].tools[0].functionDeclarations.some((f) => f.name === 'fundamentos'));
  assert.match(pedidos[0].contents.at(-1).parts[0].text, /Dados do terminal agora/);
  const volta = pedidos[1].contents;
  assert.equal(volta.at(-2).parts[0].thoughtSignature, 'abc', 'devolve a assinatura do modelo');
  assert.equal(volta.at(-1).parts[0].functionResponse.response.resultado['PETR4.SA'].preco, 38.2);
  globalThis.fetch = fetchOriginal;
});
