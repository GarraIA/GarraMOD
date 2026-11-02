// Tipos e utilidades compartilhados pelas superfícies do Garra MOD.

import type { Elements } from 'claude-code'
import type { GarraAgentEntry, GarraExt, GarraHealth, GarraHealthStatus } from '../../types'
import { DESCRICAO_STATUS, STATUS_ICONE } from '../localization/pt-BR'

// Os elementos que todas as superfícies desenham.
export type UI = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'>

export type ExtInfo = GarraExt

export function healthOf(agent: GarraAgentEntry, health: Record<string, GarraHealth>): GarraHealth {
  return health[agent.id] ?? { id: agent.id, status: 'verificando', via: '—', detalhe: 'verificação em andamento', verificadoEm: 0 }
}

export function statusIcon(agent: GarraAgentEntry, status: GarraHealthStatus): string {
  return agent.tipo === 'principal' ? '🤖' : STATUS_ICONE[status]
}

export function statusText(status: GarraHealthStatus): string {
  return DESCRICAO_STATUS[status]
}

export function hhmm(ms: number): string {
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

export function seconds(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1).replace('.', ',')} s`
}

export function extsActive(exts: readonly ExtInfo[]): number {
  return exts.filter(x => x.habilitado && x.carregado !== false).length
}
