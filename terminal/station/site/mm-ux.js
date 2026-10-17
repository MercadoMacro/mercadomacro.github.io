/* =====================================================================
   MERCADO MACRO - MELHORIAS DE UI/UX (Atalho Ctrl+K, Animações e Mobile)
   ===================================================================== */
(() => {
  'use strict';

  // 1. ATALHO GLOBAL DE BUSCA RÁPIDA (Ctrl+K / Cmd+K)
  const setupQuickSearch = () => {
    // Adiciona botão visual de busca no cabeçalho se houver topbar
    const topbarRight = document.querySelector('.topbar-right');
    if (topbarRight && !document.querySelector('#btn-quick-search')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'btn-quick-search';
      btn.className = 'quick-search-trigger';
      btn.title = 'Busca rápida (Ctrl + K)';
      btn.innerHTML = '<i class="fas fa-search" aria-hidden="true"></i> <span class="qs-badge">Ctrl K</span>';
      topbarRight.prepend(btn);
      btn.addEventListener('click', openModal);
    }

    // Modal de busca
    let modal = document.querySelector('#quick-search-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'quick-search-modal';
      modal.className = 'qs-modal-backdrop hidden';
      modal.innerHTML = `
        <div class="qs-modal-dialog" role="dialog" aria-modal="true" aria-label="Busca Rápida">
          <div class="qs-modal-header">
            <i class="fas fa-search qs-icon"></i>
            <input type="search" id="qs-input" placeholder="Buscar ativo, indicador, aba ou notícia..." autocomplete="off">
            <kbd class="qs-esc">ESC</kbd>
          </div>
          <div class="qs-modal-results" id="qs-results">
            <div class="qs-empty">Digite algo para buscar no painel...</div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }

    const input = modal.querySelector('#qs-input');
    const resultsContainer = modal.querySelector('#qs-results');

    function openModal() {
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      input.value = '';
      renderResults('');
      setTimeout(() => input.focus(), 50);
    }

    function closeModal() {
      modal.classList.add('hidden');
      document.body.style.overflow = '';
    }

    // Ações ao digitar na busca
    input?.addEventListener('input', (e) => renderResults(e.target.value.trim().toLowerCase()));

    function renderResults(q) {
      if (!resultsContainer) return;
      if (!q) {
        resultsContainer.innerHTML = `<div class="qs-empty">Digite o nome de uma ação, indicador ou aba...</div>`;
        return;
      }

      const matches = [];

      // A) Abas do painel
      document.querySelectorAll('.tab-btn').forEach((btn) => {
        const title = btn.textContent.trim();
        if (title.toLowerCase().includes(q)) {
          matches.push({
            type: 'Aba',
            title: `Aba: ${title}`,
            icon: 'fa-layer-group',
            action: () => { btn.click(); closeModal(); }
          });
        }
      });

      // B) Cards e Ativos visíveis no mercado
      document.querySelectorAll('.card, .mkt-card, .watch-card, tr[data-symbol]').forEach((card) => {
        const text = card.textContent.trim();
        if (text.toLowerCase().includes(q)) {
          const titleEl = card.querySelector('.card-title, .symbol, strong, h3') || card;
          const symbolText = titleEl.textContent.trim().slice(0, 40);
          matches.push({
            type: 'Ativo / Painel',
            title: symbolText,
            icon: 'fa-chart-line',
            action: () => {
              closeModal();
              card.scrollIntoView({ behavior: 'smooth', block: 'center' });
              card.classList.add('qs-highlight');
              setTimeout(() => card.classList.remove('qs-highlight'), 2000);
            }
          });
        }
      });

      if (!matches.length) {
        resultsContainer.innerHTML = `<div class="qs-empty">Nenhum resultado encontrado para "<strong>${q}</strong>"</div>`;
        return;
      }

      resultsContainer.innerHTML = matches.slice(0, 8).map((m, idx) => `
        <div class="qs-item" data-idx="${idx}">
          <i class="fas ${m.icon}"></i>
          <span class="qs-item-title">${m.title}</span>
          <span class="qs-item-type">${m.type}</span>
        </div>
      `).join('');

      resultsContainer.querySelectorAll('.qs-item').forEach((item, idx) => {
        item.addEventListener('click', () => matches[idx].action());
      });
    }

    // Atalhos de teclado (Ctrl + K e Esc)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        modal.classList.contains('hidden') ? openModal() : closeModal();
      } else if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        closeModal();
      }
    });
  };

  // 2. FEEDBACK HÁPTICO EM INTERAÇÕES MOBILE (DISPOSITIVOS COMPATÍVEIS)
  const setupHapticFeedback = () => {
    if (!('vibrate' in navigator)) return;
    document.addEventListener('click', (e) => {
      if (e.target.closest('.tab-btn, button, .card, a')) {
        navigator.vibrate(12);
      }
    });
  };

  // 3. ANIMAÇÕES FLASH EM MUDANÇAS DE VALORES (ALTAS E BAIXAS)
  const setupValueFlashObserver = () => {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'characterData' || m.type === 'childList') {
          const el = m.target.parentElement;
          if (el && (el.classList.contains('val') || el.classList.contains('var') || el.classList.contains('price'))) {
            const txt = el.textContent;
            if (txt.includes('+') || txt.includes('▲')) {
              el.classList.add('flash-up');
              setTimeout(() => el.classList.remove('flash-up'), 800);
            } else if (txt.includes('-') || txt.includes('▼')) {
              el.classList.add('flash-down');
              setTimeout(() => el.classList.remove('flash-down'), 800);
            }
          }
        }
      }
    });

    const target = document.querySelector('#market-panel') || document.body;
    observer.observe(target, { childList: true, subtree: true, characterData: true });
  };

  // Inicializa tudo quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupQuickSearch();
      setupHapticFeedback();
      setupValueFlashObserver();
    });
  } else {
    setupQuickSearch();
    setupHapticFeedback();
    setupValueFlashObserver();
  }
})();
