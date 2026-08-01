import { useEffect, useState } from 'react';
import { Word } from '../../types';
import { shuffle } from '../../utils/shuffle';

interface Props {
  words: Word[];
  onAnswer: (wordId: string, correct: boolean) => void;
  onSessionEnd: () => void;
}

type TileType = 'word' | 'definition';

interface Tile {
  id: string;       // `${wordId}-word` or `${wordId}-def`
  wordId: string;
  type: TileType;
  text: string;
}

const PAIR_SIZE = 6;

export default function MatchPairs({ words, onAnswer, onSessionEnd }: Props) {
  const [roundStart, setRoundStart] = useState(0);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Tile | null>(null);
  const [wrong, setWrong] = useState<[string, string] | null>(null);
  const [mistakes, setMistakes] = useState<Set<string>>(new Set());

  const roundWords = words.slice(roundStart, roundStart + PAIR_SIZE);
  const totalRounds = Math.ceil(words.length / PAIR_SIZE);
  const currentRound = Math.floor(roundStart / PAIR_SIZE) + 1;

  useEffect(() => {
    const newTiles: Tile[] = [];
    for (const w of roundWords) {
      newTiles.push({ id: `${w.id}-word`, wordId: w.id, type: 'word', text: w.word });
      newTiles.push({ id: `${w.id}-def`, wordId: w.id, type: 'definition', text: w.definition });
    }
    setTiles(shuffle(newTiles));
    setMatched(new Set());
    setSelected(null);
    setWrong(null);
    setMistakes(new Set());
  }, [roundStart, words]);

  // End session if no words remain for this round (e.g. empty words prop)
  useEffect(() => {
    if (roundWords.length === 0) onSessionEnd();
  }, [roundWords.length, onSessionEnd]);

  function handleTileClick(tile: Tile) {
    if (matched.has(tile.wordId)) return;
    if (wrong !== null) return;
    if (selected?.id === tile.id) {
      setSelected(null);
      return;
    }

    if (selected === null) {
      setSelected(tile);
      return;
    }

    const a = selected;
    const b = tile;

    if (a.wordId === b.wordId && a.type !== b.type) {
      // Correct match
      setMatched(prev => {
        const next = new Set(prev);
        next.add(a.wordId);
        return next;
      });
      setSelected(null);

      // Check completion using local newMatched to avoid stale state
      const newMatched = new Set(matched);
      newMatched.add(a.wordId);
      if (newMatched.size === roundWords.length) {
        for (const w of roundWords) {
          onAnswer(w.id, !mistakes.has(w.id));
        }
        const nextStart = roundStart + PAIR_SIZE;
        if (nextStart >= words.length) {
          onSessionEnd();
        } else {
          setRoundStart(nextStart);
        }
      }
    } else {
      // Wrong match: flash red then reset
      setWrong([a.id, b.id]);
      setMistakes(prev => {
        const next = new Set(prev);
        next.add(a.wordId);
        next.add(b.wordId);
        return next;
      });
      setTimeout(() => {
        setWrong(null);
        setSelected(null);
      }, 600);
    }
  }

  function tileClass(tile: Tile) {
    if (matched.has(tile.wordId)) {
      return 'border-emerald-700 bg-emerald-950 text-emerald-300 cursor-default';
    }
    if (wrong && (wrong[0] === tile.id || wrong[1] === tile.id)) {
      return 'border-red-600 bg-red-950 text-red-300';
    }
    if (selected?.id === tile.id) {
      return 'border-indigo-500 bg-indigo-950 text-white';
    }
    return 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 cursor-pointer';
  }

  if (roundWords.length === 0) return null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 flex flex-col gap-6">
      <div className="flex justify-between items-center text-sm text-slate-500">
        <span>Round {currentRound} / {totalRounds}</span>
        <span>{matched.size} / {roundWords.length} matched</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {tiles.map(tile => (
          <button
            key={tile.id}
            onClick={() => handleTileClick(tile)}
            disabled={matched.has(tile.wordId)}
            className={`text-left px-4 py-3 rounded-xl border text-sm leading-snug transition-colors min-h-16 ${tileClass(tile)}`}
          >
            <span className={tile.type === 'definition' ? 'line-clamp-3' : ''}>{tile.text}</span>
          </button>
        ))}
      </div>

      <p className="text-slate-600 text-xs text-center">Click a word and its matching definition</p>
    </div>
  );
}
