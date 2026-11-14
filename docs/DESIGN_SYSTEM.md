# Game Launcher --- Design System

**Versão:** 0.3\
**Status:** Direção visual inicial; valores sujeitos a prototipagem; tipos de arte alinhados a `ARCHITECTURE.md` (D-15)\
**Plataforma:** Windows, foco em monitor/TV 16:9\
**Direção:** híbrida e autoral, cinematográfica, editorial e
retro-moderna

## 1. Intenção visual

Construir uma interface de jogos que pareça um produto próprio: arte de
jogos com presença, hierarquia editorial clara e pequenos detalhes
inspirados em interfaces clássicas de jogos. O visual deve ser premium
sem excesso de efeitos, legível a distância e funcional com controle.

### Princípios

1.  **Arte primeiro, sem sacrificar leitura:** capas e imagens grandes
    podem dominar a composição, mas títulos e ações precisam manter
    contraste.
2.  **Foco evidente:** o elemento selecionado deve ser identificável em
    uma olhada.
3.  **Hierarquia editorial:** título, metadados e ações têm níveis
    visuais distintos.
4.  **Retro como detalhe:** usar referências em iconografia,
    microdetalhes e tratamento de informação, não transformar tudo em
    pixel art.
5.  **Movimento funcional:** animações comunicam navegação, seleção e
    transição; não devem atrasar o uso.
6.  **Consistência:** o mesmo estado de foco ou ação deve se comportar
    da mesma forma em toda a aplicação.

## 2. Direção de layout

### Navegação híbrida

-   Uma região principal compacta para as áreas globais do produto.
-   Navegação contextual nas telas que precisarem de subcategorias ou
    ações adicionais.
-   Não manter um menu lateral permanente se ele competir com a arte ou
    reduzir excessivamente a área útil.
-   A navegação deve funcionar por controle, teclado e mouse.
-   A região ativa precisa ter estado visual e semântico claro.
-   Tela de abertura (D-35): fundo `color.background`, o ícone do app no
    centro, "Equon" embaixo em `font-size-display` seminegrito
    (`color.text-primary`) e três pontos que pulsam em
    `color.text-secondary` (parados com movimento reduzido). Fica até a
    Home estar pronta, entre 1 s e 6 s, e sai com fade de opacidade
    (`motion-screen`). Nada nela recebe foco.

### Home

A Home deve ajudar a retomar a atividade e descobrir a coleção, não ser
apenas um banner.

Regiões possíveis: - Navegação principal. - Continuar jogando. - Lista
de jogos recentes. - Atalho claro para a biblioteca completa.

Mostra todos os jogos instalados e não ocultos (sem limite, salvo com "Limitar quantidade de
jogos na home", D-31: só os 12 mais recentes), pela última sessão (mais
recente primeiro). A regra é fixa; o usuário não altera a ordem nem os
filtros do Início.

Os cards ficam numa fila horizontal, e o card em foco fica no centro da
tela, com o nome e o tempo de jogo embaixo dele (decisão do dono do
projeto). Nas pontas a fila para, sem espaço vazio antes do primeiro card
nem depois do último: o primeiro fica na margem esquerda e o último à
mesma distância da direita, então ali o card em foco sai do centro. Se
todos couberem na tela, a fila fica parada a partir da esquerda. Quando o
foco muda, o nome e o tempo de jogo não deslizam junto: somem num fade
rápido e aparecem num fade rápido embaixo do novo card (metade de
`--motion-focus` cada; sem fade com movimento reduzido).

O fundo do Início não é liso (decisão do dono do projeto): sobre
`--color-background` há um brilho radial bem sutil do centro, na cor
`--color-surface-raised`, e uma vinheta igualmente sutil que escurece as
bordas. Ambos são estáticos; o rodapé mantém a cor própria. Para não
aparecerem anéis entre os tons (banding, em telas de 8 bits), os degradês
usam paradas suavizadas e um ruído fino, quase invisível, por cima.

Com "Mostrar arte do jogo como background" (Configurações › Aparência,
D-25), a imagem da home do jogo em foco (D-30; sem ela, a de abertura e,
sem esta, a de fundo) cobre a tela atrás de tudo, desfocada e escurecida
nos níveis escolhidos pelo usuário. Ela aparece inteira, sem ampliar nem
cortar as bordas: o desfoque é feito pela camada de escurecimento
(`backdrop-filter`), que repete a imagem nas bordas. Ao trocar de jogo, a nova entra num fade cruzado
(`--motion-screen`, só opacidade; sem fade com movimento reduzido), e só
depois que o foco para por 150 ms.

### Biblioteca

-   Densidade equilibrada: cards grandes o suficiente para reconhecer a
    arte, com quantidade suficiente para navegar pela coleção.
-   Busca, filtro e ordenação acessíveis sem abandonar o contexto.
-   O card em foco fica no centro da lista, e a rolagem acompanha o foco
    mesmo com o direcional segurado. Passar de uma linha para a outra leva
    cerca de 125 ms (decisão do dono do projeto: metade do tempo anterior).
-   Barra: campo de busca, "Filtrar" e "Ordenar" à esquerda;
    "Adicionar jogo" à direita. "Ordenar" ou X (controle ou teclado) abrem
    as opções de ordenação. "Filtrar", que mostra quantos filtros estão
    ativos, ou Y (controle ou teclado) abrem o diálogo de filtros: Origem
    (abre a lista de origens), Ocultos, Zerados, Instalados e Não
    instalados. Estes quatro ligam e desligam com A, com o diálogo aberto,
    e mostram "Ativo" quando ligados; o diálogo não tem "Limpar filtros"
    nem "Fechar" e fecha com B (decisão do dono do projeto). A busca
    (teclado virtual) não tem atalho: abre pelo campo na barra. "Limpar
    filtros" fica ao lado de "Ordenar"; mantém a ordenação. Jogos ocultos,
    quando mostrados, aparecem esmaecidos com o selo de oculto.
-   "Ordenar": Título, Recentes, Tempo de jogo, % de conquistas, Origem e
    Instalação (ocultos e zerados ficam só nos filtros). Ordenando por tempo de jogo ou por % de
    conquistas, o card mostra esse valor no canto inferior direito; jogos
    sem conquistas conhecidas não mostram percentual. A grade não separa os grupos; os selos mostram o estado.
-   Selos do card da Biblioteca, sempre visíveis, no canto inferior esquerdo,
    como ícones em um círculo: "Oculto" (olho cortado), "Instalado" (disco,
    nunca para estado desconhecido) e "Zerado" (troféu). O nome aparece ao
    passar o mouse. No Início, só "Oculto", que não ocorre lá: a lista só tem
    jogos instalados e não ocultos.
-   O card precisa comunicar título e foco; origem e estado de
    instalação podem aparecer como informação secundária.
-   A biblioteca deve continuar utilizável com capas ausentes ou
    metadados incompletos.

### Detalhes do jogo

-   Arte principal como elemento visual dominante.
-   Título legível e ação principal clara.
-   Origem, estado de instalação e tempo jogado como metadados
    secundários.
-   Ações secundárias em hierarquia inferior.
-   Não inventar dados ou mostrar estatísticas sem fonte confiável.
-   "Jogar" é verde (`color.play`). Em um jogo da Steam não instalado,
    "Instalar", em azul (`color.install`), fica no lugar de "Jogar". Com estado desconhecido, continua "Jogar",
    indisponível. Jogos da Steam instalados têm "Desinstalar" nas opções, em
    vermelho. Os dois abrem a janela da própria Steam, que é quem confirma.
-   "Remover jogo", em vermelho no fim das opções, vale para qualquer jogo.
    Em um jogo da Steam (D-26) a confirmação tem três escolhas, nesta ordem:
    "Cancelar" (foco inicial), "Remover" e "Remover e criar exceção", esta em
    vermelho. O texto explica cada uma, com o nome das duas em negrito.
-   Ao apertar "Jogar", o botão mostra "Abrindo…" e fica indisponível por
    10 s, em qualquer caso, inclusive ao sair e voltar à página: jogos abertos
    por atalho `.url` não dão outro sinal de que algo aconteceu. "Em execução"
    tem prioridade; uma abertura pela Steam que demore mais continua em
    "Abrindo…" até terminar.
-   Também ao apertar "Jogar", a imagem de abertura do jogo aparece com fade na
    frente de tudo, no monitor inteiro, e só então o jogo é chamado. Ela sai com
    fade 2 s depois que o jogo abre, ou em no máximo 60 s; B a tira da tela sem
    fechar o jogo. Sem imagem de abertura, mostra a imagem de fundo; sem ela, o
    logo; sem logo, o título. Fades
    de cerca de 0,6 s, e nenhum com movimento reduzido. No canto inferior
    direito, sempre, "Carregando" com três pontos que acendem um de cada vez
    (só `opacity`, ciclo de 1,2 s; parados com movimento reduzido), em
    `--font-size-screen-title`, com uma sombra escura em volta de letras e pontos para ler sobre imagens claras.
    Ele entra com o fade da imagem, mas some de uma vez logo antes do fade de
    saída (2 s depois que o jogo abre, ou com B, ou nos 60 s).

### Configurações

-   Categorias claras e grupos curtos.
-   Explicar consequências de configurações potencialmente disruptivas.
-   Evitar diálogos complexos que sejam difíceis de operar por controle.
-   Sempre indicar como voltar e onde o foco está.
-   Acesso pelo menu do sistema (botão Xbox ou ícone no rodapé).
-   Sem barra superior de navegação (decisão do dono do projeto, depois da
    Fase 8): sai-se com Voltar (B), com o foco nas abas, ou pelo link
    "← <tela anterior>" acima delas, igual ao da página do jogo e alcançado
    com o direcional para cima; o trabalho em segundo plano aparece no
    rodapé.
-   Layout (mockup `settings ideas2`): barra lateral com as abas
    "Conexões", "Emuladores", "Sistema", "Aparência", "Armazenamento" e
    "Sobre"; conteúdo à direita. Mover o foco para cima ou para baixo na
    lista já abre a aba (decisão do dono do projeto), sem precisar de A.
    A numa aba leva o foco ao primeiro item da página (numa página que ainda
    carrega, quando os itens aparecem); B dentro da página devolve o foco à
    aba, e B numa aba volta à tela anterior. O mouse abre a aba com o clique,
    que também leva o foco à página. Os direcionais nunca passam entre as
    abas e a página (decisão do dono do projeto): só A entra e só B volta. A
    página tem um respiro maior embaixo (`--space-10`) depois da última
    opção.
-   Aparência: checkbox "Mostrar arte do jogo como background" e dois
    níveis, "Desfoque" e "Escurecimento", indisponíveis enquanto ela está
    desmarcada. Um nível é uma linha focável com o nome à esquerda e, à
    direita, "−", uma barra de passos em `--color-accent`, "+" e o valor;
    esquerda e direita mudam o valor e, no fim da faixa, movem o foco
    normalmente. Cada passo toca o som de mover o foco. Com mais de 20
    passos, a barra vira uma faixa contínua, preenchida até o valor.
    Depois do nome de "Desfoque", "Escurecimento", "Tamanho" e
    "Espaçamento" aparece, em cinza, "(padrão x)": o valor recomendado
    para a posição escolhida (decisão do dono do projeto). Centro: 6, 80%,
    72 e 35. Embaixo: 0, 10%, 30 e 5. Em cima: 0 e 10% (Tamanho 13 e Espaçamento 5 são fixos). É só uma referência: nada muda
    sozinho ao trocar a posição.
-   Aparência › "Capas da home" (D-27): título e, embaixo, um painel com o
    checkbox "Limitar quantidade de jogos na home" (D-31; só os 12 jogados
    mais recentemente, desmarcado por padrão), "Tamanho" e "Espaçamento" (níveis de 1 a 100) e "Posição", com
    "Em cima", "Centro" e "Embaixo" lado a lado; a escolhida fica em
    `--color-accent`. Esquerda e direita escolhem (no fim, movem o foco),
    A passa para a próxima e o mouse clica. Só a capa muda de tamanho; o
    nome e o tempo de jogo mantêm o deles. A posição considera o conjunto
    capa + nome + tempo de jogo (decisão do dono do projeto): "Centro" o
    centraliza entre a barra superior e o rodapé, com a capa vertical; e
    "Embaixo" é uma prateleira perto do rodapé, inspirada na tela inicial
    do PS5 (decisões do dono do projeto): capas quadradas; a capa em foco
    no tamanho escolhido, sempre no lugar da primeira (é a fileira que
    anda); as outras menores que ela pela altura do nome mais 10 px,
    alinhadas pela base da capa em foco; e só o nome do jogo (sem tempo de
    jogo), em `--font-size-shelf-title` com a altura de linha 10 px maior, com sombra para ler sobre a arte,
    ao lado da capa em foco, 10 px acima das capas pequenas. A capa em foco
    tem o dobro do espaçamento dos dois lados. Por trás das capas, um
    degradê escuro na cor de fundo sobe do rodapé até 12rem acima da
    capa em foco e se dissolve na arte, para a prateleira se destacar. Ao mudar o foco, a capa nova cresce e a anterior
    encolhe (só `transform`). "Em cima" é a mesma prateleira espelhada
    (decisão do dono do projeto): perto da barra superior, as capas
    pequenas alinhadas pelo topo da capa em foco, o nome 10 px abaixo
    delas e sem o degradê de cima (decisão do dono do projeto),
    mas com uma vinheta, do topo da tela por trás da barra superior, que escurece as bordas em volta de uma área
    clara à direita, onde costuma ficar o personagem da arte (como no
    PS5); mesmos comportamentos do "Embaixo". No "Em cima", a capa em foco é 15% maior (as
    pequenas não mudam) e o nome fica em 28 px com peso normal (decisões
    do dono do projeto). A fileira começa com um
    atalho para as Configurações (D-32), desenhado como uma capa: um
    quadrado escuro meio transparente com a engrenagem no meio; o foco
    continua começando no primeiro jogo. Com ele em foco, o fundo da Home
    mostra uma imagem própria (engrenagens azuladas, `settings-bg.png`),
    com o mesmo desfoque e escurecimento da arte dos jogos. Embaixo dela,
    no lugar do painel do jogo, aparecem as "Configurações rápidas" (D-33),
    só com o título, sem texto de explicação: "Atualizar biblioteca" (com "Atualizada às 18:02", ou o motivo se a última falhou), "Tela
    cheia", "Ignorar tela do jogo na home" e "Limitar jogos na home" (as
    três com "Ligado" ou "Desligado"), em quadrinhos de vidro fosco como
    os das conquistas. Para baixo no atalho entra na fileira, A muda a
    opção na hora, para cima ou B volta ao atalho. Só no "Em cima" (D-29),
    abaixo da prateleira e alinhado com a capa em foco, um painel do jogo
    em foco: o logo, inteiro e centralizado sempre no mesmo ponto, com
    sombra (sem o brilho escuro por trás, decisão do dono do projeto)
    (jogo sem logo não mostra nada) no alto; no canto inferior esquerdo,
    perto do rodapé, "Últimas conquistas" (sem a contagem de progresso,
    decisão do dono do projeto) e, embaixo, as 4 mais recentes (ícone
    e nome) e "Ver todas", em quadrinhos pequenos de vidro fosco
    (`--color-surface-raised` a 45%, com desfoque do que fica atrás e
    `--radius-panel`); no canto inferior direito, só o tempo de jogo,
    num fundo escuro meio transparente (desenho e decisão do dono do
    projeto). Para baixo na capa entra na fileira; esquerda e direita andam;
    para cima ou B volta à mesma capa; A abre as conquistas do jogo. A
    conquista em foco é descrita embaixo (troféu, nome, descrição,
    raridade e data). Sem nenhuma conquista obtida, o bloco de conquistas
    inteiro some (decisão do dono do projeto); ficam o logo e o tempo de
    jogo. O painel troca junto com o nome. No "Em cima",
    Tamanho e Espaçamento ficam fixos em 13 e 5, e Desfoque e
    Escurecimento da arte de fundo em 0 e 10%; todos aparecem indisponíveis
    em Aparência, com "(fixo no Em cima)". Nas duas posições o nome aparece inteiro, numa linha, mesmo
    passando da largura da capa. O tamanho 100 é o maior que ainda fica bom. Os padrões são
    o tamanho e o espaço de antes.
-   Conexões: no topo, o painel "Biblioteca" com "Atualizar biblioteca" e o
    resultado da última leitura, sempre com o horário e o que mudou
    ("nenhuma novidade" quando nada mudou); se os jogos não instalados não
    puderem ser lidos, o motivo aparece logo abaixo. Com jogos Steam nas
    exceções (D-26), o painel diz quantos são e ganha "Jogos ignorados", que
    abre a lista; escolher um pede confirmação para tirá-lo das exceções.
    Depois, Steam (ID
    Steam; chave da Steam API com Alterar/Remover ou Configurar; "Testar
    conexão"), SteamGridDB (chave; "Testar conexão") e IGDB (Client ID e
    Client Secret; "Testar conexão"). Chaves aparecem só como "Configurada" / "Não
    configurada", nunca o valor.
-   Emuladores: para cada emulador suportado, o nome dele como título e,
    embaixo, um painel (como o de Sistema) com duas linhas de nome à
    esquerda e campo à direita: "Executável" e "Pasta das ROMs" (decisão
    do dono do projeto). Trocar o executável vale para todos os jogos do
    emulador. Sem executável, a linha da pasta fica indisponível, com
    "Escolha o executável primeiro".
-   Sistema: checkboxes "Iniciar em tela cheia", "Iniciar com o sistema",
    "Sons da interface" e "Ignorar tela do jogo na home", salvos assim que
    mudam. "Iniciar com o sistema" fica indisponível, com o motivo, fora da
    versão instalada. Com "Ignorar tela do jogo na home" ligado (D-28), o A
    numa capa do Início inicia o jogo, a dica do A no rodapé diz "Jogar",
    o X abre a página do jogo (dica "X Detalhes" no rodapé) e
    o menu de opções da capa começa com "Ver página do jogo"; se o jogo não
    abrir, a página dele abre e mostra o motivo.
-   Armazenamento: um cartão por disco local ou removível, com nome e
    letra, "Jogos no Equon: X GB" e uma barra dividida por jogo (D-34),
    como a da Steam: os 9 maiores jogos daquele disco, do maior para o
    menor, cada um numa cor da paleta de gráficos; os outros jogos juntos
    em `color.chart-other`; o resto do disco em `color.chart-rest`; e o
    espaço livre, listrado. Os trechos ficam
    colados, sem espaço entre eles e sem cantos arredondados. Embaixo, a
    legenda com bolinha, nome e tamanho ("aprox." para pastas somadas,
    "mais de" quando a soma parou no limite) e "X GB livres de Y GB", que
    fica em `color.danger` com menos de 10% livre. "Ver todos" abre a lista
    de todos os jogos do disco, inclusive os de tamanho desconhecido.
-   Sobre: versão do Equon, sistema, pasta da Steam detectada, pasta de
    dados, versão do banco e versões de Electron, Chromium e Node.js. Por
    último, o crédito dos sons ("Cosy User Interface SFX", de Jacob,
    SampleKingdom, e "Swipe", de JDSherbert, cuja licença exige o crédito;
    detalhes em `design/sounds/CREDITS.md`), em texto, sem link.

## 3. Tokens visuais iniciais

Os valores abaixo são uma base para protótipo, não uma identidade final
aprovada. Devem ser validados em telas reais e em diferentes condições
de iluminação.

### Cores

  -----------------------------------------------------------------------
  Token                    Valor inicial  Uso
  ------------------------ -------------- -------------------------------
  `color.background`       `#101216`      Fundo global

  `color.surface`          `#191D24`      Superfícies principais

  `color.surface-raised`   `#232833`      Painéis e menus elevados

  `color.text-primary`     `#F3F4F6`      Texto principal

  `color.text-secondary`   `#A7AFBC`      Metadados e texto secundário

  `color.border`           `#343B48`      Divisórias e contornos
                                          discretos

  `color.accent`           `#D7A85B`      Acento quente, referência retrô

  `color.play`             `#21963A`      Botão "Jogar", com texto claro, em
                                          tom parecido com o da Steam

  `color.install`          `#2A7FE0`      Barra de disco e botão "Instalar" de jogos da Steam,
                                          com texto claro, em tom parecido
                                          com o da Steam

  `color.focus`            `#F3F4F6`      Foco de navegação (branco;
                                          decisão da Fase 3)

  `color.success`          `#78C6A3`      Confirmação e sucesso

  `color.warning`          `#E7B86A`      Avisos

  `color.danger`           `#F07C7C`      Erros e ações destrutivas

  `color.chart-1` … `-9`   `#3987E5` `#D95926` `#199E70` `#9085E9` `#D55181` `#008300` `#B062D6` `#7A9A12` `#1B9FB8`   Paleta de gráficos (D-34), nesta ordem fixa, nunca reaproveitada: um jogo por cor na barra de cada disco. Validada no fundo escuro, inclusive para daltonismo

  `color.chart-other`      `#7D8594`      Gráficos: os demais jogos, juntos

  `color.chart-rest`       `#4A5262`      Gráficos: o resto do disco, que não é jogo do Equon

  `color.footer`           `#080A0D`      Rodapé com as dicas de botões

  `color.success-bg`       `#268E60`      Fundo de mensagens de sucesso

  `color.warning-bg`       `#F29700`      Fundo de avisos

  `color.danger-bg`        `#BD4545`      Fundo de erros

  `color.btn-a`            `#87BE5C`      Ícone do botão A nas dicas

  `color.btn-b`            `#EC4049`      Ícone do botão B nas dicas

  `color.btn-x`            `#6092FD`      Ícone do botão X nas dicas

  `color.btn-y`            `#F2BD65`      Ícone do botão Y nas dicas
  -----------------------------------------------------------------------

Os tokens de rodapé, fundos de estado e botões vêm de `design/colors.png` (Fase 3).

O rodapé tem 60 px de altura em todas as telas (`--footer-height`, decisão do dono do
projeto: 20 px a menos que os 80 px originais); o menu do sistema sobe a partir dele.

Regras: - Não usar o acento em todos os elementos; reservar para
seleção, ações importantes e detalhes. - Não depender apenas da cor para
diferenciar estado. - Verificar contraste antes de aprovar os tokens. -
Evitar gradientes decorativos extensos sobre áreas com texto. - As capas
podem conter cores variadas; a interface deve continuar legível sobre
elas.

### Tipografia

Família: **Montserrat** (SIL Open Font License), embutida no aplicativo a
partir de `design/fonts/montserrat` (com `OFL.txt`). Alternativa segura:
`Segoe UI`, `sans-serif`. Usar apenas os pesos necessários.

Escala inicial para 1920×1080: - Título de destaque: 36--48 px. - Título
de tela: 28--36 px. - Nome na prateleira da Home ("Capas da home" ›
Embaixo, D-27): 24 px (`--font-size-shelf-title`, decisão do dono do
projeto); no "Em cima", 28 px (`--font-size-shelf-title-large`) e peso
normal. - Título de card: 18--22 px. - Corpo: 16--18 px. -
Metadados: 13--15 px. - Texto auxiliar nunca deve ser tão pequeno que
fique ilegível à distância.

Os valores devem usar tokens escaláveis e ser validados também em
1280×720. Não usar tipografia retrô decorativa para textos longos.

**Escala:** medidas são definidas para 1920×1080 em `rem`; o tamanho de
fonte da raiz acompanha a janela (`min(100vw / 1920, 100vh / 1080)`),
então a mesma composição funciona em 1280×720 e 2560×1440 sem valores
separados por resolução.

### Espaçamento

Adotar uma escala baseada em múltiplos de 4 px: - `space-1`: 4 px -
`space-2`: 8 px - `space-3`: 12 px - `space-4`: 16 px - `space-5`: 20
px - `space-6`: 24 px - `space-8`: 32 px - `space-10`: 40 px -
`space-12`: 48 px - `space-14`: 56 px - `space-16`: 64 px

Usar margens externas generosas e espaçamento consistente entre regiões.
Ajustar densidade pela composição, não reduzindo indiscriminadamente
todos os espaços.

### Cantos, contornos e profundidade

-   Cards: raio inicial de 8--12 px.
-   Painéis: raio inicial de 12--16 px.
-   Botões: raio consistente com a linguagem dos cards.
-   Contornos de foco devem permanecer nítidos mesmo em fundos claros.
-   Contorno de foco: `color.focus`, 2 px, com 4 px de afastamento do
    elemento (Fase 3).
-   Sombras são discretas e funcionais; não usar sombras pesadas em
    todos os elementos.
-   O contorno de foco não deve ser cortado por containers com
    `overflow: hidden`.

## 4. Componentes e estados

### Menu do sistema

Ícone do Xbox no canto esquerdo do rodapé, em todas as telas. O botão Xbox do
controle, o clique no ícone ou a tecla Home abrem o menu logo acima do ícone,
inclusive sobre um diálogo; B, o botão Xbox ou um clique fora fecham, e o foco
volta para onde estava. O ícone não entra na navegação por direcional, para o
rodapé não atrapalhar as grades.

Itens, nesta ordem: "Mudar para tela cheia" ou "Mudar para modo janela",
conforme o estado atual; "Configurações"; "Desligar sistema", em vermelho;
"Sair". "Configurações" fica indisponível, com o motivo, no formulário de jogo
e em "Editar artes", para não perder o que não foi salvo. "Desligar sistema" e
"Sair" pedem confirmação, com o foco inicial em "Cancelar", que volta à lista;
se houver um jogo aberto, a confirmação avisa.

### Checkbox

Caixa, título e descrição opcional; a linha inteira recebe o foco e a
confirmação (A) alterna o valor. Marcado usa `--color-accent`, com o sinal
em `--color-background`.

Estados: - Desmarcado. - Marcado. - Focado. - Indisponível (continua
focável, para o motivo poder ser lido, e não muda). - Erro (a caixa fica como
estava e o motivo aparece abaixo).

### Game card

Conteúdo mínimo: - Arte ou placeholder. - Título. - Estado de foco. -
Metadados opcionais, como origem ou estado de instalação.

Estados: - Padrão. - Focado. - Selecionado/ativo, quando diferente de
foco. - Indisponível. - Sem arte. - Carregando. - Erro de metadados.

O estado focado pode combinar contorno, escala moderada e mudança de
superfície. Evitar mudanças grandes de escala que desloquem a grade ou
causem recorte.

### Botão

Variantes: - Primário: ação principal, por exemplo, jogar. - Secundário:
ação de apoio. - Terciário/ícone: ação contextual. - Destrutivo: remover
ou apagar.

Estados: - Padrão, foco, pressionado, desabilitado e carregando.

O foco de controle deve ser distinto do hover do mouse. Não depender
apenas de animação para mostrar que uma ação foi ativada.

### Navegação

-   A barra superior (Início, Biblioteca, Conquistas) é uma pílula em
    `--color-surface` a 75% de opacidade, com a borda `--color-border` e
    uma sombra forte (`0 0.5rem 2rem`, preto a 50%), para se destacar sobre
    o fundo e a arte do jogo (decisão do dono do projeto).
-   Trabalho em segundo plano (sincronização de conquistas, inclusive a
    espera depois de fechar um jogo; sincronização dos jogos da Steam;
    download de artes) aparece à esquerda da barra superior (nas telas sem barra superior, como
    a página do jogo, à esquerda do rodapé), com uma animação simples
    de carregamento e o progresso ("Baixando artes… 12 de 225"). O indicador
    nunca recebe foco, não bloqueia a tela e some ao terminar.
-   Indicar a região atual.
-   Manter uma ordem de foco previsível.
-   Ao abrir um diálogo, mover o foco para dentro dele.
-   Ao fechar, devolver o foco ao elemento que o abriu, quando ainda
    existir.
-   Definir comportamento para voltar, inclusive em submenus e telas de
    detalhes.
-   Evitar armadilhas de foco e ciclos inesperados.

### Busca, filtros e ordenação

-   Campos e opções devem ter rótulos explícitos.
-   Alterações de filtro devem manter o contexto e informar quando não
    houver resultados.
-   Ao mudar ordenação, filtro ou busca, e ao trocar de seção ou abrir uma
    tela, o foco vai para o primeiro item da lista. Voltar (B) devolve o
    foco ao item de onde o usuário saiu, que já aparece na tela de imediato,
    sem animação de rolagem.
-   O acesso às opções deve ser possível por controle.
-   Não exigir digitação por teclado físico para realizar tarefas
    básicas; considerar um teclado virtual ou um fluxo alternativo se a
    busca textual for essencial.

### Editar artes

-   Tela em painéis com rolagem, um por arte: nome e prévia à esquerda, botões à direita. Salvar e Cancelar ficam fixos embaixo. O foco em um botão traz o painel inteiro para a tela.
-   Start salva de qualquer ponto da tela, com a dica no rodapé.
-   A capa vertical é mostrada como no Início: 2:3 e esticada. As outras mantêm a proporção.
-   Só aparecem os botões de fontes que têm aquela arte. "Remover imagem" fica indisponível quando não há o que remover.
-   "Imagens da Steam" aparece só na imagem de fundo de jogos da Steam e abre uma galeria com o "Fundo da loja", quando o jogo tem um próprio, e as prints ("Print 1", "Print 2"...). Só são listadas imagens 16:9.
-   Ações de remover nesta tela e nas Configurações usam o ícone `delete.svg`.

### Adicionar e editar jogo

-   Start salva de qualquer ponto do formulário, com a dica "Salvar" no
    rodapé, como o botão principal: ao adicionar, abre a busca no IGDB; ao
    editar, salva (jogos da Steam e os outros). Diálogos abertos por cima,
    como o teclado virtual, ficam com o Start para si.
-   Em jogos da Steam, cada campo tem à direita um botão secundário
    "Preencher com IGDB" só para ele; o controle vai do campo ao botão com
    a direita. O aviso de que o IGDB não tem a informação aparece embaixo
    do campo, no estilo das notas do formulário. Não há o botão que
    preenche todos os campos de uma vez.

### Diálogos e notificações

-   Usar diálogos para decisões que exigem confirmação.
-   Preferir mensagens inline para estados não críticos.
-   Erros devem explicar o que falhou e oferecer uma ação possível
    quando apropriado.
-   Não mostrar notificações que dependam de desaparecer rapidamente
    para serem entendidas.

## 5. Movimento e animação

Direção: suave, curta e funcional.

Faixas iniciais para protótipo: - Resposta de foco: 100--160 ms. -
Hover/pressionamento: 100--160 ms. - Transição entre painéis: 160--240
ms. - Transição de tela: 180--280 ms.

Esses tempos são hipóteses para teste. Não atrasar ações críticas, como
iniciar um jogo, apenas para completar uma animação.

Regras: - Animar preferencialmente `transform` e `opacity`. - Evitar
animar propriedades que provoquem recálculo de layout em listas
grandes. - Não usar parallax ou zoom agressivo como padrão. - Respeitar
uma preferência de movimento reduzido quando implementada. - Garantir
que foco e estado final permaneçam claros se animações forem
desativadas.

## 6. Capas, imagens e fundos

### Tipos de arte por jogo

Cada jogo pode ter seis artes. Os nomes abaixo são os mesmos usados no
banco de dados (`GAME_ARTWORK.kind`). A capa vertical e a quadrada são
artes independentes; nenhuma é recortada a partir da outra.

| Arte (`kind`) | Formato | Onde aparece nos mockups |
| --- | --- | --- |
| `cover_square` | Capa quadrada (1:1) | Biblioteca (grade de cards) |
| `cover_portrait` | Capa vertical, exibida em 2:3 e sempre esticada para caber inteira, sem corte nem barras (decisão do dono do projeto) | Início (cards de continuar jogando e recentes) |
| `logo` | Logotipo, preferencialmente com transparência; `contain`, centralizado no seu espaço (sem logo, o nome do jogo, também centralizado) | Detalhes do jogo, sobre o fundo |
| `background` | Imagem 1920×1080 (16:9) | Detalhes do jogo, como arte dominante |
| `header` | Imagem larga (`header_image` da Steam, cerca de 2:1) | Lista de conquistas, miniatura de cada jogo |
| `launch` | Imagem de abertura, 16:9, com `cover`; sem ela, usa-se o `background` | Tela inteira enquanto o jogo abre |
| `home` | Imagem da home, 16:9, com `cover`; sem ela, usa-se o `launch` e, sem ele, o `background` (D-30) | Fundo do Início, desfocado e escurecido (D-25) |

### Regras

-   Não esticar imagens para preencher proporções incompatíveis.
-   Definir regras de `cover`/`contain` por componente e por tipo de
    arte (o fundo 1920×1080 usa `cover`; o logotipo usa `contain`).
-   Usar placeholders consistentes quando uma imagem estiver ausente,
    um por tipo de arte (cada um na proporção do seu tipo). A interface deve funcionar sem nenhuma arte.
-   Jogos sem fundo 1920×1080 (decidido na Fase 3): o painel da arte
    principal mostra o mesmo placeholder dos outros tipos, cinza com o
    nome do jogo.
-   Usar sempre as imagens do cache local; nunca carregar uma imagem
    remota em tempo de execução.
-   Carregar imagens progressivamente e limitar resolução/tamanho quando
    apropriado. Não carregar todas as capas em alta resolução ao mesmo
    tempo.
-   Usar gradientes de contraste somente quando necessários para
    legibilidade.
-   Não assumir que a imagem principal sempre terá espaço negativo no
    mesmo lado.
-   O logotipo deve permanecer legível sobre fundos variados; avaliar
    contraste antes de colocá-lo diretamente sobre a imagem.

## 7. Responsividade e área segura

Resoluções de validação: - 1920×1080 --- referência de design. -
1280×720 --- validar legibilidade e densidade. - 2560×1440 --- validar
escala e uso de espaço.

Não exigir ultrawide. Preservar margens seguras para telas de TV e
evitar posicionar informações essenciais nas extremidades. Definir
comportamento para escalonamento de interface e DPI do Windows.

## 8. Regras para controle

-   Toda ação principal deve ter foco visível.
-   Direções devem produzir deslocamento previsível.
-   O foco não deve desaparecer ao atualizar a lista, trocar filtro ou
    carregar imagens.
-   A ordem de foco deve refletir a hierarquia visual, não apenas a
    ordem do DOM quando isso causar navegação confusa.
-   Botões de voltar e confirmar devem ser consistentes, com mapeamento
    documentado:

    | Controle (layout Xbox) | Ação semântica | Teclado |
    | --- | --- | --- |
    | A | `confirm` | Enter, Espaço |
    | B | `back` | Esc, Backspace |
    | D-pad / analógico esquerdo | `up` / `down` / `left` / `right` | Setas |
    | Analógico direito | `scroll` | Page Up / Page Down |
    | LB / RB | `previousSection` / `nextSection` | Q / E |
    | ☰ (Menu) | `menu` | M, tecla de menu de contexto |
    | Xbox | `system`: abre e fecha o menu do sistema, em qualquer tela | Home |
    | X / Y | `secondary` / `tertiary`: no teclado virtual, apagar / espaço; na Biblioteca, ordenação / filtros; em Conquistas, trocar a ordenação / sincronizar | X / Y |
    | LT / RT | `leftTrigger` / `rightTrigger`: no teclado virtual, maiúsculas / pronto | — |

    Ao editar um campo de texto, o teclado físico digita normalmente (letras, Backspace, Enter) em vez de acionar atalhos.

    O mouse foca ao passar e confirma ao clicar.
-   Não capturar entradas globais que impeçam o uso normal de campos de
    texto ou do sistema.
-   Um comando do controle esconde o cursor do mouse; mexer ou clicar o mouse
    o traz de volta. Sem foco na janela, o cursor não muda.
-   Sem foco na janela, o controle é ignorado. A exceção é o primeiro aperto
    antes de o Equon ser usado: ele traz a janela para a frente e não faz mais
    nada; não age com um jogo aberto.
-   Testar com pelo menos um controle comum e validar comportamento para
    desconexão/reconexão.

## 9. Acessibilidade e estados

-   Contraste adequado para texto, ícones e foco.
-   Não comunicar erro/sucesso apenas com cor.
-   Alvos de interação grandes o bastante para uso a distância.
-   Evitar flashes e animações rápidas repetitivas.
-   Estados de carregamento devem explicar o que está acontecendo quando
    a espera for perceptível.
-   Estados vazios devem orientar o próximo passo.
-   Textos devem ser concisos, sem sacrificar clareza.

## 10. Sistema de conquistas

A área de Conquistas é uma seção própria da navegação principal,
distinta da Biblioteca. Deve seguir a linguagem visual do Equon e ser
inteiramente operável por controle, teclado e mouse.

### Visão geral

-   Exibir um resumo agregado com o total (soma de platinas, ouro, prata
    e bronze) e os totais por categoria.
-   Jogos ocultos também aparecem na lista, com o selo "Oculto" e a arte
    normal.
-   Os números devem ser derivados dos dados reais. Mockups e imagens de
    referência são ilustrativos e não estabelecem quantidades fixas.
-   Cada item da lista de jogos deve apresentar arte, título, origem,
    percentual de conclusão, barra de progresso e quantidade
    desbloqueada / total conhecido.
-   A ordenação padrão é por última sessão, do jogo jogado mais
    recentemente ao mais antigo.
-   As ordenações alternativas são por percentual de conclusão, do maior
    para o menor, e alfabética; a troca percorre as três em sequência.
-   A opção de ordenação atual deve ser identificável e a troca deve ser
    acessível por controle, teclado e mouse.
-   O item em foco fica no centro da tela, como na Biblioteca.
-   Jogos sem conquistas não precisam aparecer como itens normais na
    lista de progresso. Quando o usuário abrir a área de conquistas de
    um jogo sem suporte, mostrar uma mensagem explícita informando que o
    jogo não possui conquistas.

### Detalhes de um jogo

-   Apresentar progresso total, barra de conclusão e distribuição dos
    troféus por categoria.
-   Separar conquistas obtidas e não obtidas em duas regiões/colunas,
    conforme o espaço disponível.
-   Na lista de conquistas obtidas, ordenar pela data de aquisição, da
    mais recente para a mais antiga. Datas indisponíveis ficam depois
    das datas conhecidas.
-   Na lista de conquistas não obtidas, ordenar pela raridade da menos
    rara à mais rara. Para dados Steam, usar `global_percent` em ordem
    decrescente: maior percentual primeiro. Percentuais desconhecidos
    ficam ao final.
-   Conquistas bloqueadas mostram o ícone próprio da Steam para esse
    estado (`icongray`).
-   Cima/baixo percorrem só a coluna atual; esquerda/direita trocam de
    coluna.
-   Cada item pode apresentar ícone, nome, descrição, data de aquisição
    (quando desbloqueada e disponível) e percentual global de
    desbloqueio.
-   O tier da conquista deve ser reconhecível visualmente sem depender
    exclusivamente da cor.

### Classificação indicativa

A tela de detalhes mostra a classificação a partir de
`GAMES.required_age`, com as imagens de `design/clasificação indicativa`:
`L`, `10`, `12`, `14`, `16` e `18` usam a imagem correspondente. Qualquer
outro valor, inclusive vazio ou desconhecido, usa `pendente.png`. Nunca
inferir uma classificação que a fonte não informou.

### Estado platinado

-   Quando todas as conquistas conhecidas estiverem desbloqueadas e
    existir pelo menos uma conquista conhecida, apresentar um estado
    especial de jogo platinado.
-   Dar destaque à arte/ícone da Platina sem ocultar o histórico/lista
    de conquistas obtidas.
-   O estado platinado não deve ser inferido apenas pelo percentual
    arredondado exibido; deve ser determinado pela condição real de
    todas as conquistas conhecidas desbloqueadas.

### Sincronização e estados

-   A interface deve oferecer uma ação explícita para sincronizar
    manualmente as conquistas de todos os jogos compatíveis.
-   O fechamento de um jogo compatível pode disparar a sincronização
    somente daquele jogo.
-   Não apresentar sincronização periódica nem sincronização automática
    global.
-   Durante a sincronização, indicar atividade e, quando viável,
    progresso; ao terminar, informar sucesso parcial ou falhas por jogo
    sem bloquear a navegação.
-   Quando a fonte estiver indisponível, preservar os dados anteriores e
    indicar que estão desatualizados, se aplicável.
-   Diferenciar claramente jogo sem suporte a conquistas de erro de
    sincronização.

## 11. Critérios de aprovação visual

Uma tela ou componente está pronto quando: 1. Segue os tokens e não
introduz valores arbitrários sem justificativa. 2. Funciona em 1920×1080
e 1280×720. 3. Tem foco inequívoco por controle. 4. Apresenta estados
padrão, foco, indisponível, vazio e erro relevantes. 5. Mantém
legibilidade sobre imagens variadas. 6. Não causa recortes ou saltos de
layout em navegação. 7. Responde de forma aceitável sem animação. 8. Foi
revisado visualmente em execução, não apenas aprovado por leitura de
código.

## 12. Decisões ainda abertas

-   Nome e identidade de marca.
-   Logo e sistema de ícones próprios.
-   Layout definitivo da Home e da biblioteca.
-   Proporções e tamanhos finais dos cards.
-   Navegador de arquivos acessível por controle para escolher
    executáveis e imagens.
-   Configurações de movimento e acessibilidade expostas ao usuário.
-   Se haverá temas adicionais no futuro.

## 13. Instruções para implementação por IA

-   Não inventar uma nova paleta ou escala tipográfica por tela.
-   Consultar estes tokens antes de adicionar estilos.
-   Reutilizar componentes existentes antes de criar variantes.
-   Não criar animações decorativas sem propósito de interação.
-   Implementar estados de foco de gamepad e teclado como parte do
    componente.
-   Não considerar uma tela concluída sem capturas ou inspeção visual em
    execução.
-   Não transformar números ou quantidades presentes nos mockups em
    valores fixos; exibir sempre os dados reais disponíveis.
-   Usar apenas artes do cache local e os tipos de arte da seção 6;
    não inventar novos tipos sem atualizar este documento e o banco.
-   Atualizar este documento quando uma decisão de design for alterada.
