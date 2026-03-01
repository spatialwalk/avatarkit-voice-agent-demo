"use client";

import { useCallback, useState } from "react";
import AvatarVoiceAgent from "../components/AvatarVoiceAgent";

interface ConnectionInfo {
  token: string;
  url: string;
  room: string;
}

export default function HomePage() {
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
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

      const data = (await response.json()) as ConnectionInfo;
      setConnectionInfo(data);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setConnectionInfo(null);
  }, []);

  if (connectionInfo) {
    return (
      <AvatarVoiceAgent
        token={connectionInfo.token}
        serverUrl={connectionInfo.url}
        roomName={connectionInfo.room}
        onDisconnect={disconnect}
      />
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">LiveKit Agents x Spatialreal</h1>
        <p className="mb-8 text-slate-400">Connect to chat with AI</p>

        {error && (
          <div className="mb-4 rounded border border-red-500 bg-red-900/50 px-4 py-3 text-red-200">
            {error}
          </div>
        )}

        <button
          onClick={() => {
            void connect();
          }}
          disabled={isConnecting}
          className="rounded-lg bg-blue-600 px-8 py-3 font-semibold text-white transition-colors
                     hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-800"
        >
          {isConnecting ? "Connecting..." : "Connect"}
        </button>
      </div>
    </div>
  );
}
