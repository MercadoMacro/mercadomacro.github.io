/* Fechamento do mercado em página pública (para o Google): /fechamento-do-mercado e /fechamento-do-mercado/AAAA-MM-DD.
   O fechamento de cada pregão fica guardado no D1 (tabela fechamentos), gravado depois das 18h (Brasília):
   pelo cron do worker (18:30), pelo robô das 18h (/api/robo/fechamento) ou na primeira visita à página. */

const SITE = 'https://mercadomacro.com.br';
const BASE = '/fechamento-do-mercado';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brn = (v, c) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const ddmmaaaa = (iso) => `${ddmm(iso)}/${iso.slice(0, 4)}`;
const porExtenso = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return `${DIAS[d.getUTCDay()]}, ${+iso.slice(8, 10)} de ${MESES[+iso.slice(5, 7) - 1]} de ${iso.slice(0, 4)}`; };
const agoraBRT = () => new Date(Date.now() - 3 * 3600000);

async function tabela(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS fechamentos (dia TEXT PRIMARY KEY, dados TEXT NOT NULL, criado INTEGER NOT NULL)').run();
}

// grava o pregão do dia só depois das 18h (ou num dia seguinte); a primeira gravação fica (não muda depois)
export async function salvarFechamento(env, d) {
  if (!d || !d.pregaoDia || d.cards?.ibov?.v == null) return false;
  const b = agoraBRT(), hoje = b.toISOString().slice(0, 10);
  if (d.pregaoDia > hoje || (d.pregaoDia === hoje && b.getUTCHours() < 18)) return false;
  await tabela(env);
  const dados = { ...d };
  delete dados.texto; delete dados.legenda; delete dados.modo;
  const r = await env.DB.prepare('INSERT OR IGNORE INTO fechamentos (dia, dados, criado) VALUES (?, ?, ?)')
    .bind(d.pregaoDia, JSON.stringify(dados), Date.now()).run();
  return !!r.meta?.changes;
}

// se o fechamento de hoje foi gravado sem a taxa do Tesouro, completa na mesma noite (as taxas do dia ficam até a manhã seguinte)
export async function completarJuros(env, jurosTesouro) {
  const b = agoraBRT(), hoje = b.toISOString().slice(0, 10);
  if (b.getUTCHours() < 18) return false;
  await tabela(env);
  const d = await lerDia(env, hoje);
  if (!d || (d.juros?.pre && d.juros?.ipca)) return false;
  const t = await jurosTesouro(env);
  const juros = { ...(d.juros || {}) };
  if (!juros.pre && t.pre) juros.pre = t.pre;
  if (!juros.ipca && t.ipca) juros.ipca = t.ipca;
  if (juros.pre === d.juros?.pre && juros.ipca === d.juros?.ipca) return false;
  await env.DB.prepare('UPDATE fechamentos SET dados = ? WHERE dia = ?').bind(JSON.stringify({ ...d, juros }), hoje).run();
  return true;
}
async function completarJurosAs(env, jurosTesouro) {
  const marca = new Request(SITE + '/__fech-juros');
  if (await caches.default.match(marca)) return;
  await caches.default.put(marca, new Response('1', { headers: { 'Cache-Control': 'public, max-age=600' } }));
  try { await completarJuros(env, jurosTesouro); } catch (e) { /* tenta depois */ }
}

async function lerDia(env, dia) {
  const r = await env.DB.prepare('SELECT dados FROM fechamentos WHERE dia = ?').bind(dia).first();
  return r ? JSON.parse(r.dados) : null;
}
async function listaDias(env, n) {
  const r = await env.DB.prepare('SELECT dia FROM fechamentos ORDER BY dia DESC LIMIT ?').bind(n).all();
  return (r.results || []).map((x) => x.dia);
}

export async function diasParaSitemap(env) {
  try { await tabela(env); return await listaDias(env, 400); } catch (e) { return []; }
}

const pct = (v) => (v == null || !isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${brn(Math.abs(v), 2)}%`);
const cls = (v) => (v == null || !isFinite(v) ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const FMT = {
  ibov: (v) => brn(v, 0) + ' pts', dolar: (v) => 'R$ ' + brn(v, 4), euro: (v) => 'R$ ' + brn(v, 4),
  sp: (v) => brn(v, 2), nasdaq: (v) => brn(v, 2), dow: (v) => brn(v, 2),
  brent: (v) => 'US$ ' + brn(v, 2), ouro: (v) => 'US$ ' + brn(v, 2), btc: (v) => 'US$ ' + brn(v, 0), tnx: (v) => brn(v, 2) + '%',
};
const ORDEM = ['ibov', 'dolar', 'euro', 'sp', 'nasdaq', 'dow', 'brent', 'ouro', 'btc', 'tnx'];
const bi = (mil) => (mil == null ? '—' : `${mil > 0 ? '+' : mil < 0 ? '−' : ''}R$ ${brn(Math.abs(mil) / 1e6, 2)} bi`);
const verbo = (ch, sobe, cai) => (ch > 0 ? `${sobe} ${brn(ch, 2)}%` : ch < 0 ? `${cai} ${brn(-ch, 2)}%` : 'fica estável');

function resumoTitulo(d) {
  const c = d.cards, partes = [];
  if (c.ibov?.ch != null) partes.push(`Ibovespa ${verbo(c.ibov.ch, 'sobe', 'cai')}`);
  if (c.dolar?.v != null) partes.push(`dólar a R$ ${brn(c.dolar.v, 2)}`);
  return partes.join(' e ');
}
function paragrafo(d) {
  const c = d.cards, f = [];
  if (c.ibov?.v != null) f.push(`O Ibovespa fechou em ${brn(c.ibov.v, 0)} pontos${c.ibov.ch != null ? `, ${c.ibov.ch >= 0 ? 'alta' : 'queda'} de ${brn(Math.abs(c.ibov.ch), 2)}%` : ''}.`);
  if (c.dolar?.v != null) f.push(`O dólar terminou cotado a R$ ${brn(c.dolar.v, 4)}${c.dolar.ch != null ? ` (${pct(c.dolar.ch)})` : ''}.`);
  const eua = ['sp', 'nasdaq', 'dow'].filter((k) => c[k]?.ch != null).map((k) => `${c[k].nome} ${pct(c[k].ch)}`);
  if (eua.length) f.push(`Em Nova York: ${eua.join(', ')}.`);
  if (d.altas?.length) f.push(`A maior alta do Ibovespa entre as ações acompanhadas foi ${d.altas[0].t} (${pct(d.altas[0].ch)})${d.baixas?.length ? ` e a maior queda, ${d.baixas[0].t} (${pct(d.baixas[0].ch)})` : ''}.`);
  return f.join(' ');
}

const CSS = `
:root{--bg:#070b14;--surface:#0e1524;--line:#1c2740;--text:#e6ecf5;--text-2:#a8b3c7;--text-3:#8591a8;--accent:#f0b90b;--pos:#16c784;--neg:#ff6b73;color-scheme:dark}
@media (prefers-color-scheme: light){:root{--bg:#f5f7fb;--surface:#fff;--line:#dfe5ee;--text:#0b1220;--text-2:#4a5568;--text-3:#5f6a7d;--accent:#9a6f00;--pos:#0b7a4f;--neg:#c0262f;color-scheme:light}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 Inter,system-ui,-apple-system,sans-serif}
a{color:var(--accent)}main{max-width:860px;margin:0 auto;padding:20px 16px 48px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px}
.top img{height:34px;width:auto}.top .cta{background:var(--accent);color:#111;text-decoration:none;font-weight:700;padding:8px 14px;border-radius:9px;font-size:14px}
h1{font-size:26px;line-height:1.25;margin:4px 0 6px}h2{font-size:17px;margin:28px 0 10px}
.data{color:var(--text-3);font-size:13px;margin:0 0 14px}.lead{color:var(--text-2);margin:0 0 18px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.card .n{font-size:12px;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em}.card .v{white-space:nowrap;font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}
.card .c,.t td.c{font-weight:600;font-variant-numeric:tabular-nums}.pos{color:var(--pos)}.neg{color:var(--neg)}
.duas{display:grid;grid-template-columns:1fr 1fr;gap:14px}@media (max-width:600px){.duas{grid-template-columns:1fr}h1{font-size:22px}}
.t{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.t td,.t th{padding:8px 12px;border-bottom:1px solid var(--line);text-align:left;font-size:14px}.t tr:last-child td{border-bottom:0}.t td:last-child,.t th:last-child{text-align:right}
.t th{font-size:12px;color:var(--text-3);font-weight:600}
ul.nots{margin:0;padding-left:18px}ul.nots li{margin:6px 0}ul.nots small{color:var(--text-3)}
.nav{display:flex;justify-content:space-between;gap:10px;margin:28px 0 0;flex-wrap:wrap}
.dias{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}.dias a{display:inline-block;padding:5px 10px;border:1px solid var(--line);border-radius:8px;text-decoration:none;color:var(--text-2);font-size:13px}
.box{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;margin-top:28px}
footer{color:var(--text-3);font-size:12px;margin-top:28px;border-top:1px solid var(--line);padding-top:14px}
`;

function corpoDia(d) {
  const c = d.cards || {}, j = d.juros || {};
  const cards = ORDEM.filter((k) => c[k]).map((k) => `<div class="card"><div class="n">${esc(c[k].nome)}</div><div class="v">${c[k].v != null ? esc(FMT[k](c[k].v)) : '—'}</div>${k === 'tnx' ? '' : `<div class="c ${cls(c[k].ch)}">${pct(c[k].ch)}</div>`}</div>`).join('');
  const linhas = (l) => l.length ? l.map((a) => `<tr><td>${esc(a.t)}</td><td>R$ ${brn(a.v, 2)}</td><td class="c ${cls(a.ch)}">${pct(a.ch)}</td></tr>`).join('') : '<tr><td colspan="3">—</td></tr>';
  const nots = (d.noticias || []).length
    ? `<h2>Principais notícias do dia</h2><ul class="nots">${d.noticias.map((n) => `<li><a href="${esc(n.link)}" rel="nofollow noopener" target="_blank">${esc(n.t)}</a>${n.f ? ` <small>${esc(n.f)}</small>` : ''}</li>`).join('')}</ul>` : '';
  const fl = d.fluxo;
  return `
<p class="lead">${esc(paragrafo(d))}</p>
<h2>Cotações no fechamento</h2>
<div class="grid">${cards}</div>
<div class="duas">
  <div><h2>Maiores altas do Ibovespa</h2><table class="t"><tr><th>Ação</th><th>Preço</th><th>Variação</th></tr>${linhas(d.altas || [])}</table></div>
  <div><h2>Maiores baixas do Ibovespa</h2><table class="t"><tr><th>Ação</th><th>Preço</th><th>Variação</th></tr>${linhas(d.baixas || [])}</table></div>
</div>
${nots}
<div class="duas">
  <div><h2>Juros</h2><table class="t">
    <tr><td>Selic</td><td>${j.selic != null ? brn(j.selic, 2) + '% a.a.' : '—'}</td></tr>
    <tr><td>${esc(j.pre ? j.pre.nome : 'Tesouro Prefixado')}</td><td>${j.pre ? brn(j.pre.taxa, 2) + '% a.a.' : '—'}</td></tr>
    <tr><td>${esc(j.ipca ? j.ipca.nome : 'Tesouro IPCA+')}</td><td>${j.ipca ? 'IPCA + ' + brn(j.ipca.taxa, 2) + '%' : '—'}</td></tr>
  </table></div>
  <div><h2>Investidor estrangeiro na B3</h2><table class="t">
    <tr><td>No dia${fl ? ` (${ddmm(fl.data)})` : ''}</td><td class="c ${cls(fl?.dia)}">${bi(fl?.dia)}</td></tr>
    <tr><td>No mês</td><td class="c ${cls(fl?.mes)}">${bi(fl?.mes)}</td></tr>
    <tr><td>No ano</td><td class="c ${cls(fl?.ano)}">${bi(fl?.ano)}</td></tr>
  </table>${fl ? `<p class="data">A B3 publica esses dados com atraso; última data disponível: ${ddmmaaaa(fl.data)}.</p>` : ''}</div>
</div>`;
}

function pagina({ titulo, descricao, canonico, h1, data, corpo, ld }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><meta name="description" content="${esc(descricao)}"><link rel="canonical" href="${canonico}">
<meta name="robots" content="index,follow"><meta name="theme-color" content="#070b14"><link rel="icon" href="/icone-192.png">
<meta property="og:type" content="article"><meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${canonico}"><meta property="og:image" content="${SITE}/previa-link-mercado-macro.png?v=2"><meta property="og:locale" content="pt_BR"><meta name="twitter:card" content="summary_large_image">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}
<style>${CSS}</style></head><body><main>
<div class="top"><a href="/" aria-label="Mercado Macro"><picture><source media="(prefers-color-scheme: light)" srcset="/logo-mercado-macro-claro.png"><img src="/logo-mercado-macro-340.png" alt="Mercado Macro" width="340" height="70"></picture></a><a class="cta" href="/entrar">Ver o painel ao vivo</a></div>
<p class="data">${esc(data)}</p>
<h1>${esc(h1)}</h1>
${corpo}
<div class="box"><strong>Acompanhe o mercado ao vivo.</strong> No Mercado Macro você vê cotações em tempo real, mapa de calor, agenda econômica, fluxo do estrangeiro e notícias num só lugar. <a href="/entrar">Pedir acesso</a></div>
<footer>Dados de fontes públicas (Yahoo Finance, Banco Central, Tesouro Direto, B3), registrados após o fechamento. Podem ter atraso ou diferenças em relação à fonte oficial. Conteúdo informativo, não é recomendação de investimento.
<br><a href="${BASE}">Todos os fechamentos</a> · <a href="/indicadores-hoje">Indicadores de hoje</a> · <a href="/calculadora-renda-fixa">Calculadora de renda fixa</a> · <a href="/privacidade">Privacidade</a></footer>
</main></body></html>`;
}

function resposta(s, status = 200) {
  return new Response(s, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' } });
}

// tenta gravar o pregão que falta (no máximo uma vez a cada 15 minutos por servidor da Cloudflare)
async function completar(env, dadosFechamento) {
  const marca = new Request(SITE + '/__fech-tentativa');
  if (await caches.default.match(marca)) return;
  await caches.default.put(marca, new Response('1', { headers: { 'Cache-Control': 'public, max-age=900' } }));
  try { await salvarFechamento(env, await dadosFechamento(env)); } catch (e) { /* tenta depois */ }
}

export async function paginaFechamentoPublico(req, env, ctx, p, dadosFechamento, jurosTesouro, pagina404) {
  await tabela(env);
  const resto = p.slice(BASE.length).replace(/^\/|\/$/g, '');
  if (resto && !/^\d{4}-\d{2}-\d{2}$/.test(resto)) return pagina404();
  const dias = await listaDias(env, 60);
  if (!resto) {
    // índice: o último fechamento completo + a lista dos anteriores
    const b = agoraBRT(), hoje = b.toISOString().slice(0, 10);
    if (!dias.length || (dias[0] < hoje && b.getUTCHours() >= 18) || dias[0] < new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10)) ctx.waitUntil(completar(env, dadosFechamento));
    let ult = dias[0] ? await lerDia(env, dias[0]) : null;
    if (ult && dias[0] === hoje && !(ult.juros?.pre && ult.juros?.ipca)) {
      await completarJurosAs(env, jurosTesouro);
      ult = await lerDia(env, dias[0]);
    }
    const lista = dias.length ? `<h2>Fechamentos anteriores</h2><ul class="dias">${dias.map((d) => `<li><a href="${BASE}/${d}">${ddmmaaaa(d)}</a></li>`).join('')}</ul>` : '';
    const corpo = ult ? `<h2 style="margin-top:8px">Último fechamento: <a href="${BASE}/${dias[0]}">${ddmmaaaa(dias[0])}</a></h2>${corpoDia(ult)}${lista}`
      : '<p class="lead">O primeiro fechamento aparece aqui depois das 18h do próximo pregão.</p>';
    return resposta(pagina({
      titulo: 'Fechamento do mercado hoje: Ibovespa, dólar e bolsas | Mercado Macro',
      descricao: 'Como fechou o mercado: Ibovespa, dólar, bolsas de Nova York, petróleo, ouro, bitcoin, maiores altas e baixas, juros e fluxo do estrangeiro. Atualizado todo dia após as 18h.',
      canonico: SITE + BASE, h1: 'Fechamento do mercado', data: 'Atualizado todo dia útil depois das 18h (horário de Brasília)', corpo,
      ld: { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Fechamento do mercado', url: SITE + BASE, inLanguage: 'pt-BR' },
    }));
  }
  let d = await lerDia(env, resto);
  if (!d) return pagina404();
  if (resto === agoraBRT().toISOString().slice(0, 10) && !(d.juros?.pre && d.juros?.ipca)) {
    await completarJurosAs(env, jurosTesouro);
    d = await lerDia(env, resto) || d;
  }
  const i = dias.indexOf(resto);
  const ant = i >= 0 ? dias[i + 1] : null, prox = i > 0 ? dias[i - 1] : null;
  const nav = `<div class="nav"><span>${ant ? `<a href="${BASE}/${ant}">← Fechamento de ${ddmmaaaa(ant)}</a>` : ''}</span><span>${prox ? `<a href="${BASE}/${prox}">Fechamento de ${ddmmaaaa(prox)} →</a>` : ''}</span></div>`;
  const rt = resumoTitulo(d);
  const titulo = `Fechamento do mercado ${ddmmaaaa(resto)}${rt ? `: ${rt}` : ''} | Mercado Macro`;
  const pub = new Date(resto + 'T21:00:00Z').toISOString();
  return resposta(pagina({
    titulo, descricao: paragrafo(d).slice(0, 300), canonico: `${SITE}${BASE}/${resto}`,
    h1: `Fechamento do mercado em ${ddmmaaaa(resto)}${rt ? `: ${rt}` : ''}`, data: porExtenso(resto), corpo: corpoDia(d) + nav,
    ld: { '@context': 'https://schema.org', '@type': 'Article', headline: `Fechamento do mercado em ${ddmmaaaa(resto)}`, datePublished: pub, dateModified: pub, inLanguage: 'pt-BR',
      mainEntityOfPage: `${SITE}${BASE}/${resto}`, image: `${SITE}/previa-link-mercado-macro.png?v=2`,
      author: { '@type': 'Organization', name: 'Mercado Macro', url: SITE }, publisher: { '@type': 'Organization', name: 'Mercado Macro', logo: { '@type': 'ImageObject', url: `${SITE}/icone-512.png` } } },
  }));
}
