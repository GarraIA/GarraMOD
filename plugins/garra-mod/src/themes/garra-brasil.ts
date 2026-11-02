// Tema Garra Brasil. A paleta oficial (verde #009739, amarelo #FFDF00, azul
// #002776, branco #FFFFFF) é a referência; os tons abaixo são as variantes que
// leem bem em cada fundo. Quem pinta o transcript é o Claude Skins: o tema é
// salvo nele pela ferramenta oficial `mcp__skins__design`, e o próprio Skins
// deriva a variante clara quando o terminal usa tema claro.

import type { EngineInterface } from 'claude-code'

export const BRASIL = { verde: '#009739', amarelo: '#FFDF00', azul: '#002776', branco: '#FFFFFF' } as const

export const SKIN_NAME = 'garra-brasil'
export const SKIN_BASE = 'one-dark'

// Paleta do Skins para fundo escuro. `user` (trilho, marcador do prompt e
// spinner) é o amarelo; verde para sucesso e execução; azul claro para leitura.
export const SKIN_PALETTE = {
  user: '#FFDF00',
  fg: '#E8EEE9',
  muted: '#98A89E',
  surface: '#14261B',
  zebra: '#101D15',
  ok: '#2BB673',
  err: '#FF5F5F',
  warn: '#FF9F1C',
  read: '#6EA8FE',
  write: '#F5D90A',
  run: '#3DDC84',
  search: '#7FD1C7',
  web: '#9DB7FF',
  mcp: '#FFFFFF',
  other: '#C9D3CC',
} as const

export const SKIN_SPINNER = ['Pensando', 'Codando', 'Caprichando', 'Investigando', 'Arquitetando', 'Destrinchando', 'Lapidando', 'Batucando', 'Afinando', 'Garimpando']
export const SKIN_DONE = ['Feito', 'Pronto', 'Caprichado', 'Resolvido', 'Entregue', 'Finalizado']

// Cores das superfícies do próprio MOD (cartão de abertura e painel).
export type Cores = { verde: string; amarelo: string; azul: string; texto: string; fraco: string; erro: string; borda: string }

export function cores(isLight: boolean): Cores {
  return isLight
    ? { verde: '#007A2E', amarelo: '#8A6D00', azul: BRASIL.azul, texto: '#1A1A1A', fraco: '#5F6B63', erro: '#B3261E', borda: BRASIL.verde }
    : { verde: '#2BB673', amarelo: BRASIL.amarelo, azul: '#6EA8FE', texto: '#E8EEE9', fraco: '#98A89E', erro: '#FF5F5F', borda: BRASIL.verde }
}

export async function isLightTheme($: EngineInterface): Promise<boolean> {
  try {
    const theme = await $.settings.read({ key: 'theme' })
    return typeof theme === 'string' && theme.includes('light')
  } catch {
    return false
  }
}

export const SKINS_TOOL = 'mcp__skins__design'

export async function skinsAvailable($: EngineInterface): Promise<boolean> {
  try {
    return (await $.tool.list()).some(t => t.name === SKINS_TOOL)
  } catch {
    return false
  }
}

// O resultado da ferramenta do Skins como texto (ou JSON em texto).
function resultText(res: { text?: string; result?: unknown; deny?: string; isError?: true }): string {
  if (res.deny !== undefined) return res.deny
  if (typeof res.text === 'string') return res.text
  return typeof res.result === 'string' ? res.result : JSON.stringify(res.result ?? '')
}

export async function skinsCall($: EngineInterface, input: Record<string, unknown>): Promise<{ ok: boolean; text: string }> {
  const res = (await $.tool.call({ tool: SKINS_TOOL, ...input } as never)) as { text?: string; result?: unknown; deny?: string; isError?: true }
  const ok = res.deny === undefined && res.isError !== true
  return { ok, text: resultText(res) }
}

export async function skinsCurrent($: EngineInterface): Promise<{ current: string; made: string[] } | null> {
  const show = await skinsCall($, { action: 'show' })
  if (!show.ok) return null
  try {
    const data = JSON.parse(show.text) as { current?: unknown; made?: unknown }
    return {
      current: typeof data.current === 'string' ? data.current : '?',
      made: Array.isArray(data.made) ? data.made.filter((x): x is string => typeof x === 'string') : [],
    }
  } catch {
    return null
  }
}

// Salva (ou atualiza) o tema garra-brasil no Skins e o aplica.
export async function saveGarraSkin($: EngineInterface, apply: boolean) {
  return skinsCall($, {
    action: 'save',
    name: SKIN_NAME,
    label: 'Garra Brasil',
    base: SKIN_BASE,
    palette: SKIN_PALETTE,
    spinner: SKIN_SPINNER,
    done: SKIN_DONE,
    apply,
  })
}
