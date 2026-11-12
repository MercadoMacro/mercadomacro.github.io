import test from 'node:test';
import assert from 'node:assert/strict';
import { limparPergunta } from '../src/assistente.js';

test('perguntas da Jade: troca e-mail e números longos, mantém valores e códigos', () => {
  assert.equal(limparPergunta('meu email é joao.silva+x@gmail.com, ajuda'), 'meu email é [e-mail], ajuda');
  assert.equal(limparPergunta('CPF 123.456.789-09 e tel (11) 98765-4321'), 'CPF [número] e tel [número]');
  assert.equal(limparPergunta('tenho R$ 1.000.000 em PETR4 e VALE3 desde 2025'), 'tenho R$ 1.000.000 em PETR4 e VALE3 desde 2025');
  assert.equal(limparPergunta('Selic a 15,00% e o DI jan/27?'), 'Selic a 15,00% e o DI jan/27?');
  assert.equal(limparPergunta('  muitas\n\n linhas  '), 'muitas linhas');
  assert.equal(limparPergunta('x'.repeat(900)).length, 500);
});
