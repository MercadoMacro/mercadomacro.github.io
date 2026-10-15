// Fechamento do mercado no Telegram (robô .github/workflows/resumo.yml, 18h em dia de pregão).
// Os números vêm do site (/api/robo/fechamento, o mesmo de /fechamento), autorizados pelo token OIDC
// que o GitHub assina para este robô. O cartão é a própria página station/site/fechamento, aberta aqui
// com os números já preenchidos e fotografada em 1080 px. Se a foto falhar, manda só o texto.
// Sem pregão no dia (feriado), não manda nada, a não ser com FORCAR=true.
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const SITE = 'https://mercadomacro.com.br';
const FORCAR = process.env.FORCAR === 'true';
const RAIZ = new URL('../station/site/', import.meta.url).pathname;

async function tokenOIDC() {
  const u = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, t = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!u || !t) throw new Error('sem token OIDC (o robô precisa de id-token: write)');
  const r = await fetch(u + '&audience=mercadomacro-vigia', { headers: { Authorization: 'bearer ' + t } });
  return (await r.json()).value;
}
const TOK = await tokenOIDC();

// antes, traduz as notícias de fora que faltam (Bloomberg, CNBC...) para o cartão poder usá-las
try {
  const t = await fetch(SITE + '/api/robo/traduzir', { headers: { Authorization: 'Bearer ' + TOK }, signal: AbortSignal.timeout(90000) });
  console.log('tradução:', t.status, await t.text());
} catch (e) { console.log('tradução falhou:', e.message); }

const r = await fetch(SITE + '/api/robo/fechamento', { headers: { Authorization: 'Bearer ' + TOK }, signal: AbortSignal.timeout(60000) });
if (!r.ok) throw new Error('fechamento: HTTP ' + r.status + ' ' + (await r.text()));
const dados = await r.json();
console.log(dados.texto);
if (!dados.pregao && !FORCAR) {
  console.log(`\nSem pregão hoje (${dados.data}); último Ibovespa: ${dados.pregaoDia || '—'}. Nada enviado.`);
  process.exit(0);
}

let foto = null;
// em /fechamento o administrador escolhe se o envio automático vai com imagem ou só em texto
if (dados.modo === 'texto') console.log('\nModo escolhido: só texto.');
else try {
  const { chromium } = await import('playwright');
  const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 540, height: 900 }, deviceScaleFactor: 2, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.addInitScript((d) => { window.__FECHAMENTO = d; }, dados);
  const pg = await ctx.newPage();
  // os arquivos do site saem do próprio repositório
  await pg.route('http://mm.local/**', (rt) => {
    const p = normalize(decodeURIComponent(new URL(rt.request().url()).pathname)).replace(/^(\.\.[/\\])+/, '');
    try { rt.fulfill({ status: 200, contentType: TIPOS[extname(p)] || 'application/octet-stream', body: readFileSync(join(RAIZ, p)) }); }
    catch (e) { rt.fulfill({ status: 404, body: '' }); }
  });
  await pg.goto('http://mm.local/fechamento/index.html', { waitUntil: 'networkidle' });
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(500);
  foto = (await pg.locator('#card').screenshot({ type: 'png' })).toString('base64');
  await br.close();
  console.log('\nFoto do cartão:', Math.round(foto.length * 0.75 / 1024), 'KB');
} catch (e) { console.error('foto falhou, vai só o texto:', e.message); }

const envio = await fetch(SITE + '/api/vigia', {
  method: 'POST', headers: { Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json' },
  body: JSON.stringify(foto ? { foto, texto: dados.legenda } : { texto: dados.texto }),
});
const resp = await envio.text();
console.log(resp);
if (!envio.ok || !resp.includes('"ok":true')) process.exit(1);
