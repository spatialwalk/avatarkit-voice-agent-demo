'use client'

import type { CSSProperties, HTMLAttributes, MutableRefObject, Ref } from 'react'

import { useSpatialRealAvatarContext } from '@/components/spatialreal-avatar/spatialreal-avatar-context'
import { cn } from '@/lib/utils'

function assignRef<T>(ref: Ref<T | null> | undefined, value: T | null) {
  if (typeof ref === 'function') {
    ref(value)
    return
  }

  if (ref) {
    ;(ref as MutableRefObject<T | null>).current = value
  }
}

export interface SpatialRealAvatarCanvasProps extends HTMLAttributes<HTMLDivElement> {
  minHeight?: CSSProperties['minHeight']
}

export function SpatialRealAvatarCanvas({
  className,
  minHeight = 420,
  ref,
  style,
  ...props
}: SpatialRealAvatarCanvasProps & { ref?: Ref<HTMLDivElement> }) {
  const { containerRef } = useSpatialRealAvatarContext()

  return (
    <div
      {...props}
      ref={(node) => {
        if (node) {
          containerRef(node)
          assignRef(ref, node)
          return
        }

        containerRef(null)
        assignRef(ref, node)
      }}
      className={cn(
        'relative z-0 w-full overflow-hidden bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.18),transparent_34%),linear-gradient(180deg,hsl(224_53%_10%)_0%,hsl(222_47%_14%)_100%)]',
        className,
      )}
      style={{ minHeight, ...style }}
    />
  )
}
