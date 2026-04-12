import {
  AutoSubscribe,
  cli,
  defineAgent,
  type JobContext,
  voice,
  WorkerOptions,
} from "@livekit/agents";
import { TTS as CartesiaTTS } from "@livekit/agents-plugin-cartesia";
import { STT as DeepgramSTT } from "@livekit/agents-plugin-deepgram";
import { LLM as OpenAILLM } from "@livekit/agents-plugin-openai";
import { VAD as SileroVAD } from "@livekit/agents-plugin-silero";
import type { AudioFrame, RemoteParticipant } from "@livekit/rtc-node";
import { RoomEvent, TrackSource } from "@livekit/rtc-node";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import {
  SpatialRealAvatarSession,
  attachSpatialRealAvatar,
} from "./vendor/spatialreal-plugin/index.js";
import { DEFAULT_AVATAR_PARTICIPANT_IDENTITY } from "./vendor/spatialreal-plugin/constants.js";
import { ATTRIBUTE_PUBLISH_ON_BEHALF } from "./vendor/spatialreal-plugin/constants.js";

import { AGENT_NAME, getAgentRuntimeConfig } from "./config.js";

class SpatialRealVoiceAssistant extends voice.Agent {
  constructor(instructions: string) {
    super({ instructions });
  }
}

const runtimeConfig = getAgentRuntimeConfig();
const currentFilePath = fileURLToPath(import.meta.url);

function formatConversationItem(item: unknown): string {
  const role = isRecord(item) && "role" in item ? String(item.role) : "unknown";
  const id = isRecord(item) && "id" in item && item.id ? String(item.id) : "unknown";
  const text =
    isRecord(item) && "text" in item && typeof item.text === "string"
      ? item.text
      : isRecord(item) && "content" in item && Array.isArray(item.content)
        ? item.content
            .map((part: unknown) =>
              typeof part === "string"
                ? part
                : part && typeof part === "object" && "text" in part
                  ? String(part.text)
                  : "",
            )
            .filter(Boolean)
            .join(" ")
        : "";
  const summary = text.length > 160 ? `${text.slice(0, 157)}...` : text;
  return `role=${role} id=${id} text=${JSON.stringify(summary)}`;
}

function log(prefix: string, message: string, details?: unknown): void {
  if (details === undefined) {
    console.log(`${prefix} ${message}`);
    return;
  }

  console.log(`${prefix} ${message}`, details);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function shouldUseAsUserParticipant(
  participant: RemoteParticipant,
  localParticipantIdentity: string | undefined,
): boolean {
  if (participant.identity === DEFAULT_AVATAR_PARTICIPANT_IDENTITY) {
    return false;
  }

  if (localParticipantIdentity && participant.identity === localParticipantIdentity) {
    return false;
  }

  const publishOnBehalf = participant.attributes?.[ATTRIBUTE_PUBLISH_ON_BEHALF];
  if (localParticipantIdentity && publishOnBehalf === localParticipantIdentity) {
    return false;
  }

  return true;
}

class NoPublishAudioSink extends EventEmitter {
  static readonly EVENT_PLAYBACK_STARTED = "playbackStarted";
  static readonly EVENT_PLAYBACK_FINISHED = "playbackFinished";

  private readonly prefix: string;
  private capturing = false;
  private segmentStartTime = 0;
  private lastPlaybackEvent = { playbackPosition: 0, interrupted: false };
  private waitForPlayoutPromise: Promise<typeof this.lastPlaybackEvent> =
    Promise.resolve(this.lastPlaybackEvent);
  private resolveWaitForPlayout:
    | ((value: typeof this.lastPlaybackEvent) => void)
    | null = null;

  constructor(prefix: string, _sampleRate: number) {
    super();
    this.prefix = prefix;
  }

  async captureFrame(frame: AudioFrame): Promise<void> {
    if (!this.capturing) {
      this.capturing = true;
      this.segmentStartTime = Date.now();
      this.waitForPlayoutPromise = new Promise((resolve) => {
        this.resolveWaitForPlayout = resolve;
      });
      this.emit(NoPublishAudioSink.EVENT_PLAYBACK_STARTED, {
        createdAt: this.segmentStartTime,
      });
      log(this.prefix, "dropping local LiveKit agent audio publish", {
        sampleRate: frame.sampleRate,
        channels: frame.channels,
      });
    }
  }

  flush(): void {
    if (!this.capturing) {
      return;
    }

    this.finish(false);
  }

  clearBuffer(): void {
    if (!this.capturing) {
      this.lastPlaybackEvent = {
        playbackPosition: 0,
        interrupted: true,
      };
      return;
    }

    this.finish(true);
  }

  async waitForPlayout(): Promise<typeof this.lastPlaybackEvent> {
    return this.waitForPlayoutPromise;
  }

  onAttached(): void {}

  onDetached(): void {}

  pause(): void {}

  resume(): void {}

  private finish(interrupted: boolean): void {
    const playbackPosition = Math.max(0, (Date.now() - this.segmentStartTime) / 1000);
    this.capturing = false;
    this.lastPlaybackEvent = {
      playbackPosition,
      interrupted,
    };
    this.emit(NoPublishAudioSink.EVENT_PLAYBACK_FINISHED, this.lastPlaybackEvent);
    this.resolveWaitForPlayout?.(this.lastPlaybackEvent);
    this.resolveWaitForPlayout = null;
  }
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    const prefix = `[agent:${ctx.room.name ?? "unknown-room"}]`;
    log(prefix, "starting entrypoint", {
      livekitUrl: runtimeConfig.rtcUrl,
      llmModel: runtimeConfig.llmModel,
      llmBaseUrl: runtimeConfig.llmBaseUrl ?? "default",
      sttModel: runtimeConfig.sttModel,
      sttLanguage: runtimeConfig.sttLanguage,
      ttsModel: runtimeConfig.ttsModel,
      ttsLanguage: runtimeConfig.ttsLanguage,
      ttsVoice: runtimeConfig.ttsVoice,
      hasLlmApiKey: Boolean(runtimeConfig.llmApiKey),
      hasSttApiKey: Boolean(runtimeConfig.sttApiKey),
      hasTtsApiKey: Boolean(runtimeConfig.ttsApiKey),
    });

    ctx.room.on(RoomEvent.ParticipantConnected, (participant) => {
      log(prefix, "participant connected", {
        identity: participant.identity,
        kind: participant.kind,
        attributes: participant.attributes,
      });
    });

    ctx.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      log(prefix, "participant disconnected", {
        identity: participant.identity,
      });
    });

    ctx.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      log(prefix, "track subscribed", {
        participant: participant.identity,
        trackSid: publication.sid,
        source: publication.source,
        kind: track.kind,
      });
    });

    ctx.room.on(RoomEvent.TrackPublished, (publication, participant) => {
      log(prefix, "track published", {
        participant: participant.identity,
        trackSid: publication.sid,
        source: publication.source,
        kind: publication.kind,
      });

      const localParticipantIdentity = ctx.room.localParticipant?.identity;
      if (
        shouldUseAsUserParticipant(participant, localParticipantIdentity) &&
        publication.source === TrackSource.SOURCE_MICROPHONE &&
        !publication.subscribed
      ) {
        log(prefix, "forcing subscription to user microphone publication", {
          participant: participant.identity,
          trackSid: publication.sid,
        });
        publication.setSubscribed(true);
      }
    });

    ctx.room.on(RoomEvent.TrackSubscriptionFailed, (trackSid, participant, reason) => {
      log(prefix, "track subscription failed", {
        participant: participant.identity,
        trackSid,
        reason: reason ?? "unknown",
      });
    });

    ctx.room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      log(
        prefix,
        "active speakers changed",
        speakers.map((speaker) => speaker.identity),
      );
    });

    ctx.room.on(RoomEvent.Disconnected, (reason) => {
      log(prefix, "room disconnected", { reason });
    });

    ctx.room.on(RoomEvent.ConnectionStateChanged, (state) => {
      log(prefix, "room connection state changed", { state });
    });

    ctx.room.on(RoomEvent.Connected, () => {
      log(prefix, "room connected event received", {
        roomName: ctx.room.name,
        localParticipant: ctx.room.localParticipant?.identity,
      });
    });

    ctx.room.on(RoomEvent.Reconnecting, () => {
      log(prefix, "room reconnecting");
    });

    ctx.room.on(RoomEvent.Reconnected, () => {
      log(prefix, "room reconnected");
    });

    ctx.room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      log(prefix, "connection quality changed", {
        participant: participant.identity,
        quality,
      });
    });

    log(prefix, "calling ctx.connect", {
      autoSubscribe: "AUDIO_ONLY",
      roomName: ctx.room.name,
    });

    try {
      await ctx.connect(undefined, AutoSubscribe.AUDIO_ONLY);
    } catch (error) {
      log(prefix, "ctx.connect failed", error);
      throw error;
    }

    log(prefix, "connected to room", {
      roomName: ctx.room.name,
      localParticipant: ctx.room.localParticipant?.identity,
      remoteParticipantCount: ctx.room.remoteParticipants.size,
    });

    const avatar = new SpatialRealAvatarSession();
    log(prefix, "spatialreal config", {
      avatarId: avatar.resolvedConfig.avatarId,
      ingressEndpointUrl: avatar.resolvedConfig.ingressEndpointUrl,
      useQueryAuth: avatar.resolvedConfig.useQueryAuth,
    });
    const agent = attachSpatialRealAvatar(
      new SpatialRealVoiceAssistant(runtimeConfig.instructions),
      avatar,
      { debugLogPrefix: prefix },
    );
    const vad = await SileroVAD.load({ activationThreshold: 0.8 });
    log(prefix, "silero VAD loaded", { activationThreshold: 0.8 });

    const session = new voice.AgentSession({
      vad,
      llm: new OpenAILLM({
        model: runtimeConfig.llmModel,
        apiKey: runtimeConfig.llmApiKey,
        baseURL: runtimeConfig.llmBaseUrl,
      }),
      stt: new DeepgramSTT({
        model: runtimeConfig.sttModel as never,
        language: runtimeConfig.sttLanguage,
        apiKey: runtimeConfig.sttApiKey,
      }),
      tts: new CartesiaTTS({
        model: runtimeConfig.ttsModel,
        language: runtimeConfig.ttsLanguage,
        voice: runtimeConfig.ttsVoice,
        apiKey: runtimeConfig.ttsApiKey,
      }),
    });
    session.output.audio = new NoPublishAudioSink(prefix, 24_000) as never;
    log(prefix, "agent session created");

    session.on(voice.AgentSessionEventTypes.AgentStateChanged, (ev) => {
      log(prefix, "agent state changed", {
        oldState: ev.oldState,
        newState: ev.newState,
      });
    });

    session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
      log(prefix, "user state changed", {
        oldState: ev.oldState,
        newState: ev.newState,
      });
    });

    session.on(voice.AgentSessionEventTypes.UserInputTranscribed, (ev) => {
      log(prefix, "user input transcribed", {
        isFinal: ev.isFinal,
        language: ev.language,
        transcript: ev.transcript,
      });
    });

    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
      log(prefix, "conversation item added", formatConversationItem(ev.item));
    });

    session.on(voice.AgentSessionEventTypes.SpeechCreated, (ev) => {
      log(prefix, "speech created", {
        source: ev.source,
        userInitiated: ev.userInitiated,
      });
    });

    session.on(voice.AgentSessionEventTypes.MetricsCollected, (ev) => {
      log(prefix, "metrics collected", ev.metrics);
    });

    session.on(voice.AgentSessionEventTypes.SessionUsageUpdated, (ev) => {
      log(prefix, "session usage updated", ev.usage);
    });

    session.on(voice.AgentSessionEventTypes.Error, (ev) => {
      log(prefix, "session error", {
        source:
          isRecord(ev.source) && "label" in ev.source
            ? String(ev.source.label)
            : "unknown",
        error: ev.error,
      });
    });

    session.on(voice.AgentSessionEventTypes.Close, (ev) => {
      log(prefix, "session closed", {
        reason: ev.reason,
        error: ev.error,
      });
    });

    await session.start({
      agent,
      room: ctx.room,
      outputOptions: {
        audioEnabled: false,
      },
    });
    log(prefix, "session started");

    const maybeLinkUserParticipant = (participant: RemoteParticipant): void => {
      const localParticipantIdentity = ctx.room.localParticipant?.identity;
      const shouldUse = shouldUseAsUserParticipant(participant, localParticipantIdentity);
      log(prefix, "evaluating remote participant for user input", {
        participant: participant.identity,
        kind: participant.kind,
        attributes: participant.attributes,
        localParticipantIdentity,
        shouldUse,
      });

      if (!shouldUse) {
        return;
      }

      const roomIO = (session as { _roomIO?: { setParticipant: (identity: string | null) => void } })
        ._roomIO;
      if (!roomIO) {
        log(prefix, "room IO not ready while selecting participant");
        return;
      }

      roomIO.setParticipant(participant.identity);
      log(prefix, "linked session input participant", {
        participant: participant.identity,
      });

      for (const publication of participant.trackPublications.values()) {
        if (
          publication.source === TrackSource.SOURCE_MICROPHONE &&
          !publication.subscribed
        ) {
          log(prefix, "forcing subscription to existing user microphone publication", {
            participant: participant.identity,
            trackSid: publication.sid,
          });
          publication.setSubscribed(true);
        }
      }
    };

    for (const participant of ctx.room.remoteParticipants.values()) {
      maybeLinkUserParticipant(participant);
    }

    ctx.room.on(RoomEvent.ParticipantConnected, (participant) => {
      maybeLinkUserParticipant(participant);
    });

    log(prefix, "sending initial greeting", {
      greeting: runtimeConfig.initialGreeting,
    });
    await session.say(runtimeConfig.initialGreeting);
    log(prefix, "initial greeting finished");
  },
});

if (process.argv[1] === currentFilePath) {
  cli.runApp(
    new WorkerOptions({
      agent: currentFilePath,
      agentName: AGENT_NAME,
    }),
  );
}
