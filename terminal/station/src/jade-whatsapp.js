
// The Node suite imports the site router outside the Cloudflare runtime.
const { WorkerEntrypoint } = await import('cloudflare:workers').catch(error => {
  if (error.code !== 'ERR_UNSUPPORTED_ESM_URL_SCHEME') throw error;
  return { WorkerEntrypoint: class { constructor(ctx, env) { this.env = env; } } };
});

import { PLANOS } from './assinatura.js';
import { registrarFunil } from './radar-whatsapp.js';
import { carregarInsiders, acharEmpresa, periodoDoTexto, resumoInsiders, textoInsiders } from './insiders-resumo.js';

// aviso no Telegram da equipe: index.js liga a função avisar (que lê o token guardado no cofre)
let avisarFn = null;
export function ligarJade(u) { avisarFn = u.avisar; }

const table = `CREATE TABLE IF NOT EXISTS jade_whatsapp (
  usuario_id TEXT PRIMARY KEY, telefone_hash TEXT UNIQUE, codigo_hash TEXT UNIQUE, expira INTEGER
)`;
const digest = async (value) => Array.from(new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
), byte => byte.toString(16).padStart(2, '0')).join('');

async function phoneKey(env, phone) {
  if (!env.JADE_PHONE_HASH_KEY) throw new Error('JADE_PHONE_HASH_KEY ausente');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.JADE_PHONE_HASH_KEY),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(phone))),
    byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function jadeSchema(env) {
  await env.DB.prepare(table).run();
}

export async function jadeAccount(req, env, user, json) {
  if (!user) return json({ erro: 'Entre na sua conta para continuar.' }, 401);
  await env.DB.prepare(table).run();
  if (req.method === 'GET') {
    const row = await env.DB.prepare('SELECT telefone_hash, expira FROM jade_whatsapp WHERE usuario_id = ?').bind(user.id).first();
    return json({ vinculado: Boolean(row?.telefone_hash), pendente: Number(row?.expira) > Date.now() });
  }
  if (req.headers.get('Origin') !== new URL(req.url).origin) return json({ erro: 'Origem inválida.' }, 403);
  if (req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM jade_whatsapp WHERE usuario_id = ?').bind(user.id).run();
    return json({ vinculado: false });
  }
  if (req.method !== 'POST') return json({ erro: 'Método inválido.' }, 405);
  if (!user.admin && (user.plano === 'gratis' || !user.plano)) return json({ erro: 'Recurso para assinantes.' }, 403);
  if (!env.JADE_PHONE_HASH_KEY) return json({ erro: 'Vínculo temporariamente indisponível.' }, 503);
  const code = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare(`INSERT INTO jade_whatsapp (usuario_id, codigo_hash, expira) VALUES (?, ?, ?)
    ON CONFLICT(usuario_id) DO UPDATE SET codigo_hash = excluded.codigo_hash, expira = excluded.expira`)
    .bind(user.id, await digest(code), Date.now() + 5 * 60 * 1000).run();
  return json({ link: 'https://wa.me/5511971787986?text=' + encodeURIComponent('VINCULAR ' + code) });
}

const FONTES_PT = ['Valor Econômico', 'InfoMoney', 'Investing.com BR', 'ADVFN BR', 'Notícia Brasil', 'BeInCrypto BR', 'Cointelegraph BR', 'Google News', 'Money Times',
  'InvestNews', 'Valor Investe', 'Bloomberg Línea', 'Suno', 'BMC News', 'Invezz', 'Notícias Agrícolas', 'Folha'];

export class JadeWatchlist extends WorkerEntrypoint {
  // insiders (CVM 44) em texto pronto para o WhatsApp: empresa citada na mensagem ou, sem empresa, os destaques
  async insiders(texto) {
    const t = String(texto || '').slice(0, 300);
    const d = await carregarInsiders();
    const periodo = periodoDoTexto(t);
    const l = acharEmpresa(d, t);
    if (l.length > 1) return 'Encontrei mais de uma empresa: ' + l.slice(0, 5).map((e) => e.t[0]).join(', ') + '. Mande de novo com o código, por exemplo: insiders ' + l[0].t[0] + ' esse ano';
    return textoInsiders(resumoInsiders(d, { empresa: l[0] || null, periodo }));
  }

  // manchetes em português das últimas 36 horas, do arquivo de notícias do site (15/11/2026). O WhatsApp usava o
  // serviço de notícias antigo, que mandava manchetes em inglês; o servidor não consegue traduzir (o Google recusa),
  // então aqui vão só as fontes brasileiras, com o veículo no lugar de "Google News".
  async noticias() {
    try {
      const r = await this.env.DB.prepare(`SELECT titulo, link, fonte, veiculo, data, nivel FROM noticias_hist WHERE data >= ? AND fonte IN (${FONTES_PT.map(() => '?').join(',')}) ORDER BY data DESC LIMIT 400`)
        .bind(Date.now() - 36 * 3600000, ...FONTES_PT).all();
      return (r.results || []).map((x) => ({ titulo: x.titulo, link: x.link, fonte: x.fonte === 'Google News' && x.veiculo ? x.veiculo : x.fonte, data: x.data, nivel: x.nivel || 'NORMAL' }));
    } catch (e) { return []; }
  }

  // caminho de quem vem do canal Radar (origem 'radar'; eventos inicio, atendimento, planos)
  async funil(origem, evento) { return registrarFunil(this.env, origem, evento).catch(() => false); }

  // preços em centavos, direto da tabela do site (o robô do WhatsApp não guarda valores à mão)
  async precos() {
    return {
      cartao: { mensal: PLANOS.mensal.valorCartao, semestral: PLANOS.semestral.valorCartao, anual: PLANOS.anual.valorCartao },
      pix: { mensal: PLANOS.mensal.valor, semestral: PLANOS.semestral.valor },
      gratisHoras: PLANOS.gratis.horas,
    };
  }

  // pedido de atendimento humano ou mensagem durante a pausa da Jade: avisa a equipe no Telegram
  async avisarEquipe(tipo, final, texto) {
    if (!avisarFn) return false;
    const fim = /^\d{2,4}$/.test(String(final)) ? String(final) : '????';
    const msg = String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    const hora = new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    const titulo = tipo === 'pedido' ? '💬 WhatsApp: pediram atendimento' : '💬 WhatsApp: nova mensagem no atendimento';
    const corpo = `Número terminado em ${fim}, às ${hora}.\n` + (msg ? `“${msg}”\n` : '') +
      (tipo === 'pedido' ? 'A Jade ficou em silêncio por 24 horas nessa conversa. Responda pela caixa de entrada do número comercial.' : 'A Jade está em silêncio nessa conversa.');
    return avisarFn(this.env, titulo, corpo).catch(() => false);
  }

  async link(phone, code) {
    if (typeof phone !== 'string' || !/^\d{8,15}$/.test(phone) || typeof code !== 'string' || !/^[a-f0-9]{32}$/.test(code)) return false;
    const db = this.env.DB;
    await db.prepare(table).run();
    const hash = await phoneKey(this.env, phone);
    const now = Date.now();
    const result = await db.prepare(`UPDATE OR IGNORE jade_whatsapp SET telefone_hash = ?, codigo_hash = NULL, expira = NULL
      WHERE codigo_hash = ? AND expira > ? AND usuario_id IN (
        SELECT id FROM usuarios WHERE status = 'ativo' AND (admin = 1 OR (plano IS NOT NULL AND plano != 'gratis' AND (expira IS NULL OR expira > ?)))
      )`).bind(hash, await digest(code), now, new Date(now).toISOString()).run();
    return result.meta.changes === 1;
  }

  async watchlist(phone) {
    if (typeof phone !== 'string' || !/^\d{8,15}$/.test(phone)) return null;
    const db = this.env.DB;
    await db.prepare(table).run();
    const result = await db.prepare(`SELECT u.id, d.chave, d.valor FROM jade_whatsapp j
      JOIN usuarios u ON u.id = j.usuario_id
      LEFT JOIN dados_usuario d ON d.usuario_id = u.id AND d.chave IN ('watchlists', 'watchlist')
      WHERE j.telefone_hash = ? AND u.status = 'ativo'
      AND (u.admin = 1 OR (u.plano IS NOT NULL AND u.plano != 'gratis' AND (u.expira IS NULL OR u.expira > ?)))`)
      .bind(await phoneKey(this.env, phone), new Date().toISOString()).all();
    if (!result.results.length) return null;
    const current = result.results.find(row => row.chave === 'watchlists');
    const legacy = result.results.find(row => row.chave === 'watchlist');
    const rows = current ? JSON.parse(current.valor).lists.flatMap(list => list.items) : legacy ? JSON.parse(legacy.valor) : [];
    const items = new Map();
    for (const row of rows) {
      if (typeof row?.s !== 'string' || !/^[A-Za-z0-9^.=_-]{1,24}$/.test(row.s)) continue;
      if (!items.has(row.s)) items.set(row.s, { s: row.s, n: typeof row.n === 'string' ? row.n.slice(0, 80) : row.s });
    }
    return [...items.values()].slice(0, 30);
  }
}
