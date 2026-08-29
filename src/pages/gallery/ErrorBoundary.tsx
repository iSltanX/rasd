import { Component, type ComponentChildren } from 'preact'

interface Props {
  children: ComponentChildren
  onError?: (error: Error) => void
}
interface State {
  error: Error | null
}

/**
 * يحصر عطل عرض تركيبة واحدة داخل خليّتها — بلا هذا، مكوّن واحد يرمي يُسقط
 * صفحة المعرض بأكملها ويخفي بقيّة الأدلّة.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null }

  static override getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error) {
    this.props.onError?.(error)
  }

  override render() {
    if (this.state.error) {
      return <span data-render-error={this.state.error.message}>{this.state.error.message}</span>
    }
    return this.props.children
  }
}
