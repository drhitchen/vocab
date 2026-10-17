import type { Design } from './appearance';

// Wording that differs by design. Everything else is shared across designs.
export interface DesignCopy {
  progressTitle: string;
  progressHint: string;
  sizeTitle: string;
  sizeHint: string;
  modeTitle: string;
  modeHint: string;
  againHint: string;
  goodLabel: string;
  goodHint: string;
  flipHint: string;
  sessionKeys: string;
}

export const COPY: Record<Design, DesignCopy> = {
  editorial: {
    progressTitle: 'Progress',
    progressHint: 'Select columns to filter',
    sizeTitle: 'Session size',
    sizeHint: 'Words per round',
    modeTitle: 'Mode',
    modeHint: 'How to practice',
    againHint: 'Resets to New',
    goodLabel: 'Got it',
    goodHint: 'Moves up a bucket',
    flipHint: 'Click or press Space to reveal',
    sessionKeys: 'Space to flip \u00B7 Esc to end the session',
  },
  focus: {
    progressTitle: 'Progress',
    progressHint: '',
    sizeTitle: 'Session size',
    sizeHint: '',
    modeTitle: 'Mode',
    modeHint: '',
    againHint: 'Back to New',
    goodLabel: 'Got it',
    goodHint: 'Up one bucket',
    flipHint: 'Click the card to reveal',
    sessionKeys: '',
  },
};
