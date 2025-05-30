// =============================================
// CONFIGURAÇÕES ATUALIZADAS
// =============================================
const CACHE_KEY = 'newsCache_v5';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos
const FAVORITES_KEY = 'favorites';
const BOX_ORDER_KEY = 'boxOrder';
const GOOGLE_DOC_ID = '1IYFmfdajMtuquyfen070HRKfNjflwj-x9VvubEgs1XM';
const GOOGLE_API_KEY = 'AIzaSyBuvcaEcTBr0EIZZZ45h8JilbcWytiyUWo'; // Lembre-se de proteger sua API Key
const COMMENTARY_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutos

// Variável para armazenar as frases do banner
let BANNER_PHRASES = [];

// Função para carregar as frases do banner
async function loadBannerPhrases() {
    try {
        const response = await fetch('data/banner-phrases.json'); 
        if (!response.ok) throw new Error(`Falha ao carregar frases: ${response.status}`);
        const data = await response.json();
        BANNER_PHRASES = data.phrases;
        if (!BANNER_PHRASES || BANNER_PHRASES.length === 0) {
            console.warn('Nenhuma frase encontrada no arquivo de banner ou arquivo vazio.');
            BANNER_PHRASES = ["Acompanhe as últimas movimentações do mercado financeiro"]; // Fallback
        }
        updateBanner();
    } catch (error) {
        console.error('Erro ao carregar frases do banner:', error);
        BANNER_PHRASES = ["Bem-vindo ao Notícias de Mercado Financeiro"]; // Fallback
        updateBanner();
    }
}

// Função para atualizar o banner
function updateBanner() {
    const banner = document.getElementById('random-banner');
    if (banner && BANNER_PHRASES.length > 0) { 
        if (!banner.querySelector('.banner-text')) {
            const bannerText = document.createElement('div');
            bannerText.className = 'banner-text';
            banner.innerHTML = '';
            banner.appendChild(bannerText);
        }

        const bannerText = banner.querySelector('.banner-text');
        const randomPhrase = BANNER_PHRASES[Math.floor(Math.random() * BANNER_PHRASES.length)];
        bannerText.textContent = randomPhrase;

        bannerText.style.animation = 'none';
        void bannerText.offsetWidth; 

        if (window.innerWidth > 768) { 
            bannerText.style.animation = 'none';
            bannerText.style.position = 'static';
            bannerText.style.left = 'auto';
            bannerText.style.transform = 'none';
            banner.style.justifyContent = 'center';
        } else { 
            bannerText.style.animation = 'scrollBanner 10s linear infinite'; 
            bannerText.style.position = 'absolute';
            bannerText.style.left = '100%';
            banner.style.justifyContent = 'flex-start';
        }
    } else if (banner && BANNER_PHRASES.length === 0) {
        banner.textContent = "Notícias e Análises Financeiras"; 
    }
}

// Serviços de proxy prioritários
const RSS_SOURCES = [
    {
        name: 'RSS2JSON',
        url: 'https://api.rss2json.com/v1/api.json?rss_url=https://www.dukascopy.com/fxspider/pt/rss/news_sector/finance',
        buildUrl: feedUrl => `${RSS_SOURCES[0].url}?rss_url=${encodeURIComponent(feedUrl)}`,
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
        url: 'https://api.allorigins.win/raw?url=https://www.dukascopy.com/fxspider/pt/rss/news_sector/finance',
        buildUrl: feedUrl => `${RSS_SOURCES[1].url}?charset=ISO-8859-1&url=${encodeURIComponent(feedUrl)}`,
        processor: data => {
            if (!data.contents) throw new Error('Conteúdo AllOrigins vazio');
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(data.contents, "text/xml");
            return parseXmlNews(xmlDoc);
        }
    }
];

// Fontes RSS prioritárias
const RSS_FEEDS = [
    'https://www.dukascopy.com/fxspider/pt/rss/news_sector/finance/',
    'https://www.valor.com.br/rss',
    'https://www.infomoney.com.br/feed/'
];

// Fallback de notícias estáticas
const FALLBACK_NEWS = [
    {
        title: "Mercado financeiro aguarda decisão do Fed sobre juros",
        description: "Investidores em todo o mundo estão atentos à decisão do Federal Reserve sobre as taxas de juros dos EUA.",
        link: "#",
        pubDate: new Date().toISOString()
    },
    {
        title: "Ibovespa abre em alta impulsionado por commodities",
        description: "O índice brasileiro segue o movimento positivo das bolsas internacionais e das commodities.",
        link: "#",
        pubDate: new Date().toISOString()
    },
    {
        title: "Dólar recua para R$ 5,66 com melhora no cenário externo",
        description: "Moeda americana perde força diante do avanço nas negociações comerciais entre EUA e China.",
        link: "#",
        pubDate: new Date().toISOString()
    }
];


// =============================================
// FUNÇÕES DO GOOGLE DOCS
// =============================================
async function fetchGoogleDocContent() {
    const url = `https://www.googleapis.com/drive/v3/files/${GOOGLE_DOC_ID}/export?mimeType=text/plain&key=${GOOGLE_API_KEY}`;
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) }); 
        if (!response.ok) {
            const errorBody = await response.text(); 
            console.error(`Google Docs API Error ${response.status}: ${response.statusText}`, errorBody);
            throw new Error(`Erro ${response.status} ao buscar Google Doc. Verifique a API Key e permissões do Doc.`);
        }
        return await response.text();
    } catch (error) {
        console.error('Falha na requisição ao Google Docs:', error);
        if (error.name !== 'AbortError') {
            throw new Error('Não foi possível carregar a análise do Google Docs. Verifique a conexão ou a configuração da API.');
        }
        throw error; 
    }
}

function updateCommentary(content) {
    const commentaryContentEl = document.getElementById('commentary-content');
    if (!commentaryContentEl) return;

    let formattedContent = content
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map(line => {
            line = line.trim();
            if (/^\s*$/.test(line)) return null;

            if (/^([📌☐✔☑️✅]\s*.+)/.test(line)) {
                return `<div class="commentary-highlight">${line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</div>`;
            }
            line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            if (/^[•*-]\s*(.+)/.test(line)) {
                return `<li>${line.substring(line.search(/\S/)).replace(/^[•*-]\s*/, '')}</li>`;
            }
            return `<p class="commentary-paragraph">${line}</p>`;
        })
        .filter(line => line !== null)
        .join('');

    formattedContent = formattedContent.replace(/(<li>.*?<\/li>)+/sg, '<ul>$&</ul>');

    commentaryContentEl.innerHTML = formattedContent || '<p>Nenhuma análise disponível no momento.</p>';
}


async function updateCommentaryContent() {
    const commentaryContentEl = document.getElementById('commentary-content');
    if (!commentaryContentEl) return;

    commentaryContentEl.innerHTML = `
        <div class="loading-commentary">
            <span class="loading-small"></span> Carregando análise do mercado...
        </div>`;

    try {
        const content = await fetchGoogleDocContent();
        updateCommentary(content);
        return true;
    } catch (error) {
        console.error('Falha ao atualizar conteúdo do comentário:', error);
        commentaryContentEl.innerHTML = `
            <div class="error-commentary">
                <i class="fas fa-exclamation-triangle"></i>
                ${error.message || 'Falha ao carregar análise.'}
            </div>`;
        return false;
    }
}

// =============================================
// FUNÇÕES PRINCIPAIS DE NOTÍCIAS
// =============================================
async function fetchNews() {
    let lastError = null;
    
    for (const feedUrl of RSS_FEEDS) {
        for (const source of RSS_SOURCES) {
            try {
                const url = source.buildUrl(feedUrl);
                console.log(`Tentando: ${source.name} com ${feedUrl}`);
                
                const response = await fetch(url, {
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    signal: AbortSignal.timeout(8000)
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const data = await response.json();
                const newsItems = source.processor(data);
                
                if (newsItems.length > 0) {
                    console.log(`Sucesso com ${source.name} e ${feedUrl}`);
                    return newsItems;
                }
            } catch (error) {
                lastError = error;
                console.warn(`Falha com ${source.name} e ${feedUrl}:`, error);
                continue;
            }
        }
    }

    throw lastError || new Error('Todas as fontes falharam');
}


async function loadNewsWidget(forceUpdate = false) {
    const newsContentBox = document.querySelector('#news-widget .news-content'); 
    if (!newsContentBox) return;

    updateLoadingState(true);

    if (!forceUpdate) {
        const cachedData = getCachedNews();
        if (cachedData) {
            renderNewsList(cachedData, true);
            updateLoadingState(false);
            return;
        }
    }

    if (!navigator.onLine) {
        showNotification('Sem conexão com a internet.', true);
        const cachedData = getCachedNews();
        if (cachedData) {
            renderNewsList(cachedData, true);
        } else {
            newsContentBox.innerHTML = '<div class="error"><i class="fas fa-wifi"></i> Sem conexão e sem notícias no cache. Por favor, verifique sua internet.</div>';
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
            renderNewsList([], false, false);
            if (forceUpdate) showNotification('Nenhuma notícia nova encontrada ou feeds vazios.', false);
        }
        localStorage.setItem('retryCount', '0');
    } catch (fetchError) {
        console.error('Falha ao buscar notícias online (loadNewsWidget):', fetchError);
        if (forceUpdate) showNotification(`Problema com atualização: ${fetchError.message}.`, true);

        const cachedData = getCachedNews();
        if (cachedData) {
            renderNewsList(cachedData, true);
            if (forceUpdate) showNotification('Mostrando notícias do cache devido à falha na atualização.', false);
        } else {
            renderNewsList(FALLBACK_NEWS, false, true);
            if (forceUpdate) showNotification('Não foi possível buscar notícias. Mostrando exemplos.', true);
        }
        scheduleRetry();
    } finally {
        updateLoadingState(false);
        localStorage.setItem('lastTry', Date.now().toString());
    }
}


// =============================================
// FUNÇÕES AUXILIARES DE NOTÍCIAS
// =============================================
function updateLoadingState(isLoading) {
    const refreshNewsBtn = document.getElementById('refresh-news-btn');
    const icon = refreshNewsBtn ? refreshNewsBtn.querySelector('i') : null;

    if (refreshNewsBtn && icon) {
        if (isLoading) {
            refreshNewsBtn.disabled = true;
            icon.classList.add('fa-spin'); 
        } else {
            refreshNewsBtn.disabled = false;
            icon.classList.remove('fa-spin'); 
        }
    }
}


function parseXmlNews(xmlDoc) {
    const errorNode = xmlDoc.querySelector('parsererror');
    if (errorNode) {
        console.error("Erro de parsing XML:", errorNode.textContent);
        throw new Error('Erro ao analisar XML do feed de notícias.');
    }

    const items = Array.from(xmlDoc.querySelectorAll("item"));
    if (items.length === 0) {
        const channelTitle = xmlDoc.querySelector("channel > title")?.textContent;
        console.warn(`Nenhuma tag <item> encontrada no feed XML${channelTitle ? ` (Feed: ${channelTitle})` : ''}.`);
        return [];
    }

    return items.map(item => {
        let description = item.querySelector("description")?.textContent?.trim() || '';
        description = description.replace("<![CDATA[", "").replace("]]>", "");

        return {
            title: item.querySelector("title")?.textContent?.trim() || 'Sem título',
            description: description,
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
        statusHtml = `<div class="error"><i class="fas fa-exclamation-triangle"></i> Serviço indisponível - mostrando notícias de exemplo.</div>`;
    } else if (fromCache) {
        const cacheTime = new Date(getCacheTimestamp() || Date.now());
        statusHtml = `
            <div class="news-status">
                <span><i class="fas fa-info-circle"></i> Mostrando notícias do cache (${cacheTime.toLocaleTimeString('pt-BR')}).</span>
                <button onclick="loadNewsWidget(true)" class="retry-btn" style="margin-left:auto; padding: 4px 8px; font-size: 11px;">Atualizar Agora</button>
            </div>`;
    }


    newsContentBox.innerHTML = `
        ${statusHtml}
        ${items.length === 0 && !isFallback ? '<p style="padding:10px; text-align:center;">Nenhuma notícia encontrada no momento.</p>' : ''}
        ${items.map(item => {
            const isFavorited = favorites.some(fav => fav.link === item.link);

            let cleanDescription = item.description || '';
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = cleanDescription;
            cleanDescription = (tempDiv.textContent || tempDiv.innerText || "").replace(/\s+/g, ' ').trim();

            return `
                <div class="news-item">
                    <button class="favorite-btn ${isFavorited ? 'favorited' : ''}"
                            aria-label="${isFavorited ? 'Desfavoritar notícia' : 'Favoritar notícia'}"
                            onclick="toggleFavorite(event, ${JSON.stringify(item).replace(/"/g, '&quot;')})">
                        <i class="fas fa-heart"></i>
                    </button>
                    <a href="${item.link}" class="news-link" target="_blank" rel="noopener noreferrer">
                        <div class="news-item-title">${item.title}</div>
                        ${cleanDescription ? `<div class="news-item-description">${cleanDescription.substring(0,180)}${cleanDescription.length > 180 ? '...' : ''}</div>` : ''}
                        <div class="news-item-date" style="font-size:0.75em; opacity:0.7; margin-top:5px;">${formatDate(item.pubDate)}</div>
                    </a>
                </div>
            `;
        }).join('')}
        ${!isFallback && navigator.onLine ? `<button onclick="loadNewsWidget(true)" class="retry-btn" style="margin-top:15px; display:block; margin-left:auto; margin-right:auto;">
            <i class="fas fa-sync-alt"></i> Tentar atualizar notícias
        </button>` : ''}
    `;
}


function renderErrorState(error) {
    const newsContentBox = document.querySelector('#news-widget .news-content'); 
    if (newsContentBox) {
        newsContentBox.innerHTML = `
            <div class="error">
                <p><i class="fas fa-exclamation-triangle"></i> ${error.message || 'Erro desconhecido ao carregar notícias.'}</p>
                <p>Verifique sua conexão e tente novamente.</p>
                <button onclick="loadNewsWidget(true)" class="retry-btn">
                    <i class="fas fa-sync-alt"></i> Tentar novamente
                </button>
            </div>
        `;
    }
}


function scheduleRetry() {
    const retryCount = parseInt(localStorage.getItem('retryCount') || '0');
    const delay = Math.min(60000 * Math.pow(2, retryCount), 10 * 60 * 1000);
    localStorage.setItem('retryCount', (retryCount + 1).toString());

    console.log(`Agendando nova tentativa de buscar notícias em ${delay/1000} segundos`);
    setTimeout(() => loadNewsWidget(true), delay);
}


function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (e) {
        console.error("Erro ao formatar data:", dateString, e);
        return '';
    }
}

// =============================================
// FUNÇÕES DE CACHE
// =============================================
function getCachedNews() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return null;
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) return data;
        localStorage.removeItem(CACHE_KEY);
        return null;
    } catch (e) {
        localStorage.removeItem(CACHE_KEY);
        return null;
    }
}

function getCacheTimestamp() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        return cached ? JSON.parse(cached).timestamp : null;
    } catch { return null; }
}

function cacheNews(data) {
    if (!data || data.length === 0) return;
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch (e) {
        console.error('Erro ao salvar cache:', e);
    }
}

// =============================================
// FUNÇÕES DE FAVORITOS
// =============================================
function getFavorites() {
    try {
        return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
    } catch {
        localStorage.removeItem(FAVORITES_KEY);
        return [];
    }
}

function saveFavorites(favorites) {
    try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch (e) { console.error('Erro ao salvar favoritos:', e); }
}

function toggleFavorite(event, newsItem) {
    event.stopPropagation();
    event.preventDefault();

    let favorites = getFavorites();
    const index = favorites.findIndex(item => item.link === newsItem.link);

    if (index === -1) {
        favorites.push(newsItem);
        showNotification('Notícia adicionada aos favoritos!');
    } else {
        favorites.splice(index, 1);
        showNotification('Notícia removida dos favoritos.');
    }
    saveFavorites(favorites);

    const heartButton = event.currentTarget;
    heartButton.classList.toggle('favorited', index === -1);
    heartButton.setAttribute('aria-label', index === -1 ? 'Desfavoritar notícia' : 'Favoritar notícia');
}


// =============================================
// FUNÇÕES DE INTERFACE
// =============================================
function showNotification(message, isError = false) {
    const existingNotification = document.querySelector('.page-notification');
    if (existingNotification) existingNotification.remove();

    const notification = document.createElement('div');
    const notificationTypeClass = isError ? 'error' : (message.toLowerCase().includes('copiado') ? 'success' : 'success');
    notification.className = `page-notification ${notificationTypeClass}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translate(-50%, 0)';
    }, 10);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translate(-50%, -40px)';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

function updateDateTime() {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
    const dataAtualElement = document.getElementById('data-atual');
    if (dataAtualElement) dataAtualElement.textContent = `Indicadores - ${formattedDate}`;
    const footerElement = document.getElementById('footer');
    if (footerElement) footerElement.textContent = `Fonte: Dados em tempo real • Atualizado em ${formattedDate}`;
}

function toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.mozFullScreenElement && !document.msFullscreenElement) {
        const element = document.documentElement;
        if (element.requestFullscreen) element.requestFullscreen().catch(handleFullscreenError);
        else if (element.webkitRequestFullscreen) element.webkitRequestFullscreen().catch(handleFullscreenError);
        else if (element.mozRequestFullScreen) element.mozRequestFullScreen().catch(handleFullscreenError);
        else if (element.msRequestFullscreen) element.msRequestFullscreen().catch(handleFullscreenError);
    } else {
        if (document.exitFullscreen) document.exitFullscreen().catch(handleFullscreenError);
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen().catch(handleFullscreenError);
        else if (document.mozCancelFullScreen) document.mozCancelFullScreen().catch(handleFullscreenError);
        else if (document.msExitFullscreen) document.msExitFullscreen().catch(handleFullscreenError);
    }
}

function handleFullscreenError(err) {
    console.error(`Erro ao alternar tela cheia: ${err.message} (${err.name})`);
    showNotification('Não foi possível alternar o modo de tela cheia.', true);
}

function handleFullscreenChange() {
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const fullscreenExitBtn = document.getElementById('fullscreen-exit-btn');
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
    if (fullscreenBtn) fullscreenBtn.style.display = isFullscreen ? 'none' : 'flex';
    if (fullscreenExitBtn) fullscreenExitBtn.style.display = isFullscreen ? 'flex' : 'none';
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLightMode = document.body.classList.contains('light-mode');
    localStorage.setItem('themePreference', isLightMode ? 'light' : 'dark');
    const themeIcon = document.querySelector('#theme-toggle i');
    if (themeIcon) {
        themeIcon.classList.toggle('fa-moon', !isLightMode);
        themeIcon.classList.toggle('fa-sun', isLightMode);
    }
    showNotification("Tema alterado. Recarregue para aplicar aos gráficos, se necessário.");
}

// =============================================
// AÇÕES DO BOX DE COMENTÁRIO (EXPANDIR/COMPARTILHAR)
// =============================================
function setupCommentaryActions() {
    const commentaryBox = document.getElementById('box-commentary'); 
    if (!commentaryBox) return;
    const boxHeader = commentaryBox.querySelector('.box-header');
    if (!boxHeader) return;

    let expandBtn = boxHeader.querySelector('#expand-commentary-btn');
    if (!expandBtn) {
        expandBtn = document.createElement('button');
        expandBtn.id = 'expand-commentary-btn';
        expandBtn.className = 'expand-btn';
        expandBtn.setAttribute('aria-label', 'Expandir conteúdo');
        expandBtn.innerHTML = '<i class="fas fa-expand-alt"></i>';
        
        const actionsContainer = boxHeader.querySelector('.box-actions');
        if (actionsContainer) {
            actionsContainer.appendChild(expandBtn);
        } else {
            boxHeader.appendChild(expandBtn);
        }
        
        expandBtn.addEventListener('click', function() {
            commentaryBox.classList.toggle('expanded');
            const icon = this.querySelector('i');
            const commentaryContent = commentaryBox.querySelector('.box-content'); 

            if (commentaryBox.classList.contains('expanded')) {
                icon.classList.replace('fa-expand-alt', 'fa-compress-alt');
                expandBtn.setAttribute('aria-label', 'Recolher conteúdo');
                if (commentaryContent) commentaryContent.style.overflowY = 'auto';
            } else {
                icon.classList.replace('fa-compress-alt', 'fa-expand-alt');
                expandBtn.setAttribute('aria-label', 'Expandir conteúdo');
                if (commentaryContent) commentaryContent.style.overflowY = 'auto'; 
            }
        });
    }

    let shareBtn = boxHeader.querySelector('#share-commentary-btn');
    if (!shareBtn) {
        shareBtn = document.createElement('button');
        shareBtn.id = 'share-commentary-btn';
        shareBtn.className = 'expand-btn';
        shareBtn.setAttribute('aria-label', 'Compartilhar análise');
        shareBtn.innerHTML = '<i class="fas fa-share-alt"></i>';

        const actionsContainer = boxHeader.querySelector('.box-actions');
        if (actionsContainer) {
            actionsContainer.appendChild(shareBtn);
        } else {
            boxHeader.appendChild(shareBtn);
        }

        shareBtn.addEventListener('click', async function() {
            const commentaryContentEl = document.getElementById('commentary-content');
            if (!commentaryContentEl) {
                showNotification('Conteúdo da análise não encontrado.', true); return;
            }
            let textToShare = "";
            commentaryContentEl.querySelectorAll('.commentary-paragraph, .commentary-highlight, li').forEach(el => {
                textToShare += (el.tagName === 'LI' ? "• " : "") + el.textContent.trim() + (el.tagName === 'LI' ? "\n" : "\n\n");
            });
            textToShare = textToShare.replace(/\n\s*\n/g, '\n\n').trim();
            if (!textToShare) {
                showNotification('Não há conteúdo para compartilhar.', true); return;
            }
            const shareData = { title: 'Radar Financeiro - Análise', text: textToShare };
            try {
                if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
                    await navigator.share(shareData);
                    showNotification('Conteúdo compartilhado!');
                } else if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(textToShare);
                    showNotification('Texto da análise copiado!');
                } else {
                    throw new Error('Compartilhamento não suportado.');
                }
            } catch (err) {
                console.error('Erro ao compartilhar/copiar:', err);
                if (err.name !== 'AbortError') {
                    showNotification(err.message.includes('não suportado') ? err.message : 'Falha ao compartilhar ou copiar.', true);
                }
            }
        });
    }
}


// =============================================
// DRAG AND DROP FUNCTIONS
// =============================================
function saveBoxOrder() {
    const container = document.getElementById('draggable-container');
    if (!container) return;
    const boxes = Array.from(container.children)
                       .filter(child => child.classList.contains('draggable-box'))
                       .map(box => box.id);
    if (boxes.length > 0) {
        localStorage.setItem(BOX_ORDER_KEY, JSON.stringify(boxes));
    }
}

function loadBoxOrder() {
    const container = document.getElementById('draggable-container');
    if (!container) return;
    try {
        const savedOrderJSON = localStorage.getItem(BOX_ORDER_KEY);
        if (!savedOrderJSON) return;
        const savedOrder = JSON.parse(savedOrderJSON);
        if (Array.isArray(savedOrder) && savedOrder.length > 0) {
            const currentDraggableBoxesInDOM = new Map(Array.from(container.querySelectorAll('.draggable-box')).map(box => [box.id, box]));
            savedOrder.forEach(id => {
                const boxElement = currentDraggableBoxesInDOM.get(id);
                if (boxElement) {
                    container.appendChild(boxElement);
                }
            });
        }
    } catch (e) {
        console.error("Erro ao carregar ordem dos boxes:", e);
        localStorage.removeItem(BOX_ORDER_KEY);
    }
}


function setupDragAndDrop() {
    const container = document.getElementById('draggable-container');
    if (!container) return;

    loadBoxOrder();

    const boxes = container.querySelectorAll('.draggable-box');
    boxes.forEach(box => {
        box.removeEventListener('dragstart', handleDragStart);
        box.removeEventListener('dragend', handleDragEnd);
        box.addEventListener('dragstart', handleDragStart);
        box.addEventListener('dragend', handleDragEnd);
    });

    container.removeEventListener('dragover', handleDragOver);
    container.addEventListener('dragover', handleDragOver);
}

function handleDragStart(e) {
    if (e.target.classList.contains('draggable-box')) {
        if (e.dataTransfer) {
            e.dataTransfer.setData('text/plain', e.target.id);
            e.dataTransfer.effectAllowed = 'move';
        }
        setTimeout(() => e.target.classList.add('dragging'), 0);
    }
}

function handleDragEnd(e) {
    if (e.target.classList.contains('draggable-box')) {
        e.target.classList.remove('dragging');
        saveBoxOrder();
        showNotification('Layout salvo!');
    }
}

function handleDragOver(e) {
    e.preventDefault();
    const container = e.currentTarget;
    const draggingBox = container.querySelector('.draggable-box.dragging');
    if (!draggingBox) return;

    const afterElement = getDragAfterElement(container, e.clientY);
    if (afterElement == null) {
        container.appendChild(draggingBox);
    } else {
        container.insertBefore(draggingBox, afterElement);
    }
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.draggable-box:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}


// =============================================
// ADICIONADO: FUNÇÕES PARA NOVAS MODERNIZAÇÕES
// =============================================

// Função para configurar animações de entrada (Scroll Reveal)
function setupScrollAnimations() {
    const boxes = document.querySelectorAll('.content-box'); 

    const observerOptions = {
        root: null, 
        rootMargin: '0px',
        threshold: 0.1 
    };

    const observerCallback = (entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target); 
            }
        });
    };

    const scrollObserver = new IntersectionObserver(observerCallback, observerOptions);
    boxes.forEach(box => scrollObserver.observe(box));
}

// Função para atualizar a barra de progresso de scroll
function updateScrollProgressBar() {
    const progressBar = document.getElementById('scroll-progress-bar');
    if (!progressBar) return;

    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    const scrollHeight = Math.max(
        document.body.scrollHeight, document.documentElement.scrollHeight,
        document.body.offsetHeight, document.documentElement.offsetHeight,
        document.body.clientHeight, document.documentElement.clientHeight
    ) - document.documentElement.clientHeight;
    
    if (scrollHeight > 0) {
        const scrolledPercentage = (scrollTop / scrollHeight) * 100;
        progressBar.style.width = scrolledPercentage + '%';
    } else {
        progressBar.style.width = '0%'; 
    }
}

// =============================================
// FUNÇÃO PARA CARREGAR WIDGET DE CALENDÁRIO ECONÔMICO
// =============================================
function loadEconomicCalendarWidget() {
    const widgetContainer = document.getElementById('economicCalendarWidget');
    if (!widgetContainer) {
        console.error('Economic calendar widget container not found.');
        return;
    }

    widgetContainer.innerHTML = ''; // Clear previous widget instance to allow reloading with new theme

    const script = document.createElement('script');
    script.async = true;
    script.type = 'text/javascript';
    script.dataset.type = 'calendar-widget'; // Important for the Tradays script
    script.src = 'https://www.tradays.com/c/js/widgets/calendar/widget.js?v=13';

    // Determine the theme for the widget based on the body class
    const currentThemeIsLight = document.body.classList.contains('light-mode');
    const widgetTheme = currentThemeIsLight ? 0 : 1; // 0 for light, 1 for dark (Tradays specific)

    // The configuration is provided as the text content of the script tag
    script.text = JSON.stringify({
        "width": "450",
        "height": "100%",
        "mode": "1", // Mode 2 is "Widget". Mode 1 is "List".
        "lang": "pt",
        "theme": widgetTheme
    });

    widgetContainer.appendChild(script);
}


// =============================================
// INICIALIZAÇÃO
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
    if (localStorage.getItem('themePreference') === 'light') {
        document.body.classList.add('light-mode');
        const themeIcon = document.querySelector('#theme-toggle i');
        if (themeIcon) {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        }
    }

    setupCommentaryActions();
    await loadBannerPhrases();

    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
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

    const refreshNewsBtn = document.getElementById('refresh-news-btn');
    if (refreshNewsBtn) refreshNewsBtn.addEventListener('click', () => loadNewsWidget(true));

    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);

    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);
    const fullscreenExitBtn = document.getElementById('fullscreen-exit-btn');
    if (fullscreenExitBtn) fullscreenExitBtn.addEventListener('click', toggleFullscreen);

    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(event =>
        document.addEventListener(event, handleFullscreenChange)
    );

    document.getElementById('analises-btn')?.addEventListener('click', () => window.location.href = 'analises.html');
    document.getElementById('indicadores-btn')?.addEventListener('click', () => window.location.href = 'indicadores.html');
    document.getElementById('calculadoras-btn')?.addEventListener('click', () => window.location.href = 'calculadoras/calculadoras.html');
    document.getElementById('terminal-btn')?.addEventListener('click', () => window.location.href = 'terminal-news.html');

    // EVENT LISTENERS FOR ECONOMIC CALENDAR
    const calendarToggleBtn = document.getElementById('economic-calendar-toggle-btn');
    const calendarOverlay = document.getElementById('economic-calendar-overlay');
    const calendarContentPanel = document.getElementById('economic-calendar-content-panel');
    const closeCalendarBtn = document.getElementById('close-calendar-btn');

    if (calendarToggleBtn && calendarOverlay && calendarContentPanel && closeCalendarBtn) {
        calendarToggleBtn.addEventListener('click', () => {
            calendarOverlay.classList.add('is-active');
            calendarContentPanel.classList.add('is-visible');
            loadEconomicCalendarWidget(); // Load/reload widget with current theme
        });

        const closeCalendarOverlay = () => {
            calendarContentPanel.classList.remove('is-visible');
            calendarOverlay.classList.remove('is-active');
            // Optional: You might want to clear the widget content if it causes issues when hidden
            // const widgetContainer = document.getElementById('economicCalendarWidget');
            // if (widgetContainer) widgetContainer.innerHTML = '';
        };

        closeCalendarBtn.addEventListener('click', closeCalendarOverlay);

        calendarOverlay.addEventListener('click', (event) => {
            // Close if clicked on the backdrop (overlay-panel) itself,
            // not on the content panel or its children.
            if (event.target === calendarOverlay) {
                closeCalendarOverlay();
            }
        });
    }

    window.addEventListener('resize', updateBanner);
    window.addEventListener('scroll', updateScrollProgressBar); 

    updateDateTime();
    loadNewsWidget();
    updateCommentaryContent();
    updateScrollProgressBar(); 
    setupScrollAnimations(); 

    setInterval(updateDateTime, 60000);
    setInterval(updateCommentaryContent, COMMENTARY_UPDATE_INTERVAL);
    setInterval(updateBanner, 5 * 60 * 1000);

    setupDragAndDrop();

    setTimeout(() => {
        if (!document.querySelector('.page-notification')) {
             showNotification('Bem-vindo ao Mercado Macro!');
        }
    }, 1500);
});

window.toggleFavorite = toggleFavorite;