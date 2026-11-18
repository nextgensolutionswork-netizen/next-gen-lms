'use client';

import * as React from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, AlertCircle, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DateRange,
  validateDateRange,
  formatDisplayDateRange,
} from '@/lib/utils/dashboard-metrics';
import { getTodayInInstituteTimezone, isValidYMD } from '@/lib/utils/schedule-date';

interface CustomDateRangePickerProps {
  isOpen: boolean;
  onClose: () => void;
  currentRange?: DateRange | null;
  onApply: (range: DateRange) => void;
  onClear: () => void;
  instituteTimezone?: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAYS_OF_WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function CustomDateRangePicker({
  isOpen,
  onClose,
  currentRange,
  onApply,
  onClear,
  instituteTimezone = 'Asia/Kolkata',
}: CustomDateRangePickerProps) {
  const todayStr = React.useMemo(() => getTodayInInstituteTimezone(new Date(), instituteTimezone), [instituteTimezone]);

  const [startDate, setStartDate] = React.useState<string>(currentRange?.startDate || todayStr);
  const [endDate, setEndDate] = React.useState<string>(currentRange?.endDate || todayStr);

  // Active viewing month & year in calendar grid
  const initialYear = currentRange?.startDate ? parseInt(currentRange.startDate.slice(0, 4), 10) : parseInt(todayStr.slice(0, 4), 10);
  const initialMonth = currentRange?.startDate ? parseInt(currentRange.startDate.slice(5, 7), 10) - 1 : parseInt(todayStr.slice(5, 7), 10) - 1;

  const [viewYear, setViewYear] = React.useState<number>(initialYear);
  const [viewMonth, setViewMonth] = React.useState<number>(initialMonth); // 0-indexed
  const [pickingTarget, setPickingTarget] = React.useState<'start' | 'end'>('start');

  // Sync internal state whenever currentRange or isOpen changes
  React.useEffect(() => {
    if (isOpen) {
      if (currentRange?.startDate && currentRange?.endDate) {
        setStartDate(currentRange.startDate);
        setEndDate(currentRange.endDate);
        const y = parseInt(currentRange.startDate.slice(0, 4), 10);
        const m = parseInt(currentRange.startDate.slice(5, 7), 10) - 1;
        setViewYear(y);
        setViewMonth(m);
      } else {
        setStartDate(todayStr);
        setEndDate(todayStr);
        setViewYear(parseInt(todayStr.slice(0, 4), 10));
        setViewMonth(parseInt(todayStr.slice(5, 7), 10) - 1);
      }
      setPickingTarget('start');
    }
  }, [isOpen, currentRange, todayStr]);

  // Validation
  const validation = React.useMemo(() => {
    return validateDateRange(startDate, endDate);
  }, [startDate, endDate]);

  if (!isOpen) return null;

  // Calendar grid math
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Day of week of the 1st of the month (Monday = 0, Sunday = 6)
  const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleDayClick = (day: number) => {
    const formattedMonth = String(viewMonth + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    const clickedDate = `${viewYear}-${formattedMonth}-${formattedDay}`;

    if (pickingTarget === 'start') {
      setStartDate(clickedDate);
      if (endDate && clickedDate > endDate) {
        setEndDate(clickedDate);
      }
      setPickingTarget('end');
    } else {
      if (clickedDate < startDate) {
        setStartDate(clickedDate);
        setEndDate(startDate);
      } else {
        setEndDate(clickedDate);
      }
      setPickingTarget('start');
    }
  };

  const handleApply = () => {
    if (validation.isValid) {
      onApply({ startDate, endDate });
      onClose();
    }
  };

  const handleClear = () => {
    onClear();
    onClose();
  };

  // Quick Preset Handlers
  const applyPreset = (preset: 'today' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'thisYear') => {
    const [y, m, d] = todayStr.split('-').map(Number);
    const nowRef = new Date(y, m - 1, d, 12, 0, 0);

    let start = todayStr;
    let end = todayStr;

    if (preset === 'today') {
      start = todayStr;
      end = todayStr;
    } else if (preset === 'last7') {
      const past = new Date(y, m - 1, d - 6, 12, 0, 0);
      start = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;
      end = todayStr;
    } else if (preset === 'last30') {
      const past = new Date(y, m - 1, d - 29, 12, 0, 0);
      start = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;
      end = todayStr;
    } else if (preset === 'thisMonth') {
      start = `${y}-${String(m).padStart(2, '0')}-01`;
      end = todayStr;
    } else if (preset === 'lastMonth') {
      const lastMonthDate = new Date(y, m - 2, 1, 12, 0, 0);
      const ly = lastMonthDate.getFullYear();
      const lm = lastMonthDate.getMonth() + 1;
      const lastDayOfLastMonth = new Date(ly, lm, 0).getDate();
      start = `${ly}-${String(lm).padStart(2, '0')}-01`;
      end = `${ly}-${String(lm).padStart(2, '0')}-${String(lastDayOfLastMonth).padStart(2, '0')}`;
    } else if (preset === 'thisYear') {
      start = `${y}-01-01`;
      end = todayStr;
    }

    setStartDate(start);
    setEndDate(end);
    setViewYear(parseInt(start.slice(0, 4), 10));
    setViewMonth(parseInt(start.slice(5, 7), 10) - 1);
  };

  // Generate Year Options (-5 to +5 years from current)
  const currentYearNum = parseInt(todayStr.slice(0, 4), 10);
  const yearOptions: number[] = [];
  for (let yr = currentYearNum - 5; yr <= currentYearNum + 5; yr++) {
    yearOptions.push(yr);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="custom-date-picker-title"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-blue-100 text-[#0A6ED1] rounded-lg">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 id="custom-date-picker-title" className="text-base font-bold text-slate-800">
                Select Custom Date Range
              </h3>
              <p className="text-xs text-slate-500">
                Inclusive date range in <span className="font-semibold text-slate-700">{instituteTimezone}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close custom calendar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Quick Preset Buttons */}
          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Quick Presets
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset('today')}
                className="px-2.5 py-1 text-xs rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors font-medium"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => applyPreset('last7')}
                className="px-2.5 py-1 text-xs rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors font-medium"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => applyPreset('last30')}
                className="px-2.5 py-1 text-xs rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors font-medium"
              >
                Last 30 Days
              </button>
              <button
                type="button"
                onClick={() => applyPreset('thisMonth')}
                className="px-2.5 py-1 text-xs rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors font-medium"
              >
                This Month
              </button>
              <button
                type="button"
                onClick={() => applyPreset('lastMonth')}
                className="px-2.5 py-1 text-xs rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors font-medium"
              >
                Last Month
              </button>
              <button
                type="button"
                onClick={() => applyPreset('thisYear')}
                className="px-2.5 py-1 text-xs rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors font-medium"
              >
                This Year
              </button>
            </div>
          </div>

          {/* From Date & To Date Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                pickingTarget === 'start'
                  ? 'border-[#0A6ED1] bg-blue-50/40 ring-1 ring-[#0A6ED1]'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
              onClick={() => setPickingTarget('start')}
            >
              <label htmlFor="from-date-input" className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                From Date (Inclusive)
              </label>
              <input
                id="from-date-input"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (isValidYMD(e.target.value)) {
                    setViewYear(parseInt(e.target.value.slice(0, 4), 10));
                    setViewMonth(parseInt(e.target.value.slice(5, 7), 10) - 1);
                  }
                }}
                className="w-full text-sm font-semibold text-slate-800 bg-transparent focus:outline-none"
              />
            </div>

            <div
              className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                pickingTarget === 'end'
                  ? 'border-[#0A6ED1] bg-blue-50/40 ring-1 ring-[#0A6ED1]'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
              onClick={() => setPickingTarget('end')}
            >
              <label htmlFor="to-date-input" className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                To Date (Inclusive)
              </label>
              <input
                id="to-date-input"
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  if (isValidYMD(e.target.value)) {
                    setViewYear(parseInt(e.target.value.slice(0, 4), 10));
                    setViewMonth(parseInt(e.target.value.slice(5, 7), 10) - 1);
                  }
                }}
                className="w-full text-sm font-semibold text-slate-800 bg-transparent focus:outline-none"
              />
            </div>
          </div>

          {/* Interactive Month Calendar View */}
          <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200">
            {/* Month & Year Navigation Header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center space-x-1.5">
                <select
                  value={viewMonth}
                  onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                  aria-label="Select month"
                  className="bg-white border border-slate-200 rounded-md px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
                >
                  {MONTH_NAMES.map((mName, idx) => (
                    <option key={idx} value={idx}>
                      {mName}
                    </option>
                  ))}
                </select>

                <select
                  value={viewYear}
                  onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                  aria-label="Select year"
                  className="bg-white border border-slate-200 rounded-md px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0A6ED1]"
                >
                  {yearOptions.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  aria-label="Previous month"
                  className="p-1 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  aria-label="Next month"
                  className="p-1 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-200/80 transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Calendar Days Header */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {DAYS_OF_WEEK.map((d) => (
                <span key={d} className="text-[11px] font-bold text-slate-400">
                  {d}
                </span>
              ))}
            </div>

            {/* Calendar Days Grid */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {/* Previous month filler days */}
              {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
                <div
                  key={`prev-${idx}`}
                  className="h-8 flex items-center justify-center text-xs text-slate-300 cursor-default select-none"
                >
                  {prevMonthDays - firstDayOfWeek + idx + 1}
                </div>
              ))}

              {/* Current month days */}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNum = idx + 1;
                const formattedM = String(viewMonth + 1).padStart(2, '0');
                const formattedD = String(dayNum).padStart(2, '0');
                const thisDateStr = `${viewYear}-${formattedM}-${formattedD}`;

                const isStart = startDate === thisDateStr;
                const isEnd = endDate === thisDateStr;
                const isBetween =
                  startDate &&
                  endDate &&
                  thisDateStr > startDate &&
                  thisDateStr < endDate;
                const isToday = thisDateStr === todayStr;

                let cellStyles = 'text-slate-700 hover:bg-blue-100 hover:text-[#0A6ED1]';
                if (isStart || isEnd) {
                  cellStyles = 'bg-[#0A6ED1] text-white font-bold shadow-xs hover:bg-[#0854A0]';
                } else if (isBetween) {
                  cellStyles = 'bg-blue-100/70 text-[#0A6ED1] font-semibold';
                }

                return (
                  <button
                    key={dayNum}
                    type="button"
                    onClick={() => handleDayClick(dayNum)}
                    className={`h-8 w-full rounded-md text-xs font-medium transition-colors flex items-center justify-center relative ${cellStyles}`}
                  >
                    <span>{dayNum}</span>
                    {isToday && !isStart && !isEnd && (
                      <span className="absolute bottom-1 w-1 h-1 bg-[#0A6ED1] rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Validation or Error Message */}
          {!validation.isValid && (
            <div className="flex items-center space-x-2 p-2.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="font-medium">{validation.error}</span>
            </div>
          )}

          {/* Visible Selected Date Range Preview */}
          {validation.isValid && (
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] text-emerald-800 font-semibold block uppercase tracking-wider">
                  Active Selected Range:
                </span>
                <span className="font-bold text-emerald-950 text-sm">
                  {formatDisplayDateRange(startDate, endDate)}
                </span>
              </div>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                Inclusive
              </span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Clear Filter
          </button>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <Button
              variant="sap"
              size="sm"
              onClick={handleApply}
              disabled={!validation.isValid}
              className="px-4 py-1.5 text-xs font-semibold shadow-xs"
            >
              Apply Filter
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
