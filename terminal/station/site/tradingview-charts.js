/* =====================================================================
   MERCADO MACRO - INTEGRAÇÃO DE GRÁFICOS LIGHTWEIGHT CHARTS (TRADINGVIEW)
   Renderiza gráficos interativos de alta performance em Canvas
   ===================================================================== */
(() => {
  'use strict';

  // Cria modal de gráfico expandido do TradingView
  const createChartModal = () => {
    let modal = document.querySelector('#tv-chart-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'tv-chart-modal';
    modal.className = 'tv-modal-backdrop hidden';
    modal.innerHTML = `
      <div class="tv-modal-dialog" role="dialog" aria-label="Gráfico TradingView">
        <div class="tv-modal-header">
          <div class="tv-modal-title">
            <i class="fas fa-chart-area"></i>
            <span id="tv-modal-symbol">Ativo</span>
          </div>
          <button type="button" class="tv-modal-close" id="tv-modal-close" title="Fechar">&times;</button>
        </div>
        <div class="tv-modal-body">
          <div id="tv-chart-container" class="tv-chart-container"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#tv-modal-close')?.addEventListener('click', () => {
      modal.classList.add('hidden');
      document.body.style.overflow = '';
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
      }
    });

    return modal;
  };

  let activeChart = null;
  let activeSeries = null;

  // Renderiza o gráfico do TradingView
  window.renderTradingViewChart = (symbolName, dataPoints) => {
    if (!window.LightweightCharts) {
      console.warn('LightweightCharts não carregado.');
      return;
    }

    const modal = createChartModal();
    const titleEl = modal.querySelector('#tv-modal-symbol');
    const container = modal.querySelector('#tv-chart-container');

    if (titleEl) titleEl.textContent = symbolName;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Limpa gráfico anterior
    container.innerHTML = '';

    const isLight = document.body.classList.contains('light');
    const chart = window.LightweightCharts.createChart(container, {
      width: container.clientWidth || 700,
      height: 400,
      layout: {
        background: { color: isLight ? '#ffffff' : '#0f172a' },
        textColor: isLight ? '#0f172a' : '#f8fafc',
      },
      grid: {
        vertLines: { color: isLight ? '#e2e8f0' : '#1e293b' },
        horzLines: { color: isLight ? '#e2e8f0' : '#1e293b' },
      },
      crosshair: {
        mode: window.LightweightCharts.CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: isLight ? '#cbd5e1' : '#334155',
      },
      timeScale: {
        borderColor: isLight ? '#cbd5e1' : '#334155',
        timeVisible: true,
      },
    });

    // Se houver histórico de datas/preços, cria área ou velas
    const areaSeries = chart.addAreaSeries({
      topColor: 'rgba(59, 130, 246, 0.4)',
      bottomColor: 'rgba(59, 130, 246, 0.0)',
      lineColor: '#3b82f6',
      lineWidth: 2,
    });

    // Dados numéricos simples convertidos para pontos de tempo válidos
    const now = Math.floor(Date.now() / 1000);
    const formattedData = (dataPoints || [100, 102, 101, 105, 108, 107, 110]).map((val, idx, arr) => ({
      time: now - (arr.length - idx) * 86400,
      value: val,
    }));

    areaSeries.setData(formattedData);
    chart.timeScale().fitContent();

    activeChart = chart;
    activeSeries = areaSeries;
  };

  // Adiciona evento de clique em cards de cotação para abrir gráfico interativo
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.quote-card[data-symbol], .qc-3m');
    if (card && !e.target.closest('a, button, input')) {
      const sym = card.dataset?.symbol || card.closest('.quote-card')?.dataset?.symbol || 'Ibovespa';
      const name = card.querySelector('.qc-name, .qc-title')?.textContent.trim() || sym;

      // Abre o gráfico TradingView
      window.renderTradingViewChart(name, [100, 101.5, 102, 101.8, 103.4, 104, 103.8, 105.2]);
    }
  });
})();
