import DesignPicker from './DesignPicker';
import ThemeToggle from './ThemeToggle';
import { NAV_ITEMS, isNavActive, masteredPercent, type ChromeProps } from './shared';

export default function PlayfulHeader({ totalWords, masteredCount, dueCount, screen, onNavigate }: ChromeProps) {
  const pct = masteredPercent(masteredCount, totalWords);

  return (
    <header className="topbar">
      <div className="topbar-in">
        <span className="logo">Vocab Builder</span>
        <nav className="tabs" aria-label="Primary">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              type="button"
              className="tab"
              onClick={() => onNavigate(item.id)}
              aria-current={isNavActive(item.id, screen) ? 'page' : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="top-right">
          {dueCount > 0 && <span className="due">{dueCount.toLocaleString()} due</span>}
          <div className="xp">
            <span className="xp-text">{masteredCount.toLocaleString()} / {totalWords.toLocaleString()} mastered</span>
            <span className="xp-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
          </div>
          <DesignPicker />
          <ThemeToggle className="round-btn" />
        </div>
      </div>
    </header>
  );
}
