// Configurações
const CACHE_KEY = 'newsCache_v3';
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos
const FAVORITES_KEY = 'favorites';
const RSS_URL = 'https://www.dukascopy.com/fxspider/pt/rss/news_sector/finance/';
const PROXIES = [
    `https://api.allorigins.win/get?url=${encodeURIComponent(RSS_URL)}`,
    `https://corsproxy.io/?${encodeURIComponent(RSS_URL)}`,
    `https://thingproxy.freeboard.io/fetch/${RSS_URL}`
];

// Fallback de notícias
const FALLBACK_NEWS = [
    {
        title: "Mercado financeiro aguarda decisão do Fed sobre juros",
        description: "Investidores em todo o mundo estão atentos à decisão do Federal Reserve sobre as taxas de juros dos EUA.",
        link: "#"
    },
    {
        title: "Ibovespa abre em alta impulsionado por commodities",
        description: "O índice brasileiro segue o movimento positivo das bolsas internacionais e das commodities.",
        link: "#"
    }
];

// Elementos DOM
const newsContent = document.querySelector('.news-content');
const refreshNewsBtn = document.getElementById('refresh-news-btn');

/**
 * Carrega e exibe as notícias
 */
async function loadNewsWidget() {
    try {
        showLoadingState();
        
        if (!navigator.onLine) {
            throw new Error('Sem conexão com a internet');
        }

        try {
            const xmlString = await tryFetchWithProxies();
            const newsItems = parseNews(xmlString);
            cacheNews(newsItems);
            renderNews(newsItems);
            showNotification('Notícias atualizadas!');
            localStorage.setItem('retryCount', '0');
            return;
        } catch (fetchError) {
            console.error('Falha ao buscar notícias:', fetchError);
        }

        // Fallback para cache
        const cachedData = getCachedNews();
        if (cachedData) {
            showCachedNews(cachedData);
        } else {
            showFallbackNews();
        }

        scheduleRetry();

    } catch (error) {
        handleNewsError(error);
    } finally {
        resetRefreshButton();
    }
}

/**
 * Mostra estado de carregamento
 */
function showLoadingState() {
    newsContent.innerHTML = `
        <div class="loading">
            <i class="fas fa-spinner fa-spin"></i> Carregando notícias...
        </div>
    `;
    refreshNewsBtn.disabled = true;
    refreshNewsBtn.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Carregando...';
}

/**
 * Tenta buscar notícias usando proxies alternativos
 */
async function tryFetchWithProxies() {
    let lastError = null;

    for (const proxy of PROXIES) {
        try {
            const response = await fetch(proxy, {
                headers: {'X-Requested-With': 'XMLHttpRequest'},
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!data.contents) throw new Error('Conteúdo vazio');
            return data.contents;
        } catch (error) {
            lastError = error;
            continue;
        }
    }

    throw lastError || new Error('Todos os proxies falharam');
}

/**
 * Analisa o XML das notícias
 */
function parseNews(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");

    if (xmlDoc.querySelector('parsererror')) {
        throw new Error('Erro ao analisar XML');
    }

    const items = xmlDoc.querySelectorAll("item");
    if (!items || items.length === 0) {
        throw new Error('Nenhuma notícia encontrada');
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
            link: item.querySelector("link")?.textContent || '#'
        }));
}

/**
 * Renderiza as notícias na página
 */
function renderNews(items) {
    const favorites = getFavorites();
    newsContent.innerHTML = items.map(item => `
        <div class="news-item">
            <button class="favorite-btn ${isFavorited(item, favorites) ? 'favorited' : ''}" 
                    onclick="toggleFavorite(${JSON.stringify(item).replace(/"/g, '&quot;')})">
                <i class="fas fa-heart"></i>
            </button>
            <a href="${item.link}" class="news-link" target="_blank" rel="noopener noreferrer">
                <div class="news-item-title">${item.title}</div>
                <div class="news-item-description">${item.description}</div>
            </a>
        </div>
    `).join('');
}

// Funções auxiliares (cache, favoritos, etc.)...

// Inicialização quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    loadNewsWidget();
    setInterval(loadNewsWidget, 5 * 60 * 1000); // Atualizar a cada 5 minutos
});