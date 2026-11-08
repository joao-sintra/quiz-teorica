# Quiz Teórica

Static quiz site (docs/) on GitHub Pages. Content is encrypted; see PLAN.md for the why.

## Hard rules

- Never commit `materia/` (source PDFs/slides) or `content/` (plaintext questions). Both are gitignored. Only `docs/data/bundle.enc` is committed.
- Never paste course content into commit messages, issues, PR bodies or code comments.
- Never write the real password anywhere in the repo.

## Generating questions from `materia/<cadeira>/`

Write one file per topic: `content/<cadeira>/<tema-slug>.json`, format in PLAN.md.

- Topics follow the course's own structure (slide decks / chapters), not invented groupings.
- 4 options, exactly one correct (`certa` is the 0-based index). Distractors must be plausible and clearly wrong per the source.
- Vary the position of the correct option (the app shuffles, but keep the source balanced anyway).
- `explicacao`: why the right answer is right and the tempting wrong one is wrong, in 1-3 sentences, from the source only.
- `fonte`: deck/document + slide or page number, e.g. "T3 Normalização, slide 14".
- Portuguese (pt-PT). Don't invent facts the material does not state; skip what is ambiguous.
- No duplicate questions within a topic.

## Commands

```bash
node --test                          # crypto roundtrip + validation
node tools/build.mjs                 # validate content/, prompt password, write docs/data/bundle.enc
node tools/build.mjs content.example # synthetic demo content
python3 -m http.server -d docs 8000  # local preview (fetch needs http, not file://)
```
