import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('../site/watchlist-table-core.js', import.meta.url), 'utf8'), ctx);
const core = ctx.MMWatchTable;
const rows = [{ symbol: 'B', quote: { value: 10, change: -.5 } }, { symbol: 'A', quote: { value: 20, change: 2 } }, { symbol: 'C', quote: null }];
const symbols = result => Array.from(result, r => r.symbol);
test('ordena preços e variações numericamente sem mudar a lista original', () => {
  assert.deepEqual(symbols(core.sorted(rows, { sort: 'price', direction: 1 })), ['B', 'A', 'C']);
  assert.deepEqual(symbols(core.sorted(rows, { sort: 'change', direction: -1 })), ['A', 'B', 'C']);
  assert.deepEqual(symbols(rows), ['B', 'A', 'C']);
});
test('nulos e NaN ficam no fim nas duas direções, com empate determinístico', () => {
  const items = [...rows, { symbol: 'D', quote: { value: NaN, change: null } }];
  for (const direction of [1, -1]) {
    assert.deepEqual(symbols(core.sorted(items, { sort: 'price', direction })).slice(-2), ['C', 'D']);
  }
  assert.deepEqual(symbols(core.sorted([{ symbol: 'B', quote: { value: 1 } }, { symbol: 'A', quote: { value: 1 } }], { sort: 'price', direction: -1 })), ['A', 'B']);
});
test('preferências inválidas voltam ao padrão e opções removidas são ignoradas', () => {
  const p = core.preferences({ mode: 'radar', sort: 'x', direction: 99, source: 'true', time: 1 });
  assert.equal(p.mode, 'table'); assert.equal(p.sort, 'change'); assert.equal(p.direction, -1);
  assert.equal('source' in p, false); assert.equal('time' in p, false);
  assert.equal(core.preferences({ mode: 'cards', source: true, time: true }).mode, 'cards');
});
test('preserva moeda da fonte e não inventa variação nem horário', () => {
  assert.ok(core.price({ value: 10, currency: 'BRL' }).includes('R$'));
  assert.ok(!core.price({ value: 10 }).includes('R$'));
  assert.equal(core.price({ value: null }), '—'); assert.equal(core.change({ change: null }), '—');
  assert.equal(core.time({}), '—'); assert.ok(core.change({ change: 0 }).includes('0,00%'));
  assert.ok(core.time({ quoteAt: Date.UTC(2026, 9, 16, 20, 30) }).includes('17:30'));
});
test('publicação da tabela exige identidade, isola cotações e apaga no logout', () => {
  const extras = readFileSync(new URL('../site/extras.js', import.meta.url), 'utf8');
  const start = extras.indexOf('  function wlTablePublish()');
  const end = extras.indexOf("  window.addEventListener('mm-watchlist-table-request'", start);
  const events = [];
  const context = vm.createContext({
    window: { __mmLoggingOut: false, dispatchEvent: e => events.push(e.detail) },
    CustomEvent: class { constructor(type, init) { this.detail = init.detail; } },
    wlReady: false, wlUser: 2, wl: [{ s: 'PETR4.SA', n: 'Petrobras' }], nice: s => s,
    wlMemo: { 'PETR4.SA': { value: 30 } }, wlTableOwner: 1, wlTableFresh: new Set(['PETR4.SA']), wlBusy: false,
  });
  vm.runInContext(extras.slice(start, end), context);
  vm.runInContext('wlTablePublish()', context); assert.equal(events.at(-1).rows.length, 0);
  vm.runInContext('wlReady = true; wlTablePublish()', context); assert.equal(events.at(-1).rows[0].quote, null);
  vm.runInContext('wlTableOwner = 2; wlTablePublish()', context); assert.equal(events.at(-1).rows[0].quote.value, 30);
  vm.runInContext('window.__mmLoggingOut = true; wlTablePublish()', context); assert.equal(events.at(-1).user, null); assert.equal(events.at(-1).rows.length, 0);
});
