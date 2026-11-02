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

export async function lerConfigHermes($: EngineInterface): Promise<LeituraHermes> {
  try {
    const env: EnvHermes = {
      HERMES_HOME: await $.env.get('HERMES_HOME'),
      HERMES_DATA_DIR_SUFFIX: await $.env.get('HERMES_DATA_DIR_SUFFIX'),
      HOME: await $.env.get('HOME'),
      USERPROFILE: await $.env.get('USERPROFILE'),
      LOCALAPPDATA: await $.env.get('LOCALAPPDATA'),
    }
    const home = (env.HOME ?? '').trim() || (env.USERPROFILE ?? '').trim()
    for (const pasta of pastasDoHermes(env)) {
      if (!(await $.fs.exists(pasta).catch(() => false))) continue
      const arquivo = `${pasta}/config.yaml`
      const caminho = encurtar(arquivo, home)
      if (!(await $.fs.exists(arquivo).catch(() => false))) return { modelo: null, caminho: null, motivo: `sem config.yaml em ${encurtar(pasta, home)}` }
      const modelo = modeloDoHermes(await $.fs.read(arquivo))
      return modelo ? { modelo, caminho, motivo: '' } : { modelo: null, caminho, motivo: `${caminho} sem model.default` }
    }
    return { modelo: null, caminho: null, motivo: 'config.yaml do Hermes não encontrado' }
  } catch {
    return { modelo: null, caminho: null, motivo: 'não foi possível ler o config.yaml do Hermes' }
  }
}

// Agentes que rodam a CLI do Hermes (o padrão e um `hermes` do agentes.json).
export function usaHermes(agent: GarraAgentEntry): boolean {
  return [...(agent.consulta ?? []), ...(agent.delegar ?? [])].some(t => t.type === 'process' && /(^|[/\\])hermes(\.exe)?$/.test(t.argv[0] ?? ''))
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
