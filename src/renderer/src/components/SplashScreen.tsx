import icon from '../assets/equon-icon.png'
import type { SplashState } from '../data/splash'
import { t } from '../strings'
import './SplashScreen.css'

/**
 * The opening screen (D-35): the app's icon with its name under it, over everything, while the
 * Home below gets its settings, games and the startup Steam refresh. Nothing in it is focusable.
 */
export function SplashScreen({ state }: { state: SplashState }): React.JSX.Element | null {
  if (state === 'gone') return null
  return (
    <div
      className="splash"
      data-leaving={state === 'leaving'}
      role="status"
      aria-label={t.splash.loading}
    >
      <img className="splash__icon" src={icon} alt="" />
      <p className="splash__name">{t.splash.name}</p>
      <span className="splash__dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  )
}
