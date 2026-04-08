import { useState, useCallback } from 'react'
import { DrivingServiceMode, Environment } from '@spatialwalk/avatarkit'
import Configuration from './views/Configuration'
import Playground from './views/Playground'
import './App.css'

export interface AppConfig {
  appId: string
  sessionToken: string
  environment: Environment
}

const MODE = DrivingServiceMode.sdk

export default function App() {
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
          mode={MODE}
          onInitialized={handleInitialized}
        />
      </div>
      <div className={`view ${step === 2 ? 'active' : ''}`}>
        {config && step === 2 && (
          <Playground mode={MODE} config={config} />
        )}
      </div>
    </div>
  )
}
