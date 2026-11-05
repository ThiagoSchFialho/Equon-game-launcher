import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useNavigation } from '../app/navigation'
import { FocusScope } from '../focus/FocusProvider'
import { t } from '../strings'
import { Footer, type Hint } from './Footer'
import { StateMessage } from './StateMessage'

const HINTS: Hint[] = [{ button: 'A', label: t.hints.select }]

function ScreenFailure({ onLeave }: { onLeave: () => void }): React.JSX.Element {
  const navigation = useNavigation()
  return (
    <FocusScope id="screen:failure">
      <div className="screen">
        <main className="screen__main">
          <StateMessage
            tone="error"
            message={t.failure.message}
            hint={t.failure.hint}
            action={{
              id: 'failure:home',
              label: t.failure.home,
              onConfirm: () => {
                navigation.goToSection('home')
                onLeave()
              }
            }}
          />
        </main>
        <Footer hints={HINTS} />
      </div>
    </FocusScope>
  )
}

/**
 * A screen that throws while rendering must not leave a dead window: without a
 * boundary React removes the whole tree, and a controller has nothing to press.
 */
export class ScreenErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Screen failed:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.failed) {
      return <ScreenFailure onLeave={() => this.setState({ failed: false })} />
    }
    return this.props.children
  }
}
