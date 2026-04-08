import {
  AvatarManager,
  AvatarView,
  type AvatarController,
  type ConnectionState,
  type ConversationState,
} from '@spatialwalk/avatarkit'

export interface AvatarInstance {
  uid: string
  characterId: string
  characterName: string
  view: AvatarView | null
  connectionState: ConnectionState
  conversationState: ConversationState
  loading: boolean
  loadProgress: number // 0-100
  error: string | null
}

type Listener = () => void

let uidCounter = 0
const genUid = () => `avatar-${++uidCounter}`

export class AvatarManagerService {
  private _avatars: AvatarInstance[] = []
  private _activeUid: string | null = null
  private _views = new Map<string, AvatarView>()
  private _listeners = new Set<Listener>()

  get avatars() { return this._avatars }
  get activeUid() { return this._activeUid }
  get activeAvatar(): AvatarInstance | null {
    return this._avatars.find(a => a.uid === this._activeUid) ?? null
  }

  get activeController(): AvatarController | null {
    return this.activeAvatar?.view?.controller ?? null
  }

  onChange(fn: Listener) { this._listeners.add(fn); return () => this._listeners.delete(fn) }
  private notify() { this._listeners.forEach(fn => fn()) }

  private updateAvatar(uid: string, patch: Partial<AvatarInstance>) {
    this._avatars = this._avatars.map(a => a.uid === uid ? { ...a, ...patch } : a)
    this.notify()
  }

  setActiveUid(uid: string) {
    this._activeUid = uid
    this.notify()
  }

  async loadAvatar(
    characterId: string,
    characterName: string,
    container: HTMLElement,
    onProgress?: (progress: number) => void,
  ): Promise<string> {
    const uid = genUid()
    const inst: AvatarInstance = {
      uid, characterId, characterName,
      view: null,
      connectionState: 'disconnected' as ConnectionState,
      conversationState: 'idle' as ConversationState,
      loading: true, loadProgress: 0, error: null,
    }
    this._avatars = [...this._avatars, inst]
    this._activeUid = uid
    this.notify()

    try {
      const avatar = await AvatarManager.shared.load(characterId, (info) => {
        const p = info.progress ?? 0
        this.updateAvatar(uid, { loadProgress: p })
        onProgress?.(p)
      })
      const view = new AvatarView(avatar, container)
      view.controller.onConnectionState = (state: ConnectionState) => this.updateAvatar(uid, { connectionState: state })
      view.controller.onConversationState = (state: ConversationState) => this.updateAvatar(uid, { conversationState: state })
      view.controller.onError = (err: Error) => this.updateAvatar(uid, { error: err.message })
      this._views.set(uid, view)
      this.updateAvatar(uid, { view, loading: false })
      return uid
    } catch (e: any) {
      this.updateAvatar(uid, { loading: false, error: e.message })
      throw e
    }
  }
  removeAvatar(uid: string) {
    const view = this._views.get(uid)
    if (view) { view.controller.close(); view.dispose(); this._views.delete(uid) }
    this._avatars = this._avatars.filter(a => a.uid !== uid)
    if (this._activeUid === uid) {
      const remaining = [...this._views.keys()]
      this._activeUid = remaining[0] ?? null
    }
    this.notify()
  }

  removeAll() {
    this._views.forEach(v => { v.controller.close(); v.dispose() })
    this._views.clear()
    this._avatars = []
    this._activeUid = null
    this.notify()
  }

  dispose() {
    this._views.forEach(v => { v.controller.close(); v.dispose() })
    this._views.clear()
    this._listeners.clear()
  }
}
