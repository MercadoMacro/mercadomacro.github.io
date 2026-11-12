import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('../site/mesa-janelas.js', import.meta.url), 'utf8'), ctx);
const J = ctx.MMDeskWindows;
const semColisao = (it) => { const l = Object.values(it); for (let i = 0; i < l.length; i++) for (let k = i + 1; k < l.length; k++) if (J.colide(l[i], l[k])) return false; return true; };

test('limpa corrige posições fora da grade e descarta ids inválidos', () => {
  const l = J.limpa({ itens: { am: { x: 11, y: -3, w: 6, h: 2 }, 'X!': { x: 0, y: 0, w: 3, h: 10 }, co: { x: 0, y: 0, w: 40, h: 999 } } }).itens;
  assert.deepEqual({ ...l.am }, { x: 6, y: 0, w: 6, h: 8 });
  assert.equal(l['X!'], undefined);
  assert.deepEqual({ ...l.co }, { x: 0, y: 0, w: 12, h: 240 });
});
test('arruma sobe as janelas para os vazios e nunca sobrepõe', () => {
  const it = J.arruma({ aa: { x: 0, y: 40, w: 6, h: 10 }, bb: { x: 6, y: 90, w: 6, h: 10 }, cc: { x: 0, y: 200, w: 12, h: 10 } }, null);
  assert.equal(it.aa.y, 0); assert.equal(it.bb.y, 0); assert.equal(it.cc.y, 10); assert.ok(semColisao(it));
});
test('arrastar por cima empurra a outra para baixo, e a arrastada fica onde foi posta', () => {
  const base = J.arruma({ aa: { x: 0, y: 0, w: 6, h: 10 }, bb: { x: 6, y: 0, w: 6, h: 10 } }, null);
  const it = J.mover(base, 'bb', -6, 0);
  assert.deepEqual([it.bb.x, it.bb.y], [0, 0]); assert.equal(it.aa.y, 10); assert.ok(semColisao(it));
});
test('redimensionar respeita a borda direita e o tamanho mínimo', () => {
  const it = J.redimensionar({ aa: { x: 8, y: 0, w: 3, h: 10 } }, 'aa', 10, -50);
  assert.equal(it.aa.w, 4); assert.equal(it.aa.h, 8);
});
test('ordem de leitura segue linha e depois coluna', () => {
  assert.deepEqual([...J.ordem({ cc: { x: 0, y: 20, w: 3, h: 8 }, bb: { x: 6, y: 0, w: 3, h: 8 }, aa: { x: 0, y: 0, w: 3, h: 8 } })], ['aa', 'bb', 'cc']);
});
