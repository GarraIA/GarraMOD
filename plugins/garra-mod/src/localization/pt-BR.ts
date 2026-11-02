// Todas as frases que o Garra MOD mostra ficam aqui, em português do Brasil.
// Identificadores, comandos e nomes de API continuam no formato técnico.

import type { GarraHealthStatus } from '../../types'

export const MARCA = '🇧🇷 Garra MOD para Claude Code'
export const SLOGAN = 'Seu ambiente brasileiro de programação'
export const MASCOTE = '🦜'

export const STATUS_ICONE: Record<GarraHealthStatus, string> = {
  verificando: '🟡',
  configurado: '⚪',
  conectado: '🟢',
  disponível: '🔵',
  indisponível: '🔴',
  erro: '🔴',
}

export const TXT = {
  modAtivo: `${MASCOTE} Garra MOD ativo`,
  claudeAtivo: 'conectado (sessão atual)',
  abrirPainel: '/garra abre o painel',
  extensoes: (ativas: number, total: number) => `${ativas} de ${total} ativas`,
  semAgente: (id: string) => `Agente "${id}" não está no catálogo do Garra MOD. Use /garra-agentes para ver os cadastrados.`,
  agenteInativo: (nome: string) => `${nome} está desativado no catálogo.`,
  semPermissao: (nome: string, modo: string) => `${nome} não tem permissão de ${modo} no catálogo.`,
  principal: 'Claude é o agente principal desta sessão: ele mesmo responde e coordena os outros.',
  semTransporte: (nome: string, modo: string) => `${nome} não tem transporte de ${modo} configurado.`,
  todosIndisponiveis: (nome: string, motivos: string) => `${nome} está indisponível agora. Tentativas: ${motivos}`,
  tempoEsgotado: (s: number) => `tempo esgotado após ${s} s`,
  cancelado: 'cancelado',
  respostaVazia: 'o agente respondeu vazio',
  respostaMalformada: 'resposta malformada',
  redigido: (n: number) => `${n} trecho(s) com aparência de segredo foram removidos antes do envio.`,
  entradaGrande: (kb: number) => `A mensagem passa do limite de ${kb} KiB deste agente; resuma o contexto e tente de novo.`,
  delegarMotivo: (nome: string) =>
    `Garra MOD: ${nome} vai executar uma tarefa com ferramentas (shell, arquivos, git ou web) no seu ambiente. Aprove só se confiar no pedido.`,
  registroMotivo: 'Garra MOD: alterar o catálogo de agentes externos.',
  aprovarPergunta: (nome: string, tarefa: string) => `Aprovar a delegação desta tarefa ao ${nome}: “${tarefa}”?`,
  aprovar: 'Aprovar',
  recusar: 'Recusar',
  riscosPergunta: (nome: string, skipArgs: string) =>
    [
      `⚠️ Antes de executar: o ${nome} vai agir direto nesta máquina, FORA das permissões do Claude Code.`,
      'Ele pode rodar comandos de shell; criar, alterar ou apagar arquivos; mexer no git (commit, push); acessar a internet; e ler arquivos com segredos (.env, chaves).',
      'Uma aprovação vale para tudo o que ele decidir fazer nesta tarefa, e parte disso pode não ter como desfazer.',
      skipArgs !== ''
        ? `O modo skip (${skipArgs}) desliga também as confirmações do próprio ${nome}: use só em pasta descartável ou com backup.`
        : `O ${nome} não tem modo skip separado: ele já roda com as ferramentas que a configuração dele libera.`,
      'Como deseja continuar?',
    ].join(' '),
  aprovacaoCaixa: 'caixa de permissão do Claude Code',
  aprovacaoPergunta: 'pergunta do Garra MOD',
  decisao: (aprovacao: string, escolha: string) => `aprovação: ${aprovacao} · escolha: ${escolha}`,
  executarSeguro: 'Executar com segurança',
  executarSkip: 'Executar em modo skip',
  cancelar: 'Cancelar',
  semHumano: (nome: string) => `Delegação a ${nome} NÃO executada: ninguém pôde aprovar (sessão sem pessoa para responder ou pergunta dispensada).`,
  recusada: (nome: string) => `Delegação a ${nome} recusada pela pessoa.`,
  canceladaRiscos: (nome: string) => `Delegação a ${nome} cancelada na confirmação de riscos.`,
  temaSemSkins:
    'O Claude Skins não está ativo nesta sessão. Instale com /plugin marketplace add hellosverre/claude-skins e /plugin install skins@hellosverre-mods.',
} as const

export const DESCRICAO_STATUS: Record<GarraHealthStatus, string> = {
  verificando: 'verificando…',
  configurado: 'configurado',
  conectado: 'conectado',
  disponível: 'disponível',
  indisponível: 'indisponível',
  erro: 'com erro',
}
