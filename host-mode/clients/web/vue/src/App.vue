<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { AvatarSDK, DrivingServiceMode, LogLevel } from '@spatialwalk/avatarkit'
import Playground from './views/Playground.vue'
import './App.css'

const ready = ref(false)
const error = ref<string | null>(null)

function deriveHttpBase(): string {
  const wsUrl = import.meta.env.VITE_HOST_SERVER_WS || 'ws://localhost:8765/ws/agent'
  const httpUrl = wsUrl.replace(/^ws(s?):\/\//, 'http$1://').replace(/\/ws\/agent$/, '')
  return httpUrl
}

onMounted(async () => {
  const httpBase = deriveHttpBase()

  let appId: string
  let environment: string | undefined
  try {
    const res = await fetch(`${httpBase}/api/config`)
    if (!res.ok) throw new Error(`Server returned ${res.status}`)
    const config = await res.json()
    appId = config.appId
    environment = config.environment
    if (!appId) throw new Error('Server returned empty appId')
  } catch (e: any) {
    // Try /healthz to give a more specific error message
    try {
      const healthRes = await fetch(`${httpBase}/healthz`)
      const health = await healthRes.json()
      if (!health.ok && health.missing?.length) {
        error.value = `Server missing config: ${health.missing.join(', ')}`
        return
      }
    } catch {
      // healthz also failed
    }
    error.value = `Failed to fetch config from ${httpBase}/api/config: ${e.message}`
    return
  }

  try {
    await AvatarSDK.initialize(appId, {
      drivingServiceMode: DrivingServiceMode.host,
      audioFormat: { channelCount: 1, sampleRate: 16000 },
      logLevel: LogLevel.all,
      ...(environment ? { environment } : {}),
    })
    ready.value = true
  } catch (e: any) {
    error.value = e.message || 'SDK initialization failed'
  }
})
</script>

<template>
  <div class="app">
    <div v-if="error" class="init-error">
      <a href="https://dash.spatialreal.ai" target="_blank" rel="noreferrer">
        <img src="/api-key-guide.png" alt="API Key Guide" style="max-width: 100%; border-radius: 10px; margin-bottom: 16px;" />
      </a>
      <p>{{ error }}</p>
    </div>
    <Playground v-if="ready" />
  </div>
</template>
