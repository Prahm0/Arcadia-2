# Results: 2026-10-05-fixed-arcadia-heldout (500 scenarios)

| Method | Plans breaking a rule | Coverage (95% CI) | Tasks fully prepared | Blocks unchanged (95% CI) | Disruption cost, mean (median) | Run time p95 / max |
|---|---|---|---|---|---|---|
| Insert into gaps (EDF) | 0.0% | 97.77% (97.40 to 98.12) | 95.4% | 97.4% (96.8 to 98.0) | 2.69 (0.00) | 2 / 5 ms |
| Arcadia after the fixes | 0.0% | 99.22% (98.95 to 99.45) | 98.1% | 67.5% (65.1 to 69.9) | 12.09 (7.76) | 4 / 14 ms |
| Full rebuild | 0.0% | 99.45% (99.21 to 99.66) | 98.8% | 2.0% (1.8 to 2.2) | 26.26 (23.99) | 1 / 4 ms |
| Stability-budgeted repair | 0.0% | 99.45% (99.22 to 99.66) | 98.8% | 92.6% (91.5 to 93.6) | 4.80 (1.50) | 276 / 485 ms |

Upper bound on coverage: 99.64%. Valid plans above it: 0. Certificate beaten: 0. Scenarios proven short of time: 33.

## M4 against each baseline (paired Wilcoxon, Holm-corrected)

| Against | Measure | Mean difference (95% CI) | M4 better / worse | p (Holm) | Rank-biserial r |
|---|---|---|---|---|---|
| Insert into gaps (EDF) | coverage | +1.69 pts (+1.41 to +1.98) | 191 / 0 | 2.1e-32 | +1.00 |
| Insert into gaps (EDF) | unchanged | -4.87 pts (-5.80 to -3.98) | 0 / 191 | 2.1e-32 | -1.00 |
| Insert into gaps (EDF) | disruption cost | +2.11 (+1.64 to +2.61) | 80 / 172 | 6.2e-18 | +0.64 |
| Arcadia after the fixes | coverage | +0.24 pts (+0.15 to +0.34) | 64 / 11 | 6.0e-10 | +0.84 |
| Arcadia after the fixes | unchanged | +25.06 pts (+23.13 to +27.07) | 389 / 16 | 1.4e-63 | +0.97 |
| Arcadia after the fixes | disruption cost | -7.29 (-8.07 to -6.53) | 386 / 35 | 1.1e-59 | -0.92 |
| Full rebuild | coverage | +0.01 pts (-0.02 to +0.03) | 20 / 18 | 4.8e-01 | +0.13 |
| Full rebuild | unchanged | +90.57 pts (+89.43 to +91.66) | 500 / 0 | 4.1e-83 | +1.00 |
| Full rebuild | disruption cost | -21.46 (-22.35 to -20.57) | 500 / 0 | 1.0e-82 | -1.00 |

Rank-biserial r > 0 means M4's value is higher than the baseline's (better for coverage and unchanged, worse for disruption cost).


Current Arcadia's rule breaks by kind (scenarios): 

## By workload

| Group | n | Arcadia coverage / unchanged / invalid | Rebuild coverage / unchanged | Repair coverage / unchanged |
|---|---|---|---|---|
| 0.5 | 100 | 99.78% / 88.9% / 0.0% | 99.95% / 0.7% | 99.95% / 97.7% |
| 0.7 | 100 | 99.91% / 71.1% / 0.0% | 99.95% / 1.7% | 99.97% / 96.3% |
| 0.85 | 100 | 99.73% / 57.0% / 0.0% | 99.85% / 2.0% | 99.86% / 92.1% |
| 0.95 | 100 | 99.82% / 59.2% / 0.0% | 99.95% / 2.4% | 99.93% / 91.1% |
| 1.1 | 100 | 96.82% / 61.3% / 0.0% | 97.53% / 3.2% | 97.56% / 85.7% |

## By disruption type

| Group | n | Arcadia coverage / unchanged / invalid | Rebuild coverage / unchanged | Repair coverage / unchanged |
|---|---|---|---|---|
| D1 | 84 | 99.80% / 74.4% / 0.0% | 99.85% / 1.8% | 99.81% / 97.8% |
| D2 | 84 | 99.34% / 86.6% / 0.0% | 99.68% / 1.9% | 99.66% / 98.3% |
| D3 | 83 | 98.85% / 61.0% / 0.0% | 99.11% / 1.8% | 99.08% / 89.8% |
| D4 | 83 | 99.34% / 77.3% / 0.0% | 99.55% / 1.7% | 99.58% / 92.9% |
| D5 | 83 | 98.92% / 49.3% / 0.0% | 99.20% / 2.6% | 99.25% / 87.9% |
| D6 | 83 | 99.03% / 56.1% / 0.0% | 99.31% / 2.2% | 99.32% / 88.5% |

## By severity

| Group | n | Arcadia coverage / unchanged / invalid | Rebuild coverage / unchanged | Repair coverage / unchanged |
|---|---|---|---|---|
| heavy | 87 | 98.63% / 45.9% / 0.0% | 99.00% / 2.7% | 99.00% / 80.9% |
| light | 250 | 99.46% / 83.4% / 0.0% | 99.68% / 1.5% | 99.67% / 98.3% |
| medium | 163 | 99.15% / 54.7% / 0.0% | 99.33% / 2.3% | 99.37% / 90.1% |

## By clock change in horizon

| Group | n | Arcadia coverage / unchanged / invalid | Rebuild coverage / unchanged | Repair coverage / unchanged |
|---|---|---|---|---|
| false | 427 | 99.19% / 68.2% / 0.0% | 99.42% / 2.0% | 99.43% / 92.7% |
| true | 73 | 99.37% / 63.2% / 0.0% | 99.62% / 1.7% | 99.59% / 91.8% |
