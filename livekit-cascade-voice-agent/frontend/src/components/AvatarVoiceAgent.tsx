/**
 * AvatarVoiceAgent - Voice agent with avatar mode using AvatarPlayer as primary connection.
 *
 * This component uses AvatarPlayer for the LiveKit connection instead of LiveKitRoom
 * to avoid connection conflicts. AvatarPlayer handles both avatar rendering and mic publishing.
 */

import { useCallback, useState, useEffect, useRef } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import {
  AvatarSDK,
  AvatarView,
  AvatarManager,
  DrivingServiceMode,
  Environment,
} from '@spatialwalk/avatarkit';
import { AvatarPlayer, LiveKitProvider } from '@spatialwalk/avatarkit-rtc';
import AudioVisualizer from './AudioVisualizer';
import ChatInput from './ChatInput';
import TranscriptView from './TranscriptView';

interface AvatarVoiceAgentProps {
  token: string;
  serverUrl: string;
  roomName: string;
  onDisconnect: () => void;
}

export interface TranscriptMessage {
  id: string;
  text: string;
  participant: 'user' | 'agent';
  timestamp: Date;
  isFinal: boolean;
}

export default function AvatarVoiceAgent({
  token,
  serverUrl,
  roomName,
  onDisconnect,
}: AvatarVoiceAgentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const avatarViewRef = useRef<AvatarView | null>(null);
  const avatarPlayerRef = useRef<AvatarPlayer | null>(null);
  const roomRef = useRef<Room | null>(null);
  const initializedRef = useRef(false);
  const roomListenersSetupRef = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [containerReady, setContainerReady] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [micTrack, setMicTrack] = useState<Track | undefined>(undefined);

  // Use callback ref to detect when container is mounted
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      requestAnimationFrame(() => {
        if (node.offsetWidth > 0 && node.offsetHeight > 0) {
          setContainerReady(true);
        }
      });
    }
  }, []);

  // Initialize avatar and connect
  const initializeAvatar = useCallback(async () => {
    if (!containerRef.current || initializedRef.current) return;
    if (containerRef.current.offsetWidth === 0 || containerRef.current.offsetHeight === 0) return;

    initializedRef.current = true;

    try {
      setIsLoading(true);
      setError(null);

      // Initialize SDK with Host Mode
      if (!AvatarSDK.isInitialized) {
        await AvatarSDK.initialize(import.meta.env.VITE_SPATIALREAL_APP_ID, {
          environment: import.meta.env.VITE_SPATIALREAL_ENVIRONMENT === 'intl'
            ? Environment.intl
            : Environment.cn,
          drivingServiceMode: DrivingServiceMode.host,
        });
      }

      // Set session token if provided
      const sessionToken = import.meta.env.VITE_SPATIALREAL_SESSION_TOKEN;
      if (sessionToken) {
        AvatarSDK.setSessionToken(sessionToken);
      }

      // Load avatar
      const avatarManager = AvatarManager.shared;
      if (!avatarManager) {
        throw new Error('Failed to get avatar manager');
      }

      const avatar = await avatarManager.load(import.meta.env.VITE_SPATIALREAL_AVATAR_ID);
      const avatarView = new AvatarView(avatar, containerRef.current);
      await avatarView.ready;
      avatarViewRef.current = avatarView;

      // Create RTC provider and player
      const provider = new LiveKitProvider();
      const player = new AvatarPlayer(provider, avatarView, {
        logLevel: 'info',
      });

      // Set up event listeners
      player.on('connected', () => {
        console.log('Avatar RTC connected');
        setIsConnected(true);
        setIsLoading(false);

        // Get the native Room client for transcription events
        const room = player.getNativeClient() as Room | null;
        if (room) {
          roomRef.current = room;
          setupRoomEventListeners(room);
        }
      });

      player.on('disconnected', () => {
        console.log('Avatar RTC disconnected');
        setIsConnected(false);
        onDisconnect();
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
      console.log('AvatarPlayer connecting to LiveKit...', { url: serverUrl, roomName });
      await player.connect({
        url: serverUrl,
        token: token,
        roomName: roomName,
      });
      console.log('AvatarPlayer connected successfully');

      avatarPlayerRef.current = player;

      // Start publishing microphone
      await player.startPublishing();
      console.log('Microphone publishing started');

      // Get mic track for visualizer
      const room = player.getNativeClient() as Room | null;
      if (room?.localParticipant) {
        const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (micPub?.track) {
          setMicTrack(micPub.track);
        }
      }

    } catch (e) {
      console.error('Failed to initialize avatar:', e);
      setError(e instanceof Error ? e.message : 'Failed to initialize avatar');
      setIsLoading(false);
    }
  }, [serverUrl, token, roomName, onDisconnect]);

  // Setup room event listeners for transcription
  const setupRoomEventListeners = useCallback((room: Room) => {
    // Prevent duplicate registration
    if (roomListenersSetupRef.current) {
      return;
    }
    roomListenersSetupRef.current = true;

    // Register text stream handler for transcriptions (Agents 1.0+ API)
    room.registerTextStreamHandler('lk.transcription', async (reader, participantInfo) => {
      const text = await reader.readAll();
      const isFinal = reader.info.attributes?.['lk.transcription_final'] === 'true';
      const streamId = reader.info.id;

      console.log('Transcription received:', {
        participantIdentity: participantInfo?.identity,
        text,
        isFinal,
        streamId,
      });

      const isAgent = (participantInfo?.identity?.includes('agent') ||
                      participantInfo?.identity?.includes('voice-assistant')) ?? false;

      console.log('Processing transcription:', { isAgent, identity: participantInfo?.identity, text });

      setTranscripts((prev) => {
        // Use stream ID as the message ID
        const existingIndex = prev.findIndex((t) => t.id === streamId);
        const newMessage: TranscriptMessage = {
          id: streamId,
          text: text,
          participant: isAgent ? 'agent' : 'user',
          timestamp: new Date(),
          isFinal: isFinal,
        };

        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = newMessage;
          return updated;
        }
        return [...prev, newMessage];
      });
    });

    const handleActiveSpeakers = (speakers: { identity: string }[]) => {
      const agentSpeaking = speakers.some((s) =>
        s.identity.includes('agent') || s.identity.includes('voice-assistant')
      );
      setIsAgentSpeaking(agentSpeaking);
    };

    room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);
    console.log('Room event listeners set up for room:', room.name);
  }, []);

  // Initialize when container is ready
  useEffect(() => {
    if (!containerReady) return;

    initializeAvatar();

    return () => {
      if (avatarPlayerRef.current) {
        // disconnect() is async and internally calls stopPublishing()
        // Use .catch() to suppress any errors during cleanup
        avatarPlayerRef.current.disconnect().catch(() => {});
        avatarPlayerRef.current = null;
      }
      if (avatarViewRef.current) {
        avatarViewRef.current.dispose?.();
        avatarViewRef.current = null;
      }
      roomRef.current = null;
      initializedRef.current = false;
      roomListenersSetupRef.current = false;
    };
  }, [containerReady, initializeAvatar]);

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current || !avatarViewRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        avatarViewRef.current?.resize?.(width, height);
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isConnected]);

  // Send text message
  const handleSendMessage = useCallback(async (message: string) => {
    const room = roomRef.current;
    if (!room?.localParticipant) return;

    try {
      await room.localParticipant.sendText(message, { topic: 'lk.chat' });

      setTranscripts((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          text: message,
          participant: 'user',
          timestamp: new Date(),
          isFinal: true,
        },
      ]);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  }, []);

  // Handle disconnect
  const handleDisconnect = useCallback(() => {
    if (avatarPlayerRef.current) {
      // disconnect() is async and internally calls stopPublishing()
      // Use .catch() to suppress any errors
      avatarPlayerRef.current.disconnect().catch(() => {});
    }
    onDisconnect();
  }, [onDisconnect]);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-slate-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Voice Agent</h1>
        <div className="flex items-center gap-4">
          {isAgentSpeaking && (
            <span className="text-green-400 text-sm flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Agent speaking
            </span>
          )}
          <button
            onClick={handleDisconnect}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Disconnect
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Content area - split layout */}
        <div className="flex-1 overflow-hidden flex">
          {/* Avatar panel (left side) */}
          <div className="w-1/2 p-4 border-r border-slate-700">
            <div className={`relative bg-slate-900 rounded-lg overflow-hidden h-full`}>
              <div
                ref={setContainerRef}
                className="w-full h-full min-h-[400px]"
              />

              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                    <span className="text-slate-400 text-sm">Loading avatar...</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                  <div className="text-center text-red-400">
                    <span className="block mb-2">Avatar Error</span>
                    <span className="text-sm text-slate-400">{error}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Transcript area */}
          <div className="w-1/2 overflow-y-auto">
            <TranscriptView transcripts={transcripts} />
          </div>
        </div>

        {/* Voice activity and input */}
        <div className="bg-slate-800 p-4 border-t border-slate-700">
          <div className="max-w-3xl mx-auto">
            {/* Audio visualizer */}
            <div className="flex justify-center mb-4">
              <AudioVisualizer track={micTrack} />
            </div>

            {/* Text input */}
            <ChatInput onSend={handleSendMessage} />
          </div>
        </div>
      </main>
    </div>
  );
}
