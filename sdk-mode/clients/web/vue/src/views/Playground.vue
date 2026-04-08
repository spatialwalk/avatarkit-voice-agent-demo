<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { AppConfig } from '../App.vue'
import { useAvatarManager } from '../composables/useAvatarSDK'
import CharacterList from '../components/CharacterList.vue'
import ControlPanel from '../components/ControlPanel.vue'

const props = defineProps<{
  config: AppConfig
}>()

const MAX_AVATARS = 4

const multiMode = ref(false)
const loadingCharId = ref<string | null>(null)
const canvasRef = ref<HTMLDivElement | null>(null)
const containerRefs = new Map<string, HTMLDivElement>()

const {
  avatars,
  activeUid,
  activeAvatar,
  activeController,
  setActiveUid,
  loadAvatar,
  removeAvatar,
  removeAll,
} = useAvatarManager()

// Update active-cell highlight when activeUid changes
watch(activeUid, (uid) => {
  containerRefs.forEach((cell, cellUid) => {
    cell.classList.toggle('active-cell', cellUid === uid)
  })
})

function handleRemoveAvatar(uid: string) {
  const cell = containerRefs.get(uid)
  if (cell) cell.remove()
  containerRefs.delete(uid)
  removeAvatar(uid)
  // Re-number remaining badges
  let idx = 1
  containerRefs.forEach((c) => {
    const badge = c.querySelector('.cell-badge')
    if (badge) badge.textContent = String(idx++)
  })
}

async function handleCharacterSelect(charId: string, charName: string) {
  if (loadingCharId.value) return
  if (avatars.value.length >= MAX_AVATARS && multiMode.value) return

  if (!multiMode.value) {
    removeAll()
    containerRefs.forEach(cell => cell.remove())
    containerRefs.clear()
  }

  loadingCharId.value = charId

  const cell = document.createElement('div')
  cell.className = 'canvas-cell active-cell'

  // Loading overlay (spinner + progress)
  const overlay = document.createElement('div')
  overlay.className = 'cell-loading-overlay'
  overlay.innerHTML = '<div class="cell-spinner"></div><div class="cell-progress-text">0%</div>'
  cell.appendChild(overlay)

  const slotIndex = multiMode.value ? avatars.value.length + 1 : 1

  const badge = document.createElement('div')
  badge.className = 'cell-badge'
  badge.textContent = String(slotIndex)
  cell.appendChild(badge)

  if (multiMode.value) {
    const closeBtn = document.createElement('button')
    closeBtn.className = 'cell-close'
    closeBtn.textContent = '✕'
    closeBtn.onclick = (e) => {
      e.stopPropagation()
      for (const [uid, c] of containerRefs) {
        if (c === cell) { handleRemoveAvatar(uid); break }
      }
    }
    cell.appendChild(closeBtn)
  }

  cell.onclick = () => {
    for (const [uid, c] of containerRefs) {
      if (c === cell) { setActiveUid(uid); break }
    }
  }

  const container = document.createElement('div')
  container.style.width = '100%'
  container.style.height = '100%'
  cell.appendChild(container)

  canvasRef.value?.appendChild(cell)
  await new Promise(r => requestAnimationFrame(r))

  try {
    const uid = await loadAvatar(charId, charName, container, (progress) => {
      const text = overlay.querySelector('.cell-progress-text')
      if (text) text.textContent = `${Math.round(progress)}%`
    })
    containerRefs.set(uid, cell)
    // Remove loading overlay
    overlay.remove()
  } catch (e: any) {
    console.error('Load failed:', e)
    cell.remove()
  } finally {
    loadingCharId.value = null
  }
}

function handleMultiToggle() {
  if (multiMode.value && avatars.value.length > 1) {
    avatars.value.forEach(a => {
      if (a.uid !== activeUid.value) {
        const cell = containerRefs.get(a.uid)
        if (cell) cell.remove()
        containerRefs.delete(a.uid)
        removeAvatar(a.uid)
      }
    })
  }
  multiMode.value = !multiMode.value
}

const gridClass = computed(() => multiMode.value ? 'grid-4' : 'grid-1')

const avatarSlots = computed(() =>
  avatars.value.map((a, i) => ({
    uid: a.uid,
    index: i + 1,
    name: a.characterName,
  }))
)

// Find loading avatar's progress
const loadProgress = computed(() => {
  const loadingAvatar = avatars.value.find(a => a.loading)
  return loadingAvatar?.loadProgress ?? 0
})
</script>

<template>
  <div class="playground">
    <div class="playground-left">
      <CharacterList
        :loading-id="loadingCharId"
        :load-progress="loadProgress"
        @select="handleCharacterSelect"
      />
    </div>

    <div class="playground-center">
      <div class="center-header">
        <label class="multi-toggle">
          <input
            type="checkbox"
            :checked="multiMode"
            @change="handleMultiToggle"
          />
          <span>Multi-avatar mode</span>
        </label>
        <span v-if="multiMode" class="avatar-count">
          {{ avatars.length }}/{{ MAX_AVATARS }}
        </span>
      </div>

      <div ref="canvasRef" :class="['avatar-canvas', gridClass]">
        <div v-if="avatars.length === 0 && !loadingCharId" class="canvas-empty">
          Select a character to get started
        </div>
      </div>
    </div>

    <div class="playground-right">
      <ControlPanel
        :active-avatar="activeAvatar"
        :active-controller="activeController"
        :multi-mode="multiMode"
        :avatar-slots="avatarSlots"
        :active-uid="activeUid"
        @slot-select="setActiveUid"
      />
    </div>
  </div>
</template>
