/**
 * Phone Number & International Country Code Validation Utility
 * Next-Gen ERP LMS - CRM & Admissions
 */

export interface CountryCodeItem {
  code: string; // ISO 3166-1 alpha-2
  name: string; // Country name
  dialCode: string; // e.g. '+91'
  flag: string; // Flag emoji
  example: string; // Formatting example
  exactLength?: number; // Exact national number length if strict
}

export const COUNTRY_CODES: CountryCodeItem[] = [
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳', example: '98765 43210', exactLength: 10 },
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', example: '202 555 0123', exactLength: 10 },
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦', example: '416 555 0199', exactLength: 10 },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧', example: '7911 123456', exactLength: 10 },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪', example: '50 123 4567' },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '+966', flag: '🇸🇦', example: '50 123 4567' },
  { code: 'SG', name: 'Singapore', dialCode: '+65', flag: '🇸🇬', example: '8123 4567' },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺', example: '412 345 678' },
  { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪', example: '151 23456789' },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷', example: '6 12 34 56 78' },
  { code: 'QA', name: 'Qatar', dialCode: '+974', flag: '🇶🇦', example: '3312 3456' },
  { code: 'OM', name: 'Oman', dialCode: '+968', flag: '🇴🇲', example: '9123 4567' },
  { code: 'KW', name: 'Kuwait', dialCode: '+965', flag: '🇰🇼', example: '9123 4567' },
  { code: 'BH', name: 'Bahrain', dialCode: '+973', flag: '🇧🇭', example: '3912 3456' },
  { code: 'MY', name: 'Malaysia', dialCode: '+60', flag: '🇲🇾', example: '12 345 6789' },
  { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿', example: '21 123 4567' },
  { code: 'IE', name: 'Ireland', dialCode: '+353', flag: '🇮🇪', example: '85 123 4567' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦', example: '82 123 4567' },
  { code: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱', example: '6 12345678' },
  { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵', example: '90 1234 5678' },
  { code: 'CN', name: 'China', dialCode: '+86', flag: '🇨🇳', example: '138 0013 8000' },
  { code: 'CH', name: 'Switzerland', dialCode: '+41', flag: '🇨🇭', example: '78 123 45 67' },
  { code: 'SE', name: 'Sweden', dialCode: '+46', flag: '🇸🇪', example: '70 123 45 67' },
  { code: 'PH', name: 'Philippines', dialCode: '+63', flag: '🇵🇭', example: '917 123 4567' },
  { code: 'NP', name: 'Nepal', dialCode: '+977', flag: '🇳🇵', example: '984 1234567' },
  { code: 'LK', name: 'Sri Lanka', dialCode: '+94', flag: '🇱🇰', example: '77 123 4567' },
  { code: 'BD', name: 'Bangladesh', dialCode: '+880', flag: '🇧🇩', example: '1712 345678' },
  { code: 'PK', name: 'Pakistan', dialCode: '+92', flag: '🇵🇰', example: '300 1234567' },
  { code: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬', example: '802 123 4567' },
  { code: 'KE', name: 'Kenya', dialCode: '+254', flag: '🇰🇪', example: '712 345678' },
];

export const DEFAULT_COUNTRY = COUNTRY_CODES[0]; // India (+91)

export function isSupportedCountryCode(dialCode?: string): boolean {
  if (!dialCode) return false;
  const clean = dialCode.startsWith('+') ? dialCode : `+${dialCode}`;
  return COUNTRY_CODES.some((c) => c.dialCode === clean || c.dialCode === dialCode);
}

export interface PhoneValidationResult {
  isValid: boolean;
  error?: string;
  normalized?: string;
  canonicalDigits?: string;
}

/**
 * Validates a phone number based on selected country dial code.
 * - Mandatory: cannot be empty
 * - India (+91): exactly 10 digits, must start with 6, 7, 8, or 9
 * - International: 7 to 15 digits (total E.164 length including dial code)
 * - Rejects letters and malformed inputs
 */
export function validatePhoneNumber(
  dialCode: string,
  rawPhone: string,
  fieldLabel: string = 'Mobile number'
): PhoneValidationResult {
  if (!rawPhone || !rawPhone.trim()) {
    return {
      isValid: false,
      error: `${fieldLabel} is mandatory.`,
    };
  }

  const trimmed = rawPhone.trim();

  // Check for disallowed characters (only digits, spaces, dashes, parentheses allowed in input)
  if (/[^\d\s\-\(\)\+]/.test(trimmed)) {
    return {
      isValid: false,
      error: `${fieldLabel} must contain numbers only. Letters and special characters are not allowed.`,
    };
  }

  // Extract pure digits of national number
  let digits = trimmed.replace(/\D/g, '');
  const cleanDial = dialCode.replace(/\D/g, '');
  const isIndia = dialCode === '+91' || dialCode === '91' || cleanDial === '91';

  // Handle dial code stripping carefully to avoid prefix collision (e.g., 9123456789 in India)
  if (isIndia) {
    // If 12 digits starting with 91, the user pasted country code + 10-digit number
    if (digits.length === 12 && digits.startsWith('91')) {
      digits = digits.slice(2);
    } else if (digits.length === 11 && digits.startsWith('0')) {
      // Handle leading zero for Indian trunk numbers (e.g. 09876543210 -> 9876543210)
      digits = digits.slice(1);
    }
  } else {
    // For non-India: if user explicitly included country dial code with leading +
    if (trimmed.startsWith('+') && digits.startsWith(cleanDial) && digits.length > cleanDial.length + 3) {
      digits = digits.slice(cleanDial.length);
    }
  }

  if (!digits) {
    return {
      isValid: false,
      error: `${fieldLabel} is mandatory.`,
    };
  }

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
    return {
      isValid: true,
      normalized: `+91 ${formattedNational}`,
      canonicalDigits: `91${digits}`,
    };
  }

  // International phone validation (E.164: national digits 7-15, total digits with dial code <= 15)
  const totalDigits = cleanDial.length + digits.length;
  if (digits.length < 7 || digits.length > 15 || totalDigits > 15) {
    return {
      isValid: false,
      error: `International phone number must be between 7 and 15 digits (currently ${digits.length} digits).`,
    };
  }

  const formattedDial = dialCode.startsWith('+') ? dialCode : `+${dialCode}`;
  return {
    isValid: true,
    normalized: `${formattedDial} ${digits}`,
    canonicalDigits: `${cleanDial}${digits}`,
  };
}

/**
 * Normalizes phone number into consistent storage format: "+<dialCode> <nationalNumber>"
 */
export function normalizePhoneForStorage(dialCode: string, nationalNumber: string): string {
  const cleanDial = dialCode.startsWith('+') ? dialCode : `+${dialCode}`;
  const cleanDigits = nationalNumber.replace(/\D/g, '');
  if (cleanDial === '+91' && cleanDigits.length === 10) {
    return `+91 ${cleanDigits.slice(0, 5)} ${cleanDigits.slice(5)}`;
  }
  return `${cleanDial} ${cleanDigits}`;
}

/**
 * Computes canonical digits for duplicate detection and WhatsApp links.
 * Always strips non-digits. If 10 digits and no dial code provided, defaults to India (91).
 */
export function getCanonicalPhoneDigits(countryCode?: string, phone?: string): string {
  if (!phone) return '';
  let cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone) return '';

  const cleanCountry = countryCode ? countryCode.replace(/\D/g, '') : '';
  const isIndia = cleanCountry === '91' || (!cleanCountry && cleanPhone.length === 10);

  // If cleanPhone has 11 digits starting with 0 and cleanCountry is 91 or empty
  if (cleanPhone.length === 11 && cleanPhone.startsWith('0') && isIndia) {
    cleanPhone = cleanPhone.slice(1);
  }

  if (cleanCountry === '91') {
    if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
      return cleanPhone;
    }
    if (cleanPhone.length === 10) {
      return `91${cleanPhone}`;
    }
    if (phone.trim().startsWith('+91') && cleanPhone.startsWith('91')) {
      return cleanPhone;
    }
    return `91${cleanPhone}`;
  }

  if (cleanCountry) {
    if (phone.trim().startsWith('+') && cleanPhone.startsWith(cleanCountry)) {
      return cleanPhone;
    }
    if (cleanPhone.startsWith(cleanCountry) && cleanPhone.length > cleanCountry.length + 4) {
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
    return `${countryCode} ${clean}`;
  }
  return clean;
}

/**
 * Parses existing stored phone strings (e.g. "+91 98765 43210" or "9876543210")
 * into dialCode and nationalNumber.
 */
export function parseStoredPhone(
  phoneStr?: string,
  defaultCode: string = '+91'
): { dialCode: string; nationalNumber: string } {
  if (!phoneStr) return { dialCode: defaultCode, nationalNumber: '' };
  const trimmed = phoneStr.trim();

  if (trimmed.startsWith('+')) {
    // Sort by descending dialCode length to match +971 before +9, etc.
    const sorted = [...COUNTRY_CODES].sort((a, b) => b.dialCode.length - a.dialCode.length);
    const matched = sorted.find((c) => trimmed.startsWith(c.dialCode));
    if (matched) {
      const rest = trimmed.slice(matched.dialCode.length).trim();
      return { dialCode: matched.dialCode, nationalNumber: rest };
    }
  }

  return { dialCode: defaultCode, nationalNumber: trimmed };
}

/**
 * Safe duplicate lead detection based on normalized phone digits.
 */
export function findDuplicateLeadByPhone<T extends { id?: string; phone?: string; country_code?: string; tenant_id?: string }>(
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

export interface DuplicateLeadMatch<T = any> {
  isDuplicate: boolean;
  matchType?: 'phone' | 'email' | 'both';
  existingLead?: T;
  isConverted?: boolean;
  admissionNumber?: string;
  message?: string;
}

/**
 * Comprehensive duplicate check comparing canonical phone digits and email address.
 * Cross-references admissions to detect if candidate was already converted.
 */
export function checkDuplicateLead<T extends {
  id?: string;
  lead_code?: string;
  full_name?: string;
  phone?: string;
  country_code?: string;
  email?: string;
  stage?: string;
  counsellor_name?: string;
  tenant_id?: string;
  notes?: string;
}>(
  leads: T[],
  input: {
    phone?: string;
    country_code?: string;
    email?: string;
    tenant_id?: string;
    excludeLeadId?: string;
  },
  admissions?: { id?: string; lead_id?: string; admission_number?: string; email?: string }[]
): DuplicateLeadMatch<T> {
  if (!leads || leads.length === 0) {
    return { isDuplicate: false };
  }

  const targetDigits = input.phone ? getCanonicalPhoneDigits(input.country_code || '+91', input.phone) : '';
  const targetEmail = input.email?.trim().toLowerCase();

  for (const lead of leads) {
    if (input.excludeLeadId && lead.id === input.excludeLeadId) continue;
    if (input.tenant_id && lead.tenant_id && lead.tenant_id !== input.tenant_id) continue;

    const leadDigits = getCanonicalPhoneDigits(lead.country_code, lead.phone);
    const phoneMatch = Boolean(targetDigits && leadDigits && targetDigits === leadDigits);
    const emailMatch = Boolean(targetEmail && lead.email && lead.email.trim().toLowerCase() === targetEmail);

    if (phoneMatch || emailMatch) {
      const matchType: 'phone' | 'email' | 'both' = phoneMatch && emailMatch ? 'both' : phoneMatch ? 'phone' : 'email';

      const isConverted =
        lead.stage === 'Converted' ||
        lead.stage === 'Enrolled' ||
        Boolean(admissions?.some((a) => a.lead_id === lead.id || (lead.notes && a.admission_number && lead.notes.includes(a.admission_number))));

      const matchingAdmission = admissions?.find(
        (a) => a.lead_id === lead.id || (lead.notes && a.admission_number && lead.notes.includes(a.admission_number))
      );
      const admNum = matchingAdmission?.admission_number;

      const identifier = matchType === 'both' ? 'mobile number and email' : matchType === 'phone' ? 'mobile number' : 'email address';
      let msg = `A lead with this ${identifier} already exists: ${lead.lead_code || lead.id} (${lead.full_name}) in stage "${lead.stage || 'New'}". Assigned to: ${lead.counsellor_name || 'Unassigned'}.`;
      if (isConverted) {
        msg += ` Candidate has already been converted to admission${admNum ? ` (${admNum})` : ''}.`;
      }

      return {
        isDuplicate: true,
        matchType,
        existingLead: lead,
        isConverted,
        admissionNumber: admNum,
        message: msg,
      };
    }
  }

  return { isDuplicate: false };
}

/**
 * Validates an optional alternate mobile number.
 * Returns valid if empty.
 * If provided, validates that it contains digits only, and validates Indian (10 digits starting with 6,7,8,9)
 * or international format (7-15 digits).
 */
export function validateAlternatePhoneNumber(
  rawPhone?: string | null,
  fieldLabel: string = 'Alternate mobile number'
): PhoneValidationResult {
  if (!rawPhone || !rawPhone.trim()) {
    return { isValid: true };
  }

  const trimmed = rawPhone.trim();

  // Reject disallowed characters
  if (/[^\d\s\-\(\)\+]/.test(trimmed)) {
    return {
      isValid: false,
      error: `${fieldLabel} must contain numbers only. Letters and special characters are not allowed.`,
    };
  }

  // Extract digits
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return { isValid: true };
  }

  // Handle +91 prefix
  if (trimmed.startsWith('+91') || (trimmed.startsWith('91') && digits.length === 12)) {
    if (digits.startsWith('91')) {
      digits = digits.slice(2);
    }
  }

  // If 10 digits or was prefixed with +91, validate as Indian mobile number
  if (digits.length === 10 || trimmed.startsWith('+91')) {
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
    const formatted = `${digits.slice(0, 5)} ${digits.slice(5)}`;
    return {
      isValid: true,
      normalized: `+91 ${formatted}`,
      canonicalDigits: `91${digits}`,
    };
  }

  // International phone validation (7 to 15 digits)
  if (digits.length < 7 || digits.length > 15) {
    return {
      isValid: false,
      error: `${fieldLabel} must be between 7 and 15 digits (currently ${digits.length} digits).`,
    };
  }

  const prefix = trimmed.startsWith('+') ? '+' : '+91 ';
  return {
    isValid: true,
    normalized: `${prefix}${digits}`,
    canonicalDigits: digits,
  };
}
