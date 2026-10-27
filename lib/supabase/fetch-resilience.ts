/**
 * Resilient HTTP Transport Layer for Supabase & Network Operations (FIN-DB-001)
 *
 * Automatically recovers from:
 * - Undici socket termination ('TypeError: terminated')
 * - Connection reset by peer ('ECONNRESET')
 * - Keepalive race conditions and closed pool sockets ('UND_ERR_SOCKET_CLOSED')
 * - Gateway timeouts & transient 502/503/504 errors
 */

export function isTransientNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const code = ((err as any)?.code || '').toLowerCase();
  const causeMsg = ((err as any)?.cause?.message || String((err as any)?.cause || '')).toLowerCase();

  return (
    msg.includes('terminated') ||
    msg.includes('fetch failed') ||
    msg.includes('socket closed') ||
    msg.includes('connection reset') ||
    msg.includes('socket hang up') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('epipe') ||
    msg.includes('und_err') ||
    causeMsg.includes('terminated') ||
    causeMsg.includes('socket closed') ||
    causeMsg.includes('econnreset') ||
    code === 'econnreset' ||
    code === 'etimedout' ||
    code === 'und_err_socket_closed' ||
    code === 'und_err_destroyed'
  );
}

export function createResilientFetch(config: { maxRetries?: number; timeoutMs?: number } = {}) {
  const maxRetries = config.maxRetries ?? 3;
  const timeoutMs = config.timeoutMs ?? 15000;

  return async function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const headers = new Headers(init?.headers || {});
        // On retry, request a fresh socket to bypass dead keepalive sockets in the pool
        if (attempt > 1) {
          headers.set('Connection', 'close');
        }

        // Setup defensive timeout signal
        let signal = init?.signal;
        let timer: ReturnType<typeof setTimeout> | undefined;

        if (!signal && typeof AbortController !== 'undefined') {
          const controller = new AbortController();
          timer = setTimeout(() => controller.abort(new Error('Connection timed out')), timeoutMs);
          signal = controller.signal;
        }

        try {
          const response = await fetch(input, {
            ...init,
            headers,
            signal,
          });

          if (timer) clearTimeout(timer);

          // Retry on transient proxy/gateway errors
          if ([502, 503, 504, 520, 521, 522, 524].includes(response.status) && attempt < maxRetries) {
            const delay = 150 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 50);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }

          return response;
        } catch (fetchErr) {
          if (timer) clearTimeout(timer);
          throw fetchErr;
        }
      } catch (err) {
        lastError = err;
        if (isTransientNetworkError(err) && attempt < maxRetries) {
          const delay = 150 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 50);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }

    throw lastError;
  };
}
