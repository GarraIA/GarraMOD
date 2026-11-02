// O painel principal do Garra MOD (/garra): um Pane com nove seções.
// Tudo o que aparece vem do estado real; as ações chamam os handlers do MOD.

import type { GarraAgentEntry, GarraDiag, GarraHealth, GarraHistoryEntry, GarraPrefs, GarraTab, GarraTransport } from '../../types'
import { MARCA, SLOGAN } from '../localization/pt-BR'
import { oneLine } from '../security/sanitize'
import type { Cores } from '../themes/garra-brasil'
import { SKIN_NAME } from '../themes/garra-brasil'
import { type ExtInfo, extsActive, healthOf, hhmm, seconds, statusIcon, statusText, type UI } from './common'

export const TABS: ReadonlyArray<{ id: GarraTab; nome: string; hotkey: string }> = [
  { id: 'info', nome: 'Garra MOD', hotkey: '1' },
  { id: 'agentes', nome: 'Agentes', hotkey: '2' },
  { id: 'conversas', nome: 'Conversas', hotkey: '3' },
  { id: 'modelos', nome: 'Modelos', hotkey: '4' },
  { id: 'mods', nome: 'MODs', hotkey: '5' },
  { id: 'skills', nome: 'Skills', hotkey: '6' },
  { id: 'tema', nome: 'Tema', hotkey: '7' },
  { id: 'config', nome: 'Config', hotkey: '8' },
  { id: 'diagnostico', nome: 'Diagnóstico', hotkey: '9' },
]

export type SkillInfo = { nome: string; descricao: string }

export type PanelData = {
  cores: Cores
  tab: GarraTab
  version: string
  claudeVersion: string
  agents: readonly GarraAgentEntry[]
  health: Record<string, GarraHealth>
  history: readonly GarraHistoryEntry[]
  running: Record<string, number>
  prefs: GarraPrefs
  diag: GarraDiag
  exts: readonly ExtInfo[]
  skills: readonly SkillInfo[]
  tema: string
  idioma: string
  columns: number
}

export type PanelActions = {
  tab: (tab: GarraTab) => void
  probe: () => void
  setDefault: (id: string) => void
  applyTheme: () => void
  restoreTheme: () => void
  toggle: (key: 'personalidade' | 'boasVindas' | 'statusLine' | 'localizarNextSteps' | 'frasesEspera') => void
  step: (key: 'timeoutS' | 'concorrencia', delta: number) => void
  idioma: () => void
  diag: () => void
}

function transportLabel(t: GarraTransport): string {
  if (t.type === 'mcp') return `MCP ${t.server}/${t.tool}`
  if (t.type === 'process') return `CLI ${t.argv[0]}`
  return `HTTP ${t.baseUrl}`
}

export function panel(ui: UI, d: PanelData, act: PanelActions) {
  const { Box, Text, Button } = ui
  const c = d.cores
  const w = Math.max(20, d.columns)
  const line = (text: string, max = w - 2) => oneLine(text, max)

  const tabs = (
    <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
      {TABS.map(t => (
        <Button key={`tab-${t.id}`} hotkey={t.hotkey} plain variant={t.id === d.tab ? 'primary' : 'secondary'} label={t.id === d.tab ? `▸${t.nome}` : t.nome} onPress={() => act.tab(t.id)} />
      ))}
    </Box>
  )

  const head = (
    <Text>
      <Text color={c.amarelo} weight="bold">{MARCA}</Text>
      <Text color={c.fraco}> · v{d.version}</Text>
    </Text>
  )

  const section = (() => {
    switch (d.tab) {
      case 'info':
        return (
          <Box flexDirection="column">
            <Text color={c.texto}>🦜 O Garra MOD veste o Claude Code com a camisa do GarraIA: pt-BR, tema Garra Brasil e uma ponte real com agentes externos.</Text>
            <Text color={c.fraco}>Claude Code {d.claudeVersion} · Garra MOD {d.version} · {SLOGAN}</Text>
            <Text color={c.texto}> </Text>
            <Text color={c.verde} weight="bold">Comandos</Text>
            {[
              ['/garra [seção]', 'abre este painel'],
              ['/garra-status', 'estado geral do MOD'],
              ['/garra-agentes', 'lista, verifica e cadastra agentes'],
              ['/garra-consultar <agente> <pergunta>', 'consulta um agente agora'],
              ['/garra-tema [brasil|anterior|<skin>]', 'identidade visual'],
              ['/garra-plugins', 'MODs integrados'],
              ['/garra-config [chave valor]', 'preferências'],
              ['/garra-diagnostico', 'verificações de funcionamento'],
            ].map(([cmd, what]) => (
              <Text>
                <Text color={c.amarelo}>{cmd}</Text>
                <Text color={c.fraco}> — {what}</Text>
              </Text>
            ))}
          </Box>
        )
      case 'agentes':
        return (
          <Box flexDirection="column">
            {d.agents.map(agent => {
              const st = healthOf(agent, d.health)
              const running = d.running[agent.id] ?? 0
              return (
                <Box flexDirection="column" marginBottom={1}>
                  <Text>
                    {statusIcon(agent, st.status)} {agent.tipo === 'principal' ? '' : `${agent.icone ?? ''} `}<Text weight="bold" color={c.texto}>{agent.nome}</Text>
                    <Text color={c.fraco}> ({agent.id}, {agent.tipo}, {agent.origem})</Text>
                    {agent.id === d.prefs.agentePadrao && <Text color={c.amarelo}> ★ padrão</Text>}
                    {running > 0 && <Text color={c.amarelo}> ⏳ {running} em andamento</Text>}
                  </Text>
                  <Text color={c.texto}>  {agent.tipo === 'principal' ? 'conectado (sessão atual)' : `${statusText(st.status)} via ${st.via}`}</Text>
                  {agent.tipo !== 'principal' && <Text color={c.fraco}>  {line(st.detalhe)}</Text>}
                  <Text color={c.fraco}>  {line(agent.descricao)}</Text>
                  {agent.capacidades.length > 0 && <Text color={c.fraco}>  capacidades: {line(agent.capacidades.join(', '))}</Text>}
                  {agent.consulta && <Text color={c.fraco}>  consulta: {agent.consulta.map(transportLabel).join(' → ')}</Text>}
                  {agent.delegar && <Text color={c.fraco}>  delegar (pede aprovação): {agent.delegar.map(transportLabel).join(' → ')}</Text>}
                  {agent.tipo !== 'principal' && agent.id !== d.prefs.agentePadrao && (
                    <Button key={`padrao-${agent.id}`} label={`Tornar ${agent.nome} o padrão`} onPress={() => act.setDefault(agent.id)} />
                  )}
                </Box>
              )
            })}
            <Button key="probe" variant="primary" label="Verificar conexões agora" onPress={act.probe} />
            <Text color={c.fraco}>Novos agentes: ~/.claude/garra-mod/agentes.json ou /garra-agentes adicionar {'{json}'}</Text>
          </Box>
        )
      case 'conversas': {
        const last = [...d.history].reverse().slice(0, 12)
        const totalRunning = Object.values(d.running).reduce((a, b) => a + b, 0)
        return (
          <Box flexDirection="column">
            {totalRunning > 0 && <Text color={c.amarelo}>⏳ {totalRunning} chamada(s) em andamento</Text>}
            {last.length === 0 && <Text color={c.fraco}>Nenhuma consulta ou delegação nesta instalação ainda. Experimente: /garra-consultar garraia Olá!</Text>}
            {last.map(e => (
              <Box flexDirection="column" marginBottom={1}>
                <Text>
                  <Text color={c.fraco}>{hhmm(e.em)} </Text>
                  <Text color={e.ok ? c.verde : c.erro}>{e.ok ? '✔' : '✘'} </Text>
                  <Text weight="bold" color={c.texto}>{e.nome}</Text>
                  <Text color={c.fraco}> · {e.modo} · {seconds(e.ms)} · {e.via}{e.modelo ? ` · ${e.modelo}` : ''}{e.redacoes > 0 ? ` · ${e.redacoes} redação(ões)` : ''}{e.decisao ? ` · ${e.decisao}` : ''}</Text>
                </Text>
                <Text color={c.texto}>  ❯ {line(e.pergunta, w - 6)}</Text>
                <Text color={c.fraco}>  ↳ {line(e.resposta, w - 6)}</Text>
              </Box>
            ))}
          </Box>
        )
      }
      case 'modelos':
        return (
          <Box flexDirection="column">
            {d.agents.filter(a => a.tipo !== 'principal').map(agent => {
              const seen = [...d.history].reverse().find(e => e.agente === agent.id && e.modelo)
              return (
                <Text>
                  {agent.icone ?? '•'} <Text weight="bold" color={c.texto}>{agent.nome}</Text>
                  <Text color={c.fraco}>: configurado {agent.modelo ?? 'pelo próprio agente'}; último observado {seen?.modelo ?? '—'}</Text>
                </Text>
              )
            })}
            <Text color={c.fraco}>O modelo de cada agente externo é decidido pela configuração dele (garra config, hermes model). O Garra MOD não troca o modelo do Claude Code.</Text>
          </Box>
        )
      case 'mods':
        return (
          <Box flexDirection="column">
            <Text color={c.texto}>🧩 {extsActive(d.exts)} de {d.exts.length} MODs integrados ativos</Text>
            {d.exts.map(x => (
              <Text>
                {x.habilitado ? (x.carregado === false ? '🟡' : '🟢') : '⚪'} <Text weight="bold" color={c.texto}>{x.nome}</Text>
                <Text color={c.fraco}> — {x.habilitado ? 'habilitado' : 'não habilitado'}{x.carregado === true ? ', carregado' : x.carregado === false ? ', não carregado' : ''}. {line(x.detalhe, w - 30)}</Text>
              </Text>
            ))}
          </Box>
        )
      case 'skills':
        return (
          <Box flexDirection="column">
            {d.skills.length === 0 && <Text color={c.fraco}>Nenhuma skill do Garra MOD listada nesta sessão.</Text>}
            {d.skills.map(s => (
              <Text>
                <Text color={c.amarelo}>/{s.nome}</Text>
                <Text color={c.fraco}> — {line(s.descricao, w - s.nome.length - 6)}</Text>
              </Text>
            ))}
            <Text color={c.fraco}>Skills carregam sob demanda: só a descrição fica no contexto até serem usadas.</Text>
          </Box>
        )
      case 'tema':
        return (
          <Box flexDirection="column">
            <Text>
              <Text color="#009739">██</Text>
              <Text color="#FFDF00">██</Text>
              <Text color="#002776">██</Text>
              <Text color="#FFFFFF">██</Text>
              <Text color={c.texto}> Garra Brasil — verde, amarelo, azul e branco</Text>
            </Text>
            <Text color={c.fraco}>O tema "{SKIN_NAME}" é salvo e aplicado pelo Claude Skins (ferramenta oficial dele); /skin continua trocando livremente.</Text>
            {d.tema !== '' && <Text color={c.texto}>{line(d.tema)}</Text>}
            <Box flexDirection="row" columnGap={1}>
              <Button key="tema-aplicar" variant="primary" label="Aplicar Garra Brasil" onPress={act.applyTheme} />
              <Button key="tema-anterior" label="Voltar ao tema anterior" onPress={act.restoreTheme} />
            </Box>
          </Box>
        )
      case 'config':
        return (
          <Box flexDirection="column">
            {(
              [
                ['personalidade', 'Personalidade GarraIA no prompt'],
                ['boasVindas', 'Cartão de abertura'],
                ['statusLine', 'Indicador na linha de status'],
                ['localizarNextSteps', 'Rótulos do Next Steps em pt-BR'],
                ['frasesEspera', 'Frases de espera do GarraIA no spinner'],
              ] as const
            ).map(([key, label]) => (
              <Box flexDirection="row" columnGap={1}>
                <Button key={`cfg-${key}`} label={d.prefs[key] ? 'ligado' : 'desligado'} onPress={() => act.toggle(key)} />
                <Text color={c.texto}>{label}</Text>
              </Box>
            ))}
            <Box flexDirection="row" columnGap={1}>
              <Button key="cfg-timeout-menos" label="−" onPress={() => act.step('timeoutS', -30)} />
              <Button key="cfg-timeout-mais" label="+" onPress={() => act.step('timeoutS', 30)} />
              <Text color={c.texto}>Prazo padrão das consultas: {d.prefs.timeoutS} s</Text>
            </Box>
            <Box flexDirection="row" columnGap={1}>
              <Button key="cfg-conc-menos" label="−" onPress={() => act.step('concorrencia', -1)} />
              <Button key="cfg-conc-mais" label="+" onPress={() => act.step('concorrencia', 1)} />
              <Text color={c.texto}>Consultas paralelas ao mesmo tempo: {d.prefs.concorrencia}</Text>
            </Box>
            <Text color={c.texto}>Agente padrão: {d.prefs.agentePadrao} <Text color={c.fraco}>(troque na seção Agentes)</Text></Text>
            <Box flexDirection="row" columnGap={1}>
              <Button key="cfg-idioma" label="Usar português (Brasil)" onPress={act.idioma} />
              <Text color={c.texto}>Idioma do Claude Code: {d.idioma || 'padrão'}</Text>
            </Box>
            <Text color={c.fraco}>Chaves de API (opcionais) ficam no armazenamento seguro: /config → garra-mod.</Text>
          </Box>
        )
      case 'diagnostico':
        return (
          <Box flexDirection="column">
            <Button key="diag-rodar" variant="primary" label="Executar diagnóstico" onPress={act.diag} />
            {d.diag === null && <Text color={c.fraco}>Ainda não executado nesta sessão.</Text>}
            {d.diag !== null && <Text color={c.fraco}>Executado às {hhmm(d.diag.em)}</Text>}
            {d.diag?.itens.map(item => (
              <Text>
                {item.ok === true ? '✅' : item.ok === false ? '❌' : '➖'} <Text weight="bold" color={c.texto}>{item.nome}</Text>
                <Text color={c.fraco}> — {line(item.detalhe, w - item.nome.length - 8)}</Text>
              </Text>
            ))}
          </Box>
        )
    }
  })()

  return (
    <Box flexDirection="column" rowGap={1}>
      {head}
      {tabs}
      {section}
    </Box>
  )
}
