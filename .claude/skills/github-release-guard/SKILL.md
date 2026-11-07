---
name: github-release-guard
description: Safely review, test, and propose changes to Moreh Derech Next without deploying unapproved code.
---
# Release guard
1. Read SUIVI.md, package.json, existing workflows, and affected files.
2. Identify dependencies, deployment effects, and possible secret exposure.
3. Work only in a feature branch; never push to main.
4. Run the smallest relevant existing tests, then broader tests when feasible.
5. Report exact commands, pass/fail results, and untested behavior.
6. Open a PR describing the change, rollback plan, and any required human approval.
7. Never merge, deploy, alter Supabase schemas, or rotate keys without explicit permission.
