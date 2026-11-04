import type { TrophyTier } from '../../../shared/ipc/contract'
import bronzeTrophy from '../assets/trophies/bronze.png'
import goldTrophy from '../assets/trophies/gold.png'
import platinumTrophy from '../assets/trophies/platinum.png'
import silverTrophy from '../assets/trophies/silver.png'

export const TROPHY_IMAGES: Record<TrophyTier | 'platine', string> = {
  platine: platinumTrophy,
  gold: goldTrophy,
  silver: silverTrophy,
  bronze: bronzeTrophy
}
