// Prévia visual isolada. Usa os arquivos reais do painel e dados demonstrativos.
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = fileURLToPath(new URL('../site/', import.meta.url));
const port = Number(process.env.PORT || 8788);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT deve ser uma porta válida.');
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

// Este código é inserido apenas pelo servidor de prévia, antes dos scripts do painel.
const bootstrap = `<script>
localStorage.setItem('trader_theme', 'dark');
localStorage.setItem('trader_active_tab', 'mesa-panel');
localStorage.setItem('trader_prefs_v1', JSON.stringify({mode:'terminal',startTab:'mesa-panel',motion:'off'}));
const previewFetch = window.fetch.bind(window);
window.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url || input, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) {
    return previewFetch('/__preview/data?path=' + encodeURIComponent(url.pathname) + '&symbols=' + encodeURIComponent(url.searchParams.get('symbols') || ''), {signal:init?.signal});
  }
  return previewFetch(input, init);
};
// A prévia visual usa HTTP local e não abre streams de produção.
window.WebSocket = class extends EventTarget {
  static CONNECTING=0; static OPEN=1; static CLOSING=2; static CLOSED=3;
  readyState=3; close(){} send(){}
};
</script>`;

const prices = { '^BVSP': [130500, .85], 'BRL=X': [5.15, -.32], 'DX-Y.NYB': [103.2, .24], '^GSPC': [5800, .62], '^IXIC': [18500, -.48], 'ES=F': [5820, .58], 'BZ=F': [78.4, -1.12], 'GC=F': [2700, .41], 'BTC-USD': [72000, 1.25] };
function sample(url) {
  const path = url.searchParams.get('path');
  if (path === '/quotes') return Object.fromEntries((url.searchParams.get('symbols') || '').split(',').filter(Boolean).map((symbol, i) => {
    const [price, change] = prices[symbol] || [100 + i * 13, i % 2 ? -.45 : .72];
    const now = Math.floor(Date.now() / 1000);
    return [symbol, { chart: { result: [{ meta: { regularMarketPrice: price, chartPreviousClose: price / (1 + change / 100), regularMarketTime: now, currency: 'USD' }, timestamp: [now - 7200, now - 3600, now], indicators: { quote: [{ close: [price * .99, price * 1.002, price] }] } }] } }];
  }));
  if (path === '/api/noticias') return [{ titulo: 'Prévia demonstrativa: bolsas, câmbio e juros no radar', fonte: 'Demonstração local', data: Date.now(), link: '#', resumo: 'Conteúdo fictício para avaliar a leitura do tema Terminal.', tags: ['Mercado'] }];
  if (path === '/api/assistente') return { ligado: false, assinante: false };
  return {};
}

const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__preview/data') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify(sample(url)));
  }
  // O service worker da versão publicada não é instalado nesta origem de teste.
  if (url.pathname === '/sw.js') { res.writeHead(404); return res.end(); }
  try {
    const file = resolve(site, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(resolve(site) + sep) || !statSync(file).isFile()) throw Error('Arquivo inexistente');
    res.setHeader('Content-Type', (types[extname(file)] || 'application/octet-stream') + (['.html', '.js', '.css'].includes(extname(file)) ? '; charset=utf-8' : ''));
    if (file.endsWith('index.html')) {
      const html = readFileSync(file, 'utf8').replace('<head>', '<head>' + bootstrap);
      return res.end(html.replace('</body>', '<div style="position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#ffcc00;color:#000;text-align:center;font:12px monospace;padding:5px">PRÉVIA LOCAL · DADOS DEMONSTRATIVOS · SEM COTAÇÕES REAIS</div></body>'));
    }
    res.end(readFileSync(file));
  } catch { res.writeHead(404); res.end('Arquivo não encontrado.'); }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'Porta ocupada. Feche a outra prévia ou defina PORT com outra porta.' : error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log('Prévia do tema Terminal: http://127.0.0.1:' + port);
  console.log('Dados demonstrativos. Não precisa de login, Wrangler ou chave de API.');
  console.log('Fontes, ícones e bibliotecas visuais precisam de internet. Ctrl+C encerra.');
});
