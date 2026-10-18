/* Calculadora pública de renda fixa (página /calculadora-renda-fixa, sem login).
   Comparação simplificada de renda fixa, independente da calculadora do terminal.
   Dados: CDI (SGS 4389), Selic meta (432), Selic efetiva anualizada (1178)
   e IPCA 12 meses (13522) do Banco Central,
   pelo worker da segunda conta, com o worker principal e o BCB direto como reserva. */
(function () {
  'use strict';
  var VT = 'https://mercadomacro-vitrine.cota-cotacao10.workers.dev';
  var API = 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  var $ = function (id) { return document.getElementById(id); };
  var ok = function (x) { return typeof x === 'number' && isFinite(x); };
  var M = { cdi: NaN, selic: NaN, selicEfetiva: NaN, ipca: NaN };

  function okJson(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
  function ultimo(j) { var o = Array.isArray(j) ? j[j.length - 1] : null; var v = o ? parseFloat(o.valor) : NaN; if (!isFinite(v)) throw new Error('sem valor'); return { v: v, d: o.data }; }
  function serie(c) {
    var direto = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.' + c + '/dados/ultimos/1?formato=json';
    var fontes = [API + '/bcb?c=' + c + '&q=' + encodeURIComponent('/ultimos/1'), direto];
    // A vitrine não libera a série 1178; o worker principal e o BCB já a atendem.
    if (c !== 1178) fontes.unshift(VT + '/bcb?c=' + c + '&n=1');
    function tentar(i) {
      return fetch(fontes[i]).then(okJson).then(ultimo).catch(function (e) {
        if (i + 1 < fontes.length) return tentar(i + 1);
        throw e;
      });
    }
    return tentar(0);
  }

  // números no formato brasileiro
  function num(s) { s = String(s || '').trim().replace(/[R$\s%]/g, ''); if (!s) return NaN; if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); return parseFloat(s); }
  function nf(x, d) { return ok(x) ? x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'; }
  function brl(x) { return ok(x) ? 'R$ ' + nf(x, 2) : '—'; }
  function pct(x, d) { return ok(x) ? nf(x * 100, d == null ? 2 : d) + '%' : '—'; }

  var IOF = [96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3];
  var iofPct = function (dc) { return dc >= 30 ? 0 : IOF[Math.max(1, Math.floor(dc)) - 1] / 100; };
  var irPct = function (dc) { return dc <= 180 ? 0.225 : dc <= 360 ? 0.20 : dc <= 720 ? 0.175 : 0.15; };

  // [id, nome, explicação, tipo, taxa padrão (parte do contrato, não dado de mercado), isento]
  var LINHAS = [
    ['cdb', 'CDB pós-fixado', '% do CDI', 'pos', '100', false],
    ['lci', 'LCI ou LCA', '% do CDI, isenta de IR', 'pos', '90', true],
    ['tselic', 'Tesouro Selic (estimativa)', 'Selic efetiva constante; sem custódia e ágio/deságio', 'tselic', '', false],
    ['pre', 'Prefixado (CDB ou Tesouro)', 'digite a taxa ao ano', 'pre', '', false],
    ['ipca', 'IPCA+ (CDB ou Tesouro)', 'digite a taxa acima do IPCA', 'ipca', '', false],
    ['poup', 'Poupança', 'regra atual, isenta', 'poup', '', true]
  ];
  var taxas = {};
  LINHAS.forEach(function (l) { taxas[l[0]] = l[4]; });

  function linha(l, P, dc) {
    var du = dc * 252 / 365, t = num(taxas[l[0]]) / 100, f = NaN;
    if (l[3] === 'pos' && ok(M.cdi) && ok(t)) f = Math.pow(1 + (Math.pow(1 + M.cdi, 1 / 252) - 1) * t, du);
    else if (l[3] === 'pre' && ok(t)) f = Math.pow(1 + t, du / 252);
    else if (l[3] === 'ipca' && ok(M.ipca) && ok(t)) f = Math.pow((1 + M.ipca) * (1 + t), du / 252);
    else if (l[3] === 'tselic' && ok(M.selicEfetiva)) f = Math.pow(1 + M.selicEfetiva, du / 252);
    else if (l[3] === 'poup' && ok(M.selic)) { var m = M.selic > 0.085 ? 0.005 : Math.pow(1 + M.selic * 0.7, 1 / 12) - 1; f = Math.pow(1 + m, Math.floor(dc / 30.4375 + 0.05)); }
    if (!ok(f)) return null;
    var bruto = P * (f - 1);
    var iof = l[5] ? 0 : Math.max(0, bruto) * iofPct(dc);
    var ir = l[5] ? 0 : Math.max(0, bruto - iof) * irPct(dc);
    var liq = P + bruto - iof - ir;
    return { bruto: bruto, imp: iof + ir, liq: liq, aa: Math.pow(liq / P, 365 / dc) - 1 };
  }

  function campoTaxa(l) {
    if (l[3] === 'tselic') return ok(M.selicEfetiva) ? nf(M.selicEfetiva * 100, 2) + '% a.a. (Selic efetiva)' : 'Selic efetiva indisponível';
    if (l[3] === 'poup') return 'regra';
    var suf = l[3] === 'pos' ? '% CDI' : l[3] === 'ipca' ? '% + IPCA' : '% a.a.';
    return '<input data-tx="' + l[0] + '" inputmode="decimal" value="' + taxas[l[0]] + '" aria-label="Taxa de ' + l[1] + '" placeholder="—"> ' + suf;
  }

  function desenha() {
    var P = num($('valor').value), meses = num($('prazo').value);
    var dc = Math.round(meses * 30.4375);
    document.querySelectorAll('#chips button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.m === meses)); });
    var res = LINHAS.map(function (l) { return { l: l, r: ok(P) && P > 0 && dc > 0 ? linha(l, P, dc) : null }; });
    var melhor = Math.max.apply(null, res.map(function (x) { return x.r ? x.r.liq : -Infinity; }));
    var foco = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.tx : null;
    $('linhas').innerHTML = res.map(function (x) {
      var r = x.r, l = x.l, top = r && r.liq === melhor;
      return '<tr' + (top ? ' class="top"' : '') + '><td><b>' + l[1] + '</b>' + (top ? ' (rende mais)' : '') + '<small>' + l[2] + '</small></td>'
        + '<td data-l="Taxa">' + campoTaxa(l) + '</td>'
        + '<td data-l="Rendimento bruto">' + (r ? brl(r.bruto) : '—') + '</td>'
        + '<td data-l="IR e IOF">' + (r ? (l[5] ? 'isento' : brl(r.imp)) : '—') + '</td>'
        + '<td data-l="Valor líquido" class="liq">' + (r ? brl(r.liq) : '—') + '</td>'
        + '<td data-l="Líquido ao ano">' + (r ? pct(r.aa) : '—') + '</td></tr>';
    }).join('');
    if (foco) { var el = document.querySelector('[data-tx="' + foco + '"]'); if (el) { el.focus(); var n = el.value.length; el.setSelectionRange(n, n); } }
  }

  $('valor').addEventListener('input', desenha);
  $('prazo').addEventListener('input', desenha);
  $('chips').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; $('prazo').value = b.dataset.m; desenha(); });
  $('linhas').addEventListener('input', function (e) { var id = e.target.dataset.tx; if (!id) return; taxas[id] = e.target.value; desenha(); });

  desenha();
  var indicadores = [
    ['cdi', 4389, 'm-cdi', 'CDI', '% a.a.'],
    ['selic', 432, 'm-selic', 'Selic meta', '% a.a.'],
    ['selicEfetiva', 1178, 'm-selic-efetiva', 'Selic efetiva', '% a.a.'],
    ['ipca', 13522, 'm-ipca', 'IPCA', '%']
  ];
  Promise.all(indicadores.map(function (i) {
    return serie(i[1]).then(function (r) {
      M[i[0]] = r.v / 100;
      $(i[2]).textContent = nf(r.v, 2) + i[4];
      $(i[2]).title = 'Referência: ' + r.d;
    }).catch(function () {});
  })).then(function () {
    var faltam = indicadores.filter(function (i) { return !ok(M[i[0]]); }).map(function (i) { return i[3]; });
    $('m-fonte').textContent = faltam.length === indicadores.length ? 'Banco Central fora do ar agora. Tente de novo em instantes.'
      : 'Banco Central · datas de referência nos indicadores' + (faltam.length ? ' · Indisponível: ' + faltam.join(', ') + '.' : '');
    desenha();
  });
})();
