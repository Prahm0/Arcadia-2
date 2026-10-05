# Exact optimal comparison (amendment 6)

Confirmatory seeds 1000 to 1999, full 28-day scenarios. OR-Tools CP-SAT 9.15, 120 s solver limit, 8 workers.
Run 5 October 2026 16:07 to 6 October 2026 about 07:00 (seeds 1000 to 1399 in the first run, which hit the
2-hour background limit while solving 1400 to 1499; that chunk was re-run from scratch with 1400 to 1999).

## Solver status

| Status | Scenarios | Wall time, median / max |
|---|---|---|
| OPTIMAL (proven best) | 941 | 1.6 s / 678.9 s |
| FEASIBLE (limit reached, not proven) | 53 | 120.8 s / 1073.3 s |
| UNKNOWN (no plan found in time) | 6 | 363.2 s / 661.6 s |

Wall time includes building the model; the 120 s limit applies to the search. 54 of the 59 unproven
scenarios are at utilisation 0.95 or 1.1. Every solver plan (OPTIMAL and FEASIBLE) passed the validator.

## The 941 proven-optimal scenarios

| Method | Rule breaks | Reaches optimal coverage | Coverage gap, mean / max (points) | Optimal on both coverage and blocks kept | Extra blocks changed when coverage is optimal, mean / median / max |
|---|---|---|---|---|---|
| M4 | 0 | 892 (94.8%) | 0.127 / 13.38 | 724 (76.9%) | 1.28 / 0 / 41 |
| M2 Arcadia before this project | 153 | 815 (86.6%) | 0.470 / 18.18 | 190 (20.2%) | 15.27 / 8 / 106 |
| M3 Full rebuild | 0 | 881 (93.6%) | 0.150 / 13.87 | 0 (0.0%) | 53.43 / 49 / 138 |

- Mean coverage: optimum 99.74%, M4 99.61%. Mean blocks unchanged: optimum 95.4%, M4 93.8%.
- Where M4 reaches optimal coverage, its unchanged-block gap is mean 1.64 points, median 0.00, max 39.33.
- Distribution of M4's extra changed blocks (892 scenarios): 0 in 724, 1 in 75, 2 in 27, 3 to 4 in 8, 5 or more in 58.

## Where M4's extra changes come from (diagnose.csv)

M4 was re-run with escalation turned off on the same seeds (src/exact-diagnose.ts). If the two plans differ, escalation fired.

- Escalation fired in 125 of 1,000 scenarios (75 at utilisation 1.1, 38 at 0.95, 12 at 0.85).
- Of the 892 scenarios where M4 reaches optimal coverage:
  - **no escalation (827):** extra blocks changed mean 0.18, median 0, max 6; zero in 724;
  - **escalation (65):** mean 15.35, median 14, max 41; never zero.
- 57 of the 58 scenarios with 5 or more extra changes used escalation.
- In those 57, local repair alone never reached optimal coverage; escalation added 0.33 to 10.21 points (mean 3.55).

**Reading:** local repair is near-optimal on stability. Escalation finds the extra coverage in overloaded
weeks, but its windowed rebuild moves more blocks than the optimum needs. This is the clearest place to
improve M4. Any change would be a new version, tested on fresh seeds; the frozen M4 is what is reported here.

## The 53 FEASIBLE scenarios (not counted above)

M4's coverage was at least the solver's best-found plan in 29 of 53.
