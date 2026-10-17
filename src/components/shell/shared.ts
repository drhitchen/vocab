import type { AppScreen } from '../../types';

// Props for the per-design chrome (masthead, sidebar, or top bar)
export interface ChromeProps {
  totalWords: number;
  masteredCount: number;
  dueCount: number;
  screen: AppScreen;
  onNavigate: (screen: AppScreen) => void;
}

export const NAV_ITEMS = [
  { id: 'home' as const, label: 'Study' },
  { id: 'browse' as const, label: 'Browse' },
];

// Study stays highlighted while a session or its summary is open
export function isNavActive(item: AppScreen, screen: AppScreen): boolean {
  return item === 'home' ? screen === 'home' || screen === 'session' || screen === 'summary' : screen === item;
}

export function masteredPercent(masteredCount: number, totalWords: number): number {
  return totalWords > 0 ? Math.round((masteredCount / totalWords) * 100) : 0;
}
