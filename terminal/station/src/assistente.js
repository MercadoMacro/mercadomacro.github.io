/* Assistente do site (29/10/2026): perguntas de quem está logado respondidas pelo Google Gemini.
   A chave da API do Gemini é colada em /admin e fica só no banco D1 (config gemini_key); nunca vai para o navegador.
   Faixa grátis do Gemini: limite de pedidos por minuto e por dia (por projeto do Google) e as conversas podem
   ser usadas pelo Google para melhorar os produtos dele (a página /privacidade avisa).
   Cada conta pode fazer PERGUNTAS_DIA perguntas por dia; o administrador não tem limite. */
let json, mesmaOrigem, config, salvarConfig, dentroDoLimite;
export function ligarAssistente(u) {
  ({ json, mesmaOrigem, config, salvarConfig, dentroDoLimite } = u);
}

// o primeiro que responder; se o Google tirar um modelo do ar (404), tenta o próximo
const MODELOS = ['gemini-3.8-flash', 'gemini-3.6-flash'];
const PERGUNTAS_DIA = 25;
const MAX_PERGUNTA = 1200;
const MAX_HISTORICO = 6; // pares pergunta/resposta anteriores que vão junto, para a conversa ter contexto

const INSTRUCOES = `Você é o assistente do Mercado Macro, um terminal financeiro brasileiro (cotações, mesa de operações, mapa de calor,
indicadores do Brasil e dos EUA, balanços, fluxo do investidor estrangeiro na B3, probabilidades do Fed e do Copom, calculadoras e opções).
Responda sempre em português do Brasil, de forma clara e curta (no máximo uns 6 parágrafos curtos ou uma lista), para quem acompanha o mercado.
Regras:
- Você NÃO tem acesso às cotações, notícias ou dados de agora. Nunca invente preços, taxas, datas ou números atuais; se a pergunta depender deles, diga que não tem esse dado e indique onde olhar no painel.
- Explique conceitos, indicadores, termos, como ler gráficos e como funcionam produtos (ações, juros, câmbio, derivativos, opções, renda fixa).
- Não faça recomendação individual de compra ou venda nem prometa resultado; quando fizer sentido, lembre que não é recomendação de investimento.
- Se não souber, diga que não sabe. Não use emojis.`;

// modelo que respondeu "muita procura" fica de lado por uns minutos (evita uma ida e volta perdida a cada pergunta)
const ocupadoAte = {};
// pensar pouco: o Gemini 3 pensa bastante por padrão e isso atrasa a resposta; se o Google recusar o campo, segue sem ele
let semThinking = false;

async function chamar(m, chave, contents, stream, comThinking) {
  const gc = { maxOutputTokens: 2048 };
  if (comThinking) gc.thinkingConfig = { thinkingLevel: 'low' };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: INSTRUCOES }] }, contents, generationConfig: gc }),
  }).catch((e) => ({ ok: false, status: 0, erroRede: String(e) }));
}

// stream = true devolve {ok, corpo: ReadableStream de texto puro}; sem stream, {ok, texto}
// preferido: modelo escolhido no /admin (config gemini_modelo), tentado antes dos outros
async function gemini(chave, contents, stream = false, preferido = '') {
  let ultimo = '', ocupado = 0;
  const agora = Date.now();
  const todos = [...new Set([preferido, ...MODELOS].filter(Boolean))];
  const lista = todos.filter((m) => !(ocupadoAte[m] > agora));
  for (const m of lista.length ? lista : todos) {
    let r = await chamar(m, chave, contents, stream, !semThinking);
    if (r.status === 400 && !semThinking) {
      const t = await r.text().catch(() => '');
      if (/thinking/i.test(t)) { semThinking = true; r = await chamar(m, chave, contents, stream, false); }
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
    if (!texto) return { ok: false, status: 502, erro: j?.promptFeedback?.blockReason ? 'pergunta bloqueada pelo filtro do Google' : 'resposta vazia' };
    return { ok: true, texto, modelo: m };
  }
  return { ok: false, status: ocupado || 404, erro: ultimo || 'nenhum modelo disponível' };
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
export async function apiAssistente(req, env, u, gratis) {
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
  const r = await gemini(c.gemini_key, [...hist, { role: 'user', parts: [{ text: pergunta }] }], !!b.stream, c.gemini_modelo);
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
