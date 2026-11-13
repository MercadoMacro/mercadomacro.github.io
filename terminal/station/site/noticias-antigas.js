/* Notícias mais antigas (13/11/2026, pedido do Dante): abaixo dos cartões da aba Notícias, um botão abre a linha do
   tempo dos últimos 7 dias (guardada no servidor, /api/noticias/antigas), em lotes de 60, das mais novas para as mais
   velhas. Respeita a busca e as fontes escolhidas; manchetes em inglês são traduzidas no navegador, como as outras.
   Usa funções do app.js (escapeHTML, newsTermo, newsActiveSources, newsSourceBadgeStyle, NEWS_EN, newsTraduzLote). */
(() => {
  const view = document.getElementById('news-view');
  if (!view) return;
  const box = document.createElement('section');
  box.id = 'news-old';
  box.className = 'no-box';
  box.setAttribute('aria-label', 'Notícias mais antigas');
  view.after(box);
  let itens = [], antes = 0, mais = true, chave = '', carregando = false, aberto = false;
  const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(s) : String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`));
  const filtros = () => {
    const fontes = typeof newsActiveSources !== 'undefined' ? [...newsActiveSources] : [];
    const q = typeof newsTermo === 'function' ? newsTermo() : '';
    return { fontes, q, k: q + '§' + fontes.sort().join('|') };
  };
  const diaBrt = (t) => new Date(t - 3 * 3600000).toISOString().slice(0, 10);
  const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const rotDia = (d) => { const x = new Date(d + 'T12:00:00Z'); return `${DIAS[x.getUTCDay()]}, ${d.slice(8, 10)}/${d.slice(5, 7)}`; };
  // começa logo abaixo do cartão mais velho que está na tela (sem repetir as de cima)
  const inicio = () => {
    const l = (window.__newsLeads || []).map((n) => +n.data).filter(Number.isFinite);
    return l.length ? Math.min(...l) : Date.now() - 24 * 3600000;
  };

  function desenhar(msg) {
    view.style.display === 'none' ? (box.hidden = true) : (box.hidden = false);
    if (!aberto) {
      box.innerHTML = '<button type="button" class="btn-sm no-abrir"><i class="fas fa-clock-rotate-left"></i> Ver notícias mais antigas (até 7 dias)</button>';
      return;
    }
    let dia = '', h = '<div class="no-cab"><b>Notícias mais antigas</b><button type="button" class="btn-sm no-fechar" aria-label="Fechar notícias mais antigas">Fechar</button></div>';
    for (const n of itens) {
      const d = diaBrt(n.data);
      if (d !== dia) { h += `${dia ? '</ul>' : ''}<h3 class="no-dia">${rotDia(d)}</h3><ul class="no-lista">`; dia = d; }
      const hora = new Date(n.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
      const fonte = n.fonte === 'Google News' && n.veiculo ? n.veiculo : n.fonte;
      const est = typeof newsSourceBadgeStyle === 'function' ? newsSourceBadgeStyle(n.fonte) : '';
      const imp = n.nivel === 'CRITICO' || n.nivel === 'ALTO' ? ' no-forte' : '';
      h += `<li><a class="no-item${imp}" href="${esc(n.link)}" target="_blank" rel="noopener noreferrer"${n.tituloOriginal ? ` title="${esc(n.tituloOriginal)}"` : ''}><span class="no-h">${hora}</span><span class="nc-source" style="${est}">${esc(fonte)}</span><span class="no-t">${esc(n.titulo)}</span></a></li>`;
    }
    if (dia) h += '</ul>';
    if (msg) h += `<p class="no-msg">${esc(msg)}</p>`;
    else if (!itens.length && !mais) h += '<p class="no-msg">Nenhuma notícia mais antiga com esta seleção.</p>';
    if (mais) h += `<button type="button" class="btn-sm no-mais"${carregando ? ' disabled' : ''}>${carregando ? 'Carregando…' : 'Carregar mais'}</button>`;
    else if (itens.length) h += '<p class="no-msg">Isso é tudo dos últimos 7 dias.</p>';
    box.innerHTML = h;
  }

  async function traduzir(lote) {
    if (typeof NEWS_EN === 'undefined' || typeof newsTraduzLote !== 'function') return;
    const en = lote.filter((n) => NEWS_EN.has(n.fonte));
    for (let i = 0; i < en.length; i += 20) {
      const parte = en.slice(i, i + 20);
      try {
        const pt = await newsTraduzLote(parte.map((n) => n.titulo.replace(/\n/g, ' ')));
        parte.forEach((n, j) => { if (pt[j]) { n.tituloOriginal = n.titulo; n.titulo = pt[j]; } });
      } catch (e) { return; } // fica em inglês
    }
  }

  async function carregar() {
    if (carregando || !mais) return;
    const f = filtros();
    if (f.k !== chave) { chave = f.k; itens = []; antes = inicio(); mais = true; }
    carregando = true; desenhar();
    try {
      const u = new URL('/api/noticias/antigas', location.href);
      u.searchParams.set('antes', String(Math.floor(antes)));
      if (f.q) u.searchParams.set('q', f.q);
      if (f.fontes.length) u.searchParams.set('fontes', f.fontes.join('|'));
      const r = await fetch(u, { credentials: 'same-origin' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const vistos = new Set(itens.map((n) => n.link));
      let lote = (j.itens || []).filter((n) => n && n.link && !vistos.has(n.link));
      if (typeof newsPolitica !== 'undefined' && !newsPolitica && typeof newsEhPolitica === 'function') lote = lote.filter((n) => !newsEhPolitica(n));
      await traduzir(lote);
      itens = itens.concat(lote);
      const ult = (j.itens || []).at(-1);
      if (ult) antes = ult.data;
      mais = !!j.mais && !!ult;
      carregando = false; desenhar();
    } catch (e) {
      carregando = false; desenhar('Não foi possível carregar agora. Tente de novo em instantes.');
    }
  }

  box.addEventListener('click', (e) => {
    if (e.target.closest('.no-abrir')) { aberto = true; chave = ''; mais = true; carregar(); return; }
    if (e.target.closest('.no-mais')) { carregar(); return; }
    if (e.target.closest('.no-fechar')) { aberto = false; itens = []; desenhar(); }
  });
  // a lista de cima foi redesenhada (busca, fontes, modo): se a seleção mudou, a linha do tempo recomeça
  new MutationObserver(() => {
    if (aberto && filtros().k !== chave) { mais = true; carregar(); } else desenhar();
  }).observe(view, { childList: true });
  new MutationObserver(() => { box.hidden = view.style.display === 'none'; }).observe(view, { attributes: true, attributeFilter: ['style'] });
  desenhar();
})();
