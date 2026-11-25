/* 25/11/2026: faixa "Jornal de hoje" no topo da aba Notícias. Mostra as matérias do Jornal Mercado Macro publicadas hoje
   (abertura, assunto do dia, fechamento); cada uma abre a página pública da matéria. Sem matéria hoje, a faixa não aparece. */
(function () {
  var caixa = document.getElementById('jornal-hoje');
  if (!caixa) return;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var hora = function (t) { try { return new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); } catch (e) { return ''; } };
  function montar(j) {
    var itens = (j && j.itens) || [];
    if (!itens.length) { caixa.hidden = true; caixa.innerHTML = ''; return; }
    caixa.innerHTML = '<header><b><i class="fas fa-newspaper" aria-hidden="true"></i> Jornal de hoje</b><a href="/jornal" target="_blank" rel="noopener">Ver o Jornal <span aria-hidden="true">→</span></a></header>'
      + '<div class="jh-lista">' + itens.map(function (m) {
        return '<a class="jh-it" href="/jornal/' + encodeURIComponent(m.slug) + '?de=terminal" target="_blank" rel="noopener">'
          + '<small>' + esc(m.tipo) + ' · ' + esc(hora(m.publicado)) + '</small><strong>' + esc(m.titulo) + '</strong><span class="jh-lf">' + esc(m.linha_fina) + '</span>'
          + '<em>Ler matéria completa →</em></a>';
      }).join('') + '</div>';
    caixa.hidden = false;
  }
  function buscar() {
    fetch('/jornal/hoje.json', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(montar).catch(function () { /* sem faixa */ });
  }
  // o botão "Jornal" vai para junto do Telegram, na barra que o noticias2/3.js monta
  var bt = document.getElementById('news-jornal'), tg = document.getElementById('news-tg');
  if (bt && tg && tg.parentNode) tg.after(bt);
  buscar();
  setInterval(function () { if (!document.hidden) buscar(); }, 20 * 60 * 1000);
})();
