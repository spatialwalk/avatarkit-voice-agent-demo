import {
  AudioFormat as SessionAudioFormat,
  SessionConfig,
  SessionConfigBuilder,
  LiveKitEgressConfig,
} from "./session-config.js";
import { AvatarSDKError, AvatarSDKErrorCode, SessionTokenError } from "./errors.js";
import { generateLogId } from "./logid.js";
import { WebSocketLike, WebSocketFactory, defaultWebSocketFactory } from "./websocket.js";
import {
  Message,
  MessageSchema,
  MessageType,
  AudioFormat as ProtoAudioFormat,
  TransportCompression,
  EgressType,
} from "./proto/generated/message_pb.js";
import { create, toBinary, fromBinary } from "@bufbuild/protobuf";

const SESSION_TOKEN_PATH = "/session-tokens";
const INGRESS_WEBSOCKET_PATH = "/websocket";

export interface AvatarSessionOptions {
  /** Custom WebSocket factory for different runtimes */
  webSocketFactory?: WebSocketFactory;
  /** Custom fetch implementation (for environments without global fetch) */
  fetch?: typeof fetch;
}

/**
 * Manages an active avatar session with WebSocket communication.
 */
export class AvatarSession {
  private readonly config: SessionConfig;
  private readonly options: AvatarSessionOptions;
  private sessionToken: string | null = null;
  private connection: WebSocketLike | null = null;
  private currentReqId: string | null = null;
  private lastReqId: string | null = null;
  private _connectionId: string | null = null;
  private readLoopActive = false;

  constructor(config: SessionConfig, options: AvatarSessionOptions = {}) {
    this.config = config;
    this.options = options;
  }

  /**
   * Get the session configuration.
   */
  getConfig(): SessionConfig {
    return this.config;
  }

  /**
   * Get the connection ID (available after start() completes).
   */
  getConnectionId(): string | null {
    return this._connectionId;
  }

  /**
   * Exchange configuration credentials for a session token from the console API.
   */
  async init(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error("Missing API key");
    }
    if (!this.config.consoleEndpointUrl) {
      throw new Error("Missing console endpoint URL");
    }
    if (!this.config.expireAt) {
      throw new Error("Missing expireAt");
    }

    const endpoint = this.config.consoleEndpointUrl.replace(/\/$/, "") + SESSION_TOKEN_PATH;

    const payload = {
      expireAt: Math.floor(this.config.expireAt.getTime() / 1000),
    };

    const fetchFn = this.options.fetch ?? globalThis.fetch;

    let response: Response;
    try {
      response = await fetchFn(endpoint, {
        method: "POST",
        headers: {
          "X-Api-Key": this.config.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      throw new SessionTokenError(`Failed to create session token: ${error}`, {
        code: AvatarSDKErrorCode.ConnectionFailed,
      });
    }

    const responseText = await response.text();
    const responseData = this.tryParseJson(responseText);

    if (!response.ok) {
      throw this.buildSessionTokenError(response.status, responseData, responseText);
    }

    if (!responseData || typeof responseData !== "object") {
      throw new SessionTokenError("Failed to decode session token response", {
        code: AvatarSDKErrorCode.ProtocolError,
        rawBody: responseText,
      });
    }

    const errors = Array.isArray((responseData as { errors?: unknown }).errors)
      ? (responseData as { errors: unknown[] }).errors
      : [];
    if (errors.length > 0) {
      const details = this.extractErrorDetails(responseData);
      const errorStatus = this.coerceInt(details.status) ?? response.status;
      throw this.buildSessionTokenError(errorStatus, responseData, responseText);
    }

    if (!("sessionToken" in responseData) || !responseData.sessionToken) {
      throw new SessionTokenError("Empty session token in response", {
        code: AvatarSDKErrorCode.ProtocolError,
        rawBody: responseText,
      });
    }

    this.sessionToken = (responseData as { sessionToken: string }).sessionToken;
  }

  /**
   * Establish WebSocket connection to the ingress endpoint.
   * @returns Connection ID for tracking this session.
   */
  async start(): Promise<string> {
    if (this.connection !== null) {
      throw new Error("Session already started");
    }
    if (!this.sessionToken) {
      throw new Error("Session not initialized");
    }
    if (!this.config.ingressEndpointUrl) {
      throw new Error("Missing ingress endpoint URL");
    }
    if (!this.config.avatarId) {
      throw new Error("Missing avatar ID");
    }
    if (!this.config.appId) {
      throw new Error("Missing app ID");
    }

    const endpoint = this.config.ingressEndpointUrl.replace(/\/$/, "") + INGRESS_WEBSOCKET_PATH;

    // Parse URL and convert to WebSocket scheme
    const url = new URL(endpoint);
    const scheme = url.protocol.toLowerCase();

    if (scheme === "http:") {
      url.protocol = "ws:";
    } else if (scheme === "https:") {
      url.protocol = "wss:";
    } else if (scheme !== "ws:" && scheme !== "wss:") {
      throw new Error(`Unsupported scheme: ${scheme}`);
    }

    // Add avatar ID to query parameters
    url.searchParams.set("id", this.config.avatarId);

    // v2 auth: mobile uses headers; web uses query params
    const headers: Record<string, string> = {};
    if (this.config.useQueryAuth) {
      url.searchParams.set("appId", this.config.appId);
      url.searchParams.set("sessionKey", this.sessionToken);
    } else {
      headers["X-App-ID"] = this.config.appId;
      headers["X-Session-Key"] = this.sessionToken;
    }

    const wsFactory = this.options.webSocketFactory ?? defaultWebSocketFactory;

    try {
      this.connection = await wsFactory(url.toString(), headers);
    } catch (e) {
      throw this.buildWebSocketConnectError(e);
    }

    let serverConnectionId: string;
    try {
      await this.sendClientConfigureSession();
      serverConnectionId = await this.awaitServerConfirmSession();
    } catch (error) {
      try {
        this.connection?.close();
      } catch {
        // Ignore close errors during failed startup.
      }
      this.connection = null;
      throw error;
    }
    this._connectionId = serverConnectionId;

    // Start read loop
    this.startReadLoop();

    return serverConnectionId;
  }

  private async sendClientConfigureSession(): Promise<void> {
    if (!this.connection) {
      throw new Error("WebSocket connection is not established");
    }

    const msg = create(MessageSchema, {
      type: MessageType.MESSAGE_CLIENT_CONFIGURE_SESSION,
      data: {
        case: "clientConfigureSession",
        value: {
          sampleRate: this.config.sampleRate,
          bitrate: this.config.bitrate,
          audioFormat: this.protoAudioFormat(this.config.audioFormat),
          transportCompression: TransportCompression.NONE,
          egressType: this.config.livekitEgress ? EgressType.LIVEKIT : EgressType.UNSPECIFIED,
          livekitEgress: this.config.livekitEgress
            ? {
                url: this.config.livekitEgress.url,
                apiKey: this.config.livekitEgress.apiKey,
                apiSecret: this.config.livekitEgress.apiSecret,
                apiToken: this.config.livekitEgress.apiToken,
                roomName: this.config.livekitEgress.roomName,
                publisherId: this.config.livekitEgress.publisherId,
                extraAttributes: this.config.livekitEgress.extraAttributes,
                idleTimeout: this.config.livekitEgress.idleTimeout,
              }
            : undefined,
        },
      },
    });

    const data = toBinary(MessageSchema, msg);
    try {
      this.connection.send(data);
    } catch (error) {
      throw this.buildTransportError(error, "websocket_handshake", "send session configuration");
    }
  }

  private async awaitServerConfirmSession(): Promise<string> {
    if (!this.connection) {
      throw new Error("WebSocket connection is not established");
    }

    return new Promise((resolve, reject) => {
      const onMessage = (event: { data: ArrayBuffer | Uint8Array | Blob }) => {
        try {
          let data: Uint8Array;
          if (event.data instanceof ArrayBuffer) {
            data = new Uint8Array(event.data);
          } else if (event.data instanceof Uint8Array) {
            data = event.data;
          } else {
            reject(
              new AvatarSDKError(
                AvatarSDKErrorCode.ProtocolError,
                "Failed during websocket handshake: expected binary protobuf message",
                { phase: "websocket_handshake" }
              )
            );
            return;
          }

          const envelope = fromBinary(MessageSchema, data);

          if (envelope.type === MessageType.MESSAGE_SERVER_CONFIRM_SESSION) {
            if (envelope.data.case === "serverConfirmSession") {
              const cid = envelope.data.value.connectionId;
              if (!cid) {
                reject(
                  new AvatarSDKError(
                    AvatarSDKErrorCode.ProtocolError,
                    "Handshake succeeded but server_confirm_session.connection_id is empty",
                    { phase: "websocket_handshake" }
                  )
                );
                return;
              }
              this.connection?.removeEventListener("message", onMessage as never);
              this.connection?.removeEventListener("error", onError);
              resolve(cid);
            }
          } else if (envelope.type === MessageType.MESSAGE_SERVER_ERROR) {
            if (envelope.data.case === "serverError") {
              const err = envelope.data.value;
              const serverCode = String(err.code);
              const serverDetail = err.message || undefined;
              reject(
                new AvatarSDKError(
                  this.classifyErrorCode({
                    phase: "websocket_handshake",
                    serverCode,
                    detail: serverDetail,
                  }),
                  this.formatServerErrorMessage("WebSocket handshake rejected by server", {
                    code: serverCode,
                    detail: err.message,
                  }),
                  {
                    phase: "websocket_handshake",
                    connectionId: err.connectionId || undefined,
                    reqId: err.reqId || undefined,
                    serverCode,
                    serverDetail,
                  }
                )
              );
            }
          } else {
            reject(
              new AvatarSDKError(
                AvatarSDKErrorCode.ProtocolError,
                `Unexpected message during handshake: type=${envelope.type}`,
                { phase: "websocket_handshake" }
              )
            );
          }
        } catch (e) {
          reject(
            e instanceof AvatarSDKError
              ? e
              : new AvatarSDKError(
                  AvatarSDKErrorCode.ProtocolError,
                  `Failed during websocket handshake: invalid protobuf payload (${e})`,
                  { phase: "websocket_handshake" }
                )
          );
        }
      };

      const onError = (e: unknown) => {
        reject(this.buildTransportError(e, "websocket_handshake", "receive handshake response"));
      };

      this.connection!.addEventListener("message", onMessage as never);
      this.connection!.addEventListener("error", onError);
    });
  }

  /**
   * Send audio data to the server.
   * @param audio - Raw audio bytes to send
   * @param end - Whether this is the last audio chunk for the current request
   * @returns Request ID for tracking this audio request
   */
  async sendAudio(audio: Uint8Array, end = false): Promise<string> {
    if (!this.connection) {
      throw new Error("WebSocket connection is not established");
    }

    // Generate or reuse request ID
    if (!this.currentReqId) {
      this.currentReqId = generateLogId();
      this.lastReqId = this.currentReqId;
    }

    const reqId = this.currentReqId;

    const msg = create(MessageSchema, {
      type: MessageType.MESSAGE_CLIENT_AUDIO_INPUT,
      data: {
        case: "clientAudioInput",
        value: {
          reqId,
          audio,
          end,
        },
      },
    });

    const data = toBinary(MessageSchema, msg);
    try {
      this.connection.send(data);
    } catch (error) {
      throw this.buildTransportError(error, "websocket_send", "send audio", reqId);
    }

    if (end) {
      this.currentReqId = null;
    }

    return reqId;
  }

  /**
   * Send an interrupt signal to stop the current audio processing.
   * Only works with LiveKit egress mode.
   * @returns The request ID that was interrupted
   */
  async interrupt(): Promise<string> {
    if (!this.connection) {
      throw new Error("interrupt: websocket connection is not established");
    }

    const reqId = this.lastReqId;
    if (!reqId) {
      throw new Error("interrupt: no request to interrupt");
    }

    const msg = create(MessageSchema, {
      type: MessageType.MESSAGE_CLIENT_INTERRUPT,
      data: {
        case: "clientInterrupt",
        value: {
          reqId,
        },
      },
    });

    const data = toBinary(MessageSchema, msg);
    try {
      this.connection.send(data);
    } catch (error) {
      throw this.buildTransportError(error, "websocket_send", "send interrupt", reqId);
    }

    // Clear current request ID so next sendAudio creates a new one
    this.currentReqId = null;

    return reqId;
  }

  /**
   * Close the WebSocket connection and clean up resources.
   */
  async close(): Promise<void> {
    this.readLoopActive = false;

    if (this.connection) {
      try {
        this.connection.close();
      } catch {
        // Ignore close errors
      }
      this.connection = null;
    }

    if (this.config.onClose) {
      try {
        this.config.onClose();
      } catch {
        // Don't let callback errors propagate
      }
    }
  }

  private startReadLoop(): void {
    if (!this.connection) return;

    this.readLoopActive = true;

    this.connection.addEventListener("message", (event) => {
      if (!this.readLoopActive) return;

      try {
        let data: Uint8Array;
        if (event.data instanceof ArrayBuffer) {
          data = new Uint8Array(event.data);
        } else if (event.data instanceof Uint8Array) {
          data = event.data;
        } else {
          return;
        }

        this.handleBinaryMessage(data);
      } catch (e) {
        this.notifyError(
          this.coerceAvatarError(e, {
            code: AvatarSDKErrorCode.ConnectionFailed,
            phase: "websocket_runtime",
            message: `Read loop error: ${e}`,
          })
        );
      }
    });

    this.connection.addEventListener("close", () => {
      this.readLoopActive = false;
      this.close();
    });

    this.connection.addEventListener("error", (e) => {
      this.notifyError(
        this.coerceAvatarError(e, {
          code: AvatarSDKErrorCode.ConnectionFailed,
          phase: "websocket_runtime",
          message: `WebSocket error: ${e}`,
        })
      );
    });
  }

  private handleBinaryMessage(payload: Uint8Array): void {
    let envelope: Message;
    try {
      envelope = fromBinary(MessageSchema, payload);
    } catch (e) {
      this.notifyError(
        new AvatarSDKError(AvatarSDKErrorCode.ProtocolError, `Failed to decode message: ${e}`, {
          phase: "websocket_runtime",
        })
      );
      return;
    }

    if (envelope.type === MessageType.MESSAGE_SERVER_RESPONSE_ANIMATION) {
      if (this.config.transportFrames && envelope.data.case === "serverResponseAnimation") {
        const isLast = envelope.data.value.end;
        try {
          this.config.transportFrames(payload, isLast);
        } catch {
          // Ignore callback errors
        }
      }
    } else if (envelope.type === MessageType.MESSAGE_SERVER_ERROR) {
      if (envelope.data.case === "serverError") {
        const err = envelope.data.value;
        const serverCode = String(err.code);
        const serverDetail = err.message || undefined;
        this.notifyError(
          new AvatarSDKError(
            this.classifyErrorCode({
              phase: "websocket_runtime",
              serverCode,
              detail: serverDetail,
            }),
            this.formatServerErrorMessage("Avatar session error", {
              code: serverCode,
              detail: err.message,
            }),
            {
              phase: "websocket_runtime",
              connectionId: err.connectionId || undefined,
              reqId: err.reqId || undefined,
              serverCode,
              serverDetail,
            }
          )
        );
      }
    }
  }

  private protoAudioFormat(audioFormat: SessionAudioFormat): ProtoAudioFormat {
    if (audioFormat === "ogg_opus") {
      return ProtoAudioFormat.OGG_OPUS;
    }
    return ProtoAudioFormat.PCM_S16LE;
  }

  private tryParseJson(body: string): unknown {
    if (!body) {
      return null;
    }
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }

  private coerceInt(value: unknown): number | null {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private stringify(value: unknown): string | undefined {
    return value === null || value === undefined ? undefined : String(value);
  }

  private extractErrorDetails(payload: unknown): {
    status?: string;
    code?: string;
    title?: string;
    detail?: string;
    message?: string;
  } {
    if (typeof payload === "string") {
      const parsed = this.tryParseJson(payload);
      if (parsed === null) {
        return { message: payload.trim() || undefined };
      }
      payload = parsed;
    }

    if (!payload || typeof payload !== "object") {
      return {};
    }

    const value = payload as {
      errors?: unknown;
      status?: unknown;
      code?: unknown;
      error?: unknown;
      id?: unknown;
      title?: unknown;
      detail?: unknown;
      message?: unknown;
    };

    if (Array.isArray(value.errors) && value.errors.length > 0) {
      const first = value.errors[0];
      if (first && typeof first === "object") {
        const error = first as {
          status?: unknown;
          code?: unknown;
          id?: unknown;
          title?: unknown;
          detail?: unknown;
          message?: unknown;
        };
        return {
          status: this.stringify(error.status),
          code: this.stringify(error.code ?? error.id),
          title: this.stringify(error.title),
          detail: this.stringify(error.detail),
          message: this.stringify(error.message),
        };
      }
    }

    return {
      status: this.stringify(value.status),
      code: this.stringify(value.code ?? value.error ?? value.id),
      title: this.stringify(value.title),
      detail: this.stringify(value.detail),
      message: this.stringify(value.message),
    };
  }

  private composeErrorMessage(
    prefix: string,
    status: number | null,
    details: {
      code?: string;
      title?: string;
      detail?: string;
      message?: string;
    }
  ): string {
    const parts = [details.title, details.detail ?? details.message].filter(Boolean);
    let message = prefix;
    if (status !== null) {
      message += ` (HTTP ${status})`;
    }
    if (parts.length > 0) {
      return `${message}: ${parts.join(" - ")}`;
    }
    if (details.code) {
      return `${message}: ${details.code}`;
    }
    return message;
  }

  private formatServerErrorMessage(
    prefix: string,
    details: { code?: string; detail?: string }
  ): string {
    if (details.code && details.detail) {
      return `${prefix}: ${details.detail} (server code ${details.code})`;
    }
    if (details.detail) {
      return `${prefix}: ${details.detail}`;
    }
    if (details.code) {
      return `${prefix}: server code ${details.code}`;
    }
    return prefix;
  }

  private normalizeErrorText(...values: Array<string | undefined>): string {
    return values
      .filter((value): value is string => Boolean(value && value.trim()))
      .map((value) => value.trim().toLowerCase())
      .join(" | ");
  }

  private classifyErrorCode(input: {
    phase: string;
    httpStatus?: number | null;
    serverCode?: string;
    title?: string;
    detail?: string;
  }): AvatarSDKErrorCode {
    const detailText = this.normalizeErrorText(input.serverCode, input.title, input.detail);

    if (input.serverCode === "3" || input.serverCode === "INVALID_ARGUMENT") {
      if (
        detailText.includes("livekit") ||
        detailText.includes("agora") ||
        detailText.includes("egress")
      ) {
        return AvatarSDKErrorCode.InvalidEgressConfig;
      }
      return AvatarSDKErrorCode.InvalidRequest;
    }
    if (input.serverCode === "16" || input.serverCode === "UNAUTHENTICATED") {
      return AvatarSDKErrorCode.InvalidEgressConfig;
    }
    if (input.serverCode === "14" || input.serverCode === "UNAVAILABLE") {
      return AvatarSDKErrorCode.EgressUnavailable;
    }
    if (input.serverCode === "4001") {
      return AvatarSDKErrorCode.CreditsExhausted;
    }
    if (input.serverCode === "4002") {
      return AvatarSDKErrorCode.SessionDurationExceeded;
    }
    if (detailText.includes("credits exhausted")) {
      return AvatarSDKErrorCode.CreditsExhausted;
    }
    if (
      detailText.includes("session time limit reached") ||
      detailText.includes("maximum session duration")
    ) {
      return AvatarSDKErrorCode.SessionDurationExceeded;
    }
    if (detailText.includes("session denied") || input.httpStatus === 402) {
      return detailText.includes("credits exhausted")
        ? AvatarSDKErrorCode.CreditsExhausted
        : AvatarSDKErrorCode.BillingRequired;
    }
    if (detailText.includes("invalid session token") || detailText.includes("empty token")) {
      return AvatarSDKErrorCode.SessionTokenInvalid;
    }
    if (detailText.includes("token is expired") || detailText.includes("session token expired")) {
      return AvatarSDKErrorCode.SessionTokenExpired;
    }
    if (detailText.includes("app id mismatch")) {
      return AvatarSDKErrorCode.AppIDMismatch;
    }
    if (detailText.includes("appidunrecognized") || detailText.includes("app id unrecognized")) {
      return AvatarSDKErrorCode.AppIDUnrecognized;
    }
    if (detailText.includes("avatar not found")) {
      return AvatarSDKErrorCode.AvatarNotFound;
    }
    if (detailText.includes("unsupported sample rate")) {
      return AvatarSDKErrorCode.UnsupportedSampleRate;
    }
    if (
      detailText.includes("livekit silence timeout") ||
      detailText.includes("no audio input for")
    ) {
      return AvatarSDKErrorCode.IdleTimeout;
    }
    if (detailText.includes("livekit_egress") || detailText.includes("agora_egress")) {
      return AvatarSDKErrorCode.InvalidEgressConfig;
    }
    if (
      detailText.includes("missing livekit credentials") ||
      detailText.includes("provide api_token or both api_key and api_secret") ||
      detailText.includes("unauthorized")
    ) {
      return AvatarSDKErrorCode.InvalidEgressConfig;
    }
    if (
      detailText.includes("egress client is not configured on server") ||
      detailText.includes("failed to create egress connection")
    ) {
      return AvatarSDKErrorCode.EgressUnavailable;
    }
    if (
      detailText.includes("driven server returned non-200 status code") ||
      detailText.includes("driven server request failed")
    ) {
      return AvatarSDKErrorCode.UpstreamError;
    }
    if (
      detailText.includes("expected clientconfiguresession message") ||
      detailText.includes("unexpected message type") ||
      detailText.includes("failed to unmarshal initial message") ||
      detailText.includes("expected binary protobuf message") ||
      detailText.includes("invalid protobuf payload")
    ) {
      return AvatarSDKErrorCode.ProtocolError;
    }

    const httpMapped = this.mapHttpStatusToErrorCode(
      input.httpStatus ?? null,
      input.phase,
      detailText
    );
    if (httpMapped !== AvatarSDKErrorCode.Unknown) {
      return httpMapped;
    }

    if (input.phase === "websocket_handshake" || input.phase === "websocket_runtime") {
      return AvatarSDKErrorCode.ServerError;
    }

    return AvatarSDKErrorCode.Unknown;
  }

  private mapHttpStatusToErrorCode(
    status: number | null,
    phase: string,
    detailText: string
  ): AvatarSDKErrorCode {
    if (status === 401) return AvatarSDKErrorCode.SessionTokenExpired;
    if (status === 404 && detailText.includes("avatar not found")) {
      return AvatarSDKErrorCode.AvatarNotFound;
    }
    if (status === 404) return AvatarSDKErrorCode.AppIDUnrecognized;
    if (status === 402) return AvatarSDKErrorCode.BillingRequired;
    if (status === 400 && detailText.includes("app id mismatch")) {
      return AvatarSDKErrorCode.AppIDMismatch;
    }
    if (phase === "websocket_connect" && status === 400) {
      return AvatarSDKErrorCode.SessionTokenInvalid;
    }
    if (status !== null && status >= 400 && status < 500) {
      return AvatarSDKErrorCode.InvalidRequest;
    }
    if (status !== null && status >= 500) {
      return AvatarSDKErrorCode.ServerError;
    }
    return AvatarSDKErrorCode.Unknown;
  }

  private buildSessionTokenError(
    status: number,
    payload: unknown,
    rawBody: string
  ): SessionTokenError {
    const details = this.extractErrorDetails(payload);
    return new SessionTokenError(
      this.composeErrorMessage("Failed to create session token", status, details),
      {
        code: this.classifyErrorCode({
          phase: "session_token",
          httpStatus: status,
          serverCode: details.code,
          title: details.title,
          detail: details.detail ?? details.message,
        }),
        httpStatus: status,
        serverCode: details.code,
        serverTitle: details.title,
        serverDetail: details.detail ?? details.message,
        rawBody,
      }
    );
  }

  private extractHttpStatus(error: unknown): number | null {
    const value =
      (error as { statusCode?: unknown })?.statusCode ??
      (error as { status?: unknown })?.status ??
      (error as { response?: { statusCode?: unknown; status?: unknown } })?.response?.statusCode ??
      (error as { response?: { statusCode?: unknown; status?: unknown } })?.response?.status;
    return this.coerceInt(value);
  }

  private extractHttpBody(error: unknown): string | undefined {
    const body =
      (error as { body?: unknown })?.body ??
      (error as { response?: { body?: unknown } })?.response?.body;
    if (body === null || body === undefined) {
      return undefined;
    }
    if (body instanceof Uint8Array) {
      return new TextDecoder().decode(body);
    }
    return String(body);
  }

  private buildWebSocketConnectError(error: unknown): AvatarSDKError {
    const status = this.extractHttpStatus(error);
    const rawBody = this.extractHttpBody(error);
    const details = this.extractErrorDetails(rawBody);
    if (status !== null) {
      return new AvatarSDKError(
        this.classifyErrorCode({
          phase: "websocket_connect",
          httpStatus: status,
          serverCode: details.code,
          title: details.title,
          detail: details.detail ?? details.message,
        }),
        this.composeErrorMessage("WebSocket connection rejected", status, details),
        {
          phase: "websocket_connect",
          httpStatus: status,
          serverCode: details.code,
          serverTitle: details.title,
          serverDetail: details.detail ?? details.message,
          rawBody,
        }
      );
    }

    return this.coerceAvatarError(error, {
      code: AvatarSDKErrorCode.ConnectionFailed,
      phase: "websocket_connect",
      message: `Failed to connect to websocket: ${error}`,
    });
  }

  private buildTransportError(
    error: unknown,
    phase: string,
    action: string,
    reqId?: string
  ): AvatarSDKError {
    const closeCode = this.coerceInt((error as { code?: unknown })?.code);
    const closeReason = this.stringify((error as { reason?: unknown })?.reason);
    if (closeCode !== null || closeReason) {
      return new AvatarSDKError(
        AvatarSDKErrorCode.ConnectionClosed,
        this.buildConnectionClosedMessage(closeCode, closeReason),
        {
          phase,
          reqId,
          closeCode: closeCode ?? undefined,
          closeReason,
        }
      );
    }

    return this.coerceAvatarError(error, {
      code: AvatarSDKErrorCode.ConnectionFailed,
      phase,
      message: `Failed to ${action}: ${error}`,
      reqId,
    });
  }

  private buildConnectionClosedMessage(closeCode: number | null, closeReason?: string): string {
    let message = "WebSocket connection closed unexpectedly";
    if (closeCode !== null && closeReason) {
      message += ` (code ${closeCode}: ${closeReason})`;
    } else if (closeCode !== null) {
      message += ` (code ${closeCode})`;
    } else if (closeReason) {
      message += ` (${closeReason})`;
    }
    return message;
  }

  private coerceAvatarError(
    error: unknown,
    details: {
      code: AvatarSDKErrorCode;
      phase: string;
      message: string;
      reqId?: string;
    }
  ): AvatarSDKError {
    if (error instanceof AvatarSDKError) {
      return error;
    }
    return new AvatarSDKError(details.code, details.message, {
      phase: details.phase,
      reqId: details.reqId,
    });
  }

  private notifyError(error: Error): void {
    if (!this.config.onError) {
      return;
    }
    try {
      this.config.onError(error);
    } catch {
      // Ignore callback errors
    }
  }
}

/**
 * Options for creating a new avatar session.
 */
export interface NewAvatarSessionOptions {
  avatarId?: string;
  apiKey?: string;
  appId?: string;
  useQueryAuth?: boolean;
  expireAt?: Date;
  sampleRate?: number;
  bitrate?: number;
  audioFormat?: SessionAudioFormat;
  transportFrames?: (data: Uint8Array, isLast: boolean) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  consoleEndpointUrl?: string;
  ingressEndpointUrl?: string;
  livekitEgress?: LiveKitEgressConfig;
  /** Custom WebSocket factory for different runtimes */
  webSocketFactory?: WebSocketFactory;
  /** Custom fetch implementation */
  fetch?: typeof fetch;
}

/**
 * Create a new AvatarSession with the provided configuration options.
 */
export function newAvatarSession(options: NewAvatarSessionOptions): AvatarSession {
  const builder = new SessionConfigBuilder();

  if (options.avatarId) builder.withAvatarId(options.avatarId);
  if (options.apiKey) builder.withApiKey(options.apiKey);
  if (options.appId) builder.withAppId(options.appId);
  if (options.useQueryAuth !== undefined) builder.withUseQueryAuth(options.useQueryAuth);
  if (options.expireAt) builder.withExpireAt(options.expireAt);
  if (options.sampleRate !== undefined) builder.withSampleRate(options.sampleRate);
  if (options.bitrate !== undefined) builder.withBitrate(options.bitrate);
  if (options.audioFormat !== undefined) builder.withAudioFormat(options.audioFormat);
  if (options.transportFrames) builder.withTransportFrames(options.transportFrames);
  if (options.onError) builder.withOnError(options.onError);
  if (options.onClose) builder.withOnClose(options.onClose);
  if (options.consoleEndpointUrl) builder.withConsoleEndpointUrl(options.consoleEndpointUrl);
  if (options.ingressEndpointUrl) builder.withIngressEndpointUrl(options.ingressEndpointUrl);
  if (options.livekitEgress) builder.withLivekitEgress(options.livekitEgress);

  const config = builder.build();

  return new AvatarSession(config, {
    webSocketFactory: options.webSocketFactory,
    fetch: options.fetch,
  });
}
