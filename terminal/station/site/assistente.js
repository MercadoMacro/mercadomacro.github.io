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
  .ia-cab h2{margin:0;font-size:16px;flex:1}
  .ia-cab small{display:block;font-weight:400;color:var(--muted,#777);font-size:12px;margin-top:2px}
  .ia-cab button{border:0;background:transparent;color:var(--muted,#777);cursor:pointer;font-size:13px;padding:8px;border-radius:7px;min-height:36px}
  .ia-cab button:hover{background:var(--surface-2);color:var(--text)}
  .ia-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
  .ia-msg{max-width:92%;padding:10px 12px;border-radius:12px;font-size:14px;line-height:1.5;overflow-wrap:anywhere}
  .ia-msg p{margin:0 0 8px}.ia-msg p:last-child{margin:0}.ia-msg ul,.ia-msg ol{margin:0 0 8px;padding-left:20px}
  .ia-msg code{background:var(--surface-2);padding:1px 4px;border-radius:4px;font-size:13px}
  .ia-eu{align-self:flex-end;background:var(--accent-soft,#e8f0ff);color:var(--accent-ink,var(--text))}
  .ia-ele{align-self:flex-start;background:var(--surface-2,#f3f3f3)}
  .ia-erro{align-self:flex-start;color:var(--down,#c0392b);font-size:13px}
  .ia-vazio{color:var(--muted,#777);font-size:14px;line-height:1.5}
  .ia-vazio button{display:block;width:100%;text-align:left;margin-top:8px;border:1px solid var(--line-2,#ddd);background:transparent;color:var(--text);border-radius:9px;padding:9px 11px;cursor:pointer;font-size:13px}
  .ia-vazio button:hover{background:var(--surface-2)}
  .ia-pe{border-top:1px solid var(--line-2,#ddd);padding:12px 16px calc(12px + env(safe-area-inset-bottom))}
  .ia-form{display:flex;gap:8px;align-items:flex-end}
  .ia-form textarea{flex:1;resize:none;min-height:42px;max-height:140px;font:inherit;font-size:14px;padding:10px;border-radius:9px;border:1px solid var(--line-2,#ddd);background:var(--surface-2);color:var(--text)}
  .ia-form button{min-height:42px;padding:0 14px;border:0;border-radius:9px;background:var(--accent,#2563eb);color:#fff;font-weight:600;cursor:pointer}
  .ia-form button:disabled{opacity:.55;cursor:default}
  .ia-aviso{margin:8px 0 0;font-size:11.5px;color:var(--muted,#777);line-height:1.4}
  .ia-pensando{align-self:flex-start;color:var(--muted,#777);font-size:13px}
  @media (max-width:560px){.ia-painel{width:100%;border-left:0}}`;

  const SUGESTOES = ['O que é a curva de juros DI x pré e como ler?', 'Como o Fed decide os juros e o que é o FedWatch?', 'Explique o que é IPCA e como ele afeta a Selic.'];
  let painel, msgs, campo, enviar, limite = null, ocupado = false;

  function desenhar() {
    if (!conversa.length) {
      msgs.innerHTML = `<div class="ia-vazio">Pergunte sobre conceitos, indicadores e como usar o painel. O assistente não vê as cotações de agora.${SUGESTOES.map((s) => `<button type="button">${esc(s)}</button>`).join('')}</div>`;
      msgs.querySelectorAll('.ia-vazio button').forEach((b) => (b.onclick = () => { campo.value = b.textContent; perguntar(); }));
      return;
    }
    msgs.innerHTML = conversa.map((x) => `<div class="ia-msg ia-eu">${esc(x.p)}</div>` + (x.r ? `<div class="ia-msg ia-ele">${md(x.r)}</div>` : x.e ? `<div class="ia-erro">${esc(x.e)}</div>` : '')).join('')
      + (ocupado ? '<div class="ia-pensando">Pensando…</div>' : '');
    msgs.scrollTop = msgs.scrollHeight;
  }

  async function perguntar() {
    const p = campo.value.trim();
    if (!p || ocupado) return;
    campo.value = ''; ajustar();
    const item = { p };
    const historico = conversa.filter((x) => x.r).slice(-6).map((x) => ({ p: x.p, r: x.r }));
    conversa.push(item); ocupado = true; enviar.disabled = true; desenhar();
    try {
      const r = await fetch(API, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pergunta: p, historico }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.resposta) item.r = j.resposta; else item.e = j.erro || 'Não foi possível responder agora.';
    } catch (e) { item.e = 'Sem conexão. Tente de novo.'; }
    ocupado = false; enviar.disabled = false; salvar(); desenhar(); campo.focus();
  }

  function ajustar() { campo.style.height = 'auto'; campo.style.height = Math.min(campo.scrollHeight, 140) + 'px'; }

  function montar() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    painel = document.createElement('aside');
    painel.className = 'ia-painel'; painel.id = 'ia-painel';
    painel.setAttribute('aria-label', 'Assistente'); painel.setAttribute('aria-hidden', 'true');
    painel.innerHTML = `<div class="ia-cab"><h2>Assistente<small>Google Gemini${limite ? ` · ${limite} perguntas por dia` : ''}</small></h2>
        <button type="button" data-ia="limpar" title="Apagar a conversa">Limpar</button><button type="button" data-ia="fechar" aria-label="Fechar">Fechar</button></div>
      <div class="ia-msgs" aria-live="polite"></div>
      <div class="ia-pe"><form class="ia-form"><textarea rows="1" maxlength="1200" placeholder="Escreva sua pergunta" aria-label="Sua pergunta"></textarea><button type="submit">Enviar</button></form>
        <p class="ia-aviso">Respostas geradas por IA (Google Gemini). Podem conter erros e não são recomendação de investimento. Não escreva dados pessoais: as perguntas vão para o Google.</p></div>`;
    document.body.appendChild(painel);
    msgs = painel.querySelector('.ia-msgs'); campo = painel.querySelector('textarea'); enviar = painel.querySelector('.ia-form button');
    painel.querySelector('form').onsubmit = (e) => { e.preventDefault(); perguntar(); };
    campo.addEventListener('input', ajustar);
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); perguntar(); } });
    painel.querySelector('[data-ia="fechar"]').onclick = fechar;
    painel.querySelector('[data-ia="limpar"]').onclick = () => { if (ocupado) return; conversa = []; salvar(); desenhar(); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && painel.classList.contains('aberto')) fechar(); });
  }

  function abrir() { if (!painel) montar(); desenhar(); painel.classList.add('aberto'); painel.setAttribute('aria-hidden', 'false'); setTimeout(() => campo.focus(), 50); }
  function fechar() { painel.classList.remove('aberto'); painel.setAttribute('aria-hidden', 'true'); }

  const ICONE = '<svg class="si-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></svg>';

  function botoes() {
    const pe = document.querySelector('.side-foot');
    if (pe && !document.getElementById('side-ia')) {
      const b = document.createElement('button');
      b.className = 'side-item'; b.id = 'side-ia'; b.type = 'button'; b.title = 'Assistente (Google Gemini)';
      b.innerHTML = ICONE + '<span class="si-lbl">Assistente</span>';
      b.onclick = abrir;
      pe.insertBefore(b, pe.firstChild);
    }
    const lista = document.querySelector('.topbar-more-list');
    if (lista && !document.getElementById('menu-ia')) {
      const b = document.createElement('button');
      b.type = 'button'; b.id = 'menu-ia';
      b.innerHTML = '<i class="fas fa-comments" aria-hidden="true"></i><span>Assistente</span>';
      b.onclick = () => { const m = document.getElementById('topbar-more'); if (m) m.open = false; abrir(); };
      lista.insertBefore(b, lista.firstChild);
    }
  }

  fetch(API, { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j || !j.ligado) return;
    limite = j.limite;
    botoes();
    // a barra lateral pode ser redesenhada depois; repõe o botão se sumir
    new MutationObserver(() => { if (!document.getElementById('side-ia') && document.querySelector('.side-foot')) botoes(); })
      .observe(document.body, { childList: true, subtree: true });
  }).catch(() => {});
})();
