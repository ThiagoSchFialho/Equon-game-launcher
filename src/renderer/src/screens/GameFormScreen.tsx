import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  EmulatorInfo,
  IgdbGameFill,
  ManualGameForm,
  OriginInfo,
  PickKind
} from '../../../shared/ipc/contract'
import { formatArguments, isoToDisplayDate, parseArguments } from '../../../shared/text-format'
import { currentSection, useNavigation } from '../app/navigation'
import { Button } from '../components/Button'
import { ChoiceDialog, ConfirmDialog, type ChoiceItem } from '../components/Dialog'
import { DatePickerDialog } from '../components/DatePickerDialog'
import { FileBrowserDialog } from '../components/FileBrowserDialog'
import { Footer, type Hint } from '../components/Footer'
import { FormRow } from '../components/FormRow'
import { IgdbSearch } from '../components/IgdbSearch'
import { OnScreenKeyboard, type KeyboardMode } from '../components/OnScreenKeyboard'
import { OriginsDialog } from '../components/OriginsDialog'
import { StateMessage } from '../components/StateMessage'
import { TopBar } from '../components/TopBar'
import { useGames } from '../data/games'
import { useFocusManager, useScreenActions } from '../focus/focus-context'
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
  /** ROM of an emulator game; executable fields are unused then. */
  rom: string | null
  executablePath: string
  argumentsText: string
  workingDirectory: string | null
  requiredAge: string | null
}

type TextField = 'title' | 'description' | 'developer' | 'playtime' | 'argumentsText'
type FileField = 'rom' | 'executablePath' | 'workingDirectory'

type Overlay =
  | { kind: 'text'; field: TextField }
  | { kind: 'date' }
  | { kind: 'origin' }
  | { kind: 'age' }
  | { kind: 'file'; field: FileField }
  | { kind: 'origins' }
  | { kind: 'discard' }
  | { kind: 'igdb' }
  | { kind: 'saved-without-igdb'; gameId: number; reason: string }

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
  requiredAge: null
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
  workingDirectory: 'directory'
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
  romPath: 'rom',
  arguments: 'argumentsText',
  workingDirectory: 'workingDirectory'
}

const fileName = (path: string | null): string | null =>
  path ? (path.split(/[\\/]/).pop() ?? path) : null

/** Fills what is empty; a new game also takes the official name (D-18). */
const withIgdbData = (form: FormState, fill: IgdbGameFill, isNew: boolean): FormState => ({
  ...form,
  title: isNew ? fill.name.slice(0, TEXT_FIELDS.title.max) : form.title,
  description:
    form.description.trim() || (fill.summary ?? '').slice(0, TEXT_FIELDS.description.max),
  developer: form.developer.trim() || (fill.developer ?? '').slice(0, TEXT_FIELDS.developer.max),
  releaseDate: form.releaseDate ?? fill.releaseDate,
  requiredAge: form.requiredAge ?? fill.requiredAge
})

const isShortcut = (path: string): boolean => path.trim().toLowerCase().endsWith('.url')

const HINTS: Hint[] = [
  { button: 'A', label: t.hints.select },
  { button: 'B', label: t.hints.back }
]
/** Start saves from anywhere on the form, as in "Editar artes". */
const READY_HINTS: Hint[] = [{ button: 'menu', label: t.form.save }, ...HINTS]

/** Add (id null) or edit form (mockups "add game"); a Steam game edits only its details. */
export function GameFormScreen({ id }: { id: number | null }): React.JSX.Element {
  const navigation = useNavigation()
  const { reload: reloadGames } = useGames()
  const [origins, setOrigins] = useState<OriginInfo[] | null>(null)
  const [emulators, setEmulators] = useState<EmulatorInfo[] | null>(null)
  // Add form starts empty; the edit form waits for the stored values.
  const [initial, setInitial] = useState<FormState | null>(id === null ? EMPTY : null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [saving, setSaving] = useState(false)
  // Adding asks only for what IGDB cannot know; metadata is typed only when editing (D-18).
  const adding = id === null
  const [igdb, setIgdb] = useState<{ id: number; genres: string[] } | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  // After filling from IGDB, saving is the likely next step.
  const focusManager = useFocusManager()
  const landing = useRef<string | null>(null)
  useEffect(() => {
    if (landing.current === null) return
    focusManager.focus(landing.current)
    landing.current = null
  }, [focusManager, overlay])

  const loadOrigins = useCallback(() => {
    void window.equon.origins.list().then(setOrigins, () => setLoadFailed(true))
  }, [])

  useEffect(() => {
    loadOrigins()
    window.equon.emulators.list().then(setEmulators, () => setLoadFailed(true))
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
          rom: game.form.romPath,
          executablePath: game.form.executablePath,
          argumentsText: formatArguments(game.form.arguments),
          workingDirectory: game.form.workingDirectory,
          requiredAge: game.form.requiredAge
        }
        setInitial(state)
        setForm(state)
      },
      () => setLoadFailed(true)
    )
  }, [id, loadOrigins])

  // A Steam game edits only its details (owner decision): no name, launch, playtime or origin.
  const steam = initial?.origin === 'steam'
  const userOrigins = useMemo(() => (origins ?? []).filter((o) => o.key !== 'steam'), [origins])
  const selectedOrigin = userOrigins.find((o) => o.key === form.origin)
  // Emulator games only need the ROM; the emulator and its arguments come from §3.12.
  const emulator = (emulators ?? []).find((e) => e.origin === form.origin) ?? null
  const shortcut = !emulator && isShortcut(form.executablePath)
  const dirty = initial !== null && JSON.stringify(initial) !== JSON.stringify(form)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const chooseOrigin = (origin: OriginInfo): void => {
    set('origin', origin.key)
    setOverlay(null)
  }

  /** Editing: the form takes the data, and the art comes when it is saved. */
  const fillFromIgdb = (igdbGameId: number, fill: IgdbGameFill): void => {
    setForm((f) => withIgdbData(f, fill, false))
    setErrors({})
    setIgdb({ id: igdbGameId, genres: fill.genres })
    landing.current = 'form:submit'
    setOverlay(null)
  }

  /** The add form picks a local game or, for a ROM of a configured emulator, that emulator's. */
  const romEmulator = (emulators ?? []).find((e) => e.executablePath !== null) ?? null
  const chooseGameFile = (path: string): void => {
    const lower = path.trim().toLowerCase()
    const isRom = romEmulator?.romExtensions.some((ext) => lower.endsWith(ext)) ?? false
    setForm((f) => ({
      ...f,
      origin: isRom && romEmulator ? romEmulator.origin : 'manual',
      rom: isRom ? path : null,
      executablePath: isRom ? '' : path
    }))
    setErrors((e) => ({ ...e, rom: undefined, executablePath: undefined }))
    setOverlay(null)
  }

  const leave = (): void => navigation.back()
  const cancel = (): void => (dirty ? setOverlay({ kind: 'discard' }) : leave())

  // Start saves like the button; the dialogs on top keep it for themselves.
  const ready = !loadFailed && origins !== null && emulators !== null && initial !== null
  useScreenActions({
    back: cancel,
    menu: () => {
      if (ready && !saving) submit()
    }
  })

  const emulatorOf = (values: FormState): EmulatorInfo | null =>
    (emulators ?? []).find((e) => e.origin === values.origin) ?? null

  const saveSteam = async (
    gameId: number,
    values: FormState,
    chosen: { id: number; genres: string[] } | null
  ): Promise<number | null> => {
    setSaving(true)
    const result = await window.equon.games.updateSteam(gameId, {
      description: values.description.trim() || null,
      developer: values.developer.trim() || null,
      releaseDate: values.releaseDate,
      requiredAge: values.requiredAge,
      ...(chosen ? { genres: chosen.genres } : {})
    })
    setSaving(false)
    if (!result.ok) {
      const row = ERROR_ROW[result.error.field ?? ''] ?? 'description'
      setErrors({ [row]: errorMessage(result.error.code) })
      return null
    }
    // Its art stays with "Editar artes": IGDB fills only the details here.
    reloadGames()
    return result.data.id
  }

  const save = async (
    values: FormState,
    chosen: { id: number; genres: string[] } | null
  ): Promise<number | null> => {
    if (steam && id !== null) return saveSteam(id, values, chosen)
    const romGame = emulatorOf(values) !== null
    const noExtras = romGame || isShortcut(values.executablePath)
    const payload: ManualGameForm = {
      title: values.title,
      description: values.description.trim() || null,
      developer: values.developer.trim() || null,
      releaseDate: values.releaseDate,
      requiredAge: values.requiredAge,
      playtimeOffset: values.playtime === '' ? 0 : Number(values.playtime),
      origin: values.origin,
      executablePath: romGame ? '' : values.executablePath,
      romPath: romGame ? values.rom : null,
      arguments: noExtras ? [] : parseArguments(values.argumentsText),
      workingDirectory: noExtras ? null : values.workingDirectory,
      ...(chosen ? { genres: chosen.genres } : {})
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
      setOverlay(null)
      return null
    }
    reloadGames()
    // In the background: the game page shows the images as they arrive.
    if (chosen) void window.equon.igdb.applyArtwork(result.data.id, chosen.id).catch(() => {})
    return result.data.id
  }

  const saveAndOpen = async (
    values: FormState,
    chosen: { id: number; genres: string[] } | null
  ): Promise<void> => {
    const saved = await save(values, chosen)
    if (saved !== null) navigation.openGame(saved)
  }

  /** IGDB could not help: the game is kept with what was typed, and the reason is shown. */
  const saveWithoutIgdb = async (reason: string): Promise<void> => {
    const saved = await save(form, null)
    if (saved !== null) setOverlay({ kind: 'saved-without-igdb', gameId: saved, reason })
  }

  const submit = (): void => {
    if (steam) {
      void saveAndOpen(form, igdb)
      return
    }
    const local: Partial<Record<keyof FormState, string>> = {}
    if (form.title.trim() === '') local.title = errorMessage('required')
    if (emulator) {
      if (!form.rom) local.rom = errorMessage('required')
    } else if (form.executablePath.trim() === '') {
      local.executablePath = errorMessage('required')
    }
    if (Object.keys(local).length > 0) {
      setErrors(local)
      return
    }
    // Adding always asks which game it is before saving.
    if (adding) setOverlay({ kind: 'igdb' })
    else void saveAndOpen(form, igdb)
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
  if (origins === null || emulators === null || initial === null) {
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

  const playtimeRow = textRow('playtime', {
    value: form.playtime === '' ? '' : t.form.minutes(Number(form.playtime))
  })

  return (
    <FormFrame hints={READY_HINTS}>
      <div className="game-form">
        <h1 className="game-form__title">
          {id === null ? t.form.addTitle : t.form.editTitle}
          {/* The name is not edited here, so it is shown with the title. */}
          {steam && <span className="game-form__game">{form.title}</span>}
        </h1>
        <div className="game-form__body">
          <div className="game-form__fields">
            {adding ? (
              <>
                {textRow('title', { required: true, autoFocus: true })}
                <FormRow
                  id="executablePath"
                  label={t.form.fields.executable}
                  required
                  placeholder={
                    romEmulator ? t.form.placeholders.game : t.form.placeholders.executable
                  }
                  value={form.rom ?? form.executablePath}
                  icon="browse"
                  error={errors.rom ?? errors.executablePath}
                  onConfirm={() => setOverlay({ kind: 'file', field: 'executablePath' })}
                />
                {emulator && form.rom && (
                  <p className="game-form__note">
                    {t.form.emulatorCommand(fileName(emulator.executablePath) ?? '', form.rom)}
                  </p>
                )}
                {shortcut && <p className="game-form__note">{t.form.shortcutNote}</p>}
                {playtimeRow}
                {!emulator && !shortcut && textRow('argumentsText')}
              </>
            ) : (
              <>
                {!steam && textRow('title', { required: true, autoFocus: true })}
                {steam ? null : emulator ? (
                  <>
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
                    <p
                      className="game-form__note"
                      data-tone={emulator.executablePath ? undefined : 'warning'}
                    >
                      {emulator.executablePath
                        ? t.form.emulatorCommand(
                            fileName(emulator.executablePath) ?? '',
                            form.rom ?? t.form.fields.rom
                          )
                        : t.form.emulatorMissing(emulator.name)}
                    </p>
                  </>
                ) : (
                  <>
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
                    {shortcut ? (
                      <p className="game-form__note">{t.form.shortcutNote}</p>
                    ) : (
                      <>
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
                      </>
                    )}
                  </>
                )}
                {textRow('description', { multiline: true, autoFocus: steam })}
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
                {!steam && playtimeRow}
                {!steam && (
                  <FormRow
                    id="origin"
                    label={t.form.fields.origin}
                    value={selectedOrigin?.name ?? form.origin}
                    icon="chevron"
                    error={errors.origin}
                    onConfirm={() => setOverlay({ kind: 'origin' })}
                  />
                )}
                <FormRow
                  id="requiredAge"
                  label={t.form.fields.requiredAge}
                  value={ageLabel(form.requiredAge)}
                  icon="chevron"
                  error={errors.requiredAge}
                  onConfirm={() => setOverlay({ kind: 'age' })}
                />
              </>
            )}
          </div>
        </div>

        <div className="game-form__actions">
          <Button
            id="form:submit"
            variant="primary"
            label={t.form.submitAdd}
            unavailable={saving}
            onConfirm={submit}
          >
            {saving ? t.form.saving : id === null ? `+  ${t.form.submitAdd}` : t.form.submitEdit}
          </Button>
          {!adding && (
            <Button
              id="form:igdb"
              label={t.form.fillIgdb}
              onConfirm={() => setOverlay({ kind: 'igdb' })}
            >
              {t.form.fillIgdb}
            </Button>
          )}
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

      {overlay?.kind === 'igdb' && (
        <IgdbSearch
          title={form.title}
          onClose={() => setOverlay(null)}
          onPick={
            adding
              ? (igdbGameId, fill) =>
                  void saveAndOpen(withIgdbData(form, fill, true), {
                    id: igdbGameId,
                    genres: fill.genres
                  })
              : fillFromIgdb
          }
          onSkip={adding ? () => void saveAndOpen(form, null) : undefined}
          onFailure={adding ? (reason) => void saveWithoutIgdb(reason) : undefined}
        />
      )}
      {overlay?.kind === 'saved-without-igdb' && (
        <ChoiceDialog
          id="saved-without-igdb"
          title={t.igdb.savedTitle}
          onClose={() => navigation.openGame(overlay.gameId)}
          items={[
            {
              id: 'ok',
              label: t.igdb.savedConfirm,
              onConfirm: () => navigation.openGame(overlay.gameId)
            }
          ]}
          footer={
            <p className="dialog__message" role="alert">
              {t.igdb.savedMessage(overlay.reason)}
            </p>
          }
        />
      )}
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
          kind={
            adding && overlay.field === 'executablePath' && romEmulator
              ? 'game'
              : PICK_KIND[overlay.field]
          }
          onClose={() => setOverlay(null)}
          onPick={(path) => {
            if (adding && overlay.field === 'executablePath') {
              chooseGameFile(path)
              return
            }
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
function FormFrame({
  children,
  hints = HINTS
}: {
  children: React.ReactNode
  hints?: Hint[]
}): React.JSX.Element {
  const navigation = useNavigation()
  return (
    <FocusScope id="screen:game-form">
      <div className="screen">
        <TopBar active={currentSection(navigation.route)} />
        <main className="screen__main">{children}</main>
        <Footer hints={hints} />
      </div>
    </FocusScope>
  )
}
