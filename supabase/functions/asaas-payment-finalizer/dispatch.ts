export interface FinalizationDispatchInput {
  paymentIntentId: string;
  idempotencyKey: string;
}

export interface FinalizationDispatcher {
  dispatch(input: FinalizationDispatchInput): Promise<void>;
}

export class FinalizationDispatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinalizationDispatchError";
  }
}

function requiredUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FinalizationDispatchError("finalizer URL is invalid");
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new FinalizationDispatchError("finalizer URL is invalid");
  }
  return url.toString();
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export function createFinalizationDispatcher(options: {
  url: string;
  internalToken: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  sleep?: (delayMs: number) => Promise<void>;
}): FinalizationDispatcher {
  const url = requiredUrl(options.url);
  if (!options.internalToken.trim()) throw new FinalizationDispatchError("finalizer token is missing");
  const timeoutMs = options.timeoutMs ?? 5_000;
  const maxAttempts = options.maxAttempts ?? 3;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw new FinalizationDispatchError("finalizer retry configuration is invalid");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));

  return {
    async dispatch(input): Promise<void> {
      let lastError: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchImpl(url, {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              "cache-control": "no-store",
              "x-gemn-internal-token": options.internalToken,
            },
            body: JSON.stringify({
              payment_intent_id: input.paymentIntentId,
              idempotency_key: input.idempotencyKey,
            }),
            signal: controller.signal,
          });
          if (response.ok) return;
          if (!isRetryable(response.status) || attempt === maxAttempts) {
            throw new FinalizationDispatchError("finalizer rejected dispatch");
          }
          lastError = new FinalizationDispatchError("finalizer temporarily unavailable");
        } catch (error) {
          lastError = error instanceof DOMException && error.name === "AbortError"
            ? new FinalizationDispatchError("finalizer dispatch timed out")
            : new FinalizationDispatchError("finalizer dispatch unavailable");
          if (error instanceof FinalizationDispatchError && error.message === "finalizer rejected dispatch") throw error;
          if (attempt === maxAttempts) break;
        } finally {
          clearTimeout(timeoutId);
        }
        await sleep(2 ** (attempt - 1) * 100);
      }
      throw lastError instanceof Error ? lastError : new FinalizationDispatchError("finalizer dispatch failed");
    },
  };
}
