/* Assistente (29/10/2026): chat com o Google Gemini para quem está logado.
   A chave fica só no servidor (/api/assistente); aqui só aparece o botão quando o administrador ligou. */
(() => {
  const API = '/api/assistente';
  const GUARDA = 'mm-ia-conversa';
  let conversa = [];
  try { conversa = JSON.parse(sessionStorage.getItem(GUARDA) || '[]') || []; } catch (e) { conversa = []; }
  const salvar = () => { try { sessionStorage.setItem(GUARDA, JSON.stringify(conversa.slice(-20))); } catch (e) {} };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // markdown simples: parágrafos, listas, **negrito**, `código`
  function md(t) {
    const linha = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    let h = '', lista = null;
    const fecha = () => { if (lista) { h += `</${lista}>`; lista = null; } };
    for (const l of String(t).split('\n')) {
      const ul = l.match(/^\s*[-*•]\s+(.*)/), ol = l.match(/^\s*\d+[.)]\s+(.*)/), tit = l.match(/^#{1,4}\s+(.*)/);
      if (ul || ol) { const tipo = ul ? 'ul' : 'ol'; if (lista !== tipo) { fecha(); h += `<${tipo}>`; lista = tipo; } h += `<li>${linha((ul || ol)[1])}</li>`; }
      else if (!l.trim()) fecha();
      else { fecha(); h += tit ? `<p><b>${linha(tit[1])}</b></p>` : `<p>${linha(l)}</p>`; }
    }
    fecha();
    return h;
  }

  const CSS = `
  .ia-painel{position:fixed;top:0;right:0;bottom:0;width:min(440px,100%);z-index:1200;display:flex;flex-direction:column;background:var(--surface,#fff);color:var(--text);border-left:1px solid var(--line-2,#ddd);box-shadow:-8px 0 30px rgba(0,0,0,.18);transform:translateX(102%);transition:transform .2s ease;visibility:hidden}
  .ia-painel.aberto{transform:none;visibility:visible}
  .ia-cab{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line-2,#ddd)}
  .ia-tit{flex:1;min-width:0}
  .ia-selo{display:inline-block;font-size:9.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--accent,#d4920f);padding:2px 7px;border:1px solid var(--accent-line,rgba(240,185,11,.45));border-radius:999px;background:var(--accent-soft,#fff3dc);box-shadow:0 0 12px rgba(240,185,11,.18);margin-bottom:4px}
  .ia-cab h2{margin:0;font-size:16px;line-height:1.2}
  .ia-cab small{display:block;font-weight:400;color:var(--text-3,#777);font-size:12px;margin-top:2px}
  .ia-cab button{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line-2,#ddd);background:var(--surface-2,#f3f3f3);color:var(--text);cursor:pointer;font:inherit;font-size:13px;font-weight:600;padding:0 12px;border-radius:10px;min-height:40px}
  .ia-cab button svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
  .ia-cab button:hover{border-color:var(--accent,#d4920f)}
  @media (max-width:420px){.ia-cab button span{display:none}.ia-cab button{padding:0;width:40px;justify-content:center}}
  .ia-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
  .ia-msg{max-width:92%;padding:10px 12px;border-radius:12px;font-size:14px;line-height:1.5;overflow-wrap:anywhere}
  .ia-msg p{margin:0 0 8px}.ia-msg p:last-child{margin:0}.ia-msg ul,.ia-msg ol{margin:0 0 8px;padding-left:20px}
  .ia-msg code{background:var(--surface-2);padding:1px 4px;border-radius:4px;font-size:13px}
  .ia-eu{align-self:flex-end;background:var(--accent-soft,#e8f0ff);color:var(--accent-ink,var(--text))}
  .ia-ele{align-self:flex-start;background:var(--surface-2,#f3f3f3)}
  .ia-erro{align-self:flex-start;color:var(--down,#c0392b);font-size:13px}
  .ia-erro a{color:var(--accent,#2563eb);font-weight:600}
  .ia-vazio{color:var(--text-2,#555);font-size:13.5px;line-height:1.5;display:flex;flex-direction:column;gap:14px}
  .ia-ola{margin:4px 0 0;font-size:19px;font-weight:700;color:var(--text);line-height:1.3}
  .ia-ola small{display:block;font-size:13px;font-weight:400;color:var(--text-3,#777);margin-top:4px}
  .ia-ic{flex:0 0 28px;width:28px;height:28px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:var(--accent-soft,#fff3dc);color:var(--accent,#d4920f)}
  .ia-ic svg{width:15px;height:15px;fill:none !important;stroke:currentColor !important;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;color:inherit !important}
  .ia-vazio .ia-sug.gem .ia-ic{color:var(--accent,#d4920f) !important}
  .ia-sug-t{margin:2px 0 -6px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--text-3,#777)}
  .ia-vazio .ia-sug{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid var(--line,#e5e5e5);background:transparent;color:var(--text);border-radius:12px;padding:10px 12px;cursor:pointer;font:inherit;font-size:13.5px;transition:border-color .15s,background .15s}
  .ia-vazio .ia-sug:hover{border-color:var(--accent-line,var(--accent));background:var(--surface-2)}
  .ia-vazio .ia-sug .ia-ic{flex-basis:26px;width:26px;height:26px;background:var(--surface-3,#eee);color:var(--text-2,#555)}
  .ia-vazio .ia-sug.gem .ia-ic{background:var(--accent-soft,#fff3dc);color:var(--accent,#d4920f)}
  .ia-pe{border-top:1px solid var(--line-2,#ddd);padding:12px 16px calc(12px + env(safe-area-inset-bottom))}
  .ia-form{display:flex;gap:6px;align-items:flex-end;padding:5px 5px 5px 14px;border:1px solid var(--line-2,#ddd);border-radius:22px;background:var(--surface-2);transition:border-color .15s}
  .ia-form:focus-within{border-color:var(--accent,#d4920f)}
  .ia-form textarea{flex:1;resize:none;min-height:34px;max-height:140px;font:inherit;font-size:14px;padding:7px 0;border:0 !important;outline:0 !important;background:transparent !important;color:var(--text);box-shadow:none !important}
  .ia-form button{flex:0 0 34px;width:34px;height:34px;padding:0;border:0;border-radius:50%;background:var(--accent,#f0b90b);color:#111;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:transform .15s,opacity .15s}
  .ia-form button svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
  .ia-form button:hover:not(:disabled){transform:scale(1.06)}
  .ia-form button:disabled{opacity:.45;cursor:default}
  .ia-form button.ia-mic{background:transparent;color:var(--text-2,#888);border:1px solid var(--line-2,#ddd)}
  .ia-form button.ia-mic svg{fill:currentColor;stroke:none;width:15px;height:15px}
  .ia-form button.ia-mic.ouvindo{background:var(--neg,#ea3943);border-color:var(--neg,#ea3943);color:#fff;animation:ia-mic 1.1s ease-in-out infinite}
  @keyframes ia-mic{50%{box-shadow:0 0 0 6px rgba(234,57,67,.18)}}
  .ia-sug.tela{border-style:dashed}
  .ia-aviso{margin:7px 4px 0;font-size:10.5px;color:var(--text-3,#888);line-height:1.4;text-align:center;opacity:.85}
  .ia-rot{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted,#777);margin-bottom:6px}
  .ia-acoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  .ia-rsub{font-size:11.5px;color:var(--text-3);margin:10px 0 0}
  .ia-acoes button,.ia-acoes a{border:1px solid var(--line-2,#ddd);background:var(--surface,#fff);color:var(--text);border-radius:8px;padding:6px 10px;font-size:12.5px;font-weight:600;cursor:pointer;text-decoration:none;min-height:32px;display:inline-flex;align-items:center}
  .ia-acoes button:hover,.ia-acoes a:hover{border-color:var(--accent,#2563eb)}
  .ia-pensando{align-self:flex-start;color:var(--text-3,#777);font-size:13px;display:inline-flex;align-items:center;gap:6px;padding:9px 12px;border-radius:12px;background:var(--surface-2,#f3f3f3)}
  .ia-pontos{display:inline-flex;gap:3px}.ia-pontos i{width:5px;height:5px;border-radius:50%;background:var(--accent,#d4920f);animation:ia-pt 1s infinite ease-in-out}
  .ia-pontos i:nth-child(2){animation-delay:.15s}.ia-pontos i:nth-child(3){animation-delay:.3s}
  @keyframes ia-pt{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}
  @media (prefers-reduced-motion:reduce){.ia-pontos i{animation:none;opacity:.7}}
  .ia-marca{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;flex:0 0 36px;border-radius:50%;background:var(--accent-soft,#fff3dc)}
  .ia-marca svg{width:20px;height:20px}
  .ia-cab .ia-marca{width:42px;height:42px;flex-basis:42px;border-radius:12px;background:#111827;border:1px solid rgba(240,185,11,.35)}
  .ia-cab .ia-marca svg{width:24px;height:24px}
  .ia-fab{position:fixed;right:20px;bottom:calc(20px + env(safe-area-inset-bottom));z-index:60;display:inline-flex;align-items:center;gap:10px;padding:7px 16px 7px 7px;border:1px solid var(--line-2,#ddd);border-radius:999px;background:var(--surface,#fff);color:var(--text);box-shadow:0 8px 28px rgba(0,0,0,.28);cursor:pointer;font:inherit;text-align:left;transition:transform .15s ease,border-color .15s ease}
  .ia-fab:hover{transform:translateY(-2px);border-color:var(--accent,#2563eb)}
  .ia-fab-txt{display:flex;flex-direction:column;line-height:1.15}
  .ia-fab-txt b{font-size:13.5px;font-weight:700}
  .ia-fab-txt small{font-size:11px;color:var(--muted,#777)}
  body.ia-aberto .ia-fab{display:none}
  @media print{.ia-fab{display:none}}
  @media (max-width:640px){.ia-fab{right:10px;bottom:calc(60px + env(safe-area-inset-bottom));padding:5px 12px 5px 5px;gap:8px}.ia-fab .ia-marca{width:30px;height:30px;flex-basis:30px}.ia-fab .ia-marca svg{width:15px;height:15px}.ia-fab-txt small{display:none}.ia-fab-txt b{font-size:12.5px}}
  @media (max-width:560px){.ia-painel{width:100%;border-left:0}}`;

  const IC = {
    raio: '<svg viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    brilho: '<svg viewBox="0 0 24 24"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><path d="M12 2a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0v-6A3.5 3.5 0 0 0 12 2z"/><path d="M6 11a1 1 0 0 0-2 0 8 8 0 0 0 7 7.9V21H8.5a1 1 0 0 0 0 2h7a1 1 0 0 0 0-2H13v-2.1A8 8 0 0 0 20 11a1 1 0 0 0-2 0 6 6 0 0 1-12 0z"/></svg>',
    tela: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
    balao: '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
    lixo: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    enviar: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
  };
  // marca do assistente (04/11/2026): as três barras do Mercado Macro com o brilho de IA, em degradê dourado
  let marcaN = 0;
  function marca() {
    const g = 'ia-ouro-' + (++marcaN);
    return `<svg viewBox="0 0 32 32"><defs><linearGradient id="${g}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#b8860b"/><stop offset=".55" stop-color="#f0b90b"/><stop offset="1" stop-color="#ffe08a"/></linearGradient></defs>`
      + `<g fill="url(#${g})"><rect x="4" y="20" width="6" height="10" rx="1.5"/><rect x="13" y="13" width="6" height="17" rx="1.5"/><rect x="22" y="7" width="6" height="23" rx="1.5"/>`
      + `<path d="M8 2.5l1.1 3 3 1.1-3 1.1L8 10.7l-1.1-3-3-1.1 3-1.1z"/></g></svg>`;
  }
  const SUGESTOES = ['Resuma as principais notícias de hoje', 'Meu radar: o que importa hoje para a minha watchlist?', 'Por que o Ibovespa está se mexendo hoje?', 'Quais as chances do Copom e do Fed nas próximas reuniões?', 'Como adicionar um ativo à watchlist?', 'O que é a Selic? Meta e efetiva são iguais?', 'Como interpretar as probabilidades do Fed?', 'O que é a curva de juros DI x pré e como ler?'];
  // pedem dado de agora: vão direto ao Gemini (que consulta o terminal), sem resposta pronta
  const SO_GEMINI = new Set(['Meu radar: o que importa hoje para a minha watchlist?', 'Por que o Ibovespa está se mexendo hoje?', 'Quais as chances do Copom e do Fed nas próximas reuniões?']);
  let painel, msgs, campo, enviar, limite = null, ocupado = false, gemini = false, assinante = true;

  function desenhar() {
    if (!conversa.length) {
      // layout e textos de 04/11/2026 (propostas do Severino): saudação, um texto curto sobre como responde e sugestões com ícone
      const sug = SUGESTOES.filter((x) => (gemini && assinante) || (!SO_GEMINI.has(x) && (prontaPara(x) || licaoPara(x))))
        .map((s) => { const pronta = !SO_GEMINI.has(s) && (prontaPara(s) || licaoPara(s)); return `<button type="button" class="ia-sug${pronta ? '' : ' gem'}"${SO_GEMINI.has(s) ? ' data-ia-so' : ''}><span class="ia-ic" aria-hidden="true">${IC[pronta ? 'balao' : 'brilho']}</span><span class="ia-sug-x">${esc(s)}</span></button>`; }).join('');
      const como = 'Dúvidas comuns e assuntos das lições da aba Educação têm resposta na hora, da nossa base.'
        + (gemini ? (assinante ? ` Para o resto, o Google Gemini apoia a sua análise${limite ? ` (até ${limite} perguntas por dia)` : ''}. Ele consulta as cotações, a agenda, as notícias, as probabilidades e os fundamentos do terminal antes de responder.` : ' Perguntas livres vão ao Google Gemini, exclusivo para assinantes.') : '');
      msgs.innerHTML = `<div class="ia-vazio"><p class="ia-ola">Olá! Como posso ajudar na sua análise hoje?<small>${como}</small></p>
        ${sug || (gemini && assinante) ? `<p class="ia-sug-t">Sugestões</p>` : ''}${gemini && assinante ? `<button type="button" class="ia-sug gem tela" data-ia-tela><span class="ia-ic" aria-hidden="true">${IC.tela}</span><span class="ia-sug-x">Explicar a tela que estou vendo</span></button>` : ''}${sug}</div>`;
      msgs.querySelectorAll('.ia-vazio .ia-sug').forEach((b) => (b.onclick = () => { if (b.hasAttribute('data-ia-tela')) return explicarTela(); campo.value = b.querySelector('.ia-sug-x').textContent; perguntar(b.hasAttribute('data-ia-so') || undefined); }));
      return;
    }
    msgs.innerHTML = conversa.map((x, i) => `<div class="ia-msg ia-eu">${esc(x.p)}</div>` + (x.r ? `<div class="ia-msg ia-ele">${x.pronta ? `<div class="ia-rot">${x.pronta === 'resumo' ? 'Resumo das notícias pela IA' : x.pronta === 'alarme' ? 'Alarme de preço' : x.pronta === 'licao' && x.licao ? 'Da aba Educação · ' + esc(x.licao.trilha) : 'Resposta pronta'}</div>` : ''}${md(x.r)}${x.pronta ? rodapePronta(x, i) : x.licao && window.MMEdu ? `<div class="ia-acoes"><button type="button" data-ia-licao="${esc(x.licao.id)}">Abrir a lição: ${esc(x.licao.titulo)}</button></div>` : ''}</div>` : x.e ? `<div class="ia-erro">${esc(x.e)}${x.assinar ? ' <a href="/assinar">Ver planos</a>' : ''}</div>` : '')).join('')
      + (ocupado && !conversa[conversa.length - 1].r ? '<div class="ia-pensando" role="status">Analisando<span class="ia-pontos" aria-hidden="true"><i></i><i></i><i></i></span></div>' : '');
    msgs.querySelectorAll('[data-ia-aba]').forEach((b) => (b.onclick = () => { const t = document.querySelector('.tab-btn[data-tab="' + b.dataset.iaAba + '"]'); if (t) { fechar(); t.click(); } }));
    msgs.querySelectorAll('[data-ia-licao]').forEach((b) => (b.onclick = () => { if (window.MMEdu && window.MMEdu.abrir(b.dataset.iaLicao)) fechar(); }));
    msgs.querySelectorAll('[data-ia-gemini]').forEach((b) => (b.onclick = () => { const x = conversa[+b.dataset.iaGemini]; if (x) { campo.value = x.p; perguntar(true); } }));
    msgs.scrollTop = msgs.scrollHeight;
  }

  // resposta pronta (base local do /vitrine/ajuda-conteudo.js): atalho para a aba e opção de perguntar ao Gemini
  function rodapePronta(x, i) {
    if (x.pronta === 'alarme') return '';
    if (x.pronta === 'resumo') return `<p class="ia-rsub">${esc(x.sub || '')} Pode conter erros; confira na fonte.</p><div class="ia-acoes">${document.querySelector('.tab-btn[data-tab="news-panel"]') ? '<button type="button" data-ia-aba="news-panel">Abrir a aba Notícias</button>' : ''}</div>`;
    const a = x.acao;
    let h = '<div class="ia-acoes">';
    if (a && a.aba && document.querySelector('.tab-btn[data-tab="' + a.aba + '"]')) h += `<button type="button" data-ia-aba="${esc(a.aba)}">${esc(a.texto)}</button>`;
    else if (a && a.publico) h += `<a href="${esc(a.publico)}"${/^mailto:/.test(a.publico) ? '' : ' target="_blank" rel="noopener"'}>${esc(a.texto)}</a>`;
    if (x.licao && window.MMEdu) h += `<button type="button" data-ia-licao="${esc(x.licao.id)}">Abrir a lição: ${esc(x.licao.titulo)}</button>`;
    if (gemini && assinante) h += `<button type="button" data-ia-gemini="${i}">Perguntar ao Gemini</button>`;
    else if (gemini) h += '<a href="/assinar">Assinar para perguntar ao Gemini</a>';
    return h + '</div>';
  }
  function pedeResumo(p) {
    const t = p.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return /\b(resum\w*|principais|destaques?|o que (esta )?acontec\w*)\b/.test(t) && /\b(noticias?|manchetes?)\b/.test(t);
  }
  function prontaPara(p) {
    try { return (window.MMAjudaConteudo && window.MMAjudaConteudo.buscar(p)[0]) || null; } catch (e) { return null; }
  }

  // lição da aba Educação que trata do assunto (educacao.js)
  function licaoPara(p) {
    try { return (window.MMEdu && window.MMEdu.buscar(p)[0]) || null; } catch (e) { return null; }
  }

  // texto visível da aba aberta, para "Explicar a tela" (vai ao Gemini junto com a pergunta)
  function telaAtual() {
    const el = document.querySelector('.tab-panel.active');
    if (!el) return null;
    const rot = (document.querySelector('.tab-btn.active')?.textContent || el.id).replace(/\s+/g, ' ').trim();
    const t = (el.innerText || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    return t ? { rot, t: t.slice(0, 3800) } : null;
  }
  function explicarTela() {
    abrir();
    if (ocupado) return;
    const tela = telaAtual();
    if (!gemini || !assinante || !tela) {
      conversa.push({ p: 'Explicar a tela', e: !tela ? 'Não achei conteúdo nesta tela para explicar.' : gemini ? 'Explicar a tela usa o Google Gemini, que é para assinantes.' : 'Explicar a tela precisa do Google Gemini, que ainda não está ligado.', assinar: !!tela && gemini && !assinante });
      salvar(); desenhar(); return;
    }
    perguntar(true, tela);
  }

  // ---- o que o assistente sabe de quem pergunta (fica só neste navegador; vai junto com a pergunta ao Gemini) ----
  const TEMAS_KEY = 'mm_ia_temas_v1';
  const TEMAS = [
    ['juros e Selic', /selic|copom|juros|cdi|di\b|curva/], ['Fed e EUA', /\bfed\b|fomc|powell|eua|treasur|payroll|cpi\b/], ['câmbio', /dolar|cambio|euro|moeda|dxy/],
    ['ações da B3', /\b[a-z]{4}\d{1,2}\b|acao|acoes|ibov|bolsa|b3\b/], ['dividendos', /dividend|provento|jcp|yield/], ['renda fixa', /tesouro|cdb|lci|lca|debenture|renda fixa|ipca\+/],
    ['opções e derivativos', /opcao|opcoes|call|put|derivativ|futuro|hedge/], ['cripto', /bitcoin|cripto|btc|ethereum/], ['commodities', /petroleo|brent|ouro|minerio|soja|commodit/],
    ['inflação', /inflac|ipca|igp|cpi\b|pce\b/], ['análise de empresas', /balanco|lucro|ebitda|p\/l|valuation|fundament|roe\b/],
  ];
  const tira = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  function anotaTemas(p) {
    try {
      const t = tira(p), o = JSON.parse(localStorage.getItem(TEMAS_KEY) || '{}') || {};
      TEMAS.forEach(([nome, re]) => { if (re.test(t)) o[nome] = (o[nome] || 0) + 1; });
      localStorage.setItem(TEMAS_KEY, JSON.stringify(o));
    } catch (e) { /* sem armazenamento */ }
  }
  function perfil() {
    let temas = [];
    try { temas = Object.entries(JSON.parse(localStorage.getItem(TEMAS_KEY) || '{}') || {}).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k); } catch (e) { /* nada */ }
    let nivel = 'intermediario';
    try { const v = (JSON.parse(localStorage.getItem('trader_prefs_v1') || '{}') || {}).iaNivel; if (['iniciante', 'intermediario', 'avancado'].includes(v)) nivel = v; } catch (e) { /* padrão */ }
    let watchlist = [];
    try { watchlist = window.MMRadar ? window.MMRadar.watchlist() : (window.MMWatchRobo ? window.MMWatchRobo.itens().map((s) => ({ s, nome: window.MMWatchRobo.nome(s), termos: [] })) : []); } catch (e) { watchlist = []; }
    return { nivel, temas, watchlist: watchlist.slice(0, 30) };
  }
  // lição da aba Educação sobre o assunto: vai como referência para o Gemini citar
  function conteudoSite(p) {
    const li = licaoPara(p);
    if (!li) return { lista: [], licao: null };
    return { licao: { id: li.id, titulo: li.titulo, trilha: li.trilha }, lista: [{ tipo: 'lição da aba Educação', titulo: li.titulo, trilha: li.trilha, texto: (li.abertura + ' ' + (li.pontos || []).join(' ')).slice(0, 1500) }] };
  }

  async function perguntar(soGemini, tela) {
    const p = tela ? 'Explique a tela "' + tela.rot + '"' : campo.value.trim();
    if (!p || ocupado) return;
    if (!tela) { campo.value = ''; ajustar(); }
    const item = { p };
    // "me avisa se o dólar passar de 5,50": vira alarme de preço do robô (robo-extras.js), sem ir ao Gemini
    if (!tela && soGemini !== true && window.MMRoboAlarmes && window.MMRoboAlarmes.ehPedido(p)) {
      conversa.push(item); ocupado = true; enviar.disabled = true; desenhar();
      const j = await window.MMRoboAlarmes.doTexto(p).catch(() => null);
      if (j && j.r) { item.r = j.r; item.pronta = 'alarme'; } else item.e = (j && j.e) || 'Não consegui criar o alarme agora.';
      ocupado = false; enviar.disabled = false; salvar(); desenhar(); campo.focus();
      return;
    }
    // pedido de resumo das notícias: usa o resumo do servidor (resumo-ia.js), sem gastar as perguntas do dia
    if (soGemini !== true && pedeResumo(p) && window.MMResumoIA) {
      conversa.push(item); ocupado = true; enviar.disabled = true; desenhar();
      const j = await window.MMResumoIA.buscar();
      if (j.ok) { item.r = j.texto; item.pronta = 'resumo'; item.sub = window.MMResumoIA.legenda(j); }
      else { item.e = j.erro; item.assinar = !!j.assinar; }
      ocupado = false; enviar.disabled = false; salvar(); desenhar(); campo.focus();
      return;
    }
    const pr = soGemini === true ? null : prontaPara(p);
    const li = soGemini === true ? null : licaoPara(p);
    if (pr || li || !gemini || !assinante) {
      // dúvida comum ou assunto de uma lição: responde na hora, sem gastar a cota do Google
      if (li) item.licao = { id: li.id, titulo: li.titulo, trilha: li.trilha };
      if (pr) { item.r = pr.resposta.join('\n\n'); item.pronta = pr.id; item.acao = pr.acao || null; }
      else if (li) { item.r = li.abertura + (li.pontos.length ? '\n\n**Pontos principais**\n' + li.pontos.map((x) => '- ' + x).join('\n') : ''); item.pronta = 'licao'; }
      else if (gemini && !assinante) { item.e = 'Não achei resposta pronta para isso. No plano grátis o assistente responde as dúvidas prontas e os assuntos das lições; as outras perguntas vão ao Gemini, que é para assinantes.'; item.assinar = true; }
      else item.e = 'Não achei resposta pronta para isso. Tente outras palavras ou escreva para contato@mercadomacro.com.br.';
      conversa.push(item); salvar(); desenhar(); campo.focus();
      return;
    }
    const historico = conversa.filter((x) => x.r && !x.pronta).slice(-6).map((x) => ({ p: x.p, r: x.r }));
    if (!tela) anotaTemas(p);
    const site = tela ? { lista: [], licao: null } : conteudoSite(p);
    if (site.licao) item.licao = site.licao;
    conversa.push(item); ocupado = true; enviar.disabled = true; desenhar();
    try {
      const r = await fetch(API, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tela ? { pergunta: 'Explique de forma simples o que esta tela do terminal mostra agora e o que mais chama a atenção nos números. Seja breve.', contexto: tela.t, tela: tela.rot, historico, perfil: perfil(), stream: true } : { pergunta: p, historico, perfil: perfil(), site: site.lista, stream: true }) });
      if (r.ok && r.body && /text\/plain/.test(r.headers.get('content-type') || '')) {
        // a resposta chega aos pedaços: mostra enquanto o Gemini escreve
        const leitor = r.body.getReader(), dec = new TextDecoder();
        item.r = '';
        for (;;) {
          const { done, value } = await leitor.read();
          if (done) break;
          item.r += dec.decode(value, { stream: true });
          desenhar();
        }
        item.r = item.r.trim();
        if (!item.r) { delete item.r; item.e = 'Não foi possível responder agora.'; }
      } else {
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.resposta) item.r = j.resposta; else item.e = j.erro || 'Não foi possível responder agora.';
      }
    } catch (e) { if (item.r) item.r += '\n\n(A resposta foi interrompida.)'; else item.e = 'Sem conexão. Tente de novo.'; }
    ocupado = false; enviar.disabled = false; salvar(); desenhar(); campo.focus();
  }

  function ajustar() { campo.style.height = 'auto'; campo.style.height = Math.min(campo.scrollHeight, 140) + 'px'; }

  function estilo() { const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st); }

  function montar() {
    painel = document.createElement('aside');
    painel.className = 'ia-painel'; painel.id = 'ia-painel';
    painel.setAttribute('aria-label', 'Assistente'); painel.inert = true;
    painel.innerHTML = `<div class="ia-cab"><span class="ia-marca" aria-hidden="true">${marca()}</span><div class="ia-tit"><span class="ia-selo">Mercado Macro</span><h2>Assistente IA</h2><small>Inteligência de Mercado &amp; Análise Macro</small></div>
        <button type="button" data-ia="limpar" title="Apagar a conversa">${IC.lixo}<span>Limpar</span></button><button type="button" data-ia="fechar" aria-label="Fechar o assistente">${IC.x}<span>Fechar</span></button></div>
      <div class="ia-msgs" aria-live="polite"></div>
      <div class="ia-pe"><form class="ia-form"><textarea rows="1" maxlength="1200" placeholder="Escreva sua pergunta" aria-label="Sua pergunta"></textarea>${window.MMRoboComando && window.MMRoboComando.tem() ? `<button type="button" class="ia-mic" data-ia="mic" aria-label="Falar um comando ou pergunta" title="Falar (Alt+V)">${IC.mic}</button>` : ''}<button type="submit" aria-label="Enviar" title="Enviar">${IC.enviar}</button></form>
        <p class="ia-aviso">${gemini ? 'Conteúdo analítico e informativo gerado por IA. Não constitui recomendação de investimento. Não escreva dados pessoais: as perguntas vão para o Google.' : 'Respostas prontas do Mercado Macro, sem IA. Não escreva senhas nem dados pessoais.'}</p></div>`;
    document.body.appendChild(painel);
    msgs = painel.querySelector('.ia-msgs'); campo = painel.querySelector('textarea'); enviar = painel.querySelector('.ia-form button[type="submit"]');
    painel.querySelector('form').onsubmit = (e) => { e.preventDefault(); perguntar(); };
    campo.addEventListener('input', ajustar);
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); perguntar(); } });
    painel.querySelector('[data-ia="fechar"]').onclick = fechar;
    const mic = painel.querySelector('[data-ia="mic"]');
    if (mic) mic.onclick = () => window.MMRoboComando.escutar(mic);
    painel.querySelector('[data-ia="limpar"]').onclick = () => { if (ocupado) return; conversa = []; salvar(); desenhar(); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && painel.classList.contains('aberto')) fechar(); });
  }

  function abrir() { if (!painel) montar(); desenhar(); document.body.classList.add('ia-aberto'); painel.classList.add('aberto'); painel.inert = false; setTimeout(() => campo.focus(), 50); }
  // fechado = inert (some para leitores de tela e não recebe foco); o foco volta para o botão antes, senão o navegador reclama
  function fechar() { const tinhaFoco = painel.contains(document.activeElement); document.body.classList.remove('ia-aberto'); painel.classList.remove('aberto'); if (tinhaFoco) document.getElementById('ia-fab')?.focus({ preventScroll: true }); painel.inert = true; }

  // botão flutuante no canto inferior direito (no celular, acima do botão Resumo)
  function botao() {
    if (document.getElementById('ia-fab')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'ia-fab'; b.className = 'ia-fab';
    b.setAttribute('aria-label', 'Abrir o Assistente IA do Mercado Macro');
    b.innerHTML = '<span class="ia-marca" aria-hidden="true">' + marca() + '</span><span class="ia-fab-txt"><b>Assistente IA</b><small>Mercado Macro</small></span>';
    b.onclick = abrir;
    // o mascote (assistente-mascote.js) usa para "Explique isso": abre o painel com a pergunta escrita, sem enviar
    window.MMAssistente = { abrir, fechar: () => painel && fechar(), explicarTela, gemini: () => gemini && assinante,
      perguntarTexto: (t) => { abrir(); campo.value = String(t || '').slice(0, 600); perguntar(); }, escrever: (t) => { abrir(); campo.value = String(t || '').slice(0, 600); ajustar(); setTimeout(() => { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length); }, 60); } };
    document.body.appendChild(b);
    if (window.MMAbaBorda) window.MMAbaBorda.marcar(b);
  }

  fetch(API, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    // sem a chave do Gemini, o painel funciona só com as respostas prontas
    if (!j) return;
    gemini = !!j.ligado;
    assinante = j.assinante !== false;
    limite = gemini && assinante ? j.limite : null;
    estilo();
    botao();
  }).catch(() => {});
})();
