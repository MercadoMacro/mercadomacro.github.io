// =============================================
// CONFIGURAÇÕES ATUALIZADAS
// =============================================
const CACHE_KEY = 'newsCache_v5';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos
const FAVORITES_KEY = 'favorites';
const BOX_ORDER_KEY = 'boxOrder';
const GOOGLE_DOC_ID = '1IYFmfdajMtuquyfen070HRKfNjflwj-x9VvubEgs1XM';
const GOOGLE_API_KEY = 'AIzaSyBuvcaEcTBr0EIZZZ45h8JilbcWytiyUWo';
const COMMENTARY_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutos

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

// Variável para armazenar as frases do banner
let BANNER_PHRASES = [];


// =============================================
// FUNÇÕES DO BANNER
// =============================================
async function loadBannerPhrases() {
    try {
        const response = await fetch('data/banner-phrases.json');
        if (!response.ok) throw new Error('Falha ao carregar frases');
        const data = await response.json();
        BANNER_PHRASES = data.phrases;
        if (!BANNER_PHRASES || BANNER_PHRASES.length === 0) {
            throw new Error('Nenhuma frase encontrada no arquivo');
        }
        updateBanner();
    } catch (error) {
        console.error('Erro ao carregar frases do banner:', error);
        BANNER_PHRASES = ["Acompanhe as últimas movimentações do mercado financeiro"];
        updateBanner();
    }
}

function updateBanner() {
    const banner = document.getElementById('random-banner');
    if (banner) {
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
            bannerText.style.animation = 'scrollBanner 7s linear infinite';
            bannerText.style.position = 'absolute';
            bannerText.style.left = '100%';
            banner.style.justifyContent = 'flex-start';
        }
    }
}

// =============================================
// FUNÇÕES DE CAPTURA E COMPARTILHAMENTO
// =============================================
async function captureAndShareCommentary() {
    try {
        showNotification('Preparando imagem para compartilhamento...');
        
        // Captura o box como imagem
        const box = document.getElementById('box-commentary');
        const canvas = await html2canvas(box, {
            scale: 2,
            backgroundColor: getComputedStyle(document.body).backgroundColor,
            logging: false,
            useCORS: true
        });

        // Converte para URL da imagem
        const imageUrl = canvas.toDataURL('image/png');

        // Tenta usar a API de compartilhamento nativo (mobile)
        if (navigator.share) {
            const blob = await (await fetch(imageUrl)).blob();
            const file = new File([blob], 'analise-mercado.png', { type: 'image/png' });
            
            await navigator.share({
                title: 'Análise do Mercado Financeiro',
                text: 'Confira esta análise do mercado:',
                files: [file]
            });
        } 
        // Fallback para desktop
        else {
            const newWindow = window.open('', '_blank');
            newWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Compartilhar Análise</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
                        img { max-width: 100%; height: auto; margin: 20px 0; border: 1px solid #ddd; }
                        .share-options { margin-top: 20px; }
                        .share-btn { 
                            display: inline-block; 
                            margin: 5px; 
                            padding: 10px 15px; 
                            background: #00ff88; 
                            color: #0a0a2a; 
                            border-radius: 5px; 
                            text-decoration: none;
                        }
                    </style>
                </head>
                <body>
                    <h2>Análise do Mercado Financeiro</h2>
                    <img src="${imageUrl}" alt="Análise do Mercado">
                    <div class="share-options">
                        <p>Compartilhe esta análise:</p>
                        <a href="https://twitter.com/intent/tweet?text=Confira%20esta%20análise%20do%20mercado%20financeiro&url=${encodeURIComponent(window.location.href)}" 
                           class="share-btn" target="_blank">Twitter</a>
                        <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}" 
                           class="share-btn" target="_blank">Facebook</a>
                        <a href="https://api.whatsapp.com/send?text=Confira%20esta%20análise%20do%20mercado%20financeiro%20${encodeURIComponent(window.location.href)}" 
                           class="share-btn" target="_blank">WhatsApp</a>
                        <a href="${imageUrl}" download="analise-mercado.png" class="share-btn">Baixar Imagem</a>
                    </div>
                </body>
                </html>
            `);
        }
    } catch (error) {
        console.error("Erro ao compartilhar:", error);
        if (error.name !== 'AbortError') {
            showNotification("Erro ao compartilhar. Tente novamente.", true);
        }
    }
}

function setupCommentarySharing() {
    const shareBtn = document.getElementById('capture-share-btn');
    if (!shareBtn) return;

    shareBtn.addEventListener('click', captureAndShareCommentary);
}

// =============================================
// FUNÇÕES DO GOOGLE DOCS
// =============================================
async function fetchGoogleDocContent() {
    try {
        const url = `https://www.googleapis.com/drive/v3/files/${GOOGLE_DOC_ID}/export?mimeType=text/plain&key=${GOOGLE_API_KEY}`;
        
        const response = await fetch(url, {
            signal: AbortSignal.timeout(8000)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        return await response.text();
    } catch (error) {
        console.error('Erro ao buscar conteúdo do Google Docs:', error);
        throw error;
    }
}

function updateCommentary(content) {
    const commentaryContent = document.getElementById('commentary-content');
    
    const formattedContent = content
        .replace(/^([📌☐✔] .+)/gm, '<div class="commentary-highlight">$1</div>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^• (.+)/gm, '<li>$1</li>')
        .replace(/\n/g, '<br>')
        .replace(/<br>/g, '</div><div class="commentary-paragraph">')
        .replace(/<li>(.+?)<br>/g, '<li>$1</li>');
    
    commentaryContent.innerHTML = `
        <div class="commentary-content">
            <div class="commentary-paragraph">${formattedContent}</div>
        </div>`;
}

async function updateCommentaryContent() {
    const commentaryContent = document.getElementById('commentary-content');
    try {
        commentaryContent.innerHTML = `
            <div class="loading-commentary">
                <span class="loading-small"></span> Carregando análise do mercado...
            </div>`;
        
        const content = await fetchGoogleDocContent();
        updateCommentary(content);
        return true;
    } catch (error) {
        console.error('Falha ao atualizar comentário:', error);
        commentaryContent.innerHTML = `
            <div class="error-commentary">
                <i class="fas fa-exclamation-triangle"></i> 
                Falha ao atualizar análise. Tentando novamente em 1 minuto...
            </div>`;
        return false;
    }
}

// =============================================
// FUNÇÕES DE NOTÍCIAS
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

async function loadNewsWidget() {
    try {
        updateLoadingState(true);
        
        if (!navigator.onLine) throw new Error('Sem conexão com a internet');

        try {
            const newsItems = await fetchNews();
            cacheNews(newsItems);
            renderNewsList(newsItems);
            showNotification('Notícias atualizadas com sucesso!');
            localStorage.setItem('retryCount', '0');
            return;
        } catch (fetchError) {
            console.error('Falha ao buscar notícias:', fetchError);
            showNotification(`Problema com atualização: ${fetchError.message}`, true);
        }

        const cachedData = getCachedNews();
        if (cachedData) {
            renderNewsList(cachedData, true);
        } else {
            renderNewsList(FALLBACK_NEWS, false, true);
        }

        scheduleRetry();

    } catch (error) {
        console.error('Erro ao carregar notícias:', error);
        renderErrorState(error);
    } finally {
        updateLoadingState(false);
        localStorage.setItem('lastTry', Date.now());
    }
}

// =============================================
// FUNÇÕES AUXILIARES
// =============================================
function updateLoadingState(isLoading) {
    const refreshNewsBtn = document.getElementById('refresh-news-btn');
    if (isLoading) {
        refreshNewsBtn.disabled = true;
        refreshNewsBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Carregando...';
    } else {
        refreshNewsBtn.disabled = false;
        refreshNewsBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Atualizar';
    }
}

function parseXmlNews(xmlDoc) {
    const errorNode = xmlDoc.querySelector('parsererror');
    if (errorNode) throw new Error('Erro ao analisar XML');

    const items = xmlDoc.querySelectorAll("item");
    if (!items || items.length === 0) {
        throw new Error('Nenhuma notícia encontrada no feed');
    }

    return Array.from(items)
        .sort((a, b) => {
            const dateA = new Date(a.querySelector("pubDate")?.textContent || 0);
            const dateB = new Date(b.querySelector("pubDate")?.textContent || 0);
            return dateB - dateA;
        })
        .slice(0, 5)
        .map(item => ({
            title: item.querySelector("title")?.textContent || 'Sem título',
            description: item.querySelector("description")?.textContent || '',
            link: item.querySelector("link")?.textContent || '#',
            pubDate: item.querySelector("pubDate")?.textContent || new Date().toISOString()
        }));
}

function renderNewsList(items, fromCache = false, isFallback = false) {
    const newsContent = document.querySelector('.news-content');
    const favorites = getFavorites();

    let statusHtml = '';
    if (fromCache) {
        const cacheTime = new Date(getCacheTimestamp());
        statusHtml = `
            <div class="news-status">
                <i class="fas fa-info-circle"></i>
                Mostrando notícias armazenadas (${cacheTime.toLocaleTimeString()})
            </div>
        `;
    } else if (isFallback) {
        statusHtml = `
            <div class="error">
                <i class="fas fa-exclamation-triangle"></i>
                Serviço temporariamente indisponível - mostrando notícias de exemplo
            </div>
        `;
    }

    newsContent.innerHTML = `
        ${statusHtml}
        ${items.map(item => {
            const isFavorited = favorites.some(fav => fav.link === item.link);
            const description = (item.description || '')
                .replace(/\n/g, '<br>')
                .replace(/<br><br>/g, '<br>')
                .trim();
                
            return `
                <div class="news-item">
                    <button class="favorite-btn ${isFavorited ? 'favorited' : ''}" 
                            onclick="toggleFavorite(${JSON.stringify(item).replace(/"/g, '&quot;')})">
                        <i class="fas fa-heart"></i>
                    </button>
                    <a href="${item.link}" class="news-link" target="_blank" rel="noopener noreferrer">
                        <div class="news-item-title">${item.title}</div>
                        <div class="news-item-description">${description}</div>
                        <div class="news-item-date">${formatDate(item.pubDate)}</div>
                    </a>
                </div>
            `;
        }).join('')}
        <button onclick="loadNewsWidget()" class="retry-btn">
            <span class="loading-small"></span> Tentar atualizar novamente
        </button>
    `;
}

function renderErrorState(error) {
    const newsContent = document.querySelector('.news-content');
    newsContent.innerHTML = `
        <div class="error">
            <p><i class="fas fa-exclamation-triangle"></i> ${error.message || 'Erro desconhecido'}</p>
            <p>Por favor, verifique sua conexão e tente novamente.</p>
            <button onclick="loadNewsWidget()" class="retry-btn">
                <span class="loading-small"></span> Tentar novamente
            </button>
        </div>
    `;
}

function scheduleRetry() {
    const retryCount = parseInt(localStorage.getItem('retryCount') || '0');
    const delay = Math.min(30000 * Math.pow(2, retryCount), 300000);
    localStorage.setItem('retryCount', (retryCount + 1).toString());
    
    console.log(`Agendando nova tentativa em ${delay/1000} segundos`);
    setTimeout(loadNewsWidget, delay);
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
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
        return (Date.now() - timestamp < CACHE_TTL) ? data : null;
    } catch (e) {
        console.error('Erro ao ler cache:', e);
        return null;
    }
}

function getCacheTimestamp() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        return cached ? JSON.parse(cached).timestamp : Date.now();
    } catch {
        return Date.now();
    }
}

function cacheNews(data) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
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

function toggleFavorite(newsItem) {
    let favorites = getFavorites();
    const index = favorites.findIndex(item => item.link === newsItem.link);

    if (index === -1) {
        favorites.push(newsItem);
        showNotification('Notícia adicionada aos favoritos');
    } else {
        favorites.splice(index, 1);
        showNotification('Notícia removida dos favoritos');
    }

    saveFavorites(favorites);
    renderNewsList(getCachedNews() || FALLBACK_NEWS);
    return favorites;
}

// =============================================
// FUNÇÕES DE INTERFACE
// =============================================
function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.className = `page-notification ${isError ? 'error' : 'success'}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateY(0)';
    }, 10);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

function updateDateTime() {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    document.getElementById('data-atual').textContent = `Indicadores - ${formattedDate}`;
    document.getElementById('footer').textContent = `Fonte: Dados atualizados • Atualizado em ${formattedDate}`;
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(console.error);
        document.getElementById('fullscreen-btn').style.display = 'none';
        document.getElementById('fullscreen-exit-btn').style.display = 'flex';
    } else {
        document.exitFullscreen();
    }
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLightMode = document.body.classList.contains('light-mode');
    localStorage.setItem('themePreference', isLightMode ? 'light' : 'dark');

    const themeIcon = document.querySelector('#theme-toggle i');
    themeIcon.classList.toggle('fa-moon', !isLightMode);
    themeIcon.classList.toggle('fa-sun', isLightMode);
}

// =============================================
// FUNÇÕES DE EXPANSÃO DO BOX
// =============================================
function setupCommentaryExpansion() {
    const commentaryBox = document.getElementById('box-commentary');
    if (!commentaryBox) return;
    
    const expandBtn = document.createElement('button');
    expandBtn.id = 'expand-commentary-btn';
    expandBtn.className = 'expand-btn';
    expandBtn.setAttribute('aria-label', 'Expandir conteúdo');
    expandBtn.innerHTML = '<i class="fas fa-expand-alt"></i>';
    
    const boxHeader = commentaryBox.querySelector('.box-header');
    if (boxHeader) {
        boxHeader.appendChild(expandBtn);
        
        expandBtn.addEventListener('click', function() {
            commentaryBox.classList.toggle('expanded');
            
            const icon = this.querySelector('i');
            if (commentaryBox.classList.contains('expanded')) {
                icon.classList.replace('fa-expand-alt', 'fa-compress-alt');
                expandBtn.setAttribute('aria-label', 'Recolher conteúdo');
                commentaryBox.style.maxHeight = 'none';
                commentaryBox.style.height = '700px';
            } else {
                icon.classList.replace('fa-compress-alt', 'fa-expand-alt');
                expandBtn.setAttribute('aria-label', 'Expandir conteúdo');
                commentaryBox.style.maxHeight = '600px';
                commentaryBox.style.height = 'auto';
            }
        });
    }
}

// =============================================
// FUNÇÕES DE DRAG AND DROP
// =============================================
function saveBoxOrder() {
    const container = document.getElementById('draggable-container');
    const boxes = Array.from(container.children).map(box => box.id);
    localStorage.setItem(BOX_ORDER_KEY, JSON.stringify(boxes));
    console.log('Ordem salva:', boxes);
}

function loadBoxOrder() {
    const container = document.getElementById('draggable-container');
    const savedOrder = JSON.parse(localStorage.getItem(BOX_ORDER_KEY));
    
    if (savedOrder && savedOrder.length === container.children.length) {
        console.log('Carregando ordem:', savedOrder);
        savedOrder.forEach(id => {
            const box = document.getElementById(id);
            if (box && box.parentNode === container) {
                container.appendChild(box);
            }
        });
    }
}

function setupDragAndDrop() {
    const container = document.getElementById('draggable-container');
    const boxes = document.querySelectorAll('.draggable-box');

    loadBoxOrder();

    boxes.forEach(box => {
        box.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', box.id);
            box.classList.add('dragging');
        });

        box.addEventListener('dragend', () => {
            box.classList.remove('dragging');
            saveBoxOrder();
            showNotification('Layout salvo!');
        });
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggingBox = document.querySelector('.dragging');
        const otherBox = e.target.closest('.draggable-box');
        
        if (otherBox && otherBox !== draggingBox) {
            const rect = otherBox.getBoundingClientRect();
            const nextPosition = (e.clientY < rect.top + rect.height / 2) ? 'before' : 'after';
            
            if (nextPosition === 'before') {
                container.insertBefore(draggingBox, otherBox);
            } else {
                container.insertBefore(draggingBox, otherBox.nextSibling);
            }
        }
    });
}

// =============================================
// INICIALIZAÇÃO
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
    // Configura tema
    if (localStorage.getItem('themePreference') === 'light') {
        document.body.classList.add('light-mode');
        const themeIcon = document.querySelector('#theme-toggle i');
        themeIcon.classList.replace('fa-moon', 'fa-sun');
    }

    // Inicializa componentes
    setupCommentaryExpansion();
    setupCommentarySharing();
    setupDragAndDrop();
    await loadBannerPhrases();

    // Configura eventos
    document.getElementById('refresh-btn').addEventListener('click', updateDateTime);
    document.getElementById('refresh-news-btn').addEventListener('click', loadNewsWidget);
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
    document.getElementById('fullscreen-exit-btn').addEventListener('click', toggleFullscreen);
    document.getElementById('analises-btn').addEventListener('click', () => window.location.href = 'analises.html');
    document.getElementById('indicadores-btn').addEventListener('click', () => window.location.href = 'indicadores.html');
    document.getElementById('calculadoras-btn').addEventListener('click', () => window.location.href = 'calculadoras/calculadoras.html');
    document.getElementById('terminal-btn').addEventListener('click', () => window.location.href = 'terminal-news.html');

    window.addEventListener('resize', updateBanner);

    // Carrega dados iniciais
    updateDateTime();
    loadNewsWidget();
    updateCommentaryContent();
    
    // Configura intervalos
    setInterval(updateDateTime, 60000);
    setInterval(loadNewsWidget, 300000);
    setInterval(updateCommentaryContent, COMMENTARY_UPDATE_INTERVAL);
    setInterval(updateBanner, 300000);
    
    // Mensagem de boas-vindas
    setTimeout(() => {
        showNotification('Bem-vindo ao Mercado Macro! Atualizando dados...');
    }, 1000);
});

// Funções globais
window.toggleFavorite = toggleFavorite;
window.loadNewsWidget = loadNewsWidget;