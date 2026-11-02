import trophyIcon from '../assets/icons/trophy.svg'
import { useNavigation } from '../app/navigation'
import { Footer, type Hint } from '../components/Footer'
import { StateMessage } from '../components/StateMessage'
import { TopBar } from '../components/TopBar'
import { useScreenActions } from '../focus/focus-context'
import { FocusScope } from '../focus/FocusProvider'
import { t } from '../strings'

const HINTS: Hint[] = [{ button: 'LB/RB', label: t.hints.navigate }]

/** Placeholder until the achievements area (Phase 7). */
export function AchievementsScreen(): React.JSX.Element {
  const navigation = useNavigation()
  useScreenActions({
    previousSection: () => navigation.stepSection(-1),
    nextSection: () => navigation.stepSection(1)
  })
  return (
    <FocusScope id="screen:achievements">
      <div className="screen">
        <TopBar active="achievements" />
        <main className="screen__main">
          <StateMessage icon={trophyIcon} message={t.achievements.soon} />
        </main>
        <Footer hints={HINTS} />
      </div>
    </FocusScope>
  )
}
