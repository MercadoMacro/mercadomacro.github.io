/* Dados do terminal para o Assistente (07/11/2026, pedido do Severino):
   1. retrato(): cotações, agenda e manchetes do momento, que vão junto com cada pergunta ao Gemini;
   2. FERRAMENTAS: funções que o Gemini pode chamar sozinho (cotações, histórico, probabilidades do Fed e do Copom,
      fundamentos de empresas da B3, fluxo do estrangeiro, notícias e agenda).
   Tudo vem das mesmas fontes do site (servidor de dados shrill-meadow, arquivos dos robôs no GitHub, cache de notícias).
   Valor que falhar volta como "sem dado"; nada é inventado. */
let api = null, noticias = null, fluxo = null, resumo = null, perfilAtual = null, busca = null;
export function ligarDados(u) { ({ api, noticias, fluxo } = u); resumo = u.resumo || null; perfilAtual = u.perfil || null; busca = u.busca || null; }

// perfil que o navegador manda (nível, watchlist com os nomes de cada ativo, assuntos frequentes): só o que é seguro
export function limpaPerfil(p) {
  if (!p || typeof p !== 'object') return null;
  const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u001f"]/g, ' ').trim().slice(0, n);
  const nivel = ['iniciante', 'intermediario', 'avancado'].includes(p.nivel) ? p.nivel : 'intermediario';
  const temas = (Array.isArray(p.temas) ? p.temas : []).map((t) => txt(t, 30)).filter(Boolean).slice(0, 6);
  const watchlist = (Array.isArray(p.watchlist) ? p.watchlist : []).filter((w) => w && SYMBOL_RE.test(String(w.s || ''))).slice(0, 30)
    .map((w) => ({ s: String(w.s), nome: txt(w.nome || w.s, 40), termos: (Array.isArray(w.termos) ? w.termos : []).map((t) => txt(t, 30)).filter((t) => t.length >= 2).slice(0, 6) }));
  return { nivel, temas, watchlist };
}
const NIVEL_TXT = {
  iniciante: 'iniciante: use palavras simples, explique cada termo técnico na primeira vez e dê um exemplo curto',
  intermediario: 'intermediário: pode usar os termos comuns do mercado, explicando os menos conhecidos',
  avancado: 'avançado: seja direto, use o jargão do mercado e foque em números e implicações',
};
export function textoPerfil(p) {
  if (!p) return '';
  const l = ['Sobre quem pergunta (preferências guardadas no navegador dele):', `- Nível: ${NIVEL_TXT[p.nivel]}.`];
  if (p.watchlist.length) l.push('- Watchlist: ' + p.watchlist.map((w) => w.nome !== w.s.replace(/\.SA$/, '') ? `${w.s} (${w.nome})` : w.s).join(', ') + '. Quando fizer sentido, relacione a resposta com esses ativos.');
  if (p.temas.length) l.push('- Assuntos que ele mais pergunta: ' + p.temas.join(', ') + '.');
  return l.join('\n');
}

const RAW = 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/';
const SYMBOL_RE = /^[\^A-Za-z0-9.=\-]{1,20}$/;
const num = (v, d = 2) => (v == null || !isFinite(v) ? null : +(+v).toFixed(d));
const brt = (t) => new Date(t).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const diaBR = (t = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const hojeNY = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

// pequeno cache por instância (evita repetir o mesmo pedido a cada pergunta)
const memo = new Map();
async function guardado(chave, ms, fn) {
  const c = memo.get(chave);
  if (c && Date.now() - c.t < ms) return c.v;
  const v = await fn();
  if (memo.size > 200) memo.clear();
  memo.set(chave, { t: Date.now(), v });
  return v;
}
const raw = (arq, ms = 10 * 60000) => guardado('raw:' + arq, ms, async () => {
  const r = await fetch(RAW + arq, { cf: { cacheTtl: 300 } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
});

// ---------------- cotações ----------------
function lerMeta(j, s) {
  const m = j?.[s]?.chart?.result?.[0]?.meta;
  if (!m || typeof m.regularMarketPrice !== 'number') return null;
  const ant = m.chartPreviousClose ?? m.previousClose;
  return {
    preco: num(m.regularMarketPrice, 4),
    variacao_pct: ant ? num((m.regularMarketPrice / ant - 1) * 100, 2) : null,
    fechamento_anterior: ant != null ? num(ant, 4) : null,
    moeda: m.currency || null,
    horario: m.regularMarketTime ? brt(m.regularMarketTime * 1000) + ' (Brasília)' : null,
  };
}
async function cotacoes(simbolos) {
  const s = [...new Set((simbolos || []).map((x) => String(x).trim()).filter((x) => SYMBOL_RE.test(x)))].slice(0, 20);
  if (!s.length) return { erro: 'nenhum símbolo válido' };
  const j = await guardado('q:' + s.sort().join(','), 45000, () => api('/quotes?symbols=' + s.map(encodeURIComponent).join(',')));
  const out = {};
  for (const x of s) out[x] = lerMeta(j, x) || 'sem dado';
  return out;
}

// ---------------- retrato do momento ----------------
const RETRATO_ATIVOS = [
  ['^BVSP', 'Ibovespa'], ['BRL=X', 'Dólar (R$)'], ['EURBRL=X', 'Euro (R$)'], ['^GSPC', 'S&P 500'], ['^IXIC', 'Nasdaq'], ['^DJI', 'Dow Jones'],
  ['ES=F', 'Futuro S&P 500'], ['NQ=F', 'Futuro Nasdaq'], ['DX-Y.NYB', 'DXY'], ['^TNX', 'Treasury 10 anos (% a.a.)'], ['^STOXX50E', 'Euro Stoxx 50'],
  ['BZ=F', 'Petróleo Brent (US$)'], ['GC=F', 'Ouro (US$)'], ['BTC-USD', 'Bitcoin (US$)'], ['PETR4.SA', 'PETR4'], ['VALE3.SA', 'VALE3'], ['ITUB4.SA', 'ITUB4'],
];
const PAIS = { USD: 'EUA', EUR: 'Zona do euro', CNY: 'China', GBP: 'Reino Unido', BRL: 'Brasil', JPY: 'Japão' };
async function agendaBruta() {
  return guardado('cal', 10 * 60000, () => api('/calendar'));
}
function eventosEntre(lista, de, ate, todos) {
  return (Array.isArray(lista) ? lista : []).filter((e) => {
    if (!e || !e.date || /T00:00:00-/.test(e.date)) return false;
    const t = Date.parse(e.date);
    if (!isFinite(t) || t < de || t > ate) return false;
    if (todos) return !!PAIS[e.country];
    return (e.impact === 'High' && PAIS[e.country]) || (e.impact === 'Medium' && e.country === 'BRL');
  }).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}
const linhaEvento = (e) => `${brt(Date.parse(e.date))} ${PAIS[e.country] || e.country}: ${e.title} (impacto ${e.impact === 'High' ? 'alto' : e.impact === 'Medium' ? 'médio' : 'baixo'}`
  + `${e.actual ? '; saiu ' + e.actual : ''}${e.forecast ? '; previsão ' + e.forecast : ''}${e.previous ? '; anterior ' + e.previous : ''})`;
const linhaNoticia = (n) => `${brt(+n.data)} ${n.fonte || ''}: ${n.titulo}`;

export async function retrato() {
  return guardado('retrato', 60000, async () => {
    const agora = Date.now();
    const [q, cal, ns] = await Promise.all([
      api('/quotes?symbols=' + RETRATO_ATIVOS.map(([s]) => encodeURIComponent(s)).join(',')).catch(() => ({})),
      agendaBruta().catch(() => null),
      Promise.resolve().then(() => noticias()).catch(() => []),
    ]);
    const l = [`Agora: ${new Date(agora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} (Brasília).`, '', 'Cotações (preço; variação no dia; horário do dado):'];
    for (const [s, nome] of RETRATO_ATIVOS) {
      const m = lerMeta(q, s);
      l.push(`- ${nome}: ${m ? `${m.preco}; ${m.variacao_pct != null ? (m.variacao_pct >= 0 ? '+' : '') + m.variacao_pct + '%' : 'sem variação'}; ${m.horario || 'sem horário'}` : 'sem dado'}`);
    }
    const ev = eventosEntre(cal, agora - 6 * 3600000, agora + 30 * 3600000).slice(0, 12);
    l.push('', 'Agenda econômica (eventos importantes de há pouco até amanhã):', ...(ev.length ? ev.map((e) => '- ' + linhaEvento(e)) : ['- sem dado']));
    const lista = (Array.isArray(ns) ? ns : []).filter((n) => n && n.titulo && +n.data > agora - 8 * 3600000);
    const top = lista.filter((n) => n.nivel === 'CRITICO' || n.nivel === 'ALTO').sort((a, b) => +b.data - +a.data).slice(0, 14);
    l.push('', 'Manchetes de maior impacto das últimas 8 horas:', ...(top.length ? top.map((n) => '- ' + linhaNoticia(n)) : ['- sem dado']));
    return l.join('\n');
  });
}

// ---------------- histórico ----------------
async function historico(simbolo, periodo) {
  const s = String(simbolo || '').trim();
  if (!SYMBOL_RE.test(s)) return { erro: 'símbolo inválido' };
  const r = ['1mo', '3mo', '1y'].includes(periodo) ? periodo : '3mo';
  const j = await guardado('h:' + s + r, 30 * 60000, () => api('/history?symbols=' + encodeURIComponent(s) + (r === '3mo' ? '' : '&r=' + r)));
  const h = j?.[s];
  if (!h || !Array.isArray(h.c) || h.c.length < 2) return { erro: 'sem histórico para ' + s };
  const dia = (t) => new Date((t + (h.off || 0)) * 1000).toISOString().slice(0, 10);
  const c = h.c, n = c.length;
  let iMax = 0, iMin = 0;
  c.forEach((v, i) => { if (v > c[iMax]) iMax = i; if (v < c[iMin]) iMin = i; });
  // até ~25 pontos espalhados, para o modelo enxergar a trajetória
  const passo = Math.max(1, Math.ceil(n / 25));
  const pontos = [];
  for (let i = 0; i < n; i += passo) pontos.push([dia(h.t[i]), c[i]]);
  if (pontos[pontos.length - 1][0] !== dia(h.t[n - 1])) pontos.push([dia(h.t[n - 1]), c[n - 1]]);
  return {
    simbolo: s, periodo: r, inicio: { data: dia(h.t[0]), fechamento: c[0] }, fim: { data: dia(h.t[n - 1]), fechamento: c[n - 1] },
    variacao_pct: num((c[n - 1] / c[0] - 1) * 100, 2), maxima: { data: dia(h.t[iMax]), valor: c[iMax] }, minima: { data: dia(h.t[iMin]), valor: c[iMin] }, pontos,
  };
}

// ---------------- Copom (opções de Copom da B3) ----------------
async function copom() {
  const c = await raw('copom/copom.json');
  return {
    fonte: 'Opções de Copom da B3 (preço = chance, em %)', selic_atual: c.selic ?? null,
    reunioes: (c.reunioes || []).slice(0, 3).map((r) => {
      const h = Array.isArray(r.hist) && r.hist.length ? r.hist[r.hist.length - 1] : null;
      const chances = {};
      if (h && h.p) Object.entries(h.p).filter(([, v]) => isFinite(v) && v >= 0.5).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => { chances[r.cenarios?.[k]?.nome || k] = num(v, 1); });
      return { decisao: r.data, nome: r.nome, pregao_dos_precos: h ? h.d : null, chances: Object.keys(chances).length ? chances : 'sem preço' };
    }),
  };
}

// ---------------- Fed (futuros de Fed Funds; mesma conta do site/fed.js) ----------------
const mesDe = (iso) => iso.slice(0, 7);
function somaMes(m, k) {
  let [y, mm] = m.split('-').map(Number);
  mm += k;
  while (mm > 12) { mm -= 12; y++; }
  while (mm < 1) { mm += 12; y--; }
  return `${y}-${String(mm).padStart(2, '0')}`;
}
function calculaFed(reun, todas, px, effr, ref) {
  const ok = (v) => v != null && isFinite(v);
  const comReuniao = new Set(todas.map((r) => mesDe(r.data)));
  const r = (m) => (ok(px[m]) ? 100 - px[m] : null);
  const atual = mesDe(ref);
  let antFim = effr, dist = new Map([[0, 1]]);
  const out = [];
  for (const re of reun) {
    const M = mesDe(re.data), ant = somaMes(M, -1), prox = somaMes(M, 1);
    let ini = antFim;
    if (!comReuniao.has(ant) && r(ant) != null && ant >= atual) ini = r(ant);
    let fim;
    if (!comReuniao.has(prox) && r(prox) != null) fim = r(prox);
    else {
      if (r(M) == null) break;
      const [y, mm, dd] = re.data.split('-').map(Number);
      const N = new Date(Date.UTC(y, mm, 0)).getUTCDate();
      if (N - dd < 1) break;
      fim = (r(M) - (dd / N) * ini) / ((N - dd) / N);
    }
    if (!ok(fim)) break;
    const passos = (fim - ini) / 0.25, f = Math.floor(passos), fr = passos - f;
    const nd = new Map();
    for (const [s, p] of dist) {
      nd.set(s + f, (nd.get(s + f) || 0) + p * (1 - fr));
      nd.set(s + f + 1, (nd.get(s + f + 1) || 0) + p * fr);
    }
    dist = nd; antFim = fim;
    const d = {};
    for (const [s, p] of dist) if (p > 0.004) d[s] = p * 100;
    out.push({ data: re.data, dist: d });
  }
  return out;
}
async function fed() {
  const b = await raw('fed/fed.json');
  const hoje = hojeNY();
  const reun = (b.reunioes || []).filter((r) => r.data >= hoje);
  const todas = [...(b.passadas || []), ...(b.reunioes || [])];
  const effr = b.effr?.v;
  if (!reun.length || effr == null || !b.alvo) return { erro: 'sem reuniões ou taxas no arquivo do robô' };
  const px = {};
  let pregao = null;
  for (const [m, c] of Object.entries(b.contratos || {})) {
    px[m] = c.p;
    const f = c.fech || [];
    if (f.length) pregao = !pregao || f[f.length - 1][0] > pregao ? f[f.length - 1][0] : pregao;
  }
  const res = calculaFed(reun, todas, px, effr, hoje);
  const faixa = (s) => `${(b.alvo.min + s * 0.25).toFixed(2)}–${(b.alvo.max + s * 0.25).toFixed(2)}%`;
  const mov = (s) => (s === 0 ? 'manter' : s > 0 ? `alta de ${s * 25} pontos-base` : `corte de ${-s * 25} pontos-base`);
  return {
    fonte: 'Futuros de Fed Funds de 30 dias (CBOT), mesmo método da FedWatch da CME; pode diferir um pouco',
    faixa_atual: faixa(0), taxa_efetiva: effr, preco_dos_contratos: 'último preço guardado pelo robô' + (pregao ? ' (pregão até ' + pregao + ')' : ''),
    reunioes: res.slice(0, 4).map((x) => ({
      decisao: x.data,
      chances: Object.fromEntries(Object.entries(x.dist).sort((a, b) => b[1] - a[1]).map(([s, p]) => [`${faixa(+s)} (${mov(+s)} em relação a hoje)`, num(p, 1)])),
    })),
  };
}

// ---------------- fundamentos (CVM) ----------------
async function fundamentos(ticker) {
  const t = String(ticker || '').toUpperCase().replace(/\.SA$/, '').trim();
  if (!/^[A-Z]{4}\d{1,2}$/.test(t)) return { erro: 'código inválido; use o código da B3, como PETR4' };
  const idx = await raw('fundamentos/index.json', 60 * 60000);
  const e = (idx.empresas || []).find((x) => (x.tickers || []).includes(t));
  if (!e) return { erro: t + ' não está na base de fundamentos do terminal' };
  const f = await raw('fundamentos/' + e.cvm + '.json', 60 * 60000);
  const q = await cotacoes([t + '.SA']).catch(() => ({}));
  const anos = (f.anos || []).slice(-4).map((a) => ({ ano: a.ano, receita: a.receita, lucro: a.lucro, ebitda: a.ebitda, patrimonio: a.pl, divida_liquida: a.div_liq, proventos: a.proventos }));
  return {
    empresa: f.nome, setor: f.setor, segmento: f.segmento, tickers: f.tickers, financeira: !!f.financeira, unidade: 'R$',
    acoes: f.acoes, ultimos_12_meses: f.ttm || null, anos, cotacao: q[t + '.SA'] || 'sem dado',
    fonte: 'CVM Dados Abertos (demonstrações enviadas pela empresa)',
  };
}

// ---------------- radar da watchlist ----------------
async function radar(horas) {
  const wl = perfilAtual?.watchlist || [];
  if (!wl.length) return { erro: 'a watchlist de quem pergunta está vazia' };
  const h = Math.min(Math.max(+horas || 24, 1), 48), de = Date.now() - h * 3600000;
  const tira = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const cita = (titulo, termos) => termos.some((t) => new RegExp('(^|[^a-z0-9])' + tira(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(tira(titulo)));
  const [q, ns] = await Promise.all([cotacoes(wl.map((w) => w.s)).catch(() => ({})), Promise.resolve().then(() => noticias()).catch(() => [])]);
  const recentes = (Array.isArray(ns) ? ns : []).filter((n) => n && n.titulo && +n.data >= de);
  return {
    horas: h,
    ativos: wl.map((w) => {
      const termos = w.termos.length ? w.termos : [w.s.replace(/\.SA$/, '')];
      const ms = recentes.filter((n) => cita(n.titulo, termos)).sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0) || +b.data - +a.data).slice(0, 5);
      return { ativo: w.s, nome: w.nome, cotacao: q[w.s] || 'sem dado', manchetes: ms.map((n) => ({ quando: brt(+n.data), fonte: n.fonte, titulo: n.titulo })) };
    }),
  };
}

// ---------------- notícias e agenda ----------------
async function buscaNoticias(termo, horas) {
  const h = Math.min(Math.max(+horas || 12, 1), 48);
  const de = Date.now() - h * 3600000;
  const tira = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const pal = tira(termo).split(/\s+/).filter((w) => w.length > 2);
  const lista = (await noticias()).filter((n) => n && n.titulo && +n.data >= de)
    .filter((n) => !pal.length || pal.some((w) => tira(n.titulo + ' ' + (n.trecho || '')).includes(w)))
    .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0) || +b.data - +a.data).slice(0, 15);
  return { horas: h, total: lista.length, manchetes: lista.map((n) => ({ quando: brt(+n.data), fonte: n.fonte, titulo: n.titulo, trecho: n.trecho ? String(n.trecho).slice(0, 200) : undefined })) };
}
async function agenda(dias, todos) {
  const d = Math.min(Math.max(+dias || 1, 1), 7);
  const ini = Date.parse(diaBR() + 'T00:00:00-03:00');
  const ev = eventosEntre(await agendaBruta(), ini, ini + d * 86400000, !!todos).slice(0, 40);
  return { dias: d, eventos: ev.map(linhaEvento) };
}

export const FERRAMENTAS = [{
  functionDeclarations: [
    { name: 'cotacoes', description: 'Cotação atual de ativos (código do Yahoo Finance): ações da B3 com .SA (PETR4.SA), índices (^BVSP, ^GSPC, ^IXIC, ^DJI), moedas (BRL=X é o dólar em reais, EURBRL=X), futuros (ES=F, CL=F, BZ=F, GC=F), cripto (BTC-USD), ações dos EUA (AAPL).',
      parameters: { type: 'object', properties: { simbolos: { type: 'array', items: { type: 'string' }, description: 'Até 20 códigos' } }, required: ['simbolos'] } },
    { name: 'historico', description: 'Fechamentos diários de um ativo no período: início, fim, variação, máxima, mínima e pontos da trajetória.',
      parameters: { type: 'object', properties: { simbolo: { type: 'string' }, periodo: { type: 'string', enum: ['1mo', '3mo', '1y'] } }, required: ['simbolo'] } },
    { name: 'probabilidades_copom', description: 'Chances de cada decisão da Selic nas próximas reuniões do Copom, pelas opções de Copom da B3, e a Selic atual.', parameters: { type: 'object', properties: {} } },
    { name: 'probabilidades_fed', description: 'Chances de cada faixa de juros do Fed nas próximas reuniões do FOMC, pelos futuros de Fed Funds, e a faixa atual.', parameters: { type: 'object', properties: {} } },
    { name: 'fundamentos', description: 'Dados contábeis de uma empresa da B3 (receita, lucro, EBITDA, patrimônio, dívida líquida, proventos por ano e últimos 12 meses), quantidade de ações e cotação.',
      parameters: { type: 'object', properties: { ticker: { type: 'string', description: 'Código da B3, como PETR4' } }, required: ['ticker'] } },
    { name: 'fluxo_estrangeiro', description: 'Saldo do investidor estrangeiro na B3 (R$ mil): último dia disponível, mês e ano.', parameters: { type: 'object', properties: {} } },
    { name: 'noticias', description: 'Manchetes recentes do terminal, opcionalmente filtradas por palavras.',
      parameters: { type: 'object', properties: { termo: { type: 'string', description: 'Palavras para filtrar; vazio = as mais importantes' }, horas: { type: 'number', description: '1 a 48, padrão 12' } } } },
    { name: 'resumo_semanal', description: 'O Resumo semanal escrito pela equipe do Mercado Macro (o que marcou a semana nos mercados).', parameters: { type: 'object', properties: {} } },
    { name: 'radar_watchlist', description: 'Radar da watchlist de quem pergunta: cotação de cada ativo e as manchetes recentes que citam cada um. Use para perguntas sobre "minha watchlist", "meus ativos" ou "meu radar".',
      parameters: { type: 'object', properties: { horas: { type: 'number', description: '1 a 48, padrão 24' } } } },
    { name: 'buscar_conteudo', description: 'Busca por sentido (AI Search) nas aulas da aba Educação do Mercado Macro e no histórico de notícias guardado pelo terminal (um arquivo por dia, desde 11/11/2026). Use para explicar conceitos do jeito das aulas do site (e indicar a aula) e para perguntas sobre o que saiu nas notícias em dias ou semanas anteriores. Para manchetes das últimas 48 horas, use a ferramenta noticias.',
      parameters: { type: 'object', properties: { pergunta: { type: 'string', description: 'O que procurar, em português' }, onde: { type: 'string', enum: ['aulas', 'noticias', 'tudo'], description: 'Padrão: tudo' } }, required: ['pergunta'] } },
    { name: 'agenda', description: 'Agenda econômica (Brasil, EUA, Europa, China) a partir de hoje, com previsão, anterior e resultado.',
      parameters: { type: 'object', properties: { dias: { type: 'number', description: '1 a 7' }, todos: { type: 'boolean', description: 'true inclui eventos de impacto baixo e médio' } } } },
  ],
}];

export async function executar(nome, a = {}) {
  try {
    switch (nome) {
      case 'cotacoes': return await cotacoes(a.simbolos);
      case 'historico': return await historico(a.simbolo, a.periodo);
      case 'probabilidades_copom': return await copom();
      case 'probabilidades_fed': return await fed();
      case 'fundamentos': return await fundamentos(a.ticker);
      case 'fluxo_estrangeiro': { const f = await fluxo(); return f ? { unidade: 'R$ mil', ultimo_dia: f.data, saldo_dia: f.dia, saldo_mes: f.mes, saldo_ano: f.ano, fonte: 'B3, boletim diário (participação dos investidores, todos os mercados de ações)' } : { erro: 'sem dado' }; }
      case 'noticias': return await buscaNoticias(a.termo, a.horas);
      case 'agenda': return await agenda(a.dias, a.todos);
      case 'resumo_semanal': {
        let r = null; try { r = JSON.parse((resumo && (await resumo())) || 'null'); } catch (e) { r = null; }
        return r && r.txt ? { atualizado: r.ts ? brt(r.ts) : null, texto: String(r.txt).slice(0, 8000) } : { erro: 'o Resumo semanal não está disponível agora' };
      }
      case 'radar_watchlist': return await radar(a.horas);
      case 'buscar_conteudo': return busca ? await busca(a.pergunta, a.onde) : { erro: 'a busca nas aulas e no histórico não está ligada; responda com o que sabe ou use a ferramenta noticias' };
      default: return { erro: 'ferramenta desconhecida' };
    }
  } catch (e) { return { erro: 'não foi possível buscar agora (' + String(e.message || e).slice(0, 80) + ')' }; }
}
