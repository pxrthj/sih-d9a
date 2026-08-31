import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

/**
 * A user's Google picture, falling back to their initial.
 *
 * Google's avatar host rejects requests that carry a referrer, hence the
 * explicit `referrerPolicy` — without it the image 403s and every officer
 * silently renders as a letter.
 */
export function AppAvatar({
  src,
  name,
  className,
}: {
  src?: string | null
  name?: string | null
  className?: string
}) {
  const initial = (name || '?').trim().charAt(0).toUpperCase()
  return (
    <Avatar className={cn('size-10', className)}>
      {src && <AvatarImage src={src} alt={name || ''} referrerPolicy="no-referrer" />}
      <AvatarFallback>{initial}</AvatarFallback>
    </Avatar>
  )
}
