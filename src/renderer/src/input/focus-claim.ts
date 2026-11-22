export interface FocusClaimer {
  /** Once per frame. Returns true when this frame's pad state must not become actions. */
  update(pressed: boolean, focused: boolean): boolean
  /** The user did something in the launcher: from now on, losing the focus is deliberate. */
  markUsed(): void
}

/**
 * The launcher ignores the controller without the focus, so playing a game never drives it.
 * But opened with Windows, it may never get the focus, leaving the controller with no effect
 * (ARCHITECTURE.md §3.20). So until the launcher is first used, a press brings it to the front.
 * That press does nothing else, and main refuses while a game is running.
 *
 * Also, a button already held when the launcher gets the focus back belongs to what had it:
 * closing a game with A (Minecraft) handed the focus back with A still down, and that same A
 * started the game again (owner's report). It must be let go before anything counts.
 */
export function createFocusClaimer(claim: () => Promise<boolean>): FocusClaimer {
  let used = false
  let wasPressed = false
  let waitingForRelease = false
  let wasFocused = true

  return {
    update(pressed, focused) {
      const isNewPress = pressed && !wasPressed
      wasPressed = pressed
      const gotFocus = focused && !wasFocused
      wasFocused = focused
      if (gotFocus && pressed) waitingForRelease = true
      if (!focused) {
        if (isNewPress && !used) {
          // Set now: more presses may come before main answers.
          used = true
          waitingForRelease = true
          claim().then(
            (claimed) => {
              if (!claimed) used = false
            },
            () => {
              used = false
            }
          )
        }
        return true
      }
      if (!waitingForRelease) return false
      if (pressed) return true
      waitingForRelease = false
      return false
    },

    markUsed() {
      used = true
    }
  }
}
