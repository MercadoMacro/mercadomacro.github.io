// 16/11/2026: dentro da página do admin (um texto entre crases), "\s" vira só "s" no navegador. As iniciais das
// pessoas saíam erradas ("Bruno ... Almeida" virava "BT") porque split(/\s+/) passou a cortar na letra s.
// Este teste impede barra simples antes de letra ou símbolo de expressão regular dentro desse texto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

test('página do admin sem barra invertida simples (que some dentro do texto entre crases)', () => {
  const i = src.indexOf('const PAGINA_ADMIN');
  assert.ok(i > 0);
  const ini = src.indexOf('`', i), fim = src.indexOf('`;', ini + 1);
  const corpo = src.slice(ini + 1, fim);
  const ruins = [...corpo.matchAll(/(?<!\\)\\([sdwbSDWB.\-/()[\]?*+|^$])/g)].map((m) => {
    const linha = src.slice(0, ini + 1 + m.index).split('\n').length;
    return `linha ${linha}: ${corpo.slice(Math.max(0, m.index - 30), m.index + 10)}`;
  });
  assert.deepEqual(ruins, []);
});
