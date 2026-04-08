<script setup lang="ts">
import { ref } from 'vue'
import type { AvatarInstance } from '../composables/useAvatarSDK'

defineProps<{
  avatars: AvatarInstance[]
  activeUid: string | null
}>()

const emit = defineEmits<{
  containerReady: [uid: string, el: HTMLDivElement]
}>()

const containerRefs = ref<Map<string, HTMLDivElement>>(new Map())

function gridClass(count: number) {
  if (count <= 1) return 'grid-1'
  if (count === 2) return 'grid-2'
  return 'grid-4'
}

function setContainerRef(uid: string, el: HTMLDivElement | null) {
  if (el && !containerRefs.value.has(uid)) {
    containerRefs.value.set(uid, el)
    emit('containerReady', uid, el)
  }
}
</script>

<template>
  <div :class="['avatar-canvas', gridClass(avatars.length)]">
    <div v-if="avatars.length === 0" class="canvas-empty">
      Select a character to get started
    </div>
    <div
      v-for="a in avatars"
      :key="a.uid"
      :class="['canvas-cell', { 'active-cell': a.uid === activeUid }]"
    >
      <div v-if="a.loading" class="canvas-loading">Loading...</div>
      <div v-if="a.error" class="canvas-error">{{ a.error }}</div>
      <div
        class="canvas-container"
        :ref="(el) => setContainerRef(a.uid, el as HTMLDivElement)"
      />
    </div>
  </div>
</template>
