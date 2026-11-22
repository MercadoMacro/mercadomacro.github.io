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
  let dados = '';
  if (tipo === 'abertura') dados = dadosParaManha(await deps.dadosAbertura(env));
  if (tipo === 'fechamento') {
    const d = await deps.dadosFechamento(env);
    if (!d || d.semDados || !d.pregao) return { erro: 'sem pregão hoje' };
    dados = dadosParaFechamento(d);
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
  const r = await escreverIA(env, pedido, INSTRUCOES_JORNAL, 60000);
  if (!r.ok) return { erro: r.erro || 'a IA não respondeu' };
  const m = lerMateria(r.texto, ms);
  if (!m) return { erro: 'a IA respondeu fora do formato' };
  let slug = `${dia}-${slugify(m.titulo)}`;
  if (await env.DB.prepare('SELECT 1 FROM jornal WHERE slug = ?').bind(slug).first()) slug += '-' + String(agora).slice(-4);
  const ins = await env.DB.prepare(`INSERT OR IGNORE INTO jornal (slug, chave, tipo, secao, titulo, linha_fina, corpo, fontes, status, criado, modelo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'rascunho', ?, ?)`)
    .bind(slug, chave, tipo, m.secao, m.titulo, m.linha_fina, JSON.stringify(m.paragrafos), JSON.stringify(m.fontes), agora, r.modelo || null).run();
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
export async function rodadaJornal(env, quando, diaUtil) {
  const tipo = slotDoJornal(quando, diaUtil);
  if (!tipo || !(await ligado(env))) return null;
  const chave = `${diaBR(+quando)}-${tipo}-${quando.getUTCHours()}`;
  const r = await gerarMateria(env, tipo, { agora: +quando, chave });
  if (r.erro && !r.ja) console.log('jornal:', tipo, r.erro);
  return r;
}

/* ---------------- administrador: /api/admin/jornal ---------------- */
const linha = (r) => ({ id: r.id, slug: r.slug, tipo: r.tipo, tipoNome: TIPOS[r.tipo] || r.tipo, secao: r.secao, titulo: r.titulo, linha_fina: r.linha_fina,
  corpo: JSON.parse(r.corpo || '[]'), fontes: JSON.parse(r.fontes || '[]'), status: r.status, criado: r.criado, publicado: r.publicado });
async function limparCache(slug) {
  if (typeof caches === 'undefined') return;
  const ps = ['/jornal', '/jornal/rss.xml', '/sitemap.xml', ...(slug ? ['/jornal/' + slug] : [])];
  await Promise.all(ps.map((p) => caches.default.delete(new Request(SITE + p)).catch(() => false)));
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
    return json({ ligado: await ligado(env), publicadas: pub.n, materias: lista, tipos: TIPOS, secoes: SECOES });
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
    await env.DB.prepare('UPDATE jornal SET titulo = ?, linha_fina = ?, corpo = ?, secao = ? WHERE id = ?').bind(titulo, linhaFina, JSON.stringify(pars), secao, id).run();
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
.grade article{border-top:1px solid var(--tinta);padding-top:10px}
.grade h3{font:700 21px/1.22 'Playfair Display',Georgia,serif;margin:0 0 6px}.grade p{margin:0;color:#333;font-size:15.5px}
.vazio{text-align:center;color:var(--cinza);padding:40px 0}
.mat{max-width:720px;margin:0 auto}
.mat h1{font:700 clamp(28px,4.4vw,44px)/1.12 'Playfair Display',Georgia,serif;margin:4px 0 12px}
.mat .lf{font-size:20px;line-height:1.45;color:#333;margin:0 0 16px}
.assin{font:13px/1.5 Inter,system-ui,sans-serif;color:var(--cinza);border-top:1px solid var(--fio);border-bottom:1px solid var(--fio);padding:10px 0;margin:0 0 22px}
.assin b{color:var(--tinta)}
.mat .corpo p{font-size:19px;line-height:1.7;margin:0 0 18px}
.mat .corpo p:first-child::first-letter{font:700 3.3em/.8 'Playfair Display',Georgia,serif;float:left;margin:6px 8px 0 0}
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

function moldura({ titulo, descricao, canonico, ld, corpo, faixa = '', tipoOg = 'website' }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title><meta name="description" content="${esc(descricao)}"><link rel="canonical" href="${canonico}">
<meta property="og:type" content="${tipoOg}"><meta property="og:site_name" content="Mercado Macro"><meta property="og:title" content="${esc(titulo)}"><meta property="og:description" content="${esc(descricao)}">
<meta property="og:url" content="${canonico}"><meta property="og:image" content="${SITE}/previa-link-mercado-macro.png?v=3"><meta property="og:locale" content="pt_BR"><meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="application/rss+xml" title="Jornal Mercado Macro" href="${SITE}/jornal/rss.xml">
<link rel="icon" href="/favicon.ico"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;600;700&display=swap">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : ''}
<style>${CSS}</style></head><body>
<div class="topo sans"><span><span class="lema-topo">${esc(dataLonga(Date.now()))} · </span><a href="/jornal">Últimas</a> · <a href="/fechamento-do-mercado">Fechamento</a> · <a href="/indicadores-hoje">Indicadores</a></span><a class="bt" href="/?origem=jornal">Abrir o terminal</a></div>
<header class="cab"><div class="nome"><a href="/jornal">Jornal Mercado Macro</a></div><div class="lema">Economia e mercados, todo dia útil</div></header>
${faixa}
<main>${corpo}</main>
<footer><span>© Mercado Macro · Conteúdo informativo, não é recomendação de investimento.</span><span><a href="/jornal/rss.xml">RSS</a> · <a href="/privacidade">Privacidade</a> · <a href="/termos">Termos</a></span></footer>
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

export function paginaMateria(m, previa = false) {
  const url = `${SITE}/jornal/${m.slug}`;
  const quando = m.publicado || m.criado;
  const enc = encodeURIComponent;
  const ld = { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: m.titulo, description: m.linha_fina, datePublished: new Date(quando).toISOString(),
    dateModified: new Date(quando).toISOString(), mainEntityOfPage: url, image: [`${SITE}/previa-link-mercado-macro.png?v=3`], articleSection: m.secao,
    author: { '@type': 'Organization', name: 'Redação Mercado Macro', url: SITE }, publisher: { '@type': 'Organization', name: 'Mercado Macro', logo: { '@type': 'ImageObject', url: `${SITE}/logo-mercado-macro.png` } } };
  const corpo = `<article class="mat">${previa ? '<div class="previa">Prévia: esta matéria ainda não foi publicada.</div>' : ''}
<p class="kick">${esc(m.secao)} · ${esc(TIPOS[m.tipo] || '')}</p><h1>${esc(m.titulo)}</h1><p class="lf">${esc(m.linha_fina)}</p>
<p class="assin">Por <b>Redação Mercado Macro</b> · ${esc(dataCurta(quando))}<br>Texto produzido com apoio de inteligência artificial a partir dos dados do terminal e de notícias de vários veículos, e revisado antes de publicar.</p>
<div class="corpo">${m.corpo.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
${m.fontes.length ? `<section class="fontes"><h2>Fontes</h2><ul>${m.fontes.map((f) => `<li>${esc(f.f)}: <a href="${esc(f.link)}" rel="noopener nofollow" target="_blank">${esc(f.t)}</a></li>`).join('')}</ul></section>` : ''}
<div class="part"><a href="https://wa.me/?text=${enc(m.titulo + ' ' + url)}" target="_blank" rel="noopener">Compartilhar no WhatsApp</a><a href="https://t.me/share/url?url=${enc(url)}&amp;text=${enc(m.titulo)}" target="_blank" rel="noopener">Telegram</a><a href="https://twitter.com/intent/tweet?url=${enc(url)}&amp;text=${enc(m.titulo)}" target="_blank" rel="noopener">X</a><a href="https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}" target="_blank" rel="noopener">LinkedIn</a></div>
<div class="cta"><b>Acompanhe o mercado ao vivo</b>Cotações, notícias traduzidas na hora, agenda econômica e a Jade, assistente de IA, num só terminal. Teste grátis por 48 horas, sem cartão.<br><a href="/entrar?origem=jornal">Testar grátis</a></div>
<p class="aviso">Conteúdo informativo, sem recomendação de compra ou venda de ativos. Números de fontes públicas e de mercado, sujeitos a revisão.</p></article>`;
  return moldura({ titulo: `${m.titulo} | Jornal Mercado Macro`, descricao: m.linha_fina, canonico: url, ld, corpo, tipoOg: 'article' });
}

export async function paginaJornal(req, env, p) {
  await tabela(env);
  if (p === '/jornal/rss.xml') return rss(env);
  if (p === '/jornal' || p === '/jornal/') {
    const ms = (await env.DB.prepare("SELECT * FROM jornal WHERE status = 'publicada' ORDER BY publicado DESC LIMIT 31").all()).results.map(linha);
    const faixa = await faixaCotacoes(env);
    let corpo;
    if (!ms.length) corpo = '<p class="vazio">As primeiras matérias saem em breve.</p>';
    else {
      const [l, ...resto] = ms;
      const lado = resto.slice(0, 6), grade = resto.slice(6);
      corpo = `<section class="capa"><div class="lead"><p class="kick">${esc(l.secao)}</p><h2><a href="/jornal/${l.slug}">${esc(l.titulo)}</a></h2><p class="lf">${esc(l.linha_fina)}</p><p>${esc(l.corpo[0] || '')}</p><span class="hora">${esc(dataCurta(l.publicado))}</span></div>
<aside class="lado"><h3>Mais recentes</h3><ul>${lado.map((m) => `<li><a href="/jornal/${m.slug}">${esc(m.titulo)}</a><span class="hora">${esc(m.secao)} · ${esc(dataCurta(m.publicado))}</span></li>`).join('') || '<li class="hora">As próximas matérias aparecem aqui.</li>'}</ul></aside></section>
${grade.length ? `<section class="grade">${grade.map((m) => `<article><p class="kick">${esc(m.secao)}</p><h3><a href="/jornal/${m.slug}">${esc(m.titulo)}</a></h3><p>${esc(m.linha_fina)}</p><span class="hora">${esc(dataCurta(m.publicado))}</span></article>`).join('')}</section>` : ''}`;
    }
    const ld = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Jornal Mercado Macro', url: `${SITE}/jornal` };
    return html(moldura({ titulo: 'Jornal Mercado Macro: economia e mercados hoje', descricao: 'Abertura, fechamento e o assunto do dia no mercado brasileiro e internacional, com dados do terminal Mercado Macro.', canonico: `${SITE}/jornal`, ld, corpo, faixa }));
  }
  const slug = p.slice('/jornal/'.length).replace(/\/$/, '');
  const r = /^[a-z0-9-]{5,90}$/.test(slug) ? await env.DB.prepare("SELECT * FROM jornal WHERE slug = ? AND status = 'publicada'").bind(slug).first() : null;
  if (!r) return html(moldura({ titulo: 'Matéria não encontrada | Jornal Mercado Macro', descricao: 'Matéria não encontrada.', canonico: `${SITE}/jornal`, corpo: '<p class="vazio">Matéria não encontrada. <a href="/jornal">Ver as últimas</a>.</p>' }), 404);
  return html(paginaMateria(linha(r)));
}

async function rss(env) {
  const ms = (await env.DB.prepare("SELECT * FROM jornal WHERE status = 'publicada' ORDER BY publicado DESC LIMIT 30").all()).results;
  const itens = ms.map((r) => `<item><title>${esc(r.titulo)}</title><link>${SITE}/jornal/${r.slug}</link><guid isPermaLink="true">${SITE}/jornal/${r.slug}</guid><pubDate>${new Date(r.publicado).toUTCString()}</pubDate><category>${esc(r.secao)}</category><description>${esc(r.linha_fina)}</description></item>`).join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Jornal Mercado Macro</title><link>${SITE}/jornal</link><description>Economia e mercados, todo dia útil.</description><language>pt-BR</language>${itens}</channel></rss>`,
    { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
}

// sitemap: matérias publicadas
export async function slugsParaSitemap(env) {
  try { await tabela(env); return (await env.DB.prepare("SELECT slug, publicado FROM jornal WHERE status = 'publicada' ORDER BY publicado DESC LIMIT 1000").all()).results; } catch (e) { return []; }
}
