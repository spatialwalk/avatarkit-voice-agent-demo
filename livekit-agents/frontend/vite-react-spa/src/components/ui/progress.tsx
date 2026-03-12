import type { HTMLAttributes } from 'react'

import { cn } from '../../utils'

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value?: number | null
}

export function Progress({ className, value = 0, ...props }: ProgressProps) {
  const width = Math.max(0, Math.min(100, value ?? 0))

  return (
    <div
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={width}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary/70', className)}
      role="progressbar"
      {...props}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
        style={{ width: `${width}%` }}
      />
    </div>
  )
}
