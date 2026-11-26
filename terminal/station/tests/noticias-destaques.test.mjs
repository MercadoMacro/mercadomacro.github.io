// 25/11/2026: destaques com foco no Brasil e lista de notícias sem o texto completo
import test from 'node:test';
import assert from 'node:assert/strict';
import { ajustarImpacto } from '../src/noticias.js';
import { noticiaLeve } from '../src/index.js';

test('entrevista e "últimas notícias e análises" não viram destaque', () => {
  assert.equal(ajustarImpacto('Venus Williams on WeWard Deal and Her Investor Mindset', 7, 'ALTO').nivel, 'NORMAL');
  assert.equal(ajustarImpacto('Latest news and analysis of oil market for Nov 26', 7, 'ALTO').impactScore, 0);
  assert.equal(ajustarImpacto('Australian Dollar gathers strength above 0.6600 on hotter CPI inflation data', 8, 'ALTO').nivel, 'MEDIO');
  assert.equal(ajustarImpacto('O dólar australiano ganha força acima de 0,6600', 9, 'CRITICO').nivel, 'MEDIO');
  assert.equal(ajustarImpacto('USD/JPY sobe com Fed mais duro', 8, 'ALTO').nivel, 'MEDIO');
  assert.equal(ajustarImpacto('Dólar cai para R$ 5,81 com Fazenda', 8, 'ALTO').nivel, 'ALTO');
  assert.equal(ajustarImpacto('Fed mantém juros e dólar sobe no mundo', 8, 'ALTO').nivel, 'ALTO');
  assert.equal(ajustarImpacto('Latest Oil Market News and Analysis for Nov. 26', 7, 'ALTO').impactScore, 0);
  assert.equal(ajustarImpacto('Petrobras divulga notícias sobre dividendos', 7, 'ALTO').impactScore, 7);
});
test('banco central de fora desce um nível; Brasil e EUA não', () => {
  assert.equal(ajustarImpacto('South Korea interest rate decision due Wednesday', 10, 'CRITICO').nivel, 'ALTO');
  assert.equal(ajustarImpacto('Pound Sterling falls on hawkish BoE', 7, 'ALTO').nivel, 'MEDIO');
  assert.equal(ajustarImpacto('Copom: decisão de juros nesta quarta', 10, 'CRITICO').nivel, 'CRITICO');
  assert.equal(ajustarImpacto('Fed rate decision', 10, 'CRITICO').nivel, 'CRITICO');
  assert.equal(ajustarImpacto('Ibovespa tem alta de 1,58%', 7, 'ALTO').brasil, 1);
});
test('lista leve: texto longo vira o 1º parágrafo com aviso rp', () => {
  const longo = 'Primeiro parágrafo com bastante coisa. '.repeat(5) + '\n\n' + 'Segundo parágrafo. '.repeat(40);
  const n = noticiaLeve({ id: 'a', resumo: longo });
  assert.equal(n.rp, 1);
  assert.ok(n.resumo.length <= 320 && !n.resumo.includes('Segundo'));
  assert.equal(noticiaLeve({ id: 'b', resumo: 'curto' }).rp, undefined);
});
