import { useState } from 'react'
import type { Result, SettingsInfo } from '../../../shared/ipc/contract'
import { errorMessage, t } from '../strings'
import { Checkbox } from './Checkbox'

type Option = 'startFullscreen' | 'openAtLogin'

/** Settings › Sistema (D-20): each checkbox is saved as soon as it changes. */
export function SystemSettings({
  info,
  onChanged
}: {
  info: SettingsInfo
  onChanged: (info: SettingsInfo) => void
}): React.JSX.Element {
  const [errors, setErrors] = useState<Partial<Record<Option, string>>>({})

  const apply = (option: Option, action: Promise<Result<SettingsInfo>>): void => {
    const fail = (message: string): void => setErrors((e) => ({ ...e, [option]: message }))
    action.then(
      (result) => {
        if (!result.ok) {
          fail(errorMessage(result.error.code))
          return
        }
        setErrors((e) => ({ ...e, [option]: undefined }))
        onChanged(result.data)
      },
      () => fail(t.settings.system.saveFailed)
    )
  }

  return (
    <div className="settings__sections">
      <div className="settings__system">
        <Checkbox
          id="settings:start-fullscreen"
          label={t.settings.system.startFullscreen}
          description={t.settings.system.startFullscreenHint}
          checked={info.startFullscreen}
          onChange={(checked) =>
            apply('startFullscreen', window.equon.settings.setStartFullscreen(checked))
          }
        />
        {errors.startFullscreen && (
          <p className="form-row__error" role="alert">
            {errors.startFullscreen}
          </p>
        )}
        <Checkbox
          id="settings:open-at-login"
          label={t.settings.system.openAtLogin}
          description={
            info.openAtLoginAvailable
              ? t.settings.system.openAtLoginHint
              : t.settings.system.openAtLoginUnavailable
          }
          checked={info.openAtLogin}
          unavailable={!info.openAtLoginAvailable}
          onChange={(checked) =>
            apply('openAtLogin', window.equon.settings.setOpenAtLogin(checked))
          }
        />
        {errors.openAtLogin && (
          <p className="form-row__error" role="alert">
            {errors.openAtLogin}
          </p>
        )}
      </div>
    </div>
  )
}
