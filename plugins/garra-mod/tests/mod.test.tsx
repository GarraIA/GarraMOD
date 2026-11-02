// Testes do Garra MOD carregado pelo motor do Claude Code. Os hooks deste
// arquivo ficam ABAIXO do MOD e fazem o papel do motor e dos serviços externos
// (mocks isolados). As chamadas reais estão documentadas em docs/testes.md.

import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

const ENABLED = {
  'skins@hellosverre-mods': true,
  'plan-progress@zycck-mods': true,
  'next-steps@claude-community': true,
  'cc-plugin-you-should-know@builtin': true,
}

type World = { mcpUp?: boolean; cli?: boolean; sent?: Array<{ server: string; tool: string; args: Record<string, unknown> }> }

function ambiente(on: On, world: World = {}) {
  mock.store(on)
  mock.env(on, { HOME: '/home/teste' })
  mock.clock(on, { now: 1_800_000_000_000 })
  const tools = [
    { name: 'mcp__skins__design', description: '', mcp: true },
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
  on('fs.exists', () => ({ value: false }))
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

  test('rótulos do Next Steps em pt-BR, sem tocar nos botões', async ($, on) => {
    ambiente(on)
    on('ui.render', ($, e) => {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Text dimColor>next:</Text>
          <Text>outro texto</Text>
        </Box>
      )
    })
    await $.session.start({ cwd: '/projeto', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount({
      plugin: 'garra-mod',
      surface: 'terminal',
      component: 'AbovePrompt',
      requestId: 'band',
      props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 9 }, view: {} },
    } as never)
    expect(await ui.find({ type: 'Text', text: /GarraIA sugere/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /outro texto/ })).toBeDefined()
    await ui.unmount()
  })
})
