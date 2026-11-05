# Equon Game Launcher — Contexto do Banco de Dados

**Versão:** 0.5
**Status:** Rascunho — alinhado às decisões D-01 a D-17 do `ARCHITECTURE.md`
**Idioma:** português
**Finalidade:** descrever o modelo de dados, as regras de integridade e as decisões que a IA de programação e as pessoas devem respeitar ao criar migrações, repositórios e casos de uso.

Quando este documento e o código divergirem, atualize o documento no mesmo commit. Mudanças de schema exigem migração versionada.

---

## 1. Contexto e premissas

- Aplicativo desktop para Windows, com **um único usuário local** e **uma única conta Steam**.
- Banco: **SQLite embutido** (D-02). Não existe servidor de banco. O arquivo fica na pasta de dados do aplicativo.
- Driver: `better-sqlite3`. Acesso por **repositórios** com SQL escrito à mão; sem ORM (D-03). SQL existe apenas em `infrastructure/persistence`.
- Migrações: arquivos `.sql` versionados em `src/infrastructure/persistence/migrations/` (`0001_init.sql`, ...), embutidos no bundle e listados em `migrations/index.ts`. Um executor pequeno os aplica em ordem e registra a versão em `PRAGMA user_version`. Cada migração roda em transação junto com a atualização da versão; as chaves estrangeiras são desligadas fora da transação e `foreign_key_check` precisa passar antes do commit.
- **Obrigatório:** executar `PRAGMA foreign_keys = ON` em **toda** conexão. Sem isso o SQLite ignora as chaves estrangeiras e os `ON DELETE CASCADE` não funcionam.
- O estado de desbloqueio das conquistas fica em `ACHIEVEMENTS`. **Não** criar `USER_ACHIEVEMENTS` nem perfis múltiplos.
- Fontes Steam usadas: arquivos locais da Steam (instalação), `appdetails` (metadados), Steam Web API (conquistas) e SteamGridDB (artes). Epic Games e GOG **não** têm integração automática; esses jogos são adicionados manualmente (`origin = 'manual'`). Jogos de emuladores também são adicionados manualmente, cada um com a sua origem (ver 3.10); o único emulador suportado é o Yuzu (3.12).
- Segredos (chaves de API) nunca ficam em texto puro no banco (D-04).

---

## 2. Convenções de tipos (SQLite)

| Conceito | Tipo no SQLite | Observação |
| --- | --- | --- |
| Identificador interno | `INTEGER PRIMARY KEY` | `AUTOINCREMENT` só se for preciso impedir reuso de id |
| Texto | `TEXT` | Limites de tamanho, se necessários, com `CHECK` |
| Data e hora | `TEXT` em ISO-8601 UTC (`2026-11-01T12:34:56Z`) | Um único formato em todo o banco |
| Data | `TEXT` (`YYYY-MM-DD`) | |
| Booleano | `INTEGER` com `CHECK (col IN (0,1))` | `0` falso, `1` verdadeiro |
| Percentual / decimal | `REAL` | |
| Valor enumerado | `TEXT` + `CHECK (col IN (...))` | Espelhado por tipo união no TypeScript |
| Dado binário (segredo criptografado) | `BLOB` | |

Pontos de atenção:

- **SteamID64 não cabe com segurança em número JavaScript** (passa de 2^53). Por isso `USERS.steam_id` é `TEXT` (17 dígitos). Já o **App ID** de um jogo é pequeno e pode ser `INTEGER`.
- `UNIQUE` aceita vários `NULL` no SQLite, o que é o comportamento desejado para colunas opcionais como `GAMES.steam_id`.
- A ordem padrão de `NULL` difere entre bancos. Sempre especificar explicitamente quando a ordenação importar (por exemplo, "sem data por último").
- Todas as tabelas são `STRICT` (o SQLite empacotado, 3.53.4, suporta; o recurso existe desde o 3.37). O banco recusa, por exemplo, texto em coluna `INTEGER`.
- Colunas booleanas e enumeradas sempre têm `CHECK`, inclusive as que aceitam `NULL` (`installed IN (0,1)` ou `NULL`).
- Upserts usam `INSERT ... ON CONFLICT (...) DO UPDATE`. A cláusula de atualização **nunca** pode tocar em `hidden` nem em `beated`.

---

## 3. Tabelas

### 3.1 `GAMES`

Um registro por jogo, de qualquer origem.

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY` | Identificador interno |
| `steam_id` | `INTEGER` | App ID da Steam. Opcional e `UNIQUE` quando presente |
| `title` | `TEXT NOT NULL` | |
| `description` | `TEXT` | |
| `developer` | `TEXT` | |
| `release_date` | `TEXT` | `YYYY-MM-DD` |
| `time_last_played` | `TEXT` | Data/hora UTC da última sessão; `NULL` se nunca jogado |
| `hidden` | `INTEGER NOT NULL DEFAULT 0` | Flag manual (`CHECK IN (0,1)`). Nunca sobrescrita por sincronização |
| `installed` | `INTEGER` | `1` instalado, `0` confirmado como não instalado, `NULL` desconhecido (D-06); `CHECK (installed IN (0,1))` |
| `playtime` | `INTEGER NOT NULL DEFAULT 0` | Minutos medidos pelo launcher; `CHECK (playtime >= 0)` |
| `beated` | `INTEGER NOT NULL DEFAULT 0` | Flag manual (`CHECK IN (0,1)`). Nunca sobrescrita por sincronização |
| `required_age` | `TEXT` | Classificação indicativa |
| `origin` | `TEXT NOT NULL` | FK para `ORIGINS(key)` com `ON DELETE RESTRICT` (D-05) |
| `metadata_fetched_at` | `TEXT` | Preenchido somente após salvar uma resposta válida de metadados (D-16) |
| `artwork_checked_at` | `TEXT` | UTC de quando a fila de artes obteve respostas para o jogo (Fase 8). Com data, não se tenta de novo ao abrir, mesmo sem arte disponível; "Atualizar biblioteca" e salvar uma chave do SteamGridDB tentam de novo. `NULL` = falta tentar; sem rede ou com chave inválida continua `NULL` |
| `achievements_synced_at` | `TEXT` | UTC da última sincronização de conquistas que deu certo (Fase 7). `NULL` = nunca sincronizado; data preenchida e nenhuma linha em `ACHIEVEMENTS` = o jogo não tem conquistas |
| `steam_playtime_baseline` | `INTEGER` | Minutos informados pela Steam na última sincronização de tempo de jogo (3.11); `CHECK (>= 0)`; `NULL` se nunca sincronizado |
| `steam_synced_at` | `TEXT` | UTC da última sincronização de tempo de jogo com a Steam; preenchido junto com `steam_playtime_baseline` (`CHECK`: os dois nulos ou os dois preenchidos) |
| `playtime_offset` | `INTEGER NOT NULL DEFAULT 0` | Minutos informados pelo usuário ao cadastrar/editar um jogo que não é da Steam (tempo jogado fora do launcher); `CHECK (>= 0)`. Migração `0002` |

Regras:

- `origin` identifica a **fonte do registro**, não o estado de instalação. Os valores possíveis estão na tabela `ORIGINS` (3.10), não fixos no schema.
- Jogos com `origin = 'steam'` devem ter `steam_id` (`CHECK (origin <> 'steam' OR steam_id IS NOT NULL)`).
- Jogos da Epic, GOG e de outros launchers são cadastrados como `manual`. Jogos do Yuzu usam a origem `yuzu` (3.12).
- Só jogos descobertos pelo adaptador da Steam usam `steam`; o usuário nunca escolhe `steam` ao adicionar um jogo.
- `hidden` e `beated` começam em `0` e só mudam por ação do usuário.
- `playtime` nunca é negativo. A regra de cálculo está em 3.8; para jogos Steam sincronizados, ver 3.11.
- `steam_playtime_baseline`, `steam_synced_at` e `playtime_offset` são internos: a interface mostra só `playtime` e `time_last_played`.
- Possíveis duplicidades entre um jogo manual e um jogo Steam **não** são mescladas automaticamente: vão para revisão do usuário.
- `metadata_fetched_at IS NULL` significa que os metadados ainda não foram obtidos (ou a tentativa falhou) e podem ser tentados de novo. Um jogo sem descrição de verdade, mas com `metadata_fetched_at` preenchido, **não** é buscado outra vez.

### 3.2 Estado de instalação de jogos Steam (D-06, D-12)

Fonte: arquivos locais da Steam. Localizar a Steam (registro do Windows, valor `SteamPath` em `HKCU\Software\Valve\Steam`, com fallback para a pasta padrão e sobrescrita do usuário), ler `steamapps/libraryfolders.vdf` e, em cada biblioteca, os arquivos `appmanifest_<appid>.acf`, interpretando o campo `StateFlags`.

Regras de gravação em `GAMES.installed`:

- Jogo encontrado na varredura → `1`.
- Jogo ausente da varredura → `0` **somente se** o `libraryfolders.vdf` e **todas** as bibliotecas listadas foram lidos com sucesso. Caso contrário → `NULL` (por exemplo, HD externo desconectado).
- Steam não encontrada, ou erro geral de leitura → **não alterar nada**.
- Uma leitura que falhou **nunca** pode gravar `0`.
- Estados transitórios (rodando, instalando, atualizando, pausado, atualização necessária, arquivos corrompidos) **não são gravados**; são lidos ao vivo e exibidos na interface.
- A varredura local só enxerga jogos com manifesto (instalados ou em instalação). Os jogos comprados e não instalados vêm do `GetOwnedGames` (precisa de chave; seção 3.11).
- Não reutilizar o método da Steam para jogos manuais.

**Jogos de outras origens (decidido na Fase 4):** o estado vem da existência do executável da configuração de lançamento (3.7), conferida no processo principal sempre que a biblioteca ou o jogo é carregado:

- o arquivo existe → `1`;
- não existe (`ENOENT`) → `0`;
- erro de leitura (por exemplo, disco externo desconectado ou sem permissão) → `NULL`. Uma leitura que falhou nunca grava `0`.
- O botão Jogar só fica disponível com `1`.

### 3.3 `USERS`

Uma única linha, com a configuração do usuário local.

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY` | `CHECK (id = 1)`; o repositório sempre usa `id = 1` (D-10) |
| `steam_id` | `TEXT UNIQUE` | SteamID64 (17 dígitos, validar com `^\d{17}$`); `NULL` enquanto não configurado. O banco também verifica: 17 caracteres, só dígitos |
| `steam_api_key_encrypted` | `BLOB` | Chave da Steam Web API criptografada com `safeStorage` (D-04) |
| `steamgriddb_api_key_encrypted` | `BLOB` | Chave do SteamGridDB criptografada com `safeStorage` (D-15) |
| `platine` | `INTEGER NOT NULL DEFAULT 0` | Jogos com platina; `CHECK (>= 0)` |
| `gold` | `INTEGER NOT NULL DEFAULT 0` | Conquistas ouro desbloqueadas; `CHECK (>= 0)` |
| `silver` | `INTEGER NOT NULL DEFAULT 0` | Conquistas prata desbloqueadas; `CHECK (>= 0)` |
| `bronze` | `INTEGER NOT NULL DEFAULT 0` | Conquistas bronze desbloqueadas; `CHECK (>= 0)` |

Regras:

- A linha `id = 1` é criada pela migração inicial; o repositório nunca precisa tratar a ausência dela.
- As chaves só são descriptografadas no processo principal, na hora de uma requisição. Nunca vão para a interface, para logs ou para mensagens de erro.
- O total exibido na tela de Conquistas soma platinas, ouro, prata e bronze (decisão do dono do projeto, Fase 7). Os troféus de jogos ocultos contam, e esses jogos também aparecem na lista.
- Os contadores são **agregados derivados** de `ACHIEVEMENTS`. São recalculados a partir dos dados persistidos, na mesma transação da sincronização; nunca incrementados às cegas.

### 3.4 `ACHIEVEMENTS`

Definição e estado pessoal de cada conquista de um jogo.

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY` | |
| `game_id` | `INTEGER NOT NULL` | FK para `GAMES(id)` com `ON DELETE CASCADE` |
| `api_name` | `TEXT NOT NULL` | Nome interno estável vindo da Steam |
| `display_name` | `TEXT NOT NULL` | |
| `description` | `TEXT` | Pode ser nula (conquistas ocultas) |
| `icon` | `TEXT` | URL do ícone da conquista obtida; segue a política de cache de artes |
| `icon_locked` | `TEXT` | URL do ícone da conquista bloqueada (`icongray` da Steam; nem sempre é uma cópia em cinza de `icon`). Preenchido pela sincronização |
| `unlocked` | `INTEGER NOT NULL DEFAULT 0` | `CHECK (unlocked IN (0,1))` |
| `unlocked_at` | `TEXT` | `NULL` se bloqueada ou desconhecida |
| `global_percent` | `REAL` | Percentual global; `NULL` se desconhecido (nunca `0` por falta de dado); `CHECK (global_percent BETWEEN 0 AND 100)` |
| `tier` | `TEXT NOT NULL` | `CHECK (tier IN ('bronze','silver','gold'))` |

Restrições: `UNIQUE (game_id, api_name)`.

Regras de tier (calculado na camada de aplicação, função pura — D-09):

- `global_percent <= 15` → `gold`
- `global_percent > 15` e `< 50` → `silver`
- `global_percent >= 50` → `bronze`
- `global_percent` nulo → `bronze`

Os valores são percentuais (`15.0` significa 15%).

Platina: o jogo tem ao menos uma conquista conhecida e **todas** as conquistas conhecidas estão desbloqueadas. Calculada a partir das linhas reais, nunca de um percentual arredondado.

Progresso pessoal: `desbloqueadas / total conhecido × 100`. Quando o total é zero, o progresso é "indisponível", sem divisão por zero.

Ordenação (regras de apresentação):

- Visão geral dos jogos: por `GAMES.time_last_played` decrescente (padrão), por percentual de conclusão decrescente ou por título em ordem alfabética; desconhecidos por último.
- Desbloqueadas: `unlocked_at` decrescente, `NULL` por último.
- Bloqueadas: `global_percent` decrescente (menos raras primeiro), `NULL` por último.
- Desempate estável: `display_name`, depois `api_name`.

### 3.5 `GENRES`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY` | |
| `name` | `TEXT NOT NULL UNIQUE COLLATE NOCASE` | Nomes normalizados para evitar duplicidade |

Normalização: remover espaços nas pontas e colapsar espaços repetidos. A unicidade não diferencia maiúsculas (`Action` e `action` são o mesmo gênero); o nome guardado é o da primeira vez que apareceu.

### 3.6 `GAME_GENRES`

Relação muitos-para-muitos entre jogos e gêneros.

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `game_id` | `INTEGER NOT NULL` | FK para `GAMES(id)` com `ON DELETE CASCADE` |
| `genre_id` | `INTEGER NOT NULL` | FK para `GENRES(id)` com `ON DELETE CASCADE` |

Chave primária composta `(game_id, genre_id)`.

### 3.7 `GAME_LAUNCH_CONFIGS` (D-07)

Configuração de lançamento de jogos **manuais**.

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `game_id` | `INTEGER PRIMARY KEY` | FK para `GAMES(id)` com `ON DELETE CASCADE` |
| `executable_path` | `TEXT` | Caminho do `.exe` ou do atalho `.url` do jogo; `NULL` em jogos de emulador |
| `rom_path` | `TEXT` | Caminho da ROM em jogos de emulador (Yuzu); `NULL` nos demais. Migração `0003` |
| `arguments` | `TEXT` | Lista JSON de argumentos (texto); `NULL` = sem argumentos; `CHECK (json_type(arguments) = 'array')` |
| `working_directory` | `TEXT` | Diretório de trabalho; `NULL` = padrão |

Regras:

- `CHECK ((executable_path IS NULL) <> (rom_path IS NULL))`: exatamente um dos dois é preenchido.
- Só existe para jogos com origem diferente de `steam` (verificado na camada de aplicação).
- **Jogos do Yuzu (origem `yuzu`):** guardam só `rom_path`; o emulador vem da tabela `EMULATORS` (3.12) e é resolvido na hora de abrir, então trocar o `yuzu.exe` vale para todos os jogos. `arguments` e `working_directory` não são usados.
- **Atalhos `.url` (decidido na Fase 4):** `executable_path` pode apontar para um atalho de internet do Windows. O processo principal lê o arquivo, extrai o endereço (`URL=`) e só aceita os protocolos `com.epicgames.launcher:` (Epic), `steam:`, `uplay:` (Ubisoft), `origin2:` e `link2ea:` (EA) e `battlenet:`, conferidos ao salvar e de novo ao abrir. O endereço é aberto pelo Windows (nunca por shell). Como nenhum processo é observado, **o tempo de jogo desses jogos não é medido**.
- Todos os caminhos são **entrada não confiável**: validar se o arquivo existe e tem uma extensão permitida (`.exe`, `.url`, ROMs do Yuzu); nunca montar uma linha de comando como texto; passar argumentos como lista, sem shell.
- Jogos da Steam são lançados por `steam://rungameid/<appid>` (D-17) e não usam esta tabela.
- Jogos da Epic que só abrem pelo cliente oficial podem exigir outra forma de lançamento; validar na Fase 4.

### 3.8 `PLAY_SESSIONS` (D-08)

Sessões de jogo observadas pelo launcher.

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY` | |
| `game_id` | `INTEGER NOT NULL` | FK para `GAMES(id)` com `ON DELETE CASCADE` |
| `started_at` | `TEXT NOT NULL` | UTC |
| `last_seen_at` | `TEXT NOT NULL` | UTC; último heartbeat do launcher enquanto observava o jogo. Começa igual a `started_at` |
| `ended_at` | `TEXT` | UTC; `NULL` enquanto `running` |
| `duration_seconds` | `INTEGER` | `CHECK (duration_seconds IS NULL OR duration_seconds >= 0)` |
| `status` | `TEXT NOT NULL` | `CHECK (status IN ('running','completed','interrupted'))` |

Restrições:

- `CHECK (status = 'running' OR (ended_at IS NOT NULL AND duration_seconds IS NOT NULL))`: sessões `completed` e `interrupted` sempre têm fim e duração.
- Índice único parcial: no máximo **uma** sessão `running` por jogo (`UNIQUE (game_id) WHERE status = 'running'`).

Regras:

- Uma sessão `running` é criada quando o início do jogo é **observado** (para jogos Steam, o valor `RunningAppID` do registro do Windows, lido a cada 2 s; para jogos manuais, o processo iniciado). Abrir a URL da Steam não conta como início.
- Ao encerrar normalmente: preencher `ended_at`, `duration_seconds`, `status = 'completed'` e atualizar `GAMES.playtime` e `GAMES.time_last_played` **na mesma transação**.
- **Toda sessão observada soma tempo**, qualquer que seja a origem e mesmo que o jogo tenha sido fechado à força (o launcher observa o fim do processo, então a sessão termina como `completed`).
- **Heartbeat:** enquanto observa um jogo em execução, o launcher atualiza `last_seen_at` periodicamente (cerca de 30 s; o intervalo final é medido na Fase 4).
- Se o próprio launcher morrer (crash, queda de energia, desligamento do Windows), na inicialização seguinte cada sessão que ficou `running` vira `interrupted`, com `ended_at = last_seen_at` e `duration_seconds = last_seen_at − started_at`, na mesma transação que recalcula `playtime`. Perde-se no máximo um intervalo de heartbeat.
- **Cálculo de `GAMES.playtime`:** `floor(soma de duration_seconds das sessões 'completed' e 'interrupted' do jogo / 60)`. Assim os segundos que sobram de cada sessão se acumulam em vez de serem perdidos por arredondamento. O recálculo é idempotente.
- **Jogos de outras origens:** `playtime = playtime_offset + floor(soma de duration_seconds das sessões contadas / 60)`. O `playtime_offset` é o tempo informado pelo usuário no formulário (Fase 4).
- **Jogos Steam já sincronizados (3.11):** `playtime = steam_playtime_baseline + floor(soma de duration_seconds das sessões contadas iniciadas a partir de steam_synced_at / 60)`. As sessões anteriores já estão incluídas no valor da Steam.
- **`time_last_played`:** o recálculo só o avança (o maior entre o valor atual e o fim da sessão contada mais recente); nunca o volta para trás.
- Para jogos Steam, o início e o fim têm a precisão limitada pela forma de observar o manifesto; o resultado é "melhor esforço" e as limitações observadas devem ser documentadas.

### 3.9 `GAME_ARTWORK` (D-15)

Artes de cada jogo, guardadas em cache local.

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY` | |
| `game_id` | `INTEGER NOT NULL` | FK para `GAMES(id)` com `ON DELETE CASCADE` |
| `kind` | `TEXT NOT NULL` | `CHECK (kind IN ('cover_square','cover_portrait','logo','background','header'))` |
| `local_path` | `TEXT NOT NULL` | Caminho relativo à pasta de cache de artes |
| `source` | `TEXT NOT NULL` | `CHECK (source IN ('steam','steamgriddb','user'))` |
| `source_url` | `TEXT` | Origem remota, se houver |
| `width` | `INTEGER` | Dimensões reais da imagem baixada; `CHECK (width > 0)` |
| `height` | `INTEGER` | `CHECK (height > 0)` |
| `user_selected` | `INTEGER NOT NULL DEFAULT 0` | `CHECK (user_selected IN (0,1))` |
| `fetched_at` | `TEXT` | UTC |

Restrições: `UNIQUE (game_id, kind)`.

Tipos de arte:

| `kind` | Conteúdo | Uso na interface |
| --- | --- | --- |
| `cover_square` | Capa quadrada | Biblioteca |
| `cover_portrait` | Capa vertical 600×900 (2:3) | Início |
| `logo` | Logotipo, preferencialmente com transparência | Página do jogo |
| `background` | Imagem 1920×1080 | Página do jogo |
| `header` | Imagem larga (`header_image` da Steam, ~460×215) | Lista de conquistas |

Regras:

- Arte escolhida pelo usuário (`user_selected = 1`) **nunca** é sobrescrita por download automático.
- Falha de download mantém a arte já guardada. Validar tipo de conteúdo, tamanho máximo e dimensões decodificadas antes de salvar.
- Nunca carregar imagem remota em tempo de execução; a interface usa só o cache local.
- O cache é pessoal e local; imagens baixadas não são redistribuídas com o aplicativo.
- A tabela pode ficar sem linhas para um jogo: a interface usa placeholders.
- A capa vertical (`cover_portrait`) e a quadrada (`cover_square`) são artes **independentes**: uma não é recortada a partir da outra. A tela Início usa a vertical; a Biblioteca usa a quadrada.
- Validar as dimensões decodificadas de cada tipo: a vertical deve ter proporção 2:3 (alvo 600×900) e a quadrada proporção 1:1.

### 3.10 `ORIGINS` (D-05)

Origens possíveis de um jogo. É uma tabela, não uma lista fixa, para que o usuário possa criar origens novas (por exemplo, "Nintendo 64" para um emulador novo).

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `key` | `TEXT PRIMARY KEY` | Identificador estável: só letras minúsculas, dígitos e hífen (`steam`, `manual`, `yuzu`, `ps2`, `nintendo-64`), verificado por `CHECK`. Nunca muda depois de criado |
| `name` | `TEXT NOT NULL UNIQUE COLLATE NOCASE` | Nome exibido; editável |
| `builtin` | `INTEGER NOT NULL DEFAULT 0` | `CHECK (builtin IN (0,1))`; origens de fábrica não podem ser excluídas |

Linhas criadas pela migração inicial:

| `key` | `name` | Observação |
| --- | --- | --- |
| `steam` | Steam | Única origem com adaptador automático (descoberta, metadados, conquistas) |
| `manual` | Jogo Local | Jogos de PC de qualquer launcher (Epic, GOG, ...). Nome alterado de "PC" para "Jogo Local" pela migração `0002` |
| `yuzu` | Yuzu | Jogos de Nintendo Switch pelo emulador Yuzu (3.12) |
| `ps2` | PlayStation 2 | Sem emulador suportado por enquanto: funciona como jogo comum (executável) |

Regras:

- O usuário pode criar, renomear e excluir as próprias origens. A `key` de uma origem nova é gerada a partir do nome (minúsculas, hífens) e não muda se o nome mudar.
- Uma origem com jogos não pode ser excluída (`ON DELETE RESTRICT`); origens `builtin` nunca são excluídas.
- Toda origem diferente de `steam` funciona como jogo manual: o usuário cadastra o jogo e a configuração de lançamento (3.7).
- Emuladores não são configurados nas origens: ver `EMULATORS` (3.12).

### 3.12 `EMULATORS` (decidido na Fase 4)

Emuladores suportados pelo launcher e o executável que o usuário configurou para cada um. A lista de emuladores suportados fica no código e no `CHECK`; por enquanto só o **Yuzu**.

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `key` | `TEXT PRIMARY KEY` | `CHECK (key IN ('yuzu'))`; igual à `key` da origem dos jogos desse emulador |
| `executable_path` | `TEXT NOT NULL` | Caminho do executável do emulador (`.exe`), entrada não confiável |

Regras:

- Configurado na aba "Emuladores" das Configurações; pode ser trocado ou removido.
- **Yuzu:** ROMs `.nsp`, `.xci`, `.nca`, `.nro` e `.nso`. O jogo abre com `yuzu.exe -f -g "<rom>"` (`-f` tela cheia, `-g` jogo), montado no processo principal como lista de argumentos, sem shell.
- Estado de instalação de um jogo do Yuzu: existência da ROM (mesmas regras de 3.2). Sem o emulador configurado (ou com o executável ausente), o jogo não pode ser iniciado e a interface explica o motivo.

---

## 4. Fontes de dados

### 4.1 Steam — arquivos locais

Instalação, estado e jogo em execução vêm de `libraryfolders.vdf` e `appmanifest_*.acf` (ver 3.2). Os valores de `StateFlags` são documentados pela comunidade, não por um contrato oficial da Valve: validar em instalações reais e fixar com fixtures de teste. Manifestos de ferramentas (por exemplo, Steamworks Common Redistributables) devem ser ignorados.

### 4.2 Steam — `appdetails` (metadados)

Decisão do dono do projeto (Fase 6b): consultado em português (`l=brazilian&cc=br`) e usado só para estes campos:

- Página do jogo: `genres` (gêneros), `developers` (primeiro valor → `developer`), `short_description` (→ `description`, texto simples), `release_date.date` (→ `release_date`; formato "20/fev./2024" convertido para `AAAA-MM-DD`; vazio, "Em breve" ou só ano/trimestre → `NULL`) e a classificação brasileira `ratings.dejus.rating` (→ `required_age`: `l` → `L`, `10`/`12`/`14`/`16`/`18` como estão; ausente ou outro valor, como o `6` gerado pela Steam, → `NULL`, exibido como "pendente"). O campo `required_age` da resposta não é usado. A migração `0004` limpou as classificações antigas dos jogos Steam e a `0005` (data de lançamento) marcou todos para nova busca.
- Tela de conquistas: `header_image` (arte `header`).
- Página do jogo: `background_raw` (arte `background`). Quando a loja só tem um fundo gerado e borrado (endereço `/images/storepagebackground/`), usa-se a primeira captura de tela (`screenshots[0].path_full`, 1920×1080); um fundo gerado salvo antes dessa regra é substituído.

`name` e `required_age` não são usados (o título vem do manifesto local). Verificar o indicador de sucesso (`success: false` para apps que não são jogos ou não existem), tratar todos os campos como opcionais e normalizar antes de salvar (entidades HTML decodificadas, espaços colapsados). Validado em uma resposta real em 2026-11-03. Fila de 1 requisição a cada 1,5 s (limite informado pela comunidade: ~200 a cada 5 minutos).

**Frequência (D-16):** consultado **apenas quando o jogo é descoberto ou adicionado**. Sem refresh periódico e sem refresh na abertura. Falha não conta como concluído (`metadata_fetched_at` continua `NULL`) e é tentada de novo em um refresh posterior da biblioteca, com tentativas limitadas. Nunca sobrescrever `hidden`/`beated` nem trocar valores válidos por vazios.

### 3.11 Sincronização do tempo de jogo com a Steam

Decisão do dono do projeto (Fase 2). Para jogos Steam, a Steam é a fonte da verdade do tempo total e da última vez jogado, porque inclui o tempo jogado em outros computadores e antes do Equon.

- **Quando:** uma única vez **a cada abertura do launcher**, com uma chamada a `IPlayerService/GetOwnedGames/v1` (precisa da chave e do SteamID64; formato validado em 2026-11-03: `response.games[].appid`, `name` (com `include_appinfo=1`), `playtime_forever` em minutos, `rtime_last_played` em segundos Unix; perfil sem detalhes de jogos públicos responde `response` vazio, tratado como falha). Roda depois da varredura local. É a única sincronização automática na abertura; conquistas continuam seguindo a seção 5.
- **Ordem na abertura:** primeiro fechar as sessões interrompidas (3.8), depois sincronizar com a Steam.
- **O que faz:** para cada jogo com `origin = 'steam'` já existente no banco e presente na resposta, em **uma transação**: gravar `steam_playtime_baseline` (`playtime_forever`, em minutos) e `steam_synced_at`, **sobrescrever** `time_last_played` com `rtime_last_played` (quando a Steam informa uma data) e recalcular `playtime` pela regra de 3.8.
- **Enquanto o launcher está aberto:** cada sessão observada soma sobre a base da Steam. Na próxima abertura a Steam já contabilizou essas sessões e o valor é sobrescrito de novo, sem contagem dupla.
- **Falhas:** sem chave, sem internet, perfil privado ou resposta inválida → **não alterar nada**; as sessões continuam somando sobre a última sincronização boa.
- Jogos que a Steam ainda não contabilizou (por exemplo, jogados com a Steam em modo offline) podem ter o tempo reduzido temporariamente: o valor da Steam sempre sobrescreve. Aceito pelo dono do projeto.
- **Jogos que a biblioteca ainda não tem (decisão do dono do projeto, Fase 7):** a abertura e "Atualizar biblioteca" usam a mesma resposta para criá-los, sempre depois da varredura local. O jogo novo entra com `installed = 0` se a varredura foi completa; caso contrário, `NULL` (uma leitura que falhou nunca grava `0`). Um título igual ao de um jogo de outra origem vira candidato a duplicata, sem mesclar. Os metadados e as artes seguem depois, na fila normal (D-16).
- **"Atualizar biblioteca" não sobrescreve o tempo de jogo:** só os jogos ainda sem sincronização (`steam_synced_at` nulo) recebem a base da Steam. Os demais só mudam na próxima abertura.
- Não toca em `hidden`/`beated`, nem no `installed` de jogos já existentes. Jogos sem nome na resposta não são criados.
- Jogos de outras origens usam apenas o tempo medido pelo launcher.

### 4.3 Steam — Web API (conquistas e tempo de jogo)

Endpoints usados:

- Definições: `ISteamUserStats/GetSchemaForGame/v2` (precisa da chave; `l=brazilian`). Jogo sem conquistas responde sem `availableGameStats.achievements`.
- Estado pessoal: `ISteamUserStats/GetPlayerAchievements/v1` (precisa da chave e do SteamID64). Perfil privado responde com erro "Profile is not public".
- Percentuais globais: `ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2` (sem chave; o percentual vem como texto, `"89.8"`).
- Ícones: `icon` guarda a URL remota (`steamcdn-a.akamaihd.net`). O arquivo é baixado só quando o usuário abre as conquistas daquele jogo e fica em `<jogo>/achievements/<id>` no cache de artes. Conquistas bloqueadas usam o ícone próprio da Steam para esse estado (`icon_locked`, vindo de `icongray`), em `<jogo>/achievements/<id>-locked`; só a arte do estado atual é baixada.

Formatos validados em 2026-11-04 com uma conta real.

Perfis privados e dados ausentes podem limitar o resultado. Percentual global desconhecido é `NULL`, nunca `0`. A chave às vezes viaja na URL; **nunca** registrar URLs com a chave.

### 4.4 SteamGridDB (artes)

API REST v2 com chave pessoal gratuita. Fornece capa quadrada e logo (e, para jogos manuais, busca por nome, com confirmação do usuário). Busca feita sob demanda, em fila com limite de ritmo, e sempre guardada em cache. Detalhes e limites: `ARCHITECTURE.md` §3.13.

---

## 5. Regras de sincronização

1. **Atualização da biblioteca:** cada fonte é varrida de forma independente; falhas parciais não derrubam o resto. Valores conhecidos só são substituídos por dados válidos.
2. **Metadados e artes:** buscados na descoberta ou adição do jogo (D-15, D-16).
3. **Conquistas — após fechar um jogo:** sincronizar **somente aquele jogo**, e só se o fechamento foi observado e o jogo suporta conquistas.
4. **Conquistas — sincronização completa:** apenas quando o usuário pedir explicitamente, em segundo plano, com progresso e resultado por jogo.
5. **Nunca:** sincronização periódica de conquistas, ou de todas as conquistas da biblioteca automaticamente (inclusive na abertura). A única exceção automática na abertura é o tempo de jogo da Steam (3.11), feito com uma única requisição.
6. **Sincronização de um jogo:** buscar definições, estado pessoal e percentuais globais; validar e normalizar; então, em **uma transação**: upsert por `(game_id, api_name)`, recálculo de `tier` onde o percentual mudou e recálculo dos contadores de `USERS` a partir de `ACHIEVEMENTS`. Se qualquer busca for inválida ou incompleta, **não alterar nada**: manter os últimos dados bons, marcar como desatualizado na interface e registrar o erro.
7. Uma requisição que falhou **nunca** define `unlocked = 0` nem apaga linhas.
8. Repetir uma sincronização com os mesmos dados não deve alterar nada (idempotência).
9. Jogo confirmado como sem conquistas mostra uma mensagem informativa, não um erro de sincronização.

---

## 6. Integridade, exclusão e migrações

- Excluir um jogo remove, em cascata, conquistas, ligações de gênero, configuração de lançamento, sessões e artes. Os arquivos de arte no cache devem ser removidos pela aplicação.
- Gêneros órfãos podem permanecer; limpeza é opcional e nunca urgente.
- Toda mudança de schema exige migração versionada. Alterações que o SQLite não faz no lugar usam o padrão criar-copiar-renomear, com chaves estrangeiras desligadas fora da transação.
- Fazer cópia do arquivo do banco antes de aplicar migrações: quando há migração pendente em um banco existente, o launcher grava `equon.sqlite.v<versão>.bak` com `VACUUM INTO`; se essa cópia falhar, nenhuma migração roda.
- **Recuperação (verificada na Fase 8, com teste automatizado):** um arquivo danificado ou de versão mais nova impede a abertura, com uma mensagem explicando o motivo, e nunca é alterado. Para restaurar: fechar o Equon; apagar `equon.sqlite`, `equon.sqlite-wal` e `equon.sqlite-shm`; copiar o `.bak` mais recente como `equon.sqlite`. Na abertura, as migrações levam a cópia até a versão atual. Perde-se o que mudou depois da cópia; os jogos da Steam, o tempo de jogo e as conquistas voltam nas próximas sincronizações.
- Testes de banco devem cobrir: migrações, restrições, upserts (preservando `hidden`/`beated`), cascatas, transações, chaves estrangeiras realmente ativas e ordenações com `NULL`.

---

## 7. Decisões

### 7.1 Resolvidas

| Assunto | Decisão | Referência |
| --- | --- | --- |
| Motor de banco | SQLite embutido | D-02 |
| Migrações e acesso a dados | SQL versionado + `better-sqlite3` + SQL nos repositórios | D-03 |
| Guarda das chaves de API | Criptografadas com `safeStorage` (`BLOB`) | D-04 |
| Origens | Tabela `ORIGINS` extensível; de fábrica: `steam`, `manual`, `yuzu`, `ps2` | D-05 |
| Estado de instalação desconhecido | `installed` nulo (`NULL` = desconhecido) | D-06 |
| Estado de instalação de jogos manuais | Existência do executável; erro de leitura → `NULL` | Fase 4 |
| Emuladores | Tabela `EMULATORS` (só Yuzu); jogos guardam a ROM e o emulador é resolvido ao abrir | Fase 4 |
| Atalhos `.url` | Aceitos com lista de protocolos permitidos; tempo de jogo não medido | Fase 4 |
| Tempo de jogo informado pelo usuário | `games.playtime_offset`, somado às sessões | Fase 4 |
| Configuração de lançamento manual | Tabela `GAME_LAUNCH_CONFIGS` | D-07 |
| Sessões e arredondamento | Tabela `PLAY_SESSIONS`; `playtime` derivado dos segundos | D-08 |
| Sessões interrompidas | Somam tempo até o último heartbeat (`last_seen_at`) | D-08 |
| Tempo de jogo da Steam | Sincronizado a cada abertura; sobrescreve `playtime`/`time_last_played` dos jogos Steam e as sessões somam até a próxima abertura | D-08, 3.11 |
| Tabelas `STRICT` | Sim, em todas as tabelas | Fase 2 |
| Gêneros duplicados | Nome normalizado + `UNIQUE COLLATE NOCASE` | Fase 2 |
| Onde calcular tier e contadores | Camada de aplicação, em transação | D-09 |
| Linha única em `USERS` | `CHECK (id = 1)` | D-10 |
| Descoberta e estado na Steam | Manifestos locais e `StateFlags` | D-12 |
| Frequência dos metadados | Apenas na descoberta/adição | D-16 |
| Lançamento na Steam | `steam://rungameid/<appid>` | D-17 |
| Artes | SteamGridDB + `appdetails` + arquivo local; tabela `GAME_ARTWORK` | D-15 |

### 7.2 Ainda em aberto

2. Onde guardar as preferências (idioma etc.): tabela de configurações ou arquivo de configuração. O caminho da Steam não é mais preferência: é sempre detectado (Fase 6).
3. Política de limpeza do cache de artes e variantes de tamanho.
4. Se haverá uma ação manual de "atualizar metadados" de um jogo.

---

## 8. Instruções para a IA de programação

- Siga este documento e o `ARCHITECTURE.md`. Não invente tabelas, colunas ou valores que não estejam aqui; proponha a mudança e atualize o documento antes.
- Nunca copie tipos de PostgreSQL. Use as convenções da seção 2.
- Nunca grave `installed = 0` quando uma leitura falhou. Nunca zere dados válidos por causa de uma falha de rede.
- Nunca sobrescreva `hidden`, `beated` ou arte escolhida pelo usuário em uma sincronização.
- Nunca registre ou exponha chaves de API.
- Toda gravação relacionada (sessão, tempo de jogo, conquistas, contadores) acontece em **uma transação**.
- Escreva testes de repositório contra SQLite real em memória.
- Se algo estiver na lista "Ainda em aberto", pergunte em vez de decidir sozinho.
