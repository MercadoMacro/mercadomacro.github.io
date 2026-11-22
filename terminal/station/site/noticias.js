/* =========================================================
   NOTÍCIAS (aba Notícias, briefing e leitura das fontes)
   Desde 22/11/2026 o código fica neste arquivo, carregado logo depois do app.js (antes ficava dentro dele).
   Usa as funções gerais do app.js ($, toast, escapeHTML...). Sem mudança de comportamento, exceto os botões da
   lateral, que deixaram de ter a ação escrita no HTML (onclick) por causa da regra de scripts (CSP).
   ========================================================= */
/* =========================================================
   NOVO SISTEMA DE NOTÍCIAS
   ========================================================= */
let newsAll = [];
// fontes escolhidas nas Notícias ficam guardadas neste aparelho (09/11/2026, pedido do Severino: F5 não apaga a escolha)
const NEWS_FONTES_KEY = 'mm_news_fontes_v1';
let newsActiveSources = new Set((() => {
  try { const a = JSON.parse(localStorage.getItem(NEWS_FONTES_KEY) || '[]'); return Array.isArray(a) ? a.filter(k => typeof k === 'string' && NEWS_SOURCES[k]) : []; } catch (e) { return []; }
})());
function newsSalvaFontes() {
  try { if (newsActiveSources.size) localStorage.setItem(NEWS_FONTES_KEY, JSON.stringify([...newsActiveSources])); else localStorage.removeItem(NEWS_FONTES_KEY); } catch (e) { /* sem armazenamento */ }
}
let newsOpenCategory = null;
let newsCurrentMode = 'news';
let newsLastSeenIds = new Set();

/* =========================================================
   NOTÍCIAS: relevância com tempo, agrupamento, curadoria,
   filtros por ativo e alerta de notícia crítica
   ========================================================= */
// Nota com decaimento: perde 4 pontos por hora (uma "crítica" de 10 h atrás fica abaixo de uma "alta" recente)
function newsRank(n) {
  const ageH = Math.max(0, (Date.now() - (n.data || 0)) / 3600000);
  return (n.finalScore || 0) - ageH * 4;
}
// fontes que chegam em inglês (o worker de notícias não consegue mais traduzir: o Google recusa pedidos vindos de servidores)
const NEWS_EN = new Set(['Bloomberg', 'Financial Juice', 'ForexLive', 'Zero Hedge', 'FXStreet', 'FX Markets', 'ING Think', 'CNBC', 'MarketWatch', 'Yahoo Finance', 'WSJ', 'CoinDesk', 'Proactive Investors', 'RTTNews', 'Seeking Alpha', 'Barchart', 'Reuters']);
const NEWS_BR = new Set(['Valor Econômico', 'InfoMoney', 'Investing.com BR', 'ADVFN BR', 'Notícia Brasil', 'BeInCrypto BR', 'Cointelegraph BR', 'Google News', 'Money Times', 'InvestNews', 'Valor Investe', 'Bloomberg Línea', 'Suno', 'BMC News', 'Invezz', 'Notícias Agrícolas', 'Folha',
  'O Antagonista', 'Poder360', 'G1 Política', 'Agência Brasil']);
// Política fica desligada até a pessoa ligar (botão na lateral das Notícias); escolha guardada neste aparelho
const NEWS_POL_KEY = 'news_politica_v1';
let newsPolitica = false;
try { newsPolitica = localStorage.getItem(NEWS_POL_KEY) === '1'; } catch (e) { /* silencioso */ }
let newsBruto = [];
const newsEhPolitica = (n) => (NEWS_SOURCES[n.fonte] || {}).scope === 'pol';
function toggleNewsPolitica() {
  newsPolitica = !newsPolitica;
  try { localStorage.setItem(NEWS_POL_KEY, newsPolitica ? '1' : '0'); } catch (e) { /* silencioso */ }
  if (!newsPolitica) Object.keys(NEWS_SOURCES).forEach(k => { if (NEWS_SOURCES[k].scope === 'pol') newsActiveSources.delete(k); });
  newsSalvaFontes();
  newsAll = newsBruto.filter(n => newsPolitica || !newsEhPolitica(n));
  buildNewsSidebar();
  updateNewsBubbleStates();
  renderNewsView();
  if (newsLiveShown()) renderLiveView();
}
const NEWS_MAX_IDADE = 48 * 3600 * 1000; // feeds às vezes reenviam matérias de meses atrás
const NEWS_TR_KEY = 'news_tr_v2'; // v2 (15/11/2026): descarta os trechos antigos, que no Zero Hedge eram a manchete repetida
let newsTr = {};
try { newsTr = JSON.parse(localStorage.getItem(NEWS_TR_KEY) || '{}') || {}; } catch (e) { newsTr = {}; }
// 17/11/2026: português de Portugal que escapa da tradução (a do servidor já vem revisada; esta cobre a do aparelho)
const NEWS_PT_BR = [['o débito público agregado', 'a dívida pública agregada'], ['do débito público', 'da dívida pública'], ['o débito público', 'a dívida pública'],
  ['débito público', 'dívida pública'], ['Irão', 'Irã'], ['Teerão', 'Teerã'], ['Moscovo', 'Moscou'], ['zona euro', 'zona do euro'], ['facto', 'fato'],
  ['registo', 'registro'], ['equipa', 'equipe'], ['acções', 'ações'], ['acção', 'ação'], ['accionistas', 'acionistas'], ['retalho', 'varejo'],
  ['sector', 'setor'], ['actual', 'atual'], ['a Fed', 'o Fed'], ['da Fed', 'do Fed'], ['na Fed', 'no Fed'], ['pela Fed', 'pelo Fed'], ['à Fed', 'ao Fed']]
  .map(([de, para]) => [new RegExp(`(?<![\\p{L}])${de}(?![\\p{L}])`, 'giu'), para]);
function newsParaBrasil(t, orig = '') {
  if (!t) return t;
  const caixa = (m, p) => (m[0] !== m[0].toLowerCase() ? p[0].toUpperCase() + p.slice(1) : p);
  let x = String(t);
  for (const [re, p] of NEWS_PT_BR) x = x.replace(re, (m) => caixa(m, p));
  x = x.replace(/(?<![\p{L}])económic/giu, (m) => caixa(m, 'econômic'));
  if (/west bank/i.test(orig) && !/gaza/i.test(orig)) x = x.replace(/Faixa de Gaza/g, 'Cisjordânia');
  return x;
}
function newsAplicaTraducao(n) {
  const t = newsTr[n.link];
  if (!t) return;
  if (t[0] && !n.traduzido) { n.tituloOriginal = n.titulo; n.titulo = newsParaBrasil(t[0], n.titulo); n.traduzido = true; }
  if (t[1]) n.trechoPt = newsParaBrasil(t[1], n.trecho); // 15/11/2026: o trecho chega depois do título; antes ficava de fora até recarregar
}
// tira notícias velhas, o "FinancialJuice:" do começo e aplica as traduções já guardadas
// Notícias Agrícolas lidas no navegador do leitor (09/11/2026): o site deles passou a barrar leitura automática
// pelo servidor ("Just a moment..."), então o widget público deles (feito para outros sites colarem) é carregado
// aqui, num quadro escondido, e as manchetes viram cartões como as outras fontes. Falhou: só essa fonte fica de fora.
// o endereço do widget fica em /vitrine/na-caixa.html
let newsNa = [], newsNaEm = 0;
function newsNaLe(doc) {
  const itens = []; let dia = null;
  doc.querySelectorAll('.na_dia, li').forEach(el => {
    const t = (el.textContent || '').trim();
    if (el.classList.contains('na_dia')) { const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); dia = m ? m[3] + '-' + m[2] + '-' + m[1] : null; return; }
    const a = el.querySelector('a[href]'), h = t.match(/^(\d{1,2}):(\d{2})\s*\|/);
    if (!a || !h) return;
    let d = dia;
    if (!d) { // as de hoje vêm sem cabeçalho de data (só os dias anteriores têm): hoje em Brasília, ou ontem se o horário ainda não chegou
      const b = new Date(Date.now() - 3 * 3600 * 1000);
      let t = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
      if (t + ((+h[1] + 3) * 60 + +h[2]) * 60000 > Date.now() + 10 * 60 * 1000) t -= 86400000;
      d = new Date(t).toISOString().slice(0, 10);
    }
    const link = String(a.getAttribute('href') || '').replace(/\?utm_[^#]*$/, '');
    if (!/^https:\/\/www\.noticiasagricolas\.com\.br\//.test(link)) return;
    const i = a.querySelector('i'), veiculo = i ? (i.textContent.match(/^\s*\(([^)]{1,60})\)\s*$/) || [])[1] || '' : '';
    const titulo = Array.from(a.childNodes).filter(n => n.nodeName !== 'I').map(n => n.textContent).join('').replace(/\s+/g, ' ').trim();
    const data = Date.parse(d + 'T' + h[1].padStart(2, '0') + ':' + h[2] + ':00-03:00');
    if (!titulo || !Number.isFinite(data) || data > Date.now() + 10 * 60 * 1000) return;
    itens.push({ titulo, link, resumo: '', palavras: 0, trecho: '', fonte: 'Notícias Agrícolas', veiculo, data, impactScore: 0, finalScore: 5, nivel: 'NORMAL', tags: [], imagem: null });
  });
  return itens;
}
// 22/11/2026: o widget deles roda numa caixa fechada (/vitrine/na-caixa.html, quadro com sandbox, sem acesso a esta
// página, aos cookies ou à sessão). A caixa só devolve o HTML das manchetes por mensagem; a leitura é feita aqui, num
// documento inerte (DOMParser não roda scripts nem carrega imagens). Antes o script deles rodava dentro desta página.
function newsNaCarrega() {
  if (Date.now() - newsNaEm < 5 * 60 * 1000 || !document.body) return;
  newsNaEm = Date.now();
  const f = document.createElement('iframe');
  f.hidden = true; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
  f.setAttribute('sandbox', 'allow-scripts');
  let fim = null;
  const sai = () => { clearTimeout(fim); window.removeEventListener('message', ouve); f.remove(); };
  function ouve(e) {
    if (e.source !== f.contentWindow || !e.data || e.data.tipo !== 'mm-na') return;
    sai();
    let itens = [];
    try { itens = newsNaLe(new DOMParser().parseFromString(String(e.data.html || '').slice(0, 300000), 'text/html')); } catch (er) { /* formato novo: só essa fonte fica de fora */ }
    if (!itens.length) return;
    newsNa = itens;
    if (newsBruto.length) newsApplyUpdate(newsBruto, true);
  }
  window.addEventListener('message', ouve);
  fim = setTimeout(sai, 20000);
  f.src = '/vitrine/na-caixa.html';
  document.body.appendChild(f);
}
function newsNaJunta(list) {
  if (!newsNa.length || !Array.isArray(list)) return list;
  const links = new Set(list.map(n => String(n && n.link || '').replace(/&amp;/g, '&').replace(/\?utm_[^#]*$/, '')));
  return list.concat(newsNa.filter(n => !links.has(n.link)).map(n => ({ ...n })));
}
function newsPrepara(list) {
  list = newsNaJunta(list);
  const agora = Date.now();
  const out = newsFixIds(list).filter(n => n && n.titulo && n.data && agora - n.data < NEWS_MAX_IDADE);
  out.forEach(n => {
    n.titulo = String(n.titulo).replace(/^FinancialJuice:\s*/i, '');
    n._br = NEWS_BR.has(n.fonte);
    // foto do Valor Investe vem num endereço que não existe (erro vermelho no console); a mesma foto está no do Valor
    if (n.imagem) n.imagem = String(n.imagem).replace('//s2-valorinveste.glbimg.com/', '//s2-valor.glbimg.com/');
    // tradução feita no servidor pela IA da Cloudflare (16/11/2026): entra como se já estivesse guardada aqui; o que
    // ainda não veio traduzido o aparelho traduz como antes
    // 19/11/2026: a fonte às vezes troca a manchete mantendo o mesmo link (o WSJ fez isso com o ouro) e a tradução
    // guardada ficava a da manchete velha. Agora cada tradução guarda a manchete em inglês de onde veio (3º item);
    // se a manchete mudou, a tradução é jogada fora. A do servidor vale sempre que vier
    const guardada = newsTr[n.link];
    if (guardada && guardada[2] && guardada[2] !== n.titulo) delete newsTr[n.link];
    if (!n._br && n.tituloPt && (!newsTr[n.link] || newsTr[n.link][0] !== n.tituloPt)) newsTr[n.link] = [n.tituloPt, n.trechoPt || '', n.titulo];
    newsAplicaTraducao(n);
  });
  newsBruto = out;
  return newsPolitica ? out : out.filter(n => !newsEhPolitica(n));
}
async function newsTraduzLote(textos) {
  const r = await fetchT('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=' + encodeURIComponent(textos.join('\n')), {}, 12000);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  const out = (d[0] || []).map(seg => seg[0]).join('').split('\n').map(x => x.trim());
  if (out.length !== textos.length) throw new Error('tradução desalinhada');
  return out;
}
// 15/11/2026 (reclamação de cliente: manchetes ficando em inglês): um lote que volta desalinhado não derruba mais
// todo o resto; ele é dividido ao meio até a manchete que atrapalha ser traduzida sozinha. Erro de rede ou limite
// do Google (429) continua subindo, para tentar de novo mais tarde.
async function newsTraduzSeguro(textos) {
  try { return await newsTraduzLote(textos); }
  catch (e) {
    if (!/desalinhada/.test(e.message)) throw e;
    if (textos.length === 1) return [''];
    const meio = Math.ceil(textos.length / 2);
    return (await newsTraduzSeguro(textos.slice(0, meio))).concat(await newsTraduzSeguro(textos.slice(meio)));
  }
}
function newsLotes(itens, campo) {
  const lotes = []; let atual = [], tam = 0;
  for (const n of itens) {
    const len = n[campo].length + 1;
    if (tam + len > 1500 && atual.length) { lotes.push(atual); atual = []; tam = 0; }
    atual.push(n); tam += len;
  }
  if (atual.length) lotes.push(atual);
  return lotes;
}
// o trecho que o cartão mostra; pula a manchete repetida e o "Authored by... via..." do começo (Zero Hedge)
const newsSoLetras = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9à-ú]+/g, '');
const newsTextoCurto = (n) => {
  const tit = newsSoLetras(n.tituloOriginal || n.titulo);
  const bom = (x) => x && newsSoLetras(x.replace(/…$/, '')) !== tit && !tit.startsWith(newsSoLetras(x.replace(/…$/, ''))) && !/^(authored by|submitted by|via )/i.test(x);
  const ps = [n.trecho].concat(String(n.resumo || '').split('\n\n')).map(x => String(x || '').trim()).filter(x => x.length > 40);
  return (ps.find(bom) || '').replace(/\n+/g, ' ').slice(0, 400);
};
const newsTrPulados = new Set(); // trechos que o Google devolveu vazios: não tenta de novo nesta visita
let newsTraduzindo = false, newsTrDeNovo = false, newsTrEspera = 0, newsTrTimer = null;
// traduz no navegador de quem lê (só o que ainda não foi traduzido; fica guardado neste aparelho).
// 15/11/2026: as mais novas primeiro (as que chegam ao vivo ficam em português em 1 a 2 s); se chegar notícia
// enquanto traduz, roda de novo no fim; se o Google limitar, tenta de novo em 20 s, 40 s, até 5 min.
async function newsTraduzir() {
  if (newsTraduzindo) { newsTrDeNovo = true; return; }
  const falta = newsAll.filter(n => NEWS_EN.has(n.fonte) && !n.traduzido && !(newsTr[n.link] && newsTr[n.link][0]));
  const semTrecho = (n) => NEWS_EN.has(n.fonte) && !newsTrPulados.has(n.link) && newsTextoCurto(n) && !(newsTr[n.link] && newsTr[n.link][1]);
  const faltaTrecho = newsAll.filter(semTrecho).length;
  if (!falta.length && !faltaTrecho) return;
  newsTraduzindo = true; newsTrDeNovo = false;
  let falhou = false;
  const aplica = () => {
    try { localStorage.setItem(NEWS_TR_KEY, JSON.stringify(newsTr)); } catch (e) { /* silencioso */ }
    newsAll.forEach(newsAplicaTraducao);
    renderNewsView();
    if (newsLiveShown()) renderLiveView();
    window.dispatchEvent(new Event('mm-news-traduzidas'));
  };
  try {
    // as da última hora primeiro (por horário), depois o resto pela importância
    const hora = Date.now() - 3600 * 1000;
    const novas = falta.filter(n => n.data >= hora).sort((a, b) => b.data - a.data);
    const resto = falta.filter(n => n.data < hora).sort((a, b) => newsRank(b) - newsRank(a));
    const sel = novas.concat(resto).slice(0, 300);
    let feitos = 0;
    for (const lote of newsLotes(sel, 'titulo').slice(0, 20)) {
      try {
        const tr = await newsTraduzSeguro(lote.map(n => n.titulo.replace(/\n+/g, ' ')));
        lote.forEach((n, i) => { if (tr[i]) newsTr[n.link] = [tr[i], (newsTr[n.link] || [])[1] || '', n.titulo]; });
        if (++feitos === 1) aplica(); // o primeiro lote (as mais novas) aparece na hora
      } catch (e) { console.warn('[News] tradução:', e.message); falhou = true; break; }
    }
    if (!falhou) {
      // trechos: as mais novas primeiro; o que não couber nesta rodada vai na próxima (2 s depois)
      const comTrecho = newsAll.filter(semTrecho).sort((a, b) => b.data - a.data).slice(0, 120)
        .map(n => ({ n, trecho: newsTextoCurto(n) }));
      const lotesT = newsLotes(comTrecho, 'trecho');
      if (lotesT.length > 12) newsTrDeNovo = true;
      for (const lote of lotesT.slice(0, 12)) {
        try {
          const tr = await newsTraduzSeguro(lote.map(x => x.trecho));
          lote.forEach((x, i) => { const v = newsTr[x.n.link] || []; if (tr[i]) newsTr[x.n.link] = [v[0] || '', tr[i], v[2] || x.n.tituloOriginal || x.n.titulo]; else newsTrPulados.add(x.n.link); });
        } catch (e) { console.warn('[News] tradução:', e.message); falhou = true; break; }
      }
    }
    // guarda só o que ainda está na lista
    const vivos = new Set(newsAll.map(n => n.link));
    Object.keys(newsTr).forEach(k => { if (!vivos.has(k)) delete newsTr[k]; });
    aplica();
  } finally {
    newsTraduzindo = false;
    clearTimeout(newsTrTimer);
    if (falhou) { newsTrEspera = Math.min((newsTrEspera || 10000) * 2, 300000); newsTrTimer = setTimeout(newsTraduzir, newsTrEspera); }
    else { newsTrEspera = 0; if (newsTrDeNovo) newsTrTimer = setTimeout(newsTraduzir, 2000); }
  }
}
// Financial Juice e ForexLive mandam cada frase de um discurso como uma notícia ("Fed's Goolsbee: ...").
// Junta as frases da mesma pessoa (até 6 h) num cartão só.
function newsJuntaFalas(list) {
  const grupos = new Map(), out = [];
  list.slice().sort((a, b) => b.data - a.data).forEach(n => {
    const orig = n.tituloOriginal || n.titulo;
    const m = /^([A-Z][^:]{2,40}):\s+\S/.exec(orig);
    if (!m || !NEWS_EN.has(n.fonte) || /^(ICYMI|BREAKING|WATCH|UPDATE)/i.test(m[1])) { out.push(n); return; }
    // 17/11/2026: "Trump on Iran:", "Trump on Taiwan:", "Trump, re Kim:" são a mesma pessoa: a chave é só quem fala,
    // e o tema fica na frase ("Sobre o Irã: ...")
    const quem = m[1].replace(/,?\s+(on|about|re|says|said|to|regarding)\b.*$/i, '').trim();
    const chave = quem.toLowerCase();
    const g = grupos.get(chave);
    if (g && g.data - n.data < 6 * 3600 * 1000) {
      const comTema = quem.length < m[1].trim().length;
      const nomeRe = new RegExp('^' + quem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[,:]?\\s*', 'i');
      let fala = comTema && nomeRe.test(n.titulo) ? n.titulo.replace(nomeRe, '') : n.titulo.replace(/^[^:]{2,60}:\s*/, '');
      fala = fala.charAt(0).toUpperCase() + fala.slice(1);
      g.falas.push(fala);
      g.impactScore = Math.max(g.impactScore || 0, n.impactScore || 0);
      g.finalScore = Math.max(g.finalScore || 0, n.finalScore || 0) + (g.falas.length <= 3 ? 2 : 0);
      return;
    }
    const lider = { ...n, falas: [] };
    grupos.set(chave, lider);
    out.push(lider);
  });
  return out;
}
function newsSourceLabel(n) {
  return n.fonte === 'Google News' ? (n.veiculo || '') : (NEWS_SOURCES[n.fonte]?.name || n.fonte);
}
function newsTokens(t) {
  return (t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3 || /^\d+$/.test(w));
}
// Agrupa manchetes sobre o mesmo fato (palavras em comum, até 12 h de distância)
function clusterNews(list) {
  const leads = [];
  newsJuntaFalas(list).sort((a, b) => newsRank(b) - newsRank(a)).forEach(n => {
    const tk = newsTokens(n.titulo);
    const set = new Set(tk);
    const lead = leads.find(l => {
      if (Math.abs(l.data - n.data) > 12 * 3600 * 1000) return false;
      // 16/11/2026: o servidor compara o sentido das manchetes (IA) e manda o mesmo "grupo" para o mesmo fato,
      // mesmo com palavras diferentes ou uma em inglês e outra em português
      if (n.grupo && (l.grupo === n.grupo || l.related.some(r => r.grupo === n.grupo))) return true;
      const common = l._tk.filter(w => set.has(w)).length;
      const ratio = common / Math.max(1, Math.min(l._tk.length, set.size));
      return (common >= 4 && ratio >= 0.6) || (common >= 3 && ratio >= 0.75);
    });
    if (lead) { lead.related.push(n); if (!lead.porque && n.porque) lead.porque = n.porque; }
    else leads.push({ ...n, _tk: [...set], related: [] });
  });
  return leads;
}

/* ---- Favoritas (★) e "Mandar ao cliente" ----
   17/11/2026 (pedido do Dante): a notícia marcada com ★ fica guardada NA CONTA por 30 dias (até 200), com uma cópia
   do título, fonte, link e trecho. Assim ela aparece em qualquer aparelho e continua lá mesmo depois de sair da
   lista do dia. As marcadas nas últimas 36 h continuam indo para os Destaques do resumo do cliente, como antes.
   Sincroniza como as outras preferências da conta (/api/conta/dados, chave noticias_fav): o aparelho guarda o que
   veio da conta (base) e as mudanças ainda não enviadas (pend); se outro aparelho gravou antes, refaz as mudanças
   sobre a versão da conta e tenta de novo. */
const NEWS_PICKS_KEY = 'news_picks_v1'; // formato antigo (só neste aparelho, 36 h): entra na conta na 1ª sincronização
const NEWS_FAV_KEY = 'mm_news_fav_v1';
const NEWS_FAV_DIAS = 30, NEWS_FAV_MAX = 200, NEWS_RESUMO_MS = 36 * 3600 * 1000;
const newsFav = (() => {
  let c = null; try { c = JSON.parse(localStorage.getItem(NEWS_FAV_KEY) || 'null'); } catch (e) { /* sem armazenamento */ }
  return { user: c?.user ?? null, base: Array.isArray(c?.base) ? c.base : [], ts: Number(c?.ts) || 0, pend: Array.isArray(c?.pend) ? c.pend : [], timer: null, enviando: false, sinc: 0 };
})();
function newsFavGrava() {
  try { localStorage.setItem(NEWS_FAV_KEY, JSON.stringify({ user: newsFav.user, base: newsFav.base, ts: newsFav.ts, pend: newsFav.pend })); } catch (e) { /* a conta ainda guarda */ }
}
function newsFavAplica(base, pend) {
  let itens = base.slice();
  for (const p of pend) {
    if (p.a === 'add' && p.item && !itens.some(x => x.id === p.item.id)) itens.unshift(p.item);
    else if (p.a === 'del') itens = itens.filter(x => x.id !== p.id);
    else if (p.a === 'fora') itens = itens.map(x => p.ids.includes(x.id) ? { ...x, fr: true } : x);
  }
  const corte = Date.now() - NEWS_FAV_DIAS * 864e5;
  return itens.filter(x => x && x.id && x.em > corte).sort((a, b) => b.em - a.em).slice(0, NEWS_FAV_MAX);
}
// todas as favoritas (30 dias), a mais recente primeiro
function getNewsFavs() { return newsFavAplica(newsFav.base, newsFav.pend); }
// as que vão para os Destaques do resumo do cliente: marcadas nas últimas 36 h e não tiradas do resumo
function getNewsPicks() { const agora = Date.now(); return getNewsFavs().filter(x => agora - x.em < NEWS_RESUMO_MS && !x.fr); }
function newsFavCopia(n) {
  const s = (t, m) => String(t || '').slice(0, m);
  const item = { id: s(n.id, 40), titulo: s(n.titulo, 400) || '(sem título)', fonte: s(n.fonte, 80), link: /^https?:\/\//i.test(n.link || '') ? s(n.link, 1000) : '#',
    data: Number(n.data) || Date.now(), em: Date.now(), nivel: s(n.nivel || 'normal', 12), impactScore: Number(n.impactScore) || 0 };
  if (n.veiculo) item.veiculo = s(n.veiculo, 80);
  if (n.traduzido) { item.traduzido = true; if (n.tituloOriginal) item.tituloOriginal = s(n.tituloOriginal, 400); }
  const tr = n.trechoPt || (NEWS_EN.has(n.fonte) ? '' : n.trecho) || '';
  if (tr) item[n.trechoPt ? 'trechoPt' : 'trecho'] = tr.length <= 500 ? tr : tr.slice(0, 497).replace(/\s+\S*$/, '') + '…';
  if (Array.isArray(n.tags) && n.tags.length) item.tags = n.tags.slice(0, 8).map(t => s(t, 24));
  return item;
}
// cópia guardada vira notícia de novo para os cartões e o leitor (marcada com _salva: sem o texto completo)
function newsFavComoNoticia(x) { return { ...x, _salva: true, _br: NEWS_BR.has(x.fonte), finalScore: x.impactScore || 0, tags: x.tags || [] }; }
function newsFavMuda(op) {
  newsFav.pend.push(op); newsFavGrava();
  clearTimeout(newsFav.timer); newsFav.timer = setTimeout(newsFavEnvia, 1200);
}
async function newsFavEnvia(tent = 0) {
  if (!newsFav.user || !newsFav.pend.length || window.__mmLoggingOut) return;
  if (newsFav.enviando) { clearTimeout(newsFav.timer); newsFav.timer = setTimeout(newsFavEnvia, 1500); return; }
  newsFav.enviando = true;
  const pend = newsFav.pend.slice(), itens = newsFavAplica(newsFav.base, pend), ts = Math.max(Date.now(), newsFav.ts + 1), user = newsFav.user;
  try {
    const r = await fetch('/api/conta/dados', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: user, k: 'noticias_fav', v: { v: 1, itens }, ts }) });
    if (user !== newsFav.user) return;
    if (r.ok) {
      newsFav.base = itens; newsFav.ts = ts; newsFav.pend = newsFav.pend.slice(pend.length); newsFavGrava();
      if (newsFav.pend.length) newsFavEnvia();
      return;
    }
    const j = await r.json().catch(() => ({}));
    // outro aparelho gravou antes: pega a versão da conta e refaz as mudanças daqui por cima
    if (r.status === 409 && j.codigo === 'versao-mais-nova' && tent < 3) { newsFav.enviando = false; await newsFavSincroniza(false); return newsFavEnvia(tent + 1); }
    throw new Error(j.erro || 'HTTP ' + r.status);
  } catch (e) {
    console.warn('[Favoritas] não sincronizou:', e.message); // fica guardada neste aparelho e vai na próxima vez
  } finally { newsFav.enviando = false; }
}
async function newsFavSincroniza(enviar = true) {
  try {
    const r = await fetch('/api/conta/dados?k=noticias_fav', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    if (!Number.isSafeInteger(j.usuario) || j.usuario <= 0) return;
    if (newsFav.user != null && newsFav.user !== j.usuario) { newsFav.base = []; newsFav.pend = []; newsFav.ts = 0; } // outra conta neste navegador
    newsFav.user = j.usuario;
    newsFav.base = j.v && Array.isArray(j.v.itens) ? j.v.itens : [];
    newsFav.ts = Number(j.ts) || 0;
    newsFav.sinc = Date.now();
    // as estrelas do formato antigo (só deste aparelho) entram na conta uma vez
    let antigas = []; try { antigas = JSON.parse(localStorage.getItem(NEWS_PICKS_KEY) || '[]'); } catch (e) { /* nada */ }
    if (Array.isArray(antigas) && antigas.length) {
      antigas.filter(p => p && p.id && p.titulo).forEach(p => newsFav.pend.push({ a: 'add', item: { ...newsFavCopia(p), em: Number(p.pickedAt) || Date.now() } }));
      try { localStorage.removeItem(NEWS_PICKS_KEY); } catch (e) { /* nada */ }
    }
    newsFavGrava();
    newsFavRedesenha();
    if (enviar && newsFav.pend.length) newsFavEnvia();
  } catch (e) { /* sem rede: fica o que está neste aparelho */ }
}
function newsFavRedesenha() {
  renderPicksBar();
  const ids = new Set(getNewsFavs().map(x => x.id));
  $$('.nc-star').forEach(b => b.classList.toggle('on', ids.has(b.dataset.id)));
  if (newsAsset === 'fav' && document.getElementById('news-panel')?.classList.contains('active')) renderNewsView();
}
function toggleNewsPick(id) {
  const tem = getNewsFavs().some(x => x.id === id);
  if (tem) newsFavMuda({ a: 'del', id });
  else {
    const n = newsAll.find(x => x.id === id) || (window.__newsLeads || []).find(x => x.id === id);
    if (!n) return;
    if (getNewsFavs().length >= NEWS_FAV_MAX) toast(`Você chegou a ${NEWS_FAV_MAX} favoritas: a mais antiga sai para esta entrar.`, 'info');
    newsFavMuda({ a: 'add', item: newsFavCopia(n) });
  }
  renderPicksBar();
  $$(`.nc-star[data-id="${CSS.escape(id)}"]`).forEach(b => b.classList.toggle('on', !tem));
}
function renderPicksBar() {
  const el = $('#news-picks');
  if (!el) return;
  const n = getNewsPicks().length;
  el.innerHTML = n
    ? `<span><span class="np-star">★</span> ${n} ${n > 1 ? 'notícias escolhidas' : 'notícia escolhida'} para o resumo do cliente</span><button class="btn-sm" id="news-picks-clear" title="Tira do resumo do cliente; elas continuam nas Favoritas">Tirar do resumo</button>`
    : '<span class="np-dica">Toque na <span class="np-star">★</span> de uma notícia para guardá-la nas Favoritas (30 dias, em qualquer aparelho) e colocá-la nos Destaques do resumo do cliente.</span>';
  $('#news-picks-clear')?.addEventListener('click', () => { newsFavMuda({ a: 'fora', ids: getNewsPicks().map(x => x.id) }); renderPicksBar(); renderNewsView(); });
}
// confere a conta ao abrir e quando a pessoa volta para a página (outro aparelho pode ter marcado)
setTimeout(() => newsFavSincroniza(), 1500);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - newsFav.sinc > 120000) newsFavSincroniza(); });
window.addEventListener('online', () => newsFavEnvia());

/* ---- Filtros por ativo ---- */
const NEWS_ASSETS = [
  ['all', 'Todos', null],
  ['movers', 'Ações do dia', null],
  ['petr', 'Petrobras', /petrobras|PETR[34]/i],
  ['vale', 'Vale', /(?<![\p{L}])Vale(?![\p{L}-])(?! (a pena|do |dos |da |o ))|VALE3/u],
  ['bancos', 'Bancos', /ita[uú]|bradesco|banco do brasil|santander|btg|nubank|ITUB4|BBDC4|BBAS3/i],
  ['juros', 'Juros', /juros|selic|copom|\bfed\b|fomc|treasur|powell|galípolo/i],
  ['dolar', 'Dólar', /d[óo]lar|c[âa]mbio|dollar/i],
  ['petroleo', 'Petróleo', /petr[óo]leo|brent|opep|\boil\b|crude|opec/i],
  ['ouro', 'Ouro', /\bouro\b|\bgold\b/i],
  ['cripto', 'Bitcoin', /bitcoin|cripto|btc|ethereum|crypto/i]
];
let newsAsset = 'all';
function moversRegexes() {
  const memo = (typeof stocksMemo !== 'undefined' && stocksMemo) || {};
  const ibov = yahooMemo['^BVSP'];
  const m = ibovMovers(memo, ibov && ibov.ts, 3);
  const syms = [...m.up, ...m.down].map(l => (l.match(/• (\w+):/) || [])[1]).filter(Boolean);
  return syms.map(stockNewsRegex);
}
function filterNewsByAsset(list) {
  if (newsAsset === 'all') return list;
  if (newsAsset === 'movers') {
    const res = moversRegexes();
    return res.length ? list.filter(n => res.some(re => re.test(n.titulo))) : [];
  }
  const re = (NEWS_ASSETS.find(a => a[0] === newsAsset) || [])[2];
  return re ? list.filter(n => re.test(n.titulo)) : list;
}
function renderNewsAssets() {
  const el = $('#news-assets');
  if (!el) return;
  el.innerHTML = NEWS_ASSETS.map(([v, l]) => `<button class="ecal-chip${v === newsAsset ? ' active' : ''}" data-v="${v}">${l}</button>`).join('');
  el.querySelectorAll('.ecal-chip').forEach(b => b.addEventListener('click', async () => {
    newsAsset = b.dataset.v;
    if (newsAsset === 'movers' && !Object.keys(stocksMemo || {}).length) {
      try { await ensureYahooBatch(); } catch (e) { /* segue */ }
      try { await loadIbovStocks(); } catch (e) { toast('Não foi possível carregar as ações do dia', 'danger'); }
    }
    renderNewsAssets();
    renderNewsView();
  }));
}

/* ---- Alerta de notícia crítica ---- */
let newsAlertSeeded = false;
const newsAlertSeen = new Set();
function checkNewsAlerts(list) {
  if (!newsAlertSeeded) { list.forEach(n => newsAlertSeen.add(n.id)); newsAlertSeeded = true; return; }
  const fresh = list.filter(n => !newsAlertSeen.has(n.id));
  fresh.forEach(n => newsAlertSeen.add(n.id));
  if (!window.__alertsOn) return;
  fresh
    .filter(n => n.nivel === 'CRITICO' && Date.now() - n.data < 45 * 60 * 1000)
    .sort((a, b) => b.data - a.data)
    .slice(0, 3)
    .forEach(n => newsAlertaTraduzido(n, () => {
      const src = newsSourceLabel(n);
      toast(`Alto impacto: ${n.titulo}${src ? ` (${src})` : ''}`, 'warning');
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          const note = new Notification('Notícia de alto impacto', { body: `${n.titulo}${src ? ` · ${src}` : ''}` });
          note.onclick = () => { window.open(n.link, '_blank', 'noopener'); };
        }
      } catch (e) { /* silencioso */ }
    }));
}
// manchete em inglês: espera a tradução (que roda logo depois) por até 4 s; se não vier, avisa assim mesmo
function newsAlertaTraduzido(n, avisar) {
  if (!NEWS_EN.has(n.fonte) || n.traduzido) { avisar(); return; }
  let feito = false;
  const fim = () => {
    if (feito) return; feito = true; window.removeEventListener('mm-news-traduzidas', fim); clearTimeout(t);
    const atual = newsAll.find(x => x.link === n.link);
    if (atual && atual.traduzido) { n.titulo = atual.titulo; n.traduzido = true; }
    avisar();
  };
  const t = setTimeout(fim, 4000);
  window.addEventListener('mm-news-traduzidas', () => { const a = newsAll.find(x => x.link === n.link); if (a && a.traduzido) fim(); });
}

/* ---- Briefing por tema ---- */
const BRIEFING_THEMES = [
  ['🇧🇷 Brasil', n => (n.tags || []).some(t => t === 'Brasil' || t === 'B3') || /copom|selic|ipca|ibovespa|haddad|lula|galípolo|tesouro nacional|\bB3\b|petrobras|d[óo]lar|c[âa]mbio/i.test(n.titulo)
    || (NEWS_SOURCES[n.fonte]?.scope === 'br' && !['BeInCrypto BR', 'Cointelegraph BR'].includes(n.fonte) && !(n.tags || []).some(t => ['EUA', 'Energia', 'Cripto'].includes(t)) && n.impactScore >= 4)],
  ['🇺🇸 EUA e Fed', n => (n.tags || []).includes('EUA') || /\bfed\b|powell|treasur|wall street|s&p|nasdaq|trump|payroll|\bEUA\b|estados unidos/i.test(n.titulo)],
  ['🛢️ Commodities', n => (n.tags || []).includes('Energia') || /petr[óo]leo|\bouro\b|min[ée]rio|soja|brent|opep|\boil\b|\bgold\b/i.test(n.titulo)],
  ['₿ Cripto', n => (n.tags || []).includes('Cripto') || ['BeInCrypto BR', 'Cointelegraph BR'].includes(n.fonte)],
  ['🌍 Global', n => n.impactScore >= 7 && NEWS_SOURCES[n.fonte]?.scope === 'int']
];
function buildBriefingThemes(perTheme = 3) {
  const recent = newsAll.filter(n => Date.now() - n.data < 18 * 3600 * 1000);
  const leads = clusterNews(recent);
  const used = new Set();
  return BRIEFING_THEMES.map(([name, test]) => {
    const items = leads.filter(l => !used.has(l.id) && test(l)).slice(0, name.includes('Brasil') ? perTheme + 1 : perTheme);
    items.forEach(i => used.add(i.id));
    return [name, items];
  }).filter(([, items]) => items.length);
}
function briefingWhatsAppText() {
  const now = new Date();
  const head = `*📰 Briefing de notícias* · ${now.toLocaleDateString('pt-BR')}, ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  return head + '\n\n' + buildBriefingThemes().map(([name, items]) =>
    `*${name}*\n` + items.map(n => { const s = newsSourceLabel(n); return `• ${n.titulo}${s ? ` (${s})` : ''}`; }).join('\n')
  ).join('\n\n');
}
renderNewsAssets();
renderPicksBar();

function buildNewsSidebar() {
  const sidebar = document.getElementById('source-sidebar');
  if (!sidebar) return;

  const brSources = Object.entries(NEWS_SOURCES).filter(([_, v]) => v.scope === 'br');
  const intSources = Object.entries(NEWS_SOURCES).filter(([_, v]) => v.scope === 'int');
  const polSources = Object.entries(NEWS_SOURCES).filter(([_, v]) => v.scope === 'pol');

  const makeSubBubbles = (list) => list.map(([key, cfg]) => `
    <button class="ns-sub-bubble" data-source="${escapeHTML(key)}" data-ns-fonte="${escapeHTML(key)}">
      <span class="ns-dot" style="background:${cfg.color};color:${cfg.color}">${cfg.letter}</span>
      <span class="ns-sub-name">${escapeHTML(cfg.name)}</span>
    </button>
  `).join('');

  const iconLocal = `
    <svg class="ns-cat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  `;
  const iconInt = `
    <svg class="ns-cat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  `;

  sidebar.innerHTML = `
    <button class="ns-all-btn active" id="ns-all-btn" data-ns-fonte="ALL">Todas</button>

    <div class="ns-category" data-category="br">
      <button class="ns-cat-btn" data-ns-cat="br">
        <span class="ns-cat-left">
          ${iconLocal}
          <span class="ns-cat-label">Local</span>
        </span>
        <span class="ns-cat-right">
          <span class="ns-cat-count" data-count="br">0</span>
          <span class="ns-cat-chevron">▶</span>
        </span>
      </button>
      <div class="ns-sub-list" data-list="br">${makeSubBubbles(brSources)}</div>
    </div>

    <div class="ns-category" data-category="int">
      <button class="ns-cat-btn" data-ns-cat="int">
        <span class="ns-cat-left">
          ${iconInt}
          <span class="ns-cat-label">Internacional</span>
        </span>
        <span class="ns-cat-right">
          <span class="ns-cat-count" data-count="int">0</span>
          <span class="ns-cat-chevron">▶</span>
        </span>
      </button>
      <div class="ns-sub-list" data-list="int">${makeSubBubbles(intSources)}</div>
    </div>

    <button class="ns-pol-switch${newsPolitica ? ' on' : ''}" data-ns-pol aria-pressed="${newsPolitica}" title="Mostrar notícias de política">
      <span>Política</span><span class="ns-pol-sw" aria-hidden="true"></span>
    </button>
    ${newsPolitica ? `
    <div class="ns-category" data-category="pol">
      <button class="ns-cat-btn" data-ns-cat="pol">
        <span class="ns-cat-left">
          <svg class="ns-cat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-6 10 6"/></svg>
          <span class="ns-cat-label">Fontes</span>
        </span>
        <span class="ns-cat-right">
          <span class="ns-cat-count" data-count="pol">0</span>
          <span class="ns-cat-chevron">▶</span>
        </span>
      </button>
      <div class="ns-sub-list" data-list="pol">${makeSubBubbles(polSources)}</div>
    </div>` : ''}
  `;
}

// 22/11/2026: os botões da lateral não levam mais a ação escrita no HTML (onclick), que a regra de scripts (CSP)
// bloqueia; um único ouvinte na lateral lê data-ns-fonte / data-ns-cat / data-ns-pol
document.getElementById('source-sidebar')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-ns-fonte], [data-ns-cat], [data-ns-pol]');
  if (!b) return;
  if (b.dataset.nsFonte) toggleNewsSource(b.dataset.nsFonte);
  else if (b.dataset.nsCat) toggleNewsCategory(b.dataset.nsCat);
  else toggleNewsPolitica();
});
// foto de notícia que não carrega some (antes: onerror="this.remove()" na própria foto)
document.addEventListener('error', (e) => { if (e.target instanceof HTMLImageElement && e.target.classList.contains('nc-img')) e.target.remove(); }, true);

function toggleNewsCategory(cat) {
  newsOpenCategory = (newsOpenCategory === cat) ? null : cat;
  updateNewsCategoryUI();
}
function updateNewsCategoryUI() {
  document.querySelectorAll('.ns-category').forEach(el => {
    const cat = el.dataset.category;
    const btn = el.querySelector('.ns-cat-btn');
    const list = el.querySelector('.ns-sub-list');
    const isOpen = newsOpenCategory === cat;
    btn.classList.toggle('open', isOpen);
    list.classList.toggle('open', isOpen);
  });
}
function closeNewsCategories() {
  if (newsOpenCategory !== null) {
    newsOpenCategory = null;
    updateNewsCategoryUI();
  }
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.source-sidebar')) closeNewsCategories();
});

function toggleNewsSource(source) {
  if (source === 'ALL') {
    newsActiveSources.clear();
  } else {
    if (newsActiveSources.has(source)) newsActiveSources.delete(source);
    else newsActiveSources.add(source);
  }
  newsSalvaFontes();
  updateNewsBubbleStates();
  if (source !== 'ALL') closeNewsCategories();
  renderNewsView();
  if (newsLiveShown()) renderLiveView();
}

function updateNewsBubbleStates() {
  const showAll = newsActiveSources.size === 0;
  const allBtn = document.getElementById('ns-all-btn');
  if (allBtn) allBtn.classList.toggle('active', showAll);

  document.querySelectorAll('.ns-sub-bubble').forEach(b => {
    const src = b.dataset.source;
    const isActive = showAll || newsActiveSources.has(src);
    b.classList.toggle('active', isActive);
    const cfg = NEWS_SOURCES[src];
    if (cfg) b.querySelector('.ns-dot').style.color = cfg.color;
  });

  ['br', 'int', 'pol'].forEach(cat => {
    const count = Object.entries(NEWS_SOURCES)
      .filter(([k, v]) => v.scope === cat && newsActiveSources.has(k)).length;
    const el = document.querySelector(`[data-count="${cat}"]`);
    const btn = document.querySelector(`.ns-category[data-category="${cat}"] .ns-cat-btn`);
    if (el) {
      el.textContent = count;
      el.classList.toggle('visible', count > 0);
    }
    if (btn) btn.classList.toggle('has-selection', count > 0);
  });
}

function filterNewsBySources(list) {
  if (newsActiveSources.size === 0) return list;
  return list.filter(n => newsActiveSources.has(n.fonte));
}

function setNewsMode(mode) {
  newsCurrentMode = mode;
  const toggle = document.getElementById('nm-toggle');
  if (toggle) {
    toggle.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
  }
  document.getElementById('news-view').style.display = mode === 'news' ? 'block' : 'none';
  document.getElementById('live-view').style.display = mode === 'live' ? 'block' : 'none';
  if (mode === 'news') { renderNewsView(); syncNewsStream(); }
  else { renderLiveView(); syncNewsStream(); if (!liveMode) fetchNewsFromWorker(true); }
}
document.getElementById('nm-toggle')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (btn) setNewsMode(btn.dataset.mode);
});

function showNewsSkeleton() {
  const sk = '<div class="nl-skeleton-grid">' + Array(6).fill(`
    <div class="nl-skeleton-card">
      <div class="skeleton w-30"></div>
      <div class="skeleton w-100"></div>
      <div class="skeleton w-75"></div>
    </div>`).join('') + '</div>';
  const view = document.getElementById('news-view');
  if (view) view.innerHTML = sk;
}

// NEWS_LIVE_START: atualização independente das cotações, com uma busca por vez.
// busca por HTTP só quando a conexão ao vivo (WebSocket) falha: 60 s poupa o worker de notícias da outra conta
const NEWS_LIVE_MS = 60000;
// o fluxo do Ao Vivo pode estar destacado num quadro ou noutra janela (ao-vivo-solto.js): guarda os elementos, não busca pelo id
var newsLiveEls = {};
function liveEl(id) { return newsLiveEls[id]?.isConnected ? newsLiveEls[id] : (newsLiveEls[id] = document.getElementById(id)); }
function newsLiveShown() { return newsCurrentMode === 'live' || !!globalThis.MMLiveSolto?.on; }
let newsFetchInFlight = null, newsLastAttempt = 0, newsStreamClient = null, newsStreamRevision = 0;
function newsLiveActive() {
  // destacado: na janela separada segue mesmo com o site em segundo plano; no quadro, só com a página à vista
  if (globalThis.MMLiveSolto?.on) return liveMode && (globalThis.MMLiveSolto.onde === 'janela' || !document.hidden);
  return liveMode && !document.hidden && newsCurrentMode === 'live' && !!document.getElementById('news-panel')?.classList.contains('active');
}
function newsLiveTick() {
  syncNewsStream();
  if (newsStreamClient?.healthy() || newsStreamClient?.denied) return;
  if (newsLiveActive() && !newsFetchInFlight && Date.now() - newsLastAttempt >= NEWS_LIVE_MS) return fetchNewsFromWorker(true);
}
function syncNewsStream() {
  if (!globalThis.MMNewsStream) return;
  if (!newsStreamClient) {
    const url = new URL('/api/noticias/ws', location.href); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    newsStreamClient = new MMNewsStream.Client({url:url.href,
      onData:items=>{ newsStreamRevision++; newsLastAttempt=Date.now(); newsApplyUpdate(newsMergeLive(newsBruto,items)); },
      onState:state=>{
        const el=liveEl('news-stream-status');
        const text=state==='live'?'Conectado · atualização automática':state==='connecting'?'Conectando às notícias…':state==='paused'?'Atualização automática pausada':state==='auth'?'Sessão encerrada':'Atualização periódica ativa · tentando reconectar';
        if(el&&el.textContent!==text)el.textContent=text;
      },
      onAuth:()=>location.reload()
    });
  }
  newsStreamClient.setActive(newsLiveActive());
}
async function newsFetchPayload(preferLive) {
  const urls = preferLive ? [NEWS_WORKER_URL, '/api/noticias'] : ['/api/noticias', NEWS_WORKER_URL];
  let error;
  for (const url of urls) {
    try {
      const res = await fetchT(url, { cache: 'no-store' }, url === NEWS_WORKER_URL ? 12000 : 25000);
      if (!res.ok) throw Error('HTTP ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data) || !data.length || data.some(n => !n || typeof n.titulo !== 'string' || !Number.isFinite(n.data) || typeof n.nivel !== 'string')) throw Error('Lista de notícias inválida');
      return { res, data };
    } catch (e) { error = e; }
  }
  throw error || Error('Notícias indisponíveis');
}
function newsMergeLive(previous, incoming) {
  const unique = new Map();
  for (const n of [...previous, ...incoming]) if (n.link) unique.set(n.link, n);
  const counts = {};
  return [...unique.values()].filter(n => Date.now() - n.data < NEWS_MAX_IDADE)
    .sort((a,b) => b.data - a.data).filter(n => (counts[n.fonte] = (counts[n.fonte] || 0) + 1) <= 30).slice(0,1200);
}
function fetchNewsFromWorker(silent = false) {
  if (newsFetchInFlight) return newsFetchInFlight;
  newsLastAttempt = Date.now();
  newsFetchInFlight = fetchNewsOnce(silent).finally(() => { newsFetchInFlight = null; });
  return newsFetchInFlight;
}
// NEWS_LIVE_END
setInterval(newsLiveTick, 1000);
document.addEventListener('visibilitychange', newsLiveTick);
document.addEventListener('mm-news-visible', newsLiveTick);
window.addEventListener('pagehide', () => newsStreamClient?.setActive(false));
window.addEventListener('pageshow', newsLiveTick);
let newsFetchSeq = 0, newsStaleRetries = 0;
async function fetchNewsOnce(silent = false) {
  const info = document.getElementById('news-info');
  if (info && !silent) info.classList.add('loading');
  const seq = ++newsFetchSeq, streamRevision = newsStreamRevision; // se outra busca começar depois, esta é descartada
  newsNaCarrega();

  try {
    const preferLive = newsCurrentMode === 'live' && !!document.getElementById('news-panel')?.classList.contains('active');
    const payload = await newsFetchPayload(preferLive);
    const res = payload.res;
    const data = preferLive ? newsMergeLive(newsBruto, payload.data) : payload.data;
    if (seq !== newsFetchSeq) return;

    if (preferLive && streamRevision !== newsStreamRevision) return;
    newsApplyUpdate(data,silent,res.headers.get('X-Cache') || '');
    // STALE: o servidor respondeu na hora com a lista guardada e está renovando; busca de novo em 8 s (no máximo 3 vezes)
    if (res.headers.get('X-Cache') === 'STALE' && newsStaleRetries < 3) { newsStaleRetries++; setTimeout(() => fetchNewsFromWorker(true), 8000); }
    else if (res.headers.get('X-Cache') !== 'STALE') newsStaleRetries = 0;
  } catch (e) {
    if (seq !== newsFetchSeq) return;
    console.warn('[News] Erro ao buscar:', e.message);
    if (info) {
      info.innerHTML = `<span class="dot" style="background:var(--neg)"></span>Erro na conexão`;
      info.classList.remove('loading');
    }
    if (!newsAll.length) {
      const cached = loadNewsFromCache();
      if (cached) {
        newsAll = cached;
        renderNewsView();
        newsTraduzir();
      } else {
        document.getElementById('news-view').innerHTML = '<div class="nl-empty">Não foi possível carregar as notícias.</div>';
      }
    }
    window.__newsErro = !newsAll.length;
    window.dispatchEvent(new Event('mm-news-erro'));
  }
}

function newsApplyUpdate(data,silent=true,cacheHeader='') {
    const info=document.getElementById('news-info');
    newsAll = newsPrepara(data);
    window.__newsErro = false; // a Mesa usa para trocar "Carregando" pelo aviso de falha
    window.dispatchEvent(new Event('mm-news-ok')); // a Mesa redesenha o quadro de notícias na hora (antes esperava até 60 s)
    checkNewsAlerts(newsAll);
    try {
      localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
    } catch (e) { /* silencioso */ }

    const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' });
    if (info) {
      info.innerHTML = `<span class="dot"></span>Última atualização: <span id="news-last-update">${now}</span> · ${newsAll.length} notícias${cacheHeader === 'HIT' ? ' (cache)' : ''}`;
      info.classList.remove('loading');
    }

    renderNewsView();
    if (newsLiveShown()) renderLiveView();
    newsTraduzir();
    if (!silent) toast('Notícias atualizadas', 'success');
}

function loadNewsFromCache() {
  try {
    const raw = localStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > NEWS_CACHE_TTL) return null;
    return newsPrepara(parsed.data);
  } catch (e) { return null; }
}

// O worker antigo gerava o id com o começo do link, então notícias do mesmo site saíam com o mesmo id
// (a seta "próxima" voltava sempre para a primeira). Aqui cada notícia ganha um id pelo link inteiro.
function newsFixIds(list) {
  if (!Array.isArray(list)) return list;
  list.forEach(n => {
    // só aceita link http(s); "&amp;" vindo do feed vira "&"
    n.link = String(n.link || '').trim().replace(/&amp;/g, '&');
    if (!/^https?:\/\//i.test(n.link)) n.link = '#';
    let h1 = 0x811c9dc5, h2 = 0;
    const s = String(n.link || n.titulo || '');
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = (Math.imul(h2, 31) + c) | 0; }
    n.id = 'n' + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
  });
  return list;
}

function newsSourceColor(fonte) {
  return (NEWS_SOURCES[fonte] && NEWS_SOURCES[fonte].color) || '#8b949e';
}
function newsSourceBadgeStyle(fonte) {
  const c = newsSourceColor(fonte);
  return `background:${c}20;color:${c};border-color:${c};`;
}

function timeAgoShort(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'agora';
  if (diff < 3600) return Math.floor(diff / 60) + 'min';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h';
  return Math.floor(diff / 86400) + 'd';
}

// Brasil e exterior intercalados: no máximo 2 seguidas do mesmo lado quando há do outro
function newsMistura(list) {
  if (newsActiveSources.size || newsAsset !== 'all') return list;
  const br = list.filter(n => n._br), fora = list.filter(n => !n._br), out = [];
  while (br.length || fora.length) {
    const ult = out.slice(-2);
    const ladoUlt = ult.length === 2 && ult[0]._br === ult[1]._br ? ult[0]._br : null;
    let pega;
    if (ladoUlt === true && fora.length) pega = fora;
    else if (ladoUlt === false && br.length) pega = br;
    else if (!br.length) pega = fora;
    else if (!fora.length) pega = br;
    else pega = newsRank(br[0]) >= newsRank(fora[0]) ? br : fora;
    out.push(pega.shift());
  }
  return out;
}
// busca: procura em todas as notícias carregadas (não só nas que estão na tela), sem diferenciar acento
const newsSemAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function newsTermo() { return newsSemAcento(document.getElementById('news-search')?.value).trim(); }
function newsBusca(list) {
  const q = newsTermo();
  if (!q) return list;
  return list.filter(n => newsSemAcento([n.titulo, n.tituloOriginal, n.trecho, n.trechoPt, n.resumo, n.fonte, n.veiculo].join(' ')).includes(q));
}

// "Novas desde a sua última visita" (09/11/2026): guarda neste aparelho quando a pessoa viu a aba Notícias pela última vez.
// Na sessão vale o horário da visita anterior; o novo horário é gravado ao sair da página ou depois de 30 s com a aba aberta.
const NEWS_VISTO_KEY = 'mm_news_visto_v1';
let newsVistoSessao;
function newsVistoAntes() {
  if (newsVistoSessao === undefined) {
    let v = 0; try { v = Number(localStorage.getItem(NEWS_VISTO_KEY)) || 0; } catch (e) { /* sem armazenamento */ }
    newsVistoSessao = v;
    const grava = () => { try { if (document.getElementById('news-panel')?.classList.contains('active')) localStorage.setItem(NEWS_VISTO_KEY, String(Date.now())); } catch (e) { /* sem armazenamento */ } };
    setInterval(grava, 30000);
    window.addEventListener('pagehide', grava);
  }
  return newsVistoSessao;
}
function renderNewsView() {
  const view = document.getElementById('news-view');
  if (!view) return;

  const busca = newsTermo();
  const filtrado = newsBusca(filterNewsByAsset(filterNewsBySources(newsAll)));
  const leads = clusterNews(filtrado);

  let destaques = leads.filter(n => n.impactScore >= 4);
  if (destaques.length < 12) {
    const outras = leads.filter(n => n.impactScore < 4);
    destaques = [...destaques, ...outras];
  }
  destaques = newsMistura(destaques).slice(0, newsAsset === 'fav' ? NEWS_FAV_MAX : busca ? 120 : 40);

  if (!destaques.length) {
    view.innerHTML = `<div class="nl-empty">${busca ? `Nenhuma notícia com "${escapeHTML(document.getElementById('news-search').value.trim())}" nesta seleção.` : newsAsset === 'movers' ? 'Nenhuma notícia sobre as maiores altas e baixas de hoje.' : 'Nenhuma notícia para esta seleção.'}</div>`;
    return;
  }

  const picked = new Set(getNewsFavs().map(p => p.id));
  window.__newsLeads = destaques;
  // manchete principal: a mais relevante que tenha texto
  const leadIdx = destaques.findIndex(n => (n.trechoPt || n.trecho) && n.impactScore >= 7);
  // "Alto impacto" só nas 5 mais fortes: quando quase tudo é crítico, o selo deixa de dizer alguma coisa
  let criticos = 0, relevantes = 0;
  // Divisórias por horário (09/11/2026): Última hora, Hoje, Ontem e Antes, mantendo a ordem de relevância dentro de cada uma
  const diaBrt = (t) => new Date(t - 3 * 3600 * 1000).toISOString().slice(0, 10);
  const hojeBrt = diaBrt(Date.now()), ontemBrt = diaBrt(Date.now() - 86400000);
  const grupoDe = (n) => Date.now() - n.data < 60 * 60 * 1000 ? 0 : diaBrt(n.data) === hojeBrt ? 1 : diaBrt(n.data) === ontemBrt ? 2 : 3;
  const GRUPOS = ['Última hora', 'Hoje', 'Ontem', 'Antes'];
  const ordem = destaques.map((n, idx) => [n, idx]).sort((a, b) => grupoDe(a[0]) - grupoDe(b[0]) || a[1] - b[1]);
  const usados = new Set(ordem.map(([n]) => grupoDe(n)));
  const visto = newsVistoAntes();
  let grupoAtual = -1;
  const cartao = ([n, idx]) => {
    let nivel = n.nivel.toLowerCase();
    if (nivel === 'critico' && ++criticos > 5) nivel = 'alto';
    // 17/11/2026: "Relevante" só nas 10 mais fortes (antes 35 de 40 cartões tinham o selo e ele não ajudava a escolher)
    if (nivel === 'alto' && ++relevantes > 10) nivel = 'medio';
    const impactBadge = nivel === 'critico' ? '<span class="nc-impact critico">Alto impacto</span>'
                      : nivel === 'alto' ? '<span class="nc-impact alto">Relevante</span>'
                      : n.impactScore >= 4 ? '<span class="nc-impact medio">Mercado</span>' : '';
    const srcName = n.fonte === 'Google News' && n.veiculo ? n.veiculo : n.fonte;
    const rel = n.related.length
      ? `<span class="nc-more" title="${escapeHTML([...new Set(n.related.map(r => newsSourceLabel(r) || r.fonte))].join(', '))}">+${n.related.length} ${n.related.length > 1 ? 'fontes' : 'fonte'}</span>` : '';
    const tr = n.traduzido ? `<span class="nc-tr" title="${escapeHTML(n.tituloOriginal || '')}">traduzido</span>` : '';
    const isLead = idx === leadIdx;
    const falas = n.falas && n.falas.length
      ? `<ul class="nc-falas">${n.falas.slice(0, 4).map(f => `<li>${escapeHTML(f)}</li>`).join('')}${n.falas.length > 4 ? `<li class="nc-falas-mais">mais ${n.falas.length - 4}</li>` : ''}</ul>` : '';
    const exc = falas ? '' : newsExcerpt(n, isLead ? 520 : 230);
    const img = n.imagem && /^https:\/\//.test(n.imagem)
      ? `<img class="nc-img" src="${escapeHTML(n.imagem)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';
    const mins = newsReadMins(n);
    const read = AppState.readArticles.has(n.link) ? ' read' : '';
    const novo = !read && visto && n.data > visto ? ' nc-novo' : '';
    const veic = n.veiculo && n.veiculo !== srcName ? `<span class="nc-veic">${escapeHTML(n.veiculo)}</span>` : '';
    const hora = new Date(n.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const g = grupoDe(n);
    const sep = usados.size > 1 && g !== grupoAtual ? `${grupoAtual === -1 ? '' : '</div>'}<div class="nc-sep">${GRUPOS[g]}</div><div class="nc-grid">` : '';
    grupoAtual = g;
    return `${sep}
      <a href="${escapeHTML(n.link)}" target="_blank" rel="noopener noreferrer" class="nc-card ${nivel}${isLead ? ' nc-lead' : ''}${img ? ' com-img' : ''}${read}${novo}" data-id="${escapeHTML(n.id)}">
        ${img}
        <div class="nc-top">
          <span class="nc-source" style="${newsSourceBadgeStyle(n.fonte)}">${escapeHTML(srcName)}</span>
          <span class="nc-time" title="${escapeHTML(new Date(n.data).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }))}">${hora} · ${timeAgoShort(n.data)}</span>
          ${mins ? `<span class="nc-mins" title="Tempo de leitura do texto disponível">${mins} min</span>` : ''}
          <button class="nc-star${picked.has(n.id) ? ' on' : ''}" data-id="${escapeHTML(n.id)}" title="Favoritar: fica guardada 30 dias na sua conta e entra nos Destaques do resumo do cliente">★</button>
        </div>
        ${isLead ? '<div class="nc-kicker">Manchete principal</div>' : ''}
        <div class="nc-title">${escapeHTML(n.titulo)}</div>
        ${n.porque ? `<p class="nc-porque" title="Explicação curta feita por IA a partir das manchetes"><b><i class="fas fa-lightbulb" aria-hidden="true"></i> Por que importa:</b> ${escapeHTML(n.porque)}</p>` : ''}
        ${exc ? `<p class="nc-excerpt">${escapeHTML(exc)}</p>` : ''}${falas}
        <div class="nc-footer">
          ${veic}${impactBadge}
          ${(n.tags || []).map(t => `<span class="nc-tag ${t.toLowerCase()}">${t}</span>`).join('')}
          ${rel}${tr}
          <span class="nc-readhere">${n.resumo ? 'Ler aqui' : 'Ver'} <i class="fas fa-arrow-right"></i></span>
        </div>
      </a>`;
  };
  view.innerHTML = (usados.size > 1 ? '' : '<div class="nc-grid">') + ordem.map(cartao).join('') + '</div>';

}

document.getElementById('news-view')?.addEventListener('click', (e) => {
  const star = e.target.closest('.nc-star');
  if (!star) {
    const card = e.target.closest('.nc-card');
    if (card && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0 && window.openNewsReader) {
      e.preventDefault();
      window.openNewsReader(card.dataset.id);
    }
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  toggleNewsPick(star.dataset.id);
});

// Fonte do Ao Vivo (07/11/2026, pedido do Severino): por padrão só o Financial Juice, que publica manchete
// por manchete; "Todas as fontes" segue os filtros de fontes das Notícias. Escolha guardada neste aparelho.
const LIVE_FONTE_KEY = 'mm_aovivo_fonte_v1';
function liveFonte() { try { return localStorage.getItem(LIVE_FONTE_KEY) || 'Financial Juice'; } catch (e) { return 'Financial Juice'; } }
function liveFonteSelect() {
  const sel = liveEl('live-fonte');
  if (!sel) return;
  const atual = liveFonte();
  const fontes = [...new Set((Array.isArray(newsAll) ? newsAll : []).map((n) => n.fonte))].filter((f) => f && f !== 'Financial Juice').sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (atual !== 'todas' && atual !== 'Financial Juice' && !fontes.includes(atual)) fontes.push(atual);
  const opts = [['Financial Juice', 'Financial Juice'], ['todas', 'Todas as fontes'], ...fontes.map((f) => [f, f])];
  const html = opts.map(([v, t]) => `<option value="${escapeHTML(v)}"${v === atual ? ' selected' : ''}>${escapeHTML(t)}</option>`).join('');
  if (sel.dataset.html !== html) { sel.innerHTML = html; sel.dataset.html = html; }
  if (!sel.dataset.ligado) {
    sel.dataset.ligado = '1';
    liveEl('live-busca')?.addEventListener('input', () => renderLiveView());
    sel.addEventListener('change', () => { try { localStorage.setItem(LIVE_FONTE_KEY, sel.value); } catch (e) { /* sem armazenamento */ } renderLiveView(); });
  }
}

function renderLiveView() {
  const container = liveEl('live-container');
  const counter = liveEl('live-count');
  if (!container) return;
  liveFonteSelect();
  const fonte = liveFonte();
  const filtrado = newsBusca(fonte === 'todas' ? filterNewsBySources(newsAll) : (Array.isArray(newsAll) ? newsAll : []).filter((n) => n.fonte === fonte));
  // busca própria do Ao Vivo (lupa do quadro destacado): sem acento e sem maiúsculas
  const semAc = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tl = semAc(liveEl('live-busca')?.value.trim());
  const doFluxo = tl ? filtrado.filter((n) => semAc(n.titulo + ' ' + n.fonte).includes(tl)) : filtrado;
  const live = [...doFluxo].sort((a, b) => b.data - a.data).slice(0, 100);

  if (!live.length) {
    container.innerHTML = `<div class="nl-empty">${newsTermo() || tl ? 'Nenhuma notícia com esse termo.' : 'Nenhuma notícia no momento.'}</div>`;
    if (counter) counter.textContent = '';
    return;
  }

  if (counter) counter.textContent = `${live.length} notícias no fluxo`;

  container.innerHTML = live.map(n => `
    <div class="lc-item ${n.nivel.toLowerCase()}">
      <div class="lc-icon"></div>
      <div class="lc-content">
        <div class="lc-time">${new Date(n.data).toLocaleTimeString('pt-BR')} • ${timeAgoShort(n.data)} atrás</div>
        <div class="lc-title">
          <a href="${escapeHTML(n.link)}" target="_blank" rel="noopener noreferrer">${escapeHTML(n.titulo)}</a>
        </div>
        <div class="lc-meta">
          <span class="nc-source" style="${newsSourceBadgeStyle(n.fonte)}font-size:9.5px">${escapeHTML(n.fonte)}</span>
          ${(n.tags || []).map(t => `<span class="nc-tag ${t.toLowerCase()}">${t}</span>`).join('')}
        </div>
      </div>
    </div>`).join('');

  live.forEach(n => newsLastSeenIds.add(n.id));
}

document.getElementById('news-search')?.addEventListener('input', () => {
  if (newsCurrentMode === 'news') renderNewsView();
  if (newsLiveShown()) renderLiveView();
});

document.getElementById('news-refresh-btn')?.addEventListener('click', function () {
  this.classList.add('spinning');
  fetchNewsFromWorker(false).finally(() => {
    setTimeout(() => this.classList.remove('spinning'), 600);
  });
});

function refreshNews(silent = true) {
  if (newsStreamClient?.healthy()) return;
  fetchNewsFromWorker(silent);
}

/* =========================================================
   BRIEFING DE NOTÍCIAS
   ========================================================= */
let wordFrequencyChart = null;

function openBriefingModal() {
  const modal = $('#briefing-modal');
  modal.classList.add('visible');
  document.addEventListener('keydown', escCloseBriefing);
  modal.addEventListener('click', overlayCloseBriefing);
}
function closeBriefingModal() {
  const modal = $('#briefing-modal');
  modal.classList.remove('visible');
  document.removeEventListener('keydown', escCloseBriefing);
  modal.removeEventListener('click', overlayCloseBriefing);
}
function escCloseBriefing(e) {
  if (e.key === 'Escape') closeBriefingModal();
}
function overlayCloseBriefing(e) {
  if (e.target.id === 'briefing-modal') closeBriefingModal();
}

function getStopWords() {
  return new Set([
    'de','a','o','que','e','do','da','em','um','para','é','com','não','uma','os','no','na','por','mais','as',
    'dos','como','mas','foi','ao','ele','das','tem','à','seu','sua','ou','ser','quando','muito','há','nos','já',
    'está','eu','também','só','pelo','pela','até','isso','ela','entre','depois','sem','mesmo','aos','ter','seus',
    'quem','nas','me','esse','eles','estão','você','tinha','foram','essa','num','nem','suas','meu','às','minha',
    'numa','pelos','elas','havia','seja','qual','será','nós','tenho','lhe','deles','essas','esses','pelas','este',
    'fosse','dele','tu','te','vocês','vos','lhes','meus','minhas','teu','tua','teus','tuas','nosso','nossa','nossos',
    'nossas','dela','delas','esta','estes','aquele','aquela','aqueles','aquelas','isto','aquilo',
    // palavras de ligação e de manchete que não dizem o assunto (04/11/2026)
    'após','apos','enquanto','sobre','medida','contra','diz','dizem','afirma','segundo','ainda','antes','durante',
    'novo','nova','novos','novas','hoje','ontem','amanhã','agora','pode','podem','deve','devem','vai','vão','fica',
    'ficam','sobe','sobem','cai','caem','alta','altas','queda','quedas','dia','dias','semana','mês','ano','anos',
    'veja','saiba','entenda','quer','faz','fazer','após','sob','desde','cerca','mais','menos','maior','menor',
    'primeiro','primeira','outro','outra','outros','outras','todo','toda','todos','todas','cada','sendo','pois',
    'onde','porque','então','assim','aqui','lá','bem','pode','tudo','nada','parte','vez','vezes','meio','mil','milhões','bilhões',
    'the','a','an','to','in','for','of','on','with','at','by','is','and','it','that','as','from','be','its','this',
    'says','said','will','new','after','over','amid','about','into','has','have','was','were','are','what','how',
    'more','than','could','would','may','first','year','week','report','reports','update','live'
  ]);
}

// termos das manchetes (04/11/2026): conta uma vez por manchete, junta singular e plural (ação/ações, eleição/eleições),
// usa duplas de palavras que andam juntas (banco central) e mostra a grafia mais usada (Trump, Copom)
function termosDasManchetes(lista, n = 10) {
  const stop = getStopWords();
  const limpa = (t) => String(t || '').replace(/[“”"'‘’«»()\[\]:;,.!?|–—]/g, ' ').split(/\s+/).filter(Boolean);
  const raiz = (w) => w.replace(/(ões|ães)$/, 'ão').replace(/ais$/, 'al').replace(/eis$/, 'el').replace(/(?<=[aeiou])s$/, '');
  const um = new Map(), dois = new Map(), forma = new Map(), inicio = new Map();
  const conta = (m, k) => m.set(k, (m.get(k) || 0) + 1);
  for (const it of lista) {
    const ws = limpa(it.titulo).map((o) => ({ o, l: o.toLowerCase() }));
    const vistos = new Set(), vistos2 = new Set();
    ws.forEach((w, i) => {
      const ok = (x) => x && x.l.length > 2 && !stop.has(x.l) && isNaN(x.l.replace(',', '.'));
      if (!ok(w)) return;
      const r = raiz(w.l);
      if (!vistos.has(r)) { vistos.add(r); conta(um, r); }
      // a primeira palavra da manchete vem em maiúscula de qualquer jeito: só conta a grafia no meio do título (ou sigla)
      { const meio = i > 0 || (w.o.length > 1 && w.o === w.o.toUpperCase()); const m = meio ? forma : inicio; const f = m.get(r) || new Map(); const g = meio ? w.o : w.l; f.set(g, (f.get(g) || 0) + 1); m.set(r, f); }
      const prox = ws[i + 1];
      if (ok(prox)) { const k = r + ' ' + raiz(prox.l); if (!vistos2.has(k)) { vistos2.add(k); conta(dois, k); } { const m2 = i > 0 ? forma : inicio; const f2 = m2.get(k) || new Map(); const o2 = (i > 0 ? w.o : w.l) + ' ' + prox.o; f2.set(o2, (f2.get(o2) || 0) + 1); m2.set(k, f2); } }
    });
  }
  // a dupla entra no lugar das duas palavras quando aparece em boa parte das vezes de cada uma
  const res = new Map(um);
  for (const [k, c] of dois) {
    if (c < 3) continue;
    const [x, y] = k.split(' ');
    if (c >= 0.6 * (um.get(x) || 0) && c >= 0.6 * (um.get(y) || 0)) { res.set(k, c); res.delete(x); res.delete(y); }
  }
  const grafia = (k) => {
    let f = [...(forma.get(k) || new Map()).entries()].sort((a, b) => b[1] - a[1]);
    if (!f.length) f = [...(inicio.get(k) || new Map()).entries()].sort((a, b) => b[1] - a[1]);
    // prefere a forma que não está toda em minúsculas só se for a mais comum fora do começo da frase; senão, minúsculas
    if (!f.length) return k;
    const top = f[0][0];
    const temMaiuscula = f.filter(([o]) => o !== o.toLowerCase()).reduce((a, [, c]) => a + c, 0);
    const total = f.reduce((a, [, c]) => a + c, 0);
    return temMaiuscula > total * 0.7 ? top : top.toLowerCase();
  };
  return [...res.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => [grafia(k), c]);
}

// a biblioteca de gráficos (~200 KB) só serve para este gráfico do Resumo de mercado: baixa na primeira vez que
// o resumo abre, e não mais junto com o terminal (auditoria 15/11/2026)
let chartLib = null;
function carregarChartLib() {
  if (window.Chart) return Promise.resolve();
  return chartLib ||= new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js';
    s.onload = ok; s.onerror = () => { chartLib = null; falha(new Error('gráfico indisponível')); };
    document.head.appendChild(s);
  });
}
function generateWordFrequencyChart() {
  const chartContainer = $('#chart-container');
  if (!window.Chart) {
    if (chartContainer) chartContainer.style.display = 'none';
    carregarChartLib().then(generateWordFrequencyChart, () => {});
    return;
  }
  if (!chartContainer || newsAll.length === 0) {
    if (chartContainer) chartContainer.style.display = 'none';
    return;
  }

  const sorted = termosDasManchetes(newsAll, 10);
  if (sorted.length < 3) {
    chartContainer.style.display = 'none';
    return;
  }
  chartContainer.style.display = 'block';
  const sub = document.getElementById('word-frequency-sub');
  if (sub) sub.textContent = `Em quantas das ${newsAll.length} manchetes carregadas cada termo aparece`;

  const canvas = document.getElementById('word-frequency-chart');
  const ctx = canvas.getContext('2d');
  if (wordFrequencyChart) wordFrequencyChart.destroy();

  const isLight = document.body.classList.contains('light');
  const textColor = isLight ? '#0b1220' : '#e6ecf5';
  const max = sorted[0][1];
  // o mais citado em âmbar cheio, os outros mais claros conforme a frequência
  const cores = sorted.map(([, n]) => `rgba(240,185,11,${(0.35 + 0.6 * (n / max)).toFixed(2)})`);
  const rotulo = {
    id: 'mmRotulo',
    afterDatasetsDraw(ch) {
      const c = ch.ctx, meta = ch.getDatasetMeta(0);
      c.save(); c.font = '600 11px JetBrains Mono, monospace'; c.fillStyle = textColor; c.textBaseline = 'middle';
      meta.data.forEach((bar, i) => c.fillText(String(ch.data.datasets[0].data[i]), bar.x + 6, bar.y));
      c.restore();
    }
  };

  wordFrequencyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(([w]) => w),
      datasets: [{
        label: 'Manchetes',
        data: sorted.map(([, n]) => n),
        backgroundColor: cores,
        borderWidth: 0,
        borderRadius: 4,
        barPercentage: 0.75,
        categoryPercentage: 0.9
      }]
    },
    plugins: [rotulo],
    options: {
      responsive: true,
      indexAxis: 'y',
      layout: { padding: { right: 28 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isLight ? '#0b1220' : '#1c2740',
          titleColor: '#f0b90b',
          bodyColor: '#e6ecf5',
          padding: 10,
          cornerRadius: 6,
          callbacks: { label: (t) => `em ${t.raw} de ${newsAll.length} manchetes` }
        }
      },
      scales: {
        x: { beginAtZero: true, display: false, suggestedMax: max * 1.08 },
        y: {
          ticks: { color: textColor, font: { family: 'Inter, system-ui, sans-serif', size: 12, weight: '600' } },
          grid: { display: false },
          border: { display: false }
        }
      }
    }
  });
}

function generateAndShowBriefing() {
  const list = $('#briefing-list');
  const title = $('#briefing-title');
  if (!list || !title) return;

  list.innerHTML = '';
  title.textContent = 'Briefing de Notícias';

  if (!newsAll.length) {
    list.innerHTML = '<li style="color: var(--text-3); font-style: italic; padding: 20px; text-align: center;">Nenhuma notícia carregada ainda. Clique em "Atualizar Tudo" e tente novamente.</li>';
    openBriefingModal();
    return;
  }

  buildBriefingThemes().forEach(([tema, items]) => {
    const h3 = document.createElement('h3');
    h3.className = 'briefing-source-title';
    h3.textContent = tema;
    list.appendChild(h3);

    items.forEach(item => {
      const li = document.createElement('li');
      const src = newsSourceLabel(item);
      const more = item.related.length ? ` · +${item.related.length} ${item.related.length > 1 ? 'fontes' : 'fonte'}` : '';
      li.innerHTML = `
        <a href="${escapeHTML(item.link)}" target="_blank" rel="noopener noreferrer">${escapeHTML(item.titulo)}</a>
        <span class="briefing-item-date">${escapeHTML(src ? src + ' · ' : '')}${timeAgoShort(item.data)}${more}</span>
      `;
      list.appendChild(li);
    });
  });

  generateWordFrequencyChart();
  openBriefingModal();
}

$('#briefing-copy')?.addEventListener('click', async () => {
  const txt = briefingWhatsAppText();
  try { await navigator.clipboard.writeText(txt); toast('Briefing copiado', 'success'); }
  catch (e) { window.prompt('Copie o texto:', txt); }
});
$('#briefing-wa')?.addEventListener('click', () => {
  window.open('https://wa.me/?text=' + encodeURIComponent(briefingWhatsAppText()), '_blank', 'noopener');
});

$('#briefing-btn')?.addEventListener('click', generateAndShowBriefing);
$('#briefing-modal-close-btn')?.addEventListener('click', closeBriefingModal);

/* ---------- início (antes ficava no INIT do app.js) ---------- */
buildNewsSidebar();
updateNewsBubbleStates(); // fontes guardadas de visitas anteriores
showNewsSkeleton();

const newsCached = loadNewsFromCache();
if (newsCached) {
  newsAll = newsCached;
  renderNewsView();
  const info = document.getElementById('news-info');
  if (info) info.innerHTML = `<span class="dot" style="background:var(--text-3)"></span>Carregando atualizações...`;
}

fetchNewsFromWorker(!!newsCached);
