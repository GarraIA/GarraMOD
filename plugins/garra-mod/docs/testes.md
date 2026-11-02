# Testes do Garra MOD

Ambiente da validação: Linux, Claude Code **2.1.316**, GarraIA **0.5.0** (gateway em 127.0.0.1:3888, servidor MCP `garra mcp-server`), Hermes Agent **0.22.5**, Ollama local, Skins 0.5.15, Plan Progress 1.0.0, Next Steps 1.0.0, You Should Know (embutido).

## Automatizados — `claude plugin test`

74 testes, todos passando. Os hooks dos testes ficam **abaixo** do MOD e fazem o papel do motor e dos serviços (mocks isolados, só para lógica):

| Grupo | O que cobre |
| --- | --- |
| Registro | agentes padrão; novo agente por processo; recusa de id reservado, mensagem no argv, HTTP remoto, segredo embutido e ACP; arquivo do usuário substitui padrão mas não o Claude |
| Segurança | remoção de segredos; limpeza de escapes e invisíveis; destinos HTTP |
| Parsers | `garra.ask.v1`, `garra.agent.v1`, chat completions; leitura do `config.yml` do GarraIA (apelidos, aspas, comentários, texto em bloco, listas e recusa do que não for confiável) e ordem das pastas; leitura do `config.yaml` do Hermes (modelo, provedor, reservas, formato antigo, outras seções com provider/model ignoradas) |
| Comandos | `/garra-status` em pt-BR, com o provedor e o modelo que o MOD passa ao GarraIA (com e sem `config.yml`); personalidade no prompt; `/garra-agentes adicionar` (aceita e recusa) |
| Ponte | consulta via MCP com identificação e redação; provedor e modelo do `config.yml` do GarraIA em `garra_ask` e `garra_agent` (e fora quando não há config); fallback MCP → CLI; agente offline; consulta paralela; tool.check pede aprovação |
| Delegação | sem pessoa → não executa; aprovado + seguro → sem `--yolo`; aprovado + skip → com `--yolo`; cancelado nos riscos; recusado na aprovação; GarraIA sem opção de skip |
| Interface | cartão de abertura e painel nas superfícies `terminal` e `desktop`; seção Modelos com o que o MOD passa ao GarraIA e de onde veio, e o modelo e as reservas do Hermes; rótulos do Next Steps |

## Reais (sem mock)

| Teste | Resultado |
| --- | --- |
| `/garra-status` em sessão real (`claude -p --plugin-dir`) | GarraIA conectado via MCP, Hermes disponível via CLI 0.22.5, 4 de 4 extensões |
| `/garra-diagnostico completo` | GarraIA respondeu "PRONTO" via MCP em 0,6 s; Hermes respondeu "PRONTO" via CLI em 3,7 s |
| Consulta paralela pelo modelo (`garra_paralelo`) | GarraIA (MCP, 2,0 s) e Hermes (CLI, 3,7 s) responderam "Brasília"; o Claude resumiu em pt-BR identificando cada agente |
| Adaptador `openai-http` contra Ollama (127.0.0.1:11434) | `qwen3.5:0.8b` respondeu "PRONTO" em 6,6 s |
| Prazo e cancelamento | agente `sleep 60` com prazo de 5 s: "tempo esgotado após 5 s" e nenhum processo restante |
| Destino HTTP remoto sem https | recusado no cadastro |
| Tema | `/garra-tema brasil` salvou e aplicou `garra-brasil` no Skins (anterior: gruvbox) e persistiu na sessão seguinte |
| Abertura e painel num terminal real (pseudo-terminal 150×50) | cartão com estados reais; painel `/garra` acoplado; tecla 2 abre Agentes |
| Next Steps | após um turno real: "🦜 GarraIA sugere:" com as sugestões e atalhos 1/2/3/0 do próprio Next Steps. Até a 0.1.2, com o Next Steps antes do Garra na lista de plugins, ele ficava por fora na cadeia e o rótulo saía em inglês; desde a 0.1.3 a tradução vem pelo `ui.resolve` e os testes cobrem as duas ordens |
| Frases de espera | sessões reais num pseudo-terminal com o MOD instalado: veja "Frases de espera (0.1.4)" abaixo |
| Modelo do GarraIA (0.1.6) | `claude -p` com o MOD da 0.1.6 (`--plugin-dir`): a consulta (`garra_ask`) e a delegação (`garra_agent`) responderam com `anthropic/claude-haiku-5.5`, e o log do GarraIA registrou `provider=openrouter, model=anthropic/claude-haiku-5.5` nas duas (0 e 6 ferramentas). Antes, a consulta saía com o padrão embutido `z-ai/glm-5.3-flash` |
| Modelo visível (0.1.7) | `claude -p "/garra-status"` com o MOD da 0.1.7: "🦜 Modelo que o MOD passa ao GarraIA (MCP, consulta e delegação): openrouter · anthropic/claude-haiku-5.5 — lido do config.yml do GarraIA (~/.config/garraia/config.yml)". Painel `/garra` num pseudo-terminal 160×50, tecla 4: "o MOD passa (consulta e delegação): openrouter · anthropic/claude-haiku-5.5", a linha do arquivo e, para o Hermes, "configurado pelo próprio agente" |
| Modelo do Hermes (0.1.8) | `claude -p "/garra-status"` com o MOD da 0.1.8: "🪶 Modelo configurado no Hermes: openai-codex · gpt-6.1-sol (reservas: anthropic · claude-opus-5-5 → openrouter · anthropic/claude-haiku-5.5) — lido de ~/.hermes/config.yaml". Painel `/garra`, tecla 4: "usa: …", "reservas: …" e o arquivo de onde veio |
| Personalidade | resposta real em pt-BR com a identidade do GarraIA |
| Delegação sob `--permission-mode bypassPermissions`, sem pessoa (`-p`) | até a 0.1.4: recusada ("NÃO executada: ninguém pôde aprovar"). Desde a 0.1.5 (2026-11-02): `claude -p --dangerously-skip-permissions` delegou ao GarraIA sem perguntas, com a linha `[Garra MOD: aprovação: modo bypass do Claude Code (sem perguntas) · escolha: Executar com segurança]`, e o arquivo pedido foi criado |
| Delegação em `claude -p` sem bypass (2026-11-02) | recusada: "NÃO executada: ninguém pôde aprovar"; o arquivo pedido não foi criado |
| Delegação sob bypass, sessão interativa | até a 0.1.4: 1) "Aprovar a delegação…?" 2) confirmação de riscos com *Executar com segurança / Executar em modo skip / Cancelar*; com segurança, o Hermes rodou sem `--yolo` e respondeu "OK". Desde a 0.1.5: sem perguntas, com o modo skip do agente |
| You Should Know | ativo: mostrou um aviso real acima do prompt durante o desenvolvimento |

## Frases de espera (0.1.4)

Antes de implementar, a ordem real da cadeia foi medida numa sessão nova (`claude -p` com um registro temporário de `next.trace` no `turn.start`): o Garra é o último hook dos plugins do usuário, e o Claude Skins e o Next Steps ficam por fora. Com o brilho (`shimmer`) do Skins ligado, o Skins desenha o spinner sozinho e o hook `ui.render` do Garra nunca é chamado; por isso, nesse caso, a frase chega pela lista do `garra-brasil`.

Duas sessões interativas reais num pseudo-terminal 160×50, com o MOD instalado lendo esta pasta:

| Sessão | O que apareceu |
| --- | --- |
| Skins ligado (brilho, `garra-brasil`), dois turnos curtos | turno 1 "Fuçando a documentação… <1s", turno 2 "Montando o plano"; ao fim, o Skins ficou com "Botando ordem na casa" para o turno seguinte; paleta do skin intacta |
| Skins desligado só nessa sessão (`--settings` com `enabledPlugins`), um turno de 30 s | spinner nativo do Claude Code, com animação, tempo, esforço e tokens; a frase trocou a cada ~4 s: Caçando uma boa resposta → Escrevendo com cuidado (4s) → Trocando ideia (8s) → Lapidando o código (12s) → Lendo o código (16s) → Afinando o cavaquinho (20s) → Medindo duas vezes (24s) → Abrindo as asas (30s); depois, "🦜 GarraIA sugere:" no Next Steps |

## Não validado neste ambiente

- **Windows** e os apps **VS Code / Desktop** abertos (só as superfícies `desktop`/`vscode` do kit de testes).
- **API HTTP do Hermes** (127.0.0.1:8642): desligada nesta máquina (`API_SERVER_ENABLED` ausente). O MOD a detecta como indisponível e usa a CLI. O adaptador HTTP é o mesmo validado contra o Ollama.
- **Gateway HTTP do GarraIA** com chave: o adaptador está pronto, mas a chave não foi lida da configuração do usuário (segredo). Sem chave o gateway responde 401, como esperado.
- **Logo como imagem**: o emulador usado nos testes não desenha imagens e mostrou o símbolo 🦜; o desenho da imagem depende do terminal (kitty, Ghostty, iTerm2).
