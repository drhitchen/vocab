import { useEffect, useRef, useState } from 'react';
import { SRSCard, Word } from '../types';
import EntryCard from './EntryCard';

interface BrowseProps {
  words: Word[];
  cards: Map<string, SRSCard>;
  onStudySelected: (words: Word[]) => void;
}

const PAGE_SIZE = 50;

export default function Browse({ words, cards, onStudySelected }: BrowseProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounce query 200ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  // Reset page when search changes
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  const filtered = debouncedQuery.trim() === ''
    ? words
    : (() => {
        const q = debouncedQuery.toLowerCase();
        return words.filter(w =>
          w.word.toLowerCase().includes(q) ||
          w.definitions.some(d => d !== undefined && d.toLowerCase().includes(q))
        );
      })();

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageWords = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  function handleToggle(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  function handleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleSelectAll() {
    setSelectedIds(new Set(filtered.map(w => w.id)));
  }

  function handleStudySelected() {
    const selected = words.filter(w => selectedIds.has(w.id));
    onStudySelected(selected);
    setSelectedIds(new Set());
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      {/* Search bar */}
      <div className="relative mb-4">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Search ${words.length} words…`}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-500"
        />
        {query.length > 0 && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            onClick={() => setQuery('')}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* Results count + pagination */}
      <div className="flex items-center justify-between mb-3 text-sm text-slate-400">
        <div className="flex items-center gap-3">
          <span>Results: {filtered.length}</span>
          {filtered.length > 0 && (
            <button
              className="hover:text-slate-200 text-slate-500"
              onClick={handleSelectAll}
            >
              Select all
            </button>
          )}
        </div>
        {selectedIds.size > 0 ? (
          <div className="flex items-center gap-3">
            <span className="text-indigo-300">✓ {selectedIds.size} selected</span>
            <button
              className="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
              onClick={handleStudySelected}
            >
              Study selected →
            </button>
            <button
              className="hover:text-slate-200"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear ✕
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              className="hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={clampedPage === 1}
            >
              ‹ prev
            </button>
            <span className="text-slate-300">
              {clampedPage} / {totalPages}
            </span>
            <button
              className="hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={clampedPage === totalPages}
            >
              next ›
            </button>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="border border-slate-800 rounded-lg overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1.5rem_1.5rem_1fr_auto_auto_2fr] gap-3 px-4 py-2 bg-slate-800 text-xs text-slate-400 uppercase tracking-wide">
          <span />
          <span />
          <span>Word</span>
          <span>POS</span>
          <span>Type</span>
          <span>Definition</span>
        </div>

        {pageWords.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-400">
            <p>Not in vocabulary — add it:</p>
            <code className="mt-2 block text-slate-300 text-sm bg-slate-800 rounded px-3 py-1 inline-block">
              node scripts/add-word.js {debouncedQuery}
            </code>
          </div>
        ) : (
          pageWords.map(w => (
            <EntryCard
              key={w.id}
              word={w}
              card={cards.get(w.id)}
              isExpanded={expandedId === w.id}
              isSelected={selectedIds.has(w.id)}
              onToggle={() => handleToggle(w.id)}
              onSelect={() => handleSelect(w.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
