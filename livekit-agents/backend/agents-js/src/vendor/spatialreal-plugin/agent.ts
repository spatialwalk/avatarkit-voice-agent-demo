import { voice } from "@livekit/agents";
import type { AudioFrame } from "@livekit/rtc-node";
import { ReadableStream } from "node:stream/web";

import type { SpatialRealAvatarStartOptions } from "./config.js";
import { SpatialRealAvatarSession } from "./avatar-session.js";

export interface AttachSpatialRealAvatarOptions extends SpatialRealAvatarStartOptions {
  autoClose?: boolean;
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
  options: SpatialRealAvatarStartOptions,
): ReadableStream<AudioFrame> {
  const reader = stream.getReader();
  let finalized = false;
  let sawFrame = false;

  const finalize = async (interrupted: boolean): Promise<void> => {
    if (finalized) {
      return;
    }

    finalized = true;

    if (interrupted) {
      await avatar.interrupt();
      return;
    }

    if (sawFrame) {
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
        await avatar.sendFrame(value, options);
        controller.enqueue(value);
      } catch (error) {
        await finalize(true);
        controller.error(error);
      }
    },
    async cancel(reason) {
      await finalize(true);
      await reader.cancel(reason);
    },
  });
}
