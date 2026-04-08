<script setup lang="ts">
import { ref } from 'vue'
import { Environment } from '@spatialwalk/avatarkit'
import Configuration from './views/Configuration.vue'
import Playground from './views/Playground.vue'
import './App.css'

export interface AppConfig {
  appId: string
  sessionToken: string
  environment: Environment
}

const step = ref<1 | 2>(1)
const config = ref<AppConfig | null>(null)

function handleInitialized(c: AppConfig) {
  config.value = c
  step.value = 2
}
</script>

<template>
  <div class="app">
    <div :class="['view', { active: step === 1 }]">
      <Configuration
        @initialized="handleInitialized"
      />
    </div>
    <div :class="['view', { active: step === 2 }]">
      <Playground
        v-if="config && step === 2"
        :config="config"
      />
    </div>
  </div>
</template>
