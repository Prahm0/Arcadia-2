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

## 5 October 2026 (evening): confirmatory and held-out results

**Confirmatory run:** 5,000 fresh scenarios (seeds 1000 to 5999) × 14 method variants = 70,000 repairs on the frozen M4 v2 (commit aba9d14), taking 24 minutes.
- **The validator caught a defect in my own baselines.** 6 of 5,000 full-rebuild repairs had no break after a block ending at midnight, all for students with a bedtime after midnight. The baselines' `book()` only updated the day it booked on. Fixed (amendment 4), and M1 and M3 re-run on the same seeds. The original file is kept.
- **The runner's "uncommitted" flag** was triggered by its own new results folder. No tracked files had changed. Now fixed.

**Final confirmatory results** (results/2026-10-05-confirmatory-final):

| Method | Rule breaks | Coverage (95% CI) | Blocks unchanged (95% CI) | Slowest run |
|---|---|---|---|---|
| No repair | 0% | 93.78% (93.51 to 94.05) | 97.6% | 8 ms |
| Insert into gaps | 0% | 97.52% (97.38 to 97.66) | 97.6% | 7 ms |
| Arcadia today | **16.4%** | 99.10% (99.01 to 99.18) | 68.8% (68.0 to 69.5) | 9 ms |
| Full rebuild | 0% | 99.49% (99.42 to 99.56) | 2.0% (1.9 to 2.1) | 13 ms |
| **M4 repair** | **0%** | **99.49% (99.42 to 99.56)** | **92.9% (92.5 to 93.2)** | **579 ms** |

- **Best possible coverage:** 99.65%. No valid plan exceeded it, and the certificate was never beaten. 370 scenarios were proven short of time.
- **M4 against the full rebuild:** coverage difference +0.00 points (−0.01 to +0.01, p = 0.49, no difference), and 90.9 points more of the plan unchanged (better in 5,000 of 5,000 scenarios).
- **M4 against Arcadia today:** +0.39 points of coverage (p < 10⁻¹⁰⁰), +24.1 points unchanged (better in 3,924 scenarios, worse in 138), and 0% against 16.4% invalid plans.
- **Hypotheses:** H1 (valid), H2 (coverage within 0.5 points of the rebuild), H3 (stability), H4 (certificate never beaten) and H5 (under 2 s) are **all supported**.
- **Weak spots:** at 110% workload M4 keeps 86.5% of the plan unchanged (97.7% at 50%). New-task disruptions keep 88.4%.

**Held-out run** (seeds 9000 to 9499, looked at once): M4 had 0% rule breaks, 99.45% coverage (the same as the full rebuild) and 92.5% unchanged. Arcadia today broke a rule in 18.8% of scenarios. The same conclusions hold.

**Assistance:** Claude Code ran and analysed the experiments under my direction.

## 5 October 2026 (night): visual demo

- **Built a demo page** that shows real confirmatory scenarios as a week calendar. It covers 8 seeds, one per disruption type, plus a scenario where Arcadia breaks a rule and one proven impossible. For each, it shows Arcadia's rebuild, a full rebuild and the repair algorithm side by side, highlighting moved, added and removed blocks. It's for understanding the algorithm and for the video.
- **Export script:** research/src/demo-export.ts. Data: research/demo/scenarios.json. Page template: research/demo/repair-viewer.template.html.
- **Example (seed 1026, a missed block):** of 36 future blocks, Arcadia changed 19, the full rebuild 36, and the repair 2.

## 5 October 2026 (late night): robustness, Arcadia after the six fixes (amendment 5)

**Why:** an external review (Codex) pointed out that the confirmatory "Arcadia today" (M2) still had the six defects I had since fixed. So I ran the **fixed** scheduler (branch aussef/fixes, commit e57b81e), with M1, M3 and M4 recomputed on its starting plans. It covered all 5,000 confirmatory seeds and all 500 held-out seeds. This is a post-hoc robustness check, not part of the frozen test.

**Confirmatory (5,000 scenarios):**

| Method | Rule breaks | Coverage | Blocks unchanged |
|---|---|---|---|
| Fixed Arcadia | 0% | 99.18% | 68.5% |
| Full rebuild | 0% | 99.49% | 2.0% |
| **M4** | **0%** | **99.49%** | **93.0%** |

- Paired: M4 was more stable than fixed Arcadia in 3,931 scenarios and less stable in 84; it had higher coverage in 713 and lower in 83.

**Held-out (500 scenarios):** fixed Arcadia 0% rule breaks, 99.22% coverage, 67.5% unchanged. M4: 0%, 99.45%, 92.6%.

**Conclusion:** the fixes remove Arcadia's rule breaks, but not its instability. M4's advantage does not come from the defects.

**Wording corrections** applied to the report after the review:
- the certificate is a lower bound ("at least N minutes");
- the coverage bound is an upper bound for a relaxed model;
- "same mean coverage to two decimal places", not "exactly the same";
- 5,000 scenarios × 14 methods = 70,000 evaluations;
- clock-change horizons are 793 of 5,000 (about 16%);
- H1 to H5 are predictions written during the confirmatory run, not pre-registered;
- criteria are "met within the synthetic benchmark".

## 5 October 2026 (late night): sensitivity to the cost weights (amendment 5)

**Why:** the change costs were my design choice and were revised once (amendment 2). An external review asked whether M4 only wins because of those particular weights.

**Run:** M4 on all 5,000 confirmatory seeds with three alternative weight sets (results/2026-10-05-sensitivity, commit 03c1596):
- **flat:** remove 2, other day 2;
- **steep:** near-term weight 1 / (1 + days)²;
- **add-heavy:** a new block costs 3.

**Results**, judged on weight-free measures:

| Weights | Rule breaks | Coverage | Blocks unchanged | Scenarios identical to the default |
|---|---|---|---|---|
| Default | 0% | 99.49% | 92.9% | 5,000 |
| Flat | 0% | 99.49% | 92.8% | 4,829 |
| Steep | 0% | 99.49% | 92.9% | 4,894 |
| Add-heavy | 0% | 99.49% | 92.8% | 4,934 |

Each variant was more stable than Arcadia before this project in 3,923 to 3,924 of 5,000 scenarios. The slowest repair took 0.87 s, still under the 2 s limit.

**Conclusion:** the result does not depend on the exact weights. Most repairs never face a choice where the weights matter, because local repair finds a nearby gap.

## 6 October 2026: exact optimal comparison results (amendment 6)

**Run:** all 1,000 seeds (1000 to 1999) at full size, results/2026-10-05-exact-optimal. The first run hit the 2-hour background limit after seed 1399, so I restarted from 1400 as a separate process and kept the Mac awake overnight. Nothing about the model or M4 changed between the two runs.

**Solver:** 941 proven optimal, 53 feasible but not proven, 6 with no plan in time (almost all at the highest workloads). Every solver plan passed the validator, which is a good check that the solver and validator agree on the rules.

**On the 941 proven-optimal scenarios:**

| Method | Reaches optimal coverage | Optimal on both | Extra blocks changed (mean) |
|---|---|---|---|
| **M4** | **94.8%** | **76.9%** | **1.28** |
| Arcadia before this project | 86.6% | 20.2% | 15.27 |
| Full rebuild | 93.6% | 0% | 53.43 |

M4's mean coverage gap to the optimum is 0.127 points.

**Why M4 sometimes changes too much:** I re-ran M4 with escalation off (src/exact-diagnose.ts). When M4 repairs locally (827 scenarios), it is almost always optimal on stability: 0.18 extra blocks on average, at most 6. All the big outliers (57 of 58 with 5 or more extra) come from escalation in overloaded weeks. Escalation does find coverage that local repair can't (0.33 to 10.21 points), but its windowed rebuild moves more blocks than it needs to.

**What this means:** the local repair is close to provably optimal. Escalation is the weak point and the obvious next improvement. I am not changing the frozen M4 for the report; any new version would be tested on fresh seeds.
