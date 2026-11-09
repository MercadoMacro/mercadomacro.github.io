/* Aba Notícias, rodada de melhorias de 09/11/2026 (pedido do Severino: "todas"):
   no celular as notícias vêm primeiro e as fontes abrem num painel pelo botão "Fontes";
   a barra de cima fica compacta. Por cima do noticias2.js (mesmos ids); para voltar, tirar este
   arquivo e o noticias3.css. */
(() => {
  const $ = (s) => document.querySelector(s);
  const barra = $('#news-panel .news-toolbar'), sb = $('#source-sidebar');
  if (!barra || !sb) return;
  document.body.classList.add('nw3');
  const CEL = window.matchMedia('(max-width: 900px)');

  // botão "Fontes" ao lado da busca (só aparece no celular); mostra quantas fontes estão escolhidas
  const bt = document.createElement('button');
  bt.type = 'button'; bt.id = 'nw3-fontes'; bt.className = 'btn-sm';
  bt.setAttribute('aria-controls', 'source-sidebar'); bt.setAttribute('aria-expanded', 'false');
  bt.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg><span>Fontes</span><b class="nw3-n" hidden></b>';
  $('#news-search')?.after(bt);

  // botões menores (Telegram, avisos, resumo, briefing, atualizar) numa faixa própria: no celular ela rola de lado
  const acoes = document.createElement('div');
  acoes.className = 'nw3-acoes';
  ['#news-tg', '#news-alert-btn', '#resumo-ia-btn', '#briefing-btn', '#news-refresh-btn'].forEach((id) => { const el = barra.querySelector(id); if (el) acoes.append(el); });
  barra.append(acoes);
  // o resumo-ia.js reposiciona o botão dele ao lado do briefing quando a barra muda: segue dentro da faixa
  new MutationObserver(() => {
    const r = barra.querySelector(':scope > #resumo-ia-btn');
    if (r) acoes.insertBefore(r, acoes.querySelector('#briefing-btn'));
  }).observe(barra, { childList: true });

  const fundo = document.createElement('div');
  fundo.id = 'nw3-fundo'; fundo.hidden = true;
  document.body.append(fundo);

  const fecha = document.createElement('button');
  fecha.type = 'button'; fecha.className = 'nw3-fechar'; fecha.textContent = 'Ver notícias';
  fecha.setAttribute('aria-label', 'Fechar fontes e ver as notícias');

  function abre(sim) {
    const on = !!sim && CEL.matches;
    document.body.classList.toggle('nw3-fontes', on);
    fundo.hidden = !on;
    bt.setAttribute('aria-expanded', String(on));
    if (on) { if (!sb.contains(fecha)) sb.append(fecha); sb.scrollTop = 0; }
  }
  bt.addEventListener('click', () => abre(!document.body.classList.contains('nw3-fontes')));
  fundo.addEventListener('click', () => abre(false));
  fecha.addEventListener('click', () => abre(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('nw3-fontes')) abre(false); });
  CEL.addEventListener?.('change', () => abre(false));

  // número no botão: quantas fontes estão filtradas (nada quando são todas)
  function conta() {
    const n = sb.querySelectorAll('.ns-sub-bubble.active').length;
    const todas = sb.querySelector('#ns-all-btn')?.classList.contains('active');
    const b = bt.querySelector('.nw3-n');
    b.hidden = !!todas || !n;
    b.textContent = n || '';
    // o "fechar" volta para o fim sempre que a lateral é refeita
    if (document.body.classList.contains('nw3-fontes') && sb.lastElementChild !== fecha) sb.append(fecha);
  }
  new MutationObserver(conta).observe(sb, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  conta();
})();
