import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon: Icon,
  title,
  text,
  className,
}: {
  icon: LucideIcon
  title: string
  text: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="bg-muted text-muted-foreground grid size-12 place-items-center rounded-full">
        <Icon className="size-6" />
      </div>
      <div className="mt-4 font-medium">{title}</div>
      <p className="text-muted-foreground mt-1 max-w-xs text-sm leading-relaxed">{text}</p>
    </div>
  )
}
