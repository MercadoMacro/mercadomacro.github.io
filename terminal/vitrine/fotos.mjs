// Fotografa o painel de verdade (com dados reais do momento) para a vitrine da tela de login.
// Roda no GitHub Actions (.github/workflows/vitrine.yml) servindo station/site em http://localhost:8080.
// Saída: station/site/vitrine/fotos/<nome>.jpg e <nome>-720.webp (versão menor para celular)
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const BASE = 'http://localhost:8080/';
const OUT = 'terminal/station/site/vitrine/fotos';
mkdirSync(OUT, { recursive: true });

const ABAS = [
  ['mercado', 'market-panel', 12000],
  ['mesa', 'mesa-panel', 14000],
  ['mapa', 'heatmap-panel', 16000],
  ['indicadores', 'indicators-panel', 35000],
  ['fundamentos', 'fund-panel', 12000],
  ['calendario', 'calendar-panel', 12000],
  // Análises: a foto mostra a posição dos especuladores (CFTC), que fica abaixo do botão da análise avançada
  ['analises', 'analysis-panel', 12000, '#ana-sec-cot'],
  ['calculadora', 'calculator-panel', 8000],
  ['opcoes', 'options-panel', 10000],
  ['noticias', 'news-panel', 10000],
];

// passe do servidor de dados (29/10/2026 em diante o servidor recusa pedidos sem passe): troca o token OIDC
// do GitHub (id-token no vitrine.yml) por um passe de 10 min em /api/robo/passe e entrega ao painel no lugar
// do /api/passe, que este servidor estático não tem. Fora do GitHub (teste local), segue sem passe.
let passe = '', passeAte = 0;
async function passeRobo() {
  if (passe && Date.now() < passeAte) return passe;
  const { ACTIONS_ID_TOKEN_REQUEST_URL: u, ACTIONS_ID_TOKEN_REQUEST_TOKEN: t } = process.env;
  if (!u || !t) return '';
  try {
    const oidc = await (await fetch(u + '&audience=mercadomacro-passe', { headers: { Authorization: 'bearer ' + t }, signal: AbortSignal.timeout(20000) })).json();
    const r = await fetch('https://mercadomacro.com.br/api/robo/passe', { method: 'POST', headers: { Authorization: 'Bearer ' + oidc.value }, signal: AbortSignal.timeout(20000) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.passe) { passe = j.passe; passeAte = Date.now() + 7 * 60000; }
    else console.log('passe do robô recusado: HTTP ' + r.status);
  } catch (e) { console.log('sem passe do robô: ' + e.message); }
  return passe;
}
const darPasse = (ctx) => ctx.route('**/api/passe', async (rota) => {
  const p = await passeRobo();
  if (!p) return rota.fulfill({ status: 503, body: '' });
  return rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ passe: p, exp: Math.floor(passeAte / 1000) + 120 }) });
});
// tela com erro de dados não vira foto: fica a foto anterior
const ERRO_DADOS = /Não foi possível atualizar|HTTP 4\d\d|HTTP 5\d\d|Gráfico indisponível agora/;

const prep = () => {
  try {
    localStorage.setItem('trader_theme', 'dark');
    localStorage.setItem('trader_prefs_v1', JSON.stringify({ mode: 'manual', frases: 'off' }));
  } catch (e) { /* nada */ }
};

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
await ctx.addInitScript(prep);
await darPasse(ctx);
const pg = await ctx.newPage();
await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
await pg.waitForTimeout(6000);
for (const [nome, aba, espera, rolar] of ABAS) {
  try {
    // em telas largas as abas ficam na barra lateral; o clique pelo script funciona nos dois casos
    await pg.evaluate((a) => document.querySelector(`.tab-btn[data-tab="${a}"]`).click(), aba);
    await pg.evaluate(() => window.scrollTo(0, 0));
    if (rolar) await pg.evaluate((q) => document.querySelector(q).scrollIntoView({ block: 'start' }), rolar);
    await pg.waitForTimeout(espera);
    if (rolar) await pg.evaluate((q) => document.querySelector(q).scrollIntoView({ block: 'start' }), rolar);
    await pg.waitForTimeout(rolar ? 1500 : 0);
    await pg.evaluate(() => document.querySelectorAll('.toast, #cookie-consent').forEach((e) => e.remove()));
    const erro = await pg.evaluate((re) => { const m = document.body.innerText.match(new RegExp(re)); return m ? m[0] : ''; }, ERRO_DADOS.source);
    if (erro) { console.log('pulou', nome, '(tela com erro de dados: ' + erro + ')'); continue; }
    await pg.screenshot({ path: `${OUT}/${nome}.jpg`, type: 'jpeg', quality: 78 });
    console.log('ok', nome);
  } catch (e) { console.log('falhou', nome, e.message); }
}

// celular
const cel = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
await cel.addInitScript(prep);
await darPasse(cel);
const pc = await cel.newPage();
await pc.goto(BASE, { waitUntil: 'domcontentloaded' });
await pc.waitForTimeout(12000);
await pc.screenshot({ path: `${OUT}/celular.jpg`, type: 'jpeg', quality: 75 });
console.log('ok celular');

// versões de 720 px em webp para telas pequenas (o próprio navegador redimensiona)
const conv = await (await br.newContext()).newPage();
for (const [nome] of ABAS) {
  try {
    const b64 = readFileSync(`${OUT}/${nome}.jpg`).toString('base64');
    const webp = await conv.evaluate(async (src) => {
      const im = new Image(); im.src = src; await im.decode();
      const c = document.createElement('canvas'); c.width = 720; c.height = Math.round(im.height * 720 / im.width);
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, c.width, c.height);
      return c.toDataURL('image/webp', 0.8).split(',')[1];
    }, 'data:image/jpeg;base64,' + b64);
    writeFileSync(`${OUT}/${nome}-720.webp`, Buffer.from(webp, 'base64'));
    console.log('ok', nome, '720');
  } catch (e) { console.log('falhou', nome, '720', e.message); }
}
await br.close();
