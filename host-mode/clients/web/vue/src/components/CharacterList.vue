<script setup lang="ts">
import { ref } from 'vue'
import { DEFAULT_CHARACTERS } from '../data/characters'

const DASH_URL = 'https://dash.spatialreal.ai'

interface Character {
  id: string
  name: string
}

defineProps<{
  loadingId: string | null
  loadProgress: number
}>()

const emit = defineEmits<{
  select: [id: string, name: string]
}>()

const adding = ref(false)
const customId = ref('')
const customChars = ref<Character[]>([])

function handleAdd() {
  const id = customId.value.trim()
  if (!id) return
  if ([...DEFAULT_CHARACTERS, ...customChars.value].some(c => c.id === id)) return
  const name = `Custom (${id.slice(0, 6)}...)`
  customChars.value = [...customChars.value, { id, name }]
  customId.value = ''
  adding.value = false
}

const allChars = () => [...DEFAULT_CHARACTERS, ...customChars.value]
</script>

<template>
  <div class="character-list">
    <h3>Characters</h3>
    <div class="character-items">
      <button
        v-for="c in allChars()"
        :key="c.id"
        :class="['character-item', { loading: loadingId === c.id }]"
        :disabled="loadingId !== null"
        @click="emit('select', c.id, c.name)"
      >
        <span class="character-avatar">{{ c.name.charAt(0) }}</span>
        <span class="character-name">{{ c.name }}</span>
        <span v-if="loadingId === c.id" class="character-progress">{{ Math.round(loadProgress) }}%</span>
      </button>
      <div v-if="adding" class="custom-id-input">
        <input
          v-model="customId"
          @keydown.enter="handleAdd"
          placeholder="Paste character ID"
          autofocus
        />
        <div class="custom-id-actions">
          <button class="primary" :disabled="!customId.trim() || loadingId !== null" @click="handleAdd">Add</button>
          <button class="secondary" @click="adding = false; customId = ''">Cancel</button>
        </div>
      </div>
      <button v-else class="character-item add-btn" @click="adding = true">
        <span class="character-avatar add-avatar">+</span>
        <span class="character-name">Custom ID</span>
      </button>
    </div>

    <a class="guide-thumb list-guide" :href="DASH_URL" target="_blank" rel="noreferrer">
      <img src="/public-avatar-guide.png" alt="Where to find character IDs" />
    </a>
  </div>
</template>
