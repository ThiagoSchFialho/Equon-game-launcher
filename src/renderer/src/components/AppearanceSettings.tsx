import { useState } from 'react'
import {
  HOME_ART_BLUR_MAX,
  HOME_ART_DIM_MAX,
  HOME_ART_DIM_STEP,
  HOME_COVER_MAX,
  HOME_COVER_MIN,
  HOME_COVER_POSITIONS,
  type HomeArtSettings,
  type HomeCoverSettings,
  type SettingsInfo
} from '../../../shared/ipc/contract'
import { RECOMMENDED_APPEARANCE } from '../data/appearance-defaults'
import { useHomeArt } from '../data/home-art'
import { useHomeCovers } from '../data/home-covers'
import { errorMessage, t } from '../strings'
import { Checkbox } from './Checkbox'
import { LevelRow } from './LevelRow'
import { OptionRow } from './OptionRow'

/**
 * Settings › Aparência: the focused game's art behind the Home screen, and how blurred and
 * darkened it is (D-25); then "Capas da home", the size, spacing and position of the Home
 * covers (D-27). Each change is saved at once and the Home screen follows it.
 */
export function AppearanceSettings({
  info,
  onChanged
}: {
  info: SettingsInfo
  onChanged: (info: SettingsInfo) => void
}): React.JSX.Element {
  const homeArt = useHomeArt()
  const homeCovers = useHomeCovers()
  const [error, setError] = useState<string | null>(null)
  const [coversError, setCoversError] = useState<string | null>(null)
  const art = info.homeArt
  const covers = info.homeCovers
  // The recommended values follow the chosen position: each layout looks best with its own.
  const recommended = RECOMMENDED_APPEARANCE[covers.position]
  const hint = t.settings.appearance.recommended

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

  // The same for the covers: shown at once, undone if not saved.
  const saveCovers = (changes: Partial<HomeCoverSettings>): void => {
    const before = info
    const shown = { ...info, homeCovers: { ...covers, ...changes } }
    homeCovers.set(shown.homeCovers)
    onChanged(shown)
    const undo = (message: string): void => {
      setCoversError(message)
      homeCovers.set(before.homeCovers)
      onChanged(before)
    }
    window.equon.settings.setHomeCovers(changes).then(
      (result) => {
        if (result.ok) setCoversError(null)
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
          hint={hint(String(recommended.blur))}
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
          hint={hint(`${recommended.dim}%`)}
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

      <h2 className="settings__group">{t.settings.appearance.covers}</h2>
      <div className="settings__system">
        <LevelRow
          id="settings:home-cover-size"
          label={t.settings.appearance.coverSize}
          hint={hint(String(recommended.size))}
          valueText={String(covers.size)}
          value={covers.size}
          min={HOME_COVER_MIN}
          max={HOME_COVER_MAX}
          onChange={(size) => saveCovers({ size })}
        />
        <LevelRow
          id="settings:home-cover-gap"
          label={t.settings.appearance.coverGap}
          hint={hint(String(recommended.gap))}
          valueText={String(covers.gap)}
          value={covers.gap}
          min={HOME_COVER_MIN}
          max={HOME_COVER_MAX}
          onChange={(gap) => saveCovers({ gap })}
        />
        <OptionRow
          id="settings:home-cover-position"
          label={t.settings.appearance.coverPosition}
          value={covers.position}
          options={HOME_COVER_POSITIONS.map((position) => ({
            value: position,
            label: t.settings.appearance.coverPositions[position]
          }))}
          onChange={(position) => saveCovers({ position })}
        />
        {coversError && (
          <p className="form-row__error" role="alert">
            {coversError}
          </p>
        )}
      </div>
    </div>
  )
}
