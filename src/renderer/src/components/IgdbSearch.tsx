import { useCallback, useEffect, useState } from 'react'
import type { IgdbGameFill, IgdbGameInfo } from '../../../shared/ipc/contract'
import { useFocusManager } from '../focus/focus-context'
import { t } from '../strings'
import { ChoiceDialog, type ChoiceItem } from './Dialog'
import { OnScreenKeyboard } from './OnScreenKeyboard'

type Step =
  | { kind: 'typing'; term: string }
  | { kind: 'searching'; term: string }
  | { kind: 'results'; term: string; games: IgdbGameInfo[] }
  | { kind: 'loading'; name: string }
  | { kind: 'failed'; message: string }
  | { kind: 'saving' }

const errorText = (code: string): string => t.igdb.errors[code] ?? t.igdb.errors.network

/** "Preencher com IGDB" (D-18): search by name, the user confirms the right game. */
export function IgdbSearch({
  title,
  onClose,
  onPick,
  onSkip,
  onFailure
}: {
  /** What was typed in the form; with nothing there, the search starts by asking. */
  title: string
  onClose: () => void
  onPick: (igdbGameId: number, fill: IgdbGameFill) => void
  /** Adding a game: go on without IGDB. */
  onSkip?: () => void
  /** Adding a game: IGDB failing does not stop it. Without this, the failure stays on screen. */
  onFailure?: (message: string) => void
}): React.JSX.Element {
  const [step, setStep] = useState<Step>(
    title.trim() === '' ? { kind: 'typing', term: '' } : { kind: 'searching', term: title.trim() }
  )
  const searchingTerm = step.kind === 'searching' ? step.term : null

  const fail = useCallback(
    (message: string): void => {
      if (onFailure) {
        setStep({ kind: 'saving' })
        onFailure(message)
      } else {
        setStep({ kind: 'failed', message })
      }
    },
    [onFailure]
  )

  // "Fechar" is the only row while searching, so focus would stay on it: move to the results.
  const focus = useFocusManager()
  const firstRow = step.kind === 'results' ? (step.games[0]?.id ?? 'other') : null
  useEffect(() => {
    if (firstRow !== null) focus.focus(`choice:igdb:${firstRow}`)
  }, [focus, firstRow])

  useEffect(() => {
    if (searchingTerm === null) return
    let cancelled = false
    void window.equon.igdb.search(searchingTerm).then(
      (result) => {
        if (cancelled) return
        if (result.ok) setStep({ kind: 'results', term: searchingTerm, games: result.data })
        else fail(errorText(result.error.code))
      },
      () => !cancelled && fail(errorText('network'))
    )
    return () => {
      cancelled = true
    }
  }, [searchingTerm, fail])

  const pick = (game: IgdbGameInfo): void => {
    setStep({ kind: 'loading', name: game.name })
    void window.equon.igdb.game(game.id).then(
      (result) => {
        if (result.ok && result.data) onPick(game.id, result.data)
        else if (result.ok) fail(t.igdb.notFound)
        else fail(errorText(result.error.code))
      },
      () => fail(errorText('network'))
    )
  }

  if (step.kind === 'typing') {
    return (
      <OnScreenKeyboard
        title={t.igdb.searchTitle}
        initialValue={step.term}
        maxLength={200}
        onCancel={onClose}
        onDone={(term) =>
          term.trim() === '' ? onClose() : setStep({ kind: 'searching', term: term.trim() })
        }
      />
    )
  }

  const close: ChoiceItem = { id: 'close', label: t.igdb.close, compact: true, onConfirm: onClose }
  let items: ChoiceItem[] = [close]
  let message: string
  if (step.kind === 'results') {
    items = [
      ...step.games.map<ChoiceItem>((game) => ({
        id: String(game.id),
        label: game.name,
        // Two games can share a name: the year and the developer tell them apart.
        detail: [game.year, game.developer].filter(Boolean).join(' · ') || undefined,
        onConfirm: () => pick(game)
      })),
      {
        id: 'other',
        label: t.igdb.otherName,
        separated: step.games.length > 0,
        onConfirm: () => setStep({ kind: 'typing', term: step.term })
      },
      ...(onSkip
        ? [{ id: 'skip', label: t.igdb.saveWithout, onConfirm: onSkip } satisfies ChoiceItem]
        : []),
      close
    ]
    message =
      step.games.length === 0
        ? t.igdb.noResults(step.term)
        : onSkip
          ? t.igdb.pickToAdd
          : t.igdb.pick
  } else if (step.kind === 'failed') {
    message = step.message
  } else if (step.kind === 'searching') {
    message = t.igdb.searching
  } else if (step.kind === 'saving') {
    items = []
    message = t.form.saving
  } else {
    message = t.igdb.loading(step.name)
  }

  return (
    <ChoiceDialog
      id="igdb"
      width="wide"
      title={t.igdb.title}
      items={items}
      onClose={onClose}
      footer={
        <p className="dialog__message" role={step.kind === 'failed' ? 'alert' : undefined}>
          {message}
        </p>
      }
    />
  )
}
