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
    { id: 'investimentos', titulo: 'Investimentos na prática', nivel: 'Intermediário', resumo: 'Tesouro Direto, crédito privado, fundos imobiliários, ETFs e como montar uma carteira.', emBreve: true },
    { id: 'analise', titulo: 'Analisando empresas', nivel: 'Intermediário', resumo: 'Balanços, indicadores, valuation e análise técnica.', emBreve: true },
    { id: 'derivativos', titulo: 'Derivativos e macro', nivel: 'Avançado', resumo: 'Mercado futuro, opções, curva de juros e expectativas do Copom e do Fed.', emBreve: true },
  ];

  window.MMEduConteudo = Object.freeze({ trilhas });
})();
