<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  AvatarSDK,
  DrivingServiceMode,
  Environment,
  LogLevel,
} from '@spatialwalk/avatarkit'
import type { AppConfig } from '../App.vue'

const DASH_URL = 'https://dash.spatialreal.ai'
const STORAGE_KEY = 'avatarkit-playground-config'

const emit = defineEmits<{
  initialized: [config: AppConfig]
}>()

function loadCached() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as { appId?: string; token?: string; env?: string }
  } catch { /* ignore */ }
  return {}
}

function saveCache(appId: string, token: string, env: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ appId, token, env }))
  } catch { /* ignore */ }
}

const cached = loadCached()
const appId = ref(cached.appId ?? '')
const token = ref(cached.token ?? '')
const env = ref<Environment>((cached.env as Environment) ?? Environment.intl)
const loading = ref(false)
const error = ref<string | null>(null)

const canInit = computed(() => appId.value.trim() && token.value.trim())

async function handleInit() {
  if (!canInit.value) return
  loading.value = true
  error.value = null
  try {
    await AvatarSDK.initialize(appId.value.trim(), {
      environment: env.value,
      drivingServiceMode: DrivingServiceMode.sdk,
      audioFormat: { channelCount: 1, sampleRate: 16000 },
      logLevel: LogLevel.all,
    })
    AvatarSDK.setSessionToken(token.value.trim())
    saveCache(appId.value.trim(), token.value.trim(), env.value)
    emit('initialized', {
      appId: appId.value.trim(),
      sessionToken: token.value.trim(),
      environment: env.value,
    })
  } catch (e: any) {
    error.value = e.message || 'Initialization failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="config-view">
    <div class="config-layout">
      <div class="config-container">
        <h1>Configuration</h1>
        <p class="config-subtitle">
          Mode: <strong>SDK</strong>
        </p>
        <div class="config-form">
          <div class="field">
            <label>App ID <span class="required">*</span></label>
            <input
              v-model="appId"
              placeholder="app_xxx"
            />
            <span class="field-hint">
              Get your App ID from the
              <a :href="DASH_URL" target="_blank" rel="noreferrer">Developer Platform</a>
            </span>
          </div>

          <div class="field">
            <label>Session Token <span class="required">*</span></label>
            <input
              type="password"
              v-model="token"
              placeholder="Your session token"
            />
            <span class="field-hint">
              Required for server communication in SDK mode
            </span>
          </div>

          <div class="field">
            <label>Environment</label>
            <select v-model="env">
              <option :value="Environment.intl">International</option>
              <option :value="Environment.cn">China</option>
            </select>
          </div>

          <div v-if="error" class="config-error">{{ error }}</div>

          <button
            class="primary init-btn"
            :disabled="!canInit || loading"
            @click="handleInit"
          >
            {{ loading ? 'Initializing...' : 'Initialize SDK' }}
          </button>
        </div>
      </div>
      <a class="config-guide" :href="DASH_URL" target="_blank" rel="noreferrer">
        <img src="/api-key-guide.png" alt="Where to find your App ID and Token" />
      </a>
    </div>
  </div>
</template>
