// Development-only sample library (`npm run dev:seed`). Never bundled in
// production builds (main imports it behind `import.meta.env.DEV`).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ArtworkKind } from '../../../core/domain'
import { tierFromGlobalPercent, toUtcIso } from '../../../core/domain'
import type { SqliteDatabase } from '../database'
import { createAchievementRepository } from '../repositories/achievement-repository'
import { createArtworkRepository } from '../repositories/artwork-repository'
import { createGameRepository } from '../repositories/game-repository'
import { createGenreRepository } from '../repositories/genre-repository'
import { createOriginRepository } from '../repositories/origin-repository'
import { createUserRepository } from '../repositories/user-repository'
import { encodePng, hsl } from './png'

const TITLES = [
  'Starfall Odyssey',
  'Ember Knights',
  'Neon Drift 2088',
  'The Hollow Crown',
  'Tidebound',
  'Circuit Breakers',
  'Ashes of Valor',
  'Quiet Orchard',
  'Skyward Relay',
  'Iron Lantern',
  'Moonlit Express',
  'Glass Garden',
  'Rogue Meridian',
  'Pixel Pilgrim',
  'Frostline Rally',
  'Echoes of Kaldra',
  'Paper Planets',
  'Deep Signal',
  'Crimson Harbor',
  'Wanderlight',
  'Gearwork City',
  'Saltmarsh Mysteries',
  'Velvet Thunder',
  'Last Orbit',
  'Copper Canyon',
  'Shadow Lexicon',
  'Bloom & Bramble',
  'Arcade Afterlife',
  'Northwind Saga',
  'Static Bloom',
  'Kingdom of Tiles',
  'Lumen Drive',
  'Obsidian Gate',
  'Harbor Lights',
  'Zero Gravity Golf',
  'Dune Runner',
  'Mire of Whispers',
  'Solar Sprint',
  'Velocity Kids',
  'Ancient Ember'
]

const ORIGINS = ['steam', 'steam', 'steam', 'manual', 'yuzu', 'ps2', 'nintendo-64']
const GENRES = ['Ação', 'Aventura', 'RPG', 'Estratégia', 'Corrida', 'Indie', 'Puzzle', 'FPS']
const AGES = [null, '0', 'L', '10', '12', '14', '16', '18', '17']
const SIZES: Record<ArtworkKind, [number, number]> = {
  cover_square: [600, 600],
  cover_portrait: [600, 900],
  logo: [800, 300],
  background: [1920, 1080],
  header: [460, 215]
}

function artwork(kind: ArtworkKind, hue: number): Buffer {
  const [w, h] = SIZES[kind]
  if (kind === 'logo') {
    // Rounded bar on a transparent background.
    const [r, g, b] = hsl(hue, 0.7, 0.75)
    return encodePng(w, h, (x, y) => {
      const dx = Math.max(0, Math.abs(x - w / 2) - (w / 2 - 120))
      const dy = Math.max(0, Math.abs(y - h / 2) - (h / 2 - 120))
      return Math.hypot(dx, dy) < 60 ? [r, g, b, 255] : [0, 0, 0, 0]
    })
  }
  // Diagonal gradient from a 256-step palette (computing HSL per pixel is slow).
  const palette = Array.from({ length: 256 }, (_, n): [number, number, number, number] => {
    const t = n / 255
    return [...hsl((hue + t * 60) % 360, 0.55, 0.25 + 0.3 * (1 - t)), 255]
  })
  return encodePng(w, h, (x, y) => palette[Math.round(((x / w + y / h) / 2) * 255)])
}

function daysAgo(days: number, hour = 20): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  d.setUTCHours(hour, 0, 0, 0)
  return toUtcIso(d)
}

/** Replaces the dev library with sample games. Refuses to run outside a "-dev" data folder. */
export function seedDevData(db: SqliteDatabase, userDataDir: string, cacheDir: string): void {
  if (!/-dev[\\/]?$/.test(userDataDir)) {
    throw new Error(`Refusing to seed a non-dev data folder: ${userDataDir}`)
  }
  rmSync(cacheDir, { recursive: true, force: true })
  mkdirSync(cacheDir, { recursive: true })

  const games = createGameRepository(db)
  const origins = createOriginRepository(db)
  const art = createArtworkRepository(db)
  const genres = createGenreRepository(db)
  const achievements = createAchievementRepository(db)
  const users = createUserRepository(db)
  const addSession = db.prepare(
    "INSERT INTO play_sessions (game_id, started_at, last_seen_at, ended_at, duration_seconds, status) VALUES (?, ?, ?, ?, ?, 'completed')"
  )

  db.transaction(() => {
    db.exec('DELETE FROM games; DELETE FROM origins WHERE builtin = 0;')
    origins.create('Nintendo 64')

    TITLES.forEach((title, i) => {
      const origin = ORIGINS[i % ORIGINS.length]
      const base = {
        title,
        description:
          i % 5 === 4
            ? null
            : `${title} é um jogo fictício gerado para testar a interface do Equon. Explore, colecione e avance pelos capítulos.`,
        developer: i % 6 === 5 ? null : `Estúdio ${String.fromCharCode(65 + (i % 26))}`,
        releaseDate: `${2000 + (i % 25)}-0${(i % 9) + 1}-15`,
        requiredAge: AGES[i % AGES.length]
      }
      const game =
        origin === 'steam'
          ? games.upsertSteamGame({ steamAppId: 900000 + i, ...base })
          : games.create({ origin, installed: i % 4 === 0 ? null : true, ...base })

      // Recently played games, newest first, so Home has a "continue playing" row.
      if (i < 14) {
        const seconds = 600 + ((i * 7919) % 90000)
        const ended = daysAgo(i, 22)
        addSession.run(game.id, daysAgo(i, 20), ended, ended, seconds)
        games.recomputePlayStats(game.id)
      }
      if (i % 9 === 8) games.setFlags(game.id, { hidden: true })
      if (i % 7 === 3) games.setFlags(game.id, { beated: true })

      genres.setGameGenres(game.id, [
        GENRES[i % GENRES.length],
        GENRES[(i * 3 + 1) % GENRES.length]
      ])

      if (i % 3 === 0) {
        const total = 8 + (i % 20)
        const unlocked = i % 6 === 0 ? total : Math.floor(total / 3)
        achievements.upsertForGame(
          game.id,
          Array.from({ length: total }, (_, n) => {
            const percent = n % 5 === 4 ? null : Math.round(((n * 37) % 100) * 10) / 10
            return {
              apiName: `ACH_${n}`,
              displayName: `Conquista ${n + 1}`,
              description: `Descrição da conquista ${n + 1}.`,
              icon: null,
              unlocked: n < unlocked,
              unlockedAt: n < unlocked ? daysAgo(n + 1) : null,
              globalPercent: percent,
              tier: tierFromGlobalPercent(percent)
            }
          })
        )
      }

      // Every 6th game has no artwork at all, others miss some kinds, to exercise placeholders.
      if (i % 6 === 2) return
      const hue = (i * 47) % 360
      const kinds: ArtworkKind[] =
        i % 4 === 1
          ? ['cover_square', 'cover_portrait']
          : ['cover_square', 'cover_portrait', 'logo', 'background', 'header']
      for (const kind of kinds) {
        const localPath = `${game.id}/${kind}.png`
        mkdirSync(join(cacheDir, String(game.id)), { recursive: true })
        writeFileSync(join(cacheDir, localPath), artwork(kind, hue))
        const [width, height] = SIZES[kind]
        art.save({
          gameId: game.id,
          kind,
          localPath,
          source: 'user',
          sourceUrl: null,
          width,
          height,
          userSelected: false,
          fetchedAt: toUtcIso(new Date())
        })
      }
    })

    users.recomputeTrophyCounters()
  })()
}
