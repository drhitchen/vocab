import type { CSSProperties } from 'react';

interface Props {
  label: string;
  current: number;
  total: number;
  onExit: () => void;
}

export default function SessionBar({ label, current, total, onExit }: Props) {
  const style = { '--p': `${((current - 1) / total) * 100}%` } as CSSProperties;

  return (
    <div className="session-bar">
      <button type="button" className="exit" onClick={onExit} aria-label="End session">
        <span className="exit-glyph" aria-hidden="true" />
        <span className="exit-long">End session (Esc)</span>
        <span className="exit-short">Exit</span>
      </button>
      <div
        className="session-track"
        style={style}
        role="progressbar"
        aria-label="Session progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current - 1}
      />
      <span className="session-count">
        <span className="count-label">{label} </span>
        {current}
        <span className="sep-of"> of </span>
        <span className="sep-slash"> / </span>
        {total}
      </span>
    </div>
  );
}
