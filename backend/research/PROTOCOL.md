# Test protocol: repairing disrupted study plans

Version 1, frozen 5 October 2026, before any experiment was run.

Any change after this date is added as a dated amendment at the bottom, with the reason. Nothing above the amendments is edited.

## 1. Research question

When a student's study week is disrupted, how much of their deadline preparation can be recovered while changing as little of their plan as possible? And when full recovery is impossible, can the planner work out exactly how much extra time is needed, and when?

## 2. Scope and integrity

- All instances are synthetic. No production schedules, analytics, messages or any other data from real users are used. This keeps the study outside human-participant research (ISEF exempt category: testing done only by the student researcher).
- The tests measure the scheduling algorithms only, not human outcomes. No claims about grades, stress, wellbeing or whether students actually complete work.
- Language: "scheduling instances" and "disruption scenarios", not "simulated students".
- No change to production behaviour. All code lives on branch `aussef/harness` under `backend/research/`.

## 3. The model

**Instance.** One student, a 28-day horizon starting on a Monday, in one IANA time zone:

- commitments, recurring (daily, weekdays, weekly) or one-off;
- bedtime and wake time;
- daily study cap, preferred session length and break length;
- 4 to 8 subjects with weekly targets;
- 6 to 20 deadline tasks, each with required minutes, due time, priority and subject.

**Baseline plan.** Current Arcadia builds the starting plan for every instance. All methods repair the same starting plan.

**Hard constraints.** Checked by an independent validator that shares no code with any scheduler.

1. No study overlaps a commitment, sleep, or another block.
2. No study outside the configured bedtime to wake window.
3. Daily study does not exceed the cap.
4. Deadline work finishes before its due time.
5. Fixed blocks are never moved or removed: completed, under way, pinned or manually placed.
6. Blocks are at least 15 minutes, with the configured break between consecutive blocks.

Any violation makes that result invalid. Valid methods must score zero.

## 4. Disruptions

Each scenario applies one disruption to the starting plan, at a random time in days 1 to 7.

| Code | Disruption |
|---|---|
| D1 | One planned block missed |
| D2 | New one-off commitment, 1 to 4 hours |
| D3 | Rest of the day lost |
| D4 | An existing commitment moves to a new time |
| D5 | New task: 60 to 240 minutes, due in 1 to 7 days |
| D6 | Two of D1 to D5 at once (worst case) |

## 5. Instance generator

Seeded and reproducible. Factors:

- **Utilisation** (required study as a share of available capacity): 50, 70, 85, 95%, plus over 100% (overloaded).
- **Deadline clustering:** spread out, or clustered.
- **Time zones:** all Australian zones including Australia/Lord_Howe, plus Pacific/Auckland, Europe/London and America/Los_Angeles.
- **Clock changes:** some horizons cross 4 Oct 2026 or 5 Apr 2027.

Pilot set: seeds 1 to 240. Full set: seeds 1000 to 5999. Held-out set (looked at only once, after the method is final): seeds 9000 to 9499.

## 6. Methods compared

| Code | Method | Purpose |
|---|---|---|
| M0 | No repair | Drop invalidated blocks and replace nothing |
| M1 | Greedy earliest deadline first | Fill the earliest free gaps with the most urgent work |
| M2 | Current Arcadia rebuild | The live algorithm (commit f179689), rules only |
| M3 | Coverage-first rebuild | Rebuild from scratch for maximum coverage, ignoring stability |
| M4 | Proposed: stability-budgeted repair | Minimal-change repair under a disruption budget, swept across budgets |
| OR | Exact optimiser (small instances only) | Measures how far M4 is from the best possible; not a competitor |

Ablations of M4:

- no near-term weighting;
- no displacement chains;
- a fixed repair window instead of a widening one;
- a single weighted score instead of a budget sweep.

Secondary study S1, the AI layout: raw AI layout against verified and repaired AI layout, on a small paid sample, run only with owner approval.

## 7. Measures

**Primary.**

- Weighted on-time preparation coverage: required minutes of deadline work booked before the due time, weighted by priority, divided by the weighted total required.
- Weighted unmet deadline minutes.
- Share of tasks with 100% of their required preparation booked on time.
- Hard-constraint violations (must be 0).

**Stability.**

- Share of original blocks unchanged, moved and removed.
- Total start-time displacement in minutes.
- Number of blocks that changed day.
- Near-term-weighted disruption cost, as defined in section 8.
- Number of blocks added and deleted.

**Secondary.**

- Subject-target error: mean absolute gap as a % of the target.
- Subject starvation rate: subjects given under 50% of their target.
- Run time: median, 95th percentile and maximum.
- Optimality gap against OR.
- For infeasible cases: minimum extra availability (minutes) and whether the certificate is correct.

## 8. Disruption cost

For each original block b with near-term weight r(b):

```
D = sum over b of r(b) * (a*[b removed] + c*[b changed day] + e*|start shift in minutes| / 15)
    + d * (number of new blocks)
```

- Block weight: r(b) = 1 / (1 + days from now until b).
- Constants: a = 4, c = 2, e = 1, d = 1.

These constants are fixed now. A sensitivity check with 2 alternative sets is reported alongside.

## 9. Statistics

- Paired comparisons on identical scenarios.
- Wilcoxon signed-rank tests, Holm-corrected across metrics.
- Effect sizes: matched-pairs rank-biserial correlation.
- 95% bootstrap confidence intervals (10,000 resamples).
- Results reported by utilisation level and by disruption type, not just pooled.

## 10. Continue or change (pilot review, 16 October 2026)

M4 continues only if, on the pilot, at least one of these holds:

1. equal coverage with clearly less disruption than M2 and M3;
2. higher coverage at the same disruption budget;
3. similar quality with much lower run time;
4. infeasibility certificates that are correct (checked against OR) and useful.

If M1 or M3 dominates M4, the algorithm is changed. The story is not.

## 11. Records

Every run saves:

- raw CSV or JSON results;
- the config file;
- the git commit hash;
- the seed range;
- the Node.js version;
- the date.

All of these go to `results/YYYY-MM-DD-<name>/`, and each run gets an entry in AUSSEF-LOG.md.

## Amendments

### Amendment 1 (5 October 2026, before any experiment)

1. **Research question, simpler wording.** Can a disrupted study plan be repaired so that deadline preparation is preserved while moving as few existing study blocks as possible? The question in section 1 stays as the technical form. The infeasibility certificate is a design criterion and a separate result, not part of the question.
2. **Time resolution.** The repair algorithm (M4) and the exact optimiser (OR) work on 15-minute slots. The validator and all measures work on exact intervals, so no method gains from rounding.
3. **Release times** are added as hard constraint 7: no work on a task is booked before the task exists. For D5, that means before the moment the disruption happens.
4. **Disruption severity.** Each disruption is tagged light, medium or heavy, by the minutes of planned study it invalidates (under 60, 60 to 180, over 180). Results are also reported by severity.
5. **Equal time limits.** Every method gets the same limit per scenario: 2 seconds, or 60 seconds for OR. A method that runs over counts as a failure for that scenario and is reported.
6. **Contribution boundary.** Arcadia work before 5 October 2026 is pre-existing product development. The research contribution is the work on this branch from 5 October onwards.

### Amendment 2 (5 October 2026, after a 12-scenario smoke test of the baselines, before the pilot)

The smoke test (results/2026-10-05-smoke) was run only to check that the harness works. Two measures were found to be wrong and are corrected before any pilot run.

1. **Disruption cost, corrected.** In v1, moving a block by one day cost about 98 (1,440 minutes divided by 15), but removing it cost only 4. A method could score better by deleting blocks than by moving them. Every term is now bounded:
   - removed: 4 x r(b);
   - moved to another day: 3 x r(b);
   - moved within the day: min(|shift in minutes|, 120) / 60 x r(b), at most 2 x r(b);
   - each new block: 1 x r(new block).

   r(b) = 1 / (1 + days from now until b), unchanged.
2. **Subject-target error is now shortfall only:** the mean of max(0, target - booked) / target. Deadline work in a subject counts toward that subject (as in Arcadia), so booking more than the target is not a failure. Under v1, deadline-heavy subjects showed errors above 100% for every method.
3. **The rest-of-horizon target** is the weekly target x (horizon end - now) / 7 days.

### Amendment 3 (5 October 2026, after the pilot, before any confirmatory seed was run)

The pilot (seeds 1 to 240) was used to develop M4, as section 10 intends. The confirmatory seeds (1000 to 5999) and the held-out seeds (9000 to 9499) have not been run. M4 is now frozen as version 2. Changes since the pilot:

1. **Split re-homing.** Bumped deadline work may be split into pieces of at least 15 minutes when no single gap fits before its due time.
2. **Deeper chains.** The chain depth setting is now 3, which allows up to 4 bumps in a row. Fewer candidates are tried at each deeper level (60, then 25, 12 and 6) to keep run time under the 2 s limit.
3. **Escalation with a growing window,** for weeks local repair can't fix. A "sticky" deadline-order rebuild runs from now until the last deadline still missing work. Each task first takes back its own original slots, then the earliest free time. If that pushes other work past its own deadline, the window widens to that deadline and the rebuild repeats (up to 8 rounds). The result is kept only if it books more weighted deadline work than local repair. It is used only when the budget is unlimited. Ablation: M4-noEscalate.
4. **The exact optimiser (OR) is replaced by an exact coverage bound computed for every scenario,** not just small ones. Every task's window starts at the moment of the disruption, so the windows are nested. A set of work then fits exactly when, at every deadline, the work due by then fits in the study time before then. Those sets form a matroid, so taking work in priority order (as much as still fits) gives the maximum weighted coverage. Only breaks and minimum block lengths are ignored, so no valid plan can beat the bound. This answers "how close to the best possible" for all scenarios, which a solver could only do for small ones.

5. **Search limit.** Bumping may use at most 100,000 gap searches per repair. After that, bumping stops and escalation takes over. The limit is a count, not a clock, so results are identical on any computer. With it, the slowest pilot repair took 0.4 s against the 2 s limit; without it, 5 of 240 took longer than 2 s. Limits of 20,000, 100,000 and 300,000 were compared on the pilot, leaving 92.0%, 92.8% and 93.0% of blocks unchanged, with slowest runs of 0.1, 0.4 and 1.1 s.

Smoke check (seeds 1 to 40, part of the pilot): M4 v2 reached 99.69% coverage with 93.4% of blocks unchanged, against 99.70% and 1.7% for the full rebuild. No valid plan beat the bound.

### Amendment 4 (5 October 2026, after the confirmatory run; affects baselines only)

1. **A baseline defect at midnight.** The independent validator found missing breaks in 6 of the 5,000 confirmatory full-rebuild (M3) repairs. All six were students whose bedtime is after midnight. The baselines' `book()` updated only the day a block was booked on, so a block ending at 12:00am did not reserve its break at the start of the next day. M1 shares the code. Fix: a booked block's break is subtracted from every day. M4, M2 and the validator are unaffected (M4 checks neighbouring days). M1 and M3 were re-run on the same confirmatory seeds with the fix (results/2026-10-05-confirmatory-baselines-fixed). The original results file is kept unchanged. The reported confirmatory table uses the corrected M1 and M3 rows; the original rows are reported alongside.
2. **The runner's "uncommitted changes" flag** counted the run's own new results folder as uncommitted, so every run so far was flagged. `git status` showed no modified tracked files for the confirmatory run (code at commit aba9d14). The flag now ignores untracked files.
