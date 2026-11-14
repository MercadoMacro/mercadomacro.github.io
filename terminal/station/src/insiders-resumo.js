/* Insiders para a Jade (14/11/2026, pedido do Dante): resume o insiders.json (robô semanal da CVM, Resolução CVM 44)
   para uma empresa ou para o mercado todo. Usado pela ferramenta "insiders" da Jade no site (assistente-dados.js) e
   pela Jade no WhatsApp (JadeWatchlist.insiders, em jade-whatsapp.js). Sem IA: só soma e organiza os números.
   Valores do arquivo em R$ mil. Só compra e venda à vista de ações e units; recompra da empresa (tesouraria) não entra. */
export const URL_INSIDERS = 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/insiders/insiders.json';
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesTxt = (m) => `${MES[+m.slice(5, 7) - 1]}/${m.slice(0, 4)}`;
const sem = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
// palavras que não identificam empresa ("dos diretores da VALE" → só VALE)
const COMUNS = new Set(['BANCO', 'COMPANHIA', 'CIA', 'BRASIL', 'BRASILEIRA', 'PARTICIPACOES', 'PARTICIPACAO', 'HOLDING', 'GRUPO', 'ENERGIA', 'INVESTIMENTOS', 'DIRETORES', 'DIRETORIA', 'CONTROLADORES', 'COMPRARAM', 'VENDERAM', 'INSIDERS', 'ACOES', 'ESSE', 'ESTE', 'ANO', 'MESES', 'QUEM', 'COMPRANDO', 'VENDENDO', 'SERVICOS', 'SISTEMAS', 'NACIONAL', 'GERAL', 'INTERNACIONAL', 'MINAS', 'GERAIS', 'PAULO', 'SAO', 'RIO', 'COMPRA', 'COMPRAS', 'VENDA', 'VENDAS', 'ESTAO', 'FORAM', 'TODOS', 'MAIS', 'MENOS', 'PARA', 'DESDE', 'TEVE', 'TIVERAM', 'ULTIMOS', 'CONSELHO', 'ADMINISTRACAO']);

let cache = null;
export async function carregarInsiders(f = fetch) {
  if (cache && Date.now() - cache.t < 30 * 60000) return cache.v;
  const r = await f(URL_INSIDERS, { cf: { cacheTtl: 600 } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const v = await r.json();
  if (!Array.isArray(v?.meses) || !Array.isArray(v?.emp)) throw new Error('formato');
  cache = { t: Date.now(), v };
  return v;
}

// acha a empresa pelo código (VALE3, PETR4), pela raiz do código (VALE, PETR) ou por um nome que aparece no texto
export function acharEmpresa(dados, texto) {
  const T = ' ' + sem(texto).replace(/[^A-Z0-9]+/g, ' ').trim() + ' ';
  const cod = T.match(/\b[A-Z]{4}\d{1,2}\b/g) || [];
  for (const c of cod) {
    const e = dados.emp.find((x) => x.t.includes(c));
    if (e) return [e];
  }
  const raizes = new Set(cod.map((c) => c.slice(0, 4)));
  const porRaiz = dados.emp.filter((x) => x.t.some((t) => raizes.has(t.slice(0, 4)) || T.includes(' ' + t.slice(0, 4) + ' ')));
  const porNome = dados.emp.filter((x) => {
    const inteiro = sem(x.n).replace(/[^A-Z0-9]+/g, ' ').replace(/\b(S A|SA|S|A|CIA|LTDA)\s*$/, '').trim();
    // nome inteiro no texto ("BANCO DO BRASIL")
    if (inteiro.length >= 6 && T.includes(' ' + inteiro + ' ')) return true;
    const p = inteiro.split(' ').filter((w) => w.length >= 3 && !COMUNS.has(w));
    // a primeira palavra que identifica a empresa ("PETROBRAS", "ITAU", "MAGAZINE")
    return !!p.length && T.includes(' ' + p[0] + ' ');
  });
  const l = [...new Map([...porRaiz, ...porNome].map((e) => [e.n, e])).values()];
  return l;
}

// período: "esse ano" (desde janeiro), "N meses", "desde 2024" ou o padrão (12 meses)
export function periodoDoTexto(texto, agora = new Date()) {
  const t = sem(texto);
  const ano = agora.getUTCFullYear();
  if (/\b(ESSE|ESTE|NESTE|NESSE|DESTE|DESSE) ANO\b|\bNO ANO\b|\bANO ATUAL\b/.test(t)) return { desde: `${ano}-01` };
  const m = t.match(/\b(\d{1,2}) MESES\b/);
  if (m) return { meses: Math.min(Math.max(+m[1], 1), 60) };
  const d = t.match(/\bDESDE (20\d\d)\b|\bEM (20\d\d)\b/);
  if (d) { const a = +(d[1] || d[2]); return a === ano ? { desde: `${a}-01` } : d[2] ? { desde: `${a}-01`, ate: `${a}-12` } : { desde: `${a}-01` }; }
  if (/\bANO PASSADO\b/.test(t)) return { desde: `${ano - 1}-01`, ate: `${ano - 1}-12` };
  return { meses: 12 };
}

function janela(dados, p) {
  const M = dados.meses;
  let i0, i1 = M.length - 1;
  if (p.desde) { const k = M.findIndex((m) => m >= p.desde); i0 = k < 0 ? M.length - 1 : k; }
  else i0 = Math.max(0, M.length - (p.meses || 12));
  if (p.ate) { let k = -1; M.forEach((m, i) => { if (m <= p.ate) k = i; }); if (k >= 0) i1 = k; }
  return [i0, Math.max(i0, i1)];
}
const reais = (mil) => Math.round(mil * 1000);

// resumo de uma empresa (dados em R$) ou, sem empresa, os destaques do mercado no período
export function resumoInsiders(dados, { empresa = null, periodo = { meses: 12 } } = {}) {
  const [i0, i1] = janela(dados, periodo);
  const M = dados.meses;
  const base = {
    periodo: `${mesTxt(M[i0])} a ${mesTxt(M[i1])}`,
    ultimo_mes_informado: mesTxt(M[M.length - 1]),
    meses_ainda_chegando: (dados.parciais || []).map(mesTxt),
    fonte: 'CVM, Dados Abertos (Valores Mobiliários Negociados e Detidos, Resolução CVM 44)',
    regras: 'Só compra e venda à vista de ações e units da própria empresa por controladores e administradores (conselhos, diretoria). Recompras feitas pela própria empresa (tesouraria) não entram. As empresas entregam até o dia 10 do mês seguinte.',
  };
  if (empresa) {
    const e = empresa;
    let cc = 0, vc = 0, ca = 0, va = 0;
    const porMes = [];
    for (let i = i0; i <= i1; i++) {
      const v = e.m[String(i)];
      if (!v) continue;
      cc += v[0]; vc += v[1]; ca += v[2]; va += v[3];
      porMes.push({ mes: mesTxt(M[i]), compras: reais(v[0] + v[2]), vendas: reais(v[1] + v[3]) });
    }
    const ops = (dados.ops || []).filter((o) => o[0] === dados.emp.indexOf(e)).slice(0, 6)
      .map(([, cargo, op, dia, q, p, vol, classe]) => ({ data: dia, quem: cargo, operacao: op === 'C' ? 'compra' : 'venda', quantidade: q, preco: p, volume: reais(vol), classe }));
    return {
      ...base, empresa: e.n, tickers: e.t, setor: dados.setores[e.s], unidade: 'R$',
      controladores: { compras: reais(cc), vendas: reais(vc), saldo: reais(cc - vc) },
      administracao: { compras: reais(ca), vendas: reais(va), saldo: reais(ca - va) },
      total: { compras: reais(cc + ca), vendas: reais(vc + va), saldo: reais(cc + ca - vc - va) },
      meses_com_negocios: porMes.slice(-12),
      operacoes_recentes_acima_de_1_milhao: ops,
      sem_negocios: !porMes.length,
    };
  }
  const soma = dados.emp.map((e) => {
    let c = 0, v = 0, ca = 0, va = 0;
    for (let i = i0; i <= i1; i++) { const x = e.m[String(i)]; if (x) { c += x[0] + x[2]; v += x[1] + x[3]; ca += x[2]; va += x[3]; } }
    return { e, l: c - v, la: ca - va };
  });
  const top = (l, f, n = 5) => l.filter(f).slice(0, n).map((x) => ({ empresa: x.e.n, ticker: x.e.t[0], saldo: reais(x.l) }));
  const porL = [...soma].sort((a, b) => b.l - a.l), porA = [...soma].sort((a, b) => b.la - a.la);
  return {
    ...base, unidade: 'R$',
    maiores_compras: top(porL, (x) => x.l > 0),
    maiores_vendas: top([...porL].reverse(), (x) => x.l < 0),
    administracao_mais_compra: porA.filter((x) => x.la > 0).slice(0, 5).map((x) => ({ empresa: x.e.n, ticker: x.e.t[0], saldo: reais(x.la) })),
  };
}

const brl = (r) => {
  const a = Math.abs(r), s = r < 0 ? '−' : r > 0 ? '+' : '';
  if (a >= 1e9) return `${s}R$ ${(a / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} bi`;
  if (a >= 1e6) return `${s}R$ ${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (a >= 1e3) return `${s}R$ ${Math.round(a / 1e3).toLocaleString('pt-BR')} mil`;
  return `${s}R$ ${Math.round(a).toLocaleString('pt-BR')}`;
};
const semSinal = (r) => brl(Math.abs(r)).replace(/^[+−]/, '');

// texto pronto para o WhatsApp
export function textoInsiders(r) {
  const fim = `\n\nFonte: CVM (Resolução CVM 44). Último mês informado: ${r.ultimo_mes_informado}${r.meses_ainda_chegando.length ? ` (${r.meses_ainda_chegando.join(', ')} ainda chegando)` : ''}. Recompras da própria empresa não entram. Não é recomendação.\nRadar completo: https://mercadomacro.com.br/ (Macro e Fluxo › Insiders)`;
  if (r.empresa) {
    const cab = `*Insiders · ${r.empresa} (${r.tickers.join(', ')})*\n${r.periodo}`;
    if (r.sem_negocios) return cab + '\n\nNenhuma compra ou venda à vista de controladores ou administradores informada nesse período.' + fim;
    const linha = (t, x) => !x.compras && !x.vendas ? `• ${t}: sem compras nem vendas no período` : `• ${t}: compras ${semSinal(x.compras)} · vendas ${semSinal(x.vendas)} · saldo *${brl(x.saldo)}*`;
    let s = cab + '\n\n' + linha('Controladores', r.controladores) + '\n' + linha('Conselhos e diretoria', r.administracao);
    if (r.operacoes_recentes_acima_de_1_milhao.length) {
      s += '\n\n*Operações recentes acima de R$ 1 milhão*\n' + r.operacoes_recentes_acima_de_1_milhao.slice(0, 4)
        .map((o) => `• ${o.data.slice(8, 10)}/${o.data.slice(5, 7)} · ${o.quem} · ${o.operacao} de ${o.quantidade.toLocaleString('pt-BR')} ${o.classe || 'ações'} a R$ ${o.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${semSinal(o.volume)})`).join('\n');
    }
    return s + fim;
  }
  const lista = (l) => l.length ? l.map((x) => `• ${x.ticker} (${x.empresa}): ${brl(x.saldo)}`).join('\n') : '• nenhuma';
  return `*Insiders · ${r.periodo}*\n\n*Mais compraram (todos)*\n${lista(r.maiores_compras)}\n\n*Mais venderam*\n${lista(r.maiores_vendas)}\n\n*Conselhos e diretoria mais compraram*\n${lista(r.administracao_mais_compra)}\n\nPara ver uma empresa, mande por exemplo: insiders VALE3 esse ano` + fim;
}
