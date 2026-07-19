const WINDOW_MS = 10 * 60 * 1_000;
const MAX_REQUESTS = 20;

type Bucket = { startedAt: number; count: number };

const globalForChatRateLimit = globalThis as unknown as {
  __heyjuleChatRateLimits?: Map<string, Bucket>;
};

const buckets =
  globalForChatRateLimit.__heyjuleChatRateLimits ?? new Map<string, Bucket>();
globalForChatRateLimit.__heyjuleChatRateLimits = buckets;

/* Best-effort process-local protection. Deployments with more than one app
 * instance should replace this with the same policy in a shared rate limiter. */
export function takeReportChatRequest(key: string, now = Date.now()) {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((WINDOW_MS - (now - bucket.startedAt)) / 1_000)
      ),
    };
  }

  bucket.count++;
  return { allowed: true, retryAfterSeconds: 0 };
}
