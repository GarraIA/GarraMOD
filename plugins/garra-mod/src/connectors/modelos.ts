// O resumo de modelos por agente, para o /garra-status e o painel → Modelos:
//   passa       → o que o MOD manda no `provider`/`model` das chamadas MCP (GarraIA)
//   configurado → o modelo que o próprio agente usa, lido da config dele (Hermes)
//   observado   → o modelo da última chamada à API no log do agente (Hermes)

import type { GarraAgentEntry } from '../../types'
import { type LeituraGarraIA, linhasModelo, type ModeloPassado } from './garraia-config'
import { type LeituraHermes, type LeituraObservado, resumoHermes, resumoObservado, usaHermes } from './hermes-config'

export type ModeloConfigurado = { valor: string; reservas: string; fonte: string }
export type ModeloObservado = { valor: string; fonte: string }

export type ResumoModelo = {
  passa: Array<{ rotulo: string } & ModeloPassado>
  configurado: ModeloConfigurado | null
  observado: ModeloObservado | null
}

export function resumoDosModelos(
  agents: readonly GarraAgentEntry[],
  garraia: LeituraGarraIA,
  hermes: LeituraHermes | null,
  observadoHermes: LeituraObservado | null = null,
): Record<string, ResumoModelo> {
  const out: Record<string, ResumoModelo> = {}
  for (const agent of agents) {
    if (agent.tipo === 'principal') continue
    const passa = linhasModelo(agent, garraia)
    const hermesAqui = usaHermes(agent)
    const configurado = hermes !== null && hermesAqui ? resumoHermes(hermes) : null
    const observado = hermesAqui ? resumoObservado(observadoHermes, hermes?.modelo ?? null) : null
    if (passa.length > 0 || configurado !== null || observado !== null) out[agent.id] = { passa, configurado, observado }
  }
  return out
}
