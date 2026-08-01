import { Bucket, SRSCard, Word } from '../types';
import { shuffle } from './shuffle';

const BUCKET_INTERVALS: Record<Bucket, number> = {
  0: 1,   // New: review after 1 day
  1: 1,   // Learning: review after 1 day
  2: 3,   // Familiar: review after 3 days
  3: 7,   // Known: review after 7 days
  4: 14,  // Mastered: review after 14 days
};

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function isDue(card: SRSCard): boolean {
  return new Date(card.nextReview) <= new Date();
}

export function scheduleNext(card: SRSCard, correct: boolean): SRSCard {
  const newBucket = correct
    ? Math.min(4, card.bucket + 1) as Bucket
    : 0;
  return {
    ...card,
    bucket: newBucket,
    nextReview: addDays(BUCKET_INTERVALS[newBucket]),
    totalAttempts: card.totalAttempts + 1,
    correctAttempts: card.correctAttempts + (correct ? 1 : 0),
  };
}

export function createCard(wordId: string): SRSCard {
  return {
    wordId,
    bucket: 0,
    nextReview: new Date().toISOString(), // due immediately
    totalAttempts: 0,
    correctAttempts: 0,
  };
}

export function getWordsForSession(
  words: Word[],
  cards: Map<string, SRSCard>,
  sessionSize: number
): Word[] {
  const dueWords = words.filter(w => {
    const card = cards.get(w.id);
    return card && isDue(card);
  });

  const newWords = words.filter(w => !cards.has(w.id));

  const due = shuffle(dueWords).slice(0, sessionSize);
  const remaining = sessionSize - due.length;
  const newFill = shuffle(newWords).slice(0, remaining);

  return shuffle([...due, ...newFill]);
}

export function getBucketLabel(bucket: Bucket): string {
  return ['New', 'Learning', 'Familiar', 'Known', 'Mastered'][bucket];
}

// Pull words directly from specified buckets, ignoring review schedule
export function getWordsFromBuckets(
  words: Word[],
  cards: Map<string, SRSCard>,
  buckets: Bucket[],
  maxCount: number
): Word[] {
  const bucketSet = new Set(buckets);
  const filtered = words.filter(w => {
    const card = cards.get(w.id);
    if (!card) return bucketSet.has(0); // unseen words belong to bucket 0 (New)
    return bucketSet.has(card.bucket);
  });
  return shuffle(filtered).slice(0, maxCount);
}
