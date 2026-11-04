import { useEffect, useState } from 'react'
import type { SteamGridDbGameInfo } from '../../../shared/ipc/contract'
import { t } from '../strings'
import { ChoiceDialog, type ChoiceItem } from './Dialog'
import { OnScreenKeyboard } from './OnScreenKeyboard'

type Step =
  | { kind: 'searching'; term: string }
  | { kind: 'results'; term: string; games: SteamGridDbGameInfo[] }
  | { kind: 'typing'; term: string }
  | { kind: 'applying'; name: string }
  | { kind: 'done'; message: string; tone: 'success' | 'error' }

/**
 * "Buscar artes no SteamGridDB" for a manual game (D-15, owner decision of
 * Phase 6c): search by title, the user confirms the right game, then main
 * downloads its best-voted covers, logo and header.
 */
export function SteamGridDbSearch({
  gameId,
  title,
  onClose,
  onApplied
}: {
  gameId: number
  title: string
  onClose: () => void
  onApplied: () => void
}): React.JSX.Element {
  const [step, setStep] = useState<Step>({ kind: 'searching', term: title })
  const searchingTerm = step.kind === 'searching' ? step.term : null

  useEffect(() => {
    if (searchingTerm === null) return
    let cancelled = false
    void window.equon.artwork.search(searchingTerm).then(
      (result) => {
        if (cancelled) return
        if (result.ok) setStep({ kind: 'results', term: searchingTerm, games: result.data })
        else setStep({ kind: 'done', message: errorText(result.error.code), tone: 'error' })
      },
      () => !cancelled && setStep({ kind: 'done', message: errorText('network'), tone: 'error' })
    )
    return () => {
      cancelled = true
    }
  }, [searchingTerm])

  const apply = (game: SteamGridDbGameInfo): void => {
    setStep({ kind: 'applying', name: game.name })
    void window.equon.artwork.applySteamGridDb(gameId, game.id).then(
      (result) => {
        if (result.ok && result.data.length > 0) {
          onApplied()
          setStep({
            kind: 'done',
            message: t.steamGridDb.applied(result.data.length),
            tone: 'success'
          })
        } else if (result.ok) {
          setStep({ kind: 'done', message: t.steamGridDb.nothingFound, tone: 'error' })
        } else {
          setStep({ kind: 'done', message: errorText(result.error.code), tone: 'error' })
        }
      },
      () => setStep({ kind: 'done', message: errorText('network'), tone: 'error' })
    )
  }

  if (step.kind === 'typing') {
    return (
      <OnScreenKeyboard
        title={t.steamGridDb.searchTitle}
        initialValue={step.term}
        maxLength={200}
        onCancel={onClose}
        onDone={(term) => setStep({ kind: 'searching', term: term.trim() || title })}
      />
    )
  }

  let items: ChoiceItem[]
  let message: React.ReactNode
  if (step.kind === 'results') {
    items = [
      ...step.games.map<ChoiceItem>((game) => ({
        id: String(game.id),
        label: game.name,
        detail: game.year ? String(game.year) : undefined,
        onConfirm: () => apply(game)
      })),
      {
        id: 'other',
        label: t.steamGridDb.otherName,
        separated: step.games.length > 0,
        onConfirm: () => setStep({ kind: 'typing', term: step.term })
      },
      { id: 'close', label: t.steamGridDb.close, onConfirm: onClose }
    ]
    message = step.games.length === 0 ? t.steamGridDb.noResults(step.term) : t.steamGridDb.pick
  } else if (step.kind === 'done') {
    items = [{ id: 'close', label: t.steamGridDb.close, onConfirm: onClose }]
    message = step.message
  } else {
    // Searching or applying: the close entry stays focusable while main works.
    items = [{ id: 'close', label: t.steamGridDb.close, onConfirm: onClose }]
    message =
      step.kind === 'searching' ? t.steamGridDb.searching : t.steamGridDb.applying(step.name)
  }

  return (
    <ChoiceDialog
      id="steamgriddb"
      title={t.steamGridDb.title}
      items={items}
      onClose={onClose}
      footer={
        <p
          className="dialog__message"
          role={step.kind === 'done' && step.tone === 'error' ? 'alert' : undefined}
        >
          {message}
        </p>
      }
    />
  )
}

function errorText(code: string): string {
  return t.steamGridDb.errors[code] ?? t.steamGridDb.errors.network
}
