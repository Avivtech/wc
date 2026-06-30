export const FETCH_TIMEOUT_MS = 10_000;
export const FIFA_FETCH_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
}

export async function withRetry(fn, { maxAttempts = 3, baseDelayMs = 1000 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError";
      const is4xx = /\b4\d\d\b/.test(error?.message ?? "");
      if (attempt === maxAttempts || isTimeout || is4xx) break;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (2 ** (attempt - 1))));
    }
  }

  throw lastError;
}

export async function mapWithConcurrency(items, limit, mapper) {
  if (!items.length) {
    return [];
  }

  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
