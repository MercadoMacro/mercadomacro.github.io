/* Assinatura com cartão pelo Stripe (30/10/2026), ao lado do Pix manual.
   A chave secreta do Stripe é colada em /admin e fica só no D1 (config stripe_key); ao salvar, o site cria sozinho
   o webhook no Stripe e guarda o segredo dele (stripe_whsec). Os dados do cartão nunca passam pelo site:
   a pessoa paga na página do próprio Stripe (Checkout) e o Stripe avisa o site pelo webhook.
   Cada fatura paga (invoice.paid) soma o período do plano na validade, igual a um Pix aprovado. */
import { PLANOS, somarPeriodo, baseValidade, registrar, garantirAssinatura, emailAprovado } from './assinatura.js';
let json, mesmaOrigem, config, salvarConfig, avisar, limparCacheSessao, dentroDoLimite;
export function ligarStripe(u) {
  ({ json, mesmaOrigem, config, salvarConfig, avisar, limparCacheSessao, dentroDoLimite } = u);
}

const SITE = 'https://mercadomacro.com.br';
const API = 'https://api.stripe.com/v1/';
const EVENTOS = ['checkout.session.completed', 'invoice.paid', 'invoice.payment_failed', 'customer.subscription.updated', 'customer.subscription.deleted'];
const reais = (c) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',');
const dataBR = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
// planos que renovam no cartão: os de meses que estão à venda (mensal, semestral, anual)
const recorrente = (id) => !!(PLANOS[id] && PLANOS[id].meses && !PLANOS[id].unico && !PLANOS[id].oculto);

// corpo no formato do Stripe (application/x-www-form-urlencoded, com colchetes para objetos e listas)
function form(obj, pre = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const nome = pre ? `${pre}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === 'object' ? form(x, `${nome}[${i}]`, out) : out.append(`${nome}[${i}]`, String(x))));
    else if (typeof v === 'object') form(v, nome, out);
    else out.append(nome, String(v));
  }
  return out;
}
async function stripe(chave, metodo, caminho, corpo) {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: { Authorization: 'Bearer ' + chave, ...(corpo ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: corpo ? form(corpo) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j.error && j.error.message) || 'Stripe HTTP ' + r.status); e.status = r.status; throw e; }
  return j;
}
const modoDaChave = (k) => (/^(sk|rk)_live_/.test(k) ? 'real' : 'teste');

// cria as colunas stripe_cliente, stripe_assinatura, stripe_cancela e pagamentos.ref, e a lista de faturas pagas sem conta
let orfasPronta = false;
const preparar = async (env) => {
  await garantirAssinatura(env);
  if (orfasPronta) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS stripe_orfas (id INTEGER PRIMARY KEY, fatura TEXT UNIQUE, cliente TEXT, assinatura TEXT, email TEXT,
    valor INTEGER, plano TEXT, fim_stripe TEXT, primeira INTEGER, criado TEXT, status TEXT, usuario_id INTEGER, decidido TEXT)`).run();
  orfasPronta = true;
};

/* ---------------- quem assina: /api/assinatura/cartao e /api/assinatura/cartao-gerenciar ---------------- */
export async function stripeLigado(env) { const c = await config(env); return !!(c.stripe_key && c.stripe_whsec); }
export async function situacaoCartao(env, uid) {
  await preparar(env);
  const u = await env.DB.prepare('SELECT stripe_cliente, stripe_assinatura, stripe_cancela FROM usuarios WHERE id = ?').bind(uid).first();
  let cancela = (u && u.stripe_cancela) || null;
  // confere no Stripe se a pessoa cancelou (cancelar no portal só marca o fim do período; o aviso do webhook pode não ter chegado)
  if (u && u.stripe_assinatura) {
    const c = await config(env);
    if (c.stripe_key) {
      try { cancela = await gravarCancela(env, uid, await stripe(c.stripe_key, 'GET', 'subscriptions/' + encodeURIComponent(u.stripe_assinatura))); } catch (e) {}
    }
  }
  return { cartao: await stripeLigado(env), renovaCartao: !!(u && u.stripe_assinatura), cancelaEm: u && u.stripe_assinatura ? cancela : null, temCliente: !!(u && u.stripe_cliente) };
}
// data em que a renovação para (cancelou no portal, vale até o fim do período pago) ou null se continua renovando
function fimDaAssinatura(sub) {
  if (!sub || !(sub.cancel_at_period_end || sub.cancel_at)) return null;
  const item = sub.items && sub.items.data && sub.items.data[0];
  const fim = sub.cancel_at || sub.current_period_end || (item && item.current_period_end);
  return fim ? new Date(fim * 1000).toISOString() : new Date().toISOString();
}
async function gravarCancela(env, uid, sub) {
  const cancela = fimDaAssinatura(sub);
  await env.DB.prepare('UPDATE usuarios SET stripe_cancela = ? WHERE id = ? AND stripe_assinatura = ?').bind(cancela, uid, sub.id || '').run();
  return cancela;
}
export async function apiCartao(req, env, conta, acao) {
  await preparar(env);
  const c = await config(env);
  if (!c.stripe_key || !c.stripe_whsec) return json({ erro: 'O pagamento com cartão ainda não está disponível.' }, 503);
  if (!(await dentroDoLimite(env, 'cartao:' + conta.id, 10, 3600))) return json({ erro: 'Muitas tentativas. Tente de novo mais tarde.' }, 429);
  const u = await env.DB.prepare('SELECT id, nome, email, stripe_cliente, stripe_assinatura FROM usuarios WHERE id = ?').bind(conta.id).first();
  try {
    // trocar cartão ou cancelar: página do próprio Stripe (portal do cliente)
    if (acao === 'cartao-gerenciar') {
      if (!u.stripe_cliente) return json({ erro: 'Você ainda não assinou com cartão.' }, 400);
      const s = await stripe(c.stripe_key, 'POST', 'billing_portal/sessions', { customer: u.stripe_cliente, return_url: SITE + '/assinar', ...(c.stripe_portal ? { configuration: c.stripe_portal } : {}) });
      return json({ url: s.url });
    }
    const b = await req.json().catch(() => ({}));
    if (!recorrente(b.plano)) return json({ erro: 'Escolha o plano mensal, semestral ou anual.' }, 400);
    if (u.stripe_assinatura) return json({ erro: 'Você já tem a renovação automática no cartão. Use "Gerenciar cartão" para trocar de plano ou cancelar.' }, 400);
    const p = PLANOS[b.plano];
    const s = await stripe(c.stripe_key, 'POST', 'checkout/sessions', {
      mode: 'subscription', locale: 'pt-BR',
      ...(u.stripe_cliente ? { customer: u.stripe_cliente } : { customer_email: u.email }),
      client_reference_id: String(u.id),
      line_items: [{ quantity: 1, price_data: { currency: 'brl', unit_amount: p.valorCartao || p.valor, recurring: { interval: 'month', interval_count: p.meses }, product_data: { name: `Mercado Macro: assinatura ${({ 1: 'mensal', 6: 'semestral', 12: 'anual' })[p.meses] || p.nome}` } } }],
      metadata: { usuario_id: String(u.id), plano: b.plano },
      subscription_data: { metadata: { usuario_id: String(u.id), plano: b.plano } },
      success_url: SITE + '/assinar?cartao=ok', cancel_url: SITE + '/assinar',
    });
    return json({ url: s.url });
  } catch (e) {
    return json({ erro: 'O Stripe não respondeu agora. Tente de novo em instantes.' }, 502);
  }
}

/* ---------------- webhook: /api/stripe/webhook ---------------- */
async function hmacHex(segredo, texto) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texto)))].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function iguais(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
// assinatura do Stripe: cabeçalho "t=<segundos>,v1=<hmac>"; aceita até 5 minutos de diferença
export async function assinaturaValida(segredo, cabecalho, corpo, agora = Date.now()) {
  const partes = String(cabecalho || '').split(',').map((x) => x.split('='));
  const t = (partes.find((x) => x[0] === 't') || [])[1];
  const v1 = partes.filter((x) => x[0] === 'v1').map((x) => x[1]);
  if (!t || !v1.length || Math.abs(agora / 1000 - Number(t)) > 300) return false;
  const esperado = await hmacHex(segredo, `${t}.${corpo}`);
  return v1.some((x) => iguais(x, esperado));
}

async function usuarioDoStripe(env, meta, cliente) {
  const id = Number(meta && meta.usuario_id);
  if (Number.isSafeInteger(id) && id > 0) { const u = await env.DB.prepare('SELECT id, nome, email, status, expira FROM usuarios WHERE id = ?').bind(id).first(); if (u) return u; }
  if (cliente) return env.DB.prepare('SELECT id, nome, email, status, expira FROM usuarios WHERE stripe_cliente = ?').bind(cliente).first();
  return null;
}
const metaDaFatura = (f) => (f.parent && f.parent.subscription_details && f.parent.subscription_details.metadata) || (f.subscription_details && f.subscription_details.metadata) || {};
const assinaturaDaFatura = (f) => (f.parent && f.parent.subscription_details && f.parent.subscription_details.subscription) || f.subscription || null;

// dados de uma fatura paga, do jeito que a liberação precisa (vêm do webhook ou da lista de faturas sem conta)
function dadosDaFatura(o, meta) {
  const per = o.lines && o.lines.data && o.lines.data[0] && o.lines.data[0].period;
  return {
    fatura: o.id, valor: o.amount_paid, cliente: o.customer || null, assinatura: assinaturaDaFatura(o),
    plano: recorrente(meta.plano) ? meta.plano : 'mensal',
    // nunca deixa vencer antes do fim do período pago no Stripe (mais 1 dia de folga para a próxima cobrança)
    fimStripe: per ? new Date((per.end + 86400) * 1000).toISOString() : null,
    primeira: o.billing_reason === 'subscription_create',
  };
}
// grava o pagamento e libera o acesso juntos (batch do D1 = transação). Duas faturas ao mesmo tempo: a validade é
// calculada sobre a conta lida agora, e a gravação só vale se a conta ainda estiver igual; senão lê de novo (até 5 vezes).
async function creditar(env, u, f, agora) {
  const plano = PLANOS[f.plano] || PLANOS.mensal, id = PLANOS[f.plano] ? f.plano : 'mensal';
  const ref = 'stripe:' + f.fatura;
  { const ja = await env.DB.prepare('SELECT usuario_id FROM pagamentos WHERE ref = ?').bind(ref).first(); if (ja) return { repetido: true, dono: ja.usuario_id }; }
  let validade = null, gravou = false;
  for (let tentativa = 0; tentativa < 5 && !gravou; tentativa++) {
    const atual = await env.DB.prepare('SELECT status, expira FROM usuarios WHERE id = ?').bind(u.id).first();
    if (!atual) break;
    validade = somarPeriodo(baseValidade(atual.status === 'ativo' ? atual.expira : null), plano);
    if (f.fimStripe && f.fimStripe > validade) validade = f.fimStripe;
    const [ins] = await env.DB.batch([
      env.DB.prepare(`INSERT INTO pagamentos (usuario_id, plano, valor, status, criado, decidido, validade, ref)
        SELECT ?, ?, ?, 'aprovado', ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM pagamentos WHERE ref = ?)
        AND EXISTS (SELECT 1 FROM usuarios WHERE id = ? AND status IS ? AND expira IS ?)`)
        .bind(u.id, id, f.valor, agora, agora, validade, ref, ref, u.id, atual.status, atual.expira),
      env.DB.prepare(`UPDATE usuarios SET status = 'ativo', expira = ?, plano = ?, aviso_venc = NULL, stripe_cliente = COALESCE(?, stripe_cliente),
        stripe_assinatura = COALESCE(?, stripe_assinatura), decidido = CASE WHEN status = 'ativo' THEN decidido ELSE ? END
        WHERE id = ? AND EXISTS (SELECT 1 FROM pagamentos WHERE ref = ? AND criado = ? AND usuario_id = ?)`)
        .bind(validade, id, f.cliente, f.assinatura, agora, u.id, ref, agora, u.id),
    ]);
    if (ins.meta.changes) { gravou = true; break; }
    { const ja = await env.DB.prepare('SELECT usuario_id FROM pagamentos WHERE ref = ?').bind(ref).first(); if (ja) return { repetido: true, dono: ja.usuario_id }; }
  }
  // não conseguiu gravar (a conta mudou em todas as tentativas): o Stripe reenvia depois
  if (!gravou) return { erro: 'Conta mudou durante a gravação; tente de novo.' };
  limparCacheSessao();
  await registrar(env, u.id, `${f.primeira ? 'Assinou' : 'Renovou'} no cartão (Stripe): ${plano.nome} (${reais(f.valor)}), acesso até ${dataBR(validade)}`);
  await avisar(env, f.primeira ? 'Nova assinatura no cartão' : 'Renovação no cartão', `${u.nome} (${u.email})\nPlano ${plano.nome}: ${reais(f.valor)}\nAcesso até ${dataBR(validade)}`).catch(() => {});
  if (f.primeira) await emailAprovado(env, new Request(SITE + '/'), u, { ...plano, valor: f.valor }, validade).catch(() => null);
  return { ok: true, validade };
}

export async function webhookStripe(req, env) {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  const c = await config(env);
  if (!c.stripe_whsec) return json({ erro: 'Desligado.' }, 503);
  const corpo = await req.text();
  if (corpo.length > 200000 || !(await assinaturaValida(c.stripe_whsec, req.headers.get('Stripe-Signature'), corpo))) return json({ erro: 'Assinatura inválida.' }, 400);
  let ev;
  try { ev = JSON.parse(corpo); } catch (e) { return json({ erro: 'Corpo inválido.' }, 400); }
  await preparar(env);
  const o = (ev.data && ev.data.object) || {};
  const agora = new Date().toISOString();

  if (ev.type === 'checkout.session.completed' && o.mode === 'subscription') {
    const u = await usuarioDoStripe(env, o.metadata, o.customer);
    if (u) await env.DB.prepare('UPDATE usuarios SET stripe_cliente = ?, stripe_assinatura = ? WHERE id = ?').bind(o.customer || null, o.subscription || null, u.id).run();
    return json({ ok: true });
  }

  if (ev.type === 'invoice.paid') {
    if (!(o.amount_paid > 0)) return json({ ok: true, ignorado: 'sem valor' });
    const meta = metaDaFatura(o);
    const f = dadosDaFatura(o, meta);
    const u = await usuarioDoStripe(env, meta, o.customer);
    if (!u) {
      // fatura paga sem conta (04/11/2026): fica guardada numa lista do /admin para ligar à conta certa depois
      const nova = await env.DB.prepare(`INSERT INTO stripe_orfas (fatura, cliente, assinatura, email, valor, plano, fim_stripe, primeira, criado, status)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aberta' WHERE NOT EXISTS (SELECT 1 FROM stripe_orfas WHERE fatura = ?)`)
        .bind(f.fatura, f.cliente, f.assinatura, o.customer_email || null, f.valor, f.plano, f.fimStripe, f.primeira ? 1 : 0, agora, f.fatura).run();
      if (nova.meta.changes) await avisar(env, 'Stripe: pagamento sem conta', `Fatura ${o.id} de ${reais(o.amount_paid)} paga, mas não achei a conta (${o.customer_email || 'sem e-mail'}). Ligue à conta certa em /admin > Pagamentos.`).catch(() => {});
      return json({ ok: true, semConta: true });
    }
    const r = await creditar(env, u, f, agora);
    if (r.repetido) return json({ ok: true, repetido: true });
    if (r.erro) return json({ erro: r.erro }, 503);
    return json({ ok: true });
  }

  if (ev.type === 'invoice.payment_failed') {
    const u = await usuarioDoStripe(env, metaDaFatura(o), o.customer);
    if (u) {
      await registrar(env, u.id, `Cobrança no cartão recusada (${reais(o.amount_due || 0)}); o Stripe tenta de novo nos próximos dias`);
      await avisar(env, 'Cartão recusado', `${u.nome} (${u.email}): a renovação de ${reais(o.amount_due || 0)} falhou. O Stripe tenta de novo.`).catch(() => {});
    }
    return json({ ok: true });
  }

  if (ev.type === 'customer.subscription.updated') {
    const u = await usuarioDoStripe(env, o.metadata, o.customer);
    if (u) {
      const antes = (await env.DB.prepare('SELECT stripe_cancela FROM usuarios WHERE id = ?').bind(u.id).first() || {}).stripe_cancela || null;
      const cancela = await gravarCancela(env, u.id, o);
      if (!antes && cancela) {
        await registrar(env, u.id, `Cancelou a renovação no cartão; o acesso vale até ${dataBR(u.expira)}`);
        await avisar(env, 'Cancelou a renovação no cartão', `${u.nome} (${u.email}) cancelou. Não haverá nova cobrança; o acesso vale até ${dataBR(u.expira)}.`).catch(() => {});
      } else if (antes && !cancela) await registrar(env, u.id, 'Reativou a renovação automática no cartão');
    }
    return json({ ok: true });
  }

  if (ev.type === 'customer.subscription.deleted') {
    const u = await usuarioDoStripe(env, o.metadata, o.customer);
    if (u) {
      // o acesso continua até a validade que já foi paga; só deixa de renovar
      await env.DB.prepare('UPDATE usuarios SET stripe_assinatura = NULL, stripe_cancela = NULL WHERE id = ? AND (stripe_assinatura = ? OR stripe_assinatura IS NULL)').bind(u.id, o.id || '').run();
      await registrar(env, u.id, 'Renovação automática no cartão encerrada');
      await avisar(env, 'Assinatura no cartão encerrada', `${u.nome} (${u.email}) não renova mais no cartão. O acesso vale até ${dataBR(u.expira)}.`).catch(() => {});
    }
    return json({ ok: true });
  }
  return json({ ok: true, ignorado: ev.type });
}

/* ---------------- /api/admin/stripe ---------------- */
export async function apiAdminStripe(req, env) {
  const c = await config(env);
  if (req.method === 'GET') {
    let assinantes = 0;
    try { await preparar(env); assinantes = (await env.DB.prepare('SELECT COUNT(*) n FROM usuarios WHERE stripe_assinatura IS NOT NULL AND stripe_cancela IS NULL').first()).n; } catch (e) {}
    // webhook criado antes de um evento novo entrar na lista: atualiza a lista no Stripe uma vez
    if (c.stripe_key && c.stripe_webhook_id && c.stripe_eventos !== EVENTOS.join(',')) {
      try { await stripe(c.stripe_key, 'POST', 'webhook_endpoints/' + c.stripe_webhook_id, { enabled_events: EVENTOS }); await salvarConfig(env, { stripe_eventos: EVENTOS.join(',') }); } catch (e) {}
    }
    let orfas = [];
    try { orfas = (await env.DB.prepare(`SELECT id, fatura, email, valor, plano, criado FROM stripe_orfas WHERE status = 'aberta' ORDER BY id`).all()).results; } catch (e) {}
    return json({ ligado: !!(c.stripe_key && c.stripe_whsec), modo: c.stripe_key ? modoDaChave(c.stripe_key) : null, desde: c.stripe_desde || null, assinantes,
      orfas: orfas.map((x) => ({ ...x, nome_plano: (PLANOS[x.plano] || {}).nome || x.plano })) });
  }
  if (req.method !== 'POST' || !mesmaOrigem(req)) return json({ erro: 'Método não permitido.' }, 405);
  const b = await req.json().catch(() => ({}));
  if (b.acao === 'chave') {
    const chave = String(b.chave || '').trim();
    if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]{10,200}$/.test(chave)) return json({ erro: 'Cole a chave secreta do Stripe (começa com sk_live_ ou sk_test_).' }, 400);
    try { await stripe(chave, 'GET', 'balance'); } catch (e) { return json({ erro: e.status === 401 ? 'O Stripe não aceitou essa chave.' : 'Não consegui falar com o Stripe: ' + e.message }, 400); }
    // apaga o webhook antigo (se a chave for da mesma conta e modo) e cria um novo, guardando o segredo dele
    if (c.stripe_webhook_id && c.stripe_key) await stripe(c.stripe_key, 'DELETE', 'webhook_endpoints/' + c.stripe_webhook_id).catch(() => null);
    let w;
    try {
      w = await stripe(chave, 'POST', 'webhook_endpoints', { url: SITE + '/api/stripe/webhook', enabled_events: EVENTOS, description: 'Mercado Macro: assinaturas no cartão' });
    } catch (e) { return json({ erro: 'A chave vale, mas não consegui criar o aviso de pagamentos (webhook): ' + e.message }, 400); }
    // portal do cliente (trocar cartão, cancelar, ver faturas): criado aqui para não depender da configuração no painel do Stripe
    const portal = await stripe(chave, 'POST', 'billing_portal/configurations', {
      business_profile: { headline: 'Mercado Macro: sua assinatura' },
      features: { payment_method_update: { enabled: true }, invoice_history: { enabled: true }, subscription_cancel: { enabled: true, mode: 'at_period_end' } },
    }).catch(() => null);
    await salvarConfig(env, { stripe_eventos: EVENTOS.join(','), stripe_key: chave, stripe_whsec: w.secret, stripe_webhook_id: w.id, stripe_portal: portal ? portal.id : null, stripe_desde: new Date().toISOString() });
    return json({ ok: true, modo: modoDaChave(chave) });
  }
  // fatura paga sem conta: liga à conta pelo e-mail e libera o acesso; as próximas renovações já acham a conta
  if (b.acao === 'ligar' || b.acao === 'ignorar') {
    await preparar(env);
    const x = await env.DB.prepare(`SELECT * FROM stripe_orfas WHERE id = ? AND status = 'aberta'`).bind(Number(b.id)).first();
    if (!x) return json({ erro: 'Essa fatura já foi resolvida.' }, 400);
    const agora = new Date().toISOString();
    if (b.acao === 'ignorar') {
      await env.DB.prepare(`UPDATE stripe_orfas SET status = 'ignorada', decidido = ? WHERE id = ? AND status = 'aberta'`).bind(agora, x.id).run();
      return json({ ok: true });
    }
    const email = String(b.email || '').trim().toLowerCase();
    const u = email && await env.DB.prepare('SELECT id, nome, email, status, expira FROM usuarios WHERE lower(email) = ?').bind(email).first();
    if (!u) return json({ erro: 'Não achei conta com esse e-mail.' }, 400);
    if (!['ativo', 'pendente', 'expirado'].includes(u.status)) return json({ erro: 'Essa conta está bloqueada ou recusada. Libere a conta antes.' }, 400);
    const r = await creditar(env, u, { fatura: x.fatura, valor: x.valor, cliente: x.cliente, assinatura: x.assinatura, plano: x.plano, fimStripe: x.fim_stripe, primeira: !!x.primeira }, agora);
    if (r.erro) return json({ erro: r.erro }, 409);
    // a fatura já estava creditada para outra conta: não fecha a pendência nem mexe na assinatura do Stripe
    if (r.repetido && Number(r.dono) !== Number(u.id)) {
      const d = await env.DB.prepare('SELECT nome, email FROM usuarios WHERE id = ?').bind(r.dono).first();
      return json({ erro: `Essa fatura já foi creditada para outra conta${d ? `: ${d.nome} (${d.email})` : ''}. Para fechar a pendência, ligue a essa conta ou clique em Ignorar.` }, 409);
    }
    await env.DB.prepare(`UPDATE stripe_orfas SET status = 'ligada', usuario_id = ?, decidido = ? WHERE id = ?`).bind(u.id, agora, x.id).run();
    // marca a conta na assinatura do Stripe, para as renovações chegarem já com o número da conta
    // se falhar, o acesso já está liberado; avisa o admin, porque as renovações podem voltar para a lista de faturas sem conta
    let stripeFalhou = false;
    if (x.assinatura && c.stripe_key) {
      try { await stripe(c.stripe_key, 'POST', 'subscriptions/' + encodeURIComponent(x.assinatura), { metadata: { usuario_id: String(u.id), plano: x.plano } }); }
      catch (e) { stripeFalhou = true; await registrar(env, u.id, 'Stripe: não consegui marcar a conta na assinatura ' + x.assinatura).catch(() => {}); }
    }
    return json({ ok: true, nome: u.nome, validade: r.validade || null, repetido: !!r.repetido, stripeFalhou });
  }
  if (b.acao === 'desligar') {
    if (c.stripe_webhook_id && c.stripe_key) await stripe(c.stripe_key, 'DELETE', 'webhook_endpoints/' + c.stripe_webhook_id).catch(() => null);
    await salvarConfig(env, { stripe_eventos: null, stripe_key: null, stripe_whsec: null, stripe_webhook_id: null, stripe_portal: null, stripe_desde: null });
    return json({ ok: true });
  }
  return json({ erro: 'Ação inválida.' }, 400);
}
