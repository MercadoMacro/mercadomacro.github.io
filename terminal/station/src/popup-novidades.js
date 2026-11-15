/* Pop-up de novidades do site (15/11/2026, pedido do Dante).
   O administrador escreve no /admin (aba Comunicação) um aviso curto do que mudou no site. Quem entra no terminal vê
   o aviso uma vez só (vale para todos os aparelhos da pessoa: fica marcado em dados_usuario, chave 'popup_visto').
   "Publicar como novidade nova" gera outro id, e todo mundo vê de novo; "Salvar correção" mantém o id (para arrumar
   um erro de digitação sem mostrar de novo a quem já viu).
   Guardado em config, chave 'popup_novidades' (texto puro, não é segredo). Contagem em popup_stats. */

const CHAVE = 'popup_novidades';
const PUBLICOS = new Set(['todos', 'assinantes', 'teste']);
const limpa = (x, max) => String(x ?? '').replace(/\r/g, '').trim().slice(0, max);

export async function lerPopup(env) {
  const r = await env.DB.prepare('SELECT valor FROM config WHERE chave = ?').bind(CHAVE).first().catch(() => null);
  try { return r ? JSON.parse(r.valor) : null; } catch (e) { return null; }
}
async function gravarPopup(env, p) {
  await env.DB.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor').bind(CHAVE, JSON.stringify(p)).run();
}
async function contar(env, id, evento) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS popup_stats (popup_id TEXT NOT NULL, evento TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (popup_id, evento))').run();
  await env.DB.prepare('INSERT INTO popup_stats (popup_id, evento, n) VALUES (?, ?, 1) ON CONFLICT(popup_id, evento) DO UPDATE SET n = n + 1').bind(id, evento).run();
}
// destino do botão: uma aba do terminal ("tab:news-panel") ou um endereço do próprio site ("/planos") ou https
function destinoValido(alvo) {
  const a = limpa(alvo, 300);
  if (!a) return '';
  if (/^tab:[a-z-]{2,40}$/.test(a)) return a;
  if (/^\/[\w\-./?=&#%]*$/.test(a) && !a.startsWith('//')) return a;
  if (/^https:\/\/[\w.-]+(\/[^\s"'<>]*)?$/i.test(a)) return a;
  return '';
}
const paraQuem = (p, u) => {
  if (u.admin) return true;
  const teste = u.plano === 'gratis';
  return p.publico === 'assinantes' ? !teste : p.publico === 'teste' ? teste : true;
};

// GET: o aviso para esta pessoa (ou nada). POST {id, acao: 'fechou' | 'clicou' | 'mostrou'}: marca como visto
export async function apiPopupUsuario(req, env, u, json) {
  const p = await lerPopup(env);
  if (req.method === 'GET') {
    if (!p || !p.ligado || !p.id || !paraQuem(p, u)) return json({ popup: null }, 200, { 'Cache-Control': 'no-store' });
    if (p.ate && Date.now() > Date.parse(p.ate + 'T23:59:59-03:00')) return json({ popup: null }, 200, { 'Cache-Control': 'no-store' });
    const visto = await env.DB.prepare("SELECT valor FROM dados_usuario WHERE usuario_id = ? AND chave = 'popup_visto'").bind(u.id).first().catch(() => null);
    if (visto && visto.valor === p.id) return json({ popup: null }, 200, { 'Cache-Control': 'no-store' });
    return json({ popup: { id: p.id, titulo: p.titulo, texto: p.texto, botao: p.botao, alvo: p.alvo } }, 200, { 'Cache-Control': 'no-store' });
  }
  if (req.method === 'POST') {
    let b = {}; try { b = await req.json(); } catch (e) { b = {}; }
    if (!p || b.id !== p.id || !['fechou', 'clicou', 'mostrou'].includes(b.acao)) return json({ ok: false }, 400);
    if (b.acao !== 'mostrou') {
      await env.DB.prepare("INSERT INTO dados_usuario (usuario_id, chave, valor, ts) VALUES (?, 'popup_visto', ?, ?) ON CONFLICT(usuario_id, chave) DO UPDATE SET valor = excluded.valor, ts = excluded.ts")
        .bind(u.id, p.id, Date.now()).run();
    }
    await contar(env, p.id, b.acao).catch(() => {});
    return json({ ok: true });
  }
  return json({ erro: 'Método não permitido.' }, 405);
}

// administrador: GET (aviso atual + números); POST {acao: 'salvar' | 'ligar' | 'rever'}
export async function apiPopupAdmin(req, env, eu, json) {
  if (req.method === 'GET') {
    const p = await lerPopup(env);
    let stats = {};
    if (p && p.id) {
      const r = await env.DB.prepare('SELECT evento, n FROM popup_stats WHERE popup_id = ?').bind(p.id).all().catch(() => ({ results: [] }));
      (r.results || []).forEach((x) => { stats[x.evento] = x.n; });
    }
    return json({ popup: p, stats }, 200, { 'Cache-Control': 'no-store' });
  }
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  let b = {}; try { b = await req.json(); } catch (e) { b = {}; }
  const atual = (await lerPopup(env)) || {};
  if (b.acao === 'ligar') {
    if (!atual.id) return json({ erro: 'Salve o aviso antes de ligar.' }, 400);
    await gravarPopup(env, { ...atual, ligado: !!b.ligado });
    return json({ ok: true });
  }
  if (b.acao === 'rever') {
    // o administrador vê o aviso de novo no próximo carregamento do site (para conferir)
    await env.DB.prepare("DELETE FROM dados_usuario WHERE usuario_id = ? AND chave = 'popup_visto'").bind(eu.id).run();
    return json({ ok: true });
  }
  if (b.acao === 'salvar') {
    const titulo = limpa(b.titulo, 90), texto = limpa(b.texto, 1500);
    if (!titulo || !texto) return json({ erro: 'Preencha o título e o texto.' }, 400);
    const botao = limpa(b.botao, 32), alvo = destinoValido(b.alvo);
    if (botao && !alvo) return json({ erro: 'Escolha para onde o botão leva (uma aba ou um endereço).' }, 400);
    const ate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.ate || '')) ? b.ate : '';
    const novo = !!b.nova || !atual.id;
    const p = {
      id: novo ? 'p' + Date.now().toString(36) : atual.id,
      titulo, texto, botao: botao && alvo ? botao : '', alvo: botao && alvo ? alvo : '',
      publico: PUBLICOS.has(b.publico) ? b.publico : 'todos', ate,
      ligado: b.ligado !== false, criado: novo ? new Date().toISOString() : (atual.criado || new Date().toISOString()), editado: new Date().toISOString(),
    };
    await gravarPopup(env, p);
    return json({ ok: true, popup: p, novo });
  }
  return json({ erro: 'Ação desconhecida.' }, 400);
}
