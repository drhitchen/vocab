import type { ReactNode } from 'react';
import { useAppearance } from '../../appearance/appearance';
import { MoonIcon, SunIcon } from '../icons';

interface Props {
  className?: string;
  children?: ReactNode;
}

export default function ThemeToggle({ className, children }: Props) {
  const { theme, toggleTheme } = useAppearance();
  const target = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className={className}
      onClick={toggleTheme}
      aria-label={`Switch to ${target} mode`}
      title={`Switch to ${target} mode`}
    >
      {children}
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
