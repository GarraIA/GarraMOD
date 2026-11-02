// O que a sessão tem de verdade: os MODs integrados (habilitados e
// carregados) e as skills do Garra MOD. Nada aqui é suposto.

import type { EngineInterface } from 'claude-code'
import type { GarraExt, GarraSkill } from '../../types'

type Known = { id: string; nome: string; prefixo: string; tool?: string; command?: string; detalhe: string }

export const KNOWN_MODS: readonly Known[] = [
  { id: 'skins', nome: 'Claude Skins', prefixo: 'skins@', tool: 'mcp__skins__design', command: 'skin', detalhe: 'pinta o transcript; o tema garra-brasil vive nele' },
  { id: 'plan-progress', nome: 'Plan Progress', prefixo: 'plan-progress@', tool: 'mcp__plan-progress__plan_progress', detalhe: 'barras de progresso e faixas dos subagentes acima do prompt' },
  { id: 'next-steps', nome: 'Next Steps', prefixo: 'next-steps@', detalhe: 'sugere os próximos passos no fim de cada turno (não expõe comando para conferir a carga)' },
  { id: 'you-should-know', nome: 'You Should Know', prefixo: 'cc-plugin-you-should-know@', detalhe: 'embutido no Claude Code: um agente lateral avisa riscos em tarefas longas' },
]

export async function detectExts($: EngineInterface): Promise<GarraExt[]> {
  const [enabledRaw, tools, commands] = await Promise.all([
    $.settings.read({ key: 'enabledPlugins' }).catch(() => undefined),
    $.tool.list().catch(() => []),
    $.command.list().catch(() => []),
  ])
  const enabled = (typeof enabledRaw === 'object' && enabledRaw !== null ? enabledRaw : {}) as Record<string, unknown>
  const toolNames = new Set(tools.map(t => t.name))
  const commandNames = new Set(commands.map(c => c.name))
  return KNOWN_MODS.map(mod => {
    const habilitado = Object.entries(enabled).some(([key, on]) => key.startsWith(mod.prefixo) && on === true)
    let carregado: boolean | null = null
    if (mod.tool !== undefined || mod.command !== undefined) {
      carregado = (mod.tool !== undefined && toolNames.has(mod.tool)) || (mod.command !== undefined && commandNames.has(mod.command))
    }
    return { id: mod.id, nome: mod.nome, habilitado, carregado: habilitado ? carregado : false, detalhe: mod.detalhe }
  })
}

export async function detectSkills($: EngineInterface): Promise<GarraSkill[]> {
  const commands = await $.command.list().catch(() => [])
  return commands
    .filter(c => c.source === 'plugin' && /(^|:)garra-/.test(c.name) && c.name.includes(':'))
    .map(c => ({ nome: c.name, descricao: c.description }))
}

export async function toolNameSet($: EngineInterface): Promise<Set<string>> {
  return new Set((await $.tool.list().catch(() => [])).map(t => t.name))
}
