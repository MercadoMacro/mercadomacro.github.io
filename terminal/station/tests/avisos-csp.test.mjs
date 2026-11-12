import test from 'node:test';
import assert from 'node:assert/strict';
import { resumoFalhas } from '../src/index.js';
import { CSP_SO_AVISO, receberAvisoCsp } from '../src/csp.js';

test('resumo de robôs com falha: agrupa por robô e ignora testes de alterações', () => {
  const l = resumoFalhas([
    { name: 'Curva de juros', conclusion: 'failure', event: 'workflow_dispatch', created_at: '2026-11-12T13:14:00Z' },
    { name: 'Curva de juros', conclusion: 'failure', event: 'schedule', created_at: '2026-11-12T10:00:00Z' },
    { name: 'Revisão visual mobile', conclusion: 'failure', event: 'pull_request', created_at: '2026-11-12T12:00:00Z' },
    { name: 'Fluxo', conclusion: 'success', event: 'schedule', created_at: '2026-11-12T12:00:00Z' },
  ]);
  assert.deepEqual(l, ['• Curva de juros: 2 falhas (a última às 10h14)']);
  assert.deepEqual(resumoFalhas([]), []);
});

test('a regra de scripts está só no modo aviso e manda para /api/csp', () => {
  assert.match(CSP_SO_AVISO, /script-src 'self'/);
  assert.match(CSP_SO_AVISO, /report-uri \/api\/csp/);
  assert.doesNotMatch(CSP_SO_AVISO, /script-src[^;]*'unsafe-inline'/);
});

function bancoFalso() {
  const linhas = new Map();
  const st = (sql) => ({
    bind: (...a) => ({ sql, a, run: async () => {} }),
    run: async () => {},
  });
  return {
    linhas,
    prepare: st,
    batch: async (xs) => { for (const x of xs) { const k = x.a.slice(0, 5).join('|'); linhas.set(k, (linhas.get(k) || 0) + 1); } },
  };
}
const pedido = (corpo) => new Request('https://mercadomacro.com.br/api/csp', { method: 'POST', body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo) });

test('aviso da regra de scripts: guarda só origem e página, nada de caminho ou parâmetro', async () => {
  const DB = bancoFalso();
  const r = await receberAvisoCsp(pedido({ 'csp-report': { 'document-uri': 'https://mercadomacro.com.br/?aba=mesa&email=x@y', 'effective-directive': 'connect-src', 'blocked-uri': 'https://query1.finance.yahoo.com/v8/chart/PETR4.SA?x=1' } }), { DB });
  assert.equal(r.status, 204);
  const [k] = [...DB.linhas.keys()];
  assert.match(k, /\|connect-src\|https:\/\/query1\.finance\.yahoo\.com\|\/\|$/);
  assert.doesNotMatch(k, /email|PETR4/);
});

test('formato novo (lista), extensões do navegador e lixo', async () => {
  const DB = bancoFalso();
  await receberAvisoCsp(pedido([
    { type: 'csp-violation', body: { documentURL: 'https://mercadomacro.com.br/planos', effectiveDirective: 'script-src-elem', blockedURL: 'inline', sample: 'console.log(1)' } },
    { type: 'csp-violation', body: { documentURL: 'https://mercadomacro.com.br/', effectiveDirective: 'script-src', blockedURL: 'chrome-extension://abc/x.js' } },
  ]), { DB });
  assert.equal(DB.linhas.size, 1);
  assert.match([...DB.linhas.keys()][0], /script-src-elem\|inline\|\/planos\|console\.log\(1\)/);
  assert.equal((await receberAvisoCsp(pedido('não é json'), { DB })).status, 204);
  assert.equal((await receberAvisoCsp(new Request('https://mercadomacro.com.br/api/csp'), { DB })).status, 405);
});
