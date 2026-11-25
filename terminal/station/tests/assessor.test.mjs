// 24/11/2026: Relatório do Assessor. Leitura do XPerformance (linhas como o pdf.js monta) com dados inventados,
// classes, régua do cenário, score e estresse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { linhasDaPagina, lerXPerformance, resumoDaCarteira, lerCenario, reguaDoCenario, scoreDaCarteira, estresse } from '../site/assessor/xperformance.js';
import { INSTRUCOES_ASSESSOR } from '../src/assessor.js';

const paginas = [[
  'Relatório de', 'Investimentos', 'Conta   Assessor   Data de Referência', '1234567   Signature   Fulano Teste   31/10/2026',
  'PATRIMÔNIO TOTAL BRUTO:   RENTABILIDADE MÊS:', 'R$ 1.000.000,00   1,00%   R$ 10.000,00',
  'Portfólio   1,00%   9,00%   11,00%   25,00%', 'CDI   0,90%   10,00%   12,00%   27,00%',
], [
  'P O S I Ç Ã O D E TA L H A D A D O S AT I V O S',
  'Estratégias   Saldo Bruto   Qtd.   %Aloc.   Rent.   %CDI   Rent.   %CDI   Rent.   %CDI',
  'Pós Fixado   R$ 600.000,00   -   60,00%   0,90%   100,00%   10,00%   100,00%   27,00%   100,00%',
  'Fundo Exemplo FIC FIF RF CP RL   R$ 300.000,00   1000.5   30,00%   0,90%   100,00%   10,00%   100,00%   27,00%   100,00%',
  'Fundo Nome Comprido Crédito Bancário FIF RF',
  'R$ 300.000,00   200   30,00%   0,90%   100,00%   10,00%   100,00%   27,00%   100,00%',
  'RL',
  'Inflação   R$ 100.000,00   -   10,00%   0,50%   50,00%   9,00%   90,00%   20,00%   80,00%',
  'Debênture Exemplo 2033 RF IPCA - Cupom Semestral -',
  'R$ 100.000,00   100   10,00%   0,50%   50,00%   9,00%   90,00%   20,00%   80,00%',
  '9y07m - 08.12.2023',
  'XPerformance - Relatório de Investimentos   Data de referência: 31/10/2026   06',
  'Fundos Listados   R$ 200.000,00   -   20,00%   1,00%   110,00%   8,00%   80,00%   20,00%   70,00%',
  'ABCD11   R$ 200.000,00   2000   20,00%   1,00%   110,00%   8,00%   80,00%   20,00%   70,00%',
  'Legenda',
  'Qualquer   R$ 999,00   9   1,00%',
]];

test('lê o XPerformance: cabeçalho, estratégias, nomes quebrados e caixa', () => {
  const c = lerXPerformance(paginas);
  assert.equal(c.dataRef, '31/10/2026'); assert.equal(c.conta, '1234567'); assert.equal(c.assessor, 'Fulano Teste');
  assert.equal(c.patrimonio, 1000000);
  assert.deepEqual(c.estrategias.map((e) => e.nome), ['Pós Fixado', 'Inflação', 'Fundos Listados']);
  assert.deepEqual(c.ativos.map((a) => a.nome), ['Fundo Exemplo FIC FIF RF CP RL', 'Fundo Nome Comprido Crédito Bancário FIF RF RL', 'Debênture Exemplo 2033 RF IPCA - Cupom Semestral - 9y07m - 08.12.2023', 'ABCD11']);
  assert.equal(c.caixa, 100000); // 1 milhão menos o que está na Posição Detalhada
  assert.equal(c.rent.carteira.m12, 11); assert.equal(c.rent.cdi.ano, 10);
});

test('classes, régua do cenário, score e estresse', () => {
  const r = resumoDaCarteira(lerXPerformance(paginas));
  assert.equal(Math.round(r.pct.pos), 60); assert.equal(Math.round(r.pct.inflacao), 10); assert.equal(Math.round(r.pct.listados), 20); assert.equal(Math.round(r.pct.caixa), 10);
  assert.equal(r.ativos.find((a) => /Debênture/.test(a.nome)).vencimento, 2033);
  const cen = lerCenario({ selic: 14.25, ipca12: 4.8, focusIpca: 4.2, focusSelic: 12 });
  assert.equal(cen.jurosNivel, 'muito altos'); assert.equal(cen.dir, 'queda'); assert.equal(cen.infl, 'acima do teto');
  const rg = reguaDoCenario('moderado', cen);
  assert.ok(rg.faixas.inflacao[0] > 15 && rg.motivos.length >= 2);
  const s = scoreDaCarteira(r, rg.faixas, cen);
  assert.ok(s.total >= 0 && s.total <= 100);
  assert.ok(s.desvios.some((d) => d.classe === 'pos' && d.sobra > 0));
  const e = estresse(r, 2026);
  assert.ok(e.find((x) => x.id === 'sobe2').efeito < 0 && e.find((x) => x.id === 'cai2').efeito > 0);
});

test('linhasDaPagina junta itens da mesma altura e separa colunas', () => {
  const it = (s, x, y, w) => ({ str: s, transform: [1, 0, 0, 8, x, y], width: w });
  const l = linhasDaPagina([it('Pós', 10, 100, 14), it('Fixado', 26, 100, 24), it('R$ 1,00', 120, 100, 30), it('abaixo', 10, 80, 30)]);
  assert.deepEqual(l, ['Pós Fixado   R$ 1,00', 'abaixo']);
});

test('a IA não recebe nome de cliente nem recomenda produto', () => {
  assert.match(INSTRUCOES_ASSESSOR, /não cite nomes de produtos/);
  assert.match(INSTRUCOES_ASSESSOR, /não prometa rentabilidade/);
});
