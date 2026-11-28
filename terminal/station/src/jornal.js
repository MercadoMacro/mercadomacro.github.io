/* Jornal Mercado Macro (22/11/2026, pedido do Dante): páginas públicas de notícias em formato de jornal, para ganhar
   leitores pelo Google e pelo compartilhamento.
   - A IA do site (Gemini, src/assistente.js) escreve só com os NOSSOS dados (números da abertura e do fechamento,
     agenda) e com as manchetes do depósito de notícias, sempre com as fontes e os links no fim. Não reescreve matéria
     de outro veículo: junta o que várias fontes disseram, com texto próprio.
   - Toda matéria nasce como rascunho e só vai ao ar com o "Aprovar" do administrador em /admin > Jornal.
     A chave "Jornal ligado" em /admin desliga a geração automática (as já publicadas continuam no ar).
   - Ritmo (dias úteis, horário de Brasília): 8h15 abertura, 12h30 e 15h30 o assunto do dia, 18h45 fechamento.
   Páginas: /jornal (capa), /jornal/<slug> (matéria), /jornal/rss.xml. Tabela D1: jornal. */
import { escreverIA, manchetesParaResumo, dadosParaManha } from './assistente.js';

const SITE = 'https://mercadomacro.com.br';
const SECOES = ['Mercados', 'Economia', 'Juros', 'Câmbio', 'Empresas', 'Internacional', 'Cripto', 'Commodities'];
const TIPOS = { abertura: 'Abertura', tema: 'Assunto do dia', fechamento: 'Fechamento' };
const VENCE_MS = 18 * 3600000; // rascunho não aprovado em 18 horas perde a hora e sai da fila
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

let deps = {};
export function ligarJornal(d) { deps = d; }

export const esc = (s) => String(s ?? '').replace(/R\$ (?=\d)/g, 'R$\u00a0').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brt = (ms) => new Date(ms - 3 * 3600000);
const diaBR = (ms) => brt(ms).toISOString().slice(0, 10);
const horaBR = (ms) => brt(ms).toISOString().slice(11, 16).replace(':', 'h');
const dataLonga = (ms) => { const d = brt(ms); return `${DIAS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`; };
const dataCurta = (ms) => { const d = brt(ms); return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()].slice(0, 3)}. de ${d.getUTCFullYear()}, ${horaBR(ms)}`; };

export function slugify(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '');
}

let tabelaOk = false;
async function tabela(env) {
  if (tabelaOk) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS jornal (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, chave TEXT UNIQUE, tipo TEXT, secao TEXT,
    titulo TEXT, linha_fina TEXT, corpo TEXT, fontes TEXT, status TEXT, criado INTEGER, publicado INTEGER, modelo TEXT)`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS jornal_status ON jornal (status, publicado)').run();
  // 23/11/2026: números do terminal guardados com a matéria (quadro "Números do terminal")
  const cols = (await env.DB.prepare('PRAGMA table_info(jornal)').all()).results.map((c) => c.name);
  if (!cols.includes('dados')) await env.DB.prepare('ALTER TABLE jornal ADD COLUMN dados TEXT').run();
  // 27/11/2026 (SEO): quando uma matéria publicada é editada, a data de atualização vai para o Google (dateModified)
  if (!cols.includes('atualizado')) await env.DB.prepare('ALTER TABLE jornal ADD COLUMN atualizado INTEGER').run();
  tabelaOk = true;
}
async function ligado(env) {
  const r = await env.DB.prepare("SELECT valor FROM config WHERE chave = 'jornal_ligado'").first().catch(() => null);
  return !!r && r.valor === '1';
}

/* ---------------- texto pela IA ---------------- */
export const INSTRUCOES_JORNAL = `Você é editor do Jornal Mercado Macro, a redação de um terminal financeiro brasileiro. Escreve matérias curtas, claras e neutras, no estilo de um jornal de economia (Wall Street Journal, Valor Econômico), para o público brasileiro.
Você recebe: o tipo de matéria, números e agenda vindos do próprio terminal (quando houver) e uma lista numerada de manchetes de vários veículos, com horário de Brasília.
Responda SOMENTE com um objeto JSON, sem nada antes ou depois, neste formato:
{"secao": "Mercados", "titulo": "...", "linha_fina": "...", "paragrafos": ["...", "..."], "fontes": [3, 7, 12]}
Regras:
- secao: uma destas: Mercados, Economia, Juros, Câmbio, Empresas, Internacional, Cripto, Commodities.
- titulo: até 90 caracteres, informativo, sem ponto final, sem pergunta, sem exagero nem sensacionalismo. Pode ter número.
- O título precisa ser achado no Google: comece pelo termo que as pessoas pesquisam. No FECHAMENTO, comece com "Ibovespa hoje:" ou "Dólar hoje:" (o que mais se destacou no dia). Na ABERTURA, comece com "Mercado hoje:". No ASSUNTO DO DIA, comece pelo nome do assunto (a empresa, o indicador ou o tema, como "Petrobras", "Copom", "Inflação", "Bitcoin"). Escreva os nomes como as pessoas escrevem (Ibovespa, dólar, Selic, IPCA, Petrobras, Vale).
- linha_fina: uma frase de 120 a 200 caracteres que completa o título.
- paragrafos: de 4 a 6 parágrafos, de 2 a 4 frases cada, de 280 a 480 palavras no total. O primeiro diz o mais importante (o quê, quanto, por quê). Os outros dão contexto, números e o que vem pela frente na agenda.
- Use SOMENTE os números, nomes, datas e fatos recebidos. Não invente nada, não arredonde de outro jeito e não calcule números novos. Se não tiver um dado, não fale dele.
- Escreva com suas palavras: não copie frases das manchetes. Quando um fato vier de um veículo, cite o veículo no texto ("segundo a Reuters").
- fontes: os números (entre colchetes na lista) das manchetes que você usou, de 2 a 8.
- Não faça recomendação de compra ou venda, não diga se algo "vale a pena" e não preveja preço. Pode dizer o que o mercado acompanha.
- Deixe de fora política partidária, opinião, fofoca e esporte. Não use emojis, markdown, negrito nem títulos dentro do texto.`;

// manchetes numeradas (o número volta em "fontes" e vira o link no fim da matéria)
function manchetesNumeradas(ms) {
  return ms.map((n, i) => {
    const fonte = n.fonte === 'Google News' && n.veiculo ? n.veiculo : n.fonte;
    const trecho = String(n.trecho || n.resumo || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    return `[${i + 1}] ${horaBR(+n.data)} ${fonte}: ${n.titulo.replace(/\s+/g, ' ').trim()}${trecho ? ' | ' + trecho : ''}`;
  }).join('\n');
}

// lê o JSON da IA e confere tudo; devolve null se não servir
export function lerMateria(texto, ms) {
  const t = String(texto || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const i = t.indexOf('{'), f = t.lastIndexOf('}');
  if (i < 0 || f <= i) return null;
  let j;
  try { j = JSON.parse(t.slice(i, f + 1)); } catch (e) { return null; }
  const limpa = (s) => String(s || '').replace(/\*\*|__|#+\s/g, '').replace(/\s+/g, ' ').trim();
  const titulo = limpa(j.titulo).replace(/\.$/, '');
  const linha = limpa(j.linha_fina);
  const pars = (Array.isArray(j.paragrafos) ? j.paragrafos : []).map(limpa).filter((p) => p.length >= 40).slice(0, 8);
  if (titulo.length < 20 || titulo.length > 120 || linha.length < 40 || pars.length < 3) return null;
  const palavras = pars.join(' ').split(/\s+/).length;
  if (palavras < 150 || palavras > 900) return null;
  const nums = [...new Set((Array.isArray(j.fontes) ? j.fontes : []).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= ms.length))].slice(0, 8);
  const fontes = nums.map((n) => { const m = ms[n - 1]; return { t: m.titulo, f: m.fonte === 'Google News' && m.veiculo ? m.veiculo : m.fonte, link: m.link }; })
    .filter((x) => /^https?:\/\//i.test(x.link || ''));
  return { secao: SECOES.includes(j.secao) ? j.secao : 'Mercados', titulo: titulo.slice(0, 120), linha_fina: linha.slice(0, 260), paragrafos: pars, fontes };
}

// números do fechamento em linhas simples
export function dadosParaFechamento(d) {
  const f = (v, c = 2) => (v == null || !isFinite(v) ? 'sem dado' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
  const L = [`Fechamento do pregão de ${d.pregaoDia || 'hoje'} (variação contra o fechamento anterior):`];
  for (const [k, c] of Object.entries(d.cards || {})) if (c && c.v != null) L.push(`- ${c.nome}: ${f(c.v, k === 'tnx' || k === 'dolar' ? 3 : 2)}${c.ch != null && isFinite(c.ch) ? ` (${c.ch > 0 ? '+' : ''}${f(c.ch)}%)` : ''}`);
  if (d.altas?.length) L.push('Maiores altas do Ibovespa: ' + d.altas.map((a) => `${a.t} (${a.ch > 0 ? '+' : ''}${f(a.ch)}%)`).join(', '));
  if (d.baixas?.length) L.push('Maiores baixas do Ibovespa: ' + d.baixas.map((a) => `${a.t} (${f(a.ch)}%)`).join(', '));
  const j = d.juros || {};
  if (j.selic != null) L.push(`Selic: ${f(j.selic)}% ao ano`);
  if (j.pre) L.push(`${j.pre.nome}: ${f(j.pre.taxa)}% ao ano`);
  if (j.ipca) L.push(`${j.ipca.nome}: IPCA + ${f(j.ipca.taxa)}% ao ano`);
  if (j.ipca12 != null) L.push(`IPCA em 12 meses: ${f(j.ipca12)}%`);
  if (d.fluxo) L.push(`Investidor estrangeiro na B3 em ${d.fluxo.data}: saldo de R$ ${f((d.fluxo.dia || 0) / 1e6)} bi no dia, R$ ${f((d.fluxo.mes || 0) / 1e6)} bi no mês`);
  return L.join('\n');
}

// quadro "Números do terminal" guardado com a matéria (valores do momento em que ela foi escrita)
const CASAS = { dolar: 3, tnx: 3, euro: 3, ibov: 0, btc: 0 };
export function quadroDosDados(d, rotulo) {
  const itens = Object.entries(d?.cards || {}).filter(([, c]) => c && c.v != null && isFinite(c.v))
    .map(([k, c]) => ({ nome: String(c.nome || k), v: Number(c.v), ch: c.ch != null && isFinite(c.ch) ? Number(c.ch) : null, cas: CASAS[k] ?? 2 })).slice(0, 12);
  const acoes = (l) => (Array.isArray(l) ? l : []).filter((a) => a && a.t && isFinite(a.ch)).slice(0, 5).map((a) => ({ t: String(a.t), ch: Number(a.ch) }));
  if (!itens.length) return null;
  return { rotulo, itens, altas: acoes(d.altas), baixas: acoes(d.baixas) };
}

export const MODELO_RESERVA = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
async function reservaCloudflare(env, pedido) {
  let tempo;
  const out = await Promise.race([
    env.AI.run(MODELO_RESERVA, { messages: [{ role: 'system', content: INSTRUCOES_JORNAL }, { role: 'user', content: pedido }], max_tokens: 1800, temperature: 0.3 }),
    new Promise((ok) => { tempo = setTimeout(() => ok(null), 60000); }),
  ]).finally(() => clearTimeout(tempo));
  const texto = String(out?.response ?? out?.result?.response ?? '').trim();
  return texto ? { ok: true, texto, modelo: 'llama-3.3-70b (reserva)' } : { ok: false, erro: 'a IA de reserva não respondeu' };
}

/* ---------------- geração ---------------- */
// gera uma matéria do tipo pedido e guarda como rascunho. chave evita duas do mesmo horário.
export async function gerarMateria(env, tipo, { agora = Date.now(), chave = null, avisar = true } = {}) {
  if (!TIPOS[tipo]) return { erro: 'tipo desconhecido' };
  await tabela(env);
  await env.DB.prepare("UPDATE jornal SET status = 'vencida' WHERE status = 'rascunho' AND criado < ?").bind(agora - VENCE_MS).run();
  const dia = diaBR(agora);
  if (chave && (await env.DB.prepare('SELECT 1 FROM jornal WHERE chave = ?').bind(chave).first())) return { erro: 'já gerada', ja: true };
  const lista = await deps.listaNoticias().catch(() => []);
  const janela = tipo === 'abertura' ? 16 : tipo === 'fechamento' ? 10 : 5;
  const ms = manchetesParaResumo(lista, agora, janela * 3600000, 60);
  if (ms.length < 6) return { erro: 'poucas manchetes agora' };
  let dados = '', quadro = null;
  if (tipo === 'abertura' || tipo === 'tema') {
    // 23/11/2026: o assunto do dia também recebe os números de agora (e guarda o quadro com a matéria)
    const d = await deps.dadosAbertura(env).catch(() => null);
    if (d) { if (tipo === 'abertura') dados = dadosParaManha(d); else dados = dadosParaFechamento({ ...d, pregaoDia: 'agora' }).replace(/^Fechamento do pregão de agora/, `Números do terminal às ${horaBR(agora)}`); quadro = quadroDosDados(d, tipo === 'abertura' ? 'Como os mercados chegam ao dia' : `Números do terminal às ${horaBR(agora)}`); }
  }
  if (tipo === 'fechamento') {
    const d = await deps.dadosFechamento(env);
    if (!d || d.semDados || !d.pregao) return { erro: 'sem pregão hoje' };
    dados = dadosParaFechamento(d);
    quadro = quadroDosDados(d, `Fechamento de ${d.pregaoDia || 'hoje'}`);
  }
  // o assunto do dia não repete o de mais cedo
  const hoje = (await env.DB.prepare("SELECT titulo FROM jornal WHERE criado >= ? AND status != 'recusada'").bind(agora - 14 * 3600000).all()).results.map((r) => r.titulo);
  const pedido = [
    `Tipo de matéria: ${{
      abertura: 'ABERTURA. Como os mercados chegam ao dia (Ásia, Europa, futuros dos EUA, dólar, commodities), o que pesa no Brasil e a agenda de hoje com horários. Título sobre o fato mais forte da manhã.',
      tema: 'ASSUNTO DO DIA. Escolha o assunto mais importante para o mercado brasileiro nas manchetes abaixo, de preferência um que apareça em várias fontes, e explique o que aconteceu, por que importa e o que vem pela frente.',
      fechamento: 'FECHAMENTO. Como fechou o pregão: Ibovespa, dólar, juros, bolsas de Nova York, commodities, maiores altas e baixas e o que explicou o dia segundo as manchetes.',
    }[tipo]}`,
    `Data: ${dataLonga(agora)}.`,
    hoje.length ? `Já publicamos hoje (não repita o assunto): ${hoje.join(' | ')}` : '',
    dados ? `\nDados do terminal:\n${dados}` : '',
    `\nManchetes (horário de Brasília):\n${manchetesNumeradas(ms)}`,
  ].filter(Boolean).join('\n');
  let r = await escreverIA(env, pedido, INSTRUCOES_JORNAL, 60000);
  // 24/11/2026: o Gemini ficou sobrecarregado ("high demand") das 12h30 às 13h e demorou demais às 18h45; quando ele falha,
  // a matéria sai pela IA da Cloudflare (Llama 3.3 70B). Você aprova do mesmo jeito; o modelo fica anotado na matéria
  if (!r.ok && env.AI) r = await reservaCloudflare(env, pedido).catch((e) => ({ ok: false, erro: r.erro + ' · reserva: ' + e.message }));
  if (!r.ok) return { erro: r.erro || 'a IA não respondeu' };
  const m = lerMateria(r.texto, ms);
  if (!m) return { erro: 'a IA respondeu fora do formato' };
  let slug = `${dia}-${slugify(m.titulo)}`;
  if (await env.DB.prepare('SELECT 1 FROM jornal WHERE slug = ?').bind(slug).first()) slug += '-' + String(agora).slice(-4);
  const ins = await env.DB.prepare(`INSERT OR IGNORE INTO jornal (slug, chave, tipo, secao, titulo, linha_fina, corpo, fontes, status, criado, modelo, dados)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'rascunho', ?, ?, ?)`)
    .bind(slug, chave, tipo, m.secao, m.titulo, m.linha_fina, JSON.stringify(m.paragrafos), JSON.stringify(m.fontes), agora, r.modelo || null, quadro ? JSON.stringify(quadro) : null).run();
  if (!ins.meta.changes) return { erro: 'já gerada', ja: true };
  if (avisar && deps.avisar) await deps.avisar(env, 'Jornal: matéria para aprovar', `${TIPOS[tipo]} · ${m.titulo}\n\nVeja, edite e aprove em ${SITE}/admin#jornal`).catch(() => {});
  return { ok: true, id: ins.meta.last_row_id, slug, titulo: m.titulo };
}

// cron de 15 minutos: horários do jornal (dias úteis)
export function slotDoJornal(quando, diaUtil) {
  if (!diaUtil) return null;
  const h = quando.getUTCHours(), m = quando.getUTCMinutes();
  if (h === 11 && m === 15) return 'abertura';
  if (h === 15 && m === 30) return 'tema';
  if (h === 18 && m === 30) return 'tema';
  if (h === 21 && m === 45) return 'fechamento';
  return null;
}
// 23/11/2026: se a rodada do horário falhar (IA fora do formato, poucas manchetes, lentidão), tenta de novo nos
// quatro quartos de hora seguintes (até 1 hora depois; eram 30 minutos até 24/11) com a mesma chave; cada tentativa fica registrada (config jornal_rodadas) e aparece no /admin
export async function rodadaJornal(env, quando, diaUtil) {
  let tipo = null, inicio = null;
  for (const atras of [0, 15, 30, 45, 60]) {
    const q = new Date(+quando - atras * 60000);
    tipo = slotDoJornal(q, diaUtil);
    if (tipo) { inicio = q; break; }
  }
  if (!tipo || !(await ligado(env))) return null;
  const chave = `${diaBR(+inicio)}-${tipo}-${inicio.getUTCHours()}`;
  let r;
  try { r = await gerarMateria(env, tipo, { agora: +quando, chave }); } catch (e) { r = { erro: 'falha: ' + (e && e.message) }; }
  if (r.ja) return r;
  if (r.erro) console.log('jornal:', tipo, r.erro);
  await registrarRodada(env, { quando: +quando, tipo, ok: !!r.ok, erro: r.erro || null, titulo: r.titulo || null });
  return r;
}
async function registrarRodada(env, item) {
  try {
    const atual = await env.DB.prepare("SELECT valor FROM config WHERE chave = 'jornal_rodadas'").first();
    let lista = []; try { lista = JSON.parse(atual?.valor || '[]'); } catch (e) {}
    lista = [item, ...lista].slice(0, 12);
    await env.DB.prepare("INSERT INTO config (chave, valor) VALUES ('jornal_rodadas', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").bind(JSON.stringify(lista)).run();
  } catch (e) { console.error('jornal rodadas:', e.message); }
}
async function rodadas(env) {
  const r = await env.DB.prepare("SELECT valor FROM config WHERE chave = 'jornal_rodadas'").first().catch(() => null);
  try { return JSON.parse(r?.valor || '[]'); } catch (e) { return []; }
}

/* ---------------- administrador: /api/admin/jornal ---------------- */
const linha = (r) => ({ id: r.id, slug: r.slug, tipo: r.tipo, tipoNome: TIPOS[r.tipo] || r.tipo, secao: r.secao, titulo: r.titulo, linha_fina: r.linha_fina,
  corpo: JSON.parse(r.corpo || '[]'), fontes: JSON.parse(r.fontes || '[]'), status: r.status, criado: r.criado, publicado: r.publicado, atualizado: r.atualizado || null, dados: (() => { try { return r.dados ? JSON.parse(r.dados) : null; } catch (e) { return null; } })() });
async function limparCache(slug) {
  if (typeof caches === 'undefined') return;
  const ps = ['/jornal', '/jornal/rss.xml', '/jornal/hoje.json', '/jornal/sitemap-news.xml', '/sitemap.xml', '/dolar-hoje', '/ibovespa-hoje', '/selic-e-cdi-hoje', ...(slug ? ['/jornal/' + slug] : [])];
  await Promise.all(ps.map((p) => caches.default.delete(new Request(SITE + p)).catch(() => false)));
}
// 25/11/2026 (Dante): leituras do Jornal por matéria e por origem (Google, Terminal, Telegram...), somadas por dia.
// Só o endereço da matéria e o nome do site de origem; nada da pessoa.
let leiturasProntas = false;
export function contarLeitura(env, ctx, p, origem) {
  const slug = p === '/jornal' || p === '/jornal/' ? '(capa)' : p.slice('/jornal/'.length).replace(/\/$/, '');
  if (slug !== '(capa)' && !/^[a-z0-9-]{1,140}$/.test(slug)) return;
  const dia = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const run = async () => {
    if (!leiturasProntas) { await env.DB.prepare('CREATE TABLE IF NOT EXISTS jornal_leituras (dia TEXT NOT NULL, slug TEXT NOT NULL, origem TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, slug, origem))').run(); leiturasProntas = true; }
    await env.DB.prepare('INSERT INTO jornal_leituras (dia, slug, origem, n) VALUES (?, ?, ?, 1) ON CONFLICT(dia, slug, origem) DO UPDATE SET n = n + 1').bind(dia, slug, String(origem).slice(0, 60)).run();
  };
  ctx.waitUntil(run().catch(() => {}));
}
async function leiturasJornal(env) {
  try {
    const desde = new Date(Date.now() - 3 * 3600e3 - 6 * 86400e3).toISOString().slice(0, 10);
    const rs = (await env.DB.prepare('SELECT l.slug, l.origem, SUM(l.n) n, j.titulo, j.tipo FROM jornal_leituras l LEFT JOIN jornal j ON j.slug = l.slug WHERE l.dia >= ? GROUP BY l.slug, l.origem').bind(desde).all()).results;
    const dias = (await env.DB.prepare('SELECT dia, SUM(n) n FROM jornal_leituras WHERE dia >= ? GROUP BY dia ORDER BY dia').bind(desde).all()).results;
    const por = new Map(), origens = {};
    for (const r of rs) {
      const m = por.get(r.slug) || { slug: r.slug, titulo: r.slug === '(capa)' ? 'Capa do Jornal' : r.titulo || r.slug, tipo: TIPOS[r.tipo] || '', total: 0, origens: {} };
      m.total += r.n; m.origens[r.origem] = (m.origens[r.origem] || 0) + r.n; por.set(r.slug, m);
      origens[r.origem] = (origens[r.origem] || 0) + r.n;
    }
    return { desde, materias: [...por.values()].sort((a, b) => b.total - a.total).slice(0, 15), origens, dias };
  } catch (e) { return { desde: null, materias: [], origens: {}, dias: [] }; }
}
export async function apiAdminJornal(req, env, json) {
  await tabela(env);
  const u = new URL(req.url);
  if (req.method === 'GET') {
    const previa = Number(u.searchParams.get('previa'));
    if (previa) {
      const r = await env.DB.prepare('SELECT * FROM jornal WHERE id = ?').bind(previa).first();
      if (!r) return new Response('Matéria não encontrada.', { status: 404 });
      return html(paginaMateria(linha(r), r.status !== 'publicada'), 200, true);
    }
    const lista = (await env.DB.prepare(`SELECT * FROM jornal WHERE status IN ('rascunho', 'publicada') OR criado > ? ORDER BY CASE status WHEN 'rascunho' THEN 0 ELSE 1 END, COALESCE(publicado, criado) DESC LIMIT 60`)
      .bind(Date.now() - 3 * 86400000).all()).results.map(linha);
    const pub = await env.DB.prepare("SELECT COUNT(*) n FROM jornal WHERE status = 'publicada'").first();
    return json({ ligado: await ligado(env), publicadas: pub.n, materias: lista, tipos: TIPOS, secoes: SECOES, rodadas: await rodadas(env), leituras: await leiturasJornal(env) });
  }
  const b = await req.json().catch(() => ({}));
  if (b.acao === 'ligar') {
    await env.DB.prepare("INSERT INTO config (chave, valor) VALUES ('jornal_ligado', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").bind(b.ligado ? '1' : '0').run();
    return json({ ok: true, ligado: !!b.ligado });
  }
  if (b.acao === 'gerar') {
    const r = await gerarMateria(env, b.tipo, { avisar: false });
    return r.ok ? json(r) : json({ erro: 'Não deu para gerar: ' + r.erro + '.' }, 400);
  }
  const id = Number(b.id);
  const r = id ? await env.DB.prepare('SELECT * FROM jornal WHERE id = ?').bind(id).first() : null;
  if (!r) return json({ erro: 'Matéria não encontrada.' }, 404);
  if (b.acao === 'editar') {
    const titulo = String(b.titulo || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const linhaFina = String(b.linha_fina || '').replace(/\s+/g, ' ').trim().slice(0, 260);
    const pars = String(b.corpo || '').split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12);
    const secao = SECOES.includes(b.secao) ? b.secao : r.secao;
    if (titulo.length < 10 || !pars.length) return json({ erro: 'Título e texto não podem ficar vazios.' }, 400);
    await env.DB.prepare("UPDATE jornal SET titulo = ?, linha_fina = ?, corpo = ?, secao = ?, atualizado = CASE WHEN status = 'publicada' THEN ? ELSE atualizado END WHERE id = ?").bind(titulo, linhaFina, JSON.stringify(pars), secao, Date.now(), id).run();
    if (r.status === 'publicada') await limparCache(r.slug);
    return json({ ok: true });
  }
  if (b.acao === 'aprovar') {
    if (r.status === 'publicada') return json({ ok: true });
    await env.DB.prepare("UPDATE jornal SET status = 'publicada', publicado = ? WHERE id = ?").bind(Date.now(), id).run();
    await limparCache(r.slug);
    return json({ ok: true, link: SITE + '/jornal/' + r.slug });
  }
  if (b.acao === 'recusar') { await env.DB.prepare("UPDATE jornal SET status = 'recusada' WHERE id = ? AND status = 'rascunho'").bind(id).run(); return json({ ok: true }); }
  if (b.acao === 'despublicar') {
    await env.DB.prepare("UPDATE jornal SET status = 'recusada' WHERE id = ?").bind(id).run();
    await limparCache(r.slug);
    return json({ ok: true });
  }
  return json({ erro: 'Ação desconhecida.' }, 400);
}

/* ---------------- páginas públicas ---------------- */
const html = (corpo, status = 200, privado = false) => new Response(corpo, { status, headers: {
  'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': privado ? 'private, no-store' : 'public, max-age=600',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY' } });

const CSS = `
:root{--papel:#fbfaf7;--tinta:#111;--cinza:#5d5d5d;--fio:#d9d5cc;--fio2:#111;--acento:#8a5a00;--caixa:#f2efe7}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--papel);color:var(--tinta);font:17px/1.55 Georgia,'Times New Roman',serif}
a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}
.sans{font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif}
.topo{max-width:1180px;margin:0 auto;padding:10px 16px 0;display:flex;justify-content:space-between;gap:12px;font-size:12px;color:var(--cinza)}
.topo a.bt{background:var(--tinta);color:#fff;padding:6px 12px;border-radius:3px;font-weight:600}
.cab{max-width:1180px;margin:0 auto;padding:6px 16px 0;text-align:center}
.cab .nome{font:700 clamp(34px,7vw,66px)/1.05 'Playfair Display',Georgia,serif;letter-spacing:-.5px;margin:6px 0 4px}
.cab .lema{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--cinza)}
.faixa{max-width:1180px;margin:10px auto 0;padding:7px 16px;border-top:3px double var(--fio2);border-bottom:1px solid var(--fio2);display:flex;justify-content:space-between;gap:16px;font-size:12.5px;flex-wrap:wrap}
.faixa .cot{display:flex;gap:16px;flex-wrap:wrap}.faixa b{font-weight:700}.up{color:#0a7a3d}.dn{color:#b4231b}
main{max-width:1180px;margin:0 auto;padding:18px 16px 40px}
.kick{font:700 11.5px/1.2 Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--acento);margin:0 0 6px}
.capa{display:grid;grid-template-columns:2fr 1fr;gap:28px;border-bottom:1px solid var(--fio);padding-bottom:22px}
.capa h2{font:700 clamp(26px,3.4vw,40px)/1.12 'Playfair Display',Georgia,serif;margin:0 0 10px}
.capa .lf{font-size:19px;color:#333;margin:0 0 10px}
.capa .lead p{margin:0 0 10px}
.lado{border-left:1px solid var(--fio);padding-left:22px}
.lado h3{font:700 12px Inter,system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;margin:0 0 10px;border-bottom:2px solid var(--tinta);padding-bottom:6px}
.lado li{list-style:none;padding:10px 0;border-bottom:1px solid var(--fio)}.lado ul{margin:0;padding:0}
.lado li a{font:700 17px/1.25 Georgia,serif}.hora{display:block;font:12px Inter,system-ui,sans-serif;color:var(--cinza);margin-top:4px}
.grade{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:22px}
.grade article{border-top:1px solid var(--tinta);padding-top:10px;position:relative}.grade h3 a::after{content:'';position:absolute;inset:0}.grade article:hover h3 a{text-decoration:underline}
.ler{display:inline-block;margin:10px 0 2px;font:700 14px Inter,system-ui,sans-serif;color:var(--tinta);border-bottom:2px solid var(--tinta);padding-bottom:1px}.ler:hover{text-decoration:none;opacity:.75}
.grade h3{font:700 21px/1.22 'Playfair Display',Georgia,serif;margin:0 0 6px}.grade p{margin:0;color:#333;font-size:15.5px}
.vazio{text-align:center;color:var(--cinza);padding:40px 0}
.mat{max-width:720px;margin:0 auto}
.mat h1{font:700 clamp(28px,4.4vw,44px)/1.12 'Playfair Display',Georgia,serif;margin:4px 0 12px}
.mat .lf{font-size:20px;line-height:1.45;color:#333;margin:0 0 16px}
.assin{font:13px/1.5 Inter,system-ui,sans-serif;color:var(--cinza);border-top:1px solid var(--fio);border-bottom:1px solid var(--fio);padding:10px 0;margin:0 0 22px}
.assin b{color:var(--tinta)}
.mat .corpo p{font-size:19px;line-height:1.7;margin:0 0 18px}
.mat .corpo p:first-child::first-letter{font:700 3.3em/.8 'Playfair Display',Georgia,serif;float:left;margin:6px 8px 0 0}
.corpo a.int{text-decoration:underline;text-decoration-color:var(--fio);text-underline-offset:3px}
.quadro{border-top:2px solid var(--tinta);margin:26px 0;font:14px/1.45 Inter,system-ui,sans-serif}
.quadro h2,.leia h2{font-size:12px;letter-spacing:.12em;text-transform:uppercase;margin:10px 0 8px}
.quadro table{width:100%;border-collapse:collapse}.quadro th,.quadro td{padding:6px 4px;border-bottom:1px solid var(--fio);text-align:right;font-variant-numeric:tabular-nums}
.quadro th{text-align:left;font-weight:600}.quadro .qa{margin:10px 0 0}.quadro .qn{color:var(--cinza);font-size:12.5px;margin:10px 0 0}.quadro .qn a{text-decoration:underline}
.leia{border-top:2px solid var(--tinta);margin:26px 0;font:15px/1.4 Inter,system-ui,sans-serif}.leia ul{margin:0;padding:0}.leia li{list-style:none;padding:8px 0;border-bottom:1px solid var(--fio)}.leia li a{font:700 17px/1.3 Georgia,serif}
.fontes{font:14px/1.5 Inter,system-ui,sans-serif;border-top:2px solid var(--tinta);padding-top:12px;margin-top:26px}
.fontes h2{font-size:12px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 8px}
.fontes li{margin:0 0 6px}.fontes a{text-decoration:underline;text-underline-offset:2px}
.part{font:13.5px/1.5 Inter,system-ui,sans-serif;display:flex;gap:8px;flex-wrap:wrap;margin:22px 0}
.part a{border:1px solid var(--fio);background:#fff;border-radius:999px;padding:7px 14px;font-weight:600}
.cta{background:var(--caixa);border:1px solid var(--fio);padding:18px;margin:26px 0;font:15px/1.5 Inter,system-ui,sans-serif}
.cta b{display:block;font:700 19px/1.3 'Playfair Display',Georgia,serif;margin-bottom:6px}
.cta a{display:inline-block;margin-top:10px;background:var(--tinta);color:#fff;padding:10px 16px;border-radius:3px;font-weight:700}
.aviso{font:12.5px/1.5 Inter,system-ui,sans-serif;color:var(--cinza)}
.previa{background:#fff3cd;border:1px solid #e0c36a;color:#5c4400;font:600 14px Inter,system-ui,sans-serif;padding:10px 14px;margin:0 0 18px}
footer{max-width:1180px;margin:0 auto;padding:18px 16px 30px;border-top:3px double var(--fio2);font:12.5px/1.6 Inter,system-ui,sans-serif;color:var(--cinza);display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
@media (max-width:860px){.capa{grid-template-columns:1fr}.lado{border-left:0;padding-left:0}.grade{grid-template-columns:1fr 1fr}}
@media (max-width:560px){.grade{grid-template-columns:1fr}.topo .lema-topo{display:none}.mat .corpo p{font-size:18px}}
`;

function moldura({ titulo, descricao, canonico, ld, corpo, faixa = '', tipoOg = 'website', imagem = '' }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><meta name="description" content="${esc(descricao)}"><link rel="canonical" href="${canonico}">
<meta property="og:type" content="${tipoOg}"><meta property="og:site_name" content="Mercado Macro"><meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${canonico}"><meta property="og:image" content="${imagem || SITE + '/previa-link-mercado-macro.png?v=3'}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:locale" content="pt_BR"><meta name="twitter:card" content="summary_large_image"><meta name="robots" content="index,follow,max-image-preview:large">
<link rel="alternate" type="application/rss+xml" title="Jornal Mercado Macro" href="${SITE}/jornal/rss.xml">
<link rel="icon" href="/favicon.ico"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;600;700&display=swap">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}
<style>${CSS}</style></head><body>
<div class="topo sans"><span><span class="lema-topo">${esc(dataLonga(Date.now()))} · </span><a href="/jornal">Últimas</a> · <a href="/fechamento-do-mercado">Fechamento</a> · <a href="/indicadores-hoje">Indicadores</a></span><a class="bt" href="/?origem=jornal">Abrir o terminal</a></div>
<header class="cab"><div class="nome"><a href="/jornal">Jornal Mercado Macro</a></div><div class="lema">Economia e mercados, todo dia útil</div></header>
${faixa}
<main>${corpo}</main>
<footer><span>© Mercado Macro · Conteúdo informativo, não é recomendação de investimento.</span><span><a href="/jornal/sobre">Quem somos e política editorial</a> · <a href="/jornal/rss.xml">RSS</a> · <a href="/privacidade">Privacidade</a> · <a href="/termos">Termos</a></span></footer>
</body></html>`;
}

// faixa de cotações do último fechamento guardado (tabela fechamentos, src/fechamento-publico.js)
async function faixaCotacoes(env) {
  try {
    const r = await env.DB.prepare('SELECT dia, dados FROM fechamentos ORDER BY dia DESC LIMIT 1').first();
    if (!r) return '';
    const d = JSON.parse(r.dados), c = d.cards || {};
    const item = (k, cas) => { const x = c[k]; if (!x || x.v == null) return ''; const ch = x.ch; return `<span>${esc(x.nome)} <b>${Number(x.v).toLocaleString('pt-BR', { minimumFractionDigits: cas, maximumFractionDigits: cas })}</b>${ch != null && isFinite(ch) ? ` <span class="${ch >= 0 ? 'up' : 'dn'}">${ch > 0 ? '+' : ''}${ch.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</span>` : ''}</span>`; };
    const cot = [item('ibov', 0), item('dolar', 3), item('sp', 0), item('nasdaq', 0), item('brent', 2), item('btc', 0)].filter(Boolean).join('');
    if (!cot) return '';
    return `<div class="faixa sans"><span class="cot">${cot}</span><span>Fechamento de ${r.dia.slice(8, 10)}/${r.dia.slice(5, 7)} · <a href="/fechamento-do-mercado/${r.dia}">ver</a></span></div>`;
  } catch (e) { return ''; }
}

// 23/11/2026: links para as páginas grátis do site, na primeira vez que o assunto aparece (no máximo 3 por matéria)
const LINKS_INTERNOS = [
  [/\b(d[óo]lar)\b/i, '/indicadores-hoje'],
  [/\b(Ibovespa)\b/, '/fechamento-do-mercado'],
  [/\b(renda fixa|Tesouro Direto|CDBs?)\b/i, '/calculadora-renda-fixa'],
  [/\b(balan[çc]a comercial)\b/i, '/balanca-comercial'],
  [/\b(juros compostos)\b/i, '/calculadora-juros-compostos'],
];
export function corpoComLinks(pars) {
  const usados = new Set();
  return pars.map((p) => {
    let h = esc(p);
    for (const [re, url] of LINKS_INTERNOS) {
      if (usados.has(url) || usados.size >= 3) continue;
      if (re.test(h)) { h = h.replace(re, `<a class="int" href="${url}">$1</a>`); usados.add(url); }
    }
    return `<p>${h}</p>`;
  }).join('');
}
const num = (v, c) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const varp = (ch) => (ch == null ? '' : `<span class="${ch >= 0 ? 'up' : 'dn'}">${ch > 0 ? '+' : ''}${num(ch, 2)}%</span>`);
export function quadroHtml(q) {
  if (!q || !Array.isArray(q.itens) || !q.itens.length) return '';
  const acoes = (t, l) => (l && l.length ? `<p class="qa"><b>${t}:</b> ${l.map((a) => `${esc(a.t)} ${varp(a.ch)}`).join(' · ')}</p>` : '');
  return `<section class="quadro sans"><h2>${esc(q.rotulo || 'Números do terminal')}</h2><table><tbody>${q.itens.map((i) => `<tr><th scope="row">${esc(i.nome)}</th><td>${num(i.v, i.cas ?? 2)}</td><td>${varp(i.ch)}</td></tr>`).join('')}</tbody></table>${acoes('Maiores altas do Ibovespa', q.altas)}${acoes('Maiores baixas do Ibovespa', q.baixas)}<p class="qn">Dados do terminal Mercado Macro no momento da matéria. <a href="/indicadores-hoje">Ver indicadores de agora</a></p></section>`;
}

// imagem de compartilhamento por assunto, 1200x630 (27/11/2026, SEO): mesma regra de site/jornal-faixa.js, primeira opção
const IMG_ASSUNTO = [
  [/petr[óo]leo|brent|opep|combust[íi]vel|petrobras/i, 'petroleo'],
  [/bitcoin|cripto|ethereum/i, 'cripto'],
  [/\bouro\b|gold/i, 'ouro'],
  [/data ?cent(er|ro)|nuvem|\bcloud\b/i, 'datacenter'],
  [/nvidia|intelig[êe]ncia artificial|\bias?\b|chip|semicondutor|big techs?|tecnologia/i, 'chip'],
  [/embraer|avi[ãa]o|aeronave|a[ée]rea/i, 'aviao'],
  [/\bfed\b|powell|fomc|treasur/i, 'fed'],
  [/china|chin[êe]s|chinesa|pequim|xangai|yuan|[áa]sia/i, 'china'],
  [/agro|safra|soja|milho|gr[ãa]os|caf[ée]|conab|colheita|lavoura/i, 'agro'],
  [/porto|export|import|balan[çc]a comercial|com[ée]rcio exterior|frete|min[ée]rio/i, 'porto'],
  [/ind[úu]stria|industrial|\bpmi\b|f[áa]brica|montadora|ve[íi]culos|manufatura/i, 'industria'],
  [/ipca|infla[çc][ãa]o|pre[çc]os|alimentos|supermercado|varejo|consumo|vendas/i, 'mercado'],
  [/(ibovespa|bolsa|a[çc][õo]es)[^\s,;:]*\s+(\S+\s+){0,2}(cai|caiu|recua|recuou|despenca|perde|afunda|fecha em (queda|baixa)|em queda|em baixa)/i, 'queda'],
  [/ibovespa|bolsa|a[çc][õo]es|\bb3\b/i, 'bolsa'],
  [/congresso|c[âa]mara|senado|\bpec\b|vota[çc][ãa]o|deputad|senador/i, 'congresso'],
  [/bancos?\b|banc[áa]ri|cr[ée]dito|itaú|bradesco|santander|nubank|inadimpl/i, 'agencia'],
  [/fazenda|fiscal|governo|lula|haddad|bras[íi]lia|minist|copom|selic|or[çc]amento/i, 'brasilia'],
  [/d[óo]lar|c[âa]mbio|\breal\b/i, 'cambio'],
  [/fus[ãa]o|aquisi[çc][ãa]o|balan[çc]o|lucro|resultado|\bceo\b|empresa/i, 'reuniao'],
  [/eua|trump|tarifa|wall street|nova york|\bny\b|s&p|nasdaq|europa/i, 'wallstreet']];
const IMG_SECAO = { Mercados: 'bolsa', Economia: 'brasilia', Juros: 'brasilia', 'Câmbio': 'cambio', Empresas: 'reuniao', Internacional: 'wallstreet', Cripto: 'cripto', Commodities: 'petroleo2' };
export function imagemMateria(m) {
  const t = m.titulo || '';
  const a = IMG_ASSUNTO.find(([re]) => re.test(t));
  const nome = a ? a[1] : m.tipo === 'abertura' ? 'nyse' : m.tipo === 'fechamento' ? 'mesa' : IMG_SECAO[m.secao] || 'mesa';
  return `${SITE}/jornal-img/og/${nome}.jpg`;
}

export function paginaMateria(m, previa = false, outras = []) {
  const url = `${SITE}/jornal/${m.slug}`;
  const quando = m.publicado || m.criado;
  const enc = encodeURIComponent;
  const imagem = imagemMateria(m);
  const mudou = m.atualizado && m.atualizado > quando + 10 * 60000 ? m.atualizado : null;
  const ld = { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: m.titulo, description: m.linha_fina, datePublished: new Date(quando).toISOString(),
    dateModified: new Date(mudou || quando).toISOString(), mainEntityOfPage: url, image: [imagem], articleSection: m.secao, inLanguage: 'pt-BR', isAccessibleForFree: true,
    author: { '@type': 'Organization', name: 'Redação Mercado Macro', url: `${SITE}/jornal/sobre` },
    publisher: { '@type': 'NewsMediaOrganization', name: 'Mercado Macro', url: SITE, publishingPrinciples: `${SITE}/jornal/sobre`, logo: { '@type': 'ImageObject', url: `${SITE}/logo-mercado-macro.png` } } };
  const corpo = `<article class="mat">${previa ? '<div class="previa">Prévia: esta matéria ainda não foi publicada.</div>' : ''}
<p class="kick">${esc(m.secao)} · ${esc(TIPOS[m.tipo] || '')}</p><h1>${esc(m.titulo)}</h1><p class="lf">${esc(m.linha_fina)}</p>
<p class="assin">Por <b>Redação Mercado Macro</b> · ${esc(dataCurta(quando))}${mudou ? ` · atualizado ${esc(dataCurta(mudou))}` : ''}<br>Texto produzido com apoio de inteligência artificial a partir dos dados do terminal e de notícias de vários veículos, e revisado antes de publicar. <a href="/jornal/sobre">Como fazemos</a></p>
<div class="corpo">${corpoComLinks(m.corpo)}</div>
${quadroHtml(m.dados)}
${m.fontes.length ? `<section class="fontes"><h2>Fontes</h2><ul>${m.fontes.map((f) => `<li>${esc(f.f)}: <a href="${esc(f.link)}" rel="noopener nofollow" target="_blank">${esc(f.t)}</a></li>`).join('')}</ul></section>` : ''}
<div class="part"><a href="https://wa.me/?text=${enc(m.titulo + ' ' + url)}" target="_blank" rel="noopener">Compartilhar no WhatsApp</a><a href="https://t.me/share/url?url=${enc(url)}&amp;text=${enc(m.titulo)}" target="_blank" rel="noopener">Telegram</a><a href="https://twitter.com/intent/tweet?url=${enc(url)}&amp;text=${enc(m.titulo)}" target="_blank" rel="noopener">X</a><a href="https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}" target="_blank" rel="noopener">LinkedIn</a></div>
<div class="cta"><b>Acompanhe o mercado ao vivo</b>Cotações, notícias traduzidas na hora, agenda econômica e a Jade, assistente de IA, num só terminal. Teste grátis por 48 horas, sem cartão.<br><a href="/entrar?origem=jornal">Testar grátis</a></div>
${outras.length ? `<section class="leia sans"><h2>Leia também</h2><ul>${outras.map((o) => `<li><a href="/jornal/${esc(o.slug)}">${esc(o.titulo)}</a><span class="hora">${esc(o.secao)} · ${esc(dataCurta(o.publicado))}</span></li>`).join('')}</ul></section>` : ''}
<p class="aviso">Conteúdo informativo, sem recomendação de compra ou venda de ativos. Números de fontes públicas e de mercado, sujeitos a revisão.</p></article>`;
  return moldura({ titulo: `${m.titulo} | Jornal Mercado Macro`, descricao: m.linha_fina, canonico: url, ld, corpo, tipoOg: 'article', imagem });
}

export async function paginaJornal(req, env, p) {
  await tabela(env);
  if (p === '/jornal/rss.xml') return rss(env);
  if (p === '/jornal/sitemap-news.xml') return sitemapNoticias(env);
  if (p === '/jornal/sobre' || p === '/jornal/sobre/') return paginaSobre();
  if (p === '/jornal' || p === '/jornal/') {
    const ms = (await env.DB.prepare("SELECT * FROM jornal WHERE status = 'publicada' ORDER BY publicado DESC LIMIT 31").all()).results.map(linha);
    const faixa = await faixaCotacoes(env);
    let corpo;
    if (!ms.length) corpo = '<p class="vazio">As primeiras matérias saem em breve.</p>';
    else {
      const [l, ...resto] = ms;
      const lado = resto.slice(0, 6), grade = resto.slice(6);
      corpo = `<section class="capa"><div class="lead"><p class="kick">${esc(l.secao)}</p><h2><a href="/jornal/${l.slug}">${esc(l.titulo)}</a></h2><p class="lf">${esc(l.linha_fina)}</p><p>${esc(l.corpo[0] || '')}</p><a class="ler" href="/jornal/${l.slug}">Ler matéria completa <span aria-hidden="true">→</span></a><span class="hora">${esc(dataCurta(l.publicado))}</span></div>
<aside class="lado"><h3>Mais recentes</h3><ul>${lado.map((m) => `<li><a href="/jornal/${m.slug}">${esc(m.titulo)}</a><span class="hora">${esc(m.secao)} · ${esc(dataCurta(m.publicado))}</span></li>`).join('') || '<li class="hora">As próximas matérias aparecem aqui.</li>'}</ul></aside></section>
${grade.length ? `<section class="grade">${grade.map((m) => `<article><p class="kick">${esc(m.secao)}</p><h3><a href="/jornal/${m.slug}">${esc(m.titulo)}</a></h3><p>${esc(m.linha_fina)}</p><a class="ler" href="/jornal/${m.slug}" tabindex="-1" aria-hidden="true">Ler matéria completa →</a><span class="hora">${esc(dataCurta(m.publicado))}</span></article>`).join('')}</section>` : ''}`;
    }
    const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Jornal Mercado Macro', url: `${SITE}/jornal` };
    return html(moldura({ titulo: 'Jornal Mercado Macro: economia e mercados hoje', descricao: 'Abertura, fechamento e o assunto do dia no mercado brasileiro e internacional, com dados do terminal Mercado Macro.', canonico: `${SITE}/jornal`, ld, corpo, faixa }));
  }
  // 25/11/2026: matérias de hoje (horário de Brasília) para a faixa "Jornal de hoje" na aba Notícias do terminal
  if (p === '/jornal/hoje.json') {
    const agora = Date.now(), br = new Date(agora - 3 * 3600e3);
    const inicio = Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate()) + 3 * 3600e3;
    const rs = (await env.DB.prepare("SELECT slug, tipo, secao, titulo, linha_fina, publicado FROM jornal WHERE status = 'publicada' AND publicado >= ? ORDER BY publicado ASC LIMIT 6").bind(inicio).all()).results;
    const itens = rs.map((r) => ({ slug: r.slug, tipo: TIPOS[r.tipo] || r.tipo, secao: r.secao, titulo: r.titulo, linha_fina: r.linha_fina, publicado: r.publicado }));
    return new Response(JSON.stringify({ itens }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  }
  const slug = p.slice('/jornal/'.length).replace(/\/$/, '');
  const r = /^[a-z0-9-]{5,90}$/.test(slug) ? await env.DB.prepare("SELECT * FROM jornal WHERE slug = ? AND status = 'publicada'").bind(slug).first() : null;
  if (!r) return html(moldura({ titulo: 'Matéria não encontrada | Jornal Mercado Macro', descricao: 'Matéria não encontrada.', canonico: `${SITE}/jornal`, corpo: '<p class="vazio">Matéria não encontrada. <a href="/jornal">Ver as últimas</a>.</p>' }), 404);
  const outras = (await env.DB.prepare("SELECT slug, titulo, secao, publicado FROM jornal WHERE status = 'publicada' AND id != ? ORDER BY publicado DESC LIMIT 3").bind(r.id).all()).results;
  return html(paginaMateria(linha(r), false, outras));
}

async function rss(env) {
  const ms = (await env.DB.prepare("SELECT * FROM jornal WHERE status = 'publicada' ORDER BY publicado DESC LIMIT 30").all()).results;
  const itens = ms.map((r) => `<item><title>${esc(r.titulo)}</title><link>${SITE}/jornal/${r.slug}</link><guid isPermaLink="true">${SITE}/jornal/${r.slug}</guid><pubDate>${new Date(r.publicado).toUTCString()}</pubDate><category>${esc(r.secao)}</category><description>${esc(r.linha_fina)}</description></item>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Jornal Mercado Macro</title><link>${SITE}/jornal</link><description>Economia e mercados, todo dia útil.</description><language>pt-BR</language>${itens}</channel></rss>`,
    { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
}

// sitemap: matérias publicadas
export async function slugsParaSitemap(env) {
  try { await tabela(env); return (await env.DB.prepare("SELECT slug, publicado, atualizado FROM jornal WHERE status = 'publicada' ORDER BY publicado DESC LIMIT 1000").all()).results; } catch (e) { return []; }
}

/* Sitemap de notícias do Google (27/11/2026, SEO): só as matérias dos últimos 2 dias, como o Google News pede */
async function sitemapNoticias(env) {
  const r = (await env.DB.prepare("SELECT slug, titulo, publicado FROM jornal WHERE status = 'publicada' AND publicado > ? ORDER BY publicado DESC LIMIT 1000").bind(Date.now() - 2 * 86400000).all()).results;
  const x = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${r.map((m) => `  <url><loc>${SITE}/jornal/${x(m.slug)}</loc><news:news><news:publication><news:name>Jornal Mercado Macro</news:name><news:language>pt</news:language></news:publication><news:publication_date>${new Date(m.publicado).toISOString()}</news:publication_date><news:title>${x(m.titulo)}</news:title></news:news></url>`).join('\n')}
</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
}

/* Quem somos e política editorial (27/11/2026, SEO e transparência): como as matérias são feitas, com IA e revisão,
   de onde vêm os números, como corrigimos erros e o aviso de que não é recomendação de investimento */
function paginaSobre() {
  const url = `${SITE}/jornal/sobre`;
  const ld = { '@context': 'https://schema.org', '@type': 'AboutPage', name: 'Quem somos e política editorial', url,
    about: { '@type': 'NewsMediaOrganization', name: 'Mercado Macro', url: SITE, publishingPrinciples: url, correctionsPolicy: url + '#correcoes', email: 'contato@mercadomacro.com.br', logo: `${SITE}/logo-mercado-macro.png` } };
  const corpo = `<article class="mat"><p class="kick">Institucional</p><h1>Quem somos e política editorial</h1>
<p class="lf">O Jornal Mercado Macro explica, todo dia útil, o que mexeu com a bolsa, o dólar, os juros e a economia, em português direto.</p>
<div class="corpo">
<h2>Quem somos</h2>
<p>O Mercado Macro é um terminal financeiro brasileiro que reúne cotações, indicadores, notícias e ferramentas de análise num só lugar. O Jornal Mercado Macro é a parte editorial do projeto: abertura e fechamento do mercado, os assuntos do dia e explicações sobre economia.</p>
<h2>Como as matérias são feitas</h2>
<p>As matérias são escritas com apoio de inteligência artificial, a partir de duas bases: os números registrados pelo próprio terminal no momento da matéria (cotações, juros, indicadores) e notícias de vários veículos, sempre listados no fim de cada texto, na seção Fontes, com link.</p>
<p>Antes de publicar, cada matéria passa por revisão da equipe do Mercado Macro, que confere os números com os dados do terminal, retira afirmações sem fonte e ajusta o texto. Matérias que não passam na revisão não são publicadas.</p>
<h2>De onde vêm os números</h2>
<p>Banco Central, IBGE, Tesouro Direto, B3 e dados de mercado de bolsas do Brasil e do exterior. Quando um número vem de outro veículo, a matéria diz qual. Os números de mercado podem ter atraso de alguns minutos e são revisados pelas fontes oficiais.</p>
<h2 id="correcoes">Correções</h2>
<p>Se encontrar um erro, escreva para <a href="mailto:contato@mercadomacro.com.br">contato@mercadomacro.com.br</a>. Erros de informação são corrigidos na própria matéria, que passa a mostrar a data de atualização.</p>
<h2>Independência e investimentos</h2>
<p>O conteúdo é informativo e não é recomendação de compra ou venda de ativos. O Jornal não publica conteúdo pago disfarçado de notícia. Antes de investir, avalie seu perfil e, se precisar, procure um profissional certificado.</p>
<h2>Contato</h2>
<p><a href="mailto:contato@mercadomacro.com.br">contato@mercadomacro.com.br</a> · <a href="/">Terminal Mercado Macro</a> · <a href="/privacidade">Política de privacidade</a></p>
</div></article>`;
  return new Response(moldura({ titulo: 'Quem somos e política editorial | Jornal Mercado Macro', descricao: 'Como o Jornal Mercado Macro faz as matérias: dados do terminal, fontes citadas, apoio de inteligência artificial e revisão antes de publicar.', canonico: url, ld, corpo }),
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
