# Game Launcher --- Design System

**Versão:** 0.1\
**Status:** Direção visual inicial; valores sujeitos a prototipagem\
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

Regiões possíveis: - Navegação principal. - Continuar jogando. - Lista de jogos recentes. - Atalho claro para a biblioteca completa.

### Biblioteca

-   Densidade equilibrada: cards grandes o suficiente para reconhecer a
    arte, com quantidade suficiente para navegar pela coleção.
-   Busca, filtro e ordenação acessíveis sem abandonar o contexto.
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

## 3. Tokens visuais iniciais

Os valores abaixo são uma base para protótipo, não uma identidade final
aprovada. Devem ser validados em telas reais e em diferentes condições
de iluminação.

### Cores

| Token                    | Valor inicial   | Uso
| ------------------------ | --------------- | ----------------------------------
| `color.background`       | `#101216`       | Fundo global
| `color.surface`          | `#191D24`       | Superfícies principais
| `color.surface-raised`   | `#232833`       | Painéis e menus elevados
| `color.text-primary`     | `#F3F4F6`       | Texto principal
| `color.text-secondary`   | `#A7AFBC`       | Metadados e texto secundário
| `color.border`           | `#343B48`       | Divisórias e contornos discretos
| `color.accent`           | `#D7A85B`       | Acento quente, referência retrô
| `color.focus`            | `#F4D28C`       | Foco de navegação
| `color.success`          | `#78C6A3`       | Confirmação e sucesso
| `color.warning`          | `#E7B86A`       | Avisos
| `color.danger`           | `#F07C7C`       | Erros e ações destrutivas


Regras: - Não usar o acento em todos os elementos; reservar para
seleção, ações importantes e detalhes. - Não depender apenas da cor para
diferenciar estado. - Verificar contraste antes de aprovar os tokens. -
Evitar gradientes decorativos extensos sobre áreas com texto. - As capas
podem conter cores variadas; a interface deve continuar legível sobre
elas.

### Tipografia

Usar uma família sans-serif legível e disponível no pacote ou no
sistema, com uma alternativa segura. A família definitiva será escolhida
no protótipo após avaliar caracteres, pesos e renderização em Windows.

Escala inicial para 1920×1080: - Título de destaque: 36--48 px. - Título
de tela: 28--36 px. - Título de card: 18--22 px. - Corpo: 16--18 px. -
Metadados: 13--15 px. - Texto auxiliar nunca deve ser tão pequeno que
fique ilegível à distância.

Os valores devem usar tokens escaláveis e ser validados também em
1280×720. Não usar tipografia retrô decorativa para textos longos.

### Espaçamento

Adotar uma escala baseada em múltiplos de 4 px:
- `space-1`: 4 px
- `space-2`: 8 px
- `space-3`: 12 px
- `space-4`: 16 px
- `space-5`: 20 px
- `space-6`: 24 px
- `space-8`: 32 px
- `space-10`: 40 px
- `space-12`: 48 px
- `space-16`: 64 px

Usar margens externas generosas e espaçamento consistente entre regiões.
Ajustar densidade pela composição, não reduzindo indiscriminadamente
todos os espaços.

### Cantos, contornos e profundidade

-   Cards: raio inicial de 8--12 px.
-   Painéis: raio inicial de 12--16 px.
-   Botões: raio consistente com a linguagem dos cards.
-   Contornos de foco devem permanecer nítidos mesmo em fundos claros.
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

-   Definir formatos de arte por função: quadrado para avatares/ícones,
    retrato para capas verticais e paisagem para banners/destaques.
-   Não esticar imagens para preencher proporções incompatíveis.
-   Definir regras de `cover`/`contain` por componente.
-   Usar placeholders consistentes quando uma imagem estiver ausente.
-   Carregar imagens progressivamente e limitar resolução/tamanho quando
    apropriado.
-   Usar gradientes de contraste somente quando necessários para
    legibilidade.
-   Não assumir que a imagem principal sempre terá espaço negativo no
    mesmo lado.

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
    documentado.
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

## 10. Critérios de aprovação visual

Uma tela ou componente está pronto quando: 1. Segue os tokens e não
introduz valores arbitrários sem justificativa. 2. Funciona em 1920×1080
e 1280×720. 3. Tem foco inequívoco por controle. 4. Apresenta estados
padrão, foco, indisponível, vazio e erro relevantes. 5. Mantém
legibilidade sobre imagens variadas. 6. Não causa recortes ou saltos de
layout em navegação. 7. Responde de forma aceitável sem animação. 8. Foi
revisado visualmente em execução, não apenas aprovado por leitura de
código.

## 11. Decisões ainda abertas

-   Nome e identidade de marca.
-   Família tipográfica final.
-   Logo e sistema de ícones próprios.
-   Layout definitivo da Home e da biblioteca.
-   Proporções e tamanhos finais dos cards.
-   Fonte de metadados e política de cache.
-   Configurações de movimento e acessibilidade expostas ao usuário.
-   Se haverá temas adicionais no futuro.

## 12. Instruções para implementação por IA

-   Não inventar uma nova paleta ou escala tipográfica por tela.
-   Consultar estes tokens antes de adicionar estilos.
-   Reutilizar componentes existentes antes de criar variantes.
-   Não criar animações decorativas sem propósito de interação.
-   Implementar estados de foco de gamepad e teclado como parte do
    componente.
-   Não considerar uma tela concluída sem capturas ou inspeção visual em
    execução.
-   Atualizar este documento quando uma decisão de design for alterada.
