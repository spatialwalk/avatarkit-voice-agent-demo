import { useRef } from 'react'
import type { AvatarInstance } from '../hooks/useAvatarSDK'

interface Props {
  avatars: AvatarInstance[]
  activeUid: string | null
  onContainerReady: (uid: string, el: HTMLDivElement) => void
}

export default function AvatarCanvas({ avatars, activeUid, onContainerReady }: Props) {
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const gridClass =
    avatars.length <= 1 ? 'grid-1' :
    avatars.length === 2 ? 'grid-2' :
    'grid-4'

  return (
    <div className={`avatar-canvas ${gridClass}`}>
      {avatars.length === 0 && (
        <div className="canvas-empty">
          Select a character to get started
        </div>
      )}
      {avatars.map(a => (
        <div
          key={a.uid}
          className={`canvas-cell ${a.uid === activeUid ? 'active-cell' : ''}`}
        >
          {a.loading && <div className="canvas-loading">Loading...</div>}
          {a.error && <div className="canvas-error">{a.error}</div>}
          <div
            className="canvas-container"
            ref={el => {
              if (el && !containerRefs.current.has(a.uid)) {
                containerRefs.current.set(a.uid, el)
                onContainerReady(a.uid, el)
              }
            }}
          />
        </div>
      ))}
    </div>
  )
}
