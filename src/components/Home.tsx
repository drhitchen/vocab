import { useState, type ComponentType } from 'react';
import { Bucket, GameMode, SessionConfig, SRSCard, Word } from '../types';
import { useAppearance } from '../appearance/appearance';
import { COPY } from '../appearance/copy';
import { BlankIcon, ChoiceIcon, FlashcardIcon, MatchIcon } from './icons';

const MODES: { id: GameMode; label: string; description: string; numeral: string; emoji: string; Icon: ComponentType }[] = [
  { id: 'flashcard', label: 'Flashcards', description: 'Flip to reveal the definition', numeral: 'i.', emoji: '\u{1F4DA}', Icon: FlashcardIcon },
  { id: 'multiple-choice', label: 'Multiple Choice', description: 'Pick the correct definition', numeral: 'ii.', emoji: '\u{1F3AF}', Icon: ChoiceIcon },
  { id: 'fill-in-blank', label: 'Fill in Blank', description: 'Type the word (first letter shown)', numeral: 'iii.', emoji: '\u270D\uFE0F', Icon: BlankIcon },
  { id: 'match-pairs', label: 'Match Pairs', description: 'Match words to definitions', numeral: 'iv.', emoji: '\u{1F9E9}', Icon: MatchIcon },
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

function SectionTitle({ step, title, hint }: { step: number; title: string; hint: string }) {
  return (
    <h2 className="sec-title">
      <span className="sec-step" aria-hidden="true">{step}</span>
      <span className="sec-name">{title}</span>
      {hint && <small className="sec-hint">{hint}</small>}
    </h2>
  );
}

export default function Home({ words, cards, lockedWords, onStartSession, onClearLockedWords, onResetProgress }: HomeProps) {
  const { design } = useAppearance();
  const copy = COPY[design];
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

  const wordCount = lockedWords ? lockedWords.length : sessionSize;
  const modeLabel = MODES.find(m => m.id === mode)?.label ?? '';
  const total = Math.max(words.length, 1);

  return (
    <main className="screen screen-study">
      {design === 'focus' && (
        <header className="page-head">
          <h1 className="page-title">Study</h1>
          <p className="page-sub">Pick your words, a mode, and start a round.</p>
        </header>
      )}

      {/* Progress stats: click a bucket to filter by it */}
      <section className="sec">
        <SectionTitle step={1} title={copy.progressTitle} hint={copy.progressHint} />
        <div className="spectrum" aria-hidden="true">
          {displayCounts.map((count, i) => (
            <i key={BUCKET_LABELS[i]} data-bucket={i} style={{ flexGrow: count }} />
          ))}
        </div>
        <div className="tiles">
          {BUCKET_LABELS.map((label, i) => {
            const count = displayCounts[i];
            return (
              <button
                key={label}
                type="button"
                className="tile"
                data-bucket={i}
                aria-pressed={selectedBuckets.has(i)}
                onClick={() => toggleBucket(i)}
                disabled={!!lockedWords}
              >
                <span className="tile-label">{label}</span>
                <b className="tile-count">{count.toLocaleString()}</b>
                <span className="tile-bar" aria-hidden="true">
                  <i style={{ width: `${(count / total) * 100}%` }} />
                </span>
              </button>
            );
          })}
        </div>
        <p className="tiles-foot">
          <span>
            {selectedBuckets.size > 0 && !lockedWords
              ? `${selectedBucketWordCount.toLocaleString()} word${selectedBucketWordCount !== 1 ? 's' : ''} in selected bucket${selectedBuckets.size !== 1 ? 's' : ''}`
              : `${availableCount.toLocaleString()} word${availableCount !== 1 ? 's' : ''} due for review`}
          </span>
          {selectedBuckets.size > 0 && !lockedWords && (
            <button type="button" className="link" onClick={() => setSelectedBuckets(new Set())}>
              Clear filter ✕
            </button>
          )}
        </p>
      </section>

      {/* Locked word set OR session size picker */}
      {lockedWords !== null ? (
        <section className="sec">
          <div className="locked">
            <div>
              <b>{lockedWords.length} word{lockedWords.length !== 1 ? 's' : ''} selected</b>
              <span className="locked-note"> · switch modes freely</span>
            </div>
            <button type="button" className="link" onClick={onClearLockedWords}>
              New set ↺
            </button>
          </div>
        </section>
      ) : (
        <section className="sec">
          <SectionTitle step={2} title={copy.sizeTitle} hint={copy.sizeHint} />
          <div className="sizes">
            {SESSION_SIZES.map(s => (
              <button
                key={s}
                type="button"
                className="size"
                aria-pressed={sessionSize === s}
                onClick={() => setSessionSize(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Mode selector */}
      <section className="sec">
        <SectionTitle step={3} title={copy.modeTitle} hint={copy.modeHint} />
        <div className="modes">
          {MODES.map(m => (
            <button
              key={m.id}
              type="button"
              className="mode"
              data-mode={m.id}
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
            >
              <span className="mode-num" aria-hidden="true">{m.numeral}</span>
              <span className="mode-ico" aria-hidden="true"><m.Icon /></span>
              <span className="mode-emoji" aria-hidden="true">{m.emoji}</span>
              <span className="mode-text">
                <span className="mode-name">{m.label}</span>
                <span className="mode-desc">{m.description}</span>
              </span>
              <span className="mode-tick" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      {/* Start button */}
      <div className="actionbar">
        <div className="action-info">
          <b>Ready when you are</b>
          <span>{wordCount} word{wordCount !== 1 ? 's' : ''} · {modeLabel}</span>
        </div>
        <button
          type="button"
          className="btn-primary start"
          onClick={handleStart}
          disabled={!canStart}
        >
          {startLabel}
        </button>
      </div>

      {/* Reset progress */}
      <div className="reset-wrap">
        {confirmReset ? (
          <div className="reset-confirm">
            <span>Reset all progress?</span>
            <button
              type="button"
              className="danger-link"
              onClick={() => { onResetProgress(); setConfirmReset(false); setSelectedBuckets(new Set()); }}
            >
              Yes, reset
            </button>
            <button type="button" className="link" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="reset" onClick={() => setConfirmReset(true)}>
            Reset all progress
          </button>
        )}
      </div>
    </main>
  );
}
