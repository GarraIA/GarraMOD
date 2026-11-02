---
name: garra-mod-dev
description: Manutenção, diagnóstico e desenvolvimento do próprio Garra MOD (o plugin garra-mod do Claude Code). Use quando a pessoa pedir para corrigir, estender ou depurar o Garra MOD, adicionar um transporte ou comando, mudar o tema, ou quando /garra-diagnostico mostrar falhas.
---

# Desenvolvendo o Garra MOD

## Mapa do código

```
garra-mod/
├── .claude-plugin/plugin.json   manifesto (userConfig com chaves sensíveis)
├── hooks/register.tsx           liga tudo: hooks, comandos, ferramentas, átomos de $.state
├── types/index.d.ts             contrato: tipos do registro e de $.state
├── src/registry/                agentes padrão, validação e mescla (padrão → arquivo → comando)
├── src/connectors/              ponte real: mcp ($.mcp.call), process ($.process.spawn), openai-http ($.http.fetch)
├── src/security/sanitize.ts     redação de segredos, limpeza de saída, destinos HTTP
├── src/interface/               cartão de abertura (Placed) e painel /garra (Pane)
├── src/themes/garra-brasil.ts   tema no Claude Skins via mcp__skins__design
├── src/localization/            textos pt-BR e a seção de personalidade
├── agents/ skills/ tests/ docs/
```

## Regras da API de mods (Claude Code 2.1.316)

- `$` só aparece como `$.noun.method(...)`. Pode ser passado a funções declaradas no topo de um arquivo do MOD, nunca guardado num objeto.
- Átomos de `$.state` (`atom(...)`) ficam declarados no `register.tsx`, com `plugin` e `key` literais, e cada chave existe no contrato `types/index.d.ts`.
- Cada hook tem 10 s do próprio tempo; chamadas `$` em andamento não contam, `$.clock.sleep` conta. Prazos longos usam `$.clock.after`.
- Elementos vêm de `$.ui.resolve(e)`; `Text` usa `weight="bold"` e `color`.

## Ciclo de desenvolvimento

1. Edite os arquivos (na pasta de mods da sessão eles recarregam no fim do turno, ou rode `claude --plugin-dir <pasta>`).
2. `claude plugin validate <pasta>`: o que o módulo usa e o que o motor recusaria.
3. Checagem de tipos: `tsc -p <pasta>` depois do primeiro carregamento (o motor grava `.claude-plugin/types/`).
4. `claude plugin test <pasta>`: os testes em `tests/*.test.ts(x)`.
5. Teste real: `/garra-diagnostico completo` faz chamadas reais a cada agente.

## Adicionar um transporte

1. Tipo em `types/index.d.ts` (`GarraTransport`).
2. Validação em `src/registry/registry.ts` (`validateTransport`).
3. Adaptador em `src/connectors/transports.ts` (`runTransport` e `probeTransport`), devolvendo `unavailable` quando não alcança e `error` com o motivo real.
4. Teste em `tests/` com o motor fazendo papel do serviço (mock) **e** um teste real documentado. Não anuncie o transporte antes de testar os dois.

ACP ainda não é suportado: a API de mods só escreve a entrada padrão de uma vez, e o ACP precisa de diálogo JSON-RPC com respostas.
