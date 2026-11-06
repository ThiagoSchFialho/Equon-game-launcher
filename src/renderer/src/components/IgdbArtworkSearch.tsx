import { useEffect, useRef, useState } from 'react'
import type { IgdbGameInfo } from '../../../shared/ipc/contract'
import { useFocusManager } from '../focus/focus-context'
import { t } from '../strings'
import { ChoiceDialog, type ChoiceItem } from './Dialog'
import { OnScreenKeyboard } from './OnScreenKeyboard'

type Step =
  | { kind: 'searching'; term: string }
  | { kind: 'results'; term: string; games: IgdbGameInfo[] }
  | { kind: 'typing'; term: string }
  | { kind: 'applying'; name: string }
  | { kind: 'done'; message: string }

const errorText = (code: string): string => t.igdb.errors[code] ?? t.igdb.errors.network

/** Steam titles carry these marks; IGDB's names do not, and they get in the way of the search. */
const searchTerm = (title: string): string => title.replace(/[™®©]/g, '').trim() || title

/**
 * "Buscar artes no IGDB" for any game (D-18): search by title, the user confirms the
 * right game, then main replaces the portrait cover, logo and background with its art.
 */
export function IgdbArtworkSearch({
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
  const [step, setStep] = useState<Step>({ kind: 'searching', term: searchTerm(title) })
  const searchingTerm = step.kind === 'searching' ? step.term : null
  const open = useRef(true)
  useEffect(() => {
    open.current = true
    return () => {
      open.current = false
    }
  }, [])

  // "Fechar" is the only row while searching, so focus would stay on it: move to the results.
  const focus = useFocusManager()
  const firstRow = step.kind === 'results' ? (step.games[0]?.id ?? 'other') : null
  useEffect(() => {
    if (firstRow !== null) focus.focus(`choice:igdb-artwork:${firstRow}`)
  }, [focus, firstRow])

  useEffect(() => {
    if (searchingTerm === null) return
    let cancelled = false
    void window.equon.igdb.search(searchingTerm).then(
      (result) => {
        if (cancelled) return
        if (result.ok) setStep({ kind: 'results', term: searchingTerm, games: result.data })
        else setStep({ kind: 'done', message: errorText(result.error.code) })
      },
      () => !cancelled && setStep({ kind: 'done', message: errorText('network') })
    )
    return () => {
      cancelled = true
    }
  }, [searchingTerm])

  const apply = (game: IgdbGameInfo): void => {
    setStep({ kind: 'applying', name: game.name })
    void window.equon.igdb.replaceArtwork(gameId, game.id).then(
      (result) => {
        if (result.ok && result.data.length > 0) {
          onApplied()
          // Nothing left to say: the new art is on screen. Closed by hand meanwhile, stay closed.
          if (open.current) onClose()
        } else if (result.ok) {
          setStep({ kind: 'done', message: t.igdb.artworkNone })
        } else {
          setStep({ kind: 'done', message: errorText(result.error.code) })
        }
      },
      () => setStep({ kind: 'done', message: errorText('network') })
    )
  }

  if (step.kind === 'typing') {
    return (
      <OnScreenKeyboard
        title={t.igdb.searchTitle}
        initialValue={step.term}
        maxLength={200}
        onCancel={onClose}
        onDone={(term) => setStep({ kind: 'searching', term: term.trim() || searchTerm(title) })}
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
        detail: [game.year, game.developer].filter(Boolean).join(' · ') || undefined,
        onConfirm: () => apply(game)
      })),
      {
        id: 'other',
        label: t.igdb.otherName,
        separated: step.games.length > 0,
        onConfirm: () => setStep({ kind: 'typing', term: step.term })
      },
      close
    ]
    message = step.games.length === 0 ? t.igdb.noResults(step.term) : t.igdb.artworkPick
  } else if (step.kind === 'done') {
    message = step.message
  } else if (step.kind === 'searching') {
    message = t.igdb.searching
  } else {
    message = t.igdb.artworkApplying(step.name)
  }

  return (
    <ChoiceDialog
      id="igdb-artwork"
      width="wide"
      title={t.igdb.artworkTitle}
      items={items}
      onClose={onClose}
      footer={
        <p className="dialog__message" role={step.kind === 'done' ? 'alert' : undefined}>
          {message}
        </p>
      }
    />
  )
}
