/* Ícone de cada fonte nos cartões de notícias e na lista de fontes (25/11/2026, pedido do Dante, como no esboço).
   As imagens vêm de /fonte-icone/<domínio> (o servidor guarda o favicon de cada site). Sem ícone, fica como antes. */
(function () {
  var DOM = {
    'Valor Econômico': 'valor.globo.com', 'InfoMoney': 'infomoney.com.br', 'Investing.com BR': 'investing.com', 'ADVFN BR': 'br.advfn.com',
    'BeInCrypto BR': 'br.beincrypto.com', 'Cointelegraph BR': 'br.cointelegraph.com', 'Money Times': 'moneytimes.com.br', 'InvestNews': 'investnews.com.br',
    'Valor Investe': 'valorinveste.globo.com', 'Bloomberg Línea': 'bloomberglinea.com.br', 'Suno': 'suno.com.br', 'BMC News': 'bmcnews.com.br',
    'Notícias Agrícolas': 'noticiasagricolas.com.br', 'Folha': 'folha.uol.com.br', 'O Antagonista': 'oantagonista.com.br', 'Poder360': 'poder360.com.br',
    'G1 Política': 'g1.globo.com', 'Agência Brasil': 'agenciabrasil.ebc.com.br', 'Bloomberg': 'bloomberg.com', 'Financial Juice': 'financialjuice.com',
    'ForexLive': 'forexlive.com', 'Zero Hedge': 'zerohedge.com', 'FXStreet': 'fxstreet.com', 'FX Markets': 'fx-markets.com', 'ING Think': 'think.ing.com',
    'CNBC': 'cnbc.com', 'WSJ': 'wsj.com', 'CoinDesk': 'coindesk.com', 'Proactive Investors': 'proactiveinvestors.com', 'Reuters': 'reuters.com',
    'RTTNews': 'rttnews.com', 'Barchart': 'barchart.com', 'Seeking Alpha': 'seekingalpha.com', 'Google News': 'news.google.com', 'Invezz': 'invezz.com'
  };
  // o cartão mostra às vezes o nome curto (ex.: "Valor", "WSJ Markets"): aceita os dois
  try { Object.keys(window.NEWS_SOURCES || {}).forEach(function (k) { var n = NEWS_SOURCES[k] && NEWS_SOURCES[k].name; if (n && DOM[k] && !DOM[n]) DOM[n] = DOM[k]; }); } catch (e) { /* segue */ }
  try { if (typeof NEWS_SOURCES === 'object') Object.keys(NEWS_SOURCES).forEach(function (k) { var n = NEWS_SOURCES[k].name; if (n && DOM[k] && !DOM[n]) DOM[n] = DOM[k]; }); } catch (e) { /* segue */ }
  var falhou = {};
  function img(dom, cls) {
    var i = document.createElement('img');
    i.className = cls; i.alt = ''; i.width = 32; i.height = 32; i.loading = 'lazy'; i.decoding = 'async';
    i.src = '/fonte-icone/' + dom + '.png';
    i.onerror = function () { falhou[dom] = 1; var p = i.parentNode; i.remove(); if (p) p.classList.remove('mm-com-ic'); };
    return i;
  }
  function aplicar(raiz) {
    (raiz || document).querySelectorAll('#news-panel .nc-source:not([data-ic])').forEach(function (el) {
      el.setAttribute('data-ic', '1');
      var dom = DOM[(el.textContent || '').trim()];
      if (!dom || falhou[dom]) return;
      el.classList.add('mm-com-ic'); el.prepend(img(dom, 'mm-fic'));
    });
    document.querySelectorAll('#news-panel .ns-sub-bubble[data-source]:not([data-ic])').forEach(function (b) {
      b.setAttribute('data-ic', '1');
      var dom = DOM[b.getAttribute('data-source')], dot = b.querySelector('.ns-dot');
      if (!dom || !dot || falhou[dom]) return;
      dot.classList.add('mm-com-ic'); dot.append(img(dom, 'mm-fic-dot'));
    });
  }
  var painel = document.getElementById('news-panel');
  if (!painel) return;
  aplicar();
  var pend = false;
  new MutationObserver(function () { if (pend) return; pend = true; requestAnimationFrame(function () { pend = false; aplicar(); }); })
    .observe(painel, { childList: true, subtree: true });
})();
