/**
 * Central Institute Branding & Receipt Terms Constants
 * BUG-18: Official Fee Receipt & Invoice Branding Update
 */

export const OFFICIAL_INSTITUTE_NAME = 'Next-Gen ERP Solutions';

export const OFFICIAL_INSTITUTE_ADDRESS =
  'Pillar No 707, Flat No. 502, 5th Floor, Plot No 129, PJR ARCADE Sri Sai Nagar Colony, near JNTU, opp. Sri Chaitanya Junior Kalasala, Jawaharlal Nehru Technological University, Hyderabad, Telangana 500085';

export const OFFICIAL_INSTITUTE_PHONE = '+91 98765 43210';
export const OFFICIAL_INSTITUTE_EMAIL = 'admissions@next-generpsolutions.com';

// Local branding assets (PNG for PDFKit & print; WebP for modern browsers)
export const OFFICIAL_LOGO_PATH = '/branding/nextgen-logo.png';
export const OFFICIAL_LOGO_WEBP = '/branding/nextgen-logo.webp';
export const OFFICIAL_LOGO_REMOTE_URL =
  'https://www.next-generpsolutions.com/assets/nextgen-logo-480-BcNs6YNk.webp';

// Original Logo Dimensions & Aspect Ratio: 480 x 182 (~2.637)
export const LOGO_ORIGINAL_WIDTH = 480;
export const LOGO_ORIGINAL_HEIGHT = 182;
export const LOGO_ASPECT_RATIO = LOGO_ORIGINAL_WIDTH / LOGO_ORIGINAL_HEIGHT;

/**
 * Exactly three official terms and conditions for receipts and invoices.
 * Completely removes deprecated late fee installment condition.
 */
export const OFFICIAL_RECEIPT_TERMS: readonly string[] = [
  '1. All fee payments are non-refundable and non-transferable unless specified in writing by institute management.',
  '2. Receipts are issued subject to bank realization of cheques, UPI, and online transfers.',
  '3. Jurisdiction: Any disputes arising hereunder shall be subject to the exclusive jurisdiction of the institute\'s principal city.',
] as const;

export const OFFICIAL_RECEIPT_TERMS_TEXT = OFFICIAL_RECEIPT_TERMS.join('\n');

/**
 * Resolves receipt terms, sanitizing any legacy references to automated late fees.
 */
export function resolveReceiptTerms(customTerms?: string | null): string {
  if (!customTerms || !customTerms.trim()) {
    return OFFICIAL_RECEIPT_TERMS_TEXT;
  }
  if (
    customTerms.includes('Installment payments must be cleared on or before the due date to avoid automated late fees') ||
    customTerms.includes('Fees once paid are non-refundable and subject to institutional policies')
  ) {
    return OFFICIAL_RECEIPT_TERMS_TEXT;
  }
  return customTerms;
}

/**
 * Resolves institute address, upgrading legacy placeholder address.
 */
export function resolveInstituteAddress(customAddress?: string | null): string {
  if (!customAddress || !customAddress.trim() || customAddress.includes('Silicon Valley Towers')) {
    return OFFICIAL_INSTITUTE_ADDRESS;
  }
  return customAddress;
}
