# Lesson Style: short, visual, one idea

This learner understands an idea when it arrives as **analogy → picture → worked example → try it**, in plain words. They get lost when a lesson is long, says the same thing many times, or puts paragraphs before pictures. (In October 2026 the lessons reached about 2,500–3,000 words each, and the learner said they were overwhelming. The rules below exist to stop that from happening again.)

**Few ideas, said once, shown first.** When in doubt, cut.

## Budget (hard limits)

Every lesson must fit inside this budget. `check-lesson.mjs` measures it and prints `BUDGET: ok` or the rules that were broken.

|                                                                                                     | Limit                               |
| --------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Reading text (paragraphs, captions, tables, takeaways; not code, quizzes, exercises or "Go deeper") | **900 words or fewer**              |
| Numbered sections                                                                                   | **4 or fewer**                      |
| New words in the "Words you'll need" box                                                            | **4 or fewer**                      |
| New rules or formulas                                                                               | **1**                               |
| Quizzes (warm-up included)                                                                          | **2–3**                             |
| Code exercises                                                                                      | **1–2**                             |
| Words of text for each picture or toy                                                               | **150 or fewer**                    |
| Figure caption                                                                                      | **one sentence, 20 words or fewer** |
| Time to finish                                                                                      | **about 10–15 minutes**             |

If an idea does not fit, **split it into parts** instead of squeezing it: Lesson 01 became 1.1, 1.2 and 1.3. A part is a full lesson with its own file (`0001-2-is-the-clip-on-screen.html`), its own video and its own exercise. The plain lesson number (`0001-…html`) becomes a short contents page that links to the parts.

When you add a new rule to this file because of feedback, check that lessons can still fit the budget. Prefer to replace a rule, not to add one.

## Page order

1. Kicker, title, one-line subtitle, and a meta line (time, what you need, what you'll write).
2. **Words you'll need**: at most 4 words, one short line each. Under it, one line about the **Names?** button.
3. **Video** (see [Explainer video](#explainer-video)). No heading or intro paragraph is needed; the player has its own title.
4. **Warm-up**: one quiz question on an earlier lesson, answered from memory. Skip it in the first lesson.
5. **Sections 1–4.** Each one teaches one step of the idea.
6. **Try it**: the code exercise(s), with a visible payoff.
7. **Key takeaways**: the "one thing" line plus at most 3 points.
8. **Go deeper** (`<details class="deeper">`, closed): citations and quotes, "why" side notes, optional challenges.
9. Footer: one primary source, cheat-sheet links, "ask your teacher", previous/next links.

## Shape of a section

- **Start with the picture or toy, then explain it.** The first thing in a section is a figure, a stepper, a slider or a draggable timeline. The words come after it and point at it: "Look at frame 90 in the picture."
- Write **at most 3 short paragraphs** in a section, about 80 words in total.
- Use these four parts for an idea, in this order: **analogy → picture → one worked example → try it** (a toy or a quiz). Reuse analogies that worked before; `NOTES.md` lists them.
- Show a worked example as numbered steps (`<ol class="steps">`) with every sum written out: `50 − 45 = 5`, then `10 + 5 = 15`.
- Add a table of edge cases (too early, first, last, just after) **only when the edges are the point** of the idea, such as the frame where a clip ends. Give a table at most 4–5 rows.
- A caption says **what to look at**, in one sentence. It does not repeat the paragraph.

## Say each thing once

- Each fact appears in **one** place in the reading text: either the paragraph or the caption or the table, not all three.
- The takeaways are the only summary. Do not add "So…" recap paragraphs inside sections.
- Put citations, quotes from sources, and "professional tools do this too" notes in **Go deeper**, not in the teaching text. The learner needs to trust the lesson, but a quote in the middle of an explanation is one more thing to read.
- When two names look alike (`sourceIn` vs `sourceFrame`), teach them side by side in one small table: what each represents, whether it changes as the playhead moves, and where it lives (stored or calculated).

## Language (about 80% ASD-STE100)

Write explanations, captions, quiz questions, takeaways, starter comments, reference documents and glossary definitions **about 80%** in ASD-STE100 Simplified Technical English. It does not apply to code or to quoted text.

The goal is **clear and connected**, not short and choppy. Splitting every sentence makes more sentences to read and cuts the "so" and "because" that hold an explanation together. The real way to make a lesson easier is to have fewer ideas, not shorter sentences.

**Always keep:**

- **One word for one meaning.** Use the glossary's name for a concept every time ("playhead", never also "red line" or "cursor"). Define each new word before its first use.
- **Simple, common words**: "use", not "utilise"; "find", not "figure out"; "show", not "illustrate".
- **Active voice** and the simple present: "The function returns the frame."
- **Instructions as commands, with the condition first**: "If the test fails, compare `start` with `end`."
- **Real numbers when a formula appears**: say it in words first, then the code, then explain each variable with this lesson's numbers ("`start` is when the clip begins on the timeline (45)").

**Bend freely:**

- Contractions ("you'll", "don't") are fine. They sound like a teacher.
- Join two short sentences with "so", "because" or "then" when they are one thought. Aim for about 15 words per sentence on average; 25 is a soft limit, not a rule to split at.
- Common phrasal verbs ("look at", "set up") are fine.

## Explainer video

Every lesson has a short narrated video right after the "Words you'll need" box. Its one job is a **preview**: it shows the whole idea in about a minute, so the reading feels familiar. It does not replace the text, and the text does not describe the video.

The video is an animation that plays in the page, from `assets/explainer.js` (load it after `diagrams.js`). The browser's built-in voice reads the narration, a caption shows the words, and a transcript lists every scene, so it also works without sound and on paper.

```html
<figure id="video"></figure>
…
<script src="../assets/explainer.js"></script>
<script>
  Explainer.mount("#video", { title: "Lesson 1.2 in 1 minute", width: 800, height: 300, scenes: [ … ] });
</script>
```

Each scene is `{ say, show?, draw(t, A) }`:

- `say` is the narration, written for the ear: "fifty minus forty-five is five".
- `show` is optional caption text for symbols and code: `"50 − 45 = 5"`. Without it, the caption shows `say`.
- `draw(t, A)` returns an SVG string built with `Diagrams` helpers. `t` goes from 0 to 1 through the scene. `A` has `lerp`, `ease`, `step(t, from, to)` and `fade(t, from, to, svg)`, so parts of the picture appear in time with the words.

Rules:

- **4–6 scenes, 60–90 seconds.** One scene, one point, 1–2 sentences.
- Use the same analogy, numbers, colours and labels as the lesson's pictures, so the learner recognises them.
- Make something move in every scene.
- End with one scene that says what to do next.
- The `title` gives the real length.

Copy a Lesson 1.x video as a working example.

## Code exercises

- **One tiny function per exercise**, 1–2 exercises per lesson. Pre-fill helpers from earlier lessons in the starter, so each exercise asks for one new thing.
- Comment each starter with one concrete example and one plain hint.
- Name tests in plain words that show the answer: "title clip at frame 90 (just after) → false".
- Keep the `storageKey` the same when a lesson is moved or split, so the learner's saved code is not lost.
- End with a visible payoff: the learner's own function drives a picture on the page.

## Spacing and retrieval

- Open each lesson (except the first) with **one** warm-up question on an earlier lesson.
- Where it fits naturally, have an exercise reuse earlier code (e.g. call `resolve` from Lesson 1.3), so old skills come back up.

## Revising a lesson

- When the learner says part of a lesson is hard, edit that lesson file in place. Replace only the section they named.
- Rebuild the section with a new analogy, a new picture, or a stepper or slider. **Cut at least as much text as you add.** If the section no longer fits the budget, split the lesson into parts.
- Log what was hard and what fixed it in `NOTES.md`.

## Names cheat sheet

The learner forgets what code names mean (`sourceIn`, `sourceFrame`, …), so every name lives in one list: `NAMES` in `assets/names.js`.

- When a lesson introduces a new code name, add it to `NAMES` with its lesson number, kind (timeline frame / source file frame / how many / object or function), a plain meaning, and an example with real numbers.
- Every lesson loads `<script src="../assets/names.js" data-upto="N"></script>` after `diagrams.js` (N = the lesson number; parts of Lesson 1 use 1). This adds the floating **Names?** button.
- `reference/names.html` renders the same list in full for printing.

## Key takeaways

End every lesson with a **Key takeaways** box (`<section class="takeaways">`), just before Go deeper:

- One highlighted **"If you remember only one thing"** line (`.one-thing`).
- **At most 3 points.** Each one opens with a bold plain-words headline, then gives the rule with this lesson's analogy.
- A one-line self-test tip: cover the box and say each point out loud.
