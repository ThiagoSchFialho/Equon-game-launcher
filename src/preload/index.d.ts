import type { EquonApi } from '../shared/ipc/contract'

declare global {
  interface Window {
    equon: EquonApi
  }
}
