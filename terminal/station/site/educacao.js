/* Aba Educação (29/10/2026): trilhas de lições com texto próprio, quiz e progresso.
   Conteúdo em educacao-conteudo.js. Progresso salvo neste navegador (mm_edu_v1). */
(() => {
  'use strict';
  const root = document.getElementById('edu-root');
  const C = window.MMEduConteudo;
  if (!root || !C) return;
  const GUARDA = 'mm_edu_v1';
  let est = { feitas: {}, ultima: null, quiz: {} };
  try { est = Object.assign(est, JSON.parse(localStorage.getItem(GUARDA) || '{}')); } catch (e) {}
  const salvar = () => { try { localStorage.setItem(GUARDA, JSON.stringify(est)); } catch (e) {} };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

  function md(t) {
    let h = '', lista = false;
    const fecha = () => { if (lista) { h += '</ul>'; lista = false; } };
    for (const bloco of t.split(/\n{2,}/)) {
      for (const l of bloco.split('\n')) {
        if (/^- /.test(l)) { if (!lista) { h += '<ul>'; lista = true; } h += `<li>${inline(l.slice(2))}</li>`; continue; }
        fecha();
        if (/^## /.test(l)) h += `<h3>${inline(l.slice(3))}</h3>`;
        else if (/^> /.test(l)) h += `<div class="edu-exemplo">${inline(l.slice(2))}</div>`;
        else if (l.trim()) h += `<p>${inline(l)}</p>`;
      }
      fecha();
    }
    return h;
  }

  const ativas = C.trilhas.filter((t) => !t.emBreve);
  const todas = ativas.flatMap((t) => t.licoes.map((l) => ({ t, l })));
  const acha = (id) => todas.find((x) => x.l.id === id);
  const feitasDa = (t) => t.licoes.filter((l) => est.feitas[l.id]).length;
  const pct = (t) => Math.round((feitasDa(t) / t.licoes.length) * 100);

  const ICO = {
    tempo: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    livro: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/></svg>',
    seta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    volta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  };

  function anel(p, tam = 56) {
    const r = tam / 2 - 5, c = 2 * Math.PI * r;
    return `<svg class="edu-anel" width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" aria-hidden="true"><circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" class="fundo"/><circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" class="cheio" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p / 100)}" transform="rotate(-90 ${tam / 2} ${tam / 2})"/></svg>`;
  }

  // ---------- início ----------
  function inicio() {
    const ult = est.ultima && acha(est.ultima);
    const proxima = ult ? (est.feitas[ult.l.id] ? (todas[todas.indexOf(ult) + 1] || ult) : ult) : todas[0];
    const totalFeitas = todas.filter((x) => est.feitas[x.l.id]).length;
    root.innerHTML = `
      <section class="edu-hero">
        <div class="edu-hero-txt">
          <span class="edu-selo">Educação</span>
          <h2>Aprenda o mercado no seu ritmo</h2>
          <p>Lições curtas, com exemplos, resumo e perguntas para fixar. Escritas pela equipe do Mercado Macro, com os livros da CVM como leitura indicada.</p>
          <div class="edu-hero-acoes">
            <button type="button" class="edu-btn edu-prim" data-licao="${proxima.l.id}">${totalFeitas ? 'Continuar' : 'Começar'}: ${esc(proxima.l.titulo)} ${ICO.seta}</button>
          </div>
        </div>
        <div class="edu-hero-num">
          ${anel(Math.round((totalFeitas / todas.length) * 100), 92)}
          <div><b>${totalFeitas}/${todas.length}</b><span>lições concluídas</span></div>
        </div>
      </section>
      <h3 class="edu-sec">Trilhas</h3>
      <div class="edu-trilhas">
        ${C.trilhas.map((t) => t.emBreve
          ? `<div class="edu-trilha breve"><span class="edu-nivel">${esc(t.nivel)}</span><h4>${esc(t.titulo)}</h4><p>${esc(t.resumo)}</p><span class="edu-breve">Em preparação</span></div>`
          : `<button type="button" class="edu-trilha" data-trilha="${t.id}"><span class="edu-nivel">${esc(t.nivel)}</span><h4>${esc(t.titulo)}</h4><p>${esc(t.resumo)}</p>
              <div class="edu-barra"><i style="width:${pct(t)}%"></i></div><span class="edu-meta">${t.licoes.length} lições · ${t.licoes.reduce((a, l) => a + l.minutos, 0)} min · ${pct(t)}% concluído</span></button>`).join('')}
      </div>
      <p class="edu-nota">Conteúdo educativo, não é recomendação de investimento. Regras de impostos e garantias mudam; confira sempre a regra vigente.</p>`;
  }

  // ---------- trilha ----------
  function trilha(id) {
    const t = ativas.find((x) => x.id === id) || ativas[0];
    root.innerHTML = `
      <button type="button" class="edu-voltar" data-ir="inicio">${ICO.volta} Educação</button>
      <section class="edu-trilha-cab">
        <div><span class="edu-nivel">${esc(t.nivel)}</span><h2>${esc(t.titulo)}</h2><p>${esc(t.resumo)}</p></div>
        <div class="edu-hero-num">${anel(pct(t), 72)}<div><b>${feitasDa(t)}/${t.licoes.length}</b><span>concluídas</span></div></div>
      </section>
      <ol class="edu-lista">
        ${t.licoes.map((l, i) => `<li><button type="button" data-licao="${l.id}" class="${est.feitas[l.id] ? 'feita' : ''}">
          <span class="edu-num">${est.feitas[l.id] ? ICO.ok : i + 1}</span>
          <span class="edu-li-txt"><b>${esc(l.titulo)}</b><small>${esc(l.abertura)}</small></span>
          <span class="edu-min">${ICO.tempo}${l.minutos} min</span></button></li>`).join('')}
      </ol>`;
  }

  // ---------- lição ----------
  function licao(id) {
    const x = acha(id) || todas[0];
    const { t, l } = x;
    const i = t.licoes.indexOf(l), ant = t.licoes[i - 1], prox = t.licoes[i + 1];
    est.ultima = l.id; salvar();
    const resp = est.quiz[l.id] || {};
    root.innerHTML = `
      <button type="button" class="edu-voltar" data-trilha="${t.id}">${ICO.volta} ${esc(t.titulo)}</button>
      <div class="edu-licao">
        <article class="edu-artigo">
          <span class="edu-nivel">Lição ${i + 1} de ${t.licoes.length} · ${l.minutos} min de leitura</span>
          <h2>${esc(l.titulo)}</h2>
          <p class="edu-abre">${esc(l.abertura)}</p>
          <div class="edu-corpo">${md(l.texto)}</div>
          <section class="edu-resumo"><h3>Em resumo</h3><ul>${l.pontos.map((p) => `<li>${inline(p)}</li>`).join('')}</ul></section>
          <section class="edu-quiz"><h3>Teste o que aprendeu</h3>
            ${l.quiz.map((q, qi) => {
              const r = resp[qi];
              return `<div class="edu-q" data-q="${qi}"><p><b>${qi + 1}.</b> ${esc(q.p)}</p><div class="edu-ops">${q.o.map((o, oi) => {
                const cls = r === undefined ? '' : oi === q.c ? 'certa' : oi === r ? 'errada' : 'apagada';
                return `<button type="button" data-op="${oi}" class="${cls}"${r !== undefined ? ' disabled' : ''}>${esc(o)}</button>`;
              }).join('')}</div>${r !== undefined ? `<p class="edu-exp ${r === q.c ? 'ok' : 'nao'}">${r === q.c ? 'Certo.' : 'Não foi dessa vez.'} ${esc(q.e)}</p>` : ''}</div>`;
            }).join('')}
          </section>
          <nav class="edu-nav">
            ${ant ? `<button type="button" class="edu-btn" data-licao="${ant.id}">${ICO.volta} ${esc(ant.titulo)}</button>` : '<span></span>'}
            ${prox ? `<button type="button" class="edu-btn edu-prim" data-licao="${prox.id}">${esc(prox.titulo)} ${ICO.seta}</button>` : `<button type="button" class="edu-btn edu-prim" data-trilha="${t.id}">Ver a trilha ${ICO.seta}</button>`}
          </nav>
        </article>
        <aside class="edu-lado">
          <div class="edu-caixa">
            <h4>Nesta trilha</h4>
            <ol>${t.licoes.map((m, k) => `<li><button type="button" data-licao="${m.id}" class="${m === l ? 'atual' : ''} ${est.feitas[m.id] ? 'feita' : ''}"><span>${est.feitas[m.id] ? ICO.ok : k + 1}</span>${esc(m.titulo)}</button></li>`).join('')}</ol>
          </div>
          ${l.painel ? `<div class="edu-caixa"><h4>${l.painel.url ? 'Simule' : 'No painel'}</h4>${l.painel.url
            ? `<a class="edu-btn edu-cheio" href="${esc(l.painel.url)}" target="_blank" rel="noopener">${esc(l.painel.texto)} ${ICO.seta}</a>`
            : `<button type="button" class="edu-btn edu-cheio" data-aba="${l.painel.aba}">${esc(l.painel.texto)} ${ICO.seta}</button>`}</div>` : ''}
          <div class="edu-caixa"><h4>Para ir além</h4><a class="edu-livro" href="${l.livro.url}" target="_blank" rel="noopener">${ICO.livro}<span>Livro <b>${esc(l.livro.titulo)}</b>, da CVM. Distribuição gratuita no Portal do Investidor.</span></a></div>
        </aside>
      </div>`;
    topo();
  }

  // ao abrir uma lição, volta para o começo dela só se o começo ficou fora da tela
  // #edu-root é quem rola (generic-wrap); se não rolar, usa a janela
  function topo() {
    root.scrollTop = 0;
    const r = root.getBoundingClientRect();
    if (r.top < 0) window.scrollBy(0, r.top - 12);
  }

  function responder(lid, qi, oi) {
    const x = acha(lid); if (!x) return;
    est.quiz[lid] = est.quiz[lid] || {};
    est.quiz[lid][qi] = oi;
    // lição concluída quando todas as perguntas foram respondidas
    if (Object.keys(est.quiz[lid]).length >= x.l.quiz.length) est.feitas[lid] = true;
    salvar();
    // redesenha sem pular para o topo
    const q = root.querySelector('[data-q="' + qi + '"]'), antes = q ? q.getBoundingClientRect().top : 0;
    licao(lid);
    const depois = root.querySelector('[data-q="' + qi + '"]');
    if (depois) { const d = depois.getBoundingClientRect().top - antes; root.scrollTop += d; if (Math.abs(depois.getBoundingClientRect().top - antes) > 2) window.scrollBy(0, depois.getBoundingClientRect().top - antes); }
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button, a'); if (!b) return;
    if (b.dataset.op !== undefined) { const q = b.closest('[data-q]'); responder(est.ultima, +q.dataset.q, +b.dataset.op); return; }
    if (b.dataset.licao) return licao(b.dataset.licao);
    if (b.dataset.trilha) { trilha(b.dataset.trilha); return topo(); }
    if (b.dataset.ir === 'inicio') { inicio(); return topo(); }
    if (b.dataset.aba) { const t = document.querySelector('.tab-btn[data-tab="' + b.dataset.aba + '"]'); if (t) t.click(); }
  });

  const css = document.createElement('style');
  css.textContent = `
  #edu-root{max-width:1180px;margin:0 auto;color:var(--text)}
  #edu-root svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}
  .edu-hero{display:flex;align-items:center;gap:28px;justify-content:space-between;padding:30px 32px;border:1px solid var(--line);border-radius:18px;
    background:radial-gradient(120% 140% at 100% 0%,var(--accent-soft),transparent 60%),var(--surface);margin-bottom:26px}
  .edu-selo{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:8px}
  .edu-hero h2{font-size:28px;line-height:1.15;margin:0 0 10px;letter-spacing:-.01em}
  .edu-hero p{margin:0;color:var(--text-2);max-width:620px;line-height:1.55}
  .edu-hero-acoes{margin-top:18px}
  .edu-hero-num{display:flex;align-items:center;gap:14px;flex:0 0 auto}
  .edu-hero-num b{display:block;font-size:22px;font-family:'JetBrains Mono',monospace}
  .edu-hero-num span{font-size:12px;color:var(--text-3)}
  .edu-anel .fundo{fill:none;stroke:var(--line-2);stroke-width:6}
  .edu-anel .cheio{fill:none;stroke:var(--accent);stroke-width:6;stroke-linecap:round;transition:stroke-dashoffset .4s ease}
  #edu-root .edu-anel{width:auto;height:auto;stroke-width:6}
  .edu-btn{text-decoration:none;display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);border-radius:10px;padding:10px 14px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;text-align:left;min-height:42px}
  .edu-btn:hover{border-color:var(--accent)}
  .edu-prim{background:var(--accent);border-color:var(--accent);color:#141006}
  .edu-prim:hover{filter:brightness(1.05)}
  .edu-cheio{width:100%;justify-content:space-between}
  .edu-sec{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin:0 0 12px}
  .edu-trilhas{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
  .edu-trilha{display:flex;flex-direction:column;align-items:flex-start;gap:6px;text-align:left;padding:18px;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--text);font:inherit;cursor:pointer;min-height:170px}
  button.edu-trilha:hover{border-color:var(--accent);transform:translateY(-1px)}
  .edu-trilha h4{margin:0;font-size:16px}
  .edu-trilha p{margin:0;font-size:13px;color:var(--text-2);line-height:1.5;flex:1}
  .edu-trilha.breve{opacity:.62;cursor:default}
  .edu-nivel{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent)}
  .edu-breve{font-size:12px;color:var(--text-3);border:1px dashed var(--line-2);border-radius:999px;padding:3px 10px}
  .edu-barra{width:100%;height:6px;border-radius:9px;background:var(--line);overflow:hidden;margin-top:6px}
  .edu-barra i{display:block;height:100%;background:var(--accent);border-radius:9px}
  .edu-meta{font-size:12px;color:var(--text-3)}
  .edu-nota{font-size:12px;color:var(--text-3);margin:22px 0 0}
  .edu-voltar{display:inline-flex;align-items:center;gap:6px;border:0;background:none;color:var(--text-2);font:inherit;font-size:13px;cursor:pointer;padding:6px 0;margin-bottom:12px}
  .edu-voltar:hover{color:var(--accent)}
  .edu-trilha-cab{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:24px 26px;border:1px solid var(--line);border-radius:16px;background:var(--surface);margin-bottom:18px}
  .edu-trilha-cab h2{margin:6px 0 8px;font-size:24px}
  .edu-trilha-cab p{margin:0;color:var(--text-2)}
  .edu-lista{list-style:none;margin:0;padding:0;display:grid;gap:10px}
  .edu-lista button{width:100%;display:flex;align-items:center;gap:16px;text-align:left;padding:16px 18px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--text);font:inherit;cursor:pointer}
  .edu-lista button:hover{border-color:var(--accent)}
  .edu-num{width:34px;height:34px;flex:0 0 34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;background:var(--surface-2);border:1px solid var(--line-2);font-family:'JetBrains Mono',monospace;font-size:13px}
  .feita .edu-num{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
  .edu-li-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
  .edu-li-txt small{color:var(--text-3);font-size:12.5px;line-height:1.45}
  .edu-min{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--text-3);white-space:nowrap}
  .edu-licao{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:28px;align-items:start}
  .edu-artigo{max-width:720px}
  .edu-artigo h2{font-size:30px;line-height:1.18;margin:8px 0 12px;letter-spacing:-.01em}
  .edu-abre{font-size:17px;line-height:1.6;color:var(--text-2);margin:0 0 22px}
  .edu-corpo{font-size:15.5px;line-height:1.75}
  .edu-corpo h3{font-size:19px;margin:30px 0 10px}
  .edu-corpo p{margin:0 0 14px}
  .edu-corpo ul{margin:0 0 16px;padding-left:22px}
  .edu-corpo li{margin:6px 0}
  .edu-exemplo{margin:18px 0;padding:14px 16px;border-left:3px solid var(--accent);background:var(--accent-soft);border-radius:0 10px 10px 0;font-size:14.5px;line-height:1.6}
  .edu-resumo,.edu-quiz{margin-top:30px;padding:20px 22px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}
  .edu-resumo h3,.edu-quiz h3{margin:0 0 12px;font-size:16px}
  .edu-resumo ul{margin:0;padding-left:20px;line-height:1.65}
  .edu-q{padding:12px 0;border-top:1px solid var(--line)}
  .edu-q:first-of-type{border-top:0;padding-top:0}
  .edu-q>p{margin:0 0 10px;line-height:1.5}
  .edu-ops{display:flex;flex-wrap:wrap;gap:8px}
  .edu-ops button{border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);border-radius:9px;padding:9px 13px;font:inherit;font-size:13.5px;cursor:pointer;min-height:40px;text-align:left}
  .edu-ops button:not(:disabled):hover{border-color:var(--accent)}
  .edu-ops button.certa{border-color:var(--pos);background:color-mix(in srgb,var(--pos) 14%,transparent);color:var(--text)}
  .edu-ops button.errada{border-color:var(--neg);background:color-mix(in srgb,var(--neg) 12%,transparent)}
  .edu-ops button.apagada{opacity:.5}
  .edu-ops button:disabled{cursor:default}
  .edu-exp{margin:10px 0 0;font-size:13.5px;line-height:1.55;color:var(--text-2)}
  .edu-nav{display:flex;justify-content:space-between;gap:12px;margin-top:26px;flex-wrap:wrap}
  .edu-lado{position:sticky;top:16px;display:grid;gap:14px}
  .edu-caixa{padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}
  .edu-caixa h4{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.07em;color:var(--text-3)}
  .edu-caixa ol{list-style:none;margin:0;padding:0;display:grid;gap:2px}
  .edu-caixa ol button{width:100%;display:flex;gap:10px;align-items:center;text-align:left;border:0;background:none;color:var(--text-2);font:inherit;font-size:13px;padding:7px 8px;border-radius:8px;cursor:pointer;line-height:1.35}
  .edu-caixa ol button span{width:22px;height:22px;flex:0 0 22px;border-radius:50%;border:1px solid var(--line-2);display:flex;align-items:center;justify-content:center;font-size:11px;font-family:'JetBrains Mono',monospace}
  .edu-caixa ol button.feita span{border-color:var(--accent);color:var(--accent)}
  .edu-caixa ol button.atual{background:var(--accent-soft);color:var(--text);font-weight:600}
  .edu-caixa ol button:hover{color:var(--text)}
  .edu-livro{display:flex;gap:10px;align-items:flex-start;color:var(--text-2);text-decoration:none;font-size:13px;line-height:1.5}
  .edu-livro svg{width:20px !important;height:20px !important;color:var(--accent);margin-top:2px}
  .edu-livro:hover{color:var(--text)}
  @media (max-width:1000px){.edu-licao{grid-template-columns:1fr}.edu-lado{position:static}}
  @media (max-width:640px){
    .edu-hero{flex-direction:column;align-items:flex-start;padding:22px 18px;gap:18px}
    .edu-hero h2{font-size:23px}
    .edu-trilha-cab{flex-direction:column;align-items:flex-start;padding:18px}
    .edu-artigo h2{font-size:24px}
    .edu-abre{font-size:16px}
    .edu-corpo{font-size:15px}
    .edu-lista button{padding:14px;gap:12px}
    .edu-min{display:none}
    .edu-nav .edu-btn{width:100%;justify-content:space-between}
    .edu-hero-acoes .edu-btn{width:100%;justify-content:space-between}
  }`;
  document.head.appendChild(css);

  inicio();
})();
