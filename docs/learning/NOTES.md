# Teaching notes

## Learner preferences

- Wants "everything": change, review, explain and extend the chat feature. Starts from almost no code knowledge (2026-10-08).
- Asked for all lessons at once (2026-10-08), so Lessons 2–14 were written from the fixed plan, not adapted to evidence. Revise each one in place when the learner reports difficulty or misses quizzes.
- Workspace lives in `docs/learning/` so lessons can link straight to source files (relative `../../../packages/...`).
- Follow `.claude/skills/teach/LESSON-STYLE.md`: ≤900 words, ≤4 sections, picture first, run `check-lesson.mjs`.

## Analogies that worked / in use

- Packages = floors of a building; stairs only go down (Lesson 1).

## Components (docs/learning/assets)

- `style.css`, `diagrams.js` (svg/box/arrow/route/text/dot), `explainer.js` (video), `quiz.js`, `exercise.js` (deep-equal ignores key order), `names.js` (NAMES + Names? button), `package-map.js` (PACKAGES, DEPS, clickable map).
- `message-tree.js`: `MessageTree.SAMPLE`, `byAge`, `layout`, `draw(nodes, { path, activeLeaf, fresh, tags })`, `render(selector, nodes, { onPick })` (Lessons 5, 6).
- Starter check: a copy of check-lesson.mjs that clicks Reset + Run instead of Show solution (all 14 starters fail some tests, 2026-10-08).

## Course (all built 2026-10-08; index at `index.html`)

1 package map · 2 chat command · 3 handleChat · 4 the run · 5 Message tree · 6 Branches · 7 runs outlive the client · 8 parts boundary · 9 Provider credentials · 10 web search and Sources · 11 Attachments · 12 Shared links · 13 titles · 14 testing seams.

Next steps: follow the learner through them; write learning records from quiz results and questions; add review drills (spot the bug in a fake PR diff) as spaced practice; build a glossary reference once terms are understood.

## Code findings surfaced while writing lessons

- ADR 0004 says the share page uses "the same recursive query" as the Active Branch; the code loads all Messages and walks them in JS (`loadPath` → `pathTo`).
- `findModel` only searches curated Models, so a live-listed OpenRouter/Ollama reply gets the fallback title under "Same as first reply" (Lesson 13 Go deeper).
- Stop across two processes would lose the stop: a run's `finally` writes its status unconditionally (Lesson 7; ADR 0002 already notes the one-process limit).
