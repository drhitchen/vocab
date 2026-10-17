# Security Code Review: Vocab Builder

**Date:** 2026-10-17 (supersedes 2026-08-01)  
**Scope:** `src/`, `scripts/add-word.js` and tests, `index.html`, `mockups/`, `.github/` (workflow, Dependabot), `package.json`, `vite.config.ts`, structure and content scan of `public/vocab.json`  
**Reviewed range:** `e020a78..7959687`  
**Companion:** `security-threat-model.md`  
**Methodology:** OWASP Top 10, CWE, diff review, exploitability verification, `npm audit`

---

## Executive Summary

No new exploitable vulnerabilities were found. Nothing is Critical, High, or Medium. Of the five findings from 2026-08-01, two are fixed (schema validation, Actions pinning), one is mitigated, and two are unchanged (no CSP, `Math.random`).

The SPA is clean: no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function` in `src/`. Design and theme values read from `localStorage` are checked against strict allowlists before use. The rewritten CLI keeps provider hosts hard-coded, passes the provider to the key prompt as a positional shell parameter (never interpolated), and validates generated entries before saving.

Six low-severity items remain, all hardening or hygiene:

1. **F-001** CLI entry validation is shallow (no allowlist, extra keys persisted).
2. **F-002** Raw LLM text printed to the terminal (escape sequence spoofing).
3. **F-003** No CSP, and the new inline theme script constrains the fix.
4. **F-004** One CI job runs `npm ci` and the build while holding deploy permissions.
5. **F-005** Nine dev-time npm advisories (zero in production dependencies).
6. **F-006** SPA does not validate the shape of `vocab.json` entries or progress data.

---

## Status of Previous Findings

| Previous ID | Previous Severity | Status | Evidence |
|---|---|---|---|
| F-001 No schema validation | High | **Fixed** (residue in F-001/F-002 below) | `validateEntry()` at `scripts/add-word.js:164`, called at `:328` before `saveJson` at `:348` |
| F-002 Word in LLM prompt | Medium | **Mitigated** | `safeWord` strips `"`, `'`, `\`, backtick and truncates to 100 chars (`:228`). Newlines are not stripped, but input is the developer's own argument and F-001 output validation is the real control |
| F-003 Floating Action tags | Medium | **Fixed** | All four pinned to SHAs; each SHA verified against its commented upstream tag (checkout v7, setup-node v7, upload-pages-artifact v5, deploy-pages v5). Dependabot covers `github-actions` and `npm` |
| F-004 No CSP | Low | **Open** | Now F-003 |
| F-005 `Math.random` | Low | **Accepted** | `src/utils/shuffle.ts:4`, study ordering only |

---

## Pre-Analysis

### Existing Security Controls

| Control | Status |
|---|---|
| React text escaping, no HTML sinks in `src/` | Present |
| Allowlist validation of `vocab-builder-design` and `vocab-builder-theme` | Present (`index.html:11-23`, `src/appearance/appearance.tsx:21-72`) |
| External link `rel="noopener noreferrer"`, `encodeURIComponent`, fixed host | Present (`EntryCard.tsx:89-91`) |
| Entry validation before save | Present, shallow (F-001) |
| Provider allowlist (`Object.hasOwn(PROVIDERS, ...)`), hard-coded hosts and paths | Present |
| Hidden key prompt via `zsh -f -c` with positional parameter | Present (`add-word.js:41-47`) |
| Atomic write (tmp + rename), re-read before delete, duplicate id rejected | Present |
| 120 s request timeout, default TLS verification, no redirects followed | Present (`:287`) |
| Actions pinned to SHAs, Dependabot, `npm ci` | Present |
| Content Security Policy | Absent (F-003) |
| Least-privilege job split in CI | Absent (F-004) |

### Security-Critical Files

| File | Purpose | Risk |
|---|---|---|
| `scripts/add-word.js` | LLM calls, key handling, file writes | Low-Medium |
| `.github/workflows/deploy.yml` | CI/CD with OIDC deploy rights | Low-Medium |
| `index.html` | Inline theme script | Low |
| `src/appearance/appearance.tsx` | localStorage to DOM attributes | Low |
| `src/hooks/useProgress.ts`, `src/data/vocab.ts` | Storage and data parsing | Low |
| `mockups/mockup.js` | `innerHTML` on constants (not deployed) | Informational |

---

## Findings

### F-001: Shallow Entry Validation in CLI

**Severity:** Low  
**CWE:** CWE-20, CWE-1284  
**Priority:** P3  
**Confidence:** 7/10  
**Threat Model Ref:** T-001

**Location:** `scripts/add-word.js:164-185` (validation), `:328` and `:348` (validate then save)

**Description:**  
`validateEntry()` checks required fields, the `type` enum, 1 to 2 string definitions, string examples, and rejects `<tag>` patterns. It does not type-check `partOfSpeech`, `reviewNeeded`, or `reviewReason` (null check only), applies no length caps, and the whole model object is persisted, including unknown keys. The `/<[^>]+>/` test is not the real XSS control; React text escaping is. A wrong-typed `partOfSpeech` (object or array) passes validation and is saved. `loadWords()` does not type-check it, so rendering could break for every visitor (availability impact, no code execution).

**Evidence:** `public/vocab.json` is currently clean: 2126 entries, all objects, no `<`, `>`, `&`, or ESC characters in any string field.

**Suggested Fix:**
```js
const ALLOWED = ['id', 'word', 'type', 'partOfSpeech', 'definitions', 'examples', 'reviewNeeded', 'reviewReason'];
function sanitizeEntry(entry) {
  const out = Object.fromEntries(ALLOWED.filter((k) => k in entry).map((k) => [k, entry[k]]));
  if (typeof out.partOfSpeech !== 'string' || !/^[a-z/ ]{1,30}$/i.test(out.partOfSpeech)) {
    throw new Error('partOfSpeech must be a short string');
  }
  if (out.reviewNeeded != null && typeof out.reviewNeeded !== 'boolean') throw new Error('reviewNeeded must be boolean');
  if (out.reviewReason != null && typeof out.reviewReason !== 'string') throw new Error('reviewReason must be a string');
  return out;
}
```
Also cap string lengths (for example 500 chars for definitions and examples).

---

### F-002: LLM Text Printed Unescaped to the Terminal

**Severity:** Low  
**CWE:** CWE-150 (Improper Neutralization of Escape, Meta, or Control Sequences)  
**Priority:** P3  
**Confidence:** 7/10  
**Threat Model Ref:** T-011

**Location:** `scripts/add-word.js:102-120` (`display()`)

**Description:**  
`display()` interpolates `entry.word`, definitions, examples, `partOfSpeech`, and `reviewReason` into terminal output without stripping control characters. A manipulated model response could embed ANSI or OSC sequences to hide or spoof content in the preview that the user relies on when confirming a save. Exploitation requires a hostile model response, and the user still confirms each save.

**Suggested Fix:**
```js
const stripControl = (s) => String(s).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '');
// apply to every model-derived string before display(), and before saving
```
Rejecting entries that contain control characters in `validateEntry()` covers both the preview and the saved file.

---

### F-003: No Content Security Policy (and an Inline Script Complicates One)

**Severity:** Low  
**CWE:** CWE-1021  
**Priority:** P3  
**Confidence:** 9/10 that the gap exists; defense in depth only  
**Threat Model Ref:** T-004  
**Previously:** F-004

**Location:** `index.html:8-24`

**Description:**  
There is still no `<meta http-equiv="Content-Security-Policy">`, and GitHub Pages cannot set headers. The new inline script that applies the saved design and theme before first paint means a bare `script-src 'self'` would break the app. There are no HTML sinks today, so this is hardening only.

**Suggested Fix:**
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self' 'sha256-<hash of inline script>'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'">
```
Alternatively, move the theme script to `public/theme-init.js` and use `script-src 'self'`. `style-src 'unsafe-inline'` (or `style-src-attr`) is needed for React inline `style` props. `frame-ancestors` is ignored in meta tags. If the inline script changes, the hash must be regenerated; a build step or the external-file approach avoids that.

---

### F-004: Deploy Permissions Held by the Job That Runs `npm ci` and the Build

**Severity:** Low  
**CWE:** CWE-250, CWE-829  
**Priority:** P3  
**Confidence:** 6/10  
**Threat Model Ref:** T-002

**Location:** `.github/workflows/deploy.yml:7-10` (permissions), `:17-30` (steps)

**Description:**  
A single job has `pages: write` and `id-token: write` while executing third-party npm lifecycle and build code. A compromised dev dependency could abuse the OIDC token or alter `dist/` before upload. Actions are SHA-pinned and the lockfile is enforced, so likelihood is low.

**Suggested Fix:**
```yaml
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<sha>
      - uses: actions/setup-node@<sha>
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@<sha>
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@<sha>
```

---

### F-005: Dev-Time npm Advisories

**Severity:** Low  
**CWE:** CWE-1333 (ReDoS), CWE-400  
**Priority:** P3  
**Confidence:** 9/10  
**Threat Model Ref:** T-010

**Location:** `package-lock.json` (transitive dev dependencies)

**Description:**  
`npm audit` reports 9 advisories (7 high, 2 moderate): tailwindcss 3 chain, braces, micromatch, fast-glob, chokidar, postcss-selector-parser, postcss-nested, nanoid (<3.3.18), source-map-js. They are ReDoS or event-loop DoS issues in build tooling processing trusted input. `npm audit --omit=dev` reports **0 vulnerabilities**, so nothing reaches the shipped bundle.

**Suggested Fix:** `npm audit fix` resolves nanoid and source-map-js without breaking changes. The Tailwind chain needs a Tailwind 4 migration (breaking). Dependabot is already configured for npm.

---

### F-006: No Runtime Shape Validation of `vocab.json` or Progress Data

**Severity:** Low (Informational)  
**CWE:** CWE-20  
**Priority:** P3  
**Confidence:** 8/10  
**Threat Model Ref:** T-005, T-006

**Location:** `src/data/vocab.ts:11-22`, `src/hooks/useProgress.ts:8-12`

**Description:**  
`loadWords()` filters on `id`, `word`, and `definitions?.length` but does not check types, nor `response.ok` (a non-JSON error body is caught by the `.catch` in `App.tsx:27`). `loadFromStorage()` wraps `JSON.parse` in try/catch but accepts any valid JSON shape, so a corrupt value could produce `NaN` or a client-side crash. All values render as React text nodes, so there is no injection path, and the progress case is self-affecting.

**Suggested Fix:** Add a small type guard (string checks on `word`, `definitions`, `examples`; numeric checks on card fields) and drop entries that fail.

---

### Informational

- **`Math.random()` in `src/utils/shuffle.ts:4`:** used for study ordering only. No action.
- **Data typo:** `public/vocab.json:28693` contains the key `partOfSheech` (should be `partOfSpeech`). Harmless to security, but the affected entry silently falls back to an empty part of speech.
- **`Spelling.tsx`:** not imported anywhere; not part of the live app.
- **Uncommitted change:** `public/vocab.json` has working-tree modifications; the content scan covered the current file.

---

## Consistency Analysis

### Rendering of Vocabulary Data

No `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval`, or `new Function` anywhere in `src/` (grep verified). All vocabulary, definition, example, and word text renders as JSX text nodes, including the new Browse, Home, EntryCard, SessionSummary, and the five mode components. Inline `style` props receive numeric widths and flex values derived from counts only.

### Persistence of Design and Theme

| Location | Source | Validation |
|---|---|---|
| `index.html:11-23` (pre-paint script) | `vocab-builder-design`, `vocab-builder-theme` | Strict equality against allowlists, fallback to defaults, try/catch |
| `src/appearance/appearance.tsx:21-72` | same keys | Allowlist before `dataset.design`, `dataset.theme`, `colorScheme` |

Nothing from storage reaches `className` or CSS selectors unvalidated.

### Mockups

`mockups/mockup.js` uses `insertAdjacentHTML` and `innerHTML` only with hard-coded `WORDS` passed through `esc()` (escapes `& < > " '`) or static switcher constants. `location.hash` is compared against an allowlist of screen names and used only as a fragment. Mockups are not in `dist/` (contains `assets/`, `index.html`, `vocab.json`).

### CLI: Keys, Network, Shell, Files

- Keys: environment or hidden prompt; sent only in request headers; never logged or included in errors.
- Network: hostnames and paths are constants (`api.anthropic.com` `/v1/messages`, `api.openai.com` `/v1/responses`); no configurable base URL, so no SSRF or key redirection.
- Shell: the only `child_process` use is `spawnSync('/bin/zsh', ['-f', '-c', <fixed script>, 'vocab-key', provider])`. The provider is allowlisted and passed as `$1`; user input is never interpolated into the script.
- Files: `--file` is a local trusted argument; writes are tmp + rename; delete re-reads before filtering; duplicate ids rejected on add; `id` and `word` overwritten from trusted input.

---

## Dependency Audit

| Package | Version | Scope | Notes |
|---|---|---|---|
| `react`, `react-dom` | `^19.2.8` | Runtime | `npm audit --omit=dev`: 0 vulnerabilities |
| `vite` | `^8.2.0` | Dev | Not in bundle |
| `@vitejs/plugin-react` | `^6.0.5` | Dev | Not in bundle |
| `typescript` | `~5.6.2` | Dev | Not in bundle |
| `tailwindcss` | `^3.4.19` | Dev | Source of most advisories (F-005) |
| `autoprefixer`, `postcss` | `^10.5.4`, `^8.5.25` | Dev | CSS only |

Runtime attack surface is `react` and `react-dom` only. `npm ci` is used in CI.

---

## Finding Summary

| ID | Severity | Priority | File | Description | Threat Model Ref |
|---|---|---|---|---|---|
| F-001 | Low | P3 | `scripts/add-word.js:164` | Shallow entry validation, extra keys persisted | T-001 |
| F-002 | Low | P3 | `scripts/add-word.js:102` | Control characters in LLM text printed to terminal | T-011 |
| F-003 | Low | P3 | `index.html:8` | No CSP; inline theme script needs a hash or external file | T-004 |
| F-004 | Low | P3 | `.github/workflows/deploy.yml:7` | Deploy permissions held by build job | T-002 |
| F-005 | Low | P3 | `package-lock.json` | 9 dev-time advisories, 0 in production | T-010 |
| F-006 | Info | P3 | `src/data/vocab.ts:11` | No runtime shape validation of data or progress | T-005, T-006 |

### Not Found / Confirmed Mitigated

| Check | Result |
|---|---|
| `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function` in `src/` | Not present |
| Tabnapping on external link | `rel="noopener noreferrer"` present |
| Hardcoded secrets | None; keys from env or hidden prompt |
| Shell or command injection in CLI | Not present (fixed script, allowlisted positional arg) |
| SSRF / key redirection | Not possible (constant hosts, no base URL option) |
| localStorage to DOM injection | Allowlisted |
| Unpinned Actions | All four pinned and verified |
| Production dependency vulnerabilities | 0 |
| SQL injection, CSRF, auth bypass | Not applicable (static site) |

---

## Recommended Order of Work

1. F-001 and F-002 together (allowlist-build and sanitize the entry in one pass, add tests to `scripts/add-word.test.js`).
2. F-004 (workflow job split).
3. F-003 (CSP, after deciding whether to externalize the theme script).
4. F-005 (`npm audit fix`; schedule Tailwind 4).
5. F-006 (optional type guards).
