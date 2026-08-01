import { useCallback, useEffect, useRef } from 'react';
import { GameMode, SessionResult, SRSCard, Word } from '../types';
import { scheduleNext, createCard } from '../utils/srs';
import Flashcard from './modes/Flashcard';
import MultipleChoice from './modes/MultipleChoice';
import FillInBlank from './modes/FillInBlank';
import MatchPairs from './modes/MatchPairs';

interface Props {
  mode: GameMode;
  words: Word[];
  allWords: Word[];
  cards: Map<string, SRSCard>;
  updateCard: (card: SRSCard) => void;
  onSessionEnd: (result: SessionResult) => void;
  onHome: () => void;
}

export default function SessionWrapper({
  mode, words, allWords, cards, updateCard, onSessionEnd, onHome
}: Props) {
  // Use refs so accumulated values survive re-renders triggered by updateCard calls
  const correctRef = useRef(0);
  const incorrectRef = useRef(0);
  const bucketChangesRef = useRef<SessionResult['bucketChanges']>([]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onHome();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onHome]);

  const handleAnswer = useCallback((wordId: string, isCorrect: boolean) => {
    const existing = cards.get(wordId) ?? createCard(wordId);
    const updated = scheduleNext(existing, isCorrect);
    bucketChangesRef.current.push({ wordId, from: existing.bucket, to: updated.bucket });
    if (isCorrect) correctRef.current++; else incorrectRef.current++;
    updateCard(updated);
  }, [cards, updateCard]);

  const handleSessionEnd = useCallback(() => {
    onSessionEnd({
      wordsReviewed: words.length,
      correct: correctRef.current,
      incorrect: incorrectRef.current,
      bucketChanges: bucketChangesRef.current,
    });
  }, [words.length, onSessionEnd]);

  const commonProps = {
    words,
    onAnswer: handleAnswer,
    onSessionEnd: handleSessionEnd,
  };

  if (words.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-20 text-center">
        <p className="text-slate-400 mb-6">No words to review right now.</p>
        <button onClick={onHome} className="px-6 py-3 bg-slate-700 rounded-xl hover:bg-slate-600 transition-colors">
          ← Back to Home
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800">
        <span className="text-sm text-slate-500 capitalize">{mode.replace('-', ' ')}</span>
        <button
          onClick={onHome}
          className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
        >
          ✕ End session
        </button>
      </div>
      {mode === 'flashcard' && <Flashcard {...commonProps} />}
      {mode === 'multiple-choice' && <MultipleChoice {...commonProps} allWords={allWords} />}
      {mode === 'fill-in-blank' && <FillInBlank {...commonProps} />}
      {mode === 'match-pairs' && <MatchPairs {...commonProps} />}
    </div>
  );
}
