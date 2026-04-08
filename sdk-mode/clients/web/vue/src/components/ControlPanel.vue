<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { AvatarController } from '@spatialwalk/avatarkit'
import type { AvatarInstance } from '../composables/useAvatarSDK'
import { PCM_ASSETS } from '../data/audioAssets'
import { loadPcmFile, sendPcmChunks } from '../utils/audio'

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

const sending = ref(false)
const sdkCancelRef = ref<(() => void) | null>(null)

const connected = computed(() => props.activeAvatar?.connectionState === 'connected')
const hasAvatar = computed(() => props.activeAvatar?.view !== null && !props.activeAvatar?.loading)

async function handleStart() {
  if (!props.activeController) return
  try {
    await (props.activeController as any).initializeAudioContext()
    await props.activeController.start()
  } catch (e: any) {
    console.error('Start failed:', e)
  }
}

async function handleSendPcm(path: string) {
  if (!props.activeController || sending.value) return
  sending.value = true
  try {
    await (props.activeController as any).initializeAudioContext()
    const data = await loadPcmFile(path)
    sdkCancelRef.value = sendPcmChunks(
      data,
      (chunk, end) => props.activeController!.send(chunk.buffer as ArrayBuffer, end),
      () => { sending.value = false },
    )
  } catch (e: any) {
    console.error('Send failed:', e)
    sending.value = false
  }
}

function handlePause() { props.activeController?.pause() }
function handleResume() { props.activeController?.resume() }
function handleInterrupt() {
  props.activeController?.interrupt()
  if (sdkCancelRef.value) { sdkCancelRef.value(); sdkCancelRef.value = null }
  sending.value = false
}

// Cancel ongoing audio send when disconnected
watch(connected, (val) => {
  if (!val && sdkCancelRef.value) {
    sdkCancelRef.value()
    sdkCancelRef.value = null
    sending.value = false
  }
})
</script>

<template>
  <div class="control-panel">
    <h3>Controls</h3>
    <!-- Status -->
    <div v-if="activeAvatar" class="status-bar">
      <div class="status-row">
        <span class="status-label">Connection</span>
        <span :class="['status-value', activeAvatar.connectionState]">
          {{ activeAvatar.connectionState }}
        </span>
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

    <!-- SDK Mode -->
    <template v-if="hasAvatar">
      <button
        class="primary full-width"
        :disabled="connected || !hasAvatar"
        @click="handleStart"
      >
        {{ connected ? 'Connected' : 'Start' }}
      </button>

      <div class="audio-list">
        <h4>Audio Files</h4>
        <button
          v-for="a in PCM_ASSETS"
          :key="a.path"
          class="secondary full-width audio-btn"
          :disabled="!connected || sending"
          @click="handleSendPcm(a.path)"
        >
          {{ sending ? '...' : `&#9654; ${a.name}` }}
        </button>
      </div>
    </template>

    <!-- Common controls -->
    <div v-if="hasAvatar" class="btn-row">
      <button class="secondary" @click="handlePause">Pause</button>
      <button class="secondary" @click="handleResume">Resume</button>
      <button class="danger" @click="handleInterrupt">Interrupt</button>
    </div>
  </div>
</template>
