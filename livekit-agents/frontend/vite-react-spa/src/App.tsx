import { useCallback, useState } from "react";
import { useSessionMessages } from "@livekit/components-react";

import { AgentChatTranscript } from "@/components/agents-ui/agent-chat-transcript";
import { AgentDisconnectButton } from "@/components/agents-ui/agent-disconnect-button";
import { AgentTrackToggle } from "@/components/agents-ui/agent-track-toggle";
import {
  SpatialRealAvatarCanvas,
  SpatialRealAvatarError,
  SpatialRealAvatarFrame,
  SpatialRealAvatarLoading,
  SpatialRealAvatarProvider,
  SpatialRealAvatarStatus,
  useSpatialRealAvatarContext,
} from "@/components/spatialreal-avatar";

type ConnectionInfo = {
  token: string;
  url: string;
  room: string;
};

type AvatarVoiceAgentProps = ConnectionInfo & {
  onDisconnect: () => void;
};

const SessionConversation = () => (
  <AgentChatTranscript
    className="h-full"
    messages={useSessionMessages().messages}
  />
);

function AvatarVoiceAgent({
  token,
  url,
  room,
  onDisconnect,
}: AvatarVoiceAgentProps) {
  const Content = () => {
    const avatar = useSpatialRealAvatarContext();
    const [isMicPending, setIsMicPending] = useState(false);

    const handleMicrophonePressedChange = useCallback(
      async (pressed: boolean) => {
        if (isMicPending) {
          return;
        }

        setIsMicPending(true);

        try {
          if (pressed) {
            await avatar.startPublishingMicrophone();
          } else {
            await avatar.stopPublishingMicrophone();
          }
        } catch (error) {
          console.error("Failed to toggle microphone publishing:", error);
        } finally {
          setIsMicPending(false);
        }
      },
      [avatar, isMicPending],
    );

    return (
      <div className="min-h-screen bg-slate-950 text-slate-50">
        <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
          <header className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                SpatialReal avatar demo
              </h1>
            </div>

            <AgentDisconnectButton type="button" variant="destructive">
              Disconnect
            </AgentDisconnectButton>
          </header>

          <main className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <section className="space-y-4">
              <SpatialRealAvatarFrame>
                <SpatialRealAvatarCanvas />
                <SpatialRealAvatarLoading />
                <SpatialRealAvatarError />
              </SpatialRealAvatarFrame>

              <div className="flex w-48 mx-auto items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 px-4 py-3">
                <div className="flex items-center gap-3">
                  <AgentTrackToggle
                    aria-label="Toggle microphone"
                    disabled={!avatar.isConnected}
                    onPressedChange={(pressed) =>
                      void handleMicrophonePressedChange(pressed)
                    }
                    pending={isMicPending}
                    pressed={avatar.isPublishingMicrophone}
                    source="microphone"
                    variant="outline"
                  />
                  <SpatialRealAvatarStatus />
                </div>
              </div>
            </section>

            <section className="flex min-h-[32rem] flex-col rounded-3xl border border-slate-800 bg-slate-900/80">
              <div className="border-b border-slate-800 px-5 py-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Conversation
                </h2>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-5">
                {avatar.room ? (
                  <SessionConversation />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    Waiting for the LiveKit session to become available...
                  </div>
                )}
              </div>
            </section>
          </main>
        </div>
      </div>
    );
  };

  return (
    <SpatialRealAvatarProvider
      appId={import.meta.env.VITE_SPATIALREAL_APP_ID}
      avatarId={import.meta.env.VITE_SPATIALREAL_AVATAR_ID}
      connection={{ url, token, roomName: room }}
      onDisconnect={onDisconnect}
    >
      <Content />
    </SpatialRealAvatarProvider>
  );
}

function App() {
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(
    null,
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch("/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          room: "voice-agent-room",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get token");
      }

      const data = await response.json();
      setConnectionInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  };

  if (connectionInfo) {
    return (
      <AvatarVoiceAgent
        {...connectionInfo}
        onDisconnect={() => setConnectionInfo(null)}
      />
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">
          LiveKit Agents x Spatialreal
        </h1>
        <p className="text-slate-400 mb-8">Connect to chat with AI</p>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <button
          onClick={connect}
          disabled={isConnecting}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed
                     text-white font-semibold py-3 px-8 rounded-lg transition-colors"
        >
          {isConnecting ? "Connecting..." : "Connect"}
        </button>
      </div>
    </div>
  );
}

export default App;
