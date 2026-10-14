/* Calculadora pública de juros compostos (/calculadora-juros-compostos). */
(function () {
  'use strict';
  var M = window.MM, $ = function (id) { return document.getElementById(id); }, un = 'aa';
  function desenha() {
    var ini = M.num($('ini').value) || 0, apo = M.num($('apo').value) || 0, t = M.num($('taxa').value) / 100, anos = Math.round(M.num($('anos').value));
    document.querySelectorAll('#chips button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.a === anos)); });
    if (!M.ok(t) || !(anos > 0) || anos > 80 || ini + apo <= 0) {
      $('res').innerHTML = '<div><span>Saldo final</span><b>—</b><small>' + (!M.ok(t) ? 'Digite a taxa de juros.' : 'Confira os valores e o prazo.') + '</small></div>';
      $('linhas').innerHTML = ''; $('graf').innerHTML = ''; return;
    }
    var im = un === 'am' ? t : Math.pow(1 + t, 1 / 12) - 1, s = ini, inv = ini, rows = [], grupos = [], jAnt = 0;
    for (var a = 1; a <= anos; a++) {
      for (var m = 0; m < 12; m++) { s = s * (1 + im) + apo; inv += apo; }
      var jur = s - inv;
      rows.push([a, inv, jur - jAnt, jur, s]); grupos.push({ rot: String(a), partes: [inv, jur] }); jAnt = jur;
    }
    var aa = un === 'am' ? Math.pow(1 + t, 12) - 1 : t;
    $('res').innerHTML = '<div><span>Saldo final</span><b class="ac">' + M.brl(s) + '</b><small>em ' + anos + (anos === 1 ? ' ano' : ' anos') + '</small></div>'
      + '<div><span>Você investiu</span><b>' + M.brl(inv) + '</b></div>'
      + '<div><span>Juros ganhos</span><b class="pos">' + M.brl(s - inv) + '</b><small>' + M.nf((s - inv) / s * 100, 0) + '% do saldo final</small></div>'
      + '<div><span>Taxa equivalente</span><b>' + M.nf(aa * 100, 2) + '% a.a.</b><small>' + M.nf(im * 100, 3) + '% ao mês</small></div>';
    M.barras($('graf'), grupos, ['var(--blue)', 'var(--accent)']);
    $('linhas').innerHTML = rows.map(function (r) {
      return '<tr><td data-l="Ano"><b>' + r[0] + '</b></td><td data-l="Total investido">' + M.brl(r[1]) + '</td><td data-l="Juros no ano">' + M.brl(r[2]) + '</td><td data-l="Juros acumulados">' + M.brl(r[3]) + '</td><td data-l="Saldo" class="liq">' + M.brl(r[4]) + '</td></tr>';
    }).join('');
  }
  ['ini', 'apo', 'taxa', 'anos'].forEach(function (id) { $(id).addEventListener('input', desenha); });
  $('chips').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; $('anos').value = b.dataset.a; desenha(); });
  $('un').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || b.dataset.u === un) return;
    var t = M.num($('taxa').value) / 100;
    if (M.ok(t)) $('taxa').value = M.nf((b.dataset.u === 'am' ? Math.pow(1 + t, 1 / 12) - 1 : Math.pow(1 + t, 12) - 1) * 100, b.dataset.u === 'am' ? 3 : 2);
    un = b.dataset.u;
    document.querySelectorAll('#un button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    $('taxa-u').textContent = un === 'am' ? '% ao mês' : '% ao ano';
    desenha();
  });
  desenha();
  M.serie(4389).then(function (s) {
    var o = s[s.length - 1], cdi = o.v;
    $('dica-taxa').innerHTML = 'CDI de hoje: ' + M.nf(cdi, 2) + '% ao ano (Banco Central, ' + o.d + '). <button type="button" id="usar">Usar o CDI</button>';
    $('usar').onclick = function () { un = 'aa'; document.querySelectorAll('#un button').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.u === 'aa')); }); $('taxa-u').textContent = '% ao ano'; $('taxa').value = M.nf(cdi, 2); desenha(); };
    if (!$('taxa').value) { $('taxa').value = M.nf(cdi, 2); desenha(); }
  }).catch(function () { $('dica-taxa').textContent = 'Não deu para buscar o CDI agora. Digite a taxa que quiser.'; });
})();
