# Security Policy

## Reporting a Vulnerability

Please use GitHub's private vulnerability reporting to report security issues — this keeps the disclosure confidential until a fix is available.

**[Report a vulnerability](https://github.com/drhitchen/vocab/security/advisories/new)**

Include a description of the issue, steps to reproduce, and the potential impact. I'll acknowledge reports within a few days and aim to resolve confirmed vulnerabilities within 90 days.

## Scope

This is a static client-side vocabulary app with no backend, no user accounts, and no sensitive data. The primary security surface is the local `scripts/add-word.js` CLI tool and the GitHub Actions deploy pipeline.

## Security Reviews

- [Threat model](security-threat-model.md) — STRIDE + OWASP Top 10 analysis (2026-08-01)
- [Code review](security-code-review.md) — full file:line audit (2026-08-01)
