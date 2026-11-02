// Os valores do Garra MOD: `$.state` para desenhar (sobrevive a recargas) e
// `$.store` para persistir entre sessões (preferências, histórico, agentes).

import type { GarraHistoryEntry, GarraPrefs } from '../../types'

export const DEFAULT_PREFS: GarraPrefs = {
  personalidade: true,
  boasVindas: true,
  statusLine: true,
  localizarNextSteps: true,
  agentePadrao: 'garraia',
  timeoutS: 180,
  concorrencia: 3,
  rev: 0,
}

export const STORE = {
  prefs: 'prefs',
  history: 'historico',
  agents: 'agentes',
  previousSkin: 'tema-anterior',
} as const

export const HISTORY_MAX = 40
export const HISTORY_ANSWER_MAX = 4000

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// Lê preferências guardadas por qualquer versão, mantendo só campos válidos.
export function parsePrefs(raw: unknown): GarraPrefs {
  if (!isObj(raw)) return DEFAULT_PREFS
  const bool = (k: keyof GarraPrefs) => (typeof raw[k] === 'boolean' ? (raw[k] as boolean) : (DEFAULT_PREFS[k] as boolean))
  const num = (k: keyof GarraPrefs, lo: number, hi: number) => {
    const v = raw[k]
    return typeof v === 'number' && v >= lo && v <= hi ? Math.round(v) : (DEFAULT_PREFS[k] as number)
  }
  return {
    personalidade: bool('personalidade'),
    boasVindas: bool('boasVindas'),
    statusLine: bool('statusLine'),
    localizarNextSteps: bool('localizarNextSteps'),
    agentePadrao: typeof raw.agentePadrao === 'string' && raw.agentePadrao !== '' ? raw.agentePadrao : DEFAULT_PREFS.agentePadrao,
    timeoutS: num('timeoutS', 5, 1800),
    concorrencia: num('concorrencia', 1, 8),
    rev: num('rev', 0, Number.MAX_SAFE_INTEGER),
  }
}

export function parseHistory(raw: unknown): GarraHistoryEntry[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((e): e is GarraHistoryEntry => isObj(e) && typeof e.id === 'string' && typeof e.agente === 'string' && typeof e.pergunta === 'string' && typeof e.resposta === 'string')
    .slice(-HISTORY_MAX)
}
