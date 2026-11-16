/**
 * Standard Email Validation Utility
 *
 * Validates email addresses according to RFC 5322 syntax specifications.
 * Allows all valid standard email providers (e.g. Gmail, Outlook, Yahoo)
 * as well as corporate, institutional, and custom domains, while strictly
 * rejecting malformed, truncated, or invalid addresses.
 */

// RFC 5322 compliant regex covering valid local parts and domain names
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export interface EmailValidationResult {
  isValid: boolean;
  normalized?: string;
  error?: string;
}

/**
 * Validates an email address.
 *
 * @param email Raw email string
 * @param fieldLabel Human-friendly field name for error messages
 * @param required Whether the field is mandatory (default: true)
 */
export function validateEmailAddress(
  email?: string | null,
  fieldLabel = 'Email address',
  required = true
): EmailValidationResult {
  if (!email || !email.trim()) {
    if (required) {
      return { isValid: false, error: `${fieldLabel} is required.` };
    }
    return { isValid: true, normalized: '' };
  }

  const trimmed = email.trim();

  // Basic length constraints
  if (trimmed.length > 254) {
    return { isValid: false, error: `${fieldLabel} cannot exceed 254 characters.` };
  }

  // Reject spaces anywhere in the address
  if (/\s/.test(trimmed)) {
    return { isValid: false, error: `${fieldLabel} must not contain spaces.` };
  }

  // Must contain exactly one '@'
  const atParts = trimmed.split('@');
  if (atParts.length !== 2) {
    return { isValid: false, error: `${fieldLabel} must contain a single '@' separator.` };
  }

  const [localPart, domainPart] = atParts;

  // Local part constraints
  if (!localPart || localPart.length > 64) {
    return { isValid: false, error: 'Email username must be between 1 and 64 characters.' };
  }

  // Reject consecutive dots in local or domain part
  if (localPart.includes('..') || domainPart.includes('..')) {
    return { isValid: false, error: `${fieldLabel} cannot contain consecutive dots.` };
  }

  if (localPart.startsWith('.') || localPart.endsWith('.')) {
    return { isValid: false, error: 'Email username cannot start or end with a dot.' };
  }

  // Domain part constraints
  if (!domainPart || !domainPart.includes('.')) {
    return { isValid: false, error: `${fieldLabel} must include a valid domain extension (e.g. .com, .edu, .org).` };
  }

  if (domainPart.startsWith('.') || domainPart.endsWith('.')) {
    return { isValid: false, error: 'Email domain cannot start or end with a dot.' };
  }

  const domainLabels = domainPart.split('.');
  const tld = domainLabels[domainLabels.length - 1];
  if (tld.length < 2) {
    return { isValid: false, error: 'Email top-level domain must be at least 2 characters.' };
  }

  // Final regex test
  if (!EMAIL_REGEX.test(trimmed)) {
    return { isValid: false, error: `Please enter a valid ${fieldLabel.toLowerCase()} (e.g. name@example.com).` };
  }

  return {
    isValid: true,
    normalized: trimmed.toLowerCase(),
  };
}
