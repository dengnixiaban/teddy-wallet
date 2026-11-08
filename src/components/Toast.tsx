/**
 * 全局 Toast 通知
 *
 * 为什么不用内联错误文本：
 *   交易类操作是异步的，内联文本会被后续渲染冲掉，
 *   用户经常看不到。Toast 固定在视口上方，不会被遮挡。
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Kind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: Kind
  message: string
}

interface ToastApi {
  push: (kind: Kind, message: string) => void
  success: (msg: string) => void
  error: (msg: string) => void
  info: (msg: string) => void
}

const ToastCtx = createContext<ToastApi | null>(null)

let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((kind: Kind, message: string) => {
    const id = ++seq
    setItems(prev => [...prev, { id, kind, message }])
    setTimeout(() => {
      setItems(prev => prev.filter(t => t.id !== id))
    }, kind === 'error' ? 5200 : 3200)
  }, [])

  const api: ToastApi = {
    push,
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
  }

  const ICON: Record<Kind, string> = { success: '✓', error: '!', info: 'i' }

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {items.map(t => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span className="toast-icon">{ICON[t.kind]}</span>
            <span className="toast-msg">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用')
  return ctx
}
