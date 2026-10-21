/* Assinatura manual por Pix.
   Cada conta tem uma validade (usuarios.expira, ISO; vazio = sem validade). Liberação grátis pelo administrador vale 3 dias.
   A pessoa escolhe um plano em /assinar, paga o QR Code do Pix (gerado aqui, com a chave salva em /admin),
   manda o comprovante e o administrador aprova em /admin: a validade soma o período do plano.
   Um robô diário (cron em wrangler.jsonc) avisa por e-mail 3 dias antes de vencer e desativa quem venceu (os dados ficam). */
import qrcode from './qrcode.js';
// utilidades do src/index.js, entregues por ligarAssinatura() quando o worker carrega
let json, html, mesmaOrigem, config, salvarConfig, enviarEmail, avisar, BASE_CSS, lerCookie, sha256hex, limparCacheSessao;
export function ligarAssinatura(u) {
  ({ json, html, mesmaOrigem, config, salvarConfig, enviarEmail, avisar, BASE_CSS, lerCookie, sha256hex, limparCacheSessao } = u);
}

export const PLANOS = {
  degustacao: { nome: 'Degustação', periodo: '7 dias', dias: 7, valor: 499, unico: true },
  mensal: { nome: 'Mensal', periodo: '1 mês', meses: 1, valor: 2990 },
  trimestral: { nome: 'Trimestral', periodo: '3 meses', meses: 3, valor: 7990 },
  semestral: { nome: 'Semestral', periodo: '6 meses', meses: 6, valor: 14990 },
};
export const GRATIS_DIAS = 3; // liberação grátis feita pelo administrador
const AVISO_DIAS = 3; // e-mail de aviso antes de vencer
const ARQ_MAX = 1900000; // comprovante: o D1 guarda até 2 MB por valor
const ARQ_DIAS = 30; // o comprovante é apagado 30 dias depois da decisão
const SITE = 'https://mercadomacro.com.br';

const reais = (c) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',');
const dataBR = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—');
export function somarPeriodo(baseIso, plano) {
  const d = new Date(baseIso);
  if (plano.dias) d.setTime(d.getTime() + plano.dias * 864e5);
  else d.setUTCMonth(d.getUTCMonth() + plano.meses);
  return d.toISOString();
}
// a validade nova conta a partir de hoje, ou do fim da validade atual se ela ainda não venceu
export function baseValidade(expira) {
  const agora = new Date().toISOString();
  return expira && expira > agora ? expira : agora;
}

/* ---------------- banco ---------------- */
let pronto = false;
export async function garantirAssinatura(env) {
  if (pronto) return;
  const cols = (await env.DB.prepare('PRAGMA table_info(usuarios)').all()).results.map((c) => c.name);
  const q = [];
  if (!cols.includes('expira')) q.push(env.DB.prepare('ALTER TABLE usuarios ADD COLUMN expira TEXT'));
  if (!cols.includes('aviso_venc')) q.push(env.DB.prepare('ALTER TABLE usuarios ADD COLUMN aviso_venc TEXT'));
  q.push(env.DB.prepare(`CREATE TABLE IF NOT EXISTS pagamentos (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL,
    plano TEXT NOT NULL, valor INTEGER NOT NULL, status TEXT NOT NULL, criado TEXT NOT NULL, enviado TEXT, decidido TEXT,
    validade TEXT, arquivo BLOB, tipo_arq TEXT)`));
  await env.DB.batch(q);
  pronto = true;
}

// conta logada que ainda não tem acesso ao site (aguardando liberação ou com a validade vencida): só vê /assinar
export async function contaDaSessao(req, env) {
  const tok = lerCookie(req);
  if (!tok) return null;
  await garantirAssinatura(env);
  return env.DB.prepare(`SELECT u.id, u.nome, u.email, u.admin, u.status, u.expira FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token = ? AND s.expira > ? AND u.status IN ('ativo', 'pendente', 'expirado')`).bind(await sha256hex(tok), Date.now()).first();
}

/* ---------------- Pix (BR Code do Banco Central, QR estático com valor) ---------------- */
const campo = (id, v) => id + String(v.length).padStart(2, '0') + v;
function crc16(s) {
  let c = 0xffff;
  for (const b of new TextEncoder().encode(s)) {
    c ^= b << 8;
    for (let i = 0; i < 8; i++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
export function brcode({ chave, nome, cidade, valor, txid }) {
  const p = campo('00', '01') + campo('26', campo('00', 'br.gov.bcb.pix') + campo('01', chave)) + campo('52', '0000') + campo('53', '986')
    + campo('54', (valor / 100).toFixed(2)) + campo('58', 'BR') + campo('59', semAcento(nome).slice(0, 25)) + campo('60', semAcento(cidade).slice(0, 15))
    + campo('62', campo('05', txid)) + '6304';
  return p + crc16(p);
}
// chave Pix: e-mail, celular (+55...), CPF/CNPJ (só números) ou aleatória
export function normalizarChave(s) {
  const t = String(s || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) return t.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return t.toLowerCase();
  const d = t.replace(/\D/g, '');
  // celular precisa vir com +55 ou com o DDD entre parênteses (só números de 11 dígitos é CPF)
  if (/^\+\d/.test(t) || /^\(\d{2}\)/.test(t)) return d.length === 13 && d.startsWith('55') ? '+' + d : d.length === 11 ? '+55' + d : null;
  if ((d.length === 11 || d.length === 14) && /^[\d.\-\/\s]+$/.test(t)) return d;
  return null;
}
function qrSvg(texto) {
  const q = qrcode(0, 'M');
  q.addData(texto);
  q.make();
  return q.createSvgTag({ cellSize: 5, margin: 4, scalable: true, alt: 'QR Code do Pix' });
}

/* ---------------- e-mails ---------------- */
const reqSite = () => new Request(SITE + '/');
function emailVencendo(env, u, dias) {
  return enviarEmail(env, reqSite(), {
    para: u.email, nome: u.nome, assunto: dias <= 1 ? 'Seu acesso ao Mercado Macro termina amanhã' : `Seu acesso ao Mercado Macro termina em ${dias} dias`,
    paragrafos: [`Seu acesso ao Mercado Macro vale até ${dataBR(u.expira)}. Depois disso a conta é desativada (seus dados e listas ficam guardados).`,
      'Para continuar, escolha um plano e pague pelo Pix. Assim que o pagamento for conferido, a validade é renovada.'],
    botao: 'Ver planos', link: SITE + '/assinar',
  });
}
function emailVenceu(env, u) {
  return enviarEmail(env, reqSite(), {
    para: u.email, nome: u.nome, assunto: 'Seu acesso ao Mercado Macro terminou',
    paragrafos: [`Seu acesso ao Mercado Macro terminou em ${dataBR(u.expira)}. Seus dados e listas continuam guardados.`,
      'Para voltar, entre com seu e-mail e senha e escolha um plano.'],
    botao: 'Renovar acesso', link: SITE + '/assinar',
  });
}
function emailAprovado(env, req, u, plano, validade) {
  return enviarEmail(env, req, {
    para: u.email, nome: u.nome, assunto: 'Pagamento confirmado no Mercado Macro',
    paragrafos: [`Recebemos seu pagamento do plano ${plano.nome} (${reais(plano.valor)}). Seu acesso vale até ${dataBR(validade)}.`],
    botao: 'Entrar no Mercado Macro', link: SITE + '/',
  });
}
function emailRecusado(env, req, u, plano) {
  return enviarEmail(env, req, {
    para: u.email, nome: u.nome, assunto: 'Não conseguimos confirmar seu pagamento',
    paragrafos: [`Não conseguimos confirmar o pagamento do plano ${plano.nome} (${reais(plano.valor)}) com o comprovante enviado.`,
      'Se você já pagou, responda este e-mail com o comprovante que a gente confere de novo.'],
    botao: 'Ver planos', link: SITE + '/assinar',
  });
}

// /admin: manda para o administrador os e-mails que o assinante recebe (vence em 3 dias, venceu e pagamento confirmado)
export async function emailsDeTeste(env, req, eu) {
  const agora = new Date().toISOString();
  const r = [
    await emailVencendo(env, { ...eu, expira: new Date(Date.now() + 3 * 864e5).toISOString() }, 3).catch((e) => ({ ok: false, erro: String(e) })),
    await emailVenceu(env, { ...eu, expira: agora }).catch((e) => ({ ok: false, erro: String(e) })),
    await emailAprovado(env, req, eu, PLANOS.mensal, somarPeriodo(agora, PLANOS.mensal)).catch((e) => ({ ok: false, erro: String(e) })),
  ];
  return { enviados: r.filter((x) => x.ok).length, erro: (r.find((x) => !x.ok) || {}).erro };
}

/* ---------------- robô diário: avisa quem vai vencer e desativa quem venceu ---------------- */
export async function rotinaAssinaturas(env) {
  await garantirAssinatura(env);
  const agora = new Date().toISOString(), limite = new Date(Date.now() + AVISO_DIAS * 864e5).toISOString();
  const venceram = (await env.DB.prepare(`SELECT id, nome, email, expira FROM usuarios WHERE status = 'ativo' AND admin = 0 AND expira IS NOT NULL AND expira <= ?`).bind(agora).all()).results;
  if (venceram.length) {
    await env.DB.batch(venceram.map((u) => env.DB.prepare(`UPDATE usuarios SET status = 'expirado' WHERE id = ? AND status = 'ativo'`).bind(u.id)));
    limparCacheSessao();
    for (const u of venceram) await emailVenceu(env, u).catch(() => {});
  }
  const vencendo = (await env.DB.prepare(`SELECT id, nome, email, expira FROM usuarios WHERE status = 'ativo' AND admin = 0 AND expira > ? AND expira <= ?
    AND (aviso_venc IS NULL OR aviso_venc != expira)`).bind(agora, limite).all()).results;
  let avisados = 0;
  for (const u of vencendo) {
    const r = await emailVencendo(env, u, Math.max(1, Math.ceil((Date.parse(u.expira) - Date.now()) / 864e5))).catch(() => ({ ok: false }));
    // marca mesmo sem e-mail ligado para não repetir; se o envio falhar, tenta de novo amanhã
    if (r.ok || r.desligado) { await env.DB.prepare('UPDATE usuarios SET aviso_venc = expira WHERE id = ?').bind(u.id).run(); if (r.ok) avisados++; }
  }
  // comprovantes saem do banco 30 dias depois da decisão; pedidos sem comprovante somem em 7 dias
  await env.DB.batch([
    env.DB.prepare('UPDATE pagamentos SET arquivo = NULL WHERE arquivo IS NOT NULL AND decidido IS NOT NULL AND decidido < ?').bind(new Date(Date.now() - ARQ_DIAS * 864e5).toISOString()),
    env.DB.prepare(`DELETE FROM pagamentos WHERE status = 'aguardando' AND criado < ?`).bind(new Date(Date.now() - 7 * 864e5).toISOString()),
  ]);
  if (venceram.length || vencendo.length) {
    await avisar(env, 'Assinaturas', [
      venceram.length ? `Venceram hoje (conta desativada): ${venceram.map((u) => u.nome).join(', ')}` : '',
      vencendo.length ? `Vencem em até ${AVISO_DIAS} dias: ${vencendo.map((u) => `${u.nome} (${dataBR(u.expira)})`).join(', ')}` : '',
      (await config(env)).mail_key ? (avisados ? `${avisados} receberam e-mail de aviso.` : '') : 'O e-mail está desligado em /admin: ninguém foi avisado por e-mail.',
    ].filter(Boolean).join('\n')).catch(() => {});
  }
}

/* ---------------- páginas e API de quem assina ---------------- */
async function pixConfig(env) {
  const c = await config(env);
  return c.pix_chave && c.pix_nome && c.pix_cidade ? { chave: c.pix_chave, nome: c.pix_nome, cidade: c.pix_cidade } : null;
}
async function jaUsouDegustacao(env, uid) {
  // a degustação é para quem nunca pagou: some depois de qualquer pagamento enviado ou aprovado
  return !!(await env.DB.prepare(`SELECT 1 FROM pagamentos WHERE usuario_id = ? AND status IN ('enviado', 'aprovado')`).bind(uid).first());
}
function pedidoPix(pix, p) {
  const copia = brcode({ ...pix, valor: p.valor, txid: 'MM' + String(p.id).padStart(6, '0') });
  return { id: p.id, plano: p.plano, valor: p.valor, status: p.status, copia, svg: qrSvg(copia) };
}

export async function apiAssinatura(req, env, conta, acao) {
  await garantirAssinatura(env);
  if (acao === '' && req.method === 'GET') {
    const pags = (await env.DB.prepare('SELECT id, plano, valor, status, criado, enviado, decidido, validade FROM pagamentos WHERE usuario_id = ? ORDER BY id DESC LIMIT 20').bind(conta.id).all()).results;
    const deg = await jaUsouDegustacao(env, conta.id);
    return json({
      nome: conta.nome, status: conta.status, expira: conta.expira, admin: !!conta.admin,
      liberado: !!conta.admin || (conta.status === 'ativo' && (!conta.expira || conta.expira > new Date().toISOString())),
      pix: !!(await pixConfig(env)),
      planos: Object.entries(PLANOS).filter(([k, p]) => !(p.unico && deg)).map(([k, p]) => ({ id: k, nome: p.nome, periodo: p.periodo, valor: p.valor, unico: !!p.unico })),
      pagamentos: pags,
    });
  }
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  if (!mesmaOrigem(req)) return json({ erro: 'Origem não permitida.' }, 403);
  if (acao === 'pedido') {
    const b = await req.json().catch(() => ({}));
    const plano = PLANOS[b.plano];
    if (!plano) return json({ erro: 'Plano inválido.' }, 400);
    const pix = await pixConfig(env);
    if (!pix) return json({ erro: 'O pagamento por Pix ainda não está disponível. Escreva para contato@mercadomacro.com.br.' }, 503);
    if (plano.unico && (await jaUsouDegustacao(env, conta.id))) return json({ erro: 'A degustação é só para quem ainda não assinou.' }, 400);
    // um pedido em aberto por plano: escolher de novo mostra o mesmo QR Code
    let p = await env.DB.prepare(`SELECT id, plano, valor, status FROM pagamentos WHERE usuario_id = ? AND plano = ? AND status = 'aguardando'`).bind(conta.id, b.plano).first();
    if (!p) {
      const n = await env.DB.prepare(`SELECT COUNT(*) n FROM pagamentos WHERE usuario_id = ? AND status = 'aguardando'`).bind(conta.id).first();
      if (n.n >= 4) return json({ erro: 'Você já tem pedidos em aberto. Envie o comprovante de um deles.' }, 429);
      const ins = await env.DB.prepare(`INSERT INTO pagamentos (usuario_id, plano, valor, status, criado) VALUES (?, ?, ?, 'aguardando', ?)`)
        .bind(conta.id, b.plano, plano.valor, new Date().toISOString()).run();
      p = { id: ins.meta.last_row_id, plano: b.plano, valor: plano.valor, status: 'aguardando' };
    }
    return json(pedidoPix(pix, p));
  }
  if (acao === 'comprovante') {
    const fd = await req.formData().catch(() => null);
    const id = Number(fd && fd.get('id'));
    const arq = fd && fd.get('arquivo');
    if (!Number.isInteger(id) || !arq || typeof arq === 'string') return json({ erro: 'Escolha o arquivo do comprovante.' }, 400);
    const tipo = String(arq.type || '');
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(tipo)) return json({ erro: 'Envie uma foto (JPG ou PNG) ou um PDF do comprovante.' }, 400);
    if (arq.size > ARQ_MAX) return json({ erro: 'Arquivo grande demais (máximo 1,9 MB). Tire uma captura da tela do comprovante.' }, 413);
    const p = await env.DB.prepare(`SELECT id, plano, valor, status FROM pagamentos WHERE id = ? AND usuario_id = ?`).bind(id, conta.id).first();
    if (!p || !['aguardando', 'enviado'].includes(p.status)) return json({ erro: 'Pedido não encontrado. Escolha o plano de novo.' }, 400);
    const dados = new Uint8Array(await arq.arrayBuffer());
    await env.DB.prepare(`UPDATE pagamentos SET status = 'enviado', enviado = ?, arquivo = ?, tipo_arq = ? WHERE id = ?`).bind(new Date().toISOString(), dados, tipo, id).run();
    const plano = PLANOS[p.plano];
    await telegramArquivo(env, dados, tipo, `Pagamento para conferir\n${conta.nome} (${conta.email})\nPlano ${plano.nome}: ${reais(p.valor)} (pedido MM${String(p.id).padStart(6, '0')})\nAprovar em ${SITE}/admin`).catch(() => {});
    return json({ ok: true });
  }
  return json({ erro: 'Não encontrado.' }, 404);
}
async function telegramArquivo(env, dados, tipo, legenda) {
  const c = await config(env);
  if (!(c.tg_token && c.tg_chat)) return false;
  const fd = new FormData();
  fd.append('chat_id', c.tg_chat);
  fd.append('caption', legenda.slice(0, 1024));
  const foto = tipo !== 'application/pdf';
  fd.append(foto ? 'photo' : 'document', new Blob([dados], { type: tipo }), foto ? 'comprovante.' + tipo.split('/')[1] : 'comprovante.pdf');
  const r = await fetch(`https://api.telegram.org/bot${c.tg_token}/${foto ? 'sendPhoto' : 'sendDocument'}`, { method: 'POST', body: fd });
  if ((await r.json().catch(() => ({}))).ok) return true;
  return avisar(env, 'Pagamento para conferir', legenda); // a foto não foi: manda ao menos o texto
}

/* ---------------- administração ---------------- */
export async function apiAdminAssinatura(req, env, acao) {
  await garantirAssinatura(env);
  if (acao === 'pix') {
    const c = await config(env);
    if (req.method === 'GET') return json({ chave: c.pix_chave || null, nome: c.pix_nome || null, cidade: c.pix_cidade || null });
    if (req.method !== 'POST' || !mesmaOrigem(req)) return json({ erro: 'Método não permitido.' }, 405);
    const b = await req.json().catch(() => ({}));
    if (b.acao === 'desligar') { await salvarConfig(env, { pix_chave: null, pix_nome: null, pix_cidade: null }); return json({ ok: true }); }
    const chave = normalizarChave(b.chave);
    if (!chave) return json({ erro: 'Essa chave Pix não parece válida. Use o e-mail, o celular com DDD, o CPF/CNPJ (só números) ou a chave aleatória.' }, 400);
    const nome = semAcento(b.nome).slice(0, 25), cidade = semAcento(b.cidade).slice(0, 15);
    if (nome.length < 3 || cidade.length < 3) return json({ erro: 'Preencha o nome de quem recebe e a cidade, como aparecem no seu banco.' }, 400);
    await salvarConfig(env, { pix_chave: chave, pix_nome: nome, pix_cidade: cidade });
    return json({ ok: true, chave, nome, cidade });
  }
  if (acao === 'pagamentos' && req.method === 'GET') {
    const r = await env.DB.prepare(`SELECT p.id, p.plano, p.valor, p.status, p.criado, p.enviado, p.decidido, p.validade, p.tipo_arq, p.arquivo IS NOT NULL tem_arq,
      u.id uid, u.nome, u.email FROM pagamentos p JOIN usuarios u ON u.id = p.usuario_id
      WHERE p.status = 'enviado' OR (p.status IN ('aprovado', 'recusado') AND p.decidido > ?) ORDER BY p.status = 'enviado' DESC, p.id DESC LIMIT 60`)
      .bind(new Date(Date.now() - 60 * 864e5).toISOString()).all();
    return json({ pagamentos: r.results.map((p) => ({ ...p, nome_plano: (PLANOS[p.plano] || {}).nome || p.plano })) });
  }
  if (acao === 'comprovante' && req.method === 'GET') {
    const id = Number(new URL(req.url).searchParams.get('id'));
    const p = await env.DB.prepare('SELECT arquivo, tipo_arq FROM pagamentos WHERE id = ?').bind(id).first();
    if (!p || !p.arquivo) return new Response('Comprovante não encontrado (eles são apagados 30 dias depois da decisão).', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    return new Response(new Uint8Array(p.arquivo), { headers: { 'Content-Type': p.tipo_arq, 'Content-Disposition': 'inline', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'" } });
  }
  if (acao === 'pagamentos' && req.method === 'POST') {
    if (!mesmaOrigem(req)) return json({ erro: 'Origem não permitida.' }, 403);
    const b = await req.json().catch(() => ({}));
    const p = await env.DB.prepare(`SELECT p.id, p.plano, p.status, u.id uid, u.nome, u.email, u.status ustatus, u.expira FROM pagamentos p JOIN usuarios u ON u.id = p.usuario_id WHERE p.id = ?`).bind(Number(b.id)).first();
    if (!p || !['enviado', 'aguardando'].includes(p.status)) return json({ erro: 'Esse pagamento já foi decidido.' }, 400);
    if (!['ativo', 'pendente', 'expirado'].includes(p.ustatus)) return json({ erro: 'Essa conta está bloqueada ou recusada. Libere a conta antes.' }, 400);
    const plano = PLANOS[p.plano];
    const agora = new Date().toISOString();
    if (b.acao === 'aprovar') {
      const validade = somarPeriodo(baseValidade(p.ustatus === 'pendente' ? null : p.expira), plano);
      await env.DB.batch([
        env.DB.prepare(`UPDATE usuarios SET status = 'ativo', expira = ?, decidido = ? WHERE id = ?`).bind(validade, agora, p.uid),
        env.DB.prepare(`UPDATE pagamentos SET status = 'aprovado', decidido = ?, validade = ? WHERE id = ?`).bind(agora, validade, p.id),
      ]);
      limparCacheSessao();
      const r = await emailAprovado(env, req, p, plano, validade).catch(() => ({ ok: false }));
      return json({ ok: true, validade, email: r.ok ? 'enviado' : r.desligado ? 'desligado' : 'falhou' });
    }
    if (b.acao === 'recusar') {
      await env.DB.prepare(`UPDATE pagamentos SET status = 'recusado', decidido = ? WHERE id = ?`).bind(agora, p.id).run();
      const r = await emailRecusado(env, req, p, plano).catch(() => ({ ok: false }));
      return json({ ok: true, email: r.ok ? 'enviado' : r.desligado ? 'desligado' : 'falhou' });
    }
    return json({ erro: 'Ação inválida.' }, 400);
  }
  return null;
}

/* ---------------- página /assinar ---------------- */
export function paginaAssinar() {
  return html(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Assinatura | Mercado Macro</title>
<meta name="robots" content="noindex">
<link rel="icon" type="image/png" href="/icone-mercado-macro.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${BASE_CSS}
main{max-width:760px;margin:0 auto;padding:24px 16px 48px}
header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
header h1{font-size:20px;margin:0;flex:1}
header a,header button{color:var(--accent-text);font-size:13px;background:none;border:0;cursor:pointer;padding:0;text-decoration:underline}
.sit{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:0 0 18px;color:var(--text-2)}
.sit b{color:var(--text)}
.sit.alerta{border-color:var(--accent)}
h2{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-3);margin:22px 0 10px;font-weight:700}
.planos{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}
.pl{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px;text-align:left;color:var(--text);cursor:pointer;display:flex;flex-direction:column;gap:4px;font:inherit;min-height:120px}
.pl:hover,.pl[aria-pressed=true]{border-color:var(--accent)}
.pl .n{font-weight:700}.pl .v{font-size:22px;font-weight:700}.pl .p{color:var(--text-3);font-size:12.5px}
.pl .m{color:var(--text-2);font-size:12px;margin-top:auto}
.pix{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px;margin-top:16px;display:grid;grid-template-columns:220px 1fr;gap:18px;align-items:start}
.qr{background:#fff;border-radius:10px;padding:8px;width:220px}.qr svg{display:block;width:100%;height:auto}
.pix h3{margin:0 0 6px;font-size:16px}
.pix p{margin:0 0 10px;color:var(--text-2);font-size:13.5px;line-height:1.5}
.cc{display:flex;gap:6px}.cc input{flex:1;min-width:0;background:var(--surface-2);border:1px solid var(--line-2);border-radius:8px;color:var(--text);padding:9px 10px;font:12px ui-monospace,Menlo,Consolas,monospace}
.bt{background:var(--accent);color:var(--on-accent);border:0;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer;min-height:42px}
.bt2{background:var(--surface-2);color:var(--text);border:1px solid var(--line-2);border-radius:8px;padding:9px 12px;font-weight:600;cursor:pointer;min-height:40px}
.bt:disabled,.bt2:disabled{opacity:.6;cursor:default}
.arq{margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}
.arq label{display:block;font-size:13px;color:var(--text-2);margin-bottom:6px}
.arq input[type=file]{color:var(--text-2);font-size:13px;max-width:100%;margin-bottom:10px;display:block}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{text-align:left;padding:8px 6px;border-top:1px solid var(--line)}th{color:var(--text-3);font-weight:600;border-top:0}
.nota{color:var(--text-3);font-size:12.5px;line-height:1.5}
@media (max-width:600px){.pix{grid-template-columns:1fr}.qr{margin:0 auto}}
</style></head><body><main>
<header><h1>Assinatura do Mercado Macro</h1><span id="volta"></span><button type="button" id="sair">Sair</button></header>
<div id="raiz"><p class="nota">Carregando…</p></div>
</main>
<script>
(function(){
  var raiz = document.getElementById('raiz'), dados = null, escolhido = null;
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function reais(c){ return 'R$ ' + (c / 100).toFixed(2).replace('.', ','); }
  function data(s){ return s ? new Date(s).toLocaleDateString('pt-BR') : '—'; }
  function api(u, o){ return fetch(u, Object.assign({ credentials: 'same-origin' }, o || {})).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if (!r.ok) throw j; return j; }); }); }
  var ST = { aguardando: 'aguardando comprovante', enviado: 'comprovante enviado, em conferência', aprovado: 'aprovado', recusado: 'não confirmado' };
  document.getElementById('sair').onclick = function(){ fetch('/api/auth/sair', { method: 'POST', credentials: 'same-origin' }).then(function(){ location.href = '/entrar'; }); };
  function carregar(){
    api('/api/assinatura').then(function(j){
      dados = j;
      // /assinar?plano=mensal (vindo do aviso no site) já abre o Pix daquele plano
      var q = new URLSearchParams(location.search).get('plano');
      if (q && !escolhido && j.planos.some(function(p){ return p.id === q; })) escolhido = q;
      if (q) history.replaceState(null, '', '/assinar');
      desenhar();
    }).catch(function(){ raiz.innerHTML = '<p class="nota">Não foi possível carregar. Atualize a página.</p>'; });
  }
  function situacao(j){
    if (j.admin) return '<div class="sit">Conta de administrador: sem validade.</div>';
    if (j.status === 'pendente') return '<div class="sit alerta">Olá, <b>' + esc(j.nome.split(' ')[0]) + '</b>. Seu cadastro aguarda liberação. Para entrar agora, escolha um plano abaixo.</div>';
    if (!j.liberado) return '<div class="sit alerta">Seu acesso terminou' + (j.expira ? ' em <b>' + data(j.expira) + '</b>' : '') + '. Seus dados e listas continuam guardados. Escolha um plano para voltar.</div>';
    return '<div class="sit">Seu acesso vale ' + (j.expira ? 'até <b>' + data(j.expira) + '</b>. Se renovar antes, o novo período começa depois dessa data.' : '<b>sem data para terminar</b>.') + '</div>';
  }
  function desenhar(){
    var j = dados;
    document.getElementById('volta').innerHTML = j.liberado ? '<a href="/">Voltar ao site</a>' : '';
    var h = situacao(j);
    var enviado = j.pagamentos.filter(function(p){ return p.status === 'enviado'; })[0];
    if (enviado) h += '<div class="sit">Recebemos seu comprovante do plano <b>' + esc(nomePlano(enviado.plano)) + '</b> (' + reais(enviado.valor) + '). Você recebe um e-mail quando o pagamento for conferido.</div>';
    if (!j.pix) h += '<div class="sit">O pagamento por Pix ainda não está disponível. Escreva para <a href="mailto:contato@mercadomacro.com.br" style="color:var(--accent-text)">contato@mercadomacro.com.br</a>.</div>';
    else {
      h += '<h2>Planos</h2><div class="planos">' + j.planos.map(function(p){
        return '<button type="button" class="pl" data-p="' + p.id + '" aria-pressed="' + (escolhido === p.id) + '"><span class="n">' + esc(p.nome) + '</span><span class="v">' + reais(p.valor) + '</span><span class="p">' + esc(p.periodo) + ' de acesso</span>'
          + '<span class="m">' + (p.unico ? 'Para conhecer, uma vez só' : p.id === 'mensal' ? '' : reais(Math.round(p.valor / (p.id === 'trimestral' ? 3 : 6))) + ' por mês') + '</span></button>';
      }).join('') + '</div><div id="pix"></div>';
      h += '<p class="nota">Pagamento único pelo Pix, sem renovação automática. Quer parcelar? Muitos bancos oferecem "Pix no crédito" (ou "Pix parcelado") na hora de pagar: o banco parcela no seu cartão.</p>';
    }
    if (j.pagamentos.length) h += '<h2>Seus pagamentos</h2><table><tr><th>Data</th><th>Plano</th><th>Valor</th><th>Situação</th></tr>' + j.pagamentos.map(function(p){
      return '<tr><td>' + data(p.criado) + '</td><td>' + esc(nomePlano(p.plano)) + '</td><td>' + reais(p.valor) + '</td><td>' + esc(ST[p.status] || p.status) + (p.status === 'aprovado' && p.validade ? ' (até ' + data(p.validade) + ')' : '') + '</td></tr>';
    }).join('') + '</table>';
    h += '<p class="nota" style="margin-top:18px">Dúvidas: <a href="mailto:contato@mercadomacro.com.br" style="color:var(--text-2)">contato@mercadomacro.com.br</a>. O comprovante é usado só para conferir o pagamento e é apagado 30 dias depois.</p>';
    raiz.innerHTML = h;
    if (escolhido) pedir(escolhido);
  }
  function nomePlano(id){ return { degustacao: 'Degustação', mensal: 'Mensal', trimestral: 'Trimestral', semestral: 'Semestral' }[id] || id; }
  raiz.addEventListener('click', function(e){
    var b = e.target.closest('.pl'); if (!b) return;
    escolhido = b.dataset.p;
    raiz.querySelectorAll('.pl').forEach(function(x){ x.setAttribute('aria-pressed', x === b); });
    pedir(escolhido);
  });
  function pedir(plano){
    var box = document.getElementById('pix'); if (!box) return;
    box.innerHTML = '<p class="nota">Gerando o Pix…</p>';
    api('/api/assinatura/pedido', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plano: plano }) }).then(function(p){
      box.innerHTML = '<div class="pix"><div class="qr">' + p.svg + '</div><div><h3>' + esc(nomePlano(p.plano)) + ': ' + reais(p.valor) + '</h3>'
        + '<p>Abra o app do seu banco, escolha pagar com Pix e leia o QR Code, ou use o Pix copia e cola:</p>'
        + '<div class="cc"><input id="cc" readonly value="' + esc(p.copia) + '" aria-label="Pix copia e cola"><button type="button" class="bt2" id="copiar">Copiar</button></div>'
        + '<div class="arq"><label for="arq">Depois de pagar, envie o comprovante (foto, captura de tela ou PDF):</label><input type="file" id="arq" accept="image/*,application/pdf">'
        + '<button type="button" class="bt" id="enviar">Enviar comprovante</button><p class="msg" id="msg" role="status" aria-live="polite"></p></div></div></div>';
      document.getElementById('copiar').onclick = function(){ var t = this, i = document.getElementById('cc'); i.select();
        (navigator.clipboard ? navigator.clipboard.writeText(p.copia) : Promise.reject()).then(function(){ t.textContent = 'Copiado'; }, function(){ try { document.execCommand('copy'); t.textContent = 'Copiado'; } catch (_) { t.textContent = 'Selecione e copie'; } }); };
      document.getElementById('enviar').onclick = function(){ enviar(p, this); };
    }).catch(function(j){ box.innerHTML = '<p class="msg erro">' + esc((j && j.erro) || 'Não foi possível gerar o Pix. Tente de novo.') + '</p>'; });
  }
  // fotos grandes viram JPEG de até 1600 px antes de enviar
  function reduzir(f){
    if (!/^image\\//.test(f.type) || f.size < 900000) return Promise.resolve(f);
    return new Promise(function(ok){
      var img = new Image(), u = URL.createObjectURL(f);
      img.onload = function(){ var k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u); c.toBlob(function(b){ ok(b ? new File([b], 'comprovante.jpg', { type: 'image/jpeg' }) : f); }, 'image/jpeg', 0.82); };
      img.onerror = function(){ URL.revokeObjectURL(u); ok(f); };
      img.src = u;
    });
  }
  function enviar(p, b){
    var m = document.getElementById('msg'), f = document.getElementById('arq').files[0];
    if (!f) { m.className = 'msg erro'; m.textContent = 'Escolha o arquivo do comprovante.'; return; }
    b.disabled = true; m.className = 'msg'; m.textContent = 'Enviando…';
    reduzir(f).then(function(arq){
      var fd = new FormData(); fd.append('id', p.id); fd.append('arquivo', arq, arq.name || 'comprovante');
      return api('/api/assinatura/comprovante', { method: 'POST', body: fd });
    }).then(function(){ escolhido = null; carregar(); window.scrollTo(0, 0); })
      .catch(function(j){ m.className = 'msg erro'; m.textContent = (j && j.erro) || 'Não foi possível enviar. Tente de novo.'; b.disabled = false; });
  }
  carregar();
})();
</script></body></html>`);
}
