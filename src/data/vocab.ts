import { Word } from '../types';

function slugify(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function loadWords(): Promise<Word[]> {
  const response = await fetch('/vocab.txt');
  const text = await response.text();
  const seen = new Set<string>();
  const words: Word[] = [];

  for (const line of text.split('\n')) {
    const tabIdx = line.indexOf('\t');
    if (tabIdx === -1) continue;
    const word = line.slice(0, tabIdx).trim();
    const definition = line.slice(tabIdx + 1).trim();
    if (!word || !definition) continue;
    const id = slugify(word);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    words.push({ id, word, definition });
  }

  return words;
}
