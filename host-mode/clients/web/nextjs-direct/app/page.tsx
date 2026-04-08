'use client'

import { useState, useEffect } from 'react'
import {
  AvatarSDK,
  DrivingServiceMode,
  Environment,
  LogLevel,
} from '@spatialwalk/avatarkit'
import Playground from '@/views/Playground'

export default function Home() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_HOST_SERVER_WS || 'ws://localhost:8765/ws/agent'
    const httpBase = wsUrl.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/ws\/agent$/, '')

    fetch(`${httpBase}/api/config`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Config endpoint returned ${res.status}`)
        const config = await res.json()
        if (!config.appId) throw new Error('Server returned empty appId')
        return config
      })
      .then((config) =>
        AvatarSDK.initialize(config.appId, {
          environment: config.environment === 'cn' ? Environment.cn : Environment.intl,
          drivingServiceMode: DrivingServiceMode.host,
          audioFormat: { channelCount: 1, sampleRate: 16000 },
          logLevel: LogLevel.all,
        })
      )
      .then(() => setReady(true))
      .catch(async (e: any) => {
        // Try /healthz to show which env vars are missing on the server
        try {
          const health = await fetch(`${httpBase}/healthz`).then((r) => r.json())
          if (!health.ok && health.missing?.length) {
            setError(`Server missing config: ${health.missing.join(', ')}`)
            return
          }
        } catch { /* healthz also unavailable */ }
        setError(e.message || 'SDK initialization failed')
      })
  }, [])

  if (error) {
    return (
      <div className="config-error" style={{ padding: 32, textAlign: 'center' }}>
        <a href="https://dash.spatialreal.ai" target="_blank" rel="noreferrer">
          <img src="/api-key-guide.png" alt="API Key Guide" style={{ maxWidth: '100%', borderRadius: 10, marginBottom: 16 }} />
        </a>
        <p>{error}</p>
      </div>
    )
  }

  if (!ready) {
    return <div style={{ textAlign: 'center', padding: '2rem' }}>Initializing SDK...</div>
  }

  return (
    <div className="app">
      <div className="view active">
        <Playground />
      </div>
    </div>
  )
}
