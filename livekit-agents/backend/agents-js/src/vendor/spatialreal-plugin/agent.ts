import { voice } from "@livekit/agents";
import type { AudioFrame } from "@livekit/rtc-node";
import { ReadableStream } from "node:stream/web";

import type { SpatialRealAvatarStartOptions } from "./config.js";
import { SpatialRealAvatarSession } from "./avatar-session.js";

export interface AttachSpatialRealAvatarOptions extends SpatialRealAvatarStartOptions {
  autoClose?: boolean;
  debugLogPrefix?: string;
}

type AgentLike = {
  ttsNode?: voice.Agent["ttsNode"];
  realtimeAudioOutputNode?: voice.Agent["realtimeAudioOutputNode"];
  onExit?: () => Promise<void> | void;
};

export function attachSpatialRealAvatar<T extends voice.Agent>(
  agent: T,
  avatar: SpatialRealAvatarSession,
  options: AttachSpatialRealAvatarOptions = {},
): T {
  const patched = agent as T & AgentLike & { __spatialRealAttached?: boolean };
  if (patched.__spatialRealAttached) {
    return agent;
  }

  const originalTtsNode = patched.ttsNode?.bind(agent);
  const originalRealtimeAudioOutputNode = patched.realtimeAudioOutputNode?.bind(agent);
  const originalOnExit = patched.onExit?.bind(agent);

  patched.ttsNode = async (text, modelSettings) => {
    const stream =
      (await originalTtsNode?.(text, modelSettings)) ??
      (await voice.Agent.default.ttsNode(agent, text, modelSettings));

    if (!stream) {
      return null;
    }

    return mirrorAudioFrameStream(stream, avatar, options);
  };

  patched.realtimeAudioOutputNode = async (audio, modelSettings) => {
    const stream =
      (await originalRealtimeAudioOutputNode?.(audio, modelSettings)) ??
      (await voice.Agent.default.realtimeAudioOutputNode(agent, audio, modelSettings));

    if (!stream) {
      return null;
    }

    return mirrorAudioFrameStream(stream, avatar, options);
  };

  patched.onExit = async () => {
    try {
      await originalOnExit?.();
    } finally {
      if (options.autoClose ?? true) {
        await avatar.close();
      }
    }
  };

  patched.__spatialRealAttached = true;
  return agent;
}

function mirrorAudioFrameStream(
  stream: ReadableStream<AudioFrame>,
  avatar: SpatialRealAvatarSession,
  options: AttachSpatialRealAvatarOptions,
): ReadableStream<AudioFrame> {
  const reader = stream.getReader();
  let finalized = false;
  let sawFrame = false;
  let frameCount = 0;

  const log = (message: string, details?: unknown): void => {
    if (!options.debugLogPrefix) {
      return;
    }

    if (details === undefined) {
      console.log(`${options.debugLogPrefix} ${message}`);
      return;
    }

    console.log(`${options.debugLogPrefix} ${message}`, details);
  };

  const finalize = async (interrupted: boolean): Promise<void> => {
    if (finalized) {
      return;
    }

    finalized = true;

    if (interrupted) {
      log("avatar audio stream interrupted", { frameCount });
      await avatar.interrupt();
      return;
    }

    if (sawFrame) {
      log("avatar audio stream completed", { frameCount });
      await avatar.endSegment();
    }
  };

  return new ReadableStream<AudioFrame>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          await finalize(false);
          controller.close();
          return;
        }

        sawFrame = true;
        frameCount += 1;
        if (frameCount === 1) {
          log("avatar audio stream started", {
            sampleRate: value.sampleRate,
            channels: value.channels,
            samplesPerChannel: value.samplesPerChannel,
          });
        }
        await avatar.sendFrame(value, options);
        controller.enqueue(value);
      } catch (error) {
        log("avatar audio stream failed", error);
        await finalize(true);
        controller.error(error);
      }
    },
    async cancel(reason) {
      log("avatar audio stream canceled", reason);
      await finalize(true);
      await reader.cancel(reason);
    },
  });
}
