import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogoDe, handleEuaCotacoes, MAX_EUA } from '../eua.js';

test('catálogo: só ações e ETFs dos EUA, sem as cópias _L, com o tipo certo', () => {
  const c = catalogoDe([
    { Symbol: 'AAPL', StatusGroupId: 'US Stocks', Description: 'Apple Inc. (AAPL)', ExtendedName: 'Apple Inc.', SecurityName: 'US Stocks & ETFs' },
    { Symbol: 'SPY', StatusGroupId: 'US Stocks', Description: 'SPDR S&P 500 ETF Trust (SPY)', SecurityName: 'US Stocks & ETFs' },
    { Symbol: 'TQQQ', StatusGroupId: 'US Stocks', Description: 'ProShares UltraPro QQQ (TQQQ)', SecurityName: 'Leveraged ETFs' },
    { Symbol: 'AAPL_L', StatusGroupId: 'US Stocks' }, { Symbol: 'EURUSD', StatusGroupId: 'Forex' }, { Symbol: 'BAD SYM', StatusGroupId: 'US Stocks' },
  ]);
  assert.deepEqual(c.map((x) => [x.s, x.t]), [['AAPL', 'acao'], ['SPY', 'etf'], ['TQQQ', 'etfa']]);
  assert.equal(c[0].n, 'Apple Inc.');
});

test('cotações: recusa pedido vazio, grande demais ou com símbolo inválido sem chamar a fonte', async () => {
  const chamadas = []; const orig = globalThis.fetch; globalThis.fetch = async (u) => { chamadas.push(String(u)); return new Response('[]'); };
  try {
    const pede = (q) => handleEuaCotacoes(new URL('https://x/eua/cotacoes' + q), { waitUntil() {} }, {});
    assert.match(await (await pede('')).text(), /ausente/);
    assert.match(await (await pede('?s=' + Array.from({ length: MAX_EUA + 1 }, (_, i) => 'A' + i).join(','))).text(), /Máximo/);
    assert.match(await (await pede('?s=AAPL,<x>')).text(), /inválido/);
    assert.equal(chamadas.length, 0);
  } finally { globalThis.fetch = orig; }
});

test('fechamento anterior pelo dia de Nova York: à noite no Brasil ainda vale o pregão anterior', async () => {
  const { diaNovaYork, fechamentoAnterior } = await import('../eua.js');
  // 23/11/2026 22h51 em Brasília = 24/11 01h51 UTC = 23/11 20h51 em Nova York
  const agora = Date.parse('2026-11-24T01:51:00Z');
  assert.equal(diaNovaYork(agora), '2026-11-23');
  const bars = [{ Timestamp: Date.parse('2026-11-20T00:00:00Z'), Close: 125.82 }, { Timestamp: Date.parse('2026-11-23T00:00:00Z'), Close: 164.78 }];
  assert.equal(fechamentoAnterior(bars, diaNovaYork(agora)).c, 125.82);
  // na manhã seguinte, antes da abertura (sem a barra do dia 24), a referência é o pregão de 23/11
  assert.equal(fechamentoAnterior(bars, diaNovaYork(Date.parse('2026-11-24T12:00:00Z'))).c, 164.78);
  assert.equal(fechamentoAnterior([], '2026-11-23'), null);
});
