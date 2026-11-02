# Testes do Garra MOD

Ambiente da validação: Linux, Claude Code **2.1.316**, GarraIA **0.4.10** (gateway em 127.0.0.1:3888, servidor MCP `garra mcp-server`), Hermes Agent **0.22.5**, Ollama local, Skins 0.5.15, Plan Progress 1.0.0, Next Steps 1.0.0, You Should Know (embutido).

## Automatizados — `claude plugin test`

28 testes, todos passando. Os hooks dos testes ficam **abaixo** do MOD e fazem o papel do motor e dos serviços (mocks isolados, só para lógica):

| Grupo | O que cobre |
| --- | --- |
| Registro | agentes padrão; novo agente por processo; recusa de id reservado, mensagem no argv, HTTP remoto, segredo embutido e ACP; arquivo do usuário substitui padrão mas não o Claude |
| Segurança | remoção de segredos; limpeza de escapes e invisíveis; destinos HTTP |
| Parsers | `garra.ask.v1`, `garra.agent.v1`, chat completions |
| Comandos | `/garra-status` em pt-BR; personalidade no prompt; `/garra-agentes adicionar` (aceita e recusa) |
| Ponte | consulta via MCP com identificação e redação; fallback MCP → CLI; agente offline; consulta paralela; tool.check pede aprovação |
| Delegação | sem pessoa → não executa; aprovado + seguro → sem `--yolo`; aprovado + skip → com `--yolo`; cancelado nos riscos; recusado na aprovação; GarraIA sem opção de skip |
| Interface | cartão de abertura e painel nas superfícies `terminal` e `desktop`; rótulos do Next Steps |

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
| Personalidade | resposta real em pt-BR com a identidade do GarraIA |
| Delegação sob `--permission-mode bypassPermissions`, sem pessoa (`-p`) | recusada: "NÃO executada: ninguém pôde aprovar"; o Hermes não foi chamado |
| Delegação sob bypass, sessão interativa | 1) "Aprovar a delegação…?" 2) confirmação de riscos com *Executar com segurança / Executar em modo skip / Cancelar*; com segurança, o Hermes rodou sem `--yolo` e respondeu "OK" |
| You Should Know | ativo: mostrou um aviso real acima do prompt durante o desenvolvimento |

## Não validado neste ambiente

- **Windows** e os apps **VS Code / Desktop** abertos (só as superfícies `desktop`/`vscode` do kit de testes).
- **API HTTP do Hermes** (127.0.0.1:8642): desligada nesta máquina (`API_SERVER_ENABLED` ausente). O MOD a detecta como indisponível e usa a CLI. O adaptador HTTP é o mesmo validado contra o Ollama.
- **Gateway HTTP do GarraIA** com chave: o adaptador está pronto, mas a chave não foi lida da configuração do usuário (segredo). Sem chave o gateway responde 401, como esperado.
- **Logo como imagem**: o emulador usado nos testes não desenha imagens e mostrou o símbolo 🦜; o desenho da imagem depende do terminal (kitty, Ghostty, iTerm2).
