/* =====================================================================
   MERCADO MACRO - INTEGRAÇÃO DE GRÁFICOS LIGHTWEIGHT CHARTS (TRADINGVIEW)
   Renderiza gráficos interativos de alta performance em Canvas
   utilizando os DADOS REAIS da cotação e busca ao vivo se necessário.
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
            <i class="fas fa-chart-line"></i>
            <span id="tv-modal-symbol">Buscando cotação real...</span>
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

  // Renderiza o gráfico do TradingView com os DADOS REAIS
  window.renderTradingViewChart = (symbolName, dataPoints) => {
    if (!window.LightweightCharts) {
      console.warn('LightweightCharts não está carregado.');
      return;
    }

    const modal = createChartModal();
    const titleEl = modal.querySelector('#tv-modal-symbol');
    const container = modal.querySelector('#tv-chart-container');

    if (titleEl) titleEl.textContent = symbolName;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Limpa gráfico anterior se existir
    container.innerHTML = '';
    if (activeChart) {
      try { activeChart.remove(); } catch (e) {}
      activeChart = null;
    }

    const isLight = document.body.classList.contains('light');
    const chart = window.LightweightCharts.createChart(container, {
      width: container.clientWidth || 740,
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

    const isUp = (dataPoints && dataPoints.length > 1) ? dataPoints[dataPoints.length - 1] >= dataPoints[0] : true;
    const lineColor = isUp ? '#22c55e' : '#ef4444';
    const topColor = isUp ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)';

    const areaSeries = chart.addAreaSeries({
      topColor: topColor,
      bottomColor: 'rgba(0, 0, 0, 0.0)',
      lineColor: lineColor,
      lineWidth: 2,
    });

    const now = Math.floor(Date.now() / 1000);
    const daySecs = 86400;

    // Converte os pontos reais em timestamps ordenados
    const formattedData = (dataPoints && dataPoints.length > 0 ? dataPoints : [0]).map((val, idx, arr) => ({
      time: now - (arr.length - 1 - idx) * daySecs,
      value: typeof val === 'number' ? val : parseFloat(val) || 0,
    }));

    areaSeries.setData(formattedData);
    chart.timeScale().fitContent();

    activeChart = chart;
  };

  // Evento de clique nos cards de cotação para abrir cotação REAL
  document.addEventListener('click', async (e) => {
    const card = e.target.closest('[data-symbol], .card, .mkt-card, .quote-card, tr[data-symbol]');
    if (card && !e.target.closest('a, button, input')) {
      const sym = card.dataset?.symbol || card.getAttribute('data-sym') || card.querySelector('[data-symbol]')?.dataset?.symbol;
      if (!sym) return;

      const nameEl = card.querySelector('.qc-name, .qc-title, .symbol, strong, td:first-child');
      const name = nameEl ? nameEl.textContent.trim() : sym;

      // 1. Busca dados reais salvos no navegador (memória da aplicação)
      let realVals = null;

      if (typeof window.mkt3mVals === 'function') {
        realVals = window.mkt3mVals(sym);
      }

      if (!realVals && window.yahooMemo && window.yahooMemo[sym] && window.yahooMemo[sym].sparkline) {
        realVals = window.yahooMemo[sym].sparkline;
      }

      // 2. Se não encontrou na memória local, faz a requisição em tempo real ao vivo
      if (!realVals || realVals.length < 2) {
        const modal = createChartModal();
        const titleEl = modal.querySelector('#tv-modal-symbol');
        if (titleEl) titleEl.textContent = `Buscando cotação ao vivo de ${name} (${sym})...`;
        modal.classList.remove('hidden');

        try {
          if (typeof window.fetchYahooChartSingle === 'function') {
            const chartData = await window.fetchYahooChartSingle(sym);
            if (chartData && chartData.sparkline) {
              realVals = chartData.sparkline;
            }
          }
        } catch (err) {
          console.warn(`Não foi possível carregar o gráfico de ${sym}:`, err);
        }
      }

      if (realVals && realVals.length >= 1) {
        window.renderTradingViewChart(`${name} (${sym})`, realVals);
      }
    }
  });
})();
