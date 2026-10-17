import { useEffect, useRef, useState } from 'react';
import { SRSCard, Word } from '../types';
import { useAppearance } from '../appearance/appearance';
import EntryCard from './EntryCard';
import { SearchIcon } from './icons';

interface BrowseProps {
  words: Word[];
  cards: Map<string, SRSCard>;
  onStudySelected: (words: Word[]) => void;
}

const PAGE_SIZE = 50;

export default function Browse({ words, cards, onStudySelected }: BrowseProps) {
  const { design } = useAppearance();
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
    <main className="screen screen-browse">
      {design === 'focus' && (
        <header className="page-head">
          <h1 className="page-title">Browse</h1>
          <p className="page-sub">Search every word, review its status, or build a custom set.</p>
        </header>
      )}

      {/* Search bar */}
      <div className="searchbar">
        <SearchIcon />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Search ${words.length.toLocaleString()} words…`}
          aria-label="Search words"
        />
        {query.length > 0 && (
          <button type="button" className="clear" onClick={() => setQuery('')} aria-label="Clear search">
            ✕
          </button>
        )}
      </div>

      {/* Results count + pagination */}
      <div className="toolbar">
        <div className="toolbar-left">
          <span className="count"><b>{filtered.length.toLocaleString()}</b> results</span>
          {filtered.length > 0 && (
            <button type="button" className="link" onClick={handleSelectAll}>
              Select all
            </button>
          )}
        </div>
        {selectedIds.size > 0 ? (
          <div className="toolbar-actions">
            <span className="selected-count">✓ {selectedIds.size} selected</span>
            <button type="button" className="btn-primary btn-small" onClick={handleStudySelected}>
              Study selected →
            </button>
            <button type="button" className="link" onClick={() => setSelectedIds(new Set())}>
              Clear ✕
            </button>
          </div>
        ) : (
          <div className="pager">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={clampedPage === 1}
            >
              ‹ prev
            </button>
            <span>{clampedPage} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={clampedPage === totalPages}
            >
              next ›
            </button>
          </div>
        )}
      </div>

      {/* Grid */}
      <div className="entries">
        <div className="cols thead">
          <span />
          <span />
          <span>Word</span>
          <span className="pos-col">POS</span>
          <span className="type">Type</span>
          <span className="def-col">Definition</span>
          <span className="bk">Status</span>
        </div>

        {pageWords.length === 0 ? (
          <div className="empty">
            <p>Not in vocabulary. Add it:</p>
            <code>node scripts/add-word.js --add {debouncedQuery}</code>
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
    </main>
  );
}
