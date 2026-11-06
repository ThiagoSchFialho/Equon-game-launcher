import { useCallback, useEffect, useState } from 'react'
import type {
  DuplicateInfo,
  LibraryRefreshInfo,
  SecretKind,
  SettingsInfo,
  SteamSyncInfo,
  SystemInfo
} from '../../../shared/ipc/contract'
import checkIcon from '../assets/icons/check-circle.svg'
import editIcon from '../assets/icons/edit.svg'
import gamepadIcon from '../assets/icons/gamepad.svg'
import infoIcon from '../assets/icons/info.svg'
import steamIcon from '../assets/icons/steam-white.svg'
import syncIcon from '../assets/icons/sync.svg'
import { currentSection, useNavigation } from '../app/navigation'
import { Button } from '../components/Button'
import { ChoiceDialog } from '../components/Dialog'
import { EmulatorsSettings } from '../components/EmulatorsSettings'
import { BackLink } from '../components/BackLink'
import { Footer, type Hint } from '../components/Footer'
import { FormRow } from '../components/FormRow'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { StateMessage } from '../components/StateMessage'
import { useGames } from '../data/games'
import { useFocusable, useScreenActions } from '../focus/focus-context'
import { FocusScope } from '../focus/FocusProvider'
import { errorMessage, t } from '../strings'
import './SettingsScreen.css'

type Tab = 'connections' | 'emulators' | 'about'
type Overlay = { kind: 'steamId' } | { kind: 'secret'; secret: SecretKind; label: string }

const HINTS: Hint[] = [
  { button: 'A', label: t.hints.select },
  { button: 'B', label: t.hints.back }
]

/** Settings (mockup "settings ideas2"): Conexões, Emuladores and Sobre. Keys never come back from main. */
export function SettingsScreen(): React.JSX.Element {
  const navigation = useNavigation()
  const [tab, setTab] = useState<Tab>('connections')
  const [info, setInfo] = useState<SettingsInfo | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [overlay, setOverlay] = useState<Overlay | null>(null)
  const [errors, setErrors] = useState<Partial<Record<'steamId' | SecretKind, string>>>({})

  const load = useCallback(() => {
    window.equon.settings.get().then(
      (data) => {
        setLoadFailed(false)
        setInfo(data)
      },
      () => setLoadFailed(true)
    )
  }, [])
  useEffect(load, [load])

  useScreenActions({ back: () => navigation.back() })

  let content: React.JSX.Element
  if (loadFailed) {
    content = (
      <StateMessage
        tone="error"
        message={t.settings.error}
        action={{ id: 'settings:retry', label: t.library.retry, onConfirm: load }}
      />
    )
  } else if (info === null) {
    content = <StateMessage message={t.settings.loading} />
  } else if (tab === 'connections') {
    content = (
      <Connections
        info={info}
        errors={errors}
        onChanged={setInfo}
        onEdit={setOverlay}
        onError={(field, message) => setErrors((e) => ({ ...e, [field]: message }))}
      />
    )
  } else if (tab === 'emulators') {
    content = <EmulatorsSettings />
  } else {
    content = <About steamPath={info.steamPath} />
  }

  const save = async (
    field: 'steamId' | SecretKind,
    action: Promise<{ ok: true; data: SettingsInfo } | { ok: false; error: { code: string } }>
  ): Promise<void> => {
    setOverlay(null)
    const result = await action
    if (result.ok) {
      setInfo(result.data)
      setErrors((e) => ({ ...e, [field]: undefined }))
    } else {
      setErrors((e) => ({ ...e, [field]: errorMessage(result.error.code) }))
    }
  }

  return (
    <FocusScope id="screen:settings">
      <div className="screen">
        <main className="screen__main settings">
          <div className="settings__side">
            <BackLink
              id="settings:back"
              label={t.nav[currentSection(navigation.route)]}
              manualOnly
            />
            <nav className="settings__tabs" aria-label={t.settings.title}>
              <SettingsTab
                id="connections"
                icon={steamIcon}
                label={t.settings.tabs.connections}
                selected={tab === 'connections'}
                onSelect={setTab}
              />
              <SettingsTab
                id="emulators"
                icon={gamepadIcon}
                label={t.settings.tabs.emulators}
                selected={tab === 'emulators'}
                onSelect={setTab}
              />
              <SettingsTab
                id="about"
                icon={infoIcon}
                label={t.settings.tabs.about}
                selected={tab === 'about'}
                onSelect={setTab}
              />
            </nav>
          </div>
          <section className="settings__content">
            <h1 className="settings__title">{t.settings.tabs[tab]}</h1>
            {content}
          </section>
        </main>
        <Footer hints={HINTS} showActivity />
      </div>

      {overlay?.kind === 'steamId' && (
        <OnScreenKeyboard
          title={t.settings.steamId}
          placeholder={t.settings.steamIdHint}
          initialValue={info?.steamId ?? ''}
          mode="number"
          maxLength={17}
          onCancel={() => setOverlay(null)}
          onDone={(value) => void save('steamId', window.equon.settings.setSteamId(value || null))}
        />
      )}
      {overlay?.kind === 'secret' && (
        <OnScreenKeyboard
          title={overlay.label}
          placeholder={t.settings.keyPlaceholder}
          initialValue=""
          mode="text"
          maxLength={128}
          onCancel={() => setOverlay(null)}
          onDone={(value) => {
            if (value.trim() === '') setOverlay(null)
            else void save(overlay.secret, window.equon.settings.setSecret(overlay.secret, value))
          }}
        />
      )}
    </FocusScope>
  )
}

function SettingsTab({
  id,
  icon,
  label,
  selected,
  onSelect
}: {
  id: Tab
  icon: string
  label: string
  selected: boolean
  onSelect: (tab: Tab) => void
}): React.JSX.Element {
  const { setElement, focused, mouse } = useFocusable<HTMLButtonElement>(`settings:tab:${id}`, {
    onConfirm: () => onSelect(id),
    autoFocus: id === 'connections'
  })
  return (
    <button
      ref={setElement}
      className="settings__tab"
      data-focused={focused}
      data-selected={selected}
      aria-current={selected ? 'page' : undefined}
      tabIndex={-1}
      {...mouse}
    >
      <img src={icon} alt="" />
      <span>{label}</span>
    </button>
  )
}

function Connections({
  info,
  errors,
  onChanged,
  onEdit,
  onError
}: {
  info: SettingsInfo
  errors: Partial<Record<'steamId' | SecretKind, string>>
  onChanged: (info: SettingsInfo) => void
  onEdit: (overlay: Overlay) => void
  onError: (field: SecretKind, message: string) => void
}): React.JSX.Element {
  const [refreshing, setRefreshing] = useState(info.refreshing)
  const [lastRefresh, setLastRefresh] = useState(info.lastRefresh)
  const [duplicates, setDuplicates] = useState<DuplicateInfo[]>([])
  const [reviewing, setReviewing] = useState(false)
  const loadDuplicates = useCallback(() => {
    void window.equon.library.duplicates().then(setDuplicates, () => {})
  }, [])
  useEffect(loadDuplicates, [loadDuplicates])

  const remove = (secret: SecretKind): void => {
    void window.equon.settings.setSecret(secret, null).then((result) => {
      if (result.ok) onChanged(result.data)
      else onError(secret, errorMessage(result.error.code))
    })
  }
  const refresh = (): void => {
    setRefreshing(true)
    void window.equon.library
      .refresh()
      .then(setLastRefresh, () => {})
      .finally(() => {
        setRefreshing(false)
        loadDuplicates()
      })
  }

  return (
    <div className="settings__sections">
      {!info.secretsAvailable && (
        <p className="settings__warning" role="alert">
          {t.settings.secretsUnavailable}
        </p>
      )}

      <h2 className="settings__group">
        <img src={steamIcon} alt="" />
        {t.settings.steam}
      </h2>
      <FormRow
        id="settings-steam-id"
        label={t.settings.steamId}
        placeholder={t.settings.steamIdPlaceholder}
        value={info.steamId}
        error={errors.steamId}
        onConfirm={() => onEdit({ kind: 'steamId' })}
      />
      <SecretRow
        id="steam-key"
        label={t.settings.steamKey}
        configured={info.steamApiKey}
        error={errors['steam-api-key']}
        onEdit={() =>
          onEdit({ kind: 'secret', secret: 'steam-api-key', label: t.settings.steamKey })
        }
        onRemove={() => remove('steam-api-key')}
      />
      <TestButton
        id="settings:test-steam"
        kind="steam"
        ready={info.steamApiKey && info.steamId !== null}
      />
      <p className="settings__sync">{syncText(info.lastSync)}</p>

      <h2 className="settings__group">{t.settings.steamGridDb}</h2>
      <SecretRow
        id="steamgriddb-key"
        label={t.settings.steamGridDbKey}
        configured={info.steamGridDbKey}
        error={errors['steamgriddb-api-key']}
        onEdit={() =>
          onEdit({
            kind: 'secret',
            secret: 'steamgriddb-api-key',
            label: t.settings.steamGridDbKey
          })
        }
        onRemove={() => remove('steamgriddb-api-key')}
      />
      <TestButton id="settings:test-steamgriddb" kind="steamgriddb" ready={info.steamGridDbKey} />

      <h2 className="settings__group">{t.settings.igdb}</h2>
      <SecretRow
        id="igdb-client-id"
        label={t.settings.igdbClientId}
        configured={info.igdbClientId}
        error={errors['igdb-client-id']}
        onEdit={() =>
          onEdit({ kind: 'secret', secret: 'igdb-client-id', label: t.settings.igdbClientId })
        }
        onRemove={() => remove('igdb-client-id')}
      />
      <SecretRow
        id="igdb-client-secret"
        label={t.settings.igdbClientSecret}
        configured={info.igdbClientSecret}
        error={errors['igdb-client-secret']}
        onEdit={() =>
          onEdit({
            kind: 'secret',
            secret: 'igdb-client-secret',
            label: t.settings.igdbClientSecret
          })
        }
        onRemove={() => remove('igdb-client-secret')}
      />
      <TestButton
        id="settings:test-igdb"
        kind="igdb"
        ready={info.igdbClientId && info.igdbClientSecret}
      />

      <div className="settings__library">
        <div>
          <p className="settings__library-title">{t.settings.library}</p>
          <p className="settings__library-status" aria-live="polite">
            {refreshText(lastRefresh)}
          </p>
          {lastRefresh?.ownedError && (
            <p className="settings__library-status" role="alert">
              {ownedErrorText(lastRefresh.ownedError)}
            </p>
          )}
          {duplicates.length > 0 && (
            <p className="settings__library-duplicates">{t.duplicates.notice(duplicates.length)}</p>
          )}
        </div>
        {duplicates.length > 0 && (
          <Button
            id="settings:duplicates"
            label={t.duplicates.review}
            onConfirm={() => setReviewing(true)}
          >
            {t.duplicates.review}
          </Button>
        )}
        <Button
          id="settings:refresh"
          variant="primary"
          label={t.settings.refresh}
          unavailable={refreshing}
          onConfirm={refresh}
        >
          <img src={syncIcon} alt="" />
          {refreshing ? t.settings.refreshing : t.settings.refresh}
        </Button>
      </div>
      {reviewing && duplicates.length > 0 && (
        <DuplicateReview
          duplicate={duplicates[0]}
          onDone={() => {
            loadDuplicates()
            if (duplicates.length <= 1) setReviewing(false)
          }}
          onClose={() => setReviewing(false)}
        />
      )}
    </div>
  )
}

/** One candidate at a time; nothing is merged, the user decides (ARCHITECTURE.md §11). */
function DuplicateReview({
  duplicate,
  onDone,
  onClose
}: {
  duplicate: DuplicateInfo
  onDone: () => void
  onClose: () => void
}): React.JSX.Element {
  const { refresh: refreshGames } = useGames()
  const act = (action: Promise<unknown>): void => {
    void action.finally(() => {
      refreshGames()
      onDone()
    })
  }
  const id = duplicate.manualGameId
  return (
    <ChoiceDialog
      id={`duplicate-${id}`}
      title={t.duplicates.title}
      onClose={onClose}
      footer={
        <p className="dialog__message">
          {t.duplicates.message(duplicate.manualTitle, duplicate.steamTitle)}
        </p>
      }
      items={[
        {
          id: 'keep',
          label: t.duplicates.keep,
          onConfirm: () => act(window.equon.library.dismissDuplicate(id))
        },
        {
          id: 'hide',
          label: t.duplicates.hide,
          onConfirm: () => act(window.equon.games.setFlags(id, { hidden: true }))
        },
        {
          id: 'remove',
          label: t.duplicates.remove,
          tone: 'danger',
          separated: true,
          onConfirm: () => act(window.equon.games.remove(id))
        },
        { id: 'close', label: t.duplicates.close, onConfirm: onClose }
      ]}
    />
  )
}

function refreshText(info: LibraryRefreshInfo | null): string {
  if (info === null) return t.settings.neverRefreshed
  if (info.status === 'failed') {
    return t.settings.refreshFailed[info.reason ?? ''] ?? t.settings.refreshFailedOther
  }
  if (info.status === 'partial') return t.settings.refreshPartial
  return t.settings.refreshResult(clockTime(info.finishedAt), info.added, info.missing)
}

function ownedErrorText(error: string): string {
  if (error === 'not-configured') return t.settings.ownedNotConfigured
  return t.settings.ownedFailed(
    (t.settings.testErrors[error] ?? t.settings.testErrors['invalid-response']).toLowerCase()
  )
}

const clockTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** A stored key: only "configured or not" is shown, never the value (D-04). */
function SecretRow({
  id,
  label,
  configured,
  error,
  onEdit,
  onRemove
}: {
  id: string
  label: string
  configured: boolean
  error?: string
  onEdit: () => void
  onRemove: () => void
}): React.JSX.Element {
  return (
    <div className="settings__secret-wrap">
      <div className="settings__secret">
        <div className="settings__secret-box" data-invalid={Boolean(error)}>
          <span>{label}</span>
          {configured ? (
            <span className="settings__configured">
              <img src={checkIcon} alt="" />
              {t.settings.configured}
            </span>
          ) : (
            <span className="settings__not-configured">{t.settings.notConfigured}</span>
          )}
        </div>
        <Button
          id={`settings:${id}:edit`}
          label={configured ? t.settings.change : t.settings.configure}
          onConfirm={onEdit}
        >
          <img src={editIcon} alt="" />
          {configured ? t.settings.change : t.settings.configure}
        </Button>
        {configured && (
          <Button id={`settings:${id}:remove`} label={t.settings.remove} onConfirm={onRemove}>
            <span className="settings__danger">{t.settings.remove}</span>
          </Button>
        )}
      </div>
      {error && (
        <p className="form-row__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function syncText(sync: SteamSyncInfo | null): string {
  if (sync === null) return t.settings.sync.never
  if (sync.status === 'ok') {
    return t.settings.sync.ok(clockTime(sync.finishedAt), sync.games)
  }
  return t.settings.sync.failed(
    (
      t.settings.testErrors[sync.error ?? ''] ?? t.settings.testErrors['invalid-response']
    ).toLowerCase()
  )
}

/** One live request with the stored credentials; the result stays next to the button. */
function TestButton({
  id,
  kind,
  ready
}: {
  id: string
  kind: 'steam' | 'steamgriddb' | 'igdb'
  ready: boolean
}): React.JSX.Element {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const test = (): void => {
    setTesting(true)
    setResult(null)
    void window.equon.settings
      .testConnection(kind)
      .then((outcome) => {
        if (!outcome.ok) {
          const text =
            t.settings.testErrors[outcome.error.code] ?? t.settings.testErrors['invalid-response']
          setResult({ ok: false, text })
        } else if (kind === 'steamgriddb') {
          setResult({ ok: true, text: t.settings.testOkGrid })
        } else if (kind === 'igdb') {
          setResult({ ok: true, text: t.settings.testOkIgdb })
        } else {
          const name = outcome.data.personaName ?? ''
          setResult(
            outcome.data.gamesVisible
              ? { ok: true, text: t.settings.testOkSteam(name) }
              : { ok: false, text: t.settings.testPrivate(name) }
          )
        }
      })
      .catch(() => setResult({ ok: false, text: t.settings.testErrors.network }))
      .finally(() => setTesting(false))
  }

  const hint = {
    steam: t.settings.testNeedsConfig,
    steamgriddb: t.settings.testNeedsGridKey,
    igdb: t.settings.testNeedsIgdb
  }[kind]
  return (
    <div className="settings__test">
      <Button
        id={id}
        variant="primary"
        label={t.settings.test}
        unavailable={!ready || testing}
        onConfirm={test}
      >
        {testing ? t.settings.testing : t.settings.test}
      </Button>
      <span
        className="settings__test-note"
        data-tone={result ? (result.ok ? 'success' : 'error') : undefined}
        role={result && !result.ok ? 'alert' : undefined}
      >
        {result ? result.text : ready ? '' : hint}
      </span>
    </div>
  )
}

function About({ steamPath }: { steamPath: string | null }): React.JSX.Element {
  const [system, setSystem] = useState<SystemInfo | null>(null)
  useEffect(() => {
    void window.equon.app.getSystemInfo().then(setSystem, () => {})
  }, [])
  if (!system) return <StateMessage message={t.settings.loading} />
  const rows: [string, string][] = [
    [t.settings.about.version, system.appVersion],
    [t.settings.about.os, system.os],
    [t.settings.about.steamPath, steamPath ?? t.settings.about.steamNotFound],
    [t.settings.about.dataPath, system.dataPath],
    [t.settings.about.schema, String(system.schemaVersion)],
    [t.settings.about.electron, system.electron],
    [t.settings.about.chrome, system.chrome],
    [t.settings.about.node, system.node]
  ]
  return (
    <dl className="settings__about">
      {rows.map(([label, value]) => (
        <div key={label} className="settings__about-row">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
