---
name: garra-agentes
description: Seleção, consulta, delegação e comparação entre agentes do Garra MOD (Claude, GarraIA, Hermes e outros cadastrados). Use quando a pessoa pedir para "perguntar ao Garra", "consultar o Hermes", "pedir análises independentes e comparar", "delegar ao GarraIA/Hermes" ou cadastrar um novo agente.
---

# Agentes do Garra MOD

## Quem é quem

- **Claude** — você: agente principal, coordena e consolida. Não se consulta pelas ferramentas.
- **GarraIA** (`garraia`) — runtime real do GarraRUST. Consulta: `garra_ask` (só LLM, via MCP ou CLI). Delegação: `garra_agent` (shell, arquivos, git, web).
- **Hermes** (`hermes`) — Hermes Agent da Nous Research. Consulta: CLI `hermes chat` só com o conjunto `web` (ou API HTTP 127.0.0.1:8642 quando ligada). Delegação: CLI com `web,file,terminal,code_execution`, sem `--yolo`.
- Outros: `garra_agentes` com `acao: "listar"` mostra o catálogo e o estado real.

## Qual ferramenta usar

| Pedido | Ferramenta |
| --- | --- |
| Uma pergunta, revisão ou opinião de um agente | `mcp__garra-mod__garra_consultar` |
| "Peça ao Garra e ao Hermes análises independentes e compare" | `mcp__garra-mod__garra_paralelo` |
| O agente precisa **executar** algo no ambiente | `mcp__garra-mod__garra_delegar` (pede aprovação) |
| Ver ou cadastrar agentes | `mcp__garra-mod__garra_agentes` |
| Investigação mais longa, com contexto reunido por um ajudante | subagentes `garra-mod:garraia`, `garra-mod:hermes`, `garra-mod:revisor` |

Os subagentes aparecem nas faixas do Plan Progress enquanto trabalham.

## Regras

1. **Contexto mínimo.** Mande os trechos necessários, nunca arquivos inteiros, o histórico da conversa ou segredos. O MOD ainda remove trechos com cara de segredo antes de enviar, mas não conte só com isso.
2. **Identifique quem respondeu.** Ao relatar, diga "🦜 GarraIA respondeu…", "🪶 Hermes respondeu…", e o que é conclusão sua.
3. **Nunca invente.** Se a ferramenta disser que o agente está indisponível, diga isso e siga sem ele.
4. **Comparação honesta.** Em consultas paralelas: pontos em comum, divergências, e qual conclusão você adota e por quê.
5. **Delegar é dar o terminal.** O agente delegado age fora das permissões do Claude Code. Use só com pedido explícito e explique o que será feito. Em qualquer modo (inclusive `bypassPermissions`) a pessoa aprova e depois confirma os riscos; o **modo skip** (ex.: `--yolo` do Hermes) só existe como escolha dela nessa confirmação — nunca peça nem sugira skip por conta própria.

## Exemplos

- "Claude, peça ao Garra para revisar essa função" → `garra_consultar { agente: "garraia", pergunta: "Revise esta função…", contexto: "<a função>" }`.
- "Consulte o Hermes sobre possíveis problemas de segurança" → `garra_consultar { agente: "hermes", … }`.
- "Peça ao Garra e ao Hermes análises independentes e compare" → `garra_paralelo { agentes: ["garraia","hermes"], … }`, depois uma tabela comparativa.
- "Delegue essa investigação ao Hermes e apresente o resultado" → se for pesquisa, consulta (o Hermes pesquisa na web); se exigir rodar comandos, `garra_delegar`.

## Cadastrar um agente novo

Sem mexer no código do MOD: edite `~/.claude/garra-mod/agentes.json` ou use `/garra-agentes adicionar {json}`. Transportes suportados e testados: `mcp`, `process`, `openai-http`. Formato completo em `docs/agentes.md`.
