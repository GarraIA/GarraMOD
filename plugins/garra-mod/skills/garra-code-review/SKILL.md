---
name: garra-code-review
description: Revisão de código com auxílio opcional do GarraIA e do Hermes. Use quando a pessoa pedir "revise", "faça code review", "revisão cruzada", "o que pode dar errado nesta mudança" ou quiser segunda opinião de outros agentes sobre um diff, PR ou arquivo.
---

# Revisão de código Garra

Uma revisão do Garra MOD: o Claude revisa e, quando a pessoa quiser (ou a mudança for arriscada), pede pareceres independentes ao GarraIA e ao Hermes. Não é o You Should Know oficial da Anthropic, que segue funcionando por conta própria.

## Passos

1. **Escopo.** Descubra o que revisar: `git diff` (não commitado), `git diff main...HEAD` (branch), um PR (`gh pr diff <n>`) ou os arquivos citados.
2. **Sua revisão primeiro.** Corretude, casos-limite, segurança (injeção, segredos, permissões), concorrência, desempenho, testes faltando, compatibilidade (Windows, versões).
3. **Pareceres externos (opcional).** `mcp__garra-mod__garra_paralelo` com os trechos relevantes do diff (nunca segredos ou arquivos inteiros):
   - pergunta: "Revise este diff. Aponte bugs, riscos de segurança e testes faltando, com severidade e linha."
   - Para uma revisão mais longa e autônoma, use o subagente `garra-mod:revisor`.
4. **Consolide** numa tabela: severidade · arquivo:linha · achado · quem apontou (Claude/GarraIA/Hermes) · sugestão. Destaque divergências.
5. **Sem mudanças automáticas.** Proponha correções; aplique só com o ok da pessoa.

## Exemplo de saída

| Sev. | Onde | Achado | Quem |
| --- | --- | --- | --- |
| alta | src/auth.rs:88 | token comparado com `==` (timing attack) | Claude, Hermes |
| média | src/api.rs:120 | falta teste para resposta 429 | GarraIA |

Se um agente externo estiver indisponível, registre isso no relatório em vez de omitir.
