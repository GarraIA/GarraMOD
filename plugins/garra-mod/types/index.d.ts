// Contrato do Garra MOD: os tipos do registro de agentes e os valores que o MOD
// guarda em `$.state` (sessão) e espelha em `$.store` (entre sessões).

// ---------------------------------------------------------------- agentes

/** Como o MOD envia a resposta de autenticação a um transporte HTTP. */
export type GarraAuth =
  | { type: 'none' }
  // Valor vindo de um campo `sensitive` do userConfig (armazenamento seguro).
  | { type: 'bearer'; source: 'option'; option: 'garraiaApiKey' | 'hermesApiKey' }
  // Valor vindo de uma variável de ambiente conhecida (lista fechada, lida por nome literal).
  | { type: 'bearer'; source: 'env'; env: 'GARRAIA_GATEWAY_API_KEY' | 'API_SERVER_KEY' }
  // Valor impresso por um comando do sistema (secret-tool, pass, security, op...).
  | { type: 'bearer'; source: 'command'; argv: string[] }

/** Formato da saída de um processo ou ferramenta MCP. */
export type GarraOutput = 'text' | 'garra.ask.v1' | 'garra.agent.v1' | 'auto'

export type GarraTransport =
  | {
      type: 'mcp'
      // Nome do servidor MCP conectado ao Claude Code (como /mcp lista).
      server: string
      tool: string
      // Nome do argumento que recebe a mensagem.
      messageArg: string
      // Argumentos extras; `{timeout}` e `{cwd}` são substituídos.
      args?: Record<string, string | number | boolean>
      output?: GarraOutput
    }
  | {
      type: 'process'
      // Executável e argumentos. A mensagem vai SEMPRE pela entrada padrão,
      // nunca pela linha de comando. `{timeout}` e `{cwd}` são substituídos.
      argv: string[]
      output?: GarraOutput
      // Comando curto para verificar se o executável existe (padrão: `--version`).
      healthArgv?: string[]
      // Argumentos do "modo skip" (ex.: ["--yolo"]): entram quando a PESSOA
      // escolhe esse modo na confirmação de riscos de uma delegação, ou com o
      // Claude Code em modo bypass. Nunca a pedido do modelo.
      skipArgs?: string[]
    }
  | {
      type: 'openai-http'
      // Base sem barra final: http://127.0.0.1:8642
      baseUrl: string
      model: string
      auth?: GarraAuth
      // Destinos fora do loopback exigem https e esta permissão explícita.
      allowRemote?: boolean
      systemPrompt?: string
    }

export type GarraAgentKind = 'principal' | 'externo'

export type GarraAgent = {
  id: string
  nome: string
  tipo: GarraAgentKind
  descricao: string
  icone?: string
  capacidades: string[]
  modelo?: string
  timeoutS: number
  permissoes: {
    // Consultas somente leitura (perguntas e revisões).
    consulta: boolean
    // Tarefas com ferramentas que podem alterar o ambiente; sempre pedem aprovação.
    delegar: boolean
  }
  // Transportes tentados em ordem até um responder (fallback).
  consulta?: GarraTransport[]
  delegar?: GarraTransport[]
  sessao: {
    // O MOD nunca envia o histórico da conversa; fica registrado por clareza.
    compartilharHistorico: false
    // Limite da mensagem enviada, em KiB.
    maxEntradaKB: number
  }
  ativo: boolean
}

export type GarraAgentOrigin = 'padrão' | 'usuário (arquivo)' | 'usuário (comando)'

export type GarraAgentEntry = GarraAgent & { origem: GarraAgentOrigin }

// ---------------------------------------------------------------- estado

export type GarraHealthStatus = 'verificando' | 'configurado' | 'conectado' | 'disponível' | 'indisponível' | 'erro'

export type GarraHealth = {
  id: string
  status: GarraHealthStatus
  // Por qual transporte (ex.: "MCP garraia", "CLI hermes 0.22.5").
  via: string
  detalhe: string
  verificadoEm: number
}

export type GarraHistoryEntry = {
  id: string
  agente: string
  nome: string
  modo: 'consulta' | 'delegar'
  pergunta: string
  resposta: string
  ok: boolean
  ms: number
  em: number
  via: string
  modelo?: string
  redacoes: number
  // Delegação: como foi aprovada e o que a pessoa escolheu.
  decisao?: string
}

export type GarraPrefs = {
  personalidade: boolean
  boasVindas: boolean
  statusLine: boolean
  localizarNextSteps: boolean
  // Frases de espera do GarraIA no spinner (sorteio sem repetir as últimas 5).
  frasesEspera: boolean
  agentePadrao: string
  timeoutS: number
  concorrencia: number
  rev: number
}

export type GarraDiagItem = { nome: string; ok: boolean | null; detalhe: string }

export type GarraDiag = { em: number; itens: GarraDiagItem[] } | null

export type GarraTab = 'info' | 'agentes' | 'conversas' | 'modelos' | 'mods' | 'skills' | 'tema' | 'config' | 'diagnostico'

/** Um MOD de terceiros integrado, como a sessão o vê. */
export type GarraExt = {
  id: string
  nome: string
  habilitado: boolean
  // true: o MOD expôs ferramenta ou comando nesta sessão; null: não observável.
  carregado: boolean | null
  detalhe: string
}

export type GarraSkill = { nome: string; descricao: string }

export type GarraMeta = {
  claudeVersion: string
  idioma: string
  isLight: boolean
  surface: string
  registroErros: string[]
}

declare module 'claude-code' {
  interface PluginState {
    'garra-mod': {
      health: Record<string, GarraHealth>
      history: GarraHistoryEntry[]
      prefs: GarraPrefs
      tab: GarraTab
      agents: GarraAgentEntry[]
      diag: GarraDiag
      // Chamadas a agentes externos em andamento, por id de agente.
      running: Record<string, number>
      // Aviso do último tema aplicado ou erro ao aplicar.
      tema: string
      exts: GarraExt[]
      skills: GarraSkill[]
      meta: GarraMeta
      // Quando o hook prompt.compose pôs a seção de personalidade num prompt
      // desta sessão (0 = ainda não). É a prova que o diagnóstico lê.
      persona: number
      // A frase de espera da vez e as últimas mostradas (não voltam no próximo sorteio).
      frase: string
      frasesRecentes: string[]
    }
  }
}
