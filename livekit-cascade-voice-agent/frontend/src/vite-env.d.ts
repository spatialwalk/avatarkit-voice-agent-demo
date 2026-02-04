/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPATIALREAL_APP_ID: string;
  readonly VITE_SPATIALREAL_AVATAR_ID: string;
  readonly VITE_SPATIALREAL_ENVIRONMENT: string;
  readonly VITE_SPATIALREAL_SESSION_TOKEN?: string;
  readonly VITE_LIVEKIT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Type declarations for @spatialwalk packages
declare module '@spatialwalk/avatarkit/vite' {
  import type { Plugin } from 'vite';
  export function avatarkitVitePlugin(): Plugin;
}

declare module '@spatialwalk/avatarkit' {
  export enum Environment {
    cn = 'cn',
    intl = 'intl',
  }

  export enum DrivingServiceMode {
    sdk = 'SDK',
    host = 'Host',
  }

  export interface AvatarSDKInitOptions {
    environment?: Environment | string;
    drivingServiceMode?: DrivingServiceMode | string;
    audioFormat?: {
      channelCount?: number;
      sampleRate?: number;
    };
  }

  export interface Avatar {
    id: string;
  }

  export interface AvatarController {
    onConnectionState?: (state: string) => void;
    onConversationState?: (state: string) => void;
    onError?: (error: Error) => void;
  }

  export class AvatarSDK {
    static isInitialized: boolean;
    static initialize(appId: string, options?: AvatarSDKInitOptions): Promise<void>;
    static setSessionToken(token: string): void;
  }

  export class AvatarManager {
    static shared: AvatarManager;
    load(avatarId: string): Promise<Avatar>;
  }

  export class AvatarView {
    constructor(avatar: Avatar, container: HTMLElement);
    controller: AvatarController;
    ready: Promise<void>;
    resize?(width: number, height: number): void;
    dispose?(): void;
  }
}

declare module '@spatialwalk/avatarkit-rtc' {
  import type { AvatarView } from '@spatialwalk/avatarkit';

  export type LogLevel = 'info' | 'warning' | 'error' | 'none';
  export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

  export interface AvatarPlayerOptions {
    logLevel?: LogLevel;
  }

  export interface LiveKitConnectionConfig {
    url: string;
    token: string;
    roomName: string;
  }

  export class LiveKitProvider {}

  export class AvatarPlayer {
    constructor(provider: LiveKitProvider, avatarView: AvatarView, options?: AvatarPlayerOptions);
    isConnected: boolean;
    connect(config: LiveKitConnectionConfig): Promise<void>;
    disconnect(): Promise<void>;
    reconnect(): Promise<void>;
    startPublishing(): Promise<void>;
    stopPublishing(): Promise<void>;
    getConnectionState(): ConnectionState;
    getNativeClient(): unknown;
    on(event: 'connected', handler: () => void): void;
    on(event: 'disconnected', handler: () => void): void;
    on(event: 'error', handler: (error: Error) => void): void;
    on(event: 'stalled', handler: () => void): void;
    on(event: 'connection-state-changed', handler: (state: ConnectionState) => void): void;
    off(event: string, handler: Function): void;
  }
}
