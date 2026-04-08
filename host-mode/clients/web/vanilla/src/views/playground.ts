import { AvatarManagerService } from '../avatarManager'
import { DEFAULT_CHARACTERS } from '../data/characters'
import { MicrophonePcmCapture } from '../utils/audioCapture'

const MAX_AVATARS = 4
const DASH_URL = 'https://dash.spatialreal.ai'
const HOST_SERVER_URL = import.meta.env.VITE_HOST_SERVER_WS || 'ws://localhost:8765/ws/agent'
const SAMPLE_RATE = 16000

function base64Decode(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function createPlayground(): HTMLElement {
  const mgr = new AvatarManagerService()
  let multiMode = false
  let loadingCharId: string | null = null
  let loadingProgress = 0
  let adding = false
  let customId = ''
  const customChars: { id: string; name: string }[] = []
  const cellRefs = new Map<string, HTMLDivElement>()

  // Host mode persistent state
  let hostWs: WebSocket | null = null
  let hostConnected = false
  let hostConnecting = false
  let hostMicActive = false
  let hostTextInput = ''
  let paused = false
  const hostTurnMap = new Map<string, string>()
  let microphone: MicrophonePcmCapture | null = null

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

  // --- Host mode functions ---
  function handleHostMessage(msg: any) {
    const ctrl = mgr.activeController
    const av = mgr.activeAvatar
    const type = msg.type

    if (type === 'ready') {
      hostConnected = true
      hostConnecting = false
      const avatarId = av?.characterId || ''
      hostWs?.send(JSON.stringify({ type: 'set_avatar', avatarId }))
      renderControlPanel()
    } else if (type === 'avatar_audio') {
      const audioB64 = msg.audio || ''
      const turnId = msg.turnId
      const isLast = msg.isLast ?? false
      const audioBytes = audioB64 ? base64Decode(audioB64) : new Uint8Array(0)
      const localCid = (ctrl as any).yieldAudioData(audioBytes, isLast)
      if (localCid && !hostTurnMap.has(turnId)) {
        hostTurnMap.set(turnId, localCid)
      }
    } else if (type === 'avatar_frames') {
      const frames = (msg.frames || []).map((b64: string) => base64Decode(b64))
      const localCid = hostTurnMap.get(msg.turnId)
      if (localCid && frames.length) {
        ;(ctrl as any).yieldFramesData(frames, localCid)
      }
      if (msg.isLast) {
        hostTurnMap.delete(msg.turnId)
      }
    } else if (type === 'interrupt') {
      ctrl?.interrupt()
      hostTurnMap.clear()
    } else if (type === 'error') {
      console.error('Host server error:', msg.message)
    }
  }

  async function hostConnect() {
    if (hostWs || hostConnecting) return
    hostConnecting = true
    renderControlPanel()
    const ctrl = mgr.activeController
    try {
      await (ctrl as any).initializeAudioContext()
    } catch (e) {
      console.error('Audio context init failed:', e)
      hostConnecting = false
      renderControlPanel()
      return
    }

    const ws = new WebSocket(HOST_SERVER_URL)
    hostWs = ws

    ws.onmessage = (event) => {
      let msg: any
      try { msg = JSON.parse(event.data) } catch { return }
      handleHostMessage(msg)
    }
    ws.onerror = () => {
      console.error('Host server connection failed')
      hostConnecting = false
      hostConnected = false
      renderControlPanel()
    }
    ws.onclose = () => {
      hostWs = null
      hostConnected = false
      hostConnecting = false
      hostMicActive = false
      renderControlPanel()
    }
  }

  function hostDisconnect() {
    if (microphone) { microphone.stop(); microphone = null; hostMicActive = false }
    if (hostWs) { hostWs.close(); hostWs = null }
    hostConnected = false
    hostTurnMap.clear()
    renderControlPanel()
  }

  async function toggleMic() {
    const ctrl = mgr.activeController
    if (hostMicActive) {
      // Stop mic
      if (microphone) { await microphone.stop(); microphone = null }
      hostMicActive = false
      if (hostWs?.readyState === WebSocket.OPEN) {
        hostWs.send(JSON.stringify({ type: 'mic_end' }))
      }
      renderControlPanel()
    } else {
      // Start mic — auto-connect if needed
      if (!hostConnected) {
        await hostConnect()
        await new Promise<void>((resolve) => {
          const check = setInterval(() => {
            if (hostConnected) { clearInterval(check); resolve() }
          }, 100)
          setTimeout(() => { clearInterval(check); resolve() }, 3000)
        })
      }
      if (!hostConnected) return
      microphone = new MicrophonePcmCapture(SAMPLE_RATE)
      await microphone.start((chunk: Uint8Array) => {
        if (hostWs?.readyState === WebSocket.OPEN) {
          hostWs.send(JSON.stringify({ type: 'mic_audio', audio: bytesToBase64(chunk) }))
        }
      })
      hostMicActive = true
      renderControlPanel()
    }
  }

  async function sendTextQuery() {
    const text = hostTextInput.trim()
    if (!text) return
    if (!hostConnected) {
      await hostConnect()
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (hostConnected) { clearInterval(check); resolve() }
        }, 100)
        setTimeout(() => { clearInterval(check); resolve() }, 3000)
      })
    }
    if (hostWs?.readyState === WebSocket.OPEN) {
      hostWs.send(JSON.stringify({ type: 'text_query', text }))
      hostTextInput = ''
      renderControlPanel()
    }
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
    const hasAvatar = av?.view !== null && !av?.loading

    // Status bar
    if (av) {
      const sb = document.createElement('div')
      sb.className = 'status-bar'
      sb.innerHTML = `
        <div class="status-row"><span class="status-label">Server</span><span class="status-value">${hostConnected ? 'connected' : hostConnecting ? 'connecting...' : 'disconnected'}</span></div>
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

    // Host mode controls
    if (hasAvatar) {
      // Connect / Disconnect button
      const connRow = document.createElement('div')
      connRow.className = 'btn-row'
      connRow.style.marginBottom = '8px'
      if (!hostConnected) {
        const connBtn = document.createElement('button')
        connBtn.className = 'primary'
        connBtn.disabled = hostConnecting
        connBtn.textContent = hostConnecting ? 'Connecting...' : 'Connect'
        connBtn.addEventListener('click', () => hostConnect())
        connRow.appendChild(connBtn)
      } else {
        const discBtn = document.createElement('button')
        discBtn.className = 'secondary'
        discBtn.textContent = 'Disconnect'
        discBtn.addEventListener('click', () => hostDisconnect())
        connRow.appendChild(discBtn)
      }
      panel.appendChild(connRow)

      // Mic toggle button
      const micBtn = document.createElement('button')
      micBtn.className = `full-width ${hostMicActive ? 'danger' : 'primary'}`
      micBtn.disabled = !hasAvatar
      micBtn.textContent = hostMicActive ? 'Stop Mic' : 'Start Mic'
      micBtn.addEventListener('click', () => toggleMic())
      panel.appendChild(micBtn)

      // Text input + send
      const form = document.createElement('form')
      form.className = 'host-text-form'
      form.style.marginTop = '8px'
      form.addEventListener('submit', (e) => { e.preventDefault(); sendTextQuery() })
      const textInp = document.createElement('input')
      textInp.type = 'text'
      textInp.placeholder = 'Type a message...'
      textInp.className = 'host-text-input'
      textInp.disabled = !hasAvatar
      textInp.value = hostTextInput
      textInp.addEventListener('input', () => { hostTextInput = textInp.value })
      const sendBtn = document.createElement('button')
      sendBtn.type = 'submit'
      sendBtn.className = 'primary'
      sendBtn.disabled = !hostTextInput.trim() || !hasAvatar
      sendBtn.textContent = 'Send'
      form.append(textInp, sendBtn)
      panel.appendChild(form)

      const hint = document.createElement('p')
      hint.className = 'host-hint'
      hint.innerHTML = `Connects to <code>${HOST_SERVER_URL}</code>. Using hostmode-demo backend — see <a href="https://github.com/spatialwalk/hostmode-demo" target="_blank">github.com/spatialwalk/hostmode-demo</a>.`
      panel.appendChild(hint)
    }

    // Common controls
    if (hasAvatar) {
      const row = document.createElement('div')
      row.className = 'btn-row'
      const toggleBtn = document.createElement('button')
      toggleBtn.className = 'secondary'
      toggleBtn.textContent = paused ? 'Resume' : 'Pause'
      toggleBtn.addEventListener('click', () => {
        if (paused) {
          ctrl?.resume()
          paused = false
        } else {
          ctrl?.pause()
          paused = true
        }
        renderControlPanel()
      })
      const intBtn = document.createElement('button')
      intBtn.className = 'danger'
      intBtn.textContent = 'Interrupt'
      intBtn.addEventListener('click', () => {
        ctrl?.interrupt()
        if (microphone) { microphone.stop(); microphone = null; hostMicActive = false }
        if (hostWs?.readyState === WebSocket.OPEN) {
          hostWs.send(JSON.stringify({ type: 'interrupt' }))
        }
        hostTurnMap.clear()
        renderControlPanel()
      })
      row.append(toggleBtn, intBtn)
      panel.appendChild(row)
    }

    rightPanel.appendChild(panel)
  }

  // --- Subscribe to manager changes ---
  mgr.onChange(() => {
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
