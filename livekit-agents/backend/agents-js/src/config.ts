import { config as loadDotEnv } from "dotenv";

loadDotEnv();

export const AGENT_NAME = "voice-assistant";
export const DEFAULT_ROOM_NAME = "voice-agent-room";

export type LiveKitCredentials = {
  apiKey: string;
  apiSecret: string;
  rtcUrl: string;
  serverUrl: string;
};

export type AgentRuntimeConfig = LiveKitCredentials & {
  instructions: string;
  initialGreeting: string;
  llmModel: string;
  sttModel: string;
  sttLanguage: string;
  ttsModel: string;
  ttsVoice: string;
};

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readRequiredEnv(name: string): string {
  const value = readOptionalEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeLiveKitServerUrl(rtcUrl: string): string {
  if (rtcUrl.startsWith("wss://")) {
    return `https://${rtcUrl.slice("wss://".length)}`;
  }

  if (rtcUrl.startsWith("ws://")) {
    return `http://${rtcUrl.slice("ws://".length)}`;
  }

  return rtcUrl;
}

export function getLiveKitCredentials(): LiveKitCredentials {
  const rtcUrl = readRequiredEnv("LIVEKIT_URL");

  return {
    apiKey: readRequiredEnv("LIVEKIT_API_KEY"),
    apiSecret: readRequiredEnv("LIVEKIT_API_SECRET"),
    rtcUrl,
    serverUrl: normalizeLiveKitServerUrl(rtcUrl),
  };
}

export function getAgentRuntimeConfig(): AgentRuntimeConfig {
  return {
    ...getLiveKitCredentials(),
    instructions:
      readOptionalEnv("AGENT_INSTRUCTIONS") ??
      "You are a helpful voice assistant. Keep responses short, friendly, and natural.",
    initialGreeting:
      readOptionalEnv("INITIAL_GREETING") ??
      "Hi there! I am your SpatialReal voice assistant. How can I help?",
    llmModel: readOptionalEnv("LLM_MODEL") ?? "openai/gpt-4.1-mini",
    sttModel: readOptionalEnv("STT_MODEL") ?? "deepgram/nova-3",
    sttLanguage: readOptionalEnv("STT_LANGUAGE") ?? "en",
    ttsModel: readOptionalEnv("TTS_MODEL") ?? "cartesia/sonic-3",
    ttsVoice:
      readOptionalEnv("TTS_VOICE") ?? "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
  };
}

export function getTokenServerPort(): number {
  const rawPort = readOptionalEnv("TOKEN_SERVER_PORT");
  if (!rawPort) {
    return 8080;
  }

  const port = Number.parseInt(rawPort, 10);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid TOKEN_SERVER_PORT: ${rawPort}`);
  }

  return port;
}
