# Agentes do Garra MOD

O catálogo junta três camadas, nesta ordem (um `id` repetido substitui o anterior):

1. **Padrão** — `claude`, `garraia`, `hermes` (em `src/registry/defaults.ts`).
2. **Arquivo do usuário** — `~/.claude/garra-mod/agentes.json` (Windows: `%USERPROFILE%\.claude\garra-mod\agentes.json`).
3. **Comando** — `/garra-agentes adicionar {json}` ou a ferramenta `garra_agentes` (guardado no `$.store` do MOD).

Nenhuma camada exige mexer no código do MOD. O `claude` (agente principal) não pode ser substituído.

## Formato

```json
{
  "agentes": [
    {
      "id": "ollama-local",
      "nome": "Ollama local",
      "descricao": "Modelo local para perguntas rápidas",
      "icone": "🦙",
      "capacidades": ["consulta"],
      "modelo": "qwen3.5:0.8b",
      "timeoutS": 60,
      "permissoes": { "consulta": true, "delegar": false },
      "consulta": [
        { "type": "openai-http", "baseUrl": "http://127.0.0.1:11434", "model": "qwen3.5:0.8b" }
      ],
      "sessao": { "maxEntradaKB": 32 },
      "ativo": true
    }
  ]
}
```

| Campo | Obrigatório | Notas |
| --- | --- | --- |
| `id` | sim | 1–32 caracteres: minúsculas, dígitos e hífen. `claude` é reservado. |
| `nome` | sim | Como aparece no painel e nas respostas. |
| `consulta` / `delegar` | ao menos um | Lista de transportes tentados em ordem (fallback). |
| `permissoes` | não | `consulta` padrão `true`; `delegar` padrão `false` (precisa ser `true` e ter transporte). |
| `timeoutS` | não | 5–1800, padrão 120. Consultas também respeitam o prazo máximo de `/garra-config prazo`. |
| `sessao.maxEntradaKB` | não | 1–512, padrão 60. O histórico da conversa **nunca** é enviado. |

## Transportes suportados (implementados e testados)

### `mcp` — servidor MCP conectado ao Claude Code

```json
{ "type": "mcp", "server": "garraia", "tool": "garra_ask", "messageArg": "message", "args": { "timeout_secs": "{timeout}" }, "output": "garra.ask.v1" }
```

Usa `$.mcp.call` com a conexão e as credenciais do próprio Claude Code. Se o servidor não estiver conectado, passa a vez ao próximo transporte.

Nos `args`, `{timeout}` e `{cwd}` são substituídos. Para o GarraIA, `{garraia.provider}` e `{garraia.model}` viram o provedor padrão (`agent.default_provider`) e o modelo dessa entrada em `llm:` do `config.yml` do GarraIA, lido a cada chamada nas pastas que o próprio GarraIA usa (`GARRAIA_CONFIG_DIR`, `~/.config/garraia`, `~/.garraia`). Se o arquivo não existir ou não tiver esses campos, o argumento fica de fora e vale o padrão do servidor (`z-ai/glm-5.3-flash`). É assim que o agente padrão chama o GarraIA:

```json
{ "type": "mcp", "server": "garraia", "tool": "garra_ask", "messageArg": "message", "args": { "timeout_secs": "{timeout}", "provider": "{garraia.provider}", "model": "{garraia.model}" }, "output": "garra.ask.v1" }
```

Esses dois marcadores valem só nos `args` de MCP. A CLI (`garra ask` sem `-p`/`-m`) já segue o `agent.default_provider` sozinha.

### `process` — executável local

```json
{ "type": "process", "argv": ["hermes", "chat", "--query-file", "-", "--quiet", "--source", "tool", "--toolsets", "web"], "output": "text" }
```

A mensagem vai **sempre pela entrada padrão**, nunca pela linha de comando (sem risco de injeção no argv). `{timeout}` e `{cwd}` são substituídos. Interromper a chamada (Esc) ou estourar o prazo encerra o processo.

`skipArgs` (opcional, só em `delegar`): opções do "modo skip" do agente, como `["--yolo"]` no Hermes. Elas entram quando a pessoa escolhe *Executar em modo skip* na confirmação de riscos de uma delegação, ou automaticamente com o Claude Code em modo bypass (`--dangerously-skip-permissions`); o modelo não consegue pedi-las.

### `openai-http` — endpoint `/v1/chat/completions`

```json
{ "type": "openai-http", "baseUrl": "http://127.0.0.1:8642", "model": "hermes-agent", "auth": { "type": "bearer", "source": "option", "option": "hermesApiKey" } }
```

- Só `127.0.0.1`, `localhost` ou `::1` por padrão. Destino remoto exige `"allowRemote": true` **e** `https`.
- Credencial na URL é recusada.

### `output`

`text` (texto puro), `garra.ask.v1` / `garra.agent.v1` (envelopes JSON do GarraIA) ou `auto`.

### Não suportado (ainda)

- **ACP** (Agent Client Protocol): a API de mods escreve a entrada padrão de uma vez só, e o ACP precisa de diálogo JSON-RPC (inclusive pedidos de permissão do agente). Um agente que fala ACP pode ser usado pelo modo de linha de comando dele (`process`).

## Segredos (`auth`)

Se a chave de um transporte não estiver configurada (`option` vazio ou variável não definida), ele é pulado em silêncio: a resposta não menciona essa tentativa. Erros reais (conexão recusada, chave recusada, comando de segredo que falhou) aparecem na nota "antes, sem sucesso". Se nenhum transporte funcionar, o erro final cita tudo, inclusive a chave ausente.


Nunca escreva uma chave no JSON: o MOD recusa definições que parecem conter segredo.

| `source` | De onde vem o token |
| --- | --- |
| `option` | Campos sensíveis do plugin (`garraiaApiKey`, `hermesApiKey`), no armazenamento seguro do Claude Code: `/config` → garra-mod. |
| `env` | Variáveis `GARRAIA_GATEWAY_API_KEY` ou `API_SERVER_KEY`. |
| `command` | A primeira linha impressa por um comando, ex.: `["secret-tool", "lookup", "service", "hermes"]`, `["pass", "show", "hermes/api"]`, `["security", "find-generic-password", "-s", "hermes", "-w"]`. |

## Exemplos prontos

**Hermes pela API HTTP** (depois de ligar `API_SERVER_ENABLED=true` e `API_SERVER_KEY` em `~/.hermes/.env` e reiniciar `hermes gateway`): o padrão já tenta `http://127.0.0.1:8642` primeiro; basta colocar a chave em `/config` → garra-mod → *Chave da API do Hermes*.

**GarraIA pelo gateway HTTP** (porta 3888, com `gateway.api_key`):

```json
{ "id": "garraia-http", "nome": "GarraIA (gateway)", "consulta": [
  { "type": "openai-http", "baseUrl": "http://127.0.0.1:3888", "model": "anthropic/claude-haiku-5.5",
    "auth": { "type": "bearer", "source": "option", "option": "garraiaApiKey" } } ] }
```

Atenção: no gateway, `/v1/chat/completions` pode rodar ferramentas do GarraIA conforme o modo; para consulta pura prefira o `garra_ask` (MCP ou CLI), que é só LLM.
