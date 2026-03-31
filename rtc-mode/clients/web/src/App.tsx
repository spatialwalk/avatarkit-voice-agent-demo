import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AvatarManager,
  AvatarSDK,
  AvatarView,
  DrivingServiceMode,
  Environment,
} from '@spatialwalk/avatarkit'
import { AvatarPlayer, LiveKitProvider } from '@spatialwalk/avatarkit-rtc'

type TokenResponse = {
  token: string
  url: string
  room: string
  identity: string
}

const appId = import.meta.env.VITE_SPATIALREAL_APP_ID
const avatarId = import.meta.env.VITE_SPATIALREAL_AVATAR_ID
const sessionToken = import.meta.env.VITE_SPATIALREAL_SESSION_TOKEN

function App() {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<AvatarView | null>(null)
  const playerRef = useRef<AvatarPlayer | null>(null)

  const [roomName, setRoomName] = useState('pure-rtc-room')
  const [identity, setIdentity] = useState('')
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  const canConnect = useMemo(() => {
    return !connecting && !connected && Boolean(appId) && Boolean(avatarId)
  }, [connecting, connected])

  const pushLog = useCallback((message: string) => {
    setLogs((prev) => [`${new Date().toLocaleTimeString()} ${message}`, ...prev].slice(0, 30))
  }, [])

  const requestToken = useCallback(async (): Promise<TokenResponse> => {
    const response = await fetch('/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: roomName, identity }),
    })

    if (!response.ok) {
      throw new Error(await response.text())
    }

    return response.json()
  }, [roomName, identity])

  const disconnect = useCallback(async () => {
    try {
      if (playerRef.current) {
        await playerRef.current.disconnect()
      }
    } catch (error) {
      pushLog(`Disconnect failed: ${(error as Error).message}`)
    }

    try {
      viewRef.current?.dispose?.()
    } catch {
      // ignore dispose errors
    }

    playerRef.current = null
    viewRef.current = null
    setConnected(false)
  }, [pushLog])

  const connect = useCallback(async () => {
    if (!canConnect || !stageRef.current) {
      return
    }

    setConnecting(true)
    pushLog('Preparing Pure RTC connection...')

    try {
      const token = await requestToken()

      if (!AvatarSDK.isInitialized) {
        await AvatarSDK.initialize(appId, {
          environment: Environment.intl,
          drivingServiceMode: DrivingServiceMode.host,
        })
      }

      if (sessionToken) {
        AvatarSDK.setSessionToken?.(sessionToken)
      }

      const manager = AvatarManager.shared
      if (!manager) {
        throw new Error('AvatarManager unavailable')
      }

      const avatar = await manager.load(avatarId)
      const view = new AvatarView(avatar, stageRef.current)
      viewRef.current = view

      const provider = new LiveKitProvider()
      const player = new AvatarPlayer(provider as any, view, { logLevel: 'info' })
      playerRef.current = player

      await player.connect({
        url: token.url,
        token: token.token,
        roomName: token.room,
      })

      await player.startPublishing()
      setConnected(true)
      pushLog(`Connected to room: ${token.room} (${token.identity})`)
      pushLog('This is a pure RTC sample without agent dispatch')
    } catch (error) {
      pushLog(`Connection failed: ${(error as Error).message}`)
      await disconnect()
    } finally {
      setConnecting(false)
    }
  }, [canConnect, disconnect, pushLog, requestToken])

  useEffect(() => {
    return () => {
      void disconnect()
    }
  }, [disconnect])

  return (
    <div className="pure-shell">
      <header className="pure-header">
        <div>
          <p className="eyebrow">RTC Mode</p>
          <h1>LiveKit Pure RTC Console</h1>
        </div>
        <span className={`state ${connected ? 'ok' : 'idle'}`}>{connected ? 'Connected' : connecting ? 'Connecting' : 'Disconnected'}</span>
      </header>

      <main className="pure-grid">
        <section className="card controls">
          <h2>Session settings</h2>
          <p>Validates room connectivity and real-time path only, without Agent plugin.</p>

          <label htmlFor="room">Room name</label>
          <input
            id="room"
            value={roomName}
            onChange={(event) => setRoomName(event.target.value)}
            placeholder="pure-rtc-room"
          />

          <label htmlFor="identity">User identity (optional)</label>
          <input
            id="identity"
            value={identity}
            onChange={(event) => setIdentity(event.target.value)}
            placeholder="browser-dev"
          />

          <div className="actions">
            <button disabled={!canConnect} onClick={() => void connect()}>
              {connecting ? 'Connecting...' : 'Connect RTC'}
            </button>
            <button className="ghost" disabled={!connected && !connecting} onClick={() => void disconnect()}>
              Disconnect
            </button>
          </div>

          <dl>
            <dt>App ID</dt>
            <dd>{appId || 'Not configured'}</dd>
            <dt>Avatar ID</dt>
            <dd>{avatarId || 'Not configured'}</dd>
            <dt>LiveKit Client</dt>
            <dd>2.16.1</dd>
          </dl>
        </section>

        <section className="card stage-wrap">
          <h2>Avatar Stage</h2>
          <div className="stage" ref={stageRef} />
        </section>

        <section className="card logs">
          <h2>Runtime logs</h2>
          <ul>
            {logs.length === 0 && <li>Waiting for actions...</li>}
            {logs.map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}

export default App
