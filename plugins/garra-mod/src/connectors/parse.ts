// Interpreta o que um agente devolveu: os envelopes JSON do GarraIA
// (garra.ask.v1, garra.agent.v1), uma resposta OpenAI-compatível ou texto.

import type { GarraOutput } from '../../types'

export type Parsed = { ok: true; text: string; modelo?: string; extra?: string } | { ok: false; motivo: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function errorText(error: unknown): string {
  if (typeof error === 'string') return error
  if (isObj(error)) {
    const msg = error.message ?? error.detail ?? error.kind ?? error.code
    if (typeof msg === 'string') return msg
  }
  return 'erro sem descrição'
}

function parseJson(raw: string): unknown {
  const trimmed = raw.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    // Saída com linhas de log antes do envelope: tenta a última linha JSON.
    const lines = trimmed.split('\n').reverse()
    for (const line of lines) {
      const l = line.trim()
      if (!l.startsWith('{')) continue
      try {
        return JSON.parse(l)
      } catch {
        // continua
      }
    }
    return undefined
  }
}

export function parseEnvelope(raw: string, output: GarraOutput): Parsed {
  if (output === 'text') {
    const text = raw.trim()
    return text === '' ? { ok: false, motivo: 'o agente respondeu vazio' } : { ok: true, text }
  }
  const data = parseJson(raw)
  if (!isObj(data)) {
    if (output === 'auto' && raw.trim() !== '') return { ok: true, text: raw.trim() }
    return { ok: false, motivo: 'resposta malformada (JSON esperado)' }
  }
  if (data.ok === false) return { ok: false, motivo: errorText(data.error) }
  const answer = data.answer ?? data.final ?? data.result ?? data.text
  if (typeof answer !== 'string' || answer.trim() === '') return { ok: false, motivo: 'envelope sem resposta' }
  const modelo = typeof data.model === 'string' ? data.model : undefined
  let extra: string | undefined
  if (Array.isArray(data.tool_calls) && data.tool_calls.length > 0) {
    const names = data.tool_calls
      .map(call => (isObj(call) && typeof call.name === 'string' ? call.name : '?'))
      .slice(0, 20)
    extra = `ferramentas usadas pelo agente (${data.tool_calls.length}): ${names.join(', ')}`
  }
  return { ok: true, text: answer.trim(), ...(modelo ? { modelo } : {}), ...(extra ? { extra } : {}) }
}

export function parseChatCompletion(raw: string): Parsed {
  const data = parseJson(raw)
  if (!isObj(data)) return { ok: false, motivo: 'resposta HTTP malformada (JSON esperado)' }
  if (data.error !== undefined) return { ok: false, motivo: errorText(data.error) }
  const choices = Array.isArray(data.choices) ? data.choices : []
  const first = choices[0]
  const message = isObj(first) && isObj(first.message) ? first.message : undefined
  const content = message?.content
  const text = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map(part => (isObj(part) && typeof part.text === 'string' ? part.text : '')).join('')
      : ''
  if (text.trim() === '') return { ok: false, motivo: 'resposta HTTP sem conteúdo' }
  const modelo = typeof data.model === 'string' ? data.model : undefined
  return { ok: true, text: text.trim(), ...(modelo ? { modelo } : {}) }
}

// Junta os blocos de texto de um resultado MCP.
export function mcpText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map(block => (isObj(block) && block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
}
