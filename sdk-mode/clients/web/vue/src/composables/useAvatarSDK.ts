import { ref, computed, onUnmounted } from 'vue'
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

let uidCounter = 0
const genUid = () => `avatar-${++uidCounter}`

export function useAvatarManager() {
  const avatars = ref<AvatarInstance[]>([])
  const activeUid = ref<string | null>(null)
  const viewRefs = new Map<string, AvatarView>()

  const activeAvatar = computed(() =>
    avatars.value.find(a => a.uid === activeUid.value) ?? null
  )
  const activeController = computed<AvatarController | null>(() =>
    activeAvatar.value?.view?.controller ?? null
  )

  function updateAvatar(uid: string, patch: Partial<AvatarInstance>) {
    avatars.value = avatars.value.map(a =>
      a.uid === uid ? { ...a, ...patch } : a
    )
  }

  function setActiveUid(uid: string | null) {
    activeUid.value = uid
  }
  async function loadAvatar(
    characterId: string,
    characterName: string,
    container: HTMLElement,
    onProgressCallback?: (progress: number) => void,
  ): Promise<string> {
    const uid = genUid()
    const inst: AvatarInstance = {
      uid,
      characterId,
      characterName,
      view: null,
      connectionState: 'disconnected' as ConnectionState,
      conversationState: 'idle' as ConversationState,
      loading: true,
      loadProgress: 0,
      error: null,
    }
    avatars.value = [...avatars.value, inst]
    activeUid.value = uid

    try {
      const avatar = await AvatarManager.shared.load(characterId, (info) => {
        const p = info.progress ?? 0
        avatars.value = avatars.value.map(a =>
          a.uid === uid ? { ...a, loadProgress: p } : a
        )
        onProgressCallback?.(p)
      })
      const view = new AvatarView(avatar, container)

      view.controller.onConnectionState = (state: ConnectionState) => {
        avatars.value = avatars.value.map(a =>
          a.uid === uid ? { ...a, connectionState: state } : a
        )
      }
      view.controller.onConversationState = (state: ConversationState) => {
        avatars.value = avatars.value.map(a =>
          a.uid === uid ? { ...a, conversationState: state } : a
        )
      }
      view.controller.onError = (err: Error) => {
        avatars.value = avatars.value.map(a =>
          a.uid === uid ? { ...a, error: err.message } : a
        )
      }

      viewRefs.set(uid, view)
      avatars.value = avatars.value.map(a =>
        a.uid === uid ? { ...a, view, loading: false } : a
      )
      return uid
    } catch (e: any) {
      avatars.value = avatars.value.map(a =>
        a.uid === uid ? { ...a, loading: false, error: e.message } : a
      )
      throw e
    }
  }
  function removeAvatar(uid: string) {
    const view = viewRefs.get(uid)
    if (view) {
      view.controller.close()
      view.dispose()
      viewRefs.delete(uid)
    }
    avatars.value = avatars.value.filter(a => a.uid !== uid)
    if (activeUid.value === uid) {
      const remaining = [...viewRefs.keys()]
      activeUid.value = remaining[0] ?? null
    }
  }

  function removeAll() {
    viewRefs.forEach(v => { v.controller.close(); v.dispose() })
    viewRefs.clear()
    avatars.value = []
    activeUid.value = null
  }

  // Cleanup on unmount
  onUnmounted(() => {
    viewRefs.forEach(v => { v.controller.close(); v.dispose() })
    viewRefs.clear()
  })

  return {
    avatars,
    activeUid,
    activeAvatar,
    activeController,
    setActiveUid,
    loadAvatar,
    removeAvatar,
    removeAll,
    updateAvatar,
  }
}
