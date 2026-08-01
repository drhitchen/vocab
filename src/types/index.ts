export interface Word {
  id: string;       // slugified word, e.g. "aback", "ad-hoc"
  word: string;
  definition: string;
}

export type Bucket = 0 | 1 | 2 | 3 | 4;

export interface SRSCard {
  wordId: string;
  bucket: Bucket;
  nextReview: string;      // ISO date string
  totalAttempts: number;
  correctAttempts: number;
}

export type GameMode = 'flashcard' | 'multiple-choice' | 'fill-in-blank' | 'spelling' | 'match-pairs';

export interface SessionConfig {
  mode: GameMode;
  sessionSize: 10 | 20 | 50;
}

export type AppScreen = 'home' | 'session' | 'summary';

export interface SessionResult {
  wordsReviewed: number;
  correct: number;
  incorrect: number;
  bucketChanges: Array<{ wordId: string; from: Bucket; to: Bucket }>;
}
