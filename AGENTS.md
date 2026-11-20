# Moreh Derech — Protocol for material extracted from books (חומר מספרים)

Scope: APPLY THIS POLICY to every future task involving a photographed book page, chapter, map, family tree, timeline, diagram, footnote, or quotation imported into Moreh Derech. Other unrelated changes remain governed by existing project instructions.

## 0. Non-negotiable principles

- **The uploaded book image is the source to transcribe, not a suggestion to reconstruct from memory.** Preserve author, title, edition, page (or mark "unnumbered/unknown"), spelling, dates, family links, map labels, notes, and any "?" attached to disputed figures.
- Always separate: (A) what appears **in the supplied book**, (B) course information from **Google Drive**, (C) external encyclopedia assertions, (D) **primary/academic scholarship**, and (E) editorial summaries/inferences. Never claim that an author said something not visibly or textually supported.
- User's required **consultation order**: **1. user's relevant Google Drive course files → 2. Wikipedia (prefer language-appropriate entries and references) → 3. Grokipedia**. If a source or website is unreachable, explicitly record **NOT CHECKED**, never "verified." Do not treat Grokipedia's or Wikipedia's agreement as two genuinely independent historical attestations. For disputed claims, also consult original primary sources and responsible scholarship, citing editions and locations.
- No fabricated quotations, sources, direct links, archival references, pagination, coordinates, family bonds, dates, or source access.

## 1. Three verification levels — mandatory record

### CHECK 1 — Visual / textual fidelity (הצלבה עם הספר)
Transcribe the supplied photo(s) at highest readable resolution. Check every displayed date, Hebrew/Greek/Latin name, spouse, parent-child connector, city, map key, caption, annotation, uncertain symbol and footnote against the image. Note illegible parts. Do NOT change the book's wording silently, even when it seems historically wrong.

### CHECK 2 — Historical / bibliographical cross-check (אימות מקורות)
Consult Drive → Wikipedia → Grokipedia in exactly this search order; compare each relevant claim. Log exactly which documents/pages/links were inspected. When those differ or prove insufficient, identify/consult a primary edition (e.g., Josephus, 1–2 Maccabees) and reliable academic reference; explain conflicting dating conventions, reign vs death, family members with near-identical names, and the possibility of editorial mistakes. Record both versions and reasoning. Don't claim a third independent confirmation just because three sites were queried.

### CHECK 3 — Pre-publication editorial + visual review (בקרת פרסום)
Before any exposition slide, map, diagram or game question is marked ready: validate RTL Hebrew, Hebrew spellings, relationship arrows, date formats BCE/CE, map placement/scale disclaimer, slide text legibility, citations, and exact consistency between he/fr/en versions. Check that the displayed answer follows the evidence. Verify all hyperlinks. If automated tests exist, run the relevant tests. Flag any review that could not be completed.

## 2. Language contract for Moreh Derech

- **HEBREW (he) FIRST and canonical**: title, historical explanation, labels, guiding narration, correct answer, answers, quiz question, primary-source citation, map legend, and disagreement note. UTF-8 RTL with names e.g. מתתיהו, יהודה המכבי, יונתן, שמעון התרסי, יוחנן הורקנוס הראשון, שלומציון אלכסנדרה, הורדוס הגדול.
- **FRENCH (fr) SECOND**, **ENGLISH (en) THIRD**. Produce them only from reviewed Hebrew and double-check translation of proper names, BC/AD/BCE/CE, and historical nuance. Never auto-label a machine translation "validated"; use `translationStatus`: "draft" | "reviewed".
- Include an oral guiding paragraph (הדרכה בשטח) and, when relevant, 1–3 sourced quiz questions (שאלות למבחן). Never invent a supposedly original Hebrew quotation from a Greek/Latin primary text: label it clearly **תרגום לעברית**, with translator and edition if known; otherwise mark as paraphrase.

## 3. Source and discrepancy metadata (per item)

Use a content record equivalent to:

```json
{
  "id": "stable-slug",
  "kind": "book_excerpt|map|genealogy|timeline|temple_plan|quiz",
  "book": {"author": "", "title": "", "translator": "", "edition": "", "page": ""},
  "sourceImage": "file or asset reference, only if actually available",
  "consultationOrder": ["drive", "wikipedia", "grokipedia"],
  "consultations": [{"provider": "drive", "title": "", "url": "", "status": "checked|not_checked|unavailable", "location": ""}],
  "claims": [{"id": "c1", "statement_he": "", "bookVersion": "", "alternateVersions": [], "sourceIds": [], "assessment": "verified|disputed|unverified"}],
  "languages": {"he": {"status": "reviewed"}, "fr": {"status": "draft"}, "en": {"status": "draft"}},
  "checks": {"bookFidelity": "passed|failed|not_checked", "historical": "passed|failed|partial", "finalEditorialVisual": "passed|failed|not_checked"},
  "publication": "draft|ready",
  "notes": []
}
```

- `publication=ready` only if the **three CHECKS are passed**, Hebrew copy is reviewed, and all factual unresolved issues are shown as disputed/unverified rather than hidden. Do not silently publish an item with missing check evidence.
- Links must point to actually retrieved pages; reference each primary source with original work, book/chapter/section and translator/edition where available.
- If source materials are copyrighted, quote only what is necessary and lawful; paraphrase rather than bulk-reproduce an entire book.

## 4. Special rules for historical maps and genealogies

- Reproduce original entities faithfully, but give a corrected **annotated edition** if independent evidence warrants it; retain a list of differences (הבדלים בין הגרסאות). Keep chronological ranges distinct from dates of death, and surname/number homonyms distinct (e.g. הורדוס השני ≠ פיליפוס הטטררך).
- An approximate historical map must say **מפה סכמטית — גבולות ומיקומים מקורבים**, and not imply precision where the evidence is schematic. Never use modern national boundaries as ancient borders without explicitly distinguishing them.
- Visuals for presentation should be large, clean, editable (Canva when requested), with minimal legible Hebrew labels, separated legend, and exact citation footer. Review the actual output visually; generation success alone is not proof of accuracy.

## 5. Worked example: original book genealogy photo

- One supplied edition of *La Guerre des Juifs* shows שמעון התרסי died 135 BCE; a Drive course document lists his leadership as 142–134 BCE. Record as a dating discrepancy, not "an error proven."
- Some charts label the son of Herod and Mariamne II as "(Philip)"; distinguish **Herod II**, whose name "Philip" is disputed or editorial, from **Philip the Tetrarch**, son of Cleopatra of Jerusalem.
- Agrippa II's death date is uncertain; do not convert "48–95 (?)" in the book into an exact proven death date.
- Grokipedia was not accessible during first comparison; its consultation must be logged "unavailable/not_checked" pending an actual successful read.

## 6. Deliverable and integration gates

Produce separately (a) simplified explanation of the book in French for the learner, (b) reviewed Hebrew guide/exam content for Moreh Derech, (c) discrepancy/source ledger, (d) editable visual where requested. FR and EN must be reviewed before being advertised as validated. Keep an item in draft until explicit source checks and layout checks are complete. A new document or GitHub rule does not itself update the running app: only claim game integration when actual content files, build/test and deployment are verified.
