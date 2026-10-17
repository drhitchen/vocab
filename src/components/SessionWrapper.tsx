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
    onExit: onHome,
  };

  if (words.length === 0) {
    return (
      <main className="screen screen-session">
        <div className="empty-session">
          <p>No words to review right now.</p>
          <button type="button" className="btn-secondary" onClick={onHome}>
            ← Back to Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      {mode === 'flashcard' && <Flashcard {...commonProps} />}
      {mode === 'multiple-choice' && <MultipleChoice {...commonProps} allWords={allWords} />}
      {mode === 'fill-in-blank' && <FillInBlank {...commonProps} />}
      {mode === 'match-pairs' && <MatchPairs {...commonProps} />}
    </>
  );
}
