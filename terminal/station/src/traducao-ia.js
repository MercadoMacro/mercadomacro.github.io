/* Tradução das notícias no servidor com a IA da Cloudflare (Workers AI), 16/11/2026, pedido do Dante.
   Cada notícia em inglês é traduzida UMA vez e guardada no banco (tabela traducao_ia); todo assinante recebe a lista
   já traduzida. Limitador: no máximo LIMITE_DIA neurônios por dia (a cota grátis do plano é 10.000); passou disso, o
   servidor para de traduzir até a meia-noite UTC e o aparelho de cada pessoa traduz como antes (Google).
   O gasto é estimado pelo tamanho do texto (a IA não devolve a conta): ~4 letras por pedaço de texto em inglês. */

export const LIMITE_DIA = 9000;
// modelos e quanto cada um gasta, em neurônios por milhão de pedaços de texto (tabela de preços da Cloudflare)
export const MODELOS = {
  m2m: { id: '@cf/meta/m2m100-1.2b', ent: 31050, sai: 31050 },
  llama: { id: '@cf/meta/llama-3.1-8b-instruct-fast', ent: 4119, sai: 34868 },
};
export const MODELO_PADRAO = 'llama';

const pedacos = (t) => Math.ceil(String(t || '').length / 4);
const hojeUTC = () => new Date().toISOString().slice(0, 10);

export async function tabelas(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS traducao_ia (id TEXT PRIMARY KEY, titulo TEXT, trecho TEXT, modelo TEXT, ts INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS ia_uso (dia TEXT PRIMARY KEY, neuronios INTEGER NOT NULL DEFAULT 0, itens INTEGER NOT NULL DEFAULT 0)'),
  ]);
  // 19/11/2026: a manchete em inglês de onde a tradução veio (a fonte às vezes troca a manchete mantendo o mesmo link)
  if (!colunaOrig) { await env.DB.prepare('ALTER TABLE traducao_ia ADD COLUMN orig TEXT').run().catch(() => {}); colunaOrig = true; }
}
let colunaOrig = false;
const chaveOrig = (t) => String(t || '').replace(/^FinancialJuice:\s*/i, '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
export async function usoHoje(env) {
  const r = await env.DB.prepare('SELECT neuronios, itens FROM ia_uso WHERE dia = ?').bind(hojeUTC()).first().catch(() => null);
  return { neuronios: r ? r.neuronios : 0, itens: r ? r.itens : 0, limite: LIMITE_DIA };
}
export async function somarUso(env, neuronios, itens) {
  await env.DB.prepare('INSERT INTO ia_uso (dia, neuronios, itens) VALUES (?, ?, ?) ON CONFLICT(dia) DO UPDATE SET neuronios = neuronios + excluded.neuronios, itens = itens + excluded.itens')
    .bind(hojeUTC(), Math.ceil(neuronios), itens).run();
}
const custo = (m, ent, sai) => (ent * MODELOS[m].ent + sai * MODELOS[m].sai) / 1e6;

// traduz uma lista de textos curtos (inglês -> português do Brasil). Devolve { textos, neuronios }
export async function traduzir(env, textos, modelo = MODELO_PADRAO) {
  const M = MODELOS[modelo];
  if (!env.AI || !M) throw new Error('IA indisponível');
  if (modelo === 'm2m') {
    const out = [];
    let n = 0;
    for (const t of textos) {
      if (!t) { out.push(''); continue; }
      const r = await env.AI.run(M.id, { text: t, source_lang: 'english', target_lang: 'portuguese' });
      const pt = String(r && r.translated_text || '').trim();
      out.push(pt);
      n += custo('m2m', pedacos(t), pedacos(pt));
    }
    return { textos: out, neuronios: n };
  }
  // modelo de conversa: uma chamada por lote, com as linhas numeradas para não embaralhar
  const linhas = textos.map((t, i) => `${i + 1}. ${String(t || '').replace(/\s+/g, ' ').trim()}`).join('\n');
  const sistema = 'Você traduz manchetes e trechos de notícias financeiras do inglês para o português do Brasil. '
    + 'Mantenha nomes de empresas, siglas, tickers e números como estão. Use o vocabulário do mercado financeiro brasileiro '
    + '(ex.: "yields" = rendimentos, "Treasuries" = títulos do Tesouro americano, "earnings" = resultados, "Fed" fica Fed). '
    + 'Glossário obrigatório: "minutes" (do Fed, do BCE, do Copom etc.) = ata; "bullish" = de alta / otimista ("bullish USD" = dólar em alta); "bearish" = de baixa / pessimista; '
    + '"rate cut" = corte de juros; "rate hike" = alta de juros; "hawkish" = mais duro (contra a inflação); "dovish" = mais brando; '
    + '"payrolls" ou "nonfarm payrolls" = payroll (vagas fora do setor agrícola); "jobless claims" = pedidos de seguro-desemprego; '
    + '"guidance" = projeção da empresa; "beats" / "misses" (estimates) = supera / fica abaixo das estimativas; "stocks" = ações; '
    + '"shares" = ações; "bonds" = títulos; "rally" = alta forte; "sell-off" = onda de vendas; "crude" = petróleo; "bps" = pontos-base; '
    + '"retail sales" = vendas no varejo; "lows" / "highs" = mínimas / máximas; "print" (de um indicador) = leitura ou dado; '
    + '"safe haven" ou "haven" = porto seguro; "hot" (inflação) = acima do esperado. '
    + '"West Bank" = Cisjordânia (não é a Faixa de Gaza); "Gaza Strip" = Faixa de Gaza; "euro zone" ou "eurozone" = zona do euro; "Iran" = Irã; '
    + '"crackdown" = endurecimento ou restrições (não repressão, quando o assunto é regra ou comércio); "amid" = em meio a; '
    + 'use a colocação do Brasil ("o ouro se consolida", não "o ouro consolida-se"; "em um" em vez de "num"); '
    + '"public debt" ou "government debt" = dívida pública; "two more rate hikes" = mais duas altas de juros; o Fed é masculino (o Fed, do Fed). '
    + 'Escreva sempre em português do Brasil, nunca de Portugal (varejo e não retalho; ações e não acções; Irã e não Irão; econômico e não económico; fato e não facto). '
    + 'Estilo de manchete: direto, sem acrescentar palavras, sem ponto final no fim; em português só a primeira palavra e os nomes próprios começam com maiúscula (não copie as maiúsculas do inglês). '
    + 'Responda só com as traduções, uma por linha, com o mesmo número na frente, sem comentários.';
  const r = await env.AI.run(M.id, { messages: [{ role: 'system', content: sistema }, { role: 'user', content: linhas }], max_tokens: Math.min(4000, 60 + pedacos(linhas) * 2), temperature: 0.1 });
  const resp = String(r && (r.response ?? r.result?.response) || '');
  const mapa = {};
  resp.split('\n').forEach((l) => { const m = l.match(/^\s*(\d+)[.)]\s*(.+)$/); if (m) mapa[+m[1]] = m[2].trim(); });
  // sem ponto final quando o original não tinha (manchete)
  const out = textos.map((t, i) => { let x = t ? mapa[i + 1] || '' : ''; if (x && !/[.!?]$/.test(String(t).trim())) x = x.replace(/\.$/, ''); return x; });
  const ent = pedacos(sistema) + pedacos(linhas);
  return { textos: out, neuronios: custo(modelo, ent, pedacos(resp)) };
}

// admin: 20 manchetes em inglês recentes, traduzidas pelos dois modelos, para comparar (não guarda nada)
export async function testeAdmin(env, fontesBR) {
  const r = await env.DB.prepare(`SELECT titulo, fonte FROM noticias_hist WHERE dia >= date('now', '-1 day') AND fonte NOT IN (${fontesBR.map(() => '?').join(',')}) ORDER BY data DESC LIMIT 20`)
    .bind(...fontesBR).all();
  const tit = (r.results || []).map((x) => x.titulo);
  const fontes = (r.results || []).map((x) => x.fonte);
  const res = {};
  for (const m of Object.keys(MODELOS)) {
    const t0 = Date.now();
    try { const t = await traduzir(env, tit, m); res[m] = { textos: t.textos, neuronios: Math.round(t.neuronios), ms: Date.now() - t0 }; }
    catch (e) { res[m] = { erro: String(e.message || e).slice(0, 200) }; }
  }
  return { originais: tit, fontes, res };
}

/* 17/11/2026: a IA às vezes ainda escreve como em Portugal ("Irão", "zona euro", "económico", "a Fed") e trocou
   "West Bank" por "Faixa de Gaza". Esta revisão corrige depois da tradução (vale também para o que já estava guardado). */
const PT_BR = [
  ['Irão', 'Irã'], ['Teerão', 'Teerã'], ['Moscovo', 'Moscou'], ['zona euro', 'zona do euro'], ['o débito público agregado', 'a dívida pública agregada'], ['débito público agregado', 'dívida pública agregada'],
  ['do débito público', 'da dívida pública'], ['o débito público', 'a dívida pública'], ['débito público', 'dívida pública'],
  ['facto', 'fato'], ['factos', 'fatos'], ['registo', 'registro'], ['registos', 'registros'], ['equipa', 'equipe'], ['equipas', 'equipes'],
  ['accionista', 'acionista'], ['accionistas', 'acionistas'], ['acção', 'ação'], ['acções', 'ações'], ['retalho', 'varejo'],
  ['projecto', 'projeto'], ['projectos', 'projetos'], ['objectivo', 'objetivo'], ['objectivos', 'objetivos'], ['director', 'diretor'],
  ['sector', 'setor'], ['sectores', 'setores'], ['actual', 'atual'], ['actuais', 'atuais'], ['telemóvel', 'celular'], ['ecrã', 'tela'],
  ['a Fed', 'o Fed'], ['da Fed', 'do Fed'], ['na Fed', 'no Fed'], ['pela Fed', 'pelo Fed'], ['à Fed', 'ao Fed'],
  // 19/11/2026: palavras do inglês que a IA às vezes deixa sem traduzir ("acima de Lows de mais de um ano")
  ['lows', 'mínimas'], ['highs', 'máximas'],
];
const PT_BR_RE = PT_BR.map(([de, para]) => [new RegExp(`(?<![\\p{L}])${de}(?![\\p{L}])`, 'giu'), para]);
const igualCaixa = (orig, novo) => (orig[0] === orig[0].toUpperCase() && orig[0] !== orig[0].toLowerCase() ? novo[0].toUpperCase() + novo.slice(1) : novo);
/* 19/11/2026: manchete em inglês vem com Todas As Palavras Maiúsculas e a IA às vezes copia ("O Ouro Pega Fôlego, Mas
   Fica Acima..."). Em português só a primeira letra e os nomes próprios. Quando a tradução está nesse formato, a palavra
   com maiúscula que não aparece na manchete em inglês (Ouro, Fôlego, Mas, Fica) vai para minúscula; as que aparecem
   iguais lá (Nvidia, Fed, China, Trump) e as siglas ficam como estão. */
// nomes próprios em português que não aparecem iguais no inglês (Estados Unidos vem de "United States")
const NOMES_PT = new Set(('estados unidos reino casa branca banco central europeu tesouro congresso senado câmara suprema corte '
  + 'japão alemanha frança índia rússia irã coreia arábia saudita europa união europeia ásia américa brasil méxico canadá suíça itália '
  + 'espanha turquia ucrânia holanda bélgica suécia noruega dinamarca polônia grécia argentina chile colômbia peru venezuela áfrica sul '
  + 'oriente médio pequim xangai londres tóquio nova york cingapura hong kong taiwan síria líbano egito catar emirados árabes '
  + 'opep otan onu fmi bce pib ibovespa natal páscoa ação de graças').split(' '));
function semCaixaAlta(t, original) {
  const pal = t.match(/[\p{L}][\p{L}'’-]*/gu) || [];
  const grandes = pal.filter((w) => w.length >= 3);
  if (grandes.length < 3 || grandes.filter((w) => /^\p{Lu}/u.test(w)).length / grandes.length < 0.6) return t;
  const doIngles = new Set((String(original).match(/[\p{L}][\p{L}'’-]*/gu) || []).map((w) => w.toLowerCase()));
  let primeira = true;
  return t.replace(/(^|[^\p{L}'’-])([\p{L}][\p{L}'’-]*)/gu, (m, antes, w) => {
    const depoisDeDoisPontos = /[:;?!]\s*$/.test(antes) || /^\s*[-–—]\s*$/.test(antes);
    if (primeira) { primeira = false; return m; }
    if (depoisDeDoisPontos) return m;
    if (!/^\p{Lu}\p{Ll}/u.test(w)) return m; // sigla (EUA, PIB) ou já minúscula
    if (doIngles.has(w.toLowerCase()) || NOMES_PT.has(w.toLowerCase())) return m; // nome próprio (igual no inglês ou da lista)
    return antes + w[0].toLowerCase() + w.slice(1);
  });
}
export function paraBrasil(pt, original = '', titulo = false) {
  let t = String(pt || '');
  if (!t) return t;
  for (const [re, para] of PT_BR_RE) t = t.replace(re, (m) => igualCaixa(m, para));
  if (titulo) t = semCaixaAlta(t, original);
  t = t.replace(/(?<![\p{L}])económic/giu, (m) => igualCaixa(m, 'econômic'));
  if (/west bank/i.test(original) && !/gaza/i.test(original)) t = t.replace(/Faixa de Gaza/g, 'Cisjordânia');
  return t;
}

/* ---------- uso no site: a lista de notícias sai com tituloPt e trechoPt ---------- */
export const FONTES_BR = new Set(['Valor Econômico', 'InfoMoney', 'Investing.com BR', 'ADVFN BR', 'Notícia Brasil', 'BeInCrypto BR', 'Cointelegraph BR', 'Google News', 'Money Times', 'InvestNews', 'Valor Investe', 'Bloomberg Línea', 'Suno', 'BMC News', 'Invezz', 'Notícias Agrícolas', 'Folha', 'O Antagonista', 'Poder360', 'G1 Política', 'Agência Brasil']);
const limpaTit = (t) => String(t || '').replace(/^FinancialJuice:\s*/i, '').trim();
let traduzindo = false;

// põe as traduções guardadas na lista e, em segundo plano, traduz as que faltam (no máximo 36 por vez)
export async function aplicarTraducoes(env, ctx, lista) {
  if (!env?.DB || !Array.isArray(lista)) return;
  const en = lista.filter((n) => n && n.id && n.titulo && !FONTES_BR.has(n.fonte));
  if (!en.length) return;
  try {
    await tabelas(env);
    const ids = [...new Set(en.map((n) => n.id))], achou = new Map();
    for (let i = 0; i < ids.length; i += 90) {
      const parte = ids.slice(i, i + 90);
      const r = await env.DB.prepare(`SELECT id, titulo, trecho, orig FROM traducao_ia WHERE id IN (${parte.map(() => '?').join(',')})`).bind(...parte).all();
      (r.results || []).forEach((x) => achou.set(x.id, x));
    }
    const faltam = [];
    for (const n of en) {
      const t = achou.get(n.id);
      // tradução de uma manchete que já mudou (ou antiga, sem a manchete guardada) é refeita
      const atual = t && t.titulo && t.orig === chaveOrig(n.titulo);
      if (t && t.titulo && (atual || !t.orig)) { n.tituloPt = paraBrasil(t.titulo, n.titulo, true); if (t.trecho) n.trechoPt = paraBrasil(t.trecho, n.trecho); }
      if (!atual) faltam.push(n);
    }
    if (faltam.length && env.AI && !traduzindo) {
      traduzindo = true;
      const job = traduzirPendentes(env, faltam.sort((a, b) => (b.data || 0) - (a.data || 0)).slice(0, 36)).catch(() => {}).finally(() => { traduzindo = false; });
      if (ctx?.waitUntil) ctx.waitUntil(job); else await job;
    }
  } catch (e) { /* sem tradução do servidor: o aparelho traduz como antes */ }
}

async function traduzirPendentes(env, itens) {
  for (let i = 0; i < itens.length; i += 12) {
    const uso = await usoHoje(env);
    if (uso.neuronios >= LIMITE_DIA) return; // limitador: acabou a cota do dia
    const lote = itens.slice(i, i + 12);
    const textos = [];
    lote.forEach((n) => { textos.push(limpaTit(n.titulo)); textos.push(String(n.trecho || '').replace(/\s+/g, ' ').trim()); });
    const r = await traduzir(env, textos, MODELO_PADRAO);
    const agora = Date.now(), st = [];
    lote.forEach((n, k) => {
      const tit = r.textos[k * 2], tre = r.textos[k * 2 + 1];
      if (tit) st.push(env.DB.prepare('INSERT OR REPLACE INTO traducao_ia (id, titulo, trecho, modelo, ts, orig) VALUES (?, ?, ?, ?, ?, ?)').bind(n.id, tit.slice(0, 400), (tre || '').slice(0, 600), MODELO_PADRAO, agora, chaveOrig(n.titulo)));
    });
    if (st.length) await env.DB.batch(st);
    await somarUso(env, r.neuronios, st.length);
  }
}

// limpeza: traduções com mais de 30 dias saem do banco (as notícias já saíram da lista)
export async function limparTraducoes(env) {
  await tabelas(env);
  await env.DB.prepare('DELETE FROM traducao_ia WHERE ts < ?').bind(Date.now() - 30 * 864e5).run();
  await env.DB.prepare("DELETE FROM ia_uso WHERE dia < date('now', '-90 day')").run();
}
