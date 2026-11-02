// Registro extensível de agentes: os padrões do MOD, depois o arquivo do
// usuário (~/.claude/garra-mod/agentes.json) e por fim os cadastrados por
// comando ($.store). Um id repetido substitui o anterior, então o usuário pode
// reconfigurar até o GarraIA e o Hermes sem tocar no código do MOD.

import type { GarraAgent, GarraAgentEntry, GarraAgentOrigin, GarraAuth, GarraOutput, GarraTransport } from '../../types'
import { checkDestination, findInlineSecret } from '../security/sanitize'
import { DEFAULT_AGENTS } from './defaults'

export type Validated = { ok: true; agent: GarraAgent } | { ok: false; erro: string }

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/
const OUTPUTS: readonly GarraOutput[] = ['text', 'garra.ask.v1', 'garra.agent.v1', 'auto']
const OPTIONS = ['garraiaApiKey', 'hermesApiKey'] as const
const ENVS = ['GARRAIA_GATEWAY_API_KEY', 'API_SERVER_KEY'] as const

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string')

function validateAuth(raw: unknown): GarraAuth | string {
  if (raw === undefined) return { type: 'none' }
  if (!isObj(raw)) return 'auth deve ser um objeto'
  if (raw.type === 'none') return { type: 'none' }
  if (raw.type !== 'bearer') return `auth.type desconhecido: ${String(raw.type)}`
  if (raw.source === 'option') {
    const option = OPTIONS.find(o => o === raw.option)
    return option ? { type: 'bearer', source: 'option', option } : `auth.option deve ser um de: ${OPTIONS.join(', ')}`
  }
  if (raw.source === 'env') {
    const env = ENVS.find(o => o === raw.env)
    return env ? { type: 'bearer', source: 'env', env } : `auth.env deve ser um de: ${ENVS.join(', ')}`
  }
  if (raw.source === 'command') {
    if (!isStrList(raw.argv) || raw.argv.length === 0) return 'auth.argv deve ser uma lista de strings'
    return { type: 'bearer', source: 'command', argv: raw.argv }
  }
  return 'auth.source deve ser "option", "env" ou "command"'
}

function validateTransport(raw: unknown, where: string): GarraTransport | string {
  if (!isObj(raw)) return `${where}: transporte deve ser um objeto`
  const output = raw.output === undefined ? undefined : OUTPUTS.find(o => o === raw.output)
  if (raw.output !== undefined && output === undefined) return `${where}: output deve ser um de ${OUTPUTS.join(', ')}`
  switch (raw.type) {
    case 'mcp': {
      if (typeof raw.server !== 'string' || raw.server === '') return `${where}: mcp.server é obrigatório`
      if (typeof raw.tool !== 'string' || raw.tool === '') return `${where}: mcp.tool é obrigatório`
      if (typeof raw.messageArg !== 'string' || raw.messageArg === '') return `${where}: mcp.messageArg é obrigatório`
      const args: Record<string, string | number | boolean> = {}
      if (raw.args !== undefined) {
        if (!isObj(raw.args)) return `${where}: mcp.args deve ser um objeto`
        for (const [key, value] of Object.entries(raw.args)) {
          if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return `${where}: mcp.args.${key} deve ser texto, número ou booleano`
          args[key] = value
        }
      }
      return { type: 'mcp', server: raw.server, tool: raw.tool, messageArg: raw.messageArg, args, ...(output ? { output } : {}) }
    }
    case 'process': {
      if (!isStrList(raw.argv) || raw.argv.length === 0) return `${where}: process.argv deve ser uma lista de strings`
      const exe = raw.argv[0] ?? ''
      if (exe === '' || /\s/.test(exe)) return `${where}: o executável (argv[0]) não pode ter espaços`
      if (raw.argv.some(a => /\{(mensagem|message|prompt)\}/i.test(a))) return `${where}: a mensagem vai pela entrada padrão, nunca pela linha de comando`
      if (raw.healthArgv !== undefined && !isStrList(raw.healthArgv)) return `${where}: process.healthArgv deve ser uma lista de strings`
      if (raw.skipArgs !== undefined && (!isStrList(raw.skipArgs) || raw.skipArgs.some(a => !a.startsWith('-')))) return `${where}: process.skipArgs deve ser uma lista de opções (cada uma começando com "-")`
      return {
        type: 'process',
        argv: raw.argv,
        ...(output ? { output } : {}),
        ...(raw.healthArgv !== undefined ? { healthArgv: raw.healthArgv as string[] } : {}),
        ...(raw.skipArgs !== undefined ? { skipArgs: raw.skipArgs as string[] } : {}),
      }
    }
    case 'openai-http': {
      if (typeof raw.baseUrl !== 'string') return `${where}: openai-http.baseUrl é obrigatório`
      if (typeof raw.model !== 'string' || raw.model === '') return `${where}: openai-http.model é obrigatório`
      const allowRemote = raw.allowRemote === true
      const bad = checkDestination(raw.baseUrl, allowRemote)
      if (bad) return `${where}: ${bad}`
      const auth = validateAuth(raw.auth)
      if (typeof auth === 'string') return `${where}: ${auth}`
      return {
        type: 'openai-http',
        baseUrl: raw.baseUrl.replace(/\/+$/, ''),
        model: raw.model,
        auth,
        ...(allowRemote ? { allowRemote } : {}),
        ...(typeof raw.systemPrompt === 'string' ? { systemPrompt: raw.systemPrompt } : {}),
      }
    }
    case 'acp':
      return `${where}: ACP ainda não é suportado pelo Garra MOD (a API de mods só envia a entrada padrão de uma vez). Use "process" ou "openai-http".`
    default:
      return `${where}: tipo de transporte desconhecido: ${String(raw.type)} (use "mcp", "process" ou "openai-http")`
  }
}

function validateChain(raw: unknown, where: string): GarraTransport[] | string | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) return `${where} deve ser uma lista de transportes`
  const out: GarraTransport[] = []
  for (const [i, item] of raw.entries()) {
    const t = validateTransport(item, `${where}[${i}]`)
    if (typeof t === 'string') return t
    out.push(t)
  }
  return out
}

export function validateAgent(raw: unknown): Validated {
  if (!isObj(raw)) return { ok: false, erro: 'o agente deve ser um objeto JSON' }
  const id = raw.id
  if (typeof id !== 'string' || !ID.test(id)) return { ok: false, erro: 'id deve ter de 1 a 32 caracteres: letras minúsculas, dígitos e hífen' }
  if (id === 'claude') return { ok: false, erro: 'o id "claude" é reservado ao agente principal' }
  if (typeof raw.nome !== 'string' || raw.nome.trim() === '') return { ok: false, erro: 'nome é obrigatório' }
  const secret = findInlineSecret(raw)
  if (secret) return { ok: false, erro: secret }
  const consulta = validateChain(raw.consulta, 'consulta')
  if (typeof consulta === 'string') return { ok: false, erro: consulta }
  const delegar = validateChain(raw.delegar, 'delegar')
  if (typeof delegar === 'string') return { ok: false, erro: delegar }
  if (!consulta?.length && !delegar?.length) return { ok: false, erro: 'informe ao menos um transporte em "consulta" ou "delegar"' }
  const perms = isObj(raw.permissoes) ? raw.permissoes : {}
  const timeoutS = typeof raw.timeoutS === 'number' ? raw.timeoutS : 120
  if (timeoutS < 5 || timeoutS > 1800) return { ok: false, erro: 'timeoutS deve ficar entre 5 e 1800' }
  const sessao = isObj(raw.sessao) ? raw.sessao : {}
  const maxEntradaKB = typeof sessao.maxEntradaKB === 'number' ? sessao.maxEntradaKB : 60
  if (maxEntradaKB < 1 || maxEntradaKB > 512) return { ok: false, erro: 'sessao.maxEntradaKB deve ficar entre 1 e 512' }
  const agent: GarraAgent = {
    id,
    nome: raw.nome.trim().slice(0, 40),
    tipo: 'externo',
    descricao: typeof raw.descricao === 'string' ? raw.descricao.slice(0, 300) : '',
    ...(typeof raw.icone === 'string' ? { icone: [...raw.icone].slice(0, 2).join('') } : {}),
    capacidades: isStrList(raw.capacidades) ? raw.capacidades.slice(0, 12) : [],
    ...(typeof raw.modelo === 'string' ? { modelo: raw.modelo } : {}),
    timeoutS,
    permissoes: {
      consulta: perms.consulta !== false && !!consulta?.length,
      delegar: perms.delegar === true && !!delegar?.length,
    },
    ...(consulta?.length ? { consulta } : {}),
    ...(delegar?.length ? { delegar } : {}),
    sessao: { compartilharHistorico: false, maxEntradaKB },
    ativo: raw.ativo !== false,
  }
  return { ok: true, agent }
}

// Lê a lista de um arquivo: um array de agentes ou `{ "agentes": [...] }`.
export function parseAgentFile(text: string): { agents: GarraAgent[]; erros: string[] } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (error) {
    return { agents: [], erros: [`JSON inválido: ${String(error)}`] }
  }
  const list = Array.isArray(data) ? data : isObj(data) && Array.isArray(data.agentes) ? data.agentes : null
  if (list === null) return { agents: [], erros: ['o arquivo deve ser uma lista de agentes ou { "agentes": [...] }'] }
  const agents: GarraAgent[] = []
  const erros: string[] = []
  for (const [i, item] of list.entries()) {
    const v = validateAgent(item)
    if (v.ok) agents.push(v.agent)
    else erros.push(`agente ${i + 1}: ${v.erro}`)
  }
  return { agents, erros }
}

export function mergeAgents(layers: ReadonlyArray<{ origem: GarraAgentOrigin; agents: readonly GarraAgent[] }>): GarraAgentEntry[] {
  const byId = new Map<string, GarraAgentEntry>()
  for (const { origem, agents } of layers) {
    for (const agent of agents) {
      // O agente principal não é substituído.
      if (agent.id === 'claude' && origem !== 'padrão') continue
      byId.set(agent.id, { ...agent, origem })
    }
  }
  return [...byId.values()]
}

export function defaultLayer() {
  return { origem: 'padrão' as const, agents: DEFAULT_AGENTS }
}

export function findAgent(agents: readonly GarraAgentEntry[], ref: string): GarraAgentEntry | undefined {
  const key = ref.trim().toLowerCase()
  const alias: Record<string, string> = { garra: 'garraia', 'garra-ia': 'garraia', 'hermes-agent': 'hermes' }
  const id = alias[key] ?? key
  return agents.find(a => a.id === id) ?? agents.find(a => a.nome.toLowerCase() === key)
}
