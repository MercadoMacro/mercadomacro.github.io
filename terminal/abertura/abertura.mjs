// Abertura do mercado no canal público do Telegram (robô .github/workflows/abertura.yml, 9h17 em dia útil).
// Os números vêm do site (/api/robo/abertura, o mesmo de /abertura), autorizados pelo token OIDC que o
// GitHub assina para este robô. As duas páginas (formato do status do WhatsApp) são a própria página
// station/site/abertura, aberta aqui com os números já preenchidos e fotografada em 1080 x 1920.
// Sem canal ligado em /admin, não manda nada.
import { readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const SITE = 'https://mercadomacro.com.br';
const RAIZ = new URL('../station/site/', import.meta.url).pathname;

async function tokenOIDC() {
  const u = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, t = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!u || !t) throw new Error('sem token OIDC (o robô precisa de id-token: write)');
  const r = await fetch(u + '&audience=mercadomacro-vigia', { headers: { Authorization: 'bearer ' + t } });
  return (await r.json()).value;
}
const TOK = await tokenOIDC();

const r = await fetch(SITE + '/api/robo/abertura', { headers: { Authorization: 'Bearer ' + TOK }, signal: AbortSignal.timeout(60000) });
if (!r.ok) throw new Error('abertura: HTTP ' + r.status + ' ' + (await r.text()));
const dados = await r.json();
console.log(dados.texto);
if (!dados.canal) { console.log('\nCanal público não está ligado em /admin. Nada enviado.'); process.exit(0); }

const fotos = [];
try {
  const { chromium } = await import('playwright');
  const TIPOS = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 2, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.addInitScript((d) => { window.__ABERTURA = d; }, dados);
  const pg = await ctx.newPage();
  // os arquivos do site saem do próprio repositório
  await pg.route('http://mm.local/**', (rt) => {
    const p = normalize(decodeURIComponent(new URL(rt.request().url()).pathname)).replace(/^(\.\.[/\\])+/, '');
    try { rt.fulfill({ status: 200, contentType: TIPOS[extname(p)] || 'application/octet-stream', body: readFileSync(join(RAIZ, p)) }); }
    catch (e) { rt.fulfill({ status: 404, body: '' }); }
  });
  await pg.goto('http://mm.local/abertura/index.html', { waitUntil: 'networkidle' });
  await pg.evaluate(() => document.fonts.ready);
  await pg.waitForTimeout(500);
  for (const id of ['#pg1', '#pg2']) fotos.push((await pg.locator(id).screenshot({ type: 'png' })).toString('base64'));
  await br.close();
  console.log('\nFotos:', fotos.map((f) => Math.round(f.length * 0.75 / 1024) + ' KB').join(', '));
} catch (e) { console.error('foto falhou, vai só o texto:', e.message); }

const envio = await fetch(SITE + '/api/vigia', {
  method: 'POST', headers: { Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json' },
  body: JSON.stringify(fotos.length === 2 ? { fotos, texto: dados.legenda, canal: true } : { texto: dados.texto, canal: true }),
});
const resp = await envio.text();
console.log(resp);
if (!envio.ok || !resp.includes('"ok":true')) process.exit(1);
