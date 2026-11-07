import { artworkUrl } from '../../shared/ipc/contract'
import { t } from './strings'
import './cover.css'

/** The page of the cover window has only this: no React, no preload, no access to anything. */
export const COVER_HASH = '#cover'

export function isCoverPage(hash: string): boolean {
  return hash === COVER_HASH || hash.startsWith(`${COVER_HASH}?`)
}

/** "Carregando" and three dots that light up one at a time (owner decision): bottom right. */
function loading(): HTMLElement {
  const text = document.createElement('p')
  text.className = 'cover__loading'
  text.setAttribute('role', 'status')
  text.append(t.cover.loading)
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('span')
    dot.className = 'cover__dot'
    dot.setAttribute('aria-hidden', 'true')
    dot.textContent = '.'
    text.append(dot)
  }
  return text
}

/**
 * What the cover shows: the launch image, or else the background, or else the logo, or else the
 * title (owner decision), always with "Carregando..." in the corner.
 */
export function renderCover(root: HTMLElement, hash: string): void {
  const query = new URLSearchParams(hash.slice(COVER_HASH.length + 1))
  const gameId = Number(query.get('game'))
  const given = query.get('art')
  const fills = given === 'launch' || given === 'background'
  const art = fills || given === 'logo' ? given : null
  document.documentElement.style.cssText = 'height: 100%; background: var(--color-background)'
  document.body.style.cssText =
    'height: 100%; margin: 0; overflow: hidden; background: var(--color-background); cursor: none'
  root.style.cssText = 'position: fixed; inset: 0; display: grid; place-items: center'

  if (Number.isInteger(gameId) && gameId > 0 && art !== null) {
    const image = document.createElement('img')
    image.src = artworkUrl(gameId, art, query.get('version'))
    image.alt = ''
    image.style.cssText = fills
      ? 'width: 100%; height: 100%; object-fit: cover'
      : 'max-width: 40%; max-height: 40%; object-fit: contain'
    root.replaceChildren(image, loading())
    return
  }
  const title = document.createElement('p')
  title.textContent = query.get('title') ?? ''
  title.style.cssText =
    'margin: 0; color: var(--color-text-primary); font-size: var(--font-size-display); font-weight: var(--font-weight-bold)'
  root.replaceChildren(title, loading())
}
