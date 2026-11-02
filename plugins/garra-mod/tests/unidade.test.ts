// Testes isolados das partes puras: registro de agentes, segurança e parsers.
// Não falam com nenhum serviço: são mocks por natureza, e só isso.

import { describe, expect, test } from 'claude-code/testing'
import { parseChatCompletion, parseEnvelope } from '../src/connectors/parse'
import { findAgent, mergeAgents, parseAgentFile, validateAgent, defaultLayer } from '../src/registry/registry'
import { checkDestination, cleanOutput, redactSecrets } from '../src/security/sanitize'
import { FRASES_ESPERA, lembrarFrase, SEM_REPETIR, sortearFrase } from '../src/localization/frases'
import { linhasModelo, modeloDoConfig, modeloPassado, pastasDoGarraIA, type LeituraGarraIA } from '../src/connectors/garraia-config'
import { modeloDoHermes, modeloNoLog, pastasDoHermes, resumoHermes, sessaoDoHermes, usaHermes } from '../src/connectors/hermes-config'
import { listaDeMapas } from '../src/core/yaml'

// Valores FALSOS, montados por partes para nenhum scanner de segredos os
// confundir com chaves reais. Têm o formato que o MOD precisa remover.
const FALSO = {
  sk: ['sk', 'abcdefghijklmnopqrstuvwxyz123456'].join('-'),
  openrouter: ['sk', 'or', 'v1', 'abcdefghijklmnopqrstuvwxyz0123'].join('-'),
  github: ['gh', 'p_', 'a'.repeat(36)].join(''),
}

describe('registro de agentes', () => {
  test('os padrões trazem Claude, GarraIA e Hermes', async () => {
    const agents = mergeAgents([defaultLayer()])
    expect(agents.map(a => a.id)).toEqual(['claude', 'garraia', 'hermes'])
    expect(findAgent(agents, 'Garra')?.id).toBe('garraia')
    expect(findAgent(agents, 'hermes')?.nome).toBe('Hermes')
  })

  test('aceita um agente novo por processo local', async () => {
    const v = validateAgent({ id: 'ollama-local', nome: 'Ollama', consulta: [{ type: 'process', argv: ['ollama', 'run', 'qwen3'], output: 'text' }] })
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.agent.permissoes).toEqual({ consulta: true, delegar: false })
      expect(v.agent.sessao.compartilharHistorico).toBe(false)
    }
  })

  test('recusa id reservado, mensagem na linha de comando, http remoto e segredo embutido', async () => {
    expect(validateAgent({ id: 'claude', nome: 'X', consulta: [{ type: 'process', argv: ['x'] }] }).ok).toBe(false)
    const argv = validateAgent({ id: 'a', nome: 'A', consulta: [{ type: 'process', argv: ['cli', '{mensagem}'] }] })
    expect(argv.ok).toBe(false)
    const remote = validateAgent({ id: 'b', nome: 'B', consulta: [{ type: 'openai-http', baseUrl: 'http://exemplo.com', model: 'm' }] })
    expect(remote.ok).toBe(false)
    const secret = validateAgent({ id: 'c', nome: 'C', consulta: [{ type: 'process', argv: ['cli', `--api-key=${FALSO.sk}`] }] })
    expect(secret.ok).toBe(false)
    const acp = validateAgent({ id: 'd', nome: 'D', consulta: [{ type: 'acp', argv: ['hermes', 'acp'] }] })
    expect(acp.ok).toBe(false)
  })

  test('arquivo do usuário substitui o padrão pelo id e não substitui o Claude', async () => {
    const file = parseAgentFile(JSON.stringify({ agentes: [{ id: 'hermes', nome: 'Hermes HTTP', consulta: [{ type: 'openai-http', baseUrl: 'http://127.0.0.1:8642', model: 'hermes-agent' }] }, { id: 'x', nome: 1 }] }))
    expect(file.agents.length).toBe(1)
    expect(file.erros.length).toBe(1)
    const merged = mergeAgents([defaultLayer(), { origem: 'usuário (arquivo)', agents: file.agents }])
    const hermes = findAgent(merged, 'hermes')
    expect(hermes?.nome).toBe('Hermes HTTP')
    expect(hermes?.origem).toBe('usuário (arquivo)')
    expect(findAgent(merged, 'claude')?.origem).toBe('padrão')
  })
})

describe('segurança', () => {
  test('remove segredos antes do envio', async () => {
    const { text, count } = redactSecrets(`chave ${FALSO.openrouter} e token=meuSegredoMuitoLongo e ${FALSO.github}`)
    expect(count).toBe(3)
    expect(text).not.toContain('abcdefghijklmnop')
    expect(text).not.toContain('meuSegredoMuitoLongo')
    expect(text).not.toContain(FALSO.github)
    expect(text).toContain('token=[SEGREDO REMOVIDO]')
  })

  test('limpa sequências de escape e caracteres invisíveis da resposta', async () => {
    expect(cleanOutput('\u001b[31mvermelho\u001b[0m​ ok')).toBe('vermelho ok')
    expect(cleanOutput('a'.repeat(10), 4)).toContain('cortada')
  })

  test('destinos HTTP: loopback livre, remoto só com https e permissão', async () => {
    expect(checkDestination('http://127.0.0.1:8642', false)).toBeNull()
    expect(checkDestination('http://localhost:3888', false)).toBeNull()
    expect(checkDestination('https://api.exemplo.com', false)).not.toBeNull()
    expect(checkDestination('http://api.exemplo.com', true)).not.toBeNull()
    expect(checkDestination('https://api.exemplo.com', true)).toBeNull()
    expect(checkDestination('http://user:pw@127.0.0.1', false)).not.toBeNull()
  })
})

describe('parsers', () => {
  test('envelope garra.ask.v1 e erro', async () => {
    const ok = parseEnvelope('{"schema":"garra.ask.v1","ok":true,"answer":"PRONTO","model":"m"}\n', 'garra.ask.v1')
    expect(ok).toEqual({ ok: true, text: 'PRONTO', modelo: 'm' })
    const bad = parseEnvelope('{"schema":"garra.ask.v1","ok":false,"error":{"message":"sem chave"}}', 'garra.ask.v1')
    expect(bad).toEqual({ ok: false, motivo: 'sem chave' })
  })

  test('envelope garra.agent.v1 resume as ferramentas usadas', async () => {
    const r = parseEnvelope('{"schema":"garra.agent.v1","ok":true,"answer":"feito","tool_calls":[{"name":"bash"},{"name":"file_read"}]}', 'garra.agent.v1')
    expect(r.ok && r.extra).toContain('bash, file_read')
  })

  test('chat completions OpenAI', async () => {
    expect(parseChatCompletion('{"model":"x","choices":[{"message":{"content":"oi"}}]}')).toEqual({ ok: true, text: 'oi', modelo: 'x' })
    expect(parseChatCompletion('{"error":{"message":"401"}}').ok).toBe(false)
  })
})

describe('frases de espera', () => {
  // Gerador previsível (congruente linear) para os sorteios do teste.
  function semente(n: number): () => number {
    let x = n
    return () => {
      x = (x * 1103515245 + 12345) % 2147483648
      return x / 2147483648
    }
  }

  test('a coleção tem pelo menos 40 frases curtas, únicas e sem reticências', async () => {
    expect(FRASES_ESPERA.length).toBeGreaterThanOrEqual(40)
    expect(new Set(FRASES_ESPERA).size).toBe(FRASES_ESPERA.length)
    for (const frase of FRASES_ESPERA) {
      expect([...frase].length).toBeGreaterThanOrEqual(1)
      expect([...frase].length).toBeLessThanOrEqual(24)
      expect(/…|\.\.\./.test(frase)).toBe(false)
      expect(frase.trim()).toBe(frase)
    }
  })

  test('nunca repete nenhuma das últimas 5 em 2000 sorteios, e passa por quase toda a coleção', async () => {
    const aleatorio = semente(42)
    let recentes: string[] = []
    const vistas = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const frase = sortearFrase(recentes, aleatorio)
      expect(FRASES_ESPERA).toContain(frase)
      expect(recentes).not.toContain(frase)
      recentes = lembrarFrase(recentes, frase)
      vistas.add(frase)
    }
    expect(vistas.size).toBe(FRASES_ESPERA.length)
  })

  test('guarda só as últimas 5 e aguenta o aleatório no limite', async () => {
    expect(SEM_REPETIR).toBe(5)
    expect(lembrarFrase(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['b', 'c', 'd', 'e', 'f'])
    expect(FRASES_ESPERA).toContain(sortearFrase([], () => 0.9999999))
    expect(FRASES_ESPERA).toContain(sortearFrase([], () => 0))
    expect(sortearFrase(['x', 'y'], () => 0.5, ['x', 'y'])).toMatch(/^[xy]$/)
  })
})

describe('modelo do config do GarraIA', () => {
  // Parecido com o config.yml real: chaves, apelidos em llm:, comentários,
  // texto em bloco e listas. Só o provedor padrão e o modelo dele podem sair.
  const CONFIG = [
    'gateway:',
    '  port: 3888',
    `  api_key: ${FALSO.sk}`,
    'llm:',
    '  openrouter:',
    '    provider: openrouter',
    '    model: anthropic/claude-haiku-5.5',
    `    api_key: ${FALSO.openrouter}`,
    '    base_url: https://openrouter.ai/api/v1',
    '  ollama-qwen3:',
    '    provider: openai',
    "    model: 'qwen3.5:0.8b'  # local",
    '    base_url: http://127.0.0.1:11434/v1',
    'agent:',
    '  system_prompt: |',
    '    default_provider: ollama-qwen3',
    '    model: nao-e-este',
    '  persona: friendly',
    '  default_provider: openrouter  # principal',
    '  fallback_providers:',
    '  - ollama-qwen3',
    'timeouts:',
    '  llm:',
    '    default_secs: 120',
  ].join('\n')

  test('lê o provedor padrão e o modelo dele, e nada mais', () => {
    expect(modeloDoConfig(CONFIG)).toEqual({ provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' })
  })

  test('apelido de llm: como provedor padrão, com aspas e comentário', () => {
    const alias = CONFIG.replace('default_provider: openrouter  # principal', 'default_provider: "ollama-qwen3"')
    expect(modeloDoConfig(alias)).toEqual({ provider: 'ollama-qwen3', model: 'qwen3.5:0.8b' })
  })

  test('sem dado confiável, não inventa nada', () => {
    expect(modeloDoConfig(CONFIG.replace('  default_provider: openrouter  # principal\n', ''))).toBeNull()
    expect(modeloDoConfig(CONFIG.replace('default_provider: openrouter', 'default_provider: inexistente'))).toBeNull()
    expect(modeloDoConfig(CONFIG.replace('    model: anthropic/claude-haiku-5.5\n', ''))).toBeNull()
    expect(modeloDoConfig(CONFIG.replace('model: anthropic/claude-haiku-5.5', 'model: null'))).toBeNull()
    expect(modeloDoConfig(CONFIG.replace('model: anthropic/claude-haiku-5.5', 'model: "x; rm -rf ~"'))).toBeNull()
    expect(modeloDoConfig('llm: {openrouter: {model: x}}\nagent: {default_provider: openrouter}')).toBeNull()
    expect(modeloDoConfig('')).toBeNull()
  })

  test('procura nas pastas do GarraIA, na ordem dele', () => {
    expect(pastasDoGarraIA({ HOME: '/home/a' })).toEqual(['/home/a/.config/garraia', '/home/a/Library/Application Support/garraia', '/home/a/.garraia'])
    expect(pastasDoGarraIA({ HOME: '/home/a', GARRAIA_CONFIG_DIR: '/cfg', XDG_CONFIG_HOME: '/xdg' }).slice(0, 2)).toEqual(['/cfg', '/xdg/garraia'])
    expect(pastasDoGarraIA({ USERPROFILE: 'C:/Users/a', APPDATA: 'C:/Users/a/AppData/Roaming' })).toContain('C:/Users/a/AppData/Roaming/garraia')
    expect(pastasDoGarraIA({})).toEqual([])
  })
})

describe('resumo do modelo que o MOD passa', () => {
  const LIDO: LeituraGarraIA = { modelo: { provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' }, caminho: '~/.config/garraia/config.yml', motivo: '' }
  const SEM: LeituraGarraIA = { modelo: null, caminho: null, motivo: 'config.yml do GarraIA não encontrado' }
  const mcp = (args: Record<string, string>) => ({ type: 'mcp' as const, server: 'garraia', tool: 'garra_ask', messageArg: 'message', args })
  const garraia = () => {
    const a = findAgent(mergeAgents([defaultLayer()]), 'garraia')
    if (!a) throw new Error('sem garraia')
    return a
  }

  test('marcadores com config: o valor lido e o arquivo de onde veio', () => {
    expect(modeloPassado(mcp({ provider: '{garraia.provider}', model: '{garraia.model}' }), LIDO)).toEqual({ valor: 'openrouter · anthropic/claude-haiku-5.5', fonte: 'lido do config.yml do GarraIA (~/.config/garraia/config.yml)' })
  })

  test('marcadores sem config, modelo fixo, nenhum modelo e transporte que não é MCP', () => {
    expect(modeloPassado(mcp({ model: '{garraia.model}' }), SEM)).toEqual({ valor: 'nenhum', fonte: 'config.yml do GarraIA não encontrado; vale o padrão do servidor MCP do GarraIA (hoje z-ai/glm-5.3-flash)' })
    expect(modeloPassado(mcp({ model: 'anthropic/claude-haiku-5.5' }), LIDO)).toEqual({ valor: 'anthropic/claude-haiku-5.5', fonte: 'fixo na definição do agente' })
    expect(modeloPassado(mcp({ timeout_secs: '{timeout}' }), LIDO)?.valor).toBe('nenhum')
    expect(modeloPassado({ type: 'process', argv: ['garra', 'ask'] }, LIDO)).toBeNull()
  })

  test('consulta e delegação iguais viram uma linha; diferentes, duas; sem MCP, nenhuma', () => {
    expect(linhasModelo(garraia(), LIDO)).toEqual([{ rotulo: 'consulta e delegação', valor: 'openrouter · anthropic/claude-haiku-5.5', fonte: 'lido do config.yml do GarraIA (~/.config/garraia/config.yml)' }])
    const misto = { ...garraia(), delegar: [mcp({ model: 'outro/modelo' })] }
    expect(linhasModelo(misto, LIDO).map(l => l.rotulo)).toEqual(['consulta', 'delegação'])
    const hermes = findAgent(mergeAgents([defaultLayer()]), 'hermes')
    expect(hermes ? linhasModelo(hermes, LIDO) : null).toEqual([])
  })
})

describe('modelo do Hermes (config.yaml)', () => {
  // Parecido com o config.yaml real: outras seções também têm provider/model
  // (auxiliary, providers) e não podem ser confundidas com o modelo principal.
  const HERMES = [
    'model:',
    '  default: gpt-6.1-sol',
    '  provider: openai-codex',
    '  base_url: https://chatgpt.com/backend-api/codex',
    'providers:',
    '  ollama-launch:',
    '    default_model: hf.co/unsloth/Qwen3.8-27B-GGUF:UD-Q4_K_XL',
    'fallback_providers:',
    '  - provider: openrouter',
    '    model: anthropic/claude-opus-5-5',
    '    base_url: https://openrouter.ai/api/v1',
    '  - provider: openrouter  # barato',
    "    model: 'anthropic/claude-haiku-5.5'",
    'toolsets:',
    '  - web',
    'auxiliary:',
    '  compression:',
    '    provider: openrouter',
    '    model: z-ai/glm-5.3-flash',
    `    api_key: ${FALSO.openrouter}`,
  ].join('\n')

  test('lê o modelo principal, o provedor e as reservas, e nada mais', () => {
    expect(modeloDoHermes(HERMES)).toEqual({
      provider: 'openai-codex',
      model: 'gpt-6.1-sol',
      reservas: [
        { provider: 'openrouter', model: 'anthropic/claude-opus-5-5' },
        { provider: 'openrouter', model: 'anthropic/claude-haiku-5.5' },
      ],
    })
  })

  test('formato antigo (model: nome), sem reservas e sem modelo', () => {
    expect(modeloDoHermes('model: anthropic/claude-haiku-5.5\nprovider: openrouter\n')).toEqual({ provider: 'openrouter', model: 'anthropic/claude-haiku-5.5', reservas: [] })
    expect(modeloDoHermes('toolsets:\n  - web\n')).toBeNull()
    expect(modeloDoHermes('model:\n  provider: openai-codex\n')).toBeNull()
  })

  test('lista de mapas com itens na coluna 0 termina na próxima chave do topo', () => {
    expect(listaDeMapas('fallback_providers:\n- provider: a\n  model: m1\n  extra:\n    model: nao\n- provider: b\n  model: m2\nagent:\n  model: nao\n', 'fallback_providers')).toEqual([
      { provider: 'a', model: 'm1', extra: '' },
      { provider: 'b', model: 'm2' },
    ])
  })

  test('pastas do Hermes, quem roda a CLI dele e o texto mostrado', () => {
    expect(pastasDoHermes({ HOME: '/home/a' })).toEqual(['/home/a/.hermes'])
    expect(pastasDoHermes({ HOME: '/home/a', HERMES_HOME: '~/outra' })[0]).toBe('/home/a/outra')
    expect(pastasDoHermes({ USERPROFILE: 'C:/Users/a', LOCALAPPDATA: 'C:/Users/a/AppData/Local' })).toContain('C:/Users/a/AppData/Local/hermes')
    const agents = mergeAgents([defaultLayer()])
    expect(agents.filter(usaHermes).map(a => a.id)).toEqual(['hermes'])
    const modelo = modeloDoHermes(HERMES)
    expect(resumoHermes({ modelo, caminho: '~/.hermes/config.yaml', motivo: '' })).toEqual({
      valor: 'openai-codex · gpt-6.1-sol',
      reservas: 'openrouter · anthropic/claude-opus-5-5 → openrouter · anthropic/claude-haiku-5.5',
      fonte: 'lido de ~/.hermes/config.yaml; o Garra MOD não passa modelo ao Hermes',
    })
    expect(resumoHermes({ modelo: null, caminho: null, motivo: 'config.yaml do Hermes não encontrado' })).toBeNull()
  })
})

describe('modelo observado do Hermes (agent.log)', () => {
  const A = 'local-aaaa1111bbbb2222'
  const B = 'local-cccc3333dddd4444'
  const LOG = [
    `2026-11-02 02:55:04,041 INFO [${A}] agent.turn_context: conversation turn: session=${A} model=gpt-6.1-sol provider=openai-codex platform=cli history=0 msg='[Pedido do Claude Code via Garra MOD'`,
    `2026-11-02 02:55:05,000 INFO [${B}] agent.conversation_loop: API call #1: model=z-ai/glm-5.3-flash provider=openrouter in=10 out=2`,
    `2026-11-02 02:55:06,422 INFO [${A}] agent.conversation_loop: API call #1: model=gpt-6.1-sol provider=openai-codex in=7779 out=5`,
    `2026-11-02 02:55:07,100 WARNING [${A}] agent.fallback: primary failed (rate limit); trying fallback`,
    `2026-11-02 02:55:08,300 INFO [${A}] agent.conversation_loop: API call #2: model=anthropic/claude-haiku-5.5 provider=openrouter in=7790 out=6`,
    `2026-11-02 02:55:08,310 INFO [${A}] agent.conversation_loop: Turn ended: reason=text_response(finish_reason=stop) model=anthropic/claude-haiku-5.5 api_calls=2/8`,
  ].join('\n')

  test('o session_id que o Hermes escreve no fim da resposta', () => {
    expect(sessaoDoHermes(`\nsession_id: ${A}\n`)).toBe(A)
    expect(sessaoDoHermes(`session_id: ${B}\nmais texto\nsession_id: ${A}`)).toBe(A)
    expect(sessaoDoHermes('PRONTO')).toBeNull()
  })

  test('a última chamada da sessão vale, inclusive numa reserva; outras sessões não contam', () => {
    expect(modeloNoLog(LOG, A)).toBe('anthropic/claude-haiku-5.5')
    expect(modeloNoLog(LOG, B)).toBe('z-ai/glm-5.3-flash')
    expect(modeloNoLog(LOG.split('\n')[0] ?? '', A)).toBe('gpt-6.1-sol')
    expect(modeloNoLog(LOG, 'local-naoexiste000')).toBeNull()
    expect(modeloNoLog(`x [${A}] y: API call #1: model=$(rm) provider=z`, A)).toBeNull()
  })
})
