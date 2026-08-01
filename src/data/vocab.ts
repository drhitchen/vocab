import { Word } from '../types';

type RawEntry = {
  id: string; word: string; type?: string; partOfSpeech?: string;
  definitions: string[]; examples?: string[];
  reviewNeeded?: boolean; reviewReason?: string;
};

export async function loadWords(): Promise<Word[]> {
  const response = await fetch(`${import.meta.env.BASE_URL}vocab.json`);
  const entries = (await response.json()) as RawEntry[];

  return entries
    .filter(e => e.id && e.word && e.definitions?.length)
    .map(e => ({
      id: e.id,
      word: e.word,
      type: (e.type ?? 'common') as Word['type'],
      partOfSpeech: e.partOfSpeech ?? '',
      definitions: [e.definitions[0], e.definitions[1]] as [string, string?],
      examples: e.examples ?? [],
      reviewNeeded: e.reviewNeeded ?? false,
      reviewReason: e.reviewReason ?? '',
      definition: e.definitions[0], // backward compat for game modes
    }));
}
