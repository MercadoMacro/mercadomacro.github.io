// Funções compartilhadas entre todas as páginas

/**
 * Atualiza a data e hora nos elementos especificados
 * @param {string[]} elementIds - IDs dos elementos para atualizar
 * @param {string} prefix - Texto prefixo para a data
 */
function updateDateTime(elementIds = ['data-atual', 'footer'], prefix = 'Atualizado em') {
    const now = new Date();
    const options = { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false
    };
    const formattedDate = now.toLocaleDateString('pt-BR', options);

    elementIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = id === 'footer' 
                ? `Fonte: Dados manuais • ${prefix} ${formattedDate}`
                : `${prefix} ${formattedDate}`;
        }
    });
}

/**
 * Alterna entre tema claro e escuro
 */
function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLightMode = document.body.classList.contains('light-mode');
    localStorage.setItem('themePreference', isLightMode ? 'light' : 'dark');
    
    const themeIcon = document.querySelector('#theme-toggle i');
    if (themeIcon) {
        themeIcon.classList.toggle('fa-moon', !isLightMode);
        themeIcon.classList.toggle('fa-sun', isLightMode);
    }
    
    // Recarregar widgets TradingView se necessário
    if (typeof TradingView !== 'undefined') {
        setTimeout(() => window.location.reload(), 300);
    }
}

/**
 * Configura o tema inicial baseado na preferência salva
 */
function setupTheme() {
    if (localStorage.getItem('themePreference') === 'light') {
        document.body.classList.add('light-mode');
        const themeIcon = document.querySelector('#theme-toggle i');
        if (themeIcon) {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        }
    }
}

/**
 * Alterna entre modo tela cheia
 */
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error('Erro ao entrar em tela cheia:', err);
        });
        document.getElementById('fullscreen-btn').style.display = 'none';
        document.getElementById('fullscreen-exit-btn').style.display = 'flex';
    } else {
        document.exitFullscreen();
        document.getElementById('fullscreen-exit-btn').style.display = 'none';
        document.getElementById('fullscreen-btn').style.display = 'flex';
    }
}

/**
 * Configura os listeners de eventos comuns
 */
function setupCommonEventListeners() {
    // Botão de tema
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    // Botão de tela cheia
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', toggleFullscreen);
    }

    const fullscreenExitBtn = document.getElementById('fullscreen-exit-btn');
    if (fullscreenExitBtn) {
        fullscreenExitBtn.addEventListener('click', toggleFullscreen);
    }

    // Evento de mudança de tela cheia
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            document.getElementById('fullscreen-exit-btn').style.display = 'none';
            document.getElementById('fullscreen-btn').style.display = 'flex';
        }
    });

    // Botão de atualização
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => updateDateTime());
    }
}

/**
 * Formata valores monetários
 * @param {number} value - Valor a ser formatado
 * @returns {string} Valor formatado
 */
function formatCurrency(value) {
    return value.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

/**
 * Mostra notificação na página
 * @param {string} message - Mensagem a ser exibida
 * @param {boolean} isError - Se é uma notificação de erro
 */
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

// Inicialização comum quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    setupTheme();
    updateDateTime();
    setupCommonEventListeners();
    
    // Atualizar data/hora a cada minuto
    setInterval(() => updateDateTime(), 60000);
});