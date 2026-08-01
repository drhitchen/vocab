import { useState } from 'react';
import { GameMode, SessionConfig, SRSCard, Word } from '../types';

const MODES: { id: GameMode; label: string; description: string }[] = [
  { id: 'flashcard', label: 'Flashcards', description: 'Flip to reveal the definition' },
  { id: 'multiple-choice', label: 'Multiple Choice', description: 'Pick the correct definition' },
  { id: 'fill-in-blank', label: 'Fill in Blank', description: 'Type the word (first letter shown)' },
  { id: 'spelling', label: 'Spelling', description: 'Type the word from memory' },
  { id: 'match-pairs', label: 'Match Pairs', description: 'Match words to definitions' },
];

const SESSION_SIZES = [10, 20, 50] as const;

interface HomeProps {
  words: Word[];
  cards: Map<string, SRSCard>;
  onStartSession: (config: SessionConfig) => void;
}

export default function Home({ words, cards, onStartSession }: HomeProps) {
  const [mode, setMode] = useState<GameMode>('flashcard');
  const [sessionSize, setSessionSize] = useState<10 | 20 | 50>(20);

  const bucketCounts = [0, 1, 2, 3, 4].map(b =>
    [...cards.values()].filter(c => c.bucket === b).length
  );
  const unseenCount = words.length - cards.size;

  const availableCount = words.filter(w => {
    const card = cards.get(w.id);
    if (!card) return true; // new word
    return new Date(card.nextReview) <= new Date();
  }).length;

  const canStart = availableCount > 0;

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-10">
      {/* Progress Stats */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Progress
        </h2>
        <div className="grid grid-cols-5 gap-3">
          {['New', 'Learning', 'Familiar', 'Known', 'Mastered'].map((label, i) => (
            <div key={label} className="bg-slate-900 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-white">
                {i === 0 ? unseenCount + bucketCounts[0] : bucketCounts[i]}
              </div>
              <div className="text-xs text-slate-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
        <p className="text-sm text-slate-500 mt-3">
          {availableCount} word{availableCount !== 1 ? 's' : ''} due for review
        </p>
      </section>

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

      {/* Session Size */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Session Size
        </h2>
        <div className="flex gap-3">
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

      {/* Start Button */}
      <button
        onClick={() => onStartSession({ mode, sessionSize })}
        disabled={!canStart}
        className="w-full py-4 rounded-xl font-semibold text-lg transition-colors
          disabled:opacity-40 disabled:cursor-not-allowed
          bg-indigo-600 hover:bg-indigo-500 text-white"
      >
        {canStart ? 'Start Session' : 'No words due — check back later'}
      </button>
    </main>
  );
}
