/* =========================================================
   CONFORTO VISUAL: cabeçalho "onde estou" no topo de cada aba (25/10/2026).
   Mostra o grupo da barra lateral, o nome da aba e uma linha dizendo para que ela serve.
   Estilo em conforto.css. Para desfazer: tirar este script e o conforto.css do index.html.
   ========================================================= */
(() => {
  const ABAS = {
    'market-panel': ['Visão geral', 'Mercado', 'Bolsas, juros, moedas, commodities e cripto pelo mundo, região por região.'],
    'mesa-panel': ['Visão geral', 'Mesa', 'Tudo numa tela só: índices, moedas, juros, curva e notícias.'],
    'watch-panel': ['Visão geral', 'Watchlist', 'Os ativos que você escolheu acompanhar.'],
    'heatmap-panel': ['Visão geral', 'Mapa de calor', 'O que sobe e o que cai hoje, com o tamanho de cada empresa.'],
    'news-panel': ['Informação', 'Notícias', 'As notícias do mercado, das mais importantes às mais recentes.'],
    'weekly-panel': ['Informação', 'Resumo semanal', 'O que aconteceu na semana, em poucos minutos de leitura.'],
    'calendar-panel': ['Informação', 'Calendário', 'Indicadores, decisões de juros e balanços que vêm por aí.'],
    'analysis-panel': ['Análise', 'Análises', 'Humor do mercado, destaques do dia e comparação entre ativos.'],
    'fund-panel': ['Análise', 'Fundamentos', 'Balanços das empresas da B3: lucro, dívida, dividendos e múltiplos.'],
    'indicators-panel': ['Ferramentas', 'Indicadores', 'A economia do Brasil e dos EUA: juros, inflação, atividade e comércio.'],
    'calculator-panel': ['Ferramentas', 'Calculadora', 'Contas de renda fixa, juros e investimentos, com taxas oficiais.'],
    'options-panel': ['Ferramentas', 'Opções', 'Monte estratégias com opções e veja ganho, perda e probabilidades.'],
  };
  Object.entries(ABAS).forEach(([id, [grupo, nome, txt]]) => {
    const p = document.getElementById(id);
    if (!p || p.querySelector(':scope > .cf-head')) return;
    const h = document.createElement('header');
    h.className = 'cf-head';
    h.innerHTML = `<div><span class="cf-grupo"></span><h1></h1><p></p></div>`;
    h.querySelector('.cf-grupo').textContent = grupo;
    h.querySelector('h1').textContent = nome;
    h.querySelector('p').textContent = txt;
    p.prepend(h);
    // alguns scripts montam a aba depois e colocam o conteúdo antes; o cabeçalho volta para o topo
    new MutationObserver(() => { if (p.firstElementChild !== h) p.prepend(h); }).observe(p, { childList: true });
  });
})();
