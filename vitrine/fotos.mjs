// Fotografa o painel de verdade (com dados reais do momento) para a vitrine da tela de login.
// Roda no GitHub Actions (.github/workflows/vitrine.yml) servindo station/site em http://localhost:8080.
// Saída: station/site/vitrine/fotos/<nome>.jpg
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:8080/';
const OUT = 'station/site/vitrine/fotos';
mkdirSync(OUT, { recursive: true });

const ABAS = [
  ['mercado', 'market-panel', 12000],
  ['mesa', 'mesa-panel', 14000],
  ['mapa', 'heatmap-panel', 16000],
  ['indicadores', 'indicators-panel', 14000],
  ['fundamentos', 'fund-panel', 12000],
  ['calendario', 'calendar-panel', 12000],
  ['calculadora', 'calculator-panel', 8000],
  ['opcoes', 'options-panel', 10000],
  ['noticias', 'news-panel', 10000],
];

const prep = () => {
  try {
    localStorage.setItem('trader_theme', 'dark');
    localStorage.setItem('trader_prefs_v1', JSON.stringify({ mode: 'manual', frases: 'off' }));
  } catch (e) { /* nada */ }
};

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
await ctx.addInitScript(prep);
const pg = await ctx.newPage();
await pg.goto(BASE, { waitUntil: 'domcontentloaded' });
await pg.waitForTimeout(6000);
for (const [nome, aba, espera] of ABAS) {
  try {
    // em telas largas as abas ficam na barra lateral; o clique pelo script funciona nos dois casos
    await pg.evaluate((a) => document.querySelector(`.tab-btn[data-tab="${a}"]`).click(), aba);
    await pg.evaluate(() => window.scrollTo(0, 0));
    await pg.waitForTimeout(espera);
    await pg.evaluate(() => document.querySelectorAll('.toast, #cookie-consent').forEach((e) => e.remove()));
    await pg.screenshot({ path: `${OUT}/${nome}.jpg`, type: 'jpeg', quality: 78 });
    console.log('ok', nome);
  } catch (e) { console.log('falhou', nome, e.message); }
}

// celular
const cel = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
await cel.addInitScript(prep);
const pc = await cel.newPage();
await pc.goto(BASE, { waitUntil: 'domcontentloaded' });
await pc.waitForTimeout(12000);
await pc.screenshot({ path: `${OUT}/celular.jpg`, type: 'jpeg', quality: 75 });
console.log('ok celular');
await br.close();
