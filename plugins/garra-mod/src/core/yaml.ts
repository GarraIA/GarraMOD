// Leitor mínimo de YAML de blocos, só para achar provedor e modelo nos arquivos
// de configuração do GarraIA e do Hermes. Não interpreta o documento todo:
// quem chama pede chaves por nível de indentação, e o que não reconhece fica
// de fora (fluxo `{...}`, âncoras, texto em bloco).

export type No = { indent: number; key: string; value: string }

const MAX_BYTES = 256 * 1024

// Formatos aceitos, para nada estranho ir parar num argumento ou na tela.
export const NOME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
export const MODELO = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,127}$/

function linhas(yaml: string): string[] {
  return yaml.slice(0, MAX_BYTES).split(/\r?\n/)
}

function ignorar(trimmed: string): boolean {
  return trimmed === '' || trimmed.startsWith('#') || trimmed === '---' || trimmed === '...'
}

const CHAVE = /^( *)(["']?)([^"'#:\s][^"':]*?)\2\s*:(?:\s+(.*))?$/

// Linhas `chave: valor`. Itens de lista e comentários ficam de fora; quem chama
// olha só a indentação exata de cada nível.
export function lerNos(yaml: string): No[] {
  const nos: No[] = []
  for (const line of linhas(yaml)) {
    const trimmed = line.trim()
    if (ignorar(trimmed) || trimmed === '-' || trimmed.startsWith('- ')) continue
    const m = CHAVE.exec(line)
    if (!m) continue
    nos.push({ indent: m[1]?.length ?? 0, key: m[3] ?? '', value: m[4] ?? '' })
  }
  return nos
}

// Valor escalar sem aspas nem comentário; `null`/`~` contam como ausente.
export function escalar(raw: string): string {
  const v = raw.trim()
  const q = /^(["'])(.*)\1(?:\s+#.*)?$/.exec(v)
  if (q) return q[2] ?? ''
  const plain = v.replace(/\s+#.*$/, '').trim()
  return plain === 'null' || plain === 'Null' || plain === 'NULL' || plain === '~' ? '' : plain
}

// Índices dos filhos diretos de `pai` (a indentação do primeiro filho vale para todos).
export function filhos(nos: No[], pai: number): number[] {
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

export function topo(nos: No[], key: string): number {
  return nos.findIndex(n => n.indent === 0 && n.key === key)
}

export function filho(nos: No[], pai: number, key: string): number {
  return filhos(nos, pai).find(i => nos[i]?.key === key) ?? -1
}

export function valor(nos: No[], i: number): string {
  return i < 0 ? '' : escalar(nos[i]?.value ?? '')
}

// Uma lista de mapas sob uma chave do topo:
//   chave:
//     - provider: x
//       model: y
// Cada item vira um objeto com as chaves diretas dele (sem níveis mais fundos).
export function listaDeMapas(yaml: string, chave: string): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = []
  let dentro = false
  let atual: Record<string, string> | null = null
  let nivel = -1
  for (const line of linhas(yaml)) {
    const trimmed = line.trim()
    if (ignorar(trimmed)) continue
    const indent = line.length - line.trimStart().length
    if (!dentro) {
      const m = CHAVE.exec(line)
      if (m && indent === 0 && m[3] === chave && escalar(m[4] ?? '') === '') dentro = true
      continue
    }
    // A lista termina na próxima chave do topo (itens podem começar na coluna 0).
    if (indent === 0 && !trimmed.startsWith('-')) break
    if (trimmed === '-' || trimmed.startsWith('- ')) {
      atual = {}
      out.push(atual)
      const resto = trimmed.slice(1).trimStart()
      nivel = indent + (trimmed.length - resto.length)
      const m = CHAVE.exec(`${' '.repeat(nivel)}${resto}`)
      if (m) atual[m[3] ?? ''] = escalar(m[4] ?? '')
      continue
    }
    if (atual && indent === nivel) {
      const m = CHAVE.exec(line)
      if (m) atual[m[3] ?? ''] = escalar(m[4] ?? '')
    }
  }
  return out
}

export function encurtar(arquivo: string, home: string): string {
  return home !== '' && arquivo.startsWith(`${home}/`) ? `~${arquivo.slice(home.length)}` : arquivo
}
