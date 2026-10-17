#!/usr/bin/env node
/**
 * Look up, add, update, or delete a word in the normalized vocab JSON.
 * Uses Anthropic or OpenAI to generate definition, examples, and metadata.
 *
 * Usage:
 *   node scripts/add-word.js [--lookup|--add|--update|--del] [word]
 *   node scripts/add-word.js --file FILE      # target JSON (default: public/vocab.json)
 *   node scripts/add-word.js --provider NAME  # anthropic (default) or openai
 *   node scripts/add-word.js --model NAME     # default: claude-sonnet-5.5
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import readline from 'readline';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROVIDERS = {
  anthropic: {
    key: 'ANTHROPIC_API_KEY',
    models: { 'claude-sonnet-5.5': 'claude-sonnet-5-5', 'claude-haiku-5.5': 'claude-haiku-5-5' },
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
  },
  openai: {
    key: 'OPENAI_API_KEY',
    models: { 'gpt-6.1-sol': 'gpt-6.1-sol', 'gpt-6-luna': 'gpt-6-luna' },
    hostname: 'api.openai.com',
    path: '/v1/responses',
  },
};

export function promptApiKey(provider) {
  const variable = PROVIDERS[provider].key;
  if (!process.stdin.isTTY) {
    throw new Error(`${variable} is not set. Set it in the environment or run in a terminal for hidden input.`);
  }
  const result = spawnSync('/bin/zsh', ['-f', '-c', `
    IFS= read -rs "key?Enter $1 API key (input hidden): " || exit 1
    printf '\\n' >&2
    printf '%s' "$key"
  `, 'vocab-key', provider], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] });
  if (result.error) throw new Error(`Unable to prompt for ${variable}: ${result.error.message}`);
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(`No ${variable} provided; command cancelled.`);
  }
  return result.stdout.trim();
}

export function createKeyProvider(promptKey = promptApiKey, env = process.env) {
  const keys = new Map();
  return (provider) => {
    if (!keys.has(provider)) {
      const key = env[PROVIDERS[provider].key]?.trim() || promptKey(provider).trim();
      if (!key) throw new Error(`No ${PROVIDERS[provider].key} provided; command cancelled.`);
      keys.set(provider, key);
    }
    return keys.get(provider);
  };
}

// ---------------------------------------------------------------------------
// Load / save JSON
// ---------------------------------------------------------------------------

function loadJson(jsonFile) {
  if (!fs.existsSync(jsonFile)) return [];
  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  if (!Array.isArray(data)) throw new Error(`Expected an array in ${jsonFile}`);
  return data;
}

function saveJson(jsonFile, entries) {
  // Write atomically via a temp file
  const tmp = jsonFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, jsonFile);
}

// ---------------------------------------------------------------------------
// Lookup: case-insensitive match on word or id
// ---------------------------------------------------------------------------

function findEntry(entries, word) {
  const q = word.trim().toLowerCase();
  return entries.find(
    (e) => e.word?.toLowerCase() === q || e.id?.toLowerCase() === q
  ) ?? null;
}

function slugify(word) {
  return word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Display an entry
// ---------------------------------------------------------------------------

function display(entry) {
  const lines = [];
  lines.push('');
  lines.push(`  \x1b[1m${entry.word}\x1b[0m  \x1b[2m(${entry.partOfSpeech ?? '?'}) [${entry.type ?? '?'}]\x1b[0m`);
  for (let i = 0; i < (entry.definitions ?? []).length; i++) {
    const prefix = entry.definitions.length > 1 ? `  ${i + 1}. ` : '     ';
    lines.push(`${prefix}${entry.definitions[i]}`);
  }
  if ((entry.examples ?? []).length) {
    lines.push('');
    for (const ex of entry.examples) {
      lines.push(`     \x1b[2m"${ex}"\x1b[0m`);
    }
  }
  if (entry.reviewNeeded) {
    lines.push(`\n     \x1b[33m⚠ Review needed: ${entry.reviewReason}\x1b[0m`);
  }
  lines.push('');
  console.log(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

function isYes(answer) {
  return /^(y|yes)$/i.test(answer.trim());
}

// ---------------------------------------------------------------------------
// Generation prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a precise vocabulary dictionary editor. Given a single word, produce a clean, normalized JSON entry.

DEFINITION RULES:
- Write 10-25 words in plain, everyday English
- NEVER use the word itself or any morphological derivative in the definition
- No dictionary boilerplate or cross-references
- If the word has 2 completely different meanings, include both as separate strings; otherwise exactly 1

EXAMPLES:
- Write 1-2 natural sentences that demonstrate the word in context
- Examples must show meaning through context, not restate the definition

CLASSIFICATION:
- type: "common" | "proper" | "phrase" | "prefix"
- partOfSpeech: "n" | "v" | "adj" | "adv" | "prep" | "conj" | "interj" | "phrase" | "prefix"
  Use "/" to separate multiple (e.g. "n/v")

Set reviewNeeded=true only if you are genuinely uncertain about the word.

Never use Unicode em dash or en dash characters in any text.
Return ONLY valid JSON, no markdown, no commentary.`;

// ---------------------------------------------------------------------------
// Entry validation
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set(['common', 'proper', 'phrase', 'prefix']);
const HTML_PATTERN = /<[^>]+>/;

function validateEntry(entry) {
  const required = ['id', 'word', 'type', 'partOfSpeech', 'definitions', 'examples'];
  for (const field of required) {
    if (entry[field] == null) throw new Error(`Missing required field: ${field}`);
  }
  if (!VALID_TYPES.has(entry.type)) {
    throw new Error(`Invalid type: "${entry.type}"`);
  }
  if (!Array.isArray(entry.definitions) || entry.definitions.length < 1 || entry.definitions.length > 2) {
    throw new Error('definitions must be an array of 1-2 strings');
  }
  if (!Array.isArray(entry.examples) || entry.examples.length < 1) {
    throw new Error('examples must be a non-empty array');
  }
  for (const def of entry.definitions) {
    if (typeof def !== 'string') throw new Error('definition must be a string');
    if (HTML_PATTERN.test(def)) throw new Error(`HTML content rejected in definition: "${def.slice(0, 60)}"`);
  }
  for (const ex of entry.examples) {
    if (typeof ex !== 'string') throw new Error('example must be a string');
    if (HTML_PATTERN.test(ex)) throw new Error(`HTML content rejected in example: "${ex.slice(0, 60)}"`);
  }
}

// ---------------------------------------------------------------------------
// Provider APIs
// ---------------------------------------------------------------------------

export function parseApiResponse(data, provider = 'anthropic') {
  const msg = JSON.parse(data);
  if (provider === 'openai') {
    if (msg.status !== 'completed') {
      throw new Error(`OpenAI response was not completed: ${msg.incomplete_details?.reason ?? msg.status ?? 'unknown status'}.`);
    }
    if (!Array.isArray(msg.output)) throw new Error('OpenAI response is missing its output array.');
    const text = msg.output
      .filter((item) => item?.type === 'message' && item.role === 'assistant')
      .flatMap((item) => item.content ?? [])
      .filter((block) => block?.type === 'output_text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('').trim()
      .replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '');
    if (!text) throw new Error('OpenAI response contained no text.');
    return JSON.parse(text);
  }
  if (msg.stop_reason === 'max_tokens') {
    throw new Error('API response reached max_tokens before completing the entry. Increase max_tokens or use a different model.');
  }
  if (!Array.isArray(msg.content)) throw new Error('API response is missing its content array.');
  const text = msg.content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '');
  if (!text) {
    throw new Error(`API response contained no text (stop_reason: ${msg.stop_reason ?? 'unknown'}).`);
  }
  return JSON.parse(text);
}

export async function generateEntry(word, { provider, model }, apiKey) {
  const config = PROVIDERS[provider];
  // Strip quote chars to prevent prompt injection via the word argument
  const safeWord = word.replace(/["'\\`]/g, '').slice(0, 100);
  const content = `Generate a vocab entry for the word: "${safeWord}"

Return a single JSON object with this exact schema:
{
  "id": string,           // slugified: lowercase, spaces → hyphens
  "word": string,         // original word as given
  "type": "common"|"proper"|"phrase"|"prefix",
  "partOfSpeech": string,
  "definitions": string[],// 1 or 2 elements
  "examples": string[],   // 1 or 2 elements
  "reviewNeeded": boolean,
  "reviewReason": string  // empty string if false
}`;
  const body = JSON.stringify(provider === 'anthropic' ? {
    model: config.models[model],
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  } : {
    model: config.models[model],
    max_output_tokens: 4096,
    instructions: SYSTEM_PROMPT,
    input: [{ role: 'user', content }],
    store: false,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: config.hostname,
        path: config.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(provider === 'anthropic' ? {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          } : { Authorization: `Bearer ${apiKey}` }),
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('error', reject);
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`${provider} API error ${res.statusCode}. Check your API key, model access, and provider status.`));
            return;
          }
          try {
            resolve(parseApiResponse(data, provider));
          } catch (e) {
            reject(new Error(`Invalid API response: ${e instanceof SyntaxError ? 'Response contained invalid JSON.' : e.message}`));
          }
        });
      }
    );
    req.setTimeout(120000, () => req.destroy(new Error(`${provider} API request timed out.`)));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export async function runCommand({ mode, word, jsonFile, ask, generate }) {
  const existing = findEntry(loadJson(jsonFile), word);
  if (existing) display(existing);

  if (mode === 'lookup' && existing) {
    console.log(`  https://www.merriam-webster.com/dictionary/${encodeURIComponent(existing.word)}\n`);
    return;
  }

  if (!existing) {
    console.log(`\n  "${word}" not in vocabulary.\n`);
    if (mode === 'del') {
      process.exitCode = 1;
      return;
    }
    if (mode === 'lookup' && !isYes(await ask('Add this word? [y/N] '))) return;
  } else if (mode === 'del') {
    if (!isYes(await ask('Delete this entry? [y/N] '))) return;
    const fresh = loadJson(jsonFile);
    saveJson(jsonFile, fresh.filter((entry) => entry.id !== existing.id));
    console.log(`  Deleted "${existing.word}".\n`);
    return;
  } else if (!isYes(await ask('Update this entry? [y/N] '))) {
    return;
  }

  console.log(`  Generating entry for "${existing?.word ?? word}"...`);
  const entry = await generate(existing?.word ?? word);
  entry.id = existing?.id ?? slugify(word);
  entry.word = existing?.word ?? word;
  validateEntry(entry);
  console.log('  Generated entry.\n');
  display(entry);

  const save = (await ask(existing ? 'Save updated entry? [Y/n] ' : 'Add to vocabulary file? [Y/n] ')).trim();
  if (save && !isYes(save)) {
    console.log('  Discarded.\n');
    return;
  }

  const fresh = loadJson(jsonFile);
  const idx = fresh.findIndex((item) => item.id === entry.id);
  if (!existing && idx >= 0) throw new Error(`An entry with id "${entry.id}" already exists; look it up before updating.`);
  if (idx >= 0) {
    fresh[idx] = entry;
  } else {
    const insertAt = fresh.findIndex((item) => (item.word ?? '').toLowerCase() > entry.word.toLowerCase());
    if (insertAt === -1) fresh.push(entry);
    else fresh.splice(insertAt, 0, entry);
  }
  saveJson(jsonFile, fresh);
  console.log(`  ${idx >= 0 ? 'Updated' : 'Added'} "${entry.word}" (${fresh.length} total entries).\n`);
}

// ---------------------------------------------------------------------------
// Arg parser
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const result = { mode: 'lookup', word: '', file: path.join(ROOT, 'public', 'vocab.json') };
  const words = [];
  let selectedMode;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      words.push(...argv.slice(i + 1));
      break;
    } else if (['--lookup', '--add', '--update', '--del'].includes(arg)) {
      if (selectedMode) throw new Error('Choose only one of --lookup, --add, --update, or --del.');
      selectedMode = arg.slice(2);
      result.mode = selectedMode;
    } else if (arg === '--file' || arg === '--model' || arg === '--provider') {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error(`${arg} requires a value.`);
      result[key] = next;
      i++;
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      words.push(arg);
    }
  }
  result.word = words.join(' ').trim();
  if (result.provider && !Object.hasOwn(PROVIDERS, result.provider)) {
    throw new Error(`Unknown provider: ${result.provider}. Choose anthropic or openai.`);
  }
  if (result.model) {
    const selection = Object.entries(PROVIDERS).flatMap(([provider, config]) =>
      Object.entries(config.models).map(([model, apiModel]) => ({ provider, model, apiModel }))
    ).find(({ model, apiModel }) => result.model === model || result.model === apiModel);
    if (!selection) throw new Error(`Unsupported model: ${result.model}. Choose ${Object.values(PROVIDERS).flatMap((config) => Object.keys(config.models)).join(', ')}.`);
    if (result.provider && result.provider !== selection.provider) throw new Error(`Model ${result.model} requires provider ${selection.provider}.`);
    result.provider = selection.provider;
    result.model = selection.model;
  }
  result.provider ??= 'anthropic';
  result.model ??= Object.keys(PROVIDERS[result.provider].models)[0];
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let rl;
  let answers;
  const getKey = createKeyProvider();
  const ask = async (question, allowEof = false) => {
    if (!rl) {
      rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
      answers = rl[Symbol.asyncIterator]();
      rl.on('SIGINT', () => rl.close());
    }
    process.stdout.write(question);
    const answer = await answers.next();
    if (answer.done) {
      if (allowEof) return null;
      throw new Error('Input closed; command cancelled without saving.');
    }
    return answer.value;
  };

  try {
    do {
      const answer = args.word || await ask('Word: ', true);
      if (answer === null) break;
      const word = answer.trim();
      if (!word) continue;
      await runCommand({
        mode: args.mode,
        word,
        jsonFile: args.file,
        ask,
        generate: (value) => {
          console.log(`  Provider: ${args.provider} | Model: ${args.model}`);
          rl?.pause();
          let apiKey;
          try {
            apiKey = getKey(args.provider);
          } finally {
            rl?.resume();
          }
          return generateEntry(value, args, apiKey);
        },
      });
    } while (!args.word);
  } finally {
    rl?.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\nFatal:', err.message);
    process.exitCode = 1;
  });
}
