// Textos que o Garra MOD devolve ao modelo e mostra nos comandos.

import type { GarraAgentEntry, GarraExt, GarraHealth, GarraPrefs } from '../../types'
import type { CallOutcome, Modo } from '../connectors'
import { MARCA, TXT } from '../localization/pt-BR'
import { extsActive, healthOf, seconds, statusIcon, statusText } from '../interface/common'

// `decisao` (delegação): como foi aprovada e o que a pessoa escolheu, logo abaixo do título.
export function formatOutcome(agent: GarraAgentEntry, modo: Modo, out: CallOutcome, decisao?: string): string {
  const icon = agent.icone ?? '🤖'
  const meta = [out.via !== '—' ? `via ${out.via}` : '', out.modelo ? `modelo ${out.modelo}` : '', seconds(out.ms)].filter(Boolean).join(' · ')
  const notes: string[] = []
  if (out.redacoes > 0) notes.push(TXT.redigido(out.redacoes))
  if (out.extra) notes.push(out.extra)
  if (out.ok && out.tentativas.length > 0) notes.push(`antes, sem sucesso: ${out.tentativas.join(' | ')}`)
  const footer = notes.length > 0 ? `\n\n[Garra MOD: ${notes.join(' ')}]` : ''
  const decided = decisao ? `\n[Garra MOD: ${decisao}]` : ''
  if (out.ok) {
    const what = modo === 'consulta' ? 'respondeu' : 'concluiu a tarefa delegada'
    return `${icon} ${agent.nome} ${what} (${meta}):${decided}\n\n${out.texto}${footer}`
  }
  return `❌ ${agent.nome} não respondeu (${meta}): ${out.texto}${decided}${footer}`
}

export function formatAgents(agents: readonly GarraAgentEntry[], health: Record<string, GarraHealth>, prefs: GarraPrefs): string {
  return agents
    .map(agent => {
      const h = healthOf(agent, health)
      const star = agent.id === prefs.agentePadrao ? ' ★ padrão' : ''
      const state = agent.tipo === 'principal' ? TXT.claudeAtivo : `${statusText(h.status)}${h.via !== '—' ? ` via ${h.via}` : ''}`
      const perms = agent.tipo === 'principal' ? '' : ` · consulta ${agent.permissoes.consulta ? 'sim' : 'não'} · delegar ${agent.permissoes.delegar ? 'sim (com aprovação)' : 'não'}`
      const detail = agent.tipo === 'principal' ? '' : `\n    ${h.detalhe}`
      return `${statusIcon(agent, h.status)} ${agent.nome} (${agent.id}, ${agent.origem})${star}: ${state}${perms}${detail}`
    })
    .join('\n')
}

export function formatExts(exts: readonly GarraExt[]): string {
  const lines = exts.map(x => {
    const icon = x.habilitado ? (x.carregado === false ? '🟡' : '🟢') : '⚪'
    const state = x.habilitado ? `habilitado${x.carregado === true ? ' e carregado' : x.carregado === false ? ', mas não carregado' : ''}` : 'não habilitado'
    return `${icon} ${x.nome}: ${state} — ${x.detalhe}`
  })
  return `🧩 Extensões: ${TXT.extensoes(extsActive(exts), exts.length)}\n${lines.join('\n')}`
}

export function formatStatus(d: {
  version: string
  claudeVersion: string
  agents: readonly GarraAgentEntry[]
  health: Record<string, GarraHealth>
  prefs: GarraPrefs
  exts: readonly GarraExt[]
  historico: number
}): string {
  return [
    `${MARCA} · v${d.version} · Claude Code ${d.claudeVersion}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    TXT.modAtivo,
    formatAgents(d.agents, d.health, d.prefs),
    formatExts(d.exts),
    `⚙️ Personalidade ${d.prefs.personalidade ? 'ligada' : 'desligada'} · prazo ${d.prefs.timeoutS} s · ${d.prefs.concorrencia} consultas paralelas · ${d.historico} conversas no histórico`,
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'Painel: /garra · Diagnóstico: /garra-diagnostico',
  ].join('\n')
}
