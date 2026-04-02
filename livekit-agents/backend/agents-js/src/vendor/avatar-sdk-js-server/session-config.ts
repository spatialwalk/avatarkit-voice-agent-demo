export enum AudioFormat {
  PCM_S16LE = "pcm_s16le",
  OGG_OPUS = "ogg_opus",
}

/**
 * Configuration for streaming to a LiveKit room.
 */
export interface LiveKitEgressConfig {
  /** LiveKit server URL (e.g., wss://livekit.example.com) */
  url: string;
  /** LiveKit API key */
  apiKey: string;
  /** LiveKit API secret */
  apiSecret: string;
  /** Pre-generated LiveKit access token. Preferred over apiKey/apiSecret */
  apiToken?: string;
  /** LiveKit room name to join */
  roomName: string;
  /** Publisher identity in the room */
  publisherId: string;
  /** Extra participant attributes passed to LiveKit */
  extraAttributes?: Record<string, string>;
  /** Idle timeout in seconds. 0 or undefined means server default */
  idleTimeout?: number;
}

/**
 * Callback for receiving animation frames.
 * @param data - The frame data bytes
 * @param isLast - Whether this is the last frame
 */
export type TransportFramesCallback = (data: Uint8Array, isLast: boolean) => void;

/**
 * Callback for handling errors.
 * @param error - The error that occurred
 */
export type ErrorCallback = (error: Error) => void;

/**
 * Callback for handling session close.
 */
export type CloseCallback = () => void;

/**
 * Configuration for an AvatarSession.
 */
export interface SessionConfig {
  /** Avatar identifier */
  avatarId: string;
  /** API key for authentication */
  apiKey: string;
  /** Application identifier */
  appId: string;
  /** Send websocket auth via query params (web) instead of headers (mobile) */
  useQueryAuth: boolean;
  /** Session expiration time */
  expireAt: Date;
  /** Audio sample rate in Hz (default: 16000) */
  sampleRate: number;
  /** Audio bitrate (default: 0) */
  bitrate: number;
  /** Audio input encoding negotiated with the server */
  audioFormat: AudioFormat;
  /** Callback for receiving animation frames */
  transportFrames: TransportFramesCallback | null;
  /** Callback for error handling */
  onError: ErrorCallback | null;
  /** Callback invoked when session closes */
  onClose: CloseCallback | null;
  /** Console API URL */
  consoleEndpointUrl: string;
  /** Ingress WebSocket URL */
  ingressEndpointUrl: string;
  /** LiveKit egress configuration (optional) */
  livekitEgress: LiveKitEgressConfig | null;
}

/**
 * Builder for constructing SessionConfig with fluent interface.
 */
export class SessionConfigBuilder {
  private config: SessionConfig = {
    avatarId: "",
    apiKey: "",
    appId: "",
    useQueryAuth: false,
    expireAt: new Date(),
    sampleRate: 16000,
    bitrate: 0,
    audioFormat: AudioFormat.PCM_S16LE,
    transportFrames: null,
    onError: null,
    onClose: null,
    consoleEndpointUrl: "",
    ingressEndpointUrl: "",
    livekitEgress: null,
  };

  withAvatarId(avatarId: string): this {
    this.config.avatarId = avatarId;
    return this;
  }

  withApiKey(apiKey: string): this {
    this.config.apiKey = apiKey;
    return this;
  }

  withAppId(appId: string): this {
    this.config.appId = appId;
    return this;
  }

  withUseQueryAuth(useQueryAuth: boolean): this {
    this.config.useQueryAuth = useQueryAuth;
    return this;
  }

  withExpireAt(expireAt: Date): this {
    this.config.expireAt = expireAt;
    return this;
  }

  withSampleRate(sampleRate: number): this {
    this.config.sampleRate = sampleRate;
    return this;
  }

  withBitrate(bitrate: number): this {
    this.config.bitrate = bitrate;
    return this;
  }

  withAudioFormat(audioFormat: AudioFormat): this {
    this.config.audioFormat = audioFormat;
    return this;
  }

  withTransportFrames(callback: TransportFramesCallback): this {
    this.config.transportFrames = callback;
    return this;
  }

  withOnError(callback: ErrorCallback): this {
    this.config.onError = callback;
    return this;
  }

  withOnClose(callback: CloseCallback): this {
    this.config.onClose = callback;
    return this;
  }

  withConsoleEndpointUrl(url: string): this {
    this.config.consoleEndpointUrl = url;
    return this;
  }

  withIngressEndpointUrl(url: string): this {
    this.config.ingressEndpointUrl = url;
    return this;
  }

  withLivekitEgress(config: LiveKitEgressConfig): this {
    this.config.livekitEgress = config;
    return this;
  }

  build(): SessionConfig {
    return { ...this.config };
  }
}
