# Results: 2026-10-05-heldout (500 scenarios)

| Method | Plans breaking a rule | Coverage (95% CI) | Tasks fully prepared | Blocks unchanged (95% CI) | Disruption cost, mean (median) | Run time p95 / max |
|---|---|---|---|---|---|---|
| No repair | 0.0% | 94.42% (93.58 to 95.19) | 89.4% | 97.3% (96.7 to 97.8) | 3.13 (0.00) | 1 / 1 ms |
| Insert into gaps (EDF) | 0.0% | 97.76% (97.39 to 98.11) | 95.4% | 97.3% (96.7 to 97.8) | 2.74 (0.19) | 2 / 3 ms |
| Arcadia today | 18.8% | 99.17% (98.88 to 99.43) | 98.0% | 68.5% (66.1 to 70.8) | 11.59 (6.89) | 3 / 4 ms |
| Full rebuild | 0.0% | 99.45% (99.20 to 99.66) | 98.8% | 2.0% (1.8 to 2.2) | 26.26 (23.95) | 1 / 2 ms |
| Stability-budgeted repair | 0.0% | 99.45% (99.22 to 99.65) | 98.7% | 92.5% (91.4 to 93.5) | 4.79 (1.52) | 236 / 430 ms |
| M4-b0.5 | 0.0% | 95.24% (94.46 to 95.97) | 91.1% | 97.2% (96.5 to 97.7) | 2.84 (0.00) | 179 / 422 ms |
| M4-b1 | 0.0% | 96.44% (95.78 to 97.05) | 92.9% | 96.9% (96.3 to 97.4) | 2.81 (0.56) | 194 / 433 ms |
| M4-b2 | 0.0% | 97.60% (97.08 to 98.06) | 94.9% | 96.3% (95.7 to 96.9) | 2.90 (0.98) | 226 / 447 ms |
| M4-b4 | 0.0% | 98.56% (98.19 to 98.90) | 96.7% | 95.8% (95.2 to 96.4) | 3.08 (1.05) | 227 / 433 ms |
| M4-b8 | 0.0% | 99.04% (98.77 to 99.30) | 97.6% | 95.5% (94.8 to 96.1) | 3.27 (1.09) | 240 / 433 ms |
| M4-noNear | 0.0% | 99.46% (99.22 to 99.66) | 98.7% | 92.0% (90.8 to 93.0) | 5.81 (1.82) | 190 / 361 ms |
| M4-noEject | 0.0% | 99.46% (99.22 to 99.66) | 98.7% | 88.4% (87.0 to 89.7) | 7.35 (2.01) | 5 / 11 ms |
| M4-fixedWindow | 0.0% | 99.45% (99.22 to 99.66) | 98.7% | 85.8% (84.4 to 87.3) | 8.67 (3.61) | 36 / 465 ms |
| M4-noEscalate | 0.0% | 99.10% (98.83 to 99.34) | 97.8% | 95.4% (94.7 to 96.0) | 3.36 (1.09) | 235 / 494 ms |

Best possible coverage (exact bound): 99.64%. Valid plans above it: 0. Certificate beaten: 0. Scenarios proven short of time: 33.

## M4 against each baseline (paired Wilcoxon, Holm-corrected)

| Against | Measure | Mean difference (95% CI) | M4 better / worse | p (Holm) | Rank-biserial r |
|---|---|---|---|---|---|
| No repair | coverage | +5.03 pts (+4.28 to +5.87) | 339 / 0 | 2.3e-56 | +1.00 |
| No repair | unchanged | -4.78 pts (-5.69 to -3.91) | 0 / 193 | 1.4e-32 | -1.00 |
| No repair | disruption cost | +1.66 (+1.15 to +2.22) | 127 / 227 | 1.7e-07 | +0.33 |
| Insert into gaps (EDF) | coverage | +1.69 pts (+1.42 to +1.99) | 191 / 2 | 2.8e-32 | +0.99 |
| Insert into gaps (EDF) | unchanged | -4.78 pts (-5.69 to -3.94) | 0 / 193 | 1.4e-32 | -1.00 |
| Insert into gaps (EDF) | disruption cost | +2.05 (+1.58 to +2.57) | 84 / 174 | 1.3e-17 | +0.62 |
| Arcadia today | coverage | +0.27 pts (+0.18 to +0.38) | 66 / 12 | 1.5e-09 | +0.81 |
| Arcadia today | unchanged | +24.03 pts (+22.04 to +25.99) | 387 / 25 | 1.8e-62 | +0.96 |
| Arcadia today | disruption cost | -6.80 (-7.59 to -6.01) | 381 / 50 | 3.0e-53 | -0.86 |
| Full rebuild | coverage | +0.00 pts (-0.02 to +0.03) | 18 / 18 | 7.2e-01 | +0.07 |
| Full rebuild | unchanged | +90.50 pts (+89.37 to +91.60) | 500 / 0 | 5.8e-83 | +1.00 |
| Full rebuild | disruption cost | -21.47 (-22.38 to -20.59) | 500 / 0 | 1.4e-82 | -1.00 |

Rank-biserial r > 0 means M4's value is higher than the baseline's (better for coverage and unchanged, worse for disruption cost).


Current Arcadia's rule breaks by kind (scenarios): commitment 27, break 55, late 20

## By workload

| Group | n | Arcadia coverage / unchanged / invalid | Rebuild coverage / unchanged | Repair coverage / unchanged |
|---|---|---|---|---|
| 0.5 | 100 | 99.78% / 89.2% / 10.0% | 99.95% / 0.7% | 99.95% / 97.6% |
| 0.7 | 100 | 99.91% / 71.9% / 27.0% | 99.96% / 1.7% | 99.97% / 96.0% |
| 0.85 | 100 | 99.70% / 59.2% / 18.0% | 99.85% / 1.9% | 99.86% / 92.0% |
| 0.95 | 100 | 99.79% / 59.6% / 17.0% | 99.94% / 2.4% | 99.92% / 91.4% |
| 1.1 | 100 | 96.69% / 62.4% / 22.0% | 97.53% / 3.2% | 97.54% / 85.3% |

## By disruption type

| Group | n | Arcadia coverage / unchanged / invalid | Rebuild coverage / unchanged | Repair coverage / unchanged |
|---|---|---|---|---|
| D1 | 84 | 99.78% / 75.3% / 17.9% | 99.84% / 1.8% | 99.81% / 97.7% |
| D2 | 84 | 99.31% / 87.2% / 21.4% | 99.68% / 1.9% | 99.67% / 98.2% |
| D3 | 83 | 98.82% / 63.3% / 14.5% | 99.09% / 1.8% | 99.08% / 89.7% |
| D4 | 83 | 99.26% / 77.1% / 18.1% | 99.56% / 1.7% | 99.58% / 92.7% |
| D5 | 83 | 98.89% / 49.4% / 20.5% | 99.20% / 2.5% | 99.25% / 88.2% |
| D6 | 83 | 98.99% / 58.2% / 20.5% | 99.31% / 2.3% | 99.30% / 88.3% |

## By severity

| Group | n | Arcadia coverage / unchanged / invalid | Rebuild coverage / unchanged | Repair coverage / unchanged |
|---|---|---|---|---|
| heavy | 89 | 98.70% / 46.9% / 16.9% | 99.02% / 2.8% | 99.03% / 81.1% |
| light | 251 | 99.41% / 83.8% / 17.1% | 99.69% / 1.5% | 99.67% / 98.1% |
| medium | 160 | 99.07% / 56.3% / 22.5% | 99.31% / 2.3% | 99.34% / 90.0% |

## By clock change in horizon

| Group | n | Arcadia coverage / unchanged / invalid | Rebuild coverage / unchanged | Repair coverage / unchanged |
|---|---|---|---|---|
| false | 427 | 99.16% / 69.1% / 16.2% | 99.42% / 2.0% | 99.42% / 92.7% |
| true | 73 | 99.29% / 64.7% / 34.2% | 99.62% / 1.8% | 99.59% / 91.5% |
