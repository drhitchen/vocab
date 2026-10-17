import type { ReactNode } from 'react';

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const SunIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const MoonIcon = () => (
  <Icon>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </Icon>
);

export const SearchIcon = () => (
  <Icon>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
);

export const StudyIcon = () => (
  <Icon>
    <path d="M12 3 2.5 8 12 13l9.5-5z" />
    <path d="m6 10.8V16c0 1.3 2.7 3 6 3s6-1.7 6-3v-5.2" />
  </Icon>
);

export const BrowseIcon = () => (
  <Icon>
    <path d="M4 5h16M4 12h16M4 19h10" />
  </Icon>
);

export const FlashcardIcon = () => (
  <Icon>
    <rect x="3" y="6" width="14" height="12" rx="2.5" />
    <path d="M7 3h12a2 2 0 0 1 2 2v10" />
  </Icon>
);

export const ChoiceIcon = () => (
  <Icon>
    <circle cx="5" cy="7" r="1.5" />
    <circle cx="5" cy="17" r="1.5" />
    <path d="M10 7h10M10 17h10M4.2 17l.9.9 1.7-1.8" />
  </Icon>
);

export const BlankIcon = () => (
  <Icon>
    <path d="M4 7V5h12v2M10 5v12M7 17h6" />
    <path d="M4 21h16" />
  </Icon>
);

export const MatchIcon = () => (
  <Icon>
    <rect x="3" y="4" width="7" height="7" rx="2" />
    <rect x="14" y="13" width="7" height="7" rx="2" />
    <path d="M10 7.5h2a2 2 0 0 1 2 2V13M14 16.5h-2a2 2 0 0 1-2-2V11" />
  </Icon>
);
