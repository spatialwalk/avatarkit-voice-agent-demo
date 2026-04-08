<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import type { AvatarController } from '@spatialwalk/avatarkit'
import type { AvatarInstance } from '../composables/useAvatarSDK'
import { MicrophonePcmCapture } from '../utils/audioCapture'

interface AvatarSlot {
  uid: string
  index: number
  name: string
}

const props = defineProps<{
  activeAvatar: AvatarInstance | null
  activeController: AvatarController | null
  multiMode?: boolean
  avatarSlots?: AvatarSlot[]
  activeUid?: string | null
}>()

const emit = defineEmits<{
  slotSelect: [uid: string]
}>()

const HOST_SERVER_URL = import.meta.env.VITE_HOST_SERVER_WS || 'ws://localhost:8765/ws/agent'
const SAMPLE_RATE = 16000

// Host mode state
const hostWs = ref<WebSocket | null>(null)
const hostConnected = ref(false)
const hostConnecting = ref(false)
const hostMicActive = ref(false)
const hostTextInput = ref('')
const hostTurnMap = new Map<string, string>()
let microphone: MicrophonePcmCapture | null = null

const hasAvatar = computed(() => props.activeAvatar?.view !== null && !props.activeAvatar?.loading)

function base64Decode(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function handleHostMessage(msg: any) {
  const type = msg.type
  if (type === 'ready') {
    hostConnected.value = true
    hostConnecting.value = false
    const avatarId = props.activeAvatar?.characterId || ''
    hostWs.value?.send(JSON.stringify({ type: 'set_avatar', avatarId }))
  } else if (type === 'avatar_audio') {
    const audioB64 = msg.audio || ''
    const turnId = msg.turnId
    const isLast = msg.isLast ?? false
    const audioBytes = audioB64 ? base64Decode(audioB64) : new Uint8Array(0)
    const localCid = (props.activeController as any).yieldAudioData(audioBytes, isLast)
    if (localCid && !hostTurnMap.has(turnId)) {
      hostTurnMap.set(turnId, localCid)
    }
  } else if (type === 'avatar_frames') {
    const frames = (msg.frames || []).map((b64: string) => base64Decode(b64))
    const localCid = hostTurnMap.get(msg.turnId)
    if (localCid && frames.length) {
      ;(props.activeController as any).yieldFramesData(frames, localCid)
    }
    if (msg.isLast) {
      hostTurnMap.delete(msg.turnId)
    }
  } else if (type === 'interrupt') {
    props.activeController?.interrupt()
    hostTurnMap.clear()
  } else if (type === 'error') {
    console.error('Host server error:', msg.message)
  }
}

async function hostConnect() {
  if (hostWs.value || hostConnecting.value) return
  hostConnecting.value = true
  try {
    await (props.activeController as any).initializeAudioContext()
  } catch (e) {
    console.error('Audio context init failed:', e)
    hostConnecting.value = false
    return
  }

  const ws = new WebSocket(HOST_SERVER_URL)
  hostWs.value = ws

  ws.onmessage = (event) => {
    let msg: any
    try { msg = JSON.parse(event.data) } catch { return }
    handleHostMessage(msg)
  }
  ws.onerror = () => {
    console.error('Host server connection failed')
    hostConnecting.value = false
    hostConnected.value = false
  }
  ws.onclose = () => {
    hostWs.value = null
    hostConnected.value = false
    hostConnecting.value = false
    hostMicActive.value = false
  }
}

function hostDisconnect() {
  if (microphone) { microphone.stop(); microphone = null; hostMicActive.value = false }
  if (hostWs.value) { hostWs.value.close(); hostWs.value = null }
  hostConnected.value = false
  hostTurnMap.clear()
}

async function toggleMic() {
  if (hostMicActive.value) {
    // Stop mic
    if (microphone) { await microphone.stop(); microphone = null }
    hostMicActive.value = false
    if (hostWs.value?.readyState === WebSocket.OPEN) {
      hostWs.value.send(JSON.stringify({ type: 'mic_end' }))
    }
  } else {
    // Start mic — auto-connect if needed
    if (!hostConnected.value) {
      await hostConnect()
      // Wait for ready
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (hostConnected.value) { clearInterval(check); resolve() }
        }, 100)
        setTimeout(() => { clearInterval(check); resolve() }, 3000)
      })
    }
    if (!hostConnected.value) return
    microphone = new MicrophonePcmCapture(SAMPLE_RATE)
    await microphone.start((chunk: Uint8Array) => {
      if (hostWs.value?.readyState === WebSocket.OPEN) {
        hostWs.value.send(JSON.stringify({ type: 'mic_audio', audio: bytesToBase64(chunk) }))
      }
    })
    hostMicActive.value = true
  }
}

async function sendTextQuery() {
  const text = hostTextInput.value.trim()
  if (!text) return
  if (!hostConnected.value) {
    await hostConnect()
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (hostConnected.value) { clearInterval(check); resolve() }
      }, 100)
      setTimeout(() => { clearInterval(check); resolve() }, 3000)
    })
  }
  if (hostWs.value?.readyState === WebSocket.OPEN) {
    hostWs.value.send(JSON.stringify({ type: 'text_query', text }))
    hostTextInput.value = ''
  }
}

const paused = ref(false)

function handlePauseResume() {
  if (paused.value) {
    props.activeController?.resume()
  } else {
    props.activeController?.pause()
  }
  paused.value = !paused.value
}

function handleInterrupt() {
  props.activeController?.interrupt()
  if (microphone) { microphone.stop(); microphone = null; hostMicActive.value = false }
  if (hostWs.value?.readyState === WebSocket.OPEN) {
    hostWs.value.send(JSON.stringify({ type: 'interrupt' }))
  }
  hostTurnMap.clear()
}

onUnmounted(() => {
  hostDisconnect()
})
</script>

<template>
  <div class="control-panel">
    <h3>Controls</h3>
    <!-- Status -->
    <div v-if="activeAvatar" class="status-bar">
      <div class="status-row">
        <span class="status-label">Server</span>
        <span class="status-value">{{ hostConnected ? 'connected' : hostConnecting ? 'connecting...' : 'disconnected' }}</span>
      </div>
      <div class="status-row">
        <span class="status-label">Conversation</span>
        <span class="status-value">{{ activeAvatar.conversationState }}</span>
      </div>
      <div v-if="activeAvatar.error" class="status-row error">
        <span class="status-label">Error</span>
        <span class="status-value error-text">{{ activeAvatar.error }}</span>
      </div>
    </div>

    <!-- Slot selector in multi mode -->
    <div v-if="multiMode && avatarSlots && avatarSlots.length > 0" class="slot-selector">
      <h4>Active Avatar</h4>
      <div class="slot-list">
        <button
          v-for="s in avatarSlots"
          :key="s.uid"
          :class="['slot-btn', { active: s.uid === activeUid }]"
          @click="emit('slotSelect', s.uid)"
        >
          <span class="slot-index">{{ s.index }}</span>
          <span class="slot-name">{{ s.name }}</span>
        </button>
      </div>
    </div>

    <p v-if="!hasAvatar" class="panel-hint">Load a character first</p>

    <!-- Host Mode -->
    <template v-if="hasAvatar">
      <div class="btn-row" style="margin-bottom: 8px;">
        <button
          v-if="!hostConnected"
          class="primary"
          :disabled="hostConnecting"
          @click="hostConnect"
        >
          {{ hostConnecting ? 'Connecting...' : 'Connect' }}
        </button>
        <button
          v-else
          class="secondary"
          @click="hostDisconnect"
        >
          Disconnect
        </button>
      </div>

      <button
        :class="['full-width', hostMicActive ? 'danger' : 'primary']"
        :disabled="!hasAvatar"
        @click="toggleMic"
      >
        {{ hostMicActive ? 'Stop Mic' : 'Start Mic' }}
      </button>

      <form class="host-text-form" @submit.prevent="sendTextQuery" style="margin-top: 8px;">
        <input
          v-model="hostTextInput"
          type="text"
          placeholder="Type a message..."
          class="host-text-input"
          :disabled="!hasAvatar"
        />
        <button type="submit" class="primary" :disabled="!hostTextInput.trim() || !hasAvatar">
          Send
        </button>
      </form>

      <p class="host-hint">
        Connects to <code>{{ HOST_SERVER_URL }}</code>.
        Using hostmode-demo backend — see <a href="https://github.com/spatialwalk/hostmode-demo" target="_blank">github.com/spatialwalk/hostmode-demo</a>.
      </p>
    </template>

    <!-- Common controls -->
    <div v-if="hasAvatar" class="btn-row">
      <button class="secondary" @click="handlePauseResume">{{ paused ? 'Resume' : 'Pause' }}</button>
      <button class="danger" @click="handleInterrupt">Interrupt</button>
    </div>
  </div>
</template>
