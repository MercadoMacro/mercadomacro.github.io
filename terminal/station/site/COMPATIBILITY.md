# Macro 12 Classic — cobertura e validação

Referência funcional: HP12C clássica, User's Guide, edição 4, HP 0012C-900012.
Manual oficial: https://h10032.www1.hp.com/ctg/Manual/c00363319.pdf

Implementação independente. Não utiliza ROM, código da HP, da STENDEC ou dos projetos encontrados durante a pesquisa.

## Cobertura de funções

| Grupo | Funções implementadas e verificadas |
| --- | --- |
| Entrada e pilha | RPN X/Y/Z/T, ENTER, CHS, CLx, EEX, R↓, x↔y, LAST X, quatro operações, potência e recíproco |
| Matemática | Raiz, exponencial, logaritmo, fatorial, parte inteira/fracionária, porcentagem, variação percentual e percentual do total |
| TVM | n, i, PV, PMT, FV, BEGIN/END, conversões nominais 12×/12÷ e consulta anual |
| Períodos fracionários | Fração inicial em n; juros simples ou compostos por STO EEX e indicador C; inversão de PV/PMT/i/FV |
| Juros e amortização | INT 360/365, AMORT, juros/principal/saldo, arredondamento pela precisão do visor |
| Títulos | PRICE e YTM, actual/actual, cupons semestrais, resgate 100, juros acumulados em Y, desconto simples no último cupom |
| Fluxos | CF0, CFj, Nj, consulta reversa, repetições zero, NPV, IRR e estimativa por RCL g R/S |
| Memória | STO/RCL, registros 0–9/.0–.9, aritmética de armazenamento, CLEAR FIN/REG/Σ e persistência |
| Calendário | D.MY/M.DY, DATE com dia da semana, ΔDYS corridos e 30/360, intervalo 15/10/1582–25/11/4046 |
| Estatística | Σ+/Σ−, médias X/Y, média ponderada, desvios amostrais, estimativas X/Y e correlação |
| Depreciação | SL, SOYD, DB, residual em Y e vida útil fracionária |
| Visor | f 0–9, f ponto (científico), RND, mantissa, indicadores BEGIN/C/PRGM e MEM |
| Programação | 99 instruções, códigos de tecla, P/R, R/S, SST/BST, GTO, posicionamento por GTO .nn, inserção, pausa e condicionais X≤Y/X=0 |
| Alocação | 8 linhas/20 registros inicialmente; cada 7 linhas adicionais consome um registro; 99 linhas deixam 7 registros; último CF disponível usa FV |

## Evidências

Execute `node --test terminal/station/site/finance-engine.test.cjs`.

Os testes incluem comparações analíticas, exemplos do manual e sequências de teclas. Casos de referência: PRICE 87,62; preço com juros 90,31; YTM 8,15%; prestação com período fracionário composto −157,03; APR com fração simples 13,95% a.a. Também verificam seleção de duas TIRs por estimativa, datas bissextas, memória consumida por programas, revisão sem execução, saltos, códigos de tecla e recuperação de erros.

## Diferenças ainda relevantes para equivalência integral

A implementação das funções do teclado não prova equivalência de 100% com o hardware. Não é um emulador de ROM nem uma certificação de compatibilidade.

- As rotinas numéricas/transcendentais utilizam JavaScript. A pilha recebe resultados arredondados a dez dígitos significativos, mas isso não reproduz integralmente os algoritmos BCD e seus arredondamentos intermediários.
- A procura numérica de taxa opera de −99,9999% a 10.000% por período; TVM/amortização limitam o prazo a 10.000 períodos.
- A procura de TIR pode deixar de detectar raízes tangentes ou muito próximas. Com uma estimativa, escolhe a raiz encontrada mais próxima; não replica o algoritmo proprietário de continuação da HP.
- Um programa é interrompido após 10.000 instruções executadas para manter a página responsiva.
- PREFIX mostra a mantissa até a próxima tecla, em vez de depender do tempo de pressão da tecla física. Não há bateria ou autoteste eletrônico.
- Erros possuem mensagens explicativas; não há correspondência exaustivamente validada com todos os códigos e estados de erro do aparelho.
- Datas de cupom em final de mês têm restrições indicadas pelo manual. Casos de cupom em fevereiro e séries de séculos ainda exigem comparação adicional com um aparelho original.

A meta de equivalência integral deve ser validada adicionalmente contra um aparelho ou um emulador de referência autorizado, com vetores para todos os efeitos de pilha, erros, arredondamentos e calendários extremos. Não rotular a versão como “100% idêntica” apenas por ter todos os nomes de função implementados.
