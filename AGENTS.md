# Moreh Derech Next — shared agent instructions

Read `SUIVI.md`, `README.md`, and `package.json` before proposing changes.

## Safety
- Never push directly to `main`. Work in a separate branch and open a pull request.
- Do not change GitHub Pages, Netlify, Supabase configuration, credentials, or production data without explicit approval.
- Do not expose keys or private student information in code, logs, issues, or PRs.
- Keep the existing browser game operational. Prefer small, reversible changes.
- Run the relevant existing tests; report tests not run. Never claim an unexecuted test passed.

## Historical content
- Prefer the linked course documents and explicit references.
- Never invent historical facts, dates, archaeological interpretations, source citations, or tour visibility.
- If a source is absent or contradictory, hold the question for review rather than publishing it.
- For Hebrew MCQs: exactly one defensible answer, comparable option lengths, plausible distractors, no clue from wording or answer length.
- Keep original source identifiers and traceability; do not silently rewrite sourced questions.

## Architecture
- Existing content JSON files and build scripts are canonical until a migration is explicitly approved.
- Supabase Realtime is already used by campus multiplayer; do not replace it or assume a new database is required.
- Review workflows in `.github/workflows/` before adding any automation.
- GitHub Pages deploys on pushes to `main`; never merge without approval.
- Do not confuse this repository with archived `moreh-dereh-live`.

## Collaboration
Document assumptions, affected paths, test results, remaining risks, and source provenance in every PR.
