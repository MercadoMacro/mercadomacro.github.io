/* =========================================================
   FERIADOS DA B3 E DA BOLSA DE NOVA YORK (NYSE/Nasdaq), 25/10/2026.
   Calculados pelas regras de cada bolsa, sem lista fixa por ano:
   - B3: feriados nacionais, Carnaval (segunda e terça), Sexta-feira Santa, Corpus Christi, 24/12 e 31/12.
     Na Quarta-feira de Cinzas o pregão só começa às 13h.
   - NYSE: os 10 feriados da bolsa americana, com a regra de "dia observado" (sábado passa para sexta,
     domingo para segunda; o Ano-Novo num sábado não fecha a sexta anterior).
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
  function busca(bolsa, dataIso) {
    const a = +dataIso.slice(0, 4), k = bolsa + a;
    if (!cache[k]) cache[k] = bolsa === 'b3' ? b3Ano(a) : nyseAno(a);
    return cache[k][dataIso] || null;
  }
  // data AAAA-MM-DD no fuso da bolsa
  const hojeEm = (tz, d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  window.MMFeriados = {
    // { nome, abre? } quando a data é feriado (ou abre mais tarde) naquela bolsa; null em dia normal
    b3: (dataIso) => busca('b3', dataIso),
    nyse: (dataIso) => busca('nyse', dataIso),
    hojeEm,
    // feriado com a bolsa fechada o dia todo, pela data no fuso dela
    fechado: (bolsa, d = new Date()) => { const f = busca(bolsa, hojeEm(bolsa === 'b3' ? 'America/Sao_Paulo' : 'America/New_York', d)); return f && !f.abre ? f : null; },
  };
})();
