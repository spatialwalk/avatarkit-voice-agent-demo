import {
  AvatarSDK,
  DrivingServiceMode,
  Environment,
  LogLevel,
} from '@spatialwalk/avatarkit'

export interface AppConfig {
  appId: string
  sessionToken: string
  environment: Environment
}

const DASH_URL = 'https://dash.spatialreal.ai'
const STORAGE_KEY = 'avatarkit-playground-config'

function loadCached() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as { appId?: string; token?: string; env?: string }
  } catch { /* ignore */ }
  return {}
}

function saveCache(appId: string, token: string, env: string) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ appId, token, env })) } catch { /* ignore */ }
}

export function createConfiguration(
  onInitialized: (config: AppConfig) => void,
): HTMLElement {
  const cached = loadCached()
  let appId = cached.appId ?? ''
  let token = cached.token ?? ''
  let env: Environment = (cached.env as Environment) ?? Environment.intl
  let loading = false

  const el = document.createElement('div')
  el.className = 'config-view'
  function render() {
    el.innerHTML = `
      <div class="config-layout">
        <div class="config-container">
          <h1>Configuration</h1>
          <p class="config-subtitle">Mode: <strong>SDK</strong></p>
          <div class="config-form">
            <div class="field">
              <label>App ID <span class="required">*</span></label>
              <input id="cfg-appid" value="${appId}" placeholder="app_xxx" />
              <span class="field-hint">Get your App ID from the <a href="${DASH_URL}" target="_blank" rel="noreferrer">Developer Platform</a></span>
            </div>
            <div class="field">
              <label>Session Token <span class="required">*</span></label>
              <input id="cfg-token" type="password" value="${token}" placeholder="Your session token" />
              <span class="field-hint">Required for server communication in SDK mode</span>
            </div>
            <div class="field">
              <label>Environment</label>
              <select id="cfg-env">
                <option value="${Environment.intl}" ${env === Environment.intl ? 'selected' : ''}>International</option>
                <option value="${Environment.cn}" ${env === Environment.cn ? 'selected' : ''}>China</option>
              </select>
            </div>
            <div id="cfg-error"></div>
            <button class="primary init-btn" id="cfg-init" ${!canInit() || loading ? 'disabled' : ''}>
              ${loading ? 'Initializing...' : 'Initialize SDK'}
            </button>
          </div>
        </div>
        <a class="config-guide" href="${DASH_URL}" target="_blank" rel="noreferrer">
          <img src="/api-key-guide.png" alt="Where to find your App ID and Token" />
        </a>
      </div>
    `
    bind()
  }
  function canInit() { return appId.trim() && token.trim() }

  function bind() {
    const appInput = el.querySelector('#cfg-appid') as HTMLInputElement
    appInput.addEventListener('input', () => { appId = appInput.value; updateBtn() })
    const tokenInput = el.querySelector('#cfg-token') as HTMLInputElement
    tokenInput.addEventListener('input', () => { token = tokenInput.value; updateBtn() })
    const envSelect = el.querySelector('#cfg-env') as HTMLSelectElement
    envSelect.addEventListener('change', () => { env = envSelect.value as Environment })
    el.querySelector('#cfg-init')!.addEventListener('click', handleInit)
  }

  function updateBtn() {
    const btn = el.querySelector('#cfg-init') as HTMLButtonElement
    btn.disabled = !canInit() || loading
  }

  async function handleInit() {
    if (!canInit() || loading) return
    loading = true
    const btn = el.querySelector('#cfg-init') as HTMLButtonElement
    const errDiv = el.querySelector('#cfg-error') as HTMLElement
    btn.disabled = true
    btn.textContent = 'Initializing...'
    errDiv.innerHTML = ''
    try {
      await AvatarSDK.initialize(appId.trim(), {
        environment: env,
        drivingServiceMode: DrivingServiceMode.sdk,
        audioFormat: { channelCount: 1, sampleRate: 16000 },
        logLevel: LogLevel.all,
      })
      if (token.trim()) AvatarSDK.setSessionToken(token.trim())
      saveCache(appId.trim(), token.trim(), env)
      onInitialized({ appId: appId.trim(), sessionToken: token.trim(), environment: env })
    } catch (e: any) {
      errDiv.innerHTML = `<div class="config-error">${e.message || 'Initialization failed'}</div>`
      loading = false
      btn.disabled = false
      btn.textContent = 'Initialize SDK'
    }
  }

  render()
  return el
}
