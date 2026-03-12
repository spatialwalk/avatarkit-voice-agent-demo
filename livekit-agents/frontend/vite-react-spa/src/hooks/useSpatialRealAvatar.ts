import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useSession } from '@livekit/components-react'
import {
  AvatarManager,
  AvatarSDK,
  AvatarView,
  DrivingServiceMode,
  Environment,
  LoadProgress,
} from '@spatialwalk/avatarkit'
import { AvatarPlayer, LiveKitProvider } from '@spatialwalk/avatarkit-rtc'
import { TokenSource, Track } from 'livekit-client'
import type { Room } from 'livekit-client'

import type {
  SpatialRealAvatarState,
  SpatialRealAvatarConnectionStatus,
  UseSpatialRealAvatarOptions,
  UseSpatialRealAvatarResult,
} from '../types/spatialreal-avatar'

function toError(error: unknown, fallbackMessage: string) {
  return error instanceof Error ? error : new Error(fallbackMessage)
}

function sameSdkConfiguration(options: UseSpatialRealAvatarOptions) {
  const configuration = AvatarSDK.configuration

  return (
    AvatarSDK.appId === options.appId &&
    configuration?.environment === (options.environment ?? Environment.intl) &&
    configuration?.drivingServiceMode ===
      (options.drivingServiceMode ?? DrivingServiceMode.host) &&
    configuration?.characterApiBaseUrl === options.characterApiBaseUrl &&
    configuration?.logLevel === options.sdkLogLevel
  )
}

async function ensureAvatarSdk(options: UseSpatialRealAvatarOptions) {
  if (!AvatarSDK.isInitialized) {
    await AvatarSDK.initialize(options.appId, {
      characterApiBaseUrl: options.characterApiBaseUrl,
      drivingServiceMode: options.drivingServiceMode ?? DrivingServiceMode.host,
      environment: options.environment ?? Environment.intl,
      logLevel: options.sdkLogLevel,
    })
  } else if (!sameSdkConfiguration(options)) {
    throw new Error(
      'AvatarSDK is already initialized with a different configuration. Keep appId and SDK options stable across mounted SpatialReal avatar providers.',
    )
  }

  if (options.sessionToken) {
    AvatarSDK.setSessionToken(options.sessionToken)
  }

  if (options.userId) {
    AvatarSDK.setUserId(options.userId)
  }
}

function createIdleState(): SpatialRealAvatarState {
  return {
    downloadProgress: null,
    error: null,
    isConnected: false,
    isLoading: false,
    isPublishingMicrophone: false,
    micTrack: undefined,
    room: null,
    status: 'idle',
  }
}

export function useSpatialRealAvatar(
  options: UseSpatialRealAvatarOptions,
): UseSpatialRealAvatarResult {
  const {
    appId,
    avatarId,
    characterApiBaseUrl,
    connection,
    drivingServiceMode,
    enabled = true,
    environment,
    onAvatarError,
    onConnected,
    onDisconnected,
    onLoadProgress,
    onStateChange,
    playerOptions,
    publishMicrophone = false,
    sdkLogLevel,
    sessionToken,
    userId,
  } = options
  const { roomName, token, url } = connection

  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null)
  const [containerReady, setContainerReady] = useState(false)
  const [state, setState] = useState<SpatialRealAvatarState>(createIdleState)

  const avatarViewRef = useRef<AvatarView | null>(null)
  const playerRef = useRef<AvatarPlayer | null>(null)
  const roomRef = useRef<Room | null>(null)
  const callbacksRef = useRef({
    onAvatarError,
    onConnected,
    onDisconnected,
    onLoadProgress,
    onStateChange,
    playerOptions,
  })

  useEffect(() => {
    callbacksRef.current = {
      onAvatarError,
      onConnected,
      onDisconnected,
      onLoadProgress,
      onStateChange,
      playerOptions,
    }
  }, [onAvatarError, onConnected, onDisconnected, onLoadProgress, onStateChange, playerOptions])

  const tokenSource = useMemo(
    () =>
      TokenSource.literal({
        participantToken: token,
        serverUrl: url,
      }),
    [token, url],
  )

  const baseSession = useSession(tokenSource, {
    room: state.room ?? undefined,
  })

  const updateStatus = useCallback((status: SpatialRealAvatarConnectionStatus) => {
    setState((previous) => ({
      ...previous,
      isConnected: status === 'connected',
      isLoading: status === 'initializing' || status === 'connecting',
      status,
    }))

    callbacksRef.current.onStateChange?.(status)
  }, [])

  const syncMicTrack = useCallback((room: Room | null) => {
    const publication = room?.localParticipant.getTrackPublication(Track.Source.Microphone)

    setState((previous) => ({
      ...previous,
      isPublishingMicrophone: Boolean(publication?.track),
      micTrack: publication?.track,
      room,
    }))
  }, [])

  const teardownInstance = useCallback(async (player: AvatarPlayer | null, view: AvatarView | null) => {
    if (playerRef.current === player) {
      playerRef.current = null
      roomRef.current = null
    }

    if (avatarViewRef.current === view) {
      avatarViewRef.current = null
    }

    try {
      await player?.disconnect()
    } catch {
      // Ignore teardown errors so unmounts stay predictable.
    }

    try {
      view?.dispose()
    } catch {
      // Ignore teardown errors so unmounts stay predictable.
    }
  }, [])

  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    setContainerElement(node)
    setContainerReady(node ? node.offsetWidth > 0 && node.offsetHeight > 0 : false)
  }, [])

  const startPublishingMicrophone = useCallback(async () => {
    const player = playerRef.current

    if (!player) {
      throw new Error('Avatar player is not ready yet.')
    }

    await player.startPublishing()

    const room = player.getNativeClient() as Room | null
    roomRef.current = room
    syncMicTrack(room)
  }, [syncMicTrack])

  const stopPublishingMicrophone = useCallback(async () => {
    const player = playerRef.current

    if (!player) {
      return
    }

    await player.stopPublishing()
    syncMicTrack(roomRef.current)
  }, [syncMicTrack])

  const disconnect = useCallback(async () => {
    const player = playerRef.current
    const view = avatarViewRef.current

    if (!player && !view) {
      setState(createIdleState())
      return
    }

    updateStatus('disconnecting')
    await teardownInstance(player, view)
    setState(createIdleState())
  }, [teardownInstance, updateStatus])

  const session = useMemo(
    () => ({
      ...baseSession,
      end: disconnect,
    }),
    [baseSession, disconnect],
  )

  const reconnect = useCallback(async () => {
    const player = playerRef.current

    if (!player) {
      throw new Error('Avatar player is not ready yet.')
    }

    updateStatus('connecting')

    try {
      await player.reconnect()
      const room = player.getNativeClient() as Room | null
      roomRef.current = room
      syncMicTrack(room)
      updateStatus('connected')
    } catch (error) {
      const normalizedError = toError(error, 'Failed to reconnect avatar stream.')
      setState((previous) => ({
        ...previous,
        error: normalizedError,
        isConnected: false,
        isLoading: false,
        status: 'error',
      }))
      callbacksRef.current.onAvatarError?.(normalizedError)
      callbacksRef.current.onStateChange?.('error')
      throw normalizedError
    }
  }, [syncMicTrack, updateStatus])

  useEffect(() => {
    if (!containerElement) {
      return
    }

    const markReady = () => {
      setContainerReady(containerElement.offsetWidth > 0 && containerElement.offsetHeight > 0)
    }

    const observer = new ResizeObserver(markReady)
    observer.observe(containerElement)
    const frame = requestAnimationFrame(markReady)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [containerElement])

  useEffect(() => {
    if (!enabled || !containerReady || !containerElement) {
      return
    }

    let cancelled = false
    let player: AvatarPlayer | null = null
    let view: AvatarView | null = null
    let connectedNotified = false

    const notifyConnected = (room: Room | null) => {
      if (connectedNotified || cancelled) {
        return
      }

      connectedNotified = true
      callbacksRef.current.onConnected?.(room)
    }

    const cleanupHandlers = () => {
      if (!player) {
        return
      }

      player.off('connected', handleConnected)
      player.off('disconnected', handleDisconnected)
      player.off('error', handleError)
      player.off('stalled', handleStalled)
    }

    const handleConnected = () => {
      if (cancelled || !player) {
        return
      }

      const room = player.getNativeClient() as Room | null
      roomRef.current = room
      syncMicTrack(room)
      updateStatus('connected')
      notifyConnected(room)
    }

    const handleDisconnected = () => {
      if (cancelled) {
        return
      }

      roomRef.current = null
      setState((previous) => ({
        ...previous,
        error: null,
        isConnected: false,
        isLoading: false,
        isPublishingMicrophone: false,
        micTrack: undefined,
        room: null,
        status: 'idle',
      }))
      callbacksRef.current.onStateChange?.('idle')
      callbacksRef.current.onDisconnected?.()
    }

    const handleError = (error: unknown) => {
      if (cancelled) {
        return
      }

      const normalizedError = toError(error, 'Failed to initialize avatar.')
      setState((previous) => ({
        ...previous,
        error: normalizedError,
        isConnected: false,
        isLoading: false,
        status: 'error',
      }))
      callbacksRef.current.onAvatarError?.(normalizedError)
      callbacksRef.current.onStateChange?.('error')
    }

    const handleStalled = async () => {
      if (cancelled || !player) {
        return
      }

      try {
        await player.reconnect()
        if (cancelled) {
          return
        }

        const room = player.getNativeClient() as Room | null
        roomRef.current = room
        syncMicTrack(room)
        updateStatus('connected')
      } catch (error) {
        handleError(toError(error, 'Avatar stream stalled and could not reconnect.'))
      }
    }

    const connectAvatar = async () => {
      updateStatus('initializing')
      setState((previous) => ({
        ...previous,
        downloadProgress: null,
        error: null,
      }))

      try {
        await ensureAvatarSdk({
          appId,
          avatarId,
          characterApiBaseUrl,
          connection: {
            roomName,
            token,
            url,
          },
          drivingServiceMode,
          environment,
          sdkLogLevel,
          sessionToken,
          userId,
        })
        if (cancelled) {
          return
        }

        const avatar = await AvatarManager.shared.load(avatarId, (progress) => {
          callbacksRef.current.onLoadProgress?.(progress)

          setState((previous) => ({
            ...previous,
            downloadProgress:
              progress.type === LoadProgress.downloading
                ? progress.progress ?? null
                : progress.type === LoadProgress.completed
                  ? 1
                  : previous.downloadProgress,
          }))
        })

        if (cancelled) {
          return
        }

        view = new AvatarView(avatar, containerElement)
        player = new AvatarPlayer(new LiveKitProvider(), view, callbacksRef.current.playerOptions)

        avatarViewRef.current = view
        playerRef.current = player

        player.on('connected', handleConnected)
        player.on('disconnected', handleDisconnected)
        player.on('error', handleError)
        player.on('stalled', handleStalled)

        updateStatus('connecting')
        await player.connect({ roomName, token, url })

        if (cancelled || !player) {
          cleanupHandlers()
          await teardownInstance(player, view)
          return
        }

        const room = player.getNativeClient() as Room | null
        roomRef.current = room
        syncMicTrack(room)
        updateStatus('connected')
        notifyConnected(room)
      } catch (error) {
        const normalizedError = toError(error, 'Failed to initialize avatar.')

        if (!cancelled) {
          setState((previous) => ({
            ...previous,
            error: normalizedError,
            isConnected: false,
            isLoading: false,
            status: 'error',
          }))
          callbacksRef.current.onAvatarError?.(normalizedError)
          callbacksRef.current.onStateChange?.('error')
        }

        cleanupHandlers()
        await teardownInstance(player, view)
      }
    }

    void connectAvatar()

    return () => {
      cancelled = true
      cleanupHandlers()
      setState(createIdleState())
      void teardownInstance(player, view)
    }
  }, [
    appId,
    avatarId,
    characterApiBaseUrl,
    containerElement,
    containerReady,
    drivingServiceMode,
    enabled,
    environment,
    sdkLogLevel,
    sessionToken,
    syncMicTrack,
    teardownInstance,
    token,
    updateStatus,
    userId,
    roomName,
    url,
  ])

  useEffect(() => {
    if (!enabled || state.status !== 'connected') {
      return
    }

    if (publishMicrophone) {
      void startPublishingMicrophone().catch((error) => {
        const normalizedError = toError(error, 'Failed to publish microphone audio.')
        setState((previous) => ({
          ...previous,
          error: normalizedError,
          isConnected: false,
          isLoading: false,
          status: 'error',
        }))
        callbacksRef.current.onAvatarError?.(normalizedError)
        callbacksRef.current.onStateChange?.('error')
      })
      return
    }

    void stopPublishingMicrophone().catch((error) => {
      const normalizedError = toError(error, 'Failed to stop microphone publishing.')
      setState((previous) => ({
        ...previous,
        error: normalizedError,
      }))
      callbacksRef.current.onAvatarError?.(normalizedError)
    })
  }, [enabled, publishMicrophone, startPublishingMicrophone, state.status, stopPublishingMicrophone])

  return {
    ...state,
    connection,
    containerRef: setContainerRef,
    disconnect,
    reconnect,
    session,
    startPublishingMicrophone,
    stopPublishingMicrophone,
  }
}
