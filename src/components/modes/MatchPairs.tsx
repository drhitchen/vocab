import { useEffect, useState } from 'react';
import { Word } from '../../types';
import { shuffle } from '../../utils/shuffle';
import SessionBar from '../SessionBar';
import { wordLabel } from '../../utils/wordLabel';

interface Props {
  words: Word[];
  onAnswer: (wordId: string, correct: boolean) => void;
  onSessionEnd: () => void;
  onExit: () => void;
}

type TileType = 'word' | 'definition';

interface Tile {
  id: string;       // `${wordId}-word` or `${wordId}-def`
  wordId: string;
  type: TileType;
  text: string;
}

const PAIR_SIZE = 6;

export default function MatchPairs({ words, onAnswer, onSessionEnd, onExit }: Props) {
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
      newTiles.push({ id: `${w.id}-word`, wordId: w.id, type: 'word', text: wordLabel(w) });
      newTiles.push({ id: `${w.id}-def`, wordId: w.id, type: 'definition',
        text: w.context ? `[${w.context}] ${w.definition}` : w.definition });
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

  function tileState(tile: Tile) {
    if (matched.has(tile.wordId)) return 'matched';
    if (wrong && (wrong[0] === tile.id || wrong[1] === tile.id)) return 'wrong';
    if (selected?.id === tile.id) return 'selected';
    return 'idle';
  }

  if (roundWords.length === 0) return null;

  return (
    <main className="screen screen-session screen-match">
      <SessionBar label="Round" current={currentRound} total={totalRounds} onExit={onExit} />

      <p className="match-meta">{matched.size} / {roundWords.length} matched</p>

      <div className="pair-grid">
        {tiles.map(tile => (
          <button
            key={tile.id}
            type="button"
            className="pair-tile"
            data-type={tile.type}
            data-state={tileState(tile)}
            onClick={() => handleTileClick(tile)}
            disabled={matched.has(tile.wordId)}
          >
            <span className="pair-text">{tile.text}</span>
          </button>
        ))}
      </div>

      <p className="session-hint">Click a word and its matching definition</p>
    </main>
  );
}
