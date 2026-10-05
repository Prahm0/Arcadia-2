# AUSSEF 2026 log

Dated record of what was done, what was found and what was decided. It feeds the logbook.

## 4 October 2026

- **Read the inputs:** the AUSSEF judging criteria, my 2025 report and feedback, a model ISEF report (Systems Software), and feedback from the Conrad and Diamond challenges.
- **2025 lessons:** my lowest scores were 1.3 (existing solutions, 2.6/5) and 4.1 (engineering skill, 2.8/5). This year needs a proper existing-solutions review and rigorous testing.
- **Code review of the scheduler** (scheduler.ts, day-plan.ts, recovery.ts, study-habits.ts, time.ts).
- **Found: daylight-saving defect.** Commitments, sleep and AI blocks are placed at local midnight plus the clock time, which is wrong on a clock-change day.
  - Sydney, 4 Oct 2026: a 4:00pm commitment was blocked at 5:00pm.
  - Sydney, 5 Apr 2027: the same commitment lands at 3:00pm.
- **Found: automatic misses counted as skips.** Unmarked blocks are auto-marked missed 2 hours after they end (push.ts). Habit learning (study-context.ts) counts these as skipped, so the raw missed-versus-completed totals do not measure real behaviour.
- **Decision:** enter solo, in the AUSSEF category Software Design (SFTD), ISEF Systems Software.

## 5 October 2026

- **Human participants:** AUSSEF's rules have no human-participant section. ISEF requires review-board approval before any study with people, but testing done only by the student and de-identified existing data are exempt.
- **Decision:** all evaluation uses synthetic instances only, with no new studies of real people.
- **Novelty review:** minimal-change plan repair is an established problem (Fox et al., ICAPS 2006). Claiming a "self-healing plan" alone is not new.
- **Decision: reframe the contribution** as a stability-budgeted repair algorithm for study plans, with an infeasibility certificate ("you need N more minutes, here, for these deadlines"). The AI verify-and-repair loop becomes a secondary study.
- **Decision:** call them "disruption scenarios", not "simulated students", so the results don't depend on assumed human behaviour.
- **Found: minimum sleep not enforced.** profiles.minimum_sleep_minutes is stored (default 480) but no scheduler code reads it.
- **Created** branch `aussef/harness` (a worktree, so production is untouched) and froze PROTOCOL.md v1 before any experiment.
