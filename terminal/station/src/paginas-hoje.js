/* Páginas públicas para as buscas do dia a dia (27/11/2026, SEO): /dolar-hoje, /ibovespa-hoje e /selic-e-cdi-hoje.
   Cada uma junta o que o site já tem: o valor de agora (o script /js/pg/hoje.js busca a cotação ao vivo), os últimos
   fechamentos guardados (tabela fechamentos), o motivo do movimento (matérias do Jornal) e o convite para o terminal.
   O HTML sai pronto do servidor, para o Google ler sem depender do script. */
import { pagina, resposta, resumoGoogle } from './fechamento-publico.js';

const SITE = 'https://mercadomacro.com.br';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brn = (v, c) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const pct = (v) => (v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : '') + brn(v, 2) + '%');
const cls = (v) => (v == null || !isFinite(v) ? '' : v >= 0 ? 'pos' : 'neg');
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const extenso = (iso) => `${+iso.slice(8, 10)} de ${MESES[+iso.slice(5, 7) - 1]} de ${iso.slice(0, 4)}`;
// mesmas datas de site/app.js (COPOM_DECISIONS): atualizar os dois juntos
const COPOM = ['2026-12-09', '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-16', '2027-08-04', '2027-09-22', '2027-10-27', '2027-12-08'];

export const PAGINAS_HOJE = {
  '/dolar-hoje': {
    chave: 'dolar', simbolo: 'BRL=X', casas: 4, pre: 'R$ ', nome: 'Dólar', img: 'dolar',
    titulo: () => 'Dólar hoje: cotação ao vivo e por que subiu ou caiu | Mercado Macro',
    h1: 'Dólar hoje',
    termo: /d[óo]lar|c[âa]mbio/i,
    texto: 'A cotação do dólar comercial (USD/BRL) de agora, o histórico dos últimos pregões e o que mexeu com o câmbio, explicado pelo Jornal Mercado Macro.',
    faq: [
      ['Qual a diferença entre dólar comercial e dólar turismo?', 'O dólar comercial é a cotação usada entre bancos e empresas, a que aparece nesta página. O dólar turismo, vendido em casas de câmbio para viagens, costuma sair alguns por cento mais caro por causa de custos e impostos.'],
      ['O que faz o dólar subir ou cair?', 'Juros no Brasil e nos EUA, a percepção de risco das contas públicas, o preço das commodities que o Brasil exporta e a entrada ou saída de investidores estrangeiros. O Jornal Mercado Macro explica, todo dia, o motivo do movimento.'],
    ],
  },
  '/ibovespa-hoje': {
    chave: 'ibov', simbolo: '^BVSP', casas: 0, pre: '', suf: ' pontos', nome: 'Ibovespa', img: 'bolsa',
    titulo: () => 'Ibovespa hoje: pontos ao vivo, maiores altas e baixas | Mercado Macro',
    h1: 'Ibovespa hoje',
    termo: /ibovespa|bolsa|b3/i,
    texto: 'O Ibovespa de agora, as ações que mais subiram e caíram no último pregão, o histórico recente e o que movimentou a bolsa brasileira.',
    faq: [
      ['O que é o Ibovespa?', 'É o principal índice da bolsa brasileira (B3). Ele mostra o desempenho médio das ações mais negociadas, como Petrobras, Vale e os grandes bancos.'],
      ['Qual o horário do pregão da B3?', 'O pregão regular de ações vai das 10h às 17h (horário de Brasília) e passa para 18h quando os EUA estão no horário de verão.'],
    ],
  },
  '/selic-e-cdi-hoje': {
    chave: 'selic', nome: 'Selic', img: 'brasilia',
    titulo: (v) => `Selic e CDI hoje: ${v ? brn(v, 2) + '% ao ano' : 'taxa atual'} e o próximo Copom | Mercado Macro`,
    h1: 'Selic e CDI hoje',
    termo: /selic|copom|juros|cdi/i,
    texto: 'A taxa Selic e o CDI em vigor, a data da próxima reunião do Copom e o que o mercado está discutindo sobre os juros no Brasil.',
    faq: [
      ['Qual a diferença entre Selic e CDI?', 'A Selic é a taxa básica de juros definida pelo Copom, do Banco Central. O CDI é a taxa dos empréstimos de um dia entre bancos e fica quase colada na Selic, normalmente 0,10 ponto abaixo. É a referência da maioria dos investimentos de renda fixa, como CDB, LCI e LCA.'],
      ['Quando o Copom decide a Selic?', 'O Copom se reúne oito vezes por ano, a cada cerca de 45 dias. A decisão sai no fim da tarde do segundo dia de reunião.'],
    ],
  },
};

async function ultimosFechamentos(env, n) {
  try {
    const r = await env.DB.prepare('SELECT dia, dados FROM fechamentos ORDER BY dia DESC LIMIT ?').bind(n).all();
    return r.results.map((x) => ({ dia: x.dia, ...JSON.parse(x.dados) }));
  } catch (e) { return []; }
}
async function materias(env, termo, n = 4) {
  try {
    const r = await env.DB.prepare("SELECT slug, titulo, linha_fina, publicado FROM jornal WHERE status = 'publicada' AND publicado > ? ORDER BY publicado DESC LIMIT 40").bind(Date.now() - 14 * 86400000).all();
    return r.results.filter((m) => termo.test(m.titulo + ' ' + m.linha_fina)).slice(0, n);
  } catch (e) { return []; }
}
// CDI anualizado (Banco Central, série 4389), guardado por 6 horas
async function cdiAnual() {
  const chave = new Request(SITE + '/__cdi-anual');
  const salvo = await caches.default.match(chave);
  if (salvo) return parseFloat(await salvo.text());
  try {
    const j = await (await fetch('https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados/ultimos/1?formato=json')).json();
    const v = parseFloat(String(j?.[0]?.valor).replace(',', '.'));
    if (isFinite(v)) { await caches.default.put(chave, new Response(String(v), { headers: { 'Cache-Control': 'public, max-age=21600' } })); return v; }
  } catch (e) { /* sem CDI: usa Selic − 0,10 */ }
  return null;
}

export async function paginaHoje(req, env, p) {
  const cfg = PAGINAS_HOJE[p];
  const fs = await ultimosFechamentos(env, 15);
  const ult = fs[0];
  const nots = await materias(env, cfg.termo);
  const url = SITE + p;
  let valor = null, corpo = '', data = ult ? `Último fechamento: ${extenso(ult.dia)}` : '';
  // "por que mexeu": a matéria mais recente dos últimos 2 dias que fala do assunto no título (senão, na linha fina)
  const recentes = nots.filter((m) => m.publicado > Date.now() - 2 * 86400000);
  const mot = recentes.find((m) => cfg.termo.test(m.titulo)) || recentes[0];
  const motivo = mot ? `<div class="box" style="margin-top:14px"><strong>Por que mexeu:</strong> ${esc(mot.linha_fina)} <a href="/jornal/${esc(mot.slug)}">Ler no Jornal</a></div>` : '';
  const jornal = nots.length ? `<h2>No Jornal Mercado Macro</h2><ul class="nots">${nots.map((m) => `<li><a href="/jornal/${esc(m.slug)}">${esc(m.titulo)}</a> <small>${esc(ddmm(new Date(m.publicado - 3 * 3600000).toISOString().slice(0, 10)))}</small></li>`).join('')}</ul>` : '';
  if (cfg.chave === 'selic') {
    const selic = fs.find((f) => f.juros?.selic != null)?.juros?.selic ?? null;
    const cdi = (await cdiAnual()) ?? (selic != null ? selic - 0.1 : null);
    valor = selic;
    const hoje = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
    const prox = COPOM.find((d) => d >= hoje);
    const pre = ult?.juros?.pre, ipca = ult?.juros?.ipca;
    corpo = `<p class="lead">${esc(cfg.texto)}</p>
<div class="grid">
  <div class="card"><div class="n">Selic (meta)</div><div class="v">${selic != null ? brn(selic, 2) + '% a.a.' : '—'}</div></div>
  <div class="card"><div class="n">CDI</div><div class="v">${cdi != null ? brn(cdi, 2) + '% a.a.' : '—'}</div></div>
  <div class="card"><div class="n">Próximo Copom</div><div class="v">${prox ? ddmm(prox) + '/' + prox.slice(0, 4) : '—'}</div></div>
  ${pre ? `<div class="card"><div class="n">${esc(pre.nome)}</div><div class="v">${brn(pre.taxa, 2)}% a.a.</div></div>` : ''}
  ${ipca ? `<div class="card"><div class="n">${esc(ipca.nome)}</div><div class="v">IPCA + ${brn(ipca.taxa, 2)}%</div></div>` : ''}
</div>${motivo}
<h2>Quanto rende o CDI</h2><p>Com o CDI a ${cdi != null ? brn(cdi, 2) : '—'}% ao ano, R$ 10.000 aplicados num investimento que paga 100% do CDI rendem cerca de ${cdi != null ? 'R$ ' + brn(10000 * (Math.pow(1 + cdi / 100, 1 / 12) - 1), 2) : '—'} por mês, antes do imposto. Simule outros valores e prazos na <a href="/calculadora-renda-fixa">calculadora de renda fixa</a>.</p>
${jornal}`;
    data = selic != null ? `Selic em vigor, segundo o Banco Central${ult ? ` (dado de ${ddmm(ult.dia)})` : ''}` : data;
  } else {
    const k = cfg.chave, c = ult?.cards?.[k];
    valor = c?.v ?? null;
    const hist = fs.filter((f) => f.cards?.[k]?.v != null).slice(0, 10);
    const linhas = hist.map((f) => `<tr><td>${ddmm(f.dia)}</td><td>${cfg.pre}${brn(f.cards[k].v, cfg.casas)}</td><td class="c ${cls(f.cards[k].ch)}">${pct(f.cards[k].ch)}</td></tr>`).join('');
    const extra = k === 'ibov' && ult ? `<div class="duas">
  <div><h2>Maiores altas (${ddmm(ult.dia)})</h2><table class="t"><tr><th>Ação</th><th>Preço</th><th>Variação</th></tr>${(ult.altas || []).map((a) => `<tr><td>${esc(a.t)}</td><td>R$ ${brn(a.v, 2)}</td><td class="c pos">${pct(a.ch)}</td></tr>`).join('') || '<tr><td colspan="3">—</td></tr>'}</table></div>
  <div><h2>Maiores baixas (${ddmm(ult.dia)})</h2><table class="t"><tr><th>Ação</th><th>Preço</th><th>Variação</th></tr>${(ult.baixas || []).map((a) => `<tr><td>${esc(a.t)}</td><td>R$ ${brn(a.v, 2)}</td><td class="c neg">${pct(a.ch)}</td></tr>`).join('') || '<tr><td colspan="3">—</td></tr>'}</table></div>
</div>` : k === 'dolar' && ult?.cards?.euro ? `<h2>Outras moedas no último fechamento</h2><div class="grid"><div class="card"><div class="n">Euro</div><div class="v">R$ ${brn(ult.cards.euro.v, 4)}</div><div class="c ${cls(ult.cards.euro.ch)}">${pct(ult.cards.euro.ch)}</div></div></div>` : '';
    corpo = `<p class="lead">${esc(cfg.texto)}</p>
<div class="grid">
  <div class="card" data-hoje="${esc(cfg.simbolo)}" data-casas="${cfg.casas}" data-pre="${esc(cfg.pre)}"><div class="n">${esc(cfg.nome)} agora</div><div class="v" data-v>${valor != null ? cfg.pre + brn(valor, cfg.casas) : '—'}</div><div class="c ${cls(c?.ch)}" data-c>${pct(c?.ch)}</div><div class="n" data-q style="text-transform:none;letter-spacing:0">${ult ? 'Fechamento de ' + ddmm(ult.dia) : ''}</div></div>
</div>${motivo}
<h2>Últimos pregões</h2><table class="t"><tr><th>Dia</th><th>${esc(cfg.nome)}</th><th>Variação</th></tr>${linhas || '<tr><td colspan="3">—</td></tr>'}</table>
${extra}
${jornal}`;
  }
  corpo += `<h2>Perguntas frequentes</h2>${cfg.faq.map(([q, r]) => `<h3 style="font-size:15px;margin:14px 0 4px">${esc(q)}</h3><p style="margin:0;color:var(--text-2)">${esc(r)}</p>`).join('')}
<p class="data" style="margin-top:22px">Veja também: <a href="/dolar-hoje">Dólar hoje</a> · <a href="/ibovespa-hoje">Ibovespa hoje</a> · <a href="/selic-e-cdi-hoje">Selic e CDI hoje</a> · <a href="/fechamento-do-mercado">Fechamento do mercado</a> · <a href="/jornal">Jornal Mercado Macro</a></p>`;
  const titulo = cfg.titulo(valor);
  const descricao = resumoGoogle(cfg.texto);
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'WebPage', name: titulo, url, description: descricao, inLanguage: 'pt-BR', dateModified: new Date().toISOString(), isPartOf: { '@type': 'WebSite', name: 'Mercado Macro', url: SITE } },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Mercado Macro', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: cfg.h1, item: url }] },
  ] };
  return resposta(pagina({ titulo, descricao, canonico: url, h1: cfg.h1, data, corpo, ld, imagem: `${SITE}/jornal-img/og/${cfg.img}.jpg`,
    script: cfg.chave === 'selic' ? '' : '/js/pg/hoje.js?v=1',
    rodape: 'Cotação ao vivo com atraso de até 15 minutos; fechamentos registrados após o pregão. Selic e CDI do Banco Central.' }));
}

// cotação ao vivo nos cartões marcados com data-hoje (mesma fonte da página inicial)
export const JS_HOJE = `(function(){
  var el = document.querySelector('[data-hoje]'); if (!el) return;
  var s = el.getAttribute('data-hoje'), casas = +el.getAttribute('data-casas') || 2, pre = el.getAttribute('data-pre') || '';
  var VT = 'https://mercadomacro-vitrine.cota-cotacao10.workers.dev', API = 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  function fmt(v, c){ return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }); }
  function ok(r){ if (!r.ok) throw new Error(r.status); return r.json(); }
  function ler(){
    var q = encodeURIComponent(s);
    fetch(VT + '/quotes?symbols=' + q).then(ok).catch(function(){ return fetch(API + '/quotes?mmp=hoje&symbols=' + q).then(ok); }).then(function(d){
      var r = d && d[s] && d[s].chart && d[s].chart.result && d[s].chart.result[0]; if (!r || !r.meta) return;
      var v = r.meta.regularMarketPrice, a = r.meta.chartPreviousClose || r.meta.previousClose; if (v == null) return;
      el.querySelector('[data-v]').textContent = pre + fmt(v, casas);
      if (a) { var ch = (v / a - 1) * 100, c = el.querySelector('[data-c]'); c.textContent = (ch > 0 ? '+' : '') + fmt(ch, 2) + '%'; c.className = 'c ' + (ch >= 0 ? 'pos' : 'neg'); }
      var t = r.meta.regularMarketTime ? new Date(r.meta.regularMarketTime * 1000) : new Date();
      el.querySelector('[data-q]').textContent = 'Atualizado às ' + t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    }).catch(function(){});
  }
  ler(); setInterval(function(){ if (!document.hidden) ler(); }, 60000);
})();`;
