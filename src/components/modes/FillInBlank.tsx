import { useEffect, useRef, useState } from 'react';
import { Word } from '../../types';

interface Props {
  words: Word[];
  onAnswer: (wordId: string, correct: boolean) => void;
  onSessionEnd: () => void;
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

export default function FillInBlank({ words, onAnswer, onSessionEnd }: Props) {
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
    <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-8">
      <p className="text-slate-500 text-sm text-center">{index + 1} / {words.length}</p>

      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-8 space-y-4">
        <p className="text-slate-300 text-lg leading-relaxed">{word.definition}</p>
        <div className="flex items-center justify-between">
          <p className="font-mono tracking-widest text-indigo-400">
            {getHint(word.word, hintLevel)}
          </p>
          {feedback === null && (
            <button
              onClick={() => setHintLevel(l => Math.min(l + 1, maxHint))}
              disabled={hintLevel >= maxHint}
              className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors ml-4 shrink-0"
            >
              Hint (Tab)
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={feedback !== null}
          placeholder="Type the word…"
          className={`w-full px-4 py-3 rounded-xl border bg-slate-900 text-white placeholder-slate-600 outline-none transition-colors
            ${feedback === 'correct' ? 'border-emerald-500' : feedback === 'wrong' ? 'border-red-500' : 'border-slate-700 focus:border-indigo-500'}`}
        />
        {feedback === 'wrong' && (
          <p className="text-slate-400 text-sm">Answer: <span className="text-white font-medium">{word.word}</span></p>
        )}

        {feedback === null ? (
          <button
            onClick={submit}
            disabled={!input.trim()}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-colors"
          >
            Submit
          </button>
        ) : (
          <button
            onClick={advance}
            className="w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium transition-colors"
          >
            Next → <span className="text-slate-500 text-sm ml-1">Space / Enter</span>
          </button>
        )}
      </div>
    </div>
  );
}
