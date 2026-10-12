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
