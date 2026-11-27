import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

test('somente a Macro 12 autenticada pode abrir em iframe da mesma origem', async () => {
  let assets = 0;
  const env = {
    DB: {
      batch: async () => [],
      prepare: sql => ({
        all: async () => ({ results: [] }),
        run: async () => ({}),
        bind() { return this; },
        first: async () => sql.includes("u.status = 'ativo'") ? { id: 1, admin: 1 } : null,
      }),
    },
    ASSETS: {
      fetch: async () => {
        assets++;
        return new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } });
      },
    },
  };
  const abrir = (path, autenticado) => worker.fetch(new Request('https://mercadomacro.com.br' + path, {
    headers: autenticado ? { Cookie: 'mm_s=' + 'a'.repeat(64), 'Sec-Fetch-Dest': 'iframe' } : { 'Sec-Fetch-Dest': 'iframe' },
  }), env, { waitUntil() {} });

  assert.equal((await abrir('/hp12.html?embed=1', false)).status, 401);
  assert.equal(assets, 0);
  for (const path of ['/hp12.html?embed=1', '/hp12?embed=1', '/outra.html']) {
    const response = await abrir(path, true);
    const macro12 = path.startsWith('/hp12');
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('X-Frame-Options'), macro12 ? 'SAMEORIGIN' : 'DENY', path);
    // 26/11/2026: a regra de scripts passou a valer e vem num segundo cabeçalho (o navegador aplica os dois)
    const csp = response.headers.get('Content-Security-Policy');
    assert.ok(csp.startsWith(macro12 ? "frame-ancestors 'self'" : "frame-ancestors 'none'"), path);
    assert.match(csp, /script-src 'self'/, path);
    assert.equal(response.headers.get('Content-Security-Policy-Report-Only'), null, path);
  }
});
