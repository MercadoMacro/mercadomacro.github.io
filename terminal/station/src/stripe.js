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
const EVENTOS = ['checkout.session.completed', 'invoice.paid', 'invoice.payment_failed', 'customer.subscription.deleted'];
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

const preparar = (env) => garantirAssinatura(env); // cria as colunas stripe_cliente, stripe_assinatura e pagamentos.ref

/* ---------------- quem assina: /api/assinatura/cartao e /api/assinatura/cartao-gerenciar ---------------- */
export async function stripeLigado(env) { const c = await config(env); return !!(c.stripe_key && c.stripe_whsec); }
export async function situacaoCartao(env, uid) {
  await preparar(env);
  const u = await env.DB.prepare('SELECT stripe_cliente, stripe_assinatura FROM usuarios WHERE id = ?').bind(uid).first();
  return { cartao: await stripeLigado(env), renovaCartao: !!(u && u.stripe_assinatura), temCliente: !!(u && u.stripe_cliente) };
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
      line_items: [{ quantity: 1, price_data: { currency: 'brl', unit_amount: p.valorCartao || p.valor, recurring: { interval: 'month', interval_count: p.meses }, product_data: { name: `Mercado Macro: plano ${p.nome}` } } }],
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
    const u = await usuarioDoStripe(env, meta, o.customer);
    if (!u) { await avisar(env, 'Stripe: pagamento sem conta', `Fatura ${o.id} de ${reais(o.amount_paid)} paga, mas não achei a conta (${o.customer_email || 'sem e-mail'}).`).catch(() => {}); return json({ ok: true }); }
    if (await env.DB.prepare('SELECT 1 FROM pagamentos WHERE ref = ?').bind('stripe:' + o.id).first()) return json({ ok: true, repetido: true });
    const id = recorrente(meta.plano) ? meta.plano : 'mensal';
    const plano = PLANOS[id];
    // soma o período na validade; e nunca deixa vencer antes do fim do período pago no Stripe (mais 1 dia de folga para a próxima cobrança)
    const fimStripe = o.lines && o.lines.data && o.lines.data[0] && o.lines.data[0].period ? new Date((o.lines.data[0].period.end + 86400) * 1000).toISOString() : null;
    let validade = somarPeriodo(baseValidade(['ativo'].includes(u.status) ? u.expira : null), plano);
    if (fimStripe && fimStripe > validade) validade = fimStripe;
    const ins = await env.DB.prepare(`INSERT INTO pagamentos (usuario_id, plano, valor, status, criado, decidido, validade, ref)
      SELECT ?, ?, ?, 'aprovado', ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM pagamentos WHERE ref = ?)`)
      .bind(u.id, id, o.amount_paid, agora, agora, validade, 'stripe:' + o.id, 'stripe:' + o.id).run();
    if (!ins.meta.changes) return json({ ok: true, repetido: true });
    await env.DB.prepare(`UPDATE usuarios SET status = 'ativo', expira = ?, plano = ?, aviso_venc = NULL, stripe_cliente = COALESCE(?, stripe_cliente),
      stripe_assinatura = COALESCE(?, stripe_assinatura), decidido = CASE WHEN status = 'ativo' THEN decidido ELSE ? END WHERE id = ?`)
      .bind(validade, id, o.customer || null, assinaturaDaFatura(o), agora, u.id).run();
    limparCacheSessao();
    const primeira = o.billing_reason === 'subscription_create';
    await registrar(env, u.id, `${primeira ? 'Assinou' : 'Renovou'} no cartão (Stripe): ${plano.nome} (${reais(o.amount_paid)}), acesso até ${dataBR(validade)}`);
    await avisar(env, primeira ? 'Nova assinatura no cartão' : 'Renovação no cartão', `${u.nome} (${u.email})\nPlano ${plano.nome}: ${reais(o.amount_paid)}\nAcesso até ${dataBR(validade)}`).catch(() => {});
    if (primeira) await emailAprovado(env, new Request(SITE + '/'), u, { ...plano, valor: o.amount_paid }, validade).catch(() => null);
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

  if (ev.type === 'customer.subscription.deleted') {
    const u = await usuarioDoStripe(env, o.metadata, o.customer);
    if (u) {
      // o acesso continua até a validade que já foi paga; só deixa de renovar
      await env.DB.prepare('UPDATE usuarios SET stripe_assinatura = NULL WHERE id = ? AND (stripe_assinatura = ? OR stripe_assinatura IS NULL)').bind(u.id, o.id || '').run();
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
    try { await preparar(env); assinantes = (await env.DB.prepare('SELECT COUNT(*) n FROM usuarios WHERE stripe_assinatura IS NOT NULL').first()).n; } catch (e) {}
    return json({ ligado: !!(c.stripe_key && c.stripe_whsec), modo: c.stripe_key ? modoDaChave(c.stripe_key) : null, desde: c.stripe_desde || null, assinantes });
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
    await salvarConfig(env, { stripe_key: chave, stripe_whsec: w.secret, stripe_webhook_id: w.id, stripe_portal: portal ? portal.id : null, stripe_desde: new Date().toISOString() });
    return json({ ok: true, modo: modoDaChave(chave) });
  }
  if (b.acao === 'desligar') {
    if (c.stripe_webhook_id && c.stripe_key) await stripe(c.stripe_key, 'DELETE', 'webhook_endpoints/' + c.stripe_webhook_id).catch(() => null);
    await salvarConfig(env, { stripe_key: null, stripe_whsec: null, stripe_webhook_id: null, stripe_portal: null, stripe_desde: null });
    return json({ ok: true });
  }
  return json({ erro: 'Ação inválida.' }, 400);
}
