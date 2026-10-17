import DesignPicker from './DesignPicker';
import ThemeToggle from './ThemeToggle';
import { NAV_ITEMS, isNavActive, masteredPercent, type ChromeProps } from './shared';

export default function EditorialHeader({ totalWords, masteredCount, dueCount, screen, onNavigate }: ChromeProps) {
  const pct = masteredPercent(masteredCount, totalWords);

  return (
    <header className="masthead">
      <div className="mast-top">
        <div className="mast-meta">
          <span>Mastered</span>
          <strong>{masteredCount.toLocaleString()} / {totalWords.toLocaleString()}</strong>
          <span className="meter" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
        </div>
        <h1 className="wordmark">Vocab <em>Builder</em></h1>
        <div className="mast-tools">
          {dueCount > 0 && <span className="due">{dueCount.toLocaleString()} due</span>}
          <ThemeToggle className="icon-btn" />
        </div>
      </div>
      <div className="mast-nav">
        <span className="mast-spacer" aria-hidden="true" />
        <nav className="mast-tabs" aria-label="Primary">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={isNavActive(item.id, screen) ? 'page' : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <DesignPicker />
      </div>
    </header>
  );
}
