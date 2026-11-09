import { t } from '../strings'
import { ChoiceDialog, ConfirmDialog } from './Dialog'

/**
 * The confirmation to remove a game. A manual game asks yes or no; a Steam game (D-26) offers
 * "Remover" (it comes back on the user's next "Atualizar biblioteca") and "Remover e criar exceção" (it does not).
 * Removal never touches the Steam account or the game files.
 */
export function RemoveGameDialog({
  game,
  onCancel,
  onRemoved,
  onFailed
}: {
  game: { id: number; title: string; origin: string }
  onCancel: () => void
  onRemoved: () => void
  onFailed: () => void
}): React.JSX.Element {
  const run = (removal: Promise<{ ok: boolean }>): void => {
    void removal.then(
      (result) => (result.ok ? onRemoved() : onFailed()),
      () => onFailed()
    )
  }

  if (game.origin !== 'steam') {
    return (
      <ConfirmDialog
        title={t.remove.title(game.title)}
        message={t.remove.message}
        confirmLabel={t.remove.confirm}
        cancelLabel={t.remove.cancel}
        destructive
        onCancel={onCancel}
        onConfirm={() => run(window.equon.games.remove(game.id))}
      />
    )
  }

  const text = t.remove.steam
  return (
    <ChoiceDialog
      id="remove-steam"
      title={t.remove.title(game.title)}
      onClose={onCancel}
      footer={
        <div className="dialog__message">
          <p>{text.message}</p>
          <p>
            <strong>{text.removeLabel}</strong>: {text.removeHint}
          </p>
          <p>
            <strong>{text.ignoreLabel}</strong>: {text.ignoreHint}{' '}
            <strong>{text.ignoreHintStrong}</strong>
          </p>
        </div>
      }
      items={[
        { id: 'cancel', label: t.remove.cancel, onConfirm: onCancel, selected: true },
        {
          id: 'remove',
          label: text.removeLabel,
          onConfirm: () => run(window.equon.games.removeSteam(game.id, false))
        },
        {
          id: 'ignore',
          label: text.ignoreLabel,
          tone: 'danger',
          onConfirm: () => run(window.equon.games.removeSteam(game.id, true))
        }
      ]}
    />
  )
}
