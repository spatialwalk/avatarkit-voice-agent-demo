import cors from 'cors'
import dotenv from 'dotenv'
import express, { type Request, type Response } from 'express'

const dotenvResult = dotenv.config()
const dotenvMissing = Boolean((dotenvResult.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT')
const envPlaceholderValues = new Set([
  'your_spatialreal_api_key',
  'your_spatialreal_app_id',
  'your_api_key',
  'your_app_id',
  'replace_me',
])

const docsLinks = {
  keys: 'https://docs.spatialreal.ai/overview/get-apikeys',
  auth: 'https://docs.spatialreal.ai/server/auth.md',
} as const

type JsonRecord = Record<string, unknown>
type SessionTokenRequestBody = {
  appId?: string
}

const app = express()
app.use(cors())
app.use(express.json())

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' ? (value as JsonRecord) : null
}

function readToken(container: JsonRecord): string | null {
  const directKeys = ['sessionKey', 'sessionToken', 'token'] as const

  for (const key of directKeys) {
    const value = container[key]
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }

  return null
}

function extractToken(payload: unknown): string | null {
  const root = asRecord(payload)
  if (!root) {
    return null
  }

  const rootToken = readToken(root)
  if (rootToken) {
    return rootToken
  }

  const data = asRecord(root.data)
  if (!data) {
    return null
  }

  return readToken(data)
}

function parseBool(value: string | undefined, fallback = false): boolean {
  if (typeof value !== 'string') return fallback
  if (value.toLowerCase() === 'true') return true
  if (value.toLowerCase() === 'false') return false
  return fallback
}

function parseIntSafe(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

function isPlaceholder(value: string | undefined): boolean {
  if (!value) return false
  return envPlaceholderValues.has(value.trim().toLowerCase())
}

function buildEnvError(opts: {
  missingEnvFile: boolean
  missingKeys: string[]
  placeholderKeys: string[]
}) {
  const { missingEnvFile, missingKeys, placeholderKeys } = opts
  return {
    error: 'invalid_server_env',
    message: 'Invalid token server configuration: create .env and replace placeholder values.',
    missingEnvFile,
    missingKeys,
    placeholderKeys,
    docs: docsLinks,
  }
}

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' })
})

app.post('/session-token', async (req: Request<unknown, unknown, SessionTokenRequestBody>, res: Response) => {
  const mockMode = parseBool(process.env.TOKEN_MOCK_MODE, false)
  if (mockMode) {
    const expiredAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    res.json({ sessionToken: 'mock-session-token', expiredAt, mock: true })
    return
  }

  const appIdFromBody = req.body?.appId?.trim() || ''
  const appIdFromEnv = process.env.SPATIALREAL_APP_ID?.trim() || ''
  const apiKey = process.env.SPATIALREAL_API_KEY?.trim() || ''

  const missingKeys: string[] = []
  const placeholderKeys: string[] = []
  if (!apiKey) {
    missingKeys.push('SPATIALREAL_API_KEY')
  } else if (isPlaceholder(apiKey)) {
    placeholderKeys.push('SPATIALREAL_API_KEY')
  }

  if (!appIdFromBody) {
    if (!appIdFromEnv) {
      missingKeys.push('SPATIALREAL_APP_ID')
    } else if (isPlaceholder(appIdFromEnv)) {
      placeholderKeys.push('SPATIALREAL_APP_ID')
    }
  }

  if (dotenvMissing || missingKeys.length > 0 || placeholderKeys.length > 0) {
    res.status(500).json(buildEnvError({
      missingEnvFile: dotenvMissing,
      missingKeys,
      placeholderKeys,
    }))
    return
  }

  const appId = appIdFromBody || appIdFromEnv
  if (!appId) {
    res.status(400).json({ error: 'missing_app_id' })
    return
  }

  const ttlMinutes = parseIntSafe(process.env.SESSION_TOKEN_TTL_MINUTES, 55)
  const endpoint = (process.env.SPATIALREAL_CONSOLE_ENDPOINT || 'https://console.spatialreal.ai/v1/console').replace(/\/$/, '')
  const expireAt = Math.floor((Date.now() + ttlMinutes * 60 * 1000) / 1000)

  const url = `${endpoint}/session-tokens`
  const requestBody = { appId, expire_at: expireAt }
  console.log(`[session-token] POST ${url}`)
  console.log(`[session-token] request body:`, JSON.stringify(requestBody))

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify(requestBody),
    })

    const text = await response.text()
    console.log(`[session-token] response status: ${response.status}`)
    console.log(`[session-token] response body: ${text}`)
    const payload = text ? JSON.parse(text) : {}

    if (!response.ok) {
      console.error(`[session-token] upstream error: ${response.status} ${text}`)
      res.status(502).json({ error: 'session_token_request_failed', detail: text })
      return
    }

    const token = extractToken(payload)
    if (!token) {
      console.error(`[session-token] token not found in payload:`, JSON.stringify(payload))
      res.status(502).json({ error: 'session_token_missing', payload })
      return
    }

    console.log(`[session-token] success, token length: ${token.length}`)
    res.json({ sessionToken: token, expiredAt: new Date(expireAt * 1000).toISOString() })
  } catch (error) {
    console.error(`[session-token] fetch error:`, error)
    res.status(502).json({ error: 'session_token_request_failed', detail: String(error) })
  }
})

const port = parseIntSafe(process.env.TOKEN_SERVER_PORT, 8090)
app.listen(port, () => {
  console.log(`sdk token node server listening on :${port}`)
})
