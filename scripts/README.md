# Vocab Scripts

Tooling for normalizing, validating, and extending the vocabulary dataset.

All scripts are ES modules and require **Node 18+**. No `npm install` needed — they use only Node built-ins.

## Setup

Set your Anthropic API key before running any script that calls the API:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Add to `~/.zshrc` to persist across sessions. **Never commit the key to the repo.**

---

## Scripts

### `normalize-vocab.js`

Reads `vocab.txt`, sends entries to Claude in batches, and writes a clean `vocab-normalized.json`.

**Output files:**
- `vocab-normalized.json` — the normalized dataset
- `vocab-review-needed.json` — entries flagged for human review
- `vocab-normalize-progress.json` — resume checkpoint (safe to delete after a clean run)

**Usage:**

```bash
# Full run (resumes automatically if interrupted)
node scripts/normalize-vocab.js

# Preview the first batch prompt without calling the API
node scripts/normalize-vocab.js --dry-run

# Start fresh, ignoring saved progress
node scripts/normalize-vocab.js --no-resume

# Custom options
node scripts/normalize-vocab.js \
  --input  vocab.txt \
  --output vocab-normalized.json \
  --batch  25 \
  --model  claude-sonnet-4-5
```

**Options:**

| Flag | Default | Description |
|------|---------|-------------|
| `--input FILE` | `vocab.txt` | Source TSV file |
| `--output FILE` | `vocab-normalized.json` | Output JSON |
| `--review FILE` | `vocab-review-needed.json` | Flagged entries |
| `--batch N` | `25` | Entries per API call |
| `--model NAME` | `claude-sonnet-4-5` | Claude model |
| `--no-resume` | — | Ignore saved progress |
| `--dry-run` | — | Print first batch prompt, exit |

---

### `validate-vocab.js`

Validates a normalized JSON file against the schema rules. Exits with code 1 if violations are found.

**Rules checked:**
- Required fields present (`id`, `word`, `type`, `partOfSpeech`, `definitions`, `examples`)
- `id` format: lowercase a–z, 0–9, hyphens only
- No duplicate IDs or words
- `type` is one of: `common`, `proper`, `phrase`, `prefix`
- `partOfSpeech` uses known tokens (`n`, `v`, `adj`, `adv`, `prep`, `conj`, `interj`, `phrase`, `prefix`)
- `definitions`: 1–2 strings, each 5–60 words
- `examples`: 1–2 non-empty strings
- Definition does not contain the word itself (self-reference check)

**Usage:**

```bash
# Validate the default output file
node scripts/validate-vocab.js

# Validate a specific file
node scripts/validate-vocab.js --input path/to/file.json

# Print violations but exit 0 (useful for soft CI checks)
node scripts/validate-vocab.js --warn-only
```

---

### `review-vocab.js`

Interactively reviews every entry in `vocab-review-needed.json` one at a time.
For each entry it shows the original definition from `vocab.txt` alongside the normalized version, then prompts for an action.

**Usage:**

```bash
node scripts/review-vocab.js
```

**Actions per entry:**

| Key | Action |
|-----|--------|
| `A` (or Enter) | Accept — clears `reviewNeeded`, saves to normalized JSON, removes from review queue |
| `E` | Edit one or more fields inline, then confirm |
| `R` | Regenerate via Claude using the original definition as context, then accept/edit/skip |
| `S` | Skip — leave in review queue for next session |
| `Q` | Quit — progress is saved, resume anytime |

**Edit sub-menu** (`E`):

```
def1   First definition
def2   Second definition (for words with two distinct senses)
ex1    First example sentence
ex2    Second example sentence
type   Entry type (common/proper/phrase/prefix)
pos    Part of speech
editor Open full entry in $EDITOR (defaults to nano)
done   Finish editing this entry
```

Progress is saved to disk after every accepted entry, so the session can be safely interrupted and resumed.

---

### `add-word.js`

Interactive tool for looking up or adding individual words. Prompts for a word, checks the JSON, and uses Claude to generate the entry if missing.

**Usage:**

```bash
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

Each entry in `vocab-normalized.json`:

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

---

## Typical workflow

```bash
# 1. Normalize the full dataset (takes ~10 min)
node scripts/normalize-vocab.js

# 2. Validate the output
node scripts/validate-vocab.js

# 3. Review flagged entries
cat vocab-review-needed.json | less

# 4. Manually edit vocab-normalized.json for any flagged entries, then re-validate
node scripts/validate-vocab.js

# 5. Copy to public/ for the app
cp vocab-normalized.json public/vocab.json
```
