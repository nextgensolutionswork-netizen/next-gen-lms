/**
 * Next-Gen ERP LMS: Rate Limiting & CSRF Origin Protection Utility
 * Implements an in-memory sliding-window rate limiter per IP address
 * and strict CSRF origin validation for state-changing endpoints.
 */

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

// In-memory sliding-window bucket store keyed by IP or identifier
const ipBuckets = new Map<string, number[]>();

/**
 * Checks and updates rate limit for a given IP/key using a sliding-window algorithm.
 *
 * @param ip Client IP address or rate-limit key
 * @param limit Maximum allowed requests within the time window
 * @param windowSeconds Duration of the sliding window in seconds
 * @returns Object with allowed status, remaining requests count, and seconds until window resets
 */
export function checkRateLimit(
  ip: string,
  limit: number,
  windowSeconds: number
): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const cutoff = now - windowMs;

  const current = ipBuckets.get(ip) || [];
  // Evict timestamps that have fallen out of the active sliding window
  const active = current.filter((timestamp) => timestamp > cutoff);

  if (active.length >= limit) {
    const oldestInWindow = active[0] || now;
    const resetSeconds = Math.max(1, Math.ceil((oldestInWindow + windowMs - now) / 1000));
    ipBuckets.set(ip, active);

    return {
      allowed: false,
      remaining: 0,
      resetSeconds,
    };
  }

  // Record this request timestamp
  active.push(now);
  ipBuckets.set(ip, active);

  const oldestInWindow = active[0];
  const resetSeconds = Math.max(1, Math.ceil((oldestInWindow + windowMs - now) / 1000));

  return {
    allowed: true,
    remaining: Math.max(0, limit - active.length),
    resetSeconds,
  };
}

/**
 * Resets the in-memory rate limit store. Useful for unit testing isolation.
 */
export function resetRateLimitStore(): void {
  ipBuckets.clear();
}

/**
 * Validates request Origin / Referer against expected Host to prevent Cross-Site Request Forgery (CSRF).
 *
 * @param request Incoming HTTP Request
 * @returns boolean true if the request origin matches the host, false if cross-origin or forged
 */
export function validateCsrfOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // Extract host from Host header, X-Forwarded-Host, or request URL
  const rawHost =
    request.headers.get('host') ||
    request.headers.get('x-forwarded-host') ||
    (() => {
      try {
        return request.url ? new URL(request.url).host : null;
      } catch {
        return null;
      }
    })();

  if (!rawHost) {
    return !origin && !referer;
  }

  const expectedHost = rawHost.toLowerCase().trim();

  // 1. Strict Origin header validation (standard for CORS / form submissions)
  if (origin) {
    try {
      const originUrl = new URL(origin);
      return originUrl.host.toLowerCase() === expectedHost;
    } catch {
      return false;
    }
  }

  // 2. Strict Referer header fallback
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      return refererUrl.host.toLowerCase() === expectedHost;
    } catch {
      return false;
    }
  }

  // 3. Same-origin request where Origin/Referer are omitted (e.g. server-to-server or test clients)
  return true;
}

/**
 * Helper to extract client IP address from standard proxy and gateway headers.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return '127.0.0.1';
}
