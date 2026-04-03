import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AvatarManager,
  AvatarSDK,
  AvatarView,
  DrivingServiceMode,
  Environment,
} from '@spatialwalk/avatarkit'

type PipelineResponse = {
  transcript: string
  reply: string
  audioPcm16Base64: string
  audioSampleRate: number
  frameMessagesBase64: string[]
}

const appId = import.meta.env.VITE_SPATIALREAL_APP_ID
const avatarId = import.meta.env.VITE_SPATIALREAL_AVATAR_ID

function App() {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const avatarViewRef = useRef<AvatarView | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const [ready, setReady] = useState(false)
  const [recording, setRecording] = useState(false)
  const [loading, setLoading] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [transcript, setTranscript] = useState('')
  const [reply, setReply] = useState('')
  const [logs, setLogs] = useState<string[]>([])

  const pushLog = useCallback((msg: string) => {
    setLogs((prev) => [`${new Date().toLocaleTimeString()} ${msg}`, ...prev].slice(0, 30))
  }, [])

  const decodeBase64 = useCallback((base64: string) => {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }, [])

  const playPcmFallback = useCallback(async (pcm: Int16Array, sampleRate: number) => {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    const context = new AudioCtx()
    const buffer = context.createBuffer(1, pcm.length, sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < pcm.length; i += 1) {
      channel[i] = pcm[i] / 32768
    }

    const src = context.createBufferSource()
    src.buffer = buffer
    src.connect(context.destination)
    src.start(0)
  }, [])

  const teardown = useCallback(() => {
    try {
      avatarViewRef.current?.dispose?.()
    } catch {
      // ignore
    }
    avatarViewRef.current = null
    setReady(false)

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    mediaRecorderRef.current = null
  }, [])

  const initializeHost = useCallback(async () => {
    if (!stageRef.current || !appId || !avatarId) {
      pushLog('Missing App/Avatar configuration')
      return
    }

    try {
      teardown()
      setLoading(true)
      pushLog('Requesting session token...')

      const tokenResp = await fetch('/api/session-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appId }),
      })

      if (!tokenResp.ok) {
        throw new Error(await tokenResp.text())
      }

      const tokenJson = await tokenResp.json()
      const token = tokenJson.sessionToken || tokenJson.sessionKey || tokenJson.token

      if (!AvatarSDK.isInitialized) {
        await AvatarSDK.initialize(appId, {
          environment: Environment.intl,
          drivingServiceMode: DrivingServiceMode.host,
        })
      }
      AvatarSDK.setSessionToken?.(token)

      const manager = AvatarManager.shared
      if (!manager) {
        throw new Error('AvatarManager is not ready')
      }

      const avatar = await manager.load(avatarId)
      const view = new AvatarView(avatar, stageRef.current)
      avatarViewRef.current = view
      const controller = (view as any).controller
      await controller.initializeAudioContext()

      setReady(true)
      pushLog('Host mode initialization completed')
    } catch (error) {
      pushLog(`Initialization failed: ${(error as Error).message}`)
      teardown()
    } finally {
      setLoading(false)
    }
  }, [pushLog, teardown])

  const sendText = useCallback(async () => {
    if (!ready || !textInput.trim()) {
      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/pipeline/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_text: textInput.trim() }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const payload = (await response.json()) as PipelineResponse
      setTranscript(payload.transcript)
      setReply(payload.reply)
      setTextInput('')
      await renderHostPayload(payload)
    } catch (error) {
      pushLog(`Text pipeline failed: ${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [ready, textInput])

  const renderHostPayload = useCallback(
    async (payload: PipelineResponse) => {
      if (!avatarViewRef.current) {
        return
      }

      const pcmBytes = decodeBase64(payload.audioPcm16Base64)
      const pcm = new Int16Array(pcmBytes.buffer.slice(0))
      const controller = (avatarViewRef.current as any).controller
      const conversationId = controller.yieldAudioData(pcm, true)
      pushLog(`Host audio submitted, conversationId: ${conversationId}`)

      if (payload.frameMessagesBase64.length > 0) {
        for (const frameBase64 of payload.frameMessagesBase64) {
          const frame = decodeBase64(frameBase64)
          controller.yieldFramesData(frame, conversationId)
        }
        pushLog(`Frame messages delivered: ${payload.frameMessagesBase64.length}`)
      } else {
        pushLog('Backend returned no frame messages, fallback to audio-only playback')
        await playPcmFallback(pcm, payload.audioSampleRate || 16000)
      }
    },
    [decodeBase64, playPcmFallback, pushLog],
  )

  const startRecording = useCallback(async () => {
    if (!ready || recording) {
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const bytes = await blob.arrayBuffer()
        const b64 = btoa(String.fromCharCode(...new Uint8Array(bytes)))

        setLoading(true)
        try {
          const response = await fetch('/api/pipeline/respond', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              input_audio_base64: b64,
              input_audio_mime: blob.type || 'audio/webm',
            }),
          })

          if (!response.ok) {
            throw new Error(await response.text())
          }

          const payload = (await response.json()) as PipelineResponse
          setTranscript(payload.transcript)
          setReply(payload.reply)
          await renderHostPayload(payload)
        } catch (error) {
          pushLog(`Voice pipeline failed: ${(error as Error).message}`)
        } finally {
          setLoading(false)
        }
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
      pushLog('Recording started...')
    } catch (error) {
      pushLog(`Failed to start recording: ${(error as Error).message}`)
    }
  }, [ready, recording, pushLog, renderHostPayload])

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state !== 'recording') {
      return
    }
    recorder.stop()
    setRecording(false)
    pushLog('Recording finished, sending to backend...')
  }, [pushLog])

  const status = useMemo(() => {
    if (loading) return 'Processing'
    if (recording) return 'Recording'
    return ready ? 'Ready' : 'Not initialized'
  }, [loading, recording, ready])

  useEffect(() => {
    return () => teardown()
  }, [teardown])

  return (
    <div className="host-shell">
      <header className="host-header">
        <div>
          <p className="eyebrow">SpatialReal Host Mode</p>
          <h1>Backend Pipeline Console</h1>
        </div>
        <div className="header-actions">
          <span className="pill">Status: {status}</span>
          <button onClick={initializeHost} disabled={loading}>
            Initialize Host Avatar
          </button>
        </div>
      </header>

      <main className="host-grid">
        <section className="panel stage-panel">
          <div className="title-row">
            <h2>Avatar Stage</h2>
            <small>ASR -&gt; LLM -&gt; TTS -&gt; Host Frames</small>
          </div>
          <div className="stage" ref={stageRef} />
        </section>

        <section className="panel control-panel">
          <h2>Input Channel</h2>
          <p className="muted">Supports direct text input (skip ASR) and microphone input (full pipeline).</p>

          <textarea
            value={textInput}
            onChange={(event) => setTextInput(event.target.value)}
            placeholder="Enter text, backend will run LLM + TTS + Host bridge"
          />
          <button onClick={() => void sendText()} disabled={!ready || loading || !textInput.trim()}>
            Send Text
          </button>

          <div className="record-row">
            <button onClick={() => void startRecording()} disabled={!ready || recording || loading}>
              Start Recording
            </button>
            <button onClick={stopRecording} disabled={!recording || loading}>
              Stop and Send
            </button>
          </div>

          <dl>
            <dt>App ID</dt>
            <dd>{appId || 'Not configured'}</dd>
            <dt>Avatar ID</dt>
            <dd>{avatarId || 'Not configured'}</dd>
          </dl>
        </section>

        <section className="panel result-panel">
          <h2>Results</h2>
          <div className="bubble">
            <strong>ASR Transcript</strong>
            <p>{transcript || 'N/A'}</p>
          </div>
          <div className="bubble">
            <strong>Assistant Reply</strong>
            <p>{reply || 'N/A'}</p>
          </div>
        </section>

        <section className="panel log-panel">
          <h2>Logs</h2>
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
