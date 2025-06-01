// =============================================
// CONFIGURAÇÕES GLOBAIS
// =============================================
const CACHE_KEY_NEWS = 'newsCache_v6';
const CACHE_TTL_NEWS = 15 * 60 * 1000;
const FAVORITES_KEY = 'favorites_v2';
const BOX_ORDER_KEY = 'boxOrder_v2';
const GOOGLE_DOC_ID = '1IYFmfdajMtuquyfen070HRKfNjflwj-x9VvubEgs1XM';
const GOOGLE_API_KEY = 'AIzaSyBuvcaEcTBr0EIZZZ45h8JilbcWytiyUWo';
const COMMENTARY_UPDATE_INTERVAL = 5 * 60 * 1000;
let commentaryLastUpdateTimestamp = null; // Mantido para lógica interna, se necessário

let BANNER_PHRASES = [];

// =============================================
// FUNÇÃO DEBOUNCE
// =============================================
function debounce(func, wait, immediate) {
    let timeout;
    return function() {
        const context = this, args = arguments;
        const later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
};

// =============================================
// FUNÇÃO PARA FORMATAR TEMPO RELATIVO
// =============================================
function formatTimeSince(timestamp) {
    if (!timestamp) return '';
    const now = new Date();
    const secondsPast = (now.getTime() - timestamp) / 1000;

    if (secondsPast < 60) {
        return 'há menos de um minuto';
    }
    if (secondsPast < 3600) {
        const minutes = Math.round(secondsPast / 60);
        return `há ${minutes} min${minutes > 1 ? 's' : ''}`;
    }
    if (secondsPast <= 86400) {
        const hours = Math.round(secondsPast / 3600);
        return `há ${hours} hora${hours > 1 ? 's' : ''}`;
    }
    const date = new Date(timestamp);
    return `em ${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'})}`;
}


// =============================================
// FUNÇÃO PARA ATUALIZAR DATA E HORA
// =============================================
function updateDateTime() {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
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
        footerElement.textContent = `Fonte: Dados atualizados em ${formattedDate} • By Anderson Danilo`;
    }
}


// =============================================
// CÓDIGO DAS NOTÍCIAS
// =============================================
const RSS_SOURCES = [
    {
        name: 'RSS2JSON',
        buildUrl: feedUrl => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`,
        processor: data => {
            if (!data.items) throw new Error('Formato RSS2JSON inválido');
            return data.items.map(item => ({
                title: item.title, description: item.description,
                link: item.link, pubDate: item.pubDate
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
    { title: "Mercado aguarda decisão do Fed", description: "Decisão sobre juros nos EUA é o foco.", link: "#", pubDate: new Date().toISOString() },
    { title: "Ibovespa em alta com commodities", description: "Índice brasileiro acompanha otimismo externo.", link: "#", pubDate: new Date().toISOString() },
    { title: "Dólar opera em queda", description: "Moeda americana perde força no cenário global.", link: "#", pubDate: new Date().toISOString() }
];

// =============================================
// FUNÇÕES PARA RENDERIZAR WIDGETS
// =============================================
function renderTickerTapeWidget(theme) {
    const container = document.getElementById('tradingview-ticker-tape-container');
    if (!container) return;
    const skeleton = container.querySelector('.tv-skeleton');
    if (skeleton) skeleton.style.display = 'none';

    const widgetContent = container.querySelector('.tradingview-widget-container');
    if(widgetContent) widgetContent.remove();
    else { // Se não houver widget anterior, limpa o container (exceto o skeleton se ele for filho direto)
        Array.from(container.childNodes).forEach(node => {
            if (!node.classList || !node.classList.contains('tv-skeleton')) {
                container.removeChild(node);
            }
        });
    }


    const config = {
        "symbols": [
            {"proName": "FOREXCOM:SPXUSD", "title": "S&P 500"}, {"description": "IBOVESPA", "proName": "BMFBOVESPA:IBOV"},
            {"description": "NASDAQ 100","proName": "FOREXCOM:NSXUSD"}, {"description": "USD/BRL","proName": "FX_IDC:USDBRL"},
            {"description": "EUR/USD","proName": "FX:EURUSD"}, {"description": "BITCOIN","proName": "BITSTAMP:BTCUSD"},
            {"description": "PETRÓLEO BRENT","proName": "TVC:UKOIL"}, {"description": "OURO","proName": "OANDA:XAUUSD"}
        ],
        "showSymbolLogo": true, "isTransparent": true, "displayMode": "adaptive",
        "colorTheme": theme, "locale": "br"
    };
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
    script.async = true;
    script.text = JSON.stringify(config);
    container.appendChild(script);
}

function renderMarketOverviewWidget(theme) {
    const container = document.getElementById('market-overview-widget-wrapper');
    if (!container) return;
    const skeleton = container.querySelector('.tv-skeleton');
    if (skeleton) skeleton.style.display = 'none';

    const widgetContent = container.querySelector('.tradingview-widget-container');
    if(widgetContent) widgetContent.remove();
    else {
        Array.from(container.childNodes).forEach(node => {
            if (!node.classList || !node.classList.contains('tv-skeleton')) {
                container.removeChild(node);
            }
        });
    }

    const tvContainer = document.createElement('div');
    tvContainer.className = 'tradingview-widget-container';
    tvContainer.style.width = '100%'; tvContainer.style.height = '100%';
    const config = {
        "colorTheme": theme, "dateRange": "12M", "showChart": true, "locale": "br",
        "largeChartUrl": "", "isTransparent": true, "showSymbolLogo": true,
        "showFloatingTooltip": false, "width": "100%", "height": "500",
        "plotLineColorGrowing": theme === 'light' ? "rgba(0, 123, 255, 1)" : "rgba(0, 209, 128, 1)",
        "plotLineColorFalling": theme === 'light' ? "rgba(220, 53, 69, 1)" : "rgba(248, 81, 73, 1)",
        "gridLineColor": "rgba(240, 243, 250, 0)",
        "scaleFontColor": theme === 'light' ? "rgba(51, 51, 51, 0.7)" : "rgba(201, 209, 217, 0.7)",
        "belowLineFillColorGrowing": theme === 'light' ? "rgba(0, 123, 255, 0.12)" : "rgba(0, 209, 128, 0.12)",
        "belowLineFillColorFalling": theme === 'light' ? "rgba(220, 53, 69, 0.12)" : "rgba(248, 81, 73, 0.12)",
        "belowLineFillColorGrowingBottom": theme === 'light' ? "rgba(0, 123, 255, 0)" : "rgba(0, 209, 128, 0)",
        "belowLineFillColorFallingBottom": theme === 'light' ? "rgba(220, 53, 69, 0)" : "rgba(248, 81, 73, 0)",
        "symbolActiveColor": theme === 'light' ? "rgba(0, 123, 255, 0.12)" : "rgba(0, 209, 128, 0.12)",
        "tabs": [
            { "title": "Indices", "symbols": [ {"s": "FOREXCOM:SPXUSD", "d": "S&P 500"}, {"s": "FOREXCOM:NSXUSD", "d": "NASDAQ 100"}, {"s": "FOREXCOM:DJI", "d": "Dow Jones"}, {"s": "BMFBOVESPA:IBOV", "d":"IBOVESPA"}, {"s": "INDEX:DEU40", "d": "DAX"}, {"s": "FOREXCOM:UKXGBP", "d": "FTSE 100"} ], "originalTitle": "Indices" },
            { "title": "Moedas", "symbols": [ {"s": "FX_IDC:USDBRL", "d":"USD/BRL"}, {"s": "FX:EURUSD", "d": "EUR/USD"}, {"s": "FX:GBPUSD", "d": "GBP/USD"}, {"s": "FX:USDJPY", "d": "USD/JPY"}, {"s": "FX:AUDUSD", "d": "AUD/USD"}, {"s": "FX:USDCAD", "d": "USD/CAD"} ], "originalTitle": "Forex" },
            { "title": "Commodities", "symbols": [ {"s": "TVC:UKOIL", "d": "Petróleo Brent"}, {"s": "TVC:USOIL", "d": "Petróleo WTI"}, {"s": "OANDA:XAUUSD", "d": "Ouro"}, {"s": "TVC:SILVER", "d": "Prata"}, {"s": "COMEX:HG1!", "d": "Cobre"}], "originalTitle": "Commodities" },
            { "title": "Cripto", "symbols": [ {"s": "BINANCE:BTCUSDT", "d": "Bitcoin"}, {"s": "BINANCE:ETHUSDT", "d": "Ethereum"}, {"s": "BINANCE:SOLUSDT", "d": "Solana"} ], "originalTitle": "Crypto" }
        ]
    };
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js';
    script.async = true;
    script.text = JSON.stringify(config);
    tvContainer.appendChild(script);
    container.appendChild(tvContainer);
}


function loadEconomicCalendarWidget() {
    const widgetContainer = document.getElementById('economicCalendarWidget');
    if (!widgetContainer) { console.error('Contêiner do Calendário Econômico não encontrado.'); return; }
    widgetContainer.innerHTML = '';
    const currentThemeIsLight = document.body.classList.contains('light-mode');
    const widgetTheme = currentThemeIsLight ? 0 : 1;
    const configJsonString = JSON.stringify({
        "width": "100%", "height": "100%", "mode": "1",
        "theme": widgetTheme, "lang": "pt"
    });
    const scriptTag = document.createElement('script');
    scriptTag.async = true; scriptTag.type = 'text/javascript';
    scriptTag.setAttribute('data-type', 'calendar-widget');
    scriptTag.text = configJsonString;
    scriptTag.src = 'https://www.tradays.com/c/js/widgets/calendar/widget.js?v=13';
    widgetContainer.appendChild(scriptTag);
}

// =============================================
// FUNÇÕES DO BANNER E CONTEÚDO
// =============================================

async function loadBannerPhrases() {
    try {
        const response = await fetch('data/banner-phrases.json');
        if (!response.ok) throw new Error(`Falha ao carregar frases: ${response.status}`);
        BANNER_PHRASES = (await response.json()).phrases;
        if (!BANNER_PHRASES || BANNER_PHRASES.length === 0) {
            console.warn('Nenhuma frase encontrada no arquivo de banner.');
            BANNER_PHRASES = ["Acompanhe as últimas movimentações do mercado financeiro"];
        }
    } catch (error) {
        console.error('Erro ao carregar frases do banner:', error);
        BANNER_PHRASES = ["Bem-vindo ao Mercado Macro"];
    }
    updateBanner();
}

function updateBanner() {
    const banner = document.getElementById('random-banner');
    const bannerTextEl = banner ? banner.querySelector('.banner-text') : null;
    if (bannerTextEl && BANNER_PHRASES && BANNER_PHRASES.length > 0) {
        const randomPhrase = BANNER_PHRASES[Math.floor(Math.random() * BANNER_PHRASES.length)];
        bannerTextEl.textContent = randomPhrase;

        bannerTextEl.style.animation = 'none';
        void bannerTextEl.offsetWidth;

        if (window.innerWidth <= 768) {
            bannerTextEl.style.animation = 'scrollBanner 15s linear infinite';
        } else {
            bannerTextEl.style.animation = '';
        }
    } else if (bannerTextEl) {
        bannerTextEl.textContent = "Notícias e Análises Financeiras";
    }
}

async function fetchGoogleDocContent() {
    const url = `https://www.googleapis.com/drive/v3/files/${GOOGLE_DOC_ID}/export?mimeType=text/plain&key=${GOOGLE_API_KEY}`;
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Google Docs API Error ${response.status}: ${response.statusText}`, errorBody);
            throw new Error(`Erro ${response.status} ao buscar Google Doc.`);
        }
        return await response.text();
    } catch (error) {
        console.error('Falha na requisição ao Google Docs:', error);
        if (error.name !== 'AbortError') {
            throw new Error('Não foi possível carregar a análise do Google Docs.');
        }
        throw error;
    }
}

function updateCommentary(content) {
    const commentaryContentEl = document.getElementById('commentary-content');
    if (!commentaryContentEl) return;
    let formattedContent = content.replace(/\r\n/g, '\n').split('\n').map(line => {
        line = line.trim();
        if (/^\s*$/.test(line)) return null;
        if (/^([📌☐✔☑️✅]\s*.+)/.test(line)) return `<div class="commentary-highlight">${line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</div>`;
        line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        if (/^[•*-]\s*(.+)/.test(line)) return `<li>${line.substring(line.search(/\S/)).replace(/^[•*-]\s*/, '')}</li>`;
        return `<p class="commentary-paragraph">${line}</p>`;
    }).filter(line => line !== null).join('');
    formattedContent = formattedContent.replace(/(<li>.*?<\/li>)+/sg, '<ul>$&</ul>');
    commentaryContentEl.innerHTML = formattedContent || '<p>Nenhuma análise disponível.</p>';
}

async function updateCommentaryContent() {
    const commentaryContentEl = document.getElementById('commentary-content');
    // const lastUpdatedEl = document.getElementById('commentary-last-updated'); // REMOVIDO
    if (!commentaryContentEl) return;

    commentaryContentEl.innerHTML = `<div class="loading-commentary"><span class="loading-small"></span> Carregando análise...</div>`;
    // if (lastUpdatedEl) lastUpdatedEl.textContent = 'atualizando...'; // REMOVIDO

    try {
        const content = await fetchGoogleDocContent();
        updateCommentary(content);
        commentaryLastUpdateTimestamp = Date.now();
        // if (lastUpdatedEl) lastUpdatedEl.textContent = formatTimeSince(commentaryLastUpdateTimestamp); // REMOVIDO
        return true;
    } catch (error) {
        console.error('Falha ao atualizar comentário:', error);
        commentaryContentEl.innerHTML = `<div class="error-commentary"><i class="fas fa-exclamation-triangle"></i> ${error.message || 'Falha ao carregar.'}</div>`;
        // if (lastUpdatedEl && commentaryLastUpdateTimestamp) lastUpdatedEl.textContent = `Falha. Última: ${formatTimeSince(commentaryLastUpdateTimestamp)}`; // REMOVIDO
        // else if (lastUpdatedEl) lastUpdatedEl.textContent = 'Falha ao atualizar'; // REMOVIDO
        return false;
    }
}

async function fetchNews() {
    let lastError = null;
    for (const feedUrl of RSS_FEEDS) {
        for (const source of RSS_SOURCES) {
            try {
                const url = source.buildUrl(feedUrl);
                const response = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' }, signal: AbortSignal.timeout(8000) });
                if (!response.ok) throw new Error(`HTTP ${response.status} em ${source.name} para ${feedUrl}`);

                let dataToProcess;
                if (source.name === 'AllOrigins') {
                    dataToProcess = await response.text();
                } else {
                    dataToProcess = await response.json();
                }

                const newsItems = source.processor(dataToProcess);
                if (newsItems && newsItems.length > 0) return newsItems;

            } catch (error) {
                lastError = error;
                console.warn(`Falha com ${source.name} para ${feedUrl}:`, error);
                continue;
            }
        }
    }
    console.error("Todas as fontes de notícias falharam. Último erro:", lastError);
    throw lastError || new Error('Todas as fontes de notícias falharam.');
}

async function loadNewsWidget(forceUpdate = false) {
    const newsContentBox = document.querySelector('#news-widget .news-content');
    // const lastUpdatedEl = document.getElementById('news-last-updated'); // REMOVIDO
    if (!newsContentBox) return;

    updateLoadingState(true);
    // if(lastUpdatedEl) lastUpdatedEl.textContent = 'atualizando...'; // REMOVIDO

    if (!forceUpdate) {
        const cachedData = getCachedNews();
        if (cachedData) {
            renderNewsList(cachedData, true);
            // if(lastUpdatedEl) lastUpdatedEl.textContent = `Cache: ${formatTimeSince(getCacheTimestamp())}`; // REMOVIDO
            updateLoadingState(false);
            return;
        }
    }
    if (!navigator.onLine) {
        showNotification('Sem conexão com a internet.', true);
        const cachedData = getCachedNews();
        if (cachedData) {
            renderNewsList(cachedData, true);
            // if(lastUpdatedEl) lastUpdatedEl.textContent = `Offline. Cache: ${formatTimeSince(getCacheTimestamp())}`; // REMOVIDO
        } else {
            newsContentBox.innerHTML = '<div class="error"><i class="fas fa-wifi"></i> Sem conexão e sem notícias no cache.</div>';
            // if(lastUpdatedEl) lastUpdatedEl.textContent = 'Offline. Sem cache.'; // REMOVIDO
        }
        updateLoadingState(false);
        return;
    }
    try {
        const newsItems = await fetchNews();
        if (newsItems.length > 0) {
            cacheNews(newsItems);
            renderNewsList(newsItems);
            // if(lastUpdatedEl) lastUpdatedEl.textContent = formatTimeSince(Date.now()); // REMOVIDO
            if (forceUpdate) showNotification('Notícias atualizadas!');
        } else {
            renderNewsList([], false, false);
            // if(lastUpdatedEl) lastUpdatedEl.textContent = 'Nenhuma notícia nova.'; // REMOVIDO
            if (forceUpdate) showNotification('Nenhuma notícia nova.', false);
        }
        localStorage.setItem('retryCount', '0');
    } catch (fetchError) {
        console.error('Falha ao buscar notícias:', fetchError);
        if (forceUpdate) showNotification(`Falha na atualização: ${fetchError.message}.`, true);
        const cachedData = getCachedNews();
        if (cachedData) {
            renderNewsList(cachedData, true);
            // if(lastUpdatedEl) lastUpdatedEl.textContent = `Falha. Cache: ${formatTimeSince(getCacheTimestamp())}`; // REMOVIDO
            if (forceUpdate) showNotification('Mostrando notícias do cache.', false);
        } else {
            renderNewsList(FALLBACK_NEWS, false, true);
            // if(lastUpdatedEl) lastUpdatedEl.textContent = 'Falha. Mostrando exemplos.'; // REMOVIDO
            if (forceUpdate) showNotification('Mostrando exemplos.', true);
        }
        scheduleRetry();
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
}

function parseXmlNews(xmlDoc) {
    const errorNode = xmlDoc.querySelector('parsererror');
    if (errorNode) { console.error("Erro XML:", errorNode.textContent); throw new Error('Erro ao analisar XML.'); }
    const items = Array.from(xmlDoc.querySelectorAll("item"));
    if (items.length === 0) { console.warn(`Nenhuma tag <item> encontrada.`); return []; }
    return items.map(item => {
        let description = item.querySelector("description")?.textContent?.trim() || '';
        description = description.replace("<![CDATA[", "").replace("]]>", "");
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = description;
        description = tempDiv.textContent || tempDiv.innerText || "";

        return {
            title: item.querySelector("title")?.textContent?.trim() || 'Sem título',
            description: description.replace(/\s+/g, ' ').trim(),
            link: item.querySelector("link")?.textContent?.trim() || '#',
            pubDate: item.querySelector("pubDate")?.textContent?.trim() || new Date().toISOString()
        };
    });
}

function renderNewsList(items, fromCache = false, isFallback = false) {
    const newsContentBox = document.querySelector('#news-widget .news-content');
    if (!newsContentBox) return;
    const favorites = getFavorites(); let statusHtml = '';
    if (isFallback && !fromCache) statusHtml = `<div class="error"><i class="fas fa-exclamation-triangle"></i> Mostrando notícias de exemplo.</div>`;
    // else if (fromCache) { // Removido status de cache daqui pois foi removido dos boxes
        // statusHtml = `<div class="news-status"><span>Cache.</span><button onclick="loadNewsWidget(true)" class="retry-btn" style="margin-left:auto; padding: 4px 8px; font-size: 11px;">Atualizar</button></div>`;
    // }
    newsContentBox.innerHTML = `${statusHtml}${items.length === 0 && !isFallback ? '<p style="padding:10px; text-align:center;">Nenhuma notícia.</p>' : ''}${items.map(item => {
        const isFavorited = favorites.some(fav => fav.link === item.link);
        let cleanDescription = item.description || '';
        return `<div class="news-item"><button class="favorite-btn ${isFavorited ? 'favorited' : ''}" aria-label="${isFavorited ? 'Desfavoritar' : 'Favoritar'}" onclick="toggleFavorite(event, ${JSON.stringify(item).replace(/"/g, '&quot;')})"><i class="fas fa-heart"></i></button><a href="${item.link}" class="news-link" target="_blank" rel="noopener noreferrer"><div class="news-item-title">${item.title}</div>${cleanDescription ? `<div class="news-item-description">${cleanDescription.substring(0,180)}${cleanDescription.length > 180 ? '...' : ''}</div>` : ''}<div class="news-item-date">${formatDate(item.pubDate)}</div></a></div>`;
    }).join('')}${!isFallback && navigator.onLine ? `<button onclick="loadNewsWidget(true)" class="retry-btn" style="margin-top:15px; display:block; margin-left:auto; margin-right:auto;"><i class="fas fa-sync-alt"></i> Tentar atualizar</button>` : ''}`;
}

function renderErrorState(error) {
    const newsContentBox = document.querySelector('#news-widget .news-content');
    if (newsContentBox) newsContentBox.innerHTML = `<div class="error"><p><i class="fas fa-exclamation-triangle"></i> ${error.message || 'Erro.'}</p><p>Verifique sua conexão.</p><button onclick="loadNewsWidget(true)" class="retry-btn"><i class="fas fa-sync-alt"></i> Tentar novamente</button></div>`;
}
function scheduleRetry() {
    const retryCount = parseInt(localStorage.getItem('retryCount') || '0');
    const delay = Math.min(60000 * Math.pow(2, retryCount), 10 * 60 * 1000);
    localStorage.setItem('retryCount', (retryCount + 1).toString());
    console.log(`Nova tentativa em ${delay/1000}s`); setTimeout(() => loadNewsWidget(true), delay);
}
function formatDate(dateString) {
    if (!dateString) return ''; try { const date = new Date(dateString); if (isNaN(date.getTime())) return ''; return date.toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); } catch (e) { console.error("Erro data:", dateString, e); return ''; }
}
function getCachedNews() {
    try { const cached = localStorage.getItem(CACHE_KEY_NEWS); if (!cached) return null; const { data, timestamp } = JSON.parse(cached); if (Date.now() - timestamp < CACHE_TTL_NEWS) return data; localStorage.removeItem(CACHE_KEY_NEWS); return null; } catch (e) { localStorage.removeItem(CACHE_KEY_NEWS); return null; }
}
function getCacheTimestamp() {
    try { const cached = localStorage.getItem(CACHE_KEY_NEWS); return cached ? JSON.parse(cached).timestamp : null; } catch { return null; }
}
function cacheNews(data) {
    if (!data || data.length === 0) return; try { localStorage.setItem(CACHE_KEY_NEWS, JSON.stringify({ data, timestamp: Date.now() })); } catch (e) { console.error('Erro cache:', e); }
}
function getFavorites() {
    try { return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || []; } catch { localStorage.removeItem(FAVORITES_KEY); return []; }
}
function saveFavorites(favorites) {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch (e) { console.error('Erro favoritos:', e); }
}

function toggleFavorite(event, newsItem) {
    event.stopPropagation(); event.preventDefault(); let favorites = getFavorites();
    const index = favorites.findIndex(item => item.link === newsItem.link);
    if (index === -1) { favorites.push(newsItem); showNotification('Notícia favoritada!'); }
    else { favorites.splice(index, 1); showNotification('Notícia desfavoritada.'); }
    saveFavorites(favorites); const heartButton = event.currentTarget;
    heartButton.classList.toggle('favorited', index === -1);
    heartButton.setAttribute('aria-label', index === -1 ? 'Desfavoritar' : 'Favoritar');
}

function showNotification(message, isError = false) {
    const existingNotification = document.querySelector('.page-notification');
    if (existingNotification) existingNotification.remove();
    const notification = document.createElement('div');
    const notificationTypeClass = isError ? 'error' : (message.toLowerCase().includes('copiado') ? 'success' : 'success');
    notification.className = `page-notification ${notificationTypeClass}`;
    notification.textContent = message; document.body.appendChild(notification);
    setTimeout(() => { notification.classList.add('show'); }, 10);
    setTimeout(() => { notification.classList.remove('show'); setTimeout(() => notification.remove(), 300); }, 4000);
}

function toggleFullscreen() {
    if (!document.fullscreenElement) { const el = document.documentElement; if (el.requestFullscreen) el.requestFullscreen().catch(handleFullscreenError); else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen().catch(handleFullscreenError); } else { if (document.exitFullscreen) document.exitFullscreen().catch(handleFullscreenError); }
}
function handleFullscreenError(err) {
    console.error(`Erro tela cheia: ${err.message}`, err); showNotification('Erro ao alternar tela cheia.', true);
}
function handleFullscreenChange() {
    const fsBtn = document.getElementById('fullscreen-btn'); const fsExitBtn = document.getElementById('fullscreen-exit-btn');
    const isFullscreen = !!document.fullscreenElement;
    if (fsBtn) fsBtn.style.display = isFullscreen ? 'none' : 'flex';
    if (fsExitBtn) fsExitBtn.style.display = isFullscreen ? 'flex' : 'none';
}

function setupCommentaryActions() {
    const commentaryBox = document.getElementById('box-commentary'); if (!commentaryBox) return;
    const boxHeader = commentaryBox.querySelector('.box-header'); if (!boxHeader) return;
    let actionsContainer = boxHeader.querySelector('.box-actions');
    if (!actionsContainer) { actionsContainer = document.createElement('div'); actionsContainer.className = 'box-actions'; boxHeader.appendChild(actionsContainer); }

    if (!actionsContainer.querySelector('#expand-commentary-btn')) {
        const expandBtn = document.createElement('button'); expandBtn.id = 'expand-commentary-btn'; expandBtn.className = 'expand-btn';
        expandBtn.setAttribute('aria-label', 'Expandir'); expandBtn.innerHTML = '<i class="fas fa-expand-alt"></i>';
        actionsContainer.appendChild(expandBtn);
        expandBtn.addEventListener('click', function() { commentaryBox.classList.toggle('expanded'); const icon = this.querySelector('i'); icon.classList.toggle('fa-expand-alt', !commentaryBox.classList.contains('expanded')); icon.classList.toggle('fa-compress-alt', commentaryBox.classList.contains('expanded')); expandBtn.setAttribute('aria-label', commentaryBox.classList.contains('expanded') ? 'Recolher' : 'Expandir'); });
    }
    if (!actionsContainer.querySelector('#share-commentary-btn')) {
        const shareBtn = document.createElement('button'); shareBtn.id = 'share-commentary-btn'; shareBtn.className = 'expand-btn';
        shareBtn.setAttribute('aria-label', 'Compartilhar'); shareBtn.innerHTML = '<i class="fas fa-share-alt"></i>';
        actionsContainer.appendChild(shareBtn);
        shareBtn.addEventListener('click', async function() {
            const commentaryContentEl = document.getElementById('commentary-content');
            if (!commentaryContentEl) { showNotification('Conteúdo não encontrado.', true); return; }
            let textToShare = "";
            commentaryContentEl.querySelectorAll('p, .commentary-highlight, li').forEach(el => { textToShare += (el.tagName === 'LI' ? "• " : "") + el.textContent.trim() + (el.tagName === 'LI' ? "\n" : "\n\n"); });
            textToShare = textToShare.replace(/\n\s*\n/g, '\n\n').trim();
            if (!textToShare) { showNotification('Não há conteúdo para compartilhar.', true); return; }
            const shareData = { title: 'Radar Financeiro - Análise', text: textToShare };
            try {
                if (navigator.share && navigator.canShare && navigator.canShare(shareData)) { await navigator.share(shareData); showNotification('Conteúdo compartilhado!'); }
                else if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(textToShare); showNotification('Texto da análise copiado!'); }
                else { throw new Error('Compartilhamento não suportado.'); }
            } catch (err) { console.error('Erro ao compartilhar:', err); if (err.name !== 'AbortError') { showNotification(err.message.includes('não suportado') ? err.message : 'Falha ao compartilhar.', true); } }
         });
    }
}

function saveBoxOrder() {
    const container = document.getElementById('draggable-container'); if (!container) return;
    const boxes = Array.from(container.children).filter(c => c.classList.contains('draggable-box')).map(b => b.id);
    if (boxes.length > 0) localStorage.setItem(BOX_ORDER_KEY, JSON.stringify(boxes));
}
function loadBoxOrder() {
    const container = document.getElementById('draggable-container'); if (!container) return;
    try { const savedOrderJSON = localStorage.getItem(BOX_ORDER_KEY); if (!savedOrderJSON) return;
        const savedOrder = JSON.parse(savedOrderJSON);
        if (Array.isArray(savedOrder) && savedOrder.length > 0) {
            const currentBoxes = new Map(Array.from(container.querySelectorAll('.draggable-box')).map(b => [b.id, b]));
            savedOrder.forEach(id => { if (currentBoxes.has(id)) container.appendChild(currentBoxes.get(id)); });
        }
    } catch (e) { console.error("Erro ordem:", e); localStorage.removeItem(BOX_ORDER_KEY); }
}
function setupDragAndDrop() {
    const container = document.getElementById('draggable-container'); if (!container) return; loadBoxOrder();
    const boxes = container.querySelectorAll('.draggable-box');
    boxes.forEach(box => { box.removeEventListener('dragstart', handleDragStart); box.removeEventListener('dragend', handleDragEnd); box.addEventListener('dragstart', handleDragStart); box.addEventListener('dragend', handleDragEnd); });
    container.removeEventListener('dragover', handleDragOver); container.addEventListener('dragover', handleDragOver);
}
function handleDragStart(e) {
    if (e.target.classList.contains('draggable-box')) { if (e.dataTransfer) { e.dataTransfer.setData('text/plain', e.target.id); e.dataTransfer.effectAllowed = 'move'; } setTimeout(() => e.target.classList.add('dragging'), 0); }
}
function handleDragEnd(e) {
    if (e.target.classList.contains('draggable-box')) { e.target.classList.remove('dragging'); saveBoxOrder(); showNotification('Layout dos boxes salvo!'); }
}
function handleDragOver(e) {
    e.preventDefault(); const container = e.currentTarget; const draggingBox = container.querySelector('.draggable-box.dragging'); if (!draggingBox) return;
    const afterElement = getDragAfterElement(container, e.clientY);
    if (afterElement == null) container.appendChild(draggingBox); else container.insertBefore(draggingBox, afterElement);
}
function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.draggable-box:not(.dragging)')];
    return draggableElements.reduce((closest, child) => { const box = child.getBoundingClientRect(); const offset = y - box.top - box.height / 2; if (offset < 0 && offset > closest.offset) return { offset: offset, element: child }; else return closest; }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function setupScrollAnimations() {
    const boxes = document.querySelectorAll('.content-box');
    const observerOptions = { root: null, rootMargin: '0px', threshold: 0.1 };
    const observerCallback = (entries, observer) => { entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }}); };
    const scrollObserver = new IntersectionObserver(observerCallback, observerOptions);
    boxes.forEach(box => scrollObserver.observe(box));
}
const debouncedUpdateScrollProgressBar = debounce(function() {
    const progressBar = document.getElementById('scroll-progress-bar'); if (!progressBar) return;
    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    const scrollHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight, document.documentElement.offsetHeight, document.body.clientHeight, document.documentElement.clientHeight) - document.documentElement.clientHeight;
    if (scrollHeight > 0) progressBar.style.width = `${(scrollTop / scrollHeight) * 100}%`; else progressBar.style.width = '0%';
}, 10);

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

    const tickerTapeSkeleton = document.querySelector('#tradingview-ticker-tape-container .tv-skeleton');
    if (tickerTapeSkeleton) tickerTapeSkeleton.style.display = 'flex';
    const marketOverviewSkeleton = document.querySelector('#market-overview-widget-wrapper .tv-skeleton');
    if (marketOverviewSkeleton) marketOverviewSkeleton.style.display = 'flex';

    if (typeof renderTickerTapeWidget === 'function') renderTickerTapeWidget(newTheme);
    if (typeof renderMarketOverviewWidget === 'function') renderMarketOverviewWidget(newTheme);

    const calendarOverlay = document.getElementById('economic-calendar-overlay');
    if (calendarOverlay && calendarOverlay.classList.contains('is-active')) {
        if (typeof loadEconomicCalendarWidget === 'function') {
            loadEconomicCalendarWidget();
        }
    }
}

function setupPullToRefresh() {
    const ptrIndicator = document.getElementById('pull-to-refresh-indicator');
    if (!ptrIndicator) return;

    let startY = 0;
    let isDragging = false;
    const PULL_THRESHOLD = 70;
    const MAX_PULL_DISTANCE = 100;

    document.body.addEventListener('touchstart', (e) => {
        if (window.scrollY === 0) {
            startY = e.touches[0].pageY;
            isDragging = true;
            ptrIndicator.classList.add('visible');
        }
    }, { passive: true });

    document.body.addEventListener('touchmove', (e) => {
        if (!isDragging || window.scrollY !== 0) {
            if(isDragging) { // Only reset if it was dragging and then user scrolled
                 isDragging = false;
                 ptrIndicator.style.transform = `translateY(-50px)`;
                 ptrIndicator.classList.remove('active');
                 ptrIndicator.classList.remove('visible');
            }
            return;
        }

        const currentY = e.touches[0].pageY;
        let diffY = currentY - startY;

        if (diffY > 0) {
            if (e.cancelable) e.preventDefault(); // Prevent scroll only if pulling down
            const pullDistance = Math.min(diffY, MAX_PULL_DISTANCE);
            ptrIndicator.style.transform = `translateY(${Math.min(pullDistance - 50, 50)}px)`;

            if (diffY > PULL_THRESHOLD) {
                ptrIndicator.classList.add('active');
                ptrIndicator.innerHTML = '<i class="fas fa-arrow-up"></i> Solte para atualizar';
            } else {
                ptrIndicator.classList.remove('active');
                ptrIndicator.innerHTML = '<i class="fas fa-arrow-down"></i> Puxe para atualizar';
            }
        } else {
            ptrIndicator.style.transform = `translateY(-50px)`;
        }
    }, { passive: false });

    document.body.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false; // Moved this to happen regardless of refresh trigger
        
        const currentY = e.changedTouches[0].pageY;
        const diffY = currentY - startY;
        
        // Check if threshold met for refresh
        if (diffY > PULL_THRESHOLD && window.scrollY === 0) {
            ptrIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
            ptrIndicator.classList.add('active'); 
            // Keep visible, but ensure it will reset after refresh.
            // The transform to hide it should be delayed until after operations.

            showNotification('Atualizando dados...');
            Promise.all([
                loadNewsWidget(true),
                updateCommentaryContent()
            ]).then(() => {
                showNotification('Dados atualizados!');
            }).catch(err => {
                showNotification('Erro ao atualizar os dados.', true);
                console.error("Erro no pull-to-refresh:", err);
            }).finally(() => {
                 setTimeout(() => {
                    ptrIndicator.style.transform = `translateY(-50px)`;
                    ptrIndicator.classList.remove('active');
                    ptrIndicator.classList.remove('visible');
                    ptrIndicator.innerHTML = '<i class="fas fa-arrow-down"></i> Puxe para atualizar';
                 }, 300); // Short delay before hiding
            });
        } else { // If not enough pull, or other conditions not met, hide immediately
            ptrIndicator.style.transform = `translateY(-50px)`;
            ptrIndicator.classList.remove('active');
            ptrIndicator.classList.remove('visible');
            ptrIndicator.innerHTML = '<i class="fas fa-arrow-down"></i> Puxe para atualizar';
        }
        startY = 0;
    });
}


// =============================================
// INICIALIZAÇÃO DOMContentLoaded
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
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

    if (typeof setupCommentaryActions === 'function') setupCommentaryActions();
    if (typeof loadBannerPhrases === 'function') await loadBannerPhrases();

    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            showNotification('Atualizando todos os dados...');
            Promise.all([
                updateDateTime(),
                loadNewsWidget(true),
                updateCommentaryContent()
            ]).then(() => {
                showNotification('Todos os dados foram atualizados!');
            }).catch(err => {
                showNotification('Erro durante a atualização geral.', true);
                console.error("Erro na atualização geral:", err);
            });
        });
    }

    const refreshNewsBtn = document.getElementById('refresh-news-btn');
    if (refreshNewsBtn && typeof loadNewsWidget === 'function') {
        refreshNewsBtn.addEventListener('click', () => loadNewsWidget(true));
    }

    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn && typeof toggleTheme === 'function') {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }

    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn && typeof toggleFullscreen === 'function') {
        fullscreenBtn.addEventListener('click', toggleFullscreen);
    }
    const fullscreenExitBtn = document.getElementById('fullscreen-exit-btn');
    if (fullscreenExitBtn && typeof toggleFullscreen === 'function') {
        fullscreenExitBtn.addEventListener('click', toggleFullscreen);
    }

    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(event =>
        document.addEventListener(event, typeof handleFullscreenChange === 'function' ? handleFullscreenChange : () => {})
    );

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
            calendarOverlay.classList.add('is-active');
            calendarContentPanel.classList.add('is-visible');
            if (typeof loadEconomicCalendarWidget === 'function') loadEconomicCalendarWidget();
        });
        const closeCalendarOverlay = () => {
            calendarContentPanel.classList.remove('is-visible');
            calendarOverlay.classList.remove('is-active');
        };
        closeCalendarBtn.addEventListener('click', closeCalendarOverlay);
        calendarOverlay.addEventListener('click', (event) => { if (event.target === calendarOverlay) closeCalendarOverlay(); });
    }

    window.addEventListener('resize', debouncedUpdateBannerOnResize);
    window.addEventListener('scroll', debouncedUpdateScrollProgressBar);
    debouncedUpdateScrollProgressBar();

    if (typeof updateDateTime === 'function') { updateDateTime(); setInterval(updateDateTime, 30000);  }
    if (typeof loadNewsWidget === 'function') loadNewsWidget();
    if (typeof updateCommentaryContent === 'function') { updateCommentaryContent(); setInterval(updateCommentaryContent, COMMENTARY_UPDATE_INTERVAL); }


    if (typeof updateBanner === 'function') {
        setInterval(updateBanner, 30 * 1000);
    }

    if (typeof setupDragAndDrop === 'function') setupDragAndDrop();
    if (typeof setupScrollAnimations === 'function') setupScrollAnimations();
    if (typeof setupPullToRefresh === 'function') setupPullToRefresh();


    if (typeof renderTickerTapeWidget === 'function') renderTickerTapeWidget(currentTheme);
    if (typeof renderMarketOverviewWidget === 'function') renderMarketOverviewWidget(currentTheme);

    // const newsLastUpdatedEl = document.getElementById('news-last-updated'); // REMOVIDO
    // if(newsLastUpdatedEl && getCacheTimestamp()) newsLastUpdatedEl.textContent = formatTimeSince(getCacheTimestamp()); // REMOVIDO
    // const commentaryLastUpdatedEl = document.getElementById('commentary-last-updated'); // REMOVIDO
    // if(commentaryLastUpdatedEl && commentaryLastUpdateTimestamp) commentaryLastUpdatedEl.textContent = formatTimeSince(commentaryLastUpdateTimestamp); // REMOVIDO


    setTimeout(() => {
        if (!document.querySelector('.page-notification') && typeof showNotification === "function") {
             showNotification('Bem-vindo ao Mercado Macro!');
        }
    }, 1500);
});

if (typeof toggleFavorite === "function") {
    window.toggleFavorite = toggleFavorite;
}
if (typeof loadNewsWidget === "function") {
    window.loadNewsWidget = loadNewsWidget;
}
