import type { Word } from '../types';

export function wordLabel(word: Pick<Word, 'word' | 'context'>): string {
  return word.context ? `${word.word} (${word.context})` : word.word;
}
