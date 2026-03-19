import { useState } from 'react'
import '@livekit/components-styles'
import { Button } from '@/components/ui/button'
import { Track } from 'livekit-client'

import {
  SpatialRealAvatarCanvas,
  SpatialRealAvatarError,
  SpatialRealAvatarFrame,
  SpatialRealAvatarLoading,
  SpatialRealAvatarProvider,
  SpatialRealAvatarStatus,
  useSpatialRealAvatarContext,
} from './components/spatialreal-avatar'

type AvatarConnection = {
  url: string
  token: string
  roomName: string
}

type TokenResponse = {
  url: string
  token: string
  room: string
}

function AvatarPanel({ onExit }: { onExit: () => void }) {
  const avatar = useSpatialRealAvatarContext()
  const [pending, setPending] = useState(false)
  const micPublication = avatar.room?.localParticipant.getTrackPublication(Track.Source.Microphone)
  const hasPublishedMic = Boolean(micPublication?.track)
  const isMicMuted = micPublication?.isMuted ?? false

  const toggleMicrophone = async () => {
    if (pending || !avatar.isConnected) return
    setPending(true)

    try {
      if (!hasPublishedMic) {
        await avatar.startPublishingMicrophone()
      } else if (isMicMuted) {
        await micPublication?.unmute()
      } else {
        await micPublication?.mute()
      }
    } finally {
      setPending(false)
    }
  }

  const disconnect = async () => {
    if (pending) return
    setPending(true)

    try {
      await avatar.disconnect()
    } finally {
      setPending(false)
      onExit()
    }
  }

  return (
    <div className="flex w-full max-w-[760px] flex-col gap-3">
      <SpatialRealAvatarFrame className="overflow-hidden">
        <SpatialRealAvatarCanvas minHeight={420} />
        <SpatialRealAvatarLoading />
        <SpatialRealAvatarError />
      </SpatialRealAvatarFrame>

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!avatar.isConnected || pending} onClick={() => void toggleMicrophone()} type="button">
          {!hasPublishedMic ? 'Enable Mic' : isMicMuted ? 'Unmute Mic' : 'Mute Mic'}
        </Button>

        <Button disabled={pending} onClick={() => void disconnect()} type="button" variant="outline">
          Disconnect
        </Button>

        <SpatialRealAvatarStatus />

        <span className="text-sm">
          {avatar.error
            ? avatar.error.message
            : avatar.isConnected
              ? !hasPublishedMic
                ? 'Connected. Mic is off, enable mic to talk.'
                : isMicMuted
                  ? 'Connected. Mic is muted.'
                  : 'Connected. Mic is on, start speaking.'
              : 'Connecting...'}
        </span>
      </div>
    </div>
  )
}

export default function App() {
  const appId = import.meta.env.VITE_SPATIALREAL_APP_ID
  const avatarId = import.meta.env.VITE_SPATIALREAL_AVATAR_ID
  const tokenEndpoint = import.meta.env.VITE_TOKEN_ENDPOINT || '/token'
  const roomName = import.meta.env.VITE_ROOM_NAME || 'voice-agent-room'

  const [connection, setConnection] = useState<AvatarConnection | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [status, setStatus] = useState('Click Connect to start')

  const requestConnection = async () => {
    if (connecting || connection) return
    if (!appId || !avatarId) {
      setStatus('Missing VITE_SPATIALREAL_APP_ID or VITE_SPATIALREAL_AVATAR_ID in .env')
      return
    }

    setConnecting(true)
    setStatus('Requesting token...')

    try {
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: roomName }),
      })
      if (!response.ok) throw new Error('Failed to fetch token')

      const payload = (await response.json()) as TokenResponse
      if (!payload.url || !payload.token || !payload.room) {
        throw new Error('Token response is missing url, token, or room')
      }

      setConnection({
        url: payload.url,
        token: payload.token,
        roomName: payload.room,
      })
      setStatus('Connecting avatar...')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to request token')
    } finally {
      setConnecting(false)
    }
  }

  if (!appId || !avatarId) {
    return <div className="p-4">Missing required environment variables. Check `.env`.</div>
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      {connection ? (
        <SpatialRealAvatarProvider
          appId={appId}
          avatarId={avatarId}
          connection={connection}
          onConnected={() => setStatus('Connected. Click Enable Mic to talk.')}
          onDisconnected={() => setStatus('Disconnected')}
          onAvatarError={(error) => setStatus(error.message)}
        >
          <AvatarPanel
            onExit={() => {
              setConnection(null)
              setStatus('Disconnected')
            }}
          />
        </SpatialRealAvatarProvider>
      ) : (
        <div className="flex w-full max-w-[560px] flex-col gap-2.5">
          <Button disabled={connecting} onClick={() => void requestConnection()} type="button">
            {connecting ? 'Connecting...' : 'Connect'}
          </Button>
          <span className="text-sm">{status}</span>
        </div>
      )}
    </div>
  )
}
