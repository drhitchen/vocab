import { useState } from 'react';
import { Bucket, GameMode, SessionConfig, SRSCard, Word } from '../types';

const MODES: { id: GameMode; label: string; description: string }[] = [
  { id: 'flashcard', label: 'Flashcards', description: 'Flip to reveal the definition' },
  { id: 'multiple-choice', label: 'Multiple Choice', description: 'Pick the correct definition' },
  { id: 'fill-in-blank', label: 'Fill in Blank', description: 'Type the word (first letter shown)' },
  { id: 'match-pairs', label: 'Match Pairs', description: 'Match words to definitions' },
];

const BUCKET_LABELS = ['New', 'Learning', 'Familiar', 'Known', 'Mastered'] as const;

const SESSION_SIZES = [1, 5, 10, 20, 50] as const;

interface HomeProps {
  words: Word[];
  cards: Map<string, SRSCard>;
  lockedWords: Word[] | null;
  onStartSession: (config: SessionConfig) => void;
  onClearLockedWords: () => void;
  onResetProgress: () => void;
}

export default function Home({ words, cards, lockedWords, onStartSession, onClearLockedWords, onResetProgress }: HomeProps) {
  const [mode, setMode] = useState<GameMode>('flashcard');
  const [sessionSize, setSessionSize] = useState<1 | 5 | 10 | 20 | 50>(1);
  const [selectedBuckets, setSelectedBuckets] = useState<Set<number>>(new Set());
  const [confirmReset, setConfirmReset] = useState(false);

  const bucketCounts = [0, 1, 2, 3, 4].map(b =>
    [...cards.values()].filter(c => c.bucket === b).length
  );
  const unseenCount = words.length - cards.size;
  // index 0 for display = unseen + bucket-0 cards
  const displayCounts = bucketCounts.map((c, i) => i === 0 ? unseenCount + c : c);

  const availableCount = words.filter(w => {
    const card = cards.get(w.id);
    if (!card) return true;
    return new Date(card.nextReview) <= new Date();
  }).length;

  const selectedBucketWordCount = selectedBuckets.size > 0
    ? words.filter(w => {
        const card = cards.get(w.id);
        if (!card) return selectedBuckets.has(0);
        return selectedBuckets.has(card.bucket);
      }).length
    : 0;

  const canStart = lockedWords !== null
    || (selectedBuckets.size > 0 ? selectedBucketWordCount > 0 : availableCount > 0);

  function toggleBucket(i: number) {
    if (lockedWords) return; // locked set active, bucket selection is dormant
    setSelectedBuckets(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  function handleStart() {
    onStartSession({
      mode,
      sessionSize,
      buckets: selectedBuckets.size > 0 ? ([...selectedBuckets] as Bucket[]) : undefined,
    });
  }

  const startLabel = (() => {
    if (!canStart) return 'No words available';
    if (lockedWords) return `Study ${lockedWords.length} word${lockedWords.length !== 1 ? 's' : ''} →`;
    if (selectedBuckets.size > 0) return `Select ${sessionSize} from ${[...selectedBuckets].map(b => BUCKET_LABELS[b]).join(' + ')} →`;
    return `Select ${sessionSize} word${sessionSize !== 1 ? 's' : ''} & start →`;
  })();

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-10">
      {/* Progress Stats — click to filter by bucket */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Progress</h2>
          {selectedBuckets.size > 0 && !lockedWords && (
            <button
              onClick={() => setSelectedBuckets(new Set())}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear filter ✕
            </button>
          )}
        </div>
        <div className="grid grid-cols-5 gap-3">
          {BUCKET_LABELS.map((label, i) => {
            const count = displayCounts[i];
            const isSelected = selectedBuckets.has(i);
            return (
              <button
                key={label}
                onClick={() => toggleBucket(i)}
                disabled={!!lockedWords}
                className={`rounded-lg p-4 text-center transition-colors border ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-950'
                    : 'border-transparent bg-slate-900 hover:border-slate-600 disabled:hover:border-transparent'
                }`}
              >
                <div className="text-2xl font-bold text-white">{count}</div>
                <div className={`text-xs mt-1 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`}>{label}</div>
              </button>
            );
          })}
        </div>
        <p className="text-sm text-slate-500 mt-3">
          {selectedBuckets.size > 0 && !lockedWords
            ? `${selectedBucketWordCount} word${selectedBucketWordCount !== 1 ? 's' : ''} in selected bucket${selectedBuckets.size !== 1 ? 's' : ''}`
            : `${availableCount} word${availableCount !== 1 ? 's' : ''} due for review`}
        </p>
      </section>

      {/* Locked word set OR session size picker */}
      {lockedWords !== null ? (
        <section>
          <div className="flex items-center justify-between rounded-xl border border-indigo-800 bg-indigo-950 px-5 py-4">
            <div>
              <span className="text-white font-semibold">{lockedWords.length} word{lockedWords.length !== 1 ? 's' : ''} selected</span>
              <span className="text-indigo-400 text-sm ml-2">· switch modes freely</span>
            </div>
            <button
              onClick={onClearLockedWords}
              className="text-sm text-indigo-400 hover:text-white transition-colors"
            >
              New set ↺
            </button>
          </div>
        </section>
      ) : (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Session Size
          </h2>
          <div className="flex gap-3 flex-wrap">
            {SESSION_SIZES.map(s => (
              <button
                key={s}
                onClick={() => setSessionSize(s)}
                className={`px-6 py-2 rounded-lg border font-medium transition-colors ${
                  sessionSize === s
                    ? 'border-indigo-500 bg-indigo-950 text-white'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-600'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Mode Selector */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Mode
        </h2>
        <div className="grid grid-cols-1 gap-2">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                mode === m.id
                  ? 'border-indigo-500 bg-indigo-950 text-white'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600'
              }`}
            >
              <span className="font-medium">{m.label}</span>
              <span className="text-sm text-slate-500 ml-3">{m.description}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Start Button */}
      <button
        onClick={handleStart}
        disabled={!canStart}
        className="w-full py-4 rounded-xl font-semibold text-lg transition-colors
          disabled:opacity-40 disabled:cursor-not-allowed
          bg-indigo-600 hover:bg-indigo-500 text-white"
      >
        {startLabel}
      </button>

      {/* Reset progress */}
      <div className="flex justify-center pb-4">
        {confirmReset ? (
          <div className="flex items-center gap-4">
            <span className="text-slate-400 text-sm">Reset all progress?</span>
            <button
              onClick={() => { onResetProgress(); setConfirmReset(false); setSelectedBuckets(new Set()); }}
              className="text-red-400 text-sm hover:text-red-300 transition-colors font-medium"
            >
              Yes, reset
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="text-slate-500 text-sm hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="text-slate-700 text-xs hover:text-slate-500 transition-colors"
          >
            Reset all progress
          </button>
        )}
      </div>
    </main>
  );
}
