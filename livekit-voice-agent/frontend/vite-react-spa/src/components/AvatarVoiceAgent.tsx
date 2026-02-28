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

function upsertTranscriptMessage(
  previous: TranscriptMessage[],
  incoming: TranscriptMessage
): TranscriptMessage[] {
  const existingById = previous.findIndex((message) => message.id === incoming.id);
  if (existingById >= 0) {
    const updated = [...previous];
    updated[existingById] = incoming;
    return updated;
  }

  const activeIndex = [...previous]
    .reverse()
    .findIndex((message) => message.participant === incoming.participant && !message.isFinal);

  if (activeIndex >= 0) {
    const indexFromStart = previous.length - 1 - activeIndex;
    const updated = [...previous];
    updated[indexFromStart] = {
      ...updated[indexFromStart],
      text: incoming.text,
      timestamp: incoming.timestamp,
      isFinal: incoming.isFinal,
    };
    return updated;
  }

  return [...previous, incoming];
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
  const disconnectingRef = useRef(false);
  const teardownTaskRef = useRef<Promise<void> | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [containerReady, setContainerReady] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [micTrack, setMicTrack] = useState<Track | undefined>(undefined);

  const teardownAvatar = useCallback(async () => {
    if (teardownTaskRef.current) {
      await teardownTaskRef.current;
      return;
    }

    const player = avatarPlayerRef.current;
    const view = avatarViewRef.current;

    avatarPlayerRef.current = null;
    avatarViewRef.current = null;
    roomRef.current = null;
    roomListenersSetupRef.current = false;
    initializedRef.current = false;

    teardownTaskRef.current = (async () => {
      if (player) {
        try {
          await player.disconnect();
        } catch {
          // Ignore cleanup errors during teardown.
        }
      }

      try {
        view?.dispose?.();
      } catch (error) {
        console.warn('Failed to dispose avatar view:', error);
      }
    })();

    try {
      await teardownTaskRef.current;
    } finally {
      teardownTaskRef.current = null;
    }
  }, []);

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
          environment: Environment.intl,
          drivingServiceMode: DrivingServiceMode.host,
        });
      }

      // Load avatar
      const avatarManager = AvatarManager.shared;
      if (!avatarManager) {
        throw new Error('Failed to get avatar manager');
      }

      const avatar = await avatarManager.load(import.meta.env.VITE_SPATIALREAL_AVATAR_ID);
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

        // Get the native Room client for transcription events
        const room = player.getNativeClient() as Room | null;
        if (room) {
          roomRef.current = room;
          setupRoomEventListeners(room);
        }
      });

      player.on('disconnected', () => {
        console.log('Avatar RTC disconnected');
        if (!disconnectingRef.current) {
          onDisconnect();
        }
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
      const streamId = reader.info.id;
      let text = '';

      console.log('Transcription received:', {
        participantIdentity: participantInfo?.identity,
        streamId,
      });

      const isAgent = (participantInfo?.identity?.includes('agent') ||
                      participantInfo?.identity?.includes('voice-assistant')) ?? false;

      console.log('Processing transcription stream:', { isAgent, identity: participantInfo?.identity, streamId });

      for await (const chunk of reader) {
        text += chunk;

        setTranscripts((prev) => {
          const newMessage: TranscriptMessage = {
            id: streamId,
            text,
            participant: isAgent ? 'agent' : 'user',
            timestamp: new Date(),
            isFinal: false,
          };

          return upsertTranscriptMessage(prev, newMessage);
        });
      }

      const isFinal = reader.info.attributes?.['lk.transcription_final'] === 'true';

      setTranscripts((prev) => {
        const newMessage: TranscriptMessage = {
          id: streamId,
          text,
          participant: isAgent ? 'agent' : 'user',
          timestamp: new Date(),
          isFinal,
        };

        return upsertTranscriptMessage(prev, newMessage);
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
      disconnectingRef.current = true;
      void teardownAvatar();
    };
  }, [containerReady, initializeAvatar, teardownAvatar]);

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
  const handleDisconnect = useCallback(async () => {
    disconnectingRef.current = true;
    await teardownAvatar();
    onDisconnect();
  }, [onDisconnect, teardownAvatar]);

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
