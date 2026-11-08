# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS/JS, no framework, no build step for the site. One Node script (no dependencies) bundles and encrypts the quiz content. Deployed on GitHub Pages from `docs/` in a public repo.

## Users

João (owner) and colleagues from the same university course. They study for the theory part (teórica) of their subjects (cadeiras), mostly on a laptop at a desk or on a phone between classes, often close to an exam. The owner feeds subject PDFs and slides to Claude, which writes the questions; colleagues only answer quizzes.

## Product Purpose

Practice theory questions grouped by subject and topic (tema), with an explanation and a source reference for each answer, plus an exam mode. Success: a colleague opens the link, types the shared password once, and is answering questions on the topic they need within seconds.

## Positioning

Questions come straight from the course's own slides and PDFs, organised by the same topics the course uses, and every answer points back to the slide or page it came from.

## Operating Context

- Source material (PDFs, slides) lives only on the owner's machine in a gitignored folder; it is never committed or published.
- Generated questions live as plaintext JSON in a gitignored `content/` folder; only the AES-GCM encrypted bundle is committed.
- Access is a single shared password distributed privately to the class (e.g. class group chat).
- Progress is stored per browser (localStorage); there are no accounts.

## Capabilities and Constraints

- Subjects contain topics; topics contain multiple-choice questions (one correct option), each with explanation and source.
- Quiz by topic: immediate feedback with explanation and source.
- Exam mode: N random questions across a subject's topics, timed, feedback at the end.
- Local progress per topic.
- Constraint: course material must not be publicly readable. Anyone holding the password can read everything; this is accepted.
- Open decision: which subjects (cadeiras) come first.

## Evidence on Hand

No real course content yet. The repository ships a synthetic example subject, labelled as such, to exercise the pipeline. Do not invent course facts.

## Product Principles

1. Course material never leaves the owner's machine unencrypted.
2. Every answer is traceable to its source slide or page.
3. Zero friction for colleagues: one link, one password, no accounts.
4. Nothing to run or pay for beyond a static host.

## Accessibility & Inclusion

Keyboard-operable quizzes (number keys to answer, Enter to continue), readable on a phone, light and dark themes following the system.
