import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('../site/mesa-layout.js',import.meta.url),'utf8'),ctx);
const layout=ctx.MMDeskLayout;
test('remove IDs desconhecidos e duplicados e inclui novos blocos no fim',()=>{
  const p=layout.normalize({order:['news','news','inexistente'],hidden:['co','co','fake']});
  assert.equal(p.order[0],'news');assert.equal(p.order.length,12);assert.equal(new Set(p.order).size,12);assert.deepEqual(Array.from(p.hidden),['co']);
});
test('ocultar e mostrar preserva a ordem e não altera a preferência original',()=>{
  const p=layout.normalize(null),hidden=layout.toggle(p,'crypto');
  assert.equal(hidden.hidden.includes('crypto'),true);assert.equal(p.hidden.length,0);
  assert.equal(layout.toggle(hidden,'crypto').hidden.length,0);assert.deepEqual(Array.from(hidden.order),Array.from(p.order));
});
test('as setas respeitam limites e arrastar insere antes do destino',()=>{
  const p=layout.normalize(null);assert.equal(layout.move(p,'crypto',-1).order[0],'crypto');
  assert.equal(layout.move(p,'cards',-1).order[0],'cards');
  assert.equal(layout.before(p,'news','crypto').order[0],'news');
  assert.equal(layout.before(p,'news','fake').order.at(-1),'news');
});
test('preferências sobrevivem ao salvamento e opções inválidas voltam ao padrão',()=>{
  const p=layout.toggle(layout.before(null,'curve','crypto'),'news');
  const restored=layout.normalize(JSON.parse(JSON.stringify(p)));
  assert.equal(restored.order[0],'curve');assert.equal(restored.hidden.includes('news'),true);
  assert.equal(layout.normalize({order:'x',hidden:null}).order.length,12);
});
