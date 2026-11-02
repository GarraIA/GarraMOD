// Os agentes padrão do Garra MOD. Aparecem sempre no catálogo, mesmo offline;
// aparecer no catálogo não é estar conectado: o estado vem da verificação real.
//
// Cada agente tem uma lista de transportes tentados em ordem. Um transporte que
// não está ao alcance (servidor MCP ausente, executável não instalado, porta
// fechada, chave não configurada) passa a vez ao próximo.

import type { GarraAgent } from '../../types'

export const DEFAULT_AGENTS: readonly GarraAgent[] = [
  {
    id: 'claude',
    nome: 'Claude',
    tipo: 'principal',
    descricao: 'Agente principal do Claude Code: conversa, coordena os outros agentes e consolida os resultados. Mantém as ferramentas e permissões originais.',
    icone: '🤖',
    capacidades: ['coordenação', 'código', 'ferramentas do Claude Code', 'consolidação'],
    timeoutS: 0,
    permissoes: { consulta: false, delegar: false },
    sessao: { compartilharHistorico: false, maxEntradaKB: 0 },
    ativo: true,
  },
  {
    id: 'garraia',
    nome: 'GarraIA',
    tipo: 'externo',
    descricao: 'Agente do GarraRUST, no runtime real do GarraIA: consultas, análises, sugestões de testes e tarefas delegadas.',
    icone: '🦜',
    capacidades: ['consulta', 'revisão de código', 'sugestão de testes', 'análise', 'delegação com ferramentas'],
    timeoutS: 120,
    permissoes: { consulta: true, delegar: true },
    consulta: [
      // Servidor MCP `garra mcp-server` (ferramenta garra_ask: só LLM, sem shell).
      { type: 'mcp', server: 'garraia', tool: 'garra_ask', messageArg: 'message', args: { timeout_secs: '{timeout}' }, output: 'garra.ask.v1' },
      // Mesma consulta pela CLI, para máquinas sem o servidor MCP configurado.
      { type: 'process', argv: ['garra', 'ask', '--json', '--timeout-secs', '{timeout}'], output: 'garra.ask.v1' },
    ],
    delegar: [
      // garra_agent: agente completo com shell, arquivos, git e web. Com aprovação (exceto no modo bypass).
      { type: 'mcp', server: 'garraia', tool: 'garra_agent', messageArg: 'message', args: { timeout_secs: '{timeout}', working_dir: '{cwd}' }, output: 'garra.agent.v1' },
    ],
    sessao: { compartilharHistorico: false, maxEntradaKB: 60 },
    ativo: true,
  },
  {
    id: 'hermes',
    nome: 'Hermes',
    tipo: 'externo',
    descricao: 'Hermes Agent da Nous Research: pesquisas, revisões, segunda opinião e tarefas delegadas.',
    icone: '🪶',
    capacidades: ['pesquisa web', 'revisão', 'segunda opinião', 'delegação com ferramentas'],
    timeoutS: 180,
    permissoes: { consulta: true, delegar: true },
    consulta: [
      // API HTTP do Hermes (desligada por padrão; ver README). Sem chave, passa a vez.
      { type: 'openai-http', baseUrl: 'http://127.0.0.1:8642', model: 'hermes-agent', auth: { type: 'bearer', source: 'option', option: 'hermesApiKey' } },
      // CLI em modo de uma pergunta só, só com o conjunto de ferramentas `web`.
      {
        type: 'process',
        argv: ['hermes', 'chat', '--query-file', '-', '--quiet', '--source', 'tool', '--toolsets', 'web', '--max-turns', '8'],
        output: 'text',
      },
    ],
    delegar: [
      // Sem --yolo por padrão: as confirmações do próprio Hermes continuam valendo.
      // --yolo só entra se a PESSOA escolher "modo skip" na confirmação de riscos,
      // ou com o Claude Code em modo bypass (escolha dela ao iniciar a sessão).
      {
        type: 'process',
        argv: ['hermes', 'chat', '--query-file', '-', '--quiet', '--source', 'tool', '--toolsets', 'web,file,terminal,code_execution', '--in', '{cwd}', '--max-turns', '40'],
        output: 'text',
        skipArgs: ['--yolo'],
      },
    ],
    sessao: { compartilharHistorico: false, maxEntradaKB: 60 },
    ativo: true,
  },
]
