# Audit — Drive → questions → game (7 November 2026)

## Verified existing components
- `content/campus/SPEC.md`: Hebrew QCM source requirements and JSON format.
- `docs/parta-drive-review.md`: provenance review and held-question process.
- `tools/build-parta.mjs`: documented validation/build for Part A.
- `tools/audit-parta-drive.mjs`: documented text/hash provenance check against fetched Drive texts.
- `.github/workflows/pages.yml`: deploys from `main`.
- `.github/workflows/rtg-import.yml`, `tours.yml`, `exam-regions.yml`: workflows with write permissions and push/commit steps.
- `.github/workflows/campus-realtime.yml`: tests existing Supabase Broadcast.

## Proposed workflow (not yet implemented)
1. Discover changed/new authorized course documents in Google Drive, storing only source IDs, timestamps and hashes in a private or appropriately access-controlled workspace.
2. Extract text and keep source spans with stable identifiers. Never commit full private course documents to this public repository.
3. Propose candidate questions in a nonproduction staging area, respecting the existing JSON schemas and topic lists.
4. Verify each claim against source passages; reject missing, conflicting, or uncertain claims.
5. Check Hebrew clarity, exactly one answer, balanced distractors, duplicate detection, and source traceability.
6. Run existing build/validation scripts and applicable test suites.
7. Open a pull request for human review; never automatically merge or publish questions.
8. On approval, merge through normal review, then observe existing Pages deployment and check game functionality.

## Open decisions
- Confirm which Google Drive folders are authorized and whether any documents have sharing/copyright restrictions.
- Confirm preferred schedule and whether automatic PR creation is desired.
- Determine how Drive credentials can be securely accessed from the chosen runner; never copy personal tokens into source.
- Audit all existing workflows and branch protection before altering write permissions.
- Verify build scripts and tests in an isolated checkout before enabling scheduled runs.

## Explicit non-goals for this audit
- No production schema migration.
- No direct push to main.
- No new question publication or unverified claims.
- No change to game runtime or live Supabase setup.
