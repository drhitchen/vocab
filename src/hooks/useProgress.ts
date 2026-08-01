import { useCallback, useEffect, useState } from 'react';
import { SRSCard } from '../types';

const STORAGE_KEY = 'vocab-builder-progress';

function loadFromStorage(): Map<string, SRSCard> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const entries: [string, SRSCard][] = JSON.parse(raw);
    return new Map(entries);
  } catch {
    return new Map();
  }
}

function saveToStorage(cards: Map<string, SRSCard>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...cards.entries()]));
}

export function useProgress() {
  const [cards, setCards] = useState<Map<string, SRSCard>>(loadFromStorage);

  useEffect(() => {
    saveToStorage(cards);
  }, [cards]);

  const updateCard = useCallback((card: SRSCard) => {
    setCards(prev => {
      const next = new Map(prev);
      next.set(card.wordId, card);
      return next;
    });
  }, []);

  const getCard = useCallback((wordId: string): SRSCard | undefined => {
    return cards.get(wordId);
  }, [cards]);

  const resetProgress = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setCards(new Map());
  }, []);

  return { cards, updateCard, getCard, resetProgress };
}
