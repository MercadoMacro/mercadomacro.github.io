// =============================================
// CONFIGURAÇÕES GLOBAIS
// =============================================
const CACHE_KEY_NEWS = 'newsCache_v7'; // Incrementa a versão do cache
const CACHE_TTL_NEWS = 15 * 60 * 1000; // 15 minutos
const FAVORITES_KEY = 'favorites_v2';
const BOX_SLOT_ASSIGNMENT_KEY = 'boxSlotAssignment_v2'; // Nova versão para layout grid
const DEFAULT_SLOT_ASSIGNMENTS = {
    slotA: 'box-commentary',
    slotB: 'box-market',
    slotE: 'box-weekly-summary',
    slotC: 'news-widget',
    slotD: 'box-watchlist'
};
const GOOGLE_DOC_ID = '1IYFmfdajMtuquyfen070HRKfNjflwj-x9VvubEgs1XM';
const GOOGLE_API_KEY = 'AIzaSyBuvcaEcTBr0EIZZZ45h8JilbcWytiyUWo';
const COMMENTARY_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutos
let commentaryLastUpdateTimestamp = null;
let BANNER_PHRASES = [];

let contentModalOverlay, modalContentArea, contentModalCloseBtn;
let currentModalChartSymbol = null;

const VISIBILITY_PREFS_KEY = 'dashboardBoxVisibility_v2'; // Nova versão para visibilidade
const DEFAULT_BOX_VISIBILITY = {
    'box-commentary': true,
    'box-market': true,
    'box-weekly-summary': true,
    'box-watchlist': true,
    'news-widget': true
};
let settingsToggleBtn, visibilitySettingsPanel;
let visibilityCheckboxes = [];

const WATCHLIST_SYMBOLS_KEY = 'dashboardWatchlistSymbols_v2'; // Nova versão para watchlist
let watchlistSymbolInput, addWatchlistSymbolBtn, watchlistItemsContainer;
let watchlistSymbols = [];

let draggingElementId = null; // Para Drag and Drop com Grid

// =============================================
// FUNÇÃO DEBOUNCE
// =============================================
function debounce(func, wait, immediate) {
    let timeout;
    return function() {
        const context = this, args = arguments;
        const later = function() { timeout = null; if (!immediate) func.apply(context, args); };
        const callNow = immediate && !timeout; clearTimeout(timeout);
        timeout = setTimeout(later, wait); if (callNow) func.apply(context, args);
    };
}

// =============================================
// FUNÇÕES DO MODAL DE CONTEÚDO E GRÁFICO
// =============================================
function initializeModalElements() {
    contentModalOverlay = document.getElementById('content-modal-overlay');
    modalContentArea = document.getElementById('modal-content-area');
    contentModalCloseBtn = document.getElementById('content-modal-close-btn');

    if (!contentModalOverlay || !modalContentArea || !contentModalCloseBtn) {
        console.error('Um ou mais elementos do modal não foram encontrados. O modal não funcionará corretamente.');
        return;
    }

    contentModalCloseBtn.addEventListener('click', closeContentModal);
    // Fecha o modal ao clicar fora do conteúdo
    contentModalOverlay.addEventListener('click', (event) => {
        if (event.target === contentModalOverlay) {
            closeContentModal();
        }
    });
    // Fecha o modal ao pressionar ESC
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && contentModalOverlay.classList.contains('visible')) {
            closeContentModal();
        }
    });
}

function openContentModal(boxId) {
    if (!contentModalOverlay || !modalContentArea) {
        console.error('Elementos do modal não foram inicializados.');
        showNotification('Erro interno: Não foi possível abrir o modal.', true);
        return;
    }

    const originalBox = document.getElementById(boxId);
    const originalBoxContent = originalBox ? originalBox.querySelector('.box-content') : null;

    // Limpa conteúdo anterior e reinicia o estado do gráfico
    while (modalContentArea.firstChild) {
        modalContentArea.removeChild(modalContentArea.firstChild);
    }
    currentModalChartSymbol = null;

    if (!originalBoxContent) {
        modalContentArea.innerHTML = '<p class="error-commentary"><i class="fas fa-exclamation-triangle"></i> Conteúdo não encontrado para exibição.</p>';
    } else {
        if (boxId === 'box-market') {
            const marketWidgetModalContainer = document.createElement('div');
            marketWidgetModalContainer.id = 'modal-market-overview-container';
            marketWidgetModalContainer.style.width = '100%';
            marketWidgetModalContainer.style.height = '100%';
            modalContentArea.appendChild(marketWidgetModalContainer);
            const currentTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
            if (typeof renderMarketOverviewWidget === 'function') {
                renderMarketOverviewWidget(currentTheme, marketWidgetModalContainer.id);
            } else {
                marketWidgetModalContainer.innerHTML = '<p class="error-commentary"><i class="fas fa-exclamation-triangle"></i> Erro: Widget de mercado não disponível.</p>';
            }
        } else {
            // Clona o conteúdo para o modal
            const clonedContent = originalBoxContent.cloneNode(true);
            modalContentArea.appendChild(clonedContent);
            // Corrige overflow-y:auto em elementos clonados dentro do modal
            const clonedScrollContent = clonedContent.closest('.box-content');
            if (clonedScrollContent) {
                clonedScrollContent.style.overflowY = 'visible'; // Permite que o modal controle o scroll
                clonedScrollContent.style.maxHeight = 'none';
            }
        }
    }

    // Exibe o modal com transição
    contentModalOverlay.style.display = 'flex';
    requestAnimationFrame(() => { // Usa requestAnimationFrame para garantir que o display 'flex' seja aplicado antes da transição
        contentModalOverlay.classList.add('visible');
    });

    document.body.classList.add('body-modal-open'); // Adiciona classe para bloquear scroll
}

function openChartDetailModal(symbol) {
    if (!contentModalOverlay || !modalContentArea || typeof TradingView === 'undefined') {
        console.error('Elementos do modal ou TradingView não disponíveis para o gráfico.');
        showNotification('Erro ao abrir gráfico detalhado. Tente recarregar a página.', true);
        return;
    }

    while (modalContentArea.firstChild) {
        modalContentArea.removeChild(modalContentArea.firstChild);
    }
    currentModalChartSymbol = symbol;

    const chartContainerDiv = document.createElement('div');
    chartContainerDiv.id = 'modal-tv-chart-container';
    chartContainerDiv.style.width = '100%';
    chartContainerDiv.style.height = '100%';
    modalContentArea.appendChild(chartContainerDiv);
    const currentTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';

    try {
        new TradingView.widget({
            "container_id": chartContainerDiv.id,
            "symbol": symbol,
            "interval": "D",
            "theme": currentTheme,
            "autosize": true,
            "locale": "pt_BR",
            "toolbar_bg": currentTheme === "light" ? "#f1f3f6" : "#131722",
            "enable_publishing": false,
            "allow_symbol_change": true,
            "hide_side_toolbar": false,
            "studies": ["MASimple@tv-basicstudies"],
            "details": true,
            "hotlist": true,
            "calendar": true,
            "news": true,
            "style": "1",
        });
    } catch (error) {
        console.error(`Erro ao criar o widget TradingView para ${symbol}:`, error);
        chartContainerDiv.innerHTML = `<p class="error-commentary"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar o gráfico para <strong>${symbol}</strong>. Verifique o formato do símbolo ou sua conexão.</p>`;
    }

    contentModalOverlay.style.display = 'flex';
    requestAnimationFrame(() => {
        contentModalOverlay.classList.add('visible');
    });
    document.body.classList.add('body-modal-open');
}

function closeContentModal() {
    if (contentModalOverlay) {
        contentModalOverlay.classList.remove('visible');
        // Espera a transição terminar antes de ocultar completamente
        setTimeout(() => {
            if (!contentModalOverlay.classList.contains('visible')) {
                contentModalOverlay.style.display = 'none';
                // Remove o conteúdo do modal apenas após ele estar invisível
                if (modalContentArea) {
                    while (modalContentArea.firstChild) {
                        modalContentArea.removeChild(modalContentArea.firstChild);
                    }
                }
            }
        }, 300); // Deve corresponder à duração da transição CSS
    }

    document.body.classList.remove('body-modal-open');
    currentModalChartSymbol = null;
}

function printBoxContent(boxId) {
    const boxToPrint = document.getElementById(boxId);
    if (!boxToPrint) {
        console.error('Elemento do box para impressão não encontrado:', boxId);
        showNotification('Erro: Box não encontrado para impressão.', true);
        return;
    }

    const title = boxToPrint.querySelector('.box-header h2')?.textContent || 'Conteúdo';
    const contentHTML = boxToPrint.querySelector('.box-content')?.innerHTML || '';
    const isLightMode = document.body.classList.contains('light-mode');
    const themeClass = isLightMode ? 'light-mode' : '';

    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.visibility = 'hidden'; // Esconde o iframe
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;

    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Imprimir - ${title}</title>
            <link rel="stylesheet" href="css/styles.css">
            <style>
                /* Estilos específicos para impressão - sobrescrevem styles.css */
                @media print {
                    body {
                        padding: 25px !important; /* Aumenta padding na impressão */
                        margin: 0 !important;
                        background: #FFFFFF !important;
                        color: #000000 !important;
                        -webkit-print-color-adjust: exact;
                        color-adjust: exact;
                        font-family: 'Montserrat', sans-serif !important;
                        font-size: 11pt; /* Tamanho de fonte para impressão */
                    }
                    /* Força cores pretas e visíveis para links, texto, etc. */
                    a, p, li, span, div {
                         color: #000000 !important;
                         text-shadow: none !important;
                    }
                    a { text-decoration: underline !important; }

                    /* Garante que elementos com cores primárias sejam impressos em cor ou preto */
                    .commentary-highlight, strong, h1, h2, .box-header h2, .box-header i:first-child {
                        color: var(--primary-color) !important; /* Tenta manter a cor primária */
                        -webkit-print-color-adjust: exact;
                        color-adjust: exact;
                        text-shadow: none !important;
                    }
                    /* Garante que o texto dentro de strong ou commentary-highlight seja preto se primary-color não for suportado */
                    @supports not (color-adjust: exact) { /* Fallback para navegadores antigos */
                        .commentary-highlight, strong, h1, h2, .box-header h2, .box-header i:first-child {
                            color: #000000 !important;
                        }
                    }

                    h1 {
                        font-size: 24pt;
                        margin-bottom: 20px;
                        border-bottom: 1px solid #ccc;
                        padding-bottom: 10px;
                    }
                    .box-content {
                        overflow-y: visible !important;
                        max-height: none !important;
                        padding-right: 0 !important;
                    }
                    /* Esconde todos os elementos interativos e de UI */
                    .loading-commentary, .skeleton-loading, button, .watchlist-item-remove-btn,
                    #watchlist-input-container, .floating-btn, .header, .subheader,
                    .contact-button-main, .legal-links, .footer, #economic-calendar-overlay,
                    .page-notification, #spotify-player-container, #visibility-settings-panel,
                    .content-modal-overlay, .box-actions, .news-item .favorite-btn, .fab-container {
                        display: none !important;
                    }
                    ul { padding-left: 25px; margin-bottom: 1em; }
                    li { margin-bottom: 0.3em; }
                    p { margin-bottom: 0.8em; }
                    .news-item {
                        border: 1px solid #eee !important;
                        background: #f9f9f9 !important;
                        margin-bottom: 15px !important;
                        padding: 15px !important;
                        box-shadow: none !important;
                        page-break-inside: avoid; /* Evita quebras no meio da notícia */
                    }
                    .news-item-title { font-size: 11pt !important; color: #000000 !important; }
                    .news-item-description { font-size: 10pt !important; color: #333333 !important; }
                    .news-item-date { font-size: 9pt !important; color: #666666 !important; }
                }
            </style>
        </head>
        <body class="${themeClass}">
            <h1>${title}</h1>
            <div class="box-content">
                ${contentHTML}
            </div>
        </body>
        </html>
    `);
    doc.close();

    iframe.onload = function() {
        // Usa um pequeno atraso para garantir que o CSS seja renderizado
        setTimeout(function() {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch (printError) {
                console.error('Erro ao chamar a função de impressão:', printError);
                showNotification('Erro ao iniciar a impressão. Verifique as permissões do navegador.', true);
            } finally {
                // Remove o iframe após a tentativa de impressão
                setTimeout(() => { document.body.removeChild(iframe); }, 1000);
            }
        }, 500); // 500ms é um bom equilíbrio
    };
}


// =============================================
// FUNÇÕES DE VISIBILIDADE DOS BOXES
// =============================================
function setupBoxVisibility() {
    settingsToggleBtn = document.getElementById('settings-toggle-btn');
    visibilitySettingsPanel = document.getElementById('visibility-settings-panel');
    if (!settingsToggleBtn || !visibilitySettingsPanel) {
        console.warn('Elementos do painel de configurações de visibilidade não encontrados. Funcionalidade desativada.');
        return;
    }

    let savedPrefs = {};
    try {
        const savedPrefsJSON = localStorage.getItem(VISIBILITY_PREFS_KEY);
        if (savedPrefsJSON) {
            savedPrefs = JSON.parse(savedPrefsJSON);
        } else {
            savedPrefs = { ...DEFAULT_BOX_VISIBILITY }; // Se não há nada salvo, usa o padrão
        }
    } catch (e) {
        console.error("Erro ao carregar preferências de visibilidade, usando padrão.", e);
        savedPrefs = { ...DEFAULT_BOX_VISIBILITY };
    }

    // Garante que todas as caixas padrão estejam no objeto de preferências, com seu estado padrão se ausentes
    for (const key in DEFAULT_BOX_VISIBILITY) {
        if (savedPrefs[key] === undefined) {
            savedPrefs[key] = DEFAULT_BOX_VISIBILITY[key];
        }
    }

    // Inicializa checkboxes e aplica visibilidade
    document.querySelectorAll('.visibility-toggle-checkbox').forEach(checkbox => {
        const boxId = checkbox.dataset.boxid;
        if (boxId) {
            const boxElement = document.getElementById(boxId);
            const isVisible = savedPrefs[boxId];

            checkbox.checked = isVisible; // Define o estado do checkbox
            if (boxElement) {
                // Aplica a visibilidade inicial
                boxElement.style.display = isVisible ? 'flex' : 'none';
                // Adiciona uma classe para animação de fade-in se estiver visível
                if (isVisible) {
                    boxElement.classList.add('is-visible');
                }
            }

            checkbox.addEventListener('change', (event) => {
                const currentBoxId = event.target.dataset.boxid;
                const currentBoxElement = document.getElementById(currentBoxId);
                const nowVisible = event.target.checked;

                if (currentBoxElement) {
                    const wasHidden = currentBoxElement.style.display === 'none'; // Verifica o estado ANTES de mudar
                    currentBoxElement.style.display = nowVisible ? 'flex' : 'none';

                    if (nowVisible && wasHidden) {
                        // Re-renderiza widgets TradingView se o box for "Market" ou "Ticker Tape" e estava escondido
                        if (currentBoxId === 'box-market' && typeof renderMarketOverviewWidget === 'function') {
                            const currentTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
                            renderMarketOverviewWidget(currentTheme, 'market-overview-widget-wrapper');
                        }
                        // Pode adicionar a lógica para o Ticker Tape se ele for um box visível/escondível
                        // Ex: if (currentBoxId === 'tradingview-ticker-tape-container' && typeof renderTickerTapeWidget === 'function') { ... }
                    }
                    // Força um salvamento das atribuições de slot para garantir que o layout seja registrado
                    if (typeof saveSlotAssignments === 'function') {
                        saveSlotAssignments();
                    }
                }

                // Salva a nova preferência
                const currentPrefs = JSON.parse(localStorage.getItem(VISIBILITY_PREFS_KEY)) || { ...DEFAULT_BOX_VISIBILITY };
                currentPrefs[currentBoxId] = nowVisible;
                localStorage.setItem(VISIBILITY_PREFS_KEY, JSON.stringify(currentPrefs));

                // Fecha o painel de configurações em telas menores após a alteração
                if (window.innerWidth <= 768) {
                    visibilitySettingsPanel.classList.remove('visible');
                    visibilitySettingsPanel.style.display = 'none';
                }
            });
            visibilityCheckboxes.push(checkbox);
        }
    });

    // Toggle do painel de configurações
    settingsToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation(); // Evita que o clique se propague para o documento
        const isCurrentlyVisible = visibilitySettingsPanel.classList.toggle('visible');
        visibilitySettingsPanel.style.display = isCurrentlyVisible ? 'block' : 'none'; // Controla o display

        if (isCurrentlyVisible) {
            // Atualiza o estado dos checkboxes ao abrir o painel
             visibilityCheckboxes.forEach(cb => {
                const boxEl = document.getElementById(cb.dataset.boxid);
                // Verifica o estilo computado para determinar a visibilidade real
                if (boxEl) cb.checked = (window.getComputedStyle(boxEl).display !== 'none');
             });
        }
    });

    // Fecha o painel de configurações ao clicar fora
    document.addEventListener('click', (event) => {
        if (visibilitySettingsPanel && visibilitySettingsPanel.classList.contains('visible')) {
            // Se o clique não foi no painel e nem no botão de toggle
            if (!visibilitySettingsPanel.contains(event.target) && event.target !== settingsToggleBtn && !settingsToggleBtn.contains(event.target)) {
                visibilitySettingsPanel.classList.remove('visible');
                visibilitySettingsPanel.style.display = 'none';
            }
        }
    });
}

// =============================================
// FUNÇÕES DA WATCHLIST
// =============================================
function loadWatchlistSymbols() {
    try {
        const savedSymbols = localStorage.getItem(WATCHLIST_SYMBOLS_KEY);
        watchlistSymbols = savedSymbols ? JSON.parse(savedSymbols) : [];
    } catch (e) {
        console.error("Erro ao carregar watchlist, redefinindo.", e);
        watchlistSymbols = []; // Reseta em caso de erro
        saveWatchlistSymbols();
    }
}
function saveWatchlistSymbols() {
    localStorage.setItem(WATCHLIST_SYMBOLS_KEY, JSON.stringify(watchlistSymbols));
}
function renderWatchlistItems() {
    if (!watchlistItemsContainer) return;
    watchlistItemsContainer.innerHTML = '';
    if (watchlistSymbols.length === 0) {
        watchlistItemsContainer.innerHTML = '<p style="text-align:center; color:var(--text-secondary); font-size:13px; padding-top:10px;">Sua watchlist está vazia. Adicione ativos como PETR4, AAPL, etc.</p>';
        return;
    }
    watchlistSymbols.forEach(symbol => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'watchlist-item';
        itemDiv.setAttribute('role', 'button');
        itemDiv.setAttribute('tabindex', '0');
        itemDiv.setAttribute('aria-label', `Ver gráfico de ${symbol}`);

        const symbolSpan = document.createElement('span');
        symbolSpan.className = 'watchlist-item-symbol';
        symbolSpan.textContent = symbol.toUpperCase();
        itemDiv.appendChild(symbolSpan);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'watchlist-item-remove-btn';
        removeBtn.innerHTML = '<i class="fas fa-times-circle"></i>';
        removeBtn.setAttribute('aria-label', `Remover ${symbol} da watchlist`);
        removeBtn.addEventListener('click', (event) => {
            event.stopPropagation(); // Impede que o clique no item abra o gráfico
            removeSymbolFromWatchlist(symbol);
        });
        itemDiv.appendChild(removeBtn);

        itemDiv.addEventListener('click', () => openChartDetailModal(symbol));
        itemDiv.addEventListener('keypress', (event) => {
            if (event.key === 'Enter' || event.key === ' ') { // Adiciona 'space' como ativador
                openChartDetailModal(symbol);
            }
        });
        watchlistItemsContainer.appendChild(itemDiv);
    });
}
function addSymbolToWatchlist() {
    if (!watchlistSymbolInput) return;
    const symbol = watchlistSymbolInput.value.trim().toUpperCase();

    if (symbol === '') {
        showNotification('Por favor, insira um símbolo válido (ex: PETR4, AAPL).', true);
        return;
    }

    if (watchlistSymbols.includes(symbol)) {
        showNotification(`Símbolo "${symbol}" já está na sua watchlist.`, false);
        watchlistSymbolInput.value = '';
        return;
    }

    // Adiciona o símbolo e re-renderiza
    watchlistSymbols.push(symbol);
    saveWatchlistSymbols();
    renderWatchlistItems();
    showNotification(`"${symbol}" adicionado à watchlist!`);
    watchlistSymbolInput.value = '';
    watchlistSymbolInput.focus(); // Mantém o foco para adicionar mais rapidamente
}
function removeSymbolFromWatchlist(symbolToRemove) {
    watchlistSymbols = watchlistSymbols.filter(s => s !== symbolToRemove);
    saveWatchlistSymbols();
    renderWatchlistItems();
    showNotification(`"${symbolToRemove}" removido da watchlist.`);
}
function setupWatchlist() {
    watchlistSymbolInput = document.getElementById('watchlist-symbol-input');
    addWatchlistSymbolBtn = document.getElementById('add-watchlist-symbol-btn');
    watchlistItemsContainer = document.getElementById('watchlist-items-container');

    if (!watchlistSymbolInput || !addWatchlistSymbolBtn || !watchlistItemsContainer) {
        console.warn('Elementos da watchlist não encontrados. Funcionalidade desativada.');
        return;
    }

    loadWatchlistSymbols();
    renderWatchlistItems();

    addWatchlistSymbolBtn.addEventListener('click', addSymbolToWatchlist);
    watchlistSymbolInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            addSymbolToWatchlist();
        }
    });

    // Adiciona o botão de expandir/modal ao cabeçalho da Watchlist
    const watchlistBox = document.getElementById('box-watchlist');
    if (watchlistBox) {
        const boxHeader = watchlistBox.querySelector('.box-header');
        if (boxHeader) {
            let actionsContainer = boxHeader.querySelector('.box-actions');
            if (!actionsContainer) {
                actionsContainer = document.createElement('div');
                actionsContainer.className = 'box-actions';
                boxHeader.appendChild(actionsContainer);
            }
            // Verifica se a função existe antes de chamar
            if (typeof addOrUpdateModalButton === 'function') {
                addOrUpdateModalButton(watchlistBox, actionsContainer, 'expand-watchlist-box-btn');
            }
        }
    }
}

// =============================================
// FUNÇÃO PARA FORMATAR TEMPO RELATIVO
// =============================================
function formatTimeSince(timestamp) {
    if (!timestamp) return '';
    const now = new Date();
    const secondsPast = (now.getTime() - timestamp) / 1000;

    if (secondsPast < 60) return 'há menos de um minuto';
    if (secondsPast < 3600) {
        const minutes = Math.round(secondsPast / 60);
        return `há ${minutes} min${minutes > 1 ? 's' : ''}`;
    }
    if (secondsPast <= 86400) {
        const hours = Math.round(secondsPast / 3600);
        return `há ${hours} hora${hours > 1 ? 's' : ''}`;
    }
    const date = new Date(timestamp);
    // Para datas mais antigas, mostra data e hora completa
    return `em ${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`;
}

// =============================================
// FUNÇÃO PARA ATUALIZAR DATA E HORA
// =============================================
function updateDateTime() {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false // Formato 24 horas
    });
    const dataAtualElement = document.getElementById('data-atual');
    if (dataAtualElement) {
        const datetimeSpan = dataAtualElement.querySelector('.datetime');
        if (datetimeSpan) {
            datetimeSpan.textContent = formattedDate;
        }
    }
    const footerElement = document.getElementById('footer');
    if (footerElement) {
        footerElement.textContent = `Fonte: Dados atualizados em ${formattedDate} • © 2025 Mercado Macro`;
    }
}

// =============================================
// CÓDIGO DAS NOTÍCIAS (APIs e Fallback)
// =============================================
const RSS_SOURCES = [
    {
        name: 'RSS2JSON',
        buildUrl: feedUrl => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`,
        processor: data => {
            if (!data.items) throw new Error('Formato RSS2JSON inválido');
            return data.items.map(item => ({
                title: item.title,
                description: item.description,
                link: item.link,
                pubDate: item.pubDate
            }));
        }
    },
    {
        name: 'AllOrigins',
        buildUrl: feedUrl => `https://api.allorigins.win/raw?charset=UTF-8&url=${encodeURIComponent(feedUrl)}`,
        processor: dataText => {
            if (!dataText) throw new Error('Conteúdo AllOrigins vazio');
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(dataText, "text/xml");
            return parseXmlNews(xmlDoc);
        }
    }
];
const RSS_FEEDS = [
    'https://www.dukascopy.com/fxspider/pt/rss/news_sector/finance/',
    'https://www.valor.com.br/rss',
    'https://www.infomoney.com.br/feed/'
];
const FALLBACK_NEWS = [
    { title: "Mercado aguarda decisão do Fed", description: "Atenção voltada para a próxima reunião do Federal Reserve e seus impactos sobre as taxas de juros e a economia global.", link: "#", pubDate: new Date(Date.now() - 3600000).toISOString() },
    { title: "Ibovespa em alta com commodities", description: "O principal índice da bolsa brasileira reage positivamente ao avanço dos preços das commodities no mercado internacional, impulsionando ações de grandes empresas.", link: "#", pubDate: new Date(Date.now() - 7200000).toISOString() },
    { title: "Dólar opera em queda", description: "A moeda americana perde força frente às principais divisas globais, influenciada por dados econômicos e expectativas de política monetária.", link: "#", pubDate: new Date(Date.now() - 10800000).toISOString() },
    { title: "Setor de tecnologia impulsiona bolsas americanas", description: "Gigantes de tecnologia continuam a apresentar resultados sólidos, elevando os índices NASDAQ e S&P 500 para novos recordes.", link: "#", pubDate: new Date(Date.now() - 14400000).toISOString() }
];

// =============================================
// FUNÇÕES DE DADOS E CONTEÚDO
// =============================================
async function loadBannerPhrases() {
    try {
        const response = await fetch('data/banner-phrases.json');
        if (!response.ok) {
            throw new Error(`Falha ao carregar frases: ${response.status}`);
        }
        BANNER_PHRASES = (await response.json()).phrases;
        if (!BANNER_PHRASES || BANNER_PHRASES.length === 0) {
            BANNER_PHRASES = ["Acompanhe as últimas movimentações do mercado financeiro em tempo real."];
        }
    } catch (error) {
        console.error('Erro ao carregar frases do banner:', error);
        BANNER_PHRASES = ["Bem-vindo ao Mercado Macro: Sua fonte de informações financeiras."];
    }
    updateBanner();
}

function updateBanner() {
    const banner = document.getElementById('random-banner');
    const bannerTextEl = banner ? banner.querySelector('.banner-text') : null;
    if (bannerTextEl && BANNER_PHRASES && BANNER_PHRASES.length > 0) {
        const randomPhrase = BANNER_PHRASES[Math.floor(Math.random() * BANNER_PHRASES.length)];
        bannerTextEl.textContent = randomPhrase;
        bannerTextEl.style.animation = 'none'; // Reseta a animação para aplicar novamente
        void bannerTextEl.offsetWidth; // Trigger reflow
        if (window.innerWidth <= 768) {
            bannerTextEl.style.animation = 'scrollBanner 18s linear infinite'; // Tempo ajustado para telas menores
        } else {
            bannerTextEl.style.animation = ''; // Remove animação em telas maiores
        }
    } else if (bannerTextEl) {
        bannerTextEl.textContent = "Notícias e Análises Financeiras Diárias";
    }
}

async function fetchGoogleDocContent() {
    const url = `https://www.googleapis.com/drive/v3/files/${GOOGLE_DOC_ID}/export?mimeType=text/plain&key=${GOOGLE_API_KEY}`;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos de timeout

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId); // Limpa o timeout se a requisição for bem-sucedida

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Google Docs API Error ${response.status}: ${response.statusText}`, errorBody);
            throw new Error(`Erro ${response.status} ao buscar o Radar Financeiro. Código: ${response.status}`);
        }
        return await response.text();
    } catch (error) {
        console.error('Falha na requisição ao Google Docs:', error);
        if (error.name === 'AbortError') {
            throw new Error('Tempo limite excedido ao carregar o Radar Financeiro. Tente novamente.');
        }
        throw new Error('Não foi possível carregar o Radar Financeiro. Verifique sua conexão.');
    }
}

function updateCommentary(content) {
    const commentaryContentEl = document.getElementById('commentary-content');
    if (!commentaryContentEl) return;

    let formattedContent = content
        .replace(/\r\n/g, '\n') // Normaliza quebras de linha
        .split('\n')
        .map(line => {
            line = line.trim();
            if (line.length === 0) return null; // Ignora linhas vazias

            // Formata destaques/títulos com ícones ou negrito
            if (/^([📌☐✔☑️✅]\s*.+)/.test(line)) {
                return `<div class="commentary-highlight">${line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</div>`;
            }
            // Formata texto em negrito
            line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

            // Formata listas (bullets)
            if (/^[•*-]\s*(.+)/.test(line)) {
                return `<li>${line.substring(line.search(/\S/)).replace(/^[•*-]\s*/, '')}</li>`;
            }
            // Padrão para parágrafos
            return `<p class="commentary-paragraph">${line}</p>`;
        })
        .filter(line => line !== null)
        .join('');

    // Agrupa <li> em <ul>
    formattedContent = formattedContent.replace(/(<li>.*?<\/li>)+/sg, '<ul>$&</ul>');

    commentaryContentEl.innerHTML = formattedContent || '<p class="error-commentary"><i class="fas fa-exclamation-triangle"></i> Nenhuma análise disponível no momento.</p>';
}

async function updateCommentaryContent() {
    const commentaryContentEl = document.getElementById('commentary-content');
    if (!commentaryContentEl) return;

    commentaryContentEl.innerHTML = `<div class="loading-commentary"><span class="loading-small"></span> Carregando análise do mercado...</div>`;
    try {
        const content = await fetchGoogleDocContent();
        updateCommentary(content);
        commentaryLastUpdateTimestamp = Date.now();
        return true;
    } catch (error) {
        console.error('Falha ao atualizar Radar Financeiro:', error);
        commentaryContentEl.innerHTML = `<div class="error-commentary"><i class="fas fa-exclamation-triangle"></i> ${error.message || 'Falha ao carregar o Radar Financeiro. Tente recarregar.'}</div>`;
        return false;
    }
}

async function fetchWeeklySummaryText() {
    const url = 'data/resumo-semanal.txt';
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 segundos de timeout

        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`Erro ${response.status} ao buscar o resumo semanal.`);
        }
        return await response.text();
    } catch (error) {
        console.error('Falha na requisição do resumo semanal:', error);
        if (error.name === 'AbortError') {
            throw new Error('Tempo limite excedido ao carregar o resumo semanal. Tente novamente.');
        }
        throw new Error('Não foi possível carregar o resumo da semana. Verifique sua conexão.');
    }
}

function updateWeeklySummary(content) {
    const summaryContentEl = document.getElementById('weekly-summary-content');
    if (!summaryContentEl) return;

    let formattedContent = content
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => {
            line = line.trim();
            if (line.length === 0) return null;

            line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            if (/^[•*-]\s*(.+)/.test(line)) {
                return `<li>${line.substring(line.search(/\S/)).replace(/^[•*-]\s*/, '')}</li>`;
            }
            return `<p class="commentary-paragraph">${line}</p>`;
        })
        .filter(line => line !== null)
        .join('');
    formattedContent = formattedContent.replace(/(<li>.*?<\/li>)+/sg, '<ul>$&</ul>');

    summaryContentEl.innerHTML = formattedContent || '<p class="error-commentary"><i class="fas fa-exclamation-triangle"></i> Nenhum resumo semanal disponível.</p>';
}

async function updateWeeklySummaryContent() {
    const summaryContentEl = document.getElementById('weekly-summary-content');
    if (!summaryContentEl) return;

    summaryContentEl.innerHTML = `<div class="loading-commentary"><span class="loading-small"></span> Carregando resumo da semana...</div>`;
    try {
        const content = await fetchWeeklySummaryText();
        updateWeeklySummary(content);
        return true;
    } catch (error) {
        console.error('Falha ao atualizar resumo semanal:', error);
        summaryContentEl.innerHTML = `<div class="error-commentary"><i class="fas fa-exclamation-triangle"></i> ${error.message || 'Falha ao carregar o resumo semanal. Tente recarregar.'}</div>`;
        return false;
    }
}

// Helper para adicionar/atualizar botões de modal/ações nos boxes
function addOrUpdateModalButton(boxElement, actionsContainer, buttonId, modalIconClass = 'fa-expand-arrows-alt') {
    if (!boxElement || !actionsContainer) {
        console.warn(`Elemento do Box ou actions container não encontrado para ID do botão: ${buttonId}`);
        return;
    }

    let modalBtn = actionsContainer.querySelector(`#${buttonId}`);
    let isNewButton = false;

    if (!modalBtn) {
        modalBtn = document.createElement('button');
        modalBtn.id = buttonId;
        modalBtn.className = 'expand-btn';
        isNewButton = true;
    }

    modalBtn.setAttribute('aria-label', 'Abrir em tela cheia');
    const currentIconEl = modalBtn.querySelector('i');
    if (currentIconEl) {
        currentIconEl.className = `fas ${modalIconClass}`;
    } else {
        modalBtn.innerHTML = `<i class="fas ${modalIconClass}"></i>`;
    }

    // Clonar e substituir para remover listeners antigos e adicionar novos (melhor para re-render)
    const newBtnInstance = modalBtn.cloneNode(true);
    if (!isNewButton && modalBtn.parentNode) {
        modalBtn.parentNode.replaceChild(newBtnInstance, modalBtn);
    }
    modalBtn = newBtnInstance; // Atualiza a referência para o novo botão

    modalBtn.addEventListener('click', function(event) {
        event.stopPropagation();
        openContentModal(boxElement.id);
    });

    if (isNewButton) {
        // Tenta inserir antes do botão de refresh se ele existir, senão adiciona no final
        if (actionsContainer.firstChild && actionsContainer.firstChild.id === 'refresh-news-btn') {
            actionsContainer.insertBefore(modalBtn, actionsContainer.firstChild);
        } else {
            actionsContainer.appendChild(modalBtn);
        }
    }
}


function setupCommentaryActions() {
    const commentaryBox = document.getElementById('box-commentary');
    if (!commentaryBox) return;

    const boxHeader = commentaryBox.querySelector('.box-header');
    if (!boxHeader) return;

    let actionsContainer = boxHeader.querySelector('.box-actions');
    if (!actionsContainer) {
        actionsContainer = document.createElement('div');
        actionsContainer.className = 'box-actions';
        boxHeader.appendChild(actionsContainer);
    }

    // Botão de expandir para modal
    addOrUpdateModalButton(commentaryBox, actionsContainer, 'expand-commentary-btn', 'fa-expand-arrows-alt');

    // Botão de Compartilhar
    let shareBtn = actionsContainer.querySelector('#share-commentary-btn');
    if (!shareBtn) {
        shareBtn = document.createElement('button');
        shareBtn.id = 'share-commentary-btn';
        shareBtn.className = 'expand-btn';
        shareBtn.setAttribute('aria-label', 'Compartilhar Radar Financeiro');
        shareBtn.innerHTML = '<i class="fas fa-share-alt"></i>';
        actionsContainer.appendChild(shareBtn);

        shareBtn.addEventListener('click', async function() {
            const commentaryContentEl = document.getElementById('commentary-content');
            if (!commentaryContentEl) {
                showNotification('Conteúdo do Radar Financeiro não encontrado.', true);
                return;
            }

            let textToShare = "Mercado Macro - Radar Financeiro:\n\n";
            commentaryContentEl.querySelectorAll('p, .commentary-highlight, li').forEach(el => {
                let line = el.textContent.trim();
                if (el.tagName === 'LI') {
                    textToShare += `• ${line}\n`;
                } else if (el.classList.contains('commentary-highlight')) {
                    textToShare += `**${line}**\n`; // Adiciona negrito para destaques no texto
                } else {
                    textToShare += `${line}\n\n`;
                }
            });
            textToShare = textToShare.replace(/\n\s*\n/g, '\n\n').trim(); // Limpa quebras de linha extras

            if (!textToShare) {
                showNotification('Não há conteúdo no Radar Financeiro para compartilhar.', true);
                return;
            }

            const shareData = {
                title: 'Mercado Macro - Radar Financeiro',
                text: textToShare,
                url: window.location.href // Opcional: compartilha a URL da página
            };

            try {
                if (navigator.share && navigator.canShare(shareData)) {
                    await navigator.share(shareData);
                    showNotification('Radar Financeiro compartilhado com sucesso!');
                } else if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(textToShare);
                    showNotification('Texto do Radar Financeiro copiado para a área de transferência!');
                } else {
                    throw new Error('A funcionalidade de compartilhamento não é suportada neste navegador.');
                }
            } catch (err) {
                console.error('Erro ao compartilhar o Radar Financeiro:', err);
                if (err.name !== 'AbortError') { // Ignora erros de cancelamento do usuário
                    showNotification(err.message.includes('não é suportada') ? err.message : 'Falha ao compartilhar o Radar Financeiro.', true);
                }
            }
        });
    }

    // Botão de expandir altura
    let expandHeightBtn = actionsContainer.querySelector('#toggle-height-commentary-btn');
    if (!expandHeightBtn) {
        expandHeightBtn = document.createElement('button');
        expandHeightBtn.id = 'toggle-height-commentary-btn';
        expandHeightBtn.className = 'expand-btn';
        expandHeightBtn.setAttribute('aria-label', 'Expandir altura do Radar Financeiro');
        expandHeightBtn.innerHTML = '<i class="fas fa-arrows-alt-v"></i>';
        actionsContainer.appendChild(expandHeightBtn);

        expandHeightBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            commentaryBox.classList.toggle('box-expanded-height');

            const icon = expandHeightBtn.querySelector('i');
            if (commentaryBox.classList.contains('box-expanded-height')) {
                icon.className = 'fas fa-compress-alt';
                expandHeightBtn.setAttribute('aria-label', 'Restaurar altura do Radar Financeiro');
            } else {
                icon.className = 'fas fa-arrows-alt-v';
                expandHeightBtn.setAttribute('aria-label', 'Expandir altura do Radar Financeiro');
            }
        });
    }
}

async function fetchNews() {
    let lastError = null;
    for (const feedUrl of RSS_FEEDS) {
        for (const source of RSS_SOURCES) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 segundos de timeout

                const response = await fetch(source.buildUrl(feedUrl), {
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} na fonte ${source.name} para ${feedUrl}`);
                }

                let dataToProcess = source.name === 'AllOrigins' ? await response.text() : await response.json();
                const newsItems = source.processor(dataToProcess);

                if (newsItems && newsItems.length > 0) {
                    return newsItems; // Retorna na primeira fonte e feed bem-sucedidos
                }
            } catch (error) {
                lastError = error;
                console.warn(`Falha ao buscar notícias com ${source.name} para ${feedUrl}:`, error);
                if (error.name === 'AbortError') {
                    showNotification(`Timeout ao carregar notícias de ${source.name}.`, true);
                } else {
                    showNotification(`Erro de conexão com ${source.name}.`, true);
                }
            }
        }
    }
    console.error("Todas as fontes de notícias falharam. Último erro detalhado:", lastError);
    throw lastError || new Error('Não foi possível carregar as notícias de nenhuma fonte.');
}

async function loadNewsWidget(forceUpdate = false) {
    const newsContentBox = document.querySelector('#news-widget .news-content');
    if (!newsContentBox) return;

    updateLoadingState(true); // Ativa o estado de carregamento
    const lastTryTimestamp = parseInt(localStorage.getItem('lastTry') || '0');

    if (!forceUpdate) {
        const cachedData = getCachedNews();
        if (cachedData) {
            renderNewsList(cachedData, true);
            updateLoadingState(false);
            return;
        }
    }

    if (!navigator.onLine) {
        showNotification('Sem conexão com a internet. Mostrando dados do cache, se disponíveis.', true);
        const cachedData = getCachedNews();
        if (cachedData) {
            renderNewsList(cachedData, true);
        } else {
            newsContentBox.innerHTML = '<div class="error"><i class="fas fa-wifi"></i> Sem conexão com a internet e sem notícias no cache.</div>';
        }
        updateLoadingState(false);
        return;
    }

    try {
        const newsItems = await fetchNews();
        if (newsItems.length > 0) {
            cacheNews(newsItems);
            renderNewsList(newsItems);
            if (forceUpdate) showNotification('Notícias atualizadas com sucesso!');
        } else {
            renderNewsList([], false, false); // Nenhuma notícia, mas sem erro
            if (forceUpdate) showNotification('Nenhuma notícia nova disponível no momento.', false);
        }
        localStorage.setItem('retryCount', '0'); // Reseta o contador de retentativas
    } catch (fetchError) {
        console.error('Falha ao buscar notícias:', fetchError);
        if (forceUpdate) showNotification(`Falha na atualização de notícias: ${fetchError.message}.`, true);

        const cachedData = getCachedNews();
        if (cachedData) {
            renderNewsList(cachedData, true);
            if (forceUpdate) showNotification('Mostrando notícias do cache devido a um erro.', false);
        } else {
            renderNewsList(FALLBACK_NEWS, false, true); // Usa notícias de fallback
            if (forceUpdate) showNotification('Mostrando notícias de exemplo. Tente novamente mais tarde.', true);
        }
        scheduleRetry(); // Agenda uma nova tentativa
    } finally {
        updateLoadingState(false);
        localStorage.setItem('lastTry', Date.now().toString());
    }
}

function updateLoadingState(isLoading) {
    const refreshNewsBtn = document.getElementById('refresh-news-btn');
    const icon = refreshNewsBtn ? refreshNewsBtn.querySelector('i') : null;
    if (refreshNewsBtn && icon) {
        refreshNewsBtn.disabled = isLoading;
        icon.classList.toggle('fa-spin', isLoading);
    }
    const skeleton = document.querySelector('#news-widget .skeleton-loading');
    if (skeleton) {
        skeleton.style.display = isLoading ? 'flex' : 'none';
    }
}

function parseXmlNews(xmlDoc) {
    const errorNode = xmlDoc.querySelector('parsererror');
    if (errorNode) {
        console.error("Erro XML:", errorNode.textContent);
        throw new Error('Erro ao analisar o feed XML.');
    }
    const items = Array.from(xmlDoc.querySelectorAll("item"));
    if (items.length === 0) {
        console.warn(`Nenhuma tag <item> encontrada no XML. Isso pode indicar um feed vazio ou malformado.`);
        return [];
    }
    return items.map(item => {
        let description = item.querySelector("description")?.textContent?.trim() || '';
        // Remove CDATA se presente e tags HTML simples (como <br>)
        description = description.replace("<![CDATA[", "").replace("]]>", "").replace(/<br\s*\/?>/gi, " ");
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = description;
        description = tempDiv.textContent || tempDiv.innerText || ""; // Remove tags HTML remanescentes
        return {
            title: item.querySelector("title")?.textContent?.trim() || 'Sem título',
            description: description.replace(/\s+/g, ' ').trim(), // Normaliza múltiplos espaços
            link: item.querySelector("link")?.textContent?.trim() || '#',
            pubDate: item.querySelector("pubDate")?.textContent?.trim() || new Date().toISOString()
        };
    });
}

function renderNewsList(items, fromCache = false, isFallback = false) {
    const newsContentBox = document.querySelector('#news-widget .news-content');
    if (!newsContentBox) return;

    const favorites = getFavorites();
    let statusHtml = '';

    if (isFallback && !fromCache) {
        statusHtml = `<div class="news-status error"><i class="fas fa-exclamation-triangle"></i> Exibindo notícias de exemplo.</div>`;
    } else if (fromCache) {
        const cacheTimestamp = getCacheTimestamp();
        statusHtml = `<div class="news-status"><i class="fas fa-info-circle"></i> Exibindo notícias do cache. Última atualização: ${formatTimeSince(cacheTimestamp)}.</div>`;
    }

    let newsItemsHtml = '';
    if (items.length === 0 && !isFallback) {
        newsItemsHtml = '<p style="padding:15px; text-align:center; color:var(--text-secondary);">Nenhuma notícia disponível no momento.</p>';
    } else {
        newsItemsHtml = items.map(item => {
            const isFavorited = favorites.some(fav => fav.link === item.link);
            let cleanDescription = item.description || '';
            return `
                <div class="news-item">
                    <button class="favorite-btn ${isFavorited ? 'favorited' : ''}"
                            aria-label="${isFavorited ? 'Desfavoritar notícia' : 'Favoritar notícia'}"
                            onclick="toggleFavorite(event, ${JSON.stringify(item).replace(/'/g, '&apos;').replace(/"/g, '&quot;')})">
                        <i class="fas fa-heart"></i>
                    </button>
                    <a href="${item.link}" class="news-link" target="_blank" rel="noopener noreferrer">
                        <div class="news-item-title">${item.title}</div>
                        ${cleanDescription ? `<div class="news-item-description">${cleanDescription}</div>` : ''}
                        <div class="news-item-date">${formatDate(item.pubDate)}</div>
                    </a>
                </div>
            `;
        }).join('');
    }

    const retryButtonHtml = (!isFallback && navigator.onLine) ?
        `<button onclick="loadNewsWidget(true)" class="retry-btn" style="margin-top:20px; display:block; margin-left:auto; margin-right:auto;"><i class="fas fa-sync-alt"></i> Tentar atualizar agora</button>` : '';

    newsContentBox.innerHTML = `${statusHtml}${newsItemsHtml}${retryButtonHtml}`;
}


function renderErrorState(error) {
    const newsContentBox = document.querySelector('#news-widget .news-content');
    if (newsContentBox) {
        newsContentBox.innerHTML = `
            <div class="error">
                <p><i class="fas fa-exclamation-triangle"></i> ${error.message || 'Ocorreu um erro ao carregar as notícias.'}</p>
                <p>Verifique sua conexão com a internet ou tente novamente mais tarde.</p>
                <button onclick="loadNewsWidget(true)" class="retry-btn"><i class="fas fa-sync-alt"></i> Tentar novamente</button>
            </div>
        `;
    }
}

function scheduleRetry() {
    const retryCount = parseInt(localStorage.getItem('retryCount') || '0');
    // Aumenta o atraso exponencialmente, até um máximo de 10 minutos
    const delay = Math.min(60000 * Math.pow(2, retryCount), 10 * 60 * 1000);
    localStorage.setItem('retryCount', (retryCount + 1).toString());
    console.log(`Próxima tentativa de buscar notícias em ${delay/1000} segundos.`);
    setTimeout(() => loadNewsWidget(true), delay);
}

function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return ''; // Verifica se a data é válida
        const options = {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Sao_Paulo' // Define o fuso horário para consistência
        };
        return date.toLocaleDateString('pt-BR', options);
    } catch (e) {
        console.error("Erro ao formatar data:", dateString, e);
        return '';
    }
}

function getCachedNews() {
    try {
        const cached = localStorage.getItem(CACHE_KEY_NEWS);
        if (!cached) return null;
        const { data, timestamp } = JSON.parse(cached);
        // Verifica se o cache ainda é válido
        if (Date.now() - timestamp < CACHE_TTL_NEWS) {
            return data;
        }
        // Cache expirado, remove e retorna null
        localStorage.removeItem(CACHE_KEY_NEWS);
        return null;
    } catch (e) {
        console.error('Erro ao acessar o cache de notícias, limpando:', e);
        localStorage.removeItem(CACHE_KEY_NEWS); // Limpa cache corrompido
        return null;
    }
}

function getCacheTimestamp() {
    try {
        const cached = localStorage.getItem(CACHE_KEY_NEWS);
        return cached ? JSON.parse(cached).timestamp : null;
    } catch {
        return null; // Retorna null se houver erro ou cache vazio
    }
}

function cacheNews(data) {
    if (!data || data.length === 0) return;
    try {
        localStorage.setItem(CACHE_KEY_NEWS, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) {
        console.error('Erro ao salvar notícias no cache:', e);
    }
}

function getFavorites() {
    try {
        return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
    } catch {
        localStorage.removeItem(FAVORITES_KEY); // Limpa favoritos corrompidos
        return [];
    }
}

function saveFavorites(favorites) {
    try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch (e) {
        console.error('Erro ao salvar favoritos:', e);
    }
}

function toggleFavorite(event, newsItem) {
    event.stopPropagation();
    event.preventDefault(); // Impede o link de ser clicado

    let favorites = getFavorites();
    const index = favorites.findIndex(item => item.link === newsItem.link);
    const heartButton = event.currentTarget;

    if (index === -1) {
        favorites.push(newsItem);
        showNotification('Notícia favoritada com sucesso!', false, 'success');
        heartButton.classList.add('favorited');
        heartButton.setAttribute('aria-label', 'Desfavoritar notícia');
    } else {
        favorites.splice(index, 1);
        showNotification('Notícia desfavoritada.', false, 'info'); // Novo tipo 'info'
        heartButton.classList.remove('favorited');
        heartButton.setAttribute('aria-label', 'Favoritar notícia');
    }
    saveFavorites(favorites);
}

function showNotification(message, isError = false, type = 'success') {
    const existingNotification = document.querySelector('.page-notification');
    if (existingNotification) existingNotification.remove(); // Remove qualquer notificação existente

    const notification = document.createElement('div');
    // Adiciona classes baseadas no tipo de notificação
    const notificationTypeClass = isError ? 'error' : type; // 'success', 'info', 'error'
    notification.className = `page-notification ${notificationTypeClass}`;

    // Adiciona um ícone dependendo do tipo
    let iconClass = '';
    if (type === 'success') {
        iconClass = 'fas fa-check-circle';
    } else if (type === 'error' || isError) {
        iconClass = 'fas fa-exclamation-triangle';
    } else if (type === 'info') {
        iconClass = 'fas fa-info-circle';
    }
    notification.innerHTML = `<i class="${iconClass}"></i> ${message}`;

    document.body.appendChild(notification);

    // Força reflow para garantir que a transição ocorra
    void notification.offsetWidth;
    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
        // Remove a notificação do DOM após a transição de fade-out
        setTimeout(() => notification.remove(), 400); // Deve corresponder à duração da transição
    }, 4000); // Notificação visível por 4 segundos
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        const el = document.documentElement;
        if (el.requestFullscreen) {
            el.requestFullscreen().catch(handleFullscreenError);
        } else if (el.webkitRequestFullscreen) { /* Safari */
            el.webkitRequestFullscreen().catch(handleFullscreenError);
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(handleFullscreenError);
        }
    }
}

function handleFullscreenError(err) {
    console.error(`Erro ao alternar tela cheia: ${err.message}`, err);
    showNotification('Erro ao alternar modo tela cheia. Seu navegador pode ter restrições.', true);
}

function handleFullscreenChange() {
    const fsBtn = document.getElementById('fullscreen-btn');
    const fsExitBtn = document.getElementById('fullscreen-exit-btn');
    const isFullscreen = !!document.fullscreenElement;

    if (fsBtn) fsBtn.style.display = isFullscreen ? 'none' : 'flex';
    if (fsExitBtn) fsExitBtn.style.display = isFullscreen ? 'flex' : 'none';
}

function saveSlotAssignments() {
    const assignmentsToSave = {};
    const draggableContainer = document.getElementById('draggable-container');
    if (!draggableContainer) return;

    // Lista de IDs dos boxes que são arrastáveis e podem ter slots
    const knownBoxIds = ['box-commentary', 'box-market', 'news-widget', 'box-watchlist', 'box-weekly-summary'];

    knownBoxIds.forEach(boxId => {
        const box = document.getElementById(boxId);
        // Verifica se o box existe e se tem um grid-area atribuído que é um slot válido
        if (box && box.style.gridArea && ['slotA', 'slotB', 'slotC', 'slotD', 'slotE'].includes(box.style.gridArea)) {
            assignmentsToSave[box.style.gridArea] = boxId;
        }
    });

    // Salva apenas se todas as slots padrão tiverem uma atribuição.
    // Isso evita salvar um estado incompleto se algo deu errado no D&D.
    if (Object.keys(assignmentsToSave).length === Object.keys(DEFAULT_SLOT_ASSIGNMENTS).length) {
        try {
            localStorage.setItem(BOX_SLOT_ASSIGNMENT_KEY, JSON.stringify(assignmentsToSave));
        } catch (e) {
            console.error("Erro ao salvar atribuições de slot no localStorage:", e);
            showNotification('Erro ao salvar o layout do painel.', true);
        }
    } else {
        console.warn('Tentativa de salvar atribuições de slot incompletas, o layout anterior será mantido ou o padrão será usado.', assignmentsToSave);
        // Opcional: showNotification('Não foi possível salvar o layout completamente. Tente novamente.', true);
    }
}

function applySlotAssignments(assignments) {
    if (!assignments) {
        assignments = { ...DEFAULT_SLOT_ASSIGNMENTS };
    }

    const draggableContainer = document.getElementById('draggable-container');
    if (!draggableContainer) {
        console.error('Elemento draggable-container não encontrado. O layout não pode ser aplicado.');
        return;
    }

    // Primeiro, remove todos os grid-area existentes para evitar conflitos
    document.querySelectorAll('.draggable-box').forEach(box => {
        box.style.gridArea = '';
        // Garante que todos os boxes visíveis estão no container principal
        draggableContainer.appendChild(box);
    });

    // Aplica as novas atribuições
    for (const slotName in assignments) {
        const boxId = assignments[slotName];
        const boxElement = document.getElementById(boxId);
        if (boxElement) {
            boxElement.style.gridArea = slotName;
            // Re-apenda o elemento para garantir a ordem visual no grid (importante para alguns layouts)
            draggableContainer.appendChild(boxElement);
        } else {
            console.warn(`Box com ID "${boxId}" atribuído ao slot "${slotName}" não encontrado no DOM. Usando padrão para este slot.`);
            // Se um box não for encontrado, tentar usar o padrão para esse slot
            const defaultBoxId = DEFAULT_SLOT_ASSIGNMENTS[slotName];
            const defaultBoxElement = document.getElementById(defaultBoxId);
            if (defaultBoxElement) {
                defaultBoxElement.style.gridArea = slotName;
                draggableContainer.appendChild(defaultBoxElement);
            }
        }
    }
}

function loadSlotAssignments() {
    let assignments = null;
    try {
        const savedAssignmentsJSON = localStorage.getItem(BOX_SLOT_ASSIGNMENT_KEY);
        if (savedAssignmentsJSON) {
            assignments = JSON.parse(savedAssignmentsJSON);
            // Validação simples para garantir que o objeto salvo não está corrompido
            const defaultKeys = Object.keys(DEFAULT_SLOT_ASSIGNMENTS);
            const assignmentKeys = Object.keys(assignments);
            const defaultValues = Object.values(DEFAULT_SLOT_ASSIGNMENTS);
            const assignmentValues = Object.values(assignments);

            // Verifica se tem o mesmo número de chaves e se todas as chaves/valores esperados estão presentes
            const isValid = defaultKeys.length === assignmentKeys.length &&
                           defaultKeys.every(key => assignmentKeys.includes(key)) &&
                           defaultValues.every(val => assignmentValues.includes(val)) &&
                           assignmentValues.every(val => defaultValues.includes(val));

            if (!isValid) {
                console.warn('Atribuições de slot salvas inválidas ou incompletas, redefinindo para padrão.');
                assignments = { ...DEFAULT_SLOT_ASSIGNMENTS };
                localStorage.setItem(BOX_SLOT_ASSIGNMENT_KEY, JSON.stringify(assignments));
            }
        } else {
            // Se não há nada salvo, usa o padrão e salva
            assignments = { ...DEFAULT_SLOT_ASSIGNMENTS };
            localStorage.setItem(BOX_SLOT_ASSIGNMENT_KEY, JSON.stringify(assignments));
        }
    } catch (e) {
        console.error("Erro ao carregar atribuições de slot, redefinindo para padrão.", e);
        assignments = { ...DEFAULT_SLOT_ASSIGNMENTS };
        localStorage.setItem(BOX_SLOT_ASSIGNMENT_KEY, JSON.stringify(assignments)); // Salva o padrão após erro
    }
    applySlotAssignments(assignments);
}

function setupDragAndDrop() {
    loadSlotAssignments(); // Carrega e aplica as posições salvas
    const boxes = document.querySelectorAll('.draggable-box');

    boxes.forEach(box => {
        // Apenas torna arrastáveis os boxes que estão na lista DEFAULT_BOX_VISIBILITY
        // para evitar que boxes não intencionais sejam arrastados
        if (DEFAULT_BOX_VISIBILITY.hasOwnProperty(box.id)) {
            box.setAttribute('draggable', 'true');
            box.style.cursor = 'grab'; // Indica que é arrastável

            box.addEventListener('dragstart', handleDragStart);
            box.addEventListener('dragend', handleDragEnd);
            box.addEventListener('dragenter', handleDragEnter);
            box.addEventListener('dragover', handleDragOver);
            box.addEventListener('dragleave', handleDragLeave);
            box.addEventListener('drop', handleDrop);
        }
    });
}

function handleDragStart(e) {
    // Garante que apenas o elemento com a classe 'draggable-box' é arrastável
    const draggableBox = e.target.closest('.draggable-box');
    if (!draggableBox || !DEFAULT_BOX_VISIBILITY.hasOwnProperty(draggableBox.id)) {
        e.preventDefault(); // Impede o arrasto se não for um box válido
        return;
    }

    draggingElementId = draggableBox.id;
    if (e.dataTransfer) {
        e.dataTransfer.setData('text/plain', draggingElementId);
        e.dataTransfer.effectAllowed = 'move';
    }

    // Adiciona classe de dragging após um pequeno timeout para evitar "flicker"
    setTimeout(() => {
        const el = document.getElementById(draggingElementId);
        if(el) el.classList.add('dragging');
    }, 0);
    draggableBox.style.cursor = 'grabbing';
}

function handleDragEnter(e) {
    e.preventDefault(); // Necessário para permitir um drop
    const targetBox = e.currentTarget;

    // Adiciona classe de feedback visual ao alvo de drop válido
    if (targetBox.classList.contains('draggable-box') && targetBox.id !== draggingElementId && DEFAULT_BOX_VISIBILITY.hasOwnProperty(targetBox.id)) {
        targetBox.classList.add('drag-over-target');
    }
}

function handleDragOver(e) {
    e.preventDefault(); // Necessário para permitir um drop
}

function handleDragLeave(e) {
    const targetBox = e.currentTarget;
    if (targetBox.classList.contains('draggable-box')) {
        targetBox.classList.remove('drag-over-target');
    }
}

function handleDrop(e) {
    e.preventDefault();
    const dropTargetBox = e.currentTarget;

    // Remove a classe de feedback do alvo
    if (dropTargetBox.classList.contains('drag-over-target')) {
        dropTargetBox.classList.remove('drag-over-target');
    }

    if (draggingElementId && dropTargetBox && dropTargetBox.id !== draggingElementId &&
        dropTargetBox.classList.contains('draggable-box') &&
        DEFAULT_BOX_VISIBILITY.hasOwnProperty(dropTargetBox.id) &&
        DEFAULT_BOX_VISIBILITY.hasOwnProperty(draggingElementId) ) {

        const draggingBox = document.getElementById(draggingElementId);

        if (draggingBox) {
            const areaOfDraggingBox = draggingBox.style.gridArea;
            const areaOfDropTargetBox = dropTargetBox.style.gridArea;

            // Troca as áreas de grid
            if (areaOfDraggingBox && areaOfDropTargetBox && areaOfDraggingBox !== areaOfDropTargetBox) {
                draggingBox.style.gridArea = areaOfDropTargetBox;
                dropTargetBox.style.gridArea = areaOfDraggingBox;
                saveSlotAssignments(); // Salva as novas posições
                showNotification('Layout do painel atualizado com sucesso!');
            }
        }
    }
}

function handleDragEnd(e) {
    const elDragged = document.getElementById(draggingElementId);
    if(elDragged && elDragged.classList.contains('draggable-box')){
        elDragged.classList.remove('dragging');
        elDragged.style.cursor = 'grab'; // Volta o cursor ao normal
    }
    // Limpa qualquer alvo de arrasto remanescente
    document.querySelectorAll('.draggable-box.drag-over-target').forEach(box => box.classList.remove('drag-over-target'));
    draggingElementId = null;
}

function setupScrollAnimations() {
    const boxes = document.querySelectorAll('.content-box');
    const observerOptions = {
        root: null, // viewport como root
        rootMargin: '0px',
        threshold: 0.1 // Começa a animação quando 10% do elemento está visível
    };

    const observerCallback = (entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target); // Para de observar após a animação
            }
        });
    };

    const scrollObserver = new IntersectionObserver(observerCallback, observerOptions);
    boxes.forEach(box => scrollObserver.observe(box));
}

// Debounce para a barra de progresso de scroll para otimizar performance
const debouncedUpdateScrollProgressBar = debounce(function() {
    const progressBar = document.getElementById('scroll-progress-bar');
    if (!progressBar) return;

    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    // Calcula a altura total de rolagem da página
    const scrollHeight = Math.max(
        document.body.scrollHeight, document.documentElement.scrollHeight,
        document.body.offsetHeight, document.documentElement.offsetHeight,
        document.body.clientHeight, document.documentElement.clientHeight
    ) - document.documentElement.clientHeight; // Altura total - altura visível

    if (scrollHeight > 0) {
        progressBar.style.width = `${(scrollTop / scrollHeight) * 100}%`;
    } else {
        progressBar.style.width = '0%'; // Sem barra se não houver scroll
    }
}, 10); // Atraso de 10ms é quase imperceptível, mas eficiente

// Debounce para atualização do banner no redimensionamento
const debouncedUpdateBannerOnResize = debounce(updateBanner, 250);

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLightMode = document.body.classList.contains('light-mode');
    localStorage.setItem('themePreference', isLightMode ? 'light' : 'dark');

    const newTheme = isLightMode ? 'light' : 'dark';
    const themeIcon = document.querySelector('#theme-toggle i');
    if (themeIcon) {
        themeIcon.classList.toggle('fa-moon', !isLightMode);
        themeIcon.classList.toggle('fa-sun', isLightMode);
    }

    // Esqueletos para evitar flicker ao recarregar widgets TradingView
    const tickerTapeSkeleton = document.querySelector('#tradingview-ticker-tape-container .tv-skeleton');
    if (tickerTapeSkeleton) tickerTapeSkeleton.style.display = 'flex';
    const marketOverviewSkeleton = document.querySelector('#market-overview-widget-wrapper .tv-skeleton');
    if (marketOverviewSkeleton) marketOverviewSkeleton.style.display = 'flex';

    // Recarrega widgets TradingView com o novo tema
    if (typeof renderTickerTapeWidget === 'function') {
        renderTickerTapeWidget(newTheme);
    }
    if (typeof renderMarketOverviewWidget === 'function') {
        const marketBoxEl = document.getElementById('box-market');
        // Só recarrega se o box estiver visível
        if (marketBoxEl && window.getComputedStyle(marketBoxEl).display !== 'none') {
             renderMarketOverviewWidget(newTheme);
        }
    }

    // Recarrega o calendário econômico se estiver aberto
    const calendarOverlay = document.getElementById('economic-calendar-overlay');
    if (calendarOverlay && calendarOverlay.classList.contains('is-active')) {
        if (typeof loadEconomicCalendarWidget === 'function') {
            loadEconomicCalendarWidget();
        }
    }

    // Recarrega widgets TradingView dentro do modal se estiverem abertos
    if (contentModalOverlay && contentModalOverlay.classList.contains('visible')) {
        const modalMarketContainer = document.getElementById('modal-market-overview-container');
        const modalTVChartContainer = document.getElementById('modal-tv-chart-container');

        if (modalMarketContainer && modalMarketContainer.querySelector('.tradingview-widget-container')) {
            if (typeof renderMarketOverviewWidget === 'function') {
                renderMarketOverviewWidget(newTheme, 'modal-market-overview-container');
            }
        } else if (currentModalChartSymbol && modalTVChartContainer && modalTVChartContainer.querySelector('.tradingview-widget-container')) {
            // Reabre o gráfico para aplicar o novo tema
            if (typeof openChartDetailModal === 'function') {
                openChartDetailModal(currentModalChartSymbol);
            }
        }
    }
}

function setupPullToRefresh() {
    const ptrIndicator = document.getElementById('pull-to-refresh-indicator');
    if (!ptrIndicator) return;

    let startY = 0;
    let isDragging = false;
    const PULL_THRESHOLD = 70; // Distância em px para disparar o refresh
    const MAX_PULL_DISTANCE = 100; // Distância máxima que o indicador pode "puxar"

    document.body.addEventListener('touchstart', (e) => {
        // Só ativa se estiver no topo da página e com um único toque
        if (window.scrollY === 0 && e.touches.length === 1) {
            startY = e.touches[0].pageY;
            isDragging = true;
            ptrIndicator.classList.add('visible'); // Mostra o indicador
            ptrIndicator.style.transition = 'transform 0.1s linear'; // Transição rápida para a puxada
        }
    }, { passive: true }); // passive: true para scroll suave, mas precisaremos de e.preventDefault() em touchmove

    document.body.addEventListener('touchmove', (e) => {
        if (!isDragging || window.scrollY !== 0 || e.touches.length > 1) {
            // Se já não estiver arrastando, ou scrollou para baixo, ou múltiplos toques
            if (isDragging) { // Se estava arrastando e parou por alguma razão
                isDragging = false;
                ptrIndicator.style.transform = `translateY(-50px)`; // Volta à posição inicial
                ptrIndicator.classList.remove('active', 'visible');
            }
            return;
        }

        const currentY = e.touches[0].pageY;
        let diffY = currentY - startY; // Diferença de movimento

        if (diffY > 0) { // Se estiver puxando para baixo
            if (e.cancelable) e.preventDefault(); // Previne o scroll da página, importante para o efeito de "puxar"

            const pullDistance = Math.min(diffY, MAX_PULL_DISTANCE);
            // Ajusta a posição Y do indicador para um efeito mais suave
            ptrIndicator.style.transform = `translateY(${Math.min(pullDistance - 50, 50)}px)`;

            if (diffY > PULL_THRESHOLD) {
                ptrIndicator.classList.add('active');
                ptrIndicator.innerHTML = '<i class="fas fa-arrow-up"></i> Solte para atualizar';
            } else {
                ptrIndicator.classList.remove('active');
                ptrIndicator.innerHTML = '<i class="fas fa-arrow-down"></i> Puxe para atualizar';
            }
        } else {
            // Se puxar para cima estando no topo, esconde o indicador
            ptrIndicator.style.transform = `translateY(-50px)`;
        }
    }, { passive: false }); // passive: false para permitir e.preventDefault()

    document.body.addEventListener('touchend', (e) => {
        if (!isDragging) return; // Não estava arrastando, ignora
        isDragging = false; // Reseta o estado

        const currentY = e.changedTouches[0].pageY;
        const diffY = currentY - startY;

        ptrIndicator.style.transition = 'transform 0.3s ease-out'; // Transição para o movimento final

        if (diffY > PULL_THRESHOLD && window.scrollY === 0) {
            // Dispara a atualização
            ptrIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
            ptrIndicator.classList.add('active', 'refreshing'); // Adiciona classe 'refreshing'

            showNotification('Atualizando dados. Aguarde...', false, 'info'); // Notificação de atualização

            Promise.all([
                loadNewsWidget(true),
                updateCommentaryContent(),
                updateWeeklySummaryContent()
            ])
            .then(() => {
                showNotification('Todos os dados foram atualizados!', false, 'success');
            })
            .catch(err => {
                showNotification('Erro ao atualizar os dados. Tente novamente.', true);
                console.error("Erro no pull-to-refresh:", err);
            })
            .finally(() => {
                // Esconde o indicador e reseta após um pequeno atraso
                setTimeout(() => {
                    ptrIndicator.style.transform = `translateY(-50px)`;
                    ptrIndicator.classList.remove('active', 'visible', 'refreshing');
                    ptrIndicator.innerHTML = '<i class="fas fa-arrow-down"></i> Puxe para atualizar';
                }, 500); // Meio segundo para o usuário ver a mensagem de sucesso/erro
            });
        } else {
            // Volta à posição inicial se não atingiu o threshold
            ptrIndicator.style.transform = `translateY(-50px)`;
            ptrIndicator.classList.remove('active', 'visible');
            ptrIndicator.innerHTML = '<i class="fas fa-arrow-down"></i> Puxe para atualizar';
        }
        startY = 0; // Reseta a posição inicial
    });
}

// =============================================
// NOVO: FUNÇÃO PARA O MENU FLUTUANTE (FAB) - VERSÃO ATUALIZADA
// =============================================
function setupFabMenu() {
    const fabContainer = document.getElementById('fab-container-main');
    const fabToggle = document.getElementById('fab-toggle-main');

    if (!fabContainer || !fabToggle) {
        console.warn('Elementos do Menu Flutuante (FAB) não encontrados.');
        return;
    }

    const toggleIcon = fabToggle.querySelector('i'); // Seleciona o ícone único

    // Função para fechar o menu e resetar o ícone
    const closeMenu = () => {
        if (fabContainer.classList.contains('active')) {
            fabContainer.classList.remove('active');
            toggleIcon.classList.remove('fa-times');
            toggleIcon.classList.add('fa-plus');
        }
    };

    fabToggle.addEventListener('click', (event) => {
        event.stopPropagation(); // Impede que o clique no botão feche o menu imediatamente
        const isActive = fabContainer.classList.toggle('active');

        // Troca a classe do ícone baseado no estado do menu
        if (isActive) {
            toggleIcon.classList.remove('fa-plus');
            toggleIcon.classList.add('fa-times');
        } else {
            toggleIcon.classList.remove('fa-times');
            toggleIcon.classList.add('fa-plus');
        }
    });

    // Fecha o menu se clicar fora dele
    document.addEventListener('click', (event) => {
        if (!fabContainer.contains(event.target)) {
            closeMenu();
        }
    });

    // Fecha o menu ao pressionar a tecla 'Escape'
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeMenu();
        }
    });
}


// =============================================
// EVENT LISTENERS E INICIALIZAÇÃO GERAL
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
    initializeModalElements();
    setupBoxVisibility(); // Inicializa visibilidade e painel
    setupWatchlist(); // Inicializa a watchlist

    // Configuração inicial do tema (dark/light mode)
    let currentTheme = 'dark';
    const savedTheme = localStorage.getItem('themePreference');
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;

    if (savedTheme === 'light' || (!savedTheme && prefersLight)) {
        currentTheme = 'light';
        document.body.classList.add('light-mode');
    } else {
        document.body.classList.remove('light-mode');
    }
    const themeIcon = document.querySelector('#theme-toggle i');
    if (themeIcon) {
        themeIcon.classList.toggle('fa-moon', currentTheme === 'dark');
        themeIcon.classList.toggle('fa-sun', currentTheme === 'light');
    }

    setupCommentaryActions(); // Configura ações do Radar Financeiro

    // Adiciona botão de expandir para Monitor de Mercado
    const marketBox = document.getElementById('box-market');
    if (marketBox) {
        const boxHeader = marketBox.querySelector('.box-header');
        if (boxHeader) {
            let actionsContainer = boxHeader.querySelector('.box-actions');
            if (!actionsContainer) {
                actionsContainer = document.createElement('div');
                actionsContainer.className = 'box-actions';
                boxHeader.appendChild(actionsContainer);
            }
            addOrUpdateModalButton(marketBox, actionsContainer, 'expand-market-btn', 'fa-expand-arrows-alt');
        }
    }

    // Adiciona botão de expandir para Últimas Notícias
    const newsBox = document.getElementById('news-widget');
    if (newsBox) {
        const boxHeader = newsBox.querySelector('.box-header');
        if (boxHeader) {
            let actionsContainer = boxHeader.querySelector('.box-actions');
            if (!actionsContainer) { // Se não existir, cria
                actionsContainer = document.createElement('div');
                actionsContainer.className = 'box-actions';
                boxHeader.appendChild(actionsContainer);
            }
            addOrUpdateModalButton(newsBox, actionsContainer, 'expand-news-btn', 'fa-expand-arrows-alt');
        }
    }

    // Adiciona botão de expandir e imprimir para Resumo Semanal
    const summaryBox = document.getElementById('box-weekly-summary');
    if (summaryBox) {
        const boxHeader = summaryBox.querySelector('.box-header');
        if (boxHeader) {
            let actionsContainer = boxHeader.querySelector('.box-actions');
            if (!actionsContainer) {
                actionsContainer = document.createElement('div');
                actionsContainer.className = 'box-actions';
                boxHeader.appendChild(actionsContainer);
            }
            addOrUpdateModalButton(summaryBox, actionsContainer, 'expand-summary-btn', 'fa-expand-arrows-alt');

            const printBtn = document.createElement('button');
            printBtn.id = 'print-summary-btn';
            printBtn.className = 'expand-btn';
            printBtn.setAttribute('aria-label', 'Imprimir Resumo Semanal');
            printBtn.innerHTML = '<i class="fas fa-print"></i>';
            printBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                if (typeof printBoxContent === 'function') {
                    printBoxContent('box-weekly-summary');
                } else {
                    showNotification('Função de impressão não disponível.', true);
                }
            });
            actionsContainer.appendChild(printBtn);
        }
    }


    await loadBannerPhrases(); // Carrega frases do banner

    // Botão de atualização geral
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            showNotification('Atualizando todos os dados do painel...');
            Promise.all([
                updateDateTime(),
                loadNewsWidget(true),
                updateCommentaryContent(),
                updateWeeklySummaryContent()
            ])
            .then(() => showNotification('Todos os dados foram atualizados com sucesso!', false, 'success'))
            .catch(err => {
                showNotification('Erro durante a atualização geral. Verifique sua conexão.', true);
                console.error("Erro na atualização geral:", err);
            });
        });
    }

    // Botão de refresh específico para Notícias
    const refreshNewsBtn = document.getElementById('refresh-news-btn');
    if (refreshNewsBtn && typeof loadNewsWidget === 'function') {
        refreshNewsBtn.addEventListener('click', () => loadNewsWidget(true));
    }

    // Botão de alternar tema
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn && typeof toggleTheme === 'function') {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }

    // Botões de tela cheia
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn && typeof toggleFullscreen === 'function') {
        fullscreenBtn.addEventListener('click', toggleFullscreen);
    }
    const fullscreenExitBtn = document.getElementById('fullscreen-exit-btn');
    if (fullscreenExitBtn && typeof toggleFullscreen === 'function') {
        fullscreenExitBtn.addEventListener('click', toggleFullscreen);
    }
    // Listeners para mudanças no estado de tela cheia
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(event =>
        document.addEventListener(event, typeof handleFullscreenChange === 'function' ? handleFullscreenChange : () => {})
    );

    // Navegação entre páginas
    document.getElementById('analises-btn')?.addEventListener('click', () => window.location.href = 'analises.html');
    document.getElementById('indicadores-btn')?.addEventListener('click', () => window.location.href = 'indicadores.html');
    document.getElementById('calculadoras-btn')?.addEventListener('click', () => window.location.href = 'calculadoras/calculadoras.html');
    document.getElementById('terminal-btn')?.addEventListener('click', () => window.location.href = 'terminal-news.html');

    // Calendário Econômico (overlay)
    const calendarToggleBtn = document.getElementById('economic-calendar-toggle-btn');
    const calendarOverlay = document.getElementById('economic-calendar-overlay');
    const calendarContentPanel = document.getElementById('economic-calendar-content-panel');
    const closeCalendarBtn = document.getElementById('close-calendar-btn');

    if (calendarToggleBtn && calendarOverlay && calendarContentPanel && closeCalendarBtn) {
        calendarToggleBtn.addEventListener('click', () => {
            calendarOverlay.classList.add('is-active');
            calendarContentPanel.classList.add('is-visible');
            document.body.classList.add('body-modal-open'); // Bloqueia scroll
            if (typeof loadEconomicCalendarWidget === 'function') {
                loadEconomicCalendarWidget(); // Carrega o widget do calendário
            }
        });
        const closeCalendarOverlay = () => {
            calendarContentPanel.classList.remove('is-visible');
            calendarOverlay.classList.remove('is-active');
            document.body.classList.remove('body-modal-open'); // Libera scroll
        };
        closeCalendarBtn.addEventListener('click', closeCalendarOverlay);
        calendarOverlay.addEventListener('click', (event) => {
            if (event.target === calendarOverlay) closeCalendarOverlay();
        });
    }

    // Spotify Player (toggle)
    const spotifyBtn = document.getElementById('spotify-btn');
    const spotifyPlayer = document.getElementById('spotify-player-container');
    const closeSpotifyBtn = document.getElementById('close-spotify-btn');

    if (spotifyBtn && spotifyPlayer && closeSpotifyBtn) {
        spotifyBtn.addEventListener('click', () => {
            const isPlayerVisible = spotifyPlayer.classList.contains('visible');
            if (isPlayerVisible) {
                spotifyPlayer.classList.remove('visible');
                setTimeout(() => { // Espera a transição
                    if (!spotifyPlayer.classList.contains('visible')) {
                         spotifyPlayer.style.display = 'none';
                    }
                }, 300);
            } else {
                spotifyPlayer.style.display = 'block';
                setTimeout(() => { // Pequeno atraso para triggerar a transição
                    spotifyPlayer.classList.add('visible');
                }, 10);
            }
        });

        closeSpotifyBtn.addEventListener('click', () => {
            spotifyPlayer.classList.remove('visible');
            setTimeout(() => {
                spotifyPlayer.style.display = 'none';
            }, 300);
        });
    }

    // Eventos de redimensionamento e scroll com debounce
    window.addEventListener('resize', debouncedUpdateBannerOnResize);
    window.addEventListener('scroll', debouncedUpdateScrollProgressBar);
    debouncedUpdateScrollProgressBar(); // Chama uma vez para iniciar

    // Atualizações de conteúdo em intervalos
    updateDateTime();
    setInterval(updateDateTime, 30000); // A cada 30 segundos

    loadNewsWidget();
    // Inicia o auto-refresh do Radar Financeiro
    updateCommentaryContent();
    setInterval(updateCommentaryContent, COMMENTARY_UPDATE_INTERVAL);

    // Carrega o resumo semanal (geralmente não precisa de refresh tão frequente)
    updateWeeklySummaryContent();

    // Atualiza o banner a cada 30 segundos
    setInterval(updateBanner, 30 * 1000);

    // Inicializa Drag and Drop
    setupDragAndDrop();

    // Inicializa animações de scroll para boxes
    setupScrollAnimations();

    // Inicializa Pull-to-Refresh para dispositivos móveis
    setupPullToRefresh();
    
    // NOVO: Inicializa o Menu Flutuante (FAB)
    setupFabMenu();

    // Carrega widgets TradingView
    if (typeof renderTickerTapeWidget === 'function') renderTickerTapeWidget(currentTheme);
    if (typeof renderMarketOverviewWidget === 'function') {
        const marketBoxEl = document.getElementById('box-market');
        // Só renderiza se o box estiver visível inicialmente
        if (marketBoxEl && window.getComputedStyle(marketBoxEl).display !== 'none') {
             renderMarketOverviewWidget(currentTheme);
        }
    }

    // Mensagem de boas-vindas
    setTimeout(() => {
        if (!document.querySelector('.page-notification') && typeof showNotification === "function") {
            showNotification('Bem-vindo ao Mercado Macro!', false, 'success');
        }
    }, 1500); // 1.5 segundos após o carregamento
});

// Garante que funções globais que são chamadas no HTML estejam no objeto window
if (typeof toggleFavorite === "function") { window.toggleFavorite = toggleFavorite; }
if (typeof loadNewsWidget === "function") { window.loadNewsWidget = loadNewsWidget; }
if (typeof printBoxContent === "function") { window.printBoxContent = printBoxContent; }
