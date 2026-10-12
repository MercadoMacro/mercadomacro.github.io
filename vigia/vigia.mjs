// Vigia do site Mercado Macro: testa o site e as rotas do Worker e abre/atualiza/fecha
// uma issue no GitHub conforme o resultado. Roda pelo .github/workflows/vigia.yml.
// O Worker só responde a pedidos com Origin do site, por isso o cabeçalho abaixo.
import { writeFileSync, appendFileSync } from 'node:fs';

const SITE = 'https://station.danilo-nillo.workers.dev';
const API = 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
const NEWS = 'https://news.cota-cotacao10.workers.dev/';
const HDR = { Origin: SITE, 'User-Agent': 'MercadoMacro-Vigia/1.0', Accept: 'application/json,text/html,*/*' };

const temLista = (x) => Array.isArray(x) && x.length > 0;
const hoje = new Date();
const ymd = (d) => d.toISOString().slice(0, 10);
const daqui = (n) => ymd(new Date(hoje.getTime() + n * 86400000));

// [nome que aparece na issue, caminho, validação do JSON (devolve texto de erro ou nada)]
const ROTAS = [
  ['Site (tela de login)', SITE + '/', null, (t) => (/Acesso restrito/.test(t) ? '' : 'a tela de login não apareceu')],
  ['Cotações (/quotes)', API + '/quotes?symbols=%5EBVSP,BRL=X', (j) => {
    const ok = Object.values(j).filter((v) => v && v.chart && v.chart.result).length;
    return ok ? '' : 'nenhum símbolo veio do Yahoo';
  }],
  ['Gráfico 3M (/history)', API + '/history?symbols=%5EBVSP', (j) => (j['^BVSP'] && !j['^BVSP'].error ? '' : 'Ibovespa sem histórico')],
  ['Agenda econômica (/calendar)', API + '/calendar', (j) => (temLista(j) || temLista(j.events) ? '' : 'agenda vazia')],
  ['Indicadores Brasil (/ind/bundle)', API + '/ind/bundle?g=br', (j) => (j.data && Object.keys(j.data).length ? '' : 'pacote sem dados')],
  ['Indicadores EUA (/ind/bundle)', API + '/ind/bundle?g=us', (j) => (j.data && Object.keys(j.data).length ? '' : 'pacote sem dados')],
  ['FRED (/fred/series)', API + '/fred/series?id=FEDFUNDS&limit=3', (j) => (temLista(j.obs) ? '' : 'série vazia')],
  ['Tesouro Direto (/tesouro)', API + '/tesouro', (j) => {
    if (!temLista(j.titulos)) return 'sem títulos';
    const pre = j.titulos.filter((t) => /prefixado/i.test(t.nome) && /^\d{2}\/\d{2}\/\d{4}$/.test(t.vencimento || ''));
    return pre.length >= 2 ? '' : 'títulos sem data de vencimento (o CSV do Tesouro mudou?)';
  }],
  ['Boletim Focus (/focus)', API + '/focus?full=1', (j) => (temLista(j.anuais) ? '' : 'sem expectativas')],
  ['Minério de ferro (/minerio)', API + '/minerio', (j) => (j.valor > 0 ? '' : 'sem preço')],
  ['CDS Brasil (/cds)', API + '/cds', (j) => (j.valor > 0 ? '' : 'sem valor')],
  ['Banco Central SGS (/bcb)', API + '/bcb?c=432&q=' + encodeURIComponent('/ultimos/1'), (j) => (temLista(j) && j[0].valor ? '' : 'série vazia')],
  ['Dólar reserva Twelve Data (/td)', API + '/td?s=' + encodeURIComponent('USD/BRL'), (j) => (j.cotacoes && j.cotacoes['USD/BRL'] && j.cotacoes['USD/BRL'].valor > 0 ? '' : 'sem cotação')],
  ['IBGE SIDRA (/sidra)', API + '/sidra?q=ipca12', (j) => (temLista(j) && j.length > 1 ? '' : 'tabela vazia')],
  ['Balanços EUA (/finnhub/earnings)', API + `/finnhub/earnings?from=${daqui(0)}&to=${daqui(7)}`, (j) => (j.fonte ? '' : 'resposta sem fonte')],
  ['Fundamentos EUA (/finnhub/fund)', API + '/finnhub/fund?s=AAPL', (j) => (j.fonte ? '' : 'resposta sem fonte')],
  ['Notícias (/rss/finance)', API + '/rss/finance', null, (t) => (t.length > 200 ? '' : 'resposta vazia')],
  ['Notícias (worker de notícias)', NEWS, null, (t) => (t.length > 50 ? '' : 'resposta vazia')],
  ['Fluxo de investidores B3 (GitHub)', 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/fluxo/fluxo.json',
    (j) => (!temLista(j.dias) ? 'sem pregões' : (Date.now() - Date.parse(j.dias[j.dias.length - 1].data)) / 86400000 > 8 ? 'último pregão com mais de 8 dias' : '')],
  ['Fundamentos B3 (GitHub)', 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/fundamentos/index.json',
    (j) => (temLista(j.empresas) ? '' : 'índice sem empresas')]
];

async function testa([nome, url, valJson, valTexto]) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: HDR, signal: AbortSignal.timeout(25000) });
    const texto = await r.text();
    const ms = Date.now() - t0;
    if (!r.ok) {
      let msg = 'HTTP ' + r.status;
      try { const e = JSON.parse(texto).error; if (e) msg += ': ' + e; } catch {}
      return { nome, ok: false, ms, msg };
    }
    let erro = '';
    if (valJson) {
      let j;
      try { j = JSON.parse(texto); } catch { return { nome, ok: false, ms, msg: 'resposta não é JSON' }; }
      erro = j && j.error ? String(j.error) : valJson(j);
    } else if (valTexto) erro = valTexto(texto);
    return { nome, ok: !erro, ms, msg: erro || 'ok' };
  } catch (e) {
    return { nome, ok: false, ms: Date.now() - t0, msg: e.name === 'TimeoutError' ? 'sem resposta em 25 s' : String(e.message || e) };
  }
}

let res = await Promise.all(ROTAS.map(testa));
// quem falhou tem uma segunda chance depois de 45 s (evita alarme por soluço de rede)
const falhas1 = res.map((r, i) => (r.ok ? -1 : i)).filter((i) => i >= 0);
if (falhas1.length) {
  await new Promise((ok) => setTimeout(ok, 45000));
  const de_novo = await Promise.all(falhas1.map((i) => testa(ROTAS[i])));
  falhas1.forEach((i, k) => { res[i] = de_novo[k]; });
}

const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const linhas = res.map((r) => `| ${r.ok ? 'OK' : '**FALHOU**'} | ${r.nome} | ${r.msg.replace(/\|/g, '/').slice(0, 160)} | ${r.ms} ms |`);
const tabela = ['| Situação | Rota | Detalhe | Tempo |', '|---|---|---|---|', ...linhas].join('\n');
const falhas = res.filter((r) => !r.ok);
const resumo = falhas.length
  ? `Vigia de ${quando} (Brasília): ${falhas.length} de ${res.length} verificações falharam.\n\n${tabela}`
  : `Vigia de ${quando} (Brasília): tudo funcionando (${res.length} verificações).\n\n${tabela}`;

console.log(resumo);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumo + '\n');
writeFileSync(process.env.VIGIA_OUT || 'vigia-resultado.json', JSON.stringify({
  quando, falhas: falhas.map((r) => r.nome), resumo
}));
