import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../site/vitrine/assinatura-ads.js', import.meta.url), 'utf8');
const origem = 'https://mercadomacro.com.br';
function pagina(caminho, storage) {
  const botoes = [], tags = [], chamadas = [];
  let recibo = null;
  const window = {};
  const contexto = {
    window, URL, URLSearchParams, Date, location: new URL(caminho, origem),
    history: { replaceState() {} }, localStorage: {
      getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v)
    },
    document: {
      head: { append: tag => tags.push(tag) }, body: { prepend() {} },
      createElement: () => ({ setAttribute() {}, remove() {}, append: b => botoes.push(b) })
    },
    fetch: async (url, opts) => {
      chamadas.push([url, JSON.parse(opts.body)]);
      return Response.json({ recibo });
    }
  };
  vm.runInNewContext(script, contexto);
  return { window, tags, botoes, chamadas, responder: r => { recibo = r; } };
}
test('visita direta e recusa dispensam a tag, inclusive ao voltar', () => {
  const storage = new Map();
  assert.equal(pagina('/assinar', storage).tags.length, 0);
  const anuncio = pagina('/assinar?gclid=teste', storage);
  assert.equal(anuncio.tags.length, 0);
  anuncio.botoes.find(b => b.textContent === 'Agora não').onclick();
  assert.equal(pagina('/assinar?gclid=teste', storage).tags.length, 0);
});
test('login, checkout e retorno reportam somente o recibo confirmado', async () => {
  const storage = new Map();
  const entrada = pagina('/entrar?volta=%2Fassinar%3Fgclid%3Dteste', storage);
  entrada.botoes.find(b => b.textContent === 'Permitir').onclick();
  assert.equal(entrada.tags.length, 1);
  assert.match(entrada.window.dataLayer[2][2].page_location, /gclid=teste$/);
  const pagamento = pagina('/assinar', storage);
  pagamento.window.mmAdsCheckout('cs_live_exemplo');
  assert.equal(pagamento.window.dataLayer.some(e => e[0] === 'event'), false);
  const volta = pagina('/assinar?cartao=ok', storage);
  volta.responder({ transaction_id: 'in_exemplo', currency: 'BRL', value: 19.9 });
  await volta.tags[0].onload();
  assert.deepEqual(volta.chamadas, [['/api/assinatura/recibo-ads', { sessao: 'cs_live_exemplo' }]]);
  const evento = volta.window.dataLayer.find(e => e[0] === 'event');
  assert.equal(evento[1], 'conversion');
  assert.equal(evento[2].value, 19.9);
  assert.equal(evento[2].transaction_id, 'in_exemplo');
  assert.equal(evento[2].currency, 'BRL');
  assert.equal(evento[2].send_to, 'AW-18587395504/AyIBCNvuwrwdELDLlJ9F');
  evento[2].event_callback();
  const recarga = pagina('/assinar', storage);
  await recarga.tags[0].onload();
  assert.equal(recarga.chamadas.length, 0);
});
