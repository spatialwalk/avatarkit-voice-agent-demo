import { useState, useCallback, useRef, useEffect } from 'react'
import { useAvatarManager } from '../hooks/useAvatarSDK'
import CharacterList from '../components/CharacterList'
import ControlPanel from '../components/ControlPanel'

const MAX_AVATARS = 4

export default function Playground() {
  const [multiMode, setMultiMode] = useState(false)
  const [loadingCharId, setLoadingCharId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const containerRefs = useRef<Map<string, HTMLDivElement>>(new Map())

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
  useEffect(() => {
    containerRefs.current.forEach((cell, uid) => {
      cell.classList.toggle('active-cell', uid === activeUid)
    })
  }, [activeUid])

  const handleCharacterSelect = useCallback(async (charId: string, charName: string) => {
    if (loadingCharId) return
    if (avatars.length >= MAX_AVATARS && multiMode) return

    if (!multiMode) {
      removeAll()
      containerRefs.current.forEach(cell => cell.remove())
      containerRefs.current.clear()
    }

    setLoadingCharId(charId)

    const cell = document.createElement('div')
    cell.className = 'canvas-cell active-cell'

    // Loading overlay (spinner + progress)
    const overlay = document.createElement('div')
    overlay.className = 'cell-loading-overlay'
    overlay.innerHTML = '<div class="cell-spinner"></div><div class="cell-progress-text">0%</div>'
    cell.appendChild(overlay)

    // Slot index for this avatar
    const slotIndex = multiMode ? avatars.length + 1 : 1

    // Index badge (top-left)
    const badge = document.createElement('div')
    badge.className = 'cell-badge'
    badge.textContent = String(slotIndex)
    cell.appendChild(badge)

    // Close button (top-right), only in multi mode
    if (multiMode) {
      const closeBtn = document.createElement('button')
      closeBtn.className = 'cell-close'
      closeBtn.textContent = '✕'
      closeBtn.onclick = (e) => {
        e.stopPropagation()
        // Find uid by cell ref
        for (const [uid, c] of containerRefs.current) {
          if (c === cell) {
            handleRemoveAvatar(uid)
            break
          }
        }
      }
      cell.appendChild(closeBtn)
    }

    // Click cell to select
    cell.onclick = () => {
      for (const [uid, c] of containerRefs.current) {
        if (c === cell) {
          setActiveUid(uid)
          break
        }
      }
    }

    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '100%'
    cell.appendChild(container)

    canvasRef.current?.appendChild(cell)
    await new Promise(r => requestAnimationFrame(r))

    try {
      const uid = await loadAvatar(charId, charName, container, (progress) => {
        const text = overlay.querySelector('.cell-progress-text')
        if (text) text.textContent = `${Math.round(progress)}%`
      })
      containerRefs.current.set(uid, cell)
      // Remove loading overlay
      overlay.remove()
    } catch (e: any) {
      console.error('Load failed:', e)
      cell.remove()
    } finally {
      setLoadingCharId(null)
    }
  }, [loadingCharId, avatars.length, multiMode, removeAll, loadAvatar, setActiveUid])

  const handleRemoveAvatar = useCallback((uid: string) => {
    const cell = containerRefs.current.get(uid)
    if (cell) cell.remove()
    containerRefs.current.delete(uid)
    removeAvatar(uid)
    // Re-number remaining badges
    let idx = 1
    containerRefs.current.forEach((c) => {
      const badge = c.querySelector('.cell-badge')
      if (badge) badge.textContent = String(idx++)
    })
  }, [removeAvatar])

  const handleMultiToggle = useCallback(() => {
    setMultiMode(prev => {
      if (prev && avatars.length > 1) {
        avatars.forEach(a => {
          if (a.uid !== activeUid) {
            const cell = containerRefs.current.get(a.uid)
            if (cell) cell.remove()
            containerRefs.current.delete(a.uid)
            removeAvatar(a.uid)
          }
        })
      }
      return !prev
    })
  }, [avatars, activeUid, removeAvatar])

  const gridClass = multiMode ? 'grid-4' : 'grid-1'

  // Build slot selector for control panel in multi mode
  const avatarSlots = avatars.map((a, i) => ({
    uid: a.uid,
    index: i + 1,
    name: a.characterName,
  }))

  // Find loading avatar's progress
  const loadingAvatar = avatars.find(a => a.loading)
  const loadProgress = loadingAvatar?.loadProgress ?? 0

  return (
    <div className="playground">
      <div className="playground-left">
        <CharacterList
          loadingId={loadingCharId}
          loadProgress={loadProgress}
          onSelect={handleCharacterSelect}
        />
      </div>

      <div className="playground-center">
        <div className="center-header">
          <label className="multi-toggle">
            <input
              type="checkbox"
              checked={multiMode}
              onChange={handleMultiToggle}
            />
            <span>Multi-avatar mode</span>
          </label>
          {multiMode && (
            <span className="avatar-count">{avatars.length}/{MAX_AVATARS}</span>
          )}
        </div>

        <div ref={canvasRef} className={`avatar-canvas ${gridClass}`}>
          {avatars.length === 0 && !loadingCharId && (
            <div className="canvas-empty">
              Select a character to get started
            </div>
          )}
        </div>
      </div>

      <div className="playground-right">
        <ControlPanel
          activeAvatar={activeAvatar}
          activeController={activeController}
          multiMode={multiMode}
          avatarSlots={avatarSlots}
          activeUid={activeUid}
          onSlotSelect={setActiveUid}
        />
      </div>
    </div>
  )
}
