// Robôs de dados disparados pelo relógio do site (ROBOS_HORA em src/index.js, 11/11/2026)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { robosDaHora } from '../src/index.js';

const em = (iso) => robosDaHora(new Date(iso));

test('dispara na hora marcada e só nos dias certos', () => {
  assert.deepEqual(em('2026-11-11T11:15:00Z').sort(), ['fed.yml', 'leiloes.yml']); // quarta
  assert.deepEqual(em('2026-11-14T11:15:00Z'), []); // sábado
  assert.deepEqual(em('2026-11-14T12:00:00Z').sort(), ['balancos-br.yml', 'posicoes.yml']); // sábado
  assert.deepEqual(em('2026-11-13T21:00:00Z').sort(), ['bea.yml', 'posicoes.yml']); // sexta
  assert.deepEqual(em('2026-11-11T21:00:00Z'), ['bea.yml']);
  assert.deepEqual(em('2026-11-11T11:10:00Z'), []); // fora do quarto de hora
});

test('todo robô disparado aceita a entrada agendado', () => {
  const todos = new Set();
  for (let m = 0; m < 7 * 24 * 60; m += 15) for (const a of robosDaHora(new Date(Date.UTC(2026, 10, 8) + m * 60000))) todos.add(a);
  assert.ok(todos.size >= 12);
  for (const a of todos) {
    const y = readFileSync(new URL('../../../.github/workflows/' + a, import.meta.url), 'utf8');
    assert.match(y, /workflow_dispatch:\n    inputs:\n      agendado:/, a);
  }
});
