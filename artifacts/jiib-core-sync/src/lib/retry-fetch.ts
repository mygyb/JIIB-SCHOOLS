// Reading data (GET/HEAD) is retried a couple of times when the network hiccups or the server is briefly unavailable
// (a cold start, a dropped mobile connection), so teachers don't see "Failed to fetch" for a one-second blip.
const RETRY_STATUS = new Set([502, 503, 504]);
const DELAYS = [500, 1500, 3000];

export async function retryFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET" && method !== "HEAD") return fetch(input, init);
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (!RETRY_STATUS.has(response.status) || attempt >= DELAYS.length) return response;
    } catch (error) {
      if (init.signal?.aborted || attempt >= DELAYS.length) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, DELAYS[attempt]));
  }
}
