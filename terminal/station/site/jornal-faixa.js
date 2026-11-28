/* 25/11/2026: faixa "Jornal de hoje" no topo da aba Notícias. Mostra as matérias do Jornal Mercado Macro publicadas hoje
   (abertura, assunto do dia, fechamento); cada uma abre a página pública da matéria. Sem matéria hoje, a faixa não aparece. */
(function () {
  var caixa = document.getElementById('jornal-hoje');
  if (!caixa) return;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var hora = function (t) { try { return new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); } catch (e) { return ''; } };
  // 25/11/2026: ilustração por assunto (biblioteca própria em /jornal-img, sem fotos de terceiros, rostos ou marcas)
  // 27/11/2026: +12 fotos (porto, indústria, B3, agência, agro, China, Congresso, chip, data center, soja, supermercado)
  // 25/11/2026: fotos do pacote do Dante (geradas por IA, /jornal-img/*.webp), escolhidas pelo assunto da matéria
  var IMGS = [
    [/petr[óo]leo|brent|opep|combust[íi]vel|petrobras/i, ['petroleo', 'petroleo2']],
    [/bitcoin|cripto|ethereum/i, ['cripto', 'cripto2']],
    [/\bouro\b|gold/i, ['ouro']],
    [/data ?cent(er|ro)|nuvem|\bcloud\b/i, ['datacenter', 'chip']],
    [/nvidia|intelig[êe]ncia artificial|\bias?\b|chip|semicondutor|big techs?|tecnologia/i, ['chip', 'tecnologia', 'datacenter']],
    [/embraer|avi[ãa]o|aeronave|a[ée]rea/i, ['aviao']],
    [/\bfed\b|powell|fomc|treasur/i, ['fed']],
    [/china|chin[êe]s|chinesa|pequim|xangai|yuan|[áa]sia/i, ['china']],
    [/agro|safra|soja|milho|gr[ãa]os|caf[ée]|conab|colheita|lavoura/i, ['agro', 'soja']],
    [/porto|export|import|balan[çc]a comercial|com[ée]rcio exterior|frete|min[ée]rio/i, ['porto']],
    [/ind[úu]stria|industrial|\bpmi\b|f[áa]brica|montadora|ve[íi]culos|manufatura/i, ['industria']],
    [/ipca|infla[çc][ãa]o|pre[çc]os|alimentos|supermercado|varejo|consumo|vendas/i, ['mercado']],
    [/(ibovespa|bolsa|a[çc][õo]es)[^\s,;:]*\s+(\S+\s+){0,2}(cai|caiu|recua|recuou|despenca|perde|afunda|fecha em (queda|baixa)|em queda|em baixa)/i, ['queda']],
    [/ibovespa|bolsa|a[çc][õo]es|\bb3\b/i, ['bolsa', 'b3', 'mesa']],
    [/congresso|c[âa]mara|senado|\bpec\b|vota[çc][ãa]o|deputad|senador/i, ['congresso', 'brasilia']],
    [/bancos?\b|banc[áa]ri|cr[ée]dito|itaú|bradesco|santander|nubank|inadimpl/i, ['agencia', 'reuniao']],
    [/fazenda|fiscal|governo|lula|haddad|bras[íi]lia|minist|copom|selic|or[çc]amento/i, ['brasilia', 'congresso']],
    [/d[óo]lar|c[âa]mbio|\breal\b/i, ['cambio', 'dolar']],
    [/fus[ãa]o|aquisi[çc][ãa]o|balan[çc]o|lucro|resultado|\bceo\b|empresa/i, ['reuniao']],
    [/eua|trump|tarifa|wall street|nova york|\bny\b|s&p|nasdaq|europa/i, ['wallstreet', 'nyse']]
  ];
  var SECAO = { Mercados: 'bolsa', Economia: 'brasilia', Juros: 'brasilia', 'Câmbio': 'cambio', Empresas: 'reuniao', Internacional: 'wallstreet', Cripto: 'cripto', Commodities: 'petroleo2', Agro: 'agro' };
  function imagemDe(m, usadas) {
    var t = m.titulo || '', op = null;
    for (var i = 0; i < IMGS.length && !op; i++) if (IMGS[i][0].test(t)) op = IMGS[i][1];
    if (!op) op = /abertura/i.test(m.tipo) ? ['nyse', 'wallstreet'] : /fechamento/i.test(m.tipo) ? ['mesa', 'bolsa'] : [SECAO[m.secao] || 'mesa'];
    // não repete a mesma foto na faixa quando há outra opção para o assunto
    for (var k = 0; k < op.length; k++) if (!usadas[op[k]]) { usadas[op[k]] = 1; return op[k]; }
    return op[0];
  }
  function montar(j) {
    var itens = (j && j.itens) || [];
    if (!itens.length) { caixa.hidden = true; caixa.innerHTML = ''; return; }
    var usadas = {};
    caixa.innerHTML = '<header><b><i class="fas fa-newspaper" aria-hidden="true"></i> Jornal de hoje</b><span class="jh-sub">Os principais movimentos do mercado, explicados</span><a href="/jornal" target="_blank" rel="noopener">Ver o Jornal <span aria-hidden="true">→</span></a></header>'
      + '<div class="jh-lista">' + itens.map(function (m) {
        return '<a class="jh-it" href="/jornal/' + encodeURIComponent(m.slug) + '?de=terminal" target="_blank" rel="noopener">'
          + '<img class="jh-img" src="/jornal-img/' + imagemDe(m, usadas) + '.webp?v=2" alt="" width="360" height="480" loading="lazy" decoding="async">'
          + '<div class="jh-tx"><small>' + esc(m.tipo) + ' · ' + esc(hora(m.publicado)) + '</small><strong>' + esc(m.titulo) + '</strong><span class="jh-lf">' + esc(m.linha_fina) + '</span>'
          + '<em>Ler matéria →</em></div></a>';
      }).join('') + '</div>';
    caixa.hidden = false;
  }
  function buscar() {
    fetch('/jornal/hoje.json', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(montar).catch(function () { /* sem faixa */ });
  }
  // 25/11/2026: a barra tinha 11 botões numa linha. WhatsApp, Telegram, Jornal e Avisos vão para um menu "Mais"
  (function menuMais() {
    // 26/11/2026: o Gerar Briefing entra no Mais; o sino dos avisos sai do Mais e fica ao lado do Resumo IA, só com o ícone
    var ids = [['briefing-btn', ''], ['news-wa', 'Canal no WhatsApp'], ['news-tg', 'Canal no Telegram'], ['news-jornal', '']];
    var itens = ids.map(function (x) { return [document.getElementById(x[0]), x[1]]; }).filter(function (x) { return x[0]; });
    if (!itens.length) return;
    // vai para a faixa de botões que o noticias3.js monta (.nw3-acoes), antes do Resumo da IA / Briefing
    var acoes = document.querySelector('#news-panel .nw3-acoes');
    var ria = document.getElementById('resumo-ia-btn');
    var ref = acoes && acoes.querySelector(':scope > #resumo-ia-btn');
    if (!ref) ref = acoes ? null : (ria || itens[0][0]);
    var caixa = document.createElement('div'); caixa.className = 'mm-mais';
    var bt = document.createElement('button'); bt.type = 'button'; bt.className = 'btn-sm mm-mais-bt'; bt.id = 'news-mais';
    bt.setAttribute('aria-haspopup', 'true'); bt.setAttribute('aria-expanded', 'false'); bt.title = 'Briefing, WhatsApp, Telegram e Jornal';
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
    // o Resumo IA ainda está na barra de cima nessa hora: traz para a faixa, logo depois do Mais, e o sino ao lado
    if (acoes && ria) caixa.after(ria);
    var sino = document.getElementById('news-alert-btn');
    if (sino && (ria || caixa).parentNode) { sino.classList.add('mm-sino'); (ria || caixa).after(sino); }
    var abre = function (sim) { menu.hidden = !sim; bt.setAttribute('aria-expanded', sim ? 'true' : 'false'); };
    bt.addEventListener('click', function (e) { e.stopPropagation(); abre(menu.hidden); });
    document.addEventListener('click', function (e) { if (!caixa.contains(e.target)) abre(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') abre(false); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) abre(false); });
  })();
  buscar();
  setInterval(function () { if (!document.hidden) buscar(); }, 20 * 60 * 1000);
})();
