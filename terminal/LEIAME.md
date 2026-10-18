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

---

## Melhorias e Otimizações Aplicadas

1. **Acessibilidade Completa (WAI-ARIA)**:
   - Abas (`#tabs`) com `role="tablist"` e `aria-label="Abas de navegação do painel"`.
   - Botões de abas com `role="tab"`, `aria-selected` e `aria-controls`.
   - Painéis com `role="tabpanel"`, `tabindex="0"`, `aria-labelledby` e sincronização de visibilidade (`aria-hidden`).
   - Navegação por teclado: suporte nativo a setas (ArrowLeft / ArrowRight) para alternar abas diretamente pelo teclado.
   - Botões de ícones com `aria-label` descritivos (`#summary-btn`, `#backup-btn`, `#theme-toggle`, `#settings-btn`, `#refresh-ticker`, `#news-alert-btn`, `#ecal-alert-btn`).

2. **Carregador de Módulos Assíncrono (`app.js`)**:
   - Função centralizada `carregarScriptModulo(src)` que usa Promises para deduplicar requisições concorrentes, evitar injeção duplicada de scripts no DOM e limpar tags com falha de rede.

3. **SEO e Dados Estruturados Enriquecidos (`fechamento-publico.js`)**:
   - Inclusão de `BreadcrumbList` estruturado em `@graph` para a página de índice e páginas individuais de fechamento diário, facilitando rich snippets com trilha de navegação na busca do Google.

4. **Gestão de Dados e Histórico Git (Monorepo & R2 / KV Ready)**:
   - Se o volume de JSONs gerados diariamente em `fundamentos/`, `fluxo/` e `historico/` crescer e começar a pesar no Git, os scripts do GitHub Actions podem enviar os arquivos diretamente para um bucket **Cloudflare R2** usando o comando:
     ```bash
     npx wrangler r2 object put mercadomacro-dados/fundamentos/24902.json --file=terminal/fundamentos/24902.json
     ```
     Ou configurando um binding R2 no Worker para servir os arquivos estáticos diretamente da borda sem depender do repositório Git.

## Validação antes de publicar

Na raiz do repositório, com Node.js instalado:

```bash
node terminal/validar.mjs
```

Esse comando confere os scripts de todas as subpastas do site, os módulos do servidor, os scripts de teste, os JSONs e manifestos e as referências locais de scripts e estilos no HTML. Depois executa todas as suítes `*.test.mjs` de `station/tests/`. Não exige login na Cloudflare e não publica arquivos.

Para conferir também o servidor de dados:

```bash
node terminal/validar.mjs todos
```

Os workflows `publicar-site.yml` e `publicar-worker.yml` validam PRs destinados à `main`. No GitHub Actions, também montam cada Worker com `wrangler deploy --dry-run`, sem publicar. Só depois da validação bem-sucedida, um push ou disparo manual na `main` pode executar a etapa de publicação. Se faltar `CLOUDFLARE_API_TOKEN` ou `CLOUDFLARE_ACCOUNT_ID`, a publicação falha explicitamente, sem registrar sucesso enganoso.
