import { useEffect, useState } from 'react';
import { AppScreen, SessionConfig, SessionResult, Word } from './types';
import { loadWords } from './data/vocab';
import { useProgress } from './hooks/useProgress';
import { getWordsForSession } from './utils/srs';
import Header from './components/Header';
import Home from './components/Home';
import SessionWrapper from './components/SessionWrapper';
import SessionSummary from './components/SessionSummary';

export default function App() {
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<AppScreen>('home');
  const [sessionWords, setSessionWords] = useState<Word[]>([]);
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);

  const { cards, updateCard } = useProgress();

  useEffect(() => {
    loadWords()
      .then(setWords)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  function handleStartSession(config: SessionConfig) {
    const sessionQueue = getWordsForSession(words, cards, config.sessionSize);
    setSessionWords(sessionQueue);
    setSessionConfig(config);
    setScreen('session');
  }

  function handleSessionEnd(result: SessionResult) {
    setSessionResult(result);
    setScreen('summary');
  }

  function handleReview() {
    if (!sessionConfig) return;
    const queue = getWordsForSession(words, cards, sessionConfig.sessionSize);
    setSessionWords(queue);
    setScreen('session');
  }

  const masteredCount = [...cards.values()].filter(c => c.bucket === 4).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400 text-lg">Loading vocabulary...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-red-400 text-lg">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Header totalWords={words.length} masteredCount={masteredCount} />
      {screen === 'home' && (
        <Home
          words={words}
          cards={cards}
          onStartSession={handleStartSession}
        />
      )}
      {screen === 'session' && sessionConfig && (
        <SessionWrapper
          mode={sessionConfig.mode}
          words={sessionWords}
          allWords={words}
          cards={cards}
          updateCard={updateCard}
          onSessionEnd={handleSessionEnd}
          onHome={() => setScreen('home')}
        />
      )}
      {screen === 'summary' && sessionResult && (
        <SessionSummary
          result={sessionResult}
          onHome={() => setScreen('home')}
          onReview={handleReview}
        />
      )}
    </div>
  );
}
