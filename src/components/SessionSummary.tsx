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
    <main className="screen screen-summary">
      <div className="result-head">
        <h2 className="result-title">Session Complete</h2>
        <p className="result-sub">{result.wordsReviewed} words reviewed</p>
      </div>

      <div className="result-score">
        <div className="score-num">{accuracy}%</div>
        <div className="score-label">accuracy</div>
      </div>

      <div className="result-stats">
        <div className="stat" data-tone="up">
          <div className="stat-num">{leveledUp}</div>
          <div className="stat-label">Leveled Up</div>
        </div>
        <div className="stat" data-tone="down">
          <div className="stat-num">{leveledDown}</div>
          <div className="stat-label">Leveled Down</div>
        </div>
        <div className="stat" data-tone="mastered">
          <div className="stat-num">{newlyMastered}</div>
          <div className="stat-label">Newly Mastered</div>
        </div>
      </div>

      <div className="result-actions">
        <button type="button" className="btn-secondary" onClick={onHome}>
          Home
        </button>
        <button type="button" className="btn-primary" onClick={onReview}>
          Review Again
        </button>
      </div>
    </main>
  );
}
