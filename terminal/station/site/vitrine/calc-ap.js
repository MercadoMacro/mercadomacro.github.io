/* Calculadora pública de aposentadoria (/calculadora-aposentadoria). Tudo em valores de hoje. */
(function () {
  'use strict';
  var M = window.MM, $ = function (id) { return document.getElementById(id); };
  function desenha() {
    var idade = Math.round(M.num($('idade').value)), ap = Math.round(M.num($('idadeap').value)), renda = M.num($('renda').value), atual = M.num($('atual').value) || 0, r = M.num($('real').value) / 100;
    var anos = ap - idade, n = anos * 12;
    if (!(idade > 0) || !(anos > 0) || anos > 80 || !(renda > 0) || !M.ok(r) || r <= 0) {
      var porque = !M.ok(r) || r <= 0 ? 'Digite uma rentabilidade acima da inflação maior que zero.' : !(renda > 0) ? 'Digite a renda mensal que você quer.' : 'A idade para se aposentar precisa ser maior que a idade de hoje.';
      $('res').innerHTML = '<div><span>Quanto juntar por mês</span><b>—</b><small>' + porque + '</small></div>'; $('graf').innerHTML = ''; return;
    }
    var im = Math.pow(1 + r, 1 / 12) - 1, meta = renda * 12 / r, fvAtual = atual * Math.pow(1 + im, n), falta = meta - fvAtual;
    var pmt = falta > 0 ? falta * im / (Math.pow(1 + im, n) - 1) : 0;
    var grupos = [], s = atual;
    for (var a = 1; a <= anos; a++) { for (var m = 0; m < 12; m++) s = s * (1 + im) + pmt; grupos.push({ rot: String(idade + a), partes: [s] }); }
    $('res').innerHTML = '<div><span>Quanto juntar por mês</span><b class="ac">' + (falta > 0 ? M.brl(pmt) : 'R$ 0,00') + '</b><small>' + (falta > 0 ? 'durante ' + anos + ' anos' : 'O que você já tem basta para a meta.') + '</small></div>'
      + '<div><span>Patrimônio necessário</span><b>' + M.curto(meta) + '</b><small>' + M.brl(meta, 0) + '</small></div>'
      + '<div><span>O que você já tem vira</span><b>' + M.curto(fvAtual) + '</b><small>aos ' + ap + ' anos, sem novos aportes</small></div>'
      + '<div><span>Renda que isso paga</span><b class="pos">' + M.brl(renda, 0) + '</b><small>por mês, sem gastar o principal</small></div>';
    M.barras($('graf'), grupos, ['var(--accent)'], meta);
  }
  ['idade', 'idadeap', 'renda', 'atual', 'real'].forEach(function (id) { $(id).addEventListener('input', desenha); });
  desenha();
  // sugestão: juro real que o mercado espera para o ano mais distante do Focus (mais realista para décadas);
  // o de hoje fica como alternativa
  var FOCUS = 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/historico/focus.json';
  var dicas = [];
  function mostraDicas() {
    $('dica-real').innerHTML = dicas.length ? dicas.map(function (d, i) { return d.txt + ' <button type="button" data-i="' + i + '">Usar ' + M.nf(d.v, 2) + '%</button>'; }).join('<br>') : 'Não deu para buscar os juros agora. Digite a rentabilidade acima da inflação que quiser.';
  }
  $('dica-real').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; $('real').value = M.nf(dicas[+b.dataset.i].v, 2); desenha(); });
  var pFocus = fetch(FOCUS).then(function (r) { if (!r.ok) throw r; return r.json(); }).then(function (j) {
    var anos = Object.keys(j.ind.Selic || {}).filter(function (a) { return (j.ind.IPCA || {})[a]; }).sort(), a = anos[anos.length - 1];
    var sel = j.ind.Selic[a], ipc = j.ind.IPCA[a], s1 = sel[sel.length - 1][1], i1 = ipc[ipc.length - 1][1];
    dicas.unshift({ v: ((1 + s1 / 100) / (1 + i1 / 100) - 1) * 100, txt: 'Mercado espera para ' + a + ': Selic ' + M.nf(s1, 2) + '% e IPCA ' + M.nf(i1, 2) + '% (Boletim Focus).' });
  }).catch(function () {});
  var pHoje = Promise.all([M.serie(4389), M.serie(13522)]).then(function (x) {
    var cdi = x[0][x[0].length - 1], ipca = x[1][x[1].length - 1];
    dicas.push({ v: ((1 + cdi.v / 100) / (1 + ipca.v / 100) - 1) * 100, txt: 'Hoje: CDI ' + M.nf(cdi.v, 2) + '% e IPCA de 12 meses ' + M.nf(ipca.v, 2) + '% (Banco Central).' });
  }).catch(function () {});
  Promise.all([pFocus, pHoje]).then(function () {
    mostraDicas();
    if (!$('real').value && dicas.length) { $('real').value = M.nf(dicas[0].v, 2); desenha(); }
  });
})();
