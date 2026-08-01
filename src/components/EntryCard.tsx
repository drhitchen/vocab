import { useState } from 'react';
import { SRSCard, Word } from '../types';

interface EntryCardProps {
  word: Word;
  card: SRSCard | undefined;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
}

const BUCKET_LABELS = ['New', 'Learning', 'Familiar', 'Known', 'Mastered'] as const;

const BUCKET_COLORS: Record<number, string> = {
  0: 'text-slate-400',
  1: 'text-amber-400',
  2: 'text-blue-400',
  3: 'text-teal-400',
  4: 'text-emerald-400',
};

const TYPE_BADGE: Record<string, string> = {
  common: 'bg-slate-700 text-slate-200',
  proper: 'bg-violet-900 text-violet-200',
  phrase: 'bg-sky-900 text-sky-200',
  prefix: 'bg-rose-900 text-rose-200',
};

export default function EntryCard({ word, card, isExpanded, isSelected, onToggle, onSelect }: EntryCardProps) {
  const [showJson, setShowJson] = useState(false);

  const truncDef = word.definitions[0].length > 80
    ? word.definitions[0].slice(0, 77) + '…'
    : word.definitions[0];

  const bucket = card?.bucket ?? 0;
  const bucketLabel = BUCKET_LABELS[bucket];
  const bucketColor = BUCKET_COLORS[bucket];
  const typeBadge = TYPE_BADGE[word.type] ?? 'bg-slate-700 text-slate-200';

  return (
    <div className={`border-b border-slate-800${isSelected ? ' bg-indigo-950/30' : ''}`}>
      {/* Collapsed row */}
      <div
        className="grid grid-cols-[1.5rem_1.5rem_1fr_auto_auto_2fr] items-center gap-3 px-4 py-2.5 hover:bg-slate-900 cursor-pointer select-none"
        onClick={onToggle}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          onClick={e => e.stopPropagation()}
          className="accent-indigo-500 cursor-pointer"
        />
        <span className="text-slate-500 text-xs">{isExpanded ? '▼' : '▶'}</span>
        <span className="font-semibold text-slate-100 truncate">{word.word}</span>
        <span className="text-slate-400 text-xs">{word.partOfSpeech}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${typeBadge}`}>
          {word.type}
        </span>
        <span className="text-slate-400 text-sm truncate">{truncDef}</span>
      </div>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="px-10 pb-4 pt-1 bg-slate-900 text-sm space-y-3">
          {/* External reference */}
          <div>
            <a
              href={`https://www.merriam-webster.com/dictionary/${encodeURIComponent(word.word)}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-xs text-slate-400 hover:text-sky-400 underline underline-offset-2"
            >
              ↗ Merriam-Webster
            </a>
          </div>

          {/* Definitions */}
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Definitions</p>
            <ol className="list-decimal list-inside space-y-1">
              {word.definitions.map((def, i) => (
                <li key={i} className="text-slate-200">{def}</li>
              ))}
            </ol>
          </div>

          {/* Examples */}
          {word.examples.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Examples</p>
              <ul className="space-y-1">
                {word.examples.map((ex, i) => (
                  <li key={i} className="text-slate-300 italic">"{ex}"</li>
                ))}
              </ul>
            </div>
          )}

          {/* SRS stats */}
          <div className="flex items-center gap-4">
            <span className={`font-medium ${bucketColor}`}>{bucketLabel}</span>
            {card && (
              <>
                <span className="text-slate-500">
                  Next review: <span className="text-slate-300">{new Date(card.nextReview).toLocaleDateString()}</span>
                </span>
                <span className="text-slate-500">
                  Attempts: <span className="text-slate-300">{card.correctAttempts}/{card.totalAttempts}</span>
                </span>
              </>
            )}
          </div>

          {/* JSON toggle */}
          <div>
            <button
              className="text-xs px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 font-mono"
              onClick={(e) => { e.stopPropagation(); setShowJson(v => !v); }}
            >
              {showJson ? '{ hide }' : '{ }'}
            </button>
            {showJson && (
              <pre className="mt-2 text-xs text-slate-400 bg-slate-950 rounded p-3 overflow-x-auto">
                {JSON.stringify({ word, card }, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
