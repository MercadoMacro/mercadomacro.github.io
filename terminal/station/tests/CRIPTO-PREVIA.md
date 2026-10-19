# Cripto por WebSocket na Mesa

A faixa de criptomoedas da Mesa usa WebSocket nos domínios mercadomacro.com.br e www.mercadomacro.com.br e na prévia em localhost, 127.0.0.1 e ::1. Outros domínios não iniciam a conexão.

## Usar a prévia

Execute `node terminal/station/tests/preview-local.mjs`, abra http://localhost:8787 com uma das contas fictícias e entre na Mesa. A identificação da fonte aparece ao lado do status geral.

- BTC, ETH, BNB, XRP, SOL, DOGE, USDC e ADA recebem o último preço dos pares em USDT da Binance.
- O percentual representa a janela móvel de 24 horas, não a variação desde o fechamento da Yahoo.
- USDT/USD continua na Yahoo; não se inventa um par USDT/USDT nem se presume paridade com USD.
- O preço pisca apenas quando muda entre dois eventos recentes da mesma conexão. A preferência do sistema por movimento reduzido desativa a animação.
- Deixar a Mesa, ocultar a página, iniciar logout ou perder a conexão interrompe o fluxo. Dados com mais de 15 segundos deixam de ser identificados como ao vivo.
- Em falhas, a faixa volta às cotações periódicas da Yahoo em USD. Há reconexão com espera progressiva.
- O stream não grava no cache da Yahoo e não alimenta o gráfico histórico em USD. Ao abrir um gráfico, ele mantém sua fonte e moeda atuais.
- Não usa API key, conta da exchange, dados pessoais ou endpoints de negociação.

## Fonte e escopo

Conexão direta do navegador ao endpoint público Spot `wss://data-stream.binance.vision/stream`, sem retransmissão central de dados. Esta implementação não usa os arquivos de datasets históricos Binance Vision.

A ativação nos domínios oficiais foi solicitada pelo responsável pelo site sem aguardar uma consulta à Binance. Isso não constitui confirmação de licença pela fonte nem altera seus termos aplicáveis.

Documentação:
- https://github.com/binance/binance-spot-api-docs/blob/master/web-socket-streams.md
- https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md
- https://github.com/binance/binance-spot-api-docs/blob/master/PROD-TERMS-OF-USE.md

## Verificação

`node terminal/validar.mjs site` inclui os testes determinísticos de schema, moedas, eventos atrasados, reconexão, silêncio, pausa e ativação restrita aos domínios oficiais/locais. O workflow também roda o componente real da Mesa em Chromium, com WebSocket interceptado e séries sintéticas, incluindo os dois domínios oficiais, bloqueio de domínio desconhecido e pausa no logout. Uma sonda externa separada registra disponibilidade da Binance no ambiente do CI, sem substituir os testes nem garantir disponibilidade regional.
