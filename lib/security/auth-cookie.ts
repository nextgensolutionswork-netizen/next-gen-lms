/* eslint-disable */
/**
 * Next-Gen ERP LMS: Cryptographic Authentication Cookie Signing & Verification
 * Uses HMAC-SHA256 to ensure session cookies cannot be forged or altered.
 */

export const AUTH_COOKIE_NAME = 'next_gen_auth_user';
export const AUTH_SIG_COOKIE_NAME = 'next_gen_auth_user_sig';
export const AUTH_COOKIE_SECRET =
  process.env.AUTH_COOKIE_SECRET || 'next-gen-lms-secure-auth-secret-2026';

/**
 * Computes an HMAC-SHA256 hex signature for an auth cookie value using Web Crypto / Node crypto.
 */
export async function generateAuthCookieSignature(
  cookieValue: string,
  secret: string = AUTH_COOKIE_SECRET
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
  secret: string = AUTH_COOKIE_SECRET
): string {
  const nodeCrypto = require('crypto');
  return nodeCrypto.createHmac('sha256', secret).update(cookieValue).digest('hex');
}

/**
 * Verifies an HMAC-SHA256 signature against a cookie value in constant time.
 */
export async function verifyAuthCookieSignature(
  cookieValue: string,
  signature: string,
  secret: string = AUTH_COOKIE_SECRET
): Promise<boolean> {
  if (!cookieValue || !signature) return false;
  try {
    const expected = await generateAuthCookieSignature(cookieValue, secret);
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
 */
export function verifyAuthCookieSignatureSync(
  cookieValue: string,
  signature: string,
  secret: string = AUTH_COOKIE_SECRET
): boolean {
  if (!cookieValue || !signature) return false;
  try {
    const nodeCrypto = require('crypto');
    const expected = nodeCrypto.createHmac('sha256', secret).update(cookieValue).digest('hex');
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    if (a.length !== b.length) return false;
    return nodeCrypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
