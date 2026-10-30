/* Comunicado de novidades por e-mail, disparado pelo administrador em /admin.
   Vai para quem tem cadastro confirmado (liberado, aguardando ou vencido), uma vez por pessoa por comunicado.
   Cada e-mail leva um link para parar de receber novidades (/sair-da-lista); quem saiu não recebe os próximos. */

// utilidades do src/index.js, entregues por ligarComunicado() quando o worker carrega
let json, html, mesmaOrigem, config, sha256hex;
export function ligarComunicado(u) {
  ({ json, html, mesmaOrigem, config, sha256hex } = u);
}

const SITE = 'https://mercadomacro.com.br';
const MAIL_DE = 'Mercado Macro <acesso@mercadomacro.com.br>'; // o mesmo remetente dos e-mails da conta, que já chegam
const MAIL_RESPONDER = 'contato@mercadomacro.com.br';
const POR_VEZ = 40; // envios por clique (o Resend aceita poucos por segundo)

export const COMUNICADO = {
  id: '2026-10-novidades',
  assunto: 'O dólar mexeu. Agora você vê na hora.',
  previa: 'Cotações ao vivo, fundamentos com o balanço da CVM e as assinaturas chegaram ao Mercado Macro.',
  abertura: 'Sabe aquele F5 nervoso para ver se o dólar mexeu? Pode aposentar.',
  // foto do painel: tirada a pedido do Severino (o teste com foto caiu no spam); para voltar: foto: ['/vitrine/fotos/mesa.jpg', 'texto alternativo']
  foto: null,
  // o que é novo, com destaque
  itens: [
    ['Cotações ao vivo', 'Dólar, euro, libra, petróleo, ouro, prata, café, VIX e as principais criptomoedas se atualizam sozinhos na tela, sem apertar nada.'],
    ['Fundamentos com a fonte na mão', 'Abra o gráfico de uma ação da B3 e veja lucro, ROE, margem e endividamento logo acima. Cada balanço tem link para o documento original na CVM.'],
    ['Vai cortar ou subir os juros?', 'A chance de cada decisão do Copom, calculada pelas opções de Copom negociadas na B3, e a do Fed, no estilo do FedWatch da CME. Atualizado várias vezes por dia.'],
  ],
  // o resto do site, em grupos curtos
  secoes: [
    ['Mercado em tempo real', [
      ['Mesa', 'índices, moedas, juros, commodities e cripto numa tela só.'],
      ['Mapa de calor', 'quem subiu e quem caiu na bolsa, num olhar.'],
      ['Suas listas', 'monte listas de ativos favoritos; elas aparecem iguais no celular e no computador.'],
      ['Fluxo na B3', 'quanto estrangeiros e institucionais compraram ou venderam, dia a dia.'],
    ]],
    ['Juros e economia', [
      ['Curva de juros DI', 'o que o mercado projeta para os juros nos próximos anos.'],
      ['Boletim Focus', 'as projeções do mercado para Selic, inflação, dólar e PIB, direto do Banco Central, assim que saem.'],
      ['Indicadores com história', 'gráficos longos com os governos e os fatos que mexeram nos juros e no mercado marcados; um clique mostra o que aconteceu.'],
      ['Calendário econômico', 'a agenda da semana e os balanços das empresas do Brasil e dos EUA.'],
    ]],
    ['Notícias', [
      ['Mais de 25 veículos', 'Bloomberg, Valor, InfoMoney, CNBC, Money Times e outros num lugar só, com tradução para o português e as de maior impacto em destaque.'],
      ['Leitura Rápida', 'destaca o começo de cada palavra para o olho correr mais rápido. Pensada para quem tem TDAH ou só quer ler mais em menos tempo.'],
    ]],
    ['Empresas e grandes investidores', [
      ['Fundamentos de mais de 300 empresas', 'balanços da CVM, ranking por setor e também as empresas americanas.'],
      ['Onde estão os grandes', 'a posição dos especuladores nos futuros (CFTC) e as carteiras das grandes gestoras americanas (13F).'],
    ]],
    ['Ferramentas', [
      ['Calculadoras', 'planejamento financeiro, renda fixa, aposentadoria, inflação, moedas e preço médio, essencial para quem opera.'],
      ['Opções', 'montador de estratégias com gráfico de resultado, volatilidade e probabilidades, e uma trilha para quem está começando, com um resumo preparado com banqueiros e tesoureiros que vivem o mercado.'],
      ['Fechamento do mercado', 'todo dia útil às 18h, o resumo do dia em mercadomacro.com.br/fechamento-do-mercado.'],
    ]],
  ],
  planos: [['Grátis', '48 horas', 'R$ 0,00'], ['Degustação', '7 dias', 'R$ 4,99'], ['1 mês', 'pagamento único no Pix', 'R$ 29,90'], ['6 meses', 'pagamento único no Pix', 'R$ 149,90']],
  ps: 'O café continua por sua conta. A cotação dele, não.',
};

const esc = (x) => String(x).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || 'olá';

export function montarEmail(c, nome, linkSair) {
  const p = primeiroNome(nome);
  const texto = [`Olá, ${p}.`, '', c.abertura, '', 'O que chegou:', '',
    ...c.itens.map(([t, d]) => `- ${t}: ${d}`), '',
    'E tudo o que já estava lá:', '',
    ...(c.secoes || []).flatMap(([titulo, lista]) => [titulo.toUpperCase(), ...lista.map(([t, d]) => `- ${t}: ${d}`), '']),
    'E chegaram as assinaturas, pagas por Pix e sem renovação automática:',
    ...c.planos.map(([n, d, v]) => `- ${n} (${d}): ${v}`),
    'Os planos ficam em Ajustes > Conta > Assinatura.', '',
    `Abrir o Mercado Macro: ${SITE}/`, '', `PS: ${c.ps}`, '',
    'Você recebe este e-mail porque tem cadastro no Mercado Macro. Para não receber mais novidades: ' + linkSair,
    'Conteúdo informativo, não é recomendação de investimento.'].join('\n');
  const td = 'font-family:Arial,Helvetica,sans-serif;color:#1f2937';
  const htmlEmail = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.assunto)}</title></head>
<body style="margin:0;padding:0;background:#eef1f6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.previa)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0b1220;padding:20px 28px"><img src="${SITE}/logo-mercado-macro.png" alt="Mercado Macro" height="34" style="display:block;height:34px;border:0"></td></tr>
<tr><td style="${td};padding:28px 28px 8px;font-size:15px;line-height:1.6">
<p style="margin:0 0 14px">Olá, ${esc(p)}.</p>
<p style="margin:0 0 20px;font-size:18px;line-height:1.45;font-weight:700;color:#0b1220">${esc(c.abertura)}</p>
</td></tr>
${c.foto ? `<tr><td style="padding:0 28px 22px"><a href="${SITE}/"><img src="${SITE}${c.foto[0]}" alt="${esc(c.foto[1])}" width="504" style="display:block;width:100%;max-width:504px;height:auto;border:1px solid #dfe5ee;border-radius:8px"></a></td></tr>` : ''}
<tr><td style="${td};padding:0 28px 8px;font-size:15px;line-height:1.6"><p style="margin:0 0 12px;color:#4a5568">O que chegou:</p></td></tr>
${c.itens.map(([t, d]) => `<tr><td style="${td};padding:0 28px 14px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
<td width="4" style="background:#f0b90b;border-radius:2px"></td>
<td style="${td};padding:2px 0 2px 14px;font-size:14.5px;line-height:1.55"><b style="color:#0b1220">${esc(t)}</b><br><span style="color:#4a5568">${esc(d)}</span></td></tr></table></td></tr>`).join('\n')}
${c.secoes ? `<tr><td style="${td};padding:12px 28px 2px;font-size:15px;line-height:1.6"><p style="margin:0;font-weight:700;color:#0b1220;font-size:16px">E tudo o que já estava lá</p></td></tr>
${c.secoes.map(([titulo, lista]) => `<tr><td style="${td};padding:12px 28px 0"><p style="margin:0 0 6px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;color:#8a6d0b">${esc(titulo)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${lista.map(([t, d]) => `<tr><td valign="top" style="${td};padding:0 10px 7px 0;font-size:13px;color:#b8860b">&#9679;</td><td style="${td};padding:0 0 7px;font-size:14px;line-height:1.5"><b style="color:#0b1220">${esc(t)}:</b> <span style="color:#4a5568">${esc(d)}</span></td></tr>`).join('')}</table></td></tr>`).join('\n')}
<tr><td style="padding:10px 28px 0"><div style="border-top:1px solid #dfe5ee"></div></td></tr>` : ''}
<tr><td style="${td};padding:14px 28px 6px;font-size:15px;line-height:1.6">
<p style="margin:0 0 4px;font-weight:700;color:#0b1220">E chegaram as assinaturas</p>
<p style="margin:0 0 12px;color:#4a5568;font-size:14px">Pagas por Pix, sem renovação automática.</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #dfe5ee;border-radius:8px;border-collapse:separate">
${c.planos.map(([n, d, v], i) => `<tr><td style="${td};padding:9px 14px;font-size:14px;${i ? 'border-top:1px solid #dfe5ee;' : ''}"><b>${esc(n)}</b> <span style="color:#6b7280">${esc(d)}</span></td><td align="right" style="${td};padding:9px 14px;font-size:14px;font-weight:700;${i ? 'border-top:1px solid #dfe5ee;' : ''}">${esc(v)}</td></tr>`).join('\n')}
</table>
<p style="margin:10px 0 0;color:#6b7280;font-size:13px">Os planos ficam em Ajustes &gt; Conta &gt; Assinatura.</p>
</td></tr>
<tr><td align="left" style="padding:22px 28px 6px"><a href="${SITE}/" style="background:#f0b90b;color:#111111;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:15px;padding:12px 22px;border-radius:8px;display:inline-block">Abrir o Mercado Macro</a></td></tr>
<tr><td style="${td};padding:18px 28px 26px;font-size:14px;color:#4a5568"><b>PS:</b> ${esc(c.ps)}</td></tr>
<tr><td style="${td};padding:16px 28px 22px;background:#f5f7fb;font-size:12px;line-height:1.5;color:#6b7280">
Você recebe este e-mail porque tem cadastro no Mercado Macro. <a href="${esc(linkSair)}" style="color:#6b7280">Não quero receber novidades</a>.<br>
Conteúdo informativo, não é recomendação de investimento. · <a href="${SITE}/" style="color:#6b7280">mercadomacro.com.br</a></td></tr>
</table></td></tr></table></body></html>`;
  return { texto, html: htmlEmail };
}

/* ---------------- banco ---------------- */
let pronto = false;
async function garantir(env) {
  if (pronto) return;
  const cols = (await env.DB.prepare('PRAGMA table_info(usuarios)').all()).results.map((c) => c.name);
  const q = [];
  if (!cols.includes('sem_novidades')) q.push(env.DB.prepare('ALTER TABLE usuarios ADD COLUMN sem_novidades INTEGER NOT NULL DEFAULT 0'));
  if (!cols.includes('novidades_tok')) q.push(env.DB.prepare('ALTER TABLE usuarios ADD COLUMN novidades_tok TEXT'));
  q.push(env.DB.prepare('CREATE TABLE IF NOT EXISTS comunicados_envios (comunicado TEXT NOT NULL, usuario_id INTEGER NOT NULL, enviado TEXT NOT NULL, PRIMARY KEY (comunicado, usuario_id))'));
  await env.DB.batch(q);
  pronto = true;
}
const hex = (a) => [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
// cada pessoa tem um código fixo e aleatório para o link de sair da lista
async function linkSair(env, u) {
  let t = u.novidades_tok;
  if (!t) {
    t = hex(crypto.getRandomValues(new Uint8Array(20)));
    await env.DB.prepare('UPDATE usuarios SET novidades_tok = ? WHERE id = ? AND novidades_tok IS NULL').bind(t, u.id).run();
    t = (await env.DB.prepare('SELECT novidades_tok FROM usuarios WHERE id = ?').bind(u.id).first()).novidades_tok;
  }
  return SITE + '/sair-da-lista?t=' + t;
}
const DESTINO = `status IN ('ativo', 'pendente', 'expirado') AND admin = 0 AND sem_novidades = 0`;

async function enviar(env, para, assunto, corpo, sair) {
  const c = await config(env);
  if (!c.mail_key) return { ok: false, erro: 'e-mail desligado' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + c.mail_key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_DE, to: [para], reply_to: MAIL_RESPONDER, subject: assunto, text: corpo.texto, html: corpo.html,
      headers: { 'List-Unsubscribe': `<${sair}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } }),
  }).catch(() => null);
  if (!r) return { ok: false, erro: 'sem resposta do Resend' };
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true } : { ok: false, erro: j.message || 'HTTP ' + r.status };
}

/* ---------------- /admin ---------------- */
export async function apiComunicado(req, env, eu) {
  await garantir(env);
  const c = COMUNICADO;
  const contar = async () => {
    const tot = await env.DB.prepare(`SELECT COUNT(*) n FROM usuarios WHERE ${DESTINO}`).first();
    const env_ = await env.DB.prepare(`SELECT COUNT(*) n FROM comunicados_envios e JOIN usuarios u ON u.id = e.usuario_id WHERE e.comunicado = ? AND u.admin = 0 AND u.sem_novidades = 0`).bind(c.id).first();
    const pend = await env.DB.prepare(`SELECT COUNT(*) n FROM usuarios WHERE ${DESTINO} AND id NOT IN (SELECT usuario_id FROM comunicados_envios WHERE comunicado = ?)`).bind(c.id).first();
    const sairam = await env.DB.prepare(`SELECT COUNT(*) n FROM usuarios WHERE sem_novidades = 1`).first();
    return { total: tot.n, enviados: env_.n, pendentes: pend.n, sairam: sairam.n };
  };
  if (req.method === 'GET') {
    if (new URL(req.url).searchParams.get('previa') === '1') return html(montarEmail(c, eu.nome, SITE + '/sair-da-lista?t=exemplo').html);
    return json({ assunto: c.assunto, ligado: !!(await config(env)).mail_key, ...(await contar()) });
  }
  if (req.method !== 'POST' || !mesmaOrigem(req)) return json({ erro: 'Método não permitido.' }, 405);
  const b = await req.json().catch(() => ({}));
  if (b.acao === 'teste') {
    const u = await env.DB.prepare('SELECT id, nome, email, novidades_tok FROM usuarios WHERE id = ?').bind(eu.id).first();
    const sair = await linkSair(env, u);
    const r = await enviar(env, u.email, '[Teste] ' + c.assunto, montarEmail(c, u.nome, sair), sair);
    return r.ok ? json({ ok: true, para: u.email }) : json({ erro: 'O Resend não enviou: ' + r.erro + '.' }, 502);
  }
  if (b.acao === 'enviar') {
    const lista = (await env.DB.prepare(`SELECT id, nome, email, novidades_tok FROM usuarios WHERE ${DESTINO}
      AND id NOT IN (SELECT usuario_id FROM comunicados_envios WHERE comunicado = ?) ORDER BY id LIMIT ?`).bind(c.id, POR_VEZ).all()).results;
    let ok = 0; const falhas = [];
    for (const u of lista) {
      // reserva antes de enviar: dois cliques ao mesmo tempo não mandam o e-mail duas vezes
      const res = await env.DB.prepare('INSERT OR IGNORE INTO comunicados_envios (comunicado, usuario_id, enviado) VALUES (?, ?, ?)').bind(c.id, u.id, new Date().toISOString()).run();
      if (!res.meta.changes) continue;
      const sair = await linkSair(env, u);
      const r = await enviar(env, u.email, c.assunto, montarEmail(c, u.nome, sair), sair);
      if (r.ok) ok++;
      else { falhas.push(r.erro); await env.DB.prepare('DELETE FROM comunicados_envios WHERE comunicado = ? AND usuario_id = ?').bind(c.id, u.id).run(); }
      await new Promise((f) => setTimeout(f, 600)); // o Resend aceita 2 e-mails por segundo
    }
    return json({ ok: true, enviados_agora: ok, falhas: falhas.length, erro: falhas[0] || null, ...(await contar()) });
  }
  return json({ erro: 'Ação inválida.' }, 400);
}

/* ---------------- link "não quero receber novidades" ----------------
   Abrir o link só mostra o botão (programas de e-mail abrem links sozinhos para conferir); quem sai é o POST,
   que também atende o botão de descadastro do Gmail (List-Unsubscribe-Post). */
export async function paginaSairDaLista(req, env, paginaLink) {
  await garantir(env);
  const t = new URL(req.url).searchParams.get('t') || '';
  const invalido = () => paginaLink('Link inválido', '<div class="caixa"><p>Não encontramos esse cadastro. Abra de novo pelo e-mail ou escreva para contato@mercadomacro.com.br.</p></div>');
  if (!/^[a-f0-9]{40}$/.test(t)) return invalido();
  if (req.method === 'POST') {
    const r = await env.DB.prepare('UPDATE usuarios SET sem_novidades = 1 WHERE novidades_tok = ?').bind(t).run();
    if (!r.meta.changes) return invalido();
    return paginaLink('Pronto', '<div class="caixa"><p>Você não vai mais receber e-mails de novidades do Mercado Macro.</p><p>Os avisos da sua conta (senha, pagamento e validade do acesso) continuam chegando.</p></div>');
  }
  const u = await env.DB.prepare('SELECT 1 FROM usuarios WHERE novidades_tok = ?').bind(t).first();
  if (!u) return invalido();
  return paginaLink('Parar de receber novidades', `<form class="caixa" method="post" action="/sair-da-lista?t=${t}"><p>Confirme para não receber mais e-mails de novidades do Mercado Macro. Os avisos da sua conta (senha, pagamento e validade do acesso) continuam chegando.</p><button type="submit">Não quero receber novidades</button></form>`);
}
