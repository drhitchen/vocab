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

If the selected provider's key is missing, the tool asks for it with input hidden, using the same zsh `read -rs` pattern as `summarize-video`. Prompted keys stay in memory for this invocation only, are reused for subsequent words, and are never written to disk or included in model prompts. Hidden input requires an interactive terminal and `/bin/zsh`; otherwise, set the key in the environment. Blank key input is ignored so a trailing Enter cannot cancel the prompt. Press Ctrl-C or Ctrl-D to cancel without saving.

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

# Add only if missing, automatically confirm and save (requires an environment API key)
node scripts/add-word.js --auto-add ephemeral
node scripts/add-word.js --auto-add ephemeral --provider openai

# Add or update, with identical behavior
node scripts/add-word.js --add ephemeral
node scripts/add-word.js --update ephemeral

# Choose between model-generated definitions; prompts for context and acronym expansion
node scripts/add-word.js --choose SCA

# Supply guidance directly, with or without the interactive selector
node scripts/add-word.js --add SCA --context appsec --expansion "software composition analysis"
node scripts/add-word.js --choose source --context appsec

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

In a terminal, confirmations require a single **y** or **n** (case-insensitive), without Enter. Enter and unrelated keys are ignored, so extra newlines cannot answer subsequent confirmations. Word and API-key input still require Enter. Ctrl-C or Ctrl-D cancels; terminal mode is restored after a confirmation. With redirected or piped input, answers remain line-based and the defaults below still apply.

1. With a word argument, process that word and exit. Without one, prompt repeatedly until Ctrl-C or end of input. Multiword phrases are supported.
2. **Lookup**: display an existing entry and dictionary link. If missing, ask whether to add it (default: no).
3. **Add / update**: if found, display the current definition and ask whether to regenerate (default: no). If missing, generate a new entry.
4. **Save**: display the generated entry and confirm before writing (default: yes). New entries are inserted alphabetically; updates preserve the existing ID.
5. **Delete**: display the entry and ask for confirmation (default: no). Missing words are reported with a nonzero exit status.

Use one mode flag per command. Unknown options and missing option values are errors. Invalid JSON is reported rather than overwritten.

**Unattended additions:** `--auto-add WORD` skips existing entries (matching case-insensitively by word or ID), generates missing entries, and saves them without any prompts. It requires an explicit word or phrase argument and works only with lookup (the default) or `--add`; combining it with `--update` or `--del` is an error. New entries still undergo validation, slug-collision checks, and atomic saving. The selected provider's API key must already be set in the environment when generation is needed; otherwise, the command fails without prompting or writing. Existing words can be skipped without a key.

### Context and candidate selection

`--choose` is opt-in; ordinary lookups and additions keep their existing flow. It uses the selected **model**, not an online dictionary API. The model produces the complete entry, including definitions, examples, and classification. Existing Merriam-Webster links remain available but do not supply candidates.

If omitted, `--choose` asks for:

- **Context:** the domain or intended meaning, such as `appsec`, `taint analysis`, or `finance`. Blank selects the general meaning.
- **Expansion:** optional full wording for an acronym, such as `software composition analysis` for `SCA`.

You can supply either field with `--context TEXT` or `--expansion TEXT` to avoid that prompt. Both accept up to 500 characters without control characters. Explicit flags require non-empty text. The model is instructed to use only the requested context and to use the expansion to disambiguate the term.

The selector shows one candidate at a time:

| Key | Action |
|-----|--------|
| `n` | Show the next cached candidate, or generate a new one at the end |
| `p` | Show the previous candidate without another model call |
| `s` | Save only the displayed candidate |
| `q` | Discard all candidates without saving |

These are single-key responses in a terminal; Enter is ignored. Context and expansion remain line-based. Redirected input uses one answer per line. Generating a new candidate makes a new API request; moving through cached candidates does not. Earlier definitions are passed to the model to request alternatives. Exact repeated definitions are reported rather than silently added as new candidates. API failures and cancellation never save an unselected candidate.

`--choose` works with lookup, `--add`, or `--update`, but not `--del` or `--auto-add`. Updating an existing targeted entry still requires approval before generation.

### Separate contextual meanings

Contextual entries retain the original word and have independent IDs, for example:

```text
source             # general entry
source--appsec      # source in application security
source--finance     # a different domain
```

Adding `source --context appsec` does not replace a general `source` entry. Word/context matching is case-insensitive. IDs combine the word slug with `--` and the context slug; collisions are rejected, not overwritten. An unqualified lookup displays all matching senses. Add/update without context targets the general meaning; use `--context` or an exact entry ID to target another sense. Existing IDs and metadata are preserved on updates.

```bash
define --choose SCA --context appsec --expansion "software composition analysis"
define --add source --context appsec
define --add sink --context appsec
define --lookup source --context appsec
define --update source--appsec
define --del source --context appsec
define --auto-add SCA --context appsec --expansion "software composition analysis"
```

With `--auto-add --context`, only that context is checked before adding; without context, an existing sense in any domain is skipped as before. The local batch script remains unattended and unchanged.

The app displays context labels in Browse and all study modes, searches context and acronym expansion, and tracks progress separately by entry ID. Spelling and fill-in-blank answers still use only the original word, not the context label.

### Shell shortcuts

The local `vocab_lookup` function forwards arguments to the script. `define` and `def` are aliases for it:

```bash
define ephemeral
define --lookup ephemeral
define --auto-add ephemeral
define --add ephemeral
define --update ephemeral
define --del ephemeral
define --add ephemeral --provider openai
define --update ephemeral --model gpt-6-luna
```

After changing the function, reload it with `source ~/.functions` in your current shell. Override the project location with `VOCAB_DIR`.

### Local batch additions

`~/bin/add-words.sh` invokes `vocab_lookup --auto-add -- WORD` for each word. It uses `add-words.txt` beside the script first, or its internal `WORDS` array if the file is missing or contains no words. Blank lines and comment lines are ignored; phrases remain intact.

With `ANTHROPIC_API_KEY` exported, run:

```bash
add-words
```

The `add-words` alias in `~/.aliases` runs `~/bin/add-words.sh`; reload the aliases or open a new shell to use it. Existing entries are skipped and missing entries are automatically added using the default provider and model. API keys are never prompted for. Processing continues after a failed word, reports each failure, and exits nonzero if any word failed. The script respects `VOCAB_DIR` through the shell function. Run `add-words --help` for source-file details.

### Tests

```bash
node --test scripts/add-word.test.js

# Local batch-script tests, when installed
node --test ~/bin/add-words.test.mjs
```

Tests use temporary vocabulary files, stub generators, and mocked API responses, not live API calls. They cover scoped entry identity, acronym guidance for both providers, candidate caching and selection, and collision protection. On macOS, pseudo-terminal tests cover single-key confirmations and selection, line-based context input, extra newlines between prompts, cancellation, terminal-mode restoration, and hidden key input.

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
| `id` | string | slugified word, with `--context-slug` for contextual entries |
| `word` | string | original word as written |
| `context` | optional string | domain or intended meaning; absent for general entries |
| `expansion` | optional string | full wording for an acronym or abbreviation |
| `type` | string | `common` \| `proper` \| `phrase` \| `prefix` |
| `partOfSpeech` | string | `n`, `v`, `adj`, `adv`, `prep`, `conj`, `interj`, `phrase`, `prefix`; use `/` for multiple |
| `definitions` | string[] | 1 or 2 elements; no self-reference; 10 to 25 words each |
| `examples` | string[] | 1 or 2 natural sentences |
| `reviewNeeded` | boolean | `true` if the entry needs human review |
| `reviewReason` | string | explanation when `reviewNeeded` is true |
