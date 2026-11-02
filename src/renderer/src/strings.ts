// User-facing text (pt-BR). Code and identifiers stay in English.
export const t = {
  nav: {
    home: 'Início',
    library: 'Biblioteca',
    achievements: 'Conquistas'
  },
  hints: {
    navigate: 'Navegar',
    options: 'Opções',
    open: 'Abrir',
    select: 'Selecionar',
    back: 'Voltar'
  },
  library: {
    title: 'Biblioteca',
    count: (n: number) => (n === 1 ? '1 jogo' : `${n} jogos`),
    loading: 'Carregando biblioteca…',
    error: 'Não foi possível carregar a biblioteca.',
    retry: 'Tentar novamente',
    empty: 'Nenhum jogo na biblioteca ainda.',
    emptyHint: 'Jogos da Steam e jogos adicionados manualmente aparecerão aqui.'
  },
  home: {
    empty: 'Nenhum jogo para mostrar ainda.',
    openLibrary: 'Abrir biblioteca'
  },
  game: {
    play: 'Jogar',
    playSoon: 'Iniciar jogos estará disponível em breve.',
    more: 'Mais opções',
    about: 'Sobre o jogo',
    playtime: 'Tempo de jogo',
    lastSession: 'Última sessão',
    achievements: 'Conquistas',
    neverPlayed: 'Nunca jogado',
    loading: 'Carregando jogo…',
    notFound: 'Este jogo não foi encontrado.',
    error: 'Não foi possível carregar este jogo.',
    ageRating: (value: string) => `Classificação indicativa: ${value}`,
    ageRatingPending: 'Classificação indicativa pendente'
  },
  menu: {
    achievements: 'Conquistas',
    markBeaten: 'Marcar como zerado',
    unmarkBeaten: 'Desmarcar como zerado',
    hide: 'Ocultar jogo',
    close: 'Fechar',
    soon: 'Em breve'
  },
  achievements: {
    soon: 'A área de conquistas chegará em breve.'
  }
}
