import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('../site/mesa-vinculo.js', import.meta.url), 'utf8'), ctx);
const V = ctx.MMDeskLink;
test('sem nada salvo, tudo dourado e cada cor começa num ativo', () => {
  const e = V.limpa(null);
  assert.equal(V.corDe(e, 'am'), 'ouro'); assert.equal(e.sim.ouro.s, '^BVSP'); assert.equal(e.sim.azul.s, 'BRL=X');
});
test('cores e ativos inválidos são descartados', () => {
  const e = V.limpa({ grupos: { am: 'azul', eu: 'roxo', 'X!': 'azul' }, sim: { ouro: { s: '<script>', n: 'x' }, azul: { s: 'PETR4.SA', n: 'Petrobras' } } });
  assert.equal(e.grupos.am, 'azul'); assert.equal(e.grupos.eu, undefined); assert.equal(e.grupos['X!'], undefined);
  assert.equal(e.sim.ouro.s, '^BVSP'); assert.equal(e.sim.azul.s, 'PETR4.SA');
});
test('a bolinha gira dourado, azul, sem vínculo e volta', () => {
  assert.equal(V.proxima('ouro'), 'azul'); assert.equal(V.proxima('azul'), 'nenhum'); assert.equal(V.proxima('nenhum'), 'ouro');
});
