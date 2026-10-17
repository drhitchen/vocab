import DesignPicker from './DesignPicker';
import ThemeToggle from './ThemeToggle';
import { useAppearance } from '../../appearance/appearance';
import { BrowseIcon, StudyIcon } from '../icons';
import { NAV_ITEMS, isNavActive, masteredPercent, type ChromeProps } from './shared';

const RING_CIRCUMFERENCE = 2 * Math.PI * 22;

export default function FocusSidebar({ totalWords, masteredCount, dueCount, screen, onNavigate }: ChromeProps) {
  const { theme } = useAppearance();
  const pct = masteredPercent(masteredCount, totalWords);
  const fraction = totalWords > 0 ? masteredCount / totalWords : 0;

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo" aria-hidden="true">V</span>
        <span className="brand-name">Vocab Builder</span>
      </div>
      <nav className="nav" aria-label="Primary">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            aria-current={isNavActive(item.id, screen) ? 'page' : undefined}
          >
            {item.id === 'home' ? <StudyIcon /> : <BrowseIcon />}
            <span>{item.label}</span>
            {item.id === 'home' && dueCount > 0 && <span className="badge">{dueCount.toLocaleString()}</span>}
          </button>
        ))}
      </nav>
      <div className="side-foot">
        <div className="mastery">
          <div className="gauge">
            <svg viewBox="0 0 54 54" aria-hidden="true">
              <circle className="gauge-track" cx="27" cy="27" r="22" />
              <circle
                className="gauge-fill"
                cx="27"
                cy="27"
                r="22"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - fraction)}
              />
            </svg>
            <span>{pct}%</span>
          </div>
          <div>
            <b>{masteredCount.toLocaleString()} mastered</b>
            <small>of {totalWords.toLocaleString()} words</small>
          </div>
        </div>
        <div className="side-picker">
          <span className="side-label">Design</span>
          <DesignPicker />
        </div>
        <ThemeToggle className="theme-btn">
          <span className="theme-label">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
        </ThemeToggle>
      </div>
    </aside>
  );
}
