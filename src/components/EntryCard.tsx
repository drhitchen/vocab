import { useState } from 'react';
import { SRSCard, Word } from '../types';
import { wordLabel } from '../utils/wordLabel';

interface EntryCardProps {
  word: Word;
  card: SRSCard | undefined;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
}

const BUCKET_LABELS = ['New', 'Learning', 'Familiar', 'Known', 'Mastered'] as const;

export default function EntryCard({ word, card, isExpanded, isSelected, onToggle, onSelect }: EntryCardProps) {
  const [showJson, setShowJson] = useState(false);
  const label = wordLabel(word);

  const truncDef = word.definitions[0].length > 80
    ? word.definitions[0].slice(0, 77) + '…'
    : word.definitions[0];

  const bucket = card?.bucket ?? 0;
  const bucketLabel = BUCKET_LABELS[bucket];
  // The loader always yields a 2-element tuple; the second definition is often absent
  const definitions = word.definitions.filter((d): d is string => Boolean(d));

  return (
    <div
      className="row"
      data-bucket={bucket}
      data-type={word.type}
      data-expanded={isExpanded ? 'true' : undefined}
      data-selected={isSelected ? 'true' : undefined}
    >
      {/* Collapsed row */}
      <div className="cols row-head" onClick={onToggle}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onSelect}
          onClick={e => e.stopPropagation()}
          aria-label={`Select ${label}`}
        />
        {/* Activating this button bubbles to the row's onToggle */}
        <button type="button" className="chev-btn" aria-expanded={isExpanded} aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${label}`}>
          <span className="chev" aria-hidden="true" />
        </button>
        <span className="hw" title={label}>{label}</span>
        <span className="pos-col">{word.partOfSpeech}</span>
        <span className="type">{word.type}</span>
        <span className="def-col">{truncDef}</span>
        <span className="bk">{bucketLabel}</span>
      </div>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="detail">
          <div className="detail-main">
            {word.context && <p className="entry-context">Context: {word.context}</p>}
            {word.expansion && <p className="entry-expansion">Expansion: {word.expansion}</p>}
            <h4>Definitions</h4>
            <ol>
              {definitions.map((def, i) => (
                <li key={i}>{def}</li>
              ))}
            </ol>
            {word.examples.length > 0 && (
              <>
                <h4 className="detail-gap">Examples</h4>
                <ul>
                  {word.examples.map((ex, i) => (
                    <li key={i}>{ex}</li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="detail-side">
            <h4>Review</h4>
            <div className="review-stats">
              <div><span>Status</span><b>{bucketLabel}</b></div>
              {card && (
                <>
                  <div><span>Next review</span><b>{new Date(card.nextReview).toLocaleDateString()}</b></div>
                  <div><span>Attempts</span><b>{card.correctAttempts}/{card.totalAttempts}</b></div>
                </>
              )}
              <a
                className="ext-link"
                href={`https://www.merriam-webster.com/dictionary/${encodeURIComponent(word.word)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Merriam-Webster ↗
              </a>
              <button type="button" className="json-toggle" onClick={() => setShowJson(v => !v)}>
                {showJson ? '{ hide }' : '{ }'}
              </button>
            </div>
          </div>

          {showJson && (
            <pre className="json">
              {JSON.stringify({ word, card }, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
