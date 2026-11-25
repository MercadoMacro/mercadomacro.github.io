/* Relatório do Assessor (24/11/2026): o comentário escrito pela IA.
   A página /assessor lê o XPerformance no navegador do assessor e manda para cá só percentuais por classe, o score
   e o cenário: nada de nome, conta ou valor do cliente. A IA escreve três blocos curtos de apoio ao assessor. */
import { escreverIA } from './assistente.js';

export const INSTRUCOES_ASSESSOR = `Você escreve o comentário de um relatório que um assessor de investimentos certificado vai apresentar ao cliente dele.
Português do Brasil, frases curtas, tom profissional e claro, sem jargão desnecessário.
Responda SOMENTE com um JSON: {"leitura":["..."],"carteira":["..."],"conversa":["..."]}
- leitura: 1 ou 2 parágrafos curtos explicando o cenário macro (juros, inflação, juro real) com os números recebidos.
- carteira: 1 ou 2 parágrafos curtos sobre como a distribuição da carteira se compara à referência do cenário, citando as classes fora da faixa e o score.
- conversa: 2 a 4 frases curtas, cada uma um ponto para o assessor conversar com o cliente (perguntas sobre objetivos, prazos, liquidez, tolerância a oscilação).
Regras: use só os números recebidos; não invente dados; não cite nomes de produtos, fundos, ações ou emissores; não prometa rentabilidade; não diga "recomendo" nem "você deve": fale em "a referência do cenário indica", "vale avaliar"; lembre que a decisão considera o perfil e os objetivos do cliente; não use markdown.`;

function lerJson(texto) {
  const t = String(texto || '').replace(/```(?:json)?/g, '').trim();
  const i = t.indexOf('{'), f = t.lastIndexOf('}');
  if (i < 0 || f <= i) return null;
  try {
    const j = JSON.parse(t.slice(i, f + 1));
    const lim = (a, n) => (Array.isArray(a) ? a.map((x) => String(x).replace(/\s+/g, ' ').trim()).filter((x) => x.length > 10).slice(0, n).map((x) => x.slice(0, 900)) : []);
    const out = { leitura: lim(j.leitura, 2), carteira: lim(j.carteira, 2), conversa: lim(j.conversa, 4) };
    return out.leitura.length || out.carteira.length ? out : null;
  } catch (e) { return null; }
}

const num = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : null);
export async function apiAssessorTexto(req, env, u, { json, mesmaOrigem, dentroDoLimite }) {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  if (!mesmaOrigem(req)) return json({ erro: 'Origem não permitida.' }, 403);
  if (!(await dentroDoLimite(env, 'assessor:' + u.id, 30, 86400))) return json({ erro: 'Limite de 30 comentários por dia atingido.' }, 429);
  const corpo = await req.text().catch(() => '');
  if (corpo.length > 12000) return json({ erro: 'Pedido grande demais.' }, 413);
  let d; try { d = JSON.parse(corpo); } catch (e) { return json({ erro: 'Pedido inválido.' }, 400); }
  // só o que é agregado passa adiante (o que vier a mais é descartado)
  const limpo = {
    perfil: ['conservador', 'moderado', 'arrojado'].includes(d.perfil) ? d.perfil : 'moderado',
    cenario: { frases: (d.cenario?.frases || []).slice(0, 4).map((x) => String(x).slice(0, 200)), motivos: (d.cenario?.motivos || []).slice(0, 4).map((x) => String(x).slice(0, 200)) },
    classes: (d.classes || []).slice(0, 10).map((c) => ({ nome: String(c.nome).slice(0, 40), atual: num(c.atual), faixa: Array.isArray(c.faixa) ? c.faixa.slice(0, 2).map(num) : null })),
    score: { total: num(d.score?.total), leitura: String(d.score?.leitura || '').slice(0, 60), itens: (d.score?.itens || []).slice(0, 6).map((i) => ({ nome: String(i.nome).slice(0, 40), pontos: num(i.pontos), max: num(i.max) })) },
    maiorPeso: num(d.maiorPeso), credito: num(d.credito),
    estresse: (d.estresse || []).slice(0, 4).map((e) => ({ nome: String(e.nome).slice(0, 40), efeito: num(e.efeito) })),
  };
  const pedido = `Dados do relatório (percentuais do patrimônio):\n${JSON.stringify(limpo)}`;
  const r = await escreverIA(env, pedido, INSTRUCOES_ASSESSOR, 45000);
  if (!r.ok) return json({ erro: 'A IA não respondeu agora (' + (r.erro || 'sem resposta') + ').' }, 502);
  const out = lerJson(r.texto);
  if (!out) return json({ erro: 'A IA respondeu fora do formato.' }, 502);
  return json(out, 200, { 'Cache-Control': 'no-store' });
}
