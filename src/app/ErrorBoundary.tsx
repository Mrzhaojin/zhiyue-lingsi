import React from 'react'
import { createLogger } from '../lib/logger'

const log = createLogger('error-boundary')

type Props = { children: React.ReactNode }
type State = { error: Error | null; info: string }

/**
 * 全局错误边界：任何渲染期异常都不应该让用户看到白屏。
 * 生产环境只展示可操作的信息，详细堆栈写到日志（可挂 sink 上报）。
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    log.error('Unhandled render error:', error, info.componentStack)
    this.setState({ info: info.componentStack ?? '' })
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleCopy = async () => {
    const { error, info } = this.state
    const payload = `message: ${error?.message ?? ''}\nstack: ${error?.stack ?? ''}\ncomponentStack: ${info}`
    try {
      await navigator.clipboard.writeText(payload)
    } catch {
      // 剪贴板不可用时忽略
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div style={{ maxWidth: 640, margin: '80px auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>页面出错了</h1>
        <p style={{ color: '#666', fontSize: 14, lineHeight: 1.8 }}>
          已经记录错误信息。你的本地数据没有被删除，可以先刷新重试。
        </p>
        <pre style={{ background: '#f6f6f6', padding: 12, borderRadius: 8, fontSize: 12, overflow: 'auto', maxHeight: 200 }}>
          {error.message}
        </pre>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button onClick={this.handleReload} style={{ padding: '8px 16px' }}>刷新页面</button>
          <button onClick={this.handleCopy} style={{ padding: '8px 16px' }}>复制错误详情</button>
        </div>
      </div>
    )
  }
}