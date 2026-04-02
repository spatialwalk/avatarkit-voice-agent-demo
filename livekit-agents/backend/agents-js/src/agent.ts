import { cli, defineAgent, inference, type JobContext, voice, WorkerOptions } from "@livekit/agents";
import {
  SpatialRealAvatarSession,
  attachSpatialRealAvatar,
} from "./vendor/spatialreal-plugin/index.js";

import { AGENT_NAME, getAgentRuntimeConfig } from "./config.js";

class SpatialRealVoiceAssistant extends voice.Agent {
  constructor(instructions: string) {
    super({ instructions });
  }
}

const runtimeConfig = getAgentRuntimeConfig();

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();

    const avatar = new SpatialRealAvatarSession();
    const agent = attachSpatialRealAvatar(
      new SpatialRealVoiceAssistant(runtimeConfig.instructions),
      avatar,
    );

    const session = new voice.AgentSession({
      llm: new inference.LLM({ model: runtimeConfig.llmModel }),
      stt: new inference.STT({
        model: runtimeConfig.sttModel,
        language: runtimeConfig.sttLanguage,
      }),
      tts: new inference.TTS({
        model: runtimeConfig.ttsModel,
        voice: runtimeConfig.ttsVoice,
      }),
    });

    await session.start({
      agent,
      room: ctx.room,
    });

    await session.generateReply({
      instructions: runtimeConfig.initialGreeting,
    });
  },
});

if (process.argv[1]) {
  cli.runApp(
    new WorkerOptions({
      agent: import.meta.url,
      agentName: AGENT_NAME,
    }),
  );
}
