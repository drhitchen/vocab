# Vocab Scripts

Local tooling for looking up and adding words to the vocabulary dataset.

ES module, requires **Node 18+**. No `npm install` needed — uses only Node built-ins.

## Setup

Set your Anthropic API key before adding new words (not needed for lookups):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

**Never commit the key to the repo.**

---

## Scripts

### `add-word.js`

Interactive tool for looking up or adding individual words. Checks `public/vocab.json` and uses Claude to generate the entry if the word is missing.

**Usage:**

```bash
# Quick non-interactive lookup (no API key needed)
node scripts/add-word.js --lookup ephemeral

# Interactive prompt loop
node scripts/add-word.js

# Look up or add a specific word directly
node scripts/add-word.js ephemeral

# Use a different JSON file
node scripts/add-word.js --file path/to/vocab.json
```

**Flow:**
1. Enter a word at the prompt
2. **Found** — displays existing entry; offers to regenerate
3. **Not found** — Claude generates definition, examples, and metadata; you confirm before saving
4. New entries are inserted alphabetically; existing entries are updated in place

---

## JSON Schema

Each entry in `public/vocab.json`:

```json
{
  "id": "ephemeral",
  "word": "ephemeral",
  "type": "common",
  "partOfSpeech": "adj",
  "definitions": [
    "lasting for only a very short time"
  ],
  "examples": [
    "The beauty of cherry blossoms is ephemeral, gone within a week."
  ],
  "reviewNeeded": false,
  "reviewReason": ""
}
```

| Field | Type | Values |
|-------|------|--------|
| `id` | string | slugified word (`lowercase-hyphenated`) |
| `word` | string | original word as written |
| `type` | string | `common` \| `proper` \| `phrase` \| `prefix` |
| `partOfSpeech` | string | `n`, `v`, `adj`, `adv`, `prep`, `conj`, `interj`, `phrase`, `prefix`; use `/` for multiple |
| `definitions` | string[] | 1–2 elements; no self-reference; 10–25 words each |
| `examples` | string[] | 1–2 natural sentences |
| `reviewNeeded` | boolean | `true` if the entry needs human review |
| `reviewReason` | string | explanation when `reviewNeeded` is true |

