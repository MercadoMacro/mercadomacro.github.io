# Mercado Macro (site novo)

Tudo do site novo fica nesta pasta. O resto do repositório é o site antigo (mercadomacro.github.io).

| Pasta | O que é |
|---|---|
| `station/` | O site (www.mercadomacro.com.br): `site/` são as páginas, `src/index.js` é o login, `wrangler.jsonc` a configuração da Cloudflare |
| `worker/` | Servidor de dados (cotações, Banco Central, FRED, notícias e outras fontes) |
| `vigia/` | Robô que testa o site e as fontes de hora em hora |
| `vitrine/` | Robô que fotografa o painel para a tela de entrada |
| `cvm/`, `fundamentos/` | Balanços das empresas da B3 (gerador e dados) |
| `fluxo/` | Fluxo de investidores na B3 (gerador e dados) |
| `historico/` | Curva de juros, Focus e fechamentos (gerador e dados) |
| `proventos/` | Agenda de dividendos e JCP (gerador e dados) |

Os robôs ficam em `.github/workflows/` (o GitHub exige essa pasta na raiz).
Mudanças em `station/` e `worker/` são publicadas sozinhas na Cloudflare.

O site antigo (mercadomacro.github.io) foi guardado na pasta `site-antigo/` na raiz do repositório.
O endereço mercadomacro.github.io agora só manda as pessoas para https://mercadomacro.com.br/.

`resumo/`: robô do resumo do fechamento no Telegram (roda pelo .github/workflows/resumo.yml, dias de pregão às 18h).

`vitrine-worker/`: worker da vitrine na segunda conta da Cloudflare (mercadomacro-vitrine.cota-cotacao10; o autumn-thunder antigo continua lá, sem uso pela vitrine). Publicado à mão no painel da Cloudflare.
