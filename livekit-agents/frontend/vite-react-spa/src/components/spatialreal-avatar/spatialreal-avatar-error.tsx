'use client'

import type { HTMLAttributes, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

import { useSpatialRealAvatarContext } from './spatialreal-avatar-context'
import { cn } from '../../utils'

export interface SpatialRealAvatarErrorProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

export function SpatialRealAvatarError({ className, children, ...props }: SpatialRealAvatarErrorProps) {
  const { error, status } = useSpatialRealAvatarContext()

  if (status !== 'error' || !error) {
    return null
  }

  return (
    <div
      className={cn(
        'absolute inset-0 z-20 flex items-center justify-center bg-background/75 p-6 backdrop-blur-md',
        className,
      )}
      {...props}
    >
      {children ?? (
        <div className="max-w-sm rounded-2xl border border-destructive/30 bg-card/95 p-5 text-card-foreground shadow-xl">
          <div className="flex items-start gap-3">
            <span className="rounded-full bg-destructive/10 p-2 text-destructive">
              <AlertTriangle className="size-4" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold">Avatar connection failed</p>
              <p className="text-sm text-muted-foreground">{error.message}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
