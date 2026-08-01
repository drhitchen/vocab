# Vocab Builder

A spaced-repetition vocabulary learning app built with React + Vite. All progress is saved locally in the browser — no account needed.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## How it works

**Spaced repetition (SRS)** — every word lives in one of five buckets:

| Bucket | Label | Review interval |
|--------|-------|-----------------|
| 0 | New | immediately |
| 1 | Learning | 1 day |
| 2 | Familiar | 3 days |
| 3 | Known | 7 days |
| 4 | Mastered | 14 days |

Answer correctly → word advances one bucket. Answer wrong → word resets to New.

## Study modes

| Mode | How it works |
|------|-------------|
| **Flashcards** | See the word, click / Space to flip for the definition, then mark **Got it** or **Again** |
| **Multiple Choice** | See a definition, pick the correct word from 4 options (keyboard 1–4); Space / Enter advances after feedback |
| **Fill in Blank** | See a definition + a letter-by-letter hint (Tab reveals one more letter); type the word and press Enter |
| **Match Pairs** | Match 6 word tiles to their definition tiles; click two tiles to attempt a pair |

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Space / Enter | Flip flashcard · submit fill-in-blank · advance after feedback |
| 1 – 4 | Select multiple-choice answer |
| Tab | Reveal one more hint letter (Fill in Blank) |
| Escape | End session, return to home |

## Session workflow

1. **Pick a session size** (1 · 5 · 10 · 20 · 50 words) and a **mode**.
2. Click **Select N words & start →** — the word set is *locked* for this round.
3. Return to home and switch modes to practice the same words differently.
4. Click **New set ↺** when you're ready for a fresh batch.

### Study by bucket

Click any bucket card on the home screen to filter by that bucket (multi-select supported). The session will pull from those specific words regardless of their scheduled review date — useful for reinforcing words you want to drill.

## Data

- Vocabulary lives in `public/vocab.txt` (tab-separated `word\tdefinition`, ~2,100 entries).
- Progress is stored in `localStorage` under the key `vocab-builder-progress`.
- Use **Reset all progress** at the bottom of the home screen to wipe everything (two-click confirmation required).

## Tech stack

- React 18 + Vite + TypeScript
- Tailwind CSS v3
- No backend, no account, no network calls after initial load
