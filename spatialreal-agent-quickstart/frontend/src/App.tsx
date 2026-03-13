import { useState } from 'react'
import '@livekit/components-styles'
import { Button } from '@/components/ui/button'

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

  const toggleMic = async () => {
    if (pending || !avatar.isConnected) return
    setPending(true)

    try {
      if (avatar.isPublishingMicrophone) {
        await avatar.stopPublishingMicrophone()
      } else {
        await avatar.startPublishingMicrophone()
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
    <div style={{ width: 'min(760px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SpatialRealAvatarFrame style={{ overflow: 'hidden' }}>
        <SpatialRealAvatarCanvas minHeight={420} />
        <SpatialRealAvatarLoading />
        <SpatialRealAvatarError />
      </SpatialRealAvatarFrame>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button disabled={!avatar.isConnected || pending} onClick={() => void toggleMic()} type="button">
          {avatar.isPublishingMicrophone ? 'Stop Mic' : 'Start Mic'}
        </Button>

        <Button disabled={pending} onClick={() => void disconnect()} type="button" variant="outline">
          Disconnect
        </Button>

        <SpatialRealAvatarStatus />

        <span style={{ fontSize: 14 }}>
          {avatar.error ? avatar.error.message : avatar.isConnected ? 'Connected. Start speaking.' : 'Connecting...'}
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
    return <div style={{ padding: 16 }}>Missing required environment variables. Check `.env`.</div>
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {connection ? (
        <SpatialRealAvatarProvider
          appId={appId}
          avatarId={avatarId}
          connection={connection}
          onConnected={() => setStatus('Connected. Click Start Mic to talk.')}
          onDisconnected={() => setStatus('Disconnected')}
          onAvatarError={(error) => setStatus(error.message)}
        >
          <AvatarPanel onExit={() => setConnection(null)} />
        </SpatialRealAvatarProvider>
      ) : (
        <div style={{ width: 'min(560px, 100%)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button disabled={connecting} onClick={() => void requestConnection()} type="button">
            {connecting ? 'Connecting...' : 'Connect'}
          </Button>
          <span style={{ fontSize: 14 }}>{status}</span>
        </div>
      )}
    </div>
  )
}
