export interface TranscriptMessage {
  id: string;
  text: string;
  participant: "user" | "agent";
  timestamp: Date;
  isFinal: boolean;
}

export function upsertTranscriptMessage(
  previous: TranscriptMessage[],
  incoming: TranscriptMessage,
): TranscriptMessage[] {
  const existingById = previous.findIndex((message) => message.id === incoming.id);
  if (existingById >= 0) {
    const updated = [...previous];
    updated[existingById] = incoming;
    return updated;
  }

  const activeIndex = [...previous]
    .reverse()
    .findIndex((message) => message.participant === incoming.participant && !message.isFinal);

  if (activeIndex >= 0) {
    const indexFromStart = previous.length - 1 - activeIndex;
    const updated = [...previous];
    updated[indexFromStart] = {
      ...updated[indexFromStart],
      text: incoming.text,
      timestamp: incoming.timestamp,
      isFinal: incoming.isFinal,
    };
    return updated;
  }

  return [...previous, incoming];
}
