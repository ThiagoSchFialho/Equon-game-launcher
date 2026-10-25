# Equon Game Launcher — Contexto do Banco de Dados

**Finalidade:** fornecer à IA de programação o contexto funcional e estrutural do banco de dados do Equon. Use junto do PRD, UML e código/migrações existentes.

## 1. Contexto e premissas

O Equon é um launcher desktop para Windows que reúne jogos de diferentes origens em uma biblioteca única, priorizando o controle, sem excluir mouse e teclado.

O sistema é **de usuário único por instalação**: deve haver apenas uma conta Steam configurada. Não criar `USER_ACHIEVEMENTS` nem suporte a múltiplos perfis sem uma decisão explícita de produto. O estado de desbloqueio fica em `ACHIEVEMENTS`.

## 2. Tabelas

### 2.1 `GAMES`

Armazena jogos de qualquer origem.

| Campo | Tipo | Restrições / finalidade |
|---|---|---|
| `id` | `BIGSERIAL` | Chave primária interna. |
| `steam_id` | `BIGINT` | App ID da Steam; único quando preenchido, `NULL` para jogos sem ID Steam. |
| `title` | `VARCHAR(255)` | Obrigatório; título. |
| `description` | `TEXT` | Descrição, se disponível. |
| `developer` | `VARCHAR(255)` | Desenvolvedor, se disponível. |
| `release_date` | `DATE` | Data de lançamento, se disponível. |
| `time_last_played` | `TIMESTAMPTZ` | Última sessão conhecida, se disponível. |
| `hidden` | `BOOLEAN` | `NOT NULL DEFAULT FALSE`; definido manualmente pelo usuário. |
| `installed` | `BOOLEAN` | `NOT NULL DEFAULT FALSE`; estado detectado automaticamente quando houver método confiável. |
| `playtime` | `INTEGER` | `NOT NULL DEFAULT 0`; tempo jogado em **minutos**; aplicar `CHECK (playtime >= 0)`. |
| `beated` | `BOOLEAN` | `NOT NULL DEFAULT FALSE`; definido manualmente pelo usuário, indica que o jogo foi zerado. Substitui o nome anterior `hearted`. |
| `required_age` | `VARCHAR(50)` | Classificação etária, se disponível. |
| `origin` | `VARCHAR(...)` ou tipo equivalente | Identifica a origem, por exemplo `steam`, `yuzu` ou `local`. Definir tipo/tamanho e valores válidos de modo consistente. |

Regras:
- `origin` informa a origem do jogo, não se ele está instalado.
- `steam_id` não deve ser obrigatório para jogos locais ou de outras origens.
- `hidden` e `beated` são campos manuais e nunca devem ser sobrescritos pela sincronização de metadados.
- `playtime` é sempre armazenado em minutos. Converter unidades externas explicitamente e definir uma regra consistente de arredondamento para sessões.
- Ao fechar um jogo observado, atualizar `playtime` e `time_last_played`, quando for possível medir a sessão.
- O UML não contém campos para executável, argumentos ou diretório de trabalho dos jogos manuais. Verifique se já existem em outra parte do projeto; se não, proponha uma alteração antes de implementar essa funcionalidade.

#### Detecção de instalação

Para Steam, o launcher deve detectar os jogos instalados. Uma abordagem candidata é ler os arquivos `appmanifest_*.acf` nas pastas de bibliotecas Steam e relacionar o App ID a `GAMES.steam_id`. Validar isso na implementação, considerando múltiplas bibliotecas, unidades, caminhos personalizados, manifestos inválidos e erros de leitura.

Não tratar falha de leitura como prova de que o jogo não está instalado. O esquema atual tem `installed BOOLEAN`, que não representa explicitamente o estado desconhecido. Se for necessário distinguir “não instalado” de “não foi possível verificar”, proponha permitir `NULL` ou adicionar um estado/diagnóstico. Não aplique automaticamente o método Steam a Yuzu ou jogos locais.

### 2.2 `USERS`

| Campo | Tipo | Restrições / finalidade |
|---|---|---|
| `id` | `BIGSERIAL` | Chave primária. |
| `steam_id` | `BIGINT` | ID da única conta Steam configurada; único. |
| `steam_api_key` | `TEXT` | Chave usada nas requisições à Steam Web API quando necessária. |

Regras:
- Deve haver somente um registro em `USERS` no escopo atual. Uma PK, sozinha, não garante uma única linha; impor essa regra explicitamente na aplicação ou no banco.
- Usar a chave somente no lado confiável da aplicação. Não expor ao renderer nem gravar em logs ou mensagens de erro.
- Proteger a chave em repouso com um mecanismo adequado ao Windows, se possível.
- Confirmar os requisitos de autenticação de cada endpoint; não presumir que todos exijam a chave.

### 2.3 `ACHIEVEMENTS`

Armazena as definições das conquistas e seu estado para a única conta configurada.

| Campo | Tipo | Restrições / finalidade |
|---|---|---|
| `id` | `SERIAL` | Chave primária. |
| `game_id` | `BIGINT` | `NOT NULL`; FK para `GAMES.id`. |
| `api_name` | `TEXT` | `NOT NULL`; identificador da conquista na API. |
| `display_name` | `TEXT` | Nome, se disponível. |
| `description` | `TEXT` | Descrição, se disponível. |
| `icon` | `TEXT` | URL/referência do ícone desbloqueado, se disponível. |
| `icon_gray` | `TEXT` | URL/referência do ícone bloqueado, se disponível. |
| `unlocked` | `BOOLEAN` | `NOT NULL DEFAULT FALSE`; estado de desbloqueio. |
| `unlocked_at` | `TIMESTAMPTZ` | Data/hora do desbloqueio; pode ser `NULL`. |
| `global_percent` | `REAL` | Percentual global; pode ser `NULL`. |

Restrições obrigatórias:
- `FOREIGN KEY (game_id) REFERENCES GAMES(id) ON DELETE CASCADE`
- `UNIQUE (game_id, api_name)`

`api_name` é único dentro de cada jogo, não necessariamente entre jogos. Ao excluir um jogo, excluir suas conquistas automaticamente.

O progresso pessoal de um jogo é calculado como `(conquistas desbloqueadas / total de conquistas conhecidas) * 100`. Se o total for zero, não dividir por zero; mostrar progresso indisponível ou não aplicável. `global_percent` é a porcentagem global de jogadores que desbloquearam uma conquista, não o progresso pessoal.

### 2.4 `GENRES`

| Campo | Tipo | Restrições / finalidade |
|---|---|---|
| `id` | `SERIAL` | Chave primária. |
| `name` | `VARCHAR(100)` | Obrigatório e único, conforme o UML. |

Os gêneros dos jogos Steam vêm dos metadados da Steam Store API quando disponíveis. Evitar gêneros duplicados e normalizar nomes consistentemente.

### 2.5 `GAME_GENRES`

| Campo | Tipo | Restrições / finalidade |
|---|---|---|
| `game_id` | `BIGINT` | `NOT NULL`; FK para `GAMES.id`; parte da PK composta. |
| `genre_id` | `INTEGER` | `NOT NULL`; FK para `GENRES.id`; parte da PK composta. |

PK composta: `(game_id, genre_id)`.

Política de exclusão:
- `GAME_GENRES.game_id` → `GAMES.id ON DELETE CASCADE`.
- `GAME_GENRES.genre_id` → `GENRES.id ON DELETE CASCADE`.

Excluir um jogo remove suas associações a gêneros; excluir um gênero remove suas associações a jogos. Excluir uma associação não exclui o jogo nem o gênero. Essa cascata é apropriada para linhas de uma tabela de junção que não têm significado sem os registros relacionados.

## 3. Fontes de dados Steam

### Metadados e gêneros

```text
https://store.steampowered.com/api/appdetails?appids=${appid}
```

É a fonte principal de metadados e gêneros dos jogos Steam, quando disponíveis. Pode preencher/atualizar título, descrição, desenvolvedor, data de lançamento, classificação etária e gêneros conforme os campos presentes na resposta.

Verificar o campo de sucesso e a estrutura da resposta. Alguns campos podem faltar. Não apagar dados válidos nem substituir valores por strings vazias quando ocorrer erro de rede ou resposta inválida. Esta API não é fonte universal para jogos de outras origens. Não usar `appdetails` para inferir instalação.

### Definições/esquema de conquistas

```text
https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=${apiKey}&appid=${appid}&l=${LANGUAGE}
```

Usar para buscar definições e metadados das conquistas, conforme disponibilizados pela Steam.

### Estado das conquistas do jogador

```text
https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key=${user.steam_api_key}&steamid=${user.steam_id}&appid=${appid}&l=${LANGUAGE}
```

Usar para buscar o estado de desbloqueio e a data, quando disponível, para a conta configurada.

### Porcentagem global

```text
https://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}
```

Usar para buscar a porcentagem global por conquista, quando disponível. Se não houver valor, armazenar `NULL`, não zero.

### Parâmetros e limitações

- `${appid}` é o App ID Steam armazenado em `GAMES.steam_id`.
- `${apiKey}` / `${user.steam_api_key}` é a chave da conta configurada.
- `${user.steam_id}` é o Steam ID do usuário configurado.
- `${LANGUAGE}` vem de uma configuração da aplicação e deve seguir o formato aceito pelo endpoint.
- Validar os formatos reais das respostas e os requisitos de cada endpoint. Nem todo jogo/conta fornece todos os dados; privacidade, permissões e disponibilidade podem limitar os resultados.

## 4. Regras de sincronização

### Metadados e gêneros

Usar `appdetails` como fonte principal para metadados e gêneros de jogos Steam. Não sobrescrever `hidden` nem `beated`. Separar sincronização de metadados de detecção local de instalação e medição de sessões.

### Ao fechar um jogo

Quando o launcher conseguir observar o encerramento de um jogo compatível:
1. Calcular a duração da sessão e atualizar `GAMES.playtime` em minutos.
2. Atualizar `GAMES.time_last_played`.
3. Sincronizar as conquistas **somente daquele jogo**.
4. Inserir novas conquistas e atualizar as existentes usando `(game_id, api_name)`.
5. Atualizar `unlocked`, `unlocked_at` e `global_percent` quando os dados correspondentes estiverem disponíveis.
6. Registrar erros sem impedir o uso do launcher.

O monitoramento pode não capturar todos os launchers intermediários ou processos filhos; não prometer precisão universal.

### Sincronização manual de todas as conquistas

Deve existir uma ação manual para sincronizar conquistas de todos os jogos compatíveis da biblioteca:
- Executar em segundo plano para não bloquear a interface.
- Isolar falhas por jogo.
- Mostrar progresso/resultado quando viável.
- Não gerar duplicatas nem apagar dados válidos por causa de uma falha.
- Não confundir resposta incompleta com conquistas inexistentes.

A atualização automática após fechar um jogo sincroniza apenas esse jogo. A sincronização completa de conquistas ocorre por ação manual.

### Idempotência

Usar `UNIQUE (game_id, api_name)` e `upsert` ou estratégia transacional equivalente. Executar novamente a sincronização com os mesmos dados não deve duplicar registros. Não definir `unlocked = FALSE` nem apagar conquistas porque uma consulta falhou. Atualizar `global_percent` apenas com um valor confiável.

## 5. Integridade e exclusões

- `GAMES.playtime >= 0`.
- `GAMES.steam_id` único quando preenchido.
- `ACHIEVEMENTS.game_id` referencia `GAMES.id`, com `ON DELETE CASCADE`.
- `ACHIEVEMENTS` tem `UNIQUE (game_id, api_name)`.
- `GENRES.name` é único.
- `GAME_GENRES` tem PK composta `(game_id, genre_id)`.
- Ambas as FKs de `GAME_GENRES` usam `ON DELETE CASCADE`.
- Usar transações para operações que atualizem várias tabelas de modo consistente.
- Preservar dados válidos em falhas de API.
- Nunca expor `steam_api_key` em logs, erros ou renderer.

## 6. Decisões ainda em aberto

A IA deve verificar o código e pedir decisão antes de inventar comportamento para estes pontos:

1. Tipo exato de `origin` (por exemplo `VARCHAR` com `CHECK`, enum ou outra solução) e lista oficial de valores.
2. Onde armazenar executável, argumentos e diretório de trabalho dos jogos manuais, se isso ainda não existir.
3. Como representar um estado de instalação desconhecido, pois `installed` atualmente é booleano.
4. Regra de arredondamento/conversão da duração de sessão para minutos inteiros.
5. Mecanismo de armazenamento seguro da chave Steam no Windows.
6. Frequência de atualização dos metadados `appdetails`, além dos fluxos de conquistas já definidos.
7. Como impor no banco ou na aplicação a regra de um único registro em `USERS`.
8. Validar limites, parâmetros e estrutura atual das respostas da Steam API antes da implementação.

## 7. Instruções para a IA de programação

1. Leia este documento, o PRD, o UML, o código e as migrações antes de implementar.
2. Preserve a arquitetura de usuário único; não crie `USER_ACHIEVEMENTS` nem múltiplos perfis.
3. Adicione `GAMES.origin`, `UNIQUE (game_id, api_name)` e as FKs/políticas de exclusão descritas caso ainda não existam.
4. Use minutos como unidade de `GAMES.playtime`.
5. Não sobrescreva `hidden` nem `beated` em sincronizações externas.
6. Separe sincronização de metadados, detecção de instalação, medição de sessões e sincronização de conquistas.
7. Sincronize as conquistas do jogo ao encerrá-lo e ofereça uma ação separada para sincronizar manualmente todas as conquistas.
8. Trate erros de rede, permissões, respostas incompletas e jogos sem suporte sem perder os últimos dados válidos.
9. Use migrações e testes para alterações no esquema.
10. Se o código contradisser este documento, explique a divergência e proponha a alteração antes de fazer mudanças destrutivas.
11. Não invente campos, endpoints ou garantias não documentadas; sinalize limitações quando os dados não estiverem disponíveis.
