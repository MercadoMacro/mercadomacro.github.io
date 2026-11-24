// 23/11/2026: o /admin quebrou no teste local por um "\n" dentro de um texto; todo script de página tem que compilar
import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptsDasPaginas } from '../src/index.js';

test('scripts das páginas (admin, conta, assinar...) são JavaScript válido', () => {
  for (const [nome, js] of Object.entries(scriptsDasPaginas())) {
    assert.doesNotThrow(() => new Function(js), nome);
  }
});
