// Testes do Garra MOD carregado pelo motor do Claude Code. Os hooks deste
// arquivo ficam ABAIXO do MOD e fazem o papel do motor e dos serviços externos
// (mocks isolados). As chamadas reais estão documentadas em docs/testes.md.

import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import { FRASES_ESPERA } from '../src/localization/frases'
import { SKIN_SPINNER } from '../src/themes/garra-brasil'

const ENABLED = {
  'skins@hellosverre-mods': true,
  'plan-progress@zycck-mods': true,
  'next-steps@claude-community': true,
  'cc-plugin-you-should-know@builtin': true,
}

type World = {
  mcpUp?: boolean
  cli?: boolean
  sent?: Array<{ server: string; tool: string; args: Record<string, unknown> }>
  store?: Readonly<Record<string, unknown>>
  skins?: boolean
  // Arquivos que o MOD enxerga ($.fs.exists/read); o resto não existe.
  files?: Readonly<Record<string, string>>
}

function ambiente(on: On, world: World = {}) {
  mock.store(on, world.store)
  mock.env(on, { HOME: '/home/teste' })
  const clock = mock.clock(on, { now: 1_800_000_000_000 })
  const tools = [
    ...(world.skins === false ? [] : [{ name: 'mcp__skins__design', description: '', mcp: true }]),
    { name: 'mcp__plan-progress__plan_progress', description: '', mcp: true },
    ...(world.mcpUp === false ? [] : [{ name: 'mcp__garraia__garra_ask', description: '', mcp: true }]),
  ]
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('tool.register', (_, e) => ({ value: { tool: `mcp__garra-mod__${e.name}` } }))
  on('tool.list', () => ({ value: tools }))
  on('command.list', () => ({ value: [] }))
  on('settings.read', () => ({ value: { enabledPlugins: ENABLED, theme: 'dark' } }))
  on('session.version', () => ({ value: { version: '2.1.316' } }))
  on('config.list', () => ({ value: [] }))
  const files = world.files ?? {}
  on('fs.exists', (_, e) => ({ value: Object.keys(files).some(f => f === e.path || f.startsWith(`${e.path}/`)) }))
  on('fs.read', (_, e, next) => (e.path in files ? { value: files[e.path] ?? '' } : next(e)))
  on('ui.place', () => ({ value: { isPlaced: true, requestId: 'abertura-1' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('process.run', (_, e) =>
    world.cli === false ? { value: { exitCode: 127, stdout: '', stderr: 'não encontrado', isStdoutTruncated: false, isStderrTruncated: false } }
      : { value: { exitCode: 0, stdout: `${e.argv[0]} 1.0.0`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } },
  )
  on('http.fetch', () => {
    throw new Error('ECONNREFUSED')
  })
  on('mcp.call', (_, e) => {
    if (world.mcpUp === false) throw new Error('servidor não conectado')
    world.sent?.push({ server: e.server, tool: e.tool, args: e.args })
    return { value: { content: [{ type: 'text', text: JSON.stringify({ schema: 'garra.ask.v1', ok: true, answer: 'Olá, aqui é o GarraIA!', model: 'modelo-teste' }) }], isError: false } }
  })
  return clock
}

describe('carga e comandos', () => {
  test('/garra-status responde em pt-BR com os três agentes padrão', async ($, on) => {
    ambiente(on)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const out = await $.command.run({ command: 'garra-status', args: '' } as never)
    expect(out.text).toContain('Garra MOD para Claude Code')
    expect(out.text).toContain('Claude')
    expect(out.text).toContain('GarraIA')
    expect(out.text).toContain('Hermes')
    expect(out.text).toContain('Extensões')
  })

  test('a personalidade entra no prompt de sistema', async ($, on) => {
    ambiente(on)
    on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'base', scope: 'shared' as const }] }))
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const composed = await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as never)
    const section = composed.sections.find(s => s.id === 'garra-mod:personalidade')
    expect(section?.text).toContain('português do Brasil')
    expect(section?.scope).toBe('session')
  })

  // $.prompt.compose() chamado pelo próprio MOD não passa pelo hook dele:
  // o diagnóstico não pode procurar a seção ali (dava ❌ com ela no prompt).
  test('o diagnóstico confirma a personalidade depois de um prompt composto', async ($, on) => {
    ambiente(on)
    on('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'base', scope: 'shared' as const }] }))
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const antes = await $.command.run({ command: 'garra-diagnostico', args: '' } as never)
    expect(antes.text).not.toContain('❌ Personalidade pt-BR')
    await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as never)
    const depois = await $.command.run({ command: 'garra-diagnostico', args: '' } as never)
    expect(depois.text).toContain('✅ Personalidade pt-BR')
  })

  test('/garra-agentes adicionar recusa destino remoto sem https', async ($, on) => {
    ambiente(on)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const out = await $.command.run({ command: 'garra-agentes', args: 'adicionar {"id":"x","nome":"X","consulta":[{"type":"openai-http","baseUrl":"http://exemplo.com","model":"m"}]}', origin: { kind: 'composer' } } as never)
    expect(out.text).toContain('recusado')
  })

  test('/garra-agentes adicionar cadastra um agente novo sem mexer no código', async ($, on) => {
    ambiente(on)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const out = await $.command.run({ command: 'garra-agentes', args: 'adicionar {"id":"meu-cli","nome":"Meu CLI","consulta":[{"type":"process","argv":["meu-cli","ask"],"output":"text"}]}', origin: { kind: 'composer' } } as never)
    expect(out.text).toContain('Meu CLI')
    const list = await $.command.run({ command: 'garra-agentes', args: '', origin: { kind: 'composer' } } as never)
    expect(list.text).toContain('meu-cli')
  })
})

describe('ponte multiagente', () => {
  test('garra_consultar chama o GarraIA pelo MCP, identifica quem respondeu e remove segredos', async ($, on) => {
    const sent: World['sent'] = []
    ambiente(on, { sent })
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_consultar', agente: 'garraia', pergunta: 'Revise isto', contexto: 'const key = "sk-ant-abcdefghijklmnopqrstuvwxyz0123"' } as never)
    const text = String((res as { result?: unknown }).result)
    expect(text).toContain('🦜 GarraIA respondeu')
    expect(text).toContain('Olá, aqui é o GarraIA!')
    expect(text).toContain('modelo-teste')
    expect(sent.length).toBe(1)
    expect(sent[0]?.server).toBe('garraia')
    expect(String(sent[0]?.args.message)).not.toContain('abcdefghijklmnop')
    expect(text).toContain('removidos antes do envio')
  })

  // Sem provedor e modelo, o `garra mcp-server` usa o padrão embutido dele
  // (z-ai/glm-5.3-flash), não o que a pessoa configurou no GarraIA.
  const CHAVE_FALSA = ['sk', 'or', 'v1', 'q'.repeat(30)].join('-')
  const CONFIG_GARRAIA = [
    'llm:',
    '  openrouter:',
    '    provider: openrouter',
    '    model: anthropic/claude-haiku-5.5',
    `    api_key: ${CHAVE_FALSA}`,
    '    base_url: https://openrouter.ai/api/v1',
    'agent:',
    '  default_provider: openrouter',
  ].join('\n')

  test('consulta e delegação ao GarraIA levam o provedor e o modelo do config.yml dele', async ($, on) => {
    const sent: World['sent'] = []
    ambiente(on, { sent, files: { '/home/teste/.config/garraia/config.yml': CONFIG_GARRAIA } })
    on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => {
      const qs = (e as unknown as { questions: Array<{ question: string }> }).questions
      const q = qs[0]?.question ?? ''
      return { result: { questions: qs, answers: { [q]: q.startsWith('Aprovar') ? 'Aprovar' : 'Executar com segurança' } } } as never
    })
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    await $.tool.call({ tool: 'mcp__garra-mod__garra_consultar', agente: 'garraia', pergunta: 'oi' } as never)
    await $.tool.call({ tool: 'mcp__garra-mod__garra_delegar', agente: 'garraia', tarefa: 'liste os arquivos' } as never)
    expect(sent.map(s => s.tool)).toEqual(['garra_ask', 'garra_agent'])
    for (const s of sent) {
      expect(s.args.provider).toBe('openrouter')
      expect(s.args.model).toBe('anthropic/claude-haiku-5.5')
    }
    expect(sent[1]?.args.working_dir).toBe('/projeto')
    // Do config, só o provedor e o modelo saem; a chave nunca.
    expect(JSON.stringify(sent)).not.toContain(CHAVE_FALSA)
  })

  test('sem config.yml do GarraIA, provedor e modelo ficam de fora e vale o padrão dele', async ($, on) => {
    const sent: World['sent'] = []
    ambiente(on, { sent })
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    await $.tool.call({ tool: 'mcp__garra-mod__garra_consultar', agente: 'garraia', pergunta: 'oi' } as never)
    expect(sent.length).toBe(1)
    expect(Object.keys(sent[0]?.args ?? {}).sort()).toEqual(['message', 'timeout_secs'])
  })

  test('sem o servidor MCP, o GarraIA responde pela CLI (fallback real de transporte)', async ($, on) => {
    ambiente(on, { mcpUp: false })
    on('process.spawn', async function* () {
      yield { stream: 'stdout' as const, text: '{"schema":"garra.ask.v1","ok":true,"answer":"via CLI","model":"cli-model"}\n' }
      return { value: { code: 0, signal: null } }
    })
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_consultar', agente: 'garraia', pergunta: 'oi' } as never)
    const text = String((res as { result?: unknown }).result)
    expect(text).toContain('via CLI')
    expect(text).toContain('CLI garra')
  })

  test('agente offline não derruba nada: a resposta diz o motivo real', async ($, on) => {
    ambiente(on, { mcpUp: false })
    on('process.spawn', async function* () {
      throw new Error('ENOENT: garra')
    })
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_consultar', agente: 'garraia', pergunta: 'oi' } as never)
    const text = String((res as { result?: unknown }).result)
    expect(text).toContain('não respondeu')
    expect(text).toContain('indisponível')
  })

  test('garra_paralelo consulta vários agentes de forma independente', async ($, on) => {
    ambiente(on)
    on('process.spawn', async function* () {
      yield { stream: 'stdout' as const, text: 'Resposta do Hermes' }
      return { value: { code: 0, signal: null } }
    })
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_paralelo', pergunta: 'Compare' } as never)
    const text = String((res as { result?: unknown }).result)
    expect(text).toContain('2 de 2 agentes responderam')
    expect(text).toContain('GarraIA')
    expect(text).toContain('Resposta do Hermes')
  })

  test('delegar sempre pede aprovação da pessoa, mesmo com o modo liberando', async ($, on) => {
    ambiente(on)
    on('tool.check', () => ({ decision: 'allow' as const }))
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const verdict = await $.tool.check({ tool: 'mcp__garra-mod__garra_delegar', input: { agente: 'hermes', tarefa: 'rode os testes' } })
    expect(verdict.decision).toBe('ask')
    expect(verdict.reason).toContain('Hermes')
  })
})

describe('trava de delegação', () => {
  test('sem caixa de permissão e sem pessoa para responder, a delegação NÃO roda', async ($, on) => {
    let spawned = 0
    ambiente(on)
    on('tool.call', { tool: 'AskUserQuestion' }, () => ({ deny: 'ninguém para responder' }))
    on('process.spawn', async function* () {
      spawned += 1
      yield { stream: 'stdout' as const, text: 'não deveria rodar' }
      return { value: { code: 0, signal: null } }
    })
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_delegar', agente: 'hermes', tarefa: 'apague tudo' } as never)
    const text = String((res as { result?: unknown }).result)
    expect(text).toContain('NÃO executada')
    expect(spawned).toBe(0)
  })
})

describe('confirmação humana em duas etapas', () => {
  // A pessoa responde pelo diálogo de perguntas (AskUserQuestion), que o
  // modo bypass não pula. `escolhas` diz o que ela escolhe em cada etapa.
  function pessoa(on: On, escolhas: { aprovar?: string; riscos?: string }, asked: string[]) {
    on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => {
      const q = (e as unknown as { questions: Array<{ question: string }> }).questions[0]?.question ?? ''
      asked.push(q)
      const answer = q.startsWith('Aprovar') ? (escolhas.aprovar ?? 'Aprovar') : (escolhas.riscos ?? 'Cancelar')
      return { result: { questions: (e as unknown as { questions: unknown[] }).questions, answers: { [q]: answer } } } as never
    })
  }
  function hermesFalso(on: On, argvs: string[][]) {
    on('process.spawn', async function* (_, e) {
      argvs.push([...e.argv])
      yield { stream: 'stdout' as const, text: 'OK' }
      return { value: { code: 0, signal: null } }
    })
  }

  test('aprovada e "Executar com segurança": roda SEM --yolo, depois de duas perguntas', async ($, on) => {
    const asked: string[] = []
    const argvs: string[][] = []
    ambiente(on)
    pessoa(on, { aprovar: 'Aprovar', riscos: 'Executar com segurança' }, asked)
    hermesFalso(on, argvs)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_delegar', agente: 'hermes', tarefa: 'rode os testes' } as never)
    expect(String((res as { result?: unknown }).result)).toContain('Hermes concluiu a tarefa delegada')
    expect(String((res as { result?: unknown }).result)).toContain('escolha: Executar com segurança')
    expect(asked.length).toBe(2)
    expect(asked[1]).toContain('FORA das permissões do Claude Code')
    expect(argvs.length).toBe(1)
    expect(argvs[0]).not.toContain('--yolo')
  })

  test('skip só quando a pessoa escolhe "Executar em modo skip": aí entra --yolo', async ($, on) => {
    const asked: string[] = []
    const argvs: string[][] = []
    ambiente(on)
    pessoa(on, { aprovar: 'Aprovar', riscos: 'Executar em modo skip' }, asked)
    hermesFalso(on, argvs)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_delegar', agente: 'hermes', tarefa: 'rode os testes' } as never)
    expect(String((res as { result?: unknown }).result)).toContain('modo skip: --yolo')
    expect(argvs[0]).toContain('--yolo')
  })

  test('aprovada mas cancelada na confirmação de riscos: nada roda', async ($, on) => {
    const asked: string[] = []
    const argvs: string[][] = []
    ambiente(on)
    pessoa(on, { aprovar: 'Aprovar', riscos: 'Cancelar' }, asked)
    hermesFalso(on, argvs)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_delegar', agente: 'hermes', tarefa: 'apague a pasta' } as never)
    expect(String((res as { result?: unknown }).result)).toContain('cancelada na confirmação de riscos')
    expect(String((res as { result?: unknown }).result)).toContain('escolha: Cancelar')
    expect(argvs.length).toBe(0)
  })

  test('recusada na aprovação: nem chega à confirmação de riscos', async ($, on) => {
    const asked: string[] = []
    const argvs: string[][] = []
    ambiente(on)
    pessoa(on, { aprovar: 'Recusar' }, asked)
    hermesFalso(on, argvs)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_delegar', agente: 'hermes', tarefa: 'x' } as never)
    expect(String((res as { result?: unknown }).result)).toContain('recusada pela pessoa')
    expect(asked.length).toBe(1)
    expect(argvs.length).toBe(0)
  })

  test('o resultado e o histórico registram como foi aprovada e a opção escolhida', async ($, on) => {
    const asked: string[] = []
    ambiente(on)
    pessoa(on, { aprovar: 'Aprovar', riscos: 'Executar em modo skip' }, asked)
    hermesFalso(on, [])
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_delegar', agente: 'hermes', tarefa: 'rode os testes' } as never)
    const text = String((res as { result?: unknown }).result)
    // Logo abaixo do título, antes da resposta do agente.
    expect(text).toContain('concluiu a tarefa delegada (via CLI hermes (modo skip: --yolo)')
    expect(text).toContain('[Garra MOD: aprovação: pergunta do Garra MOD · escolha: Executar em modo skip]')
    expect(text.indexOf('escolha:')).toBeLessThan(text.indexOf('OK'))
    // A mesma decisão aparece no painel, seção Conversas.
    const ui = await $.ui.mount({
      plugin: 'garra-mod',
      surface: 'terminal',
      component: 'Pane',
      requestId: 'garra',
      props: { title: 'Garra', isFocused: true, bodyColumns: 160, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    } as never)
    await ui.press({ key: 'tab-conversas' })
    expect(await ui.find({ type: 'Text', text: /escolha: Executar em modo skip/ })).toBeDefined()
    await ui.unmount()
  })

  test('aprovada na caixa de permissão do Claude Code: só a pergunta de riscos aparece, e o resultado diz isso', async ($, on) => {
    const asked: string[] = []
    ambiente(on)
    pessoa(on, { riscos: 'Executar com segurança' }, asked)
    hermesFalso(on, [])
    on('classic.PermissionRequest', () => ({}) as never)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const input = { agente: 'hermes', tarefa: 'rode os testes' }
    const classic = ($ as unknown as { classic: Record<string, (e: unknown) => Promise<unknown>> }).classic
    await classic.PermissionRequest?.({ tool_name: 'mcp__garra-mod__garra_delegar', tool_input: input })
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_delegar', ...input } as never)
    const text = String((res as { result?: unknown }).result)
    expect(asked.length).toBe(1)
    expect(asked[0]).toContain('FORA das permissões do Claude Code')
    expect(text).toContain('[Garra MOD: aprovação: caixa de permissão do Claude Code · escolha: Executar com segurança]')
  })

  test('GarraIA não oferece modo skip (não existe para ele)', async ($, on) => {
    const offered: string[][] = []
    ambiente(on)
    on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => {
      const qs = (e as unknown as { questions: Array<{ question: string; options: Array<{ label: string }> }> }).questions
      const q = qs[0]
      offered.push((q?.options ?? []).map(o => o.label))
      const question = q?.question ?? ''
      return { result: { questions: qs, answers: { [question]: question.startsWith('Aprovar') ? 'Aprovar' : 'Cancelar' } } } as never
    })
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    await $.tool.call({ tool: 'mcp__garra-mod__garra_delegar', agente: 'garraia', tarefa: 'x' } as never)
    expect(offered.length).toBe(2)
    expect(offered[1]).toEqual(['Executar com segurança', 'Cancelar'])
  })
})

describe('modo bypass do Claude Code (--dangerously-skip-permissions)', () => {
  // O modo chega pelos eventos clássicos (permission_mode), como o Claude Code os emite.
  type Classic = Record<string, (e: unknown) => Promise<unknown>>
  // O Claude Code por baixo de tudo: registrado antes da primeira chamada a `$`.
  function classicos(on: On) {
    on('classic.UserPromptSubmit' as never, (() => ({})) as never)
    on('classic.PostToolUse' as never, (() => ({})) as never)
  }
  async function modo($: unknown, mode: string, evento = 'UserPromptSubmit') {
    const classic = ($ as { classic: Classic }).classic
    await classic[evento]?.({ prompt: 'x', tool_name: 'Bash', tool_input: {}, permission_mode: mode })
  }
  function perguntas(on: On, asked: string[], resposta: (q: string) => string | null) {
    on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => {
      const q = (e as unknown as { questions: Array<{ question: string }> }).questions[0]?.question ?? ''
      asked.push(q)
      const answer = resposta(q)
      if (answer === null) return { deny: 'ninguém para responder' }
      return { result: { questions: (e as unknown as { questions: unknown[] }).questions, answers: { [q]: answer } } } as never
    })
  }
  function agenteFalso(on: On, argvs: string[][]) {
    on('process.spawn', async function* (_, e) {
      argvs.push([...e.argv])
      yield { stream: 'stdout' as const, text: 'OK' }
      return { value: { code: 0, signal: null } }
    })
  }

  test('Hermes sob bypass: roda sem perguntas, com --yolo, e o resultado diz por quê', async ($, on) => {
    const asked: string[] = []
    const argvs: string[][] = []
    ambiente(on)
    classicos(on)
    perguntas(on, asked, () => 'Cancelar')
    agenteFalso(on, argvs)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    await modo($, 'bypassPermissions')
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_delegar', agente: 'hermes', tarefa: 'rode os testes' } as never)
    const text = String((res as { result?: unknown }).result)
    expect(asked.length).toBe(0)
    expect(argvs.length).toBe(1)
    expect(argvs[0]).toContain('--yolo')
    expect(text).toContain('modo skip: --yolo')
    expect(text).toContain('[Garra MOD: aprovação: modo bypass do Claude Code (sem perguntas) · escolha: Executar em modo skip]')
  })

  test('sob bypass, o tool.check não força a pergunta: vale a decisão do Claude Code', async ($, on) => {
    ambiente(on)
    classicos(on)
    on('tool.check', () => ({ decision: 'allow' as const }))
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    await modo($, 'bypassPermissions')
    const verdict = await $.tool.check({ tool: 'mcp__garra-mod__garra_delegar', input: { agente: 'hermes', tarefa: 'rode os testes' } })
    expect(verdict.decision).toBe('allow')
  })

  test('sob bypass e sem pessoa (claude -p): a delegação roda mesmo assim', async ($, on) => {
    const asked: string[] = []
    const argvs: string[][] = []
    ambiente(on)
    classicos(on)
    perguntas(on, asked, () => null)
    agenteFalso(on, argvs)
    await $.session.start({ cwd: '/projeto', surface: null, isInteractive: false })
    await modo($, 'bypassPermissions')
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_delegar', agente: 'hermes', tarefa: 'rode os testes' } as never)
    const text = String((res as { result?: unknown }).result)
    expect(text).not.toContain('NÃO executada')
    expect(text).toContain('Hermes concluiu a tarefa delegada')
    expect(argvs.length).toBe(1)
  })

  test('GarraIA sob bypass: roda sem perguntas e sem modo skip (ele não tem)', async ($, on) => {
    const asked: string[] = []
    ambiente(on)
    classicos(on)
    perguntas(on, asked, () => 'Cancelar')
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    await modo($, 'bypassPermissions')
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_delegar', agente: 'garraia', tarefa: 'x' } as never)
    const text = String((res as { result?: unknown }).result)
    expect(asked.length).toBe(0)
    expect(text).toContain('[Garra MOD: aprovação: modo bypass do Claude Code (sem perguntas) · escolha: Executar com segurança]')
  })

  test('saiu do bypass (outro modo informado depois): volta a perguntar duas vezes, sem --yolo', async ($, on) => {
    const asked: string[] = []
    const argvs: string[][] = []
    ambiente(on)
    classicos(on)
    perguntas(on, asked, q => (q.startsWith('Aprovar') ? 'Aprovar' : 'Executar com segurança'))
    agenteFalso(on, argvs)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    await modo($, 'bypassPermissions')
    await modo($, 'default', 'PostToolUse')
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_delegar', agente: 'hermes', tarefa: 'rode os testes' } as never)
    expect(String((res as { result?: unknown }).result)).toContain('escolha: Executar com segurança')
    expect(asked.length).toBe(2)
    expect(argvs[0]).not.toContain('--yolo')
  })
})

describe('tentativas que aparecem na resposta', () => {
  function hermesCli(on: On, ok = true) {
    on('process.spawn', async function* () {
      if (!ok) throw new Error('ENOENT: hermes')
      yield { stream: 'stdout' as const, text: 'Resposta do Hermes' }
      return { value: { code: 0, signal: null } }
    })
  }

  test('chave ausente no HTTP do Hermes não aparece na resposta', async ($, on) => {
    ambiente(on)
    hermesCli(on)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_consultar', agente: 'hermes', pergunta: 'oi' } as never)
    const text = String((res as { result?: unknown }).result)
    expect(text).toContain('Resposta do Hermes')
    expect(text).not.toContain('antes, sem sucesso')
    expect(text).not.toContain('chave não configurada')
  })

  test('erro real no HTTP (conexão recusada com chave definida) continua aparecendo', { options: { hermesApiKey: 'chave-de-teste' } }, async ($, on) => {
    ambiente(on)
    hermesCli(on)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_consultar', agente: 'hermes', pergunta: 'oi' } as never)
    const text = String((res as { result?: unknown }).result)
    expect(text).toContain('Resposta do Hermes')
    expect(text).toContain('antes, sem sucesso')
    expect(text).toContain('sem conexão')
  })

  test('se nada funciona, o erro final ainda cita a chave ausente', async ($, on) => {
    ambiente(on)
    hermesCli(on, false)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const res = await $.tool.call({ tool: 'mcp__garra-mod__garra_consultar', agente: 'hermes', pergunta: 'oi' } as never)
    const text = String((res as { result?: unknown }).result)
    expect(text).toContain('não respondeu')
    expect(text).toContain('chave não configurada')
  })
})

describe('interface', () => {
  test('cartão de abertura mostra a marca e os agentes em toda superfície', async ($, on) => {
    ambiente(on)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'garra-mod', surface, component: 'Placed', requestId: 'abertura-1', props: { id: 'abertura', plugin: 'garra-mod' } } as never)
      expect(await ui.find({ type: 'Text', text: /Garra MOD para Claude Code/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Hermes/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Extensões/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('painel /garra troca de seção pelos botões', async ($, on) => {
    ambiente(on)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const PANE = {
      plugin: 'garra-mod',
      component: 'Pane',
      requestId: 'garra',
      props: { title: 'Garra', isFocused: true, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
    } as const
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ ...PANE, surface } as never)
      expect(await ui.find({ type: 'Text', text: /Comandos/ })).toBeDefined()
      await ui.press({ key: 'tab-agentes' })
      expect(await ui.find({ type: 'Text', text: /capacidades/ })).toBeDefined()
      await ui.press({ key: 'tab-tema' })
      expect(await ui.find({ type: 'Text', text: /Garra Brasil/ })).toBeDefined()
      await ui.press({ key: 'tab-info' })
      await ui.unmount()
    }
  })

  test('Next Steps por dentro do Garra: "next:" em pt-BR e o resto intacto', {
    plugins: [{
      name: 'next-steps',
      tier: 'append',
      register(on) {
        on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
          const { Box, Text } = $.ui.resolve(e)
          return (
            <Box flexDirection="column">
              <Text dimColor>next:</Text>
              <Text>outro texto</Text>
            </Box>
          )
        })
      },
    }],
  }, async ($, on) => {
    ambiente(on)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({ plugin: 'next-steps', surface: 'terminal', ...FAIXA } as never)
    expect(await ui.find({ type: 'Text', text: '🦜 GarraIA sugere:' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /outro texto/ })).toBeDefined()
    await ui.unmount()
  })

  // A ordem real: o Next Steps vem antes do Garra em enabledPlugins e fica POR
  // FORA dele na cadeia, então o hook ui.render do Garra nunca vê o "next:".
  // O plugin falso desenha exatamente como o next-steps 1.0.0.
  test('Next Steps por fora do Garra: "next:" vira "🦜 GarraIA sugere:" e os botões seguem iguais', {
    plugins: [{
      name: 'next-steps',
      tier: 'prepend',
      register(on) {
        on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
          const below = await next(e)
          const { Box, Text, Button } = $.ui.resolve(e)
          return (
            <Box flexDirection="column">
              {below}
              <Box marginTop={1} />
              <Text dimColor>next:</Text>
              <Box key="s0" marginLeft={2}>
                <Button hotkey="1" plain label="Rodar a suíte de testes" onPress={() => undefined} />
              </Box>
              <Box marginLeft={2}>
                <Button hotkey="0" plain label="dismiss" onPress={() => undefined} />
              </Box>
            </Box>
          )
        })
      },
    }],
  }, async ($, on) => {
    ambiente(on)
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box />
    })
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'next-steps', surface, ...FAIXA } as never)
      expect(await ui.find({ type: 'Text', text: '🦜 GarraIA sugere:' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: 'next:' })).toBeUndefined()
      expect(await ui.find({ key: 'Rodar a suíte de testes' })).toBeDefined()
      expect(await ui.find({ key: 'dismiss' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('Next Steps por fora do Garra: "next steps…" vira "pensando nos próximos passos"', {
    plugins: [{
      name: 'next-steps',
      tier: 'prepend',
      register(on) {
        on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
          const below = await next(e)
          const { Box, Text } = $.ui.resolve(e)
          return (
            <Box flexDirection="column">
              {below}
              <Box marginTop={1}>
                <Text dimColor>next steps…</Text>
              </Box>
            </Box>
          )
        })
      },
    }],
  }, async ($, on) => {
    ambiente(on)
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box />
    })
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({ plugin: 'next-steps', surface: 'terminal', ...FAIXA } as never)
    expect(await ui.find({ type: 'Text', text: /GarraIA pensando nos próximos passos/ })).toBeDefined()
    await ui.unmount()
  })

  test('com /garra-config next-steps off guardado, o Next Steps fica como veio', {
    plugins: [{
      name: 'next-steps',
      tier: 'prepend',
      register(on) {
        on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
          const below = await next(e)
          const { Box, Text } = $.ui.resolve(e)
          return (
            <Box flexDirection="column">
              {below}
              <Text dimColor>next:</Text>
            </Box>
          )
        })
      },
    }],
  }, async ($, on) => {
    ambiente(on, { store: { prefs: { localizarNextSteps: false } } })
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box />
    })
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({ plugin: 'next-steps', surface: 'terminal', ...FAIXA } as never)
    expect(await ui.find({ type: 'Text', text: 'next:' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /GarraIA sugere/ })).toBeUndefined()
    await ui.unmount()
  })

  test('outro plugin que escreve "next:" na faixa não é traduzido', {
    plugins: [{
      name: 'outro-plugin',
      tier: 'prepend',
      register(on) {
        on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
          const below = await next(e)
          const { Box, Text } = $.ui.resolve(e)
          return (
            <Box flexDirection="column">
              {below}
              <Text>next:</Text>
            </Box>
          )
        })
      },
    }],
  }, async ($, on) => {
    ambiente(on)
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box } = $.ui.resolve(e)
      return <Box />
    })
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({ plugin: 'outro-plugin', surface: 'terminal', ...FAIXA } as never)
    expect(await ui.find({ type: 'Text', text: 'next:' })).toBeDefined()
    await ui.unmount()
  })
})

// O Claude Skins falso: responde "show" com o skin em uso e guarda cada "save",
// atualizando a lista como o Skins de verdade faria.
function skinsFalso(on: On, inicio: { current: string; spinner: string[] }, saves: Array<Record<string, unknown>>) {
  const atual = { ...inicio }
  on('tool.call', { tool: 'mcp__skins__design' }, (_, e) => {
    const input = e as unknown as Record<string, unknown>
    if (input.action === 'show') return { result: JSON.stringify({ ...atual, made: ['garra-brasil'] }) } as never
    saves.push(input)
    if (Array.isArray(input.spinner)) atual.spinner = input.spinner as string[]
    return { result: 'salvo' } as never
  })
}

// O Claude Code por baixo de tudo: desenha a palavra que chegou até ele.
function spinnerNativo(on: On) {
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{`spinner:${e.props.message ?? e.props.word}`}</Text>
  })
  on('turn.start', () => ({ turnId: 'turno' }) as never)
  on('turn.complete', () => ({ text: 'ok' }) as never)
}

const INICIO = { text: 'rode os testes', turnId: 'turno-1' }
const FIM = { turnId: 'turno-1', reason: 'answer', answer: 'feito', text: 'feito', durationMs: 30000, isAborted: false, category: null, explanation: null }

const SPINNER = { component: 'Spinner', requestId: 'spin', props: { word: 'Sauteing', message: null, suffix: '…', mode: 'responding' } }

async function palavra(ui: { find: (q: never) => Promise<{ text?: string } | undefined> }): Promise<string> {
  const achado = await ui.find({ type: 'Text', text: /^spinner:/ } as never)
  return (achado?.text ?? '').replace(/^spinner:/, '')
}

describe('tema garra-brasil', () => {
  const LISTA_ANTIGA = ['Pensando', 'Codando', 'Caprichando', 'Investigando', 'Arquitetando', 'Destrinchando', 'Lapidando', 'Batucando', 'Afinando', 'Garimpando']

  test('salvo com a lista antiga do MOD, passa a mostrar uma frase sorteada da coleção', async ($, on) => {
    const saves: Array<Record<string, unknown>> = []
    const clock = ambiente(on)
    skinsFalso(on, { current: 'garra-brasil', spinner: LISTA_ANTIGA }, saves)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    await clock.advance(200)
    expect(saves.length).toBe(1)
    const spinner = saves[0]?.spinner as string[]
    expect(spinner.length).toBe(1)
    expect(FRASES_ESPERA).toContain(spinner[0])
    expect(saves[0]?.name).toBe('garra-brasil')
    // Só a lista: paleta, base e rótulo ficam como a pessoa deixou.
    expect(saves[0]?.palette).toBeUndefined()
    expect(saves[0]?.base).toBeUndefined()
  })

  test('lista que a pessoa editou não é trocada', async ($, on) => {
    const saves: Array<Record<string, unknown>> = []
    const clock = ambiente(on)
    skinsFalso(on, { current: 'garra-brasil', spinner: ['Matutando', 'Tramando'] }, saves)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    await clock.advance(200)
    expect(saves.length).toBe(0)
  })

  test('com outro skin em uso, o Garra não mexe em nada', async ($, on) => {
    const saves: Array<Record<string, unknown>> = []
    const clock = ambiente(on)
    skinsFalso(on, { current: 'one-dark', spinner: LISTA_ANTIGA }, saves)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    await clock.advance(200)
    expect(saves.length).toBe(0)
  })
})

describe('frases de espera', () => {
  test('sem o Skins: o Garra troca só a palavra e o Claude Code desenha o spinner', async ($, on) => {
    const clock = ambiente(on, { skins: false })
    spinnerNativo(on)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    await clock.advance(200)
    const ui = await $.ui.mount({ plugin: 'garra-mod', surface: 'terminal', ...SPINNER } as never)
    const frase = await palavra(ui as never)
    expect(FRASES_ESPERA).toContain(frase)
    await ui.unmount()
  })

  test('tarefa longa sem o Skins: troca a cada 4 s, sem repetir as últimas 5', async ($, on) => {
    const clock = ambiente(on, { skins: false })
    spinnerNativo(on)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    await clock.advance(200)
    await $.turn.start(INICIO as never)
    const ui = await $.ui.mount({ plugin: 'garra-mod', surface: 'terminal', ...SPINNER } as never)
    const vistas = [await palavra(ui as never)]
    for (let i = 0; i < 12; i++) {
      await clock.advance(4000)
      vistas.push(await palavra(ui as never))
    }
    for (const [i, frase] of vistas.entries()) {
      expect(FRASES_ESPERA).toContain(frase)
      expect(vistas.slice(Math.max(0, i - 5), i)).not.toContain(frase)
    }
    // Fora do turno, a frase para de girar.
    await $.turn.complete(FIM as never)
    await clock.advance(200)
    const parada = await palavra(ui as never)
    await clock.advance(20000)
    expect(await palavra(ui as never)).toBe(parada)
    await ui.unmount()
  })

  test('com o Skins desenhando o garra-brasil: uma frase nova por turno, sem salvar durante o turno', async ($, on) => {
    const saves: Array<Record<string, unknown>> = []
    const clock = ambiente(on)
    spinnerNativo(on)
    skinsFalso(on, { current: 'garra-brasil', spinner: SKIN_SPINNER }, saves)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    await clock.advance(200)
    expect(saves.length).toBe(1)
    const frases = [(saves[0]?.spinner as string[])[0]]
    for (let turno = 0; turno < 6; turno++) {
      await $.turn.start(INICIO as never)
      await clock.advance(30000)
      expect(saves.length).toBe(1 + turno)
      await $.turn.complete(FIM as never)
      await clock.advance(200)
      expect(saves.length).toBe(2 + turno)
      frases.push((saves.at(-1)?.spinner as string[])[0])
    }
    for (const [i, frase] of frases.entries()) {
      expect(FRASES_ESPERA).toContain(frase)
      expect(frases.slice(Math.max(0, i - 5), i)).not.toContain(frase)
    }
  })

  test('subagentes não trocam a frase do turno principal', async ($, on) => {
    const saves: Array<Record<string, unknown>> = []
    const clock = ambiente(on)
    spinnerNativo(on)
    skinsFalso(on, { current: 'garra-brasil', spinner: SKIN_SPINNER }, saves)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    await clock.advance(200)
    await $.turn.start({ ...INICIO, agentId: 'sub-1' } as never)
    await $.turn.complete({ ...FIM, agentId: 'sub-1' } as never)
    await clock.advance(200)
    expect(saves.length).toBe(1)
  })

  test('outro skin em uso (Skins sem brilho, passando a palavra dele): o Garra deixa como está', async ($, on) => {
    const clock = ambiente(on)
    spinnerNativo(on)
    skinsFalso(on, { current: 'one-dark', spinner: ['Rolling'] }, [])
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    await clock.advance(200)
    const ui = await $.ui.mount({ plugin: 'garra-mod', surface: 'terminal', ...SPINNER, props: { ...SPINNER.props, word: 'Rolling' } } as never)
    expect(await palavra(ui as never)).toBe('Rolling')
    await ui.unmount()
  })

  test('no desktop o spinner diz o passo em andamento, e o Garra não troca', async ($, on) => {
    const clock = ambiente(on, { skins: false })
    spinnerNativo(on)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    await clock.advance(200)
    const ui = await $.ui.mount({ plugin: 'garra-mod', surface: 'desktop', ...SPINNER, props: { ...SPINNER.props, word: 'Creating notes.md' } } as never)
    expect(await palavra(ui as never)).toBe('Creating notes.md')
    await ui.unmount()
  })

  test('/garra-config frases off: spinner do Claude Code e a lista fixa de volta no garra-brasil', async ($, on) => {
    const saves: Array<Record<string, unknown>> = []
    const clock = ambiente(on)
    spinnerNativo(on)
    skinsFalso(on, { current: 'garra-brasil', spinner: ['Afiando as garras'] }, saves)
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    await clock.advance(200)
    const out = await $.command.run({ command: 'garra-config', args: 'frases off' } as never)
    expect(out.text).toContain('frases: desligado')
    await clock.advance(200)
    expect(saves.at(-1)?.spinner).toEqual(SKIN_SPINNER)
    const ui = await $.ui.mount({ plugin: 'garra-mod', surface: 'terminal', ...SPINNER } as never)
    expect(await palavra(ui as never)).toBe('Sauteing')
    await ui.unmount()
    await $.turn.start(INICIO as never)
    await $.turn.complete(FIM as never)
    await clock.advance(200)
    expect(saves.at(-1)?.spinner).toEqual(SKIN_SPINNER)
  })
})

const FAIXA = {
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 9 }, view: {} },
}
