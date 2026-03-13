import type { DrivingServiceMode, Environment, LoadProgressInfo, LogLevel as AvatarSdkLogLevel } from '@spatialwalk/avatarkit'
import type { AvatarPlayerOptions } from '@spatialwalk/avatarkit-rtc'
import type { UseSessionReturn } from '@livekit/components-react'
import type { Room, Track } from 'livekit-client'

export type SpatialRealAvatarConnectionStatus =
  | 'idle'
  | 'initializing'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error'

export interface SpatialRealAvatarConnection {
  roomName: string
  token: string
  url: string
}

interface SpatialRealAvatarSdkOptions {
  appId: string
  avatarId: string
  characterApiBaseUrl?: string
  drivingServiceMode?: DrivingServiceMode
  environment?: Environment
  sessionToken?: string
  sdkLogLevel?: AvatarSdkLogLevel
  userId?: string
}

export interface UseSpatialRealAvatarOptions extends SpatialRealAvatarSdkOptions {
  connection: SpatialRealAvatarConnection
  enabled?: boolean
  onAvatarError?: (error: Error) => void
  onConnected?: (room: Room | null) => void
  onDisconnected?: () => void
  onLoadProgress?: (progress: LoadProgressInfo) => void
  onStateChange?: (status: SpatialRealAvatarConnectionStatus) => void
  playerOptions?: AvatarPlayerOptions
  publishMicrophone?: boolean
}

export interface SpatialRealAvatarState {
  downloadProgress: number | null
  error: Error | null
  isConnected: boolean
  isLoading: boolean
  isPublishingMicrophone: boolean
  micTrack: Track | undefined
  room: Room | null
  status: SpatialRealAvatarConnectionStatus
}

export interface UseSpatialRealAvatarResult extends SpatialRealAvatarState {
  connection: SpatialRealAvatarConnection
  containerRef: (node: HTMLDivElement | null) => void
  disconnect: () => Promise<void>
  reconnect: () => Promise<void>
  session: UseSessionReturn
  startPublishingMicrophone: () => Promise<void>
  stopPublishingMicrophone: () => Promise<void>
}

export interface UseSpatialRealAvatarSessionOptions {
  onDisconnect?: () => void
}
