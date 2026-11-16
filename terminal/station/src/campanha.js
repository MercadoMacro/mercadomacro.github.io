/* Campanha no WhatsApp (16/11/2026, pedido do Dante): "assine 1 mês, ganhe 2" para quem testou e não assinou.
   O admin vê cada pessoa com nome, número e um botão que abre o WhatsApp com a mensagem pronta (o envio é dele,
   no próprio WhatsApp). Os grupos saem do banco na hora: quem gerou Pix e não pagou, quem pagou a degustação,
   quem usou nas últimas 3 semanas e quem quase não usou. Fica marcado quem já recebeu (tabela campanha_envios). */

export const CAMPANHA = {
  id: 'assine1ganhe2-2026-11',
  titulo: 'Assine 1 mês, ganhe 2',
  ate: '22/11',
};
const ASSINATURA = 'Oi, {nome}! Aqui é o Dante, do Mercado Macro.\n\n';
const COMO = `É só entrar em mercadomacro.com.br/assinar com seu e-mail e escolher o plano de 1 mês. Vale até domingo (${CAMPANHA.ate}).`;
export const GRUPOS = {
  quase: {
    nome: 'Quase assinaram',
    dica: 'Geraram o Pix e não pagaram',
    texto: ASSINATURA + 'Vi que você chegou a gerar o Pix da assinatura e acabou não finalizando. Para facilitar, separei uma condição só para você: assinando 1 mês (R$ 24,90 no Pix), você ganha 2 meses de acesso.\n\n' + COMO + '\n\nQualquer dúvida, é só me chamar aqui.',
  },
  degustacao: {
    nome: 'Pagaram a degustação',
    dica: 'Já pagaram R$ 4,99 uma vez',
    texto: ASSINATURA + 'Obrigado por ter testado a degustação. Tenho uma condição especial para quem já conhece o terminal: assinando 1 mês (R$ 24,90 no Pix), você ganha 2 meses de acesso completo, com Mercado, Indicadores, Fundamentos, Calendário e a Jade.\n\n' + COMO,
  },
  recente: {
    nome: 'Usaram recentemente',
    dica: 'Entraram nas últimas 3 semanas',
    texto: ASSINATURA + 'Vi que você aproveitou o terminal nos últimos dias. Para você continuar acompanhando o mercado com a gente, liberei uma condição: assinando 1 mês (R$ 24,90 no Pix), você ganha 2 meses de acesso.\n\n' + COMO + ' Qualquer dúvida, me chama aqui.',
  },
  pouco: {
    nome: 'Quase não usaram',
    dica: 'Cortesias e testes que quase não entraram',
    texto: ASSINATURA + 'O terminal mudou bastante desde o seu cadastro: notícias traduzidas na hora, a Jade no WhatsApp, a Mesa nova e muito mais.\n\nPara você voltar a conhecer, quem assina 1 mês (R$ 24,90 no Pix) ganha 2 meses de acesso. ' + COMO,
  },
};
// fora da campanha: a cortesia do Murilo Severino fica como está (pedido do Dante)
const FORA = new Set([12]);
const PAGOS = new Set(['mensal', 'trimestral', 'semestral', 'anual']);

const primeiroNome = (n) => {
  const p = String(n || '').trim().split(/\s+/)[0] || '';
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : '';
};
const numeroWa = (c) => {
  const d = String(c || '').replace(/\D/g, '');
  if (!d) return '';
  return d.startsWith('55') && d.length >= 12 ? d : (d.length === 10 || d.length === 11 ? '55' + d : d);
};

async function tabela(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS campanha_envios (campanha TEXT NOT NULL, usuario_id INTEGER NOT NULL, ts INTEGER NOT NULL, PRIMARY KEY (campanha, usuario_id))').run();
}

export async function listaCampanha(env) {
  await tabela(env);
  const agora = Date.now();
  const tresSemanas = new Date(agora - 21 * 864e5).toISOString();
  const r = await env.DB.prepare(`SELECT u.id, u.nome, u.celular, u.plano, u.status, u.expira, u.ultimo_acesso, u.sem_novidades,
      (SELECT COUNT(*) FROM pagamentos p WHERE p.usuario_id = u.id AND p.status IN ('vencido', 'aguardando') AND p.plano <> 'degustacao') pix_aberto,
      (SELECT COUNT(*) FROM pagamentos p WHERE p.usuario_id = u.id AND p.status = 'aprovado' AND p.plano = 'degustacao') degust,
      (SELECT COUNT(*) FROM pagamentos p WHERE p.usuario_id = u.id AND p.status = 'aprovado' AND p.plano <> 'degustacao') pagou,
      (SELECT COUNT(*) FROM pagamentos p WHERE p.usuario_id = u.id AND p.status = 'enviado') conferir,
      (SELECT ts FROM campanha_envios c WHERE c.campanha = ? AND c.usuario_id = u.id) enviado
    FROM usuarios u WHERE u.admin = 0 AND u.status IN ('ativo', 'expirado')`).bind(CAMPANHA.id).all();
  const pessoas = [];
  for (const u of r.results || []) {
    if (FORA.has(u.id) || u.sem_novidades) continue;
    // quem já é assinante pago (ou já pagou algum plano) não entra
    // (e quem mandou comprovante que ainda está para conferir)
    if (u.pagou || u.conferir || (u.status === 'ativo' && PAGOS.has(u.plano))) continue;
    // só quem está para vencer (até 7 dias) ou já venceu
    if (u.status === 'ativo' && u.expira && Date.parse(u.expira) > agora + 7 * 864e5) continue;
    const grupo = u.pix_aberto ? 'quase' : u.degust ? 'degustacao' : (u.ultimo_acesso && u.ultimo_acesso >= tresSemanas) ? 'recente' : 'pouco';
    const nome = primeiroNome(u.nome);
    const numero = numeroWa(u.celular);
    pessoas.push({
      id: u.id, nome: u.nome, grupo, numero, enviado: u.enviado || null,
      ativo: u.status === 'ativo', expira: u.expira ? String(u.expira).slice(0, 10) : '',
      ultimo: u.ultimo_acesso ? String(u.ultimo_acesso).slice(0, 10) : '',
      link: numero ? 'https://wa.me/' + numero + '?text=' + encodeURIComponent(GRUPOS[grupo].texto.replace('{nome}', nome)) : '',
    });
  }
  const ordem = { quase: 0, degustacao: 1, recente: 2, pouco: 3 };
  pessoas.sort((a, b) => ordem[a.grupo] - ordem[b.grupo] || (b.ultimo || '').localeCompare(a.ultimo || ''));
  return pessoas;
}

// GET: campanha + pessoas; POST {acao: 'enviado' | 'desmarcar', id}
export async function apiCampanhaAdmin(req, env, json) {
  if (req.method === 'GET') {
    const pessoas = await listaCampanha(env);
    const grupos = Object.fromEntries(Object.entries(GRUPOS).map(([k, g]) => [k, { nome: g.nome, dica: g.dica }]));
    return json({ campanha: CAMPANHA, grupos, pessoas }, 200, { 'Cache-Control': 'no-store' });
  }
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  const b = await req.json().catch(() => ({}));
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return json({ erro: 'Pessoa inválida.' }, 400);
  await tabela(env);
  if (b.acao === 'enviado') {
    await env.DB.prepare('INSERT INTO campanha_envios (campanha, usuario_id, ts) VALUES (?, ?, ?) ON CONFLICT(campanha, usuario_id) DO UPDATE SET ts = excluded.ts').bind(CAMPANHA.id, id, Date.now()).run();
    return json({ ok: true });
  }
  if (b.acao === 'desmarcar') {
    await env.DB.prepare('DELETE FROM campanha_envios WHERE campanha = ? AND usuario_id = ?').bind(CAMPANHA.id, id).run();
    return json({ ok: true });
  }
  return json({ erro: 'Ação desconhecida.' }, 400);
}
