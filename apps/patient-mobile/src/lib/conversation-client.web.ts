/**
 * Web build of the conversation client. react-native-audio-api registers a
 * TurboModule at import time, which crashes react-native-web at module load,
 * so the web bundle resolves this file instead (Metro platform extensions).
 * Voice sessions are politely unavailable; everything else in the app works.
 */
import type {
  ConversationClient,
  VoiceOutputOption,
  VoiceOutputRoute,
} from "./conversation-client";

export type {
  ConversationClient,
  ConversationEvent,
  ConversationSession,
  VoiceOutputOption,
  VoiceOutputRoute,
} from "./conversation-client";

const OUTPUT_OPTIONS: VoiceOutputOption[] = [
  {
    id: "speaker",
    label: "Speaker",
    description: "Play through this device",
    route: "speaker",
  },
];

export function listVoiceOutputOptions(): VoiceOutputOption[] {
  return OUTPUT_OPTIONS;
}

export function labelForOutputRoute(route: VoiceOutputRoute) {
  return OUTPUT_OPTIONS.find((option) => option.route === route)?.label ?? "Speaker";
}

export function applyVoiceOutputRoute(_route: VoiceOutputRoute) {
  // Browsers pick the output device themselves.
}

export function createConversationClient(): ConversationClient {
  return {
    async start() {
      throw new Error(
        "Voice check-ins aren't available in the web preview yet. Use a text check-in here, or open the HeyJule mobile app for voice.",
      );
    },
  };
}
