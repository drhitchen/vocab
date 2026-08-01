interface HeaderProps {
  totalWords: number;
  masteredCount: number;
  dueCount?: number;
}

export default function Header({ totalWords, masteredCount, dueCount }: HeaderProps) {
  const pct = totalWords > 0 ? Math.round((masteredCount / totalWords) * 100) : 0;

  return (
    <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-bold tracking-tight text-white">
        Vocab Builder
      </h1>
      <div className="flex items-center gap-4 text-sm text-slate-400">
        {dueCount !== undefined && dueCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-amber-900 text-amber-300 text-xs font-medium">
            {dueCount} due
          </span>
        )}
        <span>{masteredCount} / {totalWords} mastered</span>
        <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-slate-500">{pct}%</span>
      </div>
    </header>
  );
}
