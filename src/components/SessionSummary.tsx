import { SessionResult } from '../types';

interface Props {
  result: SessionResult;
  onHome: () => void;
  onReview: () => void;
}

export default function SessionSummary({ result, onHome, onReview }: Props) {
  const accuracy = result.wordsReviewed > 0
    ? Math.round((result.correct / result.wordsReviewed) * 100)
    : 0;

  const leveledUp = result.bucketChanges.filter(c => c.to > c.from).length;
  const leveledDown = result.bucketChanges.filter(c => c.to < c.from).length;
  const newlyMastered = result.bucketChanges.filter(c => c.to === 4 && c.from !== 4).length;

  return (
    <main className="max-w-2xl mx-auto px-6 py-16 flex flex-col items-center gap-10">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-white">Session Complete</h2>
        <p className="text-slate-400">{result.wordsReviewed} words reviewed</p>
      </div>

      <div className="text-center">
        <div className="text-6xl font-bold text-white">{accuracy}%</div>
        <div className="text-slate-500 mt-1">accuracy</div>
      </div>

      <div className="grid grid-cols-3 gap-4 w-full">
        <div className="bg-slate-900 rounded-xl p-5 text-center">
          <div className="text-2xl font-bold text-emerald-400">{leveledUp}</div>
          <div className="text-xs text-slate-500 mt-1">Leveled Up</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-5 text-center">
          <div className="text-2xl font-bold text-red-400">{leveledDown}</div>
          <div className="text-xs text-slate-500 mt-1">Leveled Down</div>
        </div>
        <div className="bg-slate-900 rounded-xl p-5 text-center">
          <div className="text-2xl font-bold text-yellow-400">{newlyMastered}</div>
          <div className="text-xs text-slate-500 mt-1">Newly Mastered</div>
        </div>
      </div>

      <div className="flex gap-4 w-full">
        <button
          onClick={onHome}
          className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-300 hover:border-slate-500 transition-colors font-medium"
        >
          Home
        </button>
        <button
          onClick={onReview}
          className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
        >
          Review Again
        </button>
      </div>
    </main>
  );
}
