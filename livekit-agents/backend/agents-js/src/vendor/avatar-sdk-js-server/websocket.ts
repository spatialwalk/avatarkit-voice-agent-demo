/**
 * WebSocket interface that works across different runtimes.
 * Compatible with browser WebSocket, Node.js ws, and other implementations.
 */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: ArrayBuffer | Uint8Array): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    type: "message",
    listener: (event: { data: ArrayBuffer | Uint8Array | Blob }) => void
  ): void;
  addEventListener(
    type: "close",
    listener: (event: { code: number; reason: string }) => void
  ): void;
  addEventListener(type: "error", listener: (event: unknown) => void): void;
  addEventListener(type: "open", listener: () => void): void;
  removeEventListener(type: string, listener: (...args: unknown[]) => void): void;
}

export const WebSocketReadyState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

/**
 * Factory function type for creating WebSocket connections.
 * This allows the SDK to work with different WebSocket implementations.
 */
export type WebSocketFactory = (
  url: string,
  headers?: Record<string, string>
) => Promise<WebSocketLike>;

/**
 * Default WebSocket factory using the global WebSocket constructor.
 * Works in browsers and runtimes with global WebSocket (Bun, Deno, Cloudflare Workers).
 */
export const defaultWebSocketFactory: WebSocketFactory = async (
  url: string,
  headers?: Record<string, string>
): Promise<WebSocketLike> => {
  // Check if we're in an environment with global WebSocket
  if (typeof globalThis.WebSocket !== "undefined") {
    // Standard WebSocket doesn't support custom headers in browsers
    // For environments that support it, we'd need runtime-specific handling
    return new Promise((resolve, reject) => {
      const ws = new globalThis.WebSocket(url);
      ws.binaryType = "arraybuffer";

      ws.addEventListener("open", () => resolve(ws as unknown as WebSocketLike));
      ws.addEventListener("error", (e) => reject(new Error(`WebSocket connection failed: ${e}`)));
    });
  }

  // For Node.js, try to use the 'ws' package
  try {
    // Dynamic import for Node.js ws package
    const { WebSocket: NodeWebSocket } = await import("ws");
    return new Promise((resolve, reject) => {
      const ws = new NodeWebSocket(url, { headers });

      ws.on("open", () => resolve(ws as unknown as WebSocketLike));
      ws.on("error", (e: Error) => reject(new Error(`WebSocket connection failed: ${e.message}`)));
    });
  } catch {
    throw new Error(
      "No WebSocket implementation available. " +
        "In Node.js, install the 'ws' package: npm install ws"
    );
  }
};
