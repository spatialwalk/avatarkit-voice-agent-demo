import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AvatarManager,
  AvatarSDK,
  AvatarView,
  DrivingServiceMode,
  Environment,
} from '@spatialwalk/avatarkit'

const readNumericEnv = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const pickRecorderMimeType = () => {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return ''
}

const hardBoundaryChars = new Set(['。', '！', '？', '.', '!', '?'])
const softBoundaryChars = new Set(['，', ',', '；', ';', '：', ':', '\n'])
const openBrackets = new Set(['(', '[', '{', '（', '【', '《', '「', '『', '“', '‘'])
const closeBrackets = new Set([')', ']', '}', '）', '】', '》', '」', '』', '”', '’'])

const minChunkChars = 18
const maxChunkChars = 72
const minChunkWords = 10
const maxChunkWords = 30
const minTailChars = 8
const minTailWords = 4

const countWords = (text: string) => text.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g)?.length ?? 0
const countCjkChars = (text: string) => text.match(/[\u3400-\u9FFF\uF900-\uFAFF]/g)?.length ?? 0

const reachesMinChunk = (text: string) => {
  const cjkChars = countCjkChars(text)
  const words = countWords(text)
  const plainChars = text.replace(/\s+/g, '').length
  return cjkChars >= minChunkChars || words >= minChunkWords || plainChars >= minChunkChars
}

const reachesMaxChunk = (text: string) => {
  const cjkChars = countCjkChars(text)
  const words = countWords(text)
  const plainChars = text.replace(/\s+/g, '').length
  return cjkChars >= maxChunkChars || words >= maxChunkWords || plainChars >= maxChunkChars
}

const hasUnclosedPairs = (text: string) => {
  let balance = 0
  for (const ch of text) {
    if (openBrackets.has(ch)) balance += 1
    if (closeBrackets.has(ch)) balance -= 1
  }
  return balance > 0
}

const isProtectedDot = (text: string, index: number) => {
  const prev = text[index - 1] ?? ''
  const next = text[index + 1] ?? ''

  const decimalLike = /\d/.test(prev) && /\d/.test(next)
  if (decimalLike) return true

  const prevToken = text.slice(0, index).match(/([A-Za-z]{1,4})$/)?.[1]
  const nextLetter = /[A-Za-z]/.test(next)
  if (prevToken && nextLetter) return true

  return false
}

const splitForTTS = (text: string, flushTail = false) => {
  // Continuity-first chunking: prefer natural punctuation to avoid fragmented speech.
  const sentences: string[] = []
  let carry = ''
  let preferredBreak = -1

  const pushSentence = (value: string) => {
    const sentence = value.trim()
    if (sentence) sentences.push(sentence)
  }

  const appendTailToLast = (tail: string) => {
    if (!sentences.length) {
      pushSentence(tail)
      return
    }
    const cleanedTail = tail.trim()
    if (!cleanedTail) return
    const prev = sentences[sentences.length - 1]
    const needSpace = /[A-Za-z0-9]$/.test(prev) && /^[A-Za-z0-9]/.test(cleanedTail)
    sentences[sentences.length - 1] = `${prev}${needSpace ? ' ' : ''}${cleanedTail}`
  }

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    carry += ch

    const hasOpenPair = hasUnclosedPairs(carry)
    const isHardBoundary = hardBoundaryChars.has(ch)
    const isSoftBoundary = softBoundaryChars.has(ch)

    if (isHardBoundary && !(ch === '.' && isProtectedDot(text, i)) && !hasOpenPair) {
      pushSentence(carry)
      carry = ''
      preferredBreak = -1
      continue
    }

    if (isSoftBoundary && reachesMinChunk(carry) && !hasOpenPair) {
      preferredBreak = carry.length
    }

    if (reachesMaxChunk(carry)) {
      if (preferredBreak > 0) {
        pushSentence(carry.slice(0, preferredBreak))
        carry = carry.slice(preferredBreak).trimStart()
        preferredBreak = -1
      } else if (!hasOpenPair && carry.length >= maxChunkChars + 40) {
        pushSentence(carry)
        carry = ''
      }
    }
  }

  if (flushTail) {
    const tail = carry.trim()
    if (tail) {
      const shortTail = countCjkChars(tail) < minTailChars && countWords(tail) < minTailWords && tail.replace(/\s+/g, '').length < minTailChars
      if (shortTail) {
        appendTailToLast(tail)
      } else {
        pushSentence(tail)
      }
    }
    carry = ''
  }

  return { sentences, carry }
}

const appId = import.meta.env.VITE_SPATIALREAL_APP_ID
const avatarId = import.meta.env.VITE_SPATIALREAL_AVATAR_ID
const openAIApiKey = import.meta.env.VITE_OPENAI_API_KEY || ''
const openAIModel = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini'
const openAISttModel = import.meta.env.VITE_OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe'
const openAISttLanguage = import.meta.env.VITE_OPENAI_STT_LANGUAGE || 'en'
const openAITtsModel = import.meta.env.VITE_OPENAI_TTS_MODEL || 'gpt-4o-mini-tts'
const openAITtsVoice = import.meta.env.VITE_OPENAI_TTS_VOICE || 'alloy'
// Higher threshold means less sensitivity, reducing noise-triggered false starts.
const vadStartThreshold = readNumericEnv(import.meta.env.VITE_VAD_START_THRESHOLD, 0.03)
const vadStopThreshold = readNumericEnv(import.meta.env.VITE_VAD_STOP_THRESHOLD, 0.02)
const vadSilenceMs = readNumericEnv(import.meta.env.VITE_VAD_SILENCE_MS, 700)
const vadMinSpeechMs = readNumericEnv(import.meta.env.VITE_VAD_MIN_SPEECH_MS, 280)

const envDocs = {
  keys: 'https://docs.spatialreal.ai/overview/get-apikeys',
  avatars: 'https://docs.spatialreal.ai/overview/test-avatars',
  openai: 'https://platform.openai.com/api-keys',
} as const

const placeholderByEnvKey: Record<string, string[]> = {
  VITE_SPATIALREAL_APP_ID: ['your_spatialreal_app_id', 'your_app_id', 'replace_me'],
  VITE_SPATIALREAL_AVATAR_ID: ['your_spatialreal_avatar_id', 'replace_me'],
  VITE_OPENAI_API_KEY: ['sk-your_openai_api_key', 'your_openai_api_key', 'replace_me'],
}

const friendlyEnvName: Record<string, string> = {
  VITE_SPATIALREAL_APP_ID: 'SpatialReal App ID',
  VITE_SPATIALREAL_AVATAR_ID: 'SpatialReal Avatar ID',
  VITE_OPENAI_API_KEY: 'OpenAI API Key',
}

const isPlaceholderEnvValue = (key: string, value: string) => {
  const normalized = value.trim().toLowerCase()
  const placeholders = placeholderByEnvKey[key] ?? []
  return placeholders.includes(normalized)
}

const inspectFrontendEnv = (keys: string[]) => {
  const missingKeys: string[] = []
  const placeholderKeys: string[] = []

  for (const key of keys) {
    const value = String((import.meta.env as Record<string, unknown>)[key] ?? '').trim()
    if (!value) {
      missingKeys.push(key)
      continue
    }
    if (isPlaceholderEnvValue(key, value)) {
      placeholderKeys.push(key)
    }
  }

  return { missingKeys, placeholderKeys }
}

const buildFrontendEnvErrorMessage = (missingKeys: string[], placeholderKeys: string[]) => {
  const toFriendly = (key: string) => `${friendlyEnvName[key] || key} (${key})`
  const details: string[] = ['Invalid web configuration: please check clients/web/.env.']

  if (missingKeys.length > 0) {
    details.push(`Missing: ${missingKeys.map(toFriendly).join(', ')}`)
  }
  if (placeholderKeys.length > 0) {
    details.push(`Placeholder values not replaced: ${placeholderKeys.map(toFriendly).join(', ')}`)
  }

  details.push(`Keys: ${envDocs.keys}`)
  details.push(`Test avatars: ${envDocs.avatars}`)
  details.push(`OpenAI Key：${envDocs.openai}`)
  return details.join(' | ')
}

function App() {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const avatarViewRef = useRef<AvatarView | null>(null)
  const initedRef = useRef(false)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recorderChunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const segmentActiveRef = useRef(false)
  const segmentStartAtRef = useRef(0)
  const speechFramesRef = useRef(0)
  const lastSpeechAtRef = useRef(0)
  const processingRef = useRef(false)
  const avatarSpeakingRef = useRef(false)
  const connectionStateRef = useRef<string>('disconnected')

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [logs, setLogs] = useState<Array<{ id: number; message: string; level: 'info' | 'error' }>>([])
  const [isListening, setIsListening] = useState(false)
  const [isConnectingConversation, setIsConnectingConversation] = useState(false)
  const logSeqRef = useRef(0)

  const pushLog = useCallback((value: string, level: 'info' | 'error' = 'info') => {
    const tag = level === 'error' ? '[ERROR]' : '[INFO]'
    setLogs((prev) => ([{
      id: logSeqRef.current += 1,
      message: `${new Date().toLocaleTimeString()} ${tag} ${value}`,
      level,
    }, ...prev]).slice(0, 50))
  }, [])

  // ── teardown ──

  const stopMicrophone = useCallback((discard = false) => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      if (discard) { recorder.ondataavailable = null; recorder.onstop = null; recorderChunksRef.current = [] }
      recorder.stop()
    }
    recorderRef.current = null
    segmentActiveRef.current = false
    speechFramesRef.current = 0
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null }
    analyserRef.current = null
    if (audioContextRef.current) { const c = audioContextRef.current; audioContextRef.current = null; void c.close().catch(() => undefined) }
    setIsListening(false)
  }, [])

  const teardown = useCallback(() => {
    stopMicrophone(true)
    const controller = (avatarViewRef.current as any)?.controller
    if (controller) {
      controller.onConnectionState = null
      controller.onConversationState = null
    }
    connectionStateRef.current = 'disconnected'
    avatarSpeakingRef.current = false
    setIsConnectingConversation(false)
    try { avatarViewRef.current?.dispose?.() } catch { /* ignore */ }
    avatarViewRef.current = null
  }, [stopMicrophone])

  // ── session token ──

  const fetchSessionToken = useCallback(async () => {
    pushLog('Fetching Session Token...')
    const response = await fetch('/session-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId }),
    })
    if (!response.ok) throw new Error(await response.text())
    const data = await response.json()
    pushLog('Session Token fetched successfully')
    return data.sessionToken || data.sessionKey || data.token
  }, [pushLog])

  // ── initialize ──

  const initialize = useCallback(async () => {
    if (!stageRef.current) {
      setStatus('error')
      setErrorMsg('Initialization failed: container is not ready. Refresh and retry.')
      pushLog('Initialization failed: container is not ready. Refresh and retry.', 'error')
      return
    }

    const { missingKeys, placeholderKeys } = inspectFrontendEnv([
      'VITE_SPATIALREAL_APP_ID',
      'VITE_SPATIALREAL_AVATAR_ID',
    ])
    if (missingKeys.length > 0 || placeholderKeys.length > 0) {
      const msg = buildFrontendEnvErrorMessage(missingKeys, placeholderKeys)
      setStatus('error')
      setErrorMsg(msg)
      pushLog(msg, 'error')
      return
    }

    if (!appId || !avatarId) {
      const msg = 'Initialization failed: VITE_SPATIALREAL_APP_ID or VITE_SPATIALREAL_AVATAR_ID is empty'
      setStatus('error')
      setErrorMsg(msg)
      pushLog(msg, 'error')
      return
    }

    try {
      setStatus('loading')
      pushLog('Initializing...')
      teardown()

      const token = await fetchSessionToken()
      if (!AvatarSDK.isInitialized) {
        pushLog('Initializing AvatarSDK...')
        await AvatarSDK.initialize(appId, {
          environment: Environment.intl,
          drivingServiceMode: (DrivingServiceMode as any).sdk ?? 'network',
          audioFormat: {
            channelCount: 1,
            sampleRate: 24000,
          },
        })
      }
      AvatarSDK.setSessionToken?.(token)

      const manager = AvatarManager.shared
      if (!manager) throw new Error('AvatarManager is not ready')

      pushLog(`Loading avatar: ${avatarId}`)
      const avatar = await manager.load(avatarId)
      const view = new AvatarView(avatar, stageRef.current)
      avatarViewRef.current = view
      const controller = (view as any)?.controller
      if (controller) {
        controller.onConnectionState = (state: string, error?: Error) => {
          const prevState = connectionStateRef.current
          connectionStateRef.current = state
          if (state !== prevState) {
            pushLog(`Connection state: ${state}`)
          }
          if (state === 'disconnected' && error) {
            pushLog(`Connection failed: ${error.message}`, 'error')
          }
        }

        // Use SDK callbacks as the source of speaking state.
        // SpatialReal Web SDK API: https://docs.spatialreal.ai/web-sdk/api-reference
        controller.onConversationState = (state: string) => {
          if (state === 'playing' && !avatarSpeakingRef.current) {
            avatarSpeakingRef.current = true
            pushLog('Avatar started speaking')
            return
          }
          if (state === 'idle' && avatarSpeakingRef.current) {
            avatarSpeakingRef.current = false
            pushLog('Avatar finished speaking')
          }
        }
      }

      setStatus('ready')
      pushLog('Avatar loaded. Click "Start Conversation" to begin the voice pipeline')
    } catch (error) {
      const msg = (error as Error).message
      setStatus('error')
      setErrorMsg(msg)
      pushLog(`Initialization failed: ${msg}`, 'error')
      teardown()
    }
  }, [fetchSessionToken, pushLog, teardown])

  const waitForConnectionReady = useCallback(async (timeoutMs = 12000) => {
    const startAt = Date.now()
    let sawConnecting = connectionStateRef.current === 'connecting'
    while (Date.now() - startAt < timeoutMs) {
      const state = connectionStateRef.current
      if (state === 'connected') return true
      if (state === 'connecting') sawConnecting = true
      if (sawConnecting && state === 'disconnected') return false
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 80)
      })
    }
    return connectionStateRef.current === 'connected'
  }, [])

  // ── ASR ──

  const transcribe = useCallback(async (audioBlob: Blob) => {
    // OpenAI Transcriptions API:
    // https://platform.openai.com/docs/api-reference/audio/createTranscription
    const formData = new FormData()
    const ext = audioBlob.type.includes('mp4') ? 'm4a' : 'webm'
    formData.append('file', audioBlob, `speech.${ext}`)
    formData.append('model', openAISttModel)
    formData.append('language', openAISttLanguage)
    const res = await fetch('/openai-api/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAIApiKey}` },
      body: formData,
    })
    if (!res.ok) throw new Error(`ASR failed: ${await res.text()}`)
    const data = await res.json()
    return data?.text?.trim() || ''
  }, [])

  // ── LLM ──

  const runLLMStream = useCallback(async (text: string, onDelta: (chunk: string) => void) => {
    // OpenAI Chat Completions SSE streaming parser:
    // https://platform.openai.com/docs/api-reference/chat/create
    const res = await fetch('/openai-api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAIApiKey}` },
      body: JSON.stringify({
        model: openAIModel,
        stream: true,
        messages: [
          { role: 'system', content: 'You are concise and natural for spoken avatar conversation.' },
          { role: 'user', content: text },
        ],
      }),
    })
    if (!res.ok) throw new Error(`LLM failed: ${await res.text()}`)

    if (!res.body) {
      const data = await res.json()
      const full = data?.choices?.[0]?.message?.content?.trim() || ''
      if (full) onDelta(full)
      return full || "Sorry, I don't have a result right now."
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let sseBuffer = ''
    let fullReply = ''

    const handleSSELine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) return

      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') return

      try {
        const parsed = JSON.parse(payload)
        const delta = parsed?.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta.length > 0) {
          fullReply += delta
          onDelta(delta)
        }
      } catch {
        // Ignore non-JSON SSE lines
      }
    }

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      sseBuffer += decoder.decode(value, { stream: true })
      const lines = sseBuffer.split('\n')
      sseBuffer = lines.pop() || ''
      for (const line of lines) handleSSELine(line)
    }

    sseBuffer += decoder.decode()
    if (sseBuffer) {
      for (const line of sseBuffer.split('\n')) handleSSELine(line)
    }

    const normalized = fullReply.trim()
    return normalized || "Sorry, I don't have a result right now."
  }, [])

  // ── TTS ──

  const synthesize = useCallback(async (text: string) => {
    // OpenAI Speech API (response_format=pcm):
    // https://platform.openai.com/docs/api-reference/audio/createSpeech
    console.log('[TTS] Request start, text:', text)
    const res = await fetch('/openai-api/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openAIApiKey}` },
      body: JSON.stringify({ model: openAITtsModel, voice: openAITtsVoice, input: text, response_format: 'pcm' }),
    })
    if (!res.ok) throw new Error(`TTS failed: ${await res.text()}`)
    const buf = await res.arrayBuffer()
    console.log('[TTS] Raw data:', buf.byteLength, 'bytes, Content-Type:', res.headers.get('content-type'))

    // OpenAI pcm: 24kHz 16-bit signed LE mono
    const view = new DataView(buf)
    const sampleCount = Math.floor(buf.byteLength / 2)
    console.log('[TTS] 24kHz sample count:', sampleCount, 'duration:', (sampleCount / 24000).toFixed(2) + 's')

    const pcm24k = new Int16Array(sampleCount)
    for (let i = 0; i < sampleCount; i++) {
      pcm24k[i] = view.getInt16(i * 2, true)
    }
    return pcm24k
  }, [])

  // ── Full conversation round: ASR -> LLM -> TTS -> Avatar ──

  const processSegment = useCallback(async (audioBlob: Blob) => {
    if (!audioBlob.size || processingRef.current) return
    processingRef.current = true
    try {
      pushLog(`Speech segment ${Math.round(audioBlob.size / 1024)}KB, starting ASR...`)
      const text = await transcribe(audioBlob)
      if (!text) { pushLog('ASR did not return valid text'); return }
      pushLog(`ASR transcript: "${text}"`)

      const controller = (avatarViewRef.current as any)?.controller
      if (controller) {
        await controller.initializeAudioContext()
      } else {
        console.warn('[Avatar] controller not found')
        pushLog('Avatar controller unavailable, skipping playback')
        return
      }

      pushLog('Calling LLM (streaming)...')
      let pending = ''
      let nextSentenceIndex = 0
      let nextSendIndex = 0
      let llmFinished = false
      let wakeSender: (() => void) | null = null
      const ttsTasks = new Map<number, Promise<Int16Array>>()

      const wake = () => {
        if (!wakeSender) return
        const cb = wakeSender
        wakeSender = null
        cb()
      }

      const waitForTask = () => new Promise<void>((resolve) => { wakeSender = resolve })
      const enqueueSentence = (sentence: string) => {
        const index = nextSentenceIndex
        nextSentenceIndex += 1
        const task = synthesize(sentence)
        ttsTasks.set(index, task)
        wake()
      }

      const sendInOrder = async () => {
        // TTS can run in parallel, but sending to Avatar must follow strict index order.
        while (!llmFinished || nextSendIndex < nextSentenceIndex) {
          if (!ttsTasks.has(nextSendIndex)) {
            await waitForTask()
            continue
          }

          const task = ttsTasks.get(nextSendIndex)
          if (!task) continue
          const currentIndex = nextSendIndex
          const pcm = await task
          // Flush only on the last chunk to avoid fragmented playback.
          const shouldFlush = llmFinished && currentIndex === nextSentenceIndex - 1
          controller.send(pcm.buffer, shouldFlush)
          ttsTasks.delete(currentIndex)
          nextSendIndex += 1
        }
      }

      const sendPromise = sendInOrder()
      const reply = await runLLMStream(text, (chunk) => {
        pending += chunk
        const { sentences, carry } = splitForTTS(pending, false)
        pending = carry
        for (const sentence of sentences) enqueueSentence(sentence)
      })

      const { sentences: tailSentences } = splitForTTS(pending, true)
      for (const sentence of tailSentences) enqueueSentence(sentence)
      llmFinished = true
      wake()
      await sendPromise

      pushLog(`LLM reply: "${reply}"`)
    } catch (error) {
      pushLog(`Conversation failed: ${(error as Error).message}`, 'error')
    } finally {
      processingRef.current = false
    }
  }, [pushLog, runLLMStream, synthesize, transcribe])

  // ── VAD + Recording ──

  const stopSegment = useCallback((discard = false) => {
    const recorder = recorderRef.current
    if (!recorder) { segmentActiveRef.current = false; return }
    segmentActiveRef.current = false
    recorderRef.current = null
    if (discard) {
      recorder.ondataavailable = null
      recorder.onstop = null
      recorderChunksRef.current = []
    }
    if (recorder.state !== 'inactive') recorder.stop()
  }, [])

  const beginSegment = useCallback(() => {
    const stream = streamRef.current
    if (!stream || segmentActiveRef.current) return
    try {
      const mimeType = pickRecorderMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      recorderChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recorderChunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const dur = performance.now() - segmentStartAtRef.current
        const chunks = recorderChunksRef.current; recorderChunksRef.current = []
        if (dur < vadMinSpeechMs || !chunks.length) { pushLog('Speech segment too short, ignored'); return }
        void processSegment(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }))
      }
      segmentActiveRef.current = true
      segmentStartAtRef.current = performance.now()
      lastSpeechAtRef.current = segmentStartAtRef.current
      recorderRef.current = recorder
      recorder.start(120)
      pushLog('Speech detected, recording started...')
    } catch (error) {
      pushLog(`Failed to start recording: ${(error as Error).message}`, 'error')
    }
  }, [processSegment, pushLog])

  const startVadLoop = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return
    const buffer = new Float32Array(analyser.fftSize)
    const step = () => {
      const a = analyserRef.current
      if (!a) return

      // Pause VAD while avatar is speaking or processing to avoid feedback into ASR
      if (processingRef.current || avatarSpeakingRef.current) {
        if (segmentActiveRef.current) {
          stopSegment(true)
        }
        speechFramesRef.current = 0
        rafRef.current = window.requestAnimationFrame(step)
        return
      }

      a.getFloatTimeDomainData(buffer)
      let sum = 0
      for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
      const rms = Math.sqrt(sum / buffer.length)
      const now = performance.now()
      const threshold = segmentActiveRef.current ? vadStopThreshold : vadStartThreshold
      if (rms >= threshold) {
        speechFramesRef.current += 1
        lastSpeechAtRef.current = now
        if (!segmentActiveRef.current && speechFramesRef.current >= 3) beginSegment()
      } else {
        speechFramesRef.current = 0
        if (segmentActiveRef.current && now - lastSpeechAtRef.current >= vadSilenceMs) {
          pushLog('Silence detected, recording finished')
          stopSegment()
        }
      }
      rafRef.current = window.requestAnimationFrame(step)
    }
    rafRef.current = window.requestAnimationFrame(step)
  }, [beginSegment, stopSegment, pushLog])

  // ── Start / Stop Conversation ──

  const startConversation = useCallback(async () => {
    if (isListening || isConnectingConversation) return
    const { missingKeys, placeholderKeys } = inspectFrontendEnv(['VITE_OPENAI_API_KEY'])
    if (missingKeys.length > 0 || placeholderKeys.length > 0) {
      pushLog(buildFrontendEnvErrorMessage(missingKeys, placeholderKeys), 'error')
      return
    }
    if (!openAIApiKey.trim()) { pushLog('Missing VITE_OPENAI_API_KEY configuration', 'error'); return }
    setIsConnectingConversation(true)
    try {
      // Initialize Avatar AudioContext inside a user gesture (Chrome requirement)
      const controller = (avatarViewRef.current as any)?.controller
      if (!controller) {
        throw new Error('Avatar controller unavailable, cannot establish connection')
      }

      await controller.initializeAudioContext()
      if (connectionStateRef.current !== 'connected') {
        pushLog('Authenticating and establishing connection...')
        await controller.start()
        const connected = await waitForConnectionReady()
        if (!connected) {
          throw new Error('Authentication failed or connection timed out. Check Session Token.')
        }
        pushLog('Authentication succeeded, connection established')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      const context = new AudioCtx()
      if (context.state === 'suspended') await context.resume()
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.1
      source.connect(analyser)

      streamRef.current = stream
      audioContextRef.current = context
      analyserRef.current = analyser
      speechFramesRef.current = 0
      lastSpeechAtRef.current = performance.now()

      setIsListening(true)
      startVadLoop()
      pushLog('Microphone started, waiting for speech...')
    } catch (error) {
      pushLog(`Failed to start microphone: ${(error as Error).message}`, 'error')
      stopMicrophone(true)
    } finally {
      setIsConnectingConversation(false)
    }
  }, [isConnectingConversation, isListening, pushLog, startVadLoop, stopMicrophone, waitForConnectionReady])

  const stopConversation = useCallback(() => {
    if (!isListening) return
    stopMicrophone(false)
    pushLog('Conversation stopped')
  }, [isListening, pushLog, stopMicrophone])

  // ── mount: initialize only after DOM is ready ──

  useEffect(() => {
    if (initedRef.current) return
    initedRef.current = true
    // useEffect runs after render, ensuring stageRef is mounted
    void initialize()
    return () => teardown()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canStartConversation = status === 'ready'
  const talkButtonDisabled = !isListening && (!canStartConversation || isConnectingConversation)
  const talkButtonText = isListening
    ? 'End Conversation'
    : isConnectingConversation
      ? 'Authenticating...'
    : status === 'loading'
      ? 'Loading...'
      : status === 'error'
        ? 'Initialization failed'
        : 'Start Conversation'

  return (
    <div className="sdk-shell">
      <header className="sdk-header">
        <div>
          <p className="kicker">SpatialReal SDK Mode</p>
          <h1>Avatar Demo</h1>
        </div>
        <div className="header-actions">
          <span className={`chip ${status === 'ready' ? 'ok' : status === 'error' ? 'err' : 'idle'}`}>
            {status === 'ready' ? 'Ready' : status === 'error' ? 'Load failed' : 'Loading...'}
          </span>
        </div>
      </header>

      <section className="stage-card">
        <div className="stage" ref={stageRef} />
        <button
          className={isListening ? 'talk-btn active' : 'talk-btn'}
          onClick={() => void (isListening ? stopConversation() : startConversation())}
          disabled={talkButtonDisabled}
        >
          {talkButtonText}
        </button>
        {status === 'error' && (
          <div className="error-overlay">
            <p>{errorMsg}</p>
            <button onClick={initialize}>Retry</button>
          </div>
        )}
      </section>

      <section className="log-card">
        <h2>Runtime Logs</h2>
        <ul className="logs">
          {logs.length === 0 && <li className="placeholder">Waiting for actions...</li>}
          {logs.map((entry) => (
            <li key={entry.id} className={entry.level === 'error' ? 'error' : ''}>{entry.message}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default App
