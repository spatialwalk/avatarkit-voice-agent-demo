<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { Room } from 'livekit-client'
import {
  AvatarManager,
  AvatarSDK,
  AvatarView,
  DrivingServiceMode,
  Environment,
} from '@spatialwalk/avatarkit'
import { AvatarPlayer, LiveKitProvider } from '@spatialwalk/avatarkit-rtc'

const container = ref<HTMLDivElement | null>(null)
const status = ref('Click Connect to start')
const connecting = ref(false)
const connected = ref(false)
const micOn = ref(false)

let avatarView: AvatarView | null = null
let player: AvatarPlayer | null = null
let roomClient: Room | null = null

async function connect(): Promise<void> {
  if (connecting.value || connected.value) return
  connecting.value = true
  status.value = 'Requesting token...'

  try {
    const response = await fetch(import.meta.env.VITE_TOKEN_ENDPOINT || '/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: 'voice-agent-room' }),
    })
    if (!response.ok) throw new Error('Failed to fetch token')

    const { token, url, room } = await response.json()

    if (!AvatarSDK.isInitialized) {
      await AvatarSDK.initialize(import.meta.env.VITE_SPATIALREAL_APP_ID, {
        environment: Environment.intl,
        drivingServiceMode: DrivingServiceMode.host,
      })
    }

    await nextTick()
    const mountEl = container.value
    if (!mountEl) throw new Error('Avatar container is not ready')

    await player?.disconnect().catch(() => undefined)
    avatarView?.dispose()

    const avatar = await AvatarManager.shared.load(import.meta.env.VITE_SPATIALREAL_AVATAR_ID)
    avatarView = new AvatarView(avatar, mountEl)
    player = new AvatarPlayer(new LiveKitProvider(), avatarView)

    status.value = 'Connecting to LiveKit...'
    await player.connect({ url, token, roomName: room })
    roomClient = player.getNativeClient() as Room
    if (!roomClient) throw new Error('LiveKit room client is unavailable')

    await roomClient.startAudio()

    connected.value = true
    status.value = 'Connected. Click Start Mic to talk.'
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Connection failed'
  } finally {
    connecting.value = false
  }
}

async function startMic(): Promise<void> {
  if (!player || micOn.value) return

  status.value = 'Starting microphone...'
  try {
    await player.startPublishing()
    micOn.value = true
    status.value = 'Mic is on. Start speaking.'
  } catch (error) {
    status.value =
      error instanceof Error
        ? `Failed to start microphone: ${error.message}`
        : 'Failed to start microphone.'
  }
}

async function stopMic(): Promise<void> {
  if (!micOn.value) return
  await player?.stopPublishing().catch(() => undefined)
  micOn.value = false
  status.value = 'Mic is off.'
}

async function disconnect(): Promise<void> {
  await stopMic()
  await player?.disconnect().catch(() => undefined)
  avatarView?.dispose()
  player = null
  avatarView = null
  roomClient = null
  connected.value = false
  status.value = 'Disconnected'
}

async function toggleConnection(): Promise<void> {
  if (connecting.value) return
  if (connected.value) {
    await disconnect()
    return
  }
  await connect()
}

async function toggleMic(): Promise<void> {
  if (!connected.value || connecting.value) return
  if (micOn.value) {
    await stopMic()
    return
  }
  await startMic()
}

onBeforeUnmount(async () => {
  await disconnect()
})
</script>

<template>
  <div style="min-height:100vh; display:flex; align-items:center; justify-content:center; padding:16px;">
    <div style="width:min(720px, 100%); display:flex; flex-direction:column; gap:10px;">
      <div
        ref="container"
        style="width:100%; aspect-ratio:16/10; min-height:320px; border-radius:12px; overflow:hidden; border:1px solid;"
      />

      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <button :disabled="connecting" @click="toggleConnection">
          {{ connecting ? 'Connecting...' : connected ? 'Disconnect' : 'Connect' }}
        </button>
        <button :disabled="!connected || connecting" @click="toggleMic">
          {{ micOn ? 'Stop Mic' : 'Start Mic' }}
        </button>
      </div>

      <div style="font-size:14px;">{{ status }}</div>
    </div>
  </div>
</template>
