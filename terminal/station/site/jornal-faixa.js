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
  // 25/11/2026: a barra tinha 11 botões numa linha. WhatsApp, Telegram, Jornal e Avisos vão para um menu "Mais"
  (function menuMais() {
    var ids = [['news-wa', 'Canal no WhatsApp'], ['news-tg', 'Canal no Telegram'], ['news-jornal', ''], ['news-alert-btn', '']];
    var itens = ids.map(function (x) { return [document.getElementById(x[0]), x[1]]; }).filter(function (x) { return x[0]; });
    if (!itens.length) return;
    // vai para a faixa de botões que o noticias3.js monta (.nw3-acoes), antes do Resumo da IA / Briefing
    var acoes = document.querySelector('#news-panel .nw3-acoes');
    var ref = acoes && (acoes.querySelector(':scope > #resumo-ia-btn') || acoes.querySelector(':scope > #briefing-btn'));
    if (!ref) ref = acoes ? null : (document.getElementById('briefing-btn') || itens[0][0]);
    var caixa = document.createElement('div'); caixa.className = 'mm-mais';
    var bt = document.createElement('button'); bt.type = 'button'; bt.className = 'btn-sm mm-mais-bt'; bt.id = 'news-mais';
    bt.setAttribute('aria-haspopup', 'true'); bt.setAttribute('aria-expanded', 'false'); bt.title = 'WhatsApp, Telegram, Jornal e avisos';
    bt.innerHTML = '<span aria-hidden="true">⋯</span> Mais';
    var menu = document.createElement('div'); menu.className = 'mm-mais-menu'; menu.hidden = true; menu.setAttribute('role', 'menu');
    itens.forEach(function (x) {
      var el = x[0];
      if (x[1] && !el.querySelector('.mm-lbl')) { var sp = document.createElement('span'); sp.className = 'mm-lbl'; sp.textContent = x[1]; el.append(sp); }
      el.setAttribute('role', 'menuitem');
      menu.append(el);
    });
    caixa.append(bt, menu);
    if (ref) ref.parentNode.insertBefore(caixa, ref); else acoes.prepend(caixa);
    var abre = function (sim) { menu.hidden = !sim; bt.setAttribute('aria-expanded', sim ? 'true' : 'false'); };
    bt.addEventListener('click', function (e) { e.stopPropagation(); abre(menu.hidden); });
    document.addEventListener('click', function (e) { if (!caixa.contains(e.target)) abre(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') abre(false); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) abre(false); });
  })();
  buscar();
  setInterval(function () { if (!document.hidden) buscar(); }, 20 * 60 * 1000);
})();
