
const JADESITE = 'https://mercadomacro.com.br/conta';

// Call only from the signature-verified production WhatsApp webhook.
export async function jadeWatchlistCommand(text, phone, env) {
  if (!/^vincular\b/.test(text) && !/\b(watchlists?|minha lista|meus ativos)\b/.test(text)) return null;
  if (!env.JADE) return 'A consulta à watchlist está temporariamente indisponível.';
  try {
    return await handleWatchlist(text, phone, env);
  } catch {
    return 'Não consegui consultar sua watchlist agora. Tente de novo em alguns minutos.';
  }
}

async function handleWatchlist(text, phone, env) {
  const link = /^vincular ([a-f0-9]{32})$/.exec(text);
  if (link) {
    const linked = await env.JADE.link(phone, link[1]);
    return linked ? 'WhatsApp vinculado. Pergunte: o que mexeu com minha watchlist?' :
      'O código está inválido ou expirou. Gere outro em ' + JADESITE + '. Se este número já estiver vinculado a outra conta, desvincule por lá primeiro.';
  }
  if (/^vincular\b/.test(text)) return 'Gere um código de vínculo em ' + JADESITE;
  const list = await env.JADE.watchlist(phone);
  if (list === null) return 'Para consultar sua watchlist, entre no Mercado Macro e vincule seu WhatsApp em ' + JADESITE;
  if (!list.length) return 'Sua conta está vinculada. Adicione ativos à watchlist do terminal para começar.';
  const response = await fetch('https://news.cota-cotacao10.workers.dev/', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error('Feed indisponível');
  const data = await response.json();
  const now = Date.now();
  const headlines = [];
  const seen = new Set();
  for (const item of Array.isArray(data) ? data : []) {
    const title = typeof item?.titulo === 'string' ? item.titulo.trim() : '';
    const link = typeof item?.link === 'string' ? item.link.trim() : '';
    const time = Number(item?.data);
    if (!title || !/^https?:\/\//i.test(link) || link.length > 350 || seen.has(link) ||
      !Number.isFinite(time) || time > now + 300000 || now - time > 36 * 3600000) continue;
    const normalized = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const words = normalized.split(/[^A-Z0-9]+/);
    const matches = list.filter(({s, n}) => {
      const ticker = s.replace(/\.SA$/i, '').toUpperCase();
      const name = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
      return (/^[A-Z0-9]{3,12}$/.test(ticker) && words.includes(ticker)) ||
        (name.length >= 5 && name !== ticker && (' ' + words.join(' ') + ' ').includes(' ' + name.replace(/[^A-Z0-9]+/g, ' ').trim() + ' '));
    });
    if (!matches.length) continue;
    seen.add(link);
    headlines.push('• ' + matches.map(({s}) => s).join(', ') + ' · ' + title.slice(0, 230) + '\n' + link);
    if (headlines.length === 3) break;
  }
  return headlines.length ? '*Sua watchlist | Jade*\n\n' + headlines.join('\n\n') :
    'Não encontrei manchetes recentes que mencionem diretamente ativos da sua watchlist. Veja a lista no terminal: https://mercadomacro.com.br/';
}
