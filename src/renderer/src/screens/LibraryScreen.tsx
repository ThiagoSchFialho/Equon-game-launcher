import { useMemo, useState } from 'react'
import type { GameSummary } from '../../../shared/ipc/contract'
import {
  DEFAULT_LIBRARY_VIEW,
  activeFilterCount,
  applyLibraryView,
  isFiltered,
  type InstallFilter,
  type LibrarySort
} from '../../../shared/library-view'
import { useNavigation } from '../app/navigation'
import { Button } from '../components/Button'
import { ChoiceDialog, type ChoiceItem } from '../components/Dialog'
import { Footer, type Hint } from '../components/Footer'
import { GameCard } from '../components/GameCard'
import { GameOptionsLayer } from '../components/GameOptionsLayer'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { StateMessage } from '../components/StateMessage'
import { ToolbarField } from '../components/ToolbarField'
import { TopBar } from '../components/TopBar'
import { useGames } from '../data/games'
import { formatPercent, formatPlaytime } from '../data/format'
import { useLibraryView } from '../data/library-view'
import { useFocusFirstOnChange, useFocusManager, useScreenActions } from '../focus/focus-context'
import { FocusScope } from '../focus/FocusProvider'
import { t } from '../strings'
import './LibraryScreen.css'

const HINTS: Hint[] = [
  { button: 'LB/RB', label: t.hints.navigate },
  { button: 'menu', label: t.hints.options },
  { button: 'A', label: t.hints.open },
  { button: 'X', label: t.hints.sort },
  { button: 'Y', label: t.hints.filter }
]
const MENU_HINTS: Hint[] = [
  { button: 'A', label: t.hints.select },
  { button: 'B', label: t.hints.back }
]

const SORTS: LibrarySort[] = ['title', 'recent', 'playtime', 'achievements', 'origin', 'install']
const INSTALLS: InstallFilter[] = ['all', 'installed', 'missing']

/** The number behind the current order, on the card; null when there is none to show. */
function cardStat(game: GameSummary, sort: LibrarySort): string | null {
  if (sort === 'playtime') return formatPlaytime(game.playtime)
  if (sort === 'achievements' && game.achievementPercent !== null) {
    return formatPercent(game.achievementPercent)
  }
  return null
}

type Overlay =
  | { kind: 'menu'; game: GameSummary }
  | { kind: 'search' }
  | { kind: 'origin' }
  | { kind: 'sort' }
  | { kind: 'filters' }
  | { kind: 'install' }

export function LibraryScreen(): React.JSX.Element {
  const navigation = useNavigation()
  const { games, reload } = useGames()
  const { view, setView } = useLibraryView()
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const focus = useFocusManager()

  const all = useMemo(() => (games.status === 'ready' ? games.data : []), [games])
  const shown = useMemo(() => applyLibraryView(all, view), [all, view])
  const filtered = isFiltered(view)
  // Origins that have games, plus the selected one so it can always be read and changed.
  const origins = useMemo(() => {
    const names = new Map(all.map((g) => [g.origin, g.originName]))
    if (view.origin !== null && !names.has(view.origin)) names.set(view.origin, view.origin)
    return [...names].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  }, [all, view.origin])
  const originName =
    view.origin === null
      ? t.library.allOrigins
      : (origins.find(([key]) => key === view.origin)?.[1] ?? view.origin)

  useFocusFirstOnChange(view, shown[0] ? `game-card:square:${shown[0].id}` : null)

  const close = (): void => setOverlay(null)
  const clearFilters = (): void => setView((v) => ({ ...DEFAULT_LIBRARY_VIEW, sort: v.sort }))

  // Right stick / Page Up-Down: move a page (two rows) at a time.
  const page = (direction: 'up' | 'down') => (): void => {
    focus.handle(direction)
    focus.handle(direction)
  }
  useScreenActions({
    previousSection: () => navigation.stepSection(-1),
    nextSection: () => navigation.stepSection(1),
    scrollUp: page('up'),
    scrollDown: page('down'),
    secondary: () => setOverlay({ kind: 'sort' }),
    tertiary: () => setOverlay({ kind: 'filters' })
  })

  let content: React.JSX.Element
  if (games.status === 'loading') {
    content = <StateMessage message={t.library.loading} />
  } else if (games.status === 'error') {
    content = (
      <StateMessage
        tone="error"
        message={t.library.error}
        action={{ id: 'library:retry', label: t.library.retry, onConfirm: reload }}
      />
    )
  } else if (all.length === 0) {
    content = (
      <StateMessage
        message={t.library.empty}
        hint={t.library.emptyHint}
        action={{
          id: 'library:add-empty',
          label: t.library.addGame,
          onConfirm: () => navigation.openGameForm(null)
        }}
      />
    )
  } else if (shown.length === 0 && filtered) {
    content = (
      <StateMessage
        message={t.library.noMatches}
        action={{ id: 'library:clear', label: t.library.clearFilters, onConfirm: clearFilters }}
      />
    )
  } else if (shown.length === 0) {
    content = (
      <StateMessage
        message={t.library.allHidden}
        hint={t.library.allHiddenHint}
        action={{
          id: 'library:show-hidden',
          label: `${t.library.showHidden} ${t.library.hiddenGames.toLowerCase()}`,
          onConfirm: () => setView((v) => ({ ...v, showHidden: true }))
        }}
      />
    )
  } else {
    content = (
      <div className="library__grid">
        {shown.map((game, index) => (
          <GameCard
            key={game.id}
            game={game}
            variant="square"
            stat={cardStat(game, view.sort)}
            scroll="follow"
            autoFocus={index === 0}
            onConfirm={() => navigation.openGame(game.id)}
            onMenu={() => setOverlay({ kind: 'menu', game })}
          />
        ))}
      </div>
    )
  }

  const total = view.showHidden ? all.length : all.filter((g) => !g.hidden).length

  return (
    <FocusScope id="screen:library">
      <div className="screen">
        <TopBar active="library" />
        <main className="screen__main library">
          <header className="library__header">
            <h1 className="library__title">{t.library.title}</h1>
            {games.status === 'ready' && (
              <span className="library__count">
                {filtered ? t.library.countOf(shown.length, total) : t.library.count(total)}
              </span>
            )}
          </header>
          <div className="library__toolbar">
            <ToolbarField
              id="library:search"
              kind="search"
              label={t.library.search}
              value={view.query}
              onConfirm={() => setOverlay({ kind: 'search' })}
            />
            <ToolbarField
              id="library:filters"
              kind="select"
              label={t.library.filter}
              value={t.library.filterCount(activeFilterCount(view))}
              onConfirm={() => setOverlay({ kind: 'filters' })}
            />
            <ToolbarField
              id="library:sort"
              kind="select"
              label={t.library.sort}
              value={t.library.sorts[view.sort]}
              onConfirm={() => setOverlay({ kind: 'sort' })}
            />
            <Button
              id="library:clear-filters"
              label={t.library.clearFilters}
              unavailable={!filtered}
              onConfirm={clearFilters}
            >
              {t.library.clearFilters}
            </Button>
            <div className="library__toolbar-actions">
              <Button
                id="library:add"
                variant="primary"
                label={t.library.addGame}
                onConfirm={() => navigation.openGameForm(null)}
              >
                <span aria-hidden>+</span>
                {t.library.addGame}
              </Button>
            </div>
          </div>
          <div className="library__scroll">{content}</div>
        </main>
        <Footer hints={overlay ? MENU_HINTS : HINTS} />
      </div>

      {overlay?.kind === 'menu' && <GameOptionsLayer game={overlay.game} onClose={close} />}
      {overlay?.kind === 'search' && (
        <OnScreenKeyboard
          title={t.library.searchTitle}
          placeholder={t.library.searchPlaceholder}
          initialValue={view.query}
          maxLength={100}
          onCancel={close}
          onDone={(query) => {
            setView((v) => ({ ...v, query: query.trim() }))
            close()
          }}
        />
      )}
      {overlay?.kind === 'origin' && (
        <ChoiceDialog
          id="library-origin"
          title={t.library.origin}
          onClose={() => setOverlay({ kind: 'filters' })}
          items={[
            { key: null, name: t.library.allOrigins },
            ...origins.map(([key, name]) => ({ key, name }))
          ].map<ChoiceItem>(({ key, name }) => ({
            id: key ?? 'all',
            label: name,
            selected: key === view.origin,
            onConfirm: () => {
              setView((v) => ({ ...v, origin: key }))
              setOverlay({ kind: 'filters' })
            }
          }))}
        />
      )}
      {overlay?.kind === 'sort' && (
        <ChoiceDialog
          id="library-sort"
          title={t.library.sort}
          onClose={close}
          items={SORTS.map<ChoiceItem>((sort) => ({
            id: sort,
            label: t.library.sorts[sort],
            selected: sort === view.sort,
            onConfirm: () => {
              setView((v) => ({ ...v, sort }))
              close()
            }
          }))}
        />
      )}
      {overlay?.kind === 'filters' && (
        <ChoiceDialog
          id="library-filters"
          title={t.library.filters}
          onClose={close}
          items={[
            {
              id: 'origin',
              label: t.library.origin,
              detail: originName,
              onConfirm: () => setOverlay({ kind: 'origin' })
            },
            {
              id: 'install',
              label: t.library.install,
              detail: t.library.installs[view.install],
              onConfirm: () => setOverlay({ kind: 'install' })
            },
            {
              id: 'hidden',
              label: t.library.hiddenGames,
              detail: view.showHidden ? t.library.showHidden : t.library.hideHidden,
              onConfirm: () => setView((v) => ({ ...v, showHidden: !v.showHidden }))
            },
            {
              id: 'beaten',
              label: t.library.beatenGames,
              detail: view.beatenOnly ? t.library.beatenOnly : t.library.beatenAll,
              onConfirm: () => setView((v) => ({ ...v, beatenOnly: !v.beatenOnly }))
            },
            {
              id: 'clear',
              label: t.library.clearFilters,
              separated: true,
              onConfirm: filtered
                ? () => {
                    clearFilters()
                    close()
                  }
                : undefined
            },
            { id: 'close', label: t.library.close, onConfirm: close }
          ]}
        />
      )}
      {overlay?.kind === 'install' && (
        <ChoiceDialog
          id="library-install"
          title={t.library.install}
          onClose={() => setOverlay({ kind: 'filters' })}
          items={INSTALLS.map<ChoiceItem>((install) => ({
            id: install,
            label: t.library.installs[install],
            selected: install === view.install,
            onConfirm: () => {
              setView((v) => ({ ...v, install }))
              setOverlay({ kind: 'filters' })
            }
          }))}
        />
      )}
    </FocusScope>
  )
}
