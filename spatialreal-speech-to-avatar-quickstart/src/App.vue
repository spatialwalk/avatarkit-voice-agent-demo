<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import {
  AvatarManager,
  AvatarSDK,
  AvatarView,
  DrivingServiceMode,
  Environment,
} from '@spatialwalk/avatarkit'

const container = ref<HTMLDivElement | null>(null)
const status = ref('Click Connect Avatar to start')
const connecting = ref(false)
const sending = ref(false)

let avatarView: AvatarView | null = null
const connected = ref(false)

const appId = import.meta.env.VITE_SPATIALREAL_APP_ID
const avatarId = import.meta.env.VITE_SPATIALREAL_AVATAR_ID
const sessionToken = import.meta.env.VITE_SPATIALREAL_SESSION_TOKEN

if (!sessionToken) throw new Error('Missing VITE_SPATIALREAL_SESSION_TOKEN')

async function downloadPcmAudio(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Failed to load demo audio URL')
  return response.arrayBuffer()
}

async function disposeAvatar(): Promise<void> {
  connected.value = false
  avatarView?.controller.close()
  avatarView?.dispose()
  avatarView = null
}

async function connectAvatar(): Promise<void> {
  if (connecting.value || connected.value) return
  connecting.value = true

  try {
    status.value = 'Using session token from .env...'

    if (!AvatarSDK.isInitialized) {
      await AvatarSDK.initialize(appId, {
        environment: Environment.intl,
        drivingServiceMode: DrivingServiceMode.sdk,
      })
    }
    AvatarSDK.setSessionToken(sessionToken)

    await nextTick()
    const mountEl = container.value
    if (!mountEl) throw new Error('Avatar container is not ready')

    if (!avatarView) {
      status.value = 'Loading avatar...'
      const avatar = await AvatarManager.shared.load(avatarId)
      avatarView = new AvatarView(avatar, mountEl)
      avatarView.controller.onConnectionState = (state) => {
        connected.value = state === 'connected'
      }
    }

    const controller = avatarView?.controller
    if (!controller) throw new Error('Avatar controller is not ready')

    status.value = 'Connecting to SpatialReal...'
    await controller.initializeAudioContext()
    await controller.start()
    await new Promise((resolve) => setTimeout(resolve, 300))
    if (!connected.value) throw new Error('Failed to connect to animation channel')

    status.value = 'Avatar connected. Click Send Audio.'
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Failed to connect avatar'
  } finally {
    connecting.value = false
  }
}

async function sendAudio(): Promise<void> {
  if (sending.value) return
  if (!connected.value || !avatarView) {
    status.value = 'Please click Connect Avatar first.'
    return
  }

  sending.value = true

  try {
    status.value = 'Downloading demo PCM audio...'
    const audioData = await downloadPcmAudio(
      'https://cdn.spatialwalk.cloud/public/website/quickstart_voice.pcm',
    )

    status.value = 'Sending audio...'
    avatarView.controller.send(audioData, true)
    status.value = `Audio sent (${audioData.byteLength} bytes)`
  } catch (error) {
    status.value = error instanceof Error ? error.message : 'Failed to send audio'
  } finally {
    sending.value = false
  }
}

onBeforeUnmount(async () => {
  await disposeAvatar()
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
        <button :disabled="connecting || connected" @click="connectAvatar">
          {{ connecting ? 'Connecting...' : connected ? 'Avatar Connected' : 'Connect Avatar' }}
        </button>
        <button :disabled="sending || !connected" @click="sendAudio">
          {{ sending ? 'Sending...' : 'Send Audio' }}
        </button>
      </div>

      <div style="font-size:14px;">{{ status }}</div>
    </div>
  </div>
</template>
