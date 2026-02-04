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
import AvatarDisplay from './AvatarDisplay';

interface VoiceAgentProps {
  token: string;
  serverUrl: string;
  roomName: string;
  onDisconnect: () => void;
  avatarEnabled?: boolean;
}

export interface TranscriptMessage {
  id: string;
  text: string;
  participant: 'user' | 'agent';
  timestamp: Date;
  isFinal: boolean;
}

function VoiceAgentInner({
  onDisconnect,
  avatarEnabled = false,
  livekitUrl,
  livekitToken,
  roomName,
}: {
  onDisconnect: () => void;
  avatarEnabled?: boolean;
  livekitUrl: string;
  livekitToken: string;
  roomName: string;
}) {
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
      segments.forEach((segment) => {
        const isAgent = participant?.identity?.includes('agent') ?? false;

        setTranscripts((prev) => {
          const existingIndex = prev.findIndex((t) => t.id === segment.id);
          const newMessage: TranscriptMessage = {
            id: segment.id,
            text: segment.text,
            participant: isAgent ? 'agent' : 'user',
            timestamp: new Date(),
            isFinal: segment.final,
          };

          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = newMessage;
            return updated;
          }
          return [...prev, newMessage];
        });
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
        {/* Content area - split layout when avatar enabled */}
        <div className={`flex-1 overflow-hidden ${avatarEnabled ? 'flex' : 'flex flex-col'}`}>
          {/* Avatar panel (left side when enabled) */}
          {avatarEnabled && (
            <div className="w-1/2 p-4 border-r border-slate-700">
              <AvatarDisplay
                className="h-full"
                livekitUrl={livekitUrl}
                livekitToken={livekitToken}
                roomName={roomName}
              />
            </div>
          )}

          {/* Transcript area */}
          <div className={`overflow-y-auto ${avatarEnabled ? 'w-1/2' : 'flex-1'}`}>
            <TranscriptView transcripts={transcripts} />
          </div>
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
  const { avatarEnabled = false } = props;

  return (
    <LiveKitRoom
      token={props.token}
      serverUrl={props.serverUrl}
      connect={true}
      audio={true}
      video={false}
      onDisconnected={props.onDisconnect}
    >
      {/* Only render RoomAudioRenderer when avatar is NOT enabled */}
      {/* Avatar publishes its own audio track, so we skip this to avoid duplicate audio */}
      {!avatarEnabled && <RoomAudioRenderer />}
      <VoiceAgentInner
        onDisconnect={props.onDisconnect}
        avatarEnabled={avatarEnabled}
        livekitUrl={props.serverUrl}
        livekitToken={props.token}
        roomName={props.roomName}
      />
    </LiveKitRoom>
  );
}
