#!/usr/bin/env node
/**
 * Validates a normalized vocab JSON file against the schema rules.
 * Exits with code 1 if violations are found.
 *
 * Usage:
 *   node scripts/validate-vocab.js [options]
 *
 * Options:
 *   --input FILE   JSON file to validate (default: vocab-normalized.json)
 *   --warn-only    Print violations but exit 0 (useful for CI soft-checks)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = parseArgs(process.argv.slice(2));
const INPUT_FILE = args['input'] ?? path.join(ROOT, 'vocab-normalized.json');
const WARN_ONLY  = args['warn-only'] === true;

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set(['common', 'proper', 'phrase', 'prefix']);
const VALID_POS   = new Set(['n', 'v', 'adj', 'adv', 'prep', 'conj', 'interj', 'phrase', 'prefix', 'unknown']);

const DEF_MIN_WORDS = 5;
const DEF_MAX_WORDS = 60;
const EXAMPLE_MIN   = 1;
const EXAMPLE_MAX   = 2;
const DEF_MAX       = 2;

/** Very naive stem check: returns true if the word (or a clear derivative) appears in text */
function containsSelfReference(word, text) {
  if (!word || !text) return false;

  const textLower = text.toLowerCase();
  const wordLower = word.toLowerCase();

  // Multi-word entries: check each significant word (4+ chars)
  const tokens = wordLower.split(/\s+/).filter((t) => t.length >= 4 && !/^(the|and|for|with|that|this|from|into|upon)$/.test(t));

  for (const token of tokens) {
    // Strip common suffixes to get a rough stem
    const stem = token
      .replace(/(?:tion|sion|ness|ment|ity|ous|ful|ish|ive|ing|ed|er|est|ly|al|ic)$/, '')
      .replace(/e$/, '');

    if (stem.length < 3) continue;

    // Check if the stem appears as a standalone word root in the definition
    const pattern = new RegExp(`\\b${escapeRegex(stem)}`, 'i');
    if (pattern.test(textLower)) return true;
  }

  return false;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordCount(str) {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

function validate(entries) {
  const violations = [];
  const ids = new Map();
  const words = new Map();
  let reviewCount = 0;

  function fail(index, word, rule, detail) {
    violations.push({ index, word, rule, detail });
  }

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const tag = `[${i}] "${e?.word ?? '(missing)'}"`;

    // Required fields
    if (!e || typeof e !== 'object') { fail(i, '?', 'SCHEMA', 'Entry is not an object'); continue; }

    for (const field of ['id', 'word', 'type', 'partOfSpeech', 'definitions', 'examples']) {
      if (e[field] === undefined || e[field] === null) {
        fail(i, e.word, 'MISSING_FIELD', `Required field "${field}" is missing`);
      }
    }

    // id format
    if (e.id && !/^[a-z0-9-]+$/.test(e.id)) {
      fail(i, e.word, 'BAD_ID', `id "${e.id}" contains invalid characters (must be lowercase a-z, 0-9, hyphens)`);
    }

    // Duplicate id
    if (e.id) {
      if (ids.has(e.id)) {
        fail(i, e.word, 'DUPLICATE_ID', `id "${e.id}" already used by entry ${ids.get(e.id)}`);
      } else {
        ids.set(e.id, i);
      }
    }

    // Duplicate word
    if (e.word) {
      const wLower = e.word.toLowerCase();
      if (words.has(wLower)) {
        fail(i, e.word, 'DUPLICATE_WORD', `Word "${e.word}" duplicates entry ${words.get(wLower)}`);
      } else {
        words.set(wLower, i);
      }
    }

    // type
    if (e.type && !VALID_TYPES.has(e.type)) {
      fail(i, e.word, 'BAD_TYPE', `type "${e.type}" is not one of: ${[...VALID_TYPES].join(', ')}`);
    }

    // partOfSpeech — allow "/" separators, validate individual tokens
    if (e.partOfSpeech) {
      const posTokens = e.partOfSpeech.split('/').map((s) => s.trim().toLowerCase());
      for (const tok of posTokens) {
        if (!VALID_POS.has(tok)) {
          fail(i, e.word, 'BAD_POS', `partOfSpeech token "${tok}" not recognised (valid: ${[...VALID_POS].join(', ')})`);
        }
      }
    }

    // definitions array
    if (Array.isArray(e.definitions)) {
      if (e.definitions.length < 1 || e.definitions.length > DEF_MAX) {
        fail(i, e.word, 'DEFINITION_COUNT', `definitions must have 1-${DEF_MAX} elements, got ${e.definitions.length}`);
      }
      for (let di = 0; di < e.definitions.length; di++) {
        const def = e.definitions[di];
        if (typeof def !== 'string' || !def.trim()) {
          fail(i, e.word, 'EMPTY_DEFINITION', `definitions[${di}] is empty`);
          continue;
        }
        const wc = wordCount(def);
        if (wc < DEF_MIN_WORDS) {
          fail(i, e.word, 'DEF_TOO_SHORT', `definitions[${di}] has ${wc} words (min ${DEF_MIN_WORDS}): "${def}"`);
        }
        if (wc > DEF_MAX_WORDS) {
          fail(i, e.word, 'DEF_TOO_LONG', `definitions[${di}] has ${wc} words (max ${DEF_MAX_WORDS})`);
        }
        // Self-reference check (skip for proper nouns — names can appear in context)
        if (e.type !== 'proper' && containsSelfReference(e.word, def)) {
          fail(i, e.word, 'SELF_REFERENCE', `definitions[${di}] may contain the word itself: "${def}"`);
        }
      }
    } else if (e.definitions !== undefined) {
      fail(i, e.word, 'SCHEMA', 'definitions must be an array');
    }

    // examples array
    if (Array.isArray(e.examples)) {
      if (e.examples.length < EXAMPLE_MIN) {
        fail(i, e.word, 'NO_EXAMPLES', `At least ${EXAMPLE_MIN} example sentence required`);
      }
      if (e.examples.length > EXAMPLE_MAX) {
        fail(i, e.word, 'TOO_MANY_EXAMPLES', `At most ${EXAMPLE_MAX} examples allowed, got ${e.examples.length}`);
      }
      for (let ei = 0; ei < e.examples.length; ei++) {
        if (typeof e.examples[ei] !== 'string' || !e.examples[ei].trim()) {
          fail(i, e.word, 'EMPTY_EXAMPLE', `examples[${ei}] is empty`);
        }
      }
    } else if (e.examples !== undefined) {
      fail(i, e.word, 'SCHEMA', 'examples must be an array');
    }

    // reviewNeeded type
    if (e.reviewNeeded !== undefined && typeof e.reviewNeeded !== 'boolean') {
      fail(i, e.word, 'SCHEMA', 'reviewNeeded must be a boolean');
    }
    if (e.reviewNeeded) reviewCount++;
  }

  return { violations, reviewCount };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function groupByRule(violations) {
  const grouped = new Map();
  for (const v of violations) {
    if (!grouped.has(v.rule)) grouped.set(v.rule, []);
    grouped.get(v.rule).push(v);
  }
  return grouped;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { result[key] = next; i++; }
      else result[key] = true;
    }
  }
  return result;
}

function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Error: file not found: ${INPUT_FILE}`);
    process.exit(1);
  }

  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  } catch (err) {
    console.error(`Error: could not parse JSON from ${INPUT_FILE}: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(entries)) {
    console.error('Error: expected a JSON array at the top level');
    process.exit(1);
  }

  console.log(`Validating ${entries.length} entries from ${INPUT_FILE}\n`);

  const { violations, reviewCount } = validate(entries);
  const grouped = groupByRule(violations);

  if (violations.length === 0) {
    console.log(`✓ All ${entries.length} entries pass validation`);
    console.log(`  ${reviewCount} flagged for human review (reviewNeeded=true)`);
    process.exit(0);
  }

  // Print violations grouped by rule
  for (const [rule, items] of grouped) {
    console.log(`\n── ${rule} (${items.length})`);
    const shown = items.slice(0, 10);
    for (const v of shown) {
      console.log(`  [${v.index}] ${v.word}: ${v.detail}`);
    }
    if (items.length > 10) {
      console.log(`  … and ${items.length - 10} more`);
    }
  }

  console.log(`\n─────────────────────────────────────`);
  console.log(`Total violations: ${violations.length} across ${grouped.size} rule(s)`);
  console.log(`Entries reviewed: ${entries.length}`);
  console.log(`Flagged for review (reviewNeeded=true): ${reviewCount}`);

  if (WARN_ONLY) {
    console.log(`\nWarn-only mode: exiting 0 despite violations`);
    process.exit(0);
  } else {
    console.log(`\nFix violations before proceeding. Use --warn-only to suppress exit code.`);
    process.exit(1);
  }
}

main();
