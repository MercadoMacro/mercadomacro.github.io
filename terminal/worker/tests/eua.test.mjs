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
