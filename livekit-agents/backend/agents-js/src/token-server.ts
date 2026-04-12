import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import {
  AccessToken,
  AgentDispatchClient,
  RoomServiceClient,
} from "livekit-server-sdk";

import {
  AGENT_NAME,
  DEFAULT_ROOM_NAME,
  getLiveKitCredentials,
  getTokenServerPort,
} from "./config.js";

type TokenRequestBody = {
  identity?: string;
  room?: string;
};

function normalizeIdentity(identity?: string): string {
  const normalized = identity?.trim();
  return normalized && normalized.length > 0
    ? normalized
    : `browser-${randomUUID().slice(0, 8)}`;
}

async function createParticipantToken(
  roomName: string,
  identity: string,
): Promise<string> {
  const credentials = getLiveKitCredentials();
  const token = new AccessToken(credentials.apiKey, credentials.apiSecret, {
    identity,
    name: identity,
    ttl: "1h",
  });

  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return token.toJwt();
}

async function ensureAgentDispatch(roomName: string): Promise<void> {
  const credentials = getLiveKitCredentials();
  const roomClient = new RoomServiceClient(
    credentials.serverUrl,
    credentials.apiKey,
    credentials.apiSecret,
  );
  const dispatchClient = new AgentDispatchClient(
    credentials.serverUrl,
    credentials.apiKey,
    credentials.apiSecret,
  );

  const existingRooms = await roomClient.listRooms([roomName]);
  if (existingRooms.length === 0) {
    await roomClient.createRoom({ name: roomName });
  }

  const existingDispatches = await dispatchClient.listDispatch(roomName);
  const hasMatchingDispatch = existingDispatches.some(
    (dispatch) => dispatch.agentName === AGENT_NAME,
  );

  if (!hasMatchingDispatch) {
    await dispatchClient.createDispatch(roomName, AGENT_NAME);
  }
}

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.post("/token", async (request, response) => {
    try {
      const body = (request.body ?? {}) as TokenRequestBody;
      const roomName = body.room?.trim() || DEFAULT_ROOM_NAME;
      const identity = normalizeIdentity(body.identity);
      const credentials = getLiveKitCredentials();

      const token = await createParticipantToken(roomName, identity);
      await ensureAgentDispatch(roomName);

      response.json({
        token,
        room: roomName,
        identity,
        url: credentials.rtcUrl,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create token";
      response.status(500).json({ error: message });
    }
  });

  return app;
}

if (process.argv[1]) {
  const port = getTokenServerPort();
  const app = createApp();

  app.listen(port, () => {
    console.log(`Token server running on http://localhost:${port}`);
  });
}
