import { useCallback, useState, useEffect } from 'react';
import {
  LiveKitRoom,
  useRoomContext,
  useTracks,
  useLocalParticipant,
  RoomAudioRenderer,
} from '@livekit/components-react';
import { Track, RoomEvent, type TranscriptionSegment } from 'livekit-client';
import AudioVisualizer from './AudioVisualizer';
import ChatInput from './ChatInput';
import TranscriptView from './TranscriptView';

interface VoiceAgentProps {
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

function VoiceAgentInner({ onDisconnect }: { onDisconnect: () => void }) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);

  // Get the local microphone track
  const tracks = useTracks([Track.Source.Microphone]);
  const micTrack = tracks.find(
    (t) => t.participant.isLocal && t.source === Track.Source.Microphone
  );

  // Enable microphone on mount
  useEffect(() => {
    localParticipant.setMicrophoneEnabled(true);
  }, [localParticipant]);

  // Handle transcription events
  useEffect(() => {
    const handleTranscription = (
      segments: TranscriptionSegment[],
      participant: { identity: string } | undefined
    ) => {
      const isAgent = participant?.identity?.includes('agent') ?? false;

      setTranscripts((prev) => {
        return segments.reduce((messages, segment) => {
          const newMessage: TranscriptMessage = {
            id: segment.id,
            text: segment.text,
            participant: isAgent ? 'agent' : 'user',
            timestamp: new Date(),
            isFinal: segment.final,
          };

          return upsertTranscriptMessage(messages, newMessage);
        }, prev);
      });
    };

    room.on(RoomEvent.TranscriptionReceived, handleTranscription);
    return () => {
      room.off(RoomEvent.TranscriptionReceived, handleTranscription);
    };
  }, [room]);

  // Track agent speaking state
  useEffect(() => {
    const handleActiveSpeakers = (speakers: { identity: string }[]) => {
      const agentSpeaking = speakers.some((s) => s.identity.includes('agent'));
      setIsAgentSpeaking(agentSpeaking);
    };

    room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);
    };
  }, [room]);

  // Send text message
  const handleSendMessage = useCallback(
    async (message: string) => {
      try {
        await room.localParticipant.sendText(message, { topic: 'lk.chat' });

        // Add user message to transcript
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
    },
    [room]
  );

  const handleDisconnect = useCallback(() => {
    room.disconnect();
    onDisconnect();
  }, [room, onDisconnect]);

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
        <div className="flex-1 overflow-y-auto">
          <TranscriptView transcripts={transcripts} />
        </div>

        {/* Voice activity and input */}
        <div className="bg-slate-800 p-4 border-t border-slate-700">
          <div className="max-w-3xl mx-auto">
            {/* Audio visualizer */}
            <div className="flex justify-center mb-4">
              <AudioVisualizer track={micTrack?.publication?.track} />
            </div>

            {/* Text input */}
            <ChatInput onSend={handleSendMessage} />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function VoiceAgent(props: VoiceAgentProps) {
  return (
    <LiveKitRoom
      token={props.token}
      serverUrl={props.serverUrl}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={props.onDisconnect}
    >
      <RoomAudioRenderer />
      <VoiceAgentInner onDisconnect={props.onDisconnect} />
    </LiveKitRoom>
  );
}
