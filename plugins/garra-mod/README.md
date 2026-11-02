# 🇧🇷 Garra MOD: GarraIA Claude Code

O Garra MOD veste o Claude Code com a camisa do **GarraIA, Inteligência Artificial Brasileira** 🦜:

- **pt-BR de verdade.** Uma seção curta de personalidade no prompt de sistema faz o Claude responder como um especialista brasileiro em tecnologia. Todos os textos do MOD estão em português.
- **Tema Garra Brasil**: verde, amarelo, azul e branco, aplicado pelo **Claude Skins** (spinner e rodapé em português: "Caprichando…", "Feito").
- **Abertura GarraIA**: cartão no início da sessão com o estado **real** de cada agente e MOD.
- **Painel `/garra`** com 9 seções: informações, agentes, conversas, modelos, MODs, skills, tema, configurações e diagnóstico.
- **Multiagente real**: o Claude consulta, compara e delega para o **GarraIA** (GarraRUST) e o **Hermes** (Nous Research) por conexões reais (MCP, CLI ou HTTP), não por simulação.
- **Registro extensível**: novos agentes por JSON, sem tocar no código.
- **Integração** com Claude Skins, Plan Progress, Next Steps e You Should Know, sem duplicar o que eles já fazem.

> Licença MIT. Faz parte do ecossistema open source do [GarraRUST](https://github.com/michelbr84/GarraRUST). Não contém código comercial, credenciais nem infraestrutura do Garra Cloud.

## Requisitos

- Claude Code **2.1.316** ou mais novo (API de mods com hooks de função).
- Opcional, para os agentes externos:
  - **GarraIA**: `garra` no PATH (`garra --version`). O caminho preferido é o servidor MCP `garra mcp-server` configurado no Claude Code (`claude mcp add garraia -- garra mcp-server`). Sem ele, o MOD usa `garra ask --json`.
  - **Hermes**: `hermes` no PATH (`hermes --version`). A API HTTP (127.0.0.1:8642) é usada quando ligada e com chave.
- Opcional, MODs integrados:

```text
/plugin marketplace add hellosverre/claude-skins
/plugin install skins@hellosverre-mods
/plugin marketplace add zycck/claude-mods
/plugin install plan-progress@zycck-mods
/plugin marketplace add anthropics/claude-plugins-community
/plugin install next-steps@claude-community
/plugin enable cc-plugin-you-should-know@builtin
```

## Instalar

No prompt de uma sessão do Claude Code no terminal:

```text
/plugin install garra-mod --marketplace michelbr84/garra-mod
```

Responda `y` para adicionar o marketplace e escolha o escopo **user** para ter o MOD em todos os projetos. Pelo shell: `claude plugin install garra-mod --marketplace michelbr84/garra-mod`. O MOD não exige o repositório GarraRUST aberto.

O repositório é **privado**: instala quem tem acesso de leitura a ele no GitHub e uma credencial do git para github.com na máquina (chave SSH, ou `gh auth login` + `gh auth setup-git`).

A partir de um clone local: `claude plugin marketplace add <pasta do clone>` e `claude plugin install garra-mod@garraia-mods`.

Para desenvolver sem instalar: `claude --plugin-dir /caminho/para/GarraMOD/plugins/garra-mod`.

## Habilitar, desabilitar e remover

```bash
claude plugin disable garra-mod@garraia-mods   # desliga sem remover
claude plugin enable garra-mod@garraia-mods    # liga de novo
claude plugin uninstall garra-mod@garraia-mods # remove
claude plugin marketplace remove garraia-mods  # remove o marketplace
```

Ao remover, o tema ativo continua no Claude Skins até você trocar com `/skin` (ou `/garra-tema anterior` antes de remover). O catálogo do usuário (`~/.claude/garra-mod/agentes.json`), se existir, fica onde está.

## Comandos

| Comando | O que faz |
| --- | --- |
| `/garra [seção]` | Abre o painel principal (teclas 1–9 trocam de seção; Esc devolve o teclado). |
| `/garra-status` | Estado geral: agentes, MODs integrados, preferências. |
| `/garra-agentes [listar\|verificar\|adicionar {json}\|remover <id>\|padrao <id>]` | Catálogo de agentes. Ver nota abaixo. |
| `/garra-consultar <agente> <pergunta>` | Consulta um agente agora e mostra a resposta real. Sem agente, usa o padrão. |
| `/garra-tema [brasil\|anterior\|salvar\|<skin>]` | Aplica o tema Garra Brasil no Claude Skins, volta ao anterior ou troca de skin. |
| `/garra-plugins` | MODs integrados e o estado real de cada um. |
| `/garra-config [chave valor]` | `personalidade`, `boas-vindas`, `status`, `next-steps` (on/off), `padrao <id>`, `prazo <s>`, `paralelo <n>`, `idioma`. |
| `/garra-diagnostico [completo]` | Verificações de funcionamento; `completo` faz uma chamada real a cada agente. |

**Nota sobre `/garra-agentes`:** o Claude Code registra primeiro a skill `garra-agentes` com esse nome. Quando **você** digita `/garra-agentes`, o MOD responde direto, sem gastar um turno do modelo; quando o modelo usa a skill, ela continua funcionando normalmente.

## Usando os agentes

Basta pedir em linguagem natural:

- "Claude, peça ao Garra para revisar essa função."
- "Consulte o Hermes sobre possíveis problemas de segurança."
- "Peça ao Garra e ao Hermes análises independentes e compare as respostas."
- "Use o GarraIA para sugerir testes adicionais."
- "Delegue essa investigação ao Hermes e apresente o resultado."

Ferramentas que o Claude usa (`mcp__garra-mod__…`):

| Ferramenta | Para quê | Efeito no ambiente |
| --- | --- | --- |
| `garra_consultar` | Pergunta, revisão ou opinião de um agente | Nenhum: o GarraIA usa `garra_ask` (só LLM); o Hermes roda só com o conjunto `web` |
| `garra_paralelo` | A mesma pergunta para vários agentes, de forma independente, para comparar | Nenhum |
| `garra_delegar` | Tarefa com ferramentas (shell, arquivos, git, web) | **Sim**, com confirmação humana em duas etapas |
| `garra_agentes` | Listar, verificar, adicionar ou remover agentes | Alterar o catálogo pede aprovação |

Subagentes: `garra-mod:garraia`, `garra-mod:hermes` (pontes com contexto mínimo) e `garra-mod:revisor` (revisão cruzada independente). Enquanto trabalham, aparecem nas faixas de agentes do Plan Progress.

### Delegação: sempre uma pessoa no controle

Um agente delegado age **direto na máquina, fora das permissões do Claude Code**. Por isso, em **qualquer** modo de permissão, inclusive `--permission-mode bypassPermissions`:

1. **Aprovação humana antes de rodar.** Se a caixa de permissão do Claude Code aparecer, ela conta como aprovação. Se não aparecer (bypass, aprovação automática), o MOD pergunta: *"Aprovar a delegação desta tarefa ao Hermes…?"*.
2. **Confirmação de riscos, sempre**, mesmo depois de aprovada: o que o agente pode fazer (shell, apagar arquivos, git, internet, ler segredos) e as opções **Executar com segurança**, **Executar em modo skip** (só para agentes que têm, como o `--yolo` do Hermes) e **Cancelar**.
3. **O modo skip nunca é automático.** O modelo não consegue pedi-lo: só você escolhe, a cada delegação.
4. **A decisão fica registrada.** O resultado de cada delegação traz, logo abaixo do título, como ela foi aprovada e a opção escolhida (ex.: `[Garra MOD: aprovação: pergunta do Garra MOD · escolha: Executar em modo skip]`); recusas e cancelamentos mostram a resposta dada. A mesma linha aparece em `/garra` → Conversas.

Sem ninguém para responder (`claude -p`, pergunta dispensada ou resposta digitada que não seja uma das opções), **nada é executado**.

## Configuração

- **Preferências** (`/garra-config` ou `/garra config`): guardadas entre sessões no armazenamento do MOD.
- **Chaves de API** (opcionais, só para os transportes HTTP): `/config` → garra-mod → *Chave do gateway GarraIA* / *Chave da API do Hermes*. Ficam no **armazenamento seguro** do Claude Code, nunca em arquivo do MOD. Também é possível usar `GARRAIA_GATEWAY_API_KEY`, `API_SERVER_KEY` ou um comando de segredo (`secret-tool`, `pass`, `security`).
- **Idioma nativo do Claude Code**: `/garra-config idioma` muda `/config → language` para português (Brasil). O MOD nunca faz isso sozinho, nem troca modelo, autenticação ou permissões.
- **Novos agentes**: `~/.claude/garra-mod/agentes.json` ou `/garra-agentes adicionar {json}`. Formato e exemplos em [docs/agentes.md](docs/agentes.md).

## Segurança

- Nenhum histórico de conversa é enviado aos agentes; só a pergunta e o contexto que o Claude escolheu.
- Trechos com cara de segredo (chaves `sk-…`, `ghp_…`, JWT, `password=…`, chaves privadas) são removidos antes do envio, e a resposta avisa quantos foram removidos.
- Respostas dos agentes são limpas (sem sequências de escape nem caracteres invisíveis) e limitadas em tamanho.
- HTTP só para `127.0.0.1`/`localhost` por padrão; destino remoto exige `"allowRemote": true` **e** https. Credencial embutida na URL é recusada.
- A mensagem para um processo vai pela entrada padrão, nunca pela linha de comando.
- Prazo por agente; interromper (Esc) ou estourar o prazo encerra o processo filho.
- O MOD não depende de `--dangerously-skip-permissions` e não contorna controles oficiais.

## Integração com outros MODs

| MOD | Como o Garra MOD coopera |
| --- | --- |
| **Claude Skins** | O tema `garra-brasil` é salvo e aplicado pela ferramenta oficial do Skins (`mcp__skins__design`). `/skin` continua trocando livremente; a variante clara é derivada pelo próprio Skins. |
| **Plan Progress** | Não há segundo sistema de progresso: a personalidade e as skills pedem as barras do Plan Progress com títulos em pt-BR, e os subagentes de ponte aparecem nas faixas de agentes. Chamadas diretas por ferramenta não viram faixas falsas. |
| **Next Steps** | O MOD só traduz os rótulos ("next:" → "🦜 GarraIA sugere:"); botões e atalhos 1/2/3/0 continuam sendo do Next Steps. Desligue com `/garra-config next-steps off`. |
| **You Should Know** | Componente oficial da Anthropic, embutido. O Garra MOD só verifica se está habilitado; o subagente `garra-mod:revisor` é uma revisão independente e se apresenta como **não** sendo o You Should Know. |

Regiões de interface usadas: um cartão no transcript (`Placed`), um painel (`Pane` "garra"), o fim da linha de dicas (`PromptHint.tail`) e só os textos do Next Steps na banda acima do prompt (`AbovePrompt`, por composição).

## Limitações conhecidas

- O texto nativo do Claude Code (menus, `/help`, rodapés do motor) segue no idioma do próprio Claude Code; use `/garra-config idioma` para a opção nativa.
- A tradução do Next Steps depende de o Garra MOD estar acima do Next Steps na cadeia de hooks; se não estiver, o rótulo fica em inglês.
- **ACP** não é suportado: a API de mods escreve a entrada padrão de uma só vez.
- O logo oficial do GarraRUST (`assets/garraia-logo.png`) aparece na abertura em terminais com imagens (kitty, Ghostty, iTerm2 3.5+); nos demais aparece o símbolo 🦜.
- Windows: o código trata `USERPROFILE` e não usa shell, mas não foi testado em Windows. O Hermes Agent é voltado a Linux/macOS/WSL.
- VS Code e Desktop: os desenhos foram testados nas superfícies `terminal` e `desktop` pelo kit oficial de testes, não num app aberto.

## Desenvolvimento

```bash
claude plugin validate plugins/garra-mod   # o que o motor aceita ou recusaria
claude plugin test plugins/garra-mod       # 28 testes (unidade + motor)
claude -p "/garra-diagnostico completo" --plugin-dir plugins/garra-mod  # chamadas reais
```

Estrutura e regras da API: skill `garra-mod-dev` e [docs/testes.md](docs/testes.md).
