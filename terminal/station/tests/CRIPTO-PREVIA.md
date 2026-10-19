# Prévia local de cripto por WebSocket

Apenas a faixa de criptomoedas da Mesa participa desta prévia. Ela funciona em localhost, 127.0.0.1 e ::1; permanece desativada em domínios publicados.

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

## Exibição comercial

Esta implementação é uma prévia técnica, não uma confirmação de licença comercial. Antes de ativar em um domínio publicado, confirmar com a fonte os direitos aplicáveis ao stream de mercado e à exibição para usuários externos. Os termos dos datasets Binance Vision exigem licença comercial separada; não presumir que acesso público aos endpoints concede essa permissão.

Fontes consultadas:
- https://github.com/binance/binance-spot-api-docs/blob/master/web-socket-streams.md
- https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md
- https://github.com/binance/binance-public-data/blob/master/TERMS_AND_CONDITIONS.md

A prévia usa conexão direta do navegador ao endpoint público de mercado. Uma versão com distribuição central e múltiplos usuários dependerá da fonte/licença escolhida.

## Verificação

`node terminal/validar.mjs site` inclui os testes determinísticos de schema, moedas, eventos atrasados, reconexão, silêncio, pausa e domínio publicado. O workflow também roda o componente real da Mesa em Chromium, com WebSocket interceptado e séries sintéticas. Uma sonda externa separada registra disponibilidade da Binance no ambiente do CI, sem substituir os testes nem garantir disponibilidade regional.
