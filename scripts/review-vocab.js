#!/usr/bin/env node
/**
 * Interactively reviews vocab-review-needed.json entry by entry.
 * For each entry, shows the original definition (from vocab.txt) and the
 * normalized entry, then lets you accept, edit, regenerate, or skip.
 *
 * Accepted entries are updated in vocab-normalized.json and removed from
 * vocab-review-needed.json.  Skipped entries remain in the review file.
 *
 * Usage:
 *   node scripts/review-vocab.js [options]
 *
 * Options:
 *   --normalized FILE   Normalized JSON  (default: vocab-normalized.json)
 *   --review FILE       Review JSON      (default: vocab-review-needed.json)
 *   --source FILE       Source TSV       (default: vocab.txt)
 *   --model NAME        Claude model     (default: claude-sonnet-4-5)
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import readline from 'readline';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = parseArgs(process.argv.slice(2));
const NORMALIZED_FILE = args['normalized'] ?? path.join(ROOT, 'vocab-normalized.json');
const REVIEW_FILE     = args['review']     ?? path.join(ROOT, 'vocab-review-needed.json');
const SOURCE_FILE     = args['source']     ?? path.join(ROOT, 'vocab.txt');
const MODEL           = args['model']      ?? 'claude-sonnet-4-5';

// ---------------------------------------------------------------------------
// API key (only needed for regenerate)
// ---------------------------------------------------------------------------

const API_KEY = process.env.ANTHROPIC_API_KEY;

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

function loadJson(file) {
  if (!fs.existsSync(file)) return [];
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
}

function saveJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function loadOriginals(tsvFile) {
  const map = new Map();
  if (!fs.existsSync(tsvFile)) return map;
  for (const line of fs.readFileSync(tsvFile, 'utf8').split('\n')) {
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const word = line.slice(0, tab).trim();
    const def  = line.slice(tab + 1).trim();
    if (word && def) map.set(word.toLowerCase(), { word, definition: def });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const C = {
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
};

function showEntry(entry, originalDef, progress) {
  console.log('\n' + '─'.repeat(70));
  console.log(`${C.dim(progress)}  ${C.bold(entry.word)}  ${C.dim(`(${entry.partOfSpeech ?? '?'}) [${entry.type ?? '?'}]`)}`);
  console.log();

  if (originalDef) {
    console.log(C.dim('  ORIGINAL (vocab.txt):'));
    console.log(`  ${originalDef}`);
    console.log();
  }

  console.log(C.dim('  NORMALIZED:'));
  (entry.definitions ?? []).forEach((d, i) => {
    console.log(`  ${C.cyan(`def${i + 1}:`)}  ${d}`);
  });
  if ((entry.definitions ?? []).length === 0) {
    console.log(`  ${C.red('(no definitions)')}`);
  }
  (entry.examples ?? []).forEach((e, i) => {
    console.log(`  ${C.cyan(`ex${i + 1}:`)}   ${C.dim(`"${e}"`)}`);
  });

  if (entry.reviewNeeded && entry.reviewReason) {
    console.log();
    console.log(`  ${C.yellow('⚠')} ${C.dim(entry.reviewReason)}`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Inline field editor
// ---------------------------------------------------------------------------

async function editEntry(entry, rl) {
  const FIELDS = ['def1', 'def2', 'ex1', 'ex2', 'type', 'pos'];
  console.log(`  Fields: ${FIELDS.join('  ')}  ${C.dim('editor  done')}`);

  while (true) {
    const field = (await prompt(rl, '  Edit field (or done): ')).trim().toLowerCase();
    if (!field || field === 'done' || field === 'd') break;

    if (field === 'editor') {
      editInEditor(entry);
      break;
    }

    if (field === 'def1' || field === 'def2') {
      const idx = field === 'def1' ? 0 : 1;
      const cur = entry.definitions?.[idx] ?? '';
      if (cur) console.log(`  Current: ${C.dim(cur)}`);
      const val = (await prompt(rl, `  New ${field} (Enter to keep): `)).trim();
      if (val) {
        if (!entry.definitions) entry.definitions = [];
        entry.definitions[idx] = val;
        // Remove a trailing empty second definition
        if (entry.definitions[1] === undefined && idx === 1 && !val) {
          // nothing
        }
      }
    } else if (field === 'ex1' || field === 'ex2') {
      const idx = field === 'ex1' ? 0 : 1;
      const cur = entry.examples?.[idx] ?? '';
      if (cur) console.log(`  Current: ${C.dim(`"${cur}"`)}`);
      const val = (await prompt(rl, `  New ${field} (Enter to keep): `)).trim();
      if (val) {
        if (!entry.examples) entry.examples = [];
        entry.examples[idx] = val;
      }
    } else if (field === 'type') {
      console.log(`  Current: ${C.dim(entry.type)}`);
      const val = (await prompt(rl, `  New type (common/proper/phrase/prefix): `)).trim();
      if (val) entry.type = val;
    } else if (field === 'pos') {
      console.log(`  Current: ${C.dim(entry.partOfSpeech)}`);
      const val = (await prompt(rl, `  New partOfSpeech: `)).trim();
      if (val) entry.partOfSpeech = val;
    } else {
      console.log(`  ${C.yellow('Unknown field.')} Try: def1 def2 ex1 ex2 type pos editor done`);
    }
  }

  return entry;
}

function editInEditor(entry) {
  const editor = process.env.EDITOR ?? process.env.VISUAL ?? 'nano';
  const tmp = path.join(ROOT, '.review-edit-tmp.json');
  fs.writeFileSync(tmp, JSON.stringify(entry, null, 2));
  const result = spawnSync(editor, [tmp], { stdio: 'inherit' });
  if (result.error) {
    console.log(C.red(`  Could not launch ${editor}: ${result.error.message}`));
    return;
  }
  try {
    const edited = JSON.parse(fs.readFileSync(tmp, 'utf8'));
    Object.assign(entry, edited);
    console.log(C.green('  Saved from editor.'));
  } catch (err) {
    console.log(C.red(`  JSON parse error: ${err.message} — changes discarded`));
  }
  try { fs.unlinkSync(tmp); } catch {}
}

// ---------------------------------------------------------------------------
// Regenerate via Claude
// ---------------------------------------------------------------------------

const REGEN_SYSTEM = `You are a precise vocabulary dictionary editor. Given a word and its original dictionary definition, produce a clean, normalized JSON entry.

DEFINITION RULES:
- Write 10-25 words in plain, everyday English
- NEVER use the word itself or any morphological derivative in the definition
- No dictionary boilerplate or cross-references
- If the word has 2 completely different meanings, include both as separate strings; otherwise exactly 1

EXAMPLES:
- Write 1-2 natural sentences that demonstrate the word in context

CLASSIFICATION:
- type: "common" | "proper" | "phrase" | "prefix"
- partOfSpeech: "n" | "v" | "adj" | "adv" | "prep" | "conj" | "interj" | "phrase" | "prefix" (use "/" for multiple)

Set reviewNeeded=true only if genuinely uncertain.
Return ONLY valid JSON — no markdown, no commentary.`;

async function regenerate(word, originalDef) {
  if (!API_KEY) {
    console.log(C.red('  ANTHROPIC_API_KEY not set — cannot regenerate.'));
    return null;
  }

  process.stdout.write(`  Regenerating "${word}"…`);

  const body = JSON.stringify({
    model: MODEL,
    max_tokens: 1024,
    system: REGEN_SYSTEM,
    messages: [{
      role: 'user',
      content: `Word: "${word}"\nOriginal definition: "${originalDef ?? 'unknown'}"\n\nReturn a single JSON object:\n{"id":string,"word":string,"type":string,"partOfSpeech":string,"definitions":string[],"examples":string[],"reviewNeeded":boolean,"reviewReason":string}`,
    }],
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.log(C.red(` API error ${res.statusCode}`));
          resolve(null); return;
        }
        try {
          const msg = JSON.parse(data);
          const text = msg.content[0].text.trim()
            .replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '');
          const entry = JSON.parse(text);
          entry.id = entry.word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          console.log(C.green(' done'));
          resolve(entry);
        } catch (err) {
          console.log(C.red(` parse error: ${err.message}`));
          resolve(null);
        }
      });
    });
    req.on('error', (e) => { console.log(C.red(` ${e.message}`)); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Prompt helper
// ---------------------------------------------------------------------------

function prompt(rl, q) {
  return new Promise((resolve) => rl.question(q, resolve));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!fs.existsSync(REVIEW_FILE)) {
    console.log(`No review file found: ${REVIEW_FILE}`);
    process.exit(0);
  }

  const reviewList  = loadJson(REVIEW_FILE);
  const normalized  = loadJson(NORMALIZED_FILE);
  const originals   = loadOriginals(SOURCE_FILE);
  const normMap     = new Map(normalized.map((e) => [e.id, e]));

  if (reviewList.length === 0) {
    console.log('Nothing left to review — vocab-review-needed.json is empty.');
    process.exit(0);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on('SIGINT', () => { console.log('\n\nQuitting. Progress saved.\n'); rl.close(); process.exit(0); });

  console.log(`\nVocab Review Tool`);
  console.log(`  Reviewing: ${REVIEW_FILE}`);
  console.log(`  ${reviewList.length} entries to review\n`);
  console.log(`  Actions:  ${C.green('[A]ccept')}  ${C.cyan('[E]dit')}  ${C.yellow('[R]egenerate')}  ${C.dim('[S]kip  [Q]uit')}\n`);

  let remaining = [...reviewList]; // mutable working copy
  let accepted = 0, edited = 0, skipped = 0;
  const total = remaining.length;

  let i = 0;
  while (i < remaining.length) {
    const reviewEntry = remaining[i];
    const id = reviewEntry.id ?? reviewEntry.word?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Get the current normalized version (may have been updated since review list was built)
    let current = normMap.get(id) ?? reviewEntry;
    const original = originals.get(reviewEntry.word?.toLowerCase() ?? '');

    showEntry(current, original?.definition ?? null, `[${i + 1}/${remaining.length}]`);

    const action = (await prompt(rl, `  Action [A/e/r/s/q]: `)).trim().toLowerCase() || 'a';

    if (action === 'q' || action === 'quit') {
      break;
    }

    if (action === 's' || action === 'skip') {
      console.log(C.dim('  Skipped.\n'));
      skipped++;
      i++;
      continue;
    }

    if (action === 'r' || action === 'regen' || action === 'regenerate') {
      const fresh = await regenerate(current.word, original?.definition ?? null);
      if (fresh) {
        current = fresh;
        showEntry(current, original?.definition ?? null, `[${i + 1}/${remaining.length}] (regenerated)`);
        const confirm = (await prompt(rl, `  Accept regenerated? [A/e/s]: `)).trim().toLowerCase() || 'a';
        if (confirm === 's' || confirm === 'skip') { skipped++; i++; continue; }
        if (confirm === 'e' || confirm === 'edit') {
          current = await editEntry({ ...current }, rl);
          edited++;
        }
      }
      // fall through to accept
    } else if (action === 'e' || action === 'edit') {
      current = await editEntry({ ...current }, rl);
      edited++;
      showEntry(current, original?.definition ?? null, `[${i + 1}/${remaining.length}] (edited)`);
      const confirm = (await prompt(rl, `  Accept edited version? [Y/n]: `)).trim().toLowerCase();
      if (confirm === 'n') { skipped++; i++; continue; }
    }

    // Accept — mark reviewed and persist
    current.reviewNeeded = false;
    current.reviewReason = '';
    normMap.set(current.id, current);
    remaining.splice(i, 1); // remove from review list (don't increment i)
    accepted++;

    // Save after each accept so progress survives a crash
    saveJson(NORMALIZED_FILE, [...normMap.values()]);
    saveJson(REVIEW_FILE, remaining);
    console.log(C.green(`  ✓ Accepted.`) + C.dim(`  (${remaining.length} left in review queue)\n`));
  }

  rl.close();

  console.log('\n' + '─'.repeat(70));
  console.log(`Review session complete:`);
  console.log(`  Accepted: ${C.green(String(accepted))}  Edited: ${C.cyan(String(edited))}  Skipped: ${C.dim(String(skipped))}`);
  console.log(`  Remaining in review queue: ${remaining.length} / ${total}`);
  if (remaining.length === 0) {
    console.log(C.green('\n  All entries reviewed! vocab-review-needed.json is now empty.'));
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Arg parser
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const r = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const n = argv[i + 1];
      if (n && !n.startsWith('--')) { r[k] = n; i++; } else r[k] = true;
    }
  }
  return r;
}

main().catch((err) => { console.error('\nFatal:', err.message); process.exit(1); });
