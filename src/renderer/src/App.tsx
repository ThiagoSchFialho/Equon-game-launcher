import { useEffect, useState } from 'react'
import type { AppInfo } from '../../shared/ipc/contract'

function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    window.equon.app.getInfo().then(setInfo, () => setFailed(true))
  }, [])

  return (
    <main className="app">
      <h1>Equon</h1>
      <p>{failed ? 'Could not reach the main process.' : info ? `v${info.version}` : '…'}</p>
    </main>
  )
}

export default App
