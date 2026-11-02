// As frases de espera do GarraIA: o que o spinner diz enquanto o Claude trabalha.
//
// Curtas (até 24 caracteres, o limite do Claude Skins), em português do Brasil e
// sem reticências: o Claude Code e o Skins já põem o "…" no fim. A maioria fala
// do trabalho de verdade (ler, testar, investigar, revisar); as de personalidade
// (papagaio, Brasil, time) entram como tempero, não como piada a cada turno.

export const FRASES_ESPERA: readonly string[] = [
  // Trabalho
  'Analisando o pedido',
  'Reunindo o contexto',
  'Lendo o código',
  'Organizando as ideias',
  'Montando o plano',
  'Conferindo os testes',
  'Verificando os detalhes',
  'Revisando a resposta',
  'Testando hipóteses',
  'Escrevendo com cuidado',
  'Medindo duas vezes',
  'Lapidando o código',
  'Compilando as ideias',
  'Arrumando a casa',
  // Investigação
  'Seguindo a pista',
  'Seguindo o rastro',
  'Ligando os pontos',
  'Investigando a fundo',
  'Puxando o fio da meada',
  'Montando o quebra-cabeça',
  'Fuçando a documentação',
  'Desatando os nós',
  'Farejando bugs',
  'Garimpando respostas',
  // GarraIA e o papagaio
  'Afiando as garras',
  'Caçando uma boa resposta',
  'Abrindo as asas',
  'Ajeitando as penas',
  'Batendo as asas',
  'Bicando o problema',
  'De olho no código',
  'Voando baixo',
  // Brasil
  'Passando um cafezinho',
  'Caprichando',
  'Botando ordem na casa',
  'Tirando de letra',
  'Afinando o cavaquinho',
  'Batucando no teclado',
  // Time
  'Juntando a galera',
  'Chamando o time',
  'Trocando ideia',
  'Combinando o jogo',
  'Tabelando com o time',
  'Dividindo as tarefas',
]

// Quantas frases recentes não podem voltar no próximo sorteio.
export const SEM_REPETIR = 5

// Uma frase da coleção, diferente das últimas `SEM_REPETIR` sorteadas.
// `aleatorio` devolve um número em [0, 1), como Math.random.
export function sortearFrase(recentes: readonly string[], aleatorio: () => number, colecao: readonly string[] = FRASES_ESPERA): string {
  const evitar = new Set(recentes.slice(-SEM_REPETIR))
  const livres = colecao.filter(f => !evitar.has(f))
  const opcoes = livres.length > 0 ? livres : colecao
  const i = Math.min(opcoes.length - 1, Math.max(0, Math.floor(aleatorio() * opcoes.length)))
  return opcoes[i] ?? ''
}

// A lista de recentes depois de mostrar `frase`: só as últimas `SEM_REPETIR`.
export function lembrarFrase(recentes: readonly string[], frase: string): string[] {
  return [...recentes, frase].slice(-SEM_REPETIR)
}
