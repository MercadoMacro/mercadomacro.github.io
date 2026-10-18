/* Organização da Mesa: IDs estáveis, preferências validadas e edição pelos Ajustes. */
globalThis.MMDeskLayout = (() => {
  const blocks = [
    ['crypto','Criptomoedas'],['cards','Destaques do mercado'],['am','Índices das Américas'],
    ['eu','Índices europeus'],['as','Índices asiáticos'],['dx','Cesta do DXY'],['em','Moedas emergentes'],
    ['co','Commodities'],['ou','Futuros, juros e risco'],['curve','Curva de juros'],['news','Notícias'],
  ];
  const ids = blocks.map(([id]) => id);
  function normalize(value) {
    const v = value && typeof value === 'object' ? value : {};
    const order = Array.isArray(v.order) ? [...new Set(v.order.filter(id => ids.includes(id)))] : [];
    for (const id of ids) if (!order.includes(id)) order.push(id);
    const hidden = Array.isArray(v.hidden) ? [...new Set(v.hidden.filter(id => ids.includes(id)))] : [];
    return { order, hidden };
  }
  function toggle(value, id) {
    const next = normalize(value); if (!ids.includes(id)) return next;
    next.hidden = next.hidden.includes(id) ? next.hidden.filter(x => x !== id) : [...next.hidden, id]; return next;
  }
  function move(value, id, step) {
    const next = normalize(value), at = next.order.indexOf(id), to = at + step;
    if (at < 0 || ![-1,1].includes(step) || to < 0 || to >= next.order.length) return next;
    [next.order[at], next.order[to]] = [next.order[to], next.order[at]]; return next;
  }
  function before(value, id, target) {
    const next = normalize(value); if (id === target || !ids.includes(id) || !ids.includes(target)) return next;
    next.order = next.order.filter(x => x !== id); next.order.splice(next.order.indexOf(target), 0, id); return next;
  }
  function editor(value) {
    const config = normalize(value), names = Object.fromEntries(blocks);
    return `<p class="aj-note">Escolha os blocos e organize a ordem. Arraste pela alça no computador ou use as setas. A leitura segue da esquerda para a direita; no celular, de cima para baixo. A organização fica salva neste navegador.</p>
      <div class="aj-mesa-list">${config.order.map((id, i) => {
        const visible = !config.hidden.includes(id), name = names[id];
        return `<div class="aj-mesa-row" data-mesa-block="${id}">
          <span class="aj-mesa-grip" draggable="true" aria-hidden="true" title="Arrastar ${name}">⠿</span>
          <span class="aj-mesa-name">${name}</span>
          <button type="button" data-act="mesa-toggle" data-mesa-id="${id}" role="switch" aria-checked="${visible}" aria-label="Mostrar ${name}" class="aj-mesa-eye ${visible ? 'on' : ''}"><i class="fas fa-eye${visible ? '' : '-slash'}" aria-hidden="true"></i></button>
          <button type="button" data-act="mesa-up" data-mesa-id="${id}" aria-label="Mover ${name} para cima" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" data-act="mesa-down" data-mesa-id="${id}" aria-label="Mover ${name} para baixo" ${i === config.order.length - 1 ? 'disabled' : ''}>↓</button>
        </div>`;
      }).join('')}</div><button type="button" class="btn-sm aj-wide" data-act="mesa-reset">Restaurar organização padrão da Mesa</button>`;
  }
  function apply(root, value) {
    if (!value || typeof value !== 'object') return;
    const config = normalize(value), oldGrid = root.querySelector('.ms-grid'); if (!oldGrid) return;
    const nodes = new Map([
      ['crypto',root.querySelector('.ms-crypto')],['cards',root.querySelector('.ms-cards')],
      ...[...root.querySelectorAll('.ms-tb[data-tb]')].map(n => [n.dataset.tb,n]),
      ['curve',root.querySelector('.ms-curvebox')],['news',root.querySelector('.ms-newsbox')],
    ]);
    const layout = document.createElement('div'); layout.className = 'ms-custom-layout'; oldGrid.before(layout);
    for (const id of config.order) {
      const node = nodes.get(id); if (!node) continue;
      node.hidden = config.hidden.includes(id); node.dataset.mesaBlock = id;
      if (id === 'crypto' || id === 'cards') node.classList.add('ms-wide-block');
      layout.appendChild(node);
    }
    oldGrid.remove();
    if (config.hidden.length === ids.length) {
      const empty = document.createElement('div'); empty.className = 'ms-layout-empty';
      const p = document.createElement('p'); p.textContent = 'Todos os blocos estão ocultos.';
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn-sm'; b.textContent = 'Personalizar Mesa';
      b.addEventListener('click', () => window.openSettings?.()); empty.append(p,b); layout.appendChild(empty);
    }
  }
  return { blocks, normalize, toggle, move, before, editor, apply };
})();
