# 🇧🇷 Garra MOD para Claude Code

> Projeto independente da comunidade GarraIA, sem afiliação com a Anthropic nem endosso dela. Claude e Claude Code são marcas da Anthropic, PBC.

O Garra MOD veste o Claude Code com a camisa do **GarraIA, Inteligência Artificial Brasileira** 🦜:

- **pt-BR de verdade.** Uma seção curta de personalidade no prompt de sistema faz o Claude responder como um especialista brasileiro em tecnologia. Todos os textos do MOD estão em português.
- **Tema Garra Brasil**: verde, amarelo, azul e branco, aplicado pelo **Claude Skins**, com rodapé em português ("Feito").
- **Frases de espera do GarraIA**: 44 frases curtas em português no spinner ("Afiando as garras…", "Puxando o fio da meada…", "Passando um cafezinho…"), sorteadas sem repetir nenhuma das últimas 5. Com o Claude Skins desenhando o spinner, muda uma por turno; sem ele, troca a cada 4 s em tarefas longas, mantendo a animação, o tempo e os tokens do Claude Code. Desligue com `/garra-config frases off`.
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
/plugin install garra-mod --marketplace GarraIA/GarraMOD
```

Responda `y` para adicionar o marketplace e escolha o escopo **user** para ter o MOD em todos os projetos. Pelo shell: `claude plugin install garra-mod --marketplace GarraIA/GarraMOD`. O MOD não exige o repositório GarraRUST aberto.

A partir de um clone local: `claude plugin marketplace add <pasta do clone>` e `claude plugin install garra-mod@garraia-mods`.

Para desenvolver sem instalar: `claude --plugin-dir /caminho/para/GarraMOD/plugins/garra-mod`.

## Instalar do zero num computador novo

Passo a passo para uma máquina sem nada instalado. Os passos 3, 4 e 5 são opcionais: sem eles o MOD funciona com a personalidade pt-BR, o painel e o tema, só não consulta o GarraIA nem o Hermes.

**1. Claude Code** (2.1.316 ou mais novo; precisa de conta Pro, Max, Team, Enterprise ou Console):

```bash
# Linux, macOS, WSL
curl -fsSL https://claude.ai/install.sh | bash
```

```powershell
# Windows (PowerShell)
irm https://claude.ai/install.ps1 | iex
```

Abra um terminal novo, confira com `claude --version` e rode `claude` para fazer login.

**2. Garra MOD**, no prompt do Claude Code:

```text
/plugin install garra-mod --marketplace GarraIA/GarraMOD
```

Responda `y` para adicionar o marketplace e escolha o escopo **user**.

**3. GarraIA** (instalador oficial do GarraRUST) e a ligação dele com o Claude Code:

```bash
# Linux, macOS, WSL
curl -fsSL https://garraia.org/install.sh | sh
claude mcp add garraia -- garra mcp-server
```

```powershell
# Windows (PowerShell)
irm https://garraia.org/install.ps1 | iex
claude mcp add garraia -- garra mcp-server
```

Confira com `garra --version`.

**4. Hermes Agent** (instalador oficial da Nous Research):

```bash
# Linux, macOS, WSL2
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

```powershell
# Windows (PowerShell)
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

Recarregue o shell (`source ~/.bashrc` ou `source ~/.zshrc`) e confira com `hermes --version`. Rodado num terminal, o instalador também abre a configuração do próprio Hermes (modelo e chaves).

**5. MODs integrados**: os comandos `/plugin` da seção [Requisitos](#requisitos).

**6. Conferir**: reinicie o Claude Code e rode:

```text
/garra-tema brasil
/garra-diagnostico completo
/garra
```

Chaves de API só são necessárias para os modos HTTP dos agentes e ficam em `/config` → garra-mod, nunca em arquivo.

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
| `/garra-config [chave valor]` | `personalidade`, `boas-vindas`, `status`, `next-steps`, `frases` (on/off), `padrao <id>`, `prazo <s>`, `paralelo <n>`, `idioma`. |
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

### Delegação: uma pessoa no controle (exceto no modo bypass)

Um agente delegado age **direto na máquina, fora das permissões do Claude Code**. Por isso, em todo modo de permissão **menos o bypass**:

1. **Aprovação humana antes de rodar.** Se a caixa de permissão do Claude Code aparecer, ela conta como aprovação. Se não aparecer (aprovação automática), o MOD pergunta: *"Aprovar a delegação desta tarefa ao Hermes…?"*.
2. **Confirmação de riscos, sempre**, mesmo depois de aprovada: o que o agente pode fazer (shell, apagar arquivos, git, internet, ler segredos) e as opções **Executar com segurança**, **Executar em modo skip** (só para agentes que têm, como o `--yolo` do Hermes) e **Cancelar**.
3. **O modo skip não é escolha do modelo.** O modelo não consegue pedi-lo: fora do bypass, só você escolhe, a cada delegação.
4. **A decisão fica registrada.** O resultado de cada delegação traz, logo abaixo do título, como ela foi aprovada e a opção escolhida (ex.: `[Garra MOD: aprovação: pergunta do Garra MOD · escolha: Executar em modo skip]`); recusas e cancelamentos mostram a resposta dada. A mesma linha aparece em `/garra` → Conversas.

Sem ninguém para responder (`claude -p`, pergunta dispensada ou resposta digitada que não seja uma das opções), **nada é executado**.

**Modo bypass (`--dangerously-skip-permissions` ou `--permission-mode bypassPermissions`).** Ao iniciar o Claude Code assim, você já escolheu rodar sem perguntas, e o Garra MOD segue essa escolha: delega **sem as duas perguntas**, também no `claude -p`, e usa o **modo skip** do agente quando ele tem um (o `--yolo` do Hermes, que desliga as travas do próprio Hermes). O resultado registra `[Garra MOD: aprovação: modo bypass do Claude Code (sem perguntas) · escolha: …]`. O MOD lê o modo no `permission_mode` que o Claude Code envia a cada prompt e a cada ferramenta; até o primeiro prompt, ou em qualquer outro modo, valem as perguntas acima.

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
| **Claude Skins** | O tema `garra-brasil` é salvo e aplicado pela ferramenta oficial do Skins (`mcp__skins__design`). `/skin` continua trocando livremente; a variante clara é derivada pelo próprio Skins. Com as frases de espera ligadas, o MOD troca só a lista de frases do `garra-brasil` (uma frase sorteada), uma vez por turno e depois que ele termina: paleta, base e rótulo não mudam, e nada é salvo durante o turno, porque cada salvamento do Skins redesenha o transcript. Outro skin em uso ou uma lista editada por você ficam como estão. |
| **Plan Progress** | Não há segundo sistema de progresso: a personalidade e as skills pedem as barras do Plan Progress com títulos em pt-BR, e os subagentes de ponte aparecem nas faixas de agentes. Chamadas diretas por ferramenta não viram faixas falsas. |
| **Next Steps** | O MOD só traduz os rótulos ("next:" → "🦜 GarraIA sugere:", "next steps…" → "🦜 GarraIA pensando nos próximos passos…"); botões e atalhos 1/2/3/0 continuam sendo do Next Steps, inclusive o "dismiss". Funciona em qualquer ordem dos plugins: o MOD entrega ao Next Steps, pelo `ui.resolve`, um `Text` que já escreve esses rótulos em português. Desligue com `/garra-config next-steps off` (vale depois de `/reload-plugins` ou numa sessão nova). |
| **You Should Know** | Componente oficial da Anthropic, embutido. O Garra MOD só verifica se está habilitado; o subagente `garra-mod:revisor` é uma revisão independente e se apresenta como **não** sendo o You Should Know. |

Regiões de interface usadas: um cartão no transcript (`Placed`), um painel (`Pane` "garra"), o fim da linha de dicas (`PromptHint.tail`) e só os textos do Next Steps na banda acima do prompt (`AbovePrompt`, pelo `Text` que o `ui.resolve` entrega ao Next Steps).

## Limitações conhecidas

- O texto nativo do Claude Code (menus, `/help`, rodapés do motor) segue no idioma do próprio Claude Code; use `/garra-config idioma` para a opção nativa.
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
