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
    back: 'Voltar',
    filter: 'Filtrar',
    search: 'Buscar'
  },
  library: {
    title: 'Biblioteca',
    count: (n: number) => (n === 1 ? '1 jogo' : `${n} jogos`),
    countOf: (shown: number, total: number) => `${shown} de ${total} jogos`,
    loading: 'Carregando biblioteca…',
    error: 'Não foi possível carregar a biblioteca.',
    retry: 'Tentar novamente',
    empty: 'Nenhum jogo na biblioteca ainda.',
    emptyHint: 'Jogos da Steam e jogos adicionados manualmente aparecerão aqui.',
    addGame: 'Adicionar jogo',
    search: 'Buscar',
    searchTitle: 'Buscar jogo',
    searchPlaceholder: 'Digite o nome do jogo',
    origin: 'Origem',
    allOrigins: 'Todas',
    sort: 'Ordenar',
    sorts: { title: 'Título', recent: 'Recentes', playtime: 'Tempo de jogo' } as Record<
      string,
      string
    >,
    filters: 'Filtros',
    install: 'Instalação',
    installs: { all: 'Todos', installed: 'Instalados', missing: 'Não encontrados' } as Record<
      string,
      string
    >,
    hiddenGames: 'Jogos ocultos',
    showHidden: 'Mostrar',
    hideHidden: 'Não mostrar',
    beatenGames: 'Jogos zerados',
    beatenOnly: 'Só zerados',
    beatenAll: 'Todos',
    clearFilters: 'Limpar filtros',
    close: 'Fechar',
    noMatches: 'Nenhum jogo corresponde à busca e aos filtros.',
    allHidden: 'Todos os jogos estão ocultos.',
    allHiddenHint: 'Use Filtrar (X) › Jogos ocultos para vê-los.',
    hiddenBadge: 'Oculto'
  },
  home: {
    empty: 'Nenhum jogo instalado para mostrar.',
    emptyHint: 'Jogos instalados e não ocultos aparecem aqui, começando pelo último jogado.',
    openLibrary: 'Abrir biblioteca'
  },
  game: {
    play: 'Jogar',
    running: 'Em execução',
    steamNotInstalled: 'Jogo não instalado na Steam.',
    steamUnknown: 'Não foi possível verificar a instalação (disco da biblioteca desconectado?).',
    steamBusy: 'A Steam está instalando ou atualizando este jogo.',
    steamLaunching: 'Abrindo pela Steam…',
    notInstalled: 'Arquivo do jogo não encontrado. Edite o jogo para corrigir o caminho.',
    installUnknown: 'Não foi possível verificar o arquivo do jogo (disco desconectado?).',
    emulatorMissing: 'Configure o Yuzu em Configurações › Emuladores.',
    untracked: 'Atalho .url: o tempo de jogo não é medido.',
    noConfig: 'Configure o executável editando o jogo.',
    runningNote: 'O tempo desta sessão será somado quando o jogo fechar.',
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
  launchErrors: {
    'not-found': 'Este jogo não pode ser iniciado.',
    'no-config': 'Configure o executável editando o jogo.',
    'not-installed': 'Arquivo do jogo não encontrado. Edite o jogo para corrigir o caminho.',
    'emulator-missing': 'Configure o Yuzu em Configurações › Emuladores.',
    'shortcut-invalid': 'O atalho .url não aponta para uma loja suportada. Edite o jogo.',
    'start-timeout': 'A Steam não iniciou o jogo a tempo. Tente de novo.',
    'steam-busy': 'A Steam está instalando ou atualizando este jogo.',
    'already-running': 'O jogo já está em execução.',
    'start-failed': 'Não foi possível iniciar o jogo. Verifique o executável e os argumentos.'
  } as Record<string, string>,
  menu: {
    achievements: 'Conquistas',
    markBeaten: 'Marcar como zerado',
    unmarkBeaten: 'Desmarcar como zerado',
    hide: 'Ocultar jogo',
    unhide: 'Mostrar jogo',
    flagFailed: 'Não foi possível salvar a alteração.',
    edit: 'Editar jogo',
    artwork: 'Buscar artes no SteamGridDB',
    remove: 'Remover jogo',
    close: 'Fechar',
    soon: 'Em breve'
  },
  remove: {
    title: (game: string) => `Remover "${game}"?`,
    message:
      'O jogo sai da biblioteca junto com o tempo registrado e as imagens. Os arquivos do jogo no disco não são apagados.',
    confirm: 'Remover',
    cancel: 'Cancelar',
    failed: 'Não foi possível remover o jogo.'
  },
  form: {
    addTitle: 'Adicionar jogo',
    editTitle: 'Editar jogo',
    submitAdd: 'Adicionar jogo',
    submitEdit: 'Salvar alterações',
    cancel: 'Cancelar',
    saving: 'Salvando…',
    loading: 'Carregando…',
    loadError: 'Não foi possível carregar o formulário.',
    fields: {
      title: 'Título do jogo',
      description: 'Descrição',
      developer: 'Desenvolvedor',
      releaseDate: 'Data de lançamento',
      playtime: 'Tempo de jogo',
      origin: 'Origem',
      rom: 'ROM',
      executable: 'Executável',
      arguments: 'Argumentos',
      workingDirectory: 'Pasta de trabalho',
      requiredAge: 'Classificação indicativa'
    },
    placeholders: {
      title: 'Digite o nome do jogo…',
      description: 'Adicione uma descrição…',
      developer: 'Digite o nome do desenvolvedor…',
      releaseDate: 'DD-MM-AAAA',
      playtime: 'Tempo total de jogo (em minutos)',
      rom: 'Escolha a ROM do jogo (.nsp, .xci…)…',
      executable: 'Escolha o .exe do jogo ou um atalho .url…',
      arguments: 'Opcional, ex.: -fullscreen "D:\\Jogos\\jogo.iso"',
      workingDirectory: 'Opcional (padrão: pasta do executável)'
    },
    ages: {
      none: 'Não informada',
      L: 'Todas as idades',
      age: (n: string) => `${n} anos`
    },
    background: {
      title: 'Adicione uma imagem de fundo para o jogo',
      subtitle: 'Use a imagem da sua escolha (1920×1080)',
      select: 'Selecionar imagem',
      change: 'Trocar imagem',
      selected: (name: string) => `Selecionada: ${name}`,
      current: 'Imagem atual'
    },
    manageOrigins: 'Gerenciar origens…',
    emulatorCommand: (emulator: string, rom: string) =>
      `Será iniciado com: ${emulator} -f -g "${rom}"`,
    emulatorMissing: (emulator: string) =>
      `${emulator} ainda não foi configurado. Use Configurações › Emuladores.`,
    shortcutNote:
      'Atalhos .url abrem pela loja; argumentos não se aplicam e o tempo de jogo não é medido.',
    discard: {
      title: 'Descartar alterações?',
      message: 'O que foi preenchido neste formulário será perdido.',
      confirm: 'Descartar',
      cancel: 'Continuar editando'
    },
    minutes: (n: number) => `${n} min`,
    saveFailed: 'Corrija os campos destacados.'
  },
  /** Error codes from main (AppError.code), per field when relevant. */
  fieldErrors: {
    required: 'Campo obrigatório.',
    'too-long': 'Texto longo demais.',
    invalid: 'Valor inválido.',
    'not-absolute': 'Use um caminho completo (ex.: C:\\Jogos\\jogo.exe).',
    'not-exe': 'Escolha um arquivo .exe.',
    'not-rom': 'Este arquivo não é uma ROM suportada pelo emulador.',
    'shortcut-invalid': 'Não foi possível ler o endereço deste atalho .url.',
    'shortcut-scheme':
      'Este atalho não abre uma loja suportada (Epic, Steam, Ubisoft, EA, Battle.net).',
    missing: 'Arquivo ou pasta não encontrado.',
    'not-file': 'Isto é uma pasta, não um arquivo.',
    unreadable: 'Não foi possível ler este caminho (disco desconectado ou sem permissão).',
    'too-many': 'Argumentos demais.',
    'too-large': 'Imagem maior que 20 MB.',
    'unsupported-type': 'Use uma imagem PNG, JPG ou WebP.',
    undecodable: 'Não foi possível abrir esta imagem.',
    'wrong-proportion': 'A imagem de fundo precisa ser 16:9 (ex.: 1920×1080).',
    'duplicate-name': 'Já existe uma origem com este nome.',
    'invalid-name': 'Nome inválido.',
    'builtin-origin': 'Origens de fábrica não podem ser excluídas.',
    'origin-in-use': 'Esta origem ainda tem jogos.',
    'not-found': 'Não encontrado.',
    'secrets-unavailable': 'O Windows não permitiu guardar a chave com segurança.'
  } as Record<string, string>,
  keyboard: {
    done: 'Pronto',
    shift: 'Maiúsculas',
    space: 'Espaço',
    backspace: 'Apagar',
    digitsOnly: 'Use apenas números.'
  },
  datePicker: {
    title: 'Data de lançamento',
    day: 'Dia',
    month: 'Mês',
    year: 'Ano',
    ok: 'Confirmar',
    clear: 'Limpar'
  },
  files: {
    titles: {
      executable: 'Escolher executável',
      emulator: 'Escolher executável do emulador',
      rom: 'Escolher ROM',
      image: 'Escolher imagem',
      directory: 'Escolher pasta'
    } as Record<string, string>,
    start: 'Locais',
    up: 'Pasta acima',
    useThisFolder: 'Usar esta pasta',
    native: 'Usar janela do Windows',
    loading: 'Carregando…',
    empty: 'Nenhum arquivo compatível nesta pasta.',
    error: 'Não foi possível abrir esta pasta.',
    truncated: 'Mostrando os primeiros 2000 itens.'
  },
  origins: {
    title: 'Origens',
    add: 'Nova origem',
    newName: 'Nome da origem',
    rename: 'Renomear',
    remove: 'Excluir origem',
    close: 'Fechar',
    builtin: 'De fábrica'
  },
  emulators: {
    subtitle: 'Escolha o emulador e indique onde está o executável dele.',
    notConfigured: (exe: string) => `Não configurado — escolha o ${exe}`,
    loading: 'Carregando emuladores…',
    error: 'Não foi possível carregar os emuladores.',
    change: 'Trocar executável',
    remove: 'Remover emulador',
    close: 'Fechar',
    changeNote: 'A troca vale para todos os jogos deste emulador.'
  },
  steamGridDb: {
    title: 'Artes do SteamGridDB',
    searching: 'Buscando…',
    pick: 'Escolha o jogo certo para baixar as capas, o logo e o cabeçalho.',
    noResults: (term: string) => `Nenhum jogo encontrado para "${term}".`,
    otherName: 'Buscar outro nome',
    searchTitle: 'Nome do jogo no SteamGridDB',
    applying: (name: string) => `Baixando artes de ${name}…`,
    applied: (count: number) => (count === 1 ? '1 arte baixada.' : `${count} artes baixadas.`),
    nothingFound: 'O SteamGridDB não tem artes para este jogo.',
    close: 'Fechar',
    errors: {
      'not-configured': 'Configure a chave do SteamGridDB em Configurações.',
      'invalid-key': 'A chave do SteamGridDB é inválida.',
      'not-found': 'Jogo não encontrado.',
      network: 'Sem conexão com o SteamGridDB. Tente mais tarde.',
      'invalid-response': 'O SteamGridDB respondeu de forma inesperada. Tente mais tarde.'
    } as Record<string, string>
  },
  duplicates: {
    notice: (n: number) =>
      n === 1 ? '1 possível duplicata para revisar.' : `${n} possíveis duplicatas para revisar.`,
    review: 'Revisar',
    title: 'Possível duplicata',
    message: (manual: string, steam: string) =>
      `O jogo manual "${manual}" parece ser "${steam}", encontrado na Steam. Nada foi juntado.`,
    keep: 'Manter os dois',
    hide: 'Ocultar o jogo manual',
    remove: 'Remover o jogo manual',
    close: 'Fechar'
  },
  settings: {
    title: 'Configurações',
    tabs: { connections: 'Conexões', emulators: 'Emuladores', about: 'Sobre' },
    steam: 'Steam',
    steamId: 'ID Steam',
    steamIdPlaceholder: 'Digite sua id Steam…',
    steamIdHint: 'SteamID64 (17 números), no endereço do seu perfil da Steam.',
    steamKey: 'Chave da Steam API',
    steamGridDb: 'SteamGridDB',
    steamGridDbKey: 'Chave do SteamGridDB',
    configured: 'Configurada',
    notConfigured: 'Não configurada',
    configure: 'Configurar',
    change: 'Alterar',
    remove: 'Remover',
    test: 'Testar conexão',
    testing: 'Testando…',
    testNeedsConfig: 'Configure o ID Steam e a chave para testar.',
    testNeedsGridKey: 'Configure a chave para testar.',
    testOkSteam: (name: string) => `Conectado como ${name}.`,
    testPrivate: (name: string) =>
      `Conectado como ${name}, mas os detalhes de jogos do perfil são privados: o tempo de jogo não sincroniza.`,
    testOkGrid: 'Chave válida.',
    testErrors: {
      'not-configured': 'Configure as informações acima antes de testar.',
      'invalid-key': 'Chave inválida.',
      'invalid-steam-id': 'ID Steam não encontrado.',
      'private-profile': 'Os detalhes de jogos do perfil são privados.',
      network: 'Sem conexão com o serviço. Verifique a internet.',
      'invalid-response': 'O serviço respondeu de forma inesperada. Tente mais tarde.'
    } as Record<string, string>,
    sync: {
      never: 'O tempo de jogo da Steam é sincronizado ao abrir o Equon.',
      ok: (time: string, games: number) =>
        `Tempo de jogo sincronizado às ${time} (${games === 1 ? '1 jogo' : `${games} jogos`}).`,
      failed: (reason: string) => `Tempo de jogo não sincronizado: ${reason}`
    },
    secretsUnavailable: 'O Windows não oferece criptografia agora; as chaves não podem ser salvas.',
    keyPlaceholder: 'Cole ou digite a chave',
    library: 'Biblioteca',
    refresh: 'Atualizar biblioteca',
    refreshing: 'Atualizando…',
    neverRefreshed: 'Os jogos da Steam são lidos ao abrir o Equon.',
    refreshResult: (added: number, missing: number) =>
      [
        'Biblioteca atualizada',
        added > 0 ? (added === 1 ? '1 jogo novo' : `${added} jogos novos`) : null,
        missing > 0 ? (missing === 1 ? '1 não encontrado' : `${missing} não encontrados`) : null
      ]
        .filter(Boolean)
        .join(' · '),
    refreshPartial: 'Atualização parcial: uma biblioteca não pôde ser lida (disco desconectado?).',
    refreshFailed: {
      'steam-not-found': 'Steam não encontrada neste computador.',
      'libraryfolders-unreadable': 'Não foi possível ler as bibliotecas da Steam.'
    } as Record<string, string>,
    refreshFailedOther: 'Não foi possível ler a Steam.',
    about: {
      version: 'Versão do Equon',
      electron: 'Electron',
      chrome: 'Chromium',
      node: 'Node.js',
      os: 'Sistema',
      steamPath: 'Pasta da Steam',
      steamNotFound: 'Não encontrada',
      dataPath: 'Pasta de dados',
      schema: 'Versão do banco de dados'
    },
    loading: 'Carregando…',
    error: 'Não foi possível carregar as configurações.'
  },
  achievements: {
    title: 'Conquistas',
    total: 'Total de conquistas',
    tiers: { platine: 'Platina', gold: 'Ouro', silver: 'Prata', bronze: 'Bronze' },
    sorts: { recent: 'Recentes', completion: 'Conclusão', title: 'Título' },
    changeSort: 'Alterar ordenação',
    syncShort: 'Sincronizar',
    sync: 'Sincronizar conquistas',
    syncing: 'Sincronizando…',
    progress: (done: number, total: number) => `Sincronizando ${done} de ${total} jogos…`,
    syncDone: 'Conquistas sincronizadas.',
    syncPartial: (failed: number, total: number) =>
      failed === 1
        ? `1 de ${total} jogos não pôde ser sincronizado.`
        : `${failed} de ${total} jogos não puderam ser sincronizados.`,
    syncNeedsConfig: 'Configure o ID Steam e a chave em Configurações › Conexões.',
    loading: 'Carregando conquistas…',
    error: 'Não foi possível carregar as conquistas.',
    neverSynced: 'As conquistas ainda não foram sincronizadas.',
    neverSyncedHint: 'Use “Sincronizar conquistas” para buscar os seus jogos da Steam.',
    empty: 'Nenhum dos seus jogos tem conquistas.',
    noneForGame: 'Este jogo não possui conquistas.',
    notSyncedGame: 'As conquistas deste jogo ainda não foram sincronizadas.',
    syncFailed: 'A última sincronização deste jogo falhou.',
    stale: 'Dados desatualizados: a última sincronização deste jogo falhou.',
    unlocked: 'Conquistas obtidas',
    locked: 'Conquistas bloqueadas',
    noneUnlocked: 'Nenhuma conquista obtida ainda.',
    platinum: 'Platinado',
    hiddenText: 'Conquista oculta',
    noDate: '--/--/---- --:--'
  }
}

/** Message for an AppError code. */
export function errorMessage(code: string): string {
  return t.fieldErrors[code] ?? t.fieldErrors.invalid
}
