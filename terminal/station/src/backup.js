/* Cópia diária do banco (D1) no R2, 16/11/2026, pedido do Dante.
   Todo dia às 3h15 (Brasília) cada tabela vai para um arquivo d1/AAAA-MM-DD.json.gz no bucket mercadomacro-backup
   (privado, sem link público). Ficam as cópias dos últimos 90 dias; as mais velhas são apagadas.
   Fora da cópia: sessões de login (refeitas no próximo login) e tabelas internas do SQLite/Cloudflare.
   Formato: { versao, criado, tabelas: { nome: { sql, linhas: [...] } } } — dá para recriar tudo com o sql e os INSERTs. */

export const DIAS_GUARDADOS = 90;
const FORA = new Set(['sessoes']);
const LIMITE_BYTES = 200 * 1024 * 1024; // trava de segurança: banco cru acima disso não é copiado (hoje tem ~12 MB)
const PAGINA = 2000;
const dia = (d = new Date()) => d.toISOString().slice(0, 10);

export async function fazerBackup(env) {
  if (!env.BACKUP) throw new Error('R2 não ligado');
  const t0 = Date.now();
  const tabs = await env.DB.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY name").all();
  const gz = new CompressionStream('gzip');
  const w = gz.writable.getWriter();
  const pedacos = [];
  const leitura = (async () => { const r = gz.readable.getReader(); for (;;) { const { done, value } = await r.read(); if (done) break; pedacos.push(value); } })();
  const enc = new TextEncoder();
  let cru = 0, linhas = 0, ntab = 0;
  const escreve = async (s) => { const b = enc.encode(s); cru += b.length; if (cru > LIMITE_BYTES) throw new Error('banco grande demais para a cópia'); await w.write(b); };
  await escreve(`{"versao":1,"criado":${JSON.stringify(new Date().toISOString())},"tabelas":{`);
  let primeira = true;
  for (const t of tabs.results || []) {
    if (FORA.has(t.name)) continue;
    ntab++;
    await escreve((primeira ? '' : ',') + JSON.stringify(t.name) + ':{"sql":' + JSON.stringify(t.sql) + ',"linhas":[');
    primeira = false;
    const nome = '"' + t.name.replace(/"/g, '""') + '"';
    let ordem = ' ORDER BY rowid';
    for (let off = 0, prim = true; ; off += PAGINA) {
      let r;
      try { r = await env.DB.prepare(`SELECT * FROM ${nome}${ordem} LIMIT ? OFFSET ?`).bind(PAGINA, off).all(); }
      catch (e) { if (!ordem) throw e; ordem = ''; r = await env.DB.prepare(`SELECT * FROM ${nome} LIMIT ? OFFSET ?`).bind(PAGINA, off).all(); } // tabela sem rowid
      const rs = r.results || [];
      if (rs.length) { await escreve((prim ? '' : ',') + rs.map((x) => JSON.stringify(x)).join(',')); prim = false; linhas += rs.length; }
      if (rs.length < PAGINA) break;
    }
    await escreve(']}');
  }
  await escreve('}}');
  await w.close();
  await leitura;
  const total = pedacos.reduce((s, p) => s + p.length, 0), corpo = new Uint8Array(total);
  let pos = 0; for (const p of pedacos) { corpo.set(p, pos); pos += p.length; }
  const chave = 'd1/' + dia() + '.json.gz';
  await env.BACKUP.put(chave, corpo, {
    httpMetadata: { contentType: 'application/json', contentEncoding: 'gzip' },
    customMetadata: { tabelas: String(ntab), linhas: String(linhas), cru: String(cru), ms: String(Date.now() - t0) },
  });
  const apagadas = await limparAntigas(env);
  return { chave, bytes: total, cru, tabelas: ntab, linhas, apagadas, ms: Date.now() - t0 };
}

async function limparAntigas(env) {
  const corte = dia(new Date(Date.now() - DIAS_GUARDADOS * 864e5));
  const velhas = [];
  let cursor;
  do {
    const l = await env.BACKUP.list({ prefix: 'd1/', cursor });
    for (const o of l.objects) { const d = o.key.slice(3, 13); if (d < corte) velhas.push(o.key); }
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
  for (let i = 0; i < velhas.length; i += 1000) await env.BACKUP.delete(velhas.slice(i, i + 1000));
  return velhas.length;
}

export async function listaBackups(env) {
  if (!env.BACKUP) return { ligado: false };
  const itens = [];
  let cursor;
  do {
    const l = await env.BACKUP.list({ prefix: 'd1/', cursor, include: ['customMetadata'] });
    for (const o of l.objects) itens.push({ chave: o.key, bytes: o.size, quando: o.uploaded, linhas: Number(o.customMetadata?.linhas || 0), tabelas: Number(o.customMetadata?.tabelas || 0) });
    cursor = l.truncated ? l.cursor : undefined;
  } while (cursor);
  itens.sort((a, b) => (a.chave < b.chave ? 1 : -1));
  return { ligado: true, dias: DIAS_GUARDADOS, total: itens.reduce((s, x) => s + x.bytes, 0), quantas: itens.length, ultimas: itens.slice(0, 7) };
}

// admin: GET lista; GET ?baixar=d1/AAAA-MM-DD.json.gz baixa; POST {acao:'agora'} faz uma cópia agora
export async function apiBackupAdmin(req, env, json) {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const k = url.searchParams.get('baixar');
    if (k) {
      if (!/^d1\/\d{4}-\d{2}-\d{2}\.json\.gz$/.test(k) || !env.BACKUP) return json({ erro: 'Cópia inválida.' }, 400);
      const o = await env.BACKUP.get(k);
      if (!o) return json({ erro: 'Cópia não encontrada.' }, 404);
      // vai compactado, como está guardado (o arquivo baixado é o .json.gz)
      return new Response(o.body, { headers: { 'Content-Type': 'application/gzip', 'Content-Disposition': `attachment; filename="mercadomacro-${k.slice(3)}"`, 'Cache-Control': 'no-store' }, encodeBody: 'manual' });
    }
    return json(await listaBackups(env), 200, { 'Cache-Control': 'no-store' });
  }
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  const b = await req.json().catch(() => ({}));
  if (b.acao === 'agora') {
    try { return json({ ok: true, ...(await fazerBackup(env)) }); }
    catch (e) { return json({ erro: 'A cópia falhou: ' + String(e.message || e).slice(0, 200) }, 500); }
  }
  return json({ erro: 'Ação desconhecida.' }, 400);
}
