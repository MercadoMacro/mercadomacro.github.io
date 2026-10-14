/* Página pública "Indicadores de hoje" (/indicadores-hoje).
   Banco Central (SGS) pelos workers; cotações no widget do TradingView (na própria página); Focus do arquivo que o robô de histórico grava no GitHub. */
(function () {
  'use strict';
  var M = window.MM, $ = function (id) { return document.getElementById(id); };
  var FOCUS = 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/historico/focus.json';
  function card(nome, valor, nota, cls) { return '<div class="ind"><span>' + nome + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>' + valor + '</b><small>' + (nota || '') + '</small></div>'; }
  function mes(d) { var p = d.split('/'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+p[1] - 1] + '/' + p[2]; }

  // juros e inflação
  var J = { selic: null, cdi: null, ipca: null, ipcam: null, igpm: null };
  function juros() {
    var c = [];
    c.push(J.selic ? card('Selic (meta do Copom)', M.nf(J.selic.v, 2) + '%', 'ao ano, em ' + J.selic.d) : card('Selic (meta do Copom)', '—', 'sem resposta do Banco Central'));
    c.push(J.cdi ? card('CDI', M.nf(J.cdi.v, 2) + '%', 'ao ano, em ' + J.cdi.d) : card('CDI', '—', ''));
    if (J.ipca) { var a = J.ipca[J.ipca.length - 1], b = J.ipca[J.ipca.length - 2], dif = b ? a.v - b.v : NaN; c.push(card('IPCA em 12 meses', M.nf(a.v, 2) + '%', 'até ' + mes(a.d) + (M.ok(dif) ? ' (' + (dif >= 0 ? '+' : '') + M.nf(dif, 2) + ' ponto no mês)' : ''))); }
    else c.push(card('IPCA em 12 meses', '—', ''));
    c.push(J.ipcam ? card('IPCA do mês', M.nf(J.ipcam.v, 2) + '%', mes(J.ipcam.d)) : card('IPCA do mês', '—', ''));
    if (J.igpm && J.igpm.length >= 12) { var f = J.igpm.slice(-12).reduce(function (x, o) { return x * (1 + o.v / 100); }, 1); c.push(card('IGP-M em 12 meses', M.nf((f - 1) * 100, 2) + '%', 'até ' + mes(J.igpm[J.igpm.length - 1].d))); }
    else c.push(card('IGP-M em 12 meses', '—', ''));
    if (J.cdi && J.ipca) { var r = ((1 + J.cdi.v / 100) / (1 + J.ipca[J.ipca.length - 1].v / 100) - 1) * 100; c.push(card('Juro real', M.nf(r, 2) + '%', 'CDI descontado o IPCA de 12 meses')); }
    else c.push(card('Juro real', '—', ''));
    $('g-juros').innerHTML = c.join('');
  }
  juros();
  var ultimo = function (s) { return s[s.length - 1]; };
  Promise.all([
    M.serie(432).then(function (s) { J.selic = ultimo(s); }).catch(function () {}),
    M.serie(4389).then(function (s) { J.cdi = ultimo(s); }).catch(function () {}),
    M.serie(13522, 2).then(function (s) { J.ipca = s; }).catch(function () {}),
    M.serie(433).then(function (s) { J.ipcam = ultimo(s); }).catch(function () {}),
    M.serie(189, 12).then(function (s) { J.igpm = s; }).catch(function () {})
  ]).then(juros);

  // Focus
  var LIN = [['IPCA', 'IPCA (inflação)', '%', 2], ['Selic', 'Selic no fim do ano', '%', 2], ['PIB Total', 'PIB (crescimento)', '%', 2], ['Câmbio', 'Dólar no fim do ano', 'R$ ', 2], ['IGP-M', 'IGP-M', '%', 2]];
  fetch(FOCUS).then(function (r) { if (!r.ok) throw r; return r.json(); }).then(function (j) {
    var y = new Date().getFullYear(), anos = [y, y + 1, y + 2], data = '';
    anos.forEach(function (a, i) { $('fa' + (i + 1)).textContent = a; });
    $('focus').innerHTML = LIN.map(function (l) {
      var ind = j.ind[l[0]] || {};
      return '<tr><td><b>' + l[1] + '</b></td>' + anos.map(function (a) {
        var s = ind[String(a)];
        if (!s || !s.length) return '<td data-l="' + a + '">—</td>';
        var u = s[s.length - 1], ant = s.length > 4 ? s[s.length - 5] : null; if (u[0] > data) data = u[0];
        var v = l[2] === '%' ? M.nf(u[1], l[3]) + '%' : l[2] + M.nf(u[1], l[3]);
        var seta = ant && u[1] !== ant[1] ? ' <small style="display:inline">' + (u[1] > ant[1] ? '▲' : '▼') + '</small>' : '';
        return '<td data-l="' + a + '"><span>' + v + seta + '</span></td>';
      }).join('') + '</tr>';
    }).join('');
    if (data) $('focus-nota').textContent = 'Mediana das projeções de economistas no Boletim Focus de ' + data.split('-').reverse().join('/') + ', do Banco Central. A seta compara com 4 semanas antes.';
  }).catch(function () { $('focus').innerHTML = '<tr><td colspan="4">Não foi possível buscar o Boletim Focus agora.</td></tr>'; });
})();
