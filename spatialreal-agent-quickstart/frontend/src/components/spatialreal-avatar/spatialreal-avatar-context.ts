import { createContext, useContext } from 'react'

import type { UseSpatialRealAvatarResult } from '@/types/spatialreal-avatar'

export const SpatialRealAvatarContext = createContext<UseSpatialRealAvatarResult | null>(null)

export function useSpatialRealAvatarContext() {
  const context = useContext(SpatialRealAvatarContext)

  if (!context) {
    throw new Error('useSpatialRealAvatarContext must be used within SpatialRealAvatarProvider.')
  }

  return context
}
