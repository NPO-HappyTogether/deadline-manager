/**
 * ErrorBoundary.tsx — 최상위 에러 경계
 *
 * 아키텍처 절대 규칙:
 *   - App.tsx를 감싸는 단 1개만 존재
 *   - 조용한 실패 금지 — 에러는 반드시 사용자에게 표시
 *
 * 사용법:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 */

import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // 조용한 실패 금지 — 콘솔에 반드시 기록
    console.error('[ErrorBoundary] 처리되지 않은 에러:', error)
    console.error('[ErrorBoundary] 컴포넌트 스택:', info.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-xl font-semibold text-foreground">
            오류가 발생했습니다
          </h1>
          <p className="text-sm text-muted-foreground">
            앱에서 예기치 않은 오류가 발생했습니다.
            <br />
            새로고침하면 대부분의 경우 해결됩니다.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="mt-2 max-w-lg overflow-auto rounded bg-muted p-3 text-left text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleReload}
            className="mt-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            새로고침
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
