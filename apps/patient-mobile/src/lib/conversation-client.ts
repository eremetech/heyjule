export type ConversationEvent =
  | { type: "agent_text"; text: string }
  | { type: "user_transcript"; text: string }
  | { type: "audio_level"; value: number }
  | { type: "ended" };

export type ConversationSession = {
  end: () => Promise<void>;
  sendText: (text: string) => Promise<void>;
};

export type ConversationClient = {
  start: (onEvent: (event: ConversationEvent) => void) => Promise<ConversationSession>;
};

/**
 * Integration boundary for ElevenLabs (or another conversational voice provider).
 * A production implementation should obtain a short-lived signed URL from the API;
 * provider secrets must never ship in the mobile bundle.
 */
export const conversationClient: ConversationClient | null = null;
