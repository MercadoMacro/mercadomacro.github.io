// Resumo do fechamento para o Telegram: monta o texto com os mesmos números do site
// (cotações e Tesouro pelo Worker, Selic do Banco Central, fluxo do estrangeiro do fluxo.json).
// Roda pelo .github/workflows/resumo.yml. Sem pregão no dia (feriado), não manda nada.
// Valor que falhar aparece como "—"; nunca inventa número.
import { readFileSync, writeFileSync } from 'node:fs';

const API = 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
const ORIGEM = 'https://station.danilo-nillo.workers.dev';
const FORCAR = process.env.FORCAR === 'true';
const SAIDA = process.env.RESUMO_OUT || 'resumo.txt';

const pega = async (u, origem = true) => {
  const r = await fetch(u, { headers: origem ? { Origin: ORIGEM } : {}, signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
};
const br = (v, casas) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
const pct = (v) => (v == null || !isFinite(v) ? '' : ` (${v > 0 ? '+' : v < 0 ? '−' : ''}${br(Math.abs(v), 2)}%)`);
const hojeBR = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // AAAA-MM-DD
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// ---- cotações
const SIMB = ['^BVSP', 'BRL=X', 'EURBRL=X', '^GSPC', 'BZ=F', '^TNX', 'BTC-USD'];
let cot = {};
try {
  const j = await pega(API + '/quotes?symbols=' + SIMB.map(encodeURIComponent).join(','));
  for (const s of SIMB) {
    const m = j?.[s]?.chart?.result?.[0]?.meta;
    if (!m || typeof m.regularMarketPrice !== 'number') continue;
    const ant = m.chartPreviousClose ?? m.previousClose;
    const dia = m.regularMarketTime ? new Date((m.regularMarketTime + (m.gmtoffset || 0)) * 1000).toISOString().slice(0, 10) : null;
    cot[s] = { v: m.regularMarketPrice, ch: ant ? (m.regularMarketPrice / ant - 1) * 100 : null, dia };
  }
} catch (e) { console.error('cotações:', e.message); }

// feriado ou fim de semana: o Ibovespa não tem pregão de hoje
const ibov = cot['^BVSP'];
if (!FORCAR && (!ibov || ibov.dia !== hojeBR)) {
  console.log(`Sem pregão hoje (${hojeBR}); último Ibovespa: ${ibov?.dia || '—'}. Nada enviado.`);
  writeFileSync(SAIDA, '');
  process.exit(0);
}
const linha = (nome, s, fmt) => `${nome}: ${cot[s] ? fmt(cot[s].v) + pct(cot[s].ch) : '—'}`;

// ---- juros
let selic = '—';
// o SGS do Banco Central às vezes recusa a Cloudflare ou demora; tenta pelo Worker e depois direto, algumas vezes
const SGS = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/1?formato=json';
for (const u of [[API + '/bcb?c=432&q=' + encodeURIComponent('/ultimos/1'), true], [SGS, false], [SGS, false], [API + '/bcb?c=432&q=' + encodeURIComponent('/ultimos/1'), true], [SGS, false]]) {
  try { const j = await pega(...u); const v = parseFloat(j?.[0]?.valor); if (isFinite(v)) { selic = br(v, 2) + '%'; break; } } catch (e) { console.error('selic:', e.message); }
}
let pre = null, ipca = null;
try {
  const j = await pega(API + '/tesouro');
  const ano = (t) => +String(t.vencimento || '').slice(6);
  const maisLongo = (re) => (j.titulos || []).filter((t) => re.test(t.nome) && ano(t)).sort((a, b) => ano(b) - ano(a))[0];
  pre = maisLongo(/^tesouro prefixado \d{4}$/i);
  ipca = maisLongo(/^tesouro ipca\+ \d{4}$/i);
} catch (e) { console.error('tesouro:', e.message); }

// ---- fluxo do estrangeiro (R$ mil no arquivo)
let fluxo = ['Estrangeiro na B3: —'];
try {
  const f = JSON.parse(readFileSync(new URL('../fluxo/fluxo.json', import.meta.url)));
  const ult = f.dias[f.dias.length - 1];
  const bi = (mil) => `${mil > 0 ? '+' : mil < 0 ? '−' : ''}R$ ${br(Math.abs(mil) / 1e6, 2)} bi`;
  const mes = ult.data.slice(0, 7), ano = ult.data.slice(0, 4);
  const noMes = f.meses?.[mes]?.tipos?.estrangeiro?.saldo;
  const noAno = Object.entries(f.meses || {}).filter(([k]) => k.startsWith(ano)).reduce((s, [, m]) => s + (m.tipos?.estrangeiro?.saldo || 0), 0);
  const nomeMes = new Date(ult.data + 'T12:00:00Z').toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
  fluxo = [`Estrangeiro na B3 (dados até ${ddmm(ult.data)}; a B3 publica com atraso)`,
    `No dia: ${bi(ult.tipos.estrangeiro.saldo)}`,
    `Em ${nomeMes}: ${noMes != null ? bi(noMes) : '—'}`,
    `Em ${ano}: ${bi(noAno)}`];
} catch (e) { console.error('fluxo:', e.message); }

const n0 = (v) => br(v, 0), n2 = (v) => br(v, 2), n4 = (v) => br(v, 4);
const texto = [
  `Mercado Macro | Fechamento de ${ddmm(hojeBR)}`,
  '',
  linha('Ibovespa', '^BVSP', (v) => n0(v) + ' pts'),
  linha('Dólar', 'BRL=X', (v) => 'R$ ' + n4(v)),
  linha('Euro', 'EURBRL=X', (v) => 'R$ ' + n4(v)),
  linha('S&P 500', '^GSPC', n2),
  linha('Petróleo Brent', 'BZ=F', (v) => 'US$ ' + n2(v)),
  linha('Bitcoin', 'BTC-USD', (v) => 'US$ ' + n0(v)),
  '',
  'Juros',
  `Selic: ${selic}`,
  `${pre ? pre.nome : 'Tesouro Prefixado'}: ${pre ? n2(pre.taxa) + '% a.a.' : '—'}`,
  `${ipca ? ipca.nome : 'Tesouro IPCA+'}: ${ipca ? 'IPCA + ' + n2(ipca.taxa) + '%' : '—'}`,
  `Treasury 10 anos (EUA): ${cot['^TNX'] ? n2(cot['^TNX'].v) + '%' : '—'}`,
  '',
  ...fluxo,
  '',
  'Painel completo: https://mercadomacro.com.br',
].join('\n');
console.log(texto);
writeFileSync(SAIDA, texto);
