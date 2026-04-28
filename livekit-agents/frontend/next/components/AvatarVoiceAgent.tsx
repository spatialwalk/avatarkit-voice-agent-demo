"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AvatarManager,
  AvatarSDK,
  AvatarView,
  DrivingServiceMode,
  Environment,
} from "@spatialwalk/avatarkit";
import { AvatarPlayer, LiveKitProvider } from "@spatialwalk/avatarkit-rtc";
import { Room, RoomEvent, Track } from "livekit-client";
import AudioVisualizer from "./AudioVisualizer";
import ChatInput from "./ChatInput";
import TranscriptView from "./TranscriptView";
import { type TranscriptMessage, upsertTranscriptMessage } from "./transcript";

interface AvatarVoiceAgentProps {
  token: string;
  serverUrl: string;
  roomName: string;
  onDisconnect: () => void;
}

function readSpatialrealConfig() {
  const appId = process.env.NEXT_PUBLIC_SPATIALREAL_APP_ID;
  const avatarId = process.env.NEXT_PUBLIC_SPATIALREAL_AVATAR_ID;

  if (!appId || !avatarId) {
    throw new Error(
      "Missing NEXT_PUBLIC_SPATIALREAL_APP_ID or NEXT_PUBLIC_SPATIALREAL_AVATAR_ID",
    );
  }

  return {
    appId,
    avatarId,
    environment: Environment.intl,
  };
}

export default function AvatarVoiceAgent({
  token,
  serverUrl,
  roomName,
  onDisconnect,
}: AvatarVoiceAgentProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
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
  const [isAvatarFullscreen, setIsAvatarFullscreen] = useState(false);

  const isChatVisible = !isAvatarFullscreen;

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
      } catch (disposeError) {
        console.warn("Failed to dispose avatar view:", disposeError);
      }
    })();

    try {
      await teardownTaskRef.current;
    } finally {
      teardownTaskRef.current = null;
    }
  }, []);

  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;

    if (!node) {
      return;
    }

    requestAnimationFrame(() => {
      if (node.offsetWidth > 0 && node.offsetHeight > 0) {
        setContainerReady(true);
      }
    });
  }, []);

  const setupRoomEventListeners = useCallback((room: Room) => {
    if (roomListenersSetupRef.current) {
      return;
    }
    roomListenersSetupRef.current = true;

    room.registerTextStreamHandler("lk.transcription", async (reader, participantInfo) => {
      const streamId = reader.info.id;
      let text = "";

      const isAgent =
        (participantInfo?.identity?.includes("agent") ||
          participantInfo?.identity?.includes("voice-assistant")) ??
        false;

      for await (const chunk of reader) {
        text += chunk;

        setTranscripts((prev) => {
          const newMessage: TranscriptMessage = {
            id: streamId,
            text,
            participant: isAgent ? "agent" : "user",
            timestamp: new Date(),
            isFinal: false,
          };

          return upsertTranscriptMessage(prev, newMessage);
        });
      }

      const isFinal = reader.info.attributes?.["lk.transcription_final"] === "true";

      setTranscripts((prev) => {
        const newMessage: TranscriptMessage = {
          id: streamId,
          text,
          participant: isAgent ? "agent" : "user",
          timestamp: new Date(),
          isFinal,
        };

        return upsertTranscriptMessage(prev, newMessage);
      });
    });

    const handleActiveSpeakers = (speakers: { identity: string }[]) => {
      const agentSpeaking = speakers.some(
        (speaker) =>
          speaker.identity.includes("agent") || speaker.identity.includes("voice-assistant"),
      );
      setIsAgentSpeaking(agentSpeaking);
    };

    room.on(RoomEvent.ActiveSpeakersChanged, handleActiveSpeakers);
  }, []);

  const initializeAvatar = useCallback(async () => {
    if (!containerRef.current || initializedRef.current) {
      return;
    }

    if (containerRef.current.offsetWidth === 0 || containerRef.current.offsetHeight === 0) {
      return;
    }

    initializedRef.current = true;

    try {
      setIsLoading(true);
      setError(null);

      const config = readSpatialrealConfig();

      if (!AvatarSDK.isInitialized) {
        await AvatarSDK.initialize(config.appId, {
          environment: config.environment,
          drivingServiceMode: DrivingServiceMode.host,
        });
      }

      const avatarManager = AvatarManager.shared;
      if (!avatarManager) {
        throw new Error("Failed to get avatar manager");
      }

      const avatar = await avatarManager.load(config.avatarId);
      const avatarView = new AvatarView(avatar, containerRef.current);
      avatarViewRef.current = avatarView;

      const provider = new LiveKitProvider();
      const player = new AvatarPlayer(
        provider as unknown as ConstructorParameters<typeof AvatarPlayer>[0],
        avatarView,
        {
          logLevel: "info",
        },
      );

      player.on("connected", () => {
        setIsLoading(false);
        const room = player.getNativeClient() as Room | null;
        if (room) {
          roomRef.current = room;
          setupRoomEventListeners(room);
        }
      });

      player.on("disconnected", () => {
        if (!disconnectingRef.current) {
          onDisconnect();
        }
      });

      player.on("error", (eventError: unknown) => {
        setError(eventError instanceof Error ? eventError.message : String(eventError));
      });

      player.on("stalled", async () => {
        try {
          await player.reconnect();
        } catch {
          setError("Avatar stream disconnected");
        }
      });

      await player.connect({
        url: serverUrl,
        token,
        roomName,
      });

      avatarPlayerRef.current = player;

      await player.startPublishing();

      const room = player.getNativeClient() as Room | null;
      if (room?.localParticipant) {
        const micPub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        if (micPub?.track) {
          setMicTrack(micPub.track);
        }
      }
    } catch (initError) {
      setError(initError instanceof Error ? initError.message : "Failed to initialize avatar");
      setIsLoading(false);
    }
  }, [onDisconnect, roomName, serverUrl, setupRoomEventListeners, token]);

  useEffect(() => {
    if (!containerReady) {
      return;
    }

    void initializeAvatar();

    return () => {
      disconnectingRef.current = true;
      void teardownAvatar();
    };
  }, [containerReady, initializeAvatar, teardownAvatar]);

  const handleSendMessage = useCallback(async (message: string) => {
    const room = roomRef.current;
    if (!room?.localParticipant) {
      return;
    }

    try {
      await room.localParticipant.sendText(message, { topic: "lk.chat" });

      setTranscripts((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          text: message,
          participant: "user",
          timestamp: new Date(),
          isFinal: true,
        },
      ]);
    } catch (sendError) {
      console.error("Failed to send message:", sendError);
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    disconnectingRef.current = true;
    await teardownAvatar();
    onDisconnect();
  }, [onDisconnect, teardownAvatar]);

  const handleToggleAvatarFullscreen = useCallback(() => {
    setIsAvatarFullscreen((prev) => !prev);
  }, []);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between bg-slate-800 px-6 py-4">
        <h1 className="text-xl font-semibold">Voice Agent</h1>
        <div className="flex items-center gap-4">
          {isAgentSpeaking && (
            <span className="flex items-center gap-2 text-sm text-green-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
              Agent speaking
            </span>
          )}
          <button
            onClick={handleToggleAvatarFullscreen}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
          >
            {isAvatarFullscreen ? "Exit fullscreen" : "Fullscreen avatar"}
          </button>
          <button
            onClick={() => {
              void handleDisconnect();
            }}
            className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
          >
            Disconnect
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          <div
            className={
              isChatVisible
                ? "w-1/2 border-r border-slate-700 p-4"
                : isAvatarFullscreen
                  ? "w-full p-0"
                  : "w-full p-4"
            }
          >
            <div
              className={`relative h-full overflow-hidden bg-slate-900 ${
                isAvatarFullscreen ? "" : "rounded-lg"
              }`}
            >
              <div
                ref={setContainerRef}
                className={`h-full w-full ${isAvatarFullscreen ? "" : "min-h-[400px]"}`}
              />

              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                  <div className="text-center">
                    <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                    <span className="text-sm text-slate-400">Loading avatar...</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
                  <div className="text-center text-red-400">
                    <span className="mb-2 block">Avatar Error</span>
                    <span className="text-sm text-slate-400">{error}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {isChatVisible && (
            <div className="w-1/2 overflow-y-auto">
              <TranscriptView transcripts={transcripts} />
            </div>
          )}
        </div>

        {isChatVisible && (
          <div className="border-t border-slate-700 bg-slate-800 p-4">
            <div className="mx-auto max-w-3xl">
              <div className="mb-4 flex justify-center">
                <AudioVisualizer track={micTrack} />
              </div>

              <ChatInput onSend={handleSendMessage} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
