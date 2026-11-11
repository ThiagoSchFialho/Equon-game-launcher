import type { HomeCoverPosition } from '../../../shared/ipc/contract'

/**
 * The values the owner recommends for each "Capas da home" position, shown in Configurações ›
 * Aparência as "(padrão x)" next to each level. They are a guide only: nothing is changed when the
 * position changes, and the stored values keep the columns' defaults until the user moves them.
 */
export const RECOMMENDED_APPEARANCE: Record<
  HomeCoverPosition,
  { blur: number; dim: number; size: number; gap: number }
> = {
  center: { blur: 6, dim: 80, size: 72, gap: 35 },
  bottom: { blur: 0, dim: 10, size: 30, gap: 5 }
}
