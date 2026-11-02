/** Emulators the launcher supports (DATA_BASE_CONTEXT.md §3.12). */
export const EMULATOR_KEYS = ['yuzu'] as const
export type EmulatorKey = (typeof EMULATOR_KEYS)[number]

export interface EmulatorDefinition {
  key: EmulatorKey
  name: string
  /** Origin of the games this emulator runs. */
  origin: string
  /** Lower-case ROM extensions, with the dot. */
  romExtensions: readonly string[]
  /** Arguments that open a ROM directly. */
  argumentsFor(romPath: string): string[]
}

export const EMULATORS: Record<EmulatorKey, EmulatorDefinition> = {
  yuzu: {
    key: 'yuzu',
    name: 'Yuzu',
    origin: 'yuzu',
    romExtensions: ['.nsp', '.xci', '.nca', '.nro', '.nso'],
    // -f fullscreen, -g game path.
    argumentsFor: (romPath) => ['-f', '-g', romPath]
  }
}

/** The configured executable of a supported emulator. */
export interface EmulatorConfig {
  key: EmulatorKey
  executablePath: string
}

export function emulatorForOrigin(origin: string): EmulatorDefinition | null {
  return Object.values(EMULATORS).find((e) => e.origin === origin) ?? null
}

export function isRomFor(emulator: EmulatorDefinition, path: string): boolean {
  const lower = path.trim().toLowerCase()
  return emulator.romExtensions.some((ext) => lower.endsWith(ext))
}
