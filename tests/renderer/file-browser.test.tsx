// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileBrowserDialog } from '../../src/renderer/src/components/FileBrowserDialog'
import { FocusProvider } from '../../src/renderer/src/focus/FocusProvider'
import { FocusManager } from '../../src/renderer/src/focus/focus-manager'
import type { EquonApi, PickKind } from '../../src/shared/ipc/contract'
import { installFakeApi } from './fake-api'

afterEach(cleanup)

// The paths are only text to the renderer: forward slashes keep the test simple.
const listing: Awaited<ReturnType<EquonApi['files']['list']>> = {
  ok: true,
  data: {
    path: 'C:/Imgs',
    parent: 'C:/',
    entries: [
      { name: 'Old', path: 'C:/Imgs/Old', type: 'directory' },
      { name: 'cover.png', path: 'C:/Imgs/cover.png', type: 'file' },
      { name: 'broken.jpg', path: 'C:/Imgs/broken.jpg', type: 'file' }
    ],
    truncated: false
  }
}

const open = (kind: PickKind, thumbnail: EquonApi['files']['thumbnail']): void => {
  installFakeApi([], { files: { list: async () => listing, thumbnail } })
  render(
    <FocusProvider manager={new FocusManager()}>
      <FileBrowserDialog kind={kind} initialPath="C:/Imgs" onPick={() => {}} onClose={() => {}} />
    </FocusProvider>
  )
}
const thumbOf = (name: string): Element | null =>
  screen.getByText(name).closest('.file-row')?.querySelector('.file-row__thumb') ?? null

describe('file browser previews (owner decision)', () => {
  it('shows a small preview at the start of each image row, keeping the list', async () => {
    const thumbnail = vi.fn<EquonApi['files']['thumbnail']>(async (path) =>
      path.endsWith('cover.png') ? 'data:image/png;base64,AAAA' : null
    )
    open('image', thumbnail)
    await waitFor(() =>
      expect(thumbOf('cover.png')?.querySelector('img')?.getAttribute('src')).toBe(
        'data:image/png;base64,AAAA'
      )
    )
    // No preview: the square stays, empty, so the row does not move.
    expect(thumbOf('broken.jpg')).not.toBeNull()
    expect(thumbOf('broken.jpg')?.querySelector('img')).toBeNull()
    // A folder keeps its icon.
    expect(thumbOf('Old')).toBeNull()
    expect(thumbnail).toHaveBeenCalledTimes(2)
  })

  it('asks for nothing when choosing anything but an image', async () => {
    const thumbnail = vi.fn<EquonApi['files']['thumbnail']>(async () => null)
    open('executable', thumbnail)
    await screen.findByText('cover.png')
    expect(thumbOf('cover.png')).toBeNull()
    expect(thumbnail).not.toHaveBeenCalled()
  })
})
