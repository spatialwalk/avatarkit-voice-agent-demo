import { DrivingServiceMode } from '@spatialwalk/avatarkit'
import { createConfiguration, type AppConfig } from './views/configuration'
import { createPlayground } from './views/playground'

export function createApp(root: HTMLElement) {
  let step: 1 | 2 = 1
  const mode = DrivingServiceMode.sdk
  let config: AppConfig | null = null

  const app = document.createElement('div')
  app.className = 'app'
  root.appendChild(app)

  const views: HTMLElement[] = []

  function render() {
    app.innerHTML = ''
    views.length = 0

    // View 1: Configuration
    const v1Wrap = document.createElement('div')
    v1Wrap.className = `view ${step === 1 ? 'active' : ''}`
    v1Wrap.appendChild(createConfiguration(
      (c) => { config = c; step = 2; render() },
    ))
    views.push(v1Wrap)
    app.appendChild(v1Wrap)

    // View 2: Playground
    const v2Wrap = document.createElement('div')
    v2Wrap.className = `view ${step === 2 ? 'active' : ''}`
    if (config && step === 2) {
      v2Wrap.appendChild(createPlayground(config))
    }
    views.push(v2Wrap)
    app.appendChild(v2Wrap)
  }

  render()
}
