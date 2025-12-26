// js/widgets.js

/**
 * Renders the TradingView Ticker Tape widget
 * @param {string} theme - 'light' or 'dark'
 */
function renderTickerTapeWidget(theme) {
    const container = document.getElementById('tradingview-ticker-tape-container');
    if (!container) return;

    // Clean up previous widget and skeleton
    const skeleton = container.querySelector('.tv-skeleton');
    if (skeleton) skeleton.style.display = 'none';
    
    const widgetContent = container.querySelector('.tradingview-widget-container');
    if (widgetContent) {
        widgetContent.remove();
    } else {
        Array.from(container.childNodes).forEach(node => {
            if (!node.classList || !node.classList.contains('tv-skeleton')) {
                container.removeChild(node);
            }
        });
    }

    // Widget configuration
    const config = {
        "symbols": [
            { "proName": "FOREXCOM:SPXUSD", "title": "S&P 500" },
            { "description": "IBOVESPA", "proName": "BMFBOVESPA:IBOV" },
            { "description": "NASDAQ 100", "proName": "FOREXCOM:NSXUSD" },
            { "description": "USD/BRL", "proName": "FX_IDC:USDBRL" },
            { "description": "EUR/USD", "proName": "FX:EURUSD" },
            { "description": "BITCOIN", "proName": "BITSTAMP:BTCUSD" },
            { "description": "PETRÓLEO BRENT", "proName": "TVC:UKOIL" },
            { "description": "OURO", "proName": "OANDA:XAUUSD" }
        ],
        "showSymbolLogo": true,
        "isTransparent": true,
        "displayMode": "adaptive",
        "colorTheme": theme,
        "locale": "br"
    };

    // Create and append script element
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js';
    script.async = true;
    script.text = JSON.stringify(config);
    container.appendChild(script);
}

/**
 * Renders the TradingView Market Overview widget
 * @param {string} theme - 'light' or 'dark'
 * @param {string} targetContainerId - ID of the container element
 */
function renderMarketOverviewWidget(theme, targetContainerId = 'market-overview-widget-wrapper') {
    const container = document.getElementById(targetContainerId);
    if (!container) {
        console.error(`Market Overview widget container com ID "${targetContainerId}" não encontrado.`);
        if (targetContainerId === 'modal-market-overview-container' && modalContentArea) {
            modalContentArea.innerHTML = `
                <p class="error-commentary" style="padding:20px; text-align:center;">
                    <i class="fas fa-exclamation-triangle"></i> 
                    Container do widget de mercado não encontrado no modal.
                </p>
            `;
        }
        return;
    }

    // Clean up previous widget and skeleton
    const skeleton = container.querySelector('.tv-skeleton');
    if (skeleton) skeleton.style.display = 'none';
    
    let oldTvWidgetDiv = container.querySelector('.tradingview-widget-container');
    while (oldTvWidgetDiv) {
        oldTvWidgetDiv.remove();
        oldTvWidgetDiv = container.querySelector('.tradingview-widget-container');
    }

    // Widget configuration
    const config = {
        "colorTheme": theme,
        "dateRange": "12M",
        "showChart": true,
        "locale": "br",
        "largeChartUrl": "",
        "isTransparent": true,
        "showSymbolLogo": true,
        "showFloatingTooltip": false,
        "width": "100%",
        "height": "100%",
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

    {
        "title": "Índices Globais",
        "symbols": [
            { "s": "FOREXCOM:SPXUSD", "d": "S&P 500" },
            { "s": "FOREXCOM:NSXUSD", "d": "Nasdaq 100" },
            { "s": "FOREXCOM:DJI", "d": "Dow Jones" },
            { "s": "CME_MINI:RTY1!", "d": "Russell 2000" },
            { "s": "INDEX:DEU40", "d": "DAX" },
            { "s": "INDEX:SX5E", "d": "Euro Stoxx 50" },
            { "s": "FOREXCOM:UKXGBP", "d": "FTSE 100" },
            { "s": "INDEX:NKY", "d": "Nikkei 225" },
            { "s": "INDEX:SSEC", "d": "Shanghai" },
            { "s": "INDEX:HSI", "d": "Hang Seng" }
        ]
    },

    {
        "title": "Juros",
        "symbols": [
            { "s": "TVC:US02Y", "d": "US 2Y Yield" },
            { "s": "TVC:US10Y", "d": "US 10Y Yield" },
            { "s": "TVC:US30Y", "d": "US 30Y Yield" },
            { "s": "BMFBOVESPA:DI1!", "d": "DI 1 Ano" },
            { "s": "BMFBOVESPA:DI5!", "d": "DI 5 Anos" },
            { "s": "BMFBOVESPA:DI10!", "d": "DI 10 Anos" }
        ]
    },

    {
        "title": "Moedas",
        "symbols": [
            { "s": "TVC:DXY", "d": "DXY" },
            { "s": "FX_IDC:USDBRL", "d": "USD/BRL" },
            { "s": "FX:EURUSD", "d": "EUR/USD" },
            { "s": "FX:USDJPY", "d": "USD/JPY" }
        ]
    },

    {
        "title": "Commodities",
        "symbols": [
            { "s": "TVC:USOIL", "d": "Petróleo WTI" },
            { "s": "TVC:UKOIL", "d": "Petróleo Brent" },
            { "s": "OANDA:XAUUSD", "d": "Ouro" },
            { "s": "OANDA:XAGUSD", "d": "Prata" },
            { "s": "COMEX:HG1!", "d": "Cobre" },
            { "s": "TVC:TIO1!", "d": "Minério de Ferro" }
        ]
    },

    {
        "title": "Brasil",
        "symbols": [
            { "s": "BMFBOVESPA:IBOV", "d": "Ibovespa" },
            { "s": "BMFBOVESPA:WIN1!", "d": "Índice Futuro" },
            { "s": "BMFBOVESPA:WDO1!", "d": "Dólar Futuro" },
            { "s": "BMFBOVESPA:PETR4", "d": "Petrobras" },
            { "s": "BMFBOVESPA:VALE3", "d": "Vale" },
            { "s": "BMFBOVESPA:ITUB4", "d": "Itaú" },
            { "s": "BMFBOVESPA:BBDC4", "d": "Bradesco" }
        ]
    },

    {
        "title": "Cripto & Vol",
        "symbols": [
            { "s": "BITSTAMP:BTCUSD", "d": "Bitcoin" },
            { "s": "BITSTAMP:ETHUSD", "d": "Ethereum" },
            { "s": "CRYPTOCAP:BTC.D", "d": "BTC Dominância" },
            { "s": "CBOE:VIX", "d": "VIX" }
        ]
    }
]

    };

    // Create widget container and script
    const tvWidgetDiv = document.createElement('div');
    tvWidgetDiv.className = 'tradingview-widget-container';
    tvWidgetDiv.style.width = '100%';
    tvWidgetDiv.style.height = '100%';

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js';
    script.async = true;
    script.text = JSON.stringify(config);

    tvWidgetDiv.appendChild(script);
    container.appendChild(tvWidgetDiv);
}

/**
 * Loads the Economic Calendar widget
 */
function loadEconomicCalendarWidget() {
    const widgetContainer = document.getElementById('economicCalendarWidget');
    if (!widgetContainer) {
        console.error('Contêiner do Calendário Econômico não encontrado.');
        return;
    }

    widgetContainer.innerHTML = '';
    
    const currentThemeIsLight = document.body.classList.contains('light-mode');
    const widgetTheme = currentThemeIsLight ? 0 : 1;
    
    const config = {
        "width": "100%",
        "height": "100%",
        "mode": "1",
        "theme": widgetTheme,
        "lang": "pt"
    };

    const scriptTag = document.createElement('script');
    scriptTag.async = true;
    scriptTag.type = 'text/javascript';
    scriptTag.setAttribute('data-type', 'calendar-widget');
    scriptTag.text = JSON.stringify(config);
    scriptTag.src = 'https://www.tradays.com/c/js/widgets/calendar/widget.js?v=13';
    
    widgetContainer.appendChild(scriptTag);
}
