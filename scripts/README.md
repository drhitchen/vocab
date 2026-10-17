# Vocab Scripts

Local tooling for looking up, adding, updating, and deleting vocabulary entries.

ES module, requires **Node 18+**. No `npm install` needed, uses only Node built-ins.

## Setup

Set the API key for the provider you use, or let the tool prompt when generation is needed. Lookups, deletions, and declining prompts do not need a key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
```

**Never commit the key to the repo.**

If the selected provider's key is missing, the tool asks for it with input hidden, using the same zsh `read -rs` pattern as `summarize-video`. Prompted keys stay in memory for this invocation only, are reused for subsequent words, and are never written to disk or included in model prompts. Hidden input requires an interactive terminal and `/bin/zsh`; otherwise, set the key in the environment. Empty input or cancellation stops the command without saving.

---

## Scripts

### `add-word.js`

Checks `public/vocab.json` and uses Anthropic or OpenAI to generate new or updated entries. The selected provider and model are shown whenever generation is requested.

| Provider | Models | API key |
|----------|--------|---------|
| `anthropic` (default) | `claude-sonnet-5.5` (default), `claude-haiku-5.5` | `ANTHROPIC_API_KEY` |
| `openai` | `gpt-6.1-sol` (default), `gpt-6-luna` | `OPENAI_API_KEY` |

Use `--provider` to choose a provider and its default model. Use `--model` alone to infer the provider, or supply both flags with a matching pair. Unsupported providers, models, and mismatched pairs are errors. Anthropic display names use dots; API requests use `claude-sonnet-5-5` and `claude-haiku-5-5`. Those API names are also accepted as model arguments for compatibility.

**Usage:**

```bash
# Lookup is the default
node scripts/add-word.js ephemeral
node scripts/add-word.js --lookup ephemeral

# Add or update, with identical behavior
node scripts/add-word.js --add ephemeral
node scripts/add-word.js --update ephemeral

# Delete, with confirmation
node scripts/add-word.js --del ephemeral

# Prompt for words in lookup mode
node scripts/add-word.js

# Prompt for words in another mode
node scripts/add-word.js --add

# Use a different JSON file
node scripts/add-word.js --file path/to/vocab.json

# Select a provider with its default model
node scripts/add-word.js --add ephemeral --provider openai

# Select a model, inferring its provider
node scripts/add-word.js --add ephemeral --model claude-haiku-5.5
node scripts/add-word.js --add ephemeral --model gpt-6-luna

# Explicit provider and model
node scripts/add-word.js --update ephemeral --provider anthropic --model claude-sonnet-5.5
```

**Flow:**
1. With a word argument, process that word and exit. Without one, prompt repeatedly until Ctrl-C or end of input. Multiword phrases are supported.
2. **Lookup**: display an existing entry and dictionary link. If missing, ask whether to add it (default: no).
3. **Add / update**: if found, display the current definition and ask whether to regenerate (default: no). If missing, generate a new entry.
4. **Save**: display the generated entry and confirm before writing (default: yes). New entries are inserted alphabetically; updates preserve the existing ID.
5. **Delete**: display the entry and ask for confirmation (default: no). Missing words are reported with a nonzero exit status.

Use one mode flag per command. Unknown options and missing option values are errors. Invalid JSON is reported rather than overwritten.

### Shell shortcuts

The local `vocab_lookup` function forwards arguments to the script. `define` and `def` are aliases for it:

```bash
define ephemeral
define --lookup ephemeral
define --add ephemeral
define --update ephemeral
define --del ephemeral
define --add ephemeral --provider openai
define --update ephemeral --model gpt-6-luna
```

After changing the function, reload it with `source ~/.functions` in your current shell. Override the project location with `VOCAB_DIR`.

### Tests

```bash
node --test scripts/add-word.test.js
```

Tests use temporary vocabulary files, stub generators, and mocked API responses, not live API calls. On macOS, a pseudo-terminal test verifies that key input is not echoed.

### API responses

Anthropic requests use the Messages API; OpenAI requests use the Responses API with `store: false`. Both allow 4,096 output tokens. Thinking-enabled models may return reasoning blocks before text. The tool reads only text blocks when parsing the generated entry. Missing text, refusals without text, invalid JSON, and incomplete or truncated responses are reported without saving. A token-limit error requires increasing the provider's output-token limit in the script or selecting a different model with `--model`.

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
| `definitions` | string[] | 1 or 2 elements; no self-reference; 10 to 25 words each |
| `examples` | string[] | 1 or 2 natural sentences |
| `reviewNeeded` | boolean | `true` if the entry needs human review |
| `reviewReason` | string | explanation when `reviewNeeded` is true |
