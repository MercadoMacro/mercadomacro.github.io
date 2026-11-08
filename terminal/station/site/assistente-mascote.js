/* =========================================================
   MASCOTE DO ASSISTENTE (07/11/2026, pedido do Severino)
   v4 "robô vivo": a imagem 3D de grafite e ouro do Severino separada em três camadas
   (robo-cabeca.webp, robo-corpo.webp, robo-braco.webp, visor já sem olhos) e os olhos e o
   sorriso desenhados por cima, para poderem se mexer.
   v5 "telas no visor": cotação de verdade (lida do yahooMemo do app.js), olhos de cifrão,
   gráfico subindo, pensando; reage à bolsa (sobe: concorda; cai: preocupado); susto; cochilo.
   v6 "útil" (as 7 ideias que o Severino escolheu):
   1. Notícia urgente: notícia de nível CRÍTICO nova (dos últimos 15 min) -> levanta a mão, "!" no
      visor e a manchete no balão; clicar no balão abre a notícia.
   2. Contagem para eventos: 10 min e 2 min antes de um evento de alto impacto do Calendário
      (EUA, zona do euro, China, Reino Unido, Brasil; Copom) -> relógio no visor e o nome no balão.
   3. Explique isso: selecionar um texto na tela -> "Quer que eu explique?"; o clique abre o
      Assistente com a pergunta escrita (não envia sozinho).
   4. Alerta da watchlist: ativo da lista com variação de 3% ou mais -> ticker no visor (uma vez
      por ativo, sentido e dia). Atualiza as cotações da lista no máximo a cada 5 min.
   5. Humor pela Temperatura do mercado (temperatura.js, quando já calculada): relaxado no
      risk-on, tenso (gota de suor) no risk-off; às vezes mostra a nota no visor.
   6. Sino do pregão: abertura da B3 (10h) e de Nova York (9h30 NY), fora de feriado; depois das
      17h30, o Ibovespa no fim do pregão. Uma vez por dia cada.
   7. Guia de abas: ao abrir uma aba, uma dica curta apontando com o braço (até 2 vezes por aba).
   Nada de número inventado: sem dado, a cena não acontece. Tudo pausa com a aba escondida.
   No celular (aba na borda) o botão antigo continua; com "reduzir movimento" fica parado.
   Para desfazer: tirar o <script> deste arquivo do index.html.
   ========================================================= */
(() => {
  const V = '?v=1';
  // o que um trader olha o dia todo (07/11/2026, pedido do Severino): bolsas, juros, moedas, commodities e cripto.
  // 4º campo: o robô reage (alegre na alta, preocupado na queda) só nas bolsas
  const ATIVOS = [
    ['^BVSP', 'IBOV', 'Ibovespa', 1], ['^GSPC', 'S&P 500', 'S&P 500', 1], ['BRL=X', 'DÓLAR', 'Dólar'], ['BZ=F', 'BRENT', 'Petróleo Brent'],
    ['^IXIC', 'NASDAQ', 'Nasdaq', 1], ['^N225', 'NIKKEI', 'Nikkei 225 (Japão)', 1], ['GC=F', 'OURO', 'Ouro'], ['DX-Y.NYB', 'DXY', 'DXY (dólar no mundo)'],
    ['^DJI', 'DOW', 'Dow Jones', 1], ['^GDAXI', 'DAX', 'DAX (Alemanha)', 1], ['CL=F', 'WTI', 'Petróleo WTI'], ['BTC-USD', 'BITCOIN', 'Bitcoin'],
    ['ES=F', 'S&P FUT', 'Futuro do S&P 500', 1], ['^HSI', 'HANG SENG', 'Hang Seng (Hong Kong)', 1], ['^VIX', 'VIX', 'VIX (medo)'],
    ['^STOXX50E', 'STOXX 50', 'Euro Stoxx 50', 1], ['SI=F', 'PRATA', 'Prata'], ['EURBRL=X', 'EURO', 'Euro'], ['ETH-USD', 'ETHER', 'Ethereum'],
  ];
  const PAIS = { USD: 'EUA', EUR: 'Zona do euro', CNY: 'China', GBP: 'Reino Unido', BRL: 'Brasil' };
  const DICAS = {
    'mesa-panel': 'Mesa: tudo numa tela só. No card da curva, o botão DI mostra a curva de juros.',
    'market-panel': 'Mercado: índices, moedas, cripto, juros e commodities. Clique num ativo para ver o histórico.',
    'watch-panel': 'Watchlist: monte suas listas de ativos. Eu aviso aqui quando um deles se mexer forte.',
    'heatmap-panel': 'Mapa de Calor: as cores mostram o que sobe e o que cai. Troque o período no topo.',
    'news-panel': 'Notícias: o modo Ao Vivo traz o fluxo em tempo real, e dá para destacar numa janela.',
    'weekly-panel': 'Resumo semanal: o que marcou a semana, num texto só.',
    'calendar-panel': 'Calendário: eventos de alto impacto e balanços. Eu aviso 10 min antes dos principais.',
    'analysis-panel': 'Análises: destaques no topo, comparador de ativos, Fed, fluxo na B3 e posições.',
    'indicators-panel': 'Indicadores: dados de Brasil, EUA e Europa, como inflação, juros e balança comercial.',
    'fund-panel': 'Fundamentos: números dos balanços das empresas.',
    'calculator-panel': 'Calculadora: simulações rápidas de juros e investimentos.',
    'edu-panel': 'Educação: lições curtas em trilhas. Pergunte para mim se ficar alguma dúvida.',
  };

  // coordenadas no espaço das camadas (326 x 302); visor interno ~ x 78-248, y 54-162
  const PET = `<svg class="pet" viewBox="0 0 326 302" aria-hidden="true">
    <defs>
      <filter id="petLuz" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <linearGradient id="petOlho" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".55" stop-color="#ffd86e"/><stop offset="1" stop-color="#f5b93c"/></linearGradient>
      <clipPath id="petVisor"><rect x="80" y="56" width="166" height="104" rx="32"/></clipPath>
    </defs>
    <g class="pet-tudo">
      <g class="pet-corpo"><image href="robo-corpo.webp${V}" width="326" height="302"/><image href="robo-casaco.webp?v=2" width="326" height="302"/></g>
      <g class="pet-braco"><image href="robo-braco.webp${V}" width="326" height="302"/><image href="robo-manga.webp${V}" width="326" height="302"/></g>
      <g class="pet-cabeca"><g class="pet-cabeca-in">
        <image href="robo-cabeca.webp${V}" width="326" height="302"/>
        <g class="pet-rosto" filter="url(#petLuz)" clip-path="url(#petVisor)">
          <g class="pet-face">
            <g class="pet-olhos">
              <g class="pet-olho po1">
                <rect class="aberto" x="107.5" y="89.5" width="17.5" height="34.3" rx="8.7" fill="url(#petOlho)"/>
                <path class="feliz" d="M105.5 110q10.7-13 21.5 0" fill="none" stroke="#ffd86e" stroke-width="5.5" stroke-linecap="round"/>
                <text class="cifrao" x="116.2" y="121" text-anchor="middle">$</text>
              </g>
              <g class="pet-olho po2">
                <rect class="aberto" x="199.5" y="89.5" width="17.5" height="34.3" rx="8.7" fill="url(#petOlho)"/>
                <path class="feliz" d="M197.5 110q10.7-13 21.5 0" fill="none" stroke="#ffd86e" stroke-width="5.5" stroke-linecap="round"/>
                <text class="cifrao" x="208.2" y="121" text-anchor="middle">$</text>
              </g>
            </g>
            <path class="pet-boca" d="M149 131q13.5 9 27 0" fill="none" stroke="#ffd86e" stroke-width="5" stroke-linecap="round"/>
            <g class="pet-pensa" fill="#ffd86e"><circle cx="150" cy="135" r="3.6"/><circle cx="163" cy="135" r="3.6"/><circle cx="176" cy="135" r="3.6"/></g>
          </g>
          <g class="pet-tela pet-cot">
            <text class="cot-nome" x="163" y="83" text-anchor="middle"></text>
            <text class="cot-var" x="163" y="114" text-anchor="middle"></text>
            <path class="cot-linha" d="" fill="none" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>
          </g>
          <g class="pet-tela pet-graf" fill="none" stroke="#ffd86e" stroke-linecap="round" stroke-linejoin="round">
            <path class="graf-eixo" d="M96 148H232" stroke-width="2" opacity=".45"/>
            <path class="graf-linha" d="M100 140L124 126L144 133L170 108L192 116L222 80" stroke-width="5"/>
            <path class="graf-seta" d="M207 80H222V95" stroke-width="5"/>
          </g>
          <g class="pet-tela pet-alerta">
            <circle cx="163" cy="106" r="34" fill="none" stroke="#ffb020" stroke-width="5"/>
            <path d="M163 86v26" stroke="#ffb020" stroke-width="8" stroke-linecap="round"/>
            <circle cx="163" cy="125" r="4.8" fill="#ffb020"/>
          </g>
          <g class="pet-tela pet-relogio">
            <circle cx="163" cy="92" r="24" fill="none" stroke="#ffd86e" stroke-width="4.5"/>
            <path class="rel-min" d="M163 92V75" stroke="#ffd86e" stroke-width="4" stroke-linecap="round"/>
            <path d="M163 92h10" stroke="#ffd86e" stroke-width="4" stroke-linecap="round"/>
            <text class="rel-txt" x="163" y="146" text-anchor="middle"></text>
          </g>
          <g class="pet-tela pet-sino">
            <g class="sino" fill="#ffd86e">
              <path d="M163 70c-14 0-22 10-22 24v14l-7 9h58l-7-9V94c0-14-8-24-22-24z"/>
              <circle cx="163" cy="122" r="5.5"/><rect x="160" y="64" width="6" height="7" rx="2"/>
            </g>
            <text class="sino-txt" x="163" y="148" text-anchor="middle"></text>
          </g>
          <g class="pet-tela pet-txt">
            <text class="txt-1" x="163" y="88" text-anchor="middle"></text>
            <text class="txt-2" x="163" y="128" text-anchor="middle"></text>
          </g>
        </g>
        <path class="pet-suor" d="M246 70q-5 8-5 11a5 5 0 0 0 10 0q0-3-5-11z" fill="#8fd3ff"/>
        <g class="pet-zz" fill="#ffd86e"><text x="236" y="58">z</text><text x="250" y="40">z</text></g>
      </g></g>
    </g>
  </svg>`;

  const css = `
  @media (min-width:901px) {
    #ia-fab.ia-pet-on { padding:0; gap:0; border:0; background:transparent; box-shadow:none; border-radius:0; overflow:visible; }
    #ia-fab.ia-pet-on:hover { transform:none; }
    #ia-fab.ia-pet-on .ia-marca, #ia-fab.ia-pet-on .ia-fab-txt { display:none; }
    #ia-fab .ia-pet { display:block; position:relative; width:100px; height:100px; }
    #ia-fab .pet { position:absolute; left:0; top:0; width:100px; height:93px; overflow:visible; filter:drop-shadow(0 8px 14px rgba(0,0,0,.45)); }
    #ia-fab .ia-pet-sombra { position:absolute; left:24px; bottom:0; width:54px; height:6px; border-radius:50%; background:rgba(0,0,0,.4); filter:blur(2px); animation:pet-sombra 3.2s ease-in-out infinite; }
    #ia-fab .pet-tudo { animation:pet-flutua 3.2s ease-in-out infinite; }
    #ia-fab .pet-corpo { transform-box:view-box; transform-origin:163px 300px; animation:pet-respira 3.2s ease-in-out infinite; }
    #ia-fab .ia-pet.humor-off .pet-corpo { animation-duration:1.9s; }
    #ia-fab .ia-pet.humor-on .pet-tudo, #ia-fab .ia-pet.humor-on .ia-pet-sombra { animation-duration:4.2s; }
    #ia-fab .pet-cabeca { transform-box:view-box; transform-origin:163px 186px; transform:rotate(var(--hr,0deg)) translate(var(--hx,0px),0); transition:transform .5s cubic-bezier(.3,1.4,.5,1); }
    #ia-fab .pet-cabeca-in { transform-box:view-box; transform-origin:163px 186px; animation:pet-balanca 6.4s ease-in-out infinite; }
    #ia-fab .ia-pet.concorda .pet-cabeca-in { animation:pet-sim .5s ease-in-out 3; }
    #ia-fab .ia-pet.nega .pet-cabeca-in { animation:pet-nao .5s ease-in-out 3; }
    #ia-fab .ia-pet.susto .pet-tudo { animation:pet-susto .45s ease-out; }
    #ia-fab .pet-braco { transform-box:view-box; transform-origin:62px 246px; transition:transform .45s cubic-bezier(.3,1.4,.5,1); }
    #ia-fab .pet-braco.acena { animation:pet-acena .55s ease-in-out 4; }
    #ia-fab .ia-pet.mao-alto .pet-braco { transform:rotate(-16deg) translateY(-6px); }
    #ia-fab .ia-pet.aponta .pet-braco { transform:rotate(-38deg); }
    #ia-fab:hover .pet-braco { animation:pet-acena .55s ease-in-out infinite; }
    #ia-fab .pet-olhos { transform:translate(calc(var(--ex,0) * 1px), calc(var(--ey,0) * 1px)); transition:transform .18s ease-out; }
    #ia-fab .pet-olho { transform-box:fill-box; transform-origin:center; transition:transform .07s; }
    #ia-fab .pet-olho .feliz, #ia-fab .pet-olho .cifrao, #ia-fab .pet-pensa, #ia-fab .pet-tela, #ia-fab .pet-zz text, #ia-fab .pet-suor { opacity:0; }
    #ia-fab .pet-olho .cifrao { fill:url(#petOlho); font:800 46px/1 system-ui, sans-serif; }
    #ia-fab .pet-face, #ia-fab .pet-tela { transition:opacity .35s; }
    #ia-fab .ia-pet.pisca .pet-olho, #ia-fab .ia-pet.pisca1 .po2 { transform:scaleY(.08); }
    #ia-fab .ia-pet.pisca1 .po1 { transform:none; }
    #ia-fab .ia-pet.feliz .aberto, #ia-fab:hover .aberto { opacity:0; }
    #ia-fab .ia-pet.feliz .feliz, #ia-fab:hover .feliz { opacity:1; }
    #ia-fab .ia-pet.feliz .pet-olho, #ia-fab:hover .pet-olho { transform:none; }
    #ia-fab .pet-boca { transition:d .25s; }
    #ia-fab .ia-pet.humor-on .pet-boca { d:path("M146 130q17 12 34 0"); }
    #ia-fab .ia-pet.humor-off .pet-boca { d:path("M150 134q13 2 26 0"); }
    #ia-fab .ia-pet.humor-off .pet-olho { transform:scaleY(.82); }
    #ia-fab .ia-pet.humor-off .pet-suor { animation:pet-suor 5s ease-in 1.5s infinite; }
    #ia-fab:hover .pet-boca, #ia-fab .ia-pet.feliz .pet-boca, #ia-fab .ia-pet.m-cifrao .pet-boca { d:path("M144 129q18.5 15 37 0"); }
    /* olhos de cifrão */
    #ia-fab .ia-pet.m-cifrao .aberto, #ia-fab .ia-pet.m-cifrao .feliz { opacity:0 !important; }
    #ia-fab .ia-pet.m-cifrao .cifrao { opacity:1; animation:pet-pulsa .6s ease-in-out infinite alternate; transform-box:fill-box; transform-origin:center; }
    /* telas no lugar do rosto */
    #ia-fab .ia-pet[class*=" t-"] .pet-face { opacity:0; }
    #ia-fab .ia-pet.t-cot .pet-cot, #ia-fab .ia-pet.t-graf .pet-graf, #ia-fab .ia-pet.t-alerta .pet-alerta,
    #ia-fab .ia-pet.t-relogio .pet-relogio, #ia-fab .ia-pet.t-sino .pet-sino, #ia-fab .ia-pet.t-txt .pet-txt { opacity:1; }
    #ia-fab .cot-nome, #ia-fab .txt-1 { fill:#ffd86e; font:700 19px/1 system-ui, sans-serif; letter-spacing:1.5px; }
    #ia-fab .cot-var { font:800 28px/1 system-ui, sans-serif; }
    #ia-fab .txt-2 { fill:#ffd86e; font:800 38px/1 system-ui, sans-serif; }
    #ia-fab .rel-txt, #ia-fab .sino-txt { fill:#ffd86e; font:800 21px/1 system-ui, sans-serif; letter-spacing:1px; }
    #ia-fab .pet-cot.sobe .cot-var, #ia-fab .pet-txt.sobe .txt-2 { fill:#3ee08f; } #ia-fab .pet-cot.sobe .cot-linha { stroke:#3ee08f; }
    #ia-fab .pet-cot.cai .cot-var, #ia-fab .pet-txt.cai .txt-2 { fill:#ff6b6b; } #ia-fab .pet-cot.cai .cot-linha { stroke:#ff6b6b; }
    #ia-fab .ia-pet.t-cot .cot-linha, #ia-fab .ia-pet.t-graf .graf-linha { stroke-dasharray:400; animation:pet-desenha 1.4s ease-out both; }
    #ia-fab .ia-pet.t-graf .graf-seta { animation:pet-aparece .3s 1.2s both; }
    #ia-fab .ia-pet.t-alerta .pet-alerta { animation:pet-alerta .5s steps(2) infinite; }
    #ia-fab .ia-pet.t-relogio .rel-min { transform-box:view-box; transform-origin:163px 92px; animation:pet-gira 2s linear infinite; }
    #ia-fab .ia-pet.t-sino .sino { transform-box:view-box; transform-origin:163px 66px; animation:pet-sino .35s ease-in-out 6 alternate; }
    /* cara preocupada, susto, pensando, cochilo */
    #ia-fab .ia-pet.pensa .pet-pensa { opacity:1; } #ia-fab .ia-pet.pensa .pet-boca { opacity:0; }
    #ia-fab .pet-pensa circle { animation:pet-ponto 1s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
    #ia-fab .pet-pensa circle:nth-child(2) { animation-delay:.15s; } #ia-fab .pet-pensa circle:nth-child(3) { animation-delay:.3s; }
    #ia-fab .ia-pet.triste .pet-boca { d:path("M150 137q13 -8 26 0"); }
    #ia-fab .ia-pet.triste .po1 { transform:rotate(12deg) scaleY(.8); } #ia-fab .ia-pet.triste .po2 { transform:rotate(-12deg) scaleY(.8); }
    #ia-fab .ia-pet.surpreso .pet-olho { transform:scale(1.22); }
    #ia-fab .ia-pet.surpreso .pet-boca { d:path("M156 135a7 7 0 1 0 14 0a7 7 0 1 0 -14 0"); }
    #ia-fab .ia-pet.m-sono .pet-olho { transform:scaleY(.1); }
    #ia-fab .ia-pet.m-sono .pet-boca { d:path("M155 134q8 3 16 0"); }
    #ia-fab .ia-pet.m-sono .pet-cabeca-in { animation:pet-cochila 4s ease-in-out infinite; }
    #ia-fab .ia-pet.m-sono .pet-zz text { animation:pet-zz 2.4s ease-out infinite; font:800 22px/1 system-ui, sans-serif; }
    #ia-fab .ia-pet.m-sono .pet-zz text + text { animation-delay:1.2s; }
    /* balão */
    #ia-fab .ia-pet-fala { position:absolute; right:calc(100% + 2px); top:14px; white-space:nowrap; padding:7px 11px; border-radius:12px 12px 4px 12px;
      background:var(--surface,#fff); color:var(--text); border:1px solid var(--line-2,#ddd); box-shadow:0 8px 22px rgba(0,0,0,.28);
      font-size:12.5px; font-weight:700; line-height:1.25; text-align:left; opacity:0; transform:translateX(6px); transition:opacity .2s, transform .2s; pointer-events:none; }
    #ia-fab .ia-pet-fala.longo { white-space:normal; width:max-content; max-width:270px; }
    #ia-fab .ia-pet-fala small { display:block; font-weight:400; font-size:11px; color:var(--text-3,#888); margin-top:2px; }
    #ia-fab .ia-pet-fala .sobe { color:var(--pos,#16c784); } #ia-fab .ia-pet-fala .cai { color:var(--neg,#ea3943); }
    #ia-fab .ia-pet-fala .acao { display:block; margin-top:5px; font-size:11.5px; color:var(--accent,#f2b92e); text-decoration:underline; text-underline-offset:2px; }
    #ia-fab .ia-pet-fala .urg { display:inline-block; font-size:10px; letter-spacing:.6px; text-transform:uppercase; color:#fff; background:var(--neg,#ea3943); border-radius:4px; padding:1px 5px; margin-right:5px; vertical-align:1px; }
    #ia-fab:hover .ia-pet-fala, #ia-fab:focus-visible .ia-pet-fala, #ia-fab.ia-pet-oi .ia-pet-fala { opacity:1; transform:none; }
    #ia-fab.ia-pet-clica .ia-pet-fala { pointer-events:auto; cursor:pointer; }
    #ia-fab.ia-pet-clica .ia-pet-fala:hover { border-color:var(--accent,#f2b92e); }
  }
  @media (max-width:900px) { #ia-fab .ia-pet { display:none; } }
  /* arrastar (computador) */
  #ia-fab.ia-pet-arrastando { cursor:grabbing !important; transition:none !important; }
  #ia-fab.ia-pet-arrastando .ia-pet-fala { opacity:0 !important; }
  #ia-fab.ia-pet-esq .ia-pet-fala { right:auto; left:calc(100% + 2px); border-radius:12px 12px 12px 4px; transform:translateX(-6px); }
  #ia-fab.ia-pet-baixo .ia-pet-fala { top:auto; bottom:14px; }
  /* versão pequena no celular e tablet: robô dentro da aba da borda, só pisca e acena */
  #ia-fab .ia-pet-mini { display:none; }
  @media (max-width:900px) {
    #ia-fab.ia-pet-on .ia-marca { display:none !important; }
    #ia-fab .ia-pet-mini { display:block; flex:0 0 38px; width:38px; height:36px; margin:0 -2px 0 -4px; }
    #ia-fab .ia-pet-mini svg { width:38px; height:36px; overflow:visible; }
    #ia-fab .mini-olho { transform-box:fill-box; transform-origin:center; animation:pet-mini-pisca 4.3s infinite; }
    #ia-fab .mini-braco { transform-box:view-box; transform-origin:62px 246px; animation:pet-mini-acena 9s ease-in-out infinite 2s; }
  }
  @media (max-width:900px) and (prefers-reduced-motion: reduce) { #ia-fab .mini-olho, #ia-fab .mini-braco { animation:none; } }
  @keyframes pet-mini-pisca { 0%,92%,100% { transform:scaleY(1); } 94%,96% { transform:scaleY(.1); } }
  @keyframes pet-mini-acena { 0%,80%,100% { transform:rotate(0); } 83% { transform:rotate(-14deg); } 86% { transform:rotate(8deg); } 89% { transform:rotate(-14deg); } 92% { transform:rotate(8deg); } 95% { transform:rotate(0); } }
  @media (prefers-reduced-motion: reduce) {
    #ia-fab .pet-tudo, #ia-fab .pet-corpo, #ia-fab .ia-pet-sombra, #ia-fab .pet-cabeca-in, #ia-fab .pet-braco { animation:none !important; }
    #ia-fab .pet-cabeca, #ia-fab .pet-olhos { transition:none; }
  }
  @keyframes pet-flutua { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-4px); } }
  @keyframes pet-sombra { 0%,100% { transform:scaleX(1); opacity:1; } 50% { transform:scaleX(.82); opacity:.65; } }
  @keyframes pet-respira { 0%,100% { transform:scale(1,1); } 50% { transform:scale(1.012,.985); } }
  @keyframes pet-balanca { 0%,100% { transform:rotate(0); } 25% { transform:rotate(-2.2deg); } 50% { transform:rotate(0); } 75% { transform:rotate(1.8deg); } }
  @keyframes pet-acena { 0%,100% { transform:rotate(0); } 30% { transform:rotate(-13deg); } 70% { transform:rotate(9deg); } }
  @keyframes pet-sim { 0%,100% { transform:translateY(0) rotate(0); } 50% { transform:translateY(5px) rotate(1deg); } }
  @keyframes pet-nao { 0%,100% { transform:rotate(0); } 30% { transform:rotate(-5deg); } 70% { transform:rotate(5deg); } }
  @keyframes pet-susto { 0% { transform:translateY(0); } 40% { transform:translateY(-9px) scale(1.03); } 100% { transform:translateY(0); } }
  @keyframes pet-cochila { 0%,100% { transform:rotate(-4deg) translateY(2px); } 50% { transform:rotate(-7deg) translateY(5px); } }
  @keyframes pet-zz { 0% { opacity:0; transform:translate(0,0); } 30% { opacity:1; } 100% { opacity:0; transform:translate(10px,-18px); } }
  @keyframes pet-suor { 0% { opacity:0; transform:translateY(0); } 15% { opacity:.9; } 60% { opacity:.9; transform:translateY(14px); } 75%,100% { opacity:0; transform:translateY(20px); } }
  @keyframes pet-pulsa { from { transform:scale(1); } to { transform:scale(1.14); } }
  @keyframes pet-desenha { from { stroke-dashoffset:400; } to { stroke-dashoffset:0; } }
  @keyframes pet-ponto { 0%,100% { transform:translateY(0); opacity:.5; } 50% { transform:translateY(-5px); opacity:1; } }
  @keyframes pet-aparece { from { opacity:0; } to { opacity:1; } }
  @keyframes pet-alerta { 0% { opacity:1; } 100% { opacity:.35; } }
  @keyframes pet-gira { to { transform:rotate(360deg); } }
  @keyframes pet-sino { from { transform:rotate(-14deg); } to { transform:rotate(14deg); } }`;

  const parado = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sorte = (a, b) => a + Math.random() * (b - a);
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pct = (v) => (v > 0 ? '+' : '') + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  const corta = (t, n) => { t = String(t).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
  // relógio de uma bolsa: { dia: 'AAAA-MM-DD', min: minutos desde 0h, sem: 0-6 }
  const agora = (tz) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { dia: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute, sem: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
  };
  // memória do que já foi mostrado (uma vez por dia/evento), só neste navegador
  const MEM_KEY = 'mm_robo_v1';
  const mem = (() => { try { const m = JSON.parse(localStorage.getItem(MEM_KEY) || '{}'); return m && typeof m === 'object' ? m : {}; } catch (e) { return {}; } })();
  const memSalva = () => { try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch (e) { /* sem armazenamento */ } };
  const jaFoi = (k) => !!(mem.vistos && mem.vistos[k]);
  const marca = (k) => {
    mem.vistos = mem.vistos || {}; mem.vistos[k] = Date.now();
    // guarda só os últimos 3 dias
    Object.keys(mem.vistos).forEach((x) => { if (Date.now() - mem.vistos[x] > 3 * 864e5) delete mem.vistos[x]; });
    memSalva();
  };

  // dados que o terminal já carregou; sem dado válido, null
  function cotacao(sym) {
    try {
      const memo = (typeof yahooMemo !== 'undefined' && yahooMemo) || null;
      const d = memo && memo[sym];
      return d && isFinite(d.change) && isFinite(d.value) ? d : null;
    } catch (e) { return null; }
  }
  const noticias = () => { try { return (typeof newsAll !== 'undefined' && Array.isArray(newsAll)) ? newsAll : []; } catch (e) { return []; } };
  const agenda = () => { try { return (typeof calFeed !== 'undefined' && Array.isArray(calFeed)) ? calFeed : []; } catch (e) { return []; } };

  // robô pequeno (celular e tablet): mesmas camadas, olhos simples, sem filtro
  const MINI = `<svg viewBox="0 0 326 302" aria-hidden="true">
    <image href="robo-corpo.webp${V}" width="326" height="302"/><image href="robo-casaco.webp?v=2" width="326" height="302"/>
    <g class="mini-braco"><image href="robo-braco.webp${V}" width="326" height="302"/><image href="robo-manga.webp${V}" width="326" height="302"/></g>
    <image href="robo-cabeca.webp${V}" width="326" height="302"/>
    <rect class="mini-olho" x="107.5" y="89.5" width="17.5" height="34.3" rx="8.7" fill="#ffd86e"/>
    <rect class="mini-olho" x="199.5" y="89.5" width="17.5" height="34.3" rx="8.7" fill="#ffd86e"/>
    <path d="M149 131q13.5 9 27 0" fill="none" stroke="#ffd86e" stroke-width="7" stroke-linecap="round"/>
  </svg>`;
  const PREFS_KEY = 'trader_prefs_v1';
  const prefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) { return {}; } };
  // voz (opcional, desligada por padrão; liga em Ajustes > Meu painel > Assistente)
  // suave: um pouco mais lenta, volume menor e, quando o navegador tem, uma voz "natural" (neural)
  const VOZ_BOA = [/natural/i, /online/i, /francisca|thalita|antonio/i, /google.*portugu/i, /luciana|felipe/i, /maria|daniel|helo/i];
  function vozesPt() { try { return speechSynthesis.getVoices().filter((x) => /^pt(-|_)?BR/i.test(x.lang) || /^pt$/i.test(x.lang)); } catch (e) { return []; } }
  function escolheVoz() {
    const lista = vozesPt(); if (!lista.length) return null;
    const nome = prefs().roboVozNome;
    if (nome) { const v = lista.find((x) => x.name === nome); if (v) return v; }
    for (const re of VOZ_BOA) { const v = lista.find((x) => re.test(x.name)); if (v) return v; }
    return lista[0];
  }
  function dizerAlto(texto) {
    try {
      if (!('speechSynthesis' in window)) return false;
      const u = new SpeechSynthesisUtterance(String(texto).slice(0, 260));
      u.lang = 'pt-BR'; u.rate = 0.92; u.pitch = 1.05; u.volume = 0.85;
      const v = escolheVoz(); if (v) u.voice = v;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }
  // as vozes chegam depois de a página abrir em alguns navegadores
  try { speechSynthesis.getVoices(); speechSynthesis.addEventListener?.('voiceschanged', () => {}); } catch (e) { /* sem voz */ }
  const falar = (texto) => prefs().roboVoz === true && dizerAlto(texto);
  window.MMRoboVoz = { falar: dizerAlto, tem: () => 'speechSynthesis' in window, vozes: () => vozesPt().map((x) => x.name), atual: () => escolheVoz()?.name || '' };

  function ligar(b) {
    if (b.querySelector('.ia-pet')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.append(st);
    const s = document.createElement('span');
    s.className = 'ia-pet';
    const FALA = 'Jade<small>Sua assistente de mercado</small>';
    s.innerHTML = '<span class="ia-pet-fala">' + FALA + '</span><span class="ia-pet-sombra"></span>' + PET;
    b.prepend(s);
    const mini = document.createElement('span'); mini.className = 'ia-pet-mini'; mini.innerHTML = MINI;
    b.prepend(mini);
    b.classList.add('ia-pet-on');
    b.title = 'Jade, a assistente IA do Mercado Macro';
    const fala = s.querySelector('.ia-pet-fala');
    const braco = s.querySelector('.pet-braco');
    const $ = (sel) => s.querySelector(sel);
    const vivo = () => !parado() && !document.hidden && s.offsetParent !== null;
    const emCima = () => b.matches(':hover');
    const classe = (c, ms) => { s.classList.add(c); setTimeout(() => s.classList.remove(c), ms); };
    const tela = (t) => { s.className = s.className.replace(/\s?t-\w+/g, ''); if (t) s.classList.add('t-' + t); };
    let ocupado = false;

    // ---- olhar ----
    const olhar = (dx, dy) => {
      s.style.setProperty('--ex', (dx * 9).toFixed(2));
      s.style.setProperty('--ey', (dy * 6).toFixed(2));
      s.style.setProperty('--hr', (dx * 3.5).toFixed(2) + 'deg');
      s.style.setProperty('--hx', (dx * 2).toFixed(2) + 'px');
    };
    const olharPara = (x, y) => {
      const r = s.getBoundingClientRect(); if (!r.width) return null;
      const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height * .35), d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 260);
      olhar(dx / d * k, dy / d * k); return d;
    };
    let ultimoMouse = Date.now(), pend = false, mx = 0, my = 0, longe = true, travaOlhar = 0;
    addEventListener('pointermove', (e) => {
      mx = e.clientX; my = e.clientY; ultimoMouse = Date.now();
      if (s.classList.contains('m-sono')) acordar();
      if (pend || parado()) return; pend = true;
      requestAnimationFrame(() => {
        pend = false;
        if (Date.now() < travaOlhar) return;
        const d = olharPara(mx, my);
        if (d == null) return;
        if (d < 130 && longe && !ocupado && vivo()) { classe('surpreso', 650); classe('susto', 460); }
        longe = d > 220;
      });
    }, { passive: true });
    (function passeia() {
      setTimeout(() => {
        if (vivo() && Date.now() - ultimoMouse > 2500 && Date.now() > travaOlhar && !emCima() && !s.classList.contains('m-sono')) {
          const alvos = [[0, 0], [-1, 0], [1, 0], [-.7, -.6], [.7, -.6], [0, .5], [-.4, .3]];
          const [x, y] = alvos[Math.floor(Math.random() * alvos.length)];
          olhar(x, y);
        }
        passeia();
      }, sorte(1400, 3200));
    })();

    // ---- piscar ----
    const fecha = (c, ms) => new Promise((ok) => { s.classList.add(c); setTimeout(() => { s.classList.remove(c); setTimeout(ok, 90); }, ms); });
    (function pisca() {
      setTimeout(async () => {
        if (vivo() && !emCima() && !ocupado && !s.classList.contains('m-sono')) {
          const t = Math.random();
          if (t < .15) await fecha('pisca1', 260);
          else { await fecha('pisca', 110); if (t > .75) await fecha('pisca', 110); }
        }
        pisca();
      }, sorte(2200, 5200));
    })();

    // ---- balão (opcionalmente clicável) ----
    let acaoFala = null, falaTimer = 0;
    const dizer = (html, ms, acao, longo) => {
      clearTimeout(falaTimer);
      fala.innerHTML = html; fala.classList.toggle('longo', !!longo);
      // balão comprido com o robô na metade de baixo da tela: cresce para cima, senão sai da tela
      { const r = b.getBoundingClientRect(); if (r.width) b.classList.toggle('ia-pet-baixo', r.top > innerHeight - 150 || (!!longo && r.top > innerHeight / 2)); }
      acaoFala = acao || null; b.classList.toggle('ia-pet-clica', !!acao);
      b.classList.add('ia-pet-oi');
      falaTimer = setTimeout(calar, ms);
    };
    function calar() {
      clearTimeout(falaTimer);
      b.classList.remove('ia-pet-oi', 'ia-pet-clica'); acaoFala = null;
      setTimeout(() => { if (!b.classList.contains('ia-pet-oi')) { fala.innerHTML = FALA; fala.classList.remove('longo'); } }, 250);
    }
    // o balão fica dentro do botão: o clique nele não pode abrir o painel
    fala.addEventListener('click', (e) => {
      if (!acaoFala) return;
      e.preventDefault(); e.stopPropagation();
      const f = acaoFala; calar(); f();
    });

    // ---- cenas e fila ----
    const acenar = () => { braco.classList.remove('acena'); void braco.getBoundingClientRect(); braco.classList.add('acena'); };
    braco.addEventListener('animationend', () => braco.classList.remove('acena'));
    let fimCena = 0;
    const cena = (fn, ms) => { ocupado = true; fn(); clearTimeout(fimCena); fimCena = setTimeout(() => { ocupado = false; }, ms); };
    const fila = []; // { pri, fn, chave }
    const pedir = (pri, fn, chave) => { if (chave && fila.some((x) => x.chave === chave)) return; fila.push({ pri, fn, chave }); fila.sort((a, z) => z.pri - a.pri); };
    setInterval(() => {
      if (!fila.length || ocupado || !vivo() || emCima()) return;
      if (s.classList.contains('m-sono')) { if (fila[0].pri < 5) return; acordar(); }
      fila.shift().fn();
    }, 700);

    function mostraAtivo(curto, nome, d, reage, extra) {
      const cot = $('.pet-cot');
      const sobe = d.change >= 0;
      const cn = cot.querySelector('.cot-nome');
      cn.textContent = curto;
      if (curto.length > 7) { cn.setAttribute('textLength', '146'); cn.setAttribute('lengthAdjust', 'spacingAndGlyphs'); } else { cn.removeAttribute('textLength'); cn.removeAttribute('lengthAdjust'); }
      cot.querySelector('.cot-var').textContent = (sobe ? '▲ ' : '▼ ') + pct(Math.abs(d.change)).replace('+', '');
      cot.classList.toggle('sobe', sobe); cot.classList.toggle('cai', !sobe);
      const sp = (d.sparkline || []).filter(isFinite);
      let path = '';
      if (sp.length > 3) {
        const mn = Math.min(...sp), mxv = Math.max(...sp), amp = (mxv - mn) || 1;
        path = sp.map((v, j) => (j ? 'L' : 'M') + (96 + j * 134 / (sp.length - 1)).toFixed(1) + ' ' + (150 - (v - mn) / amp * 26).toFixed(1)).join('');
      }
      cot.querySelector('.cot-linha').setAttribute('d', path);
      cena(() => {
        tela('cot');
        dizer((extra || '') + '<b>' + esc(nome) + '</b> <span class="' + (sobe ? 'sobe' : 'cai') + '">' + esc(pct(d.change)) + '</span>' +
          (d.date ? '<small>Dado de ' + esc(d.date) + '</small>' : ''), 4600);
        setTimeout(() => {
          tela('');
          if (reage) { if (sobe) { classe('feliz', 1600); classe('concorda', 1600); } else { classe('triste', 1800); classe('nega', 1600); } }
        }, 4600);
      }, 6600);
    }

    let vezAtivo = 0;
    function cenaCotacao() {
      for (let i = 0; i < ATIVOS.length; i++) {
        const [sym, curto, nome, reage] = ATIVOS[(vezAtivo + i) % ATIVOS.length];
        const d = cotacao(sym);
        if (!d) continue;
        vezAtivo += i + 1;
        mostraAtivo(curto, nome, d, !!reage);
        return true;
      }
      return false;
    }
    function cenaTemperatura() {
      const t = window.MMTemp && MMTemp.atual && MMTemp.atual();
      if (!t || !Number.isFinite(t.temp) || Date.now() - t.quando > 20 * 60000) return false;
      const f = MMTemp.faixa(t.temp);
      const box = $('.pet-txt');
      box.querySelector('.txt-1').textContent = 'TEMPERATURA';
      box.querySelector('.txt-2').textContent = String(t.temp);
      box.classList.toggle('sobe', t.temp > 60); box.classList.toggle('cai', t.temp < 40);
      cena(() => { tela('txt'); dizer('<b>Temperatura do mercado: ' + esc(t.temp) + '</b><small>' + esc(f.nome) + ' · escala de 0 a 100</small>', 4200); setTimeout(() => tela(''), 4200); }, 5600);
      return true;
    }
    const cenas = {
      cotacao: cenaCotacao,
      temperatura: cenaTemperatura,
      cifrao: () => { cena(() => { s.classList.add('m-cifrao'); setTimeout(() => s.classList.remove('m-cifrao'), 2600); }, 2800); return true; },
      grafico: () => { cena(() => { tela('graf'); setTimeout(() => { tela(''); classe('feliz', 1200); }, 3000); }, 4300); return true; },
      aceno: () => { cena(acenar, 2300); return true; },
      feliz: () => { cena(() => classe('feliz', 1600), 1700); return true; },
      pensa: () => { cena(() => { s.classList.add('pensa'); olhar(.6, -.9); setTimeout(() => s.classList.remove('pensa'), 2200); }, 2300); return true; },
    };
    const SORTEIO = [['cotacao', 46], ['temperatura', 9], ['cifrao', 10], ['grafico', 9], ['aceno', 11], ['feliz', 8], ['pensa', 7]];
    (function roteiro() {
      setTimeout(() => {
        if (vivo() && !emCima() && !ocupado && !fila.length && !s.classList.contains('m-sono')) {
          let r = Math.random() * 100, nome = 'aceno';
          for (const [n, p] of SORTEIO) { if ((r -= p) < 0) { nome = n; break; } }
          if (!cenas[nome]()) cenas.aceno();
        }
        roteiro();
      }, sorte(8000, 13000));
    })();

    // ---- cochilo ----
    function acordar() { s.classList.remove('m-sono'); classe('surpreso', 700); classe('susto', 460); }
    setInterval(() => {
      if (vivo() && !ocupado && !fila.length && !emCima() && Date.now() - ultimoMouse > 60000) { s.classList.add('m-sono'); olhar(0, .4); }
    }, 5000);
    b.addEventListener('mouseenter', () => { s.classList.remove('m-sono'); });

    // ===== 1. notícia urgente =====
    const vistasNoticia = new Set(noticias().map((n) => n.id));
    function olhaNoticias() {
      const novas = noticias().filter((n) => n && n.id != null && !vistasNoticia.has(n.id));
      novas.forEach((n) => vistasNoticia.add(n.id));
      novas.filter((n) => n.nivel === 'CRITICO' && Date.now() - n.data < 15 * 60000 && !jaFoi('n:' + n.id))
        .sort((a, z) => z.data - a.data).slice(0, 2).reverse()
        .forEach((n) => pedir(9, () => {
          if (jaFoi('n:' + n.id)) return;
          marca('n:' + n.id);
          const abre = () => { if (typeof window.openNewsReader === 'function') window.openNewsReader(n.id); else if (n.link) window.open(n.link, '_blank', 'noopener'); };
          cena(() => {
            tela('alerta'); s.classList.add('mao-alto'); classe('surpreso', 900);
            dizer('<span class="urg">Urgente</span>' + esc(corta(n.titulo, 140)) + '<small>' + esc(n.fonte || '') + '</small><span class="acao">Ler a notícia</span>', 9000, abre, true);
            setTimeout(() => { tela(''); s.classList.remove('mao-alto'); }, 6000);
            falar('Notícia urgente. ' + n.titulo);
          }, 9200);
        }, 'n:' + n.id));
    }
    setInterval(() => { if (!document.hidden) olhaNoticias(); }, 10000);

    // ===== 2. contagem para eventos =====
    function eventos() {
      const out = [];
      agenda().forEach((e) => {
        if (!e || !e.date || /T00:00:00-/.test(e.date) || /CFTC|Sondas|GDPNow/i.test(e.title || '')) return;
        const alto = e.impact === 'High' && PAIS[e.country];
        const medBr = e.impact === 'Medium' && e.country === 'BRL';
        if (!alto && !medBr) return;
        const t = Date.parse(e.date); if (!isFinite(t)) return;
        let nome = e.title;
        try { if (typeof calTitle === 'function') nome = calTitle(e.country, e.title); } catch (x) { /* fica o original */ }
        out.push({ t, nome, pais: PAIS[e.country] || e.country, id: e.country + '|' + e.date + '|' + e.title });
      });
      // Copom (18h30 em Brasília) quando o calendário não traz
      try {
        if (typeof COPOM_DECISIONS !== 'undefined' && !out.some((x) => /copom/i.test(x.nome))) {
          COPOM_DECISIONS.forEach((d) => { const t = Date.parse(d + 'T18:30:00-03:00'); out.push({ t, nome: 'Decisão do Copom (Selic)', pais: 'Brasil', id: 'copom|' + d }); });
        }
      } catch (x) { /* sem lista do Copom */ }
      return out;
    }
    function olhaAgenda() {
      const now = Date.now();
      // junta eventos no mesmo horário num aviso só
      const porHora = new Map();
      eventos().forEach((e) => {
        const falta = (e.t - now) / 60000;
        const marco = falta > 3 && falta <= 10.5 ? 10 : falta > 0 && falta <= 2.5 ? 2 : 0;
        if (!marco) return;
        const k = 'e:' + e.t + ':' + marco;
        if (jaFoi(k)) return;
        if (!porHora.has(k)) porHora.set(k, { t: e.t, marco, itens: [] });
        porHora.get(k).itens.push(e);
      });
      porHora.forEach((g, k) => pedir(8, () => {
        if (jaFoi(k) || g.t <= Date.now()) return;
        marca(k);
        const min = Math.max(1, Math.round((g.t - Date.now()) / 60000));
        const hora = new Date(g.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
        const lista = g.itens.slice(0, 2).map((e) => esc(e.pais) + ': ' + esc(e.nome)).join('<br>') + (g.itens.length > 2 ? '<br>e mais ' + (g.itens.length - 2) : '');
        $('.rel-txt').textContent = min + ' MIN';
        const abreCal = () => { const t = document.querySelector('[data-tab="calendar-panel"]'); if (t) t.click(); };
        cena(() => {
          tela('relogio'); s.classList.add('mao-alto');
          dizer('<b>Em ' + min + ' min, às ' + hora + '</b><small>' + lista + '</small><span class="acao">Abrir o Calendário</span>', 8000, abreCal, true);
          setTimeout(() => { tela(''); s.classList.remove('mao-alto'); }, 6000);
        }, 8200);
      }, k));
    }
    setInterval(() => { if (!document.hidden) olhaAgenda(); }, 20000);
    // mantém o calendário em dia (o app.js guarda por 30 min; aqui pede no máximo a cada 30 min)
    let calPedido = 0;
    setInterval(() => {
      if (document.hidden || Date.now() - calPedido < 30 * 60000) return;
      calPedido = Date.now();
      try { if (typeof loadCalendarFeed === 'function') loadCalendarFeed().catch(() => {}); } catch (e) { /* sem calendário */ }
    }, 60000);

    // ===== 3. explique isso =====
    let selTimer = 0;
    document.addEventListener('selectionchange', () => {
      clearTimeout(selTimer);
      selTimer = setTimeout(() => {
        const sel = document.getSelection();
        const txt = sel ? String(sel).replace(/\s+/g, ' ').trim() : '';
        if (!txt) { if (s.dataset.explica) { delete s.dataset.explica; calar(); } return; }
        if (txt.length < 2 || txt.length > 220 || parado() || !s.offsetParent) return;
        const no = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
        if (!no || no.closest('input, textarea, [contenteditable], #ia-painel, #ia-fab, .ia-painel')) return;
        if (!window.MMAssistente) return;
        try { const r = sel.getRangeAt(0).getBoundingClientRect(); travaOlhar = Date.now() + 2500; olharPara(r.left + r.width / 2, r.top + r.height / 2); } catch (e) { /* sem retângulo */ }
        s.classList.remove('m-sono'); classe('pensa', 900);
        s.dataset.explica = '1';
        dizer('Quer que eu explique?<small>"' + esc(corta(txt, 60)) + '"</small><span class="acao">Perguntar ao Assistente</span>', 8000,
          () => { delete s.dataset.explica; MMAssistente.escrever('Explique de forma simples: "' + corta(txt, 200) + '"'); }, true);
      }, 450);
    });

    // ===== 4. alerta da watchlist =====
    function olhaWatchlist() {
      const W = window.MMWatchRobo; if (!W) return;
      const itens = W.itens(); if (!itens.length) return;
      if (Date.now() - W.ultimo() > 5 * 60000) { try { W.atualizar(); } catch (e) { /* tenta depois */ } return; }
      const hoje = agora('America/Sao_Paulo').dia;
      itens.forEach((sym) => {
        const d = W.cot(sym);
        if (!d || !isFinite(d.change) || !isFinite(d.value) || Math.abs(d.change) < 3) return;
        // dado velho (mais de 1 dia) não vira alerta
        if (d.ts && Date.now() - d.ts > 24 * 3600000) return;
        const k = 'w:' + sym + ':' + (d.change > 0 ? '+' : '-') + ':' + hoje;
        if (jaFoi(k)) return;
        pedir(7, () => {
          if (jaFoi(k)) return;
          marca(k);
          const nome = W.nome(sym);
          mostraAtivo(corta(nome, 9).toUpperCase(), nome, d, false, '<small style="margin:0 0 2px">Da sua watchlist</small>');
          if (d.change > 0) classe('surpreso', 900); else classe('triste', 2500);
        }, k);
      });
    }
    setInterval(() => { if (!document.hidden) olhaWatchlist(); }, 60000);
    setTimeout(olhaWatchlist, 15000);

    // ===== 5. humor pela temperatura =====
    function humor() {
      const t = window.MMTemp && MMTemp.atual && MMTemp.atual();
      const ok = t && Number.isFinite(t.temp) && Date.now() - t.quando < 30 * 60000;
      s.classList.toggle('humor-on', !!ok && t.temp > 60);
      s.classList.toggle('humor-off', !!ok && t.temp < 40);
    }
    setInterval(humor, 30000); setTimeout(humor, 4000);

    // ===== 6. sino do pregão =====
    function olhaPregao() {
      const fer = window.MMFeriados;
      const sp = agora('America/Sao_Paulo'), ny = agora('America/New_York');
      const util = (c) => c.sem >= 1 && c.sem <= 5;
      const sino = (k, txt, html) => pedir(6, () => {
        if (jaFoi(k)) return; marca(k);
        $('.sino-txt').textContent = txt;
        cena(() => { tela('sino'); acenar(); dizer(html, 5500); setTimeout(() => tela(''), 4200); }, 5800);
      }, k);
      // B3 abre às 10h (ou mais tarde em dia de horário especial)
      try {
        const f = fer && fer.b3(sp.dia);
        if (util(sp) && !(f && !f.abre)) {
          const abre = f && f.abre ? (+f.abre.slice(0, 2) * 60 + +f.abre.slice(3, 5)) : 600;
          if (sp.min >= abre && sp.min < abre + 6) sino('b3:' + sp.dia, 'B3', '<b>Abriu o pregão da B3</b><small>Bom pregão!</small>');
        }
      } catch (e) { /* sem feriados */ }
      try {
        const f = fer && fer.nyse(ny.dia);
        if (util(ny) && !(f && !f.abre) && ny.min >= 570 && ny.min < 576) sino('ny:' + ny.dia, 'NY', '<b>Abriu a bolsa de Nova York</b><small>NYSE e Nasdaq</small>');
      } catch (e) { /* sem feriados */ }
      // fechamento do Ibovespa: depois das 17h30, com dado do pregão de hoje
      const d = cotacao('^BVSP');
      if (d && d.ts && util(sp) && sp.min >= 1050 && sp.min < 1320) {
        const diaDado = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d.ts));
        const k = 'fech:' + sp.dia;
        if (diaDado === sp.dia && !jaFoi(k)) pedir(6, () => { if (jaFoi(k)) return; marca(k); mostraAtivo('IBOV', 'Ibovespa', d, true, '<small style="margin:0 0 2px">Fim do pregão</small>'); }, k);
      }
    }
    setInterval(() => { if (!document.hidden) olhaPregao(); }, 30000);
    setTimeout(olhaPregao, 5000);

    // ===== 7. guia de abas =====
    const antes = window.__onTabSwitch;
    window.__onTabSwitch = (tabId) => {
      if (antes) antes(tabId);
      const dica = DICAS[tabId];
      mem.abas = mem.abas || {};
      if (!dica || (mem.abas[tabId] || 0) >= 2) return;
      mem.abas[tabId] = (mem.abas[tabId] || 0) + 1; memSalva();
      setTimeout(() => {
        if (!vivo()) return;
        for (let i = fila.length - 1; i >= 0; i--) if (fila[i].chave === 'dica') fila.splice(i, 1);
        pedir(4, () => {
          cena(() => {
            s.classList.add('aponta'); travaOlhar = Date.now() + 3500; olhar(-1, -.4); classe('feliz', 1200);
            dizer('<b>Dica</b><small>' + esc(dica) + '</small>', 6500, null, true);
            setTimeout(() => s.classList.remove('aponta'), 2600);
          }, 6800);
        }, 'dica');
      }, 900);
    };

    // ===== arrastar: leva o robô para qualquer canto; o lugar fica salvo neste navegador =====
    const POS_KEY = 'mm_robo_pos_v1';
    const GRANDE = matchMedia('(min-width: 901px)');
    const lado = () => {
      const r = b.getBoundingClientRect();
      b.classList.toggle('ia-pet-esq', r.left + r.width / 2 < innerWidth / 2);
      b.classList.toggle('ia-pet-baixo', r.top > innerHeight - 150);
    };
    const limpaPos = () => { b.style.left = b.style.top = b.style.right = b.style.bottom = ''; b.classList.remove('ia-pet-esq', 'ia-pet-baixo'); };
    function aplicaPos() {
      if (!GRANDE.matches) return limpaPos();
      let p = null; try { p = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch (e) { p = null; }
      if (!p || !isFinite(p.x) || !isFinite(p.y)) return limpaPos();
      const w = b.offsetWidth || 100, h = b.offsetHeight || 100;
      // guarda em fração da tela: funciona em telas de tamanhos diferentes
      const x = Math.min(Math.max(4, p.x * innerWidth), innerWidth - w - 4), y = Math.min(Math.max(4, p.y * innerHeight), innerHeight - h - 4);
      b.style.right = 'auto'; b.style.bottom = 'auto'; b.style.left = x + 'px'; b.style.top = y + 'px';
      lado();
    }
    let arr = null, engolir = false;
    b.addEventListener('pointerdown', (e) => {
      if (!GRANDE.matches || e.button !== 0 || e.target.closest('.ia-pet-fala')) return;
      const r = b.getBoundingClientRect();
      arr = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, mov: false };
    });
    addEventListener('pointermove', (e) => {
      if (!arr || e.pointerId !== arr.id) return;
      if (!arr.mov && Math.hypot(e.clientX - arr.sx, e.clientY - arr.sy) < 6) return;
      if (!arr.mov) { arr.mov = true; b.classList.add('ia-pet-arrastando'); try { b.setPointerCapture(arr.id); } catch (x) { /* ok */ } s.classList.add('surpreso'); calar(); }
      const w = b.offsetWidth, h = b.offsetHeight;
      const x = Math.min(Math.max(4, e.clientX - arr.ox), innerWidth - w - 4), y = Math.min(Math.max(4, e.clientY - arr.oy), innerHeight - h - 4);
      b.style.right = 'auto'; b.style.bottom = 'auto'; b.style.left = x + 'px'; b.style.top = y + 'px';
      // balança para o lado em que está sendo levado
      s.style.setProperty('--hr', Math.max(-8, Math.min(8, (e.movementX || 0) * 1.2)) + 'deg');
    });
    const solta = (e) => {
      if (!arr || (e && e.pointerId !== arr.id)) return;
      const mov = arr.mov; arr = null;
      if (!mov) return;
      engolir = true; setTimeout(() => { engolir = false; }, 0);
      b.classList.remove('ia-pet-arrastando'); s.classList.remove('surpreso'); s.style.setProperty('--hr', '0deg');
      const r = b.getBoundingClientRect();
      try { localStorage.setItem(POS_KEY, JSON.stringify({ x: r.left / innerWidth, y: r.top / innerHeight })); } catch (x) { /* sem armazenamento */ }
      lado(); classe('feliz', 1200);
    };
    addEventListener('pointerup', solta); addEventListener('pointercancel', solta);
    // depois de arrastar, o clique de soltar não abre o painel
    b.addEventListener('click', (e) => { if (engolir) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    addEventListener('resize', aplicaPos);
    GRANDE.addEventListener?.('change', aplicaPos);
    aplicaPos();
    const canto = () => { try { localStorage.removeItem(POS_KEY); } catch (e) { /* nada */ } limpaPos(); classe('feliz', 1200); acenar(); };

    // ao aparecer: acena e o balão se apresenta por alguns segundos
    b.classList.add('ia-pet-oi'); setTimeout(() => { if (!acaoFala) b.classList.remove('ia-pet-oi'); }, 5000);
    setTimeout(acenar, 700);

    // para conferir à mão no console: MMPet.cena('cotacao' | 'temperatura' | 'cifrao' | 'grafico' | 'pensa' | 'sono')
    window.MMPet = { canto, falar, cena: (n) => (n === 'sono' ? (s.classList.add('m-sono'), true) : cenas[n] && cenas[n]()), checar: () => { olhaNoticias(); olhaAgenda(); olhaWatchlist(); olhaPregao(); humor(); },
      // usado pelo robo-extras.js (bom dia, alarmes, decisões, pergunta do dia, janela flutuante)
      api: { el: s, botao: b, pedir, cena, dizer, calar, tela, classe, acenar, olhar, vivo, mostraAtivo, ocupado: () => ocupado || fila.length > 0,
        txt: (l1, l2, cls) => { const x = $('.pet-txt'); const aperta = (e, t, max, w) => { e.textContent = t; if (String(t).length > max) { e.setAttribute('textLength', w); e.setAttribute('lengthAdjust', 'spacingAndGlyphs'); } else { e.removeAttribute('textLength'); e.removeAttribute('lengthAdjust'); } }; aperta(x.querySelector('.txt-1'), l1, 10, '150'); aperta(x.querySelector('.txt-2'), l2, 6, '150'); x.classList.toggle('sobe', cls === 'sobe'); x.classList.toggle('cai', cls === 'cai'); } } };
    window.dispatchEvent(new Event('mm-pet-pronto'));
  }

  // o botão é criado pelo assistente.js depois que a conta responde; espera ele aparecer
  const ja = document.getElementById('ia-fab');
  if (ja) ligar(ja);
  else {
    const ob = new MutationObserver(() => { const b = document.getElementById('ia-fab'); if (b) { ob.disconnect(); ligar(b); } });
    ob.observe(document.body, { childList: true });
  }
})();
