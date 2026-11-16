'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import { AuthorizedBankAccount } from '@/types';
import { formatBankAccountPresetLabel, maskSensitiveAccountNumber } from '@/lib/utils/bank-autofill';
import { Search, ChevronDown, Check, Building2, Edit3, X, ShieldCheck, Clock } from 'lucide-react';

export interface BankAccountSearchableDropdownProps {
  accounts: AuthorizedBankAccount[];
  selectedId: string;
  onSelect: (account: AuthorizedBankAccount | 'custom') => void;
  mode?: 'fee-collection' | 'super-admin';
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  id?: string;
}

export function BankAccountSearchableDropdown({
  accounts,
  selectedId,
  onSelect,
  mode = 'fee-collection',
  placeholder = 'Search & select bank account preset...',
  disabled = false,
  className = '',
  title = 'Select Authorized Bank Account Preset',
  id: customId,
}: BankAccountSearchableDropdownProps) {
  const generatedId = useId();
  const dropdownId = customId || generatedId;
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter accounts based on mode
  const eligibleAccounts = React.useMemo(() => {
    return accounts.filter((acc) => {
      // Exclude archived accounts
      if (acc.is_archived) return false;
      // In fee collection mode, strictly require verified & active
      if (mode === 'fee-collection') {
        const isPending = acc.is_verified === false || acc.verification_status === 'pending';
        return acc.is_active && !isPending;
      }
      // In super-admin mode, show all 20 accounts including pending verification
      return true;
    });
  }, [accounts, mode]);

  // Filter based on search query
  const filteredAccounts = React.useMemo(() => {
    if (!searchQuery.trim()) return eligibleAccounts;
    const q = searchQuery.toLowerCase().trim();
    return eligibleAccounts.filter((acc) => {
      const holder = (acc.account_holder_name || '').toLowerCase();
      const bank = (acc.bank_name || '').toLowerCase();
      const rawNum = (acc.account_number || '').replace(/\s+/g, '');
      const last4 = rawNum.slice(-4);
      const upi = (acc.upi_id || '').toLowerCase();
      return (
        holder.includes(q) ||
        bank.includes(q) ||
        last4.includes(q) ||
        rawNum.includes(q) ||
        upi.includes(q)
      );
    });
  }, [eligibleAccounts, searchQuery]);

  // Find currently selected account
  const selectedAccount = React.useMemo(() => {
    if (selectedId === 'custom') return null;
    return accounts.find((a) => a.id === selectedId) || null;
  }, [accounts, selectedId]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Handle keyboard events (ESC to close)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleSelectAccount = (acc: AuthorizedBankAccount) => {
    onSelect(acc);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleSelectCustom = () => {
    onSelect('custom');
    setIsOpen(false);
    setSearchQuery('');
  };

  // Label to display in trigger button
  const triggerDisplayLabel = selectedId === 'custom'
    ? 'Custom Bank Account (Manual Entry)'
    : selectedAccount
    ? formatBankAccountPresetLabel(selectedAccount)
    : placeholder;

  return (
    <div
      ref={containerRef}
      className={`relative inline-block w-full text-left font-sans ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Hidden standard select for full accessibility, automated tests, and form compatibility */}
      <select
        aria-hidden="true"
        tabIndex={-1}
        id={dropdownId}
        name="bank_account_preset"
        title={title}
        value={selectedId}
        onChange={(e) => {
          const val = e.target.value;
          if (val === 'custom') {
            handleSelectCustom();
          } else {
            const found = accounts.find((a) => a.id === val);
            if (found) handleSelectAccount(found);
          }
        }}
        className="sr-only pointer-events-none absolute opacity-0 -z-10"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {eligibleAccounts.map((acc) => (
          <option key={acc.id} value={acc.id}>
            {formatBankAccountPresetLabel(acc)}
          </option>
        ))}
        <option value="custom">Custom Bank Account</option>
      </select>

      {/* Main Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-lg border bg-white shadow-xs transition-colors duration-150 text-left focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 ${
          disabled
            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
            : isOpen
            ? 'border-blue-600 ring-2 ring-blue-500/10'
            : selectedId
            ? 'border-slate-300 text-slate-800 hover:border-slate-400'
            : 'border-slate-300 text-slate-500 hover:border-slate-400'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {selectedId === 'custom' ? (
            <Edit3 className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
          ) : (
            <Building2 className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          )}
          <span className="truncate font-medium text-slate-800">
            {triggerDisplayLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {mode === 'super-admin' && selectedAccount && (
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${
                selectedAccount.is_verified
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {selectedAccount.is_verified ? 'Verified' : 'Pending'}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-blue-600' : ''
            }`}
          />
        </div>
      </button>

      {/* Floating Popover Menu */}
      {isOpen && (
        <div
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100"
          style={{ minWidth: '300px' }}
        >
          {/* Search Header */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/80 sticky top-0 z-10 space-y-1.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search holder, bank, or last 4 digits..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
              <span>
                {filteredAccounts.length} of {eligibleAccounts.length} presets available
              </span>
              {mode === 'super-admin' && (
                <span className="text-indigo-600 font-semibold">Super Admin View (All 20)</span>
              )}
            </div>
          </div>

          {/* Scrollable Account Options List */}
          <div className="max-h-60 sm:max-h-64 overflow-y-auto overscroll-contain divide-y divide-slate-100">
            {/* Custom Bank Account Option (Accessible at top) */}
            <div
              role="option"
              aria-selected={selectedId === 'custom'}
              onClick={handleSelectCustom}
              className={`p-2.5 cursor-pointer flex items-center justify-between gap-3 text-xs transition-colors hover:bg-slate-50 ${
                selectedId === 'custom' ? 'bg-blue-50/70 border-l-4 border-l-blue-600' : ''
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0 border border-indigo-100">
                  <Edit3 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="font-semibold text-slate-900 text-xs">
                    Custom Bank Account
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Enter bank, holder name & account number manually
                  </div>
                </div>
              </div>
              {selectedId === 'custom' && (
                <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
              )}
            </div>

            {/* List of Filtered Reference Accounts */}
            {filteredAccounts.map((acc) => {
              const isSelected = acc.id === selectedId;
              const rawNum = (acc.account_number || '').replace(/\s+/g, '');
              const last4 = rawNum.slice(-4);
              const isPending = acc.is_verified === false || acc.verification_status === 'pending';

              return (
                <div
                  key={acc.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelectAccount(acc)}
                  className={`p-2.5 cursor-pointer flex items-center justify-between gap-3 text-xs transition-colors hover:bg-blue-50/50 ${
                    isSelected ? 'bg-blue-50/80 border-l-4 border-l-blue-600' : ''
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0 mt-0.5 border border-slate-200">
                      <Building2 className="w-3.5 h-3.5 text-slate-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-800 text-xs truncate">
                          {acc.account_holder_name}
                        </span>
                        {mode === 'super-admin' && (
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase tracking-wider flex items-center gap-0.5 ${
                              acc.is_verified
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {acc.is_verified ? (
                              <>
                                <ShieldCheck className="w-2.5 h-2.5" /> Verified
                              </>
                            ) : (
                              <>
                                <Clock className="w-2.5 h-2.5" /> Pending
                              </>
                            )}
                          </span>
                        )}
                        {acc.upi_id && (
                          <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-1.5 font-mono">
                            UPI: {acc.upi_id}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-slate-500 text-[11px]">
                        <span>{acc.bank_name}</span>
                        <span className="text-slate-300">•</span>
                        <span className="font-mono text-slate-600 bg-slate-100 px-1 py-0.2 rounded text-[10px]">
                          XXXX{last4}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isSelected && (
                    <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                  )}
                </div>
              );
            })}

            {/* Zero State */}
            {filteredAccounts.length === 0 && (
              <div className="p-6 text-center space-y-2">
                <p className="text-xs text-slate-500">
                  No bank accounts match <span className="font-semibold text-slate-700">"{searchQuery}"</span>
                </p>
                <button
                  type="button"
                  onClick={handleSelectCustom}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 underline"
                >
                  Use Custom Bank Account instead
                </button>
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
            <span>Scroll or type to search all 20 presets</span>
            <span className="font-mono">Esc to close</span>
          </div>
        </div>
      )}
    </div>
  );
}
