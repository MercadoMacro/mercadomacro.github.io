/* Radar Mercado Macro no WhatsApp (14/11/2026, pedido do Dante). A API oficial do WhatsApp não publica em canais,
   então a publicação é manual e sem risco para os números:
   1. quando a abertura e o fechamento saem no canal do Telegram, o mesmo texto vai para a conversa do administrador
      já no formato do WhatsApp (negrito com *, links por extenso), para copiar e colar no canal "Radar Mercado Macro";
   2. o post termina com o link "Conheça o terminal com a Jade", que abre o WhatsApp com "Vim do Radar" escrito;
   3. a Jade recebe quem vem do Radar e conta o caminho (funil_whatsapp): conversas, pedidos de atendimento e links
      de planos mandados; as visitas e os cadastros que chegam pelo link ?origem=radar-wa aparecem em "De onde vêm".
   Liga e desliga por config radar_wa ('nao' desliga). */
export const JADE_NUMERO = '5511971787986';
export const linkJade = (texto = 'Vim do Radar') => `https://wa.me/${JADE_NUMERO}?text=${encodeURIComponent(texto)}`;

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
// HTML do Telegram (<b>, <i>, <a>) para o jeito do WhatsApp (*negrito*, _itálico_, link por extenso)
export function paraWhatsApp(html) {
  return String(html || '')
    .replace(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, u, t) => {
      const texto = t.replace(/<[^>]+>/g, '').trim();
      const limpo = u.replace(/^https?:\/\//, '').replace(/\/$/, '');
      return texto === limpo || texto === u ? u : `${texto} (${u})`;
    })
    .replace(/<b>([\s\S]*?)<\/b>/gi, (_, t) => (t.trim() ? `*${t.trim()}*` : ''))
    .replace(/<i>([\s\S]*?)<\/i>/gi, (_, t) => (t.trim() ? `_${t.trim()}_` : ''))
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENT[m] || m)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// post pronto para o canal: troca o rodapé do Telegram pelo convite para a Jade e pelo site com origem marcada
export function postRadar(html) {
  const corpo = paraWhatsApp(html).split('\n').filter((l) => !/^Painel completo:/i.test(l.trim())).join('\n').trim();
  return `${corpo}\n\n📲 *Conheça o terminal com a Jade:* ${linkJade()}\n🌐 Terminal completo: https://mercadomacro.com.br/?origem=radar-wa`;
}

// manda para a conversa do administrador: um aviso curto e, separado, só o post (para copiar sem sobra)
export async function rascunhoRadar(env, { tipo, html, config, telegram }) {
  const c = config;
  if (c.radar_wa === 'nao' || !(c.tg_token && c.tg_chat) || !html) return false;
  const chave = `${tipo}-${new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10)}`;
  if (c['radar_ult_' + tipo] === chave) return false;
  const post = postRadar(html).slice(0, 4000);
  const nome = tipo === 'abertura' ? 'Abertura' : 'Fechamento';
  const a = await telegram(c.tg_token, 'sendMessage', { chat_id: c.tg_chat, text: `📋 ${nome} pronto para o Radar no WhatsApp. Toque e segure a próxima mensagem, copie e cole no canal.`, disable_notification: false });
  if (!a.ok) return false;
  const b = await telegram(c.tg_token, 'sendMessage', { chat_id: c.tg_chat, text: post, disable_web_page_preview: true });
  return b.ok ? chave : false;
}

// contagem do caminho de quem vem do Radar (chamada pela Jade do WhatsApp por JadeWatchlist.funil)
const EVENTOS = new Set(['inicio', 'atendimento', 'planos']);
export async function registrarFunil(env, origem, evento) {
  if (!/^[a-z0-9-]{2,20}$/.test(String(origem)) || !EVENTOS.has(evento)) return false;
  const dia = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS funil_whatsapp (dia TEXT NOT NULL, origem TEXT NOT NULL, evento TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (dia, origem, evento))').run();
  await env.DB.prepare('INSERT INTO funil_whatsapp (dia, origem, evento, n) VALUES (?, ?, ?, 1) ON CONFLICT(dia, origem, evento) DO UPDATE SET n = n + 1').bind(dia, origem, evento).run();
  return true;
}
// por semana (segunda a domingo), últimas 8 semanas, com visitas e cadastros pelo link ?origem=radar-wa
export async function funilRadar(env, agora = Date.now()) {
  const desde = new Date(agora - 3 * 3600000 - 56 * 86400000).toISOString().slice(0, 10);
  const q = async (sql) => { try { return (await env.DB.prepare(sql).bind(desde).all()).results || []; } catch (e) { return []; } };
  const f = await q("SELECT dia, evento, n FROM funil_whatsapp WHERE origem = 'radar' AND dia >= ?");
  const o = await q("SELECT dia, tipo, n FROM origens WHERE origem = 'Link: radar-wa' AND dia >= ?");
  const semana = (dia) => { const d = new Date(dia + 'T12:00:00Z'); const s = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000); return s.toISOString().slice(0, 10); };
  const S = {};
  const soma = (dia, k, n) => { const w = semana(dia); (S[w] ||= { semana: w, inicio: 0, atendimento: 0, planos: 0, visita: 0, cadastro: 0 })[k] += n; };
  for (const r of f) soma(r.dia, r.evento, r.n);
  for (const r of o) if (r.tipo === 'visita' || r.tipo === 'cadastro') soma(r.dia, r.tipo, r.n);
  return Object.values(S).sort((a, b) => (a.semana < b.semana ? 1 : -1));
}
