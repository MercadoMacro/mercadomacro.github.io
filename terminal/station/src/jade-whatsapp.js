
import { WorkerEntrypoint } from 'cloudflare:workers';

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
    const row = await env.DB.prepare('SELECT telefone_hash FROM jade_whatsapp WHERE usuario_id = ?').bind(user.id).first();
    return json({ vinculado: Boolean(row?.telefone_hash) });
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

export class JadeWatchlist extends WorkerEntrypoint {
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
