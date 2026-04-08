'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
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
  const [avatars, setAvatars] = useState<AvatarInstance[]>([])
  const [activeUid, setActiveUid] = useState<string | null>(null)
  const viewRefs = useRef<Map<string, AvatarView>>(new Map())

  const activeAvatar = avatars.find(a => a.uid === activeUid) ?? null
  const activeController: AvatarController | null = activeAvatar?.view?.controller ?? null

  const updateAvatar = useCallback((uid: string, patch: Partial<AvatarInstance>) => {
    setAvatars(prev => prev.map(a => a.uid === uid ? { ...a, ...patch } : a))
  }, [])

  const loadAvatar = useCallback(async (
    characterId: string,
    characterName: string,
    container: HTMLElement,
    onProgressCallback?: (progress: number) => void,
  ): Promise<string> => {
    const uid = genUid()
    const inst: AvatarInstance = {
      uid, characterId, characterName,
      view: null,
      connectionState: 'disconnected' as ConnectionState,
      conversationState: 'idle' as ConversationState,
      loading: true,
      loadProgress: 0,
      error: null,
    }
    setAvatars(prev => [...prev, inst])
    setActiveUid(uid)

    try {
      const avatar = await AvatarManager.shared.load(characterId, (info) => {
        const p = info.progress ?? 0
        setAvatars(prev => prev.map(a =>
          a.uid === uid ? { ...a, loadProgress: p } : a
        ))
        onProgressCallback?.(p)
      })
      const view = new AvatarView(avatar, container)

      view.controller.onConnectionState = (state: ConnectionState) => {
        setAvatars(prev => prev.map(a => a.uid === uid ? { ...a, connectionState: state } : a))
      }
      view.controller.onConversationState = (state: ConversationState) => {
        setAvatars(prev => prev.map(a => a.uid === uid ? { ...a, conversationState: state } : a))
      }
      view.controller.onError = (err: Error) => {
        setAvatars(prev => prev.map(a => a.uid === uid ? { ...a, error: err.message } : a))
      }

      viewRefs.current.set(uid, view)
      setAvatars(prev => prev.map(a => a.uid === uid ? { ...a, view, loading: false } : a))
      return uid
    } catch (e: any) {
      setAvatars(prev => prev.map(a =>
        a.uid === uid ? { ...a, loading: false, error: e.message } : a
      ))
      throw e
    }
  }, [])

  const removeAvatar = useCallback((uid: string) => {
    const view = viewRefs.current.get(uid)
    if (view) {
      view.controller.close()
      view.dispose()
      viewRefs.current.delete(uid)
    }
    setAvatars(prev => prev.filter(a => a.uid !== uid))
    setActiveUid(prev => {
      if (prev === uid) {
        const remaining = [...viewRefs.current.keys()]
        return remaining[0] ?? null
      }
      return prev
    })
  }, [])

  const removeAll = useCallback(() => {
    viewRefs.current.forEach(v => { v.controller.close(); v.dispose() })
    viewRefs.current.clear()
    setAvatars([])
    setActiveUid(null)
  }, [])

  useEffect(() => {
    return () => {
      viewRefs.current.forEach(v => { v.controller.close(); v.dispose() })
      viewRefs.current.clear()
    }
  }, [])

  return {
    avatars, activeUid, activeAvatar, activeController,
    setActiveUid, loadAvatar, removeAvatar, removeAll, updateAvatar,
  }
}