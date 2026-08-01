import { useCallback, useEffect, useMemo, useState } from 'react';
import { Word } from '../../types';
import { shuffle } from '../../utils/shuffle';

interface Props {
  words: Word[];
  allWords: Word[];
  onAnswer: (wordId: string, correct: boolean) => void;
  onSessionEnd: () => void;
}

export default function MultipleChoice({ words, allWords, onAnswer, onSessionEnd }: Props) {
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

  function optionClass(opt: Word) {
    if (selected === null) return 'border-slate-700 bg-slate-900 hover:border-slate-500 text-slate-200';
    if (opt.id === word.id) return 'border-emerald-600 bg-emerald-950 text-emerald-200';
    if (opt.id === selected) return 'border-red-700 bg-red-950 text-red-300';
    return 'border-slate-800 bg-slate-900 text-slate-500';
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-8">
      <p className="text-slate-500 text-sm text-center">{index + 1} / {words.length}</p>

      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-8">
        <p className="text-slate-300 text-lg leading-relaxed text-center">{word.definition}</p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {options.map((opt, i) => (
          <button
            key={opt.id}
            onClick={() => select(opt.id)}
            disabled={selected !== null}
            className={`text-left px-5 py-4 rounded-xl border font-medium transition-colors ${optionClass(opt)}`}
          >
            <span className="text-slate-500 mr-3 text-sm">{i + 1}</span>
            {opt.word}
          </button>
        ))}
      </div>

      {selected !== null && (
        <button
          onClick={advance}
          className="w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium transition-colors"
        >
          Next → <span className="text-slate-500 text-sm ml-1">Space / Enter</span>
        </button>
      )}
    </div>
  );
}
