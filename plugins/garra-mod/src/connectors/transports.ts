// Os adaptadores de transporte do Garra MOD. Cada um faz a chamada real ao
// agente externo pelo que o Claude Code oferece a um mod:
//   mcp          → $.mcp.call   (um servidor MCP conectado à sessão)
//   process      → $.process.spawn (um executável local; mensagem pela entrada padrão)
//   openai-http  → $.http.fetch (um endpoint /v1/chat/completions)
// Nenhum adaptador simula resposta. "unavailable" passa a vez ao próximo
// transporte da lista; "error" encerra a tentativa com o motivo real.

import type { EngineInterface, PluginOptions } from 'claude-code'
import type { GarraAuth, GarraTransport } from '../../types'
import { TXT } from '../localization/pt-BR'
import { checkDestination, cleanOutput, oneLine } from '../security/sanitize'
import type { ModeloGarraIA } from './garraia-config'
import { mcpText, parseChatCompletion, parseEnvelope } from './parse'

export type TransportCtx = {
  options: PluginOptions
  timeoutS: number
  cwd: string
  // Modo skip nesta delegação: escolha da pessoa ou Claude Code em modo bypass (nunca do modelo).
  skip?: boolean
  // Provedor e modelo do config.yml do GarraIA (`{garraia.provider}`/`{garraia.model}`).
  garraia?: ModeloGarraIA | null
}

export type TransportResult =
  | { kind: 'ok'; text: string; via: string; modelo?: string; extra?: string }
  // `silencioso`: só faltou configurar algo (ex.: a chave). Passa a vez sem
  // aparecer na resposta; só entra no erro final se nada funcionar.
  | { kind: 'unavailable'; via: string; motivo: string; silencioso?: true }
  | { kind: 'error'; via: string; motivo: string }

const TIMEOUT = Symbol('timeout')
const MAX_OUTPUT = 512 * 1024

// Um prazo que não consome o orçamento do hook: $.clock.after dispara num
// despacho próprio, enquanto o hook espera uma chamada `$` em andamento.
export function deadline($: EngineInterface, ms: number): { promise: Promise<typeof TIMEOUT>; cancel: () => void } {
  let fire: (v: typeof TIMEOUT) => void = () => undefined
  const promise = new Promise<typeof TIMEOUT>(resolve => {
    fire = resolve
  })
  const timer = $.clock.after(Math.max(1, Math.round(ms)), () => fire(TIMEOUT))
  return { promise, cancel: () => timer.cancel() }
}

function fill(value: string, ctx: TransportCtx): string {
  return value.replaceAll('{timeout}', String(ctx.timeoutS)).replaceAll('{cwd}', ctx.cwd)
}

const GARRAIA_ARG = /\{garraia\.(provider|model)\}/g

// Algum argumento MCP pede o provedor ou o modelo do GarraIA?
export function usaModeloGarraIA(t: GarraTransport): boolean {
  return t.type === 'mcp' && Object.values(t.args ?? {}).some(v => typeof v === 'string' && /\{garraia\.(provider|model)\}/.test(v))
}

// `undefined`: o argumento fica de fora (sem config do GarraIA, vale o padrão dele).
function fillArg(value: string | number | boolean, ctx: TransportCtx): string | number | boolean | undefined {
  if (value === '{timeout}') return ctx.timeoutS
  if (typeof value !== 'string') return value
  let falta = false
  const out = fill(value, ctx).replace(GARRAIA_ARG, (_, campo: 'provider' | 'model') => {
    const v = ctx.garraia?.[campo]
    if (!v) falta = true
    return v ?? ''
  })
  return falta ? undefined : out
}

export function mcpToolName(server: string, tool: string): string {
  const norm = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_')
  return `mcp__${norm(server)}__${norm(tool)}`
}

const errMsg = (error: unknown) => oneLine(error instanceof Error ? error.message : String(error), 200)

// ------------------------------------------------------------------ auth

export async function resolveAuth($: EngineInterface, ctx: TransportCtx, auth: GarraAuth | undefined): Promise<{ token: string | null } | { falta: string; ausente: boolean }> {
  if (auth === undefined || auth.type === 'none') return { token: null }
  if (auth.source === 'option') {
    const value = ctx.options[auth.option]
    return typeof value === 'string' && value.trim() !== ''
      ? { token: value.trim() }
      : { falta: `chave não configurada (defina "${auth.option}" em /config → garra-mod)`, ausente: true }
  }
  if (auth.source === 'env') {
    const value = auth.env === 'GARRAIA_GATEWAY_API_KEY' ? await $.env.get('GARRAIA_GATEWAY_API_KEY') : await $.env.get('API_SERVER_KEY')
    return value && value.trim() !== '' ? { token: value.trim() } : { falta: `variável ${auth.env} não definida`, ausente: true }
  }
  try {
    const run = await $.process.run(auth.argv, { timeoutMs: 10_000 })
    const token = run.stdout.split('\n')[0]?.trim() ?? ''
    return run.exitCode === 0 && token !== '' ? { token } : { falta: `o comando de segredo ${auth.argv[0]} não devolveu valor`, ausente: false }
  } catch (error) {
    return { falta: `o comando de segredo ${auth.argv[0]} falhou: ${errMsg(error)}`, ausente: false }
  }
}

// ------------------------------------------------------------------ mcp

async function runMcp($: EngineInterface, ctx: TransportCtx, t: Extract<GarraTransport, { type: 'mcp' }>, message: string): Promise<TransportResult> {
  const via = `MCP ${t.server}/${t.tool}`
  const args: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(t.args ?? {})) {
    const filled = fillArg(value, ctx)
    if (filled !== undefined) args[key] = filled
  }
  args[t.messageArg] = message
  // Margem: o servidor tem o próprio prazo e responde o erro dele.
  const limit = deadline($, (ctx.timeoutS + 15) * 1000)
  try {
    const res = await Promise.race([$.mcp.call(t.server, t.tool, args), limit.promise])
    if (res === TIMEOUT) return { kind: 'error', via, motivo: TXT.tempoEsgotado(ctx.timeoutS) }
    const raw = mcpText(res.content)
    if (res.isError) return { kind: 'error', via, motivo: oneLine(raw || 'o servidor MCP devolveu erro', 400) }
    const parsed = parseEnvelope(raw, t.output ?? 'auto')
    if (!parsed.ok) return { kind: 'error', via, motivo: parsed.motivo }
    return { kind: 'ok', via, text: parsed.text, ...(parsed.modelo ? { modelo: parsed.modelo } : {}), ...(parsed.extra ? { extra: parsed.extra } : {}) }
  } catch (error) {
    return { kind: 'unavailable', via, motivo: `servidor MCP "${t.server}" indisponível: ${errMsg(error)}` }
  } finally {
    limit.cancel()
  }
}

// ------------------------------------------------------------------ process

async function runProcess($: EngineInterface, ctx: TransportCtx, t: Extract<GarraTransport, { type: 'process' }>, message: string): Promise<TransportResult> {
  const skipping = ctx.skip === true && (t.skipArgs?.length ?? 0) > 0
  const argv = [...t.argv, ...(skipping ? (t.skipArgs ?? []) : [])].map(a => fill(a, ctx))
  const exe = argv[0] ?? '?'
  const via = skipping ? `CLI ${exe} (modo skip: ${(t.skipArgs ?? []).join(' ')})` : `CLI ${exe}`
  // Sair do laço (prazo, interrupção da pessoa ou recarga do mod) encerra o processo.
  const stream = $.process.spawn({ argv, cwd: ctx.cwd, input: message })
  const limit = deadline($, ctx.timeoutS * 1000)
  let out = ''
  let err = ''
  let started = false
  try {
    for (;;) {
      const step = await Promise.race([stream.next(), limit.promise])
      if (step === TIMEOUT) {
        void stream.return(undefined as never).catch(() => undefined)
        return { kind: 'error', via, motivo: TXT.tempoEsgotado(ctx.timeoutS) }
      }
      started = true
      if (step.done) {
        const end = step.value
        if (end.code !== 0) {
          const tail = oneLine(err.split('\n').filter(l => l.trim() !== '').slice(-4).join(' · ') || out, 400)
          return { kind: 'error', via, motivo: `saiu com código ${end.code ?? end.signal ?? '?'}${tail ? `: ${tail}` : ''}` }
        }
        break
      }
      if (step.value.stream === 'stdout') out += step.value.text
      else err += step.value.text
      if (out.length > MAX_OUTPUT) {
        void stream.return(undefined as never).catch(() => undefined)
        break
      }
    }
  } catch (error) {
    return started
      ? { kind: 'error', via, motivo: errMsg(error) }
      : { kind: 'unavailable', via, motivo: `não foi possível iniciar "${exe}": ${errMsg(error)}` }
  } finally {
    limit.cancel()
  }
  const parsed = parseEnvelope(out, t.output ?? 'auto')
  if (!parsed.ok) return { kind: 'error', via, motivo: parsed.motivo }
  return { kind: 'ok', via, text: parsed.text, ...(parsed.modelo ? { modelo: parsed.modelo } : {}), ...(parsed.extra ? { extra: parsed.extra } : {}) }
}

// ------------------------------------------------------------------ openai-http

async function runHttp($: EngineInterface, ctx: TransportCtx, t: Extract<GarraTransport, { type: 'openai-http' }>, message: string): Promise<TransportResult> {
  const via = `HTTP ${t.baseUrl}`
  const bad = checkDestination(t.baseUrl, t.allowRemote === true)
  if (bad) return { kind: 'error', via, motivo: bad }
  const auth = await resolveAuth($, ctx, t.auth)
  if ('falta' in auth) return { kind: 'unavailable', via, motivo: auth.falta, ...(auth.ausente ? { silencioso: true as const } : {}) }
  const messages = [...(t.systemPrompt ? [{ role: 'system', content: t.systemPrompt }] : []), { role: 'user', content: message }]
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (auth.token) headers.authorization = `Bearer ${auth.token}`
  const limit = deadline($, ctx.timeoutS * 1000)
  try {
    const res = await Promise.race([
      $.http.fetch(`${t.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: t.model, messages, stream: false }),
      }),
      limit.promise,
    ])
    if (res === TIMEOUT) return { kind: 'error', via, motivo: TXT.tempoEsgotado(ctx.timeoutS) }
    if (res.status === 401 || res.status === 403) return { kind: 'unavailable', via, motivo: `autenticação recusada (HTTP ${res.status})` }
    if (res.status === 404) return { kind: 'unavailable', via, motivo: 'rota /v1/chat/completions não encontrada (HTTP 404)' }
    if (!res.ok) return { kind: 'error', via, motivo: `HTTP ${res.status}: ${oneLine(res.text, 200)}` }
    const parsed = parseChatCompletion(res.text.slice(0, MAX_OUTPUT))
    if (!parsed.ok) return { kind: 'error', via, motivo: parsed.motivo }
    return { kind: 'ok', via, text: parsed.text, ...(parsed.modelo ? { modelo: parsed.modelo } : {}) }
  } catch (error) {
    return { kind: 'unavailable', via, motivo: `sem conexão com ${t.baseUrl}: ${errMsg(error)}` }
  } finally {
    limit.cancel()
  }
}

export async function runTransport($: EngineInterface, ctx: TransportCtx, t: GarraTransport, message: string): Promise<TransportResult> {
  const result = t.type === 'mcp' ? await runMcp($, ctx, t, message) : t.type === 'process' ? await runProcess($, ctx, t, message) : await runHttp($, ctx, t, message)
  return result.kind === 'ok' ? { ...result, text: cleanOutput(result.text) } : result
}

// ------------------------------------------------------------------ health

export type ProbeResult = { ok: boolean; status: 'conectado' | 'disponível' | 'indisponível' | 'erro'; via: string; detalhe: string }

export async function probeTransport($: EngineInterface, ctx: TransportCtx, t: GarraTransport, toolNames: ReadonlySet<string>): Promise<ProbeResult> {
  if (t.type === 'mcp') {
    const name = mcpToolName(t.server, t.tool)
    return toolNames.has(name)
      ? { ok: true, status: 'conectado', via: `MCP ${t.server}`, detalhe: `ferramenta ${t.tool} disponível` }
      : { ok: false, status: 'indisponível', via: `MCP ${t.server}`, detalhe: `servidor MCP "${t.server}" não conectado nesta sessão` }
  }
  if (t.type === 'process') {
    const exe = t.argv[0] ?? '?'
    const argv = t.healthArgv ?? [exe, '--version']
    try {
      const run = await $.process.run(argv, { timeoutMs: 15_000 })
      const version = oneLine(`${run.stdout}\n${run.stderr}`.split('\n').find(l => /\d+\.\d+/.test(l)) ?? '', 50)
      return run.exitCode === 0
        ? { ok: true, status: 'disponível', via: `CLI ${exe}`, detalhe: version || 'executável encontrado' }
        : { ok: false, status: 'erro', via: `CLI ${exe}`, detalhe: `"${argv.join(' ')}" saiu com código ${run.exitCode}` }
    } catch (error) {
      return { ok: false, status: 'indisponível', via: `CLI ${exe}`, detalhe: `"${exe}" não encontrado: ${errMsg(error)}` }
    }
  }
  const via = `HTTP ${t.baseUrl}`
  const bad = checkDestination(t.baseUrl, t.allowRemote === true)
  if (bad) return { ok: false, status: 'erro', via, detalhe: bad }
  const auth = await resolveAuth($, ctx, t.auth)
  const headers: Record<string, string> = {}
  if (!('falta' in auth) && auth.token) headers.authorization = `Bearer ${auth.token}`
  const limit = deadline($, 5000)
  try {
    const res = await Promise.race([$.http.fetch(`${t.baseUrl}/v1/models`, { headers }), limit.promise])
    if (res === TIMEOUT) return { ok: false, status: 'indisponível', via, detalhe: 'sem resposta em 5 s' }
    if (res.ok) {
      if ('falta' in auth) return { ok: false, status: 'erro', via, detalhe: `servidor no ar, mas ${auth.falta}` }
      return { ok: true, status: 'conectado', via, detalhe: 'servidor respondeu /v1/models' }
    }
    if (res.status === 401 || res.status === 403) return { ok: false, status: 'erro', via, detalhe: `servidor no ar, autenticação recusada (HTTP ${res.status})` }
    return { ok: false, status: 'erro', via, detalhe: `HTTP ${res.status}` }
  } catch (error) {
    return { ok: false, status: 'indisponível', via, detalhe: `porta fechada ou servidor desligado (${errMsg(error)})` }
  } finally {
    limit.cancel()
  }
}
