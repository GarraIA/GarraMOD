---
name: garra-debug
description: Investigação de erros, análise de logs e sugestões de correção no estilo Garra, com hipóteses independentes do GarraIA e do Hermes quando útil. Use quando a pessoa colar um erro, stack trace ou log, disser "está quebrado", "não funciona", "deu pau", ou pedir ajuda para depurar.
---

# Depuração Garra

## Método

1. **Reproduza.** Rode o comando ou teste que falha e capture a saída exata. Sem reprodução, diga isso.
2. **Leia o erro de verdade.** A primeira mensagem de erro, não a última; o arquivo e a linha; a versão das ferramentas.
3. **Hipóteses.** Liste de 2 a 4 causas prováveis, da mais para a menos provável, com a evidência de cada uma.
4. **Segunda opinião (opcional).** Para erros obscuros, `mcp__garra-mod__garra_paralelo` com o erro, o trecho de código envolvido e o que já foi descartado. O Hermes pode pesquisar o erro na web (issues e changelogs).
5. **Teste a hipótese** com o menor experimento possível (um log, um teste, um comando).
6. **Corrija na causa**, não no sintoma, e rode de novo o que falhava e os testes vizinhos.
7. **Relate:** causa, correção, como foi verificado e o que ainda é risco.

## Logs do ecossistema GarraIA

- GarraIA: `garra logs`, `garra status`, `garra doctor`.
- Hermes: `hermes gateway status`, `hermes logs` (se disponível na versão).
- Garra MOD: `/garra-diagnostico` (ou `/garra-diagnostico completo` para chamadas reais) e `claude --debug` para linhas do MOD.

Nunca cole tokens ou chaves nos pedidos aos agentes externos; o MOD remove o que reconhece, mas revise o contexto antes.
