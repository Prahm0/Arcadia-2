# Results: 2026-10-05-fixed-arcadia-confirmatory (5000 scenarios)

| Method | Plans breaking a rule | Coverage (95% CI) | Tasks fully prepared | Blocks unchanged (95% CI) | Disruption cost, mean (median) | Run time p95 / max |
|---|---|---|---|---|---|---|
| Insert into gaps (EDF) | 0.0% | 97.53% (97.39 to 97.66) | 95.6% | 97.8% (97.6 to 97.9) | 2.41 (0.13) | 2 / 15 ms |
| Arcadia after the fixes | 0.0% | 99.18% (99.09 to 99.26) | 98.0% | 68.5% (67.7 to 69.3) | 11.42 (7.00) | 4 / 18 ms |
| Full rebuild | 0.0% | 99.49% (99.42 to 99.56) | 98.9% | 2.0% (1.9 to 2.1) | 25.56 (23.14) | 1 / 4 ms |
| Stability-budgeted repair | 0.0% | 99.49% (99.42 to 99.56) | 98.8% | 93.0% (92.7 to 93.3) | 4.54 (1.17) | 245 / 613 ms |

Upper bound on coverage: 99.65%. Valid plans above it: 0. Certificate beaten: 0. Scenarios proven short of time: 369.

## M4 against each baseline (paired Wilcoxon, Holm-corrected)

| Against | Measure | Mean difference (95% CI) | M4 better / worse | p (Holm) | Rank-biserial r |
|---|---|---|---|---|---|
| Insert into gaps (EDF) | coverage | +1.97 pts (+1.86 to +2.09) | 1795 / 1 | 2.9e-294 | +1.00 |
| Insert into gaps (EDF) | unchanged | -4.74 pts (-5.04 to -4.46) | 0 / 1796 | 2.9e-294 | -1.00 |
| Insert into gaps (EDF) | disruption cost | +2.14 (+1.99 to +2.29) | 734 / 1675 | 4.1e-182 | +0.68 |
| Arcadia after the fixes | coverage | +0.32 pts (+0.29 to +0.35) | 713 / 83 | 3.9e-110 | +0.91 |
| Arcadia after the fixes | unchanged | +24.51 pts (+23.91 to +25.14) | 3931 / 84 | 0.0e+00 | +0.98 |
| Arcadia after the fixes | disruption cost | -6.88 (-7.12 to -6.64) | 3911 / 273 | 0.0e+00 | -0.93 |
| Full rebuild | coverage | +0.00 pts (-0.00 to +0.01) | 188 / 196 | 3.6e-01 | +0.05 |
| Full rebuild | unchanged | +91.02 pts (+90.67 to +91.36) | 5000 / 0 | 0.0e+00 | +1.00 |
| Full rebuild | disruption cost | -21.02 (-21.29 to -20.75) | 5000 / 0 | 0.0e+00 | -1.00 |

Rank-biserial r > 0 means M4's value is higher than the baseline's (better for coverage and unchanged, worse for disruption cost).


Current Arcadia's rule breaks by kind (scenarios): 

## By workload

| Group | n | Arcadia coverage / unchanged / invalid | Rebuild coverage / unchanged | Repair coverage / unchanged |
|---|---|---|---|---|
| 0.5 | 1000 | 99.76% / 88.7% / 0.0% | 99.97% / 1.0% | 99.98% / 97.8% |
| 0.7 | 1000 | 99.70% / 72.3% / 0.0% | 99.94% / 1.4% | 99.95% / 95.8% |
| 0.85 | 1000 | 99.60% / 62.1% / 0.0% | 99.82% / 1.8% | 99.82% / 94.0% |
| 0.95 | 1000 | 99.21% / 59.1% / 0.0% | 99.51% / 2.3% | 99.50% / 90.7% |
| 1.1 | 1000 | 97.60% / 60.3% / 0.0% | 98.22% / 3.5% | 98.23% / 86.8% |

## By disruption type

| Group | n | Arcadia coverage / unchanged / invalid | Rebuild coverage / unchanged | Repair coverage / unchanged |
|---|---|---|---|---|
| D1 | 833 | 99.29% / 73.7% / 0.0% | 99.51% / 2.1% | 99.50% / 97.8% |
| D2 | 833 | 99.44% / 87.1% / 0.0% | 99.67% / 2.1% | 99.67% / 98.2% |
| D3 | 833 | 99.18% / 63.0% / 0.0% | 99.43% / 1.8% | 99.42% / 89.6% |
| D4 | 833 | 99.48% / 79.2% / 0.0% | 99.63% / 2.0% | 99.65% / 94.8% |
| D5 | 834 | 98.59% / 50.8% / 0.0% | 99.25% / 2.2% | 99.29% / 88.6% |
| D6 | 834 | 99.06% / 57.2% / 0.0% | 99.45% / 1.9% | 99.43% / 89.1% |

## By severity

| Group | n | Arcadia coverage / unchanged / invalid | Rebuild coverage / unchanged | Repair coverage / unchanged |
|---|---|---|---|---|
| heavy | 844 | 98.47% / 47.1% / 0.0% | 99.16% / 2.3% | 99.17% / 81.7% |
| light | 2527 | 99.46% / 83.1% / 0.0% | 99.64% / 1.8% | 99.64% / 98.7% |
| medium | 1629 | 99.10% / 57.0% / 0.0% | 99.44% / 2.2% | 99.43% / 90.1% |

## By clock change in horizon

| Group | n | Arcadia coverage / unchanged / invalid | Rebuild coverage / unchanged | Repair coverage / unchanged |
|---|---|---|---|---|
| false | 4207 | 99.17% / 68.4% / 0.0% | 99.48% / 2.0% | 99.49% / 92.9% |
| true | 793 | 99.20% / 69.2% / 0.0% | 99.52% / 1.9% | 99.52% / 93.8% |
