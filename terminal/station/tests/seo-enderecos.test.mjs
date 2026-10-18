import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';

const SITE = 'https://mercadomacro.com.br';
const paginas = {
  '/calculadora-renda-fixa': '/vitrine/calculadora',
  '/calculadora-juros-compostos': '/vitrine/juros-compostos',
  '/calculadora-aposentadoria': '/vitrine/aposentadoria',
  '/indicadores-hoje': '/vitrine/indicadores',
  '/privacidade': '/vitrine/privacidade',
};
const env = { ASSETS: { fetch: async req => {
  let p = new URL(req.url).pathname;
  if (p === '/vitrine/') p += 'index.html';
  if (!p.split('/').pop().includes('.')) p += '.html';
  try { return new Response(readFileSync(new URL('../site' + p, import.meta.url)), {
    headers: { 'Content-Type': p.endsWith('.css') ? 'text/css' : 'text/html' },
  }); } catch { return new Response('missing', { status: 404 }); }
} } };
const ctx = { waitUntil() {} };
const abrir = (p, method = 'GET', host = SITE) => worker.fetch(new Request(host + p, {
  method, headers: { Accept: 'text/html', 'User-Agent': 'Googlebot' },
}), env, ctx);

test('aliases da home vão direto para a raiz canônica', async () => {
  for (const p of ['/index.html', '/vitrine', '/vitrine/', '/vitrine/index', '/vitrine/index.html']) {
    const r = await abrir(p);
    assert.equal(r.status, 301, p);
    assert.equal(r.headers.get('Location'), SITE + '/');
  }
});
test('aliases das cinco páginas públicas apontam para o endereço principal', async () => {
  for (const [destino, arquivo] of Object.entries(paginas)) {
    for (const p of [arquivo, arquivo + '/', arquivo + '.html', destino + '/', destino + '.html']) {
      const r = await abrir(p);
      assert.equal(r.status, 301, p);
      assert.equal(r.headers.get('Location'), SITE + destino);
    }
  }
});
test('HEAD e www preservam parâmetros e evitam um segundo redirecionamento', async () => {
  const r = await abrir('/vitrine/calculadora.html?utm_source=teste&valor=1000', 'HEAD', 'https://www.mercadomacro.com.br');
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('Location'), SITE + '/calculadora-renda-fixa?utm_source=teste&valor=1000');
});
test('páginas canônicas continuam acessíveis, com canonical correto e sem loop', async () => {
  for (const p of ['/', ...Object.keys(paginas)]) {
    const r = await abrir(p);
    assert.equal(r.status, 200, p);
    assert.equal(r.headers.get('Location'), null);
    assert.ok((await r.text()).includes('rel="canonical" href="' + SITE + p + '"'), p);
  }
});
test('login permanece disponível e os assets da vitrine não redirecionam', async () => {
  const login = await abrir('/entrar?volta=%2Fconta');
  assert.equal(login.status, 200);
  assert.ok((await login.text()).includes('<form'));
  for (const p of ['/vitrine/vitrine.css?v=6', '/vitrine/calc-rf.js?v=5', '/vitrine/fotos/mesa-720.webp']) {
    const r = await abrir(p);
    assert.equal(r.status, 200, p);
    assert.equal(r.headers.get('Location'), null);
  }
});
test('endereço desconhecido continua 404 e POST não vira redirecionamento de navegação', async () => {
  assert.equal((await abrir('/pagina-inexistente')).status, 404);
  const r = await abrir('/vitrine/calculadora', 'POST');
  assert.notEqual(r.status, 301);
});
