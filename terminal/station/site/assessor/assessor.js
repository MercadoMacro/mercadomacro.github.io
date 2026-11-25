/* Relatório do Assessor (24/11/2026): lê o XPerformance no navegador, cruza com o cenário macro do terminal
   (Banco Central, Boletim Focus, dólar) e monta um relatório A4 para o assessor apresentar ao cliente.
   O PDF não sai deste computador; o comentário da IA recebe só percentuais por classe (sem nome, conta ou valores). */
import * as pdfjs from '/assessor/vendor/pdf.min.mjs';
import { linhasDaPagina, lerXPerformance, resumoDaCarteira, CLASSES, lerCenario, reguaDoCenario, scoreDaCarteira, estresse } from '/assessor/xperformance.js?v=1';

pdfjs.GlobalWorkerOptions.workerSrc = '/assessor/vendor/pdf.worker.min.mjs';
const $ = (id) => document.getElementById(id);
const M = window.MM || {};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (v, c = 2) => (v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c }));
const brl = (v, c = 2) => (v == null || !isFinite(v) ? '—' : 'R$ ' + nf(v, c));
const guarda = { ler(k, p) { try { const v = localStorage.getItem('mm_assessor_' + k); return v == null ? p : JSON.parse(v); } catch (e) { return p; } }, por(k, v) { try { localStorage.setItem('mm_assessor_' + k, JSON.stringify(v)); } catch (e) { /* sem espaço: segue sem guardar */ } } };
const diz = (t, tipo) => { const m = $('msg'); m.className = 'msg ' + (tipo || ''); m.textContent = t || ''; };

const estado = { carteira: null, resumo: null, cenario: null, regua: null, logo: guarda.ler('logo', null) };

/* ---------- dados guardados do assessor ---------- */
for (const [id, k] of [['f-assessor', 'assessor'], ['f-escritorio', 'escritorio'], ['f-contato', 'contato']]) {
  $(id).value = guarda.ler(k, '');
  $(id).addEventListener('input', () => guarda.por(k, $(id).value.trim()));
}
$('f-perfil').addEventListener('change', () => { montarRegua(true); });
$('f-logo').addEventListener('change', () => {
  const f = $('f-logo').files[0]; if (!f) return;
  if (f.size > 400000) { diz('Logotipo muito grande: use uma imagem com menos de 400 KB.', 'erro'); return; }
  const r = new FileReader(); r.onload = () => { estado.logo = r.result; guarda.por('logo', r.result); diz('Logotipo guardado neste navegador.', 'ok'); }; r.readAsDataURL(f);
});

/* ---------- 1. PDF ---------- */
const area = $('area-pdf');
['dragenter', 'dragover'].forEach((e) => area.addEventListener(e, (ev) => { ev.preventDefault(); area.classList.add('sobre'); }));
['dragleave', 'drop'].forEach((e) => area.addEventListener(e, (ev) => { ev.preventDefault(); area.classList.remove('sobre'); }));
area.addEventListener('drop', (ev) => { const f = ev.dataTransfer.files[0]; if (f) lerPdf(f); });
$('pdf').addEventListener('change', () => { const f = $('pdf').files[0]; if (f) lerPdf(f); });

async function lerPdf(arquivo) {
  $('pdf-status').textContent = 'Lendo o PDF…'; area.classList.remove('ok');
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
    const paginas = [];
    for (let i = 1; i <= doc.numPages; i++) { const p = await doc.getPage(i); paginas.push(linhasDaPagina((await p.getTextContent()).items)); }
    const c = lerXPerformance(paginas);
    if (!c.ativos.length || !c.patrimonio) throw new Error('Não encontrei a Posição Detalhada. Confira se é o XPerformance (Relatório de Investimentos da XP).');
    estado.carteira = c; estado.resumo = resumoDaCarteira(c);
    if (!$('f-assessor').value && c.assessor) { $('f-assessor').value = c.assessor; guarda.por('assessor', c.assessor); }
    $('pdf-status').textContent = `Lido: ${c.ativos.length} ativos, patrimônio ${brl(c.patrimonio)}, referência ${c.dataRef || '—'}.`;
    area.classList.add('ok');
    montarRegua(false); liberar();
  } catch (e) {
    $('pdf-status').textContent = e.message || 'Não foi possível ler este PDF.'; estado.carteira = null; liberar();
  }
}

/* ---------- cenário (dados do terminal) ---------- */
const FOCUS = 'https://raw.githubusercontent.com/MercadoMacro/mercadomacro.github.io/main/terminal/historico/focus.json';
async function buscarCenario() {
  const ult = (s) => s[s.length - 1];
  const [selic, ipca, cdi, focus, cot] = await Promise.all([
    M.serie(432).then(ult).catch(() => null),
    M.serie(13522).then(ult).catch(() => null),
    M.serie(4389).then(ult).catch(() => null),
    fetch(FOCUS).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    M.cotacoes ? M.cotacoes(['BRL=X', '^BVSP']).catch(() => ({})) : Promise.resolve({}),
  ]);
  if (!selic || !ipca) throw new Error('Não consegui buscar Selic e IPCA no Banco Central agora. Tente de novo em instantes.');
  const ano = new Date().getFullYear();
  const fval = (ind, a) => { const s = focus && focus.ind && focus.ind[ind] && focus.ind[ind][String(a)]; return s && s.length ? s[s.length - 1][1] : null; };
  let dataFocus = null;
  try { const s = focus.ind.IPCA[String(ano + 1)]; dataFocus = s[s.length - 1][0]; } catch (e) { /* sem data */ }
  return lerCenario({
    selic: selic.v, ipca12: ipca.v, cdi: cdi ? cdi.v : null,
    focusIpca: fval('IPCA', ano + 1), focusIpcaAno: fval('IPCA', ano), focusSelic: fval('Selic', ano + 1), focusSelicAno: fval('Selic', ano), focusCambio: fval('Câmbio', ano + 1),
    dolar: cot['BRL=X'] ? cot['BRL=X'].v : null, ibov: cot['^BVSP'] ? cot['^BVSP'].v : null,
    dataFocus, ano,
  });
}

/* ---------- 3. régua ---------- */
function montarRegua(perfilMudou) {
  if (!estado.cenario) return;
  const perfil = $('f-perfil').value;
  const sugerida = reguaDoCenario(perfil, estado.cenario);
  const salva = perfilMudou ? null : guarda.ler('regua_' + perfil, null);
  estado.regua = { faixas: salva || sugerida.faixas, motivos: sugerida.motivos, editada: !!salva };
  $('regua-nota').textContent = estado.regua.editada ? 'editada por você' : 'sugerida para o cenário';
  const pctAt = estado.resumo ? estado.resumo.pct : {};
  $('regua').innerHTML = '<div class="lin cab"><span>Classe</span><span>mín. %</span><span>máx. %</span><span>atual</span></div>' + CLASSES.map((c) => {
    const [lo, hi] = estado.regua.faixas[c.id];
    return `<div class="lin"><span>${esc(c.nome)}</span><input type="number" min="0" max="100" step="1" value="${lo}" data-c="${c.id}" data-i="0" aria-label="${esc(c.nome)} mínimo"><input type="number" min="0" max="100" step="1" value="${hi}" data-c="${c.id}" data-i="1" aria-label="${esc(c.nome)} máximo"><span class="at">${estado.resumo ? nf(pctAt[c.id], 1) + '%' : ''}</span></div>`;
  }).join('');
  $('regua').querySelectorAll('input').forEach((i) => i.addEventListener('change', () => {
    const v = Math.max(0, Math.min(100, Number(i.value) || 0)); i.value = v;
    estado.regua.faixas[i.dataset.c][Number(i.dataset.i)] = v; estado.regua.editada = true;
    guarda.por('regua_' + perfil, estado.regua.faixas); $('regua-nota').textContent = 'editada por você';
  }));
}
$('regua-padrao').addEventListener('click', () => { try { localStorage.removeItem('mm_assessor_regua_' + $('f-perfil').value); } catch (e) { /* ok */ } montarRegua(true); });

function liberar() { const ok = !!(estado.carteira && estado.cenario); $('gerar').disabled = !ok; }

/* ---------- comentário da IA (só agregados) ---------- */
async function comentarioIA(score, res, est) {
  const corpo = {
    perfil: $('f-perfil').value,
    cenario: { frases: estado.cenario.frases, motivos: estado.regua.motivos },
    classes: CLASSES.map((c) => ({ nome: c.nome, atual: Math.round(res.pct[c.id] * 10) / 10, faixa: estado.regua.faixas[c.id] })),
    score: { total: score.total, leitura: score.faixaTexto, itens: score.itens.map((i) => ({ nome: i.nome, pontos: Math.round(i.pontos), max: i.max })) },
    maiorPeso: res.maior ? Math.round(res.maior.peso * 10) / 10 : null,
    credito: Math.round(res.credito * 10) / 10,
    estresse: est.map((e) => ({ nome: e.nome, efeito: Math.round(e.efeito * 100) / 100 })),
  };
  const r = await fetch('/api/assessor/texto', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro || 'A IA não respondeu agora.');
  return j;
}

/* ---------- gráficos (SVG) ---------- */
function gauge(v) {
  const cor = v >= 80 ? '#15803d' : v >= 60 ? '#65a30d' : v >= 40 ? '#d97706' : '#dc2626';
  const ang = Math.PI * (1 - v / 100), cx = 75, cy = 78, r = 60;
  const x = cx + r * Math.cos(ang), y = cy - r * Math.sin(ang);
  return `<svg class="gauge" viewBox="0 0 150 96" width="150" role="img" aria-label="Score ${v} de 100"><path d="M15 78 A60 60 0 0 1 135 78" fill="none" stroke="#e5e9f0" stroke-width="13" stroke-linecap="round"/><path d="M15 78 A60 60 0 ${v > 50 ? 1 : 0} 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${cor}" stroke-width="13" stroke-linecap="round"/><text x="75" y="72" text-anchor="middle" font-size="30" font-weight="800" fill="#14213d">${v}</text><text x="75" y="92" text-anchor="middle" font-size="10" fill="#56627a">de 100</text></svg>`;
}
function graficoRegua(res, faixas) {
  const W = 640, L = 190, R = 52, linha = 30, H = CLASSES.length * linha + 26;
  const max = Math.max(60, ...CLASSES.map((c) => Math.max(res.pct[c.id] || 0, faixas[c.id][1]))) + 5;
  const X = (v) => L + (W - L - R) * (v / max);
  let s = '';
  for (let t = 0; t <= max; t += 10) s += `<line x1="${X(t)}" x2="${X(t)}" y1="4" y2="${H - 20}" stroke="#eef1f6"/><text x="${X(t)}" y="${H - 6}" font-size="9" text-anchor="middle" fill="#56627a">${t}%</text>`;
  CLASSES.forEach((c, i) => {
    const y = 8 + i * linha, v = res.pct[c.id] || 0, [lo, hi] = faixas[c.id], dentro = v >= lo - 0.5 && v <= hi + 0.5;
    s += `<text x="0" y="${y + 13}" font-size="10" fill="#14213d">${esc(c.nome)}</text>`;
    s += `<rect x="${X(lo)}" y="${y + 3}" width="${Math.max(2, X(hi) - X(lo))}" height="14" rx="3" fill="#14213d" fill-opacity="0.12" stroke="#14213d" stroke-opacity="0.35"/>`;
    s += `<circle cx="${X(v)}" cy="${y + 10}" r="6" fill="${dentro ? '#15803d' : '#d97706'}" stroke="#fff" stroke-width="1.5"/>`;
    s += `<text x="${W - 4}" y="${y + 14}" font-size="10" text-anchor="end" font-weight="700" fill="${dentro ? '#15803d' : '#b45309'}">${nf(v, 1)}%</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Carteira atual e faixa de referência por classe">${s}</svg>`;
}
function graficoEstresse(est) {
  const W = 640, L = 170, linha = 34, H = est.length * linha + 10, max = Math.max(2, ...est.map((e) => Math.abs(e.efeito))) * 1.15;
  const meio = L + (W - L) / 2, X = (v) => meio + ((W - L) / 2 - 120) * (v / max);
  let s = `<line x1="${meio}" x2="${meio}" y1="2" y2="${H - 4}" stroke="#94a3b8"/>`;
  est.forEach((e, i) => {
    const y = 6 + i * linha, x0 = Math.min(meio, X(e.efeito)), w = Math.abs(X(e.efeito) - meio), neg = e.efeito < 0;
    s += `<text x="0" y="${y + 15}" font-size="10" fill="#14213d">${esc(e.nome)}</text>`;
    s += `<rect x="${x0}" y="${y + 4}" width="${Math.max(1, w)}" height="16" rx="3" fill="${neg ? '#dc2626' : '#15803d'}" fill-opacity="0.85"/>`;
    s += `<text x="${neg ? x0 - 6 : x0 + w + 6}" y="${y + 16}" font-size="9.5" text-anchor="${neg ? 'end' : 'start'}" fill="#14213d" font-weight="700">${e.efeito >= 0 ? '+' : ''}${nf(e.efeito, 1)}% (${e.reais >= 0 ? '+' : '−'}${brl(Math.abs(e.reais), 0)})</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Efeito estimado de choques na carteira">${s}</svg>`;
}

/* ---------- relatório ---------- */
const CORES_SELO = { 'Bem alinhada ao cenário': ['#dcfce7', '#166534'], 'Alinhada, com ajustes pontuais': ['#ecfccb', '#3f6212'], 'Pede ajustes': ['#fef3c7', '#92400e'], 'Desalinhada do cenário': ['#fee2e2', '#991b1b'] };
function folha(conteudo, n, total, info) {
  return `<article class="folha">${conteudo}<footer class="rodape"><span>${esc(info.escritorio || info.assessor || '')}${info.contato ? ' · ' + esc(info.contato) : ''}</span><span>Gerado com Mercado Macro · ${esc(info.hoje)} · página ${n} de ${total}</span></footer></article>`;
}
function topo(info) {
  return `<header class="topo"><div class="logo">${estado.logo ? `<img src="${esc(estado.logo)}" alt="">` : `<div class="esc">${esc(info.escritorio || info.assessor || 'Relatório de alocação')}</div>`}</div><div class="doc"><b>Carteira e cenário macro</b><span>Relatório de alocação · ${esc(info.hoje)}</span></div></header>`;
}

async function gerar() {
  const c = estado.carteira, res = estado.resumo, cen = estado.cenario, faixas = estado.regua.faixas;
  const score = scoreDaCarteira(res, faixas, cen), est = estresse(res, cen.ano || new Date().getFullYear());
  const info = { cliente: $('f-cliente').value.trim(), assessor: $('f-assessor').value.trim(), escritorio: $('f-escritorio').value.trim(), contato: $('f-contato').value.trim(), perfil: $('f-perfil').value, hoje: new Date().toLocaleDateString('pt-BR') };
  let ia = null;
  if ($('f-ia').checked) { diz('Escrevendo o comentário com a IA…'); try { ia = await comentarioIA(score, res, est); } catch (e) { diz(e.message + ' O relatório sai sem o comentário.', 'erro'); } }
  const [fundo, letra] = CORES_SELO[score.faixaTexto] || ['#e5e7eb', '#111827'];
  const perfilNome = { conservador: 'Conservador', moderado: 'Moderado', arrojado: 'Arrojado' }[info.perfil];
  const principais = [];
  score.desvios.slice().sort((a, b) => (b.falta + b.sobra) - (a.falta + a.sobra)).slice(0, 3).forEach((d) => principais.push(d.sobra ? `${d.nome}: ${nf(d.atual, 1)}% do patrimônio, acima da faixa de ${d.lo}% a ${d.hi}% para o cenário.` : `${d.nome}: ${nf(d.atual, 1)}% do patrimônio, abaixo da faixa de ${d.lo}% a ${d.hi}% para o cenário.`));
  if (res.maior && res.maior.peso > 15) principais.push(`Concentração: ${res.maior.nome} representa ${nf(res.maior.peso, 1)}% do patrimônio.`);
  const cli = `<div class="cli"><div><span>Cliente</span><b>${esc(info.cliente || '—')}</b></div><div><span>Perfil</span><b>${perfilNome}</b></div><div><span>Patrimônio</span><b>${brl(c.patrimonio, 0)}</b></div><div><span>Posição de</span><b>${esc(c.dataRef || '—')}</b></div></div>`;
  const rentTxt = c.rent && c.rent.carteira ? `<p class="nota">Rentabilidade da carteira em 12 meses: ${nf(c.rent.carteira.m12)}% (CDI: ${c.rent.cdi ? nf(c.rent.cdi.m12) + '%' : '—'}; IPCA: ${c.rent.ipca ? nf(c.rent.ipca.m12) + '%' : '—'}), segundo o XPerformance.</p>` : '';
  const inds = `<div class="inds"><div><span>Selic (meta)</span><b>${nf(cen.selic)}%</b></div><div><span>IPCA em 12 meses</span><b>${nf(cen.ipca12)}%</b></div><div><span>Juro real (aprox.)</span><b>${nf(cen.real)}%</b></div><div><span>Focus: IPCA ${cen.ano + 1}</span><b>${nf(cen.focusIpca)}%</b></div><div><span>Focus: Selic fim de ${cen.ano + 1}</span><b>${nf(cen.focusSelic)}%</b></div><div><span>Dólar</span><b>${cen.dolar ? 'R$ ' + nf(cen.dolar, 2) : '—'}</b></div></div>`;
  const p1 = topo(info) + cli
    + `<h2>Resumo</h2><div class="resumo">${gauge(score.total)}<div><span class="selo" style="background:${fundo};color:${letra}">${esc(score.faixaTexto)}</span><p style="margin-top:6px">Score de aderência da carteira ao cenário macro atual, para o perfil ${perfilNome.toLowerCase()}. Considera a distribuição entre as classes, a concentração, a proteção contra inflação, o crédito privado e o caixa.</p></div></div>`
    + (principais.length ? `<h3>Principais pontos</h3><ul class="pontos">${principais.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '')
    + `<h2>Cenário macro</h2>${inds}<ul class="pontos">${cen.frases.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
    + (estado.regua.motivos.length ? `<h3>O que o cenário pede</h3><ul class="pontos">${estado.regua.motivos.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '')
    + `<p class="nota">Fontes: Banco Central (Selic, IPCA, CDI), Boletim Focus${cen.dataFocus ? ' de ' + cen.dataFocus.split('-').reverse().join('/') : ''} e cotação do dólar no terminal Mercado Macro em ${esc(info.hoje)}.</p>`;
  const linhasTab = CLASSES.map((k) => { const v = res.pct[k.id] || 0, [lo, hi] = faixas[k.id], ok = v >= lo - 0.5 && v <= hi + 0.5; return `<tr><td>${esc(k.nome)}</td><td>${brl(res.valores[k.id], 0)}</td><td class="${ok ? 'dentro' : 'fora'}">${nf(v, 1)}%</td><td>${lo}% a ${hi}%</td><td class="${ok ? 'dentro' : 'fora'}">${ok ? 'Dentro' : v < lo ? 'Abaixo' : 'Acima'}</td></tr>`; }).join('');
  const p2 = topo(info)
    + `<h2>Carteira atual × referência do cenário</h2>${graficoRegua(res, faixas)}<p class="nota">A faixa sombreada é a referência para o perfil e o cenário; o ponto é a carteira hoje (verde: dentro; laranja: fora).</p>`
    + `<table class="t"><thead><tr><th>Classe</th><th>Saldo</th><th>Atual</th><th>Referência</th><th>Situação</th></tr></thead><tbody>${linhasTab}</tbody></table>${rentTxt}`
    + `<h2>Score detalhado: ${score.total} de 100</h2><div class="score-itens">${score.itens.map((i) => `<div class="it"><b>${esc(i.nome)}</b><div class="barra-s"><i style="width:${(i.pontos / i.max) * 100}%"></i></div><span>${Math.round(i.pontos)}/${i.max}</span><small>${esc(i.nota)}</small></div>`).join('')}</div>`;
  const ajustes = score.desvios.map((d) => {
    const alvo = d.sobra ? d.hi : d.lo, dif = ((alvo - d.atual) / 100) * res.total;
    return `<li><b>${d.sobra ? 'Reduzir' : 'Aumentar'} ${esc(d.nome.charAt(0).toLowerCase() + d.nome.slice(1))}</b> de ${nf(d.atual, 1)}% para ${d.sobra ? 'até' : 'ao menos'} ${alvo}% do patrimônio (${d.sobra ? 'cerca de ' + brl(Math.abs(dif), 0) + ' a realocar' : 'cerca de ' + brl(Math.abs(dif), 0) + ' a mais'}).</li>`;
  });
  if (res.maior && res.maior.peso > 15) ajustes.push(`<li><b>Diluir a concentração</b> em ${esc(res.maior.nome)} (${nf(res.maior.peso, 1)}% do patrimônio).</li>`);
  const iaLiga = !!(ia && (ia.leitura || ia.carteira));
  const top = res.ativos.slice(0, iaLiga ? 10 : 8).map((a) => `<tr><td>${esc(a.nome)}</td><td>${esc(CLASSES.find((k) => k.id === a.classe).nome)}</td><td>${brl(a.saldo, 0)}</td><td>${nf(a.peso, 1)}%</td><td>${a.rentAno == null ? '—' : nf(a.rentAno) + '%'}</td></tr>`).join('');
  const iaHtml = ia && (ia.leitura || ia.carteira || ia.conversa) ? `<h2>Comentário</h2><div class="ia-txt">${[['Leitura do cenário', ia.leitura], ['A carteira frente ao cenário', ia.carteira], ['Para conversar com o cliente', ia.conversa]].filter((x) => x[1] && x[1].length).map(([t, ps]) => `<h3>${t}</h3>${ps.map((p) => `<p>${esc(p)}</p>`).join('')}`).join('')}</div>` : '';
  const p3 = topo(info)
    + `<h2>Ajustes sugeridos por classe</h2>${ajustes.length ? `<ul class="ajustes">${ajustes.join('')}</ul>` : '<p>A carteira está dentro das faixas de referência do cenário.</p>'}<p class="nota">Valores aproximados para levar cada classe até a borda da faixa. A escolha dos produtos segue o perfil do cliente e a análise do assessor.</p>`
    + `<h2>E se o cenário mudar?</h2>${graficoEstresse(est)}<p class="nota">Efeito imediato estimado no valor da carteira, com premissas simples: prefixados e IPCA+ pela duração aproximada até o vencimento, fundos listados e bolsa pela sensibilidade histórica aos juros, ativos no exterior acompanhando o dólar. Não é previsão.</p>`
    + (iaHtml ? '' : '<!--p4-->')
    + `<h2>Maiores posições</h2><table class="t"><thead><tr><th>Ativo</th><th>Classe</th><th>Saldo</th><th>Peso</th><th>Rent. no ano</th></tr></thead><tbody>${top}</tbody></table>`
    + `<div class="aviso">Material de apoio elaborado pelo assessor${info.assessor ? ' ' + esc(info.assessor) : ''} a partir do relatório XPerformance e de dados públicos de mercado, com a ferramenta Mercado Macro. Tem caráter informativo e não constitui oferta, recomendação de compra ou venda de ativos ou promessa de rentabilidade. Qualquer alteração na carteira deve considerar o perfil de investidor (suitability), os objetivos e o horizonte do cliente. Rentabilidade passada não é garantia de rentabilidade futura.</div>`;
  // com o comentário da IA, as maiores posições e o aviso vão para uma quarta página
  const corte = p3.indexOf('<h2>Maiores posições</h2>');
  const paginas = iaHtml ? [p1, p2, p3.slice(0, corte), topo(info) + iaHtml + p3.slice(corte)] : [p1, p2, p3.replace('<!--p4-->', '')];
  $('relatorio').innerHTML = paginas.map((p, i) => folha(p, i + 1, paginas.length, info)).join('');
  $('relatorio').hidden = false; $('imprimir').disabled = false;
  if (!ia || ia.leitura) diz('Relatório pronto. Confira e use "Baixar PDF".', 'ok');
  $('relatorio').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
$('gerar').addEventListener('click', () => { $('gerar').disabled = true; gerar().catch((e) => diz('Não foi possível montar o relatório: ' + e.message, 'erro')).finally(() => liberar()); });
$('imprimir').addEventListener('click', () => {
  const t = document.title; const cli = $('f-cliente').value.trim();
  document.title = 'Relatório de alocação' + (cli ? ' - ' + cli : '') + ' - ' + new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
  window.print(); setTimeout(() => { document.title = t; }, 1000);
});

/* ---------- início ---------- */
diz('Buscando o cenário de hoje…');
buscarCenario().then((cen) => { estado.cenario = cen; montarRegua(false); liberar(); diz(''); }).catch((e) => diz(e.message, 'erro'));
