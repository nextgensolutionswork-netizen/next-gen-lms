'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import { EligibleCounsellorOption } from '@/lib/services/counsellor-service';
import { Search, ChevronDown, Check, UserCheck, X } from 'lucide-react';

export interface CounsellorSearchableDropdownProps {
  counsellors: EligibleCounsellorOption[];
  selectedId: string;
  onSelect: (counsellor: EligibleCounsellorOption) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  error?: string;
  id?: string;
}

export function CounsellorSearchableDropdown({
  counsellors,
  selectedId,
  onSelect,
  label = 'Counsellor Name *',
  placeholder = 'Search & select counsellor...',
  disabled = false,
  required = true,
  className = '',
  error,
  id: customId,
}: CounsellorSearchableDropdownProps) {
  const generatedId = useId();
  const dropdownId = customId || generatedId;
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Selected counsellor resolution
  const selectedCounsellor = React.useMemo(() => {
    return counsellors.find((c) => c.id === selectedId);
  }, [counsellors, selectedId]);

  // Filter based on search query
  const filteredCounsellors = React.useMemo(() => {
    if (!searchQuery.trim()) return counsellors;
    const q = searchQuery.toLowerCase().trim();
    return counsellors.filter((c) => {
      const name = (c.full_name || '').toLowerCase();
      const email = (c.email || '').toLowerCase();
      const role = (c.role || '').toLowerCase();
      return name.includes(q) || email.includes(q) || role.includes(q);
    });
  }, [counsellors, searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleSelect = (c: EligibleCounsellorOption) => {
    onSelect(c);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label
          htmlFor={dropdownId}
          className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1"
        >
          {label}
        </label>
      )}

      {/* Hidden native input for form validation */}
      <input
        type="text"
        id={dropdownId}
        value={selectedId || ''}
        required={required}
        onChange={() => {}}
        tabIndex={-1}
        className="sr-only"
        aria-hidden="true"
      />

      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full text-left text-xs bg-white border rounded-lg px-3 py-2 flex items-center justify-between transition-colors shadow-xs ${
          error
            ? 'border-rose-400 focus:ring-rose-200'
            : isOpen
            ? 'border-[#0A6ED1] ring-2 ring-blue-100'
            : 'border-slate-300 hover:border-slate-400'
        } ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-50' : 'cursor-pointer'}`}
      >
        <div className="flex items-center space-x-2 truncate min-w-0">
          <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
          {selectedCounsellor ? (
            <div className="truncate">
              <span className="font-semibold text-slate-900">{selectedCounsellor.full_name}</span>
              <span className="text-[10px] text-slate-400 ml-1.5 font-normal">
                ({selectedCounsellor.role === 'counsellor_lead' ? 'Counsellor Lead' : 'Counsellor'})
              </span>
            </div>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {error && <p role="alert" className="mt-1 text-xs text-rose-600">{error}</p>}

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden animate-in fade-in-50 duration-100">
          {/* Search Box */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/70">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search counsellor by name, role or email..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-[#0A6ED1] text-slate-800 placeholder-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Counsellors List */}
          <div className="max-h-56 overflow-y-auto p-1 divide-y divide-slate-50">
            {filteredCounsellors.length === 0 ? (
              <div className="p-3 text-center text-xs text-slate-500">
                No active counsellors match &quot;{searchQuery}&quot;
              </div>
            ) : (
              filteredCounsellors.map((c) => {
                const isSelected = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelect(c)}
                    className={`w-full text-left px-2.5 py-2 rounded-md flex items-center justify-between text-xs transition-colors ${
                      isSelected
                        ? 'bg-blue-50 text-[#0A6ED1] font-semibold'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-semibold truncate">{c.full_name}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-medium ${
                            c.role === 'counsellor_lead'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {c.role === 'counsellor_lead' ? 'Lead' : 'Counsellor'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5">{c.email}</p>
                    </div>
                    {isSelected && <Check className="h-3.5 w-3.5 text-[#0A6ED1] shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
