import type { AppConfig } from './configuration'
import { AvatarManagerService } from '../avatarManager'
import { DEFAULT_CHARACTERS } from '../data/characters'
import { PCM_ASSETS } from '../data/audioAssets'
import { loadPcmFile, sendPcmChunks } from '../utils/audio'

const MAX_AVATARS = 4
const DASH_URL = 'https://dash.spatialreal.ai'

export function createPlayground(_config: AppConfig): HTMLElement {
  const mgr = new AvatarManagerService()
  let multiMode = false
  let loadingCharId: string | null = null
  let loadingProgress = 0
  let sending = false
  let cancelSend: (() => void) | null = null
  let adding = false
  let customId = ''
  const customChars: { id: string; name: string }[] = []
  const cellRefs = new Map<string, HTMLDivElement>()

  const el = document.createElement('div')
  el.className = 'playground'
  // --- Build static layout ---
  const leftPanel = document.createElement('div')
  leftPanel.className = 'playground-left'
  const centerPanel = document.createElement('div')
  centerPanel.className = 'playground-center'
  const rightPanel = document.createElement('div')
  rightPanel.className = 'playground-right'
  el.append(leftPanel, centerPanel, rightPanel)

  // Center header
  const centerHeader = document.createElement('div')
  centerHeader.className = 'center-header'
  centerPanel.appendChild(centerHeader)

  // Canvas area
  const canvasArea = document.createElement('div')
  canvasArea.className = 'avatar-canvas grid-1'
  centerPanel.appendChild(canvasArea)

  // --- Character list (left) ---
  function renderCharList() {
    const allChars = [...DEFAULT_CHARACTERS, ...customChars]
    leftPanel.innerHTML = ''
    const wrap = document.createElement('div')
    wrap.className = 'character-list'
    const h3 = document.createElement('h3')
    h3.textContent = 'Characters'
    wrap.appendChild(h3)
    const items = document.createElement('div')
    items.className = 'character-items'

    for (const c of allChars) {
      const btn = document.createElement('button')
      btn.className = `character-item ${loadingCharId === c.id ? 'loading' : ''}`
      btn.disabled = loadingCharId !== null
      btn.innerHTML = `<span class="character-avatar">${c.name.charAt(0)}</span><span class="character-name">${c.name}</span>${loadingCharId === c.id ? '<span class="character-progress">' + Math.round(loadingProgress) + '%</span>' : ''}`
      btn.addEventListener('click', () => handleCharSelect(c.id, c.name))
      items.appendChild(btn)
    }

    if (adding) {
      const addWrap = document.createElement('div')
      addWrap.className = 'custom-id-input'
      const inp = document.createElement('input')
      inp.value = customId
      inp.placeholder = 'Paste character ID'
      inp.addEventListener('input', () => { customId = inp.value })
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAddCustom() })
      const acts = document.createElement('div')
      acts.className = 'custom-id-actions'
      const addBtn = document.createElement('button')
      addBtn.className = 'primary'
      addBtn.textContent = 'Add'
      addBtn.disabled = !customId.trim() || loadingCharId !== null
      addBtn.addEventListener('click', handleAddCustom)
      const cancelBtn = document.createElement('button')
      cancelBtn.className = 'secondary'
      cancelBtn.textContent = 'Cancel'
      cancelBtn.addEventListener('click', () => { adding = false; customId = ''; renderCharList() })
      acts.append(addBtn, cancelBtn)
      addWrap.append(inp, acts)
      items.appendChild(addWrap)
      setTimeout(() => inp.focus(), 0)
    } else {
      const addBtn = document.createElement('button')
      addBtn.className = 'character-item add-btn'
      addBtn.innerHTML = '<span class="character-avatar add-avatar">+</span><span class="character-name">Custom ID</span>'
      addBtn.addEventListener('click', () => { adding = true; renderCharList() })
      items.appendChild(addBtn)
    }

    wrap.appendChild(items)

    // Guide image
    const guide = document.createElement('a')
    guide.className = 'guide-thumb list-guide'
    guide.href = DASH_URL
    guide.target = '_blank'
    guide.rel = 'noreferrer'
    guide.innerHTML = '<img src="/public-avatar-guide.png" alt="Where to find character IDs" />'
    wrap.appendChild(guide)

    leftPanel.appendChild(wrap)
  }

  function handleAddCustom() {
    const id = customId.trim()
    if (!id) return
    if ([...DEFAULT_CHARACTERS, ...customChars].some(c => c.id === id)) return
    customChars.push({ id, name: `Custom (${id.slice(0, 6)}...)` })
    customId = ''
    adding = false
    renderCharList()
  }
  // --- Center header ---
  function renderCenterHeader() {
    centerHeader.innerHTML = ''
    const label = document.createElement('label')
    label.className = 'multi-toggle'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = multiMode
    cb.addEventListener('change', handleMultiToggle)
    const span = document.createElement('span')
    span.textContent = 'Multi-avatar mode'
    label.append(cb, span)
    centerHeader.appendChild(label)
    if (multiMode) {
      const count = document.createElement('span')
      count.className = 'avatar-count'
      count.textContent = `${mgr.avatars.length}/${MAX_AVATARS}`
      centerHeader.appendChild(count)
    }
  }

  function handleMultiToggle() {
    if (multiMode && mgr.avatars.length > 1) {
      mgr.avatars.forEach(a => {
        if (a.uid !== mgr.activeUid) {
          cellRefs.get(a.uid)?.remove()
          cellRefs.delete(a.uid)
          mgr.removeAvatar(a.uid)
        }
      })
    }
    multiMode = !multiMode
    canvasArea.className = `avatar-canvas ${multiMode ? 'grid-4' : 'grid-1'}`
    renderCenterHeader()
    renderControlPanel()
  }

  // --- Character select handler ---
  async function handleCharSelect(charId: string, charName: string) {
    if (loadingCharId) return
    if (mgr.avatars.length >= MAX_AVATARS && multiMode) return

    if (!multiMode) {
      mgr.removeAll()
      cellRefs.forEach(cell => cell.remove())
      cellRefs.clear()
    }

    loadingCharId = charId
    renderCharList()

    // Remove empty placeholder
    const empty = canvasArea.querySelector('.canvas-empty')
    if (empty) empty.remove()

    const cell = document.createElement('div')
    cell.className = 'canvas-cell active-cell'

    // Loading overlay (spinner + progress)
    const overlay = document.createElement('div')
    overlay.className = 'cell-loading-overlay'
    overlay.innerHTML = '<div class="cell-spinner"></div><div class="cell-progress-text">0%</div>'
    cell.appendChild(overlay)

    const slotIndex = multiMode ? mgr.avatars.length + 1 : 1
    const badge = document.createElement('div')
    badge.className = 'cell-badge'
    badge.textContent = String(slotIndex)
    cell.appendChild(badge)

    if (multiMode) {
      const closeBtn = document.createElement('button')
      closeBtn.className = 'cell-close'
      closeBtn.textContent = '\u2715'
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        for (const [uid, c] of cellRefs) { if (c === cell) { handleRemoveAvatar(uid); break } }
      })
      cell.appendChild(closeBtn)
    }

    cell.addEventListener('click', () => {
      for (const [uid, c] of cellRefs) { if (c === cell) { mgr.setActiveUid(uid); break } }
    })

    const container = document.createElement('div')
    container.style.width = '100%'
    container.style.height = '100%'
    cell.appendChild(container)
    canvasArea.appendChild(cell)
    await new Promise(r => requestAnimationFrame(r))

    try {
      const uid = await mgr.loadAvatar(charId, charName, container, (progress) => {
        const text = overlay.querySelector('.cell-progress-text')
        if (text) text.textContent = `${Math.round(progress)}%`
        loadingProgress = progress
        renderCharList()
      })
      cellRefs.set(uid, cell)
      // Remove loading overlay
      overlay.remove()
    } catch (e: any) {
      console.error('Load failed:', e)
      cell.remove()
    } finally {
      loadingCharId = null
      loadingProgress = 0
      renderCharList()
    }
  }
  function handleRemoveAvatar(uid: string) {
    const cell = cellRefs.get(uid)
    if (cell) cell.remove()
    cellRefs.delete(uid)
    mgr.removeAvatar(uid)
    // Re-number badges
    let idx = 1
    cellRefs.forEach(c => {
      const b = c.querySelector('.cell-badge')
      if (b) b.textContent = String(idx++)
    })
    updateActiveCellHighlight()
    renderCenterHeader()
    renderControlPanel()
    if (mgr.avatars.length === 0) {
      canvasArea.innerHTML = '<div class="canvas-empty">Select a character to get started</div>'
    }
  }

  function updateActiveCellHighlight() {
    cellRefs.forEach((cell, uid) => {
      cell.classList.toggle('active-cell', uid === mgr.activeUid)
    })
  }

  // --- Control panel (right) ---
  function renderControlPanel() {
    rightPanel.innerHTML = ''
    const panel = document.createElement('div')
    panel.className = 'control-panel'
    const h3 = document.createElement('h3')
    h3.textContent = 'Controls'
    panel.appendChild(h3)

    const av = mgr.activeAvatar
    const ctrl = mgr.activeController
    const connected = av?.connectionState === 'connected'
    const hasAvatar = av?.view !== null && !av?.loading

    // Status bar
    if (av) {
      const sb = document.createElement('div')
      sb.className = 'status-bar'
      sb.innerHTML = `
        <div class="status-row"><span class="status-label">Connection</span><span class="status-value ${av.connectionState}">${av.connectionState}</span></div>
        <div class="status-row"><span class="status-label">Conversation</span><span class="status-value">${av.conversationState}</span></div>
        ${av.error ? `<div class="status-row error"><span class="status-label">Error</span><span class="status-value error-text">${av.error}</span></div>` : ''}
      `
      panel.appendChild(sb)
    }

    // Slot selector in multi mode
    if (multiMode && mgr.avatars.length > 0) {
      const ss = document.createElement('div')
      ss.className = 'slot-selector'
      ss.innerHTML = '<h4>Active Avatar</h4>'
      const sl = document.createElement('div')
      sl.className = 'slot-list'
      mgr.avatars.forEach((a, i) => {
        const btn = document.createElement('button')
        btn.className = `slot-btn ${a.uid === mgr.activeUid ? 'active' : ''}`
        btn.innerHTML = `<span class="slot-index">${i + 1}</span><span class="slot-name">${a.characterName}</span>`
        btn.addEventListener('click', () => mgr.setActiveUid(a.uid))
        sl.appendChild(btn)
      })
      ss.appendChild(sl)
      panel.appendChild(ss)
    }

    if (!hasAvatar) {
      const hint = document.createElement('p')
      hint.className = 'panel-hint'
      hint.textContent = 'Load a character first'
      panel.appendChild(hint)
    }
    // SDK mode controls
    if (hasAvatar) {
      const startBtn = document.createElement('button')
      startBtn.className = 'primary full-width'
      startBtn.disabled = connected || !hasAvatar
      startBtn.textContent = connected ? 'Connected' : 'Start'
      startBtn.addEventListener('click', async () => {
        if (!ctrl) return
        try {
          await (ctrl as any).initializeAudioContext()
          await ctrl.start()
        } catch (e: any) { console.error('Start failed:', e) }
      })
      panel.appendChild(startBtn)

      const audioList = document.createElement('div')
      audioList.className = 'audio-list'
      audioList.innerHTML = '<h4>Audio Files</h4>'
      for (const a of PCM_ASSETS) {
        const btn = document.createElement('button')
        btn.className = 'secondary full-width audio-btn'
        btn.disabled = !connected || sending
        btn.textContent = sending ? '...' : `\u25B6 ${a.name}`
        btn.addEventListener('click', async () => {
          if (!ctrl || sending) return
          sending = true
          renderControlPanel()
          try {
            await (ctrl as any).initializeAudioContext()
            const data = await loadPcmFile(a.path)
            cancelSend = sendPcmChunks(data, (chunk, end) => ctrl.send(chunk.buffer as ArrayBuffer, end), () => { sending = false; renderControlPanel() })
          } catch (e: any) { console.error('Send failed:', e); sending = false; renderControlPanel() }
        })
        audioList.appendChild(btn)
      }
      panel.appendChild(audioList)
    }

    // Common controls
    if (hasAvatar) {
      const row = document.createElement('div')
      row.className = 'btn-row'
      const pauseBtn = document.createElement('button')
      pauseBtn.className = 'secondary'
      pauseBtn.textContent = 'Pause'
      pauseBtn.addEventListener('click', () => ctrl?.pause())
      const resumeBtn = document.createElement('button')
      resumeBtn.className = 'secondary'
      resumeBtn.textContent = 'Resume'
      resumeBtn.addEventListener('click', () => ctrl?.resume())
      const intBtn = document.createElement('button')
      intBtn.className = 'danger'
      intBtn.textContent = 'Interrupt'
      intBtn.addEventListener('click', () => {
        ctrl?.interrupt()
        if (cancelSend) { cancelSend(); cancelSend = null }
        sending = false
        renderControlPanel()
      })
      row.append(pauseBtn, resumeBtn, intBtn)
      panel.appendChild(row)
    }

    rightPanel.appendChild(panel)
  }

  // --- Subscribe to manager changes ---
  mgr.onChange(() => {
    // Cancel ongoing audio send when disconnected
    const av = mgr.activeAvatar
    if (av && av.connectionState !== 'connected' && cancelSend) {
      cancelSend()
      cancelSend = null
      sending = false
    }
    updateActiveCellHighlight()
    renderCenterHeader()
    renderControlPanel()
  })

  // --- Initial render ---
  renderCharList()
  renderCenterHeader()
  canvasArea.innerHTML = '<div class="canvas-empty">Select a character to get started</div>'
  renderControlPanel()

  return el
}
