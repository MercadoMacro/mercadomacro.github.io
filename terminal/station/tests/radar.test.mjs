import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('../site/radar-core.js', import.meta.url), 'utf8'), ctx);
const { analyse, summary } = ctx.MMWatchRadar;
const now = Date.UTC(2026, 9, 16, 20);
function fixture() {
  const t = [], c = []; let v = 100;
  for (let i = 65; i >= 1; i--) { t.push(now / 1000 - i * 86400); v *= i % 2 ? 1.01 : .99; c.push(v); }
  return { h: { t, c, off: 0 }, q: { fresh: true, value: v * 1.04, referenceClose: v, quoteAt: now } };
}
test('compara com até 60 retornos anteriores e detecta alta e queda', () => {
  const { h, q } = fixture(); const r = analyse(q, h, now);
  assert.equal(r.status, 'unusual'); assert.equal(r.count, 60); assert.ok(Math.abs(r.change - 4) < 1e-8);
  q.value = h.c.at(-1) * .96; assert.equal(analyse(q, h, now).status, 'unusual');
});
test('não inclui a barra atual nem qualquer barra futura no limiar', () => {
  const { h, q } = fixture(); const before = analyse(q, h, now);
  h.t.push(now / 1000, now / 1000 + 86400); h.c.push(q.value, 999);
  const after = analyse(q, h, now); assert.equal(after.threshold, before.threshold); assert.equal(after.change, before.change);
});
test('não confunde variação normal com sinal e permite histórico de 40 retornos', () => {
  const { h, q } = fixture(); h.t = h.t.slice(-41); h.c = h.c.slice(-41); q.value = h.c.at(-1) * 1.001;
  assert.equal(analyse(q, h, now).status, 'normal'); h.t.shift(); h.c.shift(); assert.equal(analyse(q, h, now).status, 'history');
});
test('rejeita cache não confirmado, cotação sem horário, antiga ou futura', () => {
  const { h, q } = fixture();
  for (const bad of [{ ...q, fresh: false }, { ...q, quoteAt: null }, { ...q, quoteAt: now - 97 * 3600000 }, { ...q, quoteAt: now + 3600000 }, { ...q, value: null }]) assert.equal(analyse(bad, h, now).status, 'quote');
});
test('rejeita desordem, duplicação, preços inválidos, lacunas e saltos', () => {
  for (const kind of ['order', 'zero', 'duplicate', 'jump', 'gap']) {
    const { h, q } = fixture();
    if (kind === 'order') h.t[20] = h.t[19] - 1;
    if (kind === 'duplicate') h.t[20] = h.t[19] + 1;
    if (kind === 'zero') h.c[20] = 0;
    if (kind === 'jump') h.c[20] *= 2;
    if (kind === 'gap') { h.t.splice(20, 10); h.c.splice(20, 10); }
    assert.equal(analyse(q, h, now).status, 'history', kind);
  }
});
test('resumo usa somente sinais selecionados e carrega fonte e horário', () => {
  const { h, q } = fixture(); const r = { ...analyse(q, h, now), symbol: 'PETR4.SA' };
  const text = summary([r, { status: 'normal', symbol: 'NAO' }]);
  assert.ok(text.includes('PETR4')); assert.ok(text.includes('Yahoo Finance')); assert.ok(text.includes('Brasília')); assert.ok(!text.includes('NAO'));
  assert.equal(summary([]), 'Nenhum movimento incomum selecionado.');
});
test('cache de histórico com referência diferente não gera sinal', () => {
  const { h, q } = fixture(); q.referenceClose *= 1.02;
  assert.equal(analyse(q, h, now).status, 'history');
});
test('o radar não publica lista sem identidade ou durante logout e não valida cache de outra conta', () => {
  const extras = readFileSync(new URL('../site/extras.js', import.meta.url), 'utf8');
  const start = extras.indexOf('  function wlRadarPublish()');
  const end = extras.indexOf("  window.addEventListener('mm-watchlist-radar-request'", start);
  const events = [];
  const context = vm.createContext({
    window: { __mmLoggingOut: false, dispatchEvent: e => events.push(e.detail) },
    CustomEvent: class { constructor(type, init) { this.detail = init.detail; } },
    wlReady: false, wlUser: 2, wl: [{ s: 'PETR4.SA', n: 'Petrobras' }], nice: s => s,
    wlMemo: { 'PETR4.SA': { value: 30, quoteAt: now, referenceClose: 29 } },
    wlRadarOwner: 1, wlRadarFresh: new Set(['PETR4.SA']), wl3: null, wlBusy: false, wl3Busy: false,
  });
  vm.runInContext(extras.slice(start, end), context);
  vm.runInContext('wlRadarPublish()', context); assert.equal(events.at(-1).rows.length, 0);
  vm.runInContext('wlReady = true; wlRadarPublish()', context);
  assert.equal(events.at(-1).rows[0].quote.fresh, false);
  vm.runInContext('wlRadarOwner = 2; wlRadarPublish()', context);
  assert.equal(events.at(-1).rows[0].quote.fresh, true);
  vm.runInContext('window.__mmLoggingOut = true; wlRadarPublish()', context);
  assert.equal(events.at(-1).rows.length, 0); assert.equal(events.at(-1).user, null);
});
