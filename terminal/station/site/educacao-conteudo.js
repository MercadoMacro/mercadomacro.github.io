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
  const LIVRO_AI = { titulo: 'TOP Análise de Investimentos', url: CVM };

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
          termos: 'acao dividendo dividendos jcp',
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
          termos: 'come cotas gestor taxa administracao',
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
    {
      id: 'planejamento',
      titulo: 'Planejamento financeiro',
      nivel: 'Iniciante',
      resumo: 'Orçamento, dívidas, reserva de emergência, metas, armadilhas da mente e aposentadoria.',
      licoes: [
        {
          id: 'orcamento',
          titulo: 'Orçamento: para onde vai o seu dinheiro',
          minutos: 6,
          abertura: 'Não dá para planejar o que não se conhece. O orçamento é o mapa que mostra quanto entra, quanto sai e onde dá para mudar.',
          texto: `## Comece pela renda líquida
O ponto de partida é o que de fato cai na conta, depois de impostos e descontos. Para quem tem renda variável, vale usar a média dos últimos meses, ou até um mês fraco, para não planejar com dinheiro que talvez não venha.

## Registre um mês inteiro
Anote todos os gastos por um mês, inclusive os pequenos. Depois, separe em grupos:
- **Fixos:** aluguel, condomínio, escola, plano de saúde, assinaturas.
- **Variáveis:** mercado, transporte, contas de consumo.
- **Eventuais:** IPVA, IPTU, material escolar, presentes, manutenção do carro. Divida o valor anual por 12 e reserve todo mês.

## Encontre o espaço
Com o retrato em mãos, a pergunta é: o que pode diminuir sem piorar muito a sua vida? Assinaturas esquecidas, tarifas bancárias e compras por impulso costumam aparecer primeiro.

> Exemplo: uma divisão bastante usada como ponto de partida é separar a renda em necessidades, desejos e futuro (poupança e investimentos). Os percentuais ideais variam de pessoa para pessoa; o importante é que a parte do futuro exista e seja paga no começo do mês, não com o que sobrar.

## Pague-se primeiro
Quem investe só o que sobra raramente investe. Programar uma transferência para a aplicação logo depois de receber transforma a poupança em hábito, sem depender de força de vontade.`,
          pontos: [
            'Planeje com a renda líquida, e com cautela se ela varia.',
            'Registre um mês de gastos e separe fixos, variáveis e eventuais.',
            'Gastos anuais entram no orçamento divididos por 12.',
            'Pague-se primeiro: a parte do futuro sai no começo do mês.',
          ],
          quiz: [
            { p: 'Qual renda usar para montar o orçamento?', o: ['A renda bruta do contracheque', 'A renda líquida, o que cai na conta', 'A maior renda que já teve'], c: 1, e: 'Só a renda líquida está de fato disponível para gastar e poupar.' },
            { p: 'Como tratar o IPVA no orçamento mensal?', o: ['Ignorar até chegar o boleto', 'Dividir o valor anual por 12 e reservar todo mês', 'Pagar com o cartão de crédito'], c: 1, e: 'Gastos eventuais previsíveis viram uma reserva mensal e não pegam ninguém de surpresa.' },
            { p: '"Pagar-se primeiro" significa:', o: ['Investir no começo do mês, antes dos outros gastos', 'Investir o que sobrar no fim do mês', 'Pagar primeiro as contas mais caras'], c: 0, e: 'Separar a parte do futuro logo que o dinheiro entra é o que faz a poupança acontecer.' },
          ],
          painel: null,
          livro: LIVRO_PFP,
        },
        {
          id: 'dividas',
          titulo: 'Dívidas: os juros que trabalham contra você',
          minutos: 7,
          abertura: 'Os mesmos juros compostos que fazem um investimento crescer fazem uma dívida cara crescer mais rápido ainda. Por isso, quitar dívida cara costuma ser o melhor investimento.',
          texto: `## Nem toda dívida é igual
Um financiamento imobiliário de longo prazo e o rotativo do cartão de crédito são dívidas muito diferentes. Para comparar, olhe o **Custo Efetivo Total (CET)**, que soma juros, tarifas, seguros e impostos. A instituição é obrigada a informá-lo antes da contratação.

## As mais caras
Em geral, o **rotativo do cartão** e o **cheque especial** estão entre os créditos mais caros do mercado. Ficar neles por meses é uma das formas mais rápidas de perder dinheiro.

## Como sair
- **Liste tudo:** credor, saldo, parcela e taxa de cada dívida. O Registrato, do Banco Central, mostra gratuitamente as dívidas em seu nome no sistema financeiro.
- **Ataque a mais cara primeiro**, pagando o mínimo nas outras.
- **Troque dívida cara por barata:** um empréstimo pessoal ou consignado com CET menor pode quitar o cartão. Só funciona se o cartão não voltar a ser usado do mesmo jeito.
- **Negocie:** credores costumam aceitar descontos ou prazos melhores, principalmente em dívidas já atrasadas.

> Exemplo hipotético: uma dívida que cobra 10% ao mês dobra em pouco mais de 7 meses se nada for pago. Nenhum investimento comum rende nesse ritmo, por isso quitar essa dívida vale mais do que investir.

## Antes de contratar
Pergunte se a compra precisa mesmo ser parcelada, compare o CET entre instituições e veja se a parcela cabe no orçamento sem apertar a reserva de emergência.`,
          pontos: [
            'Compare dívidas pelo CET, não só pela taxa de juros.',
            'Rotativo do cartão e cheque especial costumam ser os créditos mais caros.',
            'Liste as dívidas (o Registrato ajuda) e ataque a mais cara primeiro.',
            'Trocar dívida cara por barata só funciona se o hábito mudar.',
          ],
          quiz: [
            { p: 'O que é o CET?', o: ['Só a taxa de juros', 'O custo total do crédito, com juros, tarifas, seguros e impostos', 'Um tipo de investimento'], c: 1, e: 'O CET é a medida certa para comparar créditos diferentes.' },
            { p: 'Você tem dinheiro parado e uma dívida no rotativo do cartão. Em geral, o melhor é:', o: ['Investir o dinheiro e manter a dívida', 'Quitar a dívida do cartão', 'Pagar só o mínimo'], c: 1, e: 'Os juros do rotativo costumam ser muito maiores do que qualquer rendimento comum.' },
            { p: 'Qual serviço do Banco Central mostra as dívidas em seu nome?', o: ['Registrato', 'Tesouro Direto', 'Copom'], c: 0, e: 'O Registrato é gratuito e reúne informações de empréstimos e financiamentos em seu CPF.' },
          ],
          painel: null,
          livro: LIVRO_PFP,
        },
        {
          id: 'reserva',
          titulo: 'Reserva de emergência',
          minutos: 5,
          abertura: 'Imprevistos acontecem: desemprego, doença, conserto do carro. A reserva é o que impede que um susto vire dívida cara ou venda de investimento na hora errada.',
          texto: `## Quanto guardar
A referência é o **custo de vida mensal**, não a renda. Uma orientação comum é ter alguns meses de despesas essenciais guardados. Quem tem renda mais instável (autônomos, comissionados, empresários) costuma precisar de uma reserva maior do que quem tem emprego estável.

## Onde guardar
A reserva precisa de três qualidades, nesta ordem:
- **Segurança:** baixo risco de perder valor.
- **Liquidez:** dinheiro disponível no mesmo dia ou no dia seguinte.
- **Rendimento:** render pelo menos perto da Selic, para não perder para a inflação.

Opções que costumam atender: Tesouro Selic, CDBs com liquidez diária de instituições sólidas (com cobertura do FGC dentro dos limites) e contas remuneradas. Ações, fundos de ações e títulos prefixados longos não servem para reserva, porque podem estar em queda justamente quando você precisar.

## Como montar
Defina o valor-alvo e trate o depósito como um gasto fixo do orçamento até chegar lá. Usou a reserva? A prioridade volta a ser recompô-la.

> Exemplo hipotético: despesas essenciais de R$ 4.000 por mês e a meta de seis meses dão uma reserva de R$ 24.000. Guardando R$ 800 por mês, sem contar rendimentos, ela fica pronta em 30 meses.`,
          pontos: [
            'A reserva se mede em meses de despesas essenciais.',
            'Renda instável pede reserva maior.',
            'Segurança e liquidez vêm antes do rendimento.',
            'Usou a reserva? Recompor vira prioridade.',
          ],
          quiz: [
            { p: 'A reserva de emergência deve ser calculada com base em:', o: ['A renda bruta', 'O custo de vida mensal', 'O saldo do FGTS'], c: 1, e: 'O que importa é quanto você precisa para viver durante o imprevisto.' },
            { p: 'Qual destes é mais adequado para a reserva?', o: ['Ações de uma empresa', 'Tesouro Selic', 'Título prefixado de 10 anos'], c: 1, e: 'O Tesouro Selic tem baixo risco de oscilação e liquidez diária.' },
            { p: 'Quem tende a precisar de uma reserva maior?', o: ['Quem tem renda instável', 'Quem tem emprego estável', 'Todos precisam exatamente do mesmo valor'], c: 0, e: 'Quanto mais incerta a renda, maior o colchão necessário.' },
          ],
          painel: { texto: 'Comparar aplicações na calculadora', aba: 'calculator-panel' },
          livro: LIVRO_PFP,
        },
        {
          id: 'metas',
          titulo: 'Metas, prazos e juros compostos',
          minutos: 6,
          abertura: 'Uma meta com valor e data vira um plano. E o tempo, com os juros compostos, faz boa parte do trabalho por você.',
          texto: `## Meta boa é meta concreta
"Juntar dinheiro" não é meta. "Ter R$ 30 mil para a entrada do apartamento em 4 anos" é. Uma meta útil tem **valor**, **prazo** e **um motivo** que mantenha você no caminho.

## O prazo escolhe o investimento
- **Curto prazo (até uns 2 anos):** pouca oscilação e boa liquidez, como Tesouro Selic e CDBs.
- **Médio prazo:** dá para usar títulos com vencimento perto da data da meta, prefixados ou atrelados à inflação.
- **Longo prazo:** há espaço para ativos que oscilam mais, como ações, porque o tempo ajuda a atravessar as quedas.

## Juros compostos
Nos juros compostos, o rendimento de cada mês passa a render também nos meses seguintes. No começo o efeito parece pequeno; com os anos, ele acelera.

> Exemplo hipotético: R$ 500 por mês, rendendo 0,7% ao mês, viram cerca de R$ 37 mil em 5 anos (dos quais R$ 30 mil foram depositados) e cerca de R$ 93 mil em 10 anos (com R$ 60 mil depositados). Dobrar o prazo mais que dobrou o resultado.

## Revise
Metas mudam com a vida. Uma revisão por ano, ou quando algo importante acontece, mantém o plano realista.`,
          pontos: [
            'Meta útil tem valor, prazo e motivo.',
            'O prazo da meta orienta o tipo de investimento.',
            'Nos juros compostos, o rendimento também rende: o tempo acelera o resultado.',
            'Revise as metas pelo menos uma vez por ano.',
          ],
          quiz: [
            { p: 'Qual destas é uma meta bem definida?', o: ['Quero guardar dinheiro', 'Ter R$ 20 mil em 3 anos para trocar de carro', 'Ficar rico'], c: 1, e: 'Tem valor, prazo e motivo.' },
            { p: 'Para uma meta de 1 ano, o mais adequado costuma ser:', o: ['Ações', 'Tesouro Selic ou CDB com liquidez', 'Título prefixado de 15 anos'], c: 1, e: 'No curto prazo, pouca oscilação e liquidez importam mais.' },
            { p: 'Nos juros compostos:', o: ['O rendimento também passa a render', 'O rendimento é sempre o mesmo valor todo mês', 'Só o valor depositado rende'], c: 0, e: 'É o "juro sobre juro", que acelera com o tempo.' },
          ],
          painel: { texto: 'Simular na calculadora de juros compostos', url: '/calculadora-juros-compostos' },
          livro: LIVRO_PFP,
        },
        {
          id: 'armadilhas',
          titulo: 'Finanças comportamentais: as armadilhas da mente',
          minutos: 6,
          abertura: 'Saber o que fazer é a parte fácil. O difícil é fazer, porque o cérebro tem atalhos que nem sempre ajudam com dinheiro.',
          texto: `## Atalhos que custam caro
- **Viés do presente:** valorizar demais o agora e adiar o futuro. É o que faz a aposentadoria ficar sempre "para o ano que vem".
- **Aversão à perda:** perder dói mais do que ganhar alegra. Por isso muita gente segura um investimento ruim esperando "voltar ao preço que pagou".
- **Ancoragem:** fixar-se num número sem relação com o valor atual, como o preço de compra de uma ação ou uma "promoção" de 50%.
- **Efeito manada:** seguir o que todo mundo está fazendo, comprando na euforia e vendendo no pânico.
- **Excesso de confiança:** achar que vai acertar o momento certo de entrar e sair do mercado.
- **Contabilidade mental:** tratar dinheiro de forma diferente conforme a origem, como gastar o 13º sem critério enquanto se paga juros no cartão.

## Como se proteger
- **Automatize:** aportes programados não dependem de humor.
- **Crie regras antes:** decida com calma, por escrito, quando vai rebalancear ou vender.
- **Espere antes de comprar:** um prazo de 24 horas para compras não planejadas derruba boa parte dos impulsos.
- **Olhe menos:** acompanhar a carteira toda hora aumenta a chance de reagir ao barulho.

> Exemplo: num dia de queda forte, a manchete grita e o grupo de mensagens entra em pânico. Quem tem regras definidas antes e uma reserva separada consegue não vender no pior momento.`,
          pontos: [
            'Viés do presente, aversão à perda, ancoragem e efeito manada afetam todo mundo.',
            'Automatizar aportes tira a decisão do humor do dia.',
            'Regras escritas antes valem mais que decisões no calor do momento.',
            'Olhar a carteira o tempo todo atrapalha mais do que ajuda.',
          ],
          quiz: [
            { p: 'Segurar uma ação ruim só para "não realizar o prejuízo" é exemplo de:', o: ['Aversão à perda', 'Diversificação', 'Juros compostos'], c: 0, e: 'A dor da perda faz adiar uma decisão que deveria olhar para o futuro, não para o preço pago.' },
            { p: 'Comprar porque "todo mundo está comprando" é:', o: ['Efeito manada', 'Análise fundamentalista', 'Pagar-se primeiro'], c: 0, e: 'Seguir a multidão costuma levar a comprar caro e vender barato.' },
            { p: 'Qual hábito ajuda a vencer o viés do presente?', o: ['Decidir todo mês quanto investir', 'Automatizar o aporte logo após receber', 'Esperar sobrar dinheiro'], c: 1, e: 'Com o aporte automático, poupar deixa de depender de força de vontade.' },
          ],
          painel: null,
          livro: LIVRO_PFP,
        },
        {
          id: 'aposentadoria',
          titulo: 'Planejando a aposentadoria',
          minutos: 8,
          abertura: 'Vivemos cada vez mais, o que é ótimo, mas exige dinheiro para mais anos sem salário. Quanto antes o plano começa, mais leve ele fica.',
          texto: `## As fontes de renda
- **Previdência pública (INSS ou regime próprio):** garante uma renda, mas em geral com teto, e pode ser bem menor que o salário da ativa.
- **Previdência privada:** planos como PGBL e VGBL, contratados em bancos e seguradoras.
- **Investimentos próprios:** uma carteira montada ao longo da vida, com foco no longo prazo.

## PGBL ou VGBL
- **PGBL:** permite deduzir as contribuições da base do Imposto de Renda, dentro de um limite da renda bruta tributável, para quem faz a declaração completa e contribui para a previdência pública. No resgate, o imposto incide sobre o valor total.
- **VGBL:** não tem a dedução, mas no resgate o imposto incide só sobre os rendimentos. Costuma servir para quem faz a declaração simplificada ou já usou o limite do PGBL.

Os dois podem ter tributação pela tabela progressiva ou regressiva, que é escolhida na contratação. Compare também a taxa de administração e o carregamento, que pesam muito em prazos longos. As regras mudam: confira as vigentes antes de contratar.

## Quanto juntar
Comece pela renda mensal que você quer ter e por quanto tempo. Desconte o que deve vir da previdência pública. O que falta é o que a sua carteira precisa sustentar, levando em conta a inflação até lá.

> Exemplo hipotético: duas pessoas querem juntar o mesmo valor aos 65 anos. Quem começa aos 25 tem 40 anos de juros compostos a seu favor; quem começa aos 45 tem 20. Para chegar ao mesmo lugar, a segunda precisa depositar várias vezes mais por mês.

## Ajuste com o tempo
Perto da aposentadoria, faz sentido reduzir a parte que oscila mais e aumentar a parte segura, para que uma queda forte do mercado não aconteça justo no ano de parar de trabalhar.`,
          pontos: [
            'Aposentadoria costuma combinar previdência pública, privada e investimentos próprios.',
            'PGBL deduz do IR (com limites); VGBL tributa só o rendimento no resgate.',
            'Taxas pesam muito no longo prazo: compare.',
            'Começar cedo é a maior vantagem: o tempo faz os juros compostos trabalharem.',
          ],
          quiz: [
            { p: 'No VGBL, o Imposto de Renda no resgate incide sobre:', o: ['O valor total', 'Só os rendimentos', 'Nada, é isento'], c: 1, e: 'No VGBL, só o ganho é tributado no resgate.' },
            { p: 'A dedução das contribuições do PGBL faz sentido principalmente para quem:', o: ['Faz a declaração completa do IR', 'Faz a declaração simplificada', 'Não declara IR'], c: 0, e: 'A dedução só é aproveitada na declaração completa, dentro do limite da renda bruta tributável.' },
            { p: 'Perto da aposentadoria, em geral faz sentido:', o: ['Aumentar a parte que oscila mais', 'Reduzir a parte que oscila mais', 'Concentrar tudo em uma ação'], c: 1, e: 'Proteger o patrimônio de uma queda forte bem na hora de começar a usá-lo.' },
          ],
          painel: { texto: 'Simular na calculadora de aposentadoria', url: '/calculadora-aposentadoria' },
          livro: LIVRO_PFP,
        },
      ],
    },
    {
      id: 'investimentos',
      titulo: 'Investimentos na prática',
      nivel: 'Intermediário',
      resumo: 'Tesouro Direto, crédito privado, fundos imobiliários, ETFs, como operar na bolsa e como montar uma carteira.',
      licoes: [
        {
          id: 'tesouro-direto',
          titulo: 'Tesouro Direto na prática',
          minutos: 7,
          abertura: 'O Tesouro Direto permite emprestar dinheiro ao governo federal a partir de valores baixos, pela internet. É a porta de entrada de muita gente na renda fixa.',
          texto: `## Os títulos
- **Tesouro Selic:** pós-fixado, acompanha a Selic. Oscila muito pouco e costuma ser usado para reserva e objetivos de curto prazo.
- **Tesouro Prefixado:** taxa fixa definida na compra. Pode existir com ou sem pagamento de juros semestrais.
- **Tesouro IPCA+:** paga a inflação mais uma taxa fixa. Também existe com juros semestrais.
- **Títulos com objetivo:** o Tesouro também oferece títulos pensados para complementar a aposentadoria ou pagar a educação, que pagam a renda em parcelas mensais depois de uma data escolhida.

## Como comprar e vender
A compra é feita por uma instituição financeira habilitada (banco ou corretora), que dá acesso ao Tesouro Direto. O próprio Tesouro recompra os títulos antes do vencimento, pelo preço de mercado do dia. Ou seja: há liquidez, mas o valor do resgate antecipado pode ser maior ou menor do que o esperado.

## Custos e impostos
Há taxa de custódia cobrada pela B3 sobre o valor investido e, em algumas instituições, taxa de administração. O Imposto de Renda segue a tabela regressiva da renda fixa e é retido na fonte. Confira na página oficial do Tesouro Direto os valores e as isenções vigentes.

## Escolhendo pelo prazo
O segredo é casar o vencimento do título com o prazo do objetivo. Quem compra um IPCA+ de longo prazo para uma meta de daqui a um ano corre o risco de precisar vender num momento de preço baixo.

> Exemplo hipotético: duas pessoas compram o mesmo Tesouro IPCA+ com vencimento longo. Os juros do mercado sobem logo depois. Quem precisa vender no ano seguinte pode ter prejuízo; quem segura até o vencimento recebe exatamente a inflação mais a taxa combinada.`,
          pontos: [
            'Tesouro Selic para curto prazo e reserva; Prefixado e IPCA+ para prazos maiores.',
            'O Tesouro recompra antes do vencimento, mas pelo preço de mercado do dia.',
            'Há taxa de custódia e IR pela tabela regressiva: confira os valores vigentes.',
            'Case o vencimento do título com o prazo do objetivo.',
          ],
          quiz: [
            { p: 'Qual título do Tesouro oscila menos no dia a dia?', o: ['Tesouro IPCA+ de longo prazo', 'Tesouro Selic', 'Tesouro Prefixado de longo prazo'], c: 1, e: 'O Tesouro Selic acompanha a taxa básica e tem oscilação muito pequena.' },
            { p: 'Vender um Tesouro IPCA+ antes do vencimento:', o: ['Garante a taxa combinada', 'Pode dar ganho ou perda, conforme o preço de mercado', 'É proibido'], c: 1, e: 'A taxa combinada só é garantida para quem leva o título até o vencimento.' },
            { p: 'Para uma meta de 10 anos protegida da inflação, um título adequado é:', o: ['Tesouro IPCA+ com vencimento próximo de 10 anos', 'Tesouro Selic', 'Poupança'], c: 0, e: 'O IPCA+ protege o poder de compra e o vencimento casa com o prazo da meta.' },
          ],
          painel: { texto: 'Ver taxas do Tesouro nos Indicadores', aba: 'indicators-panel' },
          livro: LIVRO_MVM,
        },
        {
          id: 'credito-privado',
          titulo: 'Crédito privado: CDB, LCI, LCA e debêntures',
          minutos: 7,
          abertura: 'Quando você empresta para bancos e empresas, em vez do governo, entra no crédito privado. O retorno costuma ser maior porque o risco também é.',
          texto: `## Títulos bancários
- **CDB:** o banco capta dinheiro para suas operações. Pode ser pós-fixado (% do CDI), prefixado ou atrelado à inflação.
- **LCI e LCA:** o dinheiro financia os setores imobiliário e agrícola. Para pessoa física, têm tratamento de imposto diferente do CDB e costumam ter prazo mínimo de carência.
- **LC:** emitida por financeiras.

Esses títulos contam com o FGC, dentro dos limites vigentes. Isso torna o risco do emissor menos relevante para quem investe abaixo do limite.

## Títulos de empresas
- **Debêntures:** dívida emitida por empresas. Algumas, ligadas a projetos de infraestrutura, são incentivadas e têm benefício de imposto para pessoa física.
- **CRI e CRA:** recebíveis ligados aos setores imobiliário e do agronegócio.

Esses **não** têm FGC. Se o emissor tiver problemas, o investidor pode perder parte ou todo o dinheiro.

## Como avaliar o risco
- **Quem é o emissor:** porte, endividamento, setor, histórico.
- **Rating:** nota de agências de classificação de risco. Ajuda, mas não é garantia.
- **Garantias:** algumas emissões têm garantias reais ou fiança.
- **Prazo e liquidez:** muitos títulos privados são difíceis de vender antes do vencimento.

> Exemplo hipotético: uma debênture paga bem mais que um título público de prazo parecido. Essa diferença, chamada de spread de crédito, é a remuneração pelo risco a mais. Se parece alta demais para o tamanho do risco, desconfie.

## Compare o líquido
Uma LCI que rende um percentual menor do CDI pode render mais que um CDB depois do imposto, dependendo das regras vigentes e do prazo. Sempre compare o rendimento líquido.`,
          pontos: [
            'CDB, LCI, LCA e LC têm FGC dentro dos limites; debêntures, CRI e CRA não.',
            'Mais retorno no crédito privado é pagamento por mais risco.',
            'Avalie emissor, rating, garantias, prazo e liquidez.',
            'Compare sempre o rendimento líquido de imposto.',
          ],
          quiz: [
            { p: 'Qual destes NÃO tem cobertura do FGC?', o: ['CDB', 'LCA', 'Debênture'], c: 2, e: 'Debêntures são dívida de empresas e não contam com o FGC.' },
            { p: 'O spread de crédito é:', o: ['Uma taxa da corretora', 'O retorno a mais pago pelo risco do emissor', 'Um imposto'], c: 1, e: 'É a diferença de taxa em relação a um título de menor risco.' },
            { p: 'Um rating alto significa:', o: ['Risco zero', 'Menor risco percebido pela agência, sem garantia', 'Retorno garantido'], c: 1, e: 'O rating é uma opinião sobre o risco, não uma garantia.' },
          ],
          painel: { texto: 'Comparar na calculadora de renda fixa', aba: 'calculator-panel' },
          livro: LIVRO_MVM,
        },
        {
          id: 'fiis',
          termos: 'fii fiis imobiliario aluguel',
          titulo: 'Fundos imobiliários',
          minutos: 6,
          abertura: 'Com um fundo imobiliário, dá para ter um pedaço de shoppings, galpões, lajes corporativas ou títulos do setor, com cotas negociadas na bolsa.',
          texto: `## Tipos
- **Tijolo:** donos de imóveis físicos, que geram renda de aluguel. Ex.: galpões logísticos, lajes, shoppings.
- **Papel:** aplicam em títulos do setor imobiliário, como CRIs. A renda vem dos juros desses títulos.
- **Fundos de fundos:** compram cotas de outros fundos imobiliários.

## Como se ganha
- **Rendimentos:** distribuição periódica de parte do resultado, muitas vezes mensal. Para pessoa física, pode haver benefício de imposto sob certas condições; as regras mudam, confira as vigentes.
- **Variação da cota:** a cota sobe e desce na bolsa como uma ação.

## O que olhar
- **Vacância:** espaço sem inquilino. Quanto maior, menos aluguel.
- **Qualidade e diversificação:** localização dos imóveis, número de inquilinos, prazo dos contratos.
- **P/VP:** preço da cota dividido pelo valor patrimonial por cota. Abaixo de 1, a bolsa paga menos que o valor contábil; pode ser oportunidade ou sinal de problema.
- **Liquidez:** quanto a cota é negociada por dia.
- **Taxas:** administração e, em alguns, performance.

> Exemplo hipotético: um fundo de galpões com um único inquilino paga bons rendimentos. Se esse inquilino sair, a vacância vai a 100% e a renda some. Um fundo com dezenas de inquilinos dilui esse risco.

## Cuidados
Rendimento alto hoje não garante rendimento amanhã. Fundos de papel reagem à inflação e aos juros; fundos de tijolo, à economia e ao mercado imobiliário. E a cota pode cair bastante quando os juros sobem.`,
          pontos: [
            'Tijolo ganha com aluguel; papel ganha com juros de títulos imobiliários.',
            'Vacância, diversificação, P/VP, liquidez e taxas são os principais pontos.',
            'Rendimentos podem ter benefício fiscal sob condições: confira a regra vigente.',
            'A cota oscila na bolsa e costuma sofrer quando os juros sobem.',
          ],
          quiz: [
            { p: 'Um fundo que aplica em CRIs é um fundo de:', o: ['Tijolo', 'Papel', 'Ações'], c: 1, e: 'Fundos de papel compram títulos de crédito imobiliário.' },
            { p: 'Vacância é:', o: ['A parte dos imóveis sem inquilino', 'A taxa de administração', 'O rendimento mensal'], c: 0, e: 'Quanto maior a vacância, menor a renda de aluguel.' },
            { p: 'P/VP abaixo de 1 significa:', o: ['A cota vale menos na bolsa que o valor patrimonial por cota', 'O fundo está falido', 'O rendimento é garantido'], c: 0, e: 'Pode ser oportunidade ou refletir problemas: precisa ser investigado.' },
          ],
          painel: null,
          livro: LIVRO_MVM,
        },
        {
          id: 'etfs',
          titulo: 'ETFs: um índice inteiro numa cota',
          minutos: 5,
          abertura: 'Um ETF é um fundo que replica um índice e é negociado na bolsa. Com uma compra, você leva uma carteira inteira.',
          texto: `## Como funciona
O ETF compra os ativos de um índice nas mesmas proporções. Se o índice sobe 1%, o ETF tende a subir cerca de 1%, descontadas as taxas. Há ETFs de ações brasileiras, de bolsas de outros países, de renda fixa, de setores e até de criptoativos.

## Vantagens
- **Diversificação imediata:** um índice amplo reúne dezenas de empresas.
- **Custo baixo:** a gestão é passiva, então as taxas costumam ser menores que as de fundos ativos.
- **Simplicidade e transparência:** a carteira segue regras públicas do índice.
- **Liquidez em bolsa:** compra e venda como uma ação.

## Pontos de atenção
- O ETF não tenta bater o índice: ele **é** o índice, inclusive nas quedas.
- A tributação de ETFs tem regras próprias e diferentes das de ações. Por exemplo, a isenção de vendas mensais pequenas que vale para ações não costuma valer para ETFs. Confira a regra vigente.
- ETFs de outros países trazem também o risco do câmbio.

> Exemplo hipotético: em vez de escolher 10 ações e acompanhar cada uma, uma pessoa compra um ETF do Ibovespa e outro de bolsa americana. Em duas ordens, tem exposição a centenas de empresas em dois países.

## Para que serve na carteira
ETFs são uma boa base para a parte de longo prazo, com aportes regulares. Quem quiser escolher ações individuais pode usar os ETFs como núcleo e as ações como complemento.`,
          pontos: [
            'ETF replica um índice e é negociado na bolsa.',
            'Diversificação imediata e custo baixo são as maiores vantagens.',
            'Ele acompanha o índice nas altas e nas quedas.',
            'Tributação própria, diferente das ações: confira a regra vigente.',
          ],
          quiz: [
            { p: 'O objetivo de um ETF de índice é:', o: ['Bater o índice', 'Replicar o índice', 'Garantir retorno'], c: 1, e: 'Gestão passiva: acompanhar o índice, com custo baixo.' },
            { p: 'Uma vantagem típica dos ETFs é:', o: ['Garantia do FGC', 'Diversificação com custo baixo', 'Isenção total de impostos'], c: 1, e: 'Com uma cota, você leva um índice inteiro por uma taxa pequena.' },
            { p: 'Um ETF de bolsa americana tem um risco a mais para o investidor brasileiro:', o: ['O câmbio', 'O FGC', 'A Selic'], c: 0, e: 'O resultado em reais depende também da variação do dólar.' },
          ],
          painel: { texto: 'Acompanhar índices no Mercado', aba: 'market-panel' },
          livro: LIVRO_MVM,
        },
        {
          id: 'operar-na-bolsa',
          termos: 'home broker corretora ordem liquidacao',
          titulo: 'Como operar na bolsa',
          minutos: 7,
          abertura: 'Antes da primeira ordem, vale entender como ela funciona, quando o dinheiro sai da conta e quanto custa.',
          texto: `## Tipos de ordem
- **A mercado:** executa pelo melhor preço disponível no momento. É rápida, mas o preço pode surpreender em ativos pouco negociados.
- **Limitada:** você define o preço máximo (compra) ou mínimo (venda). Só executa se o mercado chegar lá.
- **Stop:** dispara uma ordem quando o preço atinge um nível. Usada para limitar perdas (stop loss) ou realizar ganhos.

## Lote padrão e fracionário
Ações são negociadas em lotes padrão (em geral, de 100 ações) e no mercado fracionário, que permite comprar quantidades menores. No fracionário, o código ganha a letra F no final.

## Liquidação
A compra é feita na hora, mas a liquidação (quando o dinheiro sai e a ação entra de fato) acontece alguns dias úteis depois. Por isso o saldo precisa estar disponível na data da liquidação.

## Custos
- **Corretagem:** muitas corretoras zeraram para ações.
- **Emolumentos e taxas da B3:** pequenas, cobradas em toda operação.
- **Spread:** a diferença entre o melhor preço de compra e o de venda, que pesa em ativos com pouca liquidez.

## Imposto de Renda
O ganho na venda de ações é tributado, com regras diferentes para operações comuns e day trade, e há casos de isenção para vendas mensais pequenas de ações. O investidor é responsável por apurar e pagar o imposto (por DARF) e declarar tudo no ajuste anual. As alíquotas e limites mudam: confira a regra vigente.

> Exemplo: você quer comprar uma ação que está sendo negociada a R$ 20,30. Uma ordem limitada a R$ 20,00 só executa se alguém vender por esse preço. Uma ordem a mercado executa já, provavelmente por R$ 20,30 ou um pouco mais.`,
          pontos: [
            'Ordem a mercado é rápida; limitada controla o preço; stop dispara num nível.',
            'Lote padrão e fracionário (final F).',
            'A liquidação acontece dias úteis depois da compra.',
            'Você apura e paga o IR sobre ganhos: confira as regras vigentes.',
          ],
          quiz: [
            { p: 'Uma ordem limitada de compra a R$ 10:', o: ['Executa por qualquer preço', 'Só executa a R$ 10 ou menos', 'Executa só no dia seguinte'], c: 1, e: 'Na compra, a ordem limitada define o preço máximo.' },
            { p: 'O código PETR4F indica:', o: ['Mercado fracionário', 'Um fundo', 'Uma opção'], c: 0, e: 'A letra F no final indica negociação no fracionário.' },
            { p: 'Quem apura e paga o IR sobre ganhos com ações vendidas?', o: ['A B3, automaticamente', 'O próprio investidor', 'Ninguém, ações são isentas'], c: 1, e: 'O investidor apura e paga por DARF, além de declarar no ajuste anual.' },
          ],
          painel: { texto: 'Montar a sua Watchlist', aba: 'watch-panel' },
          livro: LIVRO_MVM,
        },
        {
          id: 'carteira',
          titulo: 'Montando uma carteira',
          minutos: 7,
          abertura: 'Uma carteira não é uma lista de bons ativos. É um conjunto pensado para os seus objetivos, prazos e tolerância a perdas.',
          texto: `## Comece pelo perfil
Antes de recomendar produtos, as instituições são obrigadas a avaliar o perfil do investidor (a chamada análise de suitability): objetivos, prazo, conhecimento e quanto de oscilação a pessoa aguenta. Responda com sinceridade: o pior momento para descobrir que não aguenta uma queda é durante a queda.

## Alocação de ativos
A decisão que mais pesa no resultado é quanto colocar em cada classe:
- **Renda fixa pós-fixada:** estabilidade e liquidez.
- **Renda fixa de inflação e prefixada:** proteção e travas de taxa no longo prazo.
- **Ações e fundos imobiliários:** potencial de crescimento, com mais oscilação.
- **Investimentos no exterior:** diversificação geográfica e de moeda.

Não existe proporção certa para todo mundo. Quem tem prazo longo e estômago para oscilação pode ter mais renda variável; quem vai precisar do dinheiro logo, menos.

## Rebalanceamento
Com o tempo, as classes rendem diferente e a carteira se afasta do plano. Rebalancear é voltar às proporções definidas, vendendo um pouco do que subiu muito ou direcionando os novos aportes para o que ficou para trás. Isso força, de forma disciplinada, a vender caro e comprar barato.

> Exemplo hipotético: o plano é 70% em renda fixa e 30% em ações. Depois de um ano bom para a bolsa, a carteira está 60% e 40%. Os próximos aportes vão todos para renda fixa até voltar perto de 70/30.

## Custos e simplicidade
Taxas e impostos corroem o resultado ao longo dos anos. Uma carteira simples, barata e mantida com disciplina costuma vencer uma carteira complexa que ninguém acompanha.`,
          pontos: [
            'O perfil (objetivo, prazo, tolerância a perdas) vem antes dos produtos.',
            'A alocação entre classes é a decisão que mais pesa.',
            'Rebalancear mantém o risco no nível planejado.',
            'Simples, barato e disciplinado costuma vencer.',
          ],
          quiz: [
            { p: 'A decisão que mais pesa no resultado de longo prazo costuma ser:', o: ['A escolha de uma ação específica', 'A alocação entre classes de ativos', 'O horário de compra'], c: 1, e: 'Quanto vai para cada classe define a maior parte do risco e do retorno.' },
            { p: 'Rebalancear a carteira significa:', o: ['Vender tudo quando cai', 'Voltar às proporções definidas no plano', 'Trocar de corretora'], c: 1, e: 'É ajustar os pesos de volta ao planejado.' },
            { p: 'Para quem vai usar o dinheiro em 1 ano, em geral faz sentido:', o: ['Mais renda variável', 'Menos renda variável', 'Só ações de crescimento'], c: 1, e: 'Prazo curto pede menos oscilação.' },
          ],
          painel: null,
          livro: LIVRO_MVM,
        },
      ],
    },
    {
      id: 'analise',
      titulo: 'Analisando empresas',
      nivel: 'Intermediário',
      resumo: 'Demonstrações financeiras, rentabilidade, endividamento, múltiplos, valuation e análise técnica.',
      licoes: [
        {
          id: 'demonstracoes',
          titulo: 'As demonstrações financeiras',
          minutos: 7,
          abertura: 'Toda análise séria de uma empresa começa pelos números que ela é obrigada a publicar. Três relatórios contam quase toda a história.',
          texto: `## Onde encontrar
Companhias abertas divulgam resultados trimestrais (ITR) e anuais (DFP), além do Formulário de Referência, que descreve o negócio, os riscos e a administração. Tudo fica disponível no sistema da CVM e na área de Relações com Investidores (RI) do site da empresa.

## Demonstração do Resultado (DRE)
Mostra o que aconteceu no período, de cima para baixo:
- **Receita líquida:** vendas, já descontados impostos e devoluções.
- **Lucro bruto:** receita menos o custo direto do que foi vendido.
- **Resultado operacional (EBIT):** depois das despesas de vendas, administrativas e outras.
- **Resultado financeiro:** juros pagos e recebidos.
- **Lucro líquido:** o que sobra depois de tudo e dos impostos sobre o lucro.

## Balanço Patrimonial
É uma fotografia numa data: o que a empresa **tem** (ativos), o que **deve** (passivos) e o que pertence aos sócios (patrimônio líquido). Ativo = passivo + patrimônio líquido, sempre.

## Demonstração dos Fluxos de Caixa (DFC)
Mostra o dinheiro que de fato entrou e saiu, em três grupos: operações, investimentos e financiamentos. Lucro e caixa são coisas diferentes: uma empresa pode ter lucro contábil e, ainda assim, queimar caixa.

> Exemplo hipotético: uma varejista vende muito a prazo. A DRE mostra lucro, mas os clientes ainda não pagaram. Se ela precisar de empréstimos caros para financiar esse prazo, o caixa operacional revela o aperto antes do lucro.

## Leia as notas explicativas
As notas detalham critérios contábeis, dívidas, processos e eventos fora do comum. Muitas vezes, o que importa está ali.`,
          pontos: [
            'ITR, DFP e Formulário de Referência ficam na CVM e no RI da empresa.',
            'DRE mostra o resultado do período; Balanço, a posição numa data.',
            'Fluxo de caixa mostra o dinheiro real; lucro e caixa não são a mesma coisa.',
            'As notas explicativas trazem detalhes decisivos.',
          ],
          quiz: [
            { p: 'Qual relatório mostra o que a empresa tem e deve numa data?', o: ['DRE', 'Balanço Patrimonial', 'Fluxo de caixa'], c: 1, e: 'O balanço é a fotografia de ativos, passivos e patrimônio líquido.' },
            { p: 'Uma empresa com lucro pode estar sem caixa?', o: ['Não, lucro é caixa', 'Sim, lucro contábil e caixa são diferentes', 'Só se for banco'], c: 1, e: 'Vendas a prazo e investimentos, por exemplo, separam lucro de caixa.' },
            { p: 'Onde encontrar os resultados oficiais de uma companhia aberta?', o: ['Só em notícias', 'Na CVM e no site de RI da empresa', 'Em redes sociais'], c: 1, e: 'ITR, DFP e Formulário de Referência são públicos.' },
          ],
          painel: { texto: 'Ver os números na aba Fundamentos', aba: 'fund-panel' },
          livro: LIVRO_AI,
        },
        {
          id: 'rentabilidade',
          titulo: 'Margens e rentabilidade',
          minutos: 6,
          abertura: 'Vender muito não basta. O que interessa é quanto de cada real vendido vira lucro, e quanto lucro a empresa gera com o capital que usa.',
          texto: `## Margens
- **Margem bruta:** lucro bruto ÷ receita. Mostra o poder de preço e o custo de produção.
- **Margem EBITDA:** EBITDA ÷ receita. O EBITDA é o resultado operacional antes de juros, impostos, depreciação e amortização; aproxima a geração de caixa da operação.
- **Margem líquida:** lucro líquido ÷ receita. O que sobra no fim, depois de tudo.

Compare margens com as de empresas do mesmo setor e com o histórico da própria empresa. Supermercados vivem com margens baixas; empresas de software, com margens altas. Isso, sozinho, não diz qual é melhor investimento.

## Retorno sobre o capital
- **ROE (retorno sobre o patrimônio):** lucro líquido ÷ patrimônio líquido. Quanto a empresa gera para cada real dos sócios.
- **ROIC (retorno sobre o capital investido):** lucro operacional depois de impostos ÷ capital investido (dos sócios e da dívida). Mostra se o negócio, em si, cria valor.

Um ROE alto pode vir de muita dívida, e não de um bom negócio. Por isso vale olhar o ROIC junto.

> Exemplo hipotético: duas empresas têm ROE de 20%. A primeira tem pouca dívida e ROIC de 18%. A segunda tem dívida alta e ROIC de 8%. A primeira tem um negócio mais rentável; a segunda usa a alavancagem para inflar o ROE, e corre mais risco.

## Consistência
Uma margem alta num ano pode ser exceção. Empresas boas mantêm rentabilidade acima do custo de capital por muitos anos, o que costuma indicar alguma vantagem competitiva.`,
          pontos: [
            'Margem bruta, EBITDA e líquida mostram quanto de cada real vira resultado.',
            'Compare com o setor e com o histórico, não com empresas de outros ramos.',
            'ROE mede o retorno aos sócios; ROIC, o retorno do negócio.',
            'ROE alto com ROIC baixo pode ser só dívida.',
          ],
          quiz: [
            { p: 'Margem líquida é:', o: ['Lucro líquido ÷ receita', 'Receita ÷ ativos', 'Dívida ÷ EBITDA'], c: 0, e: 'Mostra quanto de cada real vendido sobra como lucro final.' },
            { p: 'Um ROE muito alto com ROIC baixo pode indicar:', o: ['Negócio excelente sem riscos', 'Uso elevado de dívida', 'Empresa sem lucro'], c: 1, e: 'A alavancagem pode inflar o retorno ao sócio sem que o negócio seja tão rentável.' },
            { p: 'Para avaliar se uma margem é boa, compare com:', o: ['Empresas de qualquer setor', 'O mesmo setor e o histórico da empresa', 'A Selic'], c: 1, e: 'Cada setor tem margens típicas muito diferentes.' },
          ],
          painel: { texto: 'Ver margens e ROE em Fundamentos', aba: 'fund-panel' },
          livro: LIVRO_AI,
        },
        {
          id: 'endividamento',
          titulo: 'Endividamento e saúde financeira',
          minutos: 6,
          abertura: 'Dívida não é problema em si: é ferramenta. O problema é dívida demais, cara demais ou concentrada no prazo errado.',
          texto: `## Dívida líquida
Dívida líquida = empréstimos e financiamentos − caixa e aplicações. Uma empresa com muita dívida bruta e muito caixa pode estar tranquila.

## Dívida líquida / EBITDA
É o indicador mais usado de alavancagem: quantos anos de geração operacional seriam necessários para pagar a dívida. Quanto menor, mais folga. O nível aceitável depende do setor: negócios estáveis, como energia, suportam mais que negócios cíclicos.

## Cobertura de juros
EBIT (ou EBITDA) ÷ despesa com juros. Mostra quantas vezes o resultado operacional cobre os juros. Cobertura baixa deixa a empresa vulnerável a uma alta de juros ou a um ano ruim.

## Prazo e custo
- **Cronograma de vencimentos:** muita dívida vencendo no curto prazo exige refinanciamento, o que é arriscado em momentos de crédito caro.
- **Indexador:** dívida atrelada ao CDI fica mais cara quando a Selic sobe; dívida em dólar sem receita em dólar traz risco de câmbio.

## Liquidez corrente
Ativo circulante ÷ passivo circulante. Indica se o que a empresa tem para receber e vender no curto prazo cobre o que ela deve no curto prazo.

> Exemplo hipotético: uma empresa tem dívida líquida de 3 vezes o EBITDA, quase toda atrelada ao CDI e vencendo em dois anos. Se a Selic sobe e o resultado cai, o mesmo endividamento passa a apertar muito mais.

## Bancos são diferentes
Para bancos e seguradoras, dívida é matéria-prima do negócio. Esses indicadores não se aplicam; a análise usa capital regulatório, inadimplência e outros números próprios do setor.`,
          pontos: [
            'Dívida líquida desconta o caixa da dívida bruta.',
            'Dívida líquida/EBITDA mede a alavancagem; o nível aceitável varia por setor.',
            'Olhe também cobertura de juros, prazos e indexadores.',
            'Bancos e seguradoras têm análise própria.',
          ],
          quiz: [
            { p: 'Dívida líquida é:', o: ['Dívida bruta + caixa', 'Dívida bruta − caixa e aplicações', 'Patrimônio − dívida'], c: 1, e: 'O caixa disponível reduz a dívida efetiva.' },
            { p: 'Uma dívida atrelada ao CDI fica mais cara quando:', o: ['A Selic sobe', 'O dólar cai', 'A empresa vende mais'], c: 0, e: 'O CDI acompanha a Selic.' },
            { p: 'Dívida líquida/EBITDA serve bem para analisar:', o: ['Bancos', 'Empresas não financeiras', 'Fundos imobiliários'], c: 1, e: 'Para bancos, dívida faz parte do negócio e a análise é outra.' },
          ],
          painel: { texto: 'Ver Dív.líq./EBITDA em Fundamentos', aba: 'fund-panel' },
          livro: LIVRO_AI,
        },
        {
          id: 'multiplos',
          termos: 'pl p/l ev ebitda dividend yield',
          titulo: 'Múltiplos: caro ou barato?',
          minutos: 7,
          abertura: 'Múltiplos comparam o preço de uma ação com algum número da empresa. São atalhos úteis, desde que se saiba o que cada um esconde.',
          texto: `## Os principais
- **P/L (preço/lucro):** preço da ação ÷ lucro por ação. Em quantos anos o lucro atual "pagaria" o preço, se nada mudasse.
- **P/VP (preço/valor patrimonial):** preço ÷ patrimônio líquido por ação. Muito usado para bancos.
- **EV/EBITDA:** valor da firma (valor de mercado + dívida líquida) ÷ EBITDA. Leva em conta a dívida, por isso compara melhor empresas com estruturas diferentes.
- **Dividend yield:** proventos pagos nos últimos 12 meses ÷ preço. Quanto a ação "pagou" de renda.

## Barato pode estar barato por um motivo
Um P/L baixo pode significar oportunidade ou que o mercado espera queda forte do lucro. Um dividend yield alto pode vir de um pagamento extraordinário, que não vai se repetir, ou de uma queda do preço por problemas.

## Como usar bem
- Compare com empresas do **mesmo setor**.
- Compare com o **histórico** da própria empresa.
- Use o lucro **recorrente**, tirando efeitos de uma vez só, como venda de ativos.
- Olhe vários múltiplos juntos, nunca um só.

> Exemplo hipotético: a empresa A tem P/L 6 e a B, P/L 15. Mas A tem lucro em queda e muita dívida, enquanto B cresce o lucro todo ano sem dívida. Pelo EV/EBITDA e pelo crescimento, B pode estar mais barata do que parece.

## Classe de ações
Para empresas com mais de uma classe de ações (ON e PN), o valor de mercado precisa somar todas. Usar o preço de uma classe só com o número total de ações distorce os múltiplos.`,
          pontos: [
            'P/L, P/VP, EV/EBITDA e dividend yield são os múltiplos mais usados.',
            'Barato pode estar barato por um motivo: investigue.',
            'Compare com o setor e o histórico, usando lucro recorrente.',
            'Nunca decida por um múltiplo isolado.',
          ],
          quiz: [
            { p: 'O EV/EBITDA leva em conta:', o: ['Só o valor de mercado', 'O valor de mercado e a dívida líquida', 'Só os dividendos'], c: 1, e: 'O valor da firma soma o valor de mercado e a dívida líquida.' },
            { p: 'Um dividend yield muito alto pode vir de:', o: ['Um pagamento extraordinário ou queda do preço', 'Sempre de uma empresa excelente', 'Erro da bolsa'], c: 0, e: 'É preciso ver se o pagamento se repete e por que o preço caiu.' },
            { p: 'Para comparar P/L de forma justa, use:', o: ['Empresas do mesmo setor e lucro recorrente', 'Qualquer empresa da bolsa', 'O lucro de um ano com venda de ativos'], c: 0, e: 'Setor e lucro recorrente evitam comparações enganosas.' },
          ],
          painel: { texto: 'Ver P/L e DY em Fundamentos', aba: 'fund-panel' },
          livro: LIVRO_AI,
        },
        {
          id: 'valuation',
          titulo: 'Valuation: quanto vale uma empresa',
          minutos: 7,
          abertura: 'O valor de uma empresa é o caixa que ela vai gerar no futuro, trazido para hoje. A ideia é simples; a dificuldade está nas premissas.',
          texto: `## Fluxo de caixa descontado
O método mais tradicional projeta o caixa livre da empresa por alguns anos e o traz a valor presente por uma taxa de desconto. Os passos:
- **Projetar** receitas, margens e investimentos para os próximos anos.
- **Estimar o valor na perpetuidade**, depois do período projetado, com um crescimento modesto.
- **Descontar** tudo pela taxa que representa o retorno exigido, considerando o risco.
- **Subtrair a dívida líquida** para chegar ao valor dos acionistas e dividir pelo número de ações.

## A taxa de desconto
Quanto mais arriscada a empresa, maior o retorno exigido e menor o valor presente. Juros mais altos na economia também elevam a taxa de desconto. É por isso que as ações, em geral, sofrem quando os juros sobem.

## Sensibilidade
Pequenas mudanças nas premissas mudam muito o resultado. Por isso, analistas montam cenários (pessimista, base e otimista) e tabelas de sensibilidade, em vez de um único número.

> Exemplo hipotético: uma empresa gera R$ 100 milhões de caixa livre por ano, para sempre, sem crescer. Com taxa de desconto de 10%, vale cerca de R$ 1 bilhão (100 ÷ 0,10). Com 12,5%, vale R$ 800 milhões. Só a mudança da taxa tirou 20% do valor.

## Margem de segurança
Como o valor estimado é incerto, investidores de valor só compram quando o preço está bem abaixo da estimativa. A diferença é a margem de segurança contra erros nas premissas.

## Outros métodos
Comparação por múltiplos de empresas parecidas, valor dos ativos e modelos de dividendos completam a análise. Bons analistas usam mais de um.`,
          pontos: [
            'Valor = caixa futuro trazido a valor presente.',
            'Taxa de desconto maior (mais risco ou juros altos) reduz o valor.',
            'Premissas mudam muito o resultado: use cenários.',
            'Margem de segurança protege contra erros de estimativa.',
          ],
          quiz: [
            { p: 'Se a taxa de desconto sobe, o valor presente de uma empresa:', o: ['Sobe', 'Cai', 'Não muda'], c: 1, e: 'O caixa futuro vale menos hoje quando o retorno exigido é maior.' },
            { p: 'Margem de segurança é:', o: ['Comprar bem abaixo do valor estimado', 'Uma taxa da corretora', 'O lucro mínimo da empresa'], c: 0, e: 'Ela protege contra erros nas premissas.' },
            { p: 'Por que montar cenários no valuation?', o: ['Porque as premissas são incertas e mudam muito o resultado', 'Por exigência da B3', 'Para aumentar o preço-alvo'], c: 0, e: 'Cenários mostram a faixa de valores possíveis.' },
          ],
          painel: null,
          livro: LIVRO_AI,
        },
        {
          id: 'analise-tecnica',
          titulo: 'Análise técnica: lendo o gráfico',
          minutos: 7,
          abertura: 'A análise técnica estuda o preço e o volume para identificar tendências e pontos de entrada e saída. É uma ferramenta de leitura do comportamento do mercado, não uma bola de cristal.',
          texto: `## A ideia central
O preço reflete o comportamento coletivo de compradores e vendedores, e esse comportamento tende a formar padrões. A análise técnica tenta reconhecer esses padrões para tomar decisões com regras claras.

## Tendência
- **Alta:** topos e fundos cada vez mais altos.
- **Baixa:** topos e fundos cada vez mais baixos.
- **Lateral:** o preço oscila numa faixa.

## Suporte e resistência
**Suporte** é uma região onde a demanda costuma segurar a queda; **resistência**, onde a oferta costuma segurar a alta. Quando rompidos com força, um suporte pode virar resistência, e vice-versa.

## Médias móveis
A média dos preços de fechamento dos últimos N períodos suaviza o ruído e ajuda a ver a tendência. Cruzamentos entre uma média curta e uma longa são usados como sinais, com atraso inerente.

## Volume
Movimentos com volume alto tendem a ser mais confiáveis do que movimentos com pouco volume.

## Indicadores
Osciladores como o IFR (índice de força relativa) tentam medir se um movimento está esticado demais. Funcionam melhor em mercados laterais e podem dar sinais falsos em tendências fortes.

> Exemplo: uma ação vem respeitando uma região de preço como suporte há meses. Um investidor compra perto desse suporte e define, antes da compra, um stop logo abaixo dele. Se o suporte romper, ele sai com uma perda pequena e conhecida.

## Limites
Nenhum padrão funciona sempre. O valor da análise técnica está mais na **disciplina** (entrada, saída e tamanho da posição definidos antes) do que em prever o futuro. Ela pode ser combinada com a análise fundamentalista: os fundamentos dizem o que comprar; o gráfico, quando.`,
          pontos: [
            'Tendência, suporte e resistência são a base da leitura do gráfico.',
            'Médias móveis suavizam o ruído, com atraso.',
            'Volume ajuda a confirmar movimentos.',
            'O ganho real está na disciplina: saída definida antes da entrada.',
          ],
          quiz: [
            { p: 'Uma tendência de alta tem:', o: ['Topos e fundos cada vez mais altos', 'Topos e fundos cada vez mais baixos', 'Preço parado'], c: 0, e: 'É a definição clássica de tendência de alta.' },
            { p: 'Suporte é uma região onde:', o: ['A demanda costuma segurar a queda', 'A oferta segura a alta', 'A bolsa fecha'], c: 0, e: 'Compradores costumam aparecer nessa faixa de preço.' },
            { p: 'Uma das principais utilidades da análise técnica é:', o: ['Prever o futuro com certeza', 'Dar disciplina a entradas e saídas', 'Calcular o valor justo da empresa'], c: 1, e: 'Regras definidas antes da operação controlam perdas.' },
          ],
          painel: { texto: 'Ver gráficos na Watchlist', aba: 'watch-panel' },
          livro: LIVRO_AI,
        },
      ],
    },
    {
      id: 'derivativos',
      titulo: 'Derivativos e macro',
      nivel: 'Avançado',
      resumo: 'Mercado futuro, opções, curva de juros, expectativas do Copom e do Fed, câmbio e fluxo.',
      licoes: [
        {
          id: 'o-que-sao-derivativos',
          titulo: 'O que são derivativos',
          minutos: 6,
          abertura: 'Um derivativo é um contrato cujo valor depende de outro ativo: uma ação, um índice, uma taxa de juros, uma moeda ou uma commodity.',
          texto: `## Para que servem
- **Proteção (hedge):** travar um preço ou uma taxa para reduzir um risco que já existe. Ex.: um exportador que vende dólares no futuro para se proteger de uma queda da moeda.
- **Especulação:** assumir um risco em busca de ganho com a variação do preço.
- **Arbitragem:** aproveitar diferenças de preço entre mercados ligados.

## Os tipos principais
- **Termo:** compra ou venda combinada hoje para liquidação numa data futura, negociada entre as partes.
- **Futuro:** parecido com o termo, mas padronizado, negociado em bolsa e com ajuste diário.
- **Opções:** o direito, não a obrigação, de comprar ou vender um ativo a um preço definido.
- **Swap:** troca de indexadores entre as partes, como trocar uma taxa prefixada por CDI.

## Alavancagem
Em muitos derivativos, basta depositar uma margem de garantia, bem menor que o valor do contrato. Isso multiplica ganhos e perdas em relação ao capital investido.

> Exemplo hipotético: um contrato com valor de R$ 100 mil exige R$ 10 mil de margem. Uma alta de 5% no ativo gera R$ 5 mil, que são 50% sobre a margem. Uma queda de 5% tira os mesmos R$ 5 mil.

## Risco de contraparte
Em bolsa, a B3 atua como contraparte central: garante que os contratos serão honrados, usando as margens depositadas. Em operações de balcão, sem essa estrutura, o risco de a outra parte não pagar é maior.`,
          pontos: [
            'Derivativo é um contrato que deriva seu valor de outro ativo.',
            'Serve para proteção, especulação e arbitragem.',
            'Termo, futuro, opções e swap são os tipos principais.',
            'A alavancagem multiplica ganhos e perdas.',
          ],
          quiz: [
            { p: 'Um exportador vende dólar futuro para se proteger de queda da moeda. Isso é:', o: ['Especulação', 'Hedge', 'Arbitragem'], c: 1, e: 'Ele reduz um risco que já tem no negócio.' },
            { p: 'A diferença entre termo e futuro é que o futuro:', o: ['É padronizado, negociado em bolsa e tem ajuste diário', 'Não tem data de vencimento', 'É sempre mais barato'], c: 0, e: 'O termo é negociado entre as partes; o futuro é padronizado.' },
            { p: 'Com alavancagem, uma pequena variação do ativo:', o: ['Gera ganhos e perdas grandes em relação à margem', 'Não afeta nada', 'Só gera ganhos'], c: 0, e: 'A margem é pequena perto do valor do contrato.' },
          ],
          painel: null,
          livro: LIVRO_MVM,
        },
        {
          id: 'mercado-futuro',
          titulo: 'Mercado futuro e o ajuste diário',
          minutos: 7,
          abertura: 'No mercado futuro, ninguém espera o vencimento para acertar as contas. O ganho ou a perda é pago todo dia, pelo ajuste diário.',
          texto: `## Contratos padronizados
Cada contrato futuro tem regras definidas pela B3: o ativo, o tamanho, os vencimentos e a forma de liquidação. Entre os mais negociados estão os de Ibovespa, dólar e taxa DI, além de versões "mini" com tamanho menor, populares entre pessoas físicas.

## Ajuste diário
Todo dia a B3 calcula um **preço de ajuste** para cada vencimento. Quem está comprado recebe se o preço subiu em relação ao ajuste anterior e paga se caiu; quem está vendido, o contrário. O valor é creditado ou debitado na conta no dia seguinte.

> Exemplo hipotético: você compra um contrato quando o preço é 100.000 pontos. No fim do dia, o ajuste fica em 101.000. Você recebe a diferença de 1.000 pontos, convertida em reais pelo valor do ponto do contrato. No dia seguinte, a referência passa a ser 101.000.

## Margem de garantia
Para abrir a posição, a B3 exige uma margem, que pode ser chamada a aumentar se o mercado andar contra você. Sem saldo para cobrir ajustes e margens, a corretora pode zerar a posição.

## Variação e preço de referência
Como o ajuste muda de um dia para o outro, a variação de um futuro sempre depende da referência usada. Fora do horário de negociação, o ajuste do dia já pode ter sido publicado, mudando a base da comparação.

## Riscos
- **Alavancagem:** perdas podem passar da margem depositada.
- **Rolagem:** quem quer manter a posição precisa trocar de vencimento antes do fim, com custos.
- **Liquidez:** vencimentos distantes podem ter pouco negócio.`,
          pontos: [
            'Contratos futuros são padronizados pela B3.',
            'O ajuste diário acerta ganhos e perdas todos os dias.',
            'A margem pode ser chamada a aumentar.',
            'As perdas podem superar a margem depositada.',
          ],
          quiz: [
            { p: 'No ajuste diário, quem está comprado e o preço sobe:', o: ['Paga a diferença', 'Recebe a diferença', 'Nada acontece até o vencimento'], c: 1, e: 'Comprado ganha com a alta, e o valor é creditado no dia seguinte.' },
            { p: 'Se o mercado andar contra a sua posição, a B3 pode:', o: ['Pedir mais margem', 'Cancelar o contrato sem custo', 'Devolver a margem'], c: 0, e: 'A margem protege o sistema contra inadimplência.' },
            { p: 'Perdas num contrato futuro:', o: ['Estão limitadas à margem', 'Podem superar a margem', 'Não existem por causa do ajuste'], c: 1, e: 'A margem é só a garantia inicial.' },
          ],
          painel: { texto: 'Ver os Futuros B3 na Mesa', aba: 'mesa-panel' },
          livro: LIVRO_MVM,
        },
        {
          id: 'opcoes',
          titulo: 'Opções: direitos e obrigações',
          minutos: 8,
          abertura: 'Uma opção dá a quem compra um direito e a quem vende uma obrigação. Essa assimetria é o que torna as opções tão úteis e tão perigosas.',
          texto: `## Os termos
- **Opção de compra (call):** direito de comprar o ativo a um preço definido.
- **Opção de venda (put):** direito de vender o ativo a um preço definido.
- **Preço de exercício (strike):** o preço combinado.
- **Prêmio:** o valor pago pela opção.
- **Titular:** quem compra a opção e tem o direito.
- **Lançador:** quem vende a opção, recebe o prêmio e assume a obrigação.

## Dentro, no e fora do dinheiro
Uma call está **dentro do dinheiro** quando o ativo vale mais que o strike; **fora**, quando vale menos; e **no dinheiro**, quando estão próximos. Para a put, é o inverso.

## O que forma o prêmio
- A diferença entre o preço do ativo e o strike (valor intrínseco).
- O tempo até o vencimento: mais tempo, mais chances, prêmio maior.
- A volatilidade esperada: quanto mais o ativo oscila, mais vale a opção.
- Os juros.

Com o passar dos dias, o valor ligado ao tempo vai se perdendo. Isso joga contra o titular e a favor do lançador.

> Exemplo hipotético: uma ação vale R$ 30. Você paga R$ 1 por uma call com strike de R$ 32. No vencimento, se a ação estiver a R$ 35, a opção vale R$ 3 e o ganho é de R$ 2 por opção. Se estiver abaixo de R$ 32, a opção vira pó e você perde o R$ 1 pago.

## Riscos
- **Titular:** perde no máximo o prêmio, mas perde com frequência.
- **Lançador coberto:** quem vende call tendo as ações abre mão de parte da alta em troca do prêmio.
- **Lançador descoberto:** quem vende call sem ter as ações tem risco de perda muito grande. Exige margem e experiência.

## Usos comuns
Proteger uma carteira comprando puts, gerar renda vendendo calls cobertas ou montar estratégias que combinam várias opções.`,
          pontos: [
            'Call dá direito de comprar; put, de vender, ao preço de exercício.',
            'O titular paga o prêmio; o lançador recebe e assume a obrigação.',
            'Tempo e volatilidade pesam no prêmio; o tempo corre contra o titular.',
            'Vender call descoberta pode gerar perdas muito grandes.',
          ],
          quiz: [
            { p: 'Quem compra uma put tem:', o: ['O direito de vender o ativo ao strike', 'A obrigação de comprar', 'O direito de comprar'], c: 0, e: 'Put é opção de venda.' },
            { p: 'A perda máxima do titular de uma opção é:', o: ['Ilimitada', 'O prêmio pago', 'O valor do strike'], c: 1, e: 'Ele pode simplesmente não exercer.' },
            { p: 'Com o passar do tempo, mantido o resto, o valor de uma opção tende a:', o: ['Subir', 'Cair', 'Ficar igual'], c: 1, e: 'O valor ligado ao tempo vai se perdendo até o vencimento.' },
          ],
          painel: { texto: 'Abrir a aba Opções', aba: 'options-panel' },
          livro: LIVRO_MVM,
        },
        {
          id: 'curva-de-juros',
          titulo: 'A curva de juros',
          minutos: 7,
          abertura: 'A curva de juros mostra quanto o mercado cobra para emprestar por prazos diferentes. Lida com cuidado, ela conta o que se espera da Selic e do risco do país.',
          texto: `## De onde ela vem
No Brasil, a curva mais acompanhada é a do DI futuro, negociado na B3. Cada vencimento tem uma taxa. Ligando os pontos, do mais curto ao mais longo, forma-se a curva "DI x pré".

## Formatos
- **Positivamente inclinada:** taxas longas acima das curtas. Pode refletir expectativa de alta da Selic ou prêmio por emprestar por mais tempo.
- **Invertida:** taxas longas abaixo das curtas. Em geral, o mercado espera cortes de juros.
- **Plana:** pouca diferença entre os prazos.

## O que está dentro de uma taxa longa
A taxa de um vencimento distante reflete a expectativa para a Selic ao longo de todo o período **mais um prêmio de risco**, pela incerteza fiscal, inflacionária e política. Por isso, mesmo com expectativa de cortes, as taxas longas podem subir se a percepção de risco piorar.

> Exemplo hipotético: a Selic está em 10%. Se os vencimentos de um ano negociam a 9%, o mercado espera, em média, juros menores nos próximos meses. Se os de dez anos negociam a 12%, há um prêmio exigido para emprestar por tanto tempo.

## Por que importa
- Define o custo de crédito de empresas e famílias.
- Afeta o preço dos títulos prefixados e de inflação.
- Influencia o valor das ações: juros longos maiores reduzem o valor presente dos lucros futuros.

## Juros reais
Comparando a curva prefixada com a curva de títulos atrelados à inflação, chega-se à inflação implícita: quanto de inflação o mercado está precificando para cada prazo.`,
          pontos: [
            'A curva DI x pré liga as taxas do DI futuro por vencimento.',
            'Inclinada, invertida ou plana: cada formato sugere uma expectativa.',
            'Taxas longas somam expectativa de Selic e prêmio de risco.',
            'A curva afeta crédito, títulos e o preço das ações.',
          ],
          quiz: [
            { p: 'Uma curva invertida costuma indicar:', o: ['Expectativa de cortes de juros', 'Expectativa de alta forte', 'Nada sobre os juros'], c: 0, e: 'Taxas curtas acima das longas sugerem juros menores à frente.' },
            { p: 'As taxas longas podem subir mesmo com expectativa de cortes por causa de:', o: ['Prêmio de risco maior', 'Feriados', 'Volume baixo'], c: 0, e: 'Incerteza fiscal ou inflacionária aumenta o prêmio exigido.' },
            { p: 'Comparar a curva prefixada com a de juros reais revela:', o: ['A inflação implícita', 'O preço do dólar', 'O lucro das empresas'], c: 0, e: 'A diferença entre as duas é a inflação que o mercado espera.' },
          ],
          painel: { texto: 'Ver a curva DI na Mesa', aba: 'mesa-panel' },
          livro: LIVRO_MVM,
        },
        {
          id: 'copom-e-fed',
          titulo: 'Copom, Fed e as probabilidades do mercado',
          minutos: 7,
          abertura: 'Antes de cada reunião de juros, o mercado já colocou um preço na decisão. Saber ler esse preço ajuda a entender as reações depois do anúncio.',
          texto: `## As reuniões
- **Copom:** o comitê do Banco Central do Brasil que decide a meta da Selic, em reuniões ao longo do ano. Depois de cada uma, publica um comunicado e, dias depois, a ata.
- **FOMC:** o comitê do Federal Reserve, o banco central dos EUA, que decide a faixa da taxa de juros americana (fed funds). Em algumas reuniões, divulga também as projeções dos membros.

## Como o mercado precifica
- **Nos EUA:** os contratos futuros de fed funds embutem a taxa média esperada para cada mês. Com eles, calcula-se a probabilidade implícita de cada decisão, como faz o FedWatch da CME.
- **No Brasil:** a B3 tem opções ligadas à decisão do Copom, cujos prêmios indicam a probabilidade de cada cenário. A curva de DI também sinaliza a expectativa.
- **Pesquisas:** o boletim Focus, do Banco Central, reúne as projeções de economistas para Selic, inflação, câmbio e PIB.

## Surpresa é o que move preço
O mercado reage à diferença entre a decisão e o que já estava no preço. Um corte de juros esperado por quase todos pode até derrubar a bolsa, se o comunicado indicar menos cortes à frente.

> Exemplo hipotético: os contratos indicam 90% de chance de manutenção. O banco central mantém, mas o comunicado sinaliza alta na próxima reunião. As taxas curtas sobem, mesmo com a decisão "esperada".

## Cuidados na leitura
Probabilidade não é previsão garantida, e ela muda a cada dado novo de inflação, emprego ou atividade. Leia sempre a data de referência dos preços usados no cálculo.`,
          pontos: [
            'Copom decide a Selic; o FOMC decide os juros americanos.',
            'Futuros de fed funds e opções de Copom mostram probabilidades implícitas.',
            'O Focus resume as projeções dos economistas.',
            'O que move o preço é a surpresa em relação ao esperado.',
          ],
          quiz: [
            { p: 'De onde vêm as probabilidades do FedWatch?', o: ['De pesquisas de opinião', 'Dos preços dos futuros de fed funds', 'Do comunicado do Fed'], c: 1, e: 'Os futuros embutem a taxa esperada, de onde se calcula a probabilidade.' },
            { p: 'O boletim Focus reúne:', o: ['Projeções de economistas', 'Decisões do Copom', 'Preços de ações'], c: 0, e: 'É uma pesquisa semanal do Banco Central.' },
            { p: 'Uma decisão esperada pode mexer muito no mercado quando:', o: ['O comunicado muda a expectativa para as próximas reuniões', 'Nunca', 'Só se for em feriado'], c: 0, e: 'O mercado reage à surpresa, inclusive no tom do comunicado.' },
          ],
          painel: { texto: 'Ver as probabilidades em Análises', aba: 'analysis-panel' },
          livro: LIVRO_MVM,
        },
        {
          id: 'cambio-e-fluxo',
          titulo: 'Câmbio, fluxo e risco-país',
          minutos: 7,
          abertura: 'O dólar é o preço que mais conversa com todos os outros: juros, inflação, bolsa e humor global. Entender o que o move ajuda a ler o mercado inteiro.',
          texto: `## O que move o câmbio
- **Diferencial de juros:** juros altos no Brasil em relação aos de fora atraem capital e tendem a valorizar o real. Quando os juros americanos sobem, o efeito é o contrário.
- **Fluxo comercial:** exportações trazem dólares; importações levam. A balança comercial e o preço das commodities que o Brasil vende pesam muito.
- **Fluxo financeiro:** investidores estrangeiros comprando ou vendendo ações e títulos brasileiros.
- **Risco percebido:** incerteza fiscal ou política faz investidores pedirem mais retorno ou saírem, pressionando o real.
- **Humor global:** em momentos de aversão a risco, o dinheiro tende a ir para o dólar e para os títulos americanos.

## Carry trade
É tomar dinheiro numa moeda de juros baixos e aplicar numa de juros altos, ganhando a diferença. Funciona enquanto o câmbio fica estável; uma desvalorização rápida pode apagar meses de ganho. Movimentos de saída do carry costumam ser bruscos.

## Risco-país
O CDS (credit default swap) de cinco anos do Brasil funciona como um seguro contra calote da dívida soberana. Quando ele sobe, o mercado está cobrando mais pelo risco do país, o que costuma andar junto com dólar mais alto e juros longos maiores.

## Fluxo estrangeiro na bolsa
A B3 divulga o saldo de compras e vendas por tipo de investidor. Entradas fortes de estrangeiros costumam sustentar a bolsa e o real; saídas, o contrário.

> Exemplo hipotético: o Fed sinaliza juros mais altos por mais tempo. O diferencial de juros encolhe, parte do capital sai de emergentes, o dólar sobe, o CDS do Brasil aumenta e a bolsa cai, tudo no mesmo dia.`,
          pontos: [
            'Diferencial de juros, comércio, fluxo financeiro e risco movem o câmbio.',
            'Carry trade ganha com juros, mas sofre com desvalorizações bruscas.',
            'O CDS mede o risco-país e anda junto com dólar e juros longos.',
            'O fluxo estrangeiro na B3 influencia bolsa e real.',
          ],
          quiz: [
            { p: 'Juros americanos subindo tendem a:', o: ['Valorizar o real', 'Pressionar o real para baixo', 'Não afetar o câmbio'], c: 1, e: 'O diferencial de juros diminui e parte do capital volta para os EUA.' },
            { p: 'O CDS do Brasil subindo indica:', o: ['Mais risco percebido no país', 'Inflação menor', 'Bolsa em alta'], c: 0, e: 'O "seguro" contra calote fica mais caro.' },
            { p: 'O risco principal do carry trade é:', o: ['Uma desvalorização rápida da moeda de juros altos', 'Juros altos demais', 'Feriados'], c: 0, e: 'O câmbio pode apagar o ganho de juros em pouco tempo.' },
          ],
          painel: { texto: 'Ver as moedas no Mercado', aba: 'market-panel' },
          livro: LIVRO_MVM,
        },
      ],
    },
  ];

  window.MMEduConteudo = Object.freeze({ trilhas });
})();
