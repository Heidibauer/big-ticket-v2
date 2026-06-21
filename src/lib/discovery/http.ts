// fetch with a hard timeout. Every external call goes through this so a slow or
// hung upstream (Serper/Tavily) can never stall the whole pipeline.

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 12000
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    // Aborted or network error: treat as "no result" rather than throwing, so
    // discovery degrades gracefully instead of failing the run.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
