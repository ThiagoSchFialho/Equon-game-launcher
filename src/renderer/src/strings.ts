// User-facing text (pt-BR). Code and identifiers stay in English.
export const t = {
  /** The image over the screen while a game opens; its three dots are added by the page. */
  cover: {
    loading: 'Carregando'
  },
  nav: {
    home: 'Início',
    library: 'Biblioteca',
    achievements: 'Conquistas'
  },
  hints: {
    navigate: 'Navegar',
    options: 'Opções',
    open: 'Abrir',
    play: 'Jogar',
    select: 'Selecionar',
    back: 'Voltar',
    sort: 'Ordenar',
    filter: 'Filtrar'
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
    sorts: {
      title: 'Título',
      recent: 'Recentes',
      playtime: 'Tempo de jogo',
      achievements: '% de conquistas',
      origin: 'Origem',
      install: 'Instalação'
    } as Record<string, string>,
    filters: 'Filtros',
    filter: 'Filtrar',
    filterCount: (n: number) => (n === 0 ? 'Nenhum' : n === 1 ? '1 ativo' : `${n} ativos`),
    /** The filters, each on or off; they add up (owner decision). */
    hiddenFilter: 'Ocultos',
    beatenFilter: 'Zerados',
    installedFilter: 'Instalados',
    notInstalledFilter: 'Não instalados',
    filterOn: 'Ativo',
    showHidden: 'Mostrar ocultos',
    clearFilters: 'Limpar filtros',
    noMatches: 'Nenhum jogo corresponde à busca e aos filtros.',
    allHidden: 'Todos os jogos estão ocultos.',
    allHiddenHint: 'Use Filtrar (Y) › Ocultos para vê-los.',
    hiddenBadge: 'Oculto',
    installedBadge: 'Instalado',
    beatenBadge: 'Zerado'
  },
  home: {
    empty: 'Nenhum jogo instalado para mostrar.',
    emptyHint: 'Jogos instalados e não ocultos aparecem aqui, começando pelo último jogado.',
    openLibrary: 'Abrir biblioteca',
    /** "Em cima"'s panel under the shelf (D-29). */
    spotlight: {
      recent: 'Últimas conquistas',
      all: 'Ver todas',
      allHint: 'Abre as conquistas deste jogo.'
    }
  },
  game: {
    play: 'Jogar',
    opening: 'Abrindo…',
    install: 'Instalar',
    installOpened: 'Continue na janela da Steam.',
    steamOpenFailed: 'Não foi possível abrir a Steam.',
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
    /** Home, with "Ignorar tela do jogo na home" on (D-28). */
    openGamePage: 'Ver página do jogo',
    editArtwork: 'Editar artes',
    uninstall: 'Desinstalar',
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
    failed: 'Não foi possível remover o jogo.',
    /** Steam games (D-26): removed from Equon only, optionally as an exception. */
    steam: {
      message:
        'O jogo, o tempo de jogo registrado no Equon, as conquistas e as artes serão apagados do Equon. Nada muda na sua conta Steam.',
      removeLabel: 'Remover',
      removeHint:
        'ele volta quando você usar "Atualizar biblioteca" nas Configurações, se ainda estiver na sua conta ou instalado.',
      ignoreLabel: 'Remover e criar exceção',
      ignoreHint: 'o jogo entra nas exceções e',
      ignoreHintStrong: 'não será mais adicionado ao Equon.'
    }
  },
  form: {
    addTitle: 'Adicionar jogo',
    editTitle: 'Editar jogo',
    submitAdd: 'Adicionar jogo',
    fillIgdb: 'Preencher com IGDB',
    fillIgdbField: (field: string) => `Preencher com IGDB: ${field}`,
    igdbMissingField: 'O IGDB não tem esta informação para este jogo.',
    submitEdit: 'Salvar alterações',
    /** Footer hint of Start, on the add and edit forms. */
    save: 'Salvar',
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
      game: 'Escolha o .exe do jogo, um atalho .url ou uma ROM…',
      arguments: 'Opcional, ex.: -fullscreen "D:\\Jogos\\jogo.iso"',
      workingDirectory: 'Opcional (padrão: pasta do executável)'
    },
    ages: {
      none: 'Não informada',
      L: 'Todas as idades',
      age: (n: string) => `${n} anos`
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
    'wrong-proportion': 'A imagem não tem a proporção certa.',
    'duplicate-name': 'Já existe uma origem com este nome.',
    'invalid-name': 'Nome inválido.',
    'builtin-origin': 'Origens de fábrica não podem ser excluídas.',
    'origin-in-use': 'Esta origem ainda tem jogos.',
    'not-found': 'Não encontrado.',
    'secrets-unavailable': 'O Windows não permitiu guardar a chave com segurança.',
    'login-item-failed': 'O Windows não aceitou esta alteração. Tente de novo.'
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
      game: 'Escolher jogo',
      emulator: 'Escolher executável do emulador',
      rom: 'Escolher ROM',
      image: 'Escolher imagem',
      directory: 'Escolher pasta'
    } as Record<string, string>,
    start: 'Locais',
    up: 'Pasta acima',
    /** The first entry of a folder, which goes up one folder. */
    parent: '...',
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
    changeNote: 'A troca vale para todos os jogos deste emulador.',
    romDirectory: (emulator: string) => `Pasta das ROMs (${emulator})`,
    /** The rows of each emulator's panel, under its name. */
    executableLabel: 'Executável',
    romDirectoryLabel: 'Pasta das ROMs',
    executable: (emulator: string) => `Executável (${emulator})`,
    romDirectoryNeedsExecutable: 'Escolha o executável primeiro',
    romDirectoryEmpty: 'Opcional — escolha a pasta das suas ROMs',
    romDirectoryNote:
      'Os arquivos .nsp e .xci soltos na pasta das ROMs viram jogos ao escolher a pasta, ao abrir o launcher e em "Atualizar biblioteca". Com o IGDB configurado, dados e artes são preenchidos quando o nome bater.',
    romDirectoryChange: 'Trocar pasta',
    romDirectoryRemove: 'Remover pasta',
    romDirectoryRemoveNote: 'Remover a pasta não remove os jogos que vieram dela.'
  },
  igdb: {
    title: 'Preencher com IGDB',
    searchTitle: 'Nome do jogo no IGDB',
    searching: 'Buscando…',
    pick: 'Escolha o jogo certo. Os dados preenchem o formulário, e as artes vêm ao salvar.',
    pickToAdd: 'Escolha o jogo certo. Os dados e as artes dele serão usados neste jogo.',
    saveWithout: 'Salvar sem dados do IGDB',
    savedTitle: 'Jogo salvo sem dados do IGDB',
    savedMessage: (reason: string) => `${reason} Você pode completar os dados em Editar jogo.`,
    savedConfirm: 'Entendi',
    noResults: (term: string) => `Nenhum jogo encontrado para "${term}".`,
    otherName: 'Buscar outro nome',
    loading: (name: string) => `Buscando os dados de ${name}…`,
    notFound: 'Jogo não encontrado no IGDB.',
    close: 'Fechar',
    errors: {
      'not-configured': 'Configure o Client ID e o Client Secret do IGDB em Configurações.',
      'invalid-key': 'As credenciais do IGDB são inválidas. Confira em Configurações.',
      network: 'Sem conexão com o IGDB. Tente mais tarde.',
      unavailable: 'O IGDB está indisponível agora. Tente mais tarde.',
      'invalid-response': 'O IGDB respondeu de forma inesperada. Tente mais tarde.'
    } as Record<string, string>
  },
  artEditor: {
    title: 'Editar artes',
    kinds: {
      cover_portrait: 'Capa vertical',
      cover_square: 'Capa quadrada',
      logo: 'Logo',
      background: 'Imagem de fundo',
      launch: 'Imagem de abertura',
      home: 'Imagem da home'
    },
    usingBackground: 'Usando a imagem de fundo',
    usingLaunch: 'Usando a imagem de abertura',
    fromIgdb: 'Imagem do IGDB',
    fromGrid: 'Selecionar imagem do SteamGridDB',
    fromSteam: 'Imagens da Steam',
    fromFile: 'Selecionar imagem do PC',
    remove: 'Remover imagem',
    save: 'Salvar',
    close: 'Fechar',
    loadError: 'Não foi possível abrir as artes deste jogo.',
    downloading: 'Baixando a imagem…',
    searching: 'Buscando…',
    searchingImages: 'Buscando imagens…',
    pending: 'Nova imagem. Será aplicada ao salvar.',
    pendingRemoval: 'Será removida ao salvar.',
    saveFailed: 'Não foi possível salvar as artes. Tente de novo.',
    downloadFailed: 'Não foi possível baixar a imagem. Tente de novo.',
    noImageIgdb: 'O IGDB não tem esta imagem para este jogo.',
    noImageGrid: 'O SteamGridDB não tem imagens deste tipo para este jogo.',
    noImageSteam: 'A Steam não tem imagens 16:9 deste jogo.',
    steamErrors: {
      network: 'Sem conexão com a Steam. Tente mais tarde.',
      unavailable: 'A Steam está indisponível agora. Tente mais tarde.',
      'not-found': 'A Steam não encontrou este jogo.',
      'invalid-response': 'A Steam respondeu de forma inesperada. Tente mais tarde.'
    } as Record<string, string>,
    steamGalleryTitle: 'Imagens da Steam',
    storeBackground: 'Fundo da loja',
    screenshot: (n: number) => `Print ${n}`,
    proportion: {
      cover_portrait: 'A capa vertical precisa ter proporção entre 2:3 e 3:4.',
      cover_square: 'A capa quadrada precisa ter proporção 1:1.',
      logo: 'Esta imagem não serve como logo.',
      background: 'A imagem de fundo precisa ser 16:9 (ex.: 1920×1080).',
      launch: 'A imagem de abertura precisa ser 16:9 (ex.: 1920×1080).',
      home: 'A imagem da home precisa ser 16:9 (ex.: 1920×1080).'
    },
    igdbTitle: 'Jogo no IGDB',
    gridTitle: 'Jogo no SteamGridDB',
    pickGame: 'Escolha o jogo certo.',
    noResults: (term: string) => `Nenhum jogo encontrado para "${term}".`,
    otherName: 'Buscar outro nome',
    galleryTitle: 'Imagens do SteamGridDB',
    galleryPick: 'Escolha uma imagem.',
    galleryItem: (size: string) => `Imagem ${size}`
  },
  steamGridDb: {
    searchTitle: 'Nome do jogo no SteamGridDB',
    errors: {
      unavailable: 'O SteamGridDB está indisponível agora. Tente mais tarde.',
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
  /** Steam games removed with an exception (D-26), in Configurações › Conexões. */
  ignored: {
    notice: (n: number) =>
      n === 1 ? '1 jogo Steam nas exceções.' : `${n} jogos Steam nas exceções.`,
    open: 'Jogos ignorados',
    title: 'Jogos ignorados',
    message:
      'Estes jogos da Steam não são adicionados ao Equon. Escolha um para tirá-lo das exceções.',
    close: 'Fechar',
    confirmTitle: (game: string) => `Tirar "${game}" das exceções?`,
    confirmMessage:
      'O jogo volta ao Equon quando você usar "Atualizar biblioteca", se ainda estiver na sua conta ou instalado.',
    confirm: 'Tirar das exceções',
    cancel: 'Cancelar',
    failed: 'Não foi possível tirar o jogo das exceções.'
  },
  systemMenu: {
    title: 'Menu do sistema',
    enterFullscreen: 'Mudar para tela cheia',
    leaveFullscreen: 'Mudar para modo janela',
    settingsUnsaved: 'Salve ou cancele antes',
    shutdown: 'Desligar sistema',
    shutdownConfirm: 'Desligar',
    shutdownMessage: 'O computador será desligado agora.',
    shutdownGameOpen:
      'Há um jogo aberto. O computador será desligado agora, e o que não estiver salvo no jogo pode se perder.',
    shutdownFailed: 'O Windows não permitiu desligar o computador. Tente pelo menu Iniciar.',
    quit: 'Sair',
    quitTitle: 'Sair do Equon',
    quitMessage: 'O Equon será fechado.',
    quitGameOpen: 'Há um jogo aberto. Ele continua rodando, mas o Equon deixa de contar o tempo.',
    cancel: 'Cancelar'
  },
  settings: {
    title: 'Configurações',
    tabs: {
      connections: 'Conexões',
      emulators: 'Emuladores',
      system: 'Sistema',
      appearance: 'Aparência',
      storage: 'Armazenamento',
      about: 'Sobre'
    },
    storage: {
      loading: 'Lendo os discos…',
      error: 'Não foi possível ler os discos.',
      empty: 'Nenhum disco encontrado.',
      local: 'Disco Local',
      removable: 'Disco removível',
      space: (free: string, total: string) => `${free} livres de ${total}`
    },
    appearance: {
      homeArt: 'Mostrar arte do jogo como background',
      homeArtHint:
        'No Início, a imagem da home do jogo em foco (ou a de abertura, ou a de fundo) fica atrás de tudo, desfocada e escurecida.',
      blur: 'Desfoque',
      dim: 'Escurecimento',
      /** "Capas da home" (D-27). */
      covers: 'Capas da home',
      coverSize: 'Tamanho',
      coverGap: 'Espaçamento',
      coverPosition: 'Posição',
      coverPositions: { top: 'Em cima', center: 'Centro', bottom: 'Embaixo' },
      /** After each level: the value recommended for the chosen position (owner decision). */
      recommended: (value: string) => `(padrão ${value})`,
      /** "Em cima" fixes its size and spacing (D-29). */
      fixedForTop: '(fixo no Em cima)'
    },
    system: {
      startFullscreen: 'Iniciar em tela cheia',
      startFullscreenHint:
        'Vale a partir da próxima vez que o Equon abrir. O F11 entra e sai da tela cheia a qualquer momento.',
      openAtLogin: 'Iniciar com o sistema',
      openAtLoginHint: 'Abre o Equon quando você entra no Windows.',
      openAtLoginUnavailable: 'Disponível só na versão instalada do Equon.',
      uiSounds: 'Sons da interface',
      uiSoundsHint:
        'Sons ao navegar, confirmar e voltar. Ficam em silêncio enquanto um jogo está aberto.',
      homeDirectLaunch: 'Ignorar tela do jogo na home',
      homeDirectLaunchHint:
        'No Início, o A inicia o jogo direto. Se ele não abrir, a página do jogo mostra o motivo. A Biblioteca continua abrindo a página do jogo.',
      saveFailed: 'Não foi possível salvar esta opção. Tente de novo.'
    },
    steam: 'Steam',
    steamId: 'ID Steam',
    steamIdPlaceholder: 'Digite sua id Steam…',
    steamIdHint: 'SteamID64 (17 números), no endereço do seu perfil da Steam.',
    steamKey: 'Chave da Steam API',
    steamGridDb: 'SteamGridDB',
    steamGridDbKey: 'Chave do SteamGridDB',
    igdb: 'IGDB',
    igdbClientId: 'Client ID da Twitch',
    igdbClientSecret: 'Client Secret da Twitch',
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
    testOkIgdb: 'Credenciais válidas.',
    testNeedsIgdb: 'Configure o Client ID e o Client Secret para testar.',
    testErrors: {
      unavailable: 'O serviço está indisponível agora. Tente mais tarde.',
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
    refreshResult: (time: string, added: number, missing: number) =>
      [
        `Biblioteca atualizada às ${time}`,
        added > 0 ? (added === 1 ? '1 jogo novo' : `${added} jogos novos`) : null,
        missing > 0 ? (missing === 1 ? '1 não encontrado' : `${missing} não encontrados`) : null,
        added === 0 && missing === 0 ? 'nenhuma novidade' : null
      ]
        .filter(Boolean)
        .join(' · '),
    ownedNotConfigured:
      'Configure o ID Steam e a chave da API para trazer os jogos não instalados.',
    ownedFailed: (reason: string) => `Jogos não instalados não atualizados: ${reason}`,
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
      schema: 'Versão do banco de dados',
      sounds: 'Sons',
      soundsCredit:
        'Cosy User Interface SFX, por Jacob (SampleKingdom) · sample-kingdom.itch.io · Swipe, por JDSherbert · jdsherbert.itch.io'
    },
    loading: 'Carregando…',
    error: 'Não foi possível carregar as configurações.'
  },
  failure: {
    message: 'Algo deu errado nesta tela.',
    hint: 'Seus dados não foram afetados.',
    home: 'Voltar para o início'
  },
  activity: {
    achievements: 'Sincronizando conquistas…',
    library: 'Sincronizando jogos da Steam…',
    roms: 'Buscando dados das ROMs no IGDB…',
    metadata: 'Sincronizando jogos da Steam…',
    artwork: 'Baixando artes…',
    progress: (done: number, total: number) => `${done} de ${total}`
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
