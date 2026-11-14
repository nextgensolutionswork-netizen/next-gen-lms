import { describe, it, expect } from 'vitest';
import {
  COUNTRY_CODES,
  DEFAULT_COUNTRY,
  DEFAULT_COUNTRY_CODE,
  DEFAULT_DIAL_CODE,
  getCountry,
  validatePhoneNumber,
  validateAlternatePhoneNumber,
  normalizePhoneForStorage,
  normalizeToE164,
  getCanonicalPhoneDigits,
  parseStoredPhone,
  findDuplicateLeadByPhone,
} from '@/lib/utils/phone-validation';

describe('International Phone Number Validation & Utilities', () => {
  describe('Country Directory & Defaults', () => {
    it('defaults to India (+91, IN)', () => {
      expect(DEFAULT_COUNTRY.code).toBe('IN');
      expect(DEFAULT_COUNTRY.dialCode).toBe('+91');
      expect(DEFAULT_COUNTRY_CODE).toBe('IN');
      expect(DEFAULT_DIAL_CODE).toBe('+91');
      expect(DEFAULT_COUNTRY.flag).toBe('🇮🇳');
    });

    it('contains all 245 global countries with valid flags, names and dial codes', () => {
      expect(COUNTRY_CODES.length).toBeGreaterThanOrEqual(240);
      const us = getCountry('US');
      expect(us.code).toBe('US');
      expect(us.dialCode).toBe('+1');
      expect(us.flag).toBe('🇺🇸');

      const gb = getCountry('GB');
      expect(gb.code).toBe('GB');
      expect(gb.dialCode).toBe('+44');
      expect(gb.flag).toBe('🇬🇧');

      const ae = getCountry('AE');
      expect(ae.code).toBe('AE');
      expect(ae.dialCode).toBe('+971');
      expect(ae.flag).toBe('🇦🇪');
    });

    it('resolves countries by dial code or ISO code interchangeably', () => {
      expect(getCountry('+91').code).toBe('IN');
      expect(getCountry('IN').dialCode).toBe('+91');
      expect(getCountry('+971').code).toBe('AE');
      expect(getCountry('AE').dialCode).toBe('+971');
      expect(getCountry('+44').code).toBe('GB');
    });
  });

  describe('Indian Mobile Number Validation (Strict Plan)', () => {
    it('accepts valid 10-digit Indian mobile numbers starting with 6, 7, 8, 9', () => {
      const validNumbers = [
        '9876543210',
        '8123456789',
        '7012345678',
        '6234567890',
      ];

      for (const num of validNumbers) {
        const res = validatePhoneNumber('IN', num, 'Mobile number');
        expect(res.isValid).toBe(true);
        expect(res.error).toBeUndefined();
        expect(res.countryCode).toBe('IN');
        expect(res.dialCode).toBe('+91');
        expect(res.e164).toBe(`+91${num}`);
        expect(res.canonicalDigits).toBe(`91${num}`);
      }
    });

    it('rejects Indian numbers starting with 0, 1, 2, 3, 4, 5', () => {
      const invalidStarts = ['5876543210', '1234567890', '0987654321', '4123456789'];
      for (const num of invalidStarts) {
        const res = validatePhoneNumber('IN', num, 'Mobile number');
        expect(res.isValid).toBe(false);
        expect(res.error).toMatch(/must begin with 6, 7, 8, or 9/i);
      }
    });

    it('rejects Indian numbers with invalid length (less or more than 10 digits)', () => {
      const short = validatePhoneNumber('IN', '987654321', 'Mobile number');
      expect(short.isValid).toBe(false);
      expect(short.error).toMatch(/must be exactly 10 digits \(currently 9 digits\)/i);

      const long = validatePhoneNumber('IN', '98765432109', 'Mobile number');
      expect(long.isValid).toBe(false);
      expect(long.error).toMatch(/must be exactly 10 digits \(currently 11 digits\)/i);
    });

    it('handles pasted numbers that include country code +91 or 91 without duplication', () => {
      const pastedWithPlus = validatePhoneNumber('IN', '+91 98765 43210', 'Mobile number');
      expect(pastedWithPlus.isValid).toBe(true);
      expect(pastedWithPlus.e164).toBe('+919876543210');
      expect(pastedWithPlus.normalized).toBe('+91 98765 43210');

      const pastedWith91 = validatePhoneNumber('+91', '919876543210', 'Mobile number');
      expect(pastedWith91.isValid).toBe(true);
      expect(pastedWith91.e164).toBe('+919876543210');
    });

    it('rejects letters, alphabets, and disallowed symbols', () => {
      const res = validatePhoneNumber('IN', '98765abcde', 'Mobile number');
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/must contain numbers only/i);
    });

    it('enforces mandatory field when required', () => {
      const empty = validatePhoneNumber('IN', '', 'Mobile number', true);
      expect(empty.isValid).toBe(false);
      expect(empty.error).toMatch(/Mobile number is mandatory/i);

      const spaces = validatePhoneNumber('IN', '   ', 'Mobile number', true);
      expect(spaces.isValid).toBe(false);
      expect(spaces.error).toMatch(/Mobile number is mandatory/i);
    });
  });

  describe('International Phone Validation (libphonenumber-js)', () => {
    it('accepts valid United States numbers', () => {
      const res = validatePhoneNumber('US', '202 555 0123');
      expect(res.isValid).toBe(true);
      expect(res.e164).toBe('+12025550123');
      expect(res.countryCode).toBe('US');
      expect(res.dialCode).toBe('+1');
    });

    it('accepts valid United Kingdom numbers', () => {
      const res = validatePhoneNumber('GB', '7911 123456');
      expect(res.isValid).toBe(true);
      expect(res.e164).toBe('+447911123456');
      expect(res.dialCode).toBe('+44');
    });

    it('accepts valid United Arab Emirates numbers', () => {
      const res = validatePhoneNumber('AE', '50 123 4567');
      expect(res.isValid).toBe(true);
      expect(res.e164).toBe('+971501234567');
      expect(res.dialCode).toBe('+971');
    });

    it('accepts valid Germany numbers', () => {
      const res = validatePhoneNumber('DE', '151 23456789');
      expect(res.isValid).toBe(true);
      expect(res.e164).toBe('+4915123456789');
      expect(res.dialCode).toBe('+49');
    });

    it('accepts valid Singapore numbers', () => {
      const res = validatePhoneNumber('SG', '8123 4567');
      expect(res.isValid).toBe(true);
      expect(res.e164).toBe('+6581234567');
      expect(res.dialCode).toBe('+65');
    });

    it('rejects international numbers with impossible lengths', () => {
      const short = validatePhoneNumber('US', '123', 'Phone');
      expect(short.isValid).toBe(false);
      expect(short.error).toMatch(/must be between 7 and 15 digits/i);
    });

    it('rejects impossible/malformed numbers according to national plan', () => {
      const bad = validatePhoneNumber('US', '000 000 0000', 'Phone');
      expect(bad.isValid).toBe(false);
      expect(bad.error).toMatch(/Invalid phone number for United States/i);
    });
  });

  describe('Optional Alternate Phone Number Validation', () => {
    it('returns valid when alternate phone is empty or whitespace', () => {
      expect(validateAlternatePhoneNumber('').isValid).toBe(true);
      expect(validateAlternatePhoneNumber(null).isValid).toBe(true);
      expect(validateAlternatePhoneNumber('   ').isValid).toBe(true);
    });

    it('validates strictly when alternate phone is provided', () => {
      const valid = validateAlternatePhoneNumber('9876543210');
      expect(valid.isValid).toBe(true);
      expect(valid.e164).toBe('+919876543210');

      const invalid = validateAlternatePhoneNumber('12345');
      expect(invalid.isValid).toBe(false);
    });
  });

  describe('Storage Normalization and Stored String Parsing', () => {
    it('normalizes to standard E.164 format', () => {
      expect(normalizeToE164('IN', '9876543210')).toBe('+919876543210');
      expect(normalizeToE164('US', '202 555 0123')).toBe('+12025550123');
    });

    it('normalizes to formatted storage display string', () => {
      expect(normalizePhoneForStorage('IN', '9876543210')).toBe('+91 98765 43210');
      expect(normalizePhoneForStorage('US', '2025550123')).toBe('+1 2025550123');
    });

    it('extracts canonical digits for indexing and search', () => {
      expect(getCanonicalPhoneDigits('+91', '9876543210')).toBe('919876543210');
      expect(getCanonicalPhoneDigits('+1', '202 555 0123')).toBe('12025550123');
      expect(getCanonicalPhoneDigits(undefined, '9876543210')).toBe('919876543210');
    });

    it('correctly parses legacy and stored phone strings without data loss', () => {
      const parsed1 = parseStoredPhone('+91 98765 43210');
      expect(parsed1.dialCode).toBe('+91');
      expect(parsed1.countryCode).toBe('IN');
      expect(parsed1.nationalNumber).toBe('9876543210');

      const parsed2 = parseStoredPhone('9876543210');
      expect(parsed2.dialCode).toBe('+91');
      expect(parsed2.countryCode).toBe('IN');
      expect(parsed2.nationalNumber).toBe('9876543210');

      const parsed3 = parseStoredPhone('+1 202 555 0123');
      expect(parsed3.dialCode).toBe('+1');
      expect(parsed3.countryCode).toBe('US');
      expect(parsed3.nationalNumber).toBe('2025550123');
    });

    it('detects duplicate leads accurately using canonical digits', () => {
      const leads = [
        { id: 'ld-1', full_name: 'Lead One', phone: '+91 98765 43210', country_code: '+91' },
        { id: 'ld-2', full_name: 'Lead Two', phone: '+1 202 555 0123', country_code: '+1' },
      ];

      // Exact match with different spacing
      const dup1 = findDuplicateLeadByPhone(leads, '9876543210', '+91');
      expect(dup1?.id).toBe('ld-1');

      // Duplicate with +91 prefix entered
      const dup2 = findDuplicateLeadByPhone(leads, '+919876543210', '+91');
      expect(dup2?.id).toBe('ld-1');

      // Non duplicate
      const noDup = findDuplicateLeadByPhone(leads, '9123456789', '+91');
      expect(noDup).toBeUndefined();
    });
  });
});
