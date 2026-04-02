/**
 * Error codes for Avatar SDK errors.
 */
export enum AvatarSDKErrorCode {
  /** Session token has expired (HTTP 401) */
  SessionTokenExpired = "sessionTokenExpired",
  /** Session token is invalid (HTTP 400) */
  SessionTokenInvalid = "sessionTokenInvalid",
  /** App ID is not recognized (HTTP 404) */
  AppIDUnrecognized = "appIDUnrecognized",
  /** App ID does not match the requested resource */
  AppIDMismatch = "appIDMismatch",
  /** Avatar was not found */
  AvatarNotFound = "avatarNotFound",
  /** Billing is required before the request can proceed */
  BillingRequired = "billingRequired",
  /** Account credits are exhausted */
  CreditsExhausted = "creditsExhausted",
  /** Session duration limit was exceeded */
  SessionDurationExceeded = "sessionDurationExceeded",
  /** Sample rate is not supported */
  UnsupportedSampleRate = "unsupportedSampleRate",
  /** Egress configuration is invalid */
  InvalidEgressConfig = "invalidEgressConfig",
  /** Egress service is unavailable */
  EgressUnavailable = "egressUnavailable",
  /** Session closed because of inactivity */
  IdleTimeout = "idleTimeout",
  /** Upstream dependency failed */
  UpstreamError = "upstreamError",
  /** Request is invalid */
  InvalidRequest = "invalidRequest",
  /** Transport connection failed */
  ConnectionFailed = "connectionFailed",
  /** WebSocket connection closed unexpectedly */
  ConnectionClosed = "connectionClosed",
  /** Protocol-level decoding or handshake error */
  ProtocolError = "protocolError",
  /** Server-side error */
  ServerError = "serverError",
  /** Unknown error */
  Unknown = "unknown",
}

/**
 * Error class for Avatar SDK specific errors.
 */
export class AvatarSDKError extends Error {
  readonly code: AvatarSDKErrorCode;
  readonly phase: string;
  readonly httpStatus?: number;
  readonly serverCode?: string;
  readonly serverTitle?: string;
  readonly serverDetail?: string;
  readonly connectionId?: string;
  readonly reqId?: string;
  readonly rawBody?: string;
  readonly closeCode?: number;
  readonly closeReason?: string;

  constructor(
    code: AvatarSDKErrorCode,
    message: string,
    details: {
      phase?: string;
      httpStatus?: number;
      serverCode?: string;
      serverTitle?: string;
      serverDetail?: string;
      connectionId?: string;
      reqId?: string;
      rawBody?: string;
      closeCode?: number;
      closeReason?: string;
    } = {}
  ) {
    super(message);
    this.name = "AvatarSDKError";
    this.code = code;
    this.phase = details.phase ?? "unknown";
    this.httpStatus = details.httpStatus;
    this.serverCode = details.serverCode;
    this.serverTitle = details.serverTitle;
    this.serverDetail = details.serverDetail;
    this.connectionId = details.connectionId;
    this.reqId = details.reqId;
    this.rawBody = details.rawBody;
    this.closeCode = details.closeCode;
    this.closeReason = details.closeReason;
  }
}

/**
 * Error thrown when session token request fails.
 */
export class SessionTokenError extends AvatarSDKError {
  constructor(
    message: string,
    details: {
      code?: AvatarSDKErrorCode;
      phase?: string;
      httpStatus?: number;
      serverCode?: string;
      serverTitle?: string;
      serverDetail?: string;
      connectionId?: string;
      reqId?: string;
      rawBody?: string;
      closeCode?: number;
      closeReason?: string;
    } = {}
  ) {
    super(details.code ?? AvatarSDKErrorCode.InvalidRequest, message, {
      phase: details.phase ?? "session_token",
      httpStatus: details.httpStatus,
      serverCode: details.serverCode,
      serverTitle: details.serverTitle,
      serverDetail: details.serverDetail,
      connectionId: details.connectionId,
      reqId: details.reqId,
      rawBody: details.rawBody,
      closeCode: details.closeCode,
      closeReason: details.closeReason,
    });
    this.name = "SessionTokenError";
  }
}
