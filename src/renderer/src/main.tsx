import './styles/tokens.css'
import './styles/base.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { isCoverPage, renderCover } from './cover'

const root = document.getElementById('root')!
if (isCoverPage(location.hash)) {
  renderCover(root, location.hash)
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}
