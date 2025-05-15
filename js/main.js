// =============================================
// CONFIGURAÇÕES ATUALIZADAS
// =============================================
const CACHE_KEY = 'newsCache_v5';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos
const FAVORITES_KEY = 'favorites';
const GOOGLE_DOC_ID = '1IYFmfdajMtuquyfen070HRKfNjflwj-x9VvubEgs1XM';
const GOOGLE_API_KEY = 'AIzaSyBuvcaEcTBr0EIZZZ45h8JilbcWytiyUWo';
const COMMENTARY_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutos
const SCREENSHOT_LOGO_URL = 'https://mercadomacro.github.io/logo.png';

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
    const commentary = document.getElementById('commentary');
    const bionicToggleContainer = commentary.querySelector('.bionic-toggle-container')?.outerHTML || 
        `<div class="bionic-toggle-container">
            <button id="bionic-toggle" aria-label="Ativar Bionic Reading">
                <i class="fas fa-eye"></i>
            </button>
            <button id="screenshot-btn" aria-label="Gerar imagem da notícia">
                <i class="fas fa-camera"></i>
            </button>
        </div>`;
    
    // Tratamento robusto para quebras de linha
    const formattedContent = content
        .replace(/\n\n/g, '<span class="section-spacer"></span>') // Espaço entre seções
        .replace(/\n•/g, '<br>•') // Quebras para listas
        .replace(/\n/g, '<br>'); // Demais quebras de linha
    
    commentary.innerHTML = `${bionicToggleContainer}<div class="commentary-content">${formattedContent}</div>`;
    
    // Reatacha os event listeners
    document.getElementById('bionic-toggle').addEventListener('click', toggleBionicReading);
    document.getElementById('screenshot-btn').addEventListener('click', captureNewsScreenshot);
    
    // Armazena o conteúdo original para o modo bionic
    commentary.dataset.originalText = content;
}

async function updateCommentaryContent() {
    try {
        const content = await fetchGoogleDocContent();
        updateCommentary(content);
        return true;
    } catch (error) {
        console.error('Falha ao atualizar comentário:', error);
        const commentary = document.getElementById('commentary');
        if (!commentary.textContent.includes('Carregando') && !commentary.textContent.includes('Erro')) {
            commentary.innerHTML += `<div class="error-commentary"><i class="fas fa-exclamation-triangle"></i> Falha ao atualizar análise. Tentando novamente em 1 minuto...</div>`;
        }
        return false;
    }
}

// =============================================
// FUNÇÕES DE CAPTURA DE TELA
// =============================================

async function captureNewsScreenshot() {
    try {
        showNotification('Preparando imagem...');
        
        await loadScript('https://html2canvas.hertzen.com/dist/html2canvas.min.js');
        
        const container = document.querySelector('.container');
        const logo = await loadImage(SCREENSHOT_LOGO_URL);
        
        const logoElement = document.createElement('div');
        logoElement.style.position = 'absolute';
        logoElement.style.top = '20px';
        logoElement.style.left = '20px';
        logoElement.style.zIndex = '99999';
        logoElement.innerHTML = `<img src="${SCREENSHOT_LOGO_URL}" style="max-width: 150px; height: auto;">`;
        document.body.appendChild(logoElement);
        
        const canvas = await html2canvas(container, {
            scale: 2,
            logging: false,
            useCORS: true,
            allowTaint: true,
            backgroundColor: document.body.classList.contains('light-mode') ? '#f5f7fa' : '#0a0a2a'
        });
        
        document.body.removeChild(logoElement);
        
        const link = document.createElement('a');
        link.download = `noticia-mercado-${new Date().toISOString().slice(0,10)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        showNotification('Imagem gerada com sucesso!');
    } catch (error) {
        console.error('Erro ao capturar screenshot:', error);
        showNotification('Erro ao gerar imagem', true);
    }
}

function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

// =============================================
// FUNÇÕES PRINCIPAIS
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

function toggleBionicReading() {
    const commentary = document.getElementById('commentary');
    const isActive = commentary.classList.toggle('bionic-enabled');
    const toggleBtn = document.getElementById('bionic-toggle');

    if (isActive) {
        const originalText = commentary.dataset.originalText || commentary.textContent;
        commentary.dataset.originalText = originalText;
        commentary.innerHTML = `
            <div class="bionic-toggle-container">
                <button id="bionic-toggle" aria-label="Desativar Bionic Reading">
                    <i class="fas fa-eye-slash"></i>
                </button>
                <button id="screenshot-btn" aria-label="Gerar imagem da notícia">
                    <i class="fas fa-camera"></i>
                </button>
            </div>
            ${applyBionicReading(originalText)}
        `;
    } else {
        commentary.innerHTML = `
            <div class="bionic-toggle-container">
                <button id="bionic-toggle" aria-label="Ativar Bionic Reading">
                    <i class="fas fa-eye"></i>
                </button>
                <button id="screenshot-btn" aria-label="Gerar imagem da notícia">
                    <i class="fas fa-camera"></i>
                </button>
            </div>
            ${commentary.dataset.originalText}
        `;
    }

    document.getElementById('bionic-toggle').addEventListener('click', toggleBionicReading);
    document.getElementById('screenshot-btn').addEventListener('click', captureNewsScreenshot);
}

function applyBionicReading(text, fixation = 3) {
    return text.split(' ').map(word => {
        if (word.length <= fixation) return word;
        const boldPart = word.substring(0, fixation);
        const rest = word.substring(fixation);
        return `<strong>${boldPart}</strong>${rest}`;
    }).join(' ');
}

// =============================================
// INICIALIZAÇÃO
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('themePreference') === 'light') {
        document.body.classList.add('light-mode');
        const themeIcon = document.querySelector('#theme-toggle i');
        themeIcon.classList.replace('fa-moon', 'fa-sun');
    }

    document.getElementById('refresh-btn').addEventListener('click', updateDateTime);
    document.getElementById('refresh-news-btn').addEventListener('click', loadNewsWidget);
    document.getElementById('bionic-toggle').addEventListener('click', toggleBionicReading);
    document.getElementById('screenshot-btn').addEventListener('click', captureNewsScreenshot);
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
    document.getElementById('fullscreen-exit-btn').addEventListener('click', toggleFullscreen);
    document.getElementById('analises-btn').addEventListener('click', () => 
        window.location.href = 'analises.html');
    document.getElementById('indicadores-btn').addEventListener('click', () => 
        window.location.href = 'indicadores.html');
    document.getElementById('calculadoras-btn').addEventListener('click', () => 
        window.location.href = 'calculadoras/calculadoras.html');
    document.getElementById('terminal-btn').addEventListener('click', () => 
        window.location.href = 'terminal-news.html');

    updateDateTime();
    loadNewsWidget();
    updateCommentaryContent();
    setInterval(updateDateTime, 60000);
    setInterval(loadNewsWidget, 300000);
    setInterval(updateCommentaryContent, COMMENTARY_UPDATE_INTERVAL);

    setTimeout(() => {
        showNotification('Bem-vindo ao Mercado Macro! Atualizando dados...');
    }, 1000);
});

window.toggleFavorite = toggleFavorite;
window.loadNewsWidget = loadNewsWidget;