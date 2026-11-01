import { useEffect, useState } from 'react';
import { Word } from '../../types';
import { useAppearance } from '../../appearance/appearance';
import { COPY } from '../../appearance/copy';
import SessionBar from '../SessionBar';
import { wordLabel } from '../../utils/wordLabel';

interface Props {
  words: Word[];
  onAnswer: (wordId: string, correct: boolean) => void;
  onSessionEnd: () => void;
  onExit: () => void;
}

export default function Flashcard({ words, onAnswer, onSessionEnd, onExit }: Props) {
  const { design } = useAppearance();
  const copy = COPY[design];
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const word = words[index];

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped(f => !f);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  function answer(correct: boolean) {
    // Drop focus from the clicked button so Space keeps flipping the next card
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    onAnswer(word.id, correct);
    if (index + 1 >= words.length) {
      onSessionEnd();
    } else {
      setIndex(i => i + 1);
      setFlipped(false);
    }
  }

  return (
    <main className="screen screen-session">
      <SessionBar label="Card" current={index + 1} total={words.length} onExit={onExit} />

      <div className={`stage${flipped ? ' is-flipped' : ''}`}>
        <div
          className="flashcard"
          role="button"
          tabIndex={0}
          aria-label={flipped ? 'Flip card back to the word' : 'Reveal the definition'}
          onClick={() => setFlipped(f => !f)}
          onKeyDown={e => {
            if (e.code === 'Enter') {
              e.preventDefault();
              setFlipped(f => !f);
            }
          }}
        >
          <div className="flip">
            <div className="face front" aria-hidden={flipped}>
              <span className="pos">{word.partOfSpeech}</span>
              <h2 className="word">{wordLabel(word)}</h2>
              <span className="hint">{copy.flipHint}</span>
            </div>
            <div className="face back" aria-hidden={!flipped}>
              <span className="back-head">
                <span>{wordLabel(word)}</span>
                <span className="back-pos"> · {word.partOfSpeech}</span>
              </span>
              {word.expansion && <p className="entry-expansion">{word.expansion}</p>}
              <p className="def">{word.definition}</p>
              {word.definitions[1] && <p className="def def-alt">{word.definitions[1]}</p>}
              {word.examples[0] && <p className="ex">{word.examples[0]}</p>}
            </div>
          </div>
        </div>

        <div className="answers">
          <button type="button" className="again" disabled={!flipped} onClick={() => answer(false)}>
            Again<small>{copy.againHint}</small>
          </button>
          <button type="button" className="good" disabled={!flipped} onClick={() => answer(true)}>
            {copy.goodLabel}<small>{copy.goodHint}</small>
          </button>
        </div>
        {copy.sessionKeys && <p className="keys">{copy.sessionKeys}</p>}
      </div>
    </main>
  );
}
