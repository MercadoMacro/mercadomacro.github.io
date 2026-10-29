/* Conteúdo da aba Educação (29/10/2026).
   Texto próprio do Mercado Macro. Os livros TOP da CVM são só leitura indicada (licença CC BY-NC-ND:
   não copiar nem adaptar trechos deles aqui). Sem cotações nem números de mercado atuais: os exemplos
   usam valores hipotéticos e dizem isso. Formato do texto: parágrafos separados por linha em branco,
   "## " para subtítulo, "- " para lista, "> " para quadro de exemplo, **negrito**. */
(() => {
  'use strict';
  const CVM = 'https://www.gov.br/investidor/';
  const LIVRO_MVM = { titulo: 'TOP Mercado de Valores Mobiliários Brasileiro', url: CVM };
  const LIVRO_PFP = { titulo: 'TOP Planejamento Financeiro Pessoal', url: CVM };

  const trilhas = [
    {
      id: 'primeiros-passos',
      titulo: 'Primeiros passos no mercado',
      nivel: 'Iniciante',
      resumo: 'Quem regula o mercado, o que são juros, risco e liquidez, e como funcionam renda fixa, ações e fundos.',
      licoes: [
        {
          id: 'quem-e-quem',
          titulo: 'Quem é quem no mercado financeiro',
          minutos: 6,
          abertura: 'Antes de investir o primeiro real, vale saber quem cria as regras, quem fiscaliza e por onde o seu dinheiro passa.',
          texto: `O mercado financeiro brasileiro funciona em camadas. No topo ficam os órgãos que escrevem as regras; no meio, os que fiscalizam; e na ponta, as instituições que atendem o investidor.

## Quem define as regras
- **Conselho Monetário Nacional (CMN):** é o órgão máximo do sistema. Define as diretrizes de moeda e crédito e fixa a meta de inflação que o país persegue.
- **Banco Central (BC):** executa a política monetária, cuida da moeda e supervisiona bancos e instituições de pagamento. É também quem organiza o Copom, o comitê que decide a taxa Selic.
- **Comissão de Valores Mobiliários (CVM):** regula e fiscaliza o mercado de valores mobiliários, como ações, debêntures e cotas de fundos. A missão central é proteger o investidor e garantir que as empresas divulguem informações corretas.

## Quem faz o mercado funcionar
- **B3:** é a bolsa do Brasil. Opera a negociação de ações, derivativos e títulos, e também a compensação e a liquidação, garantindo que quem comprou receba o ativo e quem vendeu receba o dinheiro.
- **Corretoras e distribuidoras:** são a porta de entrada. É por elas que o investidor envia ordens à bolsa e compra títulos e fundos.
- **Custodiante:** guarda os ativos em nome do investidor. Na bolsa, as ações ficam registradas no seu CPF, não no nome da corretora.

> Exemplo: quando você compra uma ação pelo aplicativo da corretora, a ordem vai para a B3, encontra um vendedor, e a B3 registra a ação no seu CPF. Se a corretora tiver problemas, as ações continuam suas.

## Por que isso importa
Saber quem é quem ajuda a checar se uma oferta é legítima. Quem oferece investimento ao público precisa estar autorizado. Desconfie de promessas de retorno alto e garantido e confira no site da CVM e do Banco Central se a instituição tem autorização.`,
          pontos: [
            'CMN define as diretrizes e a meta de inflação; o Banco Central executa a política monetária.',
            'A CVM regula valores mobiliários e protege o investidor.',
            'A B3 é a bolsa; corretoras são a porta de entrada; os ativos ficam no seu CPF.',
            'Antes de investir, confira se quem oferece está autorizado.',
          ],
          quiz: [
            { p: 'Quem decide a taxa Selic?', o: ['A CVM', 'O Copom, do Banco Central', 'A B3'], c: 1, e: 'O Copom é o comitê de política monetária do Banco Central e se reúne periodicamente para definir a meta da Selic.' },
            { p: 'Qual órgão regula as ofertas de ações e debêntures?', o: ['A CVM', 'O CMN', 'A Receita Federal'], c: 0, e: 'Valores mobiliários, como ações e debêntures, estão sob a regulação da CVM.' },
            { p: 'Se a sua corretora quebrar, o que acontece com as ações que você comprou?', o: ['Somem junto com a corretora', 'Continuam suas, registradas no seu CPF', 'Viram dinheiro automaticamente'], c: 1, e: 'As ações ficam em custódia no seu CPF. O investidor pode transferi-las para outra corretora.' },
          ],
          painel: null,
          livro: LIVRO_MVM,
        },
        {
          id: 'selic-cdi-ipca',
          titulo: 'Selic, CDI e IPCA: os três números que movem tudo',
          minutos: 7,
          abertura: 'Quase todo investimento no Brasil é comparado com um destes três números. Entender a relação entre eles é o primeiro passo para ler o mercado.',
          texto: `## Selic
A Selic é a taxa básica de juros da economia. O Copom, do Banco Central, define uma **meta** para ela em reuniões ao longo do ano. Quando a inflação ameaça subir além da meta, o Copom tende a subir os juros para esfriar a economia; quando a inflação está controlada, há espaço para cortes.

Existe também a **Selic efetiva** (ou apurada), que é a taxa média das operações de um dia lastreadas em títulos públicos. Ela fica muito perto da meta, mas não é exatamente igual.

## CDI
O CDI é a taxa das operações de empréstimo de um dia entre bancos. Na prática, anda colado na Selic. Por isso, muitas aplicações pós-fixadas, como CDBs, rendem um percentual do CDI: "100% do CDI" significa acompanhar essa taxa; "90% do CDI", render 90% dela.

## IPCA
O IPCA, medido pelo IBGE, é o índice oficial de inflação do país. É sobre ele que o CMN fixa a meta de inflação. Ele mostra quanto os preços de uma cesta de consumo subiram, e vale olhar o número do mês e o acumulado em 12 meses, que contam histórias diferentes.

## Juro real
O que importa para o seu poder de compra é o **juro real**: quanto o dinheiro rende acima da inflação. A conta certa não é uma simples subtração:

> Exemplo hipotético: uma aplicação rende 10% em um ano e a inflação do período é 4%. O juro real é (1,10 ÷ 1,04) − 1 = 5,77%, um pouco menos que os 6% da subtração.

## Como os três se ligam
Inflação alta leva o Copom a subir a Selic; o CDI acompanha; e as aplicações atreladas ao CDI passam a render mais. O caminho inverso vale para os cortes. Por isso o mercado acompanha tanto as reuniões do Copom e a divulgação do IPCA.`,
          pontos: [
            'A Selic é a taxa básica; o Copom define a meta.',
            'O CDI anda colado na Selic e é a referência de muitas aplicações pós-fixadas.',
            'O IPCA é a inflação oficial; compare sempre o mesmo período.',
            'Juro real = (1 + juro) ÷ (1 + inflação) − 1.',
          ],
          quiz: [
            { p: 'Um CDB que paga "100% do CDI" acompanha qual taxa de perto?', o: ['O IPCA', 'A Selic', 'O dólar'], c: 1, e: 'O CDI anda muito próximo da Selic, então render 100% do CDI é praticamente acompanhar a Selic.' },
            { p: 'Uma aplicação rendeu 8% e a inflação foi 3%. O juro real foi:', o: ['Exatamente 5%', 'Um pouco menos que 5% (cerca de 4,85%)', 'Mais que 5%'], c: 1, e: '(1,08 ÷ 1,03) − 1 ≈ 4,85%. A subtração simples superestima o ganho real.' },
            { p: 'Se a inflação ameaça superar a meta, a tendência do Copom é:', o: ['Subir a Selic', 'Cortar a Selic', 'Não fazer nada'], c: 0, e: 'Juros mais altos encarecem o crédito e ajudam a segurar a inflação.' },
          ],
          painel: { texto: 'Ver Selic, CDI e IPCA nos Indicadores', aba: 'indicators-panel' },
          livro: LIVRO_MVM,
        },
        {
          id: 'risco-retorno-liquidez',
          titulo: 'Risco, retorno e liquidez',
          minutos: 6,
          abertura: 'Não existe investimento que seja ao mesmo tempo o mais seguro, o mais rentável e o mais fácil de resgatar. Toda escolha é uma troca entre esses três pontos.',
          texto: `## O triângulo
- **Retorno:** quanto o investimento pode render.
- **Risco:** a chance de o resultado ser diferente do esperado, inclusive de perder dinheiro.
- **Liquidez:** a facilidade de transformar o investimento em dinheiro, rápido e sem perder valor.

Em geral, quem busca mais retorno aceita mais risco ou menos liquidez. Uma promessa de retorno alto, sem risco e com resgate imediato é o sinal clássico de golpe.

## Tipos de risco
- **Risco de crédito:** quem pegou o dinheiro emprestado (um banco, uma empresa, o governo) não pagar.
- **Risco de mercado:** o preço do ativo oscilar por causa de juros, câmbio, notícias ou humor dos investidores.
- **Risco de liquidez:** precisar vender e não achar comprador por um preço justo.

## O FGC
O Fundo Garantidor de Créditos protege alguns produtos bancários, como poupança, CDB, LCI e LCA, se a instituição quebrar, até um limite por CPF e por instituição, além de um teto global por período. Ações, fundos de investimento e debêntures **não** têm essa garantia. Confira sempre os limites vigentes no site do FGC.

## Diversificar
Dividir o dinheiro entre ativos que reagem de forma diferente reduz o impacto de um problema isolado. Diversificar não elimina o risco do mercado como um todo, mas evita que um único erro comprometa todo o patrimônio.

> Exemplo: quem tem tudo em ações de um só setor sente cheio qualquer notícia ruim desse setor. Com renda fixa, ações de setores diferentes e alguma reserva em dinheiro, o tombo de um pedaço pesa bem menos no total.

## Reserva de emergência
Antes de buscar retorno, o primeiro passo costuma ser uma reserva para imprevistos em aplicações de baixo risco e alta liquidez. Ela evita ter de vender um investimento na hora errada.`,
          pontos: [
            'Retorno, risco e liquidez andam juntos: ganhar em um costuma custar nos outros.',
            'Riscos principais: crédito, mercado e liquidez.',
            'O FGC cobre alguns produtos bancários até um limite; ações e fundos não têm essa garantia.',
            'Diversificar reduz o peso de um problema isolado.',
          ],
          quiz: [
            { p: 'Qual destes NÃO tem garantia do FGC?', o: ['CDB', 'Poupança', 'Ações'], c: 2, e: 'Ações são valores mobiliários e não contam com o FGC.' },
            { p: 'Uma oferta promete "10% ao mês, sem risco e com saque a qualquer hora". Isso é:', o: ['Uma boa oportunidade', 'Um forte sinal de golpe', 'Normal na renda fixa'], c: 1, e: 'Retorno alto, sem risco e com liquidez imediata ao mesmo tempo não existe. Confira se quem oferece é autorizado pela CVM.' },
            { p: 'Precisar vender um ativo e não achar comprador por preço justo é risco de:', o: ['Crédito', 'Liquidez', 'Inflação'], c: 1, e: 'Esse é o risco de liquidez.' },
          ],
          painel: null,
          livro: LIVRO_PFP,
        },
        {
          id: 'renda-fixa',
          titulo: 'Renda fixa sem mistério',
          minutos: 8,
          abertura: 'Na renda fixa, você empresta dinheiro e recebe juros por isso. O nome engana: o rendimento pode variar, e o preço do título também.',
          texto: `## Para quem você empresta
- **Governo:** títulos públicos, como os do Tesouro Direto (Tesouro Selic, Prefixado e IPCA+).
- **Bancos:** CDB, LCI e LCA.
- **Empresas:** debêntures e outros títulos de dívida.

## Três formas de render
- **Pós-fixado:** acompanha uma taxa que muda ao longo do tempo, como a Selic ou o CDI. Ex.: Tesouro Selic, CDB de 100% do CDI.
- **Prefixado:** a taxa é combinada no dia da compra. Você sabe quanto terá no vencimento, se ficar até lá.
- **Híbrido (atrelado à inflação):** paga a inflação do período mais uma taxa fixa. Ex.: Tesouro IPCA+.

## Marcação a mercado
Títulos prefixados e atrelados à inflação têm o preço recalculado todo dia conforme os juros do mercado. Se os juros sobem, o preço desses títulos cai, e vice-versa. Quem leva o título até o vencimento recebe a taxa combinada; quem vende antes pode ganhar ou perder.

> Exemplo hipotético: você comprou um prefixado a 10% ao ano. Se no mês seguinte novos títulos parecidos passarem a pagar 12%, ninguém vai querer o seu pelo mesmo preço: ele perde valor até render o equivalente. Se os juros caírem, ele se valoriza.

## Impostos e custos
Muitas aplicações de renda fixa seguem a tabela regressiva do Imposto de Renda, em que a alíquota cai quanto mais tempo o dinheiro fica aplicado. Alguns produtos, como LCI e LCA, têm tratamento diferente para pessoa física. As regras de tributação mudam: confira a regra vigente antes de comparar produtos. Lembre também de taxas como a de custódia.

## Como comparar
Compare sempre o rendimento **líquido** (depois de imposto e custos), no **mesmo prazo**, e considere o risco de crédito de quem emitiu o título e a liquidez (se dá para resgatar antes).`,
          pontos: [
            'Na renda fixa você empresta para governo, bancos ou empresas.',
            'Pós-fixado acompanha uma taxa; prefixado trava a taxa; híbrido paga inflação mais juro.',
            'Juros sobem, preço de prefixados e IPCA+ cai (marcação a mercado).',
            'Compare o rendimento líquido no mesmo prazo e confira a regra de imposto vigente.',
          ],
          quiz: [
            { p: 'Os juros de mercado subiram. O que acontece com o preço de um título prefixado que você já tem?', o: ['Sobe', 'Cai', 'Não muda'], c: 1, e: 'Com juros novos mais altos, o título antigo, que paga menos, perde valor até se equiparar.' },
            { p: 'O Tesouro IPCA+ é um título:', o: ['Pós-fixado na Selic', 'Prefixado', 'Híbrido: inflação mais uma taxa fixa'], c: 2, e: 'Ele paga a variação do IPCA mais uma taxa definida na compra.' },
            { p: 'Para comparar dois CDBs de forma justa, olhe:', o: ['Só a taxa bruta', 'O rendimento líquido no mesmo prazo, além do risco e da liquidez', 'O nome do banco'], c: 1, e: 'Imposto, prazo, risco de crédito e liquidez mudam o resultado real.' },
          ],
          painel: { texto: 'Abrir a calculadora de renda fixa', aba: 'calculator-panel' },
          livro: LIVRO_MVM,
        },
        {
          id: 'acoes',
          titulo: 'Ações: virando sócio de uma empresa',
          minutos: 7,
          abertura: 'Comprar uma ação é comprar um pedaço de uma empresa. Você passa a participar dos resultados, bons e ruins.',
          texto: `## O que é uma ação
A ação é a menor parte do capital de uma sociedade anônima. Quem tem ações é sócio: participa dos lucros e, dependendo do tipo, vota nas assembleias.
- **Ordinárias (ON, final 3):** dão direito a voto.
- **Preferenciais (PN, finais 4, 5, 6...):** em geral não votam, mas têm alguma preferência, como prioridade no recebimento de dividendos.
- **Units (em geral, final 11):** pacotes que juntam ações de tipos diferentes. O final 11 também aparece em ETFs e fundos imobiliários.

## Como se ganha (e se perde)
- **Valorização:** o preço sobe e você vende por mais do que pagou. O preço também pode cair.
- **Proventos:** parte do lucro distribuída aos acionistas, como dividendos e juros sobre capital próprio (JCP), que têm tratamentos de imposto diferentes.

## Mercado primário e secundário
No **mercado primário**, a empresa vende ações novas e o dinheiro vai para ela, como num IPO. No **mercado secundário**, que é o dia a dia da bolsa, os investidores negociam entre si e o dinheiro vai de um investidor para outro.

## Como o preço se forma
O preço sai do encontro entre ordens de compra e de venda no livro de ofertas da B3. Notícias, resultados, juros e o humor dos investidores mudam essas ordens a todo momento.

> Exemplo: se muitos querem comprar e poucos querem vender a um certo preço, quem quer comprar precisa oferecer mais, e o preço sobe.

## Cuidados
Ações oscilam bastante no curto prazo. Faz sentido investir em ações com dinheiro que pode ficar aplicado por mais tempo, diversificar entre empresas e setores, e estudar a empresa: o que ela faz, se dá lucro, quanto deve.`,
          pontos: [
            'Ação é um pedaço da empresa; ON vota, PN tem preferência.',
            'Ganhos vêm de valorização e proventos (dividendos e JCP).',
            'No primário o dinheiro vai para a empresa; no secundário, entre investidores.',
            'O preço nasce do encontro entre ordens de compra e venda.',
          ],
          quiz: [
            { p: 'Um ticker terminado em 3 costuma ser:', o: ['Ação ordinária (ON)', 'Ação preferencial (PN)', 'Fundo imobiliário'], c: 0, e: 'Final 3 indica ação ordinária, com direito a voto.' },
            { p: 'Num IPO, o dinheiro pago pelas ações novas vai para:', o: ['Outros investidores', 'A empresa', 'A B3'], c: 1, e: 'O IPO acontece no mercado primário: a empresa emite ações e recebe o dinheiro.' },
            { p: 'Dividendos e JCP são:', o: ['Taxas cobradas pela corretora', 'Formas de a empresa distribuir resultados aos acionistas', 'Impostos'], c: 1, e: 'São proventos, com regras de tributação diferentes entre si.' },
          ],
          painel: { texto: 'Ver as ações no Mapa de Calor', aba: 'heatmap-panel' },
          livro: LIVRO_MVM,
        },
        {
          id: 'fundos',
          titulo: 'Fundos de investimento',
          minutos: 7,
          abertura: 'Num fundo, muita gente junta o dinheiro e um gestor profissional decide onde aplicar. Você compra cotas e divide o resultado com os outros cotistas.',
          texto: `## Como funciona
O fundo reúne o dinheiro dos cotistas em uma carteira única. O valor da cota sobe ou desce conforme o resultado dos investimentos. Os principais papéis são:
- **Gestor:** decide o que comprar e vender, dentro da política do fundo.
- **Administrador:** cuida da parte legal e operacional e responde perante a CVM.
- **Custodiante:** guarda os ativos.

## Principais tipos
- **Renda fixa:** aplica principalmente em títulos de dívida.
- **Ações:** aplica principalmente em ações.
- **Multimercado:** pode combinar vários mercados, como juros, câmbio, ações e derivativos.
- **Cambial:** acompanha moedas estrangeiras.

Fundos podem ser **abertos** (você entra e sai quando quer, seguindo os prazos de resgate) ou **fechados** (as cotas são negociadas em bolsa, como nos fundos imobiliários).

## Custos
- **Taxa de administração:** cobrada todo ano sobre o patrimônio, já descontada da cota.
- **Taxa de performance:** parte do ganho que superar uma referência, quando o fundo cobra.
- **Imposto:** fundos têm regras próprias de IR, e muitos fundos abertos sofrem a cobrança antecipada chamada come-cotas. Confira a regra vigente para o tipo de fundo.

## Antes de entrar
Leia a lâmina e o regulamento: eles mostram a política de investimento, os riscos, as taxas e os prazos de resgate. Rentabilidade passada não garante rentabilidade futura, e fundo não tem garantia do FGC.

> Exemplo: dois fundos de renda fixa com a mesma carteira, um com taxa de administração de 0,3% ao ano e outro de 1,5%. Ao longo dos anos, a diferença de taxa vira uma diferença grande no resultado do cotista.`,
          pontos: [
            'Fundo é um condomínio: você compra cotas e divide o resultado.',
            'Gestor decide; administrador responde; custodiante guarda.',
            'Taxas de administração e performance reduzem o resultado: compare.',
            'Leia lâmina e regulamento; fundo não tem FGC.',
          ],
          quiz: [
            { p: 'Quem decide os investimentos de um fundo?', o: ['O cotista', 'O gestor', 'A B3'], c: 1, e: 'O gestor toma as decisões de investimento seguindo a política do fundo.' },
            { p: 'Fundos de investimento têm garantia do FGC?', o: ['Sim, sempre', 'Não', 'Só os de ações'], c: 1, e: 'Fundos não são cobertos pelo FGC.' },
            { p: 'Onde você encontra a política de investimento e as taxas de um fundo?', o: ['Na lâmina e no regulamento', 'Só no site da corretora', 'Em notícias'], c: 0, e: 'A lâmina resume e o regulamento detalha.' },
          ],
          painel: null,
          livro: LIVRO_MVM,
        },
      ],
    },
    { id: 'investimentos', titulo: 'Investimentos na prática', nivel: 'Intermediário', resumo: 'Tesouro Direto, crédito privado, fundos imobiliários, ETFs e como montar uma carteira.', emBreve: true },
    { id: 'analise', titulo: 'Analisando empresas', nivel: 'Intermediário', resumo: 'Balanços, indicadores, valuation e análise técnica.', emBreve: true },
    { id: 'planejamento', titulo: 'Planejamento financeiro', nivel: 'Iniciante', resumo: 'Orçamento, dívidas, metas, aposentadoria e finanças comportamentais.', emBreve: true },
    { id: 'derivativos', titulo: 'Derivativos e macro', nivel: 'Avançado', resumo: 'Mercado futuro, opções, curva de juros e expectativas do Copom e do Fed.', emBreve: true },
  ];

  window.MMEduConteudo = Object.freeze({ trilhas });
})();
