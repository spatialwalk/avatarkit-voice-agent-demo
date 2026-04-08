import {
  AvatarSDK,
  DrivingServiceMode,
  Environment,
  LogLevel,
} from '@spatialwalk/avatarkit'
import { createPlayground } from './views/playground'

function deriveHttpBase(wsUrl: string): string {
  const httpUrl = wsUrl.replace(/^ws(s?):\/\//, 'http$1://')
  return httpUrl.replace(/\/ws\/agent$/, '')
}

export function createApp(root: HTMLElement) {
  const app = document.createElement('div')
  app.className = 'app'
  root.appendChild(app)

  async function init() {
    app.innerHTML = '<div class="view active"><p style="text-align:center;padding:2rem;">Fetching server config...</p></div>'

    const wsUrl = import.meta.env.VITE_HOST_SERVER_WS || 'ws://localhost:8765/ws/agent'
    const httpBase = deriveHttpBase(wsUrl)

    let appId: string
    let environment: string

    try {
      const res = await fetch(`${httpBase}/api/config`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const config = await res.json()
      appId = config.appId
      environment = config.environment || 'intl'

      if (!appId) {
        throw new Error('Server returned empty appId')
      }
    } catch (e: any) {
      // Try /healthz to show which env vars are missing on the server
      let detail = e.message || 'Unknown error'
      try {
        const hz = await fetch(`${httpBase}/healthz`)
        const health = await hz.json()
        if (!health.ok && health.missing?.length) {
          detail += `. Server is missing env vars: ${health.missing.join(', ')}`
        }
      } catch { /* healthz also unreachable */ }

      app.innerHTML = `<div class="config-error"><a href="https://dash.spatialreal.ai" target="_blank" rel="noreferrer"><img src="/api-key-guide.png" alt="API Key Guide" style="max-width:100%;border-radius:10px;margin-bottom:16px" /></a><p>Failed to fetch config from <code>${httpBase}/api/config</code>: ${detail}</p></div>`
      return
    }

    app.innerHTML = '<div class="view active"><p style="text-align:center;padding:2rem;">Initializing SDK...</p></div>'

    const envMap: Record<string, Environment> = {
      intl: Environment.intl,
    }

    try {
      await AvatarSDK.initialize(appId, {
        environment: envMap[environment] ?? Environment.intl,
        drivingServiceMode: DrivingServiceMode.host,
        audioFormat: { channelCount: 1, sampleRate: 16000 },
        logLevel: LogLevel.all,
      })

      app.innerHTML = ''
      const wrap = document.createElement('div')
      wrap.className = 'view active'
      wrap.appendChild(createPlayground())
      app.appendChild(wrap)
    } catch (e: any) {
      app.innerHTML = `<div class="config-error">SDK initialization failed: ${e.message || 'Unknown error'}</div>`
    }
  }

  init()
}
