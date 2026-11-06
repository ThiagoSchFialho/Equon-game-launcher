# Game Launcher --- Product Requirements Document

**Versão:** 0.3\
**Status:** Em revisão; alinhado às decisões técnicas registradas em `ARCHITECTURE.md`\
**Plataforma-alvo:** Windows\
**Público inicial:** usuário de PC que quer uma experiência de
biblioteca de jogos semelhante à de um console\
**Princípio central:** descobrir, organizar e iniciar jogos com
simplicidade, priorizando o controle sem excluir mouse e teclado.

## 1. Visão do produto

Criar um launcher desktop que unifique jogos da Steam e jogos
adicionados manualmente em uma biblioteca visual, rápida e navegável por
controle. O produto deve combinar artes de jogos em destaque,
organização editorial e referências retrô discretas, mantendo identidade
própria.

O launcher não pretende substituir as lojas, vender jogos ou replicar
integralmente as funcionalidades de cada plataforma. Seu papel principal
é oferecer um ponto de entrada único para a coleção do usuário.

## 2. Objetivos

1.  Reunir em uma biblioteca jogos de diferentes origens.
2.  Permitir encontrar e iniciar um jogo sem depender de mouse.
3.  Oferecer uma interface visualmente marcante, legível a distância e
    adequada a telas 16:9.
4.  Manter configurações, dados locais e sessões entre execuções.
5.  Isolar integrações por origem para que uma falha de loja não
    comprometa toda a biblioteca.
6.  Manter uma base de código compreensível, testável e adequada à
    implementação assistida por IA.

## 3. Não objetivos do MVP

-   Criar uma loja própria ou processar compras.
-   Implementar amigos, chat, multiplayer ou feed social.
-   Sincronizar dados por nuvem ou exigir uma conta do launcher.
-   Garantir importação de estatísticas históricas de todas as lojas.
-   Oferecer um sistema público de plugins ou temas de terceiros.
-   Substituir os clientes oficiais necessários para alguns jogos, DRM
    ou serviços online.
-   Integrar automaticamente com a Epic Games Store ou com a GOG. Jogos
    dessas lojas, e de qualquer outro launcher, são adicionados
    manualmente.

## 4. Usuários e contexto de uso

### Perfil principal

Pessoa que joga no PC, possui jogos em mais de uma loja ou instalados
manualmente e quer navegar pela coleção usando um controle, inclusive
com o computador ligado a uma TV.

### Contextos importantes

-   Monitor convencional 16:9.
-   Uso em tela cheia e a uma distância maior da tela.
-   Navegação com controle como método principal.
-   Uso alternativo de mouse e teclado.
-   Biblioteca grande o suficiente para exigir busca, filtros e
    ordenação.
-   Jogos que precisam do cliente oficial para inicialização ou
    autenticação.

## 5. Princípios do produto

-   **Controle em primeiro lugar:** todo fluxo principal deve ser
    operável por gamepad.
-   **Biblioteca unificada:** a interface apresenta um catálogo
    coerente, mesmo que os dados venham de fontes diferentes.
-   **Transparência:** a origem, o estado de instalação e eventuais
    falhas devem ser compreensíveis.
-   **Sem promessas falsas:** mostrar somente metadados e estatísticas
    disponíveis ou coletados de forma confiável.
-   **Falha isolada:** uma integração indisponível não deve impedir o
    uso dos jogos de outras origens.
-   **Desempenho percebido:** a interface deve responder rapidamente,
    carregar imagens de forma progressiva e evitar animações
    desnecessárias.
-   **Identidade própria:** usar referências de gênero sem copiar
    diretamente a interface ou a marca de outro produto.

## 6. Escopo funcional do MVP

### 6.1 Biblioteca unificada

-   Mostrar jogos descobertos e adicionados manualmente.
-   Identificar a origem de cada jogo.
-   Diferenciar, quando conhecido, jogos instalados, não encontrados e
    com estado desconhecido.
-   Permitir atualizar/redescobrir a biblioteca.
-   Evitar duplicatas quando o mesmo jogo for descoberto por mais de uma
    fonte; permitir revisão de correspondências ambíguas.
-   Exibir estados vazios, carregamento e erros.

### 6.2 Integrações

-   **Steam:** descobrir instalações locais a partir dos arquivos da
    própria Steam (bibliotecas e manifestos de aplicativos), identificar
    o estado de instalação e de execução e iniciar jogos pelo protocolo
    `steam://rungameid/<appid>`.
-   **Manual:** permitir selecionar executável, argumentos opcionais e
    diretório de trabalho. É o caminho suportado para jogos da Epic
    Games Store, da GOG e de qualquer outro launcher. Alguns desses
    jogos podem só abrir pelo cliente oficial; esse caso deve ser
    validado com jogos reais.
-   **Origens:** cada jogo tem uma origem. De fábrica existem Steam,
    Jogo Local, Yuzu e PlayStation 2; o usuário pode criar, renomear e excluir
    as próprias origens (por exemplo, "Nintendo 64" para um emulador
    novo). Só a Steam tem integração automática; jogos de qualquer outra
    origem são adicionados manualmente, apontando para o `.exe` do jogo ou
    para um atalho `.url` (atalhos das lojas, como Epic; nesse caso o
    tempo de jogo não é medido).
-   **Emuladores:** as Configurações têm a aba "Emuladores", onde o usuário
    escolhe um emulador suportado (por enquanto só o Yuzu) e indica o
    executável dele. Ao adicionar um jogo, escolher uma ROM no campo
    Executável, com o Yuzu configurado, já faz dele um jogo do Yuzu; o
    launcher abre o jogo direto no emulador.

As integrações devem ser implementadas por adaptadores independentes.
Não presumir que todas as lojas ofereçam APIs públicas equivalentes.
Antes de implementar cada integração, documentar fontes de dados,
limitações, condições de teste e método de inicialização suportado.

### 6.3 Detalhes do jogo

-   Mostrar título, arte, tempo total de jogo, origem e estado de
    instalação quando conhecidos.
-   Disponibilizar ação principal para iniciar o jogo.
-   Mostrar tempo jogado, seja essa informação vinda de uma fonte
    externa ou registrada pelo launcher quando houver sessões
    observadas.
-   Mostrar metadados adicionais somente quando disponíveis.
-   Informar falhas de inicialização com uma mensagem útil e opção de
    tentar novamente.

### 6.4 Busca, filtros e ordenação

-   Busca por título (teclado virtual; ignora maiúsculas, acentos e
    pontuação).
-   Filtro por origem, incluindo as origens criadas pelo usuário.
-   Filtro por estado de instalação quando confiável (Todos /
    Instalados / Não encontrados; o estado desconhecido só aparece em
    "Todos").
-   Ordenação alfabética, por atividade recente e por tempo de jogo.
-   Padrão da Biblioteca: ordem alfabética, todos os jogos exceto os
    ocultos. Filtros permitem mostrar os ocultos e listar só os jogos
    zerados; "Limpar filtros" fica ao lado da ordenação.
-   Busca, filtros e ordenação são mantidos ao navegar entre telas e
    voltam ao padrão quando o aplicativo é reiniciado.
-   Início (regra fixa, não configurável): todos os jogos instalados e
    não ocultos, sem limite de quantidade, pela última sessão, do mais recente para o mais antigo.
-   Marcar como zerado e ocultar/mostrar ficam no menu de opções do
    jogo, para qualquer origem.
-   Arquitetura preparada para filtros adicionais sem reconstruir a
    tela.

### 6.5 Sessões e tempo jogado

-   Registrar início e término das sessões iniciadas pelo launcher
    quando o estado do processo puder ser observado.
-   Tratar encerramento inesperado e desligamento do launcher sem
    corromper o histórico.
-   Para jogos Steam, a Steam é a fonte da verdade: a cada abertura do
    launcher, o tempo total e a última vez jogado são sincronizados com
    a conta Steam do usuário (inclui o tempo jogado em outros
    computadores) e sobrescrevem os valores locais. As sessões
    observadas somam sobre esse valor até a próxima abertura. Sem chave
    da Steam ou com falha na sincronização, nada é sobrescrito.
-   Jogos de outras origens usam o tempo medido pelo launcher somado ao
    tempo informado pelo usuário ao cadastrar ou editar o jogo.
-   Não prometer capturar perfeitamente todos os processos filhos ou
    jogos iniciados por launchers intermediários na primeira versão.
-   Para jogos Steam, o início e o fim da sessão são observados pelo
    estado do jogo nos arquivos da Steam; o resultado é de melhor
    esforço, com precisão limitada pela forma de observação.
-   Toda sessão observada soma tempo ao total do jogo, qualquer que seja
    a origem e mesmo que o jogo seja fechado à força. Se o próprio
    launcher for encerrado inesperadamente enquanto um jogo roda, a
    sessão é fechada no último registro periódico (heartbeat) e esse
    tempo também é somado.

### 6.6 Controle e navegação

-   Navegar entre regiões principais, listas, cards, diálogos e
    configurações.
-   Comunicar foco atual com indicação visual inequívoca.
-   Possuir um teclado virtual para digitação com o controle
-   Suportar confirmar, voltar, direções e rolagem.
-   Evitar que a navegação fique presa em regiões ou diálogos.
-   Disponibilizar alternativas de teclado e mouse.
-   Definir comportamento para controle desconectado e reconectado.
-   Usar uma estratégia de entrada que possa ser testada e ampliada.

### 6.7 Configurações

-   Preferências visuais essenciais.
-   Configurações de navegação/entrada necessárias ao MVP.
-   Gerenciamento de caminhos e atualização das bibliotecas. A pasta da
    Steam é sempre detectada (registro do Windows e pasta padrão); todas as
    bibliotecas vêm do `libraryfolders.vdf`, sem caminho manual.
-   Conexões: SteamID64 e chaves da Steam Web API e do SteamGridDB
    (guardadas criptografadas), "Atualizar biblioteca", que também traz os
    jogos comprados e não instalados da conta Steam.
-   Aba "Emuladores" para indicar o executável de cada emulador suportado.
-   Aba "Sistema" com as opções "Iniciar em tela cheia" e "Iniciar com o
    sistema", desmarcadas por padrão.
-   Aba "Sobre" com informações básicas do sistema.
-   Opções para adicionar, editar e remover jogos manuais.
-   Informações básicas de diagnóstico para facilitar suporte.

### 6.8 Conquistas e progresso

#### Visão geral de conquistas

-   Disponibilizar uma área própria de Conquistas na navegação
    principal.
-   Exibir estatísticas agregadas da conta: total (soma de platinas,
    ouro, prata e bronze) e quantidades por categoria de troféu,
    conforme os dados persistidos e as regras de contagem deste
    documento.
-   Exibir uma lista dos jogos que possuem suporte a conquistas,
    inclusive os ocultos, com arte, título, origem, percentual de conclusão e quantidade
    desbloqueada em relação ao total conhecido.
-   A ordenação padrão da lista deve ser pela última sessão, começando
    pelo jogo jogado mais recentemente.
-   Disponibilizar também as ordenações por percentual de conclusão, do
    maior para o menor, e alfabética.
-   Não usar quantidades fixas ou exemplos numéricos dos mockups como
    requisitos. Os totais exibidos devem ser calculados a partir dos
    dados reais disponíveis.

#### Detalhes das conquistas de um jogo

-   Exibir o título do jogo, a quantidade de conquistas desbloqueadas em
    relação ao total conhecido e o percentual de conclusão, quando
    calculável.
-   Exibir os totais de troféus por categoria para o jogo, conforme as
    conquistas conhecidas e desbloqueadas.
-   Separar visualmente as conquistas obtidas das conquistas não
    obtidas.
-   Nas conquistas obtidas, ordenar pela data de aquisição, começando
    pela mais recente. Conquistas sem data de aquisição disponível devem
    aparecer depois das que possuem data.
-   Nas conquistas não obtidas, ordenar pela raridade, começando pela
    menos rara e seguindo até a mais rara. Usar o percentual global de
    desbloqueio como referência: maior percentual primeiro e menor
    percentual depois. Conquistas sem percentual global conhecido devem
    aparecer após as que possuem esse dado.
-   Exibir nome, descrição, ícone, estado de desbloqueio e data de
    aquisição quando essas informações estiverem disponíveis.
-   Exibir o percentual global de desbloqueio quando fornecido pela
    plataforma.

#### Platina

-   Quando todas as conquistas conhecidas de um jogo estiverem
    desbloqueadas e houver pelo menos uma conquista conhecida,
    apresentar o estado de jogo platinado.
-   Dar destaque visual à platina na tela de detalhes do jogo.
-   Jogos sem conquistas conhecidas não devem ser considerados
    platinados.

#### Sincronização e disponibilidade

-   Sincronizar as conquistas de todos os jogos compatíveis somente
    quando o usuário solicitar explicitamente uma sincronização manual.
-   Sincronizar automaticamente as conquistas apenas do jogo que acabou
    de ser fechado, quando esse jogo oferecer suporte e o encerramento
    puder ser observado pelo launcher.
-   Não executar sincronização periódica ou sincronização automática de
    toda a biblioteca.
-   Executar sincronizações em segundo plano, sem bloquear a interface,
    e apresentar progresso/resultado quando viável.
-   Armazenar os dados localmente, preservando as últimas informações
    válidas quando uma fonte estiver temporariamente indisponível.
-   Diferenciar dados atualizados, dados desatualizados e informações
    indisponíveis.
-   Para um jogo que não ofereça suporte a conquistas, apresentar uma
    mensagem explícita informando que aquele jogo não possui conquistas.
    Não apresentar o caso como erro de sincronização.
-   Respeitar as permissões, configurações de privacidade e limitações
    de cada plataforma.
-   Isolar falhas na sincronização de conquistas para que não
    comprometam a biblioteca ou a inicialização dos jogos.

### 6.9 Artes e metadados

-   Cada jogo pode ter cinco artes: **capa quadrada** (Biblioteca),
    **capa vertical 2:3** (Início, esticada para caber inteira), **logotipo**, **imagem
    1920×1080** e **imagem de cabeçalho** (header).
-   Fontes: Steam (`header_image` e capturas de tela dos metadados),
    SteamGridDB (capas quadrada e vertical e logotipo, com chave de API
    pessoal gratuita), IGDB (capa vertical, logotipo e imagem de fundo, com
    um app próprio e gratuito da Twitch) e arquivos locais escolhidos pelo
    usuário. Não usar buscas de imagens da web.
-   Em jogos novos da Steam, com o IGDB configurado, o logotipo e a imagem
    de fundo vêm primeiro do IGDB, e o que ele não tiver vem da fonte
    anterior. A capa vertical vem do SteamGridDB e, se ele não tiver, do
    IGDB. Artes que o jogo já tem não são trocadas.
-   Para jogos manuais, a busca no SteamGridDB é feita por título e o
    usuário confirma qual resultado corresponde ao jogo.
-   O formulário de adicionar pede só título, executável, tempo de jogo e
    argumentos; a origem é Jogo Local. Ao salvar, o usuário sempre confirma
    o jogo nos resultados do IGDB, que preenche o resto. Metadados, origem
    e imagens só são informados à mão na edição. A descrição vem em inglês
    e pode ser editada; os gêneros são guardados em português.
-   Se o IGDB não puder responder, o jogo é salvo com o que foi digitado e
    um aviso explica o motivo. Sem resultados, o usuário pode buscar outro
    nome ou salvar sem dados do IGDB.
-   Ao editar um jogo, o IGDB só preenche campos vazios e nunca troca artes
    que o jogo já tem.
-   O menu de opções de qualquer jogo tem "Editar artes", com a capa
    vertical, a capa quadrada, o logotipo e a imagem de fundo. Cada arte pode
    vir do IGDB (menos a capa quadrada), de uma galeria do SteamGridDB (menos
    a imagem de fundo) ou de um arquivo do PC, e pode ser removida. Nada muda
    até o usuário salvar, e uma arte removida não volta sozinha.
-   Os metadados da Steam (título, descrição, desenvolvedor, data,
    classificação indicativa e gêneros) e as artes são obtidos **apenas
    quando o jogo é descoberto ou adicionado**; não há atualização
    periódica. Se a obtenção falhar, ela é tentada novamente em uma
    atualização posterior da biblioteca.
-   As artes ficam em cache local; a interface nunca depende de imagens
    remotas em tempo de execução.
-   Arte escolhida pelo usuário nunca é substituída por um download
    automático.
-   Sem arte disponível, a interface mostra um placeholder; o
    aplicativo continua plenamente utilizável sem a chave do SteamGridDB.

## 7. Requisitos não funcionais

### Desempenho

-   Evitar carregar todas as imagens em alta resolução simultaneamente.
-   Usar carregamento progressivo, cache e dimensões adequadas para
    capas.
-   Evitar bloqueio da interface durante varreduras de bibliotecas ou
    leitura de metadados.
-   Definir orçamento de desempenho após medir um protótipo em hardware
    de referência; não estabelecer números arbitrários antes da medição.

### Segurança

-   Desativar Node integration no renderer.
-   Usar `contextIsolation` e uma API de preload explícita.
-   Validar argumentos e payloads IPC.
-   Expor apenas operações necessárias; nunca expor acesso arbitrário ao
    sistema de arquivos ou execução de comandos ao renderer.
-   Tratar caminhos e argumentos de executáveis como entradas não
    confiáveis.
-   Não armazenar logins nem senhas de lojas no MVP.
-   As chaves de API (Steam Web API e SteamGridDB) são armazenadas
    criptografadas com os recursos do sistema (Electron `safeStorage`),
    só são descriptografadas no processo principal e nunca vão para a
    interface, para logs ou para mensagens de erro.

### Confiabilidade

-   Uma loja indisponível não deve impedir a abertura do launcher.
-   Falhas de descoberta devem gerar diagnóstico por integração.
-   Atualizações de dados devem preservar registros válidos.
-   Operações de banco devem usar migrações versionadas.

### Compatibilidade

-   Windows como plataforma inicial.
-   Validar o layout em 1920×1080, 1280×720 e 2560×1440.
-   Não depender de monitor ultrawide ou segundo monitor.
-   Definir versões mínimas de Windows e hardware antes da distribuição
    pública.

### Acessibilidade e legibilidade

-   Contraste suficiente para textos e foco.
-   Estados não comunicados apenas por cor.
-   Tamanhos legíveis a distância.
-   Opção de reduzir ou desativar animações essenciais quando viável.

## 8. Requisitos de design

-   Direção híbrida e autoral: artes grandes, organização editorial e
    referências retrô discretas.
-   Navegação híbrida: estrutura principal compacta, com navegação
    contextual quando útil.
-   Densidade equilibrada: mostrar uma quantidade útil de jogos sem
    reduzir demais a legibilidade das capas.
-   Priorizar um layout 16:9 de monitor convencional.
-   Foco de controle visível e consistente.
-   Definir estados de carregamento, vazio, erro, indisponível e
    confirmação para cada fluxo relevante.

## 9. Critérios de aceitação do MVP

O MVP poderá ser considerado funcional quando:

1.  O aplicativo inicia sem exigir um servidor local separado.
2.  A biblioteca mostra jogos de fontes integradas e jogos manuais que
    tenham sido detectados/configurados.
3.  O usuário consegue selecionar e iniciar um jogo manual válido.
4.  Cada integração implementada pode falhar isoladamente sem derrubar a
    aplicação.
5.  A busca, os filtros e a ordenação produzem resultados coerentes.
6.  Os fluxos principais podem ser concluídos usando somente controle.
7.  As preferências e os registros de sessão persistem após reiniciar o
    aplicativo.
8.  Erros de inicialização são apresentados de forma compreensível.
9.  Os testes automatizados principais passam.
10. O aplicativo funciona nas resoluções-alvo sem exigir ultrawide.
11. A área de Conquistas apresenta a ordenação padrão e alternativa
    definidas; os detalhes de cada jogo ordenam conquistas obtidas e não
    obtidas conforme suas regras específicas.
12. A sincronização completa da biblioteca só ocorre por ação manual,
    enquanto o fechamento de um jogo compatível sincroniza somente as
    conquistas daquele jogo.
13. Jogos sem suporte a conquistas apresentam uma mensagem informativa,
    sem serem tratados como falha.
14. Cada jogo mostra suas artes em cache ou placeholders; falhas de
    download ou ausência de chave não impedem o uso do aplicativo.
15. Metadados e artes são obtidos apenas na descoberta ou adição do
    jogo, e uma falha de obtenção é tentada novamente depois.

## 10. Fora de escopo até decisão posterior

-   Atualização automática do launcher.
-   Inicialização automática com o Windows.
-   Modo kiosk ou substituição do shell do Windows.
-   Suporte a Linux/macOS.
-   Temas externos e extensões.
-   Controle remoto por celular.
-   Desinstalar jogos pelo launcher (item futuro; aparece nos mockups do
    menu de opções, mas não faz parte do MVP).

## 11. Riscos e perguntas em aberto

-   Os métodos de descoberta e inicialização variam entre lojas e podem
    mudar.
-   Nem todos os jogos informam estado de instalação ou tempo jogado da
    mesma forma.
-   Jogos com launchers intermediários podem exigir estratégias
    específicas de monitoramento.
-   Metadados e imagens dependem de fontes externas (Steam e
    SteamGridDB), chaves de API e limites de uso; as artes são
    contribuídas pela comunidade e devem ficar apenas em cache pessoal e
    local, sem redistribuição.
-   O seletor de arquivos nativo do Windows não é navegável com
    controle; o fluxo de adicionar jogo manual (executável e imagens)
    pode exigir um navegador de arquivos próprio.
-   Os flags de estado dos manifestos da Steam não são um contrato
    oficial e podem mudar; é preciso validar em instalações reais.
-   Alguns jogos de outros launchers (por exemplo, da Epic) podem só
    abrir pelo cliente oficial.
-   A estratégia de navegação por controle deve ser validada em hardware
    real.
-   O Electron foi adotado como base; seu consumo e responsividade
    ainda devem ser medidos em um protótipo em hardware real.

## 12. Estratégia de entrega

1.  Validar o PRD.
2.  Definir e prototipar o design system.
3.  Documentar decisões técnicas e contratos.
4.  Criar a fundação e testes.
5.  Implementar um fluxo vertical mínimo: abrir a biblioteca, selecionar
    um jogo manual e iniciá-lo.
6.  Adicionar integrações individualmente.
7.  Validar controles, desempenho, recuperação de erros e empacotamento.

## 13. Definição de pronto para cada tarefa

Uma tarefa só está concluída quando:

-   Atende aos critérios de aceitação documentados.
-   Respeita os limites entre módulos e as regras de segurança.
-   Inclui testes adequados ao risco da alteração.
-   Não introduz dependências sem justificativa.
-   Atualiza documentação afetada.
-   Informa limitações conhecidas e como validar manualmente o
    resultado.
