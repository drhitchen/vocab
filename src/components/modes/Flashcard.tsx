import { useEffect, useState } from 'react';
import { Word } from '../../types';

interface Props {
  words: Word[];
  onAnswer: (wordId: string, correct: boolean) => void;
  onSessionEnd: () => void;
}

export default function Flashcard({ words, onAnswer, onSessionEnd }: Props) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const word = words[index];

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped(f => !f);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  function answer(correct: boolean) {
    onAnswer(word.id, correct);
    if (index + 1 >= words.length) {
      onSessionEnd();
    } else {
      setIndex(i => i + 1);
      setFlipped(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col items-center gap-8">
      <p className="text-slate-500 text-sm">{index + 1} / {words.length}</p>

      <div
        onClick={() => setFlipped(f => !f)}
        className={`w-full min-h-48 rounded-2xl border flex items-center justify-center p-8 text-center cursor-pointer transition-colors
          ${flipped ? 'border-slate-600 bg-slate-800 hover:bg-slate-750' : 'border-indigo-700 bg-indigo-950 hover:bg-indigo-900'}`}
      >
        {flipped ? (
          <p className="text-slate-200 text-lg leading-relaxed">{word.definition}</p>
        ) : (
          <p className="text-white text-3xl font-bold">{word.word}</p>
        )}
      </div>

      <p className="text-slate-600 text-sm">
        {flipped ? 'Click card to flip back · Space to toggle' : 'Click card or press Space to reveal'}
      </p>

      {flipped && (
        <div className="flex gap-4 w-full">
          <button
            onClick={() => answer(false)}
            className="flex-1 py-3 rounded-xl border border-red-800 bg-red-950 text-red-300 font-semibold hover:bg-red-900 transition-colors"
          >
            Again
          </button>
          <button
            onClick={() => answer(true)}
            className="flex-1 py-3 rounded-xl border border-emerald-700 bg-emerald-950 text-emerald-300 font-semibold hover:bg-emerald-900 transition-colors"
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
