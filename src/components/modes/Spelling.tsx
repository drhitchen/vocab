import { useEffect, useRef, useState } from 'react';
import { SRSCard, Word } from '../../types';

interface Props {
  words: Word[];
  cards: Map<string, SRSCard>;
  onAnswer: (wordId: string, correct: boolean) => void;
  onSessionEnd: () => void;
}

export default function Spelling({ words, onAnswer, onSessionEnd }: Props) {
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const word = words[index];

  useEffect(() => {
    inputRef.current?.focus();
  }, [index]);

  function submit() {
    if (feedback !== null || !input.trim()) return;
    const isCorrect = input.trim().toLowerCase() === word.word.toLowerCase();
    setFeedback(isCorrect ? 'correct' : 'wrong');
    onAnswer(word.id, isCorrect);
    setTimeout(() => {
      if (index + 1 >= words.length) {
        onSessionEnd();
      } else {
        setIndex(i => i + 1);
        setInput('');
        setFeedback(null);
      }
    }, 1000);
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-8">
      <p className="text-slate-500 text-sm text-center">{index + 1} / {words.length}</p>

      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-8">
        <p className="text-slate-300 text-lg leading-relaxed">{word.definition}</p>
      </div>

      <div className="space-y-3">
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          disabled={feedback !== null}
          placeholder="Type the word…"
          className={`w-full px-4 py-3 rounded-xl border bg-slate-900 text-white placeholder-slate-600 outline-none transition-colors
            ${feedback === 'correct' ? 'border-emerald-500' : feedback === 'wrong' ? 'border-red-500' : 'border-slate-700 focus:border-indigo-500'}`}
        />
        {feedback === 'wrong' && (
          <p className="text-slate-400 text-sm">Answer: <span className="text-white font-medium">{word.word}</span></p>
        )}
        <button
          onClick={submit}
          disabled={feedback !== null || !input.trim()}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-colors"
        >
          Submit
        </button>
      </div>
    </div>
  );
}
