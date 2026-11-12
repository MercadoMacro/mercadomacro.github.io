import test from 'node:test';
import assert from 'node:assert/strict';
import { noticiasCache } from '../src/noticias.js';

// cache de mentira (um Map) e feeds de mentira: só a CoinDesk responde, com a manchete que o teste escolher
function preparar() {
  const loja = new Map(); let coletas = 0, manchete = 'Primeira manchete';
  const orig = { fetch: globalThis.fetch, caches: globalThis.caches, now: Date.now };
  globalThis.caches = { default: {
    match: async (rq) => { const v = loja.get(rq.url || String(rq)); return v ? new Response(v.corpo, { headers: v.headers }) : undefined; },
    put: async (rq, resp) => { loja.set(rq.url || String(rq), { corpo: await resp.text(), headers: Object.fromEntries(resp.headers) }); },
  } };
  globalThis.fetch = async (url) => {
    if (new URL(String(url)).host !== 'www.coindesk.com') return new Response('', { status: 404 });
    coletas++;
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss><channel><item><title>${manchete}</title><link>https://www.coindesk.com/${coletas}</link><pubDate>${new Date(orig.now()).toUTCString()}</pubDate></item></channel></rss>`, { headers: { 'Content-Type': 'application/xml' } });
  };
  return { loja, coletas: () => coletas, manchete: (m) => { manchete = m; }, avancar: (ms) => { const t = Date.now() + ms; Date.now = () => t; }, desfazer: () => { globalThis.fetch = orig.fetch; globalThis.caches = orig.caches; Date.now = orig.now; } };
}
const titulos = (r) => r.lista.filter((n) => n.fonte === 'CoinDesk').map((n) => n.titulo);

test('lista vencida: modo rápido responde na hora com a guardada e renova em segundo plano', async () => {
  const t = preparar(); const pendentes = []; const ctx = { waitUntil: (p) => pendentes.push(p) };
  try {
    const a = await noticiasCache(ctx, { rapida: true });
    assert.equal(a.cache, 'MISS'); assert.deepEqual(titulos(a), ['Primeira manchete']);
    const b = await noticiasCache(ctx, { rapida: true });
    assert.equal(b.cache, 'HIT', 'dentro de 2 minutos não coleta de novo');
    const antes = t.coletas();
    t.avancar(5 * 60000); t.manchete('Segunda manchete');
    const c = await noticiasCache(ctx, { rapida: true });
    assert.equal(c.cache, 'STALE'); assert.deepEqual(titulos(c), ['Primeira manchete'], 'devolve a lista guardada sem esperar');
    await Promise.all(pendentes);
    assert.ok(t.coletas() > antes, 'a coleta rodou em segundo plano');
    const d = await noticiasCache(ctx, { rapida: true });
    assert.equal(d.cache, 'HIT'); assert.deepEqual(titulos(d), ['Segunda manchete']);
  } finally { t.desfazer(); }
});

test('lista vencida: sem o modo rápido (Jade, canal, abertura) espera a lista fresca', async () => {
  const t = preparar(); const ctx = { waitUntil() {} };
  try {
    await noticiasCache(ctx);
    t.avancar(5 * 60000); t.manchete('Manchete nova');
    const r = await noticiasCache(ctx);
    assert.equal(r.cache, 'MISS'); assert.deepEqual(titulos(r), ['Manchete nova']);
  } finally { t.desfazer(); }
});
