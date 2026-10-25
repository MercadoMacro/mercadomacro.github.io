/* =========================================================
   FERIADOS DA B3 E DA BOLSA DE NOVA YORK (NYSE/Nasdaq), 25/10/2026.
   Calculados pelas regras de cada bolsa, sem lista fixa por ano:
   - B3: feriados nacionais, Carnaval (segunda e terça), Sexta-feira Santa, Corpus Christi, 24/12 e 31/12.
     Na Quarta-feira de Cinzas o pregão só começa às 13h.
   - NYSE: os 10 feriados da bolsa americana, com a regra de "dia observado" (sábado passa para sexta,
     domingo para segunda; o Ano-Novo num sábado não fecha a sexta anterior).
   - Xetra (Frankfurt, cartão Europa): Ano-Novo, Sexta-feira Santa, Segunda de Páscoa, 1º de maio, 24, 25, 26 e 31/12.
   - Bolsa de Tóquio (JPX, cartão Ásia): feriados nacionais do Japão (com equinócios, segundas móveis,
     folga quando cai no domingo e o dia "ensanduichado" entre dois feriados) mais 2, 3 e 31/12.
   - CME (cartões Juros e Commodities, futuros): fecha o dia todo no Natal, no Ano-Novo e na Sexta-feira Santa;
     nos outros feriados de Nova York para às 13h (Nova York) e volta às 18h. (25/10/2026)
   Usado pela aba Mercado, pelas pílulas B3/NYSE do topo e pelo painel da watchlist.
   Os meios-pregões dos EUA (véspera de Natal, dia seguinte ao Thanksgiving) não entram.
   ========================================================= */
(() => {
  if (window.MMFeriados) return;
  const iso = (a, m, d) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const somaDias = (a, m, d, n) => { const t = new Date(Date.UTC(a, m - 1, d + n)); return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
  // domingo de Páscoa (algoritmo de Meeus/Jones/Butcher)
  function pascoa(Y) {
    const a = Y % 19, b = Math.floor(Y / 100), c = Y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return [Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1];
  }
  const diaSemana = (a, m, d) => new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  // n-ésima segunda (ou outro dia) do mês; n = -1 é a última
  function enesimo(a, m, ds, n) {
    if (n > 0) { const p = (ds - diaSemana(a, m, 1) + 7) % 7; return iso(a, m, 1 + p + (n - 1) * 7); }
    const ult = new Date(Date.UTC(a, m, 0)).getUTCDate(); return iso(a, m, ult - ((diaSemana(a, m, ult) - ds + 7) % 7));
  }
  const cache = {};
  function b3Ano(a) {
    const [pm, pd] = pascoa(a), x = {};
    [[1, 1, 'Confraternização Universal'], [4, 21, 'Tiradentes'], [5, 1, 'Dia do Trabalho'], [9, 7, 'Independência'], [10, 12, 'Nossa Senhora Aparecida'],
      [11, 2, 'Finados'], [11, 15, 'Proclamação da República'], [11, 20, 'Consciência Negra'], [12, 24, 'Véspera de Natal'], [12, 25, 'Natal'], [12, 31, 'Último dia do ano']]
      .forEach(([m, d, n]) => { x[iso(a, m, d)] = { nome: n }; });
    x[somaDias(a, pm, pd, -48)] = { nome: 'Carnaval' };
    x[somaDias(a, pm, pd, -47)] = { nome: 'Carnaval' };
    x[somaDias(a, pm, pd, -46)] = { nome: 'Quarta-feira de Cinzas', abre: '13:00' };
    x[somaDias(a, pm, pd, -2)] = { nome: 'Sexta-feira Santa' };
    x[somaDias(a, pm, pd, 60)] = { nome: 'Corpus Christi' };
    return x;
  }
  function nyseAno(a) {
    const [pm, pd] = pascoa(a), x = {};
    // feriado de data fixa: sábado passa para sexta, domingo para segunda
    const fixo = (m, d, n, semSexta) => { const w = diaSemana(a, m, d); if (w === 6) { if (!semSexta) x[somaDias(a, m, d, -1)] = { nome: n }; } else if (w === 0) x[somaDias(a, m, d, 1)] = { nome: n }; else x[iso(a, m, d)] = { nome: n }; };
    fixo(1, 1, 'Ano-Novo', true);
    x[enesimo(a, 1, 1, 3)] = { nome: 'Martin Luther King Jr. Day' };
    x[enesimo(a, 2, 1, 3)] = { nome: "Presidents' Day" };
    x[somaDias(a, pm, pd, -2)] = { nome: 'Sexta-feira Santa' };
    x[enesimo(a, 5, 1, -1)] = { nome: 'Memorial Day' };
    fixo(6, 19, 'Juneteenth');
    fixo(7, 4, 'Independência dos EUA');
    x[enesimo(a, 9, 1, 1)] = { nome: 'Labor Day' };
    x[enesimo(a, 11, 4, 4)] = { nome: 'Thanksgiving' };
    fixo(12, 25, 'Natal');
    return x;
  }
  function xetraAno(a) {
    const [pm, pd] = pascoa(a), x = {};
    [[1, 1, 'Ano-Novo'], [5, 1, 'Dia do Trabalho'], [12, 24, 'Véspera de Natal'], [12, 25, 'Natal'], [12, 26, 'Dia de Santo Estêvão'], [12, 31, 'Véspera de Ano-Novo']]
      .forEach(([m, d, n]) => { x[iso(a, m, d)] = { nome: n }; });
    x[somaDias(a, pm, pd, -2)] = { nome: 'Sexta-feira Santa' };
    x[somaDias(a, pm, pd, 1)] = { nome: 'Segunda-feira de Páscoa' };
    return x;
  }
  // Japão: lei dos feriados nacionais (regras de 2020 em diante) e os dias de bolsa fechada da JPX
  function jpxAno(a) {
    const x = {}, nac = {};
    const p = (dIso, n) => { nac[dIso] = n; };
    const eq = (base) => Math.floor(base + 0.242194 * (a - 1980) - Math.floor((a - 1980) / 4));
    p(iso(a, 1, 1), 'Ano-Novo'); p(enesimo(a, 1, 1, 2), 'Dia da Maioridade'); p(iso(a, 2, 11), 'Fundação Nacional');
    p(iso(a, 2, 23), 'Aniversário do Imperador'); p(iso(a, 3, eq(20.8431)), 'Equinócio da primavera'); p(iso(a, 4, 29), 'Dia de Showa');
    p(iso(a, 5, 3), 'Dia da Constituição'); p(iso(a, 5, 4), 'Dia do Verde'); p(iso(a, 5, 5), 'Dia das Crianças');
    p(enesimo(a, 7, 1, 3), 'Dia do Mar'); p(iso(a, 8, 11), 'Dia da Montanha'); p(enesimo(a, 9, 1, 3), 'Dia do Respeito aos Idosos');
    p(iso(a, 9, eq(23.2488)), 'Equinócio de outono'); p(enesimo(a, 10, 1, 2), 'Dia do Esporte'); p(iso(a, 11, 3), 'Dia da Cultura');
    p(iso(a, 11, 23), 'Dia de Ação de Graças ao Trabalho');
    const ds = (dIso) => new Date(dIso + 'T00:00:00Z').getUTCDay();
    const mais = (dIso, n) => somaDias(+dIso.slice(0, 4), +dIso.slice(5, 7), +dIso.slice(8, 10), n);
    // dia comum entre dois feriados também é feriado
    Object.keys(nac).forEach((d) => { const m = mais(d, 1), m2 = mais(d, 2); if (!nac[m] && nac[m2] && ds(m) !== 0) nac[m] = 'Feriado nacional'; });
    // feriado no domingo: folga no próximo dia que não for feriado
    Object.keys(nac).sort().forEach((d) => { if (ds(d) === 0) { let f = mais(d, 1); while (nac[f]) f = mais(f, 1); nac[f] = 'Feriado compensado'; } });
    Object.entries(nac).forEach(([d, n]) => { if (d.startsWith(a + '-')) x[d] = { nome: n }; });
    [[1, 2], [1, 3], [12, 31]].forEach(([m, d]) => { const k = iso(a, m, d); if (!x[k]) x[k] = { nome: 'Recesso de fim de ano da bolsa' }; });
    return x;
  }
  const FAZ = { b3: b3Ano, nyse: nyseAno, xetra: xetraAno, jpx: jpxAno };
  function busca(bolsa, dataIso) {
    const a = +dataIso.slice(0, 4), k = bolsa + a;
    if (!cache[k]) cache[k] = FAZ[bolsa](a);
    return cache[k][dataIso] || null;
  }
  // data AAAA-MM-DD no fuso da bolsa
  const hojeEm = (tz, d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  window.MMFeriados = {
    // { nome, abre? } quando a data é feriado (ou abre mais tarde) naquela bolsa; null em dia normal
    b3: (dataIso) => busca('b3', dataIso),
    nyse: (dataIso) => busca('nyse', dataIso),
    xetra: (dataIso) => busca('xetra', dataIso),
    jpx: (dataIso) => busca('jpx', dataIso),
    // CME: { nome, fechado: true } no Natal, Ano-Novo e Sexta-feira Santa; { nome, ate: '13:00' } nos outros feriados de Nova York
    cme: (dataIso) => { const f = busca('nyse', dataIso); if (!f) return null; return /Natal|Ano-Novo|Sexta-feira Santa/.test(f.nome) ? { nome: f.nome, fechado: true } : { nome: f.nome, ate: '13:00' }; },
    hojeEm,
    // feriado com a bolsa fechada o dia todo, pela data no fuso dela
    fechado: (bolsa, d = new Date()) => { const f = busca(bolsa, hojeEm({ b3: 'America/Sao_Paulo', nyse: 'America/New_York', xetra: 'Europe/Berlin', jpx: 'Asia/Tokyo' }[bolsa], d)); return f && !f.abre ? f : null; },
  };
})();
