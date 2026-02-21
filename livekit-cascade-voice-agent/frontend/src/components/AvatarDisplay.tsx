/**
 * AvatarDisplay component using avatarkit-rtc to render SpatialReal avatar.
 *
 * The avatar has two states:
 * - Idle state: renders locally without server data
 * - Speaking state: receives animation data from backend via LiveKit RTC
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  AvatarSDK,
  AvatarView,
  AvatarManager,
  DrivingServiceMode,
  Environment,
} from '@spatialwalk/avatarkit';
import { AvatarPlayer, LiveKitProvider } from '@spatialwalk/avatarkit-rtc';

interface AvatarDisplayProps {
  className?: string;
  livekitUrl: string;
  livekitToken: string;
  roomName: string;
}

export default function AvatarDisplay({
  className = '',
  livekitUrl,
  livekitToken,
  roomName,
}: AvatarDisplayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarViewRef = useRef<AvatarView | null>(null);
  const avatarPlayerRef = useRef<AvatarPlayer | null>(null);
  const initializedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [containerReady, setContainerReady] = useState(false);

  // Use callback ref to detect when container is mounted and has dimensions
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      // Wait for next frame to ensure layout is complete
      requestAnimationFrame(() => {
        if (node.offsetWidth > 0 && node.offsetHeight > 0) {
          setContainerReady(true);
        }
      });
    }
  }, []);

  // Initialize AvatarSDK and create AvatarView
  const initializeAvatar = useCallback(async () => {
    if (!containerRef.current || initializedRef.current) return;
    if (containerRef.current.offsetWidth === 0 || containerRef.current.offsetHeight === 0) return;

    initializedRef.current = true;

    try {
      setIsLoading(true);
      setError(null);

      // Initialize SDK with Host Mode (required for RTC integration)
      if (!AvatarSDK.isInitialized) {
        await AvatarSDK.initialize(import.meta.env.VITE_SPATIALREAL_APP_ID, {
          environment: import.meta.env.VITE_SPATIALREAL_ENVIRONMENT === 'intl'
            ? Environment.intl
            : Environment.cn,
          drivingServiceMode: DrivingServiceMode.host,
        });
      }

      // Get the avatar manager (singleton) and load avatar
      const avatarManager = AvatarManager.shared;
      if (!avatarManager) {
        throw new Error('Failed to get avatar manager');
      }

      // Load the avatar
      const avatar = await avatarManager.load(import.meta.env.VITE_SPATIALREAL_AVATAR_ID);

      // Create AvatarView with avatar and container
      const avatarView = new AvatarView(avatar, containerRef.current);

      avatarViewRef.current = avatarView;

      // Create RTC provider and player
      const provider = new LiveKitProvider();
      const player = new AvatarPlayer(provider as unknown as ConstructorParameters<typeof AvatarPlayer>[0], avatarView, {
        logLevel: 'info',
      });

      // Set up event listeners
      player.on('connected', () => {
        console.log('Avatar RTC connected');
        setIsLoading(false);
      });

      player.on('disconnected', () => {
        console.log('Avatar RTC disconnected');
      });

      player.on('error', (err: Error) => {
        console.error('Avatar RTC error:', err);
        setError(err.message);
      });

      player.on('stalled', async () => {
        console.warn('Avatar stream stalled, attempting reconnection...');
        try {
          await player.reconnect();
        } catch (e) {
          console.error('Failed to reconnect avatar stream:', e);
          setError('Avatar stream disconnected');
        }
      });

      // Connect to LiveKit room
      console.log('AvatarPlayer connecting to LiveKit...', { url: livekitUrl, roomName });
      await player.connect({
        url: livekitUrl,
        token: livekitToken,
        roomName: roomName,
      });
      console.log('AvatarPlayer connected successfully');

      avatarPlayerRef.current = player;
      setIsLoading(false);
    } catch (e) {
      console.error('Failed to initialize avatar:', e);
      setError(e instanceof Error ? e.message : 'Failed to initialize avatar');
      setIsLoading(false);
    }
  }, [livekitUrl, livekitToken, roomName]);

  // Initialize avatar when container is ready
  useEffect(() => {
    if (!containerReady) return;

    initializeAvatar();

    return () => {
      // Cleanup
      if (avatarPlayerRef.current) {
        avatarPlayerRef.current.disconnect();
        avatarPlayerRef.current = null;
      }
      if (avatarViewRef.current) {
        avatarViewRef.current.dispose?.();
        avatarViewRef.current = null;
      }
      initializedRef.current = false;
    };
  }, [containerReady, initializeAvatar]);

  return (
    <div className={`relative bg-slate-900 rounded-lg overflow-hidden ${className}`}>
      {/* Avatar rendering container */}
      <div
        ref={setContainerRef}
        className="w-full h-full min-h-[400px]"
      />

      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <span className="text-slate-400 text-sm">Loading avatar...</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
          <div className="text-center text-red-400">
            <span className="block mb-2">Avatar Error</span>
            <span className="text-sm text-slate-400">{error}</span>
          </div>
        </div>
      )}
    </div>
  );
}
