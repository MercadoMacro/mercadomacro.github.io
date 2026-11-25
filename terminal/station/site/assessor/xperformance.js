/* Leitura do relatório XPerformance (PDF da XP) e as contas do Relatório do Assessor (24/11/2026).
   Tudo aqui roda no navegador do assessor (e nos testes, em Node): o PDF não vai para o servidor.
   Funções puras, sem tela: linhas do PDF -> carteira -> classes -> régua do cenário -> score -> cenários de estresse. */

// ---------- 1. texto do PDF em linhas com colunas ----------
// itens do pdf.js ({str, transform:[a,b,c,d,x,y], width}) de uma página -> linhas de texto; um vão largo vira "   "
export function linhasDaPagina(itens) {
  const its = itens.filter((i) => i && typeof i.str === 'string' && i.str.trim() !== '').map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.abs(i.transform[3]) || 8 }));
  its.sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas = [];
  for (const it of its) {
    const l = linhas.find((x) => Math.abs(x.y - it.y) <= Math.max(2, it.h * 0.35));
    if (l) l.its.push(it); else linhas.push({ y: it.y, its: [it] });
  }
  linhas.sort((a, b) => b.y - a.y);
  return linhas.map((l) => {
    l.its.sort((a, b) => a.x - b.x);
    let txt = '', fim = null;
    for (const it of l.its) {
      if (fim !== null) { const vao = it.x - fim; txt += vao > it.h * 0.9 ? '   ' : vao > it.h * 0.12 ? ' ' : ''; }
      txt += it.s; fim = it.x + it.w;
    }
    return txt.replace(/\s+$/, '');
  });
}

// ---------- 2. números ----------
export const reais = (s) => { const m = String(s).match(/(-?)R\$\s*(-?)([\d.]+,\d{2})/); if (!m) return null; const v = Number(m[3].replace(/\./g, '').replace(',', '.')); return (m[1] || m[2]) ? -v : v; };
export const pct = (s) => { const m = String(s).match(/(-?[\d.]*\d,\d+)\s*%/); return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : null; };
const celulas = (l) => l.trim().split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// estratégias como a XP chama (o nome da linha-título de cada grupo na Posição Detalhada)
export const ESTRATEGIAS = ['Pós Fixado', 'Inflação', 'Pré Fixado', 'Renda Variável Brasil', 'Renda Variável Global', 'Renda Fixa Global', 'Alternativo', 'Multimercado', 'Fundos Listados', 'Caixa', 'Proventos', 'Criptoativos', 'COE', 'Previdência', 'Ouro', 'Derivativos', 'Opções', 'Fundos Imobiliários'];
const ehEstrategia = (nome) => ESTRATEGIAS.find((e) => semAcento(e) === semAcento(nome)) || null;

// ---------- 3. carteira a partir das linhas ----------
export function lerXPerformance(paginas) {
  const linhas = paginas.flat();
  const out = { conta: null, assessor: null, segmento: null, dataRef: null, patrimonio: null, rent: {}, estrategias: [], ativos: [] };
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (!out.dataRef && /Data de Refer[eê]ncia/i.test(l)) {
      const c = celulas(linhas[i + 1] || '');
      const d = c.find((x) => /^\d{2}\/\d{2}\/\d{4}$/.test(x));
      if (d) { out.dataRef = d; out.conta = c[0] && /^\d{4,}$/.test(c[0]) ? c[0] : null; const resto = c.filter((x) => x !== d && x !== out.conta); out.segmento = resto.length > 1 ? resto[0] : null; out.assessor = resto.length ? resto[resto.length - 1] : null; }
    }
    if (out.patrimonio === null && /PATRIM[OÔ]NIO TOTAL BRUTO/i.test(l.replace(/\s/g, ' '))) {
      for (let k = i; k < i + 4 && k < linhas.length; k++) { const v = reais(k === i ? l.slice(l.search(/R\$/)) : linhas[k]); if (v !== null && (k > i || /R\$/.test(l))) { out.patrimonio = v; break; } }
    }
    const m = l.match(/^\s*(Portf[oó]lio|CDI|Ibovespa|IPCA|D[oó]lar)\s{2,}(.*)$/);
    if (m && !out.rent[m[1]]) { const ps = (m[2].match(/-?[\d.]*\d,\d+%/g) || []).map(pct); if (ps.length === 4) out.rent[semAcento(m[1]).replace('portfolio', 'carteira')] = { mes: ps[0], ano: ps[1], m12: ps[2], m24: ps[3] }; }
  }
  // posição detalhada: só depois do título da seção
  // nomes longos quebram: o nome vem numa linha, os valores na seguinte e às vezes o fim do nome numa terceira
  let dentro = false, grupo = null, ultimo = null, pendente = [], podeEmendar = false;
  for (const l of linhas) {
    const plano = l.replace(/\s+/g, '');
    if (/POSI[CÇ][AÃ]ODETALHADADOSATIVOS/i.test(plano)) { dentro = true; ultimo = null; pendente = []; continue; }
    if (!dentro) continue;
    if (/^MOVIMENTA[CÇ][OÕ]ES/i.test(plano) || /^Legenda/i.test(l.trim())) { dentro = false; ultimo = null; pendente = []; continue; }
    if (/XPerformance|Estrat[eé]gias\s+Saldo|M\s?[EÊ]\s?S\s+A\s?T|PRECIFICA|^\s*P\s?O\s?S\s?I/i.test(l)) { ultimo = null; pendente = []; continue; }
    const c = celulas(l), iR = c.findIndex((x) => /R\$/.test(x));
    if (iR >= 0) {
      let nome = c.slice(0, iR).join(' '); const partido = !nome && pendente.length > 0;
      if (!nome) nome = pendente.join(' ');
      pendente = [];
      if (!nome) continue;
      const saldo = reais(c[iR]), resto = c.slice(iR + 1);
      const qtd = resto[0] && !/%/.test(resto[0]) ? resto.shift() : null;
      const ps = resto.map(pct);
      const est = ehEstrategia(nome);
      if (est && (qtd === '-' || qtd === null)) { grupo = { nome: est, saldo, aloc: ps[0] ?? null, rentMes: ps[1] ?? null, rentAno: ps[3] ?? null, rent24: ps[5] ?? null }; out.estrategias.push(grupo); ultimo = null; podeEmendar = false; continue; }
      ultimo = { nome, estrategia: grupo ? grupo.nome : 'Outros', saldo, qtd: qtd ? Number(qtd.replace(/\./g, '').replace(',', '.')) || null : null, aloc: ps[0] ?? null, rentMes: ps[1] ?? null, rentAno: ps[3] ?? null, rent24: ps[5] ?? null };
      out.ativos.push(ultimo); podeEmendar = partido;
    } else if (!/%/.test(l) && l.trim().length < 80) {
      if (ultimo && podeEmendar) { ultimo.nome += ' ' + l.trim(); podeEmendar = false; }
      else pendente.push(l.trim());
    }
  }
  if (out.patrimonio === null && out.estrategias.length) out.patrimonio = out.estrategias.reduce((s, e) => s + (e.saldo || 0), 0);
  // o que não aparece na Posição Detalhada (caixa, proventos) entra como Caixa
  const somado = out.estrategias.reduce((s, e) => s + (e.saldo || 0), 0);
  if (out.patrimonio && out.patrimonio - somado > 1) out.caixa = Math.round((out.patrimonio - somado) * 100) / 100; else out.caixa = 0;
  return out;
}

// ---------- 4. classes do relatório ----------
export const CLASSES = [
  { id: 'pos', nome: 'Pós-fixado (CDI)' },
  { id: 'inflacao', nome: 'Inflação (IPCA+)' },
  { id: 'pre', nome: 'Prefixado' },
  { id: 'listados', nome: 'Fundos listados (FII e FI-Infra)' },
  { id: 'alternativo', nome: 'Alternativos e multimercado' },
  { id: 'rvbr', nome: 'Renda variável Brasil' },
  { id: 'exterior', nome: 'Exterior e dólar' },
  { id: 'caixa', nome: 'Caixa' },
];
const DA_ESTRATEGIA = { 'Pós Fixado': 'pos', 'Inflação': 'inflacao', 'Pré Fixado': 'pre', 'Fundos Listados': 'listados', 'Fundos Imobiliários': 'listados', 'Alternativo': 'alternativo', 'Multimercado': 'alternativo', 'COE': 'alternativo', 'Derivativos': 'alternativo', 'Opções': 'alternativo', 'Renda Variável Brasil': 'rvbr', 'Renda Variável Global': 'exterior', 'Renda Fixa Global': 'exterior', 'Criptoativos': 'exterior', 'Ouro': 'exterior', 'Caixa': 'caixa', 'Proventos': 'caixa', 'Previdência': 'pos' };
export const classeDaEstrategia = (e) => DA_ESTRATEGIA[e] || 'alternativo';

// o que dá para saber pelo nome do ativo
export function perfilDoAtivo(a) {
  const n = String(a.nome || ''), s = semAcento(n);
  const venc = (n.match(/(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\/(20\d{2})/i) || n.match(/\b(20[2-6]\d)\b/) || [])[1];
  const ticker = (n.match(/^([A-Z]{4}\d{1,2})\b/) || [])[1] || null;
  return {
    ticker,
    vencimento: venc ? Number(venc) : null,
    credito: /\bcp\b|credito|debenture|deb\.|fidc|cri\b|cra\b|corporate|high yield/.test(s) && !/bancario/.test(s) ? true : /\bcp\b/.test(s),
    isento: /\blc[adi]\b|incentivad|\bcri\b|\bcra\b|fii\b|fi-infra|infra/.test(s) || /^[A-Z]{4}11$/.test(ticker || ''),
    fundo: /\bfi[cf]?\b|fif|fundo|fii|feeder|^[A-Z]{4}1[1-3]$/i.test(n) || /^[A-Z]{4}1[1-3]$/.test(ticker || ''),
  };
}

// carteira -> % por classe (sobre o patrimônio) + itens para o score
export function resumoDaCarteira(cart) {
  const total = cart.patrimonio || cart.ativos.reduce((s, a) => s + (a.saldo || 0), 0) + (cart.caixa || 0);
  const por = Object.fromEntries(CLASSES.map((c) => [c.id, 0]));
  for (const a of cart.ativos) por[classeDaEstrategia(a.estrategia)] += a.saldo || 0;
  por.caixa += cart.caixa || 0;
  const pctc = Object.fromEntries(Object.entries(por).map(([k, v]) => [k, total ? (v / total) * 100 : 0]));
  const ativos = cart.ativos.map((a) => ({ ...a, ...perfilDoAtivo(a), classe: classeDaEstrategia(a.estrategia), peso: total ? ((a.saldo || 0) / total) * 100 : 0 })).sort((x, y) => y.peso - x.peso);
  const credito = ativos.filter((a) => a.credito).reduce((s, a) => s + a.peso, 0);
  return { total, valores: por, pct: pctc, ativos, maior: ativos[0] || null, credito };
}

// ---------- 5. cenário e régua ----------
// cenário a partir de: selic (meta), ipca12 (IPCA em 12 meses), focusIpca (próximos 12 meses ~ ano seguinte), focusSelic (fim do ano seguinte)
export function lerCenario(d) {
  const jurosNivel = d.selic >= 12 ? 'muito altos' : d.selic >= 9 ? 'altos' : d.selic >= 6 ? 'neutros' : 'baixos';
  const dir = d.focusSelic == null ? 'estavel' : d.focusSelic <= d.selic - 0.75 ? 'queda' : d.focusSelic >= d.selic + 0.75 ? 'alta' : 'estavel';
  const infl = d.ipca12 > 4.5 ? 'acima do teto' : d.ipca12 > 3.25 ? 'acima do centro da meta' : d.ipca12 >= 1.5 ? 'na meta' : 'abaixo da meta';
  const inflDir = d.focusIpca == null ? 'estavel' : d.focusIpca <= d.ipca12 - 0.4 ? 'queda' : d.focusIpca >= d.ipca12 + 0.4 ? 'alta' : 'estavel';
  const real = d.focusIpca != null ? ((1 + d.selic / 100) / (1 + d.focusIpca / 100) - 1) * 100 : ((1 + d.selic / 100) / (1 + d.ipca12 / 100) - 1) * 100;
  const frases = [
    `Juros ${jurosNivel} (Selic ${fmt(d.selic)}%)${dir === 'queda' ? ', com queda esperada pelo mercado' : dir === 'alta' ? ', com alta esperada pelo mercado' : ', sem grande mudança esperada'}.`,
    `Inflação ${infl} (IPCA ${fmt(d.ipca12)}% em 12 meses)${inflDir === 'queda' ? ', com tendência de desaceleração' : inflDir === 'alta' ? ', com tendência de alta' : ''}.`,
    `Juro real perto de ${fmt(real)}% ao ano${real >= 6 ? ', muito alto para a história do país' : real >= 4 ? ', alto' : ''}.`,
  ];
  return { ...d, jurosNivel, dir, infl, inflDir, real, frases };
}
const fmt = (v, c = 2) => (v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));

// faixas-base por perfil (% do patrimônio), ajustadas pelo cenário. É um ponto de partida: o assessor edita na tela.
const BASE = {
  conservador: { pos: [45, 70], inflacao: [10, 25], pre: [0, 10], listados: [0, 10], alternativo: [0, 5], rvbr: [0, 5], exterior: [0, 5], caixa: [2, 10] },
  moderado: { pos: [30, 50], inflacao: [15, 30], pre: [5, 15], listados: [5, 15], alternativo: [0, 10], rvbr: [5, 15], exterior: [5, 10], caixa: [2, 8] },
  arrojado: { pos: [15, 35], inflacao: [10, 25], pre: [5, 15], listados: [5, 15], alternativo: [5, 15], rvbr: [15, 30], exterior: [10, 20], caixa: [1, 5] },
};
export function reguaDoCenario(perfil, cen) {
  const r = JSON.parse(JSON.stringify(BASE[perfil] || BASE.moderado)), motivos = [];
  const mexe = (k, d) => { r[k] = [Math.max(0, r[k][0] + d), Math.max(0, r[k][1] + d)]; };
  if ((cen.jurosNivel === 'muito altos' || cen.jurosNivel === 'altos') && cen.dir === 'queda') { mexe('pre', 5); mexe('inflacao', 5); mexe('pos', -10); motivos.push('Juros altos com queda esperada: mais espaço para prefixados e IPCA+, que ganham quando os juros caem.'); }
  else if (cen.dir === 'alta') { mexe('pos', 10); mexe('pre', -5); mexe('rvbr', -5); motivos.push('Alta de juros esperada: mais pós-fixado e menos prefixado e bolsa, que sofrem com juros subindo.'); }
  else if (cen.jurosNivel === 'muito altos') { mexe('pos', 5); mexe('rvbr', -5); motivos.push('Juros muito altos e parados: o pós-fixado paga bem sem risco de preço.'); }
  if (cen.infl === 'acima do teto' || cen.inflDir === 'alta') { mexe('inflacao', 5); mexe('pre', -5); motivos.push('Inflação acima da meta ou subindo: mais proteção em títulos atrelados ao IPCA.'); }
  if (cen.real >= 6) motivos.push('Juro real muito alto: travar taxa real longa (IPCA+) tende a ser uma oportunidade.');
  for (const k of Object.keys(r)) r[k] = [Math.max(0, Math.min(100, r[k][0])), Math.max(0, Math.min(100, r[k][1]))];
  return { faixas: r, motivos };
}

// ---------- 6. score ----------
export function scoreDaCarteira(res, faixas, cen) {
  const itens = [];
  // aderência à régua (40)
  let fora = 0; const desvios = [];
  for (const c of CLASSES) { const v = res.pct[c.id] || 0, [lo, hi] = faixas[c.id] || [0, 100]; const d = v < lo ? lo - v : v > hi ? v - hi : 0; fora += d; if (d >= 0.5) desvios.push({ classe: c.id, nome: c.nome, atual: v, lo, hi, falta: v < lo ? lo - v : 0, sobra: v > hi ? v - hi : 0 }); }
  const ader = Math.max(0, 40 - fora * 0.8);
  itens.push({ id: 'aderencia', nome: 'Aderência ao cenário', pontos: ader, max: 40, nota: desvios.length ? `${desvios.length} classe(s) fora da faixa, somando ${fmt(fora, 1)} pontos percentuais de desvio.` : 'Todas as classes dentro da faixa do cenário.' });
  // concentração (20)
  const mx = res.maior ? res.maior.peso : 0;
  const conc = mx <= 10 ? 20 : mx >= 30 ? 0 : 20 * (30 - mx) / 20;
  itens.push({ id: 'concentracao', nome: 'Concentração', pontos: conc, max: 20, nota: res.maior ? `Maior posição: ${res.maior.nome} com ${fmt(mx, 1)}% do patrimônio.` : 'Sem posições.' });
  // proteção contra inflação (15)
  const alvo = cen.infl === 'acima do teto' || cen.inflDir === 'alta' ? 20 : 12;
  const prot = res.pct.inflacao || 0;
  itens.push({ id: 'inflacao', nome: 'Proteção contra inflação', pontos: Math.min(15, (prot / alvo) * 15), max: 15, nota: `${fmt(prot, 1)}% em ativos ligados ao IPCA; referência para o cenário: ${alvo}%.` });
  // crédito privado (10)
  const cred = res.credito;
  itens.push({ id: 'credito', nome: 'Crédito privado', pontos: cred <= 30 ? 10 : cred >= 60 ? 0 : 10 * (60 - cred) / 30, max: 10, nota: `${fmt(cred, 1)}% em crédito privado identificado pelo nome (fundos CP, debêntures, CRI/CRA).` });
  // caixa (15)
  const cx = res.pct.caixa || 0;
  const pcx = cx >= 2 && cx <= 10 ? 15 : cx < 2 ? 8 : cx >= 25 ? 0 : 15 * (25 - cx) / 15;
  itens.push({ id: 'caixa', nome: 'Caixa e liquidez', pontos: pcx, max: 15, nota: `${fmt(cx, 1)}% em caixa${cx > 10 ? ': dinheiro parado rende menos que a carteira' : cx < 2 ? ': pouca reserva para oportunidades' : ''}.` });
  const total = Math.round(itens.reduce((s, i) => s + i.pontos, 0));
  return { total, itens, desvios, faixaTexto: total >= 80 ? 'Bem alinhada ao cenário' : total >= 60 ? 'Alinhada, com ajustes pontuais' : total >= 40 ? 'Pede ajustes' : 'Desalinhada do cenário' };
}

// ---------- 7. cenários de estresse (estimativas simples, efeito imediato no preço) ----------
// premissas: prefixado perde ~duração x alta da taxa; IPCA+ idem com metade do choque no juro real; fundos listados -4% por ponto;
// bolsa -6% por ponto de Selic; exterior acompanha 90% do dólar; pós-fixado e caixa quase não mudam de preço
export function estresse(res, anoRef) {
  const dur = (a, padrao) => { const anos = a.vencimento ? Math.max(0.5, a.vencimento - anoRef) : padrao; return Math.min(8, anos * 0.75); };
  const cen = [
    { id: 'sobe2', nome: 'Juros sobem 2 pontos', dj: 2, dd: 0 },
    { id: 'cai2', nome: 'Juros caem 2 pontos', dj: -2, dd: 0 },
    { id: 'dolar15', nome: 'Dólar sobe 15%', dj: 0, dd: 15 },
  ];
  return cen.map((c) => {
    let efeito = 0;
    for (const a of res.ativos) {
      const p = a.peso / 100;
      if (a.classe === 'pre') efeito += p * -dur(a, 3) * c.dj;
      else if (a.classe === 'inflacao') efeito += p * -dur(a, 5) * c.dj * 0.5;
      else if (a.classe === 'listados') efeito += p * -4 * c.dj;
      else if (a.classe === 'rvbr') efeito += p * (-6 * c.dj - 0.2 * c.dd);
      else if (a.classe === 'exterior') efeito += p * 0.9 * c.dd;
      else if (a.classe === 'alternativo') efeito += p * -2 * c.dj;
    }
    return { ...c, efeito, reais: (efeito / 100) * res.total };
  });
}
