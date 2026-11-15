/* Pop-up de novidades (15/11/2026, pedido do Dante). O texto é escrito no /admin (aba Comunicação).
   Aparece uma vez para cada pessoa, 3 s depois de o terminal abrir (não atrasa o carregamento), e não aparece
   por cima de outra janela aberta. Fechar ou tocar no botão marca como visto em todos os aparelhos da pessoa. */
(function () {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // **negrito**, linhas com "- " viram lista, linha em branco separa parágrafos
  function texto(t) {
    let out = '', lista = false;
    esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n').forEach((l) => {
      if (/^\s*[-•]\s+/.test(l)) { if (!lista) { out += '<ul>'; lista = true; } out += '<li>' + l.replace(/^\s*[-•]\s+/, '') + '</li>'; return; }
      if (lista) { out += '</ul>'; lista = false; }
      if (l.trim()) out += '<p>' + l + '</p>';
    });
    return out + (lista ? '</ul>' : '');
  }
  const css = `
.mmpop-fundo{position:fixed;inset:0;z-index:9000;background:rgba(2,6,23,.55);display:grid;place-items:center;padding:16px;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);animation:mmpopF .2s ease}
.mmpop{width:100%;max-width:440px;max-height:calc(100vh - 32px);overflow:auto;background:var(--surface,#151b27);border:1px solid var(--line-2,#2a3344);border-radius:18px;padding:22px 22px 18px;box-shadow:0 24px 60px rgba(0,0,0,.45);color:var(--text,#e7ecf3);animation:mmpopC .25s cubic-bezier(.2,.8,.3,1)}
.mmpop-tag{display:inline-block;font-size:11.5px;font-weight:700;letter-spacing:.04em;color:var(--accent,#f5b544);background:color-mix(in srgb,var(--accent,#f5b544) 14%,transparent);border-radius:20px;padding:4px 10px}
.mmpop h3{font-size:19px;margin:12px 0 8px;line-height:1.3;color:var(--text,#e7ecf3)}
.mmpop-tx{font-size:14.5px;line-height:1.55;color:var(--text-2,#c3ccdb)}.mmpop-tx p{margin:0 0 8px}.mmpop-tx ul{margin:0 0 8px;padding-left:20px}.mmpop-tx li{margin:3px 0}
.mmpop-bts{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}
.mmpop-bts button{font:inherit;font-weight:600;font-size:14px;border-radius:10px;padding:10px 16px;min-height:44px;cursor:pointer;border:1px solid var(--line-2,#2a3344);background:var(--surface-2,#1b2231);color:var(--text,#e7ecf3)}
.mmpop-bts .mmpop-b1{background:var(--accent,#f5b544);color:#111;border-color:transparent}
@keyframes mmpopF{from{opacity:0}}@keyframes mmpopC{from{opacity:0;transform:translateY(12px) scale(.98)}}
@media (prefers-reduced-motion:reduce){.mmpop-fundo,.mmpop{animation:none}}`;

  function marcar(id, acao) {
    return fetch('/api/novidades', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, acao }), keepalive: true }).catch(() => {});
  }
  function outraJanelaAberta() {
    return !!document.querySelector('.aj-open, .aj[open], dialog[open], .nr-open, #news-reader.open, .mmpop-fundo, .cmdk.open, .tour-on');
  }
  function mostrar(p) {
    if (!document.getElementById('mmpop-css')) { const st = document.createElement('style'); st.id = 'mmpop-css'; st.textContent = css; document.head.appendChild(st); }
    const f = document.createElement('div');
    f.className = 'mmpop-fundo';
    f.innerHTML = `<div class="mmpop" role="dialog" aria-modal="true" aria-labelledby="mmpop-t"><span class="mmpop-tag">✨ Novidade no site</span><h3 id="mmpop-t">${esc(p.titulo)}</h3><div class="mmpop-tx">${texto(p.texto)}</div>`
      + `<div class="mmpop-bts">${p.botao ? `<button type="button" class="mmpop-b1">${esc(p.botao)}</button>` : ''}<button type="button" class="mmpop-b2">Entendi</button></div></div>`;
    const antes = document.activeElement;
    const fechar = (acao) => {
      f.remove(); document.removeEventListener('keydown', tecla);
      marcar(p.id, acao);
      if (antes && antes.focus) try { antes.focus(); } catch (e) { /* ok */ }
    };
    const tecla = (e) => { if (e.key === 'Escape') fechar('fechou'); };
    f.addEventListener('click', (e) => { if (e.target === f) fechar('fechou'); });
    f.querySelector('.mmpop-b2').addEventListener('click', () => fechar('fechou'));
    const b1 = f.querySelector('.mmpop-b1');
    if (b1) b1.addEventListener('click', () => {
      fechar('clicou');
      const a = p.alvo || '';
      if (a.startsWith('tab:')) { if (typeof window.switchTab === 'function') window.switchTab(a.slice(4)); }
      else if (a.startsWith('/')) location.href = a;
      else if (/^https:\/\//.test(a)) window.open(a, '_blank', 'noopener');
    });
    document.addEventListener('keydown', tecla);
    document.body.appendChild(f);
    marcar(p.id, 'mostrou');
    setTimeout(() => (b1 || f.querySelector('.mmpop-b2')).focus(), 50);
  }
  async function verificar(tentativas = 0) {
    if (document.hidden) { document.addEventListener('visibilitychange', () => verificar(tentativas), { once: true }); return; }
    if (outraJanelaAberta()) { if (tentativas < 20) setTimeout(() => verificar(tentativas + 1), 5000); return; }
    try {
      const r = await fetch('/api/novidades', { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (j && j.popup && j.popup.id) mostrar(j.popup);
    } catch (e) { /* sem rede: tenta na próxima visita */ }
  }
  const iniciar = () => setTimeout(verificar, 3000);
  if (document.readyState === 'complete') iniciar(); else window.addEventListener('load', iniciar, { once: true });
})();
