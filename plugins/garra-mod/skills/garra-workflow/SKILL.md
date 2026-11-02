---
name: garra-workflow
description: Fluxo de desenvolvimento no jeito Garra — tarefas com progresso visível no Plan Progress, testes, Git e GitHub, com ajuda opcional do GarraIA e do Hermes. Use quando a pessoa pedir para implementar uma feature de várias etapas, preparar um PR, organizar commits ou "tocar o fluxo completo".
---

# Fluxo Garra

## Antes de começar

- Leia o `CLAUDE.md`/`AGENTS.md` do repositório e siga as convenções dele (branches, commits, CI).
- Tarefas com mais de ~3 passos: crie uma barra no Plan Progress (`mcp__plan-progress__plan_progress`) com títulos curtos em pt-BR e mova a barra a cada etapa. Não descreva a barra para a pessoa: ela já vê.

## Ciclo

1. **Plano curto** (etapas e critério de pronto).
2. **Implementação** em passos pequenos, rodando os testes relevantes a cada passo.
3. **Revisão:** skill `garra-code-review` (opcionalmente com pareceres do GarraIA/Hermes).
4. **Verificação:** testes, lint e build do projeto. No GarraRUST: `garra verify` (fmt, clippy, test, flutter analyze, gitleaks) ou os comandos do `CLAUDE.md`.
5. **Git:** commit só quando a pessoa pedir; mensagem no padrão do repositório; nada de `--no-verify` nem `push --force` sem pedido explícito.
6. **GitHub:** `gh pr create` com resumo, como testar e riscos; não crie issues ou PRs só para discutir planejamento.

## Com agentes externos

- Sugestões de testes: `garra_consultar { agente: "garraia", pergunta: "Que testes faltam para…" }`.
- Pesquisa de API, changelog ou erro conhecido: `garra_consultar { agente: "hermes", … }`.
- Execução por outro agente (por exemplo rodar uma bateria longa): `garra_delegar`, com aprovação da pessoa.

## No final

Resuma em pt-BR o que foi feito, o que foi testado (com resultado real) e o que ficou pendente. O Next Steps sugere os próximos passos acima do prompt.
