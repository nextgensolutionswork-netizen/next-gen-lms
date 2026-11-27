/**
 * Next-Gen ERP LMS: Cryptographic Authentication Cookie Signing & Verification
 * Uses HMAC-SHA256 to ensure session cookies cannot be forged or altered.
 */

export const AUTH_COOKIE_NAME = 'next_gen_auth_user';
export const AUTH_SIG_COOKIE_NAME = 'next_gen_auth_user_sig';
export function getAuthCookieSecret(): string {
  const secret = process.env.AUTH_COOKIE_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'test') {
      // Provide a deterministic secret for test environments only.
      return 'test-secret-123';
    }
    throw new Error('AUTH_COOKIE_SECRET environment variable is required for authentication security.');
  }
  return secret;
}

/**
 * Computes an HMAC-SHA256 hex signature for an auth cookie value using Web Crypto / Node crypto.
 */
export async function generateAuthCookieSignature(
  cookieValue: string,
  secret: string = getAuthCookieSecret()
): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const enc = new TextEncoder();
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(cookieValue));
    return Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Node.js fallback
  const nodeCrypto = require('crypto');
  return nodeCrypto.createHmac('sha256', secret).update(cookieValue).digest('hex');
}

/**
 * Synchronous variant for Node/testing environments.
 */
export function generateAuthCookieSignatureSync(
  cookieValue: string,
  secret: string = getAuthCookieSecret()
): string {
  const nodeCrypto = require('crypto');
  return nodeCrypto.createHmac('sha256', secret).update(cookieValue).digest('hex');
}

/**
 * Verifies an HMAC-SHA256 signature against a cookie value in constant time.
 * Returns false if verification fails or if secret is missing/unavailable.
 */
export async function verifyAuthCookieSignature(
  cookieValue: string,
  signature: string,
  secret?: string
): Promise<boolean> {
  if (!cookieValue || !signature) return false;
  try {
    let activeSecret = secret;
    if (!activeSecret) {
      try {
        activeSecret = getAuthCookieSecret();
      } catch {
        return false;
      }
    }
    const expected = await generateAuthCookieSignature(cookieValue, activeSecret);
    if (expected.length !== signature.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
      mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return mismatch === 0;
  } catch {
    return false;
  }
}

/**
 * Synchronous verification variant.
 * Returns false if verification fails or if secret is missing/unavailable.
 */
export function verifyAuthCookieSignatureSync(
  cookieValue: string,
  signature: string,
  secret?: string
): boolean {
  if (!cookieValue || !signature) return false;
  try {
    let activeSecret = secret;
    if (!activeSecret) {
      try {
        activeSecret = getAuthCookieSecret();
      } catch {
        return false;
      }
    }
    const nodeCrypto = require('crypto');
    const expected = nodeCrypto.createHmac('sha256', activeSecret).update(cookieValue).digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    if (a.length !== b.length) return false;
    return nodeCrypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
