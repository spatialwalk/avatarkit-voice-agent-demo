'use client'

import { useState, useCallback } from 'react'
import { Environment } from '@spatialwalk/avatarkit'
import Configuration from '@/views/Configuration'
import Playground from '@/views/Playground'

export interface AppConfig {
  appId: string
  sessionToken: string
  environment: Environment
}

export default function Home() {
  const [step, setStep] = useState<1 | 2>(1)
  const [config, setConfig] = useState<AppConfig | null>(null)

  const handleInitialized = useCallback((c: AppConfig) => {
    setConfig(c)
    setStep(2)
  }, [])

  return (
    <div className="app">
      <div className={`view ${step === 1 ? 'active' : ''}`}>
        <Configuration
          onInitialized={handleInitialized}
        />
      </div>
      <div className={`view ${step === 2 ? 'active' : ''}`}>
        {config && step === 2 && (
          <Playground config={config} />
        )}
      </div>
    </div>
  )
}
