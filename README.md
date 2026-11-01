# Vocab Builder

A spaced-repetition vocabulary learning app built with React + Vite. All progress is saved locally in the browser, no account needed.

**Live:** https://drhitchen.github.io/vocab/ · **License:** [MIT](LICENSE)

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:5173/vocab/](http://localhost:5173/vocab/), or the local URL printed by Vite.

### Preview the built website

```bash
npm run build
npm run preview
```

Open [http://localhost:4173/vocab/](http://localhost:4173/vocab/), or the URL printed by Vite.

Opening `index.html` directly or serving the project root with `python -m http.server` will not run the app: the source entry point is TypeScript/JSX and needs Vite to compile it. The production build also uses `/vocab/` asset paths for GitHub Pages, which Vite preview handles automatically.

## Designs and themes

The app ships two visual designs and a light/dark theme, all switchable at any time without losing your place (search text, selections, or a running session).

| Design | Look | Where the design picker lives |
|--------|------|-------------------------------|
| **Focus** (default) | Clean app layout: sidebar, soft cards, green accent, 3D card flip | Sidebar, above the theme button |
| **Editorial** | Dictionary-inspired: serif type, paper tones, hairline rules, terracotta accent | Right end of the masthead navigation row |

- The theme follows your system setting until you click the sun/moon button; after that your choice is kept.
- Choices are stored in `localStorage` under `vocab-builder-design` and `vocab-builder-theme`. A small inline script in `index.html` applies them before first paint to avoid a flash.
- On phones, each design collapses its navigation and keeps the picker reachable.
- Fonts are system font stacks (no web fonts are loaded), so serif and rounded faces vary slightly by operating system.

### Working on the designs

- Each design is one self-contained stylesheet scoped by `data-design` and `data-theme` on `<html>`: [`editorial.css`](src/styles/editorial.css) and [`focus.css`](src/styles/focus.css). Shared rules are in [`base.css`](src/styles/base.css).
- Components share one markup and class-name contract, so a new screen needs styling in both files. Only the page chrome (masthead, sidebar, top bar) is a separate component per design, in `src/components/shell/`.
- Wording that differs by design lives in [`src/appearance/copy.ts`](src/appearance/copy.ts). To add a design, add it to `DESIGNS` in [`appearance.tsx`](src/appearance/appearance.tsx), create a stylesheet and a chrome component, and import the stylesheet in `src/main.tsx`.
- Tailwind is still installed, but only its base reset is used by the current screens.

## How it works

**Spaced repetition (SRS)**: every word lives in one of five buckets:

| Bucket | Label | Review interval |
|--------|-------|-----------------|
| 0 | New | immediately |
| 1 | Learning | 1 day |
| 2 | Familiar | 3 days |
| 3 | Known | 7 days |
| 4 | Mastered | 14 days |

Answer correctly → word advances one bucket. Answer wrong → word resets to New.

## Browse

The **Browse** tab lets you search all 2,105 words by name or definition. Expand any row for full definitions, examples, SRS status, and a link to Merriam-Webster.

## Study modes

| Mode | How it works |
|------|-------------|
| **Flashcards** | See the word, click / Space to flip for the definition, then mark **Got it** or **Again** |
| **Multiple Choice** | See a definition, pick the correct word from 4 options (keyboard 1 to 4); Space / Enter advances after feedback |
| **Fill in Blank** | See a definition + a letter-by-letter hint (Tab reveals one more letter); type the word and press Enter |
| **Match Pairs** | Match 6 word tiles to their definition tiles; click two tiles to attempt a pair |

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Space / Enter | Flip flashcard · submit fill-in-blank · advance after feedback |
| 1 to 4 | Select multiple-choice answer |
| Tab | Reveal one more hint letter (Fill in Blank) |
| Escape | End session, return to home |

## Session workflow

1. **Pick a session size** (1 · 5 · 10 · 20 · 50 words) and a **mode**.
2. Click **Select N words & start →**: the word set is *locked* for this round.
3. Return to home and switch modes to practice the same words differently.
4. Click **New set ↺** when you're ready for a fresh batch.

### Study by bucket

Click any bucket card on the home screen to filter by that bucket (multi-select supported). The session will pull from those specific words regardless of their scheduled review date, useful for reinforcing words you want to drill.

## Data

- Vocabulary lives in `public/vocab.json` (~2,105 entries).
- Progress is stored in `localStorage` under the key `vocab-builder-progress`.
- Use **Reset all progress** at the bottom of the home screen to wipe everything (two-click confirmation required).
- Manage words locally: `node scripts/add-word.js [--lookup|--add|--update|--del] <word>`. Defaults to lookup; missing words offer to add. Terminal confirmations accept a single y/n key and ignore Enter. Generation supports `--provider anthropic|openai` and `--model NAME`, defaulting to Anthropic `claude-sonnet-5.5`. The provider and model are displayed; missing API keys are prompted with hidden input. See [script documentation](scripts/README.md).
- Use `--choose` to browse model-generated definition candidates, and `--context` / `--expansion` to guide technical meanings or acronyms. Contextual entries preserve general meanings and have independent progress; their labels are shown in Browse and study modes.

## Tech stack

- React 19 + Vite 8 + TypeScript
- Plain CSS design skins (see [Designs and themes](#designs-and-themes)); Tailwind CSS v3 for the base reset
- No backend, no account, no network calls after initial load

## License

[MIT](LICENSE), © 2026 Doug Hitchen
