import type { BackgroundActivity, BackgroundTask } from '../shared/ipc/contract'

/** Tasks run one after the other; a short wait keeps the indicator from blinking between them. */
export const ACTIVITY_SETTLE_MS = 400

/**
 * First running task wins. Achievements come first: that sync is short and its
 * result is what the user is waiting for, while the artwork queue can run for minutes.
 */
const ORDER: readonly BackgroundTask[] = ['achievements', 'library', 'metadata', 'artwork']

export type TaskProgress = { done: number; total: number }

export interface BackgroundActivityTracker {
  /** What the indicator shows now; null when nothing is running. */
  current(): BackgroundActivity | null
  /** Reports a task's progress (total 0 = no count known); null means it ended. */
  update(task: BackgroundTask, progress: TaskProgress | null): void
}

export function createBackgroundActivity(
  publish: (activity: BackgroundActivity | null) => void
): BackgroundActivityTracker {
  const running = new Map<BackgroundTask, TaskProgress>()
  let shown: BackgroundActivity | null = null
  let settling: ReturnType<typeof setTimeout> | null = null

  const next = (): BackgroundActivity | null => {
    for (const task of ORDER) {
      const progress = running.get(task)
      if (progress) return { task, ...progress }
    }
    return null
  }

  const show = (activity: BackgroundActivity | null): void => {
    shown = activity
    publish(activity)
  }

  return {
    current: () => shown,

    update(task, progress) {
      if (progress) running.set(task, progress)
      else running.delete(task)

      const activity = next()
      if (activity) {
        if (settling) clearTimeout(settling)
        settling = null
        show(activity)
      } else if (shown && !settling) {
        settling = setTimeout(() => {
          settling = null
          show(next())
        }, ACTIVITY_SETTLE_MS)
      }
    }
  }
}
