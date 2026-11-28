'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  DuplicatePaymentRecordLike,
  isValidPaymentReference,
  PAYMENT_REFERENCE_ERROR,
  PAYMENT_REFERENCE_LABEL,
  PAYMENT_REFERENCE_PLACEHOLDER,
} from '@/lib/services/payment-entry-rules';

export interface PaymentReferenceFieldProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  numericOnly?: boolean;
  error?: string | null;
  successMessage?: string | null;
  duplicatePayments?: DuplicatePaymentRecordLike[];
  className?: string;
}

export function PaymentReferenceField({
  id,
  label = PAYMENT_REFERENCE_LABEL,
  value,
  onChange,
  required = true,
  disabled = false,
  numericOnly = true,
  error,
  successMessage,
  duplicatePayments = [],
  className = '',
}: PaymentReferenceFieldProps) {
  const trimmed = value.trim();
  const inlineFormatError =
    trimmed.length > 0 && !isValidPaymentReference(trimmed)
      ? PAYMENT_REFERENCE_ERROR
      : null;
  const displayError = error || inlineFormatError;
  const errorId = id ? `${id}-error` : undefined;

  return (
    <div className="w-full space-y-1">
      <label
        htmlFor={id}
        className="block text-xs font-semibold uppercase tracking-wider text-slate-600"
      >
        {label}
        {required ? ' *' : ''}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        maxLength={5}
        pattern="^[0-9]{5}$"
        autoComplete="off"
        required={required}
        disabled={disabled}
        placeholder={PAYMENT_REFERENCE_PLACEHOLDER}
        value={value}
        aria-invalid={!!displayError}
        aria-describedby={displayError && errorId ? errorId : undefined}
        onChange={(e) => {
          const raw = e.target.value;
          const next = numericOnly ? raw.replace(/[^0-9]/g, '').slice(0, 5) : raw.slice(0, 5);
          onChange(next);
        }}
        className={`flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 transition-colors ${
          displayError
            ? 'border-red-500 focus:ring-red-500'
            : successMessage
            ? 'border-emerald-500 focus:ring-emerald-500'
            : 'border-slate-300 focus:ring-[#0A6ED1] focus:border-transparent'
        } ${className}`}
      />
      {displayError && (
        <p id={errorId} role="alert" className="text-xs text-red-600 font-medium">
          {displayError}
        </p>
      )}
      {!displayError && successMessage && (
        <p role="status" className="text-xs text-emerald-700 font-medium flex items-center gap-1">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </p>
      )}
      {!displayError && duplicatePayments.length > 0 && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900"
        >
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
          <div>
            <span className="font-semibold">Potential Duplicate Payment Warning:</span>{' '}
            {duplicatePayments.length} existing payment
            {duplicatePayments.length > 1 ? 's' : ''} match reference{' '}
            <span className="font-mono font-semibold">{trimmed}</span>, amount{' '}
            <span className="font-semibold">
              ₹{Number(duplicatePayments[0].amount_paid ?? duplicatePayments[0].amount ?? 0).toLocaleString('en-IN')}
            </span>
            , and date{' '}
            <span className="font-semibold">
              {(duplicatePayments[0].payment_date || '').split('T')[0]}
            </span>
            {duplicatePayments[0].student_name ? ` (${duplicatePayments[0].student_name})` : ''}.
          </div>
        </div>
      )}
    </div>
  );
}
