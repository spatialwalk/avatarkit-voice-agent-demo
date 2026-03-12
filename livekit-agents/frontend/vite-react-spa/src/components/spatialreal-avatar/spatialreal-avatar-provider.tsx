'use client'

import { useCallback, useMemo, type ReactNode } from 'react'

import { RoomAudioRenderer, SessionProvider } from '@livekit/components-react'

import { useSpatialRealAvatar } from '../../hooks/useSpatialRealAvatar'
import type {
  UseSpatialRealAvatarOptions,
  UseSpatialRealAvatarSessionOptions,
} from '../../types/spatialreal-avatar'
import { SpatialRealAvatarContext } from './spatialreal-avatar-context'

export interface SpatialRealAvatarProviderProps
  extends UseSpatialRealAvatarOptions,
    UseSpatialRealAvatarSessionOptions {
  children: ReactNode
  muted?: boolean
  volume?: number
}

export function SpatialRealAvatarProvider({
  children,
  muted,
  onDisconnect,
  volume,
  ...options
}: SpatialRealAvatarProviderProps) {
  const avatar = useSpatialRealAvatar(options)
  const end = useCallback(async () => {
    try {
      await avatar.disconnect()
    } finally {
      onDisconnect?.()
    }
  }, [avatar, onDisconnect])

  const session = useMemo(
    () => ({
      ...avatar.session,
      end,
    }),
    [avatar.session, end],
  )

  const value = useMemo(
    () => ({
      ...avatar,
      session,
    }),
    [avatar, session],
  )

  return (
    <SpatialRealAvatarContext.Provider value={value}>
      <SessionProvider session={session}>
        <RoomAudioRenderer room={session.room} muted={muted} volume={volume} />
        {children}
      </SessionProvider>
    </SpatialRealAvatarContext.Provider>
  )
}
