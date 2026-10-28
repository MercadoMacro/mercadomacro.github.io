/* =========================================================
   INDICADORES ECONÔMICOS (aba Indicadores)
   Arquivo separado do index.html: só é baixado quando a aba é aberta.
   Fontes: BCB/SGS (direto), FRED, Tesouro Direto e CDS pelo worker de cotações.
   O bloco "IBGE em detalhe" (área Brasil) fica no ibge.js.
   Regra do painel: nada de número inventado; se a fonte falhar, mostra "—".
   ========================================================= */
(() => {
  if (window.__indicadoresLoaded) return;
  window.__indicadoresLoaded = true;

  const PROXY = (typeof CORS_PROXY !== 'undefined' && CORS_PROXY) || 'https://shrill-meadow-89c1.danilo-nillo.workers.dev';
  const OLD_WORKER = 'https://fred-proxy.cota-cotacao10.workers.dev'; // worker da página antiga: só reserva
  // Banco Central: primeiro pelo worker, depois direto
  const bcbW = (u) => { const m = String(u).match(/bcdata\.sgs\.(\d+)\/dados(.*)$/); return m ? `${PROXY}/bcb?c=${m[1]}&q=${encodeURIComponent(m[2])}` : u; };
  const bcbGet = (u, ms) => getJSON(bcbW(u), ms).catch(() => getJSON(u, ms));
  const CACHE_KEY = 'ind_cache_v1';
  const PREF_KEY = 'ind_prefs_v1';
  const TTL = 4 * 3600 * 1000;
  const DAY = 86400000;

  const root = document.getElementById('ind-root');
  if (!root) return;

  /* ---------------- utilidades ---------------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = (v, d = 2) => (v == null || !isFinite(v)) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sign = (v, d = 2) => {
    if (v == null || !isFinite(v)) return '—';
    const t = nf(Math.abs(v), d);
    return (/[1-9]/.test(t) ? (v > 0 ? '+' : '−') : '') + t; // "−0,0" vira "0,0"
  };
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const fmtDate = (t, kind) => {
    const d = new Date(t);
    const dd = String(d.getUTCDate()).padStart(2, '0'), mm = d.getUTCMonth(), yy = d.getUTCFullYear();
    if (kind === 'y') return String(yy);
    if (kind === 'q') return `${Math.floor(mm / 3) + 1}º tri/${yy}`;
    if (kind === 'm') return `${MES[mm]}/${yy}`;
    return `${dd}/${String(mm + 1).padStart(2, '0')}/${yy}`;
  };
  const ddmmyyyy = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const parseBR = (s) => { const [d, m, y] = s.split('/').map(Number); return Date.UTC(y, m - 1, d); };
  const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };

  async function getJSON(url, ms = 15000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) throw new Error((j && j.error) || `HTTP ${r.status}`);
      if (j.error) throw new Error(j.error);
      return j;
    } finally { clearTimeout(t); }
  }

  // Pacote do worker (/ind/bundle): todas as séries de um grupo numa chamada só, já em cache na borda.
  // Se o pacote não vier (worker antigo, fora do ar), cada série é buscada direto na fonte, como antes.
  const bmap = new Map(), bundleP = {};
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function bundle(g, force = false) {
    const b = bundleP[g];
    if (b && !force && Date.now() - b.t < 10 * 60 * 1000) return b.p;
    const p = getJSON(`${PROXY}/ind/bundle?g=${g}`, 20000)
      .then((j) => { Object.entries(j.data || {}).forEach(([k, v]) => { if (Array.isArray(v) && v.length) bmap.set(k, v.map(([d, x]) => [d * DAY, x])); }); return true; })
      .catch(() => false);
    bundleP[g] = { p, t: Date.now() };
    return p;
  }
  const fromBundle = (k) => { const v = bmap.get(k); return v ? v.slice() : null; };

  // BCB/SGS: série completa num intervalo (séries diárias aceitam no máximo 10 anos por consulta)
  async function bcb(code, days) {
    const hit = fromBundle(`bcb:${code}:${days || 0}`);
    if (hit) return hit;
    const end = new Date();
    let url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json`;
    if (days) { const ini = new Date(end.getTime() - days * DAY); url += `&dataInicial=${ddmmyyyy(ini)}&dataFinal=${ddmmyyyy(end)}`; }
    const j = await bcbGet(url, 20000);
    if (!Array.isArray(j)) throw new Error('Resposta inválida do BCB');
    return j.map((o) => [parseBR(o.data), parseFloat(o.valor)]).filter((p) => isFinite(p[1]));
  }

  // FRED: worker de cotações (chave fica no worker); se falhar, tenta o worker antigo
  async function fred(id, { units = 'lin', frequency = '', limit = 1000 } = {}) {
    const hit = fromBundle(`fred:${id}:${units}:${frequency}:${limit}`);
    if (hit) return hit;
    try {
      const j = await getJSON(`${PROXY}/fred/series?id=${id}&units=${units}&limit=${limit}${frequency ? '&frequency=' + frequency : ''}`);
      return j.obs.map(([d, v]) => [parseISO(d), v]).reverse();
    } catch (e1) {
      const p = new URLSearchParams({ series: id, units, limit, sort_order: 'desc' });
      if (frequency) p.set('frequency', frequency);
      const j = await getJSON(`${OLD_WORKER}/fred?${p}`).catch(() => { throw e1; });
      return (j.observations || []).filter((o) => o.value !== '.').map((o) => [parseISO(o.date), parseFloat(o.value)]).reverse();
    }
  }

  async function tesouro() {
    try { return (await getJSON(`${PROXY}/tesouro`)).titulos; }
    catch (e1) {
      // reserva: CSV pelo worker antigo
      const target = 'https://www.tesourodireto.com.br/documents/d/guest/rendimento-investir-csv?download=true';
      const r = await fetch(`${OLD_WORKER}/?url=${encodeURIComponent(target)}`).catch(() => { throw e1; });
      if (!r.ok) throw e1;
      const num = (t) => { const m = String(t || '').match(/-?[\d.]*,?\d+/); return m ? parseFloat(m[0].replace(/\./g, '').replace(',', '.')) : null; };
      // colunas pelo cabeçalho (o Tesouro incluiu "Investimento mínimo" em out/2026)
      const linhas = (await r.text()).split(/\r?\n/).map((l) => l.split(';').map((x) => x.replace(/^\uFEFF/, '').trim()));
      const cab = linhas.find((c) => c.some((x) => /vencimento/i.test(x))) || [];
      const col = (re, padrao) => { const i = cab.findIndex((x) => re.test(x)); return i >= 0 ? i : padrao; };
      const iTaxa = col(/rendimento|taxa/i, 1), iPU = col(/pre[çc]o unit/i, 2), iVenc = col(/vencimento/i, 3);
      const DATA = /^\d{2}\/\d{2}\/\d{4}$/;
      const out = linhas
        .filter((c) => c.length >= 4 && /^tesouro/i.test(c[0]))
        .map((c) => ({ nome: c[0], taxa: num(c[iTaxa]), pu: num(c[iPU]), vencimento: DATA.test(c[iVenc] || '') ? c[iVenc] : (c.find((x) => DATA.test(x)) || null) }))
        .filter((t) => t.taxa !== null);
      if (!out.length) throw e1;
      return out;
    }
  }

  // séries derivadas
  const yoy = (s, lag = 12) => s.slice(lag).map((p, i) => [p[0], (p[1] / s[i][1] - 1) * 100]);
  const pop = (s) => s.slice(1).map((p, i) => [p[0], (p[1] / s[i][1] - 1) * 100]);
  const acc12 = (s) => s.slice(11).map((p, i) => [p[0], (s.slice(i, i + 12).reduce((a, q) => a * (1 + q[1] / 100), 1) - 1) * 100]);
  const ytd = (s) => { const last = s[s.length - 1]; if (!last) return null; const y = new Date(last[0]).getUTCFullYear(); return (s.filter((p) => new Date(p[0]).getUTCFullYear() === y).reduce((a, q) => a * (1 + q[1] / 100), 1) - 1) * 100; };
  const last = (s, k = 1) => (s && s.length >= k ? s[s.length - k] : null);
  // última mudança de patamar (Selic, meta do Fed)
  const lastChange = (s) => { for (let i = s.length - 1; i > 0; i--) if (Math.abs(s[i][1] - s[i - 1][1]) > 1e-9) return { t: s[i][0], d: s[i][1] - s[i - 1][1] }; return null; };
  // compacta série em degraus: só os pontos onde o valor muda (+ o último)
  const steps = (s) => s.filter((p, i) => i === 0 || i === s.length - 1 || p[1] !== s[i - 1][1]);

  /* ---------------- definição dos indicadores ---------------- */
  const P_DAILY = [['3M', 92], ['1A', 365], ['5A', 1826]];
  const P_DAILY10 = [['1A', 365], ['5A', 1826], ['10A', 3652]];
  const P_MONTH = [['1A', 366], ['3A', 1096], ['10A', 3653]];
  const P_FRED_D = [['1A', 365], ['3A', 1096], ['Máx', 0]];
  const P_FRED_M = [['1A', 366], ['5A', 1827], ['Máx', 0]];
  const P_YEAR = [['10A', 3653], ['20A', 7305], ['Máx', 0]];

  const inflBR = (code, nome, info) => ({
    id: 'br-' + code, area: 'br', grp: 'Inflação', nome, src: `BCB · SGS ${code}`, info, dk: 'm', periods: P_MONTH, pi: 1,
    variants: [['12m', '12 meses'], ['m', 'Mensal']],
    load: async () => ({ m: await bcb(code, 11 * 366) }),
    view: (r, v) => {
      const a12 = acc12(r.m);
      const cur = last(a12), prev = last(a12, 2), mes = last(r.m);
      return {
        value: nf(cur?.[1]), unit: '% em 12 meses', date: mes && fmtDate(mes[0], 'm'),
        delta: cur && prev ? { v: cur[1] - prev[1], txt: `${sign(cur[1] - prev[1])} p.p. vs. mês anterior`, bad: true } : null,
        subs: [['No mês', nf(mes?.[1]) + '%'], ['No ano', nf(ytd(r.m)) + '%']],
        series: v === 'm' ? r.m : a12, unitS: '%'
      };
    }
  });

  const fredInfl = (id, nome, info) => ({
    id: 'us-' + id, area: 'us', grp: 'Inflação', nome, src: `FRED · ${id}`, info, dk: 'm', periods: P_FRED_M, pi: 1,
    variants: [['12m', '12 meses'], ['m', 'Mensal']],
    load: async () => ({ s: await fred(id, { frequency: 'm', limit: 420 }) }),
    view: (r, v) => {
      const a = yoy(r.s), m = pop(r.s);
      const cur = last(a), prev = last(a, 2);
      return {
        value: nf(cur?.[1]), unit: '% em 12 meses', date: cur && fmtDate(cur[0], 'm'),
        delta: cur && prev ? { v: cur[1] - prev[1], txt: `${sign(cur[1] - prev[1])} p.p. vs. mês anterior`, bad: true } : null,
        subs: [['No mês', nf(last(m)?.[1]) + '%']],
        series: v === 'm' ? m : a, unitS: '%'
      };
    }
  });

  const fredDaily = (id, nome, grp, info, extra = {}) => ({
    id: 'us-' + id, area: 'us', grp, nome, src: `FRED · ${id}`, info, dk: 'd', periods: P_FRED_D, pi: 1,
    load: async () => ({ s: await fred(id, { limit: 1100 }) }),
    view: (r) => {
      const cur = last(r.s), prev = last(r.s, 2);
      return {
        value: nf(cur?.[1]), unit: extra.unit || '%', date: cur && fmtDate(cur[0], 'd'),
        delta: cur && prev ? { v: cur[1] - prev[1], txt: `${sign((cur[1] - prev[1]) * 100, 0)} bp no dia`, bad: null } : null,
        subs: extra.subs ? extra.subs(r) : [], series: r.s, unitS: extra.unit || '%', zero: extra.zero
      };
    }
  });

  const DEFS = [
    /* ---------- BRASIL ---------- */
    {
      id: 'br-selic', area: 'br', grp: 'Juros', nome: 'Selic meta', src: 'BCB · SGS 432', dk: 'd', periods: P_DAILY10, pi: 1, step: true,
      info: 'Taxa básica de juros da economia, definida pelo Copom a cada 45 dias. Serve de piso para o custo do dinheiro no país e influencia todas as outras taxas.',
      load: async () => ({ s: steps(await bcb(432, 3650)) }),
      view: (r) => {
        const cur = last(r.s), ch = lastChange(r.s);
        return {
          value: nf(cur?.[1]), unit: '% a.a.', date: cur && fmtDate(cur[0], 'd'),
          delta: ch ? { v: ch.d, txt: `${sign(ch.d)} p.p. em ${fmtDate(ch.t, 'd')}`, bad: null } : null,
          subs: [], series: r.s, unitS: '%'
        };
      }
    },
    {
      id: 'br-cdi', area: 'br', grp: 'Juros', nome: 'CDI', src: 'BCB · SGS 12', dk: 'd', periods: P_DAILY, pi: 1,
      info: 'Taxa dos empréstimos de um dia entre bancos. É a referência da renda fixa ("100% do CDI"). A taxa anual é a diária composta por 252 dias úteis.',
      load: async () => ({ s: await bcb(12, 1830) }),
      view: (r) => {
        const an = r.s.map(([t, d]) => [t, (Math.pow(1 + d / 100, 252) - 1) * 100]);
        const cur = last(an), prev = last(an, 2);
        return {
          value: nf(cur?.[1]), unit: '% a.a.', date: cur && fmtDate(cur[0], 'd'),
          delta: cur && prev && Math.abs(cur[1] - prev[1]) > 1e-6 ? { v: cur[1] - prev[1], txt: `${sign(cur[1] - prev[1])} p.p. vs. dia anterior`, bad: null } : null,
          subs: [['Taxa diária', nf(last(r.s)?.[1], 6) + '%']], series: an, unitS: '%'
        };
      }
    },
    {
      id: 'br-poup', area: 'br', grp: 'Juros', nome: 'Poupança', src: 'BCB · SGS 195', dk: 'd', periods: P_DAILY, pi: 1,
      info: 'Rende TR + 0,5% ao mês quando a Selic está acima de 8,5% a.a.; abaixo disso, TR + 70% da Selic. Isenta de IR para pessoa física. O valor é a rentabilidade do último período mensal.',
      load: async () => ({ s: await bcb(195, 1830) }),
      view: (r) => {
        const cur = last(r.s);
        return {
          value: nf(cur?.[1], 4), unit: '% no mês', date: cur && fmtDate(cur[0], 'd'),
          subs: [['Ao ano', cur ? nf((Math.pow(1 + cur[1] / 100, 12) - 1) * 100) + '%' : '—']], series: r.s, unitS: '%'
        };
      }
    },
    inflBR(433, 'IPCA', 'Inflação oficial do Brasil, medida pelo IBGE. É o índice da meta de inflação perseguida pelo Banco Central.'),
    inflBR(7478, 'IPCA-15', 'Prévia do IPCA: coleta do dia 16 do mês anterior ao dia 15 do mês de referência. Antecipa a tendência da inflação oficial.'),
    inflBR(188, 'INPC', 'Inflação das famílias com renda de 1 a 5 salários mínimos. Muito usado em reajustes salariais e do salário mínimo.'),
    inflBR(189, 'IGP-M', 'Índice da FGV com peso grande de preços no atacado. Conhecido como "inflação do aluguel", reajusta contratos de locação e tarifas.'),
    inflBR(190, 'IGP-DI', 'Mesma cesta do IGP-M com período de coleta no mês cheio. Mede de matérias-primas a bens finais.'),
    {
      id: 'br-dolar', area: 'br', grp: 'Câmbio', nome: 'Dólar PTAX', src: 'BCB · SGS 1 e 10813', dk: 'd', periods: P_DAILY, pi: 1,
      info: 'Taxa de câmbio de referência calculada pelo Banco Central com a média das operações do dia no interbancário. Usada em contratos e na liquidação de derivativos.',
      load: async () => ({ v: await bcb(10813, 1830), c: await bcb(1, 15) }),
      view: (r) => {
        const cur = last(r.v), prev = last(r.v, 2);
        return {
          value: 'R$ ' + nf(cur?.[1], 4), unit: 'venda', date: cur && fmtDate(cur[0], 'd'),
          delta: cur && prev ? { v: cur[1] - prev[1], txt: `${sign((cur[1] / prev[1] - 1) * 100)}% vs. dia anterior` } : null,
          subs: [['Compra', 'R$ ' + nf(last(r.c)?.[1], 4)]], series: r.v, unitS: 'R$'
        };
      }
    },
    {
      id: 'br-euro', area: 'br', grp: 'Câmbio', nome: 'Euro PTAX', src: 'BCB · SGS 21619 e 21620', dk: 'd', periods: P_DAILY, pi: 1,
      info: 'Cotação de referência do euro em reais, apurada pelo Banco Central a partir das operações do dia.',
      load: async () => ({ v: await bcb(21620, 1830), c: await bcb(21619, 15) }),
      view: (r) => {
        const cur = last(r.v), prev = last(r.v, 2);
        return {
          value: 'R$ ' + nf(cur?.[1], 4), unit: 'venda', date: cur && fmtDate(cur[0], 'd'),
          delta: cur && prev ? { v: cur[1] - prev[1], txt: `${sign((cur[1] / prev[1] - 1) * 100)}% vs. dia anterior` } : null,
          subs: [['Compra', 'R$ ' + nf(last(r.c)?.[1], 4)]], series: r.v, unitS: 'R$'
        };
      }
    },
    {
      id: 'br-desemp', area: 'br', grp: 'Atividade', nome: 'Desemprego', src: 'IBGE/PNAD · SGS 24369', dk: 'm', periods: P_MONTH, pi: 1,
      info: 'Taxa de desocupação da PNAD Contínua (IBGE): parcela da força de trabalho que procura emprego. Cada ponto é um trimestre móvel.',
      load: async () => ({ s: await bcb(24369, 11 * 366) }),
      view: (r) => {
        const cur = last(r.s), prev = last(r.s, 2), ano = r.s.find((p) => cur && p[0] >= cur[0] - 366 * DAY);
        return {
          value: nf(cur?.[1], 1), unit: '%', date: cur && fmtDate(cur[0], 'm'),
          delta: cur && prev ? { v: cur[1] - prev[1], txt: `${sign(cur[1] - prev[1], 1)} p.p. vs. mês anterior`, bad: true } : null,
          subs: ano ? [['Há 1 ano', nf(ano[1], 1) + '%']] : [], series: r.s, unitS: '%'
        };
      }
    },
    {
      id: 'br-pib', area: 'br', grp: 'Atividade', nome: 'PIB', src: 'IBGE · SGS 7326 e 1208', dk: 'y', periods: P_YEAR, pi: 2,
      info: 'Crescimento real do PIB no ano (descontada a inflação) e o valor do PIB a preços correntes.',
      load: async () => ({ g: await bcb(7326), n: await bcb(1208).catch(() => []) }),
      view: (r) => {
        const cur = last(r.g), prev = last(r.g, 2), n = last(r.n);
        // a série 1208 vem em R$ milhões; se vier em reais, a escala se ajusta
        const tri = n ? (n[1] > 1e9 ? n[1] / 1e12 : n[1] / 1e6) : null;
        return {
          value: sign(cur?.[1], 1), unit: '% no ano', date: cur && fmtDate(cur[0], 'y'),
          delta: cur && prev ? { v: cur[1] - prev[1], txt: `ano anterior: ${sign(prev[1], 1)}%` } : null,
          subs: tri ? [['PIB ' + fmtDate(n[0], 'y'), 'R$ ' + nf(tri, 2) + ' tri']] : [], series: r.g, unitS: '%', zero: true, bars: true
        };
      }
    },
    {
      id: 'br-cds', area: 'br', grp: 'Risco', nome: 'CDS Brasil 5 anos', src: 'Investing.com', dk: 'd', noChart: true,
      info: 'Custo do seguro contra calote da dívida brasileira em 5 anos, em pontos-base. Quanto maior, maior o risco-país percebido pelo mercado. Sem histórico gratuito confiável, o card mostra só o valor do dia.',
      load: async () => ({ x: await getJSON(`${PROXY}/cds`) }),
      view: (r) => ({
        value: nf(r.x?.valor, 2), unit: 'pontos', date: r.x?.ts ? fmtDate(r.x.ts, 'd') : '',
        delta: r.x?.variacao != null ? { v: r.x.variacao, txt: `${sign(r.x.variacao)}% no dia`, bad: true } : null, subs: []
      })
    },
    {
      id: 'br-tesouro', area: 'br', grp: 'Tesouro Direto', nome: 'Títulos à venda', src: 'Tesouro Direto · CSV oficial', wide: true, noChart: true, table: true,
      info: 'Taxas e preços dos títulos públicos disponíveis para compra no Tesouro Direto, do arquivo oficial publicado pelo Tesouro.',
      load: async () => ({ t: await tesouro() }),
      view: (r) => ({ table: r.t })
    },

    /* ---------- EUA ---------- */
    {
      id: 'us-fedtarget', area: 'us', grp: 'Juros', nome: 'Meta do Fed', src: 'FRED · DFEDTARL / DFEDTARU', dk: 'd', periods: P_FRED_D, pi: 2, step: true,
      info: 'Intervalo da taxa básica dos EUA definido pelo Fomc (piso e teto). O gráfico mostra o teto da meta.',
      load: async () => ({ u: steps(await fred('DFEDTARU', { limit: 2500 })), l: steps(await fred('DFEDTARL', { limit: 2500 })) }),
      view: (r) => {
        const u = last(r.u), l = last(r.l), ch = lastChange(r.u);
        return {
          value: u && l ? `${nf(l[1])}–${nf(u[1])}` : '—', unit: '%', date: u && fmtDate(u[0], 'd'),
          delta: ch ? { v: ch.d, txt: `${sign(ch.d * 100, 0)} bp em ${fmtDate(ch.t, 'd')}`, bad: null } : null,
          subs: [], series: r.u, unitS: '%'
        };
      }
    },
    {
      id: 'us-fedfunds', area: 'us', grp: 'Juros', nome: 'Fed Funds efetiva', src: 'FRED · FEDFUNDS', dk: 'm', periods: P_FRED_M, pi: 1,
      info: 'Taxa média efetivamente praticada entre bancos nos EUA no mês. Fica dentro do intervalo da meta do Fed.',
      load: async () => ({ s: await fred('FEDFUNDS', { limit: 420 }) }),
      view: (r) => {
        const cur = last(r.s), prev = last(r.s, 2);
        return {
          value: nf(cur?.[1]), unit: '%', date: cur && fmtDate(cur[0], 'm'),
          delta: cur && prev ? { v: cur[1] - prev[1], txt: `${sign((cur[1] - prev[1]) * 100, 0)} bp vs. mês anterior`, bad: null } : null,
          subs: [], series: r.s, unitS: '%'
        };
      }
    },
    {
      id: 'us-treasuries', area: 'us', grp: 'Juros', nome: 'Treasuries', src: 'FRED · DGS2 / DGS10 / DGS30', dk: 'd', periods: P_FRED_D, pi: 1,
      variants: [['2', '2 anos'], ['10', '10 anos'], ['30', '30 anos']], vi: 1,
      info: 'Rendimento dos títulos do Tesouro americano. É a referência do custo do dinheiro no mundo; o de 10 anos é o mais acompanhado.',
      load: async () => ({ 2: await fred('DGS2', { limit: 1100 }), 10: await fred('DGS10', { limit: 1100 }), 30: await fred('DGS30', { limit: 1100 }) }),
      view: (r, v) => {
        const s = r[v] || [], cur = last(s), prev = last(s, 2);
        return {
          value: nf(cur?.[1]), unit: `% (${v} anos)`, date: cur && fmtDate(cur[0], 'd'),
          delta: cur && prev ? { v: cur[1] - prev[1], txt: `${sign((cur[1] - prev[1]) * 100, 0)} bp no dia`, bad: null } : null,
          subs: ['2', '10', '30'].filter((k) => k !== v).map((k) => [k + ' anos', nf(last(r[k])?.[1]) + '%']), series: s, unitS: '%'
        };
      }
    },
    fredDaily('T10Y2Y', 'Curva 10 anos − 2 anos', 'Juros',
      'Diferença entre os juros de 10 e de 2 anos. Abaixo de zero (curva invertida) costuma antecipar desaceleração e recessão.',
      { unit: 'p.p.', zero: true, subs: (r) => { const c = last(r.s); return c ? [['Situação', c[1] < 0 ? 'Invertida' : 'Positiva']] : []; } }),
    fredDaily('T5YIE', 'Inflação implícita 5 anos', 'Inflação',
      'Expectativa de inflação do mercado para os próximos 5 anos, pela diferença entre o Treasury de 5 anos e o título indexado (TIPS).'),
    fredInfl('CPIAUCSL', 'CPI', 'Inflação ao consumidor dos EUA (BLS). Principal índice de preços acompanhado pelo mercado.'),
    fredInfl('CPILFESL', 'Core CPI', 'CPI sem alimentos e energia, que são os itens mais voláteis. Mostra a tendência da inflação.'),
    fredInfl('PCEPI', 'PCE', 'Inflação de todos os gastos de consumo. É o índice que o Fed usa na sua meta de 2%.'),
    fredInfl('PCEPILFE', 'Core PCE', 'PCE sem alimentos e energia. A medida de inflação preferida do Fed para decidir os juros.'),
    {
      id: 'us-gdp', area: 'us', grp: 'Atividade', nome: 'PIB real', src: 'FRED · GDPC1', dk: 'q', periods: P_FRED_M, pi: 1,
      variants: [['saar', 'Anualizado'], ['yoy', 'Anual']],
      info: 'Crescimento do PIB dos EUA descontada a inflação. "Anualizado" é o trimestre contra o anterior projetado para 12 meses (o número divulgado); "Anual" compara com o mesmo trimestre do ano anterior.',
      load: async () => ({ s: await fred('GDPC1', { limit: 220 }), n: await fred('GDP', { limit: 8 }).catch(() => []) }),
      view: (r, v) => {
        const saar = r.s.slice(1).map((p, i) => [p[0], (Math.pow(p[1] / r.s[i][1], 4) - 1) * 100]);
        const a = yoy(r.s, 4), cur = last(saar), n = last(r.n);
        return {
          value: sign(cur?.[1], 1), unit: '% anualizado', date: cur && fmtDate(cur[0], 'q'),
          delta: last(saar, 2) ? { v: cur[1] - last(saar, 2)[1], txt: `tri anterior: ${sign(last(saar, 2)[1], 1)}%` } : null,
          subs: [['Anual', sign(last(a)?.[1], 1) + '%'], ...(n ? [['PIB nominal', 'US$ ' + nf(n[1] / 1000, 2) + ' tri']] : [])],
          series: v === 'yoy' ? a : saar, unitS: '%', zero: true, bars: true
        };
      }
    },
    {
      id: 'us-unrate', area: 'us', grp: 'Atividade', nome: 'Desemprego', src: 'FRED · UNRATE', dk: 'm', periods: P_FRED_M, pi: 1,
      info: 'Taxa de desemprego dos EUA (BLS), divulgada junto com o payroll na primeira sexta-feira do mês.',
      load: async () => ({ s: await fred('UNRATE', { limit: 420 }) }),
      view: (r) => {
        const cur = last(r.s), prev = last(r.s, 2);
        return {
          value: nf(cur?.[1], 1), unit: '%', date: cur && fmtDate(cur[0], 'm'),
          delta: cur && prev ? { v: cur[1] - prev[1], txt: `${sign(cur[1] - prev[1], 1)} p.p. vs. mês anterior`, bad: true } : null,
          subs: [], series: r.s, unitS: '%'
        };
      }
    },
    {
      id: 'us-payroll', area: 'us', grp: 'Atividade', nome: 'Payroll', src: 'FRED · PAYEMS', dk: 'm', periods: P_FRED_M, pi: 0,
      info: 'Vagas de trabalho criadas (ou fechadas) fora do setor agrícola no mês, em milhares. Um dos dados que mais mexem com o mercado.',
      load: async () => ({ s: await fred('PAYEMS', { units: 'chg', limit: 420 }) }),
      view: (r) => {
        const cur = last(r.s), m3 = r.s.slice(-3);
        return {
          value: cur ? (cur[1] > 0 ? '+' : '') + nf(cur[1], 0) : '—', unit: 'mil vagas', date: cur && fmtDate(cur[0], 'm'),
          subs: m3.length === 3 ? [['Média 3 meses', nf(m3.reduce((a, p) => a + p[1], 0) / 3, 0) + ' mil']] : [], series: r.s, unitS: ' mil', zero: true, bars: true
        };
      }
    },
    {
      id: 'us-indpro', area: 'us', grp: 'Atividade', nome: 'Produção industrial', src: 'FRED · INDPRO', dk: 'm', periods: P_FRED_M, pi: 1,
      info: 'Produção de fábricas, minas e serviços de utilidade pública dos EUA, comparada com o mesmo mês do ano anterior.',
      load: async () => ({ s: await fred('INDPRO', { units: 'pc1', limit: 420 }) }),
      view: (r) => {
        const cur = last(r.s), prev = last(r.s, 2);
        return {
          value: sign(cur?.[1]), unit: '% em 12 meses', date: cur && fmtDate(cur[0], 'm'),
          delta: cur && prev ? { v: cur[1] - prev[1], txt: `${sign(cur[1] - prev[1])} p.p. vs. mês anterior` } : null,
          subs: [], series: r.s, unitS: '%', zero: true
        };
      }
    },
    {
      id: 'us-sentiment', area: 'us', grp: 'Atividade', nome: 'Confiança do consumidor', src: 'FRED · UMCSENT', dk: 'm', periods: P_FRED_M, pi: 1,
      info: 'Índice de sentimento do consumidor da Universidade de Michigan. Antecipa o ritmo do consumo, que é cerca de 70% do PIB americano.',
      load: async () => ({ s: await fred('UMCSENT', { limit: 420 }) }),
      view: (r) => {
        const cur = last(r.s), prev = last(r.s, 2);
        return {
          value: nf(cur?.[1], 1), unit: 'pontos', date: cur && fmtDate(cur[0], 'm'),
          delta: cur && prev ? { v: cur[1] - prev[1], txt: `${sign(cur[1] - prev[1], 1)} vs. mês anterior` } : null,
          subs: [], series: r.s, unitS: ''
        };
      }
    },
    // balança comercial dos EUA (Census/BEA via FRED, US$ milhões por mês, com ajuste sazonal)
    {
      id: 'us-tradebal', area: 'us', grp: 'Balança comercial', nome: 'Saldo comercial', src: 'FRED · BOPGSTB', dk: 'm', periods: P_FRED_M, pi: 1,
      info: 'Exportações menos importações de bens e serviços dos EUA no mês (Census e BEA), com ajuste sazonal. Negativo quer dizer déficit.',
      load: async () => ({ s: (await fred('BOPGSTB', { limit: 420 })).map(([t, v]) => [t, v / 1000]) }),
      view: (r) => {
        const cur = last(r.s), prev = last(r.s, 2);
        const ano = cur ? r.s.filter(([t]) => new Date(t).getUTCFullYear() === new Date(cur[0]).getUTCFullYear()) : [];
        return {
          value: cur ? (cur[1] >= 0 ? '+' : '−') + nf(Math.abs(cur[1]), 1) : '—', unit: 'US$ bi', date: cur && fmtDate(cur[0], 'm'),
          delta: cur && prev ? { v: cur[1] - prev[1], txt: `${sign(cur[1] - prev[1], 1)} bi vs. mês anterior` } : null,
          subs: ano.length ? [['No ano', ((t) => (t >= 0 ? '+' : '−') + 'US$ ' + nf(Math.abs(t), 1) + ' bi')(ano.reduce((a, p) => a + p[1], 0))]] : [], series: r.s, unitS: ' bi', zero: true, bars: true
        };
      }
    },
    ...[['BOPTEXP', 'Exportações', 'Vendas de bens e serviços dos EUA para o exterior no mês (Census e BEA), com ajuste sazonal.'],
      ['BOPTIMP', 'Importações', 'Compras de bens e serviços do exterior pelos EUA no mês (Census e BEA), com ajuste sazonal.']].map(([id, nome, info]) => ({
      id: 'us-' + id.toLowerCase(), area: 'us', grp: 'Balança comercial', nome, src: `FRED · ${id}`, info, dk: 'm', periods: P_FRED_M, pi: 1,
      load: async () => ({ s: (await fred(id, { limit: 420 })).map(([t, v]) => [t, v / 1000]) }),
      view: (r) => {
        const cur = last(r.s), a12 = r.s.length > 12 ? r.s[r.s.length - 13] : null;
        const yoy = cur && a12 && a12[1] ? (cur[1] / a12[1] - 1) * 100 : null;
        return {
          value: cur ? nf(cur[1], 1) : '—', unit: 'US$ bi', date: cur && fmtDate(cur[0], 'm'),
          delta: yoy != null ? { v: yoy, txt: `${sign(yoy, 1)}% vs. mesmo mês do ano anterior` } : null,
          subs: [], series: r.s, unitS: ' bi'
        };
      }
    }))
  ];

  const GROUP_ICON = { 'Juros': 'fa-percentage', 'Inflação': 'fa-fire', 'Câmbio': 'fa-exchange-alt', 'Atividade': 'fa-industry', 'Risco': 'fa-shield-alt', 'Tesouro Direto': 'fa-landmark', 'Balança comercial': 'fa-ship' };

  /* ---------------- estado e cache ---------------- */
  let prefs = { area: 'br', per: {}, var: {} };
  try { prefs = { ...prefs, ...(JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}) }; } catch (e) { /* padrão */ }
  const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* silencioso */ } };

  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { cache = {}; }
  const saveCache = () => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }
    catch (e) { cache = {}; try { localStorage.removeItem(CACHE_KEY); } catch (e2) { /* sem espaço */ } }
  };
  // reduz o tamanho no cache: datas em dias e valores com 5 casas
  const pack = (raw) => JSON.parse(JSON.stringify(raw, (k, v) => (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && v[0] > 1e11 ? [Math.round(v[0] / DAY), Math.round(v[1] * 1e5) / 1e5] : v)));
  const unpack = (raw) => JSON.parse(JSON.stringify(raw), (k, v) => (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && v[0] < 1e6 && v[0] > 1000 && typeof v[1] === 'number' ? [v[0] * DAY, v[1]] : v));

  const state = {}; // id -> { st: 'loading'|'ok'|'err', raw, err }
  DEFS.forEach((d) => {
    const c = cache[d.id];
    state[d.id] = c && c.raw ? { st: 'ok', raw: unpack(c.raw), ts: c.ts } : { st: 'loading' };
  });

  /* ---------------- Boletim Focus (expectativas do mercado, BCB) ---------------- */
  const OLINDA = 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/';
  const olinda = (ep, filtro, campos) => `${OLINDA}${ep}?$top=1500&$format=json&$orderby=Data%20desc&$select=${campos}&$filter=${encodeURIComponent(filtro)}`;
  async function focusFetch() {
    try {
      const j = await getJSON(`${PROXY}/focus`, 20000);
      if (!j || !Array.isArray(j.anuais) || !j.anuais.length) throw new Error('Focus sem dados');
      return j;
    } catch (e1) {
      // reserva: direto na API do Banco Central
      const desde = new Date(Date.now() - 40 * DAY).toISOString().slice(0, 10);
      const a = await getJSON(olinda('ExpectativasMercadoAnuais', `(Indicador eq 'IPCA' or Indicador eq 'PIB Total' or Indicador eq 'Câmbio' or Indicador eq 'Selic') and baseCalculo eq 0 and Data ge '${desde}'`, 'Indicador,Data,DataReferencia,Mediana,numeroRespondentes'), 20000).catch(() => { throw e1; });
      const c = await getJSON(olinda('ExpectativasMercadoSelic', `baseCalculo eq 0 and Data ge '${desde}'`, 'Data,Reuniao,Mediana'), 20000).catch(() => ({ value: [] }));
      if (!a || !Array.isArray(a.value) || !a.value.length) throw e1;
      return { anuais: a.value, copom: c.value || [] };
    }
  }
  const FOCUS_IND = { 'br-selic': 'Selic', 'br-433': 'IPCA', 'br-pib': 'PIB Total', 'br-dolar': 'Câmbio' };
  let focusState = cache.focus && cache.focus.raw ? { raw: cache.focus.raw, ts: cache.focus.ts } : { raw: null, ts: 0 };
  let focusBusy = false;
  async function loadFocus(force = false) {
    if (focusBusy || (!force && focusState.ts && Date.now() - focusState.ts < TTL)) return;
    focusBusy = true;
    try {
      const j = await focusFetch();
      // guarda só o necessário: ano atual e o próximo, e a pesquisa mais recente do Copom
      const y = new Date().getFullYear();
      const anuais = j.anuais.filter((r) => [String(y), String(y + 1)].includes(String(r.DataReferencia)) && r.Mediana != null)
        .map((r) => ({ Indicador: r.Indicador, Data: String(r.Data).slice(0, 10), DataReferencia: String(r.DataReferencia), Mediana: r.Mediana }));
      const cd = (j.copom || []).reduce((m, r) => (String(r.Data) > m ? String(r.Data) : m), '');
      const copom = (j.copom || []).filter((r) => String(r.Data) === cd && r.Mediana != null).map((r) => ({ Data: cd.slice(0, 10), Reuniao: r.Reuniao, Mediana: r.Mediana }));
      if (anuais.length) {
        focusState = { raw: { anuais, copom }, ts: Date.now() };
        cache.focus = focusState;
        saveCache();
      }
    } catch (e) { /* sem Focus: os cards ficam como estão */ }
    finally {
      focusBusy = false;
      if (prefs.area === 'br') Object.keys(FOCUS_IND).forEach((id) => { const d = DEFS.find((x) => x.id === id); if (d && state[id].st !== 'loading') fillCard(d); });
    }
  }
  function focusFor(id) {
    const f = focusState.raw, ind = FOCUS_IND[id];
    if (!f || !ind) return null;
    const rows = (f.anuais || []).filter((r) => r.Indicador === ind);
    const out = { anos: [] };
    if (rows.length) {
      const lastD = rows.reduce((m, r) => (r.Data > m ? r.Data : m), '');
      const y = +lastD.slice(0, 4);
      out.date = parseISO(lastD);
      [y, y + 1].forEach((yy) => {
        const cur = rows.find((r) => r.Data === lastD && r.DataReferencia === String(yy));
        if (!cur) return;
        const alvo = parseISO(lastD) - 28 * DAY;
        const old = rows.filter((r) => r.DataReferencia === String(yy) && parseISO(r.Data) <= alvo).sort((a, b) => (a.Data < b.Data ? 1 : -1))[0];
        out.anos.push({ y: yy, v: cur.Mediana, d: old ? cur.Mediana - old.Mediana : null });
      });
    }
    if (id === 'br-selic' && f.copom && f.copom.length) {
      const reun = f.copom.map((r) => { const m = /R(\d+)\/(\d{4})/.exec(r.Reuniao || ''); return m ? { k: +m[2] * 100 + +m[1], r } : null; })
        .filter(Boolean).sort((a, b) => a.k - b.k);
      if (reun.length) { out.copom = reun[0].r.Mediana; if (!out.date) out.date = parseISO(reun[0].r.Data); }
    }
    return out.anos.length || out.copom != null ? out : null;
  }
  function focusHTML(d) {
    const fc = focusFor(d.id);
    if (!fc) return '';
    const cam = d.id === 'br-dolar', fim = d.id === 'br-selic' || cam;
    const fv = (v) => (cam ? 'R$ ' + nf(v) : nf(v) + '%');
    const fd = (x) => (x == null || Math.abs(x) < 0.005 ? '' : `<i>${x > 0 ? '▲' : '▼'}${nf(Math.abs(x))}</i>`);
    const items = [];
    if (fc.copom != null) items.push(['Próx. Copom', fv(fc.copom), '']);
    fc.anos.forEach((a) => items.push([(fim ? 'Fim de ' : 'Em ') + a.y, fv(a.v), fd(a.d)]));
    return `<div class="ind-focus" title="Mediana das projeções do Boletim Focus (Banco Central). A seta compara com 4 semanas antes.">
      <span class="ind-focus-h">Mercado espera · Focus ${fc.date ? fmtDate(fc.date, 'd').slice(0, 5) : ''}</span>
      <div class="ind-focus-r">${items.map(([k, v, x]) => `<span><em>${k}</em><b>${v}</b>${x}</span>`).join('')}</div></div>`;
  }

  /* ---------------- próxima divulgação (calendário econômico do próprio painel) ---------------- */
  // datas de decisão do Fed e do Copom vêm do index.html (FOMC_DECISIONS e COPOM_DECISIONS)
  const FOMC_DATES = (typeof FOMC_DECISIONS !== 'undefined' && FOMC_DECISIONS.length) ? FOMC_DECISIONS : ['2026-10-28', '2026-12-09'];
  const NEXT = {
    'br-selic': { c: 'BRL', re: [/decisão d[ae] taxa de juros|copom/i], ex: /ata/i, fixed: () => (typeof COPOM_DECISIONS !== 'undefined' ? COPOM_DECISIONS : []), nome: 'Copom' },
    'br-433': { c: 'BRL', re: [/^IPCA \(Anual\)/i, /^IPCA \(Mensal\)/i] },
    'br-7478': { c: 'BRL', re: [/^IPCA-15 \(Anual\)/i, /^IPCA-15 \(Mensal\)/i] },
    'br-188': { c: 'BRL', re: [/INPC/i] },
    'br-189': { c: 'BRL', re: [/^IGP-M/i] },
    'br-190': { c: 'BRL', re: [/^IGP-DI/i] },
    'br-desemp': { c: 'BRL', re: [/taxa de desemprego/i] },
    'br-pib': { c: 'BRL', re: [/^PIB \(Anual\)/i, /^PIB/i] },
    'us-fedtarget': { c: 'USD', re: [/decisão d[ae] taxa de juros/i], fixed: () => FOMC_DATES, nome: 'Fomc' },
    'us-fedfunds': { c: 'USD', re: [/decisão d[ae] taxa de juros/i], fixed: () => FOMC_DATES, nome: 'Fomc' },
    'us-CPIAUCSL': { c: 'USD', re: [/^(IPC|Índice de Preços ao Consumidor)\b.*\(Anual\)/i, /^(IPC|Índice de Preços ao Consumidor)\b.*\(Mensal\)/i], ex: /núcleo/i },
    'us-CPILFESL': { c: 'USD', re: [/^Núcleo do (IPC|Índice de Preços ao Consumidor)\b.*\(Anual\)/i, /^Núcleo do (IPC|Índice de Preços ao Consumidor)\b/i] },
    'us-PCEPI': { c: 'USD', re: [/^Índice de Preços PCE \(Anual\)/i, /^Índice de Preços PCE/i] },
    'us-PCEPILFE': { c: 'USD', re: [/^Núcleo do Índice de Preços PCE \(Anual\)/i, /^Núcleo do Índice de Preços PCE/i] },
    'us-gdp': { c: 'USD', re: [/^PIB dos EUA/i] },
    'us-unrate': { c: 'USD', re: [/^Taxa de Desemprego nos EUA/i] },
    'us-payroll': { c: 'USD', re: [/payroll\) não-agrícola/i] },
    'us-indpro': { c: 'USD', re: [/^Produção Industrial \(Anual\)/i, /^Produção Industrial/i] },
    'us-sentiment': { c: 'USD', re: [/michigan/i] }
  };
  let calEv = null;
  let calBusy = false;
  async function loadNext() {
    if (calBusy || typeof loadCalendarFeed !== 'function') return;
    calBusy = true;
    try { const f = await loadCalendarFeed(); if (Array.isArray(f) && f.length) calEv = f; }
    catch (e) { /* sem calendário: os cards ficam sem a linha */ }
    finally {
      calBusy = false;
      DEFS.filter((d) => d.area === prefs.area && NEXT[d.id] && state[d.id].st !== 'loading').forEach(fillCard);
    }
  }
  const numOf = (s) => {
    let t = String(s || '').replace(/[^\d,.-]/g, '');
    if (!/\d/.test(t)) return null;
    t = t.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    const v = parseFloat(t);
    return isFinite(v) ? v : null;
  };
  const SPZ = 'America/Sao_Paulo';
  const diaFmt = (t) => new Date(t).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: SPZ }).replace('.', '');
  const horaFmt = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: SPZ });
  function nextFor(id) {
    const r = NEXT[id];
    if (!r) return null;
    const now = Date.now();
    const evs = (calEv || []).filter((e) => e && e.country === r.c && e.title && e.date && !(r.ex && r.ex.test(e.title)));
    let pick = [];
    for (const re of r.re) { pick = evs.filter((e) => re.test(e.title)); if (pick.length) break; }
    pick = pick.map((e) => ({ ...e, t: Date.parse(e.date) })).filter((e) => isFinite(e.t)).sort((a, b) => a.t - b.t);
    // próximo: ainda sem resultado (inclui o de hoje que ainda não saiu)
    let up = pick.find((e) => !e.actual && e.t > now - 3 * 3600 * 1000);
    if (!up && r.fixed) {
      const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: SPZ });
      const f = r.fixed().filter((d) => d >= hoje).sort()[0];
      if (f) up = { t: Date.parse(f + 'T12:00:00-03:00'), title: r.nome, fixedOnly: true };
    }
    // último resultado desta semana, com a projeção do mercado
    const done = pick.filter((e) => e.actual && e.t <= now && now - e.t < 8 * DAY).pop();
    return { up, done, known: !!(calEv && calEv.length) };
  }
  const perTag = (t) => (/\(Mensal\)/i.test(t) ? ' no mês' : /\(Anual\)/i.test(t) ? ' em 12 meses' : /\(Trimestral\)/i.test(t) ? ' no trimestre' : '');
  function nextHTML(d) {
    const n = nextFor(d.id);
    if (!n || (!n.known && !n.up)) return '';
    const lines = [];
    if (n.done) {
      const a = numOf(n.done.actual), f = numOf(n.done.forecast);
      const cmp = a != null && f != null ? (Math.abs(a - f) < 1e-9 ? ['em linha com a projeção', ''] : a > f ? ['acima da projeção', 'hi'] : ['abaixo da projeção', 'lo']) : null;
      lines.push(`<div class="ind-next done"><span class="k">Saiu ${esc(diaFmt(n.done.t))}</span><b>${esc(n.done.actual)}${esc(perTag(n.done.title))}</b>${n.done.forecast ? `<span>proj. ${esc(n.done.forecast)}</span>` : ''}${cmp ? `<em class="${cmp[1]}">${cmp[0]}</em>` : ''}</div>`);
    }
    if (n.up) {
      const allDay = n.up.fixedOnly || /T00:00:00/.test(n.up.date || '');
      lines.push(`<div class="ind-next"><span class="k">${n.up.fixedOnly ? 'Próximo ' + esc(n.up.title) : 'Próxima divulgação'}</span><b>${esc(diaFmt(n.up.t))}${allDay ? '' : ' · ' + esc(horaFmt(n.up.t))}</b>${n.up.forecast ? `<span>proj. ${esc(n.up.forecast)}${esc(perTag(n.up.title))}</span>` : ''}</div>`);
    } else if (!n.done) {
      lines.push('<div class="ind-next none"><span class="k">Sem divulgação na agenda desta semana</span></div>');
    }
    return lines.join('');
  }

  /* ---------------- gráfico (SVG próprio, sem biblioteca) ---------------- */
  const W = 300, H = 92, PAD = 4;
  function cut(series, days, step) {
    if (!series || !series.length) return [];
    if (!days) return series;
    const from = series[series.length - 1][0] - days * DAY;
    const i = series.findIndex((p) => p[0] >= from);
    if (i === -1) return series.slice(-1);
    const out = series.slice(Math.max(0, i - 1));
    // série em degraus: o primeiro degrau começa no início do período, não anos antes
    if (step && out.length && out[0][0] < from) out[0] = [from, out[0][1]];
    return out;
  }
  function thin(s, max = 260) {
    if (s.length <= max) return s;
    const step = s.length / max, out = [];
    for (let i = 0; i < max; i++) out.push(s[Math.floor(i * step)]);
    out.push(s[s.length - 1]);
    return out;
  }
  function chartSVG(series, o) {
    const s = o.step ? series : thin(series);
    if (s.length < 2) return '<div class="ind-nochart">Sem histórico suficiente</div>';
    const vMin = Math.min(...s.map((p) => p[1])), vMax = Math.max(...s.map((p) => p[1]));
    let lo = vMin, hi = vMax;
    if (o.zero || o.bars) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (hi === lo) { hi += 1; lo -= 1; }
    const t0 = s[0][0], t1 = s[s.length - 1][0];
    const X = (t) => PAD + ((t - t0) / (t1 - t0 || 1)) * (W - PAD * 2);
    const Y = (v) => PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2);
    const zeroY = Y(0);
    let body = '';
    if (o.bars && s.length <= 140) {
      const bw = Math.max(1.5, (W - PAD * 2) / s.length - 1.5);
      body = s.map((p) => {
        const y = Y(p[1]), top = Math.min(y, zeroY), h = Math.max(1, Math.abs(y - zeroY));
        return `<rect x="${(X(p[0]) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1" class="${p[1] >= 0 ? 'b-up' : 'b-dn'}"/>`;
      }).join('');
    } else {
      let d = '';
      s.forEach((p, i) => {
        const x = X(p[0]).toFixed(1), y = Y(p[1]).toFixed(1);
        if (i === 0) d += `M${x},${y}`;
        else if (o.step) d += `H${x}V${y}`;
        else d += `L${x},${y}`;
      });
      const base = (o.zero ? zeroY : H - PAD).toFixed(1);
      body = `<path d="${d}V${base}H${X(t0).toFixed(1)}Z" class="ar"/><path d="${d}" class="ln"/>`
        + `<circle cx="${X(t1).toFixed(1)}" cy="${Y(s[s.length - 1][1]).toFixed(1)}" r="2.8" class="dot"/>`;
    }
    const zl = (o.zero || o.bars) && lo < 0 && hi > 0 ? `<line x1="0" x2="${W}" y1="${zeroY.toFixed(1)}" y2="${zeroY.toFixed(1)}" class="zl"/>` : '';
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${zl}${body}<line class="hx" y1="0" y2="${H}" x1="-10" x2="-10"/></svg>`
      + `<div class="ind-ax"><span>${fmtDate(t0, o.dk)}</span><span>mín ${nf(vMin, o.dec ?? 2)} · máx ${nf(vMax, o.dec ?? 2)}</span><span>${fmtDate(t1, o.dk)}</span></div>`
      + '<div class="ind-tip" hidden></div>';
  }

  /* ---------------- render ---------------- */
  root.innerHTML = `
    <div class="ind-head">
      <div class="ind-title">
        <h2>Indicadores econômicos</h2>
        <p id="ind-sub">Dados oficiais do Banco Central, IBGE, Tesouro e Fed</p>
      </div>
      <div class="ind-area" role="tablist">
        <button data-a="br" role="tab">Brasil</button>
        <button data-a="us" role="tab">EUA</button>
        <span class="ind-area-bar" aria-hidden="true"></span>
      </div>
      <button class="btn-sm ind-refresh" id="ind-refresh" title="Buscar de novo"><i class="fas fa-sync-alt"></i> Atualizar</button>
    </div>
    <nav class="ind-jump" id="ind-jump" aria-label="Partes da página" hidden></nav>
    <section class="ind-mo" id="ind-mo" aria-label="Leitura do momento"></section>
    <div id="ind-body"></div>`;

  const body = root.querySelector('#ind-body');

  function cardHTML(d) {
    const s = state[d.id];
    const wide = d.wide ? ' ind-wide' : '';
    const head = `<div class="ind-top"><span class="ind-kick">${esc(d.grp)}</span><span class="ind-date" data-date></span>${d.noChart ? '' : `<button class="ind-info ind-exp" data-expand title="Ampliar gráfico" aria-label="Ampliar gráfico de ${esc(d.nome)}">⤢</button>`}<button class="ind-info" data-info title="O que é?" aria-label="O que é ${esc(d.nome)}?">?</button></div>
      <h3 class="ind-name">${esc(d.nome)}</h3>`;
    return `<article class="ana-card ind-card${wide}${s.st === 'loading' ? ' is-loading' : ''}" data-id="${d.id}">${head}<div class="ind-main"></div>
      <div class="ind-about" hidden><p>${esc(d.info)}</p><span>Fonte: ${esc(d.src)}</span></div></article>`;
  }

  function fillCard(d) {
    const el = body.querySelector(`.ind-card[data-id="${d.id}"]`);
    if (!el) return;
    const s = state[d.id];
    const main = el.querySelector('.ind-main');
    el.classList.toggle('is-loading', s.st === 'loading');
    if (d.id === 'us-tradebal' && s.raw && window.__indJumpBadges) requestAnimationFrame(window.__indJumpBadges);
    if (s.st === 'loading') {
      main.innerHTML = '<div class="ind-skel w60"></div><div class="ind-skel w40"></div><div class="ind-skel h60"></div>';
      return;
    }
    if (s.st === 'err' && !s.raw) {
      el.querySelector('[data-date]').textContent = '';
      main.innerHTML = `<div class="ind-val">—</div><div class="ind-err" title="${esc(s.err || '')}">A fonte (${esc(String(d.src).split(' · ')[0])}) não respondeu agora. Os números voltam sozinhos quando ela responder.</div><div class="ind-foot"><span class="ind-src">${esc(d.src)}</span></div>`;
      return;
    }
    const variant = d.variants ? (prefs.var[d.id] || d.variants[d.vi || 0][0]) : null;
    let v;
    try { v = d.view(s.raw, variant); } catch (e) { v = null; }
    if (!v) { main.innerHTML = '<div class="ind-val">—</div>'; return; }

    if (d.table) {
      if (window.__indJumpBadges) requestAnimationFrame(window.__indJumpBadges);
      el.querySelector('[data-date]').textContent = s.ts ? 'às ' + new Date(s.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      const grupos = {};
      (v.table || []).forEach((t) => {
        const g = /renda\+/i.test(t.nome) ? 'Renda+' : /educa/i.test(t.nome) ? 'Educa+' : /selic/i.test(t.nome) ? 'Selic' : /ipca/i.test(t.nome) ? 'IPCA+' : /prefixado/i.test(t.nome) ? 'Prefixado' : 'Outros';
        (grupos[g] = grupos[g] || []).push(t);
      });
      const ordem = ['Selic', 'Prefixado', 'IPCA+', 'Renda+', 'Educa+', 'Outros'].filter((g) => grupos[g]);
      // tabela agrupada por tipo, com busca e filtro (modelo do Severino, 28/10/2026)
      const ROT = { Selic: 'Selic', Prefixado: 'Prefixado', 'IPCA+': 'IPCA+', 'Renda+': 'Renda+', 'Educa+': 'Educa+', Outros: 'Outros' };
      const taxa = (t) => /selic/i.test(t.nome) ? `Selic + ${nf(t.taxa, 4)}%` : /ipca|renda|educa/i.test(t.nome) ? `IPCA + ${nf(t.taxa)}%` : `${nf(t.taxa)}%`;
      const semAcento = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      let filtro = 'Todos';
      try { filtro = localStorage.getItem('ind_tesouro_filtro') || 'Todos'; } catch (e) { /* sem armazenamento */ }
      if (filtro !== 'Todos' && !grupos[filtro]) filtro = 'Todos';
      main.innerHTML = `<div class="tdt-top">
          <label class="tdt-busca"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" placeholder="Buscar título" aria-label="Buscar título"></label>
          <div class="tdt-fil" role="tablist" aria-label="Filtrar por tipo">${['Todos', ...ordem].map((g) => `<button type="button" role="tab" data-tdf="${esc(g)}" aria-selected="${g === filtro}" class="${g === filtro ? 'on' : ''}">${esc(g === 'Todos' ? 'Todos' : ROT[g])}</button>`).join('')}</div>
        </div>
        <div class="tdt-wrap"><table class="tdt" data-f="${esc(filtro)}"><thead><tr><th>Título</th><th>Taxa</th><th>Preço</th><th>Vencimento</th></tr></thead>
        ${ordem.map((g) => `<tbody class="tdt-g" data-g="${esc(g)}"><tr class="g"><th colspan="4">${esc(ROT[g])}</th></tr>${grupos[g].map((t) =>
          `<tr data-n="${esc(semAcento(t.nome))}"><td class="nm">${esc(t.nome)}</td><td class="tx"><span class="ml">Taxa</span>${esc(taxa(t))}</td><td class="pu"><span class="ml">Preço</span>${t.pu != null ? 'R$ ' + nf(t.pu) : '—'}</td><td class="vc"><span class="ml">Vencimento</span>${esc(t.vencimento || '—')}</td></tr>`).join('')}</tbody>`).join('')}
        <tbody class="tdt-vazio" hidden><tr><td colspan="4">Nenhum título encontrado.</td></tr></tbody></table></div>
        <div class="ind-foot"><span class="ind-src">${esc(d.src)}${s.st === 'err' ? ' · mostrando o último dado salvo' : ''}</span></div>`;
      const tab = main.querySelector('.tdt'), busca = main.querySelector('.tdt-busca input');
      const aplica = () => {
        const q = semAcento(busca.value.trim()), f = tab.dataset.f;
        let total = 0, pri = null;
        tab.querySelectorAll('.tdt-g').forEach((g) => {
          let n = 0;
          g.querySelectorAll('tr[data-n]').forEach((r) => { const ok = !q || r.dataset.n.includes(q); r.hidden = !ok; if (ok) n++; });
          g.hidden = !n || (f !== 'Todos' && g.dataset.g !== f);
          if (!g.hidden) { total += n; pri = pri || g; }
          g.classList.remove('pri');
        });
        if (pri) pri.classList.add('pri');
        tab.querySelector('.tdt-vazio').hidden = total > 0;
      };
      busca.oninput = aplica;
      main.onclick = (ev) => {
        const bt = ev.target.closest('[data-tdf]');
        if (!bt) return;
        const f = bt.dataset.tdf;
        try { localStorage.setItem('ind_tesouro_filtro', f); } catch (e) { /* sem armazenamento */ }
        main.querySelectorAll('[data-tdf]').forEach((x) => { const on = x.dataset.tdf === f; x.classList.toggle('on', on); x.setAttribute('aria-selected', on); });
        tab.dataset.f = f;
        aplica();
      };
      aplica();
      return;
    }

    el.querySelector('[data-date]').textContent = v.date || '';
    const per = d.periods ? (prefs.per[d.id] ?? d.pi ?? 0) : 0;
    const days = d.periods ? d.periods[Math.min(per, d.periods.length - 1)][1] : 0;
    const dl = v.delta;
    // bad: true = subir é ruim (inflação, desemprego); null = neutro (juros)
    const dcls = dl && dl.bad !== null && isFinite(dl.v) && Math.abs(dl.v) > 1e-9 ? ((dl.v > 0) !== !!dl.bad ? ' up' : ' dn') : '';
    const series = d.noChart ? null : cut(v.series, days, d.step);
    main.innerHTML = `
      <div class="ind-val">${esc(v.value)}<small>${esc(v.unit || '')}</small></div>
      ${dl ? `<div class="ind-delta${dcls}">${esc(dl.txt)}</div>` : '<div class="ind-delta"></div>'}
      ${nextHTML(d)}
      ${v.subs && v.subs.length ? `<div class="ind-subs">${v.subs.map(([k, x]) => `<div><span>${esc(k)}</span><b>${esc(x)}</b></div>`).join('')}</div>` : ''}
      ${focusHTML(d)}
      ${d.variants ? `<div class="ind-var">${d.variants.map(([k, l]) => `<button data-var="${k}" class="${k === variant ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>` : ''}
      ${series ? `<div class="ind-chart">${chartSVG(series, { step: d.step, zero: v.zero, bars: v.bars, dk: d.dk })}</div>` : ''}
      <div class="ind-foot">
        ${d.periods && !d.noChart ? `<div class="ind-per">${d.periods.map(([l], i) => `<button data-per="${i}" class="${i === per ? 'on' : ''}">${l}</button>`).join('')}</div>` : ''}
        <span class="ind-src">${esc(d.src)}${s.st === 'err' ? ' · último dado salvo' : ''}</span>
      </div>`;
    el._series = series;
    el._fmt = { unit: v.unitS || '', dk: d.dk };
  }

  const ATALHOS_AREA = {
    br: [['principais', 'Principais', 'fa-gauge-high'], ['comex', 'Balança comercial', 'fa-ship'], ['ibge', 'IBGE em detalhe', 'fa-building-columns'], ['tesouro', 'Tesouro Direto', 'fa-coins']],
    us: [['principais', 'Principais', 'fa-gauge-high'], ['balanca', 'Balança comercial', 'fa-ship'], ['pib', 'PIB e renda', 'fa-chart-column'], ['juros', 'Juros e Fed', 'fa-landmark']]
  };
  let ATALHOS = ATALHOS_AREA.br;
  const jump = root.querySelector('#ind-jump');
  // etiquetas com dado real: saldo da balança do último mês e quantidade de títulos à venda
  function etiqueta(k) {
    if (k === 'comex') {
      const b = window.MMComex && window.MMComex.saldo ? window.MMComex.saldo() : null;
      return b ? `<em class="ij-b ${b.s >= 0 ? 'up' : 'dn'}" title="Saldo da balança comercial de ${esc(b.mes)}">${b.s >= 0 ? '+' : '−'}US$ ${esc(b.txt)} bi</em>` : '';
    }
    if (k === 'balanca') {
      const cur = last(state['us-tradebal']?.raw?.s || []);
      return cur ? `<em class="ij-b ${cur[1] >= 0 ? 'up' : 'dn'}" title="Saldo comercial dos EUA de ${esc(fmtDate(cur[0], 'm'))}">${cur[1] >= 0 ? '+' : '−'}US$ ${nf(Math.abs(cur[1]), 1)} bi</em>` : '';
    }
    if (k === 'tesouro') {
      const n = (state['br-tesouro']?.raw?.t || []).length;
      return n ? `<em class="ij-b" title="Títulos à venda no Tesouro Direto">${n}</em>` : '';
    }
    return '';
  }
  function pilula() {
    const on = jump.querySelector('button.on'), p = jump.querySelector('.ij-pill');
    if (!on || !p) return;
    p.style.width = on.offsetWidth + 'px';
    p.style.height = on.offsetHeight + 'px';
    p.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
  }
  function desenhaAtalhos(secao) {
    jump.hidden = !secao;
    if (!secao) { jump.innerHTML = ''; return; }
    jump.innerHTML = `<span class="ij-pill" aria-hidden="true"></span>${ATALHOS.map(([k, t, ic]) => `<button type="button" data-secao="${k}" class="${k === secao ? 'on' : ''}" aria-pressed="${k === secao}"><i class="fa-solid ${ic}" aria-hidden="true"></i><span>${t}</span>${etiqueta(k)}</button>`).join('')}`;
    jump.classList.add('sem-anim');
    requestAnimationFrame(() => { pilula(); requestAnimationFrame(() => jump.classList.remove('sem-anim')); });
  }
  window.__indJumpBadges = () => { if (!jump.hidden) ATALHOS.forEach(([k]) => { const b = jump.querySelector(`[data-secao="${k}"]`); if (!b) return; b.querySelector('.ij-b')?.remove(); b.insertAdjacentHTML('beforeend', etiqueta(k)); }); pilula(); };
  window.addEventListener('resize', () => pilula());

  const SEC_GRUPO = { 'Tesouro Direto': 'tesouro', 'Balança comercial': 'balanca', 'Juros': 'juros' };
  function renderArea() {
    const area = prefs.area;
    root.querySelectorAll('.ind-area button').forEach((b) => b.classList.toggle('on', b.dataset.a === area));
    const on = root.querySelector('.ind-area button.on'), bar = root.querySelector('.ind-area-bar');
    if (on && bar) { bar.style.width = on.offsetWidth + 'px'; bar.style.transform = `translateX(${on.offsetLeft}px)`; }
    const defs = DEFS.filter((d) => d.area === area);
    const grupos = [...new Set(defs.map((d) => d.grp))];
    // Brasil: barrinha de atalhos logo abaixo do título; cada botão mostra só uma parte da página (28/10/2026)
    // EUA ganhou a sua própria barra (28/10/2026)
    ATALHOS = ATALHOS_AREA[area] || ATALHOS_AREA.br;
    let secao = 'principais';
    try { secao = localStorage.getItem('ind_secao_' + area) || 'principais'; } catch (e) { /* sem armazenamento */ }
    if (!ATALHOS.some(([k]) => k === secao)) secao = 'principais';
    body.dataset.secao = secao; root.dataset.secao = secao; body.dataset.area = area;
    desenhaAtalhos(secao);
    body.innerHTML = grupos.map((g) => {
      const ds = defs.filter((d) => d.grp === g);
      return `<section class="ind-sec" data-s="${(area === 'us' || g !== 'Juros') && SEC_GRUPO[g] || 'principais'}"><div class="market-section-head"><span class="sec-icon"><i class="fas ${GROUP_ICON[g] || 'fa-chart-line'}"></i></span><h2>${esc(g)}</h2><span class="sec-count">${ds.length} ${ds.length > 1 ? 'indicadores' : 'indicador'}</span></div>
        <div class="ind-grid">${ds.map(cardHTML).join('')}</div></section>`;
    }).join('');
    defs.forEach(fillCard);
    if (area === 'br') { ibge(); comex(); }
    if (area === 'us') bea();
    updateSub();
  }

  // IBGE em detalhe (IPCA por grupo, PIB trimestral, desemprego): código no ibge.js, baixado na primeira vez
  let ibgeAsked = false;
  function ibge(force = false) {
    if (prefs.area !== 'br') return;
    if (window.__ibgeRender) { window.__ibgeRender(body, force); return; }
    if (ibgeAsked) return;
    ibgeAsked = true;
    const sc = document.createElement('script');
    sc.src = 'ibge.js?v=2';
    sc.onload = () => { if (prefs.area === 'br' && window.__ibgeRender) window.__ibgeRender(body); };
    sc.onerror = () => { ibgeAsked = false; };
    document.body.appendChild(sc);
  }

  // Balança comercial (Comex Stat, mensal): código no comex.js, baixado na primeira vez
  let comexAsked = false;
  function comex(force = false) {
    if (prefs.area !== 'br') return;
    if (window.__comexRender) { window.__comexRender(body, force); return; }
    if (comexAsked) return;
    comexAsked = true;
    const sc = document.createElement('script');
    sc.src = 'comex.js?v=7';
    sc.onload = () => { if (prefs.area === 'br' && window.__comexRender) window.__comexRender(body); };
    sc.onerror = () => { comexAsked = false; };
    document.body.appendChild(sc);
  }

  // PIB dos EUA por componente (BEA, trimestral): código no bea.js, baixado na primeira vez
  let beaAsked = false;
  function bea(force = false) {
    if (prefs.area !== 'us') return;
    if (window.__beaRender) { window.__beaRender(body, force); return; }
    if (beaAsked) return;
    beaAsked = true;
    const sc = document.createElement('script');
    sc.src = 'bea.js?v=6';
    sc.onload = () => { if (prefs.area === 'us' && window.__beaRender) window.__beaRender(body); };
    sc.onerror = () => { beaAsked = false; };
    document.body.appendChild(sc);
  }

  function updateSub() {
    const defs = DEFS.filter((d) => d.area === prefs.area);
    const ts = Math.max(0, ...defs.map((d) => state[d.id].ts || 0));
    const loading = defs.some((d) => state[d.id].st === 'loading' || state[d.id].busy);
    const fontes = prefs.area === 'br' ? 'Banco Central, IBGE e Tesouro Direto' : 'FRED (Federal Reserve de St. Louis)';
    root.querySelector('#ind-sub').textContent = loading ? `Atualizando… · ${fontes}`
      : ts ? `Atualizado às ${new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })} · ${fontes}` : fontes;
    root.querySelector('#ind-refresh').classList.toggle('spinning', loading);
  }

  /* ---------------- busca (no máximo 5 ao mesmo tempo) ---------------- */
  let running = false;
  async function loadArea(area, force = false) {
    if (running) return;
    const todo = DEFS.filter((d) => d.area === area && (force || !state[d.id].ts || Date.now() - state[d.id].ts > TTL));
    if (!todo.length) return;
    running = true;
    todo.forEach((d) => { state[d.id].busy = true; });
    updateSub();
    await bundle(area, force);
    const queue = todo.slice();
    const worker = async () => {
      while (queue.length) {
        const d = queue.shift();
        try {
          const raw = await d.load();
          state[d.id] = { st: 'ok', raw, ts: Date.now() };
          cache[d.id] = { ts: state[d.id].ts, raw: pack(raw) };
        } catch (e) {
          const prev = state[d.id];
          state[d.id] = { st: 'err', raw: prev.raw, ts: prev.ts, err: e.name === 'AbortError' ? 'tempo esgotado' : e.message };
        }
        if (prefs.area === d.area) fillCard(d);
      }
    };
    try { await Promise.all(Array.from({ length: 5 }, worker)); }
    finally {
      running = false;
      DEFS.forEach((d) => { delete state[d.id].busy; });
      saveCache();
      updateSub();
    }
  }

  /* ---------------- interação ---------------- */
  root.addEventListener('click', (e) => {
    const areaBtn = e.target.closest('.ind-area button');
    if (areaBtn) {
      if (prefs.area !== areaBtn.dataset.a) { prefs.area = areaBtn.dataset.a; savePrefs(); renderArea(); loadArea(prefs.area); }
      return;
    }
    const atalho = e.target.closest('.ind-jump [data-secao]');
    if (atalho) {
      const k = atalho.dataset.secao;
      body.dataset.secao = k; root.dataset.secao = k;
      try { localStorage.setItem('ind_secao_' + prefs.area, k); } catch (e2) { /* sem armazenamento */ }
      jump.querySelectorAll('[data-secao]').forEach((b) => { const on = b.dataset.secao === k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      pilula();
      return;
    }
    if (e.target.closest('#ind-refresh')) { loadArea(prefs.area, true); loadMo(true); loadFocus(true); ibge(true); comex(true); bea(true); return; }
    const card = e.target.closest('.ind-card');
    if (!card) return;
    const d = DEFS.find((x) => x.id === card.dataset.id);
    if (e.target.closest('[data-expand]') || (e.target.closest('.ind-chart') && !d.noChart)) { openExpand(d); return; }
    if (e.target.closest('[data-info]')) {
      const ab = card.querySelector('.ind-about');
      ab.hidden = !ab.hidden;
      card.classList.toggle('show-about', !ab.hidden);
      return;
    }
    if (e.target.closest('.ind-about')) { card.querySelector('.ind-about').hidden = true; card.classList.remove('show-about'); return; }
    const pb = e.target.closest('[data-per]');
    if (pb) { prefs.per[d.id] = +pb.dataset.per; savePrefs(); fillCard(d); return; }
    const vb = e.target.closest('[data-var]');
    if (vb) { prefs.var[d.id] = vb.dataset.var; savePrefs(); fillCard(d); }
  });

  // tooltip do gráfico
  root.addEventListener('pointermove', (e) => {
    const ch = e.target.closest('.ind-chart');
    if (!ch) return;
    const card = ch.closest('.ind-card'), s = card._series;
    if (!s || s.length < 2) return;
    const svg = ch.querySelector('svg'), r = svg.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const t = s[0][0] + fx * (s[s.length - 1][0] - s[0][0]);
    let best = 0;
    for (let i = 1; i < s.length; i++) if (Math.abs(s[i][0] - t) < Math.abs(s[best][0] - t)) best = i;
    const p = s[best], x = PAD + ((p[0] - s[0][0]) / (s[s.length - 1][0] - s[0][0] || 1)) * (W - PAD * 2);
    const hx = svg.querySelector('.hx');
    hx.setAttribute('x1', x); hx.setAttribute('x2', x);
    const tip = ch.querySelector('.ind-tip');
    const u = card._fmt.unit;
    tip.textContent = `${fmtDate(p[0], card._fmt.dk)} · ${u === 'R$' ? 'R$ ' + nf(p[1], 4) : nf(p[1], Math.abs(p[1]) >= 100 ? 1 : 2) + (u === '%' ? '%' : u)}`;
    tip.hidden = false;
    const px = (x / W) * r.width;
    tip.style.left = Math.min(Math.max(px, 60), r.width - 60) + 'px';
  }, { passive: true });
  root.addEventListener('pointerout', (e) => {
    const ch = e.target.closest?.('.ind-chart');
    if (ch && !ch.contains(e.relatedTarget)) {
      const tip = ch.querySelector('.ind-tip'); if (tip) tip.hidden = true;
      const hx = ch.querySelector('.hx'); if (hx) { hx.setAttribute('x1', -10); hx.setAttribute('x2', -10); }
    }
  });

  // dica ao passar o mouse (ou tocar) nos gráficos da balança e da BEA: elementos com data-tip
  const tipBox = document.createElement('div');
  tipBox.className = 'ind-ftip'; tipBox.hidden = true;
  document.body.appendChild(tipBox);
  let tipAlvo = null;
  const escondeTip = () => { tipBox.hidden = true; if (tipAlvo) tipAlvo.classList.remove('on'); tipAlvo = null; };
  function mostraTip(e) {
    const g = e.target.closest?.('[data-tip]');
    if (!g || !root.contains(g)) { escondeTip(); return; }
    if (g !== tipAlvo) { if (tipAlvo) tipAlvo.classList.remove('on'); tipAlvo = g; g.classList.add('on'); tipBox.textContent = g.dataset.tip; }
    tipBox.hidden = false;
    const w = tipBox.offsetWidth, h = tipBox.offsetHeight;
    let x = e.clientX + 14, y = e.clientY - h - 12;
    if (x + w > window.innerWidth - 8) x = Math.max(8, e.clientX - w - 14);
    if (y < 8) y = e.clientY + 18;
    tipBox.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }
  root.addEventListener('pointermove', mostraTip, { passive: true });
  root.addEventListener('pointerdown', mostraTip, { passive: true });
  root.addEventListener('pointerleave', escondeTip);
  window.addEventListener('scroll', escondeTip, { passive: true, capture: true });

  // só busca com a aba aberta e a página visível
  const panel = document.getElementById('indicators-panel');
  const isOpen = () => panel && panel.classList.contains('active') && !document.hidden;
  if (panel) new MutationObserver(() => { if (isOpen()) { renderArea(); renderMo(); loadArea(prefs.area); loadMo(); loadFocus(); loadNext(); } }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', () => { if (isOpen()) { loadArea(prefs.area); loadMo(); loadFocus(); loadNext(); } });
  window.addEventListener('resize', () => { const on = root.querySelector('.ind-area button.on'), bar = root.querySelector('.ind-area-bar'); if (on && bar) { bar.style.width = on.offsetWidth + 'px'; bar.style.transform = `translateX(${on.offsetLeft}px)`; } });

  /* =========================================================
     LEITURA DO MOMENTO: juro real, diferencial Brasil x EUA, inflação x meta
     e curva americana, cada um comparado com os últimos 20 anos (só dados oficiais)
     ========================================================= */
  const MO_Y = 20;
  const moEl = root.querySelector('#ind-mo');
  // meta de inflação do CMN por ano e a tolerância (2006 em diante)
  const metaIPCA = (y) => (y <= 2018 ? 4.5 : y === 2019 ? 4.25 : y === 2020 ? 4 : y === 2021 ? 3.75 : y === 2022 ? 3.5 : y === 2023 ? 3.25 : 3);
  const tolIPCA = (y) => (y <= 2016 ? 2 : 1.5);
  const mKey = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
  // valor de fim de mês de uma série diária ou em degraus (repete o último valor conhecido)
  function monthly(s) {
    const out = [];
    if (!s || !s.length) return out;
    let i = 0, cur = null;
    for (let m = mKey(s[0][0]); m <= Date.now();) {
      const d = new Date(m), next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      while (i < s.length && s[i][0] < next) { cur = s[i][1]; i++; }
      if (cur != null) out.push([m, cur]);
      m = next;
    }
    return out;
  }
  const fisher = (n, i) => ((1 + n / 100) / (1 + i / 100) - 1) * 100;
  function combine(a, b, f) {
    const mb = new Map((b || []).map((p) => [mKey(p[0]), p[1]]));
    return (a || []).filter((p) => mb.has(mKey(p[0]))).map((p) => [mKey(p[0]), f(p[1], mb.get(mKey(p[0])))]);
  }
  // onde o valor de hoje fica entre os meses dos últimos 20 anos
  function rank(hist, v) {
    const from = Date.now() - MO_Y * 365.25 * DAY;
    const h = (hist || []).filter((p) => p[0] >= from);
    if (h.length < 36 || v == null || !isFinite(v)) return null;
    const vals = h.map((p) => p[1]).sort((x, y) => x - y);
    return {
      pct: Math.round((vals.filter((x) => x < v).length / vals.length) * 100),
      min: vals[0], max: vals[vals.length - 1], med: vals[Math.floor(vals.length / 2)],
      y0: new Date(h[0][0]).getUTCFullYear()
    };
  }
  const tier = (p) => (p >= 90 ? ['Muito alto', 'hi2'] : p >= 70 ? ['Alto', 'hi'] : p > 30 ? ['Na média', 'mid'] : p > 10 ? ['Baixo', 'lo'] : ['Muito baixo', 'lo2']);
  const nfu = (v, u) => (v == null || !isFinite(v) ? '—' : nf(v) + (u === '%' ? '%' : ' ' + u));

  let moState = cache.mo && cache.mo.raw ? { raw: unpack(cache.mo.raw), ts: cache.mo.ts } : { raw: null, ts: 0 };
  let moBusy = false, moRetry = 0;
  async function loadMo(force = false) {
    if (moBusy || (!force && moState.ts && Date.now() - moState.ts < TTL)) return;
    moBusy = true;
    if (!moState.raw) renderMo();
    const ini = new Date(new Date().getFullYear() - MO_Y - 2, 0, 1);
    await bundle('mo', force);
    const jobs = {
      // Selic: meta (SGS 432) dos últimos 10 anos, numa consulta só; antes disso, a média mensal (SGS 4189).
      // Antes eram 22 anos da série diária em 3 consultas pesadas ao BCB, que falhavam na primeira abertura.
      selic: async () => {
        const [hm, rec] = await Promise.all([bcb(4189, (MO_Y + 3) * 366).catch(() => []), bcb(432, 3650)]);
        const s = steps(rec), first = s.length ? s[0][0] : Infinity;
        return [...hm.filter((p) => p[0] < first), ...s];
      },
      ipca: () => bcb(433, (MO_Y + 3) * 366),
      ff: () => fred('FEDFUNDS', { limit: (MO_Y + 2) * 12 }),
      tu: () => fred('DFEDTARU', { limit: 10 }),
      tl: () => fred('DFEDTARL', { limit: 10 }),
      cv: () => fred('T10Y2Y', { frequency: 'm', limit: (MO_Y + 2) * 12 }),
      cvd: () => fred('T10Y2Y', { limit: 10 })
    };
    try {
      const keys = Object.keys(jobs);
      const res = await Promise.allSettled(keys.map((k) => jobs[k]()));
      const got = {};
      res.forEach((r, i) => { if (r.status === 'fulfilled' && Array.isArray(r.value) && r.value.length) got[keys[i]] = r.value; });
      if (Object.keys(got).length) {
        // o que falhou fica com o último dado salvo (com a data dele)
        moState = { raw: { ...(moState.raw || {}), ...got }, ts: Date.now() };
        cache.mo = { ts: moState.ts, raw: pack(moState.raw) };
        saveCache();
      } else moState.err = true;
      // alguma fonte falhou e não há dado salvo dela: tenta de novo sozinho (até 3 vezes)
      const falta = keys.filter((k) => !(moState.raw && moState.raw[k]));
      if (falta.length && moRetry < 3) { moRetry++; setTimeout(() => loadMo(true), 8000 * moRetry); }
      else if (!falta.length) moRetry = 0;
    } finally { moBusy = false; renderMo(); }
  }

  function moCalc(r) {
    const selM = monthly(r.selic), ipca12 = r.ipca ? acc12(r.ipca) : [];
    const selNow = last(r.selic), ipNow = last(ipca12);
    const tiles = [];

    const realH = combine(selM, ipca12, fisher);
    tiles.push({
      id: 'mo-real', area: 'br', kick: 'Brasil · Juros', nome: 'Juro real', unit: '%', unitTxt: '% a.a.',
      v: selNow && ipNow ? fisher(selNow[1], ipNow[1]) : null, hist: realH, date: ipNow && 'IPCA até ' + fmtDate(ipNow[0], 'm'),
      how: 'Selic meta descontada a inflação dos últimos 12 meses.',
      info: 'Quanto a Selic rende acima da inflação: (1 + Selic) ÷ (1 + IPCA 12 meses) − 1. Juro real alto freia a economia e a inflação; baixo estimula. Usa a inflação passada (ex-post), não a esperada.',
      src: 'BCB · SGS 432, 4189 e 433'
    });

    const tu = last(r.tu), tl = last(r.tl);
    const fedNow = tu && tl ? (tu[1] + tl[1]) / 2 : last(r.ff)?.[1];
    tiles.push({
      id: 'mo-carry', area: 'br', kick: 'Brasil x EUA', nome: 'Diferencial de juros', unit: 'p.p.', unitTxt: 'p.p.',
      v: selNow && fedNow != null ? selNow[1] - fedNow : null, hist: combine(selM, r.ff, (a, b) => a - b),
      date: selNow && fmtDate(selNow[0], 'd'),
      how: selNow && fedNow != null ? `Selic ${nf(selNow[1])}% menos o juro básico americano (${nf(fedNow)}%).` : 'Selic meta menos o juro básico americano.',
      info: 'Diferença entre a Selic e o juro dos EUA (meio do intervalo da meta do Fed; no histórico, a Fed Funds efetiva do mês). É o "carry" do real: quanto maior, mais o investidor ganha por trocar dólar por real, o que costuma sustentar o câmbio.',
      src: 'BCB · SGS 432 e 4189 · FRED · DFEDTARU/L e FEDFUNDS'
    });

    if (ipNow) {
      const y = new Date(ipNow[0]).getUTCFullYear(), meta = metaIPCA(y), tol = tolIPCA(y);
      tiles.push({
        id: 'mo-meta', area: 'br', kick: 'Brasil · Inflação', nome: 'IPCA x meta', unit: '%', unitTxt: '% em 12 meses',
        v: ipNow[1], hist: ipca12, date: fmtDate(ipNow[0], 'm'), meta, tol,
        how: `Meta de ${nf(meta)}%, com tolerância de ${nf(tol, 1)} p.p. para cima ou para baixo.`,
        info: 'Inflação dos últimos 12 meses comparada com a meta definida pelo CMN. Fora do intervalo de tolerância, o Banco Central precisa explicar o descumprimento.',
        src: 'BCB · SGS 433 · meta do CMN'
      });
    } else tiles.push({ id: 'mo-meta', area: 'br', kick: 'Brasil · Inflação', nome: 'IPCA x meta', unit: '%', unitTxt: '% em 12 meses', v: null, hist: [], src: 'BCB · SGS 433', info: '' });

    const cvNow = last(r.cvd) || last(r.cv);
    let since = null;
    if (cvNow && r.cv) {
      const neg = cvNow[1] < 0;
      for (let i = r.cv.length - 1; i >= 0; i--) if ((r.cv[i][1] < 0) !== neg) { since = r.cv[i + 1]?.[0] ?? null; break; }
    }
    tiles.push({
      id: 'mo-curva', area: 'us', kick: 'EUA · Juros', nome: 'Curva 10 anos − 2 anos', unit: 'p.p.', unitTxt: 'p.p.',
      v: cvNow?.[1] ?? null, hist: r.cv || [], date: cvNow && fmtDate(cvNow[0], 'd'),
      how: cvNow ? `${cvNow[1] < 0 ? 'Invertida' : 'Positiva'}${since ? ' desde ' + fmtDate(since, 'm') : ''}. Abaixo de zero costuma antecipar recessão.` : '',
      info: 'Diferença entre os juros dos Treasuries de 10 e de 2 anos. Quando fica negativa (curva invertida), o mercado espera cortes de juros à frente, o que antecedeu as últimas recessões americanas.',
      src: 'FRED · T10Y2Y'
    });
    return tiles;
  }

  function rulerHTML(t) {
    const v = t.v;
    if (v == null || !isFinite(v)) return '<div class="mo-ruler empty"></div>';
    if (t.meta != null) {
      const piso = t.meta - t.tol, teto = t.meta + t.tol;
      const lo = Math.min(0, v - 0.5), hi = Math.max(teto + 2, v + 0.5);
      const P = (x) => ((x - lo) / (hi - lo)) * 100;
      return `<div class="mo-ruler"><div class="mo-track"><span class="mo-band" style="left:${P(piso)}%;width:${P(teto) - P(piso)}%"></span>
        <span class="mo-tick" style="left:${P(t.meta)}%"></span><span class="mo-dot" style="left:${P(v)}%"></span></div>
        <div class="mo-lbl"><span style="left:${P(piso)}%">${nf(piso, 1)}</span><span style="left:${P(t.meta)}%">meta ${nf(t.meta, 1)}</span><span style="left:${P(teto)}%">${nf(teto, 1)}</span></div></div>`;
    }
    const rk = t.rank;
    if (!rk) return '<div class="mo-ruler empty"></div>';
    const lo = Math.min(rk.min, v), hi = Math.max(rk.max, v);
    const P = (x) => (hi === lo ? 50 : ((x - lo) / (hi - lo)) * 100);
    return `<div class="mo-ruler"><div class="mo-track grad">${t.zero0 && lo < 0 && hi > 0 ? `<span class="mo-zero" style="left:${P(0)}%"></span>` : ''}
      <span class="mo-tick" style="left:${P(rk.med)}%"></span><span class="mo-dot" style="left:${P(v)}%"></span></div>
      <div class="mo-lbl edge"><span style="left:0%">mín ${nf(rk.min, 1)}</span>${P(rk.med) > 30 && P(rk.med) < 70 ? `<span style="left:${P(rk.med)}%">mediana ${nf(rk.med, 1)}</span>` : ''}<span style="left:100%">máx ${nf(rk.max, 1)}</span></div></div>`;
  }

  let moTiles = [];
  function renderMo() {
    if (!moEl) return;
    const head = `<div class="market-section-head"><span class="sec-icon"><i class="fas fa-compass"></i></span><h2>Leitura do momento</h2><span class="sec-count">comparado com os últimos ${MO_Y} anos</span></div>`;
    if (!moState.raw) {
      moEl.innerHTML = head + `<div class="mo-grid">${[0, 1, 2, 3].map(() => `<article class="ana-card mo-card is-loading">${moState.err ? '<div class="ind-val">—</div><div class="ind-err">Fonte indisponível agora.</div>' : '<div class="ind-skel w40"></div><div class="ind-skel w60"></div><div class="ind-skel h60"></div>'}</article>`).join('')}</div>`;
      return;
    }
    let tiles = [];
    try { tiles = moCalc(moState.raw); } catch (e) { tiles = []; }
    moTiles = tiles;
    moEl.innerHTML = head + `<div class="mo-grid">${tiles.map((t) => {
      t.zero0 = t.unit === 'p.p.' || t.id === 'mo-real';
      t.rank = t.meta == null ? rank(t.hist, t.v) : null;
      let chip = '', txt = '';
      if (t.v == null || !isFinite(t.v)) { txt = 'Fonte indisponível agora.'; }
      else if (t.meta != null) {
        const piso = t.meta - t.tol, teto = t.meta + t.tol;
        chip = t.v > teto ? ['Acima do teto', 'bad'] : t.v < piso ? ['Abaixo do piso', 'bad'] : Math.abs(t.v - t.meta) <= 0.25 ? ['Na meta', 'good'] : ['Dentro do intervalo', 'good'];
        txt = `${sign(t.v - t.meta)} p.p. em relação ao centro da meta.`;
      } else if (t.rank) {
        chip = tier(t.rank.pct);
        txt = t.v >= t.rank.max ? `O maior nível desde ${t.rank.y0}.` : t.v <= t.rank.min ? `O menor nível desde ${t.rank.y0}.` : `Maior que ${t.rank.pct}% dos meses desde ${t.rank.y0}.`;
      }
      return `<article class="ana-card mo-card" data-mo="${t.id}" tabindex="0" role="button" aria-label="Ampliar ${esc(t.nome)}">
        <div class="ind-top"><span class="ind-kick">${esc(t.kick)}</span><span class="ind-date">${esc(t.date || '')}</span><button class="ind-info" data-info title="O que é?" aria-label="O que é ${esc(t.nome)}?">?</button></div>
        <h3 class="ind-name">${esc(t.nome)}</h3>
        <div class="mo-row"><div class="ind-val">${t.v == null || !isFinite(t.v) ? '—' : (t.unit === 'p.p.' ? sign(t.v) : nf(t.v))}${t.v == null || !isFinite(t.v) ? '' : `<small>${esc(t.unitTxt)}</small>`}</div>${chip ? `<span class="mo-chip ${chip[1]}">${chip[0]}</span>` : ''}</div>
        ${rulerHTML(t)}
        <p class="mo-txt">${esc(txt)}</p>
        ${t.how ? `<p class="mo-how">${esc(t.how)}</p>` : ''}
        <div class="ind-about" hidden><p>${esc(t.info)}</p><span>Fonte: ${esc(t.src)}</span></div>
      </article>`;
    }).join('')}</div>`;
  }

  // clique no quadro abre o gráfico ampliado com o histórico da medida
  function moDef(t) {
    const d = {
      id: t.id, area: t.area, grp: 'Leitura do momento', nome: t.nome, src: t.src, info: t.info, dk: 'm',
      view: () => ({ value: t.v == null ? '—' : (t.unit === 'p.p.' ? sign(t.v) : nf(t.v)), unit: t.unitTxt, date: t.date, series: t.hist, unitS: t.unit === '%' ? '%' : ' p.p.', zero: t.zero0 })
    };
    state[t.id] = { st: 'ok', raw: {} };
    return d;
  }
  if (moEl) {
    moEl.addEventListener('click', (e) => {
      const card = e.target.closest('.mo-card[data-mo]');
      if (!card) return;
      if (e.target.closest('[data-info]')) {
        const ab = card.querySelector('.ind-about'); ab.hidden = !ab.hidden; card.classList.toggle('show-about', !ab.hidden); return;
      }
      if (e.target.closest('.ind-about')) { card.querySelector('.ind-about').hidden = true; card.classList.remove('show-about'); return; }
      const t = moTiles.find((x) => x.id === card.dataset.mo);
      if (t && t.hist && t.hist.length > 1) openExpand(moDef(t));
    });
    moEl.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.mo-card[data-mo]')) { e.preventDefault(); e.target.click(); }
    });
  }

  /* =========================================================
     GRÁFICO AMPLIADO: clique no gráfico (ou no ⤢) abre em tela grande,
     com histórico longo, governos e eventos marcados
     ========================================================= */

  // Governos (faixas no fundo). Para acrescentar, siga o mesmo formato: [nome, início, fim ou null]
  const GOVS = {
    br: [
      ['FHC', '1995-01-01', '2002-12-31'],
      ['Lula 1 e 2', '2003-01-01', '2010-12-31'],
      ['Dilma', '2011-01-01', '2016-05-11'],
      ['Temer', '2016-05-12', '2018-12-31'],
      ['Bolsonaro', '2019-01-01', '2022-12-31'],
      ['Lula 3', '2023-01-01', null]
    ],
    us: [
      ['Bush', '2001-01-20', '2009-01-19'],
      ['Obama', '2009-01-20', '2017-01-19'],
      ['Trump 1', '2017-01-20', '2021-01-19'],
      ['Biden', '2021-01-20', '2025-01-19'],
      ['Trump 2', '2025-01-20', null]
    ]
  };

  // Eventos (linhas no gráfico). area: br, us ou global (aparece nos dois). cat: juros, economia, geo, petroleo, saude, politica
  // Para acrescentar um evento, copie uma linha e troque data, texto e categoria.
  const EVENTS = [
    ['2008-09-15', 'Quebra do Lehman Brothers: crise financeira global', 'economia', 'global'],
    ['2008-12-16', 'Fed leva os juros a zero', 'juros', 'us'],
    ['2015-09-09', 'Brasil perde o grau de investimento (S&P)', 'economia', 'br'],
    ['2015-12-16', 'Fed faz a primeira alta de juros desde 2006', 'juros', 'us'],
    ['2016-06-23', 'Plebiscito do Brexit', 'geo', 'global'],
    ['2016-12-15', 'Teto de gastos promulgado (EC 95)', 'politica', 'br'],
    ['2018-05-21', 'Greve dos caminhoneiros', 'economia', 'br'],
    ['2019-11-12', 'Reforma da Previdência promulgada', 'politica', 'br'],
    ['2020-03-11', 'OMS declara a pandemia de Covid-19', 'saude', 'global'],
    ['2020-03-15', 'Fed corta os juros a zero na pandemia', 'juros', 'us'],
    ['2020-04-20', 'Petróleo WTI fecha com preço negativo', 'petroleo', 'global'],
    ['2020-08-05', 'Selic na mínima histórica de 2%', 'juros', 'br'],
    ['2021-02-24', 'Autonomia do Banco Central sancionada (LC 179)', 'politica', 'br'],
    ['2021-03-17', 'Copom começa ciclo de alta da Selic', 'juros', 'br'],
    ['2022-02-24', 'Rússia invade a Ucrânia; petróleo dispara', 'geo', 'global'],
    ['2022-03-16', 'Fed começa ciclo de alta dos juros', 'juros', 'us'],
    ['2022-08-03', 'Selic chega a 13,75%', 'juros', 'br'],
    ['2023-03-10', 'Quebra do Silicon Valley Bank', 'economia', 'us'],
    ['2023-07-26', 'Fed leva os juros a 5,25%–5,50%, o pico do ciclo', 'juros', 'us'],
    ['2023-08-02', 'Copom começa ciclo de cortes da Selic', 'juros', 'br'],
    ['2023-08-30', 'Novo arcabouço fiscal sancionado (LC 200)', 'politica', 'br'],
    ['2023-10-07', 'Ataque do Hamas a Israel e guerra em Gaza', 'geo', 'global'],
    ['2024-09-18', 'Copom volta a subir a Selic; Fed começa a cortar', 'juros', 'global'],
    ['2024-11-28', 'Pacote fiscal decepciona; dólar passa de R$ 6', 'economia', 'br'],
    ['2025-04-02', 'EUA anunciam tarifas amplas de importação', 'geo', 'global'],
    ['2025-06-13', 'Israel ataca o Irã; petróleo sobe', 'petroleo', 'global'],
    ['2025-06-18', 'Selic chega a 15%', 'juros', 'br'],
    ['2025-07-09', 'EUA anunciam tarifa de 50% sobre produtos do Brasil', 'geo', 'br']
  ].map(([d, txt, cat, area]) => ({ t: parseISO(d), txt, cat, area }));
  const CAT = { juros: 'Juros', economia: 'Economia', geo: 'Geopolítica', petroleo: 'Petróleo', saude: 'Saúde', politica: 'Política fiscal' };

  // Histórico longo (só no gráfico ampliado; fica na memória, não no cache)
  async function bcbFrom(code, start) {
    const hit = fromBundle(`bcbfrom:${code}:${isoLocal(new Date(start))}`);
    if (hit) return hit;
    // janelas de até ~10 anos (limite do BCB), buscadas todas ao mesmo tempo
    const wins = [];
    let ini = new Date(start);
    const fim = new Date();
    while (ini < fim) {
      const ate = new Date(Math.min(fim.getTime(), ini.getTime() + 3600 * DAY));
      wins.push([ini, ate]);
      ini = new Date(ate.getTime() + DAY);
    }
    const parts = await Promise.all(wins.map(([a, b]) =>
      bcbGet(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${ddmmyyyy(a)}&dataFinal=${ddmmyyyy(b)}`, 30000)));
    const out = [];
    parts.forEach((j) => { if (Array.isArray(j)) j.forEach((o) => { const v = parseFloat(o.valor); if (isFinite(v)) out.push([parseBR(o.data), v]); }); });
    const seen = new Set();
    return out.filter((p) => !seen.has(p[0]) && seen.add(p[0])).sort((a, b) => a[0] - b[0]);
  }
  const D = (y, m = 1, d = 1) => new Date(y, m - 1, d);
  const DEEP = {
    'br-selic': async () => ({ s: steps(await bcbFrom(432, D(1999, 3, 5))) }),
    'br-cdi': async () => ({ s: await bcbFrom(12, D(2003)) }),
    'br-dolar': async (r) => ({ v: await bcbFrom(10813, D(1999)), c: r.c }),
    'br-euro': async (r) => ({ v: await bcbFrom(21620, D(1999)), c: r.c }),
    'br-desemp': async () => ({ s: await bcb(24369) }),
    'us-fedfunds': async () => ({ s: await fred('FEDFUNDS', { limit: 1000 }) }),
    'us-treasuries': async () => ({ 2: await fred('DGS2', { limit: 7000 }), 10: await fred('DGS10', { limit: 7000 }), 30: await fred('DGS30', { limit: 7000 }) }),
    'us-T10Y2Y': async () => ({ s: await fred('T10Y2Y', { limit: 7000 }) }),
    'us-T5YIE': async () => ({ s: await fred('T5YIE', { limit: 7000 }) }),
    'us-gdp': async (r) => ({ s: await fred('GDPC1', { limit: 400 }), n: r.n }),
    'us-unrate': async () => ({ s: await fred('UNRATE', { limit: 1000 }) }),
    'us-payroll': async () => ({ s: await fred('PAYEMS', { units: 'chg', limit: 1000 }) }),
    'us-indpro': async () => ({ s: await fred('INDPRO', { units: 'pc1', limit: 1000 }) }),
    'us-sentiment': async () => ({ s: await fred('UMCSENT', { limit: 1000 }) })
  };
  [433, 7478, 188, 189, 190].forEach((c) => { DEEP['br-' + c] = async () => ({ m: await bcbFrom(c, D(1995)) }); });
  ['CPIAUCSL', 'CPILFESL', 'PCEPI', 'PCEPILFE'].forEach((id) => { DEEP['us-' + id] = async () => ({ s: await fred(id, { frequency: 'm', limit: 1000 }) }); });

  const XP = [['1A', 365], ['3A', 1096], ['5A', 1826], ['10A', 3653], ['20A', 7305], ['Máx', 0]];
  // governos e eventos começam desligados toda vez que o gráfico abre
  const xp = { gov: false, ev: false };
  const saveXp = () => {};

  // histórico longo guardado por 1 dia (a Selic desde 1999 vira poucos pontos: só as mudanças)
  const DEEP_KEY = 'ind_deep_v1', DEEP_TTL = 24 * 3600 * 1000;
  let deepCache = {};
  try { deepCache = JSON.parse(localStorage.getItem(DEEP_KEY) || '{}') || {}; } catch (e) { deepCache = {}; }
  const cachedDeep = (id) => { const c = deepCache[id]; return c && Date.now() - c.ts < DEEP_TTL ? unpack(c.raw) : null; };
  const saveDeep = (id, raw) => {
    deepCache[id] = { ts: Date.now(), raw: pack(raw) };
    Object.keys(deepCache).forEach((k) => { if (Date.now() - deepCache[k].ts > DEEP_TTL) delete deepCache[k]; });
    try { localStorage.setItem(DEEP_KEY, JSON.stringify(deepCache)); }
    catch (e) { delete deepCache[id]; try { localStorage.setItem(DEEP_KEY, JSON.stringify(deepCache)); } catch (e2) { /* sem espaço */ } }
  };
  function loadDeep(d) {
    const s = state[d.id];
    if (!DEEP[d.id] || s.deep || s.deepP || !s.raw) return;
    s.deepP = DEEP[d.id](s.raw).then((raw) => { s.deep = raw; saveDeep(d.id, raw); if (xp.d === d) xp.raw = raw; })
      .catch(() => { s.deepFail = true; })
      .finally(() => { s.deepP = null; if (xp.d === d || (xp.cmp && xp.cmp.id === d.id)) renderExpand(); });
  }

  const box = document.createElement('div');
  box.className = 'indx';
  box.hidden = true;
  box.innerHTML = `<div class="indx-box" role="dialog" aria-modal="true" aria-label="Gráfico ampliado">
      <div class="indx-head"></div>
      <div class="indx-ctl"></div>
      <div class="indx-chart"><div class="indx-tip" hidden></div></div>
      <div class="indx-legend"></div>
      <div class="indx-evlist"></div>
    </div>`;
  document.body.appendChild(box);

  function openExpand(d) {
    xp.d = d;
    xp.perL = '10A';
    xp.auto = true;
    xp.gov = false; xp.ev = false;
    xp.cmp = null;
    const s = state[d.id];
    if (!s.deep) s.deep = cachedDeep(d.id);
    xp.raw = s.deep || s.raw;
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    renderExpand();
    requestAnimationFrame(() => box.classList.add('on'));
    box.querySelector('.indx-x')?.focus({ preventScroll: true });
  }
  function closeExpand() {
    box.classList.remove('on');
    box.hidden = true;
    document.body.style.overflow = '';
    xp.d = null;
  }

  function renderExpand() {
    const d = xp.d;
    if (!d) return;
    const variant = d.variants ? (prefs.var[d.id] || d.variants[d.vi || 0][0]) : null;
    let v = null;
    try { v = d.view(xp.raw, variant); } catch (e) { v = null; }
    const full = (v && v.series) || [];
    const span = full.length ? (full[full.length - 1][0] - full[0][0]) / DAY : 0;
    // 20A/Máx: se ainda não tem o histórico longo, ele só é buscado quando o período é escolhido
    const st = state[d.id];
    const canDeep = DEEP[d.id] && !st.deep && !st.deepFail;
    const pers = XP.filter(([, days]) => canDeep || !days || days < span + 400);
    if (!pers.some((p) => p[0] === xp.perL)) xp.perL = pers[pers.length - 1][0];
    // ao abrir, fica no maior período que o histórico curto já cobre (sem disparar download)
    if (xp.auto && canDeep) {
      const fit = XP.filter(([, dd]) => dd && dd < span + 400);
      const cur = XP.find((p) => p[0] === xp.perL)[1];
      if (fit.length && (!cur || cur >= span + 400)) xp.perL = fit[fit.length - 1][0];
    }
    const days = pers.find((p) => p[0] === xp.perL)[1];
    if (canDeep && !xp.auto && (!days || days > span + 30)) loadDeep(d);
    xp.loadingDeep = !!st.deepP;
    const series = cut(full, days, d.step);
    const cmp = cmpData(series);

    box.querySelector('.indx-head').innerHTML = `
      <div><span class="ind-kick">${esc(d.grp)} · ${d.area === 'br' ? 'Brasil' : 'EUA'}</span>
        <h3>${esc(d.nome)}</h3>
        <div class="indx-val">${esc(v?.value ?? '—')}<small>${esc(v?.unit || '')}</small>${v?.date ? `<span>${esc(v.date)}</span>` : ''}</div></div>
      <button class="indx-x" title="Fechar (Esc)" aria-label="Fechar">✕</button>`;
    box.querySelector('.indx-ctl').innerHTML = `
      <div class="ind-per">${pers.map(([l]) => `<button data-xper="${l}" class="${l === xp.perL ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${d.variants ? `<div class="ind-var">${d.variants.map(([k, l]) => `<button data-xvar="${k}" class="${k === variant ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>` : ''}
      <span class="sp"></span>
      ${cmpSelect(d)}
      <label class="indx-tg"><input type="checkbox" data-xtg="gov" ${xp.gov ? 'checked' : ''}><span>Governos</span></label>
      <label class="indx-tg"><input type="checkbox" data-xtg="ev" ${xp.ev ? 'checked' : ''}><span>Eventos</span></label>
      ${xp.loadingDeep ? '<span class="indx-load">carregando histórico completo…</span>' : cmp && cmp.loading ? '<span class="indx-load">carregando comparação…</span>' : cmp && cmp.fail ? '<span class="indx-load off">comparação indisponível agora</span>' : ''}`;
    drawBig(series, d, v, cmp && cmp.s && cmp.s.length > 1 ? cmp : null);
  }

  /* ---------- comparar com outro indicador ---------- */
  const varOf = (d) => (d.variants ? (prefs.var[d.id] || d.variants[d.vi || 0][0]) : null);
  const cmpCands = () => DEFS.filter((x) => !x.noChart && !x.table).concat(moTiles.filter((t) => t.hist && t.hist.length > 1).map(moDef));
  const findCmp = (id) => DEFS.find((x) => x.id === id) || (moTiles.find((t) => t.id === id) ? moDef(moTiles.find((t) => t.id === id)) : null);
  function cmpSelect(d) {
    const c = cmpCands().filter((x) => x.id !== d.id);
    const grp = (lbl, arr) => (arr.length ? `<optgroup label="${lbl}">${arr.map((x) => `<option value="${x.id}" ${xp.cmp && xp.cmp.id === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</optgroup>` : '');
    return `<label class="indx-cmp${xp.cmp ? ' on' : ''}" title="Desenhar outro indicador no mesmo gráfico"><span>⇄</span><select data-xcmp aria-label="Comparar com outro indicador">
      <option value="">Comparar com…</option>
      ${grp('Leitura do momento', c.filter((x) => x.id.startsWith('mo-')))}${grp('Brasil', c.filter((x) => x.area === 'br' && !x.id.startsWith('mo-')))}${grp('EUA', c.filter((x) => x.area === 'us' && !x.id.startsWith('mo-')))}
    </select></label>`;
  }
  function loadCmp(cd) {
    const st = state[cd.id];
    if (!st || st.cmpP || st.raw) return;
    st.cmpP = cd.load().then((raw) => {
      state[cd.id] = { st: 'ok', raw, ts: Date.now() };
      cache[cd.id] = { ts: state[cd.id].ts, raw: pack(raw) };
      saveCache();
      if (prefs.area === cd.area) fillCard(cd);
    }).catch(() => { st.cmpFail = true; }).finally(() => { delete st.cmpP; if (xp.cmp && xp.cmp.id === cd.id) renderExpand(); });
  }
  // série do indicador comparado no mesmo intervalo de datas do principal
  function cmpData(series) {
    const cd = xp.cmp;
    if (!cd || !series || series.length < 2) return null;
    const st = state[cd.id];
    if (!st) return null;
    if (!st.deep) st.deep = cachedDeep(cd.id);
    if (!st.raw && !st.deep) { if (!st.cmpFail) loadCmp(cd); return { d: cd, loading: !st.cmpFail, fail: !!st.cmpFail }; }
    let cv = null;
    try { cv = cd.view(st.deep || st.raw, varOf(cd)); } catch (e) { cv = null; }
    const full = (cv && cv.series) || [];
    const t0 = series[0][0], t1 = series[series.length - 1][0];
    // o histórico curto não cobre o período: busca o longo
    if (full.length && full[0][0] > t0 + 60 * DAY && DEEP[cd.id] && !st.deep && !st.deepFail && st.raw) loadDeep(cd);
    let s = full.filter((p) => p[0] >= t0 && p[0] <= t1);
    // em degraus (Selic, Fed): mantém o valor vigente no início do período
    const prev = full.filter((p) => p[0] < t0).pop();
    if (prev && cd.step) s = [[t0, prev[1]], ...s];
    if (s.length && cd.step && s[s.length - 1][0] < t1) s.push([t1, s[s.length - 1][1]]);
    const vl = cd.variants ? cd.variants.find(([k]) => k === varOf(cd)) : null;
    return { d: cd, v: cv, s, nome: cd.nome + (vl ? ` (${vl[1]})` : ''), loading: !!st.deepP };
  }

  function drawBig(s, d, v, cmp) {
    const wrap = box.querySelector('.indx-chart');
    const tip = wrap.querySelector('.indx-tip');
    wrap.querySelectorAll('svg, .indx-empty').forEach((n) => n.remove());
    xp.series = s;
    if (!s || s.length < 2) {
      wrap.insertAdjacentHTML('afterbegin', '<div class="indx-empty">Sem histórico para este período.</div>');
      box.querySelector('.indx-evlist').innerHTML = '';
      box.querySelector('.indx-legend').innerHTML = '';
      return;
    }
    const Wd = Math.max(300, wrap.clientWidth), Ht = Math.max(240, Math.min(420, Math.round(Wd * 0.42)));
    // mesma unidade (ex.: Selic x IPCA, ambos em %): um eixo só; senão, eixo próprio à direita
    const shared = cmp && (cmp.v?.unitS ?? '') === (v.unitS ?? '');
    const L = 52, R = cmp && !shared ? 56 : 14, T = 30, B = 26;
    const vals = s.map((p) => p[1]).concat(shared ? cmp.s.map((p) => p[1]) : []);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (v.zero || v.bars) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    const pad = (hi - lo) * 0.08 || 1; lo -= (v.zero || v.bars) && lo === 0 ? 0 : pad; hi += pad;
    let lo2 = lo, hi2 = hi;
    if (cmp && !shared) {
      const v2 = cmp.s.map((p) => p[1]);
      lo2 = Math.min(...v2); hi2 = Math.max(...v2);
      const p2 = (hi2 - lo2) * 0.08 || 1; lo2 -= p2; hi2 += p2;
    }
    const t0 = s[0][0], t1 = s[s.length - 1][0];
    const X = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (Wd - L - R);
    const Y = (y) => T + (1 - (y - lo) / (hi - lo)) * (Ht - T - B);
    const Y2 = (y) => T + (1 - (y - lo2) / (hi2 - lo2)) * (Ht - T - B);
    xp.geo = { X, Y, Y2, L, R, T, B, Wd, Ht, t0, t1 };
    xp.cmpS = cmp;
    let g = '';

    // governos
    const govs = (GOVS[d.area] || []).map(([n, a, b]) => ({ n, a: parseISO(a), b: b ? parseISO(b) + DAY : t1 })).filter((x) => x.b > t0 && x.a < t1);
    if (xp.gov) {
      govs.forEach((x, i) => {
        const xa = X(Math.max(x.a, t0)), xb = X(Math.min(x.b, t1));
        g += `<rect x="${xa.toFixed(1)}" y="${T}" width="${Math.max(0, xb - xa).toFixed(1)}" height="${Ht - T - B}" class="gv gv${i % 2}"/>`;
        if (x.a > t0) g += `<line x1="${xa.toFixed(1)}" x2="${xa.toFixed(1)}" y1="${T - 18}" y2="${Ht - B}" class="gvl"/>`;
        if (xb - xa > 42) g += `<text x="${((xa + xb) / 2).toFixed(1)}" y="${T - 8}" class="gvt" text-anchor="middle">${esc(xb - xa > 70 ? x.n : x.n.split(' ')[0])}</text>`;
      });
    }
    // grade e eixo Y
    const ticks = 5;
    for (let i = 0; i <= ticks; i++) {
      const yv = lo + ((hi - lo) * i) / ticks, y = Y(yv);
      g += `<line x1="${L}" x2="${Wd - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="gr"/><text x="${L - 8}" y="${(y + 3.5).toFixed(1)}" class="ax" text-anchor="end">${nf(yv, Math.abs(hi - lo) < 5 ? 2 : Math.abs(hi) >= 1000 ? 0 : 1)}</text>`;
      if (cmp && !shared) { const y2v = lo2 + ((hi2 - lo2) * i) / ticks; g += `<text x="${Wd - R + 8}" y="${(y + 3.5).toFixed(1)}" class="ax ax2" text-anchor="start">${nf(y2v, Math.abs(hi2 - lo2) < 5 ? 2 : Math.abs(hi2) >= 1000 ? 0 : 1)}</text>`; }
    }
    if (lo < 0 && hi > 0) g += `<line x1="${L}" x2="${Wd - R}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}" class="zl"/>`;
    // eixo X: anos (ou meses em períodos curtos)
    const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t1).getUTCFullYear();
    const spanY = (t1 - t0) / (365 * DAY);
    if (spanY >= 2) {
      const stepY = spanY > 20 ? 5 : spanY > 9 ? 2 : 1;
      for (let y = y0 + 1; y <= y1; y++) if (y % stepY === 0) { const x = X(Date.UTC(y, 0, 1)); g += `<text x="${x.toFixed(1)}" y="${Ht - 8}" class="ax" text-anchor="middle">${y}</text><line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Ht - B}" y2="${Ht - B + 4}" class="gr"/>`; }
    } else {
      const dd = new Date(t0); dd.setUTCDate(1);
      const stepM = spanY > 0.6 ? 2 : 1;
      for (let k = 1; k < 30; k++) {
        const m = new Date(Date.UTC(dd.getUTCFullYear(), dd.getUTCMonth() + k, 1)).getTime();
        if (m > t1) break;
        if (k % stepM) continue;
        g += `<text x="${X(m).toFixed(1)}" y="${Ht - 8}" class="ax" text-anchor="middle">${fmtDate(m, 'm')}</text>`;
      }
    }
    // série
    const zeroY = Y(Math.max(lo, Math.min(hi, 0)));
    if (v.bars && s.length <= 400) {
      const bw = Math.max(1.2, (Wd - L - R) / s.length - 1.2);
      s.forEach((p) => { const y = Y(p[1]), top = Math.min(y, zeroY), h = Math.max(1, Math.abs(y - zeroY)); g += `<rect x="${(X(p[0]) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" class="${p[1] >= 0 ? 'b-up' : 'b-dn'}"/>`; });
    } else {
      const pts = d.step ? s : thin(s, Math.min(1200, Wd * 1.5));
      let path = '';
      pts.forEach((p, i) => { const x = X(p[0]).toFixed(1), y = Y(p[1]).toFixed(1); path += i === 0 ? `M${x},${y}` : d.step ? `H${x}V${y}` : `L${x},${y}`; });
      const base = (v.zero ? zeroY : Ht - B).toFixed(1);
      g += `<path d="${path}V${base}H${X(t0).toFixed(1)}Z" class="ar"/><path d="${path}" class="ln"/>`;
      g += `<circle cx="${X(t1).toFixed(1)}" cy="${Y(s[s.length - 1][1]).toFixed(1)}" r="3.5" class="dot"/>`;
    }
    // série comparada
    if (cmp) {
      const YY = shared ? Y : Y2;
      const pts = cmp.d.step ? cmp.s : thin(cmp.s, Math.min(1200, Wd * 1.5));
      let path = '';
      pts.forEach((p, i) => { const x = X(p[0]).toFixed(1), y = YY(p[1]).toFixed(1); path += i === 0 ? `M${x},${y}` : cmp.d.step ? `H${x}V${y}` : `L${x},${y}`; });
      const lp = cmp.s[cmp.s.length - 1];
      g += `<path d="${path}" class="ln2"/><circle cx="${X(lp[0]).toFixed(1)}" cy="${YY(lp[1]).toFixed(1)}" r="3.5" class="dot2"/>`;
    }
    // eventos
    const evs = xp.ev ? EVENTS.filter((e) => (e.area === 'global' || e.area === d.area) && e.t >= t0 && e.t <= t1) : [];
    xp.evs = evs;
    // marcadores próximos descem de linha para não se sobrepor
    const rowEnd = [];
    evs.forEach((e, i) => {
      const xn = X(e.t);
      let row = rowEnd.findIndex((end) => xn - end >= 17);
      if (row === -1) row = rowEnd.length < 5 ? rowEnd.length : rowEnd.indexOf(Math.min(...rowEnd));
      rowEnd[row] = xn;
      const x = xn.toFixed(1), cy = T + 9 + row * 16;
      g += `<g class="ev ev-${e.cat}" data-ev="${i}"><line x1="${x}" x2="${x}" y1="${cy + 7.5}" y2="${Ht - B}"/><circle cx="${x}" cy="${cy}" r="7.5"/><text x="${x}" y="${cy + 3.5}" text-anchor="middle">${i + 1}</text></g>`;
    });
    g += `<line class="hx" x1="-10" x2="-10" y1="${T}" y2="${Ht - B}"/><circle class="hdot" r="4" cx="-10" cy="-10"/><circle class="hdot2" r="4" cx="-10" cy="-10"/>`;
    wrap.insertAdjacentHTML('afterbegin', `<svg width="${Wd}" height="${Ht}" viewBox="0 0 ${Wd} ${Ht}">${g}</svg>`);
    tip.hidden = true;

    box.querySelector('.indx-legend').innerHTML = (cmp ? `<span class="lg"><i class="lg-l1"></i>${esc(d.nome)}</span><span class="lg"><i class="lg-l2"></i>${esc(cmp.nome)}${shared ? '' : ' · eixo da direita'}</span>` : '')
      + (xp.gov && govs.length ? '<span class="lg"><i class="lg-gov"></i>Governo</span>' : '')
      + (evs.length ? [...new Set(evs.map((e) => e.cat))].map((c) => `<span class="lg"><i class="lg-ev ev-${c}"></i>${CAT[c]}</span>`).join('') : '')
      + `<span class="lg src">Fonte: ${esc(d.src)}</span>`;
    box.querySelector('.indx-evlist').innerHTML = evs.length
      ? `<h4>Eventos no período</h4><ol>${evs.map((e, i) => {
          const near = nearest(s, e.t);
          return `<li data-ev="${i}" class="ev-${e.cat}"><b>${i + 1}</b><span class="dt">${fmtDate(e.t, 'd')}</span><span class="tx">${esc(e.txt)}</span><span class="vv">${near ? fmtVal(near[1], v) : ''}</span></li>`;
        }).join('')}</ol>`
      : (xp.ev ? '<p class="indx-none">Nenhum evento marcado neste período.</p>' : '');
  }

  function nearest(s, t) {
    if (!s || !s.length) return null;
    let lo = 0, hi = s.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m][0] <= t) lo = m; else hi = m; }
    return Math.abs(s[lo][0] - t) <= Math.abs(s[hi][0] - t) ? s[lo] : s[hi];
  }
  function fmtVal(y, v) {
    const u = v?.unitS ?? '';
    if (u === 'R$') return 'R$ ' + nf(y, 4);
    return nf(y, Math.abs(y) >= 100 ? 1 : 2) + (u === '%' ? '%' : u);
  }

  box.addEventListener('click', (e) => {
    if (e.target === box || e.target.closest('.indx-x')) { closeExpand(); return; }
    const pb = e.target.closest('[data-xper]');
    if (pb) { xp.perL = pb.dataset.xper; xp.auto = false; renderExpand(); return; }
    const vb = e.target.closest('[data-xvar]');
    if (vb) { prefs.var[xp.d.id] = vb.dataset.xvar; savePrefs(); renderExpand(); fillCard(xp.d); return; }
    const li = e.target.closest('.indx-evlist li');
    if (li) {
      const g = box.querySelector(`.indx-chart .ev[data-ev="${li.dataset.ev}"]`);
      if (g) { g.classList.remove('flash'); void g.getBBox(); g.classList.add('flash'); showEvTip(+li.dataset.ev); }
    }
  });
  box.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-xcmp]');
    if (sel) { xp.cmp = sel.value ? findCmp(sel.value) : null; renderExpand(); return; }
    const tg = e.target.closest('[data-xtg]');
    if (tg) { xp[tg.dataset.xtg] = tg.checked; saveXp(); renderExpand(); }
  });
  function showEvTip(i) {
    const e = xp.evs[i], gq = xp.geo, tip = box.querySelector('.indx-tip');
    if (!e || !gq) return;
    const near = nearest(xp.series, e.t);
    tip.innerHTML = `<b>${fmtDate(e.t, 'd')}</b> · ${esc(e.txt)}${near ? `<br><span>${esc(xp.d.nome)}: ${fmtVal(near[1], xp.d.view ? safeView() : null)}</span>` : ''}`;
    placeTip(gq.X(e.t), gq.T + 40);
  }
  const safeView = () => { try { return xp.d.view(xp.raw, xp.d.variants ? (prefs.var[xp.d.id] || xp.d.variants[xp.d.vi || 0][0]) : null); } catch (e) { return null; } };
  function placeTip(x, y) {
    const tip = box.querySelector('.indx-tip'), wrap = box.querySelector('.indx-chart');
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(x - w / 2, 4), wrap.clientWidth - w - 4) + 'px';
    tip.style.top = y + 'px';
  }
  box.addEventListener('pointermove', (e) => {
    const svg = e.target.closest?.('.indx-chart svg');
    if (!svg || !xp.series || !xp.geo) return;
    const gq = xp.geo, r = svg.getBoundingClientRect();
    const px = e.clientX - r.left;
    const evG = e.target.closest('.ev');
    if (evG) { showEvTip(+evG.dataset.ev); return; }
    if (px < gq.L || px > gq.Wd - gq.R) return;
    const t = gq.t0 + ((px - gq.L) / (gq.Wd - gq.L - gq.R)) * (gq.t1 - gq.t0);
    const p = nearest(xp.series, t);
    if (!p) return;
    const x = gq.X(p[0]), y = gq.Y(p[1]);
    const hx = svg.querySelector('.hx'), hd = svg.querySelector('.hdot');
    hx.setAttribute('x1', x); hx.setAttribute('x2', x);
    hd.setAttribute('cx', x); hd.setAttribute('cy', y);
    const v = safeView();
    const c = xp.cmpS;
    let cTxt = '';
    const hd2 = svg.querySelector('.hdot2');
    if (c) {
      // valor vigente da série comparada na data (degraus) ou o ponto mais próximo
      const q = c.d.step ? c.s.filter((z) => z[0] <= p[0]).pop() : nearest(c.s, p[0]);
      const ok = q && (c.d.step || Math.abs(q[0] - p[0]) <= 46 * DAY);
      if (ok) { cTxt = `<br><span class="c2">${esc(c.nome)}: ${fmtVal(q[1], c.v)}</span>`; hd2.setAttribute('cx', x); hd2.setAttribute('cy', (gq.R > 14 ? gq.Y2 : gq.Y)(q[1])); }
      else hd2.setAttribute('cx', -10);
    }
    const gov = xp.gov ? (GOVS[xp.d.area] || []).find(([, a, b]) => p[0] >= parseISO(a) && (!b || p[0] <= parseISO(b) + DAY)) : null;
    box.querySelector('.indx-tip').innerHTML = `<b>${fmtDate(p[0], xp.d.dk === 'd' ? 'd' : xp.d.dk)}</b> · ${fmtVal(p[1], v)}${cTxt}${gov ? `<br><span>Governo ${esc(gov[0])}</span>` : ''}`;
    placeTip(x, Math.max(4, y - 58));
  }, { passive: true });
  box.addEventListener('pointerleave', () => {
    box.querySelector('.indx-tip').hidden = true;
    const svg = box.querySelector('.indx-chart svg');
    if (svg) { svg.querySelector('.hx')?.setAttribute('x1', -10); svg.querySelector('.hx')?.setAttribute('x2', -10); svg.querySelector('.hdot')?.setAttribute('cx', -10); svg.querySelector('.hdot2')?.setAttribute('cx', -10); }
  });
  document.addEventListener('keydown', (e) => { if (!box.hidden && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeExpand(); } }, true);
  let rzT;
  window.addEventListener('resize', () => { if (box.hidden) return; clearTimeout(rzT); rzT = setTimeout(renderExpand, 120); });


  /* ---------------- estilos (no mesmo arquivo para o index.html não crescer) ---------------- */
  const css = document.createElement('style');
  css.textContent = `
  .ind-head { display:flex; align-items:center; gap:14px 18px; flex-wrap:wrap; margin:4px 0 18px; }
  .ind-title { flex:1 1 260px; min-width:0; }
  .ind-title h2 { margin:0; font-size:20px; letter-spacing:-.015em; color:var(--text); }
  .ind-title p { margin:4px 0 0; font-size:12px; color:var(--text-3); font-family:'JetBrains Mono',monospace; }
  .ind-area { position:relative; display:flex; padding:3px; border:1px solid var(--line); border-radius:12px; background:var(--surface); }
  .ind-area button { position:relative; z-index:1; border:0; background:transparent; color:var(--text-3); font:inherit; font-size:12.5px; font-weight:600; padding:7px 16px; border-radius:9px; cursor:pointer; transition:color .18s; }
  .ind-area button.on { color:var(--text); }
  .ind-area-bar { position:absolute; top:3px; bottom:3px; left:0; width:0; border-radius:9px; background:var(--surface-2); box-shadow:inset 0 0 0 1px var(--line-2), inset 0 -2px 0 var(--accent); transition:transform .3s var(--ease,ease), width .3s var(--ease,ease); }
  .ind-refresh.spinning i { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .ind-sec { margin-bottom:26px; }
  .ind-jump { position:relative; display:flex; gap:4px; width:max-content; max-width:100%; overflow-x:auto; scrollbar-width:none; margin:0 0 22px; padding:5px; border:1px solid var(--line); border-radius:14px; background:var(--surface); box-shadow:0 1px 3px rgba(0,0,0,.08); }
  .ind-jump[hidden] { display:none; }
  .ind-jump::-webkit-scrollbar { display:none; }
  .ind-jump button { position:relative; z-index:1; display:flex; align-items:center; gap:8px; border:0; background:none; color:var(--text-2); font:inherit; font-size:13.5px; font-weight:500; padding:9px 16px; border-radius:10px; cursor:pointer; white-space:nowrap; transition:color .2s, background .2s, box-shadow .2s, transform .2s; }
  .ind-jump button i { font-size:13px; color:var(--accent-ink); transition:color .2s; }
  .ind-jump button:not(.on):hover { background:var(--surface-2); color:var(--text); box-shadow:0 2px 6px rgba(0,0,0,.1); transform:translateY(-1px); }
  .ind-jump button.on { color:#fff; font-weight:600; }
  .ind-jump button.on i { color:inherit; }
  .ij-pill { position:absolute; z-index:0; top:0; left:0; width:0; height:0; border-radius:10px; background:color-mix(in srgb, var(--accent) 72%, #000); box-shadow:0 2px 8px color-mix(in srgb, var(--accent) 35%, transparent); transition:transform .3s var(--ease,ease), width .3s var(--ease,ease), height .3s var(--ease,ease); }
  body:not(.light) .ij-pill { background:var(--accent); }
  body:not(.light) .ind-jump button.on { color:#17120a; }
  .ind-jump.sem-anim .ij-pill { transition:none; }
  .ij-b { font-style:normal; font-size:11px; font-weight:600; font-variant-numeric:tabular-nums; padding:1px 7px; border-radius:999px; background:var(--surface-2); color:var(--text-2); border:1px solid var(--line); }
  .ij-b.up { color:var(--pos-ink, var(--pos)); background:color-mix(in srgb, var(--pos) 12%, transparent); border-color:color-mix(in srgb, var(--pos) 30%, transparent); }
  .ij-b.dn { color:var(--neg); background:color-mix(in srgb, var(--neg) 12%, transparent); border-color:color-mix(in srgb, var(--neg) 30%, transparent); }
  .ind-jump button.on .ij-b { background:rgba(255,255,255,.2); border-color:rgba(255,255,255,.35); color:inherit; }
  body:not(.light) .ind-jump button.on .ij-b { background:rgba(0,0,0,.14); border-color:rgba(0,0,0,.2); }
  #ind-root[data-secao]:not([data-secao="principais"]) #ind-mo { display:none; }
  @media (max-width: 640px) {
    .ind-jump { display:grid; grid-template-columns:1fr 1fr; width:100%; overflow:visible; }
    .ind-jump button { justify-content:center; flex-wrap:wrap; row-gap:3px; padding:9px 8px; font-size:13px; white-space:normal; text-align:center; }
    .ind-jump button:not(.on):hover { transform:none; }
  }
  @media (prefers-reduced-motion: reduce) { .ij-pill, .ind-jump button { transition:none; } }
  #ind-body[data-secao="principais"] .ind-sec:not([data-s="principais"]),
  #ind-body[data-secao="tesouro"] .ind-sec:not([data-s="tesouro"]),
  #ind-body[data-secao="comex"] .ind-sec:not(#comex-sec),
  #ind-body[data-secao="ibge"] .ind-sec:not(#ibge-sec),
  #ind-body[data-secao="balanca"] .ind-sec:not([data-s="balanca"]),
  #ind-body[data-secao="juros"] .ind-sec:not([data-s="juros"]),
  #ind-body[data-secao="pib"] .ind-sec:not(#bea-sec) { display:none; }
  .ind-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(290px, 1fr)); gap:14px; }
  .ind-card { display:flex; flex-direction:column; gap:6px; min-height:250px; overflow:hidden; }
  .ind-card.ind-wide { grid-column:1 / -1; min-height:0; }
  .ind-top { display:flex; align-items:center; gap:8px; }
  .ind-kick { font-size:10px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--text-3); }
  .ind-date { margin-left:auto; font-family:'JetBrains Mono',monospace; font-size:10.5px; color:var(--text-3); }
  .ind-info { width:22px; height:22px; border-radius:7px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-3); font:inherit; font-size:11px; font-weight:700; cursor:pointer; position:relative; z-index:3; }
  .ind-info:hover, .show-about .ind-info { color:var(--accent-ink); border-color:var(--accent-line); }
  .ind-name { margin:0; font-size:14.5px; font-weight:600; color:var(--text); }
  .ind-main { display:flex; flex-direction:column; gap:6px; flex:1; }
  .ind-val { font-family:'JetBrains Mono',monospace; font-size:27px; font-weight:600; letter-spacing:-.02em; color:var(--text); line-height:1.15; font-variant-numeric:tabular-nums; }
  .ind-val small { font-family:inherit; font-size:11.5px; font-weight:500; color:var(--text-3); margin-left:7px; letter-spacing:0; }
  .ind-delta { font-family:'JetBrains Mono',monospace; font-size:11.5px; color:var(--text-3); min-height:15px; }
  .ind-delta.up { color:var(--pos-ink); } .ind-delta.dn { color:var(--neg); }
  .ind-subs { display:flex; flex-wrap:wrap; gap:6px; }
  .ind-subs div { display:flex; gap:7px; align-items:baseline; padding:4px 9px; border-radius:8px; background:var(--surface-2); border:1px solid var(--line); font-size:11px; color:var(--text-3); }
  .ind-subs b { font-family:'JetBrains Mono',monospace; font-weight:600; color:var(--text); font-size:11.5px; }
  .ind-var, .ind-per { display:flex; gap:2px; }
  .ind-var { align-self:flex-start; padding:2px; border-radius:9px; border:1px solid var(--line); background:var(--surface-2); }
  .ind-var button, .ind-per button { border:0; background:transparent; color:var(--text-3); font:inherit; font-size:11px; font-weight:600; padding:4px 9px; border-radius:7px; cursor:pointer; }
  .ind-var button.on { background:var(--surface); color:var(--accent-ink); box-shadow:0 0 0 1px var(--accent-line); }
  .ind-per button { font-family:'JetBrains Mono',monospace; font-size:10.5px; padding:3px 7px; }
  .ind-per button.on { color:var(--accent-ink); background:var(--accent-soft); }
  .ind-var button:hover, .ind-per button:hover { color:var(--text); }
  .ind-chart { position:relative; margin-top:auto; padding-top:4px; }
  .ind-chart svg { display:block; width:100%; height:92px; overflow:visible; cursor:crosshair; }
  .ind-chart .ln { fill:none; stroke:var(--accent); stroke-width:1.8; vector-effect:non-scaling-stroke; stroke-linejoin:round; }
  .ind-chart .ar { fill:color-mix(in srgb, var(--accent) 12%, transparent); stroke:none; }
  .ind-chart .dot { fill:var(--accent); stroke:var(--surface); stroke-width:2; vector-effect:non-scaling-stroke; }
  .ind-chart .zl { stroke:var(--line-2); stroke-dasharray:3 3; vector-effect:non-scaling-stroke; }
  .ind-chart .hx { opacity:0; } .ind-chart:hover .hx { opacity:1; }
  .ind-chart .hx { stroke:var(--text-3); stroke-width:1; stroke-dasharray:2 2; vector-effect:non-scaling-stroke; }
  .ind-chart .b-up { fill:color-mix(in srgb, var(--pos) 75%, transparent); } .ind-chart .b-dn { fill:color-mix(in srgb, var(--neg) 75%, transparent); }
  .ind-ax { display:flex; justify-content:space-between; gap:8px; font-family:'JetBrains Mono',monospace; font-size:9.5px; color:var(--text-3); margin-top:4px; white-space:nowrap; }
  .ind-ax span:nth-child(2) { overflow:hidden; text-overflow:ellipsis; }
  .ind-ftip { position:fixed; left:0; top:0; z-index:9999; max-width:260px; padding:6px 9px; border-radius:8px; background:var(--surface-3, var(--surface-2)); border:1px solid var(--line-2); font-family:'JetBrains Mono',monospace; font-size:11px; line-height:1.5; color:var(--text); white-space:pre-line; pointer-events:none; box-shadow:var(--shadow-sm, 0 4px 14px rgba(0,0,0,.18)); }
  .ind-tip { position:absolute; top:-6px; transform:translateX(-50%); padding:3px 8px; border-radius:7px; background:var(--surface-3, var(--surface-2)); border:1px solid var(--line-2); font-family:'JetBrains Mono',monospace; font-size:10.5px; color:var(--text); white-space:nowrap; pointer-events:none; box-shadow:var(--shadow-sm, none); }
  .ind-nochart { font-size:11px; color:var(--text-3); padding:20px 0; text-align:center; }
  .ind-foot { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:4px; padding-top:8px; border-top:1px dashed var(--line); }
  .ind-src { margin-left:auto; font-size:10px; color:var(--text-3); font-family:'JetBrains Mono',monospace; text-align:right; }
  .ind-err { font-size:12px; color:var(--text-3); line-height:1.5; }
  .ind-about { position:absolute; inset:0; z-index:2; padding:46px 18px 16px; background:color-mix(in srgb, var(--surface) 96%, transparent); -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); display:flex; flex-direction:column; gap:10px; cursor:pointer; animation: indIn .18s var(--ease,ease); }
  .ind-about[hidden] { display:none; }
  .ind-about p { margin:0; font-size:13px; line-height:1.6; color:var(--text-2); }
  .ind-about span { margin-top:auto; font-family:'JetBrains Mono',monospace; font-size:10.5px; color:var(--text-3); }
  @keyframes indIn { from { opacity:0; } to { opacity:1; } }
  .ind-skel { height:12px; border-radius:6px; background:var(--surface-2); animation: skelPulse 1.2s ease-in-out infinite; }
  .ind-skel.w60 { width:60%; height:26px; } .ind-skel.w40 { width:40%; } .ind-skel.h60 { height:80px; margin-top:auto; }
  .tdt-top { display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin:6px 0 14px; }
  .tdt-busca { display:flex; align-items:center; gap:9px; flex:0 1 340px; min-width:200px; padding:0 12px; height:40px; border:1px solid var(--line-2, var(--line)); border-radius:10px; background:var(--surface); color:var(--text-3); }
  .tdt-busca:focus-within { border-color:var(--accent-line, var(--accent)); box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 15%, transparent); }
  .tdt-busca input { all:unset; flex:1; min-width:0; height:100%; color:var(--text); font:inherit; font-size:14px; }
  .tdt-busca input, .tdt-busca input:focus { border:0 !important; background:none !important; box-shadow:none !important; border-radius:0 !important; }
  .tdt-busca input::placeholder { color:var(--text-3); }
  .tdt-busca input::-webkit-search-cancel-button { cursor:pointer; }
  .tdt-fil { display:flex; gap:8px; flex-wrap:wrap; }
  .tdt-fil button { border:1px solid var(--line-2, var(--line)); background:var(--surface); color:var(--text); font:inherit; font-size:13.5px; padding:8px 18px; border-radius:999px; cursor:pointer; transition:background .15s, border-color .15s, box-shadow .15s; }
  .tdt-fil button:not(.on):hover { background:var(--surface-2); box-shadow:0 2px 6px rgba(0,0,0,.08); }
  .tdt-fil button.on { background:#14233b; border-color:#14233b; color:#fff; font-weight:600; }
  body:not(.light) .tdt-fil button.on { background:var(--accent); border-color:var(--accent); color:#17120a; }
  .tdt-wrap { border:1px solid var(--line); border-radius:10px; overflow:hidden; background:var(--surface); }
  .tdt { width:100%; border-collapse:collapse; font-size:14px; }
  .tdt thead th { text-align:left; font-size:11px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:var(--text-3); padding:12px 16px; border-bottom:1px solid var(--line); }
  .tdt thead th:first-child { width:48%; }
  .tdt tr.g th { text-align:left; padding:9px 16px; font-size:12.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--accent-ink); background:color-mix(in srgb, var(--accent) 10%, var(--surface-2)); box-shadow:inset 3px 0 0 var(--accent); }
  .tdt-g:not(.pri) tr.g th { border-top:12px solid var(--surface); }
  .tdt td { padding:10px 16px; border-bottom:1px solid var(--line); color:var(--text); font-variant-numeric:tabular-nums; white-space:nowrap; }
  .tdt td.nm { white-space:normal; }
  .tdt td.tx { font-weight:700; }
  .tdt tr[data-n]:hover td { background:color-mix(in srgb, var(--accent) 5%, transparent); }
  .tdt .ml { display:none; }
  .tdt-vazio td { text-align:center; color:var(--text-3); padding:22px; }
  @media (max-width: 640px) {
    .tdt-busca { flex:1 1 100%; }
    .tdt-fil button { padding:7px 14px; font-size:13px; }
    .tdt thead { display:none; }
    .tdt tr[data-n] { display:grid; grid-template-columns:1.3fr 1fr 1fr; column-gap:8px; padding:9px 12px; border-bottom:1px solid var(--line); }
    .tdt tr[data-n] td { padding:0; border:0; font-size:12.5px; }
    .tdt tr[data-n] td.nm { grid-column:1 / -1; font-size:14px; font-weight:500; margin-bottom:5px; }
    .tdt .ml { display:block; font-size:10.5px; font-weight:400; color:var(--text-3); }
    .tdt tr.g th { padding:8px 12px; }
  }
  .ind-tbl-wrap { overflow-x:auto; margin:4px -4px 0; }
  .ind-tbl { width:100%; border-collapse:collapse; font-size:12.5px; }
  .ind-tbl th { text-align:left; font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--text-3); font-weight:700; padding:6px 8px; border-bottom:1px solid var(--line); }
  .ind-tbl td { padding:7px 8px; border-bottom:1px solid var(--line); color:var(--text); }
  .ind-tbl td.n { font-family:'JetBrains Mono',monospace; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .ind-tbl tr.g td { font-size:10.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--accent-ink); background:var(--surface-2); }
  .ind-tbl tbody tr:not(.g):hover td { background:color-mix(in srgb, var(--accent) 5%, transparent); }
  @media (max-width: 640px) {
    .ind-grid { grid-template-columns:1fr; }
    .ind-val { font-size:24px; }
    .ind-head { margin-bottom:14px; }
    .ind-refresh { margin-left:auto; }
  }

  .ind-chart svg { cursor:zoom-in; }
  .ind-exp { font-size:12px; }
  .indx { position:fixed; inset:0; z-index:2600; display:grid; place-items:center; padding:24px; background:color-mix(in srgb, var(--bg) 62%, transparent); -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); opacity:0; transition:opacity .18s; }
  .indx.on { opacity:1; }
  .indx[hidden] { display:none; }
  .indx-box { width:min(1180px, 100%); max-height:calc(100vh - 48px); overflow:auto; background:linear-gradient(180deg, var(--card-hi, transparent), transparent 30%), var(--surface); border:1px solid var(--line-2); border-radius:18px; padding:20px 22px 18px; box-shadow:0 30px 80px -20px rgba(0,0,0,.6); transform:translateY(8px) scale(.99); transition:transform .22s var(--ease,ease); }
  .indx.on .indx-box { transform:none; }
  .indx-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
  .indx-head h3 { margin:2px 0 4px; font-size:19px; color:var(--text); letter-spacing:-.01em; }
  .indx-val { font-family:'JetBrains Mono',monospace; font-size:24px; font-weight:600; color:var(--text); }
  .indx-val small { font-size:12px; color:var(--text-3); margin-left:6px; font-weight:500; }
  .indx-val span { font-size:11px; color:var(--text-3); margin-left:12px; font-weight:400; }
  .indx-x { width:34px; height:34px; border-radius:10px; border:1px solid var(--line); background:var(--surface-2); color:var(--text-2); cursor:pointer; font:inherit; font-size:14px; flex:0 0 auto; }
  .indx-x:hover { color:var(--accent-ink); border-color:var(--accent-line); }
  .indx-ctl { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin:14px 0 10px; }
  .indx-ctl .sp { flex:1; }
  .indx-tg { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--text-2); cursor:pointer; padding:4px 10px; border:1px solid var(--line); border-radius:99px; background:var(--surface-2); user-select:none; }
  .indx-tg input { accent-color:var(--accent); margin:0; }
  .indx-cmp { position:relative; display:inline-flex; align-items:center; gap:6px; padding:0 4px 0 10px; border:1px solid var(--line); border-radius:99px; background:var(--surface-2); color:var(--text-2, var(--text)); font-size:12px; }
  .indx-cmp.on { border-color:color-mix(in srgb, #6ea8ff 55%, transparent); }
  .indx-cmp span { color:#6ea8ff; font-weight:700; }
  .indx-cmp select { appearance:none; -webkit-appearance:none; border:0; background:transparent; color:inherit; font:inherit; font-size:12px; padding:5px 18px 5px 0; max-width:190px; cursor:pointer; outline:none;
    background-image:linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%); background-position:calc(100% - 9px) 52%, calc(100% - 5px) 52%; background-size:4px 4px; background-repeat:no-repeat; }
  .indx-cmp select option, .indx-cmp select optgroup { background:var(--surface); color:var(--text); }
  .indx-chart .ln2 { fill:none; stroke:#6ea8ff; stroke-width:2; stroke-linejoin:round; }
  .indx-chart .dot2, .indx-chart .hdot2 { fill:#6ea8ff; stroke:var(--surface); stroke-width:1.5; }
  .indx-chart .ax2 { fill:#6ea8ff; }
  .indx-tip .c2 { color:#6ea8ff; }
  .indx-legend .lg-l1, .indx-legend .lg-l2 { display:inline-block; width:14px; height:3px; border-radius:2px; background:var(--accent); }
  .indx-legend .lg-l2 { background:#6ea8ff; }
  .indx-load.off { animation:none; color:var(--text-3); }
  .indx-load { font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--accent-ink); animation: skelPulse 1.2s ease-in-out infinite; }
  .indx-chart { position:relative; width:100%; min-height:240px; }
  .indx-chart svg { display:block; width:100%; height:auto; cursor:crosshair; font-family:'JetBrains Mono',monospace; }
  .indx-empty { padding:80px 0; text-align:center; color:var(--text-3); font-size:13px; }
  .indx-chart .gv0 { fill:color-mix(in srgb, var(--text) 3%, transparent); } .indx-chart .gv1 { fill:color-mix(in srgb, var(--accent) 5%, transparent); }
  .indx-chart .gvl { stroke:var(--line-2); stroke-width:1; }
  .indx-chart .gvt { font-size:10.5px; fill:var(--text-3); font-family:inherit; letter-spacing:.04em; }
  .indx-chart .gr { stroke:var(--line); stroke-width:1; }
  .indx-chart .ax { font-size:10px; fill:var(--text-3); }
  .indx-chart .zl { stroke:var(--line-2); stroke-dasharray:4 4; }
  .indx-chart .ln { fill:none; stroke:var(--accent); stroke-width:2; stroke-linejoin:round; }
  .indx-chart .ar { fill:color-mix(in srgb, var(--accent) 11%, transparent); }
  .indx-chart .dot { fill:var(--accent); stroke:var(--surface); stroke-width:2; }
  .indx-chart .b-up { fill:color-mix(in srgb, var(--pos) 75%, transparent); } .indx-chart .b-dn { fill:color-mix(in srgb, var(--neg) 75%, transparent); }
  .indx-chart .hx { stroke:var(--text-3); stroke-dasharray:3 3; }
  .indx-chart .hdot { fill:var(--surface); stroke:var(--accent); stroke-width:2; }
  .indx-chart { --c:var(--info, #5aa9ff); }
  .indx-chart .ev { cursor:pointer; }
  .indx-chart .ev line { stroke:var(--c); stroke-width:1; stroke-dasharray:2 3; opacity:.75; }
  .indx-chart .ev circle { fill:var(--surface); stroke:var(--c); stroke-width:1.5; }
  .indx-chart .ev text { font-size:9px; font-weight:700; fill:var(--c); }
  .indx-chart .ev:hover circle, .indx-chart .ev.flash circle { fill:var(--c); } .indx-chart .ev:hover text, .indx-chart .ev.flash text { fill:var(--surface); }
  .indx-chart .ev.flash line { opacity:1; stroke-width:2; stroke-dasharray:none; }
  .ev-juros { --c:var(--accent); } .ev-economia { --c:#5aa9ff; } .ev-geo { --c:#c084fc; } .ev-petroleo { --c:#fb923c; } .ev-saude { --c:#2dd4bf; } .ev-politica { --c:#94a3b8; }
  .indx-tip { position:absolute; z-index:2; max-width:300px; padding:7px 10px; border-radius:9px; background:var(--surface-2); border:1px solid var(--line-2); font-size:12px; line-height:1.45; color:var(--text); pointer-events:none; box-shadow:var(--shadow-sm, 0 8px 20px rgba(0,0,0,.3)); }
  .indx-tip b { font-family:'JetBrains Mono',monospace; font-weight:600; }
  .indx-tip span { color:var(--text-3); font-size:11px; }
  .indx-legend { display:flex; flex-wrap:wrap; gap:6px 14px; align-items:center; margin:10px 0 4px; font-size:11px; color:var(--text-3); }
  .indx-legend .lg { display:inline-flex; align-items:center; gap:6px; }
  .indx-legend .src { margin-left:auto; font-family:'JetBrains Mono',monospace; font-size:10.5px; }
  .lg-gov { width:14px; height:10px; border-radius:2px; background:color-mix(in srgb, var(--accent) 14%, transparent); border:1px solid var(--line-2); }
  .lg-ev { width:9px; height:9px; border-radius:50%; background:var(--c); }
  .indx-evlist h4 { margin:14px 0 8px; font-size:10.5px; letter-spacing:.12em; text-transform:uppercase; color:var(--text-3); }
  .indx-evlist ol { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:repeat(auto-fill, minmax(340px, 1fr)); gap:6px; }
  .indx-evlist li { display:flex; align-items:baseline; gap:10px; padding:7px 10px; border:1px solid var(--line); border-radius:10px; background:var(--surface-2); font-size:12.5px; color:var(--text-2); cursor:pointer; }
  .indx-evlist li:hover { border-color:var(--c); }
  .indx-evlist li b { flex:0 0 auto; width:18px; height:18px; border-radius:50%; display:grid; place-items:center; font-size:9.5px; color:var(--surface); background:var(--c); font-family:'JetBrains Mono',monospace; }
  .indx-evlist .dt { font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--text-3); flex:0 0 auto; }
  .indx-evlist .tx { flex:1; }
  .indx-evlist .vv { font-family:'JetBrains Mono',monospace; font-size:11px; color:var(--text); flex:0 0 auto; }
  .indx-none { font-size:12px; color:var(--text-3); margin:12px 0 0; }
  @media (max-width: 640px) {
    .indx { padding:0; place-items:end stretch; }
    .indx-box { max-height:92vh; border-radius:18px 18px 0 0; padding:16px 14px; }
    .indx-evlist ol { grid-template-columns:1fr; }
    .indx-val { font-size:20px; }
  }
  @media (prefers-reduced-motion: reduce) { .indx, .indx-box { transition:none; } }
  @media (prefers-reduced-motion: reduce) { .ind-area-bar { transition:none; } .ind-about { animation:none; } }
  /* próxima divulgação */
  .ind-next { display:flex; flex-wrap:wrap; align-items:baseline; gap:3px 8px; font-size:11px; color:var(--text-3); }
  .ind-next .k { font-size:9.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; }
  .ind-next b { font-family:'JetBrains Mono',monospace; font-size:11.5px; font-weight:600; color:var(--text); }
  .ind-next span:not(.k) { font-family:'JetBrains Mono',monospace; }
  .ind-next em { font-style:normal; font-size:10.5px; padding:1px 7px; border-radius:99px; border:1px solid var(--line); }
  .ind-next em.hi { color:var(--accent-ink); border-color:var(--accent-line); }
  .ind-next em.lo { color:#6ea8ff; border-color:color-mix(in srgb, #6ea8ff 45%, transparent); }
  .ind-next:not(.done):not(.none) .k { color:var(--accent-ink); }
  .ind-next.none .k { font-weight:600; letter-spacing:.04em; text-transform:none; font-size:10.5px; opacity:.8; }
  /* Focus */
  .ind-focus { display:flex; flex-direction:column; gap:5px; padding:7px 9px; border-radius:9px; border:1px dashed var(--line-2, var(--line)); background:color-mix(in srgb, var(--accent) 4%, transparent); }
  .ind-focus-h { font-size:9.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:var(--text-3); }
  .ind-focus-r { display:flex; flex-wrap:wrap; gap:4px 14px; }
  .ind-focus-r span { display:flex; align-items:baseline; gap:6px; font-size:11px; color:var(--text-3); }
  .ind-focus-r em { font-style:normal; }
  .ind-focus-r b { font-family:'JetBrains Mono',monospace; font-size:12px; font-weight:600; color:var(--text); }
  .ind-focus-r i { font-style:normal; font-family:'JetBrains Mono',monospace; font-size:10px; color:var(--text-3); }
  /* leitura do momento */
  .ind-mo { margin-bottom:26px; }
  .mo-grid { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:14px; }
  .mo-card { display:flex; flex-direction:column; gap:6px; cursor:pointer; overflow:hidden; transition:border-color .18s, transform .18s; }
  .mo-card:hover { border-color:var(--accent-line); }
  .mo-card:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .mo-card.is-loading { cursor:default; min-height:190px; }
  .mo-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .mo-chip { font-size:10.5px; font-weight:700; letter-spacing:.04em; padding:3px 8px; border-radius:999px; border:1px solid var(--line); color:var(--text-2, var(--text)); background:var(--surface-2); white-space:nowrap; }
  .mo-chip.hi2, .mo-chip.hi { color:var(--accent-ink); border-color:var(--accent-line); }
  .mo-chip.hi2 { background:color-mix(in srgb, var(--accent) 14%, transparent); }
  .mo-chip.lo, .mo-chip.lo2 { color:#6ea8ff; border-color:color-mix(in srgb, #6ea8ff 45%, transparent); }
  .mo-chip.lo2 { background:color-mix(in srgb, #6ea8ff 14%, transparent); }
  .mo-chip.bad { color:var(--neg); border-color:color-mix(in srgb, var(--neg) 45%, transparent); background:color-mix(in srgb, var(--neg) 10%, transparent); }
  .mo-chip.good { color:var(--pos-ink); border-color:color-mix(in srgb, var(--pos) 45%, transparent); background:color-mix(in srgb, var(--pos) 10%, transparent); }
  .mo-ruler { margin:10px 4px 2px; }
  .mo-ruler.empty { height:30px; }
  .mo-track { position:relative; height:6px; border-radius:6px; background:var(--surface-2); box-shadow:inset 0 0 0 1px var(--line); }
  .mo-track.grad { background:linear-gradient(90deg, color-mix(in srgb, #6ea8ff 35%, var(--surface-2)), var(--surface-2) 50%, color-mix(in srgb, var(--accent) 40%, var(--surface-2))); }
  .mo-band { position:absolute; top:0; bottom:0; border-radius:6px; background:color-mix(in srgb, var(--pos) 35%, transparent); }
  .mo-tick, .mo-zero { position:absolute; top:-3px; bottom:-3px; width:2px; margin-left:-1px; background:var(--text-3); border-radius:2px; }
  .mo-zero { background:var(--line-2, var(--line)); }
  .mo-dot { position:absolute; top:50%; width:14px; height:14px; margin:-7px 0 0 -7px; border-radius:50%; background:var(--text); box-shadow:0 0 0 3px var(--surface), 0 0 0 4px var(--accent); }
  .mo-lbl { position:relative; height:16px; margin-top:7px; font-family:'JetBrains Mono',monospace; font-size:9.5px; color:var(--text-3); }
  .mo-lbl span { position:absolute; transform:translateX(-50%); white-space:nowrap; }
  .mo-lbl.edge span:first-child { transform:none; }
  .mo-lbl.edge span:last-child { transform:translateX(-100%); }
  .mo-txt { margin:2px 0 0; font-size:12px; color:var(--text); }
  .mo-how { margin:0; font-size:11.5px; color:var(--text-3); line-height:1.45; }
  @media (max-width: 1180px) { .mo-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 640px) {
    .mo-grid { display:flex; overflow-x:auto; scroll-snap-type:x mandatory; gap:10px; margin:0 -16px; padding:0 16px 6px; scrollbar-width:none; }
    .mo-grid::-webkit-scrollbar { display:none; }
    .mo-card { flex:0 0 82%; scroll-snap-align:center; }
  }
  `;
  document.head.appendChild(css);

  renderArea();
  renderMo();
  if (isOpen()) { loadArea(prefs.area); loadMo(); loadFocus(); loadNext(); }
  // pré-carregamento: o index.html baixa este arquivo em segundo plano depois que a página abre,
  // e os dados já ficam prontos (e salvos) antes de a aba ser aberta
  else if (window.__indWarm) { loadMo(); loadArea(prefs.area); loadFocus(); }
  window.Indicadores = { reload: () => { loadArea(prefs.area, true); loadMo(true); loadFocus(true); } };
})();
