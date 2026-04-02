import { getJobContext } from "@livekit/agents";
import type { Room, AudioFrame } from "@livekit/rtc-node";
import {
  newAvatarSession,
  type AvatarSession as AvatarSdkSession,
} from "../avatar-sdk-js-server/index.js";

import { resolveAvatarConfig, resolveStartConfig, type ResolvedSpatialRealAvatarConfig, type SpatialRealAvatarOptions, type SpatialRealAvatarStartOptions } from "./config.js";
import { ATTRIBUTE_PUBLISH_ON_BEHALF } from "./constants.js";
import { SpatialRealError } from "./errors.js";

export class SpatialRealAvatarSession {
  private readonly config: ResolvedSpatialRealAvatarConfig;
  private avatarSession: AvatarSdkSession | null = null;
  private started = false;
  private activeSampleRate: number | null = null;

  constructor(options: SpatialRealAvatarOptions = {}) {
    this.config = resolveAvatarConfig(options);
  }

  get startedAtLeastOnce(): boolean {
    return this.started;
  }

  get resolvedConfig(): ResolvedSpatialRealAvatarConfig {
    return this.config;
  }

  async start(options: SpatialRealAvatarStartOptions = {}): Promise<void> {
    if (this.started) {
      return;
    }

    const { roomName, agentIdentity } = this.resolveLiveKitContext();
    const startConfig = resolveStartConfig(this.config, options, {
      roomName,
      publishOnBehalfIdentity: agentIdentity,
    });

    this.avatarSession = newAvatarSession({
      apiKey: this.config.apiKey,
      appId: this.config.appId,
      avatarId: this.config.avatarId,
      consoleEndpointUrl: this.config.consoleEndpointUrl,
      ingressEndpointUrl: this.config.ingressEndpointUrl,
      expireAt: new Date(Date.now() + this.config.sessionTtlMs),
      sampleRate: startConfig.sampleRate,
      livekitEgress: {
        url: startConfig.livekitUrl,
        apiKey: startConfig.livekitApiKey,
        apiSecret: startConfig.livekitApiSecret,
        roomName: startConfig.roomName,
        publisherId: this.config.avatarParticipantIdentity,
        extraAttributes: startConfig.publishOnBehalfIdentity
          ? { [ATTRIBUTE_PUBLISH_ON_BEHALF]: startConfig.publishOnBehalfIdentity }
          : undefined,
        idleTimeout: this.config.idleTimeoutSeconds,
      },
    });

    try {
      await this.avatarSession.init();
      await this.avatarSession.start();
      this.started = true;
      this.activeSampleRate = startConfig.sampleRate;
    } catch (error) {
      await this.safeClose();
      throw new SpatialRealError(this.formatStartError(error), { cause: error instanceof Error ? error : undefined });
    }
  }

  async ensureStarted(options: SpatialRealAvatarStartOptions = {}): Promise<void> {
    await this.start(options);
  }

  async sendFrame(frame: AudioFrame, options: SpatialRealAvatarStartOptions = {}): Promise<void> {
    this.assertMono(frame);
    await this.ensureStarted({ ...options, sampleRate: frame.sampleRate });

    if (this.activeSampleRate !== frame.sampleRate) {
      throw new SpatialRealError(
        `sampleRate changed from ${this.activeSampleRate}Hz to ${frame.sampleRate}Hz after avatar startup; resampling is not implemented in this MVP`,
      );
    }

    await this.avatarSession?.sendAudio(this.toPcmBytes(frame), false);
  }

  async endSegment(): Promise<void> {
    if (!this.avatarSession) {
      return;
    }

    await this.avatarSession.sendAudio(new Uint8Array(), true);
  }

  async interrupt(): Promise<void> {
    if (!this.avatarSession) {
      return;
    }

    try {
      await this.avatarSession.interrupt();
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("no request to interrupt")) {
        throw error;
      }
    }
  }

  async close(): Promise<void> {
    await this.safeClose();
    this.avatarSession = null;
    this.started = false;
    this.activeSampleRate = null;
  }

  private resolveLiveKitContext(): { roomName?: string; agentIdentity?: string } {
    try {
      const ctx = getJobContext();
      const roomName = ctx.room.name || undefined;
      const agentIdentity = ctx.agent?.identity ?? ctx.room.localParticipant?.identity;
      return { roomName, agentIdentity };
    } catch {
      return {};
    }
  }

  private assertMono(frame: AudioFrame): void {
    if (frame.channels !== 1) {
      throw new SpatialRealError(`SpatialReal expects mono PCM audio; received ${frame.channels} channels`);
    }
  }

  private toPcmBytes(frame: AudioFrame): Uint8Array {
    return new Uint8Array(frame.data.buffer, frame.data.byteOffset, frame.data.byteLength);
  }

  private formatStartError(error: unknown): string {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return [
      "Failed to start SpatialReal avatar session.",
      "Check SpatialReal credentials, LiveKit room credentials, endpoint URLs, and outbound network access.",
      `avatarId=${this.config.avatarId}`,
      `ingressEndpointUrl=${this.config.ingressEndpointUrl}`,
      `reason=${reason}`,
    ].join(" ");
  }

  private async safeClose(): Promise<void> {
    if (!this.avatarSession) {
      return;
    }

    await this.avatarSession.close();
  }
}

export function roomNameFromRoom(room: Room): string {
  return room.name ?? "";
}
