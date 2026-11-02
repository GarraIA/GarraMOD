// A ponte operacional do Garra MOD: escolhe o transporte, protege a mensagem,
// faz a chamada real e devolve a resposta identificada pelo agente que respondeu.

import type { EngineInterface, PluginOptions } from 'claude-code'
import type { GarraAgentEntry, GarraHealth } from '../../types'
import { TXT } from '../localization/pt-BR'
import { redactSecrets } from '../security/sanitize'
import { lerModeloGarraIA } from './garraia-config'
import { probeTransport, runTransport, usaModeloGarraIA, type TransportCtx } from './transports'

export type Modo = 'consulta' | 'delegar'

export type CallRequest = {
  agent: GarraAgentEntry
  modo: Modo
  mensagem: string
  cwd: string
  timeoutS?: number
  // Só a pessoa liga, na confirmação de riscos de uma delegação.
  skip?: boolean
}

export type CallOutcome = {
  ok: boolean
  texto: string
  via: string
  modelo?: string
  extra?: string
  ms: number
  redacoes: number
  tentativas: string[]
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)))

export async function callAgent($: EngineInterface, options: PluginOptions, req: CallRequest): Promise<CallOutcome> {
  const startedAt = await $.clock.now()
  const done = async (partial: Omit<CallOutcome, 'ms'>): Promise<CallOutcome> => ({ ...partial, ms: (await $.clock.now()) - startedAt })
  const { agent, modo } = req
  const fail = (texto: string, redacoes = 0, tentativas: string[] = []) => done({ ok: false, texto, via: '—', redacoes, tentativas })

  if (agent.tipo === 'principal') return fail(TXT.principal)
  if (!agent.ativo) return fail(TXT.agenteInativo(agent.nome))
  if (!agent.permissoes[modo]) return fail(TXT.semPermissao(agent.nome, modo === 'consulta' ? 'consulta' : 'delegação'))
  const chain = modo === 'consulta' ? agent.consulta : agent.delegar
  if (!chain || chain.length === 0) return fail(TXT.semTransporte(agent.nome, modo))

  // Nada de segredos para fora; e nada de mensagens acima do limite do agente.
  const { text: mensagem, count: redacoes } = redactSecrets(req.mensagem)
  const bytes = new TextEncoder().encode(mensagem).length
  if (bytes > agent.sessao.maxEntradaKB * 1024) return fail(TXT.entradaGrande(agent.sessao.maxEntradaKB), redacoes)

  // Lido a cada chamada: uma troca com `garra config set-model` vale na hora.
  const garraia = chain.some(usaModeloGarraIA) ? await lerModeloGarraIA($) : null
  const ctx: TransportCtx = {
    options,
    cwd: req.cwd,
    timeoutS: clamp(req.timeoutS ?? agent.timeoutS, 5, 1800),
    skip: req.modo === 'delegar' && req.skip === true,
    garraia,
  }
  const tentativas: string[] = []
  // Transportes pulados só por falta de configuração (ex.: chave ausente).
  const silenciosas: string[] = []
  for (const transport of chain) {
    const res = await runTransport($, ctx, transport, mensagem)
    if (res.kind === 'ok') {
      return done({
        ok: true,
        texto: res.text,
        via: res.via,
        redacoes,
        tentativas,
        ...(res.modelo ? { modelo: res.modelo } : {}),
        ...(res.extra ? { extra: res.extra } : {}),
      })
    }
    if (res.kind === 'unavailable' && res.silencioso) {
      silenciosas.push(`${res.via}: ${res.motivo}`)
      continue
    }
    tentativas.push(`${res.via}: ${res.motivo}`)
    if (res.kind === 'error') return done({ ok: false, texto: res.motivo, via: res.via, redacoes, tentativas })
  }
  // Nada funcionou: aí a falta de configuração também ajuda a entender o porquê.
  const todas = [...tentativas, ...silenciosas]
  return fail(TXT.todosIndisponiveis(agent.nome, todas.join(' | ')), redacoes, todas)
}

export async function probeAgent($: EngineInterface, options: PluginOptions, agent: GarraAgentEntry, toolNames: ReadonlySet<string>, cwd: string): Promise<GarraHealth> {
  const now = await $.clock.now()
  if (agent.tipo === 'principal') return { id: agent.id, status: 'conectado', via: 'sessão atual', detalhe: TXT.claudeAtivo, verificadoEm: now }
  if (!agent.ativo) return { id: agent.id, status: 'configurado', via: '—', detalhe: 'desativado no catálogo', verificadoEm: now }
  const chain = [...(agent.consulta ?? []), ...(agent.delegar ?? [])]
  const ctx: TransportCtx = { options, cwd, timeoutS: 15 }
  const notes: string[] = []
  let firstError: { via: string; detalhe: string } | null = null
  for (const transport of chain) {
    const probe = await probeTransport($, ctx, transport, toolNames)
    if (probe.ok) return { id: agent.id, status: probe.status, via: probe.via, detalhe: probe.detalhe, verificadoEm: await $.clock.now() }
    notes.push(`${probe.via}: ${probe.detalhe}`)
    if (probe.status === 'erro' && firstError === null) firstError = { via: probe.via, detalhe: probe.detalhe }
  }
  return {
    id: agent.id,
    status: firstError ? 'erro' : 'indisponível',
    via: firstError?.via ?? '—',
    detalhe: notes.join(' | ') || 'nenhum transporte configurado',
    verificadoEm: await $.clock.now(),
  }
}

// Limita quantas chamadas a agentes externos correm ao mesmo tempo.
export function makeLimiter() {
  let active = 0
  const waiting: Array<() => void> = []
  return {
    async run<T>(limit: number, fn: () => Promise<T>): Promise<T> {
      while (active >= Math.max(1, limit)) await new Promise<void>(resolve => waiting.push(resolve))
      active += 1
      try {
        return await fn()
      } finally {
        active -= 1
        waiting.shift()?.()
      }
    },
    get active() {
      return active
    },
  }
}
