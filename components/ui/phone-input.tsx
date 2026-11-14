'use client';

import * as React from 'react';
import { Search, ChevronDown, Check, AlertTriangle } from 'lucide-react';
import {
  COUNTRY_CODES,
  CountryCodeItem,
  DEFAULT_COUNTRY,
  DEFAULT_COUNTRY_CODE,
  DEFAULT_DIAL_CODE,
  getCountry,
  validatePhoneNumber,
  parseStoredPhone,
  PhoneValidationResult,
} from '@/lib/utils/phone-validation';

export interface PhoneInputProps {
  label?: string;
  id?: string;
  name?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;

  // Controlled dual-prop interface
  countryCode?: string; // Dial code e.g. '+91' or ISO code e.g. 'IN'
  onCountryCodeChange?: (dialCode: string, country: CountryCodeItem) => void;
  phoneNumber?: string; // National phone number e.g. '98765 43210'
  onPhoneNumberChange?: (phoneNumber: string, result: PhoneValidationResult) => void;

  // Controlled single-prop interface (alternative)
  value?: string; // Full string e.g. '+91 98765 43210' or '9876543210'
  onChange?: (value: string, result: PhoneValidationResult) => void;

  // Validation & alerts
  error?: string;
  duplicateWarning?: string;
  autoValidate?: boolean; // Default true: runs inline validation on change
  onValidationChange?: (result: PhoneValidationResult) => void;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  label,
  id,
  name,
  placeholder,
  required = false,
  disabled = false,
  className = '',
  countryCode: propCountryCode,
  onCountryCodeChange,
  phoneNumber: propPhoneNumber,
  onPhoneNumberChange,
  value: propValue,
  onChange: propOnChange,
  error: externalError,
  duplicateWarning,
  autoValidate = true,
  onValidationChange,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [internalError, setInternalError] = React.useState('');
  const [touched, setTouched] = React.useState(false);

  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const numberInputRef = React.useRef<HTMLInputElement>(null);

  // Determine current active country item
  const selectedCountry: CountryCodeItem = React.useMemo(() => {
    if (propCountryCode) {
      return getCountry(propCountryCode);
    }
    if (propValue && propValue.trim().startsWith('+')) {
      const parsed = parseStoredPhone(propValue);
      return getCountry(parsed.countryCode || parsed.dialCode);
    }
    return DEFAULT_COUNTRY;
  }, [propCountryCode, propValue]);

  // Determine current phone digits/national number
  const rawNumber: string = React.useMemo(() => {
    if (propPhoneNumber !== undefined) {
      return propPhoneNumber;
    }
    if (propValue !== undefined) {
      const parsed = parseStoredPhone(propValue);
      return parsed.nationalNumber;
    }
    return '';
  }, [propPhoneNumber, propValue]);

  // Handle outside clicks to close popover
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Run validation whenever country or raw number changes
  const runValidation = React.useCallback(
    (country: CountryCodeItem, number: string) => {
      const fieldTitle = label || 'Phone number';
      const result = validatePhoneNumber(country.code, number, fieldTitle, required);

      if (autoValidate) {
        if (!result.isValid && (touched || number.trim().length > 0)) {
          setInternalError(result.error || '');
        } else {
          setInternalError('');
        }
      }

      if (onValidationChange) {
        onValidationChange(result);
      }
      return result;
    },
    [label, required, autoValidate, touched, onValidationChange]
  );

  // Filter countries by search query
  const filteredCountries = React.useMemo(() => {
    if (!search.trim()) return COUNTRY_CODES;
    const q = search.trim().toLowerCase();
    return COUNTRY_CODES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.dialCode.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q)
    );
  }, [search]);

  // Handle country selection
  const handleSelectCountry = (country: CountryCodeItem) => {
    setIsOpen(false);
    setSearch('');

    if (onCountryCodeChange) {
      onCountryCodeChange(country.dialCode, country);
    }

    const validation = runValidation(country, rawNumber);

    if (propOnChange) {
      const combined = validation.isValid && validation.normalized
        ? validation.normalized
        : `${country.dialCode} ${rawNumber.trim()}`.trim();
      propOnChange(combined, validation);
    }

    if (onPhoneNumberChange) {
      onPhoneNumberChange(rawNumber, validation);
    }

    setTimeout(() => numberInputRef.current?.focus(), 50);
  };

  // Handle phone input changes & paste events
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputVal = e.target.value;

    // Detect if user typed/pasted a number with dial code (e.g. '+91 98765 43210' or '+1 202 555 0123')
    let activeCountry = selectedCountry;
    if (inputVal.trim().startsWith('+')) {
      const parsed = parseStoredPhone(inputVal);
      if (parsed.dialCode) {
        const detectedCountry = getCountry(parsed.countryCode || parsed.dialCode);
        if (detectedCountry.code !== selectedCountry.code) {
          activeCountry = detectedCountry;
          if (onCountryCodeChange) {
            onCountryCodeChange(detectedCountry.dialCode, detectedCountry);
          }
        }
        inputVal = parsed.nationalNumber;
      }
    } else {
      // If user pasted e.g. 919876543210 while India is selected, remove duplicate 91 prefix
      if (activeCountry.code === 'IN') {
        const pureDigits = inputVal.replace(/\D/g, '');
        if (pureDigits.startsWith('91') && pureDigits.length === 12) {
          inputVal = pureDigits.slice(2);
        }
      }
    }

    const validation = runValidation(activeCountry, inputVal);

    if (onPhoneNumberChange) {
      onPhoneNumberChange(inputVal, validation);
    }

    if (propOnChange) {
      const combined = validation.isValid && validation.normalized
        ? validation.normalized
        : `${activeCountry.dialCode} ${inputVal.trim()}`.trim();
      propOnChange(combined, validation);
    }
  };

  const handleBlur = () => {
    setTouched(true);
    runValidation(selectedCountry, rawNumber);
  };

  const activeError = externalError || (touched ? internalError : '');
  const defaultPlaceholder = selectedCountry.example || '98765 43210';

  return (
    <div className={`w-full space-y-1 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-semibold uppercase tracking-wider text-slate-600"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      <div
        className={`relative flex rounded-lg border bg-white shadow-xs transition-colors ${
          activeError
            ? 'border-red-400 focus-within:ring-2 focus-within:ring-red-400'
            : 'border-slate-300 focus-within:ring-2 focus-within:ring-[#0A6ED1] focus-within:border-transparent'
        }`}
      >
        {/* Country Selector Button */}
        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setIsOpen((prev) => !prev);
              setSearch('');
            }}
            className="flex h-10 items-center gap-1.5 px-3 py-2 border-r border-slate-200 bg-slate-50 hover:bg-slate-100 rounded-l-lg text-xs font-medium text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title={`${selectedCountry.name} (${selectedCountry.dialCode})`}
            aria-label="Select country code"
            aria-expanded={isOpen}
          >
            <span className="text-base leading-none">{selectedCountry.flag}</span>
            <span className="font-semibold text-slate-800">{selectedCountry.dialCode}</span>
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </button>

          {/* Searchable Dropdown Popover */}
          {isOpen && (
            <div className="absolute left-0 top-full mt-1 w-72 max-h-72 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl z-50 flex flex-col">
              <div className="p-2 border-b border-slate-100 bg-slate-50">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search country or code..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
                  />
                </div>
              </div>

              <div className="overflow-y-auto max-h-56 py-1 divide-y divide-slate-50">
                {filteredCountries.length === 0 ? (
                  <div className="p-3 text-xs text-center text-slate-400">No country found</div>
                ) : (
                  filteredCountries.map((c: CountryCodeItem) => {
                    const isSelected =
                      c.code === selectedCountry.code && c.dialCode === selectedCountry.dialCode;
                    return (
                      <button
                        key={`${c.code}-${c.dialCode}`}
                        type="button"
                        onClick={() => handleSelectCountry(c)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-blue-50 transition-colors ${
                          isSelected
                            ? 'bg-blue-50/80 font-semibold text-blue-700'
                            : 'text-slate-700'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate pr-2">
                          <span className="text-base shrink-0">{c.flag}</span>
                          <span className="truncate">{c.name}</span>
                        </span>
                        <span className="flex items-center gap-1.5 font-mono text-slate-500 shrink-0 ml-auto">
                          <span>{c.dialCode}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-blue-600" />}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* National Phone Number Input */}
        <input
          ref={numberInputRef}
          id={id}
          name={name}
          type="tel"
          disabled={disabled}
          value={rawNumber}
          onChange={handleInputChange}
          onBlur={handleBlur}
          placeholder={placeholder || defaultPlaceholder}
          required={required}
          className={`flex h-10 w-full rounded-r-lg bg-transparent px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
            activeError ? 'text-red-900' : ''
          }`}
        />
      </div>

      {/* Inline Validation Error */}
      {activeError && <p className="text-xs text-red-600 font-medium">{activeError}</p>}

      {/* Duplicate Warning Alert */}
      {duplicateWarning && (
        <div className="flex items-start gap-1.5 p-2 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
          <span>{duplicateWarning}</span>
        </div>
      )}
    </div>
  );
};

export const InternationalPhoneInput = PhoneInput;
