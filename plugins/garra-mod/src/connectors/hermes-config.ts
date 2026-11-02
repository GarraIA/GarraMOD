// O modelo que o Hermes usa, para mostrar no /garra-status e no painel. O Garra
// MOD não passa modelo ao Hermes: ele decide pelo próprio config.yaml
// (`model.default` + `model.provider`, e as reservas em `fallback_providers`).
// Só esses campos são lidos; chaves e tokens do arquivo nunca saem dali.

import type { EngineInterface } from 'claude-code'
import type { GarraAgentEntry } from '../../types'
import { encurtar, filho, lerNos, listaDeMapas, MODELO, NOME, topo, valor } from '../core/yaml'

export type ModeloHermes = { provider: string; model: string; reservas: Array<{ provider: string; model: string }> }

export function modeloDoHermes(yaml: string): ModeloHermes | null {
  const nos = lerNos(yaml)
  const m = topo(nos, 'model')
  if (m < 0) return null
  // Formato atual: `model:` com `default` e `provider`; antigo: `model: nome`.
  const direto = valor(nos, m)
  const model = direto !== '' ? direto : valor(nos, filho(nos, m, 'default')) || valor(nos, filho(nos, m, 'model'))
  const provider = direto !== '' ? valor(nos, topo(nos, 'provider')) : valor(nos, filho(nos, m, 'provider'))
  if (!MODELO.test(model) || (provider !== '' && !NOME.test(provider))) return null
  const reservas = listaDeMapas(yaml, 'fallback_providers')
    .map(r => ({ provider: r.provider ?? '', model: r.model ?? '' }))
    .filter(r => MODELO.test(r.model) && (r.provider === '' || NOME.test(r.provider)))
  return { provider, model, reservas }
}

export type EnvHermes = {
  HERMES_HOME?: string | undefined
  HERMES_DATA_DIR_SUFFIX?: string | undefined
  HOME?: string | undefined
  USERPROFILE?: string | undefined
  LOCALAPPDATA?: string | undefined
}

// Pastas do Hermes na ordem dele: HERMES_HOME; ~/.hermes (Linux e macOS);
// %LOCALAPPDATA%\hermes (Windows). Vale a primeira que existir.
export function pastasDoHermes(env: EnvHermes): string[] {
  const home = (env.HOME ?? '').trim() || (env.USERPROFILE ?? '').trim()
  const sufixo = (env.HERMES_DATA_DIR_SUFFIX ?? '').trim()
  const explicito = (env.HERMES_HOME ?? '').trim()
  const local = (env.LOCALAPPDATA ?? '').trim()
  const pastas = [
    explicito.startsWith('~/') && home ? `${home}${explicito.slice(1)}` : explicito,
    home ? `${home}/.hermes${sufixo}` : '',
    local ? `${local}/hermes${sufixo}` : '',
  ]
  return [...new Set(pastas.filter(p => p !== ''))]
}

export type LeituraHermes = { modelo: ModeloHermes | null; caminho: string | null; motivo: string }

// A primeira pasta do Hermes que existe, e a pasta pessoal (para mostrar com ~).
async function pastaDoHermes($: EngineInterface): Promise<{ pasta: string; home: string } | null> {
  const env: EnvHermes = {
    HERMES_HOME: await $.env.get('HERMES_HOME'),
    HERMES_DATA_DIR_SUFFIX: await $.env.get('HERMES_DATA_DIR_SUFFIX'),
    HOME: await $.env.get('HOME'),
    USERPROFILE: await $.env.get('USERPROFILE'),
    LOCALAPPDATA: await $.env.get('LOCALAPPDATA'),
  }
  const home = (env.HOME ?? '').trim() || (env.USERPROFILE ?? '').trim()
  for (const pasta of pastasDoHermes(env)) {
    if (await $.fs.exists(pasta).catch(() => false)) return { pasta, home }
  }
  return null
}

export async function lerConfigHermes($: EngineInterface): Promise<LeituraHermes> {
  try {
    const achou = await pastaDoHermes($)
    if (achou === null) return { modelo: null, caminho: null, motivo: 'config.yaml do Hermes não encontrado' }
    const { pasta, home } = achou
    const arquivo = `${pasta}/config.yaml`
    const caminho = encurtar(arquivo, home)
    if (!(await $.fs.exists(arquivo).catch(() => false))) return { modelo: null, caminho: null, motivo: `sem config.yaml em ${encurtar(pasta, home)}` }
    const modelo = modeloDoHermes(await $.fs.read(arquivo))
    return modelo ? { modelo, caminho, motivo: '' } : { modelo: null, caminho, motivo: `${caminho} sem model.default` }
  } catch {
    return { modelo: null, caminho: null, motivo: 'não foi possível ler o config.yaml do Hermes' }
  }
}

// O executável é a CLI do Hermes?
export function ehHermes(exe: string): boolean {
  return /(^|[/\\])hermes(\.exe)?$/.test(exe)
}

// Agentes que rodam a CLI do Hermes (o padrão e um `hermes` do agentes.json).
export function usaHermes(agent: GarraAgentEntry): boolean {
  return [...(agent.consulta ?? []), ...(agent.delegar ?? [])].some(t => t.type === 'process' && ehHermes(t.argv[0] ?? ''))
}

// ------------------------------------------------------------------ modelo observado
// A CLI do Hermes não diz qual modelo respondeu, e o `--usage-file` dele só vale
// no modo `-z` (mensagem na linha de comando, que o MOD não usa). Mas ao fim de
// cada resposta ele escreve `session_id: local-…` na saída de erro, e o
// logs/agent.log marca cada linha com `[<sessão>]`: a última `API call #N:
// model=…` dessa sessão é o modelo que respondeu, inclusive numa reserva.

export function sessaoDoHermes(saida: string): string | null {
  const todas = [...saida.matchAll(/session_id:\s*([A-Za-z0-9][A-Za-z0-9._:-]{5,127})/g)]
  return todas.at(-1)?.[1] ?? null
}

export function modeloNoLog(log: string, sessao: string): string | null {
  const tag = `[${sessao}]`
  let chamada: string | null = null
  let turno: string | null = null
  for (const line of log.split('\n')) {
    if (!line.includes(tag)) continue
    const api = /API call #\d+: model=(\S+)/.exec(line)
    if (api?.[1]) {
      chamada = api[1]
      continue
    }
    const t = /conversation turn: .*?\bmodel=(\S+)/.exec(line)
    if (t?.[1]) turno = t[1]
  }
  const m = chamada ?? turno
  return m !== null && MODELO.test(m) ? m : null
}

const LEITURA_DIRETA = 1024 * 1024
const FIM_DO_LOG = 512 * 1024
const MAX_LEITURA = 4 * 1024 * 1024

// Só o fim do log interessa (a sessão acabou de escrever). Até 1 MiB lê direto;
// acima, `tail -c`; sem `tail` (Windows), lê direto se couber nos 4 MiB do $.fs.
async function fimDoArquivo($: EngineInterface, arquivo: string): Promise<string | null> {
  const st = await $.fs.stat(arquivo).catch(() => null)
  if (st === null || st.kind !== 'file') return null
  if (st.size <= LEITURA_DIRETA) return $.fs.read(arquivo).catch(() => null)
  const run = await $.process.run(['tail', '-c', String(FIM_DO_LOG), arquivo], { timeoutMs: 5000 }).catch(() => null)
  if (run !== null && run.exitCode === 0) return run.stdout
  return st.size <= MAX_LEITURA ? $.fs.read(arquivo).catch(() => null) : null
}

// O modelo que respondeu numa sessão, procurado no agent.log (e no anterior,
// se o log girou durante a chamada). `null` quando não dá para saber.
export async function modeloObservadoHermes($: EngineInterface, sessao: string): Promise<string | null> {
  try {
    const achou = await pastaDoHermes($)
    if (achou === null) return null
    for (const nome of ['agent.log', 'agent.log.1']) {
      const texto = await fimDoArquivo($, `${achou.pasta}/logs/${nome}`)
      const modelo = texto === null ? null : modeloNoLog(texto, sessao)
      if (modelo !== null) return modelo
    }
    return null
  } catch {
    return null
  }
}

// O que mostrar: `null` quando não há config legível (fica "configurado pelo próprio agente").
export function resumoHermes(l: LeituraHermes): { valor: string; reservas: string; fonte: string } | null {
  if (l.modelo === null) return null
  const nome = (r: { provider: string; model: string }) => [r.provider, r.model].filter(Boolean).join(' · ')
  return {
    valor: nome(l.modelo),
    reservas: l.modelo.reservas.map(nome).join(' → '),
    fonte: `lido de ${l.caminho ?? '?'}; o Garra MOD não passa modelo ao Hermes`,
  }
}
