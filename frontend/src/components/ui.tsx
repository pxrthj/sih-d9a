import type { ReactNode } from 'react'
import { AlertIcon, CheckIcon } from './Icons'

/** Google/name avatar with graceful initials fallback. */
export function Avatar({
  src,
  name,
  size = 40,
}: {
  src?: string | null
  name?: string | null
  size?: number
}) {
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  if (src) {
    return (
      <img
        className="avatar"
        src={src}
        alt={name || 'avatar'}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
      />
    )
  }
  return (
    <div
      className="avatar avatar--fallback"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  )
}

/** Compliance status pill driven by the backend status string. */
export function StatusPill({ status }: { status?: string | null }) {
  const s = (status || '').toLowerCase()
  if (s === 'compliant') {
    return (
      <span className="pill pill--success">
        <CheckIcon size={13} /> Compliant
      </span>
    )
  }
  if (s === 'flagged' || s === 'violation' || s === 'non-compliant') {
    return (
      <span className="pill pill--error">
        <AlertIcon size={13} /> Flagged
      </span>
    )
  }
  return <span className="pill pill--neutral">{status || 'Unknown'}</span>
}

export function EmptyState({
  icon,
  title,
  text,
}: {
  icon: ReactNode
  title: string
  text: string
}) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <div className="empty__title">{title}</div>
      <div className="empty__text">{text}</div>
    </div>
  )
}

export function Spinner({ dark = false }: { dark?: boolean }) {
  return <span className={dark ? 'spinner spinner--dark' : 'spinner'} />
}

export function FullScreenLoader({ label }: { label?: string }) {
  return (
    <div className="center-screen" style={{ flexDirection: 'column', gap: 16 }}>
      <Spinner dark />
      {label && <div className="muted" style={{ fontSize: 14 }}>{label}</div>}
    </div>
  )
}

export function Banner({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'error' | 'success'
  children: ReactNode
}) {
  const icon =
    kind === 'error' ? <AlertIcon size={18} /> : kind === 'success' ? <CheckIcon size={18} /> : null
  return (
    <div className={`banner banner--${kind}`}>
      {icon}
      <div>{children}</div>
    </div>
  )
}
