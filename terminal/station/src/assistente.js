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

async function gemini(chave, contents) {
  let ultimo = '';
  for (const m of MODELOS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: INSTRUCOES }] }, contents, generationConfig: { maxOutputTokens: 1200 } }),
    }).catch((e) => ({ ok: false, status: 0, erroRede: String(e) }));
    if (r.status === 404) { ultimo = 'modelo ' + m + ' indisponível'; continue; }
    const j = r.json ? await r.json().catch(() => ({})) : {};
    if (!r.ok) return { ok: false, status: r.status, erro: j?.error?.message || r.erroRede || 'HTTP ' + r.status };
    const texto = (j?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    if (!texto) return { ok: false, status: 502, erro: j?.promptFeedback?.blockReason ? 'pergunta bloqueada pelo filtro do Google' : 'resposta vazia' };
    return { ok: true, texto, modelo: m };
  }
  return { ok: false, status: 404, erro: ultimo || 'nenhum modelo disponível' };
}

// /api/assistente: GET diz se está ligado; POST {pergunta, historico:[{p, r}]} responde
export async function apiAssistente(req, env, u) {
  const c = await config(env);
  if (req.method === 'GET') return json({ ligado: !!c.gemini_key, limite: u.admin ? null : PERGUNTAS_DIA });
  if (req.method !== 'POST' || !mesmaOrigem(req)) return json({ erro: 'Método não permitido.' }, 405);
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
  const r = await gemini(c.gemini_key, [...hist, { role: 'user', parts: [{ text: pergunta }] }]);
  if (r.ok) return json({ resposta: r.texto });
  if (r.status === 429) return json({ erro: 'O assistente atingiu o limite gratuito do Google por agora. Tente de novo mais tarde.' }, 429);
  return json({ erro: 'O assistente não conseguiu responder agora. Tente de novo em instantes.' }, 502);
}

// /api/admin/assistente: GET situação; POST {acao: 'chave', chave} | {acao: 'desligar'} | {acao: 'testar'}
export async function apiAdminAssistente(req, env) {
  const c = await config(env);
  if (req.method === 'GET') return json({ ligado: !!c.gemini_key, desde: c.gemini_desde || null });
  if (req.method !== 'POST' || !mesmaOrigem(req)) return json({ erro: 'Método não permitido.' }, 405);
  const b = await req.json().catch(() => ({}));
  if (b.acao === 'chave') {
    const chave = String(b.chave || '').replace(/\s+/g, '');
    if (!/^[\w.~+/=-]{20,400}$/.test(chave)) return json({ erro: 'Cole a chave como aparece no Google AI Studio.' }, 400);
    const t = await gemini(chave, [{ role: 'user', parts: [{ text: 'Responda só: ok' }] }]);
    if (!t.ok && t.status !== 429) return json({ erro: 'O Google não aceitou a chave: ' + t.erro }, 400);
    await salvarConfig(env, { gemini_key: chave, gemini_desde: new Date().toISOString() });
    return json({ ok: true });
  }
  if (b.acao === 'desligar') { await salvarConfig(env, { gemini_key: null, gemini_desde: null }); return json({ ok: true }); }
  if (b.acao === 'testar') {
    if (!c.gemini_key) return json({ erro: 'Salve a chave primeiro.' }, 400);
    const t = await gemini(c.gemini_key, [{ role: 'user', parts: [{ text: 'Em uma frase: o que é a taxa Selic?' }] }]);
    return t.ok ? json({ ok: true, resposta: t.texto, modelo: t.modelo }) : json({ erro: 'O Gemini não respondeu: ' + t.erro }, 502);
  }
  return json({ erro: 'Ação inválida.' }, 400);
}
