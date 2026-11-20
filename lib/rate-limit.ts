interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const windowStart = now - windowMs;
  const existing = buckets.get(key) ?? { timestamps: [] };
  existing.timestamps = existing.timestamps.filter((t) => t > windowStart);

  if (existing.timestamps.length >= limit) {
    const oldest = existing.timestamps[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    buckets.set(key, existing);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  existing.timestamps.push(now);
  buckets.set(key, existing);
  return {
    allowed: true,
    remaining: Math.max(0, limit - existing.timestamps.length),
    retryAfterSeconds: 0,
  };
}
