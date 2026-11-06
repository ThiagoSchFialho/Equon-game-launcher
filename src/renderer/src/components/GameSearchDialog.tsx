import { useEffect, useState } from 'react'
import type { Result } from '../../../shared/ipc/contract'
import { useFocusManager } from '../focus/focus-context'
import { t } from '../strings'
import { ChoiceDialog, type ChoiceItem } from './Dialog'
import { OnScreenKeyboard } from './OnScreenKeyboard'

export interface SearchedGame {
  id: number
  name: string
  /** Tells apart games with the same name. */
  detail?: string
}

type Step =
  | { kind: 'searching'; term: string }
  | { kind: 'results'; term: string; games: SearchedGame[] }
  | { kind: 'typing'; term: string }
  | { kind: 'failed'; message: string }

/** Steam titles carry these marks; the sources' names do not, and they get in the way. */
const cleanTerm = (title: string): string => title.replace(/[™®©]/g, '').trim() || title

/** Asks which game it is on an art source: search by title, the user confirms. */
export function GameSearchDialog({
  id,
  title,
  searchTitle,
  term,
  errors,
  search,
  onPick,
  onClose
}: {
  id: string
  title: string
  /** Title of the keyboard for another name. */
  searchTitle: string
  term: string
  errors: Record<string, string>
  search: (term: string) => Promise<Result<SearchedGame[]>>
  onPick: (gameId: number) => void
  onClose: () => void
}): React.JSX.Element {
  const [step, setStep] = useState<Step>({ kind: 'searching', term: cleanTerm(term) })
  const searchingTerm = step.kind === 'searching' ? step.term : null

  // "Fechar" is the only row while searching, so focus would stay on it: move to the results.
  const focus = useFocusManager()
  const firstRow = step.kind === 'results' ? (step.games[0]?.id ?? 'other') : null
  useEffect(() => {
    if (firstRow !== null) focus.focus(`choice:${id}:${firstRow}`)
  }, [focus, firstRow, id])

  useEffect(() => {
    if (searchingTerm === null) return
    let cancelled = false
    void search(searchingTerm).then(
      (result) => {
        if (cancelled) return
        if (result.ok) setStep({ kind: 'results', term: searchingTerm, games: result.data })
        else setStep({ kind: 'failed', message: errors[result.error.code] ?? errors.network })
      },
      () => !cancelled && setStep({ kind: 'failed', message: errors.network })
    )
    return () => {
      cancelled = true
    }
    // `search` and `errors` are new objects at each render of the screen; the term decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchingTerm])

  if (step.kind === 'typing') {
    return (
      <OnScreenKeyboard
        title={searchTitle}
        initialValue={step.term}
        maxLength={200}
        onCancel={onClose}
        onDone={(typed) => setStep({ kind: 'searching', term: typed.trim() || cleanTerm(term) })}
      />
    )
  }

  const close: ChoiceItem = {
    id: 'close',
    label: t.artEditor.close,
    compact: true,
    onConfirm: onClose
  }
  let items: ChoiceItem[] = [close]
  let message = t.artEditor.searching
  if (step.kind === 'results') {
    items = [
      ...step.games.map<ChoiceItem>((game) => ({
        id: String(game.id),
        label: game.name,
        detail: game.detail,
        onConfirm: () => onPick(game.id)
      })),
      {
        id: 'other',
        label: t.artEditor.otherName,
        separated: step.games.length > 0,
        onConfirm: () => setStep({ kind: 'typing', term: step.term })
      },
      close
    ]
    message = step.games.length === 0 ? t.artEditor.noResults(step.term) : t.artEditor.pickGame
  } else if (step.kind === 'failed') {
    message = step.message
  }

  return (
    <ChoiceDialog
      id={id}
      width="wide"
      title={title}
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
