import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ManualGameForm, OriginInfo, PickKind } from '../../../shared/ipc/contract'
import {
  ROM_PLACEHOLDER,
  applyRomToArguments,
  formatArguments,
  isoToDisplayDate,
  parseArguments
} from '../../../shared/text-format'
import { currentSection, useNavigation } from '../app/navigation'
import { Artwork } from '../components/Artwork'
import { Button } from '../components/Button'
import { ChoiceDialog, ConfirmDialog, type ChoiceItem } from '../components/Dialog'
import { DatePickerDialog } from '../components/DatePickerDialog'
import { FileBrowserDialog } from '../components/FileBrowserDialog'
import { Footer, type Hint } from '../components/Footer'
import { FormRow } from '../components/FormRow'
import { OnScreenKeyboard, type KeyboardMode } from '../components/OnScreenKeyboard'
import { OriginsDialog } from '../components/OriginsDialog'
import { StateMessage } from '../components/StateMessage'
import { TopBar } from '../components/TopBar'
import { useGames } from '../data/games'
import { useScreenActions } from '../focus/focus-context'
import { FocusScope } from '../focus/FocusProvider'
import { errorMessage, t } from '../strings'
import './GameFormScreen.css'

interface FormState {
  title: string
  description: string
  developer: string
  releaseDate: string | null
  /** Digits only; minutes played elsewhere. */
  playtime: string
  origin: string
  rom: string | null
  executablePath: string
  argumentsText: string
  workingDirectory: string | null
  requiredAge: string | null
  backgroundPath: string | null
}

type TextField = 'title' | 'description' | 'developer' | 'playtime' | 'argumentsText'
type FileField = 'rom' | 'executablePath' | 'workingDirectory' | 'backgroundPath'

type Overlay =
  | { kind: 'text'; field: TextField }
  | { kind: 'date' }
  | { kind: 'origin' }
  | { kind: 'age' }
  | { kind: 'file'; field: FileField }
  | { kind: 'origins' }
  | { kind: 'discard' }

const EMPTY: FormState = {
  title: '',
  description: '',
  developer: '',
  releaseDate: null,
  playtime: '',
  origin: 'manual',
  rom: null,
  executablePath: '',
  argumentsText: '',
  workingDirectory: null,
  requiredAge: null,
  backgroundPath: null
}

const AGES = ['L', '10', '12', '14', '16', '18'] as const
const ageLabel = (age: string | null): string =>
  age === null ? t.form.ages.none : age === 'L' ? t.form.ages.L : t.form.ages.age(age)

const TEXT_FIELDS: Record<
  TextField,
  { label: string; placeholder: string; mode: KeyboardMode; max: number }
> = {
  title: {
    label: t.form.fields.title,
    placeholder: t.form.placeholders.title,
    mode: 'text',
    max: 200
  },
  description: {
    label: t.form.fields.description,
    placeholder: t.form.placeholders.description,
    mode: 'text',
    max: 4000
  },
  developer: {
    label: t.form.fields.developer,
    placeholder: t.form.placeholders.developer,
    mode: 'text',
    max: 200
  },
  playtime: {
    label: t.form.fields.playtime,
    placeholder: t.form.placeholders.playtime,
    mode: 'number',
    max: 7
  },
  argumentsText: {
    label: t.form.fields.arguments,
    placeholder: t.form.placeholders.arguments,
    mode: 'symbols',
    max: 4000
  }
}

const PICK_KIND: Record<FileField, PickKind> = {
  rom: 'rom',
  executablePath: 'executable',
  workingDirectory: 'directory',
  backgroundPath: 'image'
}

/** Main reports errors by ManualGameForm field; this maps them to rows. */
const ERROR_ROW: Record<string, keyof FormState> = {
  title: 'title',
  description: 'description',
  developer: 'developer',
  releaseDate: 'releaseDate',
  playtimeOffset: 'playtime',
  origin: 'origin',
  requiredAge: 'requiredAge',
  executablePath: 'executablePath',
  arguments: 'argumentsText',
  workingDirectory: 'workingDirectory',
  backgroundPath: 'backgroundPath'
}

const fileName = (path: string | null): string | null =>
  path ? (path.split(/[\\/]/).pop() ?? path) : null

const HINTS: Hint[] = [
  { button: 'A', label: t.hints.select },
  { button: 'B', label: t.hints.back }
]

/** Add (id null) or edit form for a non-Steam game (mockups "add game"). */
export function GameFormScreen({ id }: { id: number | null }): React.JSX.Element {
  const navigation = useNavigation()
  const { reload: reloadGames } = useGames()
  const [origins, setOrigins] = useState<OriginInfo[] | null>(null)
  // Add form starts empty; the edit form waits for the stored values.
  const [initial, setInitial] = useState<FormState | null>(id === null ? EMPTY : null)
  const [hasBackground, setHasBackground] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [saving, setSaving] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const loadOrigins = useCallback(() => {
    void window.equon.origins.list().then(setOrigins, () => setLoadFailed(true))
  }, [])

  useEffect(() => {
    loadOrigins()
    if (id === null) return
    window.equon.games.getEditable(id).then(
      (game) => {
        if (!game) {
          setLoadFailed(true)
          return
        }
        const state: FormState = {
          title: game.form.title,
          description: game.form.description ?? '',
          developer: game.form.developer ?? '',
          releaseDate: game.form.releaseDate,
          playtime: game.form.playtimeOffset > 0 ? String(game.form.playtimeOffset) : '',
          origin: game.form.origin,
          rom: null,
          executablePath: game.form.executablePath,
          argumentsText: formatArguments(game.form.arguments),
          workingDirectory: game.form.workingDirectory,
          requiredAge: game.form.requiredAge,
          backgroundPath: null
        }
        setInitial(state)
        setForm(state)
        setHasBackground(game.hasBackground)
      },
      () => setLoadFailed(true)
    )
  }, [id, loadOrigins])

  const userOrigins = useMemo(() => (origins ?? []).filter((o) => o.key !== 'steam'), [origins])
  const selectedOrigin = userOrigins.find((o) => o.key === form.origin)
  // New games of an origin with an emulator only need the ROM (§3.10).
  const showRom = id === null && Boolean(selectedOrigin?.defaultExecutablePath)
  const dirty = initial !== null && JSON.stringify(initial) !== JSON.stringify(form)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const chooseOrigin = (origin: OriginInfo): void => {
    setForm((f) => {
      const previous = userOrigins.find((o) => o.key === f.origin)
      const usesPreviousDefaults =
        f.executablePath === '' || f.executablePath === (previous?.defaultExecutablePath ?? '')
      if (id !== null || !usesPreviousDefaults) return { ...f, origin: origin.key }
      return {
        ...f,
        origin: origin.key,
        executablePath: origin.defaultExecutablePath ?? '',
        argumentsText: origin.defaultExecutablePath
          ? formatArguments(origin.defaultArguments ?? [ROM_PLACEHOLDER])
          : ''
      }
    })
    setOverlay(null)
  }

  const leave = (): void => navigation.back()
  const cancel = (): void => (dirty ? setOverlay({ kind: 'discard' }) : leave())

  useScreenActions({ back: cancel })

  const submit = async (): Promise<void> => {
    const local: Partial<Record<keyof FormState, string>> = {}
    if (form.title.trim() === '') local.title = errorMessage('required')
    if (form.executablePath.trim() === '') local.executablePath = errorMessage('required')
    let args = parseArguments(form.argumentsText)
    if (showRom) {
      if (form.rom) args = applyRomToArguments(args, form.rom)
      else local.rom = errorMessage('required')
    }
    if (Object.keys(local).length > 0) {
      setErrors(local)
      return
    }
    const payload: ManualGameForm = {
      title: form.title,
      description: form.description.trim() || null,
      developer: form.developer.trim() || null,
      releaseDate: form.releaseDate,
      requiredAge: form.requiredAge,
      playtimeOffset: form.playtime === '' ? 0 : Number(form.playtime),
      origin: form.origin,
      executablePath: form.executablePath,
      arguments: args,
      workingDirectory: form.workingDirectory,
      backgroundPath: form.backgroundPath
    }
    setSaving(true)
    const result =
      id === null
        ? await window.equon.games.create(payload)
        : await window.equon.games.update(id, payload)
    setSaving(false)
    if (!result.ok) {
      const row = ERROR_ROW[result.error.field ?? ''] ?? 'title'
      setErrors({ [row]: errorMessage(result.error.code) })
      return
    }
    reloadGames()
    navigation.openGame(result.data.id)
  }

  if (loadFailed) {
    return (
      <FormFrame>
        <StateMessage
          tone="error"
          message={t.form.loadError}
          action={{ id: 'form:leave', label: t.hints.back, onConfirm: leave }}
        />
      </FormFrame>
    )
  }
  if (origins === null || initial === null) {
    return (
      <FormFrame>
        <StateMessage message={t.form.loading} />
      </FormFrame>
    )
  }

  const textRow = (
    field: TextField,
    extra: { required?: boolean; multiline?: boolean; autoFocus?: boolean; value?: string } = {}
  ): React.JSX.Element => (
    <FormRow
      id={field}
      label={TEXT_FIELDS[field].label}
      placeholder={TEXT_FIELDS[field].placeholder}
      value={extra.value ?? form[field]}
      required={extra.required}
      multiline={extra.multiline}
      autoFocus={extra.autoFocus}
      error={errors[field]}
      onConfirm={() => setOverlay({ kind: 'text', field })}
    />
  )

  return (
    <FormFrame>
      <div className="game-form">
        <h1 className="game-form__title">{id === null ? t.form.addTitle : t.form.editTitle}</h1>
        <div className="game-form__body">
          <div className="game-form__fields">
            {textRow('title', { required: true, autoFocus: true })}
            {textRow('description', { multiline: true })}
            {textRow('developer')}
            <FormRow
              id="releaseDate"
              label={t.form.fields.releaseDate}
              placeholder={t.form.placeholders.releaseDate}
              value={isoToDisplayDate(form.releaseDate)}
              icon="calendar"
              error={errors.releaseDate}
              onConfirm={() => setOverlay({ kind: 'date' })}
            />
            {textRow('playtime', {
              value: form.playtime === '' ? '' : t.form.minutes(Number(form.playtime))
            })}
            <FormRow
              id="origin"
              label={t.form.fields.origin}
              value={selectedOrigin?.name ?? form.origin}
              icon="chevron"
              error={errors.origin}
              onConfirm={() => setOverlay({ kind: 'origin' })}
            />
            {showRom && (
              <FormRow
                id="rom"
                label={t.form.fields.rom}
                required
                placeholder={t.form.placeholders.rom}
                value={form.rom}
                icon="browse"
                error={errors.rom}
                onConfirm={() => setOverlay({ kind: 'file', field: 'rom' })}
              />
            )}
            <FormRow
              id="executablePath"
              label={t.form.fields.executable}
              required
              placeholder={t.form.placeholders.executable}
              value={form.executablePath}
              icon="browse"
              error={errors.executablePath}
              onConfirm={() => setOverlay({ kind: 'file', field: 'executablePath' })}
            />
            {textRow('argumentsText')}
            <FormRow
              id="workingDirectory"
              label={t.form.fields.workingDirectory}
              placeholder={t.form.placeholders.workingDirectory}
              value={form.workingDirectory}
              icon="browse"
              error={errors.workingDirectory}
              onConfirm={() => setOverlay({ kind: 'file', field: 'workingDirectory' })}
            />
            <FormRow
              id="requiredAge"
              label={t.form.fields.requiredAge}
              value={ageLabel(form.requiredAge)}
              icon="chevron"
              error={errors.requiredAge}
              onConfirm={() => setOverlay({ kind: 'age' })}
            />
          </div>

          <aside className="game-form__image" data-invalid={Boolean(errors.backgroundPath)}>
            {id !== null && hasBackground && !form.backgroundPath ? (
              <Artwork
                gameId={id}
                kind="background"
                available={['background']}
                title={form.title}
                className="game-form__preview"
                loading="eager"
              />
            ) : (
              <svg className="game-form__image-icon" viewBox="0 0 272 232" aria-hidden>
                <rect x="6" y="6" width="260" height="220" rx="30" />
                <circle cx="84" cy="74" r="20" />
                <path d="M30 220 L190 92 L262 150" />
              </svg>
            )}
            <p className="game-form__image-title">{t.form.background.title}</p>
            <p className="game-form__image-subtitle">
              {form.backgroundPath
                ? t.form.background.selected(fileName(form.backgroundPath) ?? '')
                : id !== null && hasBackground
                  ? t.form.background.current
                  : t.form.background.subtitle}
            </p>
            <Button
              id="form:background"
              label={t.form.background.select}
              onConfirm={() => setOverlay({ kind: 'file', field: 'backgroundPath' })}
            >
              {form.backgroundPath || hasBackground
                ? t.form.background.change
                : t.form.background.select}
            </Button>
            {errors.backgroundPath && (
              <p className="form-row__error" role="alert">
                {errors.backgroundPath}
              </p>
            )}
          </aside>
        </div>

        <div className="game-form__actions">
          <Button
            id="form:submit"
            variant="primary"
            label={t.form.submitAdd}
            unavailable={saving}
            onConfirm={() => void submit()}
          >
            {saving ? t.form.saving : id === null ? `+  ${t.form.submitAdd}` : t.form.submitEdit}
          </Button>
          <Button id="form:cancel" label={t.form.cancel} onConfirm={cancel}>
            <span className="hint__face hint__face--b" aria-hidden>
              B
            </span>
            {t.form.cancel}
          </Button>
          {Object.values(errors).some(Boolean) && (
            <p className="game-form__error">{t.form.saveFailed}</p>
          )}
        </div>
      </div>

      {overlay?.kind === 'text' && (
        <OnScreenKeyboard
          title={TEXT_FIELDS[overlay.field].label}
          placeholder={TEXT_FIELDS[overlay.field].placeholder}
          initialValue={form[overlay.field]}
          mode={TEXT_FIELDS[overlay.field].mode}
          maxLength={TEXT_FIELDS[overlay.field].max}
          onCancel={() => setOverlay(null)}
          onDone={(value) => {
            set(overlay.field, value)
            setOverlay(null)
          }}
        />
      )}
      {overlay?.kind === 'date' && (
        <DatePickerDialog
          value={form.releaseDate}
          onCancel={() => setOverlay(null)}
          onDone={(value) => {
            set('releaseDate', value)
            setOverlay(null)
          }}
        />
      )}
      {overlay?.kind === 'origin' && (
        <ChoiceDialog
          id="origin-select"
          title={t.form.fields.origin}
          onClose={() => setOverlay(null)}
          items={[
            ...userOrigins.map<ChoiceItem>((o) => ({
              id: o.key,
              label: o.name,
              selected: o.key === form.origin,
              onConfirm: () => chooseOrigin(o)
            })),
            {
              id: 'manage',
              label: t.form.manageOrigins,
              separated: true,
              onConfirm: () => setOverlay({ kind: 'origins' })
            }
          ]}
        />
      )}
      {overlay?.kind === 'origins' && (
        <OriginsDialog
          origins={origins}
          onChanged={loadOrigins}
          onClose={() => setOverlay({ kind: 'origin' })}
        />
      )}
      {overlay?.kind === 'age' && (
        <ChoiceDialog
          id="age-select"
          title={t.form.fields.requiredAge}
          onClose={() => setOverlay(null)}
          items={[null, ...AGES].map<ChoiceItem>((age) => ({
            id: age ?? 'none',
            label: ageLabel(age),
            selected: age === form.requiredAge,
            onConfirm: () => {
              set('requiredAge', age)
              setOverlay(null)
            }
          }))}
        />
      )}
      {overlay?.kind === 'file' && (
        <FileBrowserDialog
          kind={PICK_KIND[overlay.field]}
          onClose={() => setOverlay(null)}
          onPick={(path) => {
            set(overlay.field, path)
            setOverlay(null)
          }}
        />
      )}
      {overlay?.kind === 'discard' && (
        <ConfirmDialog
          title={t.form.discard.title}
          message={t.form.discard.message}
          confirmLabel={t.form.discard.confirm}
          cancelLabel={t.form.discard.cancel}
          destructive
          onCancel={() => setOverlay(null)}
          onConfirm={leave}
        />
      )}
    </FormFrame>
  )
}

/** Screen chrome shared by the loading, error and ready states. */
function FormFrame({ children }: { children: React.ReactNode }): React.JSX.Element {
  const navigation = useNavigation()
  return (
    <FocusScope id="screen:game-form">
      <div className="screen">
        <TopBar active={currentSection(navigation.route)} />
        <main className="screen__main">{children}</main>
        <Footer hints={HINTS} />
      </div>
    </FocusScope>
  )
}
