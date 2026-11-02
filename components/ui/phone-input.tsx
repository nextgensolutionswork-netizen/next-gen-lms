'use client';

import * as React from 'react';
import { Search, ChevronDown, Check, AlertTriangle } from 'lucide-react';
import { COUNTRY_CODES, CountryCodeItem } from '@/lib/utils/phone-validation';

export interface PhoneInputProps {
  label?: string;
  countryCode: string;
  onCountryCodeChange: (dialCode: string) => void;
  phoneNumber: string;
  onPhoneNumberChange: (number: string) => void;
  error?: string;
  duplicateWarning?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}

export const PhoneInput: React.FC<PhoneInputProps> = ({
  label,
  countryCode,
  onCountryCodeChange,
  phoneNumber,
  onPhoneNumberChange,
  error,
  duplicateWarning,
  required = false,
  disabled = false,
  placeholder,
  id,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const selectedCountry =
    COUNTRY_CODES.find((c) => c.dialCode === countryCode) ||
    COUNTRY_CODES[0]; // fallback to India

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

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Auto-focus search input when opened
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const defaultPlaceholder = selectedCountry.example || '98765 43210';

  return (
    <div className="w-full space-y-1">
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-semibold uppercase tracking-wider text-slate-600"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      <div className="relative flex rounded-lg border border-slate-300 bg-white shadow-sm focus-within:ring-2 focus-within:ring-[#0A6ED1] focus-within:border-transparent transition-colors">
        {/* Country Code Picker Dropdown Button */}
        <div className="relative" ref={dropdownRef}>
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
            <div className="absolute left-0 top-full mt-1 w-64 max-h-60 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl z-50 flex flex-col">
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
              <div className="overflow-y-auto max-h-48 py-1 divide-y divide-slate-50">
                {filteredCountries.length === 0 ? (
                  <div className="p-3 text-xs text-center text-slate-400">No country found</div>
                ) : (
                  filteredCountries.map((c: CountryCodeItem) => {
                    const isSelected = c.dialCode === countryCode && c.code === selectedCountry.code;
                    return (
                      <button
                        key={`${c.code}-${c.dialCode}`}
                        type="button"
                        onClick={() => {
                          onCountryCodeChange(c.dialCode);
                          setIsOpen(false);
                          setSearch('');
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-blue-50 transition-colors ${
                          isSelected ? 'bg-blue-50/80 font-semibold text-blue-700' : 'text-slate-700'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className="text-base">{c.flag}</span>
                          <span className="truncate">{c.name}</span>
                        </span>
                        <span className="flex items-center gap-1 font-mono text-slate-500 shrink-0 ml-2">
                          <span>{c.dialCode}</span>
                          {isSelected && <Check className="h-3 w-3 text-blue-600" />}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Phone Number Input */}
        <input
          id={id}
          type="tel"
          disabled={disabled}
          value={phoneNumber}
          onChange={(e) => onPhoneNumberChange(e.target.value)}
          placeholder={placeholder || defaultPlaceholder}
          required={required}
          className={`flex h-10 w-full rounded-r-lg bg-transparent px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
            error ? 'text-red-900' : ''
          }`}
        />
      </div>

      {/* Field-level error */}
      {error && <p className="text-xs text-red-600 font-medium">{error}</p>}

      {/* Duplicate warning notification */}
      {duplicateWarning && (
        <div className="flex items-start gap-1.5 p-2 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
          <span>{duplicateWarning}</span>
        </div>
      )}
    </div>
  );
};
