import { useState } from 'react'
import {
  HOME_ART_BLUR_MAX,
  HOME_ART_DIM_MAX,
  HOME_ART_DIM_STEP,
  type HomeArtSettings,
  type SettingsInfo
} from '../../../shared/ipc/contract'
import { useHomeArt } from '../data/home-art'
import { errorMessage, t } from '../strings'
import { Checkbox } from './Checkbox'
import { LevelRow } from './LevelRow'

/**
 * Settings › Aparência (D-25): the focused game's art behind the Home screen, and how blurred
 * and darkened it is. Each change is saved at once and the Home screen follows it.
 */
export function AppearanceSettings({
  info,
  onChanged
}: {
  info: SettingsInfo
  onChanged: (info: SettingsInfo) => void
}): React.JSX.Element {
  const homeArt = useHomeArt()
  const [error, setError] = useState<string | null>(null)
  const art = info.homeArt

  // Shown at once, so a held direction steps from the value on screen; undone if not saved.
  const save = (changes: Partial<HomeArtSettings>): void => {
    const before = info
    const shown = { ...info, homeArt: { ...art, ...changes } }
    homeArt.set(shown.homeArt)
    onChanged(shown)
    const undo = (message: string): void => {
      setError(message)
      homeArt.set(before.homeArt)
      onChanged(before)
    }
    window.equon.settings.setHomeArt(changes).then(
      (result) => {
        if (result.ok) setError(null)
        else undo(errorMessage(result.error.code))
      },
      () => undo(t.settings.system.saveFailed)
    )
  }

  return (
    <div className="settings__sections">
      <div className="settings__system">
        <Checkbox
          id="settings:home-art"
          label={t.settings.appearance.homeArt}
          description={t.settings.appearance.homeArtHint}
          checked={art.enabled}
          onChange={(enabled) => save({ enabled })}
        />
        <LevelRow
          id="settings:home-art-blur"
          label={t.settings.appearance.blur}
          valueText={String(art.blur)}
          value={art.blur}
          min={0}
          max={HOME_ART_BLUR_MAX}
          unavailable={!art.enabled}
          onChange={(blur) => save({ blur })}
        />
        <LevelRow
          id="settings:home-art-dim"
          label={t.settings.appearance.dim}
          valueText={`${art.dim}%`}
          value={art.dim}
          min={0}
          max={HOME_ART_DIM_MAX}
          step={HOME_ART_DIM_STEP}
          unavailable={!art.enabled}
          onChange={(dim) => save({ dim })}
        />
        {error && (
          <p className="form-row__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
