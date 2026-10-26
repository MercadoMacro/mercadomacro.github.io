/* Ajudantes das páginas públicas (calculadoras e indicadores de hoje).
   Dados do Banco Central e do Yahoo pelo worker da segunda conta, com o worker principal
   e a fonte direta como reserva. */
(function () {
  'use strict';
  var VT = 'https://mercadomacro-vitrine.cota-cotacao10.workers.dev';
  var API = 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  var ok = function (x) { return typeof x === 'number' && isFinite(x); };
  function okJson(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
  function lista(j) { if (!Array.isArray(j) || !j.length) throw new Error('vazio'); return j.map(function (o) { return { d: o.data, v: parseFloat(o.valor) }; }).filter(function (o) { return isFinite(o.v); }); }
  // últimos n valores de uma série do SGS: [{ d: 'dd/mm/aaaa', v }]
  function serie(c, n) {
    n = n || 1;
    var direto = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.' + c + '/dados/ultimos/' + n + '?formato=json';
    return fetch(VT + '/bcb?c=' + c + '&n=' + n).then(okJson).then(lista)
      .catch(function () { return fetch(API + '/bcb?mmp=vitrine&c=' + c + '&q=' + encodeURIComponent('/ultimos/' + n)).then(okJson).then(lista); })
      .catch(function () { return fetch(direto).then(okJson).then(lista); });
  }
  function cotacoes(simbolos) {
    var q = encodeURIComponent(simbolos.join(','));
    return fetch(VT + '/quotes?symbols=' + q).then(okJson)
      .catch(function () { return fetch(API + '/quotes?mmp=vitrine&symbols=' + q).then(okJson); })
      .then(function (j) {
        var out = {};
        simbolos.forEach(function (s) {
          var r = j[s] && j[s].chart && j[s].chart.result && j[s].chart.result[0];
          if (!r || !r.meta || !isFinite(r.meta.regularMarketPrice)) return;
          var p = r.meta.regularMarketPrice, prev = r.meta.chartPreviousClose != null ? r.meta.chartPreviousClose : r.meta.previousClose;
          out[s] = { v: p, ch: prev ? (p - prev) / prev * 100 : NaN, t: r.meta.regularMarketTime ? r.meta.regularMarketTime * 1000 : 0 };
        });
        return out;
      });
  }
  function num(s) { s = String(s == null ? '' : s).trim().replace(/[R$\s%]/g, ''); if (!s) return NaN; if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); return parseFloat(s); }
  function nf(x, d) { return ok(x) ? x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'; }
  function brl(x, d) { return ok(x) ? 'R$ ' + nf(x, d == null ? 2 : d) : '—'; }
  function curto(x) { if (!ok(x)) return '—'; var a = Math.abs(x); return a >= 1e9 ? 'R$ ' + nf(x / 1e9, 1) + ' bi' : a >= 1e6 ? 'R$ ' + nf(x / 1e6, 1) + ' mi' : a >= 1e4 ? 'R$ ' + nf(x / 1e3, 0) + ' mil' : brl(x, 0); }
  // gráfico de barras empilhadas em SVG: grupos = [{ rot, partes: [valor, ...] }], cores = ['var(--x)', ...]
  function barras(el, grupos, cores, linha) {
    var W = 640, H = 220, pe = 46, pb = 22, pt = 8, n = grupos.length;
    if (!n) { el.innerHTML = ''; return; }
    var max = Math.max.apply(null, grupos.map(function (g) { return g.partes.reduce(function (a, b) { return a + Math.max(0, b); }, 0); }).concat(ok(linha) ? [linha] : []));
    if (!(max > 0)) { el.innerHTML = ''; return; }
    var bw = (W - pe) / n, y = function (v) { return pt + (H - pt - pb) * (1 - v / max); }, s = '';
    for (var k = 0; k <= 4; k++) { var v = max * k / 4; s += '<line x1="' + pe + '" x2="' + W + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#1b2741"/><text x="' + (pe - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="10" fill="#8591a8">' + curto(v).replace('R$ ', '') + '</text>'; }
    var passo = Math.ceil(n / 12);
    grupos.forEach(function (g, i) {
      var base = 0, x = pe + i * bw + bw * 0.15, w = bw * 0.7;
      g.partes.forEach(function (p, j) { p = Math.max(0, p); s += '<rect x="' + x + '" y="' + y(base + p) + '" width="' + w + '" height="' + Math.max(0, y(base) - y(base + p)) + '" fill="' + cores[j] + '" rx="1.5"><title>' + g.rot + ': ' + brl(p, 0) + '</title></rect>'; base += p; });
      if (i % passo === 0 || i === n - 1) s += '<text x="' + (x + w / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="#8591a8">' + g.rot + '</text>';
    });
    if (ok(linha)) s += '<line x1="' + pe + '" x2="' + W + '" y1="' + y(linha) + '" y2="' + y(linha) + '" stroke="var(--pos)" stroke-width="2" stroke-dasharray="6 4"/>';
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfico da simulação">' + s + '</svg>';
  }
  window.MM = { ok: ok, serie: serie, cotacoes: cotacoes, num: num, nf: nf, brl: brl, curto: curto, barras: barras };
})();
