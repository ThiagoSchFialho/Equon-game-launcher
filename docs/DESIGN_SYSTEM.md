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

### Home

A Home deve ajudar a retomar a atividade e descobrir a coleção, não ser
apenas um banner.

Regiões possíveis: - Navegação principal. - Continuar jogando. - Lista
de jogos recentes. - Atalho claro para a biblioteca completa.

Mostra todos os jogos instalados e não ocultos (sem limite), pela última sessão (mais
recente primeiro). A regra é fixa; o usuário não altera a ordem nem os
filtros do Início.

### Biblioteca

-   Densidade equilibrada: cards grandes o suficiente para reconhecer a
    arte, com quantidade suficiente para navegar pela coleção.
-   Busca, filtro e ordenação acessíveis sem abandonar o contexto.
-   Barra: campo de busca, "Origem" e "Ordenar" à esquerda;
    "Adicionar jogo" à direita. Y abre a busca (teclado
    virtual) e X (controle ou teclado) abre o diálogo de filtros
    (instalação, jogos ocultos e só jogos zerados). "Limpar filtros"
    fica ao lado de "Ordenar" e no diálogo; mantém a ordenação. Jogos ocultos, quando mostrados, aparecem esmaecidos com o
    selo "Oculto".
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

### Configurações

-   Categorias claras e grupos curtos.
-   Explicar consequências de configurações potencialmente disruptivas.
-   Evitar diálogos complexos que sejam difíceis de operar por controle.
-   Sempre indicar como voltar e onde o foco está.
-   Acesso pela engrenagem ao lado do relógio, na barra superior (alcançada
    com o direcional para cima a partir da tela; nunca recebe o foco
    inicial).
-   Layout (mockup `settings ideas2`): barra lateral com as abas
    "Conexões", "Emuladores" e "Sobre"; conteúdo à direita.
-   Conexões: Steam (ID Steam; chave da Steam API com Alterar/Remover ou
    Configurar; "Testar conexão"), SteamGridDB (chave; "Testar conexão")
    e o painel "Biblioteca" com "Atualizar biblioteca" e o resultado da
    última leitura, sempre com o horário e o que mudou ("nenhuma novidade"
    quando nada mudou); se os jogos não instalados não puderem ser lidos,
    o motivo aparece logo abaixo. Chaves aparecem só como "Configurada" / "Não
    configurada", nunca o valor.
-   Emuladores: uma linha por emulador suportado, com o executável
    configurado; trocar vale para todos os jogos do emulador.
-   Sobre: versão do Equon, sistema, pasta da Steam detectada, pasta de
    dados, versão do banco e versões de Electron, Chromium e Node.js.

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

  `color.focus`            `#F3F4F6`      Foco de navegação (branco;
                                          decisão da Fase 3)

  `color.success`          `#78C6A3`      Confirmação e sucesso

  `color.warning`          `#E7B86A`      Avisos

  `color.danger`           `#F07C7C`      Erros e ações destrutivas

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
de tela: 28--36 px. - Título de card: 18--22 px. - Corpo: 16--18 px. -
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
`space-12`: 48 px - `space-16`: 64 px

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
    foco ao item de onde o usuário saiu.
-   O acesso às opções deve ser possível por controle.
-   Não exigir digitação por teclado físico para realizar tarefas
    básicas; considerar um teclado virtual ou um fluxo alternativo se a
    busca textual for essencial.

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

Cada jogo pode ter cinco artes. Os nomes abaixo são os mesmos usados no
banco de dados (`GAME_ARTWORK.kind`). A capa vertical e a quadrada são
artes independentes; nenhuma é recortada a partir da outra.

| Arte (`kind`) | Formato | Onde aparece nos mockups |
| --- | --- | --- |
| `cover_square` | Capa quadrada (1:1) | Biblioteca (grade de cards) |
| `cover_portrait` | Capa vertical 600×900 (2:3) | Início (cards de continuar jogando e recentes) |
| `logo` | Logotipo, preferencialmente com transparência | Detalhes do jogo, sobre o fundo |
| `background` | Imagem 1920×1080 (16:9) | Detalhes do jogo, como arte dominante |
| `header` | Imagem larga (`header_image` da Steam, cerca de 2:1) | Lista de conquistas, miniatura de cada jogo |

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
    | X / Y | `secondary` / `tertiary`: no teclado virtual, apagar / espaço; na Biblioteca, filtros / busca | X (filtros na Biblioteca) |
    | LT / RT | `leftTrigger` / `rightTrigger`: no teclado virtual, maiúsculas / pronto | — |

    Ao editar um campo de texto, o teclado físico digita normalmente (letras, Backspace, Enter) em vez de acionar atalhos.

    O mouse foca ao passar e confirma ao clicar.
-   Não capturar entradas globais que impeçam o uso normal de campos de
    texto ou do sistema.
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
-   Ação "Desinstalar" no menu de opções do jogo (item futuro; fora do MVP).

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
