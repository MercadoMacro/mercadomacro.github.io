/* Assistente do site (29/10/2026): perguntas de quem está logado respondidas pelo Google Gemini.
   A chave da API do Gemini é colada em /admin e fica só no banco D1 (config gemini_key); nunca vai para o navegador.
   Faixa grátis do Gemini: limite de pedidos por minuto e por dia (por projeto do Google) e as conversas podem
   ser usadas pelo Google para melhorar os produtos dele (a página /privacidade avisa).
   Cada conta pode fazer PERGUNTAS_DIA perguntas por dia; o administrador não tem limite. */
import { retrato, FERRAMENTAS, executar, ligarDados, limpaPerfil, textoPerfil } from './assistente-dados.js';
let json, mesmaOrigem, config, salvarConfig, dentroDoLimite;
export function ligarAssistente(u) {
  ({ json, mesmaOrigem, config, salvarConfig, dentroDoLimite } = u);
}

// o primeiro que responder; se o Google tirar um modelo do ar (404), tenta o próximo
const MODELOS = ['gemini-3.8-flash', 'gemini-3.6-flash'];
const PERGUNTAS_DIA = 25;
const MAX_PERGUNTA = 1200;
const MAX_CONTEXTO = 4000; // texto da tela que o usuário pede para explicar (botão do robô)
const MAX_HISTORICO = 6; // pares pergunta/resposta anteriores que vão junto, para a conversa ter contexto

const INSTRUCOES = `Você é o assistente do Mercado Macro, um terminal financeiro brasileiro (cotações, mesa de operações, mapa de calor,
indicadores do Brasil e dos EUA, balanços, fluxo do investidor estrangeiro na B3, probabilidades do Fed e do Copom, calculadoras e opções).
Responda sempre em português do Brasil, de forma clara e curta (no máximo uns 6 parágrafos curtos ou uma lista), para quem acompanha o mercado.
Regras:
- A mensagem traz um bloco "Dados do terminal agora" com cotações, agenda e manchetes reais deste momento. Use esses números quando a pergunta pedir e diga o horário do dado.
- Para outros dados (outro ativo, histórico, probabilidades do Fed ou do Copom, fundamentos de empresa, fluxo do estrangeiro, notícias de um assunto, agenda dos próximos dias), chame as ferramentas disponíveis.
- Quando a mensagem trouxer um bloco de dados copiados da tela do terminal, você também pode comentar os números desse bloco, citando-os como estão.
- Nunca invente preços, taxas, datas ou números que não vieram desses blocos ou das ferramentas. Se um dado veio como "sem dado" ou com erro, diga que não tem esse dado agora e indique onde olhar no painel.
- Ajuste a linguagem ao nível de quem pergunta, quando informado. O Resumo semanal do Mercado Macro está na ferramenta resumo_semanal; perguntas sobre a watchlist usam a ferramenta radar_watchlist.
- Cotação e notícia mudam rápido: deixe claro que é o dado do horário informado. Explique por que um ativo se mexeu só com base nas manchetes recebidas, citando a fonte, e diga quando não houver manchete que explique.
- Explique conceitos, indicadores, termos, como ler gráficos e como funcionam produtos (ações, juros, câmbio, derivativos, opções, renda fixa).
- Não faça recomendação individual de compra ou venda nem prometa resultado; quando fizer sentido, lembre que não é recomendação de investimento.
- Se não souber, diga que não sabe. Não use emojis.`;

// modelo que respondeu "muita procura" fica de lado por uns minutos (evita uma ida e volta perdida a cada pergunta)
const ocupadoAte = {};
// pensar pouco: o Gemini 3 pensa bastante por padrão e isso atrasa a resposta; se o Google recusar o campo, segue sem ele
let semThinking = false;

async function chamar(m, chave, contents, stream, comThinking, instrucoes = INSTRUCOES, extra = null) {
  const gc = { maxOutputTokens: 2048 };
  if (comThinking) gc.thinkingConfig = { thinkingLevel: 'low' };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: instrucoes }] }, contents, generationConfig: gc, ...(extra || {}) }),
  }).catch((e) => ({ ok: false, status: 0, erroRede: String(e) }));
}

// stream = true devolve {ok, corpo: ReadableStream de texto puro}; sem stream, {ok, texto}
// preferido: modelo escolhido no /admin (config gemini_modelo), tentado antes dos outros
async function gemini(chave, contents, stream = false, preferido = '', instrucoes = INSTRUCOES, extra = null) {
  let ultimo = '', ocupado = 0;
  const agora = Date.now();
  const todos = [...new Set([preferido, ...MODELOS].filter(Boolean))];
  const lista = todos.filter((m) => !(ocupadoAte[m] > agora));
  for (const m of lista.length ? lista : todos) {
    let r = await chamar(m, chave, contents, stream, !semThinking, instrucoes, extra);
    if (r.status === 400 && !semThinking) {
      const t = await r.text().catch(() => '');
      if (/thinking/i.test(t)) { semThinking = true; r = await chamar(m, chave, contents, stream, false, instrucoes, extra); }
      else r = { ok: false, status: 400, json: async () => { try { return JSON.parse(t); } catch (e) { return {}; } } };
    }
    if (r.status === 404) { ultimo = 'modelo ' + m + ' indisponível'; continue; }
    if (!r.ok) {
      const j = r.json ? await r.json().catch(() => ({})) : {};
      // modelo sobrecarregado (503/500): tenta o próximo modelo antes de desistir
      if (r.status === 503 || r.status === 500) { ultimo = j?.error?.message || 'HTTP ' + r.status; ocupado = r.status; ocupadoAte[m] = Date.now() + 5 * 60000; continue; }
      return { ok: false, status: r.status, erro: j?.error?.message || r.erroRede || 'HTTP ' + r.status };
    }
    if (stream) return { ok: true, corpo: textoDoSSE(r.body), modelo: m };
    const j = await r.json().catch(() => ({}));
    const texto = (j?.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
    // com ferramentas, a resposta pode ser só um pedido de dados (functionCall), sem texto
    if (extra && j?.candidates?.[0]?.content) return { ok: true, texto, j, modelo: m };
    if (!texto) return { ok: false, status: 502, erro: j?.promptFeedback?.blockReason ? 'pergunta bloqueada pelo filtro do Google' : 'resposta vazia' };
    return { ok: true, texto, modelo: m };
  }
  return { ok: false, status: ocupado || 404, erro: ultimo || 'nenhum modelo disponível' };
}

// pergunta com as ferramentas do terminal: o Gemini pede dados (functionCall), o servidor busca e devolve,
// até ele responder em texto. No máximo RODADAS idas e voltas; depois disso, responde com o que tiver.
const RODADAS = 3;
async function responderComDados(chave, contents, preferido) {
  let modelo = preferido;
  for (let i = 0; i < RODADAS; i++) {
    const r = await gemini(chave, contents, false, modelo, INSTRUCOES, { tools: FERRAMENTAS });
    if (!r.ok) return r;
    modelo = r.modelo;
    const cont = r.j.candidates[0].content;
    const chamadas = (cont.parts || []).filter((p) => p.functionCall);
    if (!chamadas.length) return r.texto ? { ok: true, texto: r.texto, modelo } : { ok: false, status: 502, erro: 'resposta vazia' };
    // devolve a mensagem do modelo como veio (com a assinatura do raciocínio) e as respostas das ferramentas
    contents.push({ role: 'model', parts: cont.parts });
    const respostas = await Promise.all(chamadas.slice(0, 6).map(async (p) => ({
      functionResponse: { name: p.functionCall.name, response: { resultado: await executar(p.functionCall.name, p.functionCall.args || {}) } },
    })));
    contents.push({ role: 'user', parts: respostas });
  }
  contents.push({ role: 'user', parts: [{ text: 'Responda agora com os dados que já recebeu.' }] });
  return gemini(chave, contents, false, modelo);
}

// converte o SSE do Google ("data: {...}") em texto puro, pedaço a pedaço
function textoDoSSE(body) {
  const dec = new TextDecoder(), enc = new TextEncoder();
  let buf = '', algum = false;
  const linha = (l, ctl) => {
    if (!l.startsWith('data:')) return;
    try {
      const j = JSON.parse(l.slice(5));
      const t = (j?.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
      if (t) { algum = true; ctl.enqueue(enc.encode(t)); }
    } catch (e) {}
  };
  return body.pipeThrough(new TransformStream({
    transform(chunk, ctl) {
      buf += dec.decode(chunk, { stream: true });
      const ls = buf.split(/\r?\n/); buf = ls.pop();
      for (const l of ls) linha(l, ctl);
    },
    flush(ctl) {
      if (buf) linha(buf, ctl);
      if (!algum) ctl.enqueue(enc.encode('O Google não devolveu resposta para esta pergunta. Tente reformular.'));
    },
  }));
}

// /api/assistente: GET diz se está ligado; POST {pergunta, historico:[{p, r}]} responde
export async function apiAssistente(req, env, u, gratis, fontes) {
  const c = await config(env);
  if (req.method === 'GET') return json({ ligado: !!c.gemini_key, limite: u.admin ? null : PERGUNTAS_DIA, assinante: !gratis });
  if (req.method !== 'POST' || !mesmaOrigem(req)) return json({ erro: 'Método não permitido.' }, 405);
  // plano grátis: só as respostas prontas (no navegador); o Gemini é para assinantes
  if (gratis) return json({ erro: 'As perguntas ao Gemini são para assinantes.', codigo: 'assinar' }, 403);
  if (!c.gemini_key) return json({ erro: 'O assistente ainda não está ligado.' }, 503);
  const b = await req.json().catch(() => ({}));
  const pergunta = String(b.pergunta || '').trim().slice(0, MAX_PERGUNTA);
  if (!pergunta) return json({ erro: 'Escreva uma pergunta.' }, 400);
  if (!u.admin && !(await dentroDoLimite(env, 'ia:' + u.id, PERGUNTAS_DIA, 86400)))
    return json({ erro: `Você chegou ao limite de ${PERGUNTAS_DIA} perguntas por dia. Volte amanhã.` }, 429);
  if (!(await dentroDoLimite(env, 'ia-min:' + u.id, 6, 60))) return json({ erro: 'Muitas perguntas seguidas. Espere um minuto.' }, 429);
  const hist = (Array.isArray(b.historico) ? b.historico : []).slice(-MAX_HISTORICO)
    .filter((x) => x && typeof x.p === 'string' && typeof x.r === 'string')
    .flatMap((x) => [{ role: 'user', parts: [{ text: x.p.slice(0, MAX_PERGUNTA) }] }, { role: 'model', parts: [{ text: x.r.slice(0, 4000) }] }]);
  // "Explicar esta tela": o navegador manda o texto visível da aba aberta; vai junto só nesta pergunta
  const ctx = String(b.contexto || '').slice(0, MAX_CONTEXTO).trim();
  const aba = String(b.tela || '').replace(/["\n]/g, ' ').slice(0, 60).trim();
  const perfil = limpaPerfil(b.perfil);
  const c0 = c;
  if (fontes) ligarDados({ ...fontes, perfil, resumo: async () => c0.resumo_semanal || null });
  // lições do site sobre o assunto (o navegador acha e manda; o Gemini cita)
  const site = (Array.isArray(b.site) ? b.site : []).slice(0, 2).filter((x) => x && x.texto)
    .map((x) => `- ${String(x.tipo || 'conteúdo').slice(0, 40)} "${String(x.titulo || '').slice(0, 100)}"${x.trilha ? ' (trilha ' + String(x.trilha).slice(0, 60) + ')' : ''}: ${String(x.texto).slice(0, 1500)}`);
  const blocoSite = site.length ? `Conteúdo do próprio Mercado Macro sobre o assunto (prefira explicar com ele e cite pelo nome, por exemplo "lição X da aba Educação"):\n${site.join('\n')}\n\n` : '';
  const blocoPerfil = perfil ? textoPerfil(perfil) + '\n\n' : '';
  const agora = await retrato().catch(() => '');
  const blocoDados = agora ? `Dados do terminal agora (fonte: servidor de dados do Mercado Macro):\n"""\n${agora}\n"""\n\n` : '';
  const texto = blocoDados + blocoPerfil + blocoSite + (ctx ? `Dados que aparecem agora na tela "${aba || 'aberta'}" do terminal, copiados da página (use só estes números; não invente outros):\n"""\n${ctx.replace(/"""/g, '"')}\n"""\n\n${pergunta}` : pergunta);
  const contents = [...hist, { role: 'user', parts: [{ text: texto }] }];
  let r = await responderComDados(c.gemini_key, contents.slice(), c.gemini_modelo);
  // se as ferramentas falharem (modelo sem suporte, formato recusado), responde do jeito antigo, só com o retrato
  if (!r.ok && r.status === 400) r = await gemini(c.gemini_key, contents, !!b.stream, c.gemini_modelo);
  if (r.ok && r.texto != null && b.stream) return new Response(r.texto, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  if (r.ok && r.corpo) return new Response(r.corpo, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  if (r.ok) return json({ resposta: r.texto });
  if (r.status === 429) return json({ erro: 'O assistente atingiu o limite gratuito do Google por agora. Tente de novo mais tarde.' }, 429);
  if (r.status === 503 || r.status === 500) return json({ erro: 'O Google está com muita procura agora. Tente de novo em alguns minutos.' }, 503);
  return json({ erro: 'O assistente não conseguiu responder agora. Tente de novo em instantes.' }, 502);
}

// /api/admin/assistente: GET situação; POST {acao: 'chave', chave} | {acao: 'desligar'} | {acao: 'testar'}
export async function apiAdminAssistente(req, env) {
  const c = await config(env);
  if (req.method === 'GET') return json({ ligado: !!c.gemini_key, desde: c.gemini_desde || null, modelo: c.gemini_modelo || '' });
  if (req.method !== 'POST' || !mesmaOrigem(req)) return json({ erro: 'Método não permitido.' }, 405);
  const b = await req.json().catch(() => ({}));
  if (b.acao === 'chave') {
    const chave = String(b.chave || '').replace(/\s+/g, '');
    if (!/^[\w.~+/=-]{20,400}$/.test(chave)) return json({ erro: 'Cole a chave como aparece no Google AI Studio.' }, 400);
    const t = await gemini(chave, [{ role: 'user', parts: [{ text: 'Responda só: ok' }] }]);
    if (!t.ok && ![429, 500, 503].includes(t.status)) return json({ erro: 'O Google não aceitou a chave: ' + t.erro }, 400);
    await salvarConfig(env, { gemini_key: chave, gemini_desde: new Date().toISOString() });
    return json({ ok: true });
  }
  if (b.acao === 'desligar') { await salvarConfig(env, { gemini_key: null, gemini_desde: null, gemini_modelo: null }); return json({ ok: true }); }
  if (b.acao === 'testar') {
    if (!c.gemini_key) return json({ erro: 'Salve a chave primeiro.' }, 400);
    // mede cada modelo "flash" que a chave enxerga (até 5), um de cada vez, com a mesma pergunta curta
    const lst = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': c.gemini_key } })
      .then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    const disponiveis = (lst.models || [])
      .filter((x) => (x.supportedGenerationMethods || []).includes('generateContent'))
      .map((x) => String(x.name || '').replace(/^models\//, ''))
      .filter((n) => /^gemini-[\d.]+-flash(-lite)?$/.test(n));
    const candidatos = [...new Set([c.gemini_modelo, ...MODELOS, ...disponiveis.sort().reverse()].filter(Boolean))].slice(0, 5);
    const pergunta = [{ role: 'user', parts: [{ text: 'Em uma frase: o que é a taxa Selic?' }] }];
    const resultados = [];
    for (const m of candidatos) {
      const t0 = Date.now();
      let r = await chamar(m, c.gemini_key, pergunta, false, !semThinking);
      if (r.status === 400 && !semThinking) r = await chamar(m, c.gemini_key, pergunta, false, false);
      const ms = Date.now() - t0;
      const j = r.json ? await r.json().catch(() => ({})) : {};
      const texto = (j?.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('').trim();
      resultados.push({ modelo: m, ms, ok: r.ok && !!texto, status: r.status, resposta: texto.slice(0, 300), erro: r.ok ? '' : (j?.error?.message || 'HTTP ' + r.status).slice(0, 160) });
      if (r.ok) delete ocupadoAte[m];
    }
    return json({ ok: true, resultados, preferido: c.gemini_modelo || '' });
  }
  if (b.acao === 'preferir') {
    const m = String(b.modelo || '');
    if (m && !/^gemini-[\w.-]{1,40}$/.test(m)) return json({ erro: 'Modelo inválido.' }, 400);
    await salvarConfig(env, { gemini_modelo: m || null });
    return json({ ok: true });
  }
  return json({ erro: 'Ação inválida.' }, 400);
}

/* ---------------- resumo das notícias pela IA (07/11/2026, pedido do Severino) ----------------
   O Gemini lê as manchetes (e o trecho que vem no RSS) das últimas 12 horas e escreve um resumo por tema.
   Um resumo só para todo mundo, refeito no máximo a cada 15 minutos e guardado no D1 (tabela resumo_noticias):
   não gasta a cota grátis do Google a cada leitor nem as perguntas diárias de cada assinante. Só para assinantes. */
const RESUMO_MS = 15 * 60000;
const RESUMO_JANELA = 12 * 3600000;
const RESUMO_MAX = 140; // manchetes que vão ao Gemini
const FONTES_POLITICA = new Set(['O Antagonista', 'Poder360', 'G1 Política', 'Agência Brasil']); // grupo que o leitor liga à parte
const INSTRUCOES_RESUMO = `Você escreve o resumo das notícias do Mercado Macro, um terminal financeiro brasileiro, para quem acompanha o mercado.
Você recebe uma lista de manchetes (algumas em inglês, com um trecho quando houver), cada uma com hora (horário de Brasília) e fonte.
Escreva em português do Brasil, neste formato:
- Primeiro, um parágrafo curto (2 ou 3 frases) começando com "Em resumo:" com o que mais pesou no período.
- Depois, seções com título iniciado por "## ", só as que tiverem notícias, nesta ordem: Juros e bancos centrais; Brasil; Estados Unidos e mundo; Câmbio; Commodities; Empresas; Cripto.
- Em cada seção, de 2 a 6 itens começando com "- ", cada um com uma frase objetiva e a fonte entre parênteses no fim, por exemplo (Valor Investe). Junte manchetes do mesmo assunto num item só.
Regras:
- Use somente o que está nas manchetes. Não acrescente números, nomes, datas ou fatos que não estejam lá; copie os números como vieram.
- Traduza as manchetes em inglês. Não opine, não preveja e não faça recomendação de compra ou venda.
- Deixe de fora fofoca, esporte e assuntos sem relação com economia, mercados ou empresas.
- Não use emojis nem negrito.`;

const horaBR = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
export function manchetesParaResumo(lista, agora = Date.now()) {
  const vistos = new Set();
  return (Array.isArray(lista) ? lista : [])
    .filter((n) => n && typeof n.titulo === 'string' && n.titulo.trim() && Number.isFinite(+n.data) && agora - n.data < RESUMO_JANELA && !FONTES_POLITICA.has(n.fonte))
    .filter((n) => { const k = n.titulo.toLowerCase().replace(/[^a-z0-9à-ú]+/g, ' ').trim(); return !vistos.has(k) && vistos.add(k); })
    .sort((a, b) => ((b.finalScore || 0) - (a.finalScore || 0)) || (b.data - a.data))
    .slice(0, RESUMO_MAX)
    .sort((a, b) => b.data - a.data);
}
export function textoDasManchetes(ms) {
  return ms.map((n) => {
    const fonte = n.fonte === 'Google News' && n.veiculo ? n.veiculo : n.fonte;
    const trecho = String(n.trecho || n.resumo || '').replace(/\s+/g, ' ').trim().slice(0, 220);
    return `[${horaBR(+n.data)}] ${fonte}: ${n.titulo.replace(/\s+/g, ' ').trim()}${trecho ? ' | ' + trecho : ''}`;
  }).join('\n');
}

async function tabelaResumo(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS resumo_noticias (id INTEGER PRIMARY KEY, texto TEXT, gerado INTEGER, manchetes INTEGER, gerando INTEGER)').run();
  return env.DB.prepare('SELECT texto, gerado, manchetes, gerando FROM resumo_noticias WHERE id = 1').first();
}
const respostaResumo = (row, extra = {}) => json({ texto: row.texto, gerado: row.gerado, manchetes: row.manchetes, atualizaA: RESUMO_MS / 60000, ...extra });

// GET /api/noticias/resumo
export async function apiResumoNoticias(req, env, u, gratis, lerNoticias) {
  if (req.method !== 'GET') return json({ erro: 'Método não permitido.' }, 405);
  if (gratis) return json({ erro: 'O resumo das notícias pela IA é para assinantes.', codigo: 'assinar' }, 403);
  if (!u.admin && !(await dentroDoLimite(env, 'resumo:' + u.id, 30, 600))) return json({ erro: 'Muitos pedidos seguidos. Espere alguns minutos.' }, 429);
  const agora = Date.now();
  const row = await tabelaResumo(env);
  if (row?.texto && agora - row.gerado < RESUMO_MS) return respostaResumo(row);
  const c = await config(env);
  const anterior = (erro, status) => (row?.texto ? respostaResumo(row, { antigo: true }) : json({ erro }, status));
  if (!c.gemini_key) return anterior('O assistente de IA ainda não está ligado.', 503);
  // um pedido gera; os outros que chegarem juntos recebem o resumo anterior (ou "gerando")
  const trava = await env.DB.prepare(`INSERT INTO resumo_noticias (id, gerando) VALUES (1, ?1)
    ON CONFLICT(id) DO UPDATE SET gerando = ?1 WHERE gerando IS NULL OR gerando < ?2`).bind(agora, agora - 90000).run();
  if (!trava.meta?.changes) return anterior('O resumo está sendo gerado. Tente de novo em alguns segundos.', 503);
  const soltar = () => env.DB.prepare('UPDATE resumo_noticias SET gerando = NULL WHERE id = 1').run().catch(() => 0);
  try {
    const ms = manchetesParaResumo(await lerNoticias().catch(() => []), agora);
    if (ms.length < 5) { await soltar(); return anterior('Ainda não há manchetes suficientes para resumir.', 503); }
    const pedido = `Manchetes das últimas 12 horas (de ${horaBR(+ms[ms.length - 1].data)} a ${horaBR(+ms[0].data)}, horário de Brasília):\n\n${textoDasManchetes(ms)}`;
    const r = await gemini(c.gemini_key, [{ role: 'user', parts: [{ text: pedido }] }], false, c.gemini_modelo, INSTRUCOES_RESUMO);
    if (!r.ok) {
      await soltar();
      return anterior(r.status === 429 ? 'A IA atingiu o limite gratuito do Google por agora. Tente mais tarde.' : 'A IA não conseguiu resumir agora. Tente de novo em alguns minutos.', r.status === 429 ? 429 : 503);
    }
    const texto = r.texto.replace(/\*\*(.+?)\*\*/g, '$1').trim().slice(0, 8000);
    const gerado = Date.now();
    await env.DB.prepare('UPDATE resumo_noticias SET texto = ?, gerado = ?, manchetes = ?, gerando = NULL WHERE id = 1').bind(texto, gerado, ms.length).run();
    return respostaResumo({ texto, gerado, manchetes: ms.length });
  } catch (e) {
    await soltar();
    return anterior('A IA não conseguiu resumir agora.', 503);
  }
}
