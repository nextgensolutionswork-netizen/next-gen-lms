/**
 * Phone Number & International Country Code Validation Utility
 * Next-Gen ERP LMS - Global Standards & Multi-Country Support
 * Backed by libphonenumber-js for strict international numbering plans
 */

import type { CountryCode } from 'libphonenumber-js';
import {
  getCountries,
  getCountryCallingCode,
  getExampleNumber,
  parsePhoneNumberFromString,
  isPossiblePhoneNumber,
} from 'libphonenumber-js';
import examples from 'libphonenumber-js/mobile/examples';

export interface CountryCodeItem {
  code: string; // ISO 3166-1 alpha-2, e.g. 'IN', 'US'
  name: string; // Country name, e.g. 'India', 'United States'
  dialCode: string; // Dialing code with plus, e.g. '+91', '+1'
  flag: string; // Flag emoji, e.g. '🇮🇳'
  example: string; // Formatting example, e.g. '98765 43210'
  exactLength?: number; // Exact national number length if strict
}

export interface PhoneValidationResult {
  isValid: boolean;
  error?: string;
  normalized?: string; // Formatted international display: '+91 98765 43210'
  e164?: string; // Standard E.164 format: '+919876543210'
  canonicalDigits?: string; // Pure digits with country code: '919876543210'
  formattedNational?: string; // National format: '98765 43210'
  formattedInternational?: string; // International format: '+91 98765 43210'
  countryCode?: string; // ISO 2-letter country code: 'IN'
  dialCode?: string; // Country dialing code: '+91'
}

// Generate country flag emoji from 2-letter ISO code
function getFlagEmoji(countryCode: string): string {
  try {
    return countryCode
      .toUpperCase()
      .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
  } catch {
    return '🌐';
  }
}

// Region names display formatter
let regionNames: Intl.DisplayNames | null = null;
try {
  if (typeof Intl !== 'undefined' && Intl.DisplayNames) {
    regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
  }
} catch {
  regionNames = null;
}

function getCountryName(code: string): string {
  try {
    return regionNames?.of(code) || code;
  } catch {
    return code;
  }
}

// Primary / Frequently used countries prioritized at top of list
const POPULAR_COUNTRY_CODES: CountryCode[] = [
  'IN', // India (Default)
  'US', // United States
  'CA', // Canada
  'GB', // United Kingdom
  'AE', // United Arab Emirates
  'SA', // Saudi Arabia
  'SG', // Singapore
  'AU', // Australia
  'DE', // Germany
  'FR', // France
  'QA', // Qatar
  'OM', // Oman
  'KW', // Kuwait
  'BH', // Bahrain
  'MY', // Malaysia
  'NZ', // New Zealand
  'IE', // Ireland
  'ZA', // South Africa
  'NL', // Netherlands
  'JP', // Japan
  'CN', // China
  'CH', // Switzerland
  'SE', // Sweden
  'PH', // Philippines
  'NP', // Nepal
  'LK', // Sri Lanka
  'BD', // Bangladesh
  'PK', // Pakistan
  'NG', // Nigeria
  'KE', // Kenya
];

// Build comprehensive list of all global countries from libphonenumber-js
function buildCountryList(): CountryCodeItem[] {
  const allCodes = getCountries();
  const orderedCodes: CountryCode[] = [
    ...POPULAR_COUNTRY_CODES.filter((c) => allCodes.includes(c)),
    ...allCodes
      .filter((c) => !POPULAR_COUNTRY_CODES.includes(c))
      .sort((a, b) => getCountryName(a).localeCompare(getCountryName(b))),
  ];

  return orderedCodes.map((code) => {
    const dialCode = `+${getCountryCallingCode(code)}`;
    const flag = getFlagEmoji(code);
    const name = getCountryName(code);

    let example = '98765 43210';
    if (code === 'IN') {
      example = '98765 43210';
    } else {
      try {
        const ex = getExampleNumber(code, examples);
        if (ex) {
          example = ex.formatNational();
        }
      } catch {
        example = '123 456 7890';
      }
    }

    return {
      code,
      name,
      dialCode,
      flag,
      example,
      ...(code === 'IN' ? { exactLength: 10 } : {}),
    };
  });
}

export const COUNTRY_CODES: CountryCodeItem[] = buildCountryList();

// Default Country: India (+91, IN)
export const DEFAULT_COUNTRY: CountryCodeItem = COUNTRY_CODES[0];
export const DEFAULT_COUNTRY_CODE = 'IN';
export const DEFAULT_DIAL_CODE = '+91';

/**
 * Resolve country item by ISO code or dial code
 */
export function getCountry(codeOrDial?: string): CountryCodeItem {
  if (!codeOrDial) return DEFAULT_COUNTRY;
  const trimmed = codeOrDial.trim();

  // Try matching ISO 2-letter code first (e.g. 'IN', 'US', 'CA')
  const upper = trimmed.toUpperCase();
  const byCode = COUNTRY_CODES.find((c) => c.code === upper);
  if (byCode) return byCode;

  // Try matching dial code (e.g. '+91', '+1', '91')
  const cleanDial = trimmed.startsWith('+') ? trimmed : `+${trimmed.replace(/\D/g, '')}`;
  const byDial = COUNTRY_CODES.find((c) => c.dialCode === cleanDial);
  if (byDial) return byDial;

  return DEFAULT_COUNTRY;
}

export function getCountryByCode(code: string): CountryCodeItem {
  return getCountry(code);
}

export function getCountryByDialCode(dialCode: string): CountryCodeItem {
  return getCountry(dialCode);
}

/**
 * Validates a phone number based on selected country (dial code or ISO code).
 * - Mandatory: cannot be empty if isRequired = true
 * - Optional: returns valid with empty fields if isRequired = false and input is blank
 * - Character check: rejects letters and special symbols
 * - India (+91 / IN): exactly 10 digits, must start with 6, 7, 8, or 9
 * - International: validated against country numbering plan using libphonenumber-js
 * - Normalizes valid numbers into standard E.164 and international format
 */
export function validatePhoneNumber(
  dialCodeOrCountry: string,
  rawPhone: string,
  fieldLabel: string = 'Mobile number',
  isRequired: boolean = true
): PhoneValidationResult {
  if (!rawPhone || !rawPhone.trim()) {
    if (!isRequired) {
      return {
        isValid: true,
        normalized: '',
        e164: '',
        canonicalDigits: '',
      };
    }
    return {
      isValid: false,
      error: `${fieldLabel} is mandatory.`,
    };
  }

  const trimmed = rawPhone.trim();

  // Check for disallowed characters (only digits, spaces, dashes, parentheses, plus allowed)
  if (/[^\d\s\-\(\)\+]/.test(trimmed)) {
    return {
      isValid: false,
      error: `${fieldLabel} must contain numbers only. Letters and special characters are not allowed.`,
    };
  }

  const country = getCountry(dialCodeOrCountry);
  const isIndia = country.code === 'IN' || country.dialCode === '+91';

  // Extract pure digits
  let digits = trimmed.replace(/\D/g, '');

  // Handle pasted numbers that already include country dial code or trunk prefix 0
  const cleanDial = country.dialCode.replace(/\D/g, '');
  if (isIndia) {
    if (digits.startsWith('91') && digits.length === 12) {
      digits = digits.slice(2);
    } else if (digits.startsWith('0') && digits.length === 11) {
      digits = digits.slice(1);
    }
  } else {
    // For non-India, if user pasted with dial code, strip to national digits
    if (digits.startsWith(cleanDial) && digits.length > cleanDial.length + 5) {
      digits = digits.slice(cleanDial.length);
    }
  }

  if (!digits) {
    if (!isRequired) {
      return { isValid: true, normalized: '', e164: '', canonicalDigits: '' };
    }
    return {
      isValid: false,
      error: `${fieldLabel} is mandatory.`,
    };
  }

  // Strict Indian Mobile Number Validation
  if (isIndia) {
    if (digits.length !== 10) {
      return {
        isValid: false,
        error: `Indian mobile number must be exactly 10 digits (currently ${digits.length} digits).`,
      };
    }

    const firstDigit = digits.charAt(0);
    if (!['6', '7', '8', '9'].includes(firstDigit)) {
      return {
        isValid: false,
        error: `Indian mobile number must begin with 6, 7, 8, or 9 (starts with ${firstDigit}).`,
      };
    }

    const formattedNational = `${digits.slice(0, 5)} ${digits.slice(5)}`;
    const normalized = `+91 ${formattedNational}`;
    const e164 = `+91${digits}`;

    return {
      isValid: true,
      normalized,
      e164,
      canonicalDigits: `91${digits}`,
      formattedNational,
      formattedInternational: normalized,
      countryCode: 'IN',
      dialCode: '+91',
    };
  }

  // International phone validation using libphonenumber-js
  if (digits.length < 7 || digits.length > 15) {
    return {
      isValid: false,
      error: `International phone number must be between 7 and 15 digits (currently ${digits.length} digits).`,
    };
  }

  // Try parsing with country code
  let parsed = parsePhoneNumberFromString(trimmed, country.code as CountryCode);
  if (!parsed || !parsed.isValid()) {
    // Also try parsing with dial code prefix and national digits
    parsed = parsePhoneNumberFromString(`${country.dialCode}${digits}`);
  }

  if (!parsed || !parsed.isValid()) {
    return {
      isValid: false,
      error: `Invalid phone number for ${country.name}. Please enter a valid number.`,
    };
  }

  const e164 = parsed.format('E.164');
  const formattedInternational = parsed.formatInternational();
  const formattedNational = parsed.formatNational();

  return {
    isValid: true,
    normalized: formattedInternational,
    e164,
    canonicalDigits: e164.replace(/\D/g, ''),
    formattedNational,
    formattedInternational,
    countryCode: parsed.country || country.code,
    dialCode: `+${parsed.countryCallingCode}`,
  };
}

/**
 * Validates an optional alternate mobile number.
 * Returns valid if empty or whitespace.
 * If provided, strictly validates Indian or international format.
 */
export function validateAlternatePhoneNumber(
  rawPhone?: string | null,
  fieldLabel: string = 'Alternate mobile number'
): PhoneValidationResult {
  if (!rawPhone || !rawPhone.trim()) {
    return { isValid: true, normalized: '', e164: '', canonicalDigits: '' };
  }

  const trimmed = rawPhone.trim();

  // If number starts with '+', determine country from dial code
  if (trimmed.startsWith('+')) {
    const parsed = parsePhoneNumberFromString(trimmed);
    if (parsed) {
      return validatePhoneNumber(parsed.country || `+${parsed.countryCallingCode}`, parsed.nationalNumber, fieldLabel, false);
    }
  }

  // Default to India validation if 10 digits or starts with 91
  return validatePhoneNumber('IN', trimmed, fieldLabel, false);
}

/**
 * Normalizes phone number into consistent storage format: "+<dialCode> <nationalNumber>"
 */
export function normalizePhoneForStorage(dialCodeOrCountry: string, nationalNumber: string): string {
  const country = getCountry(dialCodeOrCountry);
  const cleanDial = country.dialCode.startsWith('+') ? country.dialCode : `+${country.dialCode}`;
  let cleanDigits = nationalNumber.replace(/\D/g, '');
  const rawDialDigits = country.dialCode.replace(/\D/g, '');
  if (cleanDigits.startsWith(rawDialDigits) && cleanDigits.length > rawDialDigits.length + 5) {
    cleanDigits = cleanDigits.slice(rawDialDigits.length);
  }
  if (country.code === 'IN') {
    if (cleanDigits.startsWith('0') && cleanDigits.length === 11) {
      cleanDigits = cleanDigits.slice(1);
    }
    if (cleanDigits.length === 10) {
      return `+91 ${cleanDigits.slice(0, 5)} ${cleanDigits.slice(5)}`;
    }
  }
  return `${cleanDial} ${cleanDigits}`;
}

/**
 * Normalizes phone number into standard E.164 format: "+<dialCode><nationalDigits>"
 */
export function normalizeToE164(dialCodeOrCountry: string, rawPhone: string): string {
  const result = validatePhoneNumber(dialCodeOrCountry, rawPhone, 'Phone', false);
  if (result.isValid && result.e164) {
    return result.e164;
  }
  const country = getCountry(dialCodeOrCountry);
  const cleanDigits = rawPhone.replace(/\D/g, '');
  return `${country.dialCode}${cleanDigits}`;
}

/**
 * Computes canonical digits for duplicate detection, search indexing, and WhatsApp links.
 * Always strips non-digits. If 10 digits and no dial code provided, defaults to India (91).
 */
export function getCanonicalPhoneDigits(countryCode?: string, phone?: string): string {
  if (!phone) return '';
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone) return '';

  const country = countryCode ? getCountry(countryCode) : null;
  const cleanCountry = country ? country.dialCode.replace(/\D/g, '') : '';

  if (cleanCountry) {
    if (cleanPhone.startsWith(cleanCountry)) {
      return cleanPhone;
    }
    return `${cleanCountry}${cleanPhone}`;
  }

  // If no country code provided:
  if (cleanPhone.length === 10) {
    return `91${cleanPhone}`;
  }
  return cleanPhone;
}

/**
 * Formats phone for clean UI display.
 */
export function formatDisplayPhone(countryCode?: string, phone?: string): string {
  if (!phone) return '—';
  const clean = phone.trim();
  if (countryCode && !clean.startsWith('+')) {
    const country = getCountry(countryCode);
    return `${country.dialCode} ${clean}`;
  }
  return clean;
}

/**
 * Parses existing stored phone strings (e.g. "+91 98765 43210" or "9876543210" or "+1 202 555 0123")
 * into dialCode, countryCode, and nationalNumber without losing data.
 */
export function parseStoredPhone(
  phoneStr?: string,
  defaultCode: string = '+91'
): { dialCode: string; countryCode: string; nationalNumber: string } {
  if (!phoneStr) {
    const def = getCountry(defaultCode);
    return { dialCode: def.dialCode, countryCode: def.code, nationalNumber: '' };
  }

  const trimmed = phoneStr.trim();

  // If starts with '+', attempt libphonenumber-js parsing
  if (trimmed.startsWith('+')) {
    const parsed = parsePhoneNumberFromString(trimmed);
    if (parsed) {
      return {
        dialCode: `+${parsed.countryCallingCode}`,
        countryCode: parsed.country || 'IN',
        nationalNumber: parsed.nationalNumber,
      };
    }
    // Fallback: match by dial code length descending
    const sorted = [...COUNTRY_CODES].sort((a, b) => b.dialCode.length - a.dialCode.length);
    const matched = sorted.find((c) => trimmed.startsWith(c.dialCode));
    if (matched) {
      const rest = trimmed.slice(matched.dialCode.length).trim();
      return { dialCode: matched.dialCode, countryCode: matched.code, nationalNumber: rest };
    }
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return { dialCode: '+91', countryCode: 'IN', nationalNumber: digits };
  }

  const def = getCountry(defaultCode);
  return { dialCode: def.dialCode, countryCode: def.code, nationalNumber: trimmed };
}

/**
 * Safe duplicate lead detection based on normalized phone digits.
 */
export function findDuplicateLeadByPhone<
  T extends { id?: string; phone?: string; country_code?: string; tenant_id?: string }
>(
  leads: T[],
  phone: string,
  countryCode: string = '+91',
  excludeLeadId?: string,
  tenantId?: string
): T | undefined {
  const targetDigits = getCanonicalPhoneDigits(countryCode, phone);
  if (!targetDigits || targetDigits.length < 8) return undefined;

  return leads.find((l) => {
    if (excludeLeadId && l.id === excludeLeadId) return false;
    if (tenantId && l.tenant_id && l.tenant_id !== tenantId) return false;
    const lDigits = getCanonicalPhoneDigits(l.country_code, l.phone);
    return lDigits === targetDigits;
  });
}
