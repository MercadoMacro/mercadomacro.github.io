/* Página pública /balanca-comercial: balança comercial do Brasil do último mês divulgado, para o Google.
   Dados: terminal/comex/comex.json, gravado pelo robô comex.yml a partir do Comex Stat (MDIC).
   Mesmo visual das páginas de fechamento (fechamento-publico.js). Sem dado, mostra "—". */
import { pagina, resposta } from './fechamento-publico.js';

const SITE = 'https://mercadomacro.com.br';
const DADOS = 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/comex/comex.json';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ok = (v) => v != null && isFinite(v);
const brn = (v, c) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const bi = (v, c = 2) => (ok(v) ? brn(v / 1e9, c) : '—');
const sg = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
const sgBi = (v, c = 2) => (ok(v) ? sg(v) + bi(Math.abs(v), c) : '—');
const pct = (v) => (ok(v) ? `${sg(v)}${brn(Math.abs(v), 1)}%` : '—');
const cls = (v) => (!ok(v) ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const r1 = (v) => (ok(v) ? Math.round(v * 10) / 10 || 0 : null); // arredonda antes do sinal: sem "−0,0"
const varr = (a, b) => (ok(a) && ok(b) && b ? r1((a / b - 1) * 100) : null);
const mesExt = (m) => `${MESES[+m.slice(5) - 1]} de ${m.slice(0, 4)}`;
const mesCurto = (m) => `${MESES[+m.slice(5) - 1].slice(0, 3)}/${m.slice(0, 4)}`;
const vol = (kg) => (!ok(kg) ? '—' : kg >= 1e9 ? `${brn(kg / 1e9, 1)} mi t` : `${brn(Math.round(kg / 1e6), 0)} mil t`);

const CSS_EXTRA = `<style>.t td{font-variant-numeric:tabular-nums}.t th:not(:first-child),.t td:not(:first-child){text-align:right}.rola{overflow-x:auto}.rola .t td,.rola .t th{white-space:nowrap}.barra{display:inline-block;height:8px;border-radius:4px;background:var(--accent);vertical-align:middle;margin-right:8px}</style>`;

function corpo(d) {
  const ms = d.meses.map((x) => ({ ...x, s: ok(x.exp) && ok(x.imp) ? x.exp - x.imp : null }));
  const ult = ms[ms.length - 1], ano = +ult.m.slice(0, 4), mes = +ult.m.slice(5);
  const antM = `${ano - 1}-${String(mes).padStart(2, '0')}`, ant = ms.find((x) => x.m === antM);
  const noAno = (a, k) => ms.filter((x) => x.m.startsWith(a + '-') && +x.m.slice(5) <= mes).reduce((t, x) => t + (ok(x[k]) ? x[k] : 0), 0);
  const ytd = noAno(ano, 's'), ytdAnt = noAno(ano - 1, 's'), expAno = noAno(ano, 'exp'), expAnt = noAno(ano - 1, 'exp');
  const periodo = mes === 1 ? `janeiro de ${ano}` : `janeiro a ${MESES[mes - 1]} de ${ano}`;
  const lead = `O Brasil exportou US$ ${bi(ult.exp)} bilhões e importou US$ ${bi(ult.imp)} bilhões em ${mesExt(ult.m)}, `
    + `com ${ult.s >= 0 ? 'superávit' : 'déficit'} de US$ ${bi(Math.abs(ult.s))} bilhões na balança comercial`
    + `${ant ? `, contra ${ant.s >= 0 ? 'superávit' : 'déficit'} de US$ ${bi(Math.abs(ant.s))} bilhões em ${mesExt(antM)}` : ''}. `
    + `De ${periodo}, o saldo ${ytd >= 0 ? 'positivo' : 'negativo'} soma US$ ${bi(Math.abs(ytd))} bilhões${ytdAnt ? ` (no mesmo período de ${ano - 1}: US$ ${sgBi(ytdAnt)} bilhões)` : ''}.`;
  const card = (n, v, c, cc) => `<div class="card"><div class="n">${esc(n)}</div><div class="v ${cc || ''}">${v}</div>${c ? `<div class="c ${c[1]}">${esc(c[0])}</div>` : ''}</div>`;
  const cards = [
    card('Exportações', `US$ ${bi(ult.exp)} bi`, [`${pct(varr(ult.exp, ant?.exp))} em 12 meses`, cls(varr(ult.exp, ant?.exp))]),
    card('Importações', `US$ ${bi(ult.imp)} bi`, [`${pct(varr(ult.imp, ant?.imp))} em 12 meses`, '']),
    card('Saldo do mês', `US$ ${sgBi(ult.s)} bi`, ant ? [`${mesCurto(antM)}: US$ ${sgBi(ant.s)} bi`, ''] : null, cls(ult.s)),
    card('Saldo no ano', `US$ ${sgBi(ytd)} bi`, ytdAnt ? [`${ano - 1}: US$ ${sgBi(ytdAnt)} bi`, ''] : null, cls(ytd)),
  ].join('');
  const meses12 = ms.slice(-12).reverse().map((x) => `<tr><td>${esc(mesCurto(x.m))}</td><td>${bi(x.exp)}</td><td>${bi(x.imp)}</td><td class="c ${cls(x.s)}">${sgBi(x.s)}</td></tr>`).join('');

  let prod = '';
  if (Array.isArray(d.produtos) && d.produtos.length) {
    const linhas = d.produtos.map((p) => {
      const u = p.meses.find((x) => x.m === ult.m), h = p.meses.find((x) => x.m === antM);
      const soma = (a) => p.meses.filter((x) => x.m.startsWith(a + '-') && +x.m.slice(5) <= mes).reduce((t, x) => t + (x.fob || 0), 0);
      return { nome: p.nome, fob: u?.fob, kg: u?.kg, v: varr(u?.fob, h?.fob), ytd: soma(ano), vy: varr(soma(ano), soma(ano - 1)) };
    }).sort((a, b) => (b.fob || 0) - (a.fob || 0));
    prod = `<h2>Principais commodities exportadas em ${esc(mesExt(ult.m))}</h2>
<div class="rola"><table class="t"><tr><th>Produto</th><th>US$ bi</th><th>Em 12 meses</th><th>Volume</th><th>No ano (US$ bi)</th><th>vs ${ano - 1}</th></tr>
${linhas.map((r) => `<tr><td>${esc(r.nome)}</td><td>${bi(r.fob)}</td><td class="c ${cls(r.v)}">${pct(r.v)}</td><td>${vol(r.kg)}</td><td>${bi(r.ytd, 1)}</td><td class="c ${cls(r.vy)}">${pct(r.vy)}</td></tr>`).join('')}</table></div>
<p class="data">Petróleo bruto, minério de ferro, soja e as demais commodities por posição do Sistema Harmonizado (SH4). Volume em toneladas líquidas.</p>`;
  }

  let dest = '';
  if (Array.isArray(d.paises) && d.paises.length && expAno) {
    const somaP = (p, a) => Object.entries(p.m).filter(([m]) => m.startsWith(a + '-') && +m.slice(5) <= mes).reduce((t, [, v]) => t + v, 0);
    const rows = d.paises.map((p) => ({ p: p.p, v: somaP(p, ano), va: somaP(p, ano - 1) })).sort((a, b) => b.v - a.v).slice(0, 10);
    const max = rows[0]?.v || 1;
    dest = `<h2>Para onde o Brasil exporta (${esc(periodo)})</h2>
<div class="rola"><table class="t"><tr><th>País</th><th>Fatia</th><th>vs ${ano - 1}</th><th>US$ bi</th></tr>
${rows.map((r) => { const f = r.v / expAno * 100, fa = expAnt ? r.va / expAnt * 100 : null, dpp = ok(fa) ? r1(f - fa) : null; return `<tr><td><span class="barra" style="width:${Math.max(3, r.v / max * 80).toFixed(0)}px"></span>${esc(r.p)}</td><td>${brn(f, 1)}%</td><td class="c ${cls(dpp)}">${ok(dpp) ? `${sg(dpp)}${brn(Math.abs(dpp), 1)} p.p.` : '—'}</td><td>${bi(r.v, 1)}</td></tr>`; }).join('')}</table></div>
<p class="data">Fatia de cada país nas exportações brasileiras no ano e a mudança em pontos percentuais contra o mesmo período de ${ano - 1}.</p>`;
  }

  return `${CSS_EXTRA}
<p class="lead">${esc(lead)}</p>
<div class="grid">${cards}</div>
<h2>Exportações, importações e saldo nos últimos 12 meses (US$ bilhões)</h2>
<div class="rola"><table class="t"><tr><th>Mês</th><th>Exportações</th><th>Importações</th><th>Saldo</th></tr>${meses12}</table></div>
${prod}
${dest}
<h2>O que é a balança comercial</h2>
<p>A balança comercial compara o valor de tudo o que o país vende ao exterior (exportações) com o que compra de fora (importações), em dólares, pelo preço no porto de embarque (FOB). Quando as exportações superam as importações, há superávit; no contrário, déficit. Um superávit maior traz mais dólares para o Brasil, o que tende a ajudar o real. O Ministério do Desenvolvimento, Indústria, Comércio e Serviços (MDIC) divulga o resultado do mês fechado na primeira semana do mês seguinte.</p>`;
}

export async function paginaBalanca() {
  let d = null;
  try {
    const r = await fetch(DADOS, { cf: { cacheTtl: 1800, cacheEverything: true } });
    if (r.ok) d = await r.json();
  } catch (e) { d = null; }
  if (!d || !Array.isArray(d.meses) || d.meses.length < 13) {
    return resposta(pagina({ titulo: 'Balança comercial do Brasil | Mercado Macro', descricao: 'Exportações, importações e saldo da balança comercial do Brasil.', canonico: SITE + '/balanca-comercial', h1: 'Balança comercial do Brasil', data: '', corpo: '<p class="lead">Os dados estão indisponíveis agora. Tente de novo em alguns minutos.</p>', rodape: 'Dados do Comex Stat (MDIC/SECEX).' }), 503);
  }
  const ult = d.meses[d.meses.length - 1], s = ult.exp - ult.imp, ext = mesExt(ult.m);
  const titulo = `Balança comercial do Brasil em ${ext}: ${s >= 0 ? 'superávit' : 'déficit'} de US$ ${bi(Math.abs(s))} bi | Mercado Macro`;
  const descricao = `Exportações de US$ ${bi(ult.exp)} bi e importações de US$ ${bi(ult.imp)} bi em ${ext}. Saldo mês a mês, commodities exportadas (petróleo, minério, soja) e principais destinos, com dados do Comex Stat (MDIC).`;
  const at = (d.atualizado || '').slice(0, 10);
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: `Balança comercial do Brasil em ${ext}`, description: descricao, inLanguage: 'pt-BR', mainEntityOfPage: SITE + '/balanca-comercial', ...(at ? { datePublished: at, dateModified: at } : {}), publisher: { '@type': 'Organization', name: 'Mercado Macro', url: SITE } };
  return resposta(pagina({
    titulo, descricao, canonico: SITE + '/balanca-comercial', ld,
    h1: `Balança comercial do Brasil em ${ext}`,
    data: at ? `Dados divulgados pelo MDIC em ${at.split('-').reverse().join('/')}` : '',
    corpo: corpo(d),
    rodape: 'Dados do Comex Stat (MDIC/SECEX), atualizados automaticamente quando o governo divulga um mês novo. Valores em dólares FOB.',
  }));
}
