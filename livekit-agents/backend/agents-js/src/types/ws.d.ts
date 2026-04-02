declare module "ws" {
  export class WebSocket {
    constructor(url: string, options?: { headers?: Record<string, string> });
    on(event: "open", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
  }
}
