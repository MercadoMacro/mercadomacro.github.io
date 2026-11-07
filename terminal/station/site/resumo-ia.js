/* =========================================================
   RESUMO DAS NOTÍCIAS PELA IA (07/11/2026, pedido do Severino)
   Botão "Resumo da IA" na aba Notícias: mostra o resumo por tema que o servidor pede ao Google Gemini
   (/api/noticias/resumo, um resumo para todos, refeito a cada 15 minutos; só assinantes).
   O assistente usa o mesmo resumo quando a pergunta pede as notícias (window.MMResumoIA).
   Para desfazer: tirar o <script> resumo-ia.js e o botão #resumo-ia-btn do index.html.
   ========================================================= */
(function resumoIA() {
  'use strict';
  const API = '/api/noticias/resumo';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // markdown do resumo: "## " vira título, "- " vira item, o resto parágrafo
  function html(t) {
    let h = '', ul = false;
    const fecha = () => { if (ul) { h += '</ul>'; ul = false; } };
    for (const l of String(t).split('\n')) {
      const tit = l.match(/^#{1,4}\s+(.*)/), it = l.match(/^\s*[-*•]\s+(.*)/);
      if (it) { if (!ul) { h += '<ul>'; ul = true; } h += `<li>${esc(it[1])}</li>`; }
      else if (!l.trim()) fecha();
      else { fecha(); h += tit ? `<h3>${esc(tit[1])}</h3>` : `<p>${esc(l)}</p>`; }
    }
    fecha();
    return h;
  }

  let pendente = null;
  // {ok, texto, gerado, manchetes, antigo} ou {ok:false, erro, assinar}
  function buscar() {
    if (pendente) return pendente;
    pendente = fetch(API, { credentials: 'same-origin', cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.texto) return { ok: true, ...j };
        return { ok: false, erro: j.erro || 'Não foi possível gerar o resumo agora.', assinar: j.codigo === 'assinar' };
      })
      .catch(() => ({ ok: false, erro: 'Sem conexão. Tente de novo.' }))
      .finally(() => { setTimeout(() => { pendente = null; }, 0); });
    return pendente;
  }
  const legenda = (j) => `Gerado pela IA às ${hora(j.gerado)} com ${j.manchetes} manchetes das últimas 12 horas${j.antigo ? ' (o mais recente disponível)' : ''}. Atualiza a cada ${j.atualizaA || 15} minutos.`;
  window.MMResumoIA = { buscar, legenda };

  const CSS = `
  #resumo-ia-modal .modal-content{max-width:760px;width:min(760px,calc(100vw - 32px));max-height:min(86vh,900px);overflow:auto}
  .ria-sub{font-size:12px;color:var(--text-3);margin:-4px 0 14px}
  .ria-corpo{font-size:14px;line-height:1.6;color:var(--text)}
  .ria-corpo h3{font-size:12px;letter-spacing:.8px;text-transform:uppercase;color:var(--accent-ink,var(--accent));margin:18px 0 6px}
  .ria-corpo p{margin:0 0 10px}
  .ria-corpo ul{margin:0 0 6px;padding-left:18px}
  .ria-corpo li{margin:0 0 6px}
  .ria-aviso{font-size:11.5px;color:var(--text-3);border-top:1px solid var(--line);margin-top:16px;padding-top:10px}
  .ria-carregando{display:flex;align-items:center;gap:10px;color:var(--text-2);padding:24px 0}
  .ria-carregando i{width:8px;height:8px;border-radius:50%;background:var(--accent);animation:riaP 1s infinite ease-in-out}
  .ria-carregando i:nth-child(2){animation-delay:.15s}.ria-carregando i:nth-child(3){animation-delay:.3s}
  @keyframes riaP{0%,80%,100%{opacity:.25}40%{opacity:1}}
  @media (prefers-reduced-motion:reduce){.ria-carregando i{animation:none}}
  .ria-erro{color:var(--text-2);padding:16px 0}
  `;

  let modal = null;
  function montar() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.append(st);
    modal = document.createElement('div');
    modal.id = 'resumo-ia-modal';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'ria-titulo');
    modal.innerHTML = `<div class="modal-content">
      <button class="modal-close" type="button" aria-label="Fechar">&times;</button>
      <h2 id="ria-titulo">Resumo das notícias</h2>
      <p class="ria-sub" id="ria-sub"></p>
      <div class="ria-corpo" id="ria-corpo" aria-live="polite"></div>
      <p class="ria-aviso">Conteúdo gerado por IA (Google Gemini) a partir das manchetes e trechos dos feeds, sem ler as matérias completas. Pode conter erros; confira na fonte. Não constitui recomendação de investimento.</p>
    </div>`;
    document.body.append(modal);
    modal.querySelector('.modal-close').addEventListener('click', fechar);
    modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });
  }
  const tecla = (e) => { if (e.key === 'Escape') fechar(); };
  function fechar() { modal.classList.remove('visible'); document.removeEventListener('keydown', tecla); }

  async function abrir() {
    if (!modal) montar();
    const corpo = modal.querySelector('#ria-corpo'), sub = modal.querySelector('#ria-sub');
    sub.textContent = '';
    corpo.innerHTML = '<div class="ria-carregando" role="status"><span>A IA está lendo as manchetes</span><i></i><i></i><i></i></div>';
    modal.classList.add('visible');
    document.addEventListener('keydown', tecla);
    modal.querySelector('.modal-close').focus();
    const j = await buscar();
    if (!modal.classList.contains('visible')) return;
    if (j.ok) { sub.textContent = legenda(j); corpo.innerHTML = html(j.texto); }
    else corpo.innerHTML = `<p class="ria-erro">${esc(j.erro)}${j.assinar ? ' <a href="/assinar">Ver planos</a>' : ''}</p>`;
  }

  const botao = document.getElementById('resumo-ia-btn');
  // a barra das notícias é remontada pelo noticias2.js: o botão vai junto, ao lado do "Gerar Briefing"
  const brief = document.getElementById('briefing-btn');
  if (botao && brief && brief.parentElement !== botao.parentElement) brief.before(botao);
  botao?.addEventListener('click', abrir);
})();
