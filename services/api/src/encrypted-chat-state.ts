import type { Lock, QueueEntry, StateAdapter } from "chat";

import {
  decryptAtRest,
  encryptAtRest,
  type EncryptedAtRest,
} from "./at-rest-crypto.ts";

type SealedStateValue = {
  version: 1;
  payload: EncryptedAtRest;
};

function isSealedStateValue(value: unknown): value is SealedStateValue {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SealedStateValue>;
  return candidate.version === 1 && Boolean(candidate.payload);
}

function seal(value: unknown, key: Uint8Array, aad: string): SealedStateValue {
  return { version: 1, payload: encryptAtRest(value, key, aad) };
}

function open<T>(value: unknown, key: Uint8Array, aad: string): T {
  if (!isSealedStateValue(value)) throw new Error("invalid_encrypted_chat_state");
  return decryptAtRest<T>(value.payload, key, aad);
}

/**
 * Encrypts every state value that can contain a patient message before it is
 * handed to Redis. Subscription markers and lock tokens contain no health data
 * and stay delegated so the adapter can keep its atomic locking semantics.
 */
export class EncryptedChatStateAdapter implements StateAdapter {
  constructor(
    private readonly state: StateAdapter,
    private readonly key: Uint8Array,
  ) {}

  connect() {
    return this.state.connect();
  }

  disconnect() {
    return this.state.disconnect();
  }

  subscribe(threadId: string) {
    return this.state.subscribe(threadId);
  }

  unsubscribe(threadId: string) {
    return this.state.unsubscribe(threadId);
  }

  isSubscribed(threadId: string) {
    return this.state.isSubscribed(threadId);
  }

  acquireLock(threadId: string, ttlMs: number): Promise<Lock | null> {
    return this.state.acquireLock(threadId, ttlMs);
  }

  forceReleaseLock(threadId: string) {
    return this.state.forceReleaseLock(threadId);
  }

  releaseLock(lock: Lock) {
    return this.state.releaseLock(lock);
  }

  extendLock(lock: Lock, ttlMs: number) {
    return this.state.extendLock(lock, ttlMs);
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const value = await this.state.get(key);
    return value === null ? null : open<T>(value, this.key, `heyjule:chat:value:v1:${key}`);
  }

  set<T = unknown>(key: string, value: T, ttlMs?: number) {
    return this.state.set(
      key,
      seal(value, this.key, `heyjule:chat:value:v1:${key}`),
      ttlMs,
    );
  }

  setIfNotExists(key: string, value: unknown, ttlMs?: number) {
    return this.state.setIfNotExists(
      key,
      seal(value, this.key, `heyjule:chat:value:v1:${key}`),
      ttlMs,
    );
  }

  delete(key: string) {
    return this.state.delete(key);
  }

  appendToList(
    key: string,
    value: unknown,
    options?: { maxLength?: number; ttlMs?: number },
  ) {
    return this.state.appendToList(
      key,
      seal(value, this.key, `heyjule:chat:list:v1:${key}`),
      options,
    );
  }

  async getList<T = unknown>(key: string): Promise<T[]> {
    const values = await this.state.getList(key);
    return values.map((value) => open<T>(value, this.key, `heyjule:chat:list:v1:${key}`));
  }

  enqueue(threadId: string, entry: QueueEntry, maxSize: number) {
    const encryptedEntry: QueueEntry = {
      enqueuedAt: entry.enqueuedAt,
      expiresAt: entry.expiresAt,
      message: seal(
        entry.message,
        this.key,
        `heyjule:chat:queue:v1:${threadId}`,
      ) as unknown as QueueEntry["message"],
    };
    return this.state.enqueue(threadId, encryptedEntry, maxSize);
  }

  async dequeue(threadId: string): Promise<QueueEntry | null> {
    const entry = await this.state.dequeue(threadId);
    if (!entry) return null;
    return {
      enqueuedAt: entry.enqueuedAt,
      expiresAt: entry.expiresAt,
      message: open<QueueEntry["message"]>(
        entry.message,
        this.key,
        `heyjule:chat:queue:v1:${threadId}`,
      ),
    };
  }

  queueDepth(threadId: string) {
    return this.state.queueDepth(threadId);
  }
}

export function createEncryptedChatState(state: StateAdapter, key: Uint8Array) {
  return new EncryptedChatStateAdapter(state, key);
}
