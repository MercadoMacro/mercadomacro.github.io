/* Arquivo de notícias (13/11/2026, pedido do Dante): a tabela noticias_hist (que já alimentava a busca da Jade,
   desde 11/11) passa a guardar também quando o site viu cada manchete pela primeira vez (visto), por onde viu
   (via: 'ao_vivo' = relé de 15 s com gente no site; 'lista' = rodada de 15 min), o nível de impacto e as etiquetas.
   Com isso: "Ver notícias mais antigas" (até 7 dias) na aba Notícias, a Jade lê a semana inteira e o /admin mostra
   quanto tempo cada fonte leva entre publicar e aparecer no site. Guarda manchete, link e um trecho curto (o texto
   inteiro é do jornal). Fica 180 dias (a busca da Jade usa um arquivo por dia). */
const DIA = 86400000;
export const SEMANA = 7 * DIA;
let pronta = false;
async function preparar(env) {
  if (pronta) return;
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS noticias_hist (link TEXT PRIMARY KEY, titulo TEXT NOT NULL, fonte TEXT, data INTEGER NOT NULL, dia TEXT NOT NULL, resumo TEXT)').run();
  for (const c of ['visto INTEGER', 'via TEXT', 'nivel TEXT', 'tags TEXT', 'veiculo TEXT']) {
    await env.DB.prepare('ALTER TABLE noticias_hist ADD COLUMN ' + c).run().catch(() => {}); // já existe
  }
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS noticias_hist_data ON noticias_hist (data)').run();
  pronta = true;
}

// grava só as que ainda não estão (o link é a chave): a primeira vez que o site viu fica para sempre
export async function arquivarNoticias(env, lista, via = 'lista', agora = Date.now()) {
  const novas = (Array.isArray(lista) ? lista : []).filter((n) => n && n.link && n.titulo && Number.isFinite(+n.data) && +n.data >= agora - SEMANA).slice(0, 400);
  if (!novas.length || !env.DB) return 0;
  await preparar(env);
  for (let i = 0; i < novas.length; i += 50) {
    await env.DB.batch(novas.slice(i, i + 50).map((n) => env.DB.prepare('INSERT OR IGNORE INTO noticias_hist (link, titulo, fonte, data, dia, resumo, visto, via, nivel, tags, veiculo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(String(n.link).slice(0, 2000), String(n.titulo).slice(0, 300), String(n.fonte || ''), +n.data, new Date(+n.data - 3 * 3600000).toISOString().slice(0, 10),
        n.resumo ? String(n.resumo).slice(0, 400) : null, Math.max(agora, +n.data), via, String(n.nivel || 'NORMAL').toUpperCase(),
        Array.isArray(n.tags) && n.tags.length ? n.tags.slice(0, 10).join(',') : null, n.veiculo ? String(n.veiculo).slice(0, 120) : null)));
  }
  return novas.length;
}

export async function limparArquivo(env, agora = Date.now()) {
  await env.DB.prepare('DELETE FROM noticias_hist WHERE data < ?').bind(agora - 180 * DIA).run();
}

const linha = (r) => ({ link: r.link, titulo: r.titulo, fonte: r.fonte || '', veiculo: r.veiculo || '', data: r.data, nivel: r.nivel || 'NORMAL', tags: r.tags ? String(r.tags).split(',') : [] });
const tira = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// notícias dos últimos 7 dias, das mais novas para as mais velhas, antes de "antes" (para ir carregando aos poucos)
export async function noticiasAntigas(env, { antes, termo = '', fontes = [], max = 60, agora = Date.now() } = {}) {
  await preparar(env);
  const ate = Math.min(Number(antes) || agora, agora), de = agora - SEMANA;
  const fs = (Array.isArray(fontes) ? fontes : []).filter((f) => typeof f === 'string' && f).slice(0, 60);
  const pal = tira(termo).split(/\s+/).filter((w) => w.length > 2).slice(0, 5);
  const lim = Math.min(Math.max(Number(max) || 60, 1), 100);
  // as palavras são filtradas aqui (sem acento); por isso o banco devolve um lote maior
  const r = await env.DB.prepare(`SELECT link, titulo, fonte, veiculo, data, nivel, tags FROM noticias_hist WHERE data < ? AND data >= ?${fs.length ? ` AND fonte IN (${fs.map(() => '?').join(',')})` : ''} ORDER BY data DESC LIMIT ?`)
    .bind(ate, de, ...fs, pal.length ? 2000 : lim + 1).all();
  let l = r.results || [];
  if (pal.length) l = l.filter((x) => pal.every((w) => tira(x.titulo + ' ' + (x.veiculo || '')).includes(w)));
  return { itens: l.slice(0, lim).map(linha), mais: l.length > lim };
}

// para a Jade: as manchetes de mais peso das últimas "horas" (até 7 dias), com palavras opcionais
export async function arquivoParaJade(env, desde, termo = '') {
  await preparar(env);
  const pal = tira(termo).split(/\s+/).filter((w) => w.length > 2);
  const r = await env.DB.prepare('SELECT link, titulo, fonte, veiculo, data, nivel, tags, resumo FROM noticias_hist WHERE data >= ? ORDER BY data DESC LIMIT 4000').bind(desde).all();
  const peso = { CRITICO: 3, ALTO: 2, MEDIO: 1 };
  return (r.results || []).filter((x) => !pal.length || pal.some((w) => tira(x.titulo + ' ' + (x.resumo || '')).includes(w)))
    .map((x) => ({ ...linha(x), trecho: x.resumo || '', finalScore: (peso[x.nivel] || 0) * 10 }));
}

// atraso entre publicar (data do feed) e o site ver (visto), só do relé ao vivo (a rodada de 15 min distorce)
export function resumoAtraso(linhas) {
  const por = {};
  for (const l of linhas) {
    const a = l.visto - l.data;
    if (!Number.isFinite(a) || a < 0 || a > 12 * 3600000) continue;
    (por[l.fonte || '?'] ||= []).push(a);
  }
  const pct = (v, p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return Object.entries(por).map(([fonte, v]) => {
    v.sort((x, y) => x - y);
    return { fonte, n: v.length, mediana: pct(v, 0.5), p90: pct(v, 0.9), ate2min: v.filter((x) => x <= 120000).length / v.length };
  }).sort((x, y) => x.mediana - y.mediana);
}
export async function atrasoNoticias(env, agora = Date.now()) {
  await preparar(env);
  const r = await env.DB.prepare("SELECT fonte, data, visto FROM noticias_hist WHERE via = 'ao_vivo' AND visto >= ? LIMIT 20000").bind(agora - SEMANA).all();
  const t = await env.DB.prepare('SELECT COUNT(*) n, MIN(data) de FROM noticias_hist WHERE data >= ?').bind(agora - SEMANA).first();
  return { fontes: resumoAtraso(r.results || []), semana: t?.n || 0, desde: t?.de || null };
}
