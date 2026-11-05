// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import type { GameDetails } from '../../src/shared/ipc/contract'
import { installFakeApi, summary } from './fake-api'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const press = (key: string): void => {
  act(() => {
    fireEvent.keyDown(window, { key })
  })
}

describe('a screen that throws', () => {
  it('shows a message the controller can leave, instead of a dead window', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    installFakeApi([summary(1, 'A'), summary(2, 'B')], {
      // Data the page cannot render.
      games: { get: async () => ({}) as GameDetails }
    })
    render(<App />)
    await waitFor(() => expect(document.querySelector('.home__track .game-card')).toBeTruthy())
    await waitFor(() => expect(document.querySelector('[data-focused="true"]')).toBeTruthy())

    press('Enter')
    expect(await screen.findByText('Algo deu errado nesta tela.')).toBeTruthy()
    expect(screen.getByText('Seus dados não foram afetados.')).toBeTruthy()
    expect(logged).toHaveBeenCalled()

    // The way out has the focus, so one press of A is enough.
    await waitFor(() =>
      expect(document.querySelector('[data-focused="true"]')?.getAttribute('aria-label')).toBe(
        'Voltar para o início'
      )
    )
    press('Enter')
    await waitFor(() => expect(document.querySelector('.home__track .game-card')).toBeTruthy())
    expect(screen.queryByText('Algo deu errado nesta tela.')).toBeNull()
  })
})
