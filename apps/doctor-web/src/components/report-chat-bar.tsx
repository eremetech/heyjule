"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MessageResponse } from "@/components/ai-elements/message";

export type ReportChatSuggestion = string;

const removeMarkdownUrl = () => null;

function PlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m12 2 1.35 5.1L18 9l-4.65 1.9L12 16l-1.35-5.1L6 9l4.65-1.9L12 2Z" />
      <path d="m18.5 15 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
    </svg>
  );
}

function VoiceIcon({ active }: { active: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={active ? "is-active" : undefined}>
      <path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m6 12 6-6 6 6M12 6v12" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  );
}

function CollapseIcon({ expanded = true }: { expanded?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d={expanded ? "m7 10 5 5 5-5" : "m7 14 5-5 5 5"} />
    </svg>
  );
}

export function ReportChatBar({
  patientName,
  reportToken,
  suggestions,
}: {
  patientName: string;
  reportToken: string;
  suggestions: ReportChatSuggestion[];
}) {
  const [prompt, setPrompt] = useState("");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/report-chat",
        body: { reportToken },
      }),
    [reportToken]
  );
  const {
    messages,
    sendMessage,
    status,
    error,
    stop,
    regenerate,
    clearError,
    setMessages,
  } = useChat({ transport });

  const isBusy = status === "submitted" || status === "streaming";
  const userMessageCount = messages.filter((message) => message.role === "user").length;
  const lastMessage = messages.at(-1);
  const isWaitingForText =
    isBusy &&
    (lastMessage?.role !== "assistant" ||
      !lastMessage.parts.some(
        (part) => part.type === "text" && part.text.trim().length > 0
      ));

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messages, status]);

  function ask(question: string) {
    const cleanQuestion = question.trim();
    if (!cleanQuestion || isBusy) return;
    clearError();
    setPrompt("");
    setListening(false);
    setCollapsed(false);
    void sendMessage({ text: cleanQuestion });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(prompt);
  }

  function retry() {
    clearError();
    void regenerate();
  }

  const hasThread = messages.length > 0 || isBusy || error != null;
  const chatActive = !collapsed && hasThread;

  return (
    <>
      {chatActive && (
        <button
          type="button"
          className="report-chat-backdrop"
          onClick={() => setCollapsed(true)}
          aria-label="Minimize report chat"
        />
      )}
      <aside
        className={`report-chat-dock ${collapsed ? "collapsed" : ""}`}
        aria-label={`Ask about ${patientName}'s report`}
      >
        {collapsed ? (
          <button
            type="button"
            className="report-chat-launch"
            onClick={() => setCollapsed(false)}
            aria-expanded="false"
          >
            <span className="report-chat-launch-icon"><SparkIcon /></span>
            <span>{userMessageCount ? "Continue report chat" : "Ask HeyJule"}</span>
            {userMessageCount > 0 && <i>{userMessageCount}</i>}
            <CollapseIcon expanded={false} />
          </button>
        ) : (
          <div className="report-chat-shell">
            {hasThread && (
              <div className="report-chat-thread" ref={threadRef} aria-live="polite">
                <div className="report-chat-thread-head">
                  <span>Report chat</span>
                  <span className="report-chat-thread-actions">
                    {messages.length > 0 && !isBusy && (
                      <button
                        type="button"
                        className="report-chat-close"
                        onClick={() => {
                          setMessages([]);
                          clearError();
                        }}
                      >
                        Clear
                      </button>
                    )}
                    <button
                      type="button"
                      className="report-chat-close"
                      onClick={() => setCollapsed(true)}
                      aria-label="Minimize report chat"
                    >
                      Minimize
                    </button>
                  </span>
                </div>

                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`report-chat-message ${
                      message.role === "user" ? "doctor" : "assistant"
                    }`}
                  >
                    {message.role === "assistant" && (
                      <span className="report-chat-avatar" aria-hidden="true">
                        <SparkIcon />
                      </span>
                    )}
                    <div className="report-chat-message-content">
                      {message.parts.map((part, index) =>
                        part.type === "text" ? (
                          message.role === "assistant" ? (
                            <MessageResponse
                              key={`${message.id}-${index}`}
                              className="report-chat-response"
                              urlTransform={removeMarkdownUrl}
                            >
                              {part.text}
                            </MessageResponse>
                          ) : (
                            <p key={`${message.id}-${index}`}>{part.text}</p>
                          )
                        ) : null
                      )}
                    </div>
                  </div>
                ))}

                {isWaitingForText && (
                  <div className="report-chat-message assistant report-chat-thinking">
                    <span className="report-chat-avatar" aria-hidden="true">
                      <SparkIcon />
                    </span>
                    <p><i aria-hidden="true" /> Reading the report…</p>
                  </div>
                )}

                {error && (
                  <div className="report-chat-error" role="alert">
                    <p>{error.message || "The report assistant is unavailable."}</p>
                    <button type="button" onClick={retry}>Try again</button>
                  </div>
                )}

                <p className="report-chat-disclaimer">
                  AI can make mistakes · verify findings before clinical use
                </p>
              </div>
            )}

            <div className="report-chat-meta">
              <span className="report-chat-title">
                <SparkIcon /> Ask HeyJule about this report
              </span>
              <span className="report-chat-meta-actions">
                <span className="report-chat-scope">
                  <i aria-hidden="true" /> Patient data only
                </span>
                <button
                  type="button"
                  className="report-chat-collapse"
                  onClick={() => setCollapsed(true)}
                  aria-label="Minimize report chat"
                  aria-expanded="true"
                >
                  <CollapseIcon />
                </button>
              </span>
            </div>

            {sourcesOpen && (
              <div className="report-chat-sources" aria-label="Included report sources">
                <span>Using</span>
                <button type="button">PROMs</button>
                <button type="button">Symptoms</button>
                <button type="button">Wearables</button>
                <button type="button">Treatments</button>
              </div>
            )}

            <form className="report-chat-composer" onSubmit={submit}>
              <button
                type="button"
                className="report-chat-icon-button"
                onClick={() => setSourcesOpen((open) => !open)}
                aria-label={sourcesOpen ? "Hide report sources" : "Show report sources"}
                aria-expanded={sourcesOpen}
              >
                <PlusIcon />
              </button>
              <span className="report-chat-divider" aria-hidden="true" />
              <textarea
                ref={inputRef}
                rows={1}
                maxLength={1_500}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    ask(prompt);
                  }
                }}
                placeholder={`Ask about ${patientName.split(" ")[0]}'s data…`}
                aria-label={`Ask a question about ${patientName}'s data`}
              />
              {isBusy ? (
                <button
                  type="button"
                  className="report-chat-send"
                  onClick={stop}
                  aria-label="Stop response"
                >
                  <StopIcon />
                </button>
              ) : prompt.trim() ? (
                <button type="submit" className="report-chat-send" aria-label="Send question">
                  <ArrowIcon />
                </button>
              ) : (
                <button
                  type="button"
                  className={`report-chat-icon-button voice ${listening ? "active" : ""}`}
                  onClick={() => {
                    setListening((active) => !active);
                    inputRef.current?.focus();
                  }}
                  aria-label={listening ? "Stop voice input preview" : "Start voice input preview"}
                  aria-pressed={listening}
                >
                  <VoiceIcon active={listening} />
                </button>
              )}
            </form>

            <div className="report-chat-suggestions" aria-label="Suggested questions">
              {suggestions.slice(0, 4).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={isBusy}
                  onClick={() => ask(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
