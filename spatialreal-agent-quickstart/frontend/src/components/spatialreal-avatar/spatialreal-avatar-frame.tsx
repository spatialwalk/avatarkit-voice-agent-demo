'use client'

import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

const frameVariants = cva(
  'relative isolate overflow-hidden rounded-[28px] border border-border/70 bg-card/95 text-card-foreground shadow-[0_28px_90px_-40px_hsl(var(--foreground)/0.45)] backdrop-blur-sm',
  {
    variants: {
      tone: {
        default: 'bg-card/95',
        muted: 'bg-muted/60',
        ghost: 'bg-background/70',
      },
    },
    defaultVariants: {
      tone: 'default',
    },
  },
)

export interface SpatialRealAvatarFrameProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof frameVariants> {}

export function SpatialRealAvatarFrame({ className, tone, ...props }: SpatialRealAvatarFrameProps) {
  return <div className={cn(frameVariants({ tone }), className)} {...props} />
}
