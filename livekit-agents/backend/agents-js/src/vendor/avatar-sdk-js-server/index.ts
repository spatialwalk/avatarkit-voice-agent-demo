/**
 *
 * This package provides a TypeScript/JavaScript SDK for connecting to avatar service
 * via WebSocket, handles audio streaming and receiving animation frames.
 *
 * Supports Node.js, Bun, Deno, and Cloudflare Workers.
 */

export { AvatarSession, newAvatarSession } from "./avatar-session.js";

export type { AvatarSessionOptions, NewAvatarSessionOptions } from "./avatar-session.js";

export { SessionConfigBuilder } from "./session-config.js";

export type {
  SessionConfig,
  LiveKitEgressConfig,
  TransportFramesCallback,
  ErrorCallback,
  CloseCallback,
} from "./session-config.js";
export { AudioFormat } from "./session-config.js";

export { AvatarSDKError, AvatarSDKErrorCode, SessionTokenError } from "./errors.js";

export { generateLogId } from "./logid.js";

export { WebSocketReadyState, defaultWebSocketFactory } from "./websocket.js";

export type { WebSocketLike, WebSocketFactory } from "./websocket.js";
