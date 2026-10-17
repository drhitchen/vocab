# Threat Model: Vocab Builder

**Date:** 2026-10-17 (supersedes 2026-08-01)  
**Framework:** STRIDE + OWASP Top 10  
**Scope:** React SPA, `public/vocab.json`, `scripts/add-word.js` (local CLI), GitHub Actions CI/CD  
**Reviewed range:** `e020a78..7959687` (CLI rewrite, selectable designs, light/dark themes, new Browse/Home/shell components). Updated after the Playful design and `mockups/` were removed.  
**Author:** AI-assisted threat model  
**Follow-up:** `security-code-review.md` (file:line verification of the findings below)

---

## Executive Summary

Vocab Builder is a client-side-only vocabulary app deployed as a static site on GitHub Pages. It has no backend, no accounts, and no sensitive data. The 2026-08-01 model flagged two High threats: unvalidated LLM output written to `vocab.json` (T-001) and floating GitHub Actions tags (T-002). Both have been remediated. `validateEntry()` now gates every save, and all four Actions are pinned to commit SHAs with Dependabot covering Actions and npm.

The work since then added a rewritten CLI (provider selection for Anthropic and OpenAI, hidden API key prompt, add/update/delete), two UI designs (Editorial and Focus) with light/dark themes persisted in `localStorage`. None of this introduced an exploitable vulnerability. Persisted design and theme values are checked against strict allowlists before touching the DOM. The SPA still has no HTML sinks (`dangerouslySetInnerHTML`, `innerHTML`, `eval`).

What remains is hardening: no CSP (now complicated by a new inline theme script), a shallow allowlist in the CLI validator, raw LLM text printed to the terminal, one CI job that holds deploy permissions while running `npm ci`, and nine dev-time npm advisories (zero in production dependencies).

Overall risk posture: **Low** (previously Medium). No Critical, High, or Medium threats.

---

## System Overview

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Developer Machine (local only)                          │
│                                                          │
│  scripts/add-word.js                                     │
│    ├─ ANTHROPIC_API_KEY / OPENAI_API_KEY (env, or        │
│    │  hidden zsh prompt)                                 │
│    ├─ HTTPS to api.anthropic.com or api.openai.com       │
│    │  (hard-coded hosts, no custom base URL)             │
│    └─ validateEntry() -> atomic write                    │
│         ▼                                                │
│  public/vocab.json (2126 entries)                        │
│         │  git commit + push                             │
│         ▼                                                │
│  GitHub Actions (deploy.yml, SHA-pinned)                 │
│    npm ci && npm run build -> upload -> deploy-pages     │
│         ▼                                                │
│  GitHub Pages CDN                                        │
└──────────────────────────────────────────────────────────┘
                    │ HTTPS static fetch
                    ▼
          User Browser (any origin)
          ┌─────────────────────────────────┐
          │  React 19 SPA                   │
          │  <- vocab.json (fetch)          │
          │  <-> localStorage:              │
          │     vocab-builder-progress      │
          │     vocab-builder-design        │
          │     vocab-builder-theme         │
          └─────────────────────────────────┘
```

### Data Flow

```
[User Browser]
  ├─ GET <BASE_URL>vocab.json -> public vocabulary data
  ├─ localStorage 'vocab-builder-progress' (read/write): SRS card state
  ├─ localStorage 'vocab-builder-design'   (read/write): editorial | focus
  └─ localStorage 'vocab-builder-theme'    (read/write): light | dark
       (inline script in index.html and appearance.tsx validate both
        against allowlists, then set data-design / data-theme)

[Developer CLI, local only]
  ├─ argv: command, word, --provider, --model, --file
  ├─ env or hidden prompt: provider API key
  ├─ POST api.anthropic.com/v1/messages or api.openai.com/v1/responses
  │     <- generated entry (untrusted content)
  ├─ validateEntry(), then preview, then confirm
  └─ tmp file + rename: public/vocab.json

[GitHub Actions]
  ├─ TRIGGER: push to master
  ├─ checkout, setup-node, upload-pages-artifact, deploy-pages (SHA-pinned)
  ├─ npm ci (lockfile) -> npm run build (tsc + vite)
  └─ one job with contents:read, pages:write, id-token:write
```

### Trust Boundaries

| Boundary | Trusted Side | Untrusted Side | Controls |
|---|---|---|---|
| Browser and GitHub Pages CDN | GitHub CDN | Open internet | HTTPS |
| SPA and `localStorage` | React app | Extensions, injected scripts | Same-origin policy, allowlist for design/theme, try/catch on progress |
| `add-word.js` and LLM provider | Developer machine | Generated text | `validateEntry()`, id/word overwritten from trusted input, human confirm |
| `add-word.js` and shell | Node process | Provider name | Provider allowlist, fixed script with argument array (no interpolation) |
| `add-word.js` and file system | Developer | `--file` argument | Trusted local arg, tmp + rename write |
| Actions and third-party code | Runner | Upstream actions, npm packages | SHA pins, lockfile, Dependabot |

### User Roles

| Role | Access | Notes |
|---|---|---|
| Anonymous browser user | Read vocab.json, own localStorage | No auth |
| Developer (local) | Run CLI, commit, push | Controls vocab.json content |
| GitHub Actions runner | Build and deploy | `pages: write`, `id-token: write` |

---

## Assets

| Asset | Sensitivity | Location | Notes |
|---|---|---|---|
| `public/vocab.json` | Low-Medium | Repo, CDN | Tampering affects all users |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | High | Developer env or process memory | Never committed; `.env` is gitignored; billing exposure |
| SRS progress and UI preferences | Low | User localStorage | Non-sensitive |
| GitHub repo and CI | High | GitHub | Controls what ships |
| Deployed SPA integrity | High | GitHub Pages CDN | Tampered JS affects every visitor |

---

## Entry Points

| Entry Point | Protocol | Authentication | Trust Level |
|---|---|---|---|
| GitHub Pages URL | HTTPS | None | Untrusted (public) |
| `vocab.json` fetch | HTTPS | None | Untrusted read |
| `localStorage` (3 keys) | Browser API | Same-origin | Medium |
| CLI argv and stdin | Process | None | Developer machine |
| LLM provider responses | HTTPS | API key | Trusted service, untrusted content |
| Push to master | GitHub | GitHub auth | Trusted |
| Third-party Actions and npm packages | GitHub, npm | Pinned SHA, lockfile | Medium |

---

## Threat Analysis

### Summary

| Risk Level | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 9 |
| Informational / mitigated | 2 |
| **Total** | **11** |

### Status of 2026-08-01 Threats

| ID | Previous Risk | Now | Change |
|---|---|---|---|
| T-001 | High | Low | `validateEntry()` added; residual gaps remain |
| T-002 | High | Low | Actions SHA-pinned, Dependabot enabled; job permission split remains |
| T-003 | Medium | Low | Hidden-input key prompt added |
| T-004 | Medium | Low | Still open; new inline script affects the fix |
| T-005 to T-009 | Low | Low | Unchanged (T-006 scope grew to three keys) |

---

### Threats

#### T-001: LLM Output Poisoning of `vocab.json` (residual)

- **Category:** Tampering / OWASP A08
- **Component:** `scripts/add-word.js`, `public/vocab.json`
- **Description:** A crafted word or manipulated model response could yield a malicious or malformed entry. `validateEntry()` now enforces required fields, a `type` enum, 1 to 2 string definitions, string examples, and rejects `<tag>` patterns. `id` and `word` are overwritten from trusted input, saves are atomic, and the user confirms each one. Gaps: `partOfSpeech`, `reviewNeeded`, `reviewReason` get only null checks; unknown keys from the model are persisted; no length caps. `loadWords()` in the SPA does no type validation, so a non-string field would break rendering for all visitors (availability, not code execution).
- **Attack vector:** Hostile or injected model output with wrong-typed fields passes validation and is committed.
- **Likelihood:** Low (local tool, human confirmation, trusted provider)
- **Impact:** Low-Medium (React escapes all text, so no XSS; worst case is a crashed or corrupted UI)
- **Risk:** Low
- **CWE:** CWE-20, CWE-1284
- **Mitigation:** Build the saved object from an explicit allowlist with type and length checks. Optionally validate entry shape in `loadWords()`.
- **Priority:** P3

#### T-002: Supply Chain via CI (residual)

- **Category:** Tampering / OWASP A08
- **Component:** `.github/workflows/deploy.yml`, npm dependencies
- **Description:** Actions are pinned to full SHAs (verified against upstream tags), `npm ci` honors the lockfile, and Dependabot tracks both ecosystems. A single job still runs `npm ci` and the build (executing third-party lifecycle and build code) while holding `pages: write` and `id-token: write`.
- **Attack vector:** A compromised dev dependency runs during `npm ci` or build and abuses the job's OIDC token or alters `dist/`.
- **Likelihood:** Low
- **Impact:** High (malicious JS served to visitors)
- **Risk:** Low (after existing controls)
- **CWE:** CWE-829, CWE-250
- **Mitigation:** Split into `build` (`contents: read`) and `deploy` (`pages: write`, `id-token: write`, `environment: github-pages`) jobs, passing `dist/` as the artifact.
- **Priority:** P3

#### T-003: API Key Exposure (two providers)

- **Category:** Information Disclosure / OWASP A02
- **Component:** `scripts/add-word.js`
- **Description:** Keys come from `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, or from a hidden prompt (`zsh read -s`, provider passed as a positional parameter, not interpolated). Keys are sent only as headers to hard-coded provider hosts with default TLS verification; no custom base URL exists, so a key cannot be redirected. Error messages do not echo keys or response bodies. The scripts README still shows inline `export KEY=...` examples, which land in shell history if typed.
- **Likelihood:** Low
- **Impact:** Medium (billing, rate limits)
- **Risk:** Low
- **CWE:** CWE-312
- **Mitigation:** Document the hidden prompt or a shell profile as the preferred approach, and warn against typing keys inline.
- **Priority:** P3

#### T-004: No Content Security Policy

- **Category:** Elevation of Privilege / OWASP A05
- **Component:** `index.html`
- **Description:** GitHub Pages cannot set headers, and no CSP meta tag exists. The new inline theme script (index.html, prevents flash of wrong theme) means a plain `script-src 'self'` would break it. A CSP needs either a `sha256-` hash for that script or the script moved to an external file. React inline `style` props require `style-src 'unsafe-inline'` (or `style-src-attr`).
- **Likelihood:** Low (no HTML sinks exist)
- **Impact:** Medium (defense in depth only)
- **Risk:** Low
- **CWE:** CWE-1021
- **Mitigation:** Add a meta CSP, for example `default-src 'self'; script-src 'self' 'sha256-<hash>'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'`. Note `frame-ancestors` is ignored in meta tags.
- **Priority:** P3

#### T-005: `vocab.json` Integrity and Shape

- **Category:** Tampering / OWASP A08
- **Component:** `public/vocab.json`, `src/data/vocab.ts`
- **Description:** Same-origin static file with no integrity check. `loadWords()` filters entries lacking `id`, `word`, or `definitions`, but does not check field types or `response.ok`. The current file is clean: 2126 entries, all objects, no `<`, `>`, `&`, or ESC characters in strings.
- **Likelihood:** Low
- **Impact:** Low
- **Risk:** Low
- **CWE:** CWE-345
- **Mitigation:** Optional runtime type guard in `loadWords()`. No action required otherwise.
- **Priority:** P3

#### T-006: `localStorage` Tampering (three keys)

- **Category:** Tampering / Information Disclosure
- **Component:** `useProgress.ts`, `appearance.tsx`, inline script in `index.html`
- **Description:** `vocab-builder-design` and `vocab-builder-theme` are validated against fixed allowlists before reaching `dataset.design`, `dataset.theme`, or `colorScheme`; nothing from storage reaches `className` or selectors. `vocab-builder-progress` is parsed in try/catch without shape validation, so a malformed value can cause `NaN` or a client-side crash. Impact is self-affecting.
- **Likelihood:** Low (malicious extension or manual tampering)
- **Impact:** Low
- **Risk:** Low
- **CWE:** CWE-922, CWE-20
- **Mitigation:** Optionally validate the shape of progress entries on load.
- **Priority:** P3

#### T-007: Unthrottled Provider Calls

- **Category:** Denial of Service / OWASP A04
- **Component:** `scripts/add-word.js`
- **Description:** One call per generation request, with a 120 second timeout. No call budget or backoff; a shell loop over a large word list could incur cost.
- **Likelihood:** Low
- **Impact:** Low
- **Risk:** Low
- **CWE:** CWE-770
- **Mitigation:** Optional `--max-calls` guard. Acceptable for a single-developer tool.
- **Priority:** P3

#### T-008: `Math.random()` in `shuffle()`

- **Category:** Design risk
- **Component:** `src/utils/shuffle.ts`
- **Description:** Non-cryptographic PRNG used only for study ordering.
- **Risk:** Informational
- **CWE:** CWE-338
- **Mitigation:** None required.
- **Priority:** None

#### T-009: Tabnapping on External Link

- **Category:** Spoofing
- **Component:** `src/components/EntryCard.tsx`
- **Description:** The single `target="_blank"` link goes to a fixed `https://www.merriam-webster.com` host, with `encodeURIComponent(word.word)` and `rel="noopener noreferrer"`.
- **Risk:** Mitigated
- **CWE:** CWE-1022
- **Priority:** None

#### T-010: Dev-Time Dependency Advisories (new)

- **Category:** Tampering / DoS, OWASP A06
- **Component:** `package.json` dev dependencies (tailwindcss 3 chain)
- **Description:** `npm audit` reports 9 advisories (7 high, 2 moderate) in transitive dev packages: braces, micromatch, fast-glob, chokidar, postcss-selector-parser, postcss-nested, nanoid, source-map-js. All are ReDoS or CPU DoS class. `npm audit --omit=dev` reports 0, so nothing reaches the shipped bundle. The Tailwind chain needs a breaking Tailwind 4 upgrade; nanoid and source-map-js have non-breaking fixes.
- **Likelihood:** Low (build-time only, trusted inputs)
- **Impact:** Low
- **Risk:** Low
- **CWE:** CWE-1333
- **Mitigation:** Run `npm audit fix` for the non-breaking items; plan a Tailwind 4 migration.
- **Priority:** P3

#### T-011: Terminal Escape Injection in CLI Preview (new)

- **Category:** Spoofing / OWASP A03
- **Component:** `scripts/add-word.js` `display()`
- **Description:** The preview prints `word`, definitions, examples, `partOfSpeech`, and `reviewReason` raw. Model output containing ANSI or OSC sequences could spoof or hide content in the preview shown before the user confirms a save.
- **Likelihood:** Low
- **Impact:** Low
- **Risk:** Low
- **CWE:** CWE-150
- **Mitigation:** Strip control characters (`/[\x00-\x08\x0b-\x1f\x7f-\x9f]/`) before display and before save.
- **Priority:** P3

---

## Attack Chains

| Chain ID | Threats | Combined Severity | Narrative |
|---|---|---|---|
| C-001 | T-002 + T-010 | Low-Medium | A compromised dev dependency executes during `npm ci` or build in the job that holds deploy permissions, altering `dist/` or abusing the OIDC token. The job split (T-002) is the effective break in this chain. |
| C-002 | T-001 + T-004 | Low | A malformed entry passes the shallow validator. With no CSP, a future HTML-rendering feature would turn it into XSS. Today React text escaping prevents execution. The remaining risk is a rendering crash. |

Previous chain C-001 (unpinned Actions + unvalidated output) is retired: both links are fixed.

---

## Risk Matrix

|  | Low Impact | Medium Impact | High Impact |
|---|---|---|---|
| **High Likelihood** | none | none | none |
| **Medium Likelihood** | none | none | none |
| **Low Likelihood** | T-001, T-005, T-006, T-007, T-010, T-011 | T-003, T-004 | T-002 |

---

## Mitigation Roadmap

### P0 and P1
*None.*

### P2
*None. Previous P2 items T-001 (validation) and T-002 (SHA pinning) are complete.*

### P3
- [ ] **T-001 / T-011** Allowlist-build the saved entry, add type and length checks, strip control characters before display and save
- [ ] **T-002** Split `deploy.yml` into `build` and `deploy` jobs
- [ ] **T-003** Document hidden key prompt or shell profile in `scripts/README.md`
- [ ] **T-004** Add CSP meta tag with an inline-script hash (or externalize the theme script)
- [ ] **T-005 / T-006** Optional runtime shape validation in `loadWords()` and `loadFromStorage()`
- [ ] **T-010** `npm audit fix`; plan Tailwind 4 upgrade
- [ ] **T-007** Optional `--max-calls` guard

---

## Assumptions and Limitations

- The CLI runs locally only. If it is ever run in CI or automation, T-001, T-003, T-007, and T-011 escalate.
- GitHub Pages and HTTPS are assumed trustworthy delivery.
- LLM providers are trusted services, but response content is treated as untrusted.
- `Spelling.tsx` still exists but is not imported anywhere, so it is not part of the live app. Re-evaluate if it is wired in.
- `public/vocab.json` is modified in the working tree (uncommitted); review covered its committed structure and current content scan.
- Browser-level threats generic to all static sites (clickjacking, DNS rebinding) are out of scope. Note `frame-ancestors` cannot be enforced on GitHub Pages.
