// O provedor e o modelo que a pessoa configurou no GarraIA. Sem eles, o
// `garra mcp-server` usa o padrão embutido (z-ai/glm-5.3-flash), não o modelo
// do config.yml. O MOD lê só `agent.default_provider` e o `model` dessa entrada
// em `llm:`; o resto do arquivo (chaves, tokens) nunca é guardado, registrado
// nem enviado.

import type { EngineInterface } from 'claude-code'
import type { GarraAgentEntry, GarraTransport } from '../../types'
import { encurtar, filho, lerNos, MODELO, NOME, topo, valor } from '../core/yaml'

export type ModeloGarraIA = { provider: string; model: string }

export function modeloDoConfig(yaml: string): ModeloGarraIA | null {
  const nos = lerNos(yaml)
  const agent = topo(nos, 'agent')
  const llm = topo(nos, 'llm')
  if (agent < 0 || llm < 0) return null
  const provider = valor(nos, filho(nos, agent, 'default_provider'))
  if (!NOME.test(provider)) return null
  const entrada = filho(nos, llm, provider)
  if (entrada < 0) return null
  const model = valor(nos, filho(nos, entrada, 'model'))
  if (!MODELO.test(model)) return null
  return { provider, model }
}

export type EnvGarraIA = {
  GARRAIA_CONFIG_DIR?: string | undefined
  XDG_CONFIG_HOME?: string | undefined
  HOME?: string | undefined
  USERPROFILE?: string | undefined
  APPDATA?: string | undefined
}

// Pastas onde o GarraIA procura o config, na ordem dele: GARRAIA_CONFIG_DIR;
// a pasta de configuração do sistema + /garraia (Linux: XDG ou ~/.config;
// macOS: ~/Library/Application Support; Windows: %APPDATA%); depois ~/.garraia.
// Vale a primeira que existir.
export function pastasDoGarraIA(env: EnvGarraIA): string[] {
  const home = (env.HOME ?? '').trim() || (env.USERPROFILE ?? '').trim()
  const xdg = (env.XDG_CONFIG_HOME ?? '').trim()
  const bases = [xdg.startsWith('/') ? xdg : '', home ? `${home}/.config` : '', home ? `${home}/Library/Application Support` : '', (env.APPDATA ?? '').trim()]
  const pastas = [(env.GARRAIA_CONFIG_DIR ?? '').trim(), ...bases.filter(b => b !== '').map(b => `${b}/garraia`), home ? `${home}/.garraia` : '']
  return [...new Set(pastas.filter(p => p !== ''))]
}

// O que a leitura achou. `caminho` é o arquivo para mostrar (com ~ no lugar da
// pasta pessoal); `motivo` explica por que não há modelo.
export type LeituraGarraIA = { modelo: ModeloGarraIA | null; caminho: string | null; motivo: string }

export async function lerConfigGarraIA($: EngineInterface): Promise<LeituraGarraIA> {
  try {
    const env: EnvGarraIA = {
      GARRAIA_CONFIG_DIR: await $.env.get('GARRAIA_CONFIG_DIR'),
      XDG_CONFIG_HOME: await $.env.get('XDG_CONFIG_HOME'),
      HOME: await $.env.get('HOME'),
      USERPROFILE: await $.env.get('USERPROFILE'),
      APPDATA: await $.env.get('APPDATA'),
    }
    const home = (env.HOME ?? '').trim() || (env.USERPROFILE ?? '').trim()
    for (const pasta of pastasDoGarraIA(env)) {
      if (!(await $.fs.exists(pasta).catch(() => false))) continue
      const arquivo = `${pasta}/config.yml`
      const caminho = encurtar(arquivo, home)
      if (!(await $.fs.exists(arquivo).catch(() => false))) return { modelo: null, caminho: null, motivo: `sem config.yml em ${encurtar(pasta, home)}` }
      const modelo = modeloDoConfig(await $.fs.read(arquivo))
      return modelo ? { modelo, caminho, motivo: '' } : { modelo: null, caminho, motivo: `${caminho} sem agent.default_provider ou sem o model dessa entrada em llm:` }
    }
    return { modelo: null, caminho: null, motivo: 'config.yml do GarraIA não encontrado' }
  } catch {
    return { modelo: null, caminho: null, motivo: 'não foi possível ler o config.yml do GarraIA' }
  }
}

export async function lerModeloGarraIA($: EngineInterface): Promise<ModeloGarraIA | null> {
  return (await lerConfigGarraIA($)).modelo
}

// ------------------------------------------------------------------ resumo

// O que o MOD manda no `provider`/`model` de uma chamada MCP, e de onde veio.
export type ModeloPassado = { valor: string; fonte: string }

const MARCADOR = /\{garraia\.(provider|model)\}/

function padraoDoServidor(server: string): string {
  return server === 'garraia' ? 'vale o padrão do servidor MCP do GarraIA (hoje z-ai/glm-5.3-flash)' : `vale o padrão do servidor MCP ${server}`
}

export function modeloPassado(t: GarraTransport | undefined, leitura: LeituraGarraIA): ModeloPassado | null {
  if (t === undefined || t.type !== 'mcp') return null
  const args = t.args ?? {}
  const provider = typeof args.provider === 'string' ? args.provider : undefined
  const model = typeof args.model === 'string' ? args.model : undefined
  if ((provider !== undefined && MARCADOR.test(provider)) || (model !== undefined && MARCADOR.test(model))) {
    const lido = leitura.modelo
    if (lido === null) return { valor: 'nenhum', fonte: `${leitura.motivo}; ${padraoDoServidor(t.server)}` }
    const fill = (v: string | undefined) => v?.replace(/\{garraia\.provider\}/g, lido.provider).replace(/\{garraia\.model\}/g, lido.model)
    return { valor: [fill(provider), fill(model)].filter(Boolean).join(' · '), fonte: `lido do config.yml do GarraIA (${leitura.caminho ?? '?'})` }
  }
  if (model !== undefined) return { valor: [provider, model].filter(Boolean).join(' · '), fonte: 'fixo na definição do agente' }
  return { valor: 'nenhum', fonte: padraoDoServidor(t.server) }
}

// Consulta e delegação de um agente, juntas quando são iguais. Vazio se o
// agente não chama ninguém por MCP (o modelo fica por conta dele).
export function linhasModelo(agent: GarraAgentEntry, leitura: LeituraGarraIA): Array<{ rotulo: string } & ModeloPassado> {
  const consulta = modeloPassado(agent.consulta?.find(t => t.type === 'mcp'), leitura)
  const delegar = modeloPassado(agent.delegar?.find(t => t.type === 'mcp'), leitura)
  if (consulta && delegar && consulta.valor === delegar.valor && consulta.fonte === delegar.fonte) return [{ rotulo: 'consulta e delegação', ...consulta }]
  return [...(consulta ? [{ rotulo: 'consulta', ...consulta }] : []), ...(delegar ? [{ rotulo: 'delegação', ...delegar }] : [])]
}
