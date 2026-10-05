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

## 5 October 2026 (evening)

- **AUSSEF replied about the category.** They suggested Engineering Technology: Industrial Engineering (ETSD/IND) or Software Design: Algorithms (SFTD/ALG). **Decision: SFTD, Algorithms.** The project's contribution is a repair algorithm and its evaluation, which matches their definition of ALG ("the study or creation of algorithms").
- **AUSSEF replied about naming.** The anonymity rule exists to prevent judging bias, and publicly released names (the app, the video) can stay. **Decision:** use the name "Arcadia" throughout. Still keep school, teachers and state out of the report, since they aren't needed.

## 5 October 2026 (night): first version of M4 and the pilot

**Objective:** build the stability-budgeted repair (M4) and the infeasibility certificate, and run the pilot.

**First attempt failed.** In a 24-scenario smoke test, M4 reached 98.3% coverage, about the same as simple insertion (M1). With bumping turned off it scored the same, so bumping was never working.
- **Cause, from a trace of seed 2:** every day before the deadline was already at its study cap with *other deadline work*, so there was no subject time to bump. Bumped work had to find a new home, but the first version only searched the 4 nearest days, which were also full.
- **Fix: displacement chains.** A bumped deadline block now searches every day up to its own due time. If it still can't fit, it may bump work due even later (a chain of at most 2 bumps). Deadline work is never dropped.

**Pilot results** (seeds 1 to 240, exploratory, results/2026-10-05-pilot):

| Method | Plans breaking a rule | Coverage | Blocks unchanged | Disruption cost (median) |
|---|---|---|---|---|
| M1 insert | 0% | 97.9% | 97.4% | 0.60 |
| M2 Arcadia | 13.8% | 99.3% | 69.1% | 5.85 |
| M3 rebuild | 0% | 99.7% | 2.0% | 23.51 |
| **M4 repair** | **0%** | **99.4%** | **95.2%** | **1.25** |

- **Paired against Arcadia (M2):** M4 caused less disruption in 187 of 240 scenarios and more in 17. Coverage was about the same: higher in 26, lower in 18.
- **The frontier** (budgets 0.5 to 8) rises smoothly, from 95.0% to 99.3% coverage.
- **Ablations:**
  - without bumping, coverage falls to 97.9%;
  - with a fixed 1-day window, it falls to 97.2%;
  - without near-term weighting, coverage is the same but mean cost is 20% higher (4.46 against 3.71), and it is slower.
- **The certificate was never wrong:** no valid plan from any method beat its minimum. It flagged 18 of 240 scenarios as short of time. In several of them, the full rebuild hit the certificate's minimum exactly, so the bound is tight.
- **Weakness:** in overloaded weeks M4 leaves more work unbooked than the full rebuild (seed 94: 240 minutes against a minimum of 15). Global reordering beats local repair when the week is overloaded.
- **Run time:** M4's 95th percentile is 0.3 s and its maximum 1.1 s, under the 2 s limit.

**Pilot review (protocol section 10):** M4 meets criterion 1 (about equal coverage, much less disruption than M2 and M3) and criterion 4 (the certificates are correct). **Decision: continue.**

**Before the confirmatory run, to fix:**
1. Overloaded weeks: when the certificate shows a shortfall, fall back to a global reorder of the work in the short window.
2. Speed up the ablation without near-term weighting.
3. Add the exact optimiser (OR) for small instances.

**Assistance:** the algorithm and harness code were written with Claude Code under my direction. I reviewed the trace and chose the fix.

## 5 October 2026 (late): M4 version 2, frozen

**Objective:** close M4's coverage gap with the full rebuild in overloaded weeks, then freeze it before the confirmatory run.

**What I tried, in order:**
1. **A window rebuild in deadline order.** Coverage went up only from 99.30% to 99.37%, and stability dropped from 96.4% to 92.9% of blocks unchanged. Not worth it.
2. **Split re-homing and deeper chains.** Coverage reached 99.36%. Still short.
3. **A "sticky" rebuild,** where each task takes back its own slots first. It barely helped. A trace of seeds 28, 38 and 24 showed why: fixing the short window pushed later work past *its* deadline, because the days after the window were locked.
4. **The fix: a growing window.** If the rebuild pushes work past its deadline, widen the window to that deadline and rebuild again. The ripple then spreads only as far as it has to. On seeds 1 to 40, coverage was 99.69%, against 99.70% for the full rebuild.
5. **Speed.** 5 of 240 repairs took over 2 s, the slowest 5.4 s. I added a deterministic limit on gap searches (a count, not a clock, so results are the same on any computer) and compared 20,000, 100,000 and 300,000 on the pilot. **Chose 100,000:** 92.8% of blocks unchanged, slowest run 0.4 s.

**Exact coverage bound added.** Because every task's window starts at the same moment, taking work in priority order is provably optimal (a matroid). That gives the most coverage any plan could reach. It replaces the small-instance optimiser and covers every scenario. Protocol amendment 3 records all of this.

**Pilot with the frozen M4 v2** (seeds 1 to 240, results/2026-10-05-pilot-v2):

| Method | Rule breaks | Coverage | Blocks unchanged | Cost (median) | Slowest run (ms) |
|---|---|---|---|---|---|
| M0 | 0.0% | 94.01% | 97.4% | 0.00 | 1 |
| M1 | 0.0% | 97.92% | 97.4% | 0.60 | 2 |
| M2 | 13.8% | 99.30% | 69.1% | 5.85 | 4 |
| M3 | 0.0% | 99.66% | 2.0% | 23.51 | 1 |
| M4 | 0.0% | 99.65% | 92.8% | 1.42 | 464 |

- **Best possible coverage (the bound):** 99.81%. No valid plan from any method exceeded it, and the certificate was never beaten.
- **M4 against Arcadia, week by week:** less disruption in 181 of 240 weeks (more in 23); higher coverage in 34 (lower in 5).
- **Ablations:** with escalation, every variant reaches the same coverage, so each part now shows up as *stability*:

| Variant | Blocks unchanged |
|---|---|
| Full M4 | 92.8% |
| Without near-term weighting | 92.0% |
| Without bumping | 88.9% |
| Fixed 1-day window | 86.6% |

  Without escalation, coverage falls to 99.34%.

**Decision:** M4 v2 is frozen. **Next:** the confirmatory run on fresh seeds (1000 to 5999) and the held-out seeds, then statistics and charts. Separately: fix the 6 production bugs and re-test M2.

**Assistance:** Claude Code wrote the code under my direction. I chose what to try and when to stop.
