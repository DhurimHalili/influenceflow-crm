import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { STATUS_LABELS } from '../lib/types'

export function Modal({
  open,
  title,
  children,
  onClose,
  wide,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, var(--accent), var(--accent-2))', display: 'grid', placeItems: 'center', color: '#04201C', fontWeight: 800, fontSize: '0.82rem', flexShrink: 0, boxShadow: '0 4px 12px rgba(45,212,191,0.22)' }}>✦</span>
          <h2 style={{ margin: 0 }}>{title}</h2>
        </div>
        <div style={{ height: 1, background: 'var(--border)', margin: '8px 0 14px', opacity: 0.9 }} />
        {children}
      </div>
    </div>
  )
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
      {hint ? <div style={{ fontSize: '0.76rem', color: 'var(--text-faint)', marginTop: 5, lineHeight: 1.45 }}>{hint}</div> : null}
    </div>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p style={{ color: 'var(--text-muted)', marginTop: 0, lineHeight: 1.6, fontSize: '0.9rem' }}>{message}</p>
      <div className="modal-actions">
        <button className="btn btn-ghost" type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" type="button" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3200)
    return () => clearTimeout(t)
  }, [msg])
  return {
    toast: msg,
    show: setMsg,
    Toast: msg ? (
      <div className="toast">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 20, height: 20, borderRadius: 999, background: 'var(--accent)', display: 'grid', placeItems: 'center', color: '#04201C', fontSize: '0.72rem', fontWeight: 800, flexShrink: 0 }}>✓</span>
          {msg}
        </span>
      </div>
    ) : null,
  }
}

export function Empty({ children, title, action }: { children: ReactNode; title?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-illustration">◈</div>
      {title ? <div style={{ fontFamily: 'var(--display)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', fontSize: '0.98rem', marginBottom: 4 }}>{title}</div> : null}
      <div style={{ maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>{children}</div>
      {action ? <div className="empty-cta">{action}</div> : null}
    </div>
  )
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{STATUS_LABELS[status] || status.replaceAll('_', ' ')}</span>
}

export function FormActions({
  onCancel,
  submitLabel = 'Save',
  busy,
}: {
  onCancel: () => void
  submitLabel?: string
  busy?: boolean
}) {
  return (
    <div className="modal-actions">
      <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Saving…' : submitLabel}
      </button>
    </div>
  )
}

export function prevent(e: FormEvent) {
  e.preventDefault()
}
