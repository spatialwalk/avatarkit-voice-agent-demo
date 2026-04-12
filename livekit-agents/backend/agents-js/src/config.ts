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
  llmApiKey?: string;
  llmBaseUrl?: string;
  sttModel: string;
  sttLanguage: string;
  sttApiKey?: string;
  ttsModel: string;
  ttsLanguage: string;
  ttsVoice: string;
  ttsApiKey?: string;
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
    llmModel: readOptionalEnv("LLM_MODEL") ?? "gpt-4o-mini",
    llmApiKey:
      readOptionalEnv("LLM_API_KEY") ?? readOptionalEnv("OPENAI_API_KEY"),
    llmBaseUrl: readOptionalEnv("LLM_BASE_URL"),
    sttModel: readOptionalEnv("DEEPGRAM_MODEL") ?? "nova-3",
    sttLanguage: readOptionalEnv("DEEPGRAM_LANGUAGE") ?? "en-US",
    sttApiKey: readOptionalEnv("DEEPGRAM_API_KEY"),
    ttsModel: readOptionalEnv("CARTESIA_MODEL") ?? "sonic-2",
    ttsLanguage: readOptionalEnv("CARTESIA_LANGUAGE") ?? "en",
    ttsVoice:
      readOptionalEnv("CARTESIA_VOICE") ??
      "f786b574-daa5-4673-aa0c-cbe3e8534c02",
    ttsApiKey: readOptionalEnv("CARTESIA_API_KEY"),
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
