import backIcon from '../assets/icons/game-page-back.svg'
import { useNavigation } from '../app/navigation'
import { useFocusable } from '../focus/focus-context'
import './BackLink.css'

/** "← Biblioteca": the way back for a mouse, and reachable by controller too. */
export function BackLink({
  id,
  label,
  manualOnly = false
}: {
  id: string
  /** Where it goes back to. */
  label: string
  /** Screens that start with focus elsewhere: reached by moving up to it. */
  manualOnly?: boolean
}): React.JSX.Element {
  const navigation = useNavigation()
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(id, {
    manualOnly,
    onConfirm: navigation.back
  })
  return (
    <button ref={setElement} className="back-link" data-focused={focused} tabIndex={-1} {...mouse}>
      <img src={backIcon} alt="" />
      <span>{label}</span>
    </button>
  )
}
