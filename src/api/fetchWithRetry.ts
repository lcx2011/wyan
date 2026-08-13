export interface FetchRetryOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: readonly number[];
  shouldRetryResponse?: (response: Response) => boolean;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAYS_MS = [300, 900];

function retryableResponse(response: Response): boolean {
  return response.status === 408
    || response.status === 425
    || response.status === 429
    || response.status >= 500;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

/**
 * Fetch with a per-attempt timeout and bounded retry for transient network/server failures.
 * The request body used by this app is JSON text, so it is safe to reuse between attempts.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchRetryOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const delays = options.retryDelayMs ?? DEFAULT_RETRY_DELAYS_MS;
  const shouldRetryResponse = options.shouldRetryResponse ?? retryableResponse;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const externalSignal = init.signal;
    const abortFromCaller = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) abortFromCaller();
    else externalSignal?.addEventListener('abort', abortFromCaller, { once: true });

    const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (attempt < retries && shouldRetryResponse(response)) {
        try {
          await response.body?.cancel();
        } catch {
          // Ignore a response-body cleanup failure and continue the bounded retry.
        }
        await wait(delays[attempt] ?? delays[delays.length - 1] ?? 0);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= retries || externalSignal?.aborted) throw error;
      await wait(delays[attempt] ?? delays[delays.length - 1] ?? 0);
    } finally {
      globalThis.clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abortFromCaller);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('request failed');
}
