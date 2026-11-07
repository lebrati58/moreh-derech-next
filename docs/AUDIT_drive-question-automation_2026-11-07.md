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
7. For source-verified, schema-valid, duplicate-checked questions with all relevant tests passing, allow unattended publication after the automation is explicitly configured and tested end to end.
8. Use an isolated staging branch and an automated validation gate before merging; deploy only validated content through the existing Pages process. Keep a rollback commit and monitor deployment.
9. If any source is missing, contradictory, uncertain, or any test fails, hold the affected questions and do not publish them.

## Open decisions
- Confirm which Google Drive folders are authorized and whether any documents have sharing/copyright restrictions.
- User preference confirmed on 7 November: publish validated questions automatically, without routine manual review. Schedule remains to be configured.
- Determine how Drive credentials can be securely accessed from the chosen runner; never copy personal tokens into source.
- Audit all existing workflows and branch protection before altering write permissions.
- Verify build scripts and tests in an isolated checkout before enabling scheduled runs.

## Explicit non-goals for this audit
- No production schema migration.
- No uncontrolled direct push to main; a gated automation may merge validated content after implementation and end-to-end verification.
- This audit does not itself publish questions; unverified claims must never be published.
- No change to game runtime or live Supabase setup.
