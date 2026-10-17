import { useEffect, useRef, useState } from 'react';
import { Word } from '../../types';
import SessionBar from '../SessionBar';

interface Props {
  words: Word[];
  onAnswer: (wordId: string, correct: boolean) => void;
  onSessionEnd: () => void;
  onExit: () => void;
}

// Returns the word with the first `level` non-space chars revealed, rest as underscores
function getHint(w: string, level: number): string {
  let revealed = 0;
  return w.split('').map(char => {
    if (char === ' ') return ' ';
    revealed++;
    return revealed <= level ? char : '_';
  }).join('');
}

export default function FillInBlank({ words, onAnswer, onSessionEnd, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [hintLevel, setHintLevel] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  // Updated every render so the stable listener always has fresh state
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});

  const word = words[index];
  const maxHint = word.word.replace(/ /g, '').length - 1;

  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (feedback === null) {
      if (e.code === 'Tab') {
        e.preventDefault();
        setHintLevel(l => Math.min(l + 1, maxHint));
      } else if (e.code === 'Enter') {
        submit();
      }
    } else if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      advance();
    }
  };

  function submit() {
    if (feedback !== null) return;
    const val = input.trim();
    if (!val) return;
    const isCorrect = val.toLowerCase() === word.word.toLowerCase();
    setFeedback(isCorrect ? 'correct' : 'wrong');
    onAnswer(word.id, isCorrect);
  }

  useEffect(() => {
    inputRef.current?.focus();
  }, [index]);

  // Single stable listener; keyHandlerRef.current always has the latest closure
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { keyHandlerRef.current(e); }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  function advance() {
    if (index + 1 >= words.length) {
      onSessionEnd();
    } else {
      setIndex(i => i + 1);
      setInput('');
      setFeedback(null);
      setHintLevel(1);
    }
  }

  return (
    <main className="screen screen-session">
      <SessionBar label="Word" current={index + 1} total={words.length} onExit={onExit} />

      <div className="prompt-card">
        <p className="prompt-text">{word.definition}</p>
        <div className="hint-row">
          <p className="hint-text">{getHint(word.word, hintLevel)}</p>
          {feedback === null && (
            <button
              type="button"
              className="link"
              onClick={() => setHintLevel(l => Math.min(l + 1, maxHint))}
              disabled={hintLevel >= maxHint}
            >
              Hint (Tab)
            </button>
          )}
        </div>
      </div>

      <div className="answer-area">
        <input
          ref={inputRef}
          className="answer-input"
          data-state={feedback ?? 'idle'}
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={feedback !== null}
          placeholder="Type the word…"
          aria-label="Your answer"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {feedback === 'wrong' && (
          <p className="answer-reveal">Answer: <b>{word.word}</b></p>
        )}

        {feedback === null ? (
          <button type="button" className="btn-primary btn-block" onClick={submit} disabled={!input.trim()}>
            Submit
          </button>
        ) : (
          <button type="button" className="btn-secondary btn-block next-btn" onClick={advance}>
            Next → <span className="next-hint">Space / Enter</span>
          </button>
        )}
      </div>
    </main>
  );
}
