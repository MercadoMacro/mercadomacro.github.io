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
  .ia-erro a{color:var(--accent,#2563eb);font-weight:600}
  .ia-vazio{color:var(--muted,#777);font-size:14px;line-height:1.5}
  .ia-vazio button{display:block;width:100%;text-align:left;margin-top:8px;border:1px solid var(--line-2,#ddd);background:transparent;color:var(--text);border-radius:9px;padding:9px 11px;cursor:pointer;font-size:13px}
  .ia-vazio button:hover{background:var(--surface-2)}
  .ia-pe{border-top:1px solid var(--line-2,#ddd);padding:12px 16px calc(12px + env(safe-area-inset-bottom))}
  .ia-form{display:flex;gap:8px;align-items:flex-end}
  .ia-form textarea{flex:1;resize:none;min-height:42px;max-height:140px;font:inherit;font-size:14px;padding:10px;border-radius:9px;border:1px solid var(--line-2,#ddd);background:var(--surface-2);color:var(--text)}
  .ia-form button{min-height:42px;padding:0 14px;border:0;border-radius:9px;background:var(--accent,#2563eb);color:#fff;font-weight:600;cursor:pointer}
  .ia-form button:disabled{opacity:.55;cursor:default}
  .ia-aviso{margin:8px 0 0;font-size:11.5px;color:var(--muted,#777);line-height:1.4}
  .ia-rot{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--muted,#777);margin-bottom:6px}
  .ia-acoes{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  .ia-acoes button,.ia-acoes a{border:1px solid var(--line-2,#ddd);background:var(--surface,#fff);color:var(--text);border-radius:8px;padding:6px 10px;font-size:12.5px;font-weight:600;cursor:pointer;text-decoration:none;min-height:32px;display:inline-flex;align-items:center}
  .ia-acoes button:hover,.ia-acoes a:hover{border-color:var(--accent,#2563eb)}
  .ia-pensando{align-self:flex-start;color:var(--muted,#777);font-size:13px}
  .ia-marca{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;flex:0 0 36px;border-radius:50%;background:var(--accent-soft,#fff3dc)}
  .ia-marca svg{width:18px;height:18px;fill:var(--accent,#d4920f)}
  .ia-fab{position:fixed;right:20px;bottom:calc(20px + env(safe-area-inset-bottom));z-index:60;display:inline-flex;align-items:center;gap:10px;padding:7px 16px 7px 7px;border:1px solid var(--line-2,#ddd);border-radius:999px;background:var(--surface,#fff);color:var(--text);box-shadow:0 8px 28px rgba(0,0,0,.28);cursor:pointer;font:inherit;text-align:left;transition:transform .15s ease,border-color .15s ease}
  .ia-fab:hover{transform:translateY(-2px);border-color:var(--accent,#2563eb)}
  .ia-fab-txt{display:flex;flex-direction:column;line-height:1.15}
  .ia-fab-txt b{font-size:13.5px;font-weight:700}
  .ia-fab-txt small{font-size:11px;color:var(--muted,#777)}
  body.ia-aberto .ia-fab{display:none}
  @media print{.ia-fab{display:none}}
  @media (max-width:640px){.ia-fab{right:10px;bottom:calc(60px + env(safe-area-inset-bottom));padding:5px 12px 5px 5px;gap:8px}.ia-fab .ia-marca{width:30px;height:30px;flex-basis:30px}.ia-fab .ia-marca svg{width:15px;height:15px}.ia-fab-txt small{display:none}.ia-fab-txt b{font-size:12.5px}}
  @media (max-width:560px){.ia-painel{width:100%;border-left:0}}`;

  const SUGESTOES = ['Como adicionar um ativo à watchlist?', 'O que é a Selic? Meta e efetiva são iguais?', 'Como interpretar as probabilidades do Fed?', 'O que é a curva de juros DI x pré e como ler?'];
  let painel, msgs, campo, enviar, limite = null, ocupado = false, gemini = false, assinante = true;

  function desenhar() {
    if (!conversa.length) {
      msgs.innerHTML = `<div class="ia-vazio">Pergunte sobre conceitos, indicadores e como usar o painel. ${gemini && assinante ? 'Dúvidas comuns e assuntos das lições da Educação têm resposta pronta na hora; as outras vão para o Google Gemini, que não vê as cotações de agora.' : gemini ? 'Dúvidas comuns e assuntos das lições da Educação têm resposta pronta na hora. As perguntas livres ao Google Gemini são para assinantes.' : 'Respostas prontas para as dúvidas mais comuns.'}${SUGESTOES.filter((x) => (gemini && assinante) || prontaPara(x) || licaoPara(x)).map((s) => `<button type="button">${esc(s)}</button>`).join('')}</div>`;
      msgs.querySelectorAll('.ia-vazio button').forEach((b) => (b.onclick = () => { campo.value = b.textContent; perguntar(); }));
      return;
    }
    msgs.innerHTML = conversa.map((x, i) => `<div class="ia-msg ia-eu">${esc(x.p)}</div>` + (x.r ? `<div class="ia-msg ia-ele">${x.pronta ? `<div class="ia-rot">${x.pronta === 'licao' && x.licao ? 'Da aba Educação · ' + esc(x.licao.trilha) : 'Resposta pronta'}</div>` : ''}${md(x.r)}${x.pronta ? rodapePronta(x, i) : ''}</div>` : x.e ? `<div class="ia-erro">${esc(x.e)}${x.assinar ? ' <a href="/assinar">Ver planos</a>' : ''}</div>` : '')).join('')
      + (ocupado && !conversa[conversa.length - 1].r ? '<div class="ia-pensando">Pensando…</div>' : '');
    msgs.querySelectorAll('[data-ia-aba]').forEach((b) => (b.onclick = () => { const t = document.querySelector('.tab-btn[data-tab="' + b.dataset.iaAba + '"]'); if (t) { fechar(); t.click(); } }));
    msgs.querySelectorAll('[data-ia-licao]').forEach((b) => (b.onclick = () => { if (window.MMEdu && window.MMEdu.abrir(b.dataset.iaLicao)) fechar(); }));
    msgs.querySelectorAll('[data-ia-gemini]').forEach((b) => (b.onclick = () => { const x = conversa[+b.dataset.iaGemini]; if (x) { campo.value = x.p; perguntar(true); } }));
    msgs.scrollTop = msgs.scrollHeight;
  }

  // resposta pronta (base local do /vitrine/ajuda-conteudo.js): atalho para a aba e opção de perguntar ao Gemini
  function rodapePronta(x, i) {
    const a = x.acao;
    let h = '<div class="ia-acoes">';
    if (a && a.aba && document.querySelector('.tab-btn[data-tab="' + a.aba + '"]')) h += `<button type="button" data-ia-aba="${esc(a.aba)}">${esc(a.texto)}</button>`;
    else if (a && a.publico) h += `<a href="${esc(a.publico)}"${/^mailto:/.test(a.publico) ? '' : ' target="_blank" rel="noopener"'}>${esc(a.texto)}</a>`;
    if (x.licao && window.MMEdu) h += `<button type="button" data-ia-licao="${esc(x.licao.id)}">Abrir a lição: ${esc(x.licao.titulo)}</button>`;
    if (gemini && assinante) h += `<button type="button" data-ia-gemini="${i}">Perguntar ao Gemini</button>`;
    else if (gemini) h += '<a href="/assinar">Assinar para perguntar ao Gemini</a>';
    return h + '</div>';
  }
  function prontaPara(p) {
    try { return (window.MMAjudaConteudo && window.MMAjudaConteudo.buscar(p)[0]) || null; } catch (e) { return null; }
  }

  // lição da aba Educação que trata do assunto (educacao.js)
  function licaoPara(p) {
    try { return (window.MMEdu && window.MMEdu.buscar(p)[0]) || null; } catch (e) { return null; }
  }

  async function perguntar(soGemini) {
    const p = campo.value.trim();
    if (!p || ocupado) return;
    campo.value = ''; ajustar();
    const item = { p };
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
    conversa.push(item); ocupado = true; enviar.disabled = true; desenhar();
    try {
      const r = await fetch(API, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pergunta: p, historico, stream: true }) });
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
    painel.setAttribute('aria-label', 'Assistente'); painel.setAttribute('aria-hidden', 'true');
    painel.innerHTML = `<div class="ia-cab"><span class="ia-marca" aria-hidden="true"><svg viewBox="0 0 32 32"><rect x="3" y="21" width="6" height="9" rx="1.5"/><rect x="13" y="12" width="6" height="18" rx="1.5"/><rect x="23" y="2" width="6" height="28" rx="1.5"/></svg></span><h2>Assistente IA<small>${gemini && assinante ? 'Respostas prontas e Google Gemini' : 'Respostas prontas'}${limite ? ` · ${limite} perguntas ao Gemini por dia` : ''}</small></h2>
        <button type="button" data-ia="limpar" title="Apagar a conversa">Limpar</button><button type="button" data-ia="fechar" aria-label="Fechar">Fechar</button></div>
      <div class="ia-msgs" aria-live="polite"></div>
      <div class="ia-pe"><form class="ia-form"><textarea rows="1" maxlength="1200" placeholder="Escreva sua pergunta" aria-label="Sua pergunta"></textarea><button type="submit">Enviar</button></form>
        <p class="ia-aviso">${gemini ? 'As respostas que não são prontas são geradas por IA (Google Gemini): podem conter erros e não são recomendação de investimento. Não escreva dados pessoais: essas perguntas vão para o Google.' : 'Respostas prontas do Mercado Macro, sem IA. Não escreva senhas nem dados pessoais.'}</p></div>`;
    document.body.appendChild(painel);
    msgs = painel.querySelector('.ia-msgs'); campo = painel.querySelector('textarea'); enviar = painel.querySelector('.ia-form button');
    painel.querySelector('form').onsubmit = (e) => { e.preventDefault(); perguntar(); };
    campo.addEventListener('input', ajustar);
    campo.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); perguntar(); } });
    painel.querySelector('[data-ia="fechar"]').onclick = fechar;
    painel.querySelector('[data-ia="limpar"]').onclick = () => { if (ocupado) return; conversa = []; salvar(); desenhar(); };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && painel.classList.contains('aberto')) fechar(); });
  }

  function abrir() { if (!painel) montar(); desenhar(); document.body.classList.add('ia-aberto'); painel.classList.add('aberto'); painel.setAttribute('aria-hidden', 'false'); setTimeout(() => campo.focus(), 50); }
  function fechar() { document.body.classList.remove('ia-aberto'); painel.classList.remove('aberto'); painel.setAttribute('aria-hidden', 'true'); }

  // botão flutuante no canto inferior direito (no celular, acima do botão Resumo)
  function botao() {
    if (document.getElementById('ia-fab')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'ia-fab'; b.className = 'ia-fab';
    b.setAttribute('aria-label', 'Abrir o Assistente IA do Mercado Macro');
    b.innerHTML = '<span class="ia-marca" aria-hidden="true"><svg viewBox="0 0 32 32"><rect x="3" y="21" width="6" height="9" rx="1.5"/><rect x="13" y="12" width="6" height="18" rx="1.5"/><rect x="23" y="2" width="6" height="28" rx="1.5"/></svg></span><span class="ia-fab-txt"><b>Assistente IA</b><small>Mercado Macro</small></span>';
    b.onclick = abrir;
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
