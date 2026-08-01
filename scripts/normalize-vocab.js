#!/usr/bin/env node
/**
 * Reads vocab.txt, normalizes each entry via the Anthropic API, and writes
 * vocab-normalized.json.  Run with ANTHROPIC_API_KEY set in the environment.
 *
 * Usage:
 *   node scripts/normalize-vocab.js [options]
 *
 * Options:
 *   --input  FILE   Source file  (default: vocab.txt)
 *   --output FILE   Output file  (default: vocab-normalized.json)
 *   --review FILE   Review file  (default: vocab-review-needed.json)
 *   --batch  N      Entries per API call (default: 25)
 *   --model  NAME   Claude model (default: claude-3-5-haiku-20241022)
 *   --no-resume     Start fresh, ignoring any saved progress
 *   --dry-run       Print first batch prompt and exit without calling the API
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = parseArgs(process.argv.slice(2));
const INPUT_FILE    = args['input']  ?? path.join(ROOT, 'vocab.txt');
const OUTPUT_FILE   = args['output'] ?? path.join(ROOT, 'vocab-normalized.json');
const REVIEW_FILE   = args['review'] ?? path.join(ROOT, 'vocab-review-needed.json');
const PROGRESS_FILE = path.join(ROOT, 'vocab-normalize-progress.json');
const BATCH_SIZE    = parseInt(args['batch'] ?? '25', 10);
const MODEL         = args['model']  ?? 'claude-3-5-haiku-20241022';
const NO_RESUME     = args['no-resume'] === true;
const DRY_RUN       = args['dry-run']   === true;

// ---------------------------------------------------------------------------
// API key — read from environment only, never prompt or log
// ---------------------------------------------------------------------------

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error(`
Error: ANTHROPIC_API_KEY is not set.

Set it before running:
  export ANTHROPIC_API_KEY=sk-ant-...
  node scripts/normalize-vocab.js

To persist across terminal sessions, add the export to ~/.zshrc (never commit
your key to the repository).
`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Parse vocab.txt
// ---------------------------------------------------------------------------

function parseVocabFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const seen = new Map(); // word (lowercase) → first entry
  const entries = [];

  for (const line of raw.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const word = line.slice(0, tab).trim();
    const definition = line.slice(tab + 1).trim();
    if (!word || !definition) continue;

    const key = word.toLowerCase();
    if (seen.has(key)) continue; // keep first occurrence of duplicates
    seen.set(key, true);
    entries.push({ word, definition });
  }

  return entries;
}

function slugify(word) {
  return word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Progress persistence
// ---------------------------------------------------------------------------

function loadProgress() {
  if (NO_RESUME || !fs.existsSync(PROGRESS_FILE)) return new Set();
  try {
    const data = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    return new Set(data.processedIds ?? []);
  } catch {
    return new Set();
  }
}

function saveProgress(processedIds) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ processedIds: [...processedIds] }, null, 2));
}

// ---------------------------------------------------------------------------
// Claude API call (native https, no extra dependencies)
// ---------------------------------------------------------------------------

async function callClaude(userPrompt, retries = 3) {
  const body = JSON.stringify({
    model: MODEL,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await new Promise((resolve, reject) => {
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
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
          }
        );
        req.on('error', reject);
        req.write(body);
        req.end();
      });

      if (response.status === 429 || response.status === 529) {
        const wait = attempt * 15000;
        console.log(`  Rate limited, waiting ${wait / 1000}s before retry ${attempt}/${retries}…`);
        await sleep(wait);
        continue;
      }

      if (response.status !== 200) {
        throw new Error(`API returned ${response.status}: ${response.body.slice(0, 200)}`);
      }

      const parsed = JSON.parse(response.body);
      return parsed.content[0].text;
    } catch (err) {
      if (attempt === retries) throw err;
      console.log(`  Error on attempt ${attempt}: ${err.message}, retrying…`);
      await sleep(5000 * attempt);
    }
  }
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a precise vocabulary dictionary editor. For each vocabulary entry you receive, produce a clean, normalized JSON object following these rules:

DEFINITION RULES:
- Write 10-25 words in plain, everyday English
- NEVER use the word itself or any morphological derivative in the definition
  (e.g., defining "abase" must not use "base", "abased", "abasement", etc.)
- No dictionary boilerplate: avoid "especially", "often used to", "as in"
- No cross-references like "see also [word]"
- If the original definition was truncated (ends mid-sentence), write a complete one from your knowledge
- If the word genuinely has 2 completely different meanings (not just different contexts), include both as separate definition strings; otherwise include exactly 1

EXAMPLES:
- Write 1-2 natural sentences that use the word in context
- Examples must demonstrate the word's meaning through context, not just restate the definition
- One example per sense when 2 definitions are given

CLASSIFICATION:
- type: "common" (ordinary word), "proper" (proper noun or name), "phrase" (multi-word expression), "prefix" (word element/affix)
- partOfSpeech: "n", "v", "adj", "adv", "prep", "conj", "interj", "phrase", "prefix"
  Use "/" to separate multiple (e.g., "n/v" for words that are both)

REVIEW FLAG:
Set reviewNeeded=true if: the original definition was truncated or clearly wrong, the word is highly obscure and you are uncertain, or the word has conflicting common usages.

OUTPUT:
Return ONLY a valid JSON array. No markdown fences, no commentary, no extra text.`;

function buildUserPrompt(batch) {
  const lines = batch
    .map(({ word, definition }) => `${word} | ${definition}`)
    .join('\n');

  return `Process these vocabulary entries. Return a JSON array with exactly ${batch.length} objects.

Schema for each object:
{
  "id": string,           // slugified: lowercase, spaces and punctuation → hyphens
  "word": string,         // original word exactly as given
  "type": "common"|"proper"|"phrase"|"prefix",
  "partOfSpeech": string, // e.g. "n", "v", "adj", "n/v"
  "definitions": string[],// 1 or 2 elements
  "examples": string[],   // 1 or 2 elements (one per definition if 2 definitions)
  "reviewNeeded": boolean,
  "reviewReason": string  // empty string when reviewNeeded is false
}

Entries (word | original definition):
${lines}`;
}

// ---------------------------------------------------------------------------
// Output file management — append in chunks as we go
// ---------------------------------------------------------------------------

function loadExistingOutput() {
  if (!fs.existsSync(OUTPUT_FILE)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeOutput(allEntries) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allEntries, null, 2));
}

function writeReviewFile(reviewEntries) {
  fs.writeFileSync(REVIEW_FILE, JSON.stringify(reviewEntries, null, 2));
}

// ---------------------------------------------------------------------------
// JSON extraction — handle cases where the model wraps output in code fences
// ---------------------------------------------------------------------------

function extractJson(text) {
  const clean = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
  return JSON.parse(clean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Vocab Normalizer`);
  console.log(`  Input:  ${INPUT_FILE}`);
  console.log(`  Output: ${OUTPUT_FILE}`);
  console.log(`  Model:  ${MODEL}`);
  console.log(`  Batch:  ${BATCH_SIZE}`);
  console.log();

  const allEntries = parseVocabFile(INPUT_FILE);
  console.log(`Loaded ${allEntries.length} unique entries from vocab.txt`);

  const processedIds = loadProgress();
  const existing = loadExistingOutput();
  const existingMap = new Map(existing.map((e) => [e.id, e]));

  // Re-sync processedIds from existing output in case progress file is ahead/behind
  for (const e of existing) processedIds.add(e.id);

  const todo = allEntries.filter((e) => !processedIds.has(slugify(e.word)));
  console.log(`${processedIds.size} already processed, ${todo.length} remaining\n`);

  if (todo.length === 0) {
    console.log('Nothing to do — output is already complete.');
    return;
  }

  if (DRY_RUN) {
    const firstBatch = todo.slice(0, BATCH_SIZE);
    console.log('--- DRY RUN: first batch prompt ---\n');
    console.log('SYSTEM:\n', SYSTEM_PROMPT);
    console.log('\nUSER:\n', buildUserPrompt(firstBatch));
    return;
  }

  const batches = [];
  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    batches.push(todo.slice(i, i + BATCH_SIZE));
  }

  let processed = processedIds.size;
  const reviewNeeded = existing.filter((e) => e.reviewNeeded);

  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    const pct = Math.round(((processed + batch.length) / allEntries.length) * 100);
    process.stdout.write(
      `Batch ${bi + 1}/${batches.length}  [${processed}–${processed + batch.length - 1}/${allEntries.length}]  ${pct}%  …`
    );

    let responseText;
    try {
      responseText = await callClaude(buildUserPrompt(batch));
    } catch (err) {
      console.log(` FAILED: ${err.message}`);
      console.log('  Flagging batch for manual review and continuing…');
      for (const entry of batch) {
        const id = slugify(entry.word);
        const fallback = {
          id,
          word: entry.word,
          type: 'common',
          partOfSpeech: 'unknown',
          definitions: [entry.definition],
          examples: [],
          reviewNeeded: true,
          reviewReason: `API call failed: ${err.message}`,
        };
        existingMap.set(id, fallback);
        processedIds.add(id);
        reviewNeeded.push(fallback);
      }
      writeOutput([...existingMap.values()]);
      writeReviewFile(reviewNeeded);
      saveProgress(processedIds);
      processed += batch.length;
      continue;
    }

    let parsed;
    try {
      parsed = extractJson(responseText);
      if (!Array.isArray(parsed)) throw new Error('Response is not an array');
    } catch (err) {
      console.log(` JSON PARSE ERROR: ${err.message}`);
      console.log('  Raw response snippet:', responseText.slice(0, 300));
      // Flag entire batch for review with original definitions
      for (const entry of batch) {
        const id = slugify(entry.word);
        const fallback = {
          id,
          word: entry.word,
          type: 'common',
          partOfSpeech: 'unknown',
          definitions: [entry.definition],
          examples: [],
          reviewNeeded: true,
          reviewReason: 'JSON parse error in API response',
        };
        existingMap.set(id, fallback);
        processedIds.add(id);
        reviewNeeded.push(fallback);
      }
      writeOutput([...existingMap.values()]);
      writeReviewFile(reviewNeeded);
      saveProgress(processedIds);
      processed += batch.length;
      continue;
    }

    for (const entry of parsed) {
      // Ensure id is correctly slugified regardless of what the model returned
      entry.id = slugify(entry.word ?? '');
      existingMap.set(entry.id, entry);
      processedIds.add(entry.id);
      if (entry.reviewNeeded) reviewNeeded.push(entry);
    }

    writeOutput([...existingMap.values()]);
    writeReviewFile(reviewNeeded);
    saveProgress(processedIds);

    processed += batch.length;
    console.log(` done  (${reviewNeeded.length} flagged for review so far)`);

    // Polite delay between batches to avoid rate limits
    if (bi < batches.length - 1) await sleep(1000);
  }

  console.log(`\nComplete!`);
  console.log(`  Total entries:   ${existingMap.size}`);
  console.log(`  Review needed:   ${reviewNeeded.length}`);
  console.log(`  Output file:     ${OUTPUT_FILE}`);
  console.log(`  Review file:     ${REVIEW_FILE}`);

  if (processedIds.size === allEntries.length) {
    console.log(`\nAll entries processed. You can delete ${PROGRESS_FILE} if desired.`);
  }
}

// ---------------------------------------------------------------------------
// Argument parser
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
