# Game Launcher --- Product Requirements Document

**Versão:** 0.1\
**Status:** Proposta inicial para revisão\
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

-   **Steam:** descobrir instalações locais e iniciar jogos por um
    mecanismo validado.
-   **Manual:** permitir selecionar executável, argumentos opcionais e
    diretório de trabalho.

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

-   Busca por título.
-   Filtro por origem.
-   Filtro por estado de instalação quando confiável.
-   Ordenação alfabética, por atividade recente e por tempo de jogo.
-   Arquitetura preparada para filtros adicionais sem reconstruir a
    tela.

### 6.5 Sessões e tempo jogado

-   Registrar início e término das sessões iniciadas pelo launcher
    quando o estado do processo puder ser observado.
-   Tratar encerramento inesperado e desligamento do launcher sem
    corromper o histórico.
-   Distinguir claramente o tempo medido pelo launcher de estatísticas
    fornecidas por uma loja.
-   Não prometer capturar perfeitamente todos os processos filhos ou
    jogos iniciados por launchers intermediários na primeira versão.

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
-   Gerenciamento de caminhos e atualização das bibliotecas.
-   Opções para adicionar, editar e remover jogos manuais.
-   Informações básicas de diagnóstico para facilitar suporte.

### 6.8 Conquistas e progresso

#### Visão geral de conquistas

-   Disponibilizar uma área própria de Conquistas na navegação
    principal.
-   Exibir estatísticas agregadas da conta: total de conquistas
    desbloqueadas e quantidades por categoria de troféu (Platina, Gold,
    Silver e Bronze), conforme os dados persistidos e as regras de
    contagem deste documento.
-   Exibir uma lista dos jogos que possuem suporte a conquistas, com
    arte, título, origem, percentual de conclusão e quantidade
    desbloqueada em relação ao total conhecido.
-   A ordenação padrão da lista deve ser pela última sessão, começando
    pelo jogo jogado mais recentemente.
-   Disponibilizar uma segunda ordenação por percentual de conclusão, do
    maior para o menor.
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
-   Não armazenar credenciais de lojas no MVP.

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

## 10. Fora de escopo até decisão posterior

-   Atualização automática do launcher.
-   Inicialização automática com o Windows.
-   Modo kiosk ou substituição do shell do Windows.
-   Suporte a Linux/macOS.
-   Temas externos e extensões.
-   Controle remoto por celular.

## 11. Riscos e perguntas em aberto

-   Os métodos de descoberta e inicialização variam entre lojas e podem
    mudar.
-   Nem todos os jogos informam estado de instalação ou tempo jogado da
    mesma forma.
-   Jogos com launchers intermediários podem exigir estratégias
    específicas de monitoramento.
-   Metadados e imagens podem exigir uma fonte externa, chaves de API e
    atenção a termos de uso.
-   A estratégia de navegação por controle deve ser validada em hardware
    real.
-   O uso de Electron deve ser comparado com medições reais de consumo e
    responsividade.

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
