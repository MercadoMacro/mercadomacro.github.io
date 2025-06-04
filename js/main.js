// =============================================
// CONFIGURAÇÕES GLOBAIS
// =============================================
const CACHE_KEY_NEWS = 'newsCache_v6';
const CACHE_TTL_NEWS = 15 * 60 * 1000;
const FAVORITES_KEY = 'favorites_v2';
const BOX_SLOT_ASSIGNMENT_KEY = 'boxSlotAssignment_v1'; // Para layout grid
const DEFAULT_SLOT_ASSIGNMENTS = {
    slotA: 'box-commentary',
    slotB: 'box-market',
    slotC: 'news-widget', // news-widget e watchlist podem compartilhar slotC ou ter slots separados
    slotD: 'box-watchlist'  // Adicionando watchlist a um slot. Ajustar grid-template-areas em CSS se necessário.
};
const GOOGLE_DOC_ID = '1IYFmfdajMtuquyfen070HRKfNjflwj-x9VvubEgs1XM';
const GOOGLE_API_KEY = 'AIzaSyBuvcaEcTBr0EIZZZ45h8JilbcWytiyUWo';
const COMMENTARY_UPDATE_INTERVAL = 5 * 60 * 1000;
let commentaryLastUpdateTimestamp = null;
let BANNER_PHRASES = [];

let contentModalOverlay, modalContentArea, contentModalCloseBtn;
let currentModalChartSymbol = null;

const VISIBILITY_PREFS_KEY = 'dashboardBoxVisibility_v1';
const DEFAULT_BOX_VISIBILITY = {
    'box-commentary': true,
    'box-market': true,
    'box-watchlist': true,
    'news-widget': true
};
let settingsToggleBtn, visibilitySettingsPanel;
let visibilityCheckboxes = [];

const WATCHLIST_SYMBOLS_KEY = 'dashboardWatchlistSymbols_v1';
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
    if (contentModalCloseBtn) contentModalCloseBtn.addEventListener('click', closeContentModal);
    if (contentModalOverlay) contentModalOverlay.addEventListener('click', (event) => { if (event.target === contentModalOverlay) closeContentModal(); });
    document.addEventListener('keydown', function(event) { if (event.key === 'Escape' && contentModalOverlay && contentModalOverlay.classList.contains('visible')) closeContentModal(); });
}

function openContentModal(boxId) {
    if (!contentModalOverlay || !modalContentArea) { console.error('Elementos do modal não foram inicializados.'); return; }
    const originalBox = document.getElementById(boxId);
    const originalBoxContent = originalBox ? originalBox.querySelector('.box-content') : null;

    while (modalContentArea.firstChild) { modalContentArea.removeChild(modalContentArea.firstChild); }
    currentModalChartSymbol = null;

    if (!originalBoxContent) {
        modalContentArea.innerHTML = '<p class="error-commentary"><i class="fas fa-exclamation-triangle"></i> Conteúdo não encontrado.</p>';
    } else {
        if (boxId === 'box-market') {
            const marketWidgetModalContainer = document.createElement('div');
            marketWidgetModalContainer.id = 'modal-market-overview-container';
            marketWidgetModalContainer.style.width = '100%'; marketWidgetModalContainer.style.height = '100%';
            modalContentArea.appendChild(marketWidgetModalContainer);
            const currentTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
            if (typeof renderMarketOverviewWidget === 'function') renderMarketOverviewWidget(currentTheme, marketWidgetModalContainer.id);
            else marketWidgetModalContainer.innerHTML = '<p class="error-commentary"><i class="fas fa-exclamation-triangle"></i> Erro: Função renderMarketOverviewWidget não encontrada.</p>';
        } else {
            const clonedContent = originalBoxContent.cloneNode(true);
            modalContentArea.appendChild(clonedContent);
        }
    }
    contentModalOverlay.style.display = 'flex';
    setTimeout(() => { contentModalOverlay.classList.add('visible'); }, 10);
    document.body.classList.add('body-modal-open');
}

function openChartDetailModal(symbol) {
    if (!contentModalOverlay || !modalContentArea || typeof TradingView === 'undefined') {
        console.error('Elementos do modal ou TradingView não disponíveis para o gráfico.');
        showNotification('Erro ao abrir gráfico detalhado.', true); return;
    }
    while (modalContentArea.firstChild) { modalContentArea.removeChild(modalContentArea.firstChild); }
    currentModalChartSymbol = symbol;

    const chartContainerDiv = document.createElement('div');
    chartContainerDiv.id = 'modal-tv-chart-container';
    chartContainerDiv.style.width = '100%'; chartContainerDiv.style.height = '100%';
    modalContentArea.appendChild(chartContainerDiv);
    const currentTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
    try {
        new TradingView.widget({
            "container_id": chartContainerDiv.id, "symbol": symbol, "interval": "D",
            "theme": currentTheme, "autosize": true, "locale": "pt_BR",
            "toolbar_bg": currentTheme === "light" ? "#f1f3f6" : "#131722",
            "enable_publishing": false, "allow_symbol_change": true,
            "hide_side_toolbar": false, "studies": ["MASimple@tv-basicstudies"],
            "details": true, "hotlist": true, "calendar": true, "news": true, "style": "1",
        });
    } catch (error) {
        console.error(`Erro ao criar o widget TradingView para ${symbol}:`, error);
        chartContainerDiv.innerHTML = `<p class="error-commentary"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar o gráfico para ${symbol}. Verifique o formato do símbolo.</p>`;
    }
    contentModalOverlay.style.display = 'flex';
    setTimeout(() => { contentModalOverlay.classList.add('visible'); }, 10);
    document.body.classList.add('body-modal-open');
}

function closeContentModal() {
    if (contentModalOverlay) {
        contentModalOverlay.classList.remove('visible');
        setTimeout(() => { if (!contentModalOverlay.classList.contains('visible')) contentModalOverlay.style.display = 'none'; }, 300);
    }
    if (modalContentArea) {
        while (modalContentArea.firstChild) { modalContentArea.removeChild(modalContentArea.firstChild); }
    }
    document.body.classList.remove('body-modal-open');
    currentModalChartSymbol = null;
}

// =============================================
// FUNÇÕES DE VISIBILIDADE DOS BOXES
// =============================================
function setupBoxVisibility() {
    settingsToggleBtn = document.getElementById('settings-toggle-btn');
    visibilitySettingsPanel = document.getElementById('visibility-settings-panel');
    if (!settingsToggleBtn || !visibilitySettingsPanel) { console.warn('Elementos do painel de configurações de visibilidade não encontrados.'); return; }

    let savedPrefs = {};
    try {
        const savedPrefsJSON = localStorage.getItem(VISIBILITY_PREFS_KEY);
        if (savedPrefsJSON) {
            savedPrefs = JSON.parse(savedPrefsJSON);
        } else {
            savedPrefs = { ...DEFAULT_BOX_VISIBILITY };
        }
    } catch (e) {
        console.error("Erro ao carregar preferências de visibilidade, usando padrão.", e);
        savedPrefs = { ...DEFAULT_BOX_VISIBILITY };
    }
    // Garante que todas as chaves default estejam presentes
    for (const key in DEFAULT_BOX_VISIBILITY) {
        if (savedPrefs[key] === undefined) {
            savedPrefs[key] = DEFAULT_BOX_VISIBILITY[key];
        }
    }

    document.querySelectorAll('.visibility-toggle-checkbox').forEach(checkbox => {
        const boxId = checkbox.dataset.boxid;
        if (boxId) {
            const boxElement = document.getElementById(boxId);
            const isVisible = savedPrefs[boxId];
            checkbox.checked = isVisible;
            if (boxElement) {
                 // O content-box usa display: flex por padrão no CSS.
                boxElement.style.display = isVisible ? 'flex' : 'none';
            }

            checkbox.addEventListener('change', (event) => {
                const currentBoxId = event.target.dataset.boxid;
                const currentBoxElement = document.getElementById(currentBoxId);
                const nowVisible = event.target.checked;
                if (currentBoxElement) {
                    const wasHidden = window.getComputedStyle(currentBoxElement).display === 'none';
                    currentBoxElement.style.display = nowVisible ? 'flex' : 'none';
                    if (nowVisible && wasHidden) {
                        if (currentBoxId === 'box-market' && typeof renderMarketOverviewWidget === 'function') {
                            const currentTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
                            renderMarketOverviewWidget(currentTheme, 'market-overview-widget-wrapper');
                        }
                    }
                    // Se um box foi escondido, precisamos re-salvar a ordem dos slots baseada nos visíveis
                    if (typeof saveSlotAssignments === 'function') saveSlotAssignments();
                }
                const currentPrefs = JSON.parse(localStorage.getItem(VISIBILITY_PREFS_KEY)) || { ...DEFAULT_BOX_VISIBILITY };
                currentPrefs[currentBoxId] = nowVisible;
                localStorage.setItem(VISIBILITY_PREFS_KEY, JSON.stringify(currentPrefs));
                if (window.innerWidth <= 768) { visibilitySettingsPanel.classList.remove('visible'); visibilitySettingsPanel.style.display = 'none'; }
            });
            visibilityCheckboxes.push(checkbox);
        }
    });
    settingsToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isCurrentlyVisible = visibilitySettingsPanel.classList.toggle('visible');
        visibilitySettingsPanel.style.display = isCurrentlyVisible ? 'block' : 'none';
        if (isCurrentlyVisible) {
             visibilityCheckboxes.forEach(cb => {
                const boxEl = document.getElementById(cb.dataset.boxid);
                if (boxEl) cb.checked = (window.getComputedStyle(boxEl).display !== 'none');
             });
        }
    });
    document.addEventListener('click', (event) => {
        if (visibilitySettingsPanel && visibilitySettingsPanel.classList.contains('visible')) {
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
function loadWatchlistSymbols() { const savedSymbols = localStorage.getItem(WATCHLIST_SYMBOLS_KEY); watchlistSymbols = savedSymbols ? JSON.parse(savedSymbols) : []; }
function saveWatchlistSymbols() { localStorage.setItem(WATCHLIST_SYMBOLS_KEY, JSON.stringify(watchlistSymbols)); }
function renderWatchlistItems() { if (!watchlistItemsContainer) return; watchlistItemsContainer.innerHTML = ''; if (watchlistSymbols.length === 0) { watchlistItemsContainer.innerHTML = '<p style="text-align:center; color:var(--text-secondary); font-size:13px; padding-top:10px;">Sua watchlist está vazia.</p>'; return; } watchlistSymbols.forEach(symbol => { const itemDiv = document.createElement('div'); itemDiv.className = 'watchlist-item'; itemDiv.setAttribute('role', 'button'); itemDiv.setAttribute('tabindex', '0'); itemDiv.setAttribute('aria-label', `Ver gráfico de ${symbol}`); const symbolSpan = document.createElement('span'); symbolSpan.className = 'watchlist-item-symbol'; symbolSpan.textContent = symbol.toUpperCase(); itemDiv.appendChild(symbolSpan); const removeBtn = document.createElement('button'); removeBtn.className = 'watchlist-item-remove-btn'; removeBtn.innerHTML = '<i class="fas fa-times-circle"></i>'; removeBtn.setAttribute('aria-label', `Remover ${symbol} da watchlist`); removeBtn.addEventListener('click', (event) => { event.stopPropagation(); removeSymbolFromWatchlist(symbol); }); itemDiv.appendChild(removeBtn); itemDiv.addEventListener('click', () => openChartDetailModal(symbol)); itemDiv.addEventListener('keypress', (event) => { if (event.key === 'Enter') openChartDetailModal(symbol); }); watchlistItemsContainer.appendChild(itemDiv); }); }
function addSymbolToWatchlist() { if (!watchlistSymbolInput) return; const symbol = watchlistSymbolInput.value.trim().toUpperCase(); if (symbol === '') { showNotification('Por favor, insira um símbolo.', true); return; } if (watchlistSymbols.includes(symbol)) { showNotification(`Símbolo "${symbol}" já está na watchlist.`, false); watchlistSymbolInput.value = ''; return; } watchlistSymbols.push(symbol); saveWatchlistSymbols(); renderWatchlistItems(); showNotification(`"${symbol}" adicionado à watchlist!`); watchlistSymbolInput.value = ''; }
function removeSymbolFromWatchlist(symbolToRemove) { watchlistSymbols = watchlistSymbols.filter(s => s !== symbolToRemove); saveWatchlistSymbols(); renderWatchlistItems(); showNotification(`"${symbolToRemove}" removido da watchlist.`); }
function setupWatchlist() { watchlistSymbolInput = document.getElementById('watchlist-symbol-input'); addWatchlistSymbolBtn = document.getElementById('add-watchlist-symbol-btn'); watchlistItemsContainer = document.getElementById('watchlist-items-container'); if (!watchlistSymbolInput || !addWatchlistSymbolBtn || !watchlistItemsContainer) { console.warn('Elementos da watchlist não encontrados.'); return; } loadWatchlistSymbols(); renderWatchlistItems(); addWatchlistSymbolBtn.addEventListener('click', addSymbolToWatchlist); watchlistSymbolInput.addEventListener('keypress', (event) => { if (event.key === 'Enter') addSymbolToWatchlist(); }); const watchlistBox = document.getElementById('box-watchlist'); if (watchlistBox) { const boxHeader = watchlistBox.querySelector('.box-header'); if (boxHeader) { let actionsContainer = boxHeader.querySelector('.box-actions'); if (!actionsContainer) { actionsContainer = document.createElement('div'); actionsContainer.className = 'box-actions'; boxHeader.appendChild(actionsContainer); } if (document.getElementById('draggable-container')) { addOrUpdateModalButton(watchlistBox, actionsContainer, 'expand-watchlist-box-btn'); } } } }


// =============================================
// FUNÇÃO PARA FORMATAR TEMPO RELATIVO (original)
// =============================================
function formatTimeSince(timestamp) { if (!timestamp) return ''; const now = new Date(); const secondsPast = (now.getTime() - timestamp) / 1000; if (secondsPast < 60) return 'há menos de um minuto'; if (secondsPast < 3600) { const minutes = Math.round(secondsPast / 60); return `há ${minutes} min${minutes > 1 ? 's' : ''}`; } if (secondsPast <= 86400) { const hours = Math.round(secondsPast / 3600); return `há ${hours} hora${hours > 1 ? 's' : ''}`; } const date = new Date(timestamp); return `em ${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`; }

// =============================================
// FUNÇÃO PARA ATUALIZAR DATA E HORA (original)
// =============================================
function updateDateTime() { const now = new Date(); const formattedDate = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); const dataAtualElement = document.getElementById('data-atual'); if (dataAtualElement) { const datetimeSpan = dataAtualElement.querySelector('.datetime'); if (datetimeSpan) datetimeSpan.textContent = formattedDate; } const footerElement = document.getElementById('footer'); if (footerElement) footerElement.textContent = `Fonte: Dados atualizados em ${formattedDate} • By Anderson Danilo`; }

// =============================================
// CÓDIGO DAS NOTÍCIAS (original)
// =============================================
const RSS_SOURCES = [ { name: 'RSS2JSON', buildUrl: feedUrl => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`, processor: data => { if (!data.items) throw new Error('Formato RSS2JSON inválido'); return data.items.map(item => ({ title: item.title, description: item.description, link: item.link, pubDate: item.pubDate })); } }, { name: 'AllOrigins', buildUrl: feedUrl => `https://api.allorigins.win/raw?charset=UTF-8&url=${encodeURIComponent(feedUrl)}`, processor: dataText => { if (!dataText) throw new Error('Conteúdo AllOrigins vazio'); const parser = new DOMParser(); const xmlDoc = parser.parseFromString(dataText, "text/xml"); return parseXmlNews(xmlDoc); } } ];
const RSS_FEEDS = [ 'https://www.dukascopy.com/fxspider/pt/rss/news_sector/finance/', 'https://www.valor.com.br/rss', 'https://www.infomoney.com.br/feed/' ];
const FALLBACK_NEWS = [ { title: "Mercado aguarda decisão do Fed", description: "Decisão sobre juros nos EUA é o foco.", link: "#", pubDate: new Date().toISOString() }, { title: "Ibovespa em alta com commodities", description: "Índice brasileiro acompanha otimismo externo.", link: "#", pubDate: new Date().toISOString() }, { title: "Dólar opera em queda", description: "Moeda americana perde força no cenário global.", link: "#", pubDate: new Date().toISOString() } ];

// =============================================
// FUNÇÕES PARA RENDERIZAR WIDGETS (renderTickerTapeWidget original, renderMarketOverviewWidget modificado)
// =============================================
function renderTickerTapeWidget(theme) { const container = document.getElementById('tradingview-ticker-tape-container'); if (!container) return; const skeleton = container.querySelector('.tv-skeleton'); if (skeleton) skeleton.style.display = 'none'; const widgetContent = container.querySelector('.tradingview-widget-container'); if(widgetContent) widgetContent.remove(); else { Array.from(container.childNodes).forEach(node => { if (!node.classList || !node.classList.contains('tv-skeleton')) container.removeChild(node); }); } const config = { "symbols": [ {"proName": "FOREXCOM:SPXUSD", "title": "S&P 500"}, {"description": "IBOVESPA", "proName": "BMFBOVESPA:IBOV"}, {"description": "NASDAQ 100","proName": "FOREXCOM:NSXUSD"}, {"description": "USD/BRL","proName": "FX_IDC:USDBRL"}, {"description": "EUR/USD","proName": "FX:EURUSD"}, {"description": "BITCOIN","proName": "BITSTAMP:BTCUSD"}, {"description": "PETRÓLEO BRENT","proName": "TVC:UKOIL"}, {"description": "OURO","proName": "OANDA:XAUUSD"} ], "showSymbolLogo": true, "isTransparent": true, "displayMode": "adaptive", "colorTheme": theme, "locale": "br" }; const script = document.createElement('script'); script.type = 'text/javascript'; script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js'; script.async = true; script.text = JSON.stringify(config); container.appendChild(script); }
function renderMarketOverviewWidget(theme, targetContainerId = 'market-overview-widget-wrapper') { const container = document.getElementById(targetContainerId); if (!container) { console.error(`Market Overview widget container com ID "${targetContainerId}" não encontrado.`); if (targetContainerId === 'modal-market-overview-container' && modalContentArea) { modalContentArea.innerHTML = `<p class="error-commentary" style="padding:20px; text-align:center;"><i class="fas fa-exclamation-triangle"></i> Container do widget de mercado não encontrado no modal.</p>`; } return; } const skeleton = container.querySelector('.tv-skeleton'); if (skeleton) skeleton.style.display = 'none'; let oldTvWidgetDiv = container.querySelector('.tradingview-widget-container'); while(oldTvWidgetDiv){ oldTvWidgetDiv.remove(); oldTvWidgetDiv = container.querySelector('.tradingview-widget-container');} const tvWidgetDiv = document.createElement('div'); tvWidgetDiv.className = 'tradingview-widget-container'; tvWidgetDiv.style.width = '100%'; tvWidgetDiv.style.height = '100%'; const config = { "colorTheme": theme, "dateRange": "12M", "showChart": true, "locale": "br", "largeChartUrl": "", "isTransparent": true, "showSymbolLogo": true, "showFloatingTooltip": false, "width": "100%", "height": "100%", "plotLineColorGrowing": theme === 'light' ? "rgba(0, 123, 255, 1)" : "rgba(0, 209, 128, 1)", "plotLineColorFalling": theme === 'light' ? "rgba(220, 53, 69, 1)" : "rgba(248, 81, 73, 1)", "gridLineColor": "rgba(240, 243, 250, 0)", "scaleFontColor": theme === 'light' ? "rgba(51, 51, 51, 0.7)" : "rgba(201, 209, 217, 0.7)", "belowLineFillColorGrowing": theme === 'light' ? "rgba(0, 123, 255, 0.12)" : "rgba(0, 209, 128, 0.12)", "belowLineFillColorFalling": theme === 'light' ? "rgba(220, 53, 69, 0.12)" : "rgba(248, 81, 73, 0.12)", "belowLineFillColorGrowingBottom": theme === 'light' ? "rgba(0, 123, 255, 0)" : "rgba(0, 209, 128, 0)", "belowLineFillColorFallingBottom": theme === 'light' ? "rgba(220, 53, 69, 0)" : "rgba(248, 81, 73, 0)", "symbolActiveColor": theme === 'light' ? "rgba(0, 123, 255, 0.12)" : "rgba(0, 209, 128, 0.12)", "tabs": [ { "title": "Indices", "symbols": [ {"s": "FOREXCOM:SPXUSD", "d": "S&P 500"}, {"s": "FOREXCOM:NSXUSD", "d": "NASDAQ 100"}, {"s": "FOREXCOM:DJI", "d": "Dow Jones"}, {"s": "BMFBOVESPA:IBOV", "d":"IBOVESPA"}, {"s": "INDEX:DEU40", "d": "DAX"}, {"s": "FOREXCOM:UKXGBP", "d": "FTSE 100"} ], "originalTitle": "Indices" }, { "title": "Moedas", "symbols": [ {"s": "FX_IDC:USDBRL", "d":"USD/BRL"}, {"s": "FX:EURUSD", "d": "EUR/USD"}, {"s": "FX:GBPUSD", "d": "GBP/USD"}, {"s": "FX:USDJPY", "d": "USD/JPY"}, {"s": "FX:AUDUSD", "d": "AUD/USD"}, {"s": "FX:USDCAD", "d": "USD/CAD"} ], "originalTitle": "Forex" }, { "title": "Commodities", "symbols": [ {"s": "TVC:UKOIL", "d": "Petróleo Brent"}, {"s": "TVC:USOIL", "d": "Petróleo WTI"}, {"s": "OANDA:XAUUSD", "d": "Ouro"}, {"s": "TVC:SILVER", "d": "Prata"}, {"s": "COMEX:HG1!", "d": "Cobre"}], "originalTitle": "Commodities" }, { "title": "Cripto", "symbols": [ {"s": "BINANCE:BTCUSDT", "d": "Bitcoin"}, {"s": "BINANCE:ETHUSDT", "d": "Ethereum"}, {"s": "BINANCE:SOLUSDT", "d": "Solana"} ], "originalTitle": "Crypto" } ] }; const script = document.createElement('script'); script.type = 'text/javascript'; script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js'; script.async = true; script.text = JSON.stringify(config); tvWidgetDiv.appendChild(script); container.appendChild(tvWidgetDiv); }
function loadEconomicCalendarWidget() { const widgetContainer = document.getElementById('economicCalendarWidget'); if (!widgetContainer) { console.error('Contêiner do Calendário Econômico não encontrado.'); return; } widgetContainer.innerHTML = ''; const currentThemeIsLight = document.body.classList.contains('light-mode'); const widgetTheme = currentThemeIsLight ? 0 : 1;  const configJsonString = JSON.stringify({ "width": "100%", "height": "100%", "mode": "1", "theme": widgetTheme, "lang": "pt" }); const scriptTag = document.createElement('script'); scriptTag.async = true; scriptTag.type = 'text/javascript'; scriptTag.setAttribute('data-type', 'calendar-widget'); scriptTag.text = configJsonString; scriptTag.src = 'https://www.tradays.com/c/js/widgets/calendar/widget.js?v=13'; widgetContainer.appendChild(scriptTag); }
async function loadBannerPhrases() { try { const response = await fetch('data/banner-phrases.json'); if (!response.ok) throw new Error(`Falha ao carregar frases: ${response.status}`); BANNER_PHRASES = (await response.json()).phrases; if (!BANNER_PHRASES || BANNER_PHRASES.length === 0) { BANNER_PHRASES = ["Acompanhe as últimas movimentações do mercado financeiro"]; } } catch (error) { console.error('Erro ao carregar frases do banner:', error); BANNER_PHRASES = ["Bem-vindo ao Mercado Macro"]; } updateBanner(); }
function updateBanner() { const banner = document.getElementById('random-banner'); const bannerTextEl = banner ? banner.querySelector('.banner-text') : null; if (bannerTextEl && BANNER_PHRASES && BANNER_PHRASES.length > 0) { const randomPhrase = BANNER_PHRASES[Math.floor(Math.random() * BANNER_PHRASES.length)]; bannerTextEl.textContent = randomPhrase; bannerTextEl.style.animation = 'none'; void bannerTextEl.offsetWidth;  if (window.innerWidth <= 768) { bannerTextEl.style.animation = 'scrollBanner 15s linear infinite'; } else { bannerTextEl.style.animation = ''; } } else if (bannerTextEl) { bannerTextEl.textContent = "Notícias e Análises Financeiras"; } }
async function fetchGoogleDocContent() { const url = `https://www.googleapis.com/drive/v3/files/${GOOGLE_DOC_ID}/export?mimeType=text/plain&key=${GOOGLE_API_KEY}`; try { const response = await fetch(url, { signal: AbortSignal.timeout(10000) });  if (!response.ok) { const errorBody = await response.text(); console.error(`Google Docs API Error ${response.status}: ${response.statusText}`, errorBody); throw new Error(`Erro ${response.status} ao buscar Google Doc.`); } return await response.text(); } catch (error) { console.error('Falha na requisição ao Google Docs:', error); if (error.name !== 'AbortError') {  throw new Error('Não foi possível carregar a análise do Google Docs.'); } throw error;  } }
function updateCommentary(content) { const commentaryContentEl = document.getElementById('commentary-content'); if (!commentaryContentEl) return; let formattedContent = content.replace(/\r\n/g, '\n').split('\n').map(line => { line = line.trim(); if (/^\s*$/.test(line)) return null;  if (/^([📌☐✔☑️✅]\s*.+)/.test(line)) return `<div class="commentary-highlight">${line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</div>`; line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');  if (/^[•*-]\s*(.+)/.test(line)) return `<li>${line.substring(line.search(/\S/)).replace(/^[•*-]\s*/, '')}</li>`;  return `<p class="commentary-paragraph">${line}</p>`;  }).filter(line => line !== null).join(''); formattedContent = formattedContent.replace(/(<li>.*?<\/li>)+/sg, '<ul>$&</ul>'); commentaryContentEl.innerHTML = formattedContent || '<p>Nenhuma análise disponível.</p>'; }
async function updateCommentaryContent() { const commentaryContentEl = document.getElementById('commentary-content'); if (!commentaryContentEl) return; commentaryContentEl.innerHTML = `<div class="loading-commentary"><span class="loading-small"></span> Carregando análise...</div>`; try { const content = await fetchGoogleDocContent(); updateCommentary(content); commentaryLastUpdateTimestamp = Date.now(); return true; } catch (error) { console.error('Falha ao atualizar comentário:', error); commentaryContentEl.innerHTML = `<div class="error-commentary"><i class="fas fa-exclamation-triangle"></i> ${error.message || 'Falha ao carregar.'}</div>`; return false; } }
function addOrUpdateModalButton(boxElement, actionsContainer, buttonId, modalIconClass = 'fa-expand-arrows-alt') { if (!boxElement || !actionsContainer) { console.warn(`Elemento do Box ou actions container não encontrado para ID do botão: ${buttonId}`); return; } let modalBtn = actionsContainer.querySelector(`#${buttonId}`); let isNewButton = false; if (!modalBtn) { modalBtn = document.createElement('button'); modalBtn.id = buttonId; modalBtn.className = 'expand-btn'; isNewButton = true; } modalBtn.setAttribute('aria-label', 'Abrir em tela cheia'); const currentIconEl = modalBtn.querySelector('i'); if (currentIconEl) { currentIconEl.className = `fas ${modalIconClass}`; } else { modalBtn.innerHTML = `<i class="fas ${modalIconClass}"></i>`; } const newBtnInstance = modalBtn.cloneNode(true); if (!isNewButton && modalBtn.parentNode) { modalBtn.parentNode.replaceChild(newBtnInstance, modalBtn); } modalBtn = newBtnInstance; modalBtn.addEventListener('click', function(event) { event.stopPropagation(); openContentModal(boxElement.id); }); if (isNewButton) { if (actionsContainer.firstChild && actionsContainer.firstChild.id !== 'refresh-news-btn') { actionsContainer.insertBefore(modalBtn, actionsContainer.firstChild); } else { actionsContainer.appendChild(modalBtn); } } }
function setupCommentaryActions() { const commentaryBox = document.getElementById('box-commentary'); if (!commentaryBox) return; const boxHeader = commentaryBox.querySelector('.box-header'); if (!boxHeader) return; let actionsContainer = boxHeader.querySelector('.box-actions'); if (!actionsContainer) { actionsContainer = document.createElement('div'); actionsContainer.className = 'box-actions'; boxHeader.appendChild(actionsContainer); } addOrUpdateModalButton(commentaryBox, actionsContainer, 'expand-commentary-btn', 'fa-expand-arrows-alt'); if (!actionsContainer.querySelector('#share-commentary-btn')) { const shareBtn = document.createElement('button'); shareBtn.id = 'share-commentary-btn'; shareBtn.className = 'expand-btn'; shareBtn.setAttribute('aria-label', 'Compartilhar'); shareBtn.innerHTML = '<i class="fas fa-share-alt"></i>'; actionsContainer.appendChild(shareBtn); shareBtn.addEventListener('click', async function() { const commentaryContentEl = document.getElementById('commentary-content'); if (!commentaryContentEl) { showNotification('Conteúdo não encontrado.', true); return; } let textToShare = ""; commentaryContentEl.querySelectorAll('p, .commentary-highlight, li').forEach(el => { textToShare += (el.tagName === 'LI' ? "• " : "") + el.textContent.trim() + (el.tagName === 'LI' ? "\n" : "\n\n"); }); textToShare = textToShare.replace(/\n\s*\n/g, '\n\n').trim(); if (!textToShare) { showNotification('Não há conteúdo para compartilhar.', true); return; } const shareData = { title: 'Radar Financeiro - Análise', text: textToShare }; try { if (navigator.share && navigator.canShare && navigator.canShare(shareData)) { await navigator.share(shareData); showNotification('Conteúdo compartilhado!'); } else if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(textToShare); showNotification('Texto da análise copiado!'); } else { throw new Error('Compartilhamento não suportado.'); } } catch (err) { console.error('Erro ao compartilhar:', err); if (err.name !== 'AbortError') { showNotification(err.message.includes('não suportado') ? err.message : 'Falha ao compartilhar.', true); } } }); } }
async function fetchNews() { let lastError = null; for (const feedUrl of RSS_FEEDS) { for (const source of RSS_SOURCES) { try { const url = source.buildUrl(feedUrl); const response = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, signal: AbortSignal.timeout(8000) }); if (!response.ok) throw new Error(`HTTP ${response.status} em ${source.name} para ${feedUrl}`); let dataToProcess = source.name === 'AllOrigins' ? await response.text() : await response.json(); const newsItems = source.processor(dataToProcess); if (newsItems && newsItems.length > 0) return newsItems; } catch (error) { lastError = error; console.warn(`Falha com ${source.name} para ${feedUrl}:`, error); } } } console.error("Todas as fontes de notícias falharam. Último erro:", lastError); throw lastError || new Error('Todas as fontes de notícias falharam.'); }
async function loadNewsWidget(forceUpdate = false) { const newsContentBox = document.querySelector('#news-widget .news-content'); if (!newsContentBox) return; updateLoadingState(true); if (!forceUpdate) { const cachedData = getCachedNews(); if (cachedData) { renderNewsList(cachedData, true); updateLoadingState(false); return; } } if (!navigator.onLine) { showNotification('Sem conexão com a internet.', true); const cachedData = getCachedNews(); if (cachedData) renderNewsList(cachedData, true); else newsContentBox.innerHTML = '<div class="error"><i class="fas fa-wifi"></i> Sem conexão e sem notícias no cache.</div>'; updateLoadingState(false); return; } try { const newsItems = await fetchNews(); if (newsItems.length > 0) { cacheNews(newsItems); renderNewsList(newsItems); if (forceUpdate) showNotification('Notícias atualizadas!'); } else { renderNewsList([], false, false); if (forceUpdate) showNotification('Nenhuma notícia nova.', false); } localStorage.setItem('retryCount', '0'); } catch (fetchError) { console.error('Falha ao buscar notícias:', fetchError); if (forceUpdate) showNotification(`Falha na atualização: ${fetchError.message}.`, true); const cachedData = getCachedNews(); if (cachedData) { renderNewsList(cachedData, true); if (forceUpdate) showNotification('Mostrando notícias do cache.', false); } else { renderNewsList(FALLBACK_NEWS, false, true); if (forceUpdate) showNotification('Mostrando exemplos.', true); } scheduleRetry(); } finally { updateLoadingState(false); localStorage.setItem('lastTry', Date.now().toString()); } }
function updateLoadingState(isLoading) { const refreshNewsBtn = document.getElementById('refresh-news-btn'); const icon = refreshNewsBtn ? refreshNewsBtn.querySelector('i') : null; if (refreshNewsBtn && icon) { refreshNewsBtn.disabled = isLoading; icon.classList.toggle('fa-spin', isLoading); } }
function parseXmlNews(xmlDoc) { const errorNode = xmlDoc.querySelector('parsererror'); if (errorNode) { console.error("Erro XML:", errorNode.textContent); throw new Error('Erro ao analisar XML.'); } const items = Array.from(xmlDoc.querySelectorAll("item")); if (items.length === 0) { console.warn(`Nenhuma tag <item> encontrada no XML.`); return []; } return items.map(item => { let description = item.querySelector("description")?.textContent?.trim() || ''; description = description.replace("<![CDATA[", "").replace("]]>", ""); const tempDiv = document.createElement('div'); tempDiv.innerHTML = description; description = tempDiv.textContent || tempDiv.innerText || ""; return { title: item.querySelector("title")?.textContent?.trim() || 'Sem título', description: description.replace(/\s+/g, ' ').trim(), link: item.querySelector("link")?.textContent?.trim() || '#', pubDate: item.querySelector("pubDate")?.textContent?.trim() || new Date().toISOString() }; }); }
function renderNewsList(items, fromCache = false, isFallback = false) { const newsContentBox = document.querySelector('#news-widget .news-content'); if (!newsContentBox) return; const favorites = getFavorites(); let statusHtml = ''; if (isFallback && !fromCache) statusHtml = `<div class="error"><i class="fas fa-exclamation-triangle"></i> Mostrando notícias de exemplo.</div>`; newsContentBox.innerHTML = `${statusHtml}${items.length === 0 && !isFallback ? '<p style="padding:10px; text-align:center;">Nenhuma notícia.</p>' : ''}${items.map(item => { const isFavorited = favorites.some(fav => fav.link === item.link); let cleanDescription = item.description || ''; return `<div class="news-item"><button class="favorite-btn ${isFavorited ? 'favorited' : ''}" aria-label="${isFavorited ? 'Desfavoritar' : 'Favoritar'}" onclick="toggleFavorite(event, ${JSON.stringify(item).replace(/"/g, '&quot;')})"><i class="fas fa-heart"></i></button><a href="${item.link}" class="news-link" target="_blank" rel="noopener noreferrer"><div class="news-item-title">${item.title}</div>${cleanDescription ? `<div class="news-item-description">${cleanDescription}</div>` : ''}<div class="news-item-date">${formatDate(item.pubDate)}</div></a></div>`; }).join('')}${!isFallback && navigator.onLine ? `<button onclick="loadNewsWidget(true)" class="retry-btn" style="margin-top:15px; display:block; margin-left:auto; margin-right:auto;"><i class="fas fa-sync-alt"></i> Tentar atualizar</button>` : ''}`; }
function renderErrorState(error) { const newsContentBox = document.querySelector('#news-widget .news-content'); if (newsContentBox) newsContentBox.innerHTML = `<div class="error"><p><i class="fas fa-exclamation-triangle"></i> ${error.message || 'Erro.'}</p><p>Verifique sua conexão.</p><button onclick="loadNewsWidget(true)" class="retry-btn"><i class="fas fa-sync-alt"></i> Tentar novamente</button></div>`; }
function scheduleRetry() { const retryCount = parseInt(localStorage.getItem('retryCount') || '0'); const delay = Math.min(60000 * Math.pow(2, retryCount), 10 * 60 * 1000); localStorage.setItem('retryCount', (retryCount + 1).toString()); console.log(`Próxima tentativa de buscar notícias em ${delay/1000}s`); setTimeout(() => loadNewsWidget(true), delay); }
function formatDate(dateString) { if (!dateString) return ''; try { const date = new Date(dateString); if (isNaN(date.getTime())) return ''; const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }; return date.toLocaleDateString('pt-BR', options); } catch (e) { console.error("Erro ao formatar data:", dateString, e); return ''; } }
function getCachedNews() { try { const cached = localStorage.getItem(CACHE_KEY_NEWS); if (!cached) return null; const { data, timestamp } = JSON.parse(cached); if (Date.now() - timestamp < CACHE_TTL_NEWS) return data; localStorage.removeItem(CACHE_KEY_NEWS); return null; } catch (e) { localStorage.removeItem(CACHE_KEY_NEWS); return null; } }
function getCacheTimestamp() { try { const cached = localStorage.getItem(CACHE_KEY_NEWS); return cached ? JSON.parse(cached).timestamp : null; } catch { return null; } }
function cacheNews(data) { if (!data || data.length === 0) return; try { localStorage.setItem(CACHE_KEY_NEWS, JSON.stringify({ data, timestamp: Date.now() })); } catch (e) { console.error('Erro ao salvar notícias no cache:', e); } }
function getFavorites() { try { return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || []; } catch { localStorage.removeItem(FAVORITES_KEY); return []; } }
function saveFavorites(favorites) { try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch (e) { console.error('Erro ao salvar favoritos:', e); } }
function toggleFavorite(event, newsItem) { event.stopPropagation(); event.preventDefault(); let favorites = getFavorites(); const index = favorites.findIndex(item => item.link === newsItem.link); if (index === -1) { favorites.push(newsItem); showNotification('Notícia favoritada!'); } else { favorites.splice(index, 1); showNotification('Notícia desfavoritada.'); } saveFavorites(favorites); const heartButton = event.currentTarget; heartButton.classList.toggle('favorited', index === -1); heartButton.setAttribute('aria-label', index === -1 ? 'Desfavoritar' : 'Favoritar'); }
function showNotification(message, isError = false) { const existingNotification = document.querySelector('.page-notification'); if (existingNotification) existingNotification.remove(); const notification = document.createElement('div'); const notificationTypeClass = isError ? 'error' : (message.toLowerCase().includes('copiado') ? 'success' : 'success'); notification.className = `page-notification ${notificationTypeClass}`; notification.textContent = message; document.body.appendChild(notification); setTimeout(() => { notification.classList.add('show'); }, 10); setTimeout(() => { notification.classList.remove('show'); setTimeout(() => notification.remove(), 300); }, 4000); }
function toggleFullscreen() { if (!document.fullscreenElement) { const el = document.documentElement; if (el.requestFullscreen) el.requestFullscreen().catch(handleFullscreenError); else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen().catch(handleFullscreenError); } else { if (document.exitFullscreen) document.exitFullscreen().catch(handleFullscreenError); } }
function handleFullscreenError(err) { console.error(`Erro tela cheia: ${err.message}`, err); showNotification('Erro ao alternar tela cheia.', true); }
function handleFullscreenChange() { const fsBtn = document.getElementById('fullscreen-btn'); const fsExitBtn = document.getElementById('fullscreen-exit-btn'); const isFullscreen = !!document.fullscreenElement; if (fsBtn) fsBtn.style.display = isFullscreen ? 'none' : 'flex'; if (fsExitBtn) fsExitBtn.style.display = isFullscreen ? 'flex' : 'none'; }
function saveSlotAssignments() { const assignmentsToSave = {}; const draggableContainer = document.getElementById('draggable-container'); if (!draggableContainer) return; const knownBoxIds = ['box-commentary', 'box-market', 'news-widget', 'box-watchlist']; knownBoxIds.forEach(boxId => { const box = document.getElementById(boxId); if (box && box.style.gridArea && ['slotA', 'slotB', 'slotC', 'slotD'].includes(box.style.gridArea)) { assignmentsToSave[box.style.gridArea] = boxId; } }); if (Object.keys(assignmentsToSave).length === Object.keys(DEFAULT_SLOT_ASSIGNMENTS).length) { localStorage.setItem(BOX_SLOT_ASSIGNMENT_KEY, JSON.stringify(assignmentsToSave)); } else { console.warn('Tentativa de salvar atribuições de slot incompletas, mantendo o anterior ou padrão.', assignmentsToSave); } }
function applySlotAssignments(assignments) { if (!assignments) assignments = { ...DEFAULT_SLOT_ASSIGNMENTS }; const draggableContainer = document.getElementById('draggable-container'); if (!draggableContainer) return; document.querySelectorAll('.draggable-box').forEach(box => { box.style.gridArea = ''; }); for (const slotName in assignments) { const boxId = assignments[slotName]; const boxElement = document.getElementById(boxId); if (boxElement) { boxElement.style.gridArea = slotName; draggableContainer.appendChild(boxElement); } else { console.warn(`Box com ID "${boxId}" atribuído ao slot "${slotName}" não encontrado no DOM.`); } } }
function loadSlotAssignments() { let assignments = null; try { const savedAssignmentsJSON = localStorage.getItem(BOX_SLOT_ASSIGNMENT_KEY); if (savedAssignmentsJSON) { assignments = JSON.parse(savedAssignmentsJSON); const defaultKeys = Object.keys(DEFAULT_SLOT_ASSIGNMENTS); const assignmentKeys = Object.keys(assignments); const defaultValues = Object.values(DEFAULT_SLOT_ASSIGNMENTS); const assignmentValues = Object.values(assignments); const isValid = defaultKeys.length === assignmentKeys.length && defaultKeys.every(key => assignmentKeys.includes(key)) && defaultValues.every(val => assignmentValues.includes(val)) && assignmentValues.every(val => defaultValues.includes(val)); if (!isValid) { assignments = { ...DEFAULT_SLOT_ASSIGNMENTS }; localStorage.setItem(BOX_SLOT_ASSIGNMENT_KEY, JSON.stringify(assignments)); } } else { assignments = { ...DEFAULT_SLOT_ASSIGNMENTS }; localStorage.setItem(BOX_SLOT_ASSIGNMENT_KEY, JSON.stringify(assignments)); } } catch (e) { console.error("Erro ao carregar atribuições de slot:", e); assignments = { ...DEFAULT_SLOT_ASSIGNMENTS }; localStorage.setItem(BOX_SLOT_ASSIGNMENT_KEY, JSON.stringify(assignments)); } applySlotAssignments(assignments); }
function setupDragAndDrop() { loadSlotAssignments(); const boxes = document.querySelectorAll('.draggable-box'); boxes.forEach(box => { if (DEFAULT_BOX_VISIBILITY.hasOwnProperty(box.id)) { box.setAttribute('draggable', 'true'); box.style.cursor = 'grab'; box.addEventListener('dragstart', handleDragStart); box.addEventListener('dragend', handleDragEnd); box.addEventListener('dragenter', handleDragEnter); box.addEventListener('dragover', handleDragOver); box.addEventListener('dragleave', handleDragLeave); box.addEventListener('drop', handleDrop); } }); }
function handleDragStart(e) { if (!e.target.classList.contains('draggable-box')) return; const draggableBox = e.target.closest('.draggable-box'); if (!draggableBox || !DEFAULT_BOX_VISIBILITY.hasOwnProperty(draggableBox.id)) { e.preventDefault(); return; } draggingElementId = draggableBox.id; if (e.dataTransfer) { e.dataTransfer.setData('text/plain', draggingElementId); e.dataTransfer.effectAllowed = 'move'; } setTimeout(() => { const el = document.getElementById(draggingElementId); if(el) el.classList.add('dragging'); }, 0); draggableBox.style.cursor = 'grabbing'; }
function handleDragEnter(e) { e.preventDefault(); const targetBox = e.currentTarget; if (targetBox.classList.contains('draggable-box') && targetBox.id !== draggingElementId && DEFAULT_BOX_VISIBILITY.hasOwnProperty(targetBox.id)) { targetBox.classList.add('drag-over-target'); } }
function handleDragOver(e) { e.preventDefault(); }
function handleDragLeave(e) { const targetBox = e.currentTarget; if (targetBox.classList.contains('draggable-box')) { targetBox.classList.remove('drag-over-target'); } }
function handleDrop(e) { e.preventDefault(); const dropTargetBox = e.currentTarget; if (dropTargetBox.classList.contains('drag-over-target')) dropTargetBox.classList.remove('drag-over-target'); if (draggingElementId && dropTargetBox && dropTargetBox.id !== draggingElementId && dropTargetBox.classList.contains('draggable-box') && DEFAULT_BOX_VISIBILITY.hasOwnProperty(dropTargetBox.id) && DEFAULT_BOX_VISIBILITY.hasOwnProperty(draggingElementId) ) { const draggingBox = document.getElementById(draggingElementId); if (draggingBox) { const areaOfDraggingBox = draggingBox.style.gridArea; const areaOfDropTargetBox = dropTargetBox.style.gridArea; if (areaOfDraggingBox && areaOfDropTargetBox && areaOfDraggingBox !== areaOfDropTargetBox) { draggingBox.style.gridArea = areaOfDropTargetBox; dropTargetBox.style.gridArea = areaOfDraggingBox; saveSlotAssignments(); showNotification('Layout dos boxes atualizado!'); } } } }
function handleDragEnd(e) { const elDragged = document.getElementById(draggingElementId); if(elDragged && elDragged.classList.contains('draggable-box')){ elDragged.classList.remove('dragging'); elDragged.style.cursor = 'grab'; } document.querySelectorAll('.draggable-box.drag-over-target').forEach(box => box.classList.remove('drag-over-target')); draggingElementId = null; }
function setupScrollAnimations() { const boxes = document.querySelectorAll('.content-box'); const observerOptions = { root: null, rootMargin: '0px', threshold: 0.1 }; const observerCallback = (entries, observer) => { entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }}); }; const scrollObserver = new IntersectionObserver(observerCallback, observerOptions); boxes.forEach(box => scrollObserver.observe(box)); }
const debouncedUpdateScrollProgressBar = debounce(function() { const progressBar = document.getElementById('scroll-progress-bar'); if (!progressBar) return; const scrollTop = document.documentElement.scrollTop || document.body.scrollTop; const scrollHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight, document.documentElement.offsetHeight, document.body.clientHeight, document.documentElement.clientHeight) - document.documentElement.clientHeight; if (scrollHeight > 0) progressBar.style.width = `${(scrollTop / scrollHeight) * 100}%`; else progressBar.style.width = '0%'; }, 10);
const debouncedUpdateBannerOnResize = debounce(updateBanner, 250);
function toggleTheme() { document.body.classList.toggle('light-mode'); const isLightMode = document.body.classList.contains('light-mode'); localStorage.setItem('themePreference', isLightMode ? 'light' : 'dark'); const newTheme = isLightMode ? 'light' : 'dark'; const themeIcon = document.querySelector('#theme-toggle i'); if (themeIcon) { themeIcon.classList.toggle('fa-moon', !isLightMode); themeIcon.classList.toggle('fa-sun', isLightMode); } const tickerTapeSkeleton = document.querySelector('#tradingview-ticker-tape-container .tv-skeleton'); if (tickerTapeSkeleton) tickerTapeSkeleton.style.display = 'flex'; const marketOverviewSkeleton = document.querySelector('#market-overview-widget-wrapper .tv-skeleton'); if (marketOverviewSkeleton) marketOverviewSkeleton.style.display = 'flex'; if (typeof renderTickerTapeWidget === 'function') renderTickerTapeWidget(newTheme); if (typeof renderMarketOverviewWidget === 'function') { const marketBoxEl = document.getElementById('box-market'); if (marketBoxEl && window.getComputedStyle(marketBoxEl).display !== 'none') renderMarketOverviewWidget(newTheme); } const calendarOverlay = document.getElementById('economic-calendar-overlay'); if (calendarOverlay && calendarOverlay.classList.contains('is-active')) { if (typeof loadEconomicCalendarWidget === 'function') loadEconomicCalendarWidget(); } if (contentModalOverlay && contentModalOverlay.classList.contains('visible')) { const modalMarketContainer = document.getElementById('modal-market-overview-container'); const modalTVChartContainer = document.getElementById('modal-tv-chart-container'); if (modalMarketContainer && modalMarketContainer.querySelector('.tradingview-widget-container')) { if (typeof renderMarketOverviewWidget === 'function') renderMarketOverviewWidget(newTheme, 'modal-market-overview-container'); } else if (currentModalChartSymbol && modalTVChartContainer && modalTVChartContainer.querySelector('.tradingview-widget-container')) { if (typeof openChartDetailModal === 'function') openChartDetailModal(currentModalChartSymbol); } } }
function setupPullToRefresh() { const ptrIndicator = document.getElementById('pull-to-refresh-indicator'); if (!ptrIndicator) return; let startY = 0, isDragging = false; const PULL_THRESHOLD = 70, MAX_PULL_DISTANCE = 100; document.body.addEventListener('touchstart', (e) => { if (window.scrollY === 0) { startY = e.touches[0].pageY; isDragging = true; ptrIndicator.classList.add('visible'); }}, { passive: true }); document.body.addEventListener('touchmove', (e) => { if (!isDragging || window.scrollY !== 0) { if(isDragging) { isDragging = false; ptrIndicator.style.transform = `translateY(-50px)`; ptrIndicator.classList.remove('active','visible');} return; } const currentY = e.touches[0].pageY; let diffY = currentY - startY; if (diffY > 0) { if (e.cancelable) e.preventDefault(); const pullDistance = Math.min(diffY, MAX_PULL_DISTANCE); ptrIndicator.style.transform = `translateY(${Math.min(pullDistance - 50, 50)}px)`; if (diffY > PULL_THRESHOLD) { ptrIndicator.classList.add('active'); ptrIndicator.innerHTML = '<i class="fas fa-arrow-up"></i> Solte para atualizar'; } else { ptrIndicator.classList.remove('active'); ptrIndicator.innerHTML = '<i class="fas fa-arrow-down"></i> Puxe para atualizar'; }} else { ptrIndicator.style.transform = `translateY(-50px)`; } }, { passive: false }); document.body.addEventListener('touchend', (e) => { if (!isDragging) return; isDragging = false; const currentY = e.changedTouches[0].pageY; const diffY = currentY - startY; if (diffY > PULL_THRESHOLD && window.scrollY === 0) { ptrIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...'; ptrIndicator.classList.add('active'); showNotification('Atualizando dados...'); Promise.all([loadNewsWidget(true), updateCommentaryContent()]).then(() => showNotification('Dados atualizados!')).catch(err => { showNotification('Erro ao atualizar os dados.', true); console.error("Erro no pull-to-refresh:", err);}) .finally(() => { setTimeout(() => { ptrIndicator.style.transform = `translateY(-50px)`; ptrIndicator.classList.remove('active','visible'); ptrIndicator.innerHTML = '<i class="fas fa-arrow-down"></i> Puxe para atualizar'; }, 300); }); } else { ptrIndicator.style.transform = `translateY(-50px)`; ptrIndicator.classList.remove('active','visible'); ptrIndicator.innerHTML = '<i class="fas fa-arrow-down"></i> Puxe para atualizar'; } startY = 0; }); }

// =============================================
// INICIALIZAÇÃO DOMContentLoaded
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
    initializeModalElements();
    if (typeof setupBoxVisibility === 'function') setupBoxVisibility();
    if (typeof setupWatchlist === 'function') setupWatchlist();

    let currentTheme = 'dark';
    const savedTheme = localStorage.getItem('themePreference');
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    if (savedTheme === 'light' || (!savedTheme && prefersLight)) { currentTheme = 'light'; document.body.classList.add('light-mode'); }
    else { document.body.classList.remove('light-mode'); }
    const themeIcon = document.querySelector('#theme-toggle i');
    if (themeIcon) { themeIcon.classList.toggle('fa-moon', currentTheme === 'dark'); themeIcon.classList.toggle('fa-sun', currentTheme === 'light'); }

    if (typeof setupCommentaryActions === 'function') setupCommentaryActions();
    const marketBox = document.getElementById('box-market');
    if (marketBox) {
        const boxHeader = marketBox.querySelector('.box-header');
        if (boxHeader) {
            let actionsContainer = boxHeader.querySelector('.box-actions');
            if (!actionsContainer) { actionsContainer = document.createElement('div'); actionsContainer.className = 'box-actions'; boxHeader.appendChild(actionsContainer); }
            addOrUpdateModalButton(marketBox, actionsContainer, 'expand-market-btn', 'fa-expand-arrows-alt');
        }
    }
    const newsBox = document.getElementById('news-widget');
    if (newsBox) {
        const boxHeader = newsBox.querySelector('.box-header');
        if (boxHeader) {
            const actionsContainer = boxHeader.querySelector('.box-actions');
            if (actionsContainer) {addOrUpdateModalButton(newsBox, actionsContainer, 'expand-news-btn', 'fa-expand-arrows-alt');
            } else { const newActionsContainer = document.createElement('div'); newActionsContainer.className = 'box-actions'; boxHeader.appendChild(newActionsContainer); addOrUpdateModalButton(newsBox, newActionsContainer, 'expand-news-btn', 'fa-expand-arrows-alt');}
        }
    }

    if (typeof loadBannerPhrases === 'function') await loadBannerPhrases();
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            showNotification('Atualizando todos os dados...');
            Promise.all([ updateDateTime(), loadNewsWidget(true), updateCommentaryContent() ])
            .then(() => showNotification('Todos os dados foram atualizados!'))
            .catch(err => { showNotification('Erro durante a atualização geral.', true); console.error("Erro na atualização geral:", err); });
        });
    }
    const refreshNewsBtn = document.getElementById('refresh-news-btn');
    if (refreshNewsBtn && typeof loadNewsWidget === 'function') { refreshNewsBtn.addEventListener('click', () => loadNewsWidget(true)); }
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn && typeof toggleTheme === 'function') { themeToggleBtn.addEventListener('click', toggleTheme); }
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn && typeof toggleFullscreen === 'function') { fullscreenBtn.addEventListener('click', toggleFullscreen); }
    const fullscreenExitBtn = document.getElementById('fullscreen-exit-btn');
    if (fullscreenExitBtn && typeof toggleFullscreen === 'function') { fullscreenExitBtn.addEventListener('click', toggleFullscreen); }
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(event => document.addEventListener(event, typeof handleFullscreenChange === 'function' ? handleFullscreenChange : () => {}));

    document.getElementById('analises-btn')?.addEventListener('click', () => window.location.href = 'analises.html');
    document.getElementById('indicadores-btn')?.addEventListener('click', () => window.location.href = 'indicadores.html');
    document.getElementById('calculadoras-btn')?.addEventListener('click', () => window.location.href = 'calculadoras/calculadoras.html');
    document.getElementById('terminal-btn')?.addEventListener('click', () => window.location.href = 'terminal-news.html');

    const calendarToggleBtn = document.getElementById('economic-calendar-toggle-btn');
    const calendarOverlay = document.getElementById('economic-calendar-overlay');
    const calendarContentPanel = document.getElementById('economic-calendar-content-panel');
    const closeCalendarBtn = document.getElementById('close-calendar-btn');
    if (calendarToggleBtn && calendarOverlay && calendarContentPanel && closeCalendarBtn) {
        calendarToggleBtn.addEventListener('click', () => {
            calendarOverlay.classList.add('is-active'); calendarContentPanel.classList.add('is-visible');
            if (typeof loadEconomicCalendarWidget === 'function') loadEconomicCalendarWidget();
        });
        const closeCalendarOverlay = () => { calendarContentPanel.classList.remove('is-visible'); calendarOverlay.classList.remove('is-active'); };
        closeCalendarBtn.addEventListener('click', closeCalendarOverlay);
        calendarOverlay.addEventListener('click', (event) => { if (event.target === calendarOverlay) closeCalendarOverlay(); });
    }

    // Spotify Player Toggle
    const spotifyBtn = document.getElementById('spotify-btn');
    const spotifyPlayer = document.getElementById('spotify-player-container');
    const closeSpotifyBtn = document.getElementById('close-spotify-btn');

    if (spotifyBtn && spotifyPlayer && closeSpotifyBtn) {
        spotifyBtn.addEventListener('click', () => {
            spotifyPlayer.style.display = 'block'; // Or 'flex' if you prefer, though 'block' is fine for a positioned element
            setTimeout(() => { // Allows the display property to take effect before adding the class for transition
                spotifyPlayer.classList.add('visible');
            }, 10);
        });

        closeSpotifyBtn.addEventListener('click', () => {
            spotifyPlayer.classList.remove('visible');
            setTimeout(() => { // Wait for the transition to finish before setting display to none
                spotifyPlayer.style.display = 'none';
            }, 300); // Should match your CSS transition duration
        });
    }
    // End Spotify Player Toggle

    window.addEventListener('resize', debouncedUpdateBannerOnResize);
    window.addEventListener('scroll', debouncedUpdateScrollProgressBar);
    debouncedUpdateScrollProgressBar();
    if (typeof updateDateTime === 'function') { updateDateTime(); setInterval(updateDateTime, 30000);  }
    if (typeof loadNewsWidget === 'function') loadNewsWidget();
    if (typeof updateCommentaryContent === 'function') { updateCommentaryContent(); setInterval(updateCommentaryContent, COMMENTARY_UPDATE_INTERVAL); }
    if (typeof updateBanner === 'function') { setInterval(updateBanner, 30 * 1000); }
    if (typeof setupDragAndDrop === 'function') setupDragAndDrop();
    if (typeof setupScrollAnimations === 'function') setupScrollAnimations();
    if (typeof setupPullToRefresh === 'function') setupPullToRefresh();
    if (typeof renderTickerTapeWidget === 'function') renderTickerTapeWidget(currentTheme);
    if (typeof renderMarketOverviewWidget === 'function') {
        const marketBoxEl = document.getElementById('box-market');
        // Verifica se o box está visível antes de renderizar o widget inicialmente
        if (marketBoxEl && window.getComputedStyle(marketBoxEl).display !== 'none') {
             renderMarketOverviewWidget(currentTheme);
        }
    }

    setTimeout(() => { if (!document.querySelector('.page-notification') && typeof showNotification === "function") { showNotification('Bem-vindo ao Mercado Macro!'); } }, 1500);
});

if (typeof toggleFavorite === "function") { window.toggleFavorite = toggleFavorite; }
if (typeof loadNewsWidget === "function") { window.loadNewsWidget = loadNewsWidget; }
