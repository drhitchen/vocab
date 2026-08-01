import { useCallback, useRef } from 'react';
import { GameMode, SessionResult, SRSCard, Word } from '../types';
import { scheduleNext, createCard } from '../utils/srs';
import Flashcard from './modes/Flashcard';
import MultipleChoice from './modes/MultipleChoice';
import FillInBlank from './modes/FillInBlank';
import Spelling from './modes/Spelling';
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
    cards,
    onAnswer: handleAnswer,
    onSessionEnd: handleSessionEnd,
  };

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
      {mode === 'spelling' && <Spelling {...commonProps} />}
      {mode === 'match-pairs' && <MatchPairs {...commonProps} />}
    </div>
  );
}
