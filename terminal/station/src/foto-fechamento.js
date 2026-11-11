// Foto do cartão do fechamento tirada dentro da Cloudflare (navegador na nuvem, binding BROWSER).
// Faz o mesmo que o robô terminal/resumo/resumo.mjs fazia no GitHub: abre a página station/site/fechamento
// com window.__FECHAMENTO já preenchido, espera fontes e cartão e fotografa #card em 1080 px (540 x 2).
// Os arquivos do site saem direto do binding ASSETS (sem passar pelo porteiro nem pela internet);
// só as fontes do Google e o html2canvas da cdnjs vêm de fora, como no navegador de quem abre a página.
import puppeteer from '@cloudflare/puppeteer';

const LOCAL = 'http://mm.local';

export async function fotografarFechamento(env, dados, limiteMs = 45000) {
  if (!env.BROWSER) throw new Error('sem binding BROWSER (navegador na nuvem)');
  const br = await puppeteer.launch(env.BROWSER);
  try {
    const pg = await br.newPage();
    await pg.setViewport({ width: 540, height: 900, deviceScaleFactor: 2 });
    await pg.emulateTimezone('America/Sao_Paulo');
    await pg.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });
    await pg.evaluateOnNewDocument((d) => { window.__FECHAMENTO = d; }, dados);
    await pg.setRequestInterception(true);
    pg.on('request', async (rq) => {
      const u = rq.url();
      if (!u.startsWith(LOCAL + '/')) return rq.continue();
      try {
        const caminho = new URL(u).pathname;
        let r = await env.ASSETS.fetch(new Request('https://assets.local' + caminho));
        // o ASSETS troca /x/index.html por /x/ com redirecionamento: segue uma vez
        if (r.status >= 300 && r.status < 400 && r.headers.get('location')) r = await env.ASSETS.fetch(new Request(new URL(r.headers.get('location'), 'https://assets.local')));
        if (!r.ok) return rq.respond({ status: 404, body: '' });
        const corpo = new Uint8Array(await r.arrayBuffer());
        rq.respond({ status: 200, contentType: r.headers.get('content-type') || 'application/octet-stream', body: corpo });
      } catch (e) { rq.respond({ status: 500, body: '' }); }
    });
    await pg.goto(LOCAL + '/fechamento/index.html', { waitUntil: 'networkidle0', timeout: limiteMs });
    // o cartão só está pronto quando desenha() troca o "Carregando…" pelo conteúdo
    await pg.waitForFunction(() => document.body.classList.contains('robo') && !document.querySelector('#card .car'), { timeout: 15000 });
    await pg.evaluate(() => document.fonts.ready.then(() => true));
    // a logo precisa ter carregado (senão sai o espaço vazio no cabeçalho)
    await pg.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), { timeout: 10000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 500));
    const card = await pg.$('#card');
    if (!card) throw new Error('cartão #card não apareceu');
    const png = await card.screenshot({ type: 'png' });
    return png instanceof Uint8Array ? png : new Uint8Array(png);
  } finally {
    await br.close().catch(() => {});
  }
}
