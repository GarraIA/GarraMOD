// O cartão de abertura do Garra MOD: uma linha colocada no
// transcript no início da sessão, com os estados reais dos agentes e dos MODs.

import type { RenderElement } from 'claude-code'
import type { GarraAgentEntry, GarraHealth } from '../../types'
import { MARCA, SLOGAN, TXT } from '../localization/pt-BR'
import type { Cores } from '../themes/garra-brasil'
import { type ExtInfo, extsActive, healthOf, statusIcon, statusText, type UI } from './common'

export type WelcomeData = {
  cores: Cores
  agents: readonly GarraAgentEntry[]
  health: Record<string, GarraHealth>
  exts: readonly ExtInfo[]
  version: string
  columns: number
  // O logo oficial do GarraRUST (terminal com imagens); sem ele, só o texto.
  logo?: RenderElement
}

export function welcomeCard(ui: UI, d: WelcomeData) {
  const { Box, Text } = ui
  const c = d.cores
  const rule = '━'.repeat(Math.max(10, Math.min(46, d.columns - 6)))
  const active = extsActive(d.exts)
  const statusColor = (s: string) => (s === 'conectado' ? c.verde : s === 'disponível' ? c.azul : s === 'verificando' || s === 'configurado' ? c.fraco : c.erro)

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={c.borda} paddingX={1}>
      <Box flexDirection="row" columnGap={1}>
        {d.logo}
        <Text>
          <Text color={c.amarelo} weight="bold">{MARCA}</Text>
          <Text color={c.fraco}> · Garra MOD v{d.version}</Text>
        </Text>
      </Box>
      <Text color={c.verde}>{rule}</Text>
      <Text color={c.texto}>{TXT.modAtivo}</Text>
      {d.agents.map(agent => {
        const st = healthOf(agent, d.health)
        return (
          <Text>
            {statusIcon(agent, st.status)} <Text weight="bold" color={c.texto}>{agent.nome}</Text>
            <Text color={c.texto}>: </Text>
            <Text color={statusColor(st.status)}>{agent.tipo === 'principal' ? TXT.claudeAtivo : statusText(st.status)}</Text>
            {agent.tipo !== 'principal' && st.via !== '—' && <Text color={c.fraco}> ({st.via})</Text>}
          </Text>
        )
      })}
      <Text>
        🧩 <Text weight="bold" color={c.texto}>Extensões</Text>
        <Text color={c.texto}>: {TXT.extensoes(active, d.exts.length)}</Text>
        <Text color={c.fraco}> ({d.exts.filter(x => x.habilitado).map(x => x.nome).join(' · ') || 'nenhuma'})</Text>
      </Text>
      <Text color={c.verde}>{rule}</Text>
      <Text color={c.fraco}>
        {SLOGAN} · {TXT.abrirPainel}
      </Text>
    </Box>
  )
}
