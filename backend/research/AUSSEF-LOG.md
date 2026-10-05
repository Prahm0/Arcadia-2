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
- **Protocol amendment 1** (before any experiment): simpler research question wording, 15-minute slots for M4 and OR only, release times added as a hard constraint, disruption severity tags, equal time limits per method, and the contribution boundary set at 5 Oct.
- **Provenance worksheet** created (provenance/git-worksheet.csv): 227 merged PRs, 27 of which touch the scheduling engine. To verify: my role in each core PR.
- **Logbook format from today:** objective, action, decision and reason, evidence, what failed, next step, and who or what helped.

## 5 October 2026 (afternoon): the harness is built, and the first baseline numbers

**Objective:** build the test harness and get real numbers for the four baseline methods.

**Action:**
- Split `planStudy()` out of `rebuildSchedule()`, a pure move with no logic change, so the real scheduler can run without a database.
- Changed `StudyCredit` to a plain field, because Node 26 dropped the flag the old tests used.
- Built:
  - a seeded scenario generator;
  - an independent rule checker, with its own time code;
  - baselines M0 (no repair), M1 (greedy EDF insertion) and M3 (coverage-first rebuild);
  - an adapter that runs the live Arcadia algorithm (M2);
  - the measures and the runner.

**Amendment 2** (made after a 12-scenario smoke test, before the pilot):
- The v1 disruption cost made moving a block 1 day cost about 98, but deleting it only 4, which would reward deleting. Every term is now bounded.
- Subject error now counts shortfall only.

**Fairness fix:** M0 and M1 now drop any starting-plan block that is already invalid, so they don't inherit Arcadia's defects.

**Results.** Baseline pilot, seeds 1 to 240, exploratory only (results/2026-10-05-baselines-pilot):

| Method | Plans breaking a rule | Coverage (mean) | Blocks unchanged (median) | Disruption cost (median) |
|---|---|---|---|---|
| M0 no repair | 0% | 94.0% | 100% | 0.00 |
| M1 EDF insert | 0% | 97.9% | 100% | 0.60 |
| M2 Arcadia | **13.8%** | 99.3% | 76.5% | 5.85 |
| M3 full rebuild | 0% | 99.7% | 0% | 23.51 |

**What this shows.** There is a clear trade-off between coverage and change. Insertion barely changes the plan but loses about 2 points of coverage. A full rebuild gets the coverage but changes every block. Arcadia sits in between, and breaks a hard rule in 1 of every 7 disrupted weeks. **Target for M4:** coverage close to M3 with change close to M1, and zero violations.

**Defects found** by the independent rule checker (all in the live code, all on the scheduler's own output):

4. **Deadline work booked after it's due.** When a task is due before school, `pickSpot()` falls back to the end of the morning gap and ignores the due time. Seed 9: due Thu 8:30am, and the last block was booked 8:45 to 9:00am.
5. **No break next to blocks it keeps.** A new block can start the minute an under-way block ends, because kept blocks are subtracted as busy time without the break around them.
6. **One-off commitments land a day early west of Greenwich.** `commitmentSlots()` compares the date's UTC midnight with local days. Confirmed in America/Los_Angeles and America/New_York: a Thursday 4pm one-off lands on Wednesday at 4pm. The Recovery Loop's "Busy" and "Time off" are one-offs for today, so for students in the Americas they protect yesterday instead.

Also confirmed live: the daylight-saving defect from 4 Oct. Seed 1, Hobart, 4 Apr 2027: study booked 30 minutes over a work shift.

**Next:**
- Design and build M4 (the stability-budgeted repair).
- Pilot it against these baselines.
- Run the continue-or-change review by 16 Oct.

**Assistance:** harness code was written with Claude Code under my direction. The design decisions and the review of each finding were mine.
