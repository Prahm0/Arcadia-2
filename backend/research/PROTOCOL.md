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

(none yet)
