import { DEFAULT_AVATAR_PARTICIPANT_IDENTITY, DEFAULT_CONSOLE_ENDPOINT, DEFAULT_INGRESS_ENDPOINT, DEFAULT_SAMPLE_RATE, DEFAULT_SESSION_TTL_MS } from "./constants.js";
import { SpatialRealError } from "./errors.js";

export interface SpatialRealAvatarOptions {
  apiKey?: string;
  appId?: string;
  avatarId?: string;
  consoleEndpointUrl?: string;
  ingressEndpointUrl?: string;
  avatarParticipantIdentity?: string;
  idleTimeoutSeconds?: number;
  sampleRate?: number;
  sessionTtlMs?: number;
}

export interface SpatialRealAvatarStartOptions {
  roomName?: string;
  livekitUrl?: string;
  livekitApiKey?: string;
  livekitApiSecret?: string;
  publishOnBehalfIdentity?: string;
  sampleRate?: number;
}

export interface ResolvedSpatialRealAvatarConfig {
  apiKey: string;
  appId: string;
  avatarId: string;
  consoleEndpointUrl: string;
  ingressEndpointUrl: string;
  avatarParticipantIdentity: string;
  idleTimeoutSeconds: number;
  sampleRate: number;
  sessionTtlMs: number;
}

export interface ResolvedSpatialRealStartConfig {
  roomName: string;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  publishOnBehalfIdentity?: string;
  sampleRate: number;
}

function getRequired(key: string, value: string | undefined): string {
  if (!value) {
    throw new SpatialRealError(`${key} must be provided or ${key} environment variable must be set`);
  }

  return value;
}

export function resolveAvatarConfig(options: SpatialRealAvatarOptions): ResolvedSpatialRealAvatarConfig {
  const idleTimeoutSeconds = options.idleTimeoutSeconds ?? 0;
  if (idleTimeoutSeconds < 0) {
    throw new SpatialRealError("idleTimeoutSeconds must be greater than or equal to 0");
  }

  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  if (sampleRate <= 0) {
    throw new SpatialRealError("sampleRate must be greater than 0");
  }

  const sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  if (sessionTtlMs <= 0) {
    throw new SpatialRealError("sessionTtlMs must be greater than 0");
  }

  return {
    apiKey: getRequired("SPATIALREAL_API_KEY", options.apiKey ?? process.env.SPATIALREAL_API_KEY),
    appId: getRequired("SPATIALREAL_APP_ID", options.appId ?? process.env.SPATIALREAL_APP_ID),
    avatarId: getRequired("SPATIALREAL_AVATAR_ID", options.avatarId ?? process.env.SPATIALREAL_AVATAR_ID),
    consoleEndpointUrl: options.consoleEndpointUrl ?? process.env.SPATIALREAL_CONSOLE_ENDPOINT ?? DEFAULT_CONSOLE_ENDPOINT,
    ingressEndpointUrl: options.ingressEndpointUrl ?? process.env.SPATIALREAL_INGRESS_ENDPOINT ?? DEFAULT_INGRESS_ENDPOINT,
    avatarParticipantIdentity: options.avatarParticipantIdentity ?? DEFAULT_AVATAR_PARTICIPANT_IDENTITY,
    idleTimeoutSeconds,
    sampleRate,
    sessionTtlMs,
  };
}

export function resolveStartConfig(
  baseConfig: ResolvedSpatialRealAvatarConfig,
  options: SpatialRealAvatarStartOptions,
  defaults: {
    roomName?: string;
    livekitUrl?: string;
    livekitApiKey?: string;
    livekitApiSecret?: string;
    publishOnBehalfIdentity?: string;
    sampleRate?: number;
  } = {},
): ResolvedSpatialRealStartConfig {
  const roomName = options.roomName ?? defaults.roomName;
  if (!roomName) {
    throw new SpatialRealError("roomName must be provided or resolvable from the current LiveKit job context");
  }

  const livekitUrl = options.livekitUrl ?? defaults.livekitUrl ?? process.env.LIVEKIT_URL;
  if (!livekitUrl) {
    throw new SpatialRealError("livekitUrl must be provided or LIVEKIT_URL environment variable must be set");
  }

  const livekitApiKey = options.livekitApiKey ?? defaults.livekitApiKey ?? process.env.LIVEKIT_API_KEY;
  const livekitApiSecret = options.livekitApiSecret ?? defaults.livekitApiSecret ?? process.env.LIVEKIT_API_SECRET;
  if (!livekitApiKey || !livekitApiSecret) {
    throw new SpatialRealError(
      "livekitApiKey and livekitApiSecret must be provided or LIVEKIT_API_KEY and LIVEKIT_API_SECRET environment variables must be set",
    );
  }

  const sampleRate = options.sampleRate ?? defaults.sampleRate ?? baseConfig.sampleRate;
  if (sampleRate <= 0) {
    throw new SpatialRealError("sampleRate must be greater than 0");
  }

  return {
    roomName,
    livekitUrl,
    livekitApiKey,
    livekitApiSecret,
    publishOnBehalfIdentity: options.publishOnBehalfIdentity ?? defaults.publishOnBehalfIdentity,
    sampleRate,
  };
}
