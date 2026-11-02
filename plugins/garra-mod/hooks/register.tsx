// Garra MOD — GarraIA Claude Code.
// Este módulo só liga as peças: registro de agentes (src/registry), ponte
// operacional (src/connectors), interface (src/interface), tema
// (src/themes), personalidade e textos pt-BR (src/localization).

import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, PluginOptions, Register, RenderElement } from 'claude-code'
import type { GarraAgent, GarraAgentEntry, GarraDiag, GarraDiagItem, GarraExt, GarraHealth, GarraHistoryEntry, GarraMeta, GarraPrefs, GarraSkill, GarraTab } from '../types'
import { callAgent, type CallOutcome, makeLimiter, type Modo, probeAgent } from '../src/connectors'
import { detectExts, detectSkills, toolNameSet } from '../src/core/detect'
import { formatAgents, formatExts, formatOutcome, formatStatus } from '../src/core/format'
import { DEFAULT_PREFS, HISTORY_ANSWER_MAX, HISTORY_MAX, parseHistory, parsePrefs, STORE } from '../src/core/state'
import { healthOf, statusText } from '../src/interface/common'
import { panel, TABS } from '../src/interface/panel'
import { welcomeCard } from '../src/interface/welcome'
import { PERSONALIDADE, PERSONALIDADE_ID } from '../src/localization/personalidade'
import { MARCA, STATUS_ICONE, TXT } from '../src/localization/pt-BR'
import { defaultLayer, findAgent, mergeAgents, parseAgentFile, validateAgent } from '../src/registry/registry'
import { oneLine, redactSecrets } from '../src/security/sanitize'
import { cores, isLightTheme, saveGarraSkin, SKIN_NAME, skinsAvailable, skinsCall, skinsCurrent } from '../src/themes/garra-brasil'

const VERSION = '0.1.2'
const PANE = 'garra'
const PLACE = 'abertura'

const T = {
  consultar: 'mcp__garra-mod__garra_consultar',
  paralelo: 'mcp__garra-mod__garra_paralelo',
  delegar: 'mcp__garra-mod__garra_delegar',
  agentes: 'mcp__garra-mod__garra_agentes',
} as const

const COMMANDS = [
  { name: 'garra', description: '🇧🇷 Abre o painel principal do GarraIA Claude Code', argumentHint: '[agentes|conversas|modelos|mods|skills|tema|config|diagnostico]' },
  { name: 'garra-status', description: 'Estado geral do Garra MOD: agentes, MODs integrados e preferências' },
  { name: 'garra-consultar', description: 'Consulta um agente externo agora e mostra a resposta real', argumentHint: '<agente> <pergunta>' },
  { name: 'garra-tema', description: 'Identidade visual: aplica o tema Garra Brasil no Claude Skins', argumentHint: '[brasil|anterior|salvar|<skin>]' },
  { name: 'garra-plugins', description: 'MODs integrados ao Garra MOD e o estado real de cada um' },
  { name: 'garra-config', description: 'Preferências do Garra MOD (idioma, agente padrão, prazos, paralelismo)', argumentHint: '[chave valor]' },
  { name: 'garra-diagnostico', description: 'Verificações de funcionamento do Garra MOD', argumentHint: '[completo]' },
] as const

const FRAME = '[Pedido do Claude Code via Garra MOD. Responda em português do Brasil, de forma objetiva.]'

function frame(pergunta: string, contexto?: string): string {
  const parts = [FRAME, '', pergunta.trim()]
  if (contexto && contexto.trim() !== '') parts.push('', '--- contexto enviado pelo Claude ---', contexto.trim())
  return parts.join('\n')
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

// Valores da sessão em $.state (sobrevivem a recargas do MOD).
// Troque a etiqueta quando o formato mudar: valores antigos são descartados.
export const healthAtom = atom({ plugin: 'garra-mod', key: 'health' } as const, {} as Record<string, GarraHealth>)
export const historyAtom = atom({ plugin: 'garra-mod', key: 'history' } as const, [] as GarraHistoryEntry[])
export const prefsAtom = atom({ plugin: 'garra-mod', key: 'prefs' } as const, DEFAULT_PREFS)
export const tabAtom = atom({ plugin: 'garra-mod', key: 'tab' } as const, 'info' as GarraTab)
export const agentsAtom = atom({ plugin: 'garra-mod', key: 'agents' } as const, [] as GarraAgentEntry[])
export const diagAtom = atom({ plugin: 'garra-mod', key: 'diag' } as const, null as GarraDiag)
export const runningAtom = atom({ plugin: 'garra-mod', key: 'running' } as const, {} as Record<string, number>)
export const temaAtom = atom({ plugin: 'garra-mod', key: 'tema' } as const, '')
export const extsAtom = atom({ plugin: 'garra-mod', key: 'exts' } as const, [] as GarraExt[])
export const skillsAtom = atom({ plugin: 'garra-mod', key: 'skills' } as const, [] as GarraSkill[])
export const personaAtom = atom({ plugin: 'garra-mod', key: 'persona' } as const, 0)
export const metaAtom = atom({ plugin: 'garra-mod', key: 'meta' } as const, {
  claudeVersion: '?',
  idioma: '',
  isLight: false,
  surface: 'terminal',
  registroErros: [],
} as GarraMeta)


// Estado do módulo (recomeça a cada recarga; o que precisa durar fica em $.state/$.store).
const S: { options: PluginOptions; cwd: string; limiter: ReturnType<typeof makeLimiter>; aprovadas: Map<string, number>; logo: string | null } = {
  options: {},
  cwd: '.',
  limiter: makeLimiter(),
  // Delegações cuja caixa de permissão a pessoa viu (chave → quando).
  aprovadas: new Map(),
  // Logo oficial do GarraRUST (PNG em base64), lido no início da sessão.
  logo: null,
}

const delegationKey = (input: Record<string, unknown>) => JSON.stringify([str(input.agente), str(input.tarefa), str(input.diretorio)])


// ---------------------------------------------------------------- carga

async function homeDir($: EngineInterface): Promise<string> {
  return (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''
}

async function agentFilePath($: EngineInterface): Promise<string> {
  const home = await homeDir($)
  return home === '' ? '' : `${home}/.claude/garra-mod/agentes.json`
}

async function storedAgents($: EngineInterface): Promise<GarraAgent[]> {
  const raw = await $.store.get(STORE.agents)
  if (!Array.isArray(raw)) return []
  return raw.flatMap(item => {
    const v = validateAgent(item)
    return v.ok ? [v.agent] : []
  })
}

async function loadAgents($: EngineInterface): Promise<GarraAgentEntry[]> {
  const erros: string[] = []
  const layers = [defaultLayer()]
  const path = await agentFilePath($)
  if (path !== '' && (await $.fs.exists(path).catch(() => false))) {
    try {
      const parsed = parseAgentFile(await $.fs.read(path))
      layers.push({ origem: 'usuário (arquivo)' as never, agents: parsed.agents })
      erros.push(...parsed.erros.map(e => `${path}: ${e}`))
    } catch (error) {
      erros.push(`${path}: ${String(error)}`)
    }
  }
  layers.push({ origem: 'usuário (comando)' as never, agents: await storedAgents($) })
  const agents = mergeAgents(layers)
  await update($, agentsAtom, () => agents)
  await update($, metaAtom, m => ({ ...m, registroErros: erros }))
  return agents
}

async function loadAll($: EngineInterface) {
  const prefs = parsePrefs(await $.store.get(STORE.prefs))
  await update($, prefsAtom, () => prefs)
  await update($, historyAtom, () => [])
  const history = parseHistory(await $.store.get(STORE.history))
  await update($, historyAtom, () => history)
  await loadAgents($)
}

async function refreshMeta($: EngineInterface, surface?: string | null) {
  const [exts, skills, isLight, version, rows] = await Promise.all([
    detectExts($),
    detectSkills($),
    isLightTheme($),
    $.session.version().catch(() => ({ version: '?' })),
    $.config.list().catch(() => []),
  ])
  const language = rows.find(r => r.key === 'language')
  await update($, extsAtom, () => exts)
  await update($, skillsAtom, () => skills)
  await update($, metaAtom, m => ({
    ...m,
    isLight,
    claudeVersion: version.version,
    idioma: typeof language?.value === 'string' ? language.value : '',
    ...(surface ? { surface } : {}),
  }))
}

async function savePrefs($: EngineInterface, change: (p: GarraPrefs) => GarraPrefs) {
  const next = await update($, prefsAtom, p => ({ ...change(p), rev: p.rev + 1 }))
  await $.store.set(STORE.prefs, next)
  await refreshStatus($)
  return next
}

// ---------------------------------------------------------------- estado dos agentes

// O indicador dos agentes fica no fim da linha de dicas do prompt (PromptHint),
// em cinza; $.ui.status desenharia junto dos avisos fixos do motor (com ⚠).
async function refreshStatus($: EngineInterface) {
  $.ui.status(undefined)
}

async function probeAll($: EngineInterface) {
  const agents = await read($, agentsAtom)
  await update($, healthAtom, held => {
    const next = { ...held }
    for (const a of agents) if (a.tipo !== 'principal') next[a.id] = { ...healthOf(a, held), status: 'verificando' }
    return next
  })
  const toolNames = await toolNameSet($)
  const results = await Promise.all(agents.map(a => probeAgent($, S.options, a, toolNames, S.cwd)))
  await update($, healthAtom, () => Object.fromEntries(results.map(r => [r.id, r])))
  await refreshStatus($)
}

// ---------------------------------------------------------------- chamadas

async function runCall($: EngineInterface, agent: GarraAgentEntry, modo: Modo, mensagem: string, opts: { timeoutS?: number; dir?: string; skip?: boolean; decisao?: string } = {}): Promise<CallOutcome> {
  const prefs = await read($, prefsAtom)
  const timeoutS = opts.timeoutS ?? (modo === 'consulta' ? Math.min(agent.timeoutS, prefs.timeoutS) : agent.timeoutS)
  await update($, runningAtom, r => ({ ...r, [agent.id]: (r[agent.id] ?? 0) + 1 }))
  try {
    const out = await S.limiter.run(prefs.concorrencia, () => callAgent($, S.options, { agent, modo, mensagem, cwd: opts.dir ?? S.cwd, timeoutS, ...(opts.skip ? { skip: true } : {}) }))
    const now = await $.clock.now()
    const entry: GarraHistoryEntry = {
      id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      agente: agent.id,
      nome: agent.nome,
      modo,
      pergunta: oneLine(redactSecrets(mensagem.replace(FRAME, '')).text, 300),
      resposta: out.texto.slice(0, HISTORY_ANSWER_MAX),
      ok: out.ok,
      ms: out.ms,
      em: now,
      via: out.via,
      ...(out.modelo ? { modelo: out.modelo } : {}),
      redacoes: out.redacoes,
      ...(opts.decisao ? { decisao: opts.decisao } : {}),
    }
    const history = await update($, historyAtom, list => [...list, entry].slice(-HISTORY_MAX))
    await $.store.set(STORE.history, history)
    // A chamada mostra o estado real: um transporte que respondeu está conectado.
    if (out.ok) {
      const seen: GarraHealth = {
        id: agent.id,
        status: out.via.startsWith('CLI') ? 'disponível' : 'conectado',
        via: out.via,
        detalhe: `respondeu em ${Math.round(out.ms / 100) / 10} s`,
        verificadoEm: now,
      }
      await update($, healthAtom, h => ({ ...h, [agent.id]: seen }))
      await refreshStatus($)
    }
    return out
  } finally {
    await update($, runningAtom, r => ({ ...r, [agent.id]: Math.max(0, (r[agent.id] ?? 1) - 1) }))
  }
}

async function resolveAgent($: EngineInterface, ref: string): Promise<GarraAgentEntry | string> {
  const agents = await read($, agentsAtom)
  const agent = findAgent(agents, ref)
  return agent ?? TXT.semAgente(ref)
}

// ---------------------------------------------------------------- tema

async function applyBrasil($: EngineInterface): Promise<string> {
  if (!(await skinsAvailable($))) return TXT.temaSemSkins
  const current = await skinsCurrent($)
  if (current && current.current !== SKIN_NAME) await $.store.set(STORE.previousSkin, current.current)
  const saved = await saveGarraSkin($, true)
  const msg = saved.ok
    ? `🇧🇷 Tema "${SKIN_NAME}" salvo e aplicado no Claude Skins${current ? ` (antes: ${current.current})` : ''}. /skin ou /garra-tema anterior trocam de volta.`
    : `Não foi possível aplicar o tema: ${oneLine(saved.text, 200)}`
  await update($, temaAtom, () => msg)
  return msg
}

async function restoreSkin($: EngineInterface): Promise<string> {
  if (!(await skinsAvailable($))) return TXT.temaSemSkins
  const prev = await $.store.get(STORE.previousSkin)
  if (typeof prev !== 'string' || prev === '') return 'Nenhum tema anterior guardado. Use /skin para escolher outro.'
  const res = await skinsCall($, { action: 'apply', name: prev })
  const msg = res.ok ? `Tema "${prev}" reaplicado no Claude Skins.` : `Não foi possível aplicar "${prev}": ${oneLine(res.text, 200)}`
  await update($, temaAtom, () => msg)
  return msg
}

async function setLanguage($: EngineInterface): Promise<string> {
  const rows = await $.config.list().catch(() => [])
  if (!rows.some(r => r.key === 'language')) return 'Esta versão do Claude Code não tem a opção de idioma (/config → language).'
  const res = await $.config.set({ key: 'language', value: 'português (Brasil)' })
  await refreshMeta($)
  return 'deny' in res && res.deny ? `O Claude Code recusou a troca de idioma: ${res.deny}` : 'Idioma do Claude Code definido como português (Brasil) (/config → language).'
}

// ---------------------------------------------------------------- diagnóstico

async function runDiag($: EngineInterface, completo: boolean): Promise<GarraDiagItem[]> {
  const items: GarraDiagItem[] = []
  const version = await $.session.version().catch(() => null)
  items.push({ nome: 'Claude Code', ok: version !== null, detalhe: version ? `versão ${version.version}` : 'versão não lida' })
  items.push({ nome: 'Garra MOD', ok: true, detalhe: `v${VERSION} carregado de ${$.plugin.root}` })

  const commands = new Set((await $.command.list().catch(() => [])).map(c => c.name))
  const missingCmd = COMMANDS.filter(c => !commands.has(c.name)).map(c => `/${c.name}`)
  items.push({ nome: 'Comandos', ok: missingCmd.length === 0, detalhe: missingCmd.length ? `faltando: ${missingCmd.join(', ')}` : `${COMMANDS.length} comandos /garra* registrados` })

  const tools = await toolNameSet($)
  const missingTool = Object.values(T).filter(t => !tools.has(t))
  items.push({ nome: 'Ferramentas multiagente', ok: missingTool.length === 0, detalhe: missingTool.length ? `faltando: ${missingTool.join(', ')}` : '4 ferramentas registradas (consultar, paralelo, delegar, agentes)' })

  const prefs = await read($, prefsAtom)
  if (!prefs.personalidade) {
    items.push({ nome: 'Personalidade pt-BR', ok: null, detalhe: 'desligada em /garra-config' })
  } else {
    // Não dá para conferir com $.prompt.compose(): chamado pelo próprio MOD, ele
    // não passa pelo hook do MOD, e a seção nunca aparece. O hook registra quando a põe.
    const em = await read($, personaAtom)
    items.push({
      nome: 'Personalidade pt-BR',
      ok: em > 0 ? true : null,
      detalhe: em > 0 ? `seção ${PERSONALIDADE_ID} incluída no prompt de sistema pelo hook prompt.compose` : 'nenhum prompt composto ainda nesta sessão; mande uma mensagem e rode de novo',
    })
  }

  await refreshMeta($)
  const meta = await read($, metaAtom)
  items.push({ nome: 'Idioma do Claude Code', ok: null, detalhe: meta.idioma ? `language = ${meta.idioma}` : 'padrão (a personalidade pede pt-BR; /garra-config idioma muda a opção nativa)' })

  for (const x of await read($, extsAtom)) {
    items.push({ nome: x.nome, ok: x.habilitado && x.carregado !== false, detalhe: `${x.habilitado ? 'habilitado' : 'não habilitado'}${x.carregado === true ? ', carregado' : x.carregado === false ? ', não carregado' : ''} — ${x.detalhe}` })
  }

  await probeAll($)
  const [agents, health] = await Promise.all([read($, agentsAtom), read($, healthAtom)])
  for (const agent of agents.filter(a => a.tipo !== 'principal')) {
    const h = healthOf(agent, health)
    items.push({ nome: `Agente ${agent.nome}`, ok: h.status === 'conectado' || h.status === 'disponível', detalhe: `${statusText(h.status)} via ${h.via} — ${h.detalhe}` })
    if (completo && agent.ativo && agent.permissoes.consulta) {
      const out = await runCall($, agent, 'consulta', frame('Teste de conexão do Garra MOD: responda apenas a palavra PRONTO.'), { timeoutS: 90 })
      items.push({ nome: `Chamada real a ${agent.nome}`, ok: out.ok, detalhe: out.ok ? `respondeu "${oneLine(out.texto, 40)}" via ${out.via} em ${(out.ms / 1000).toFixed(1)} s` : out.texto })
    }
  }

  items.push({
    nome: 'Registro de agentes',
    ok: meta.registroErros.length === 0,
    detalhe: meta.registroErros.length ? meta.registroErros.join('; ') : `${agents.length} agentes (${[...new Set(agents.map(a => a.origem))].join(', ')})`,
  })
  const keyState = (v: unknown) => (typeof v === 'string' && v !== '' ? 'definida' : 'não definida')
  items.push({ nome: 'Segredos', ok: true, detalhe: `chaves no armazenamento seguro: GarraIA ${keyState(S.options.garraiaApiKey)}, Hermes ${keyState(S.options.hermesApiKey)}; nada de chave em arquivo do MOD` })
  items.push({ nome: 'Superfície', ok: true, detalhe: meta.surface })
  const now = await $.clock.now()
  await update($, diagAtom, () => ({ em: now, itens: items }))
  return items
}

const diagText = (items: readonly GarraDiagItem[]) =>
  [`${MARCA} · diagnóstico`, ...items.map(i => `${i.ok === true ? '✅' : i.ok === false ? '❌' : '➖'} ${i.nome}: ${i.detalhe}`)].join('\n')

async function statusText_($: EngineInterface) {
  const [agents, health, prefs, exts, meta, history] = await Promise.all([
    read($, agentsAtom),
    read($, healthAtom),
    read($, prefsAtom),
    read($, extsAtom),
    read($, metaAtom),
    read($, historyAtom),
  ])
  return formatStatus({ version: VERSION, claudeVersion: meta.claudeVersion, agents, health, prefs, exts, historico: history.length })
}


async function addAgent($: EngineInterface, raw: unknown): Promise<string> {
  const v = validateAgent(raw)
  if (!v.ok) return `Agente recusado: ${v.erro}`
  const stored = await $.store.get(STORE.agents)
  const list = Array.isArray(stored) ? stored.filter(a => !(typeof a === 'object' && a !== null && (a as { id?: unknown }).id === v.agent.id)) : []
  await $.store.set(STORE.agents, [...list, v.agent])
  const agents = await loadAgents($)
  const added = agents.find(a => a.id === v.agent.id)
  if (added) {
    const h = await probeAgent($, S.options, added, await toolNameSet($), S.cwd)
    await update($, healthAtom, held => ({ ...held, [added.id]: h }))
    await refreshStatus($)
    return `✅ Agente ${added.nome} (${added.id}) cadastrado: ${statusText(h.status)} via ${h.via} — ${h.detalhe}`
  }
  return 'Agente salvo, mas não apareceu no catálogo.'
}

async function removeAgent($: EngineInterface, id: string): Promise<string> {
  const stored = await $.store.get(STORE.agents)
  const list = Array.isArray(stored) ? stored : []
  const kept = list.filter(a => !(typeof a === 'object' && a !== null && (a as { id?: unknown }).id === id))
  if (kept.length === list.length) {
    const agents = await read($, agentsAtom)
    const found = agents.find(a => a.id === id)
    if (found?.origem === 'padrão') return `${found.nome} é um agente padrão: desative-o pelo arquivo ~/.claude/garra-mod/agentes.json com "ativo": false.`
    if (found?.origem === 'usuário (arquivo)') return `${found.nome} vem de ~/.claude/garra-mod/agentes.json: remova-o do arquivo.`
    return `Nenhum agente cadastrado por comando com id "${id}".`
  }
  await $.store.set(STORE.agents, kept)
  await loadAgents($)
  await refreshStatus($)
  return `Agente "${id}" removido do catálogo.`
}


// Toda delegação passa por uma pessoa, em qualquer modo de permissão:
// 1) aprovação: a caixa de permissão do Claude Code, ou, quando ela não aparece
//    (bypassPermissions, aprovação automática), a pergunta do próprio MOD;
// 2) confirmação de riscos, SEMPRE, mesmo depois de aprovada; é só nela que a
//    pessoa pode escolher o modo skip (ex.: --yolo do Hermes). O modelo não pede skip.
// Sem pessoa para responder (claude -p, pergunta dispensada), nada é executado.
// `decisao` registra como foi aprovada e o que a pessoa escolheu, para o resultado e o histórico.
type Decision = { kind: 'executar'; skip: boolean; decisao: string } | { kind: 'parar'; text: string }

async function confirmDelegation($: EngineInterface, agent: GarraAgentEntry, input: Record<string, unknown>, tarefa: string): Promise<Decision> {
  const key = delegationKey(input)
  const now = await $.clock.now()
  const seen = S.aprovadas.get(key)
  S.aprovadas.delete(key)
  const approvedByDialog = seen !== undefined && now - seen <= 10 * 60_000
  if (!approvedByDialog) {
    const answer = await $.ui.ask(TXT.aprovarPergunta(agent.nome, oneLine(tarefa, 160)), { header: 'Garra MOD', options: [TXT.aprovar, TXT.recusar] }).catch(() => null)
    if (answer === null) return { kind: 'parar', text: TXT.semHumano(agent.nome) }
    if (answer !== TXT.aprovar) return { kind: 'parar', text: `${TXT.recusada(agent.nome)} (resposta: ${oneLine(answer, 60)})` }
  }
  const aprovacao = approvedByDialog ? TXT.aprovacaoCaixa : TXT.aprovacaoPergunta
  const skipArgs = (agent.delegar ?? []).flatMap(t => (t.type === 'process' ? (t.skipArgs ?? []) : []))
  const options = skipArgs.length > 0 ? [TXT.executarSeguro, TXT.executarSkip, TXT.cancelar] : [TXT.executarSeguro, TXT.cancelar]
  const risk = await $.ui.ask(TXT.riscosPergunta(agent.nome, [...new Set(skipArgs)].join(' ')), { header: 'Riscos', options }).catch(() => null)
  if (risk === null) return { kind: 'parar', text: TXT.semHumano(agent.nome) }
  if (risk === TXT.executarSeguro) return { kind: 'executar', skip: false, decisao: TXT.decisao(aprovacao, risk) }
  if (risk === TXT.executarSkip && skipArgs.length > 0) return { kind: 'executar', skip: true, decisao: TXT.decisao(aprovacao, risk) }
  return { kind: 'parar', text: `${TXT.canceladaRiscos(agent.nome)} (${TXT.decisao(aprovacao, oneLine(risk, 60))})` }
}

// /garra-agentes: o nome também é o da skill garra-agentes, que o Claude Code
// registra primeiro. O MOD responde quando é a pessoa quem digita o comando.
async function agentesCommand($: EngineInterface, argsRaw: string): Promise<{ text: string }> {
const args = argsRaw.trim()
  const words = args === '' ? [] : args.split(/\s+/)
  const sub = words[0] ?? 'listar'
  const rest = words.slice(1)
  const tail = args.slice(sub.length).trim()
  if (sub === 'verificar') await probeAll($)
  else if (sub === 'adicionar') {
    let raw: unknown
    try {
      raw = JSON.parse(tail)
    } catch {
      return { text: 'Use: /garra-agentes adicionar {"id":"meu-agente","nome":"Meu Agente","consulta":[{"type":"process","argv":["meu-cli","ask"],"output":"text"}]}' }
    }
    return { text: await addAgent($, raw) }
  } else if (sub === 'remover') return { text: await removeAgent($, rest[0] ?? '') }
  else if (sub === 'padrao' || sub === 'padrão') {
    const agent = await resolveAgent($, rest[0] ?? '')
    if (typeof agent === 'string') return { text: agent }
    if (agent.tipo === 'principal') return { text: 'O agente padrão de consulta precisa ser externo.' }
    await savePrefs($, p => ({ ...p, agentePadrao: agent.id }))
    return { text: `Agente padrão de consulta: ${agent.nome}.` }
  } else if (sub !== 'listar') {
    return { text: 'Use: /garra-agentes [listar|verificar|adicionar {json}|remover <id>|padrao <id>]' }
  }
  const [agents, health, prefs] = await Promise.all([read($, agentsAtom), read($, healthAtom), read($, prefsAtom)])
  const path = await agentFilePath($)
  return { text: `${formatAgents(agents, health, prefs)}\n\nCatálogo extensível: ${path || '~/.claude/garra-mod/agentes.json'} ou /garra-agentes adicionar {json}.` }
}

export const register: Register = (on, options) => {
  S.options = options

  // ---------------------------------------------------------------- sessão

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    S.cwd = e.cwd
    await loadAll($)
    for (const command of COMMANDS) {
      await $.command.register({ ...command }).catch(error => $.ui.log(`não registrou /${command.name}: ${String(error)}`, { to: 'debug' }))
    }
    await $.tool.register({
      name: 'garra_consultar',
      description:
        'Consulta um agente externo do Garra MOD (GarraIA, Hermes ou outro do catálogo) e devolve a resposta real dele, identificada. Somente leitura: o agente só responde texto. Mande apenas o contexto necessário (trechos, nunca arquivos inteiros, histórico ou segredos).',
      inputSchema: {
        type: 'object',
        properties: {
          agente: { type: 'string', description: 'id do agente: "garraia", "hermes" ou outro do catálogo (garra_agentes → listar)' },
          pergunta: { type: 'string', description: 'o pedido ao agente, em português' },
          contexto: { type: 'string', description: 'trechos de código, logs ou dados necessários (opcional)' },
          timeout_s: { type: 'integer', minimum: 5, maximum: 600, description: 'prazo em segundos (opcional)' },
        },
        required: ['agente', 'pergunta'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'garra_paralelo',
      description:
        'Faz a mesma consulta a vários agentes externos ao mesmo tempo (padrão: GarraIA e Hermes), de forma independente, e devolve as respostas identificadas para o Claude comparar e consolidar. Somente leitura; respeita o limite de concorrência.',
      inputSchema: {
        type: 'object',
        properties: {
          agentes: { type: 'array', items: { type: 'string' }, description: 'ids dos agentes; padrão ["garraia", "hermes"]' },
          pergunta: { type: 'string' },
          contexto: { type: 'string' },
          timeout_s: { type: 'integer', minimum: 5, maximum: 600 },
        },
        required: ['pergunta'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'garra_delegar',
      description:
        'Delega uma TAREFA a um agente externo com ferramentas (shell, arquivos, git, web) que agem direto nesta máquina, fora das permissões do Claude Code. Uma pessoa sempre aprova e depois confirma os riscos, em qualquer modo de permissão; só ela pode escolher o modo skip. Use só quando a pessoa pedir delegação explícita; para perguntas use garra_consultar.',
      inputSchema: {
        type: 'object',
        properties: {
          agente: { type: 'string', description: '"garraia" ou "hermes" (ou outro com permissão de delegar)' },
          tarefa: { type: 'string', description: 'o que o agente deve fazer, com critérios de conclusão' },
          diretorio: { type: 'string', description: 'diretório de trabalho (padrão: o da sessão)' },
        },
        required: ['agente', 'tarefa'],
      },
      isDeferred: true,
    })
    await $.tool.register({
      name: 'garra_agentes',
      description:
        'Catálogo de agentes do Garra MOD: listar, verificar conexões reais, adicionar (definição JSON com transportes mcp, process ou openai-http) ou remover agentes cadastrados por comando.',
      inputSchema: {
        type: 'object',
        properties: {
          acao: { type: 'string', enum: ['listar', 'verificar', 'adicionar', 'remover'] },
          agente: { type: 'object', description: 'definição do agente para "adicionar" (veja docs/agentes.md)' },
          id: { type: 'string', description: 'id do agente para "remover"' },
        },
        required: ['acao'],
      },
      isDeferred: true,
    })
    await refreshMeta($, e.surface)
    // Logo oficial do GarraRUST (MIT), desenhado onde o terminal mostra imagens.
    const logo = await $.fs.read(`${$.plugin.root}/assets/garraia-logo.png`, { as: 'bytes' }).catch(() => null)
    S.logo = logo && typeof logo === 'object' && 'base64' in logo ? logo.base64 : null
    const prefs = await read($, prefsAtom)
    if (e.isInteractive && prefs.boasVindas) await $.ui.place({ id: PLACE }).catch(() => undefined)
    // A verificação real dos agentes corre num despacho próprio.
    $.clock.after(50, () => void probeAll($))
    return started
  })

  // ---------------------------------------------------------------- personalidade

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const prefs = await read($, prefsAtom)
    if (!prefs.personalidade) return result
    // Registra uma vez por sessão, para o /garra-diagnostico.
    if ((await read($, personaAtom)) === 0) {
      const now = await $.clock.now()
      await update($, personaAtom, () => now)
    }
    if (result.sections.some(s => s.id === PERSONALIDADE_ID)) return result
    return { sections: [...result.sections, { id: PERSONALIDADE_ID, text: PERSONALIDADE, scope: 'session' as const }] }
  })

  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    if (typeof e.value === 'string') {
      const isLight = e.value.includes('light')
      await update($, metaAtom, m => ({ ...m, isLight }))
    }
    return result
  }).catch(($, e, next) => next(e))

  // ---------------------------------------------------------------- ferramentas

  on('tool.call', { tool: 'mcp__garra-mod__garra_consultar' }, async ($, e) => {
    const input = e as unknown as Record<string, unknown>
    const agent = await resolveAgent($, str(input.agente))
    if (typeof agent === 'string') return { result: agent }
    const pergunta = str(input.pergunta)
    if (pergunta.trim() === '') return { result: 'Informe a pergunta ao agente.' }
    const timeoutS = typeof input.timeout_s === 'number' ? input.timeout_s : undefined
    const out = await runCall($, agent, 'consulta', frame(pergunta, str(input.contexto)), timeoutS !== undefined ? { timeoutS } : {})
    return { result: formatOutcome(agent, 'consulta', out) }
  })

  on('tool.call', { tool: 'mcp__garra-mod__garra_paralelo' }, async ($, e) => {
    const input = e as unknown as Record<string, unknown>
    const ids = Array.isArray(input.agentes) && input.agentes.length > 0 ? input.agentes.map(String) : ['garraia', 'hermes']
    const pergunta = str(input.pergunta)
    if (pergunta.trim() === '') return { result: 'Informe a pergunta aos agentes.' }
    const resolved = await Promise.all([...new Set(ids)].map(id => resolveAgent($, id)))
    const problems = resolved.filter((r): r is string => typeof r === 'string')
    const agents = resolved.filter((r): r is GarraAgentEntry => typeof r !== 'string' && r.tipo !== 'principal')
    if (agents.length === 0) return { result: problems.join('\n') || 'Nenhum agente externo informado.' }
    const message = frame(pergunta, str(input.contexto))
    const timeoutS = typeof input.timeout_s === 'number' ? input.timeout_s : undefined
    const outs = await Promise.all(agents.map(agent => runCall($, agent, 'consulta', message, timeoutS !== undefined ? { timeoutS } : {})))
    const sections = agents.map((agent, i) => `## ${agent.icone ?? '•'} ${agent.nome}\n\n${formatOutcome(agent, 'consulta', outs[i] as CallOutcome)}`)
    const ok = outs.filter(o => o.ok).length
    return {
      result: [
        `Garra MOD: ${ok} de ${agents.length} agentes responderam de forma independente (nenhum viu a resposta do outro).`,
        ...problems,
        ...sections,
        '---\nCompare as respostas: pontos em comum, divergências e qual conclusão você (Claude) adota, dizendo de quem veio cada ideia.',
      ].join('\n\n'),
    }
  })

  on('tool.call', { tool: 'mcp__garra-mod__garra_delegar' }, async ($, e) => {
    const input = e as unknown as Record<string, unknown>
    const agent = await resolveAgent($, str(input.agente))
    if (typeof agent === 'string') return { result: agent }
    const tarefa = str(input.tarefa)
    if (tarefa.trim() === '') return { result: 'Descreva a tarefa a delegar.' }
    let dir = S.cwd
    const wanted = str(input.diretorio)
    if (wanted !== '') {
      const stat = await $.fs.stat(wanted, { resolve: true }).catch(() => null)
      if (stat === null || stat.kind !== 'dir') return { result: `Diretório inválido para a delegação: ${wanted}` }
      dir = stat.realPath ?? wanted
    }
    const decision = await confirmDelegation($, agent, input, tarefa)
    if (decision.kind !== 'executar') return { result: decision.text }
    const out = await runCall($, agent, 'delegar', frame(tarefa), { dir, skip: decision.skip, decisao: decision.decisao })
    return { result: formatOutcome(agent, 'delegar', out, decision.decisao) }
  })

  // Registra quando a caixa de permissão da delegação é mostrada à pessoa.
  on('classic.PermissionRequest', async ($, e, next) => {
    if (e.tool_name === 'mcp__garra-mod__garra_delegar') {
      S.aprovadas.set(delegationKey((e.tool_input ?? {}) as Record<string, unknown>), await $.clock.now())
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Delegar dá ferramentas a outro agente: a pessoa aprova cada vez, qualquer que seja o modo.
  on('tool.check', { tool: 'mcp__garra-mod__garra_delegar' }, async ($, e, next) => {
    const below = await next(e)
    if (below.decision === 'deny') return below
    const input = (e.input ?? {}) as Record<string, unknown>
    const agents = await read($, agentsAtom)
    const nome = findAgent(agents, str(input.agente))?.nome ?? str(input.agente)
    return { decision: 'ask', reason: TXT.delegarMotivo(nome) }
  }).catch(($, e, next) => ({ decision: 'ask', reason: TXT.delegarMotivo('o agente externo') }))

  on('tool.check', { tool: 'mcp__garra-mod__garra_agentes' }, async ($, e, next) => {
    const below = await next(e)
    const acao = str(((e.input ?? {}) as Record<string, unknown>).acao)
    if (below.decision === 'deny' || (acao !== 'adicionar' && acao !== 'remover')) return below
    return { decision: 'ask', reason: TXT.registroMotivo }
  }).catch(($, e, next) => ({ decision: 'ask', reason: TXT.registroMotivo }))

  on('tool.call', { tool: 'mcp__garra-mod__garra_agentes' }, async ($, e) => {
    const input = e as unknown as Record<string, unknown>
    const acao = str(input.acao)
    if (acao === 'adicionar') return { result: await addAgent($, input.agente) }
    if (acao === 'remover') return { result: await removeAgent($, str(input.id)) }
    if (acao === 'verificar') await probeAll($)
    const [agents, health, prefs] = await Promise.all([read($, agentsAtom), read($, healthAtom), read($, prefsAtom)])
    return { result: formatAgents(agents, health, prefs) }
  })

  // ---------------------------------------------------------------- comandos

  on('command.run', { command: 'garra' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const tab = TABS.find(t => t.id === arg || t.nome.toLowerCase() === arg || (arg === 'diagnóstico' && t.id === 'diagnostico'))
    if (tab) await update($, tabAtom, () => tab.id)
    await refreshMeta($)
    const opened = await $.ui.open({ id: PANE, title: '🇧🇷 Garra MOD', focus: true })
    if (!opened.isPlaced) return { text: await statusText_($) }
    return { text: `${MARCA}: painel aberto${tab ? ` na seção ${tab.nome}` : ''}. Teclas 1–9 trocam de seção; Esc devolve o teclado ao prompt.` }
  })

  on('command.run', { command: 'garra-status' }, async $ => {
    await refreshMeta($)
    return { text: await statusText_($) }
  })

  // A skill garra-agentes ocupa /garra-agentes: quando a PESSOA digita o comando
  // (terminal, claude -p ou Remote Control) o MOD responde direto, sem gastar um
  // turno do modelo; qualquer outra origem segue para a skill.
  on('command.run', { command: 'garra-mod:garra-agentes' }, async ($, e, next) =>
    e.origin.kind === 'composer' || e.origin.kind === 'sdk' || e.origin.kind === 'bridge' ? agentesCommand($, e.args) : next(e),
  ).catch(($, e, next) => next(e))
  on('command.run', { command: 'garra-agentes' }, async ($, e, next) =>
    e.origin.kind === 'composer' || e.origin.kind === 'sdk' || e.origin.kind === 'bridge' ? agentesCommand($, e.args) : next(e),
  ).catch(($, e, next) => next(e))

  on('command.run', { command: 'garra-consultar' }, async ($, e) => {
    const args = e.args.trim()
    if (args === '') return { text: 'Use: /garra-consultar <agente> <pergunta>  (ex.: /garra-consultar hermes quais os riscos desta abordagem?)' }
    const [first = '', ...rest] = args.split(/\s+/)
    const agents = await read($, agentsAtom)
    const prefs = await read($, prefsAtom)
    let agent = findAgent(agents, first)
    let pergunta = rest.join(' ')
    if (!agent || agent.tipo === 'principal') {
      agent = findAgent(agents, prefs.agentePadrao)
      pergunta = args
    }
    if (!agent) return { text: TXT.semAgente(prefs.agentePadrao) }
    if (pergunta.trim() === '') return { text: `Qual a pergunta para ${agent.nome}?` }
    const out = await runCall($, agent, 'consulta', frame(pergunta))
    return { text: formatOutcome(agent, 'consulta', out) }
  })

  on('command.run', { command: 'garra-tema' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'brasil' || arg === SKIN_NAME || arg === 'aplicar') return { text: await applyBrasil($) }
    if (arg === 'anterior') return { text: await restoreSkin($) }
    if (!(await skinsAvailable($))) return { text: TXT.temaSemSkins }
    if (arg === 'salvar') {
      const res = await saveGarraSkin($, false)
      return { text: res.ok ? `Tema "${SKIN_NAME}" salvo no Claude Skins (sem aplicar).` : `Falhou: ${oneLine(res.text, 200)}` }
    }
    if (arg !== '') {
      const res = await skinsCall($, { action: 'apply', name: arg })
      return { text: res.ok ? `Tema "${arg}" aplicado pelo Claude Skins.` : `O Skins recusou "${arg}": ${oneLine(res.text, 200)}` }
    }
    const current = await skinsCurrent($)
    return {
      text: [
        `🎨 Tema atual no Claude Skins: ${current?.current ?? 'desconhecido'}`,
        `Garra Brasil salvo: ${current?.made.includes(SKIN_NAME) ? 'sim' : 'não'}`,
        'Use: /garra-tema brasil · /garra-tema anterior · /garra-tema salvar · /garra-tema <skin> · /skin (ajuste fino)',
        'Modo claro e escuro: o Skins deriva a variante clara sozinho quando o tema do Claude Code é claro.',
      ].join('\n'),
    }
  })

  on('command.run', { command: 'garra-plugins' }, async $ => {
    await refreshMeta($)
    const exts = await read($, extsAtom)
    return {
      text: [
        formatExts(exts),
        '',
        'Integração: o tema vive no Claude Skins; o progresso e as faixas dos subagentes (inclusive garra-mod:garraia e garra-mod:hermes) aparecem no Plan Progress; o Next Steps sugere próximos passos com rótulos em pt-BR; o You Should Know é o oficial da Anthropic — o Garra MOD não o imita.',
      ].join('\n'),
    }
  })

  on('command.run', { command: 'garra-config' }, async ($, e) => {
    const [key = '', value = ''] = e.args.trim().split(/\s+/)
    const on_ = (v: string) => ['on', 'sim', 'ligar', 'ligado', 'true', '1'].includes(v.toLowerCase())
    const off = (v: string) => ['off', 'nao', 'não', 'desligar', 'desligado', 'false', '0'].includes(v.toLowerCase())
    const bools: Record<string, 'personalidade' | 'boasVindas' | 'statusLine' | 'localizarNextSteps'> = {
      personalidade: 'personalidade',
      'boas-vindas': 'boasVindas',
      abertura: 'boasVindas',
      status: 'statusLine',
      'next-steps': 'localizarNextSteps',
    }
    if (key === 'idioma') return { text: await setLanguage($) }
    const boolKey = bools[key]
    if (boolKey) {
      if (!on_(value) && !off(value)) return { text: `Use: /garra-config ${key} on|off` }
      await savePrefs($, p => ({ ...p, [boolKey]: on_(value) }))
      const note = boolKey === 'personalidade' ? ' (vale a partir da próxima conversa ou compactação)' : ''
      return { text: `${key}: ${on_(value) ? 'ligado' : 'desligado'}${note}.` }
    }
    if (key === 'prazo' || key === 'paralelo') {
      const n = Number(value)
      const ok = Number.isFinite(n) && (key === 'prazo' ? n >= 5 && n <= 1800 : n >= 1 && n <= 8)
      if (!ok) return { text: key === 'prazo' ? 'Use: /garra-config prazo <5–1800 segundos>' : 'Use: /garra-config paralelo <1–8>' }
      await savePrefs($, p => (key === 'prazo' ? { ...p, timeoutS: Math.round(n) } : { ...p, concorrencia: Math.round(n) }))
      return { text: `${key === 'prazo' ? 'Prazo máximo das consultas' : 'Consultas paralelas'}: ${Math.round(n)}${key === 'prazo' ? ' s' : ''}.` }
    }
    if (key === 'padrao' || key === 'padrão') {
      const agent = await resolveAgent($, value)
      if (typeof agent === 'string' || agent.tipo === 'principal') return { text: typeof agent === 'string' ? agent : 'Escolha um agente externo.' }
      await savePrefs($, p => ({ ...p, agentePadrao: agent.id }))
      return { text: `Agente padrão de consulta: ${agent.nome}.` }
    }
    const p = await read($, prefsAtom)
    const meta = await read($, metaAtom)
    return {
      text: [
        '⚙️ Preferências do Garra MOD (guardadas entre sessões)',
        `personalidade ${p.personalidade ? 'on' : 'off'} · boas-vindas ${p.boasVindas ? 'on' : 'off'} · status ${p.statusLine ? 'on' : 'off'} · next-steps ${p.localizarNextSteps ? 'on' : 'off'}`,
        `padrao ${p.agentePadrao} · prazo ${p.timeoutS} s (máximo das consultas) · paralelo ${p.concorrencia}`,
        `idioma do Claude Code: ${meta.idioma || 'padrão'}  (/garra-config idioma → português (Brasil))`,
        'Mude com /garra-config <chave> <valor>, ou pelo painel: /garra config. Chaves de API: /config → garra-mod.',
      ].join('\n'),
    }
  })

  on('command.run', { command: 'garra-diagnostico' }, async ($, e) => {
    const completo = /completo|real|full/i.test(e.args)
    return { text: diagText(await runDiag($, completo)) }
  })

  // ---------------------------------------------------------------- interface

  on('ui.render', { component: 'Placed' }, async ($, e, next) => {
    if (e.props.plugin !== 'garra-mod' || e.props.id !== PLACE) return next(e)
    const [agents, health, exts, meta] = await Promise.all([read($, agentsAtom), read($, healthAtom), read($, extsAtom), read($, metaAtom)])
    const ui = $.ui.resolve(e)
    let logo: RenderElement | undefined
    if (e.surface === 'terminal' && S.logo) {
      const { Image } = $.ui.resolve(e) as Elements['terminal']
      logo = <Image source={{ png: S.logo }} columns={3} rows={1} alt="🦜" />
    }
    return welcomeCard(ui, { cores: cores(meta.isLight), agents, health, exts, version: VERSION, columns: e.viewport?.columns ?? 80, ...(logo ? { logo } : {}) })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [tab, agents, health, history, running, prefs, diag, exts, skills, tema, meta] = await Promise.all([
      read($, tabAtom),
      read($, agentsAtom),
      read($, healthAtom),
      read($, historyAtom),
      read($, runningAtom),
      read($, prefsAtom),
      read($, diagAtom),
      read($, extsAtom),
      read($, skillsAtom),
      read($, temaAtom),
      read($, metaAtom),
    ])
    const ui = $.ui.resolve(e)
    return panel(
      ui,
      { cores: cores(meta.isLight), tab, version: VERSION, claudeVersion: meta.claudeVersion, agents, health, history, running, prefs, diag, exts, skills, tema, idioma: meta.idioma, columns: e.props.bodyColumns },
      {
        tab: (t: GarraTab) => update($, tabAtom, () => t),
        probe: () => probeAll($),
        setDefault: id => savePrefs($, p => ({ ...p, agentePadrao: id })),
        applyTheme: () => applyBrasil($),
        restoreTheme: () => restoreSkin($),
        toggle: key => savePrefs($, p => ({ ...p, [key]: !p[key] })),
        step: (key, delta) =>
          savePrefs($, p => (key === 'timeoutS' ? { ...p, timeoutS: Math.min(1800, Math.max(5, p.timeoutS + delta)) } : { ...p, concorrencia: Math.min(8, Math.max(1, p.concorrencia + delta)) })),
        idioma: () => setLanguage($).then(msg => $.ui.toast(msg)),
        diag: () => runDiag($, false),
      },
    )
  })

  // Indicador discreto dos agentes no fim da linha de dicas sob o prompt.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const prefs = await read($, prefsAtom)
    if (!prefs.statusLine) return next(e)
    const [agents, health] = await Promise.all([read($, agentsAtom), read($, healthAtom)])
    const parts = agents
      .filter(a => a.tipo !== 'principal' && a.ativo)
      .slice(0, 4)
      .map(a => `${a.nome} ${STATUS_ICONE[healthOf(a, health).status]}`)
    const mine = `🇧🇷 Garra: ${parts.join(' ')}`
    const tail = e.props.tail ? `${e.props.tail} · ${mine}` : mine
    return next({ ...e, props: { ...e.props, tail } })
  })

  // Next Steps: rótulos em pt-BR, sem tocar nos botões nem nos atalhos dele.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const prefs = await read($, prefsAtom)
    if (!prefs.localizarNextSteps || below === undefined || below === null) return below
    return relabelNextSteps(below)
  })
}

const NEXT_STEPS_LABELS: Record<string, string> = {
  'next:': '🦜 GarraIA sugere:',
  'next steps…': '🦜 GarraIA pensando nos próximos passos…',
}

// Troca só textos exatos do Next Steps; qualquer outra coisa volta intacta.
function relabelNextSteps<T>(node: T): T {
  if (Array.isArray(node)) {
    let changed = false
    const out = node.map(child => {
      const next = relabelNextSteps(child)
      if (next !== child) changed = true
      return next
    })
    return (changed ? out : node) as T
  }
  if (typeof node !== 'object' || node === null) return node
  const el = node as { type?: unknown; children?: unknown }
  if (!Array.isArray(el.children)) return node
  if (el.type === 'Text' && el.children.length === 1 && typeof el.children[0] === 'string') {
    const label = NEXT_STEPS_LABELS[el.children[0]]
    return label === undefined ? node : ({ ...el, children: [label] } as T)
  }
  if (el.type !== 'Box') return node
  const children = relabelNextSteps(el.children)
  return children === el.children ? node : ({ ...el, children } as T)
}
