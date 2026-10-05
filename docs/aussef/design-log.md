# Syllabus tagger: design log

One entry per change to the tagging prompt, model, scoring weights or bands:
what changed, why, and the before/after numbers from `backend/eval/run.mjs`
(the results table builds up in `backend/eval/results/iterations.md`).

Keep this file anonymous: no student, school, teacher or state names, and
refer to test items by their gold.csv id (w01, w02…), never by file name.

## Engineering goal

Map a student's own Mathematical Methods work to the QCAA syllabus dot points
accurately and consistently enough to guide their study sessions.

| Test | How it's measured | Target (set before testing) |
|---|---|---|
| Tagging accuracy | AI tags vs a tutor's tags on the same work (precision, recall, agreement) | _set before first run_ |
| Scoring consistency | Same transcript marked 5 times: max spread of rubric scores | _set before first run_ |
| Handwriting reading | Character error rate against hand transcripts | _set before first run_ |
| Speed and cost | Seconds and cents per page, one pass | _set before first run_ |
| Iteration gains | The rows above, per prompt version | improvement each version |

## v1 (2026-10-05): baseline

**System**
- Syllabus: 173 dot points from the QCAA Mathematical Methods 2025 v1.3 syllabus, Units 1–4.
- Pipeline: two `gpt-5-mini` calls at minimal reasoning effort.
  1. Read: transcribe the page as written, with no corrections.
  2. Tag: choose 1–6 dot points and give each a rubric score.
- Rubric: 0/25/50/75/100, with written descriptors and one worked example. Notes and copied examples are capped at 25.

**Scoring**
- Mastery = (0.40·Q + 0.30·C + 0.20·R + 0.10·E) · D.
- With no marks yet, R's weight is shared across Q, C and E.
- Decay: 0.9 every 21 days.
- Bands: strong at 65 or above. Neglected means a point in a started topic with no work, or one that decay has pulled under 40.

**Changes made during the build**
- *Neglected points.* First, every point in a started unit counted as neglected. In a test run, one upload turned 82 of 173 points red. Narrowing it to a started *topic* brought that down to 12.

**Results**
- _Pending the first run on real, tutor-tagged work._
