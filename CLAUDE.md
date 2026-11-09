# Quiz Teórica

Static quiz site (docs/) on GitHub Pages. Content is encrypted; see PLAN.md for the why.

## Hard rules

- Never commit `materia/` (source PDFs/slides and their .md) or `content/` (plaintext questions, settings.js). Both are gitignored. Only `docs/data/bundle.enc` and `docs/data/img/*.enc` are committed.
- Never paste course content into commit messages, issues, PR bodies or code comments.
- Never write the real password anywhere in the repo.

## Generating questions from `materia/<cadeira>/`

Read the `.md` next to each PDF (made by `node tools/pdf2md.mjs`), never the PDF itself: it is ~100x smaller.
Each page is a `## p. N` section; `_[figura]_` marks a page with a real figure. To see a figure, render only that page:
`pdftoppm -png -r 60 -f N -l N -singlefile "materia/<cadeira>/<doc>.pdf" /tmp/p` and look at /tmp/p.png.

Write one file per topic: `content/<cadeira>/<tema-slug>.json`, format in PLAN.md.

- `cadeira` = the folder name under materia/ (DAD, DAE, SAD, TAES). `documento` = the PDF file name without `.pdf`, exactly.
- Topics follow the course's own structure (one document, or one section of a long document), not invented groupings.
- 4 options, usually exactly one correct (`certa` is the 0-based index). Distractors must be plausible and clearly wrong per the source.
- Other formats: true/false (`opcoes: ["Verdadeiro", "Falso"]`, q starts with "Verdadeiro ou falso:") and several correct answers (`certa: [0, 2]`, 2+ distinct indexes, q ends with "(escolhe todas as certas)"). Use them for a minority of questions.
- `explicacao`: why the right answer is right and the tempting wrong one is wrong, in 1-3 sentences, from the source only.
- `fonte`: document + page, e.g. "2. OLAP e Data Warehousing, p. 12". The build turns the first `p. N` into a slide image ("Ver slide" button), so the page must be exact and `documento` must match the PDF name.
- Portuguese (pt-PT). Don't invent facts the material does not state; skip what is ambiguous.
- No duplicate questions within a topic.

### Images

Use an image only when the question is about the figure (a diagram, model, table, architecture). Add:
- `"imagem": "<cadeira>/<doc>.pdf#<page>"` (rendered at build) or `"imagem": "<cadeira>/img/x.png"` (paths relative to materia/). Crop the figure without the slide title or captions: `pdftoppm -png -r 150 -f N -l N -x X -y Y -W W -H H -singlefile "<pdf>" materia/<cadeira>/img/<name>`.
- `"imagemAlt"`: what the figure shows, without giving the answer away.
Never pick a page whose text contains the answer.

### Tests (1º / 2º teste)

The owner picks them with `node tools/testes.mjs [cadeira]`, saved to `content/settings.js`; the app filters topics and exam mode by it. Don't edit the selection unless asked.

```js
export default { "testes": { "SAD": { "1": ["1. Introducao aos SAD"], "2": ["4.1 Extracao de Dados"] } } };
```

A document may be listed in both tests. The build warns about topics whose `documento` is in no test.

## Commands

```bash
node --test                          # crypto, validation, pdf2md
node tools/pdf2md.mjs                # materia/**/*.pdf -> .md next to each PDF
node tools/testes.mjs                # pick which documents come up in 1º / 2º teste
node tools/build.mjs                 # validate content/, prompt password, write docs/data/
node tools/build.mjs content.example # synthetic demo content (password demo-quiz-teorica)
python3 -m http.server -d docs 8000  # local preview (fetch needs http, not file://)
```
