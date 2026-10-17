import { useCallback, useEffect, useMemo, useState } from 'react';
import { Word } from '../../types';
import { shuffle } from '../../utils/shuffle';
import SessionBar from '../SessionBar';

interface Props {
  words: Word[];
  allWords: Word[];
  onAnswer: (wordId: string, correct: boolean) => void;
  onSessionEnd: () => void;
  onExit: () => void;
}

export default function MultipleChoice({ words, allWords, onAnswer, onSessionEnd, onExit }: Props) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  const word = words[index];

  // Build 4 options: correct word + 3 random distractors from the full vocabulary
  const options = useMemo(() => {
    const distractors = shuffle(allWords.filter(w => w.id !== word.id)).slice(0, 3);
    return shuffle([word, ...distractors]);
  }, [word, allWords]);

  const advance = useCallback(() => {
    if (index + 1 >= words.length) {
      onSessionEnd();
    } else {
      setIndex(i => i + 1);
      setSelected(null);
    }
  }, [index, words.length, onSessionEnd]);

  function select(optionId: string) {
    if (selected !== null) return;
    setSelected(optionId);
    onAnswer(word.id, optionId === word.id);
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (selected === null) {
        const n = parseInt(e.key);
        if (n >= 1 && n <= 4 && options[n - 1]) select(options[n - 1].id);
      } else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowRight') {
        e.preventDefault();
        advance();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, options, advance]);

  function optionState(opt: Word) {
    if (selected === null) return 'idle';
    if (opt.id === word.id) return 'correct';
    if (opt.id === selected) return 'wrong';
    return 'dim';
  }

  return (
    <main className="screen screen-session">
      <SessionBar label="Question" current={index + 1} total={words.length} onExit={onExit} />

      <div className="prompt-card">
        <p className="prompt-text">{word.definition}</p>
      </div>

      <div className="options">
        {options.map((opt, i) => (
          <button
            key={opt.id}
            type="button"
            className="option"
            data-state={optionState(opt)}
            onClick={() => select(opt.id)}
            disabled={selected !== null}
          >
            <span className="option-key">{i + 1}</span>
            <span className="option-text">{opt.word}</span>
          </button>
        ))}
      </div>

      {selected !== null && (
        <button type="button" className="btn-secondary btn-block next-btn" onClick={advance}>
          Next → <span className="next-hint">Space / Enter</span>
        </button>
      )}
    </main>
  );
}
