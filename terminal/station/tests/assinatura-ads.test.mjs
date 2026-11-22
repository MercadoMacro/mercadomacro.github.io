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
// 22/11/2026: a tag base carrega em toda visita, mas sem cookies (consentimento negado) e sem o clique do anúncio
const liberou = (w) => w.dataLayer.some(e => e[0] === 'consent' && e[1] === 'update');
test('visita direta e recusa: só a tag base, sem cookies e sem o clique', () => {
  const storage = new Map();
  const direta = pagina('/assinar', storage);
  assert.equal(direta.tags.length, 1);
  assert.equal(JSON.stringify([...direta.window.dataLayer[0]]), JSON.stringify(['consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' }]));
  assert.equal(liberou(direta.window), false);
  const anuncio = pagina('/assinar?gclid=teste', storage);
  assert.equal(anuncio.tags.length, 1);
  assert.doesNotMatch(JSON.stringify(anuncio.window.dataLayer), /gclid/);
  anuncio.botoes.find(b => b.textContent === 'Agora não').onclick();
  const volta = pagina('/assinar?gclid=teste', storage);
  assert.equal(liberou(volta.window), false);
  assert.doesNotMatch(JSON.stringify(volta.window.dataLayer), /gclid/);
});
test('login, checkout e retorno reportam somente o recibo confirmado', async () => {
  const storage = new Map();
  const entrada = pagina('/entrar?volta=%2Fassinar%3Fgclid%3Dteste', storage);
  entrada.botoes.find(b => b.textContent === 'Permitir').onclick();
  assert.equal(entrada.tags.length, 1);
  assert.equal(liberou(entrada.window), true);
  assert.match(entrada.window.dataLayer.at(-1)[2].page_location, /gclid=teste$/);
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
