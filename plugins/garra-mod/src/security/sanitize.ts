// Proteções do Garra MOD:
// - o que sai para um agente externo passa por `redactSecrets`;
// - o que volta passa por `cleanOutput` (sem sequências de escape, sem
//   caracteres invisíveis, com tamanho limitado);
// - destinos HTTP passam por `checkDestination` (loopback por padrão).

// Sequências de escape de terminal (CSI, OSC, ESC simples).
const ESCAPES = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g
// Caracteres de tag Unicode só servem para esconder instruções.
const TAGS = /[\u{E0000}-\u{E007F}]/gu
// Controles e formatação invisível, exceto \n e \t.
const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/g

export function cleanOutput(text: string, max = 48_000): string {
  const safe = text.replace(ESCAPES, '').replace(TAGS, '').replace(INVISIBLE, '').replace(/\r\n?/g, '\n').trim()
  const points = [...safe]
  if (points.length <= max) return safe
  return `${points.slice(0, max).join('')}\n\n[… resposta cortada pelo Garra MOD: ${points.length - max} caracteres a mais]`
}

// Uma linha curta para listas e títulos.
export function oneLine(text: string, max = 80): string {
  const flat = cleanOutput(text, max * 4).replace(/\s+/g, ' ').trim()
  const points = [...flat]
  return points.length > max ? `${points.slice(0, max - 1).join('')}…` : flat
}

type Pattern = { re: RegExp; replace: string | ((match: string, ...groups: string[]) => string) }

const PATTERNS: Pattern[] = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replace: '[CHAVE PRIVADA REMOVIDA]' },
  { re: /\bsk-(?:ant-|or-|proj-)?[A-Za-z0-9_-]{20,}/g, replace: '[SEGREDO REMOVIDO]' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{30,}/g, replace: '[SEGREDO REMOVIDO]' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{40,}/g, replace: '[SEGREDO REMOVIDO]' },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, replace: '[SEGREDO REMOVIDO]' },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, replace: '[SEGREDO REMOVIDO]' },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/g, replace: '[SEGREDO REMOVIDO]' },
  { re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, replace: '[TOKEN REMOVIDO]' },
  { re: /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{20,}/gi, replace: (_m, word) => `${word} [TOKEN REMOVIDO]` },
  {
    re: /\b([A-Za-z0-9_]*(?:api[_-]?key|token|secret|password|passwd|senha|credential)[A-Za-z0-9_]*)(\s*[:=]\s*)(["']?)([^\s"'`]{8,})\3/gi,
    replace: (_m, name, sep, quote) => `${name}${sep}${quote}[SEGREDO REMOVIDO]${quote}`,
  },
]

export function redactSecrets(text: string): { text: string; count: number } {
  let count = 0
  let out = text
  for (const { re, replace } of PATTERNS) {
    out = out.replace(re, (...args: unknown[]) => {
      count += 1
      const match = String(args[0])
      const groups = args.slice(1, -2).map(value => (typeof value === 'string' ? value : ''))
      return typeof replace === 'string' ? replace : replace(match, ...groups)
    })
  }
  return { text: out, count }
}

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

// Valida o destino de um transporte HTTP. Responde null quando aceito, ou o motivo.
export function checkDestination(base: string, allowRemote: boolean): string | null {
  let url: URL
  try {
    url = new URL(base)
  } catch {
    return `endereço inválido: ${oneLine(base, 60)}`
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return `protocolo não permitido: ${url.protocol}`
  if (url.username !== '' || url.password !== '') return 'credenciais embutidas na URL não são aceitas; use o campo auth'
  if (LOOPBACK.has(url.hostname)) return null
  if (!allowRemote) return `destino fora desta máquina (${url.hostname}) exige "allowRemote": true`
  if (url.protocol !== 'https:') return `destino remoto (${url.hostname}) exige https`
  return null
}

// Procura segredos escritos diretamente em uma definição de agente.
export function findInlineSecret(value: unknown): string | null {
  const text = JSON.stringify(value) ?? ''
  const { count } = redactSecrets(text)
  return count > 0 ? 'a definição parece conter um segredo; use auth por "option", "env" ou "command"' : null
}
