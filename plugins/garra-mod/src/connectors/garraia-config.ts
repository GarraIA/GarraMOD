// O provedor e o modelo que a pessoa configurou no GarraIA. Sem eles, o
// `garra mcp-server` usa o padrão embutido (z-ai/glm-5.3-flash), não o modelo
// do config.yml. O MOD lê só `agent.default_provider` e o `model` dessa entrada
// em `llm:`; o resto do arquivo (chaves, tokens) nunca é guardado, registrado
// nem enviado.

import type { EngineInterface } from 'claude-code'

export type ModeloGarraIA = { provider: string; model: string }

// Formatos aceitos, para nada estranho ir parar num argumento.
const NOME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const MODELO = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}$/
const MAX_BYTES = 256 * 1024

type No = { indent: number; key: string; value: string }

// Linhas `chave: valor` de um YAML de blocos. Itens de lista e comentários
// ficam de fora; quem chama olha só a indentação exata de cada nível.
function lerNos(yaml: string): No[] {
  const nos: No[] = []
  for (const line of yaml.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#') || trimmed === '---' || trimmed === '...') continue
    if (trimmed === '-' || trimmed.startsWith('- ')) continue
    const m = /^( *)(["']?)([^"'#:\s][^"':]*?)\2\s*:(?:\s+(.*))?$/.exec(line)
    if (!m) continue
    nos.push({ indent: m[1]?.length ?? 0, key: m[3] ?? '', value: m[4] ?? '' })
  }
  return nos
}

// Valor escalar sem aspas nem comentário; `null`/`~` contam como ausente.
function escalar(raw: string): string {
  const v = raw.trim()
  const q = /^(["'])(.*)\1(?:\s+#.*)?$/.exec(v)
  if (q) return q[2] ?? ''
  const plain = v.replace(/\s+#.*$/, '').trim()
  return plain === 'null' || plain === 'Null' || plain === 'NULL' || plain === '~' ? '' : plain
}

// Índices dos filhos diretos de `pai` (a indentação do primeiro filho vale para todos).
function filhos(nos: No[], pai: number): number[] {
  const base = nos[pai]?.indent ?? 0
  const out: number[] = []
  let nivel = -1
  for (let i = pai + 1; i < nos.length; i++) {
    const n = nos[i]
    if (!n || n.indent <= base) break
    if (nivel === -1) nivel = n.indent
    if (n.indent === nivel) out.push(i)
  }
  return out
}

export function modeloDoConfig(yaml: string): ModeloGarraIA | null {
  const nos = lerNos(yaml.slice(0, MAX_BYTES))
  const topo = (key: string) => nos.findIndex(n => n.indent === 0 && n.key === key)
  const agent = topo('agent')
  const llm = topo('llm')
  if (agent < 0 || llm < 0) return null
  const filho = (pai: number, key: string) => filhos(nos, pai).find(i => nos[i]?.key === key) ?? -1
  const dp = filho(agent, 'default_provider')
  const provider = dp < 0 ? '' : escalar(nos[dp]?.value ?? '')
  if (!NOME.test(provider)) return null
  const entrada = filho(llm, provider)
  if (entrada < 0) return null
  const m = filho(entrada, 'model')
  const model = m < 0 ? '' : escalar(nos[m]?.value ?? '')
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

export async function lerModeloGarraIA($: EngineInterface): Promise<ModeloGarraIA | null> {
  try {
    const env: EnvGarraIA = {
      GARRAIA_CONFIG_DIR: await $.env.get('GARRAIA_CONFIG_DIR'),
      XDG_CONFIG_HOME: await $.env.get('XDG_CONFIG_HOME'),
      HOME: await $.env.get('HOME'),
      USERPROFILE: await $.env.get('USERPROFILE'),
      APPDATA: await $.env.get('APPDATA'),
    }
    for (const pasta of pastasDoGarraIA(env)) {
      if (!(await $.fs.exists(pasta).catch(() => false))) continue
      const arquivo = `${pasta}/config.yml`
      if (!(await $.fs.exists(arquivo).catch(() => false))) return null
      return modeloDoConfig(await $.fs.read(arquivo))
    }
    return null
  } catch {
    return null
  }
}
