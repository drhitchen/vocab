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

export type GameMode = 'flashcard' | 'multiple-choice' | 'fill-in-blank' | 'match-pairs';

export interface SessionConfig {
  mode: GameMode;
  sessionSize: 1 | 5 | 10 | 20 | 50;
  buckets?: Bucket[]; // if set, pull from these buckets instead of SRS due logic
}

export type AppScreen = 'home' | 'session' | 'summary';

export interface SessionResult {
  wordsReviewed: number;
  correct: number;
  incorrect: number;
  bucketChanges: Array<{ wordId: string; from: Bucket; to: Bucket }>;
}
