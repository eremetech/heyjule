import {
  AudioContext,
  AudioManager,
  AudioRecorder,
} from "react-native-audio-api";

const SAMPLE_RATE = 24_000;
const BUFFER_LENGTH = 2_400;
const MODEL = "grok-voice-latest";
const VOICE = "carina";
const CONNECT_TIMEOUT_MS = 12_000;

const AGENT_INSTRUCTIONS = [
  "You are Jule, a warm, concise health check-in companion.",
  "Help the patient describe what feels different, when it began, how strong it is from 1 to 5, and what made it better or worse.",
  "Ask one short question at a time. Do not diagnose, prescribe, or claim to replace a clinician.",
  "If the patient describes a possible emergency or immediate danger, tell them to contact local emergency services now.",
  "Use plain, compassionate language. Keep each spoken response to at most two short sentences.",
].join(" ");

export type ConversationEvent =
  | { type: "agent_text"; text: string }
  | { type: "user_transcript"; text: string }
  | { type: "audio_level"; value: number }
  | { type: "status"; value: "listening" | "speaking" }
  | { type: "error"; message: string }
  | { type: "ended" };

export type ConversationSession = {
  end: () => Promise<void>;
  sendText: (text: string) => Promise<void>;
};

export type ConversationClient = {
  start: (
    onEvent: (event: ConversationEvent) => void,
    signal?: AbortSignal,
  ) => Promise<ConversationSession>;
};

type TokenProvider = () => Promise<{ token: string }>;

type RealtimeEvent = {
  type?: string;
  delta?: string;
  transcript?: string;
  message?: string;
  ping_timestamp?: number;
};

function floatPcmToBase64(samples: Float32Array) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index++) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return globalThis.btoa(binary);
}

function rmsLevel(samples: Float32Array) {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

function parseEvent(data: unknown): RealtimeEvent | null {
  if (typeof data !== "string") return null;
  try {
    return JSON.parse(data) as RealtimeEvent;
  } catch {
    return null;
  }
}

export function createConversationClient(getToken: TokenProvider): ConversationClient {
  return {
    async start(onEvent, signal) {
      const permission = await AudioManager.requestRecordingPermissions();
      if (permission !== "Granted") throw new Error("Microphone permission was not granted");
      const { token } = await getToken();
      if (signal?.aborted) throw new Error("Voice session cancelled");
      AudioManager.setAudioSessionOptions({
        iosCategory: "playAndRecord",
        iosMode: "voiceChat",
        iosOptions: ["allowBluetooth", "defaultToSpeaker"],
      });
      const socket = new WebSocket(
        `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(MODEL)}`,
        [`xai-client-secret.${token}`],
      );
      const recorder = new AudioRecorder({
        sampleRate: SAMPLE_RATE,
        bufferLengthInSamples: BUFFER_LENGTH,
      });
      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      const output = audioContext.createBufferQueueSource();
      output.connect(audioContext.destination);
      output.start();

      let ended = false;
      let assistantTranscript = "";
      let playbackChain = Promise.resolve();
      let playbackGeneration = 0;

      const send = (value: unknown) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
      };

      const end = async () => {
        if (ended) return;
        ended = true;
        try {
          recorder.stop();
        } catch {
          // The recorder may not have started if setup failed.
        }
        output.clearBuffers();
        playbackGeneration++;
        socket.close(1000, "session ended");
        await audioContext.close().catch(() => undefined);
        await AudioManager.setAudioSessionActivity(false).catch(() => false);
        onEvent({ type: "ended" });
      };

      signal?.addEventListener("abort", () => void end(), { once: true });

      const connected = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Voice connection timed out"));
        }, CONNECT_TIMEOUT_MS);

        socket.addEventListener("open", () => {
          clearTimeout(timeout);
          resolve();
        });
        socket.addEventListener("error", () => {
          clearTimeout(timeout);
          reject(new Error("Voice connection could not be opened"));
        });
        socket.addEventListener("close", () => {
          clearTimeout(timeout);
          reject(new Error("Voice connection closed during setup"));
        });
      });

      socket.addEventListener("message", (message) => {
        const event = parseEvent(message.data);
        if (!event?.type || ended) return;
        switch (event.type) {
          case "input_audio_buffer.speech_started":
            output.clearBuffers();
            playbackGeneration++;
            onEvent({ type: "status", value: "listening" });
            break;
          case "conversation.item.input_audio_transcription.completed":
            if (event.transcript?.trim()) {
              onEvent({ type: "user_transcript", text: event.transcript.trim() });
            }
            break;
          case "response.created":
            assistantTranscript = "";
            onEvent({ type: "status", value: "speaking" });
            break;
          case "response.output_audio_transcript.delta":
          case "response.audio_transcript.delta":
            assistantTranscript += event.delta ?? "";
            break;
          case "response.output_audio_transcript.done":
          case "response.audio_transcript.done": {
            const text = (event.transcript ?? assistantTranscript).trim();
            if (text) onEvent({ type: "agent_text", text });
            assistantTranscript = "";
            break;
          }
          case "response.output_audio.delta":
          case "response.audio.delta":
            if (event.delta) {
              const delta = event.delta;
              const generation = playbackGeneration;
              playbackChain = playbackChain
                .then(async () => {
                  if (ended) return;
                  const buffer = await audioContext.decodePCMInBase64(delta, SAMPLE_RATE, 1, true);
                  if (!ended && generation === playbackGeneration) output.enqueueBuffer(buffer);
                })
                .catch(() => undefined);
            }
            break;
          case "response.done":
            onEvent({ type: "status", value: "listening" });
            break;
          case "ping":
            if (event.ping_timestamp !== undefined) {
              send({ type: "pong", ping_timestamp: event.ping_timestamp });
            }
            break;
          case "error":
            onEvent({ type: "error", message: event.message || "The voice service reported an error." });
            void end();
            break;
        }
      });

      socket.addEventListener("close", () => {
        if (!ended) void end();
      });

      try {
        await connected;
        if (signal?.aborted) throw new Error("Voice session cancelled");
        await AudioManager.setAudioSessionActivity(true);
        await audioContext.resume();
        send({
          type: "session.update",
          session: {
            voice: VOICE,
            instructions: AGENT_INSTRUCTIONS,
            reasoning: { effort: "high" },
            turn_detection: {
              type: "server_vad",
              threshold: 0.72,
              silence_duration_ms: 700,
              prefix_padding_ms: 350,
            },
            audio: {
              input: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
              output: { format: { type: "audio/pcm", rate: SAMPLE_RATE } },
            },
          },
        });
        recorder.onAudioReady(({ buffer }) => {
          if (ended || socket.readyState !== WebSocket.OPEN) return;
          const samples = buffer.getChannelData(0);
          onEvent({ type: "audio_level", value: rmsLevel(samples) });
          send({ type: "input_audio_buffer.append", audio: floatPcmToBase64(samples) });
        });
        recorder.start();
        onEvent({ type: "status", value: "listening" });
      } catch (error) {
        await end();
        throw error;
      }

      return {
        end,
        async sendText(text) {
          const value = text.trim();
          if (!value || ended) return;
          output.clearBuffers();
          send({
            type: "conversation.item.create",
            item: {
              type: "message",
              role: "user",
              content: [{ type: "input_text", text: value }],
            },
          });
          send({ type: "response.create" });
        },
      };
    },
  };
}
