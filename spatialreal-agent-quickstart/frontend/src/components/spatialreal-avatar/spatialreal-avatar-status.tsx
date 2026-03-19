'use client'

import type { HTMLAttributes } from 'react'

import { useSpatialRealAvatarContext } from '@/components/spatialreal-avatar/spatialreal-avatar-context'
import type { SpatialRealAvatarConnectionStatus } from '@/types/spatialreal-avatar'
import { cn } from '@/lib/utils'

const statusLabels: Record<SpatialRealAvatarConnectionStatus, string> = {
  idle: 'Idle',
  initializing: 'Initializing',
  connecting: 'Connecting',
  connected: 'Connected',
  disconnecting: 'Disconnecting',
  error: 'Error',
}

const statusClasses: Record<SpatialRealAvatarConnectionStatus, string> = {
  idle: 'bg-secondary text-secondary-foreground',
  initializing: 'bg-secondary text-secondary-foreground',
  connecting: 'bg-secondary text-secondary-foreground',
  connected: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  disconnecting: 'bg-secondary text-secondary-foreground',
  error: 'bg-destructive/10 text-destructive',
}

export type SpatialRealAvatarStatusProps = HTMLAttributes<HTMLDivElement>

export function SpatialRealAvatarStatus({ className, ...props }: SpatialRealAvatarStatusProps) {
  const { status } = useSpatialRealAvatarContext()

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide shadow-sm',
        statusClasses[status],
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-2 rounded-full',
          status === 'connected' ? 'bg-emerald-500' : status === 'error' ? 'bg-destructive' : 'bg-current/60',
        )}
      />
      <span>{statusLabels[status]}</span>
    </div>
  )
}
