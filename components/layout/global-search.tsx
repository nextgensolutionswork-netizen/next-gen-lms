'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import type { SearchResult } from '@/lib/services/global-search';

export function GlobalSearch() {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [message, setMessage] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(-1);
  const request = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => request.current?.abort(), []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (selectedIndex >= 0 && results[selectedIndex]) {
      window.location.href = results[selectedIndex].href;
      setOpen(false);
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setResults([]);
    setSelectedIndex(-1);
    setOpen(true);
    const trimmed = query.trim();
    if (!trimmed) { setMessage('Enter a name, code, email, or phone number.'); return; }
    setMessage('Searching…');
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Search is unavailable. Please try again.');
      if (controller.signal.aborted) return;
      const res: SearchResult[] = data.results || [];
      setResults(res);
      setSelectedIndex(-1);
      setMessage(res.length ? `${res.length} matching records (up to 5 per category).` : 'No matching records found.');
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Search is unavailable. Please try again.');
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      request.current?.abort();
      setOpen(false);
      setSelectedIndex(-1);
    } else if (event.key === 'ArrowDown') {
      if (open && results.length > 0) {
        event.preventDefault();
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
      }
    } else if (event.key === 'ArrowUp') {
      if (open && results.length > 0) {
        event.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
      }
    }
  }

  return (
    <form
      role="search"
      onSubmit={submit}
      className="relative min-w-0 flex-1 max-w-96"
      onKeyDown={handleKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setSelectedIndex(-1);
        }
      }}
    >
      <input
        aria-label="Global search"
        aria-controls="global-search-results"
        aria-expanded={open}
        type="search"
        maxLength={100}
        value={query}
        onChange={(event) => {
          request.current?.abort();
          setQuery(event.target.value);
          setResults([]);
          setSelectedIndex(-1);
          setOpen(false);
        }}
        placeholder="Search students, admissions, leads, receipts, batches..."
        className="w-full pl-3 pr-10 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0A6ED1]"
      />
      <button type="submit" aria-label="Search" className="absolute right-1 top-0.5 p-1.5 text-slate-600 hover:text-slate-900 transition-colors">
        <Search className="h-4 w-4" />
      </button>
      {open && (
        <div
          id="global-search-results"
          className="absolute left-0 right-0 mt-2 rounded-lg bg-white shadow-xl border border-slate-200 max-h-96 overflow-y-auto z-50 text-xs divide-y divide-slate-100"
        >
          <p role="status" className="p-3 text-slate-600 font-medium">
            {message}
          </p>
          {results.length > 0 && (
            <ul>
              {results.map((result, idx) => (
                <li key={`${result.kind}-${result.id}`}>
                  <a
                    href={result.href}
                    onClick={() => setOpen(false)}
                    className={`block p-3 transition-colors ${
                      selectedIndex === idx ? 'bg-blue-100 text-blue-900' : 'hover:bg-blue-50 focus:bg-blue-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">{result.title}</span>
                      <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-slate-100 text-slate-700">
                        {result.kind}
                      </span>
                    </div>
                    <span className="block text-slate-500 mt-0.5">
                      {result.kind} · <span className="font-mono text-slate-600">{result.reference}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
