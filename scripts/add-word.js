#!/usr/bin/env node
/**
 * Add a new word to the normalized vocab JSON, or look up an existing one.
 * Uses the Anthropic API to generate definition, examples, and metadata.
 *
 * Usage:
 *   node scripts/add-word.js [word]           # word optional; prompts if omitted
 *   node scripts/add-word.js --file FILE      # target JSON (default: public/vocab.json)
 *   node scripts/add-word.js --model NAME     # Claude model (default: claude-sonnet-4-5)
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import readline from 'readline';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = parseArgs(process.argv.slice(2));
const JSON_FILE   = args['file']   ?? path.join(ROOT, 'public', 'vocab.json');
const LOOKUP_ONLY = !!args['lookup'];
const MODEL       = args['model']  ?? 'claude-sonnet-4-5';
// First positional arg (if any) is treated as the word
const WORD_ARG  = args['_']?.[0] ?? null;

// ---------------------------------------------------------------------------
// API key
// ---------------------------------------------------------------------------

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY && !LOOKUP_ONLY) {
  console.error(`
Error: ANTHROPIC_API_KEY is not set.

  export ANTHROPIC_API_KEY=sk-ant-...
  node scripts/add-word.js
`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load / save JSON
// ---------------------------------------------------------------------------

function loadJson() {
  if (!fs.existsSync(JSON_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveJson(entries) {
  // Write atomically via a temp file
  const tmp = JSON_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, JSON_FILE);
}

// ---------------------------------------------------------------------------
// Lookup — case-insensitive match on word or id
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

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// ---------------------------------------------------------------------------
// Claude API
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

Return ONLY valid JSON — no markdown, no commentary.`;

async function generateEntry(word) {
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Generate a vocab entry for the word: "${word}"

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
}`,
      },
    ],
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`API error ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            const msg = JSON.parse(data);
            const text = msg.content[0].text.trim()
              .replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '');
            resolve(JSON.parse(text));
          } catch (e) {
            reject(new Error(`JSON parse error: ${e.message}\nRaw: ${data.slice(0, 300)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main() {
  // --lookup: display and exit, no prompts or API calls
  if (LOOKUP_ONLY) {
    // word comes from positional arg OR as the value of --lookup (e.g. --lookup detent)
    const word = WORD_ARG ?? (typeof args['lookup'] === 'string' ? args['lookup'] : null);
    if (!word) { console.error('Usage: add-word.js --lookup <word>'); process.exit(1); }
    const entry = findEntry(loadJson(), word);
    if (entry) {
      display(entry);
      process.exit(0);
    } else {
      console.log(`\n  "${word}" not in vocabulary.\n`);
      console.log(`  Add it: node scripts/add-word.js ${word}\n`);
      process.exit(1);
    }
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  // Suppress the default "close" behavior so we can loop
  rl.on('SIGINT', () => { console.log('\nBye!'); rl.close(); process.exit(0); });

  console.log(`\nVocab Word Tool  (model: ${MODEL})`);
  console.log(`File: ${JSON_FILE}`);
  console.log(`Type a word to look it up or add it. Ctrl-C to quit.\n`);

  let firstWord = WORD_ARG;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let word;
    if (firstWord) {
      word = firstWord.trim();
      firstWord = null;
      console.log(`Looking up: ${word}`);
    } else {
      word = (await prompt(rl, 'Word: ')).trim();
      if (!word) continue;
    }

    const entries = loadJson();
    const existing = findEntry(entries, word);

    if (existing) {
      console.log(`\n  \x1b[32m✓ Found in vocabulary\x1b[0m`);
      display(existing);
      const again = await prompt(rl, 'Update this entry? [y/N] ');
      if (again.toLowerCase() !== 'y') continue;
    }

    // Generate via API
    process.stdout.write(`  Generating entry for "${word}"…`);
    let entry;
    try {
      entry = await generateEntry(word);
      // Ensure id is correct regardless of model output
      entry.id = slugify(entry.word ?? word);
      console.log(' done\n');
    } catch (err) {
      console.log(` FAILED: ${err.message}\n`);
      continue;
    }

    display(entry);

    const save = await prompt(rl, 'Add to vocabulary file? [Y/n] ');
    if (save.toLowerCase() === 'n') {
      console.log('  Discarded.\n');
      continue;
    }

    const fresh = loadJson(); // re-read in case normalizer wrote new data
    const idx = fresh.findIndex((e) => e.id === entry.id);
    if (idx >= 0) {
      fresh[idx] = entry; // update existing
      console.log(`  Updated existing entry for "${entry.word}".\n`);
    } else {
      // Insert alphabetically by word
      const insertAt = fresh.findIndex((e) => (e.word ?? '').toLowerCase() > entry.word.toLowerCase());
      if (insertAt === -1) fresh.push(entry);
      else fresh.splice(insertAt, 0, entry);
      console.log(`  Added "${entry.word}" (${fresh.length} total entries).\n`);
    }

    saveJson(fresh);
  }
}

// ---------------------------------------------------------------------------
// Arg parser
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const result = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { result[key] = next; i++; }
      else result[key] = true;
    } else {
      result._.push(arg);
    }
  }
  return result;
}

main().catch((err) => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
