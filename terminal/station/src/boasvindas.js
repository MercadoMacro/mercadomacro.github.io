/* E-mail de boas-vindas para quem assinou (26/10/2026).
   Vai uma vez por pessoa: sozinho no primeiro pagamento aprovado (no lugar do "pagamento confirmado", com a mesma
   informação de plano e validade no topo) ou pelo /admin, para quem já tinha pago antes.
   O texto padrão está aqui; o administrador pode trocar o assunto e o texto em /admin (ficam no D1, config bv_assunto e
   bv_texto). No texto, {nome} vira o primeiro nome; linha que começa com "- " vira item de lista. */

let json, html, mesmaOrigem, config, salvarConfig;
export function ligarBoasVindas(u) {
  ({ json, html, mesmaOrigem, config, salvarConfig } = u);
}

const SITE = 'https://mercadomacro.com.br';
const MAIL_DE = 'Mercado Macro <acesso@mercadomacro.com.br>';
const MAIL_RESPONDER = 'contato@mercadomacro.com.br';
const POR_VEZ = 40;

export const BV_PADRAO = {
  assunto: 'Boas-vindas ao Mercado Macro, {nome}',
  texto: `Boas-vindas, {nome}. Que bom ter você aqui.

Antes de você abrir o painel, queria contar uma coisa.

O Mercado Macro não foi feito por uma empresa gigante, nem por um robô sozinho. Ele é feito por gente de verdade. Gente que acorda cedo para conferir se a abertura saiu certa, que acompanha o pregão junto com você e que, às 18h, confere o fechamento antes de ele chegar ao seu celular.

Quando um número parece estranho, alguém vai atrás da fonte. Quando um assinante pede uma melhoria, alguém fica até tarde para fazer. É assim, um ajuste de cada vez, que o painel melhora todo dia.

O valor da sua assinatura é simbólico, e é exatamente ele que mantém tudo isso de pé: os servidores no ar, os dados atualizados e as novidades chegando. Você não está só comprando um acesso. Está ajudando a construir uma ferramenta que nós também usamos todos os dias.

Por onde começar:
- Mesa: o mercado inteiro numa tela só, com índices, moedas, juros e commodities.
- Notícias: os principais veículos num lugar só, com as de maior impacto em destaque.
- Probabilidades do Copom e do Fed: o que o mercado espera para os juros.
- Canal no Telegram: a abertura às 9h15 e o fechamento às 18h direto no seu celular.

Se algo não funcionar, ou se você sentir falta de alguma coisa, é só responder este e-mail. Ele chega direto para nós, e cada mensagem é lida por uma pessoa.

Obrigado por fazer parte disso.

Um abraço,
Equipe Mercado Macro`,
};

const esc = (x) => String(x).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || '';

async function textos(env) {
  const c = await config(env);
  return { assunto: c.bv_assunto || BV_PADRAO.assunto, texto: c.bv_texto || BV_PADRAO.texto, auto: c.bv_auto !== 'nao', ligado: !!c.mail_key, mail_key: c.mail_key, canal: !!c.tg_canal };
}

// monta o e-mail: pagamento = linha de plano e validade no topo (quando vem da aprovação), ou null
export function montarBoasVindas(t, nome, pagamento, canal) {
  const p = primeiroNome(nome);
  const troca = (s) => s.replace(/\{nome\}/g, p).replace(/,\s*\./g, '.').replace(/ ,/g, ',');
  const assunto = troca(t.assunto).replace(/,\s*$/, '');
  const blocos = troca(t.texto).trim().split(/\n\s*\n/);
  const tg = canal ? SITE + '/telegram?de=email' : null;
  const td = 'font-family:Georgia,\'Times New Roman\',serif;color:#1f2937';
  const htmlBloco = (b) => {
    const linhas = b.split('\n');
    const itens = linhas.filter((l) => /^\s*-\s+/.test(l));
    if (itens.length) {
      const cab = linhas.filter((l) => !/^\s*-\s+/.test(l)).join(' ').trim();
      return `${cab ? `<p style="margin:0 0 10px;font-weight:700;color:#0b1220">${esc(cab)}</p>` : ''}<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px">${itens.map((l) => {
        const x = l.replace(/^\s*-\s+/, ''), i = x.indexOf(':');
        const corpo = i > 0 ? `<b style="color:#0b1220">${esc(x.slice(0, i))}:</b>${esc(x.slice(i + 1))}` : esc(x);
        return `<tr><td valign="top" style="padding:0 10px 8px 0;color:#b8860b;font-size:13px">&#9679;</td><td style="${td};padding:0 0 8px;font-size:15px;line-height:1.55">${corpo}</td></tr>`;
      }).join('')}</table>`;
    }
    return `<p style="margin:0 0 16px">${linhas.map(esc).join('<br>')}</p>`;
  };
  const topo = pagamento ? `<tr><td style="padding:22px 28px 0"><div style="font-family:Arial,Helvetica,sans-serif;background:#f0fbf6;border:1px solid #bfe9d6;border-radius:8px;padding:12px 14px;font-size:14px;color:#14532d">Pagamento confirmado: plano <b>${esc(pagamento.plano)}</b> (${esc(pagamento.valor)}). Seu acesso vale até <b>${esc(pagamento.ate)}</b>.</div></td></tr>` : '';
  const htmlEmail = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(assunto)}</title></head>
<body style="margin:0;padding:0;background:#eef1f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0b1220;padding:20px 28px"><img src="${SITE}/logo-mercado-macro.png" alt="Mercado Macro" height="34" style="display:block;height:34px;border:0"></td></tr>
${topo}
<tr><td style="${td};padding:26px 28px 4px;font-size:16px;line-height:1.7">
${blocos.map(htmlBloco).join('\n')}
</td></tr>
<tr><td align="left" style="padding:4px 28px 8px"><a href="${SITE}/" style="background:#f0b90b;color:#111111;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:15px;padding:12px 22px;border-radius:8px;display:inline-block">Abrir o Mercado Macro</a></td></tr>
${tg ? `<tr><td style="font-family:Arial,Helvetica,sans-serif;padding:10px 28px 24px;font-size:14px;color:#4a5568">Abertura e fechamento no celular: <a href="${tg}" style="color:#1d4ed8;font-weight:700">entrar no canal do Telegram</a></td></tr>` : '<tr><td style="padding:0 0 16px"></td></tr>'}
<tr><td style="font-family:Arial,Helvetica,sans-serif;padding:16px 28px 22px;background:#f5f7fb;font-size:12px;line-height:1.5;color:#6b7280">
Você recebe este e-mail porque assinou o Mercado Macro. Conteúdo informativo, não é recomendação de investimento. · <a href="${SITE}/" style="color:#6b7280">mercadomacro.com.br</a></td></tr>
</table></td></tr></table></body></html>`;
  const texto = [pagamento ? `Pagamento confirmado: plano ${pagamento.plano} (${pagamento.valor}). Seu acesso vale até ${pagamento.ate}.\n` : '',
    troca(t.texto).trim(), '', `Abrir o Mercado Macro: ${SITE}/`, tg ? `Canal no Telegram: ${tg}` : '', '',
    'Conteúdo informativo, não é recomendação de investimento.'].filter((x, i) => x || i > 0).join('\n');
  return { assunto, texto, html: htmlEmail };
}

let pronto = false;
async function garantir(env) {
  if (pronto) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS boasvindas_envios (usuario_id INTEGER PRIMARY KEY, enviado TEXT NOT NULL)').run();
  pronto = true;
}

async function mandar(key, para, m) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_DE, to: [para], reply_to: MAIL_RESPONDER, subject: m.assunto, text: m.texto, html: m.html }),
  }).catch(() => null);
  if (!r) return { ok: false, erro: 'sem resposta do Resend' };
  const j = await r.json().catch(() => ({}));
  return r.ok ? { ok: true } : { ok: false, erro: j.message || 'HTTP ' + r.status };
}

// reserva e manda para uma pessoa (uma vez só); devolve null se já tinha recebido ou se não deve mandar
async function reservarEMandar(env, t, u, pagamento) {
  await garantir(env);
  const res = await env.DB.prepare('INSERT OR IGNORE INTO boasvindas_envios (usuario_id, enviado) VALUES (?, ?)').bind(u.id, new Date().toISOString()).run();
  if (!res.meta.changes) return null;
  const r = await mandar(t.mail_key, u.email, montarBoasVindas(t, u.nome, pagamento, t.canal));
  if (!r.ok) await env.DB.prepare('DELETE FROM boasvindas_envios WHERE usuario_id = ?').bind(u.id).run();
  return r;
}

// chamado na aprovação de um pagamento: no primeiro, as boas-vindas fazem o papel do "pagamento confirmado".
// Devolve null quando não mandou (desligado ou já recebeu): aí vai o e-mail de pagamento confirmado de sempre.
export async function boasVindasNoPagamento(env, u, pagamento) {
  const t = await textos(env);
  if (!t.auto || !t.mail_key) return null;
  return reservarEMandar(env, t, u, pagamento);
}

/* ---------------- /admin ---------------- */
const QUEM_PAGOU = `admin = 0 AND status IN ('ativo', 'expirado') AND id IN (SELECT usuario_id FROM pagamentos WHERE status = 'aprovado')`;
export async function apiBoasVindas(req, env, eu) {
  await garantir(env);
  const contar = async () => {
    const pagaram = (await env.DB.prepare(`SELECT COUNT(*) n FROM usuarios WHERE ${QUEM_PAGOU}`).first()).n;
    const faltam = (await env.DB.prepare(`SELECT COUNT(*) n FROM usuarios WHERE ${QUEM_PAGOU} AND id NOT IN (SELECT usuario_id FROM boasvindas_envios)`).first()).n;
    return { pagaram, faltam };
  };
  if (req.method === 'GET') {
    const t = await textos(env);
    if (new URL(req.url).searchParams.get('previa') === '1')
      return html(montarBoasVindas(t, eu.nome, { plano: '1 mês', valor: 'R$ 29,90', ate: new Date(Date.now() + 30 * 864e5).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) }, t.canal).html);
    return json({ assunto: t.assunto, texto: t.texto, padrao: t.assunto === BV_PADRAO.assunto && t.texto === BV_PADRAO.texto, auto: t.auto, ligado: t.ligado, ...(await contar()) });
  }
  if (req.method !== 'POST' || !mesmaOrigem(req)) return json({ erro: 'Método não permitido.' }, 405);
  const b = await req.json().catch(() => ({}));
  if (b.acao === 'salvar') {
    const assunto = String(b.assunto || '').trim().slice(0, 150), texto = String(b.texto || '').replace(/\r/g, '').trim().slice(0, 6000);
    if (assunto.length < 3 || texto.length < 20) return json({ erro: 'Escreva o assunto e o texto.' }, 400);
    await salvarConfig(env, { bv_assunto: assunto === BV_PADRAO.assunto ? null : assunto, bv_texto: texto === BV_PADRAO.texto.trim() ? null : texto });
    return json({ ok: true });
  }
  if (b.acao === 'padrao') { await salvarConfig(env, { bv_assunto: null, bv_texto: null }); return json({ ok: true }); }
  if (b.acao === 'auto') { await salvarConfig(env, { bv_auto: b.ligar ? null : 'nao' }); return json({ ok: true }); }
  const t = await textos(env);
  if (!t.mail_key) return json({ erro: 'Ligue o e-mail (Resend) em Ajustes primeiro.' }, 409);
  if (b.acao === 'teste') {
    const m = montarBoasVindas(t, eu.nome, { plano: '1 mês', valor: 'R$ 29,90', ate: new Date(Date.now() + 30 * 864e5).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) }, t.canal);
    const r = await mandar(t.mail_key, eu.email, { ...m, assunto: '[Teste] ' + m.assunto });
    return r.ok ? json({ ok: true, para: eu.email }) : json({ erro: 'O Resend não enviou: ' + r.erro + '.' }, 502);
  }
  if (b.acao === 'enviar') {
    // quem já tinha pago antes das boas-vindas existirem: recebe sem a linha de pagamento
    const lista = (await env.DB.prepare(`SELECT id, nome, email FROM usuarios WHERE ${QUEM_PAGOU} AND id NOT IN (SELECT usuario_id FROM boasvindas_envios) ORDER BY id LIMIT ?`).bind(POR_VEZ).all()).results;
    let ok = 0; const falhas = [];
    for (const u of lista) {
      const r = await reservarEMandar(env, t, u, null);
      if (!r) continue;
      if (r.ok) ok++; else falhas.push(r.erro);
      await new Promise((f) => setTimeout(f, 600)); // o Resend aceita 2 e-mails por segundo
    }
    return json({ ok: true, enviados_agora: ok, falhas: falhas.length, erro: falhas[0] || null, ...(await contar()) });
  }
  return json({ erro: 'Ação inválida.' }, 400);
}
