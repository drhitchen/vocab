import { useEffect, useState } from 'react';
import { AppScreen, SessionConfig, Word } from './types';
import { loadWords } from './data/vocab';
import { useProgress } from './hooks/useProgress';
import { getWordsForSession } from './utils/srs';
import Header from './components/Header';
import Home from './components/Home';

export default function App() {
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<AppScreen>('home');
  const [sessionWords, setSessionWords] = useState<Word[]>([]);
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);

  const { cards } = useProgress();

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
      {screen === 'session' && (
        <div className="max-w-2xl mx-auto p-8 text-center">
          <p className="text-slate-400 mb-4">
            Session mode: <strong>{sessionConfig?.mode}</strong> — {sessionWords.length} words
          </p>
          <button
            onClick={() => setScreen('home')}
            className="px-4 py-2 bg-slate-700 rounded hover:bg-slate-600 transition-colors"
          >
            ← Back to Home
          </button>
        </div>
      )}
      {screen === 'summary' && (
        <div className="max-w-2xl mx-auto p-8 text-center">
          <p className="text-slate-400 mb-4">Session complete!</p>
          <button
            onClick={() => setScreen('home')}
            className="px-4 py-2 bg-slate-700 rounded hover:bg-slate-600 transition-colors"
          >
            ← Back to Home
          </button>
        </div>
      )}
    </div>
  );
}
