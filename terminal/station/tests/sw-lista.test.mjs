// auditoria de 15/11/2026: a lista de arquivos que o sw.js guarda para abrir sem rede precisa ter as mesmas versões
// que o index.html carrega. Versão velha na lista = o celular baixa um arquivo que nunca vai usar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const site = new URL('../site/', import.meta.url);
const idx = readFileSync(new URL('index.html', site), 'utf8');
const sw = readFileSync(new URL('sw.js', site), 'utf8');
const base = (sw.match(/const BASE = \[([\s\S]*?)\];/) || [])[1] || '';
const lista = new Map([...base.matchAll(/'(\/?[\w./-]+)\?v=(\d+)'/g)].map((m) => [m[1], m[2]]));

test('sw.js guarda cada arquivo do index.html na mesma versão', () => {
  const usados = [...idx.matchAll(/(?:src|href)="(\/?[\w./-]+\.(?:js|css))\?v=(\d+)"/g)];
  assert.ok(usados.length > 20);
  for (const [, arq, v] of usados) {
    assert.ok(lista.has(arq), `${arq} falta na lista do sw.js`);
    assert.equal(lista.get(arq), v, `${arq}: sw.js guarda a versão ${lista.get(arq)}, o index.html usa a ${v}`);
  }
});
