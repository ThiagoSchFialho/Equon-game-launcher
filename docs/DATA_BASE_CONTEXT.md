# Equon Game Launcher — Contexto do Banco de Dados

**Versão:** 0.2
**Status:** Rascunho — alinhado às decisões D-01 a D-17 do `ARCHITECTURE.md`
**Idioma:** português
**Finalidade:** descrever o modelo de dados, as regras de integridade e as decisões que a IA de programação e as pessoas devem respeitar ao criar migrações, repositórios e casos de uso.

Quando este documento e o código divergirem, atualize o documento no mesmo commit. Mudanças de schema exigem migração versionada.

---

## 1. Contexto e premissas

- Aplicativo desktop para Windows, com **um único usuário local** e **uma única conta Steam**.
- Banco: **SQLite embutido** (D-02). Não existe servidor de banco. O arquivo fica na pasta de dados do aplicativo.
- Driver: `better-sqlite3`. Acesso por **repositórios** com SQL escrito à mão; sem ORM (D-03). SQL existe apenas em `infrastructure/persistence`.
- Migrações: arquivos `.sql` versionados (`0001_init.sql`, ...), aplicados em ordem por um executor pequeno que registra a versão em `PRAGMA user_version`. Cada migração roda em transação.
- **Obrigatório:** executar `PRAGMA foreign_keys = ON` em **toda** conexão. Sem isso o SQLite ignora as chaves estrangeiras e os `ON DELETE CASCADE` não funcionam.
- O estado de desbloqueio das conquistas fica em `ACHIEVEMENTS`. **Não** criar `USER_ACHIEVEMENTS` nem perfis múltiplos.
- Fontes Steam usadas: arquivos locais da Steam (instalação), `appdetails` (metadados), Steam Web API (conquistas) e SteamGridDB (artes). Epic Games e GOG **não** têm integração automática; esses jogos são adicionados manualmente (`origin = 'manual'`).
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
- Considerar tabelas `STRICT` se a versão do SQLite empacotada suportar (validar na Fase 2).
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
| `hidden` | `INTEGER NOT NULL DEFAULT 0` | Flag manual. Nunca sobrescrita por sincronização |
| `installed` | `INTEGER` | `1` instalado, `0` confirmado como não instalado, `NULL` desconhecido (D-06) |
| `playtime` | `INTEGER NOT NULL DEFAULT 0` | Minutos medidos pelo launcher; `CHECK (playtime >= 0)` |
| `beated` | `INTEGER NOT NULL DEFAULT 0` | Flag manual. Nunca sobrescrita por sincronização |
| `required_age` | `TEXT` | Classificação indicativa |
| `origin` | `TEXT NOT NULL` | `CHECK (origin IN ('steam','manual'))` (D-05) |
| `metadata_fetched_at` | `TEXT` | Preenchido somente após salvar uma resposta válida de metadados (D-16) |

Regras:

- `origin` identifica a **fonte do registro**, não o estado de instalação.
- Jogos com `origin = 'steam'` devem ter `steam_id` (`CHECK (origin <> 'steam' OR steam_id IS NOT NULL)`).
- Jogos da Epic, GOG e de outros launchers são cadastrados como `manual`.
- `hidden` e `beated` começam em `0` e só mudam por ação do usuário.
- `playtime` nunca é negativo. A regra de cálculo está em 3.8.
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
- A varredura local só enxerga jogos com manifesto (instalados ou em instalação). Jogos comprados e não instalados exigiriam `GetOwnedGames` (precisa de chave) e não fazem parte do MVP.
- Não reutilizar o método da Steam para jogos manuais; o estado de instalação deles será definido na Fase 4.

### 3.3 `USERS`

Uma única linha, com a configuração do usuário local.

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY` | `CHECK (id = 1)`; o repositório sempre usa `id = 1` (D-10) |
| `steam_id` | `TEXT UNIQUE` | SteamID64 (17 dígitos, validar com `^\d{17}$`); `NULL` enquanto não configurado |
| `steam_api_key_encrypted` | `BLOB` | Chave da Steam Web API criptografada com `safeStorage` (D-04) |
| `steamgriddb_api_key_encrypted` | `BLOB` | Chave do SteamGridDB criptografada com `safeStorage` (D-15) |
| `platine` | `INTEGER NOT NULL DEFAULT 0` | Jogos com platina; `CHECK (>= 0)` |
| `gold` | `INTEGER NOT NULL DEFAULT 0` | Conquistas ouro desbloqueadas; `CHECK (>= 0)` |
| `silver` | `INTEGER NOT NULL DEFAULT 0` | Conquistas prata desbloqueadas; `CHECK (>= 0)` |
| `bronze` | `INTEGER NOT NULL DEFAULT 0` | Conquistas bronze desbloqueadas; `CHECK (>= 0)` |

Regras:

- As chaves só são descriptografadas no processo principal, na hora de uma requisição. Nunca vão para a interface, para logs ou para mensagens de erro.
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
| `icon` | `TEXT` | Referência da imagem; segue a política de cache de artes |
| `unlocked` | `INTEGER NOT NULL DEFAULT 0` | `CHECK (unlocked IN (0,1))` |
| `unlocked_at` | `TEXT` | `NULL` se bloqueada ou desconhecida |
| `global_percent` | `REAL` | Percentual global; `NULL` se desconhecido (nunca `0` por falta de dado) |
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

- Visão geral dos jogos: por `GAMES.time_last_played` decrescente (padrão) ou por percentual de conclusão decrescente; desconhecidos por último.
- Desbloqueadas: `unlocked_at` decrescente, `NULL` por último.
- Bloqueadas: `global_percent` decrescente (menos raras primeiro), `NULL` por último.
- Desempate estável: `display_name`, depois `api_name`.

### 3.5 `GENRES`

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY` | |
| `name` | `TEXT NOT NULL UNIQUE` | Nomes normalizados para evitar duplicidade |

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
| `executable_path` | `TEXT NOT NULL` | Caminho do executável |
| `arguments` | `TEXT` | Lista JSON de argumentos (texto); `NULL` = sem argumentos |
| `working_directory` | `TEXT` | Diretório de trabalho; `NULL` = padrão |

Regras:

- Só existe para jogos com `origin = 'manual'` (verificado na camada de aplicação).
- Os três campos são **entrada não confiável**: validar se o executável existe e é um arquivo; nunca montar uma linha de comando como texto; passar argumentos como lista, sem shell.
- Jogos da Steam são lançados por `steam://rungameid/<appid>` (D-17) e não usam esta tabela.
- Jogos da Epic que só abrem pelo cliente oficial podem exigir outra forma de lançamento; validar na Fase 4.

### 3.8 `PLAY_SESSIONS` (D-08)

Sessões de jogo observadas pelo launcher.

| Coluna | Tipo | Regras |
| --- | --- | --- |
| `id` | `INTEGER PRIMARY KEY` | |
| `game_id` | `INTEGER NOT NULL` | FK para `GAMES(id)` com `ON DELETE CASCADE` |
| `started_at` | `TEXT NOT NULL` | UTC |
| `ended_at` | `TEXT` | UTC; `NULL` enquanto `running` ou se `interrupted` |
| `duration_seconds` | `INTEGER` | `CHECK (duration_seconds IS NULL OR duration_seconds >= 0)` |
| `status` | `TEXT NOT NULL` | `CHECK (status IN ('running','completed','interrupted'))` |

Restrições:

- `CHECK (status <> 'completed' OR (ended_at IS NOT NULL AND duration_seconds IS NOT NULL))`.
- Índice único parcial: no máximo **uma** sessão `running` por jogo (`UNIQUE (game_id) WHERE status = 'running'`).

Regras:

- Uma sessão `running` é criada quando o início do jogo é **observado** (para jogos Steam, o flag `AppRunning` do manifesto; para jogos manuais, o processo iniciado). Abrir a URL da Steam não conta como início.
- Ao encerrar normalmente: preencher `ended_at`, `duration_seconds`, `status = 'completed'` e atualizar `GAMES.playtime` e `GAMES.time_last_played` **na mesma transação**.
- Na inicialização do launcher, sessões que ficaram `running` são marcadas como `interrupted`. Por padrão, sessões interrompidas **não** somam tempo (a duração é desconhecida).
- **Cálculo de `GAMES.playtime`:** `floor(soma de duration_seconds das sessões 'completed' do jogo / 60)`. Assim os segundos que sobram de cada sessão se acumulam em vez de serem perdidos por arredondamento. O recálculo é idempotente.
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
| `width` | `INTEGER` | Dimensões reais da imagem baixada |
| `height` | `INTEGER` | |
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

---

## 4. Fontes de dados

### 4.1 Steam — arquivos locais

Instalação, estado e jogo em execução vêm de `libraryfolders.vdf` e `appmanifest_*.acf` (ver 3.2). Os valores de `StateFlags` são documentados pela comunidade, não por um contrato oficial da Valve: validar em instalações reais e fixar com fixtures de teste. Manifestos de ferramentas (por exemplo, Steamworks Common Redistributables) devem ser ignorados.

### 4.2 Steam — `appdetails` (metadados)

Usado para título, descrição, desenvolvedor, data de lançamento, classificação indicativa e gêneros, e para as artes `header_image` e `screenshots`. Verificar o indicador de sucesso, tratar todos os campos como opcionais e normalizar antes de salvar.

**Frequência (D-16):** consultado **apenas quando o jogo é descoberto ou adicionado**. Sem refresh periódico e sem refresh na abertura. Falha não conta como concluído (`metadata_fetched_at` continua `NULL`) e é tentada de novo em um refresh posterior da biblioteca, com tentativas limitadas. Nunca sobrescrever `hidden`/`beated` nem trocar valores válidos por vazios.

### 4.3 Steam — Web API (conquistas)

Endpoints candidatos (validar formato e limites atuais antes de implementar):

- Definições: `ISteamUserStats/GetSchemaForGame/v2` (precisa da chave).
- Estado pessoal: `ISteamUserStats/GetPlayerAchievements/v1` (precisa da chave e do SteamID64).
- Percentuais globais: `ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2` (confirmar se exige chave; não assumir).

Perfis privados e dados ausentes podem limitar o resultado. Percentual global desconhecido é `NULL`, nunca `0`. A chave às vezes viaja na URL; **nunca** registrar URLs com a chave.

### 4.4 SteamGridDB (artes)

API REST v2 com chave pessoal gratuita. Fornece capa quadrada e logo (e, para jogos manuais, busca por nome, com confirmação do usuário). Busca feita sob demanda, em fila com limite de ritmo, e sempre guardada em cache. Detalhes e limites: `ARCHITECTURE.md` §3.13.

---

## 5. Regras de sincronização

1. **Atualização da biblioteca:** cada fonte é varrida de forma independente; falhas parciais não derrubam o resto. Valores conhecidos só são substituídos por dados válidos.
2. **Metadados e artes:** buscados na descoberta ou adição do jogo (D-15, D-16).
3. **Conquistas — após fechar um jogo:** sincronizar **somente aquele jogo**, e só se o fechamento foi observado e o jogo suporta conquistas.
4. **Conquistas — sincronização completa:** apenas quando o usuário pedir explicitamente, em segundo plano, com progresso e resultado por jogo.
5. **Nunca:** sincronização periódica, ou de toda a biblioteca automaticamente (inclusive na abertura).
6. **Sincronização de um jogo:** buscar definições, estado pessoal e percentuais globais; validar e normalizar; então, em **uma transação**: upsert por `(game_id, api_name)`, recálculo de `tier` onde o percentual mudou e recálculo dos contadores de `USERS` a partir de `ACHIEVEMENTS`. Se qualquer busca for inválida ou incompleta, **não alterar nada**: manter os últimos dados bons, marcar como desatualizado na interface e registrar o erro.
7. Uma requisição que falhou **nunca** define `unlocked = 0` nem apaga linhas.
8. Repetir uma sincronização com os mesmos dados não deve alterar nada (idempotência).
9. Jogo confirmado como sem conquistas mostra uma mensagem informativa, não um erro de sincronização.

---

## 6. Integridade, exclusão e migrações

- Excluir um jogo remove, em cascata, conquistas, ligações de gênero, configuração de lançamento, sessões e artes. Os arquivos de arte no cache devem ser removidos pela aplicação.
- Gêneros órfãos podem permanecer; limpeza é opcional e nunca urgente.
- Toda mudança de schema exige migração versionada. Alterações que o SQLite não faz no lugar usam o padrão criar-copiar-renomear, com chaves estrangeiras desligadas fora da transação.
- Fazer cópia do arquivo do banco antes de aplicar migrações (estratégia de recuperação a verificar na Fase 8).
- Testes de banco devem cobrir: migrações, restrições, upserts (preservando `hidden`/`beated`), cascatas, transações, chaves estrangeiras realmente ativas e ordenações com `NULL`.

---

## 7. Decisões

### 7.1 Resolvidas

| Assunto | Decisão | Referência |
| --- | --- | --- |
| Motor de banco | SQLite embutido | D-02 |
| Migrações e acesso a dados | SQL versionado + `better-sqlite3` + SQL nos repositórios | D-03 |
| Guarda das chaves de API | Criptografadas com `safeStorage` (`BLOB`) | D-04 |
| Valores de `origin` | `steam` e `manual` | D-05 |
| Estado de instalação desconhecido | `installed` nulo (`NULL` = desconhecido) | D-06 |
| Configuração de lançamento manual | Tabela `GAME_LAUNCH_CONFIGS` | D-07 |
| Sessões e arredondamento | Tabela `PLAY_SESSIONS`; `playtime` derivado dos segundos | D-08 |
| Onde calcular tier e contadores | Camada de aplicação, em transação | D-09 |
| Linha única em `USERS` | `CHECK (id = 1)` | D-10 |
| Descoberta e estado na Steam | Manifestos locais e `StateFlags` | D-12 |
| Frequência dos metadados | Apenas na descoberta/adição | D-16 |
| Lançamento na Steam | `steam://rungameid/<appid>` | D-17 |
| Artes | SteamGridDB + `appdetails` + arquivo local; tabela `GAME_ARTWORK` | D-15 |

### 7.2 Ainda em aberto

1. Validar a estrutura atual e os limites da Steam Web API para conquistas.
2. Onde guardar as preferências (idioma, caminho da Steam, etc.): tabela de configurações ou arquivo de configuração.
3. Se `yuzu` ainda é uma origem desejada (hoje não faz parte de `origin`).
4. Se sessões interrompidas devem somar algum tempo (padrão atual: não).
5. Como distinguir tempo medido pelo launcher de estatísticas de lojas, se algum dia houver importação.
6. Política de limpeza do cache de artes e variantes de tamanho.
7. Estado de instalação de jogos manuais.
8. Se haverá uma ação manual de "atualizar metadados" de um jogo.
9. Suporte a tabelas `STRICT` na versão do SQLite empacotada.

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
