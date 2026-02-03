import { useState, useCallback } from 'react';
import VoiceAgent from './components/VoiceAgent';

interface ConnectionInfo {
  token: string;
  url: string;
  room: string;
  identity: string;
}

function App() {
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      const response = await fetch('/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          room: 'voice-agent-room',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get token');
      }

      const data = await response.json();
      setConnectionInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setConnectionInfo(null);
  }, []);

  if (connectionInfo) {
    return (
      <VoiceAgent
        token={connectionInfo.token}
        serverUrl={connectionInfo.url}
        roomName={connectionInfo.room}
        onDisconnect={disconnect}
      />
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">LiveKit Voice Agent</h1>
        <p className="text-slate-400 mb-8">
          Connect to start a conversation with the AI voice assistant
        </p>

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
          {isConnecting ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    </div>
  );
}

export default App;
