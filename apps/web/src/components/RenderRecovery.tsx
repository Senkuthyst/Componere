import { Component, type ErrorInfo, type ReactNode } from 'react'

type RenderRecoveryProps = { children: ReactNode; fallback: ReactNode }
type RenderRecoveryState = { failed: boolean }

export class RenderRecovery extends Component<RenderRecoveryProps, RenderRecoveryState> {
  state: RenderRecoveryState = { failed: false }

  static getDerivedStateFromError(): RenderRecoveryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Componere visual renderer failed', error, info.componentStack)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
