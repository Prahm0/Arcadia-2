# Results: 2026-10-05-confirmatory (5000 scenarios)

| Method | Plans breaking a rule | Coverage (95% CI) | Tasks fully prepared | Blocks unchanged (95% CI) | Disruption cost, mean (median) | Run time p95 / max |
|---|---|---|---|---|---|---|
| No repair | 0.0% | 93.78% (93.51 to 94.05) | 89.6% | 97.6% (97.5 to 97.8) | 2.66 (0.00) | 1 / 8 ms |
| Insert into gaps (EDF) | 0.0% | 97.52% (97.38 to 97.66) | 95.6% | 97.6% (97.4 to 97.8) | 2.46 (0.26) | 2 / 9 ms |
| Arcadia today | 16.4% | 99.10% (99.01 to 99.18) | 97.8% | 68.8% (68.0 to 69.5) | 11.23 (6.82) | 3 / 9 ms |
| Full rebuild | 0.1% | 99.49% (99.42 to 99.56) | 98.9% | 2.0% (1.9 to 2.1) | 25.61 (23.19) | 1 / 5 ms |
| Stability-budgeted repair | 0.0% | 99.49% (99.42 to 99.56) | 98.8% | 92.9% (92.5 to 93.2) | 4.59 (1.22) | 235 / 579 ms |
| M4-b0.5 | 0.0% | 94.72% (94.46 to 94.97) | 91.4% | 97.5% (97.4 to 97.7) | 2.39 (0.00) | 164 / 622 ms |
| M4-b1 | 0.0% | 96.09% (95.88 to 96.29) | 93.4% | 97.3% (97.1 to 97.4) | 2.43 (0.62) | 183 / 644 ms |
| M4-b2 | 0.0% | 97.39% (97.23 to 97.55) | 95.2% | 96.7% (96.6 to 96.9) | 2.59 (0.99) | 208 / 588 ms |
| M4-b4 | 0.0% | 98.54% (98.43 to 98.65) | 96.8% | 96.1% (96.0 to 96.3) | 2.84 (1.00) | 228 / 585 ms |
| M4-b8 | 0.0% | 99.03% (98.95 to 99.12) | 97.7% | 95.8% (95.6 to 95.9) | 3.07 (1.00) | 234 / 620 ms |
| M4-noNear | 0.0% | 99.49% (99.42 to 99.56) | 98.9% | 92.2% (91.9 to 92.6) | 5.55 (1.53) | 203 / 408 ms |
| M4-noEject | 0.0% | 99.50% (99.43 to 99.56) | 98.9% | 89.2% (88.8 to 89.6) | 7.05 (1.83) | 5 / 14 ms |
| M4-fixedWindow | 0.0% | 99.49% (99.42 to 99.56) | 98.9% | 86.9% (86.5 to 87.4) | 8.17 (3.07) | 39 / 676 ms |
| M4-noEscalate | 0.0% | 99.13% (99.05 to 99.21) | 97.9% | 95.7% (95.5 to 95.8) | 3.18 (1.00) | 232 / 607 ms |

Best possible coverage (exact bound): 99.65%. Valid plans above it: 0. Certificate beaten: 0. Scenarios proven short of time: 370.

## M4 against each baseline (paired Wilcoxon, Holm-corrected)

| Against | Measure | Mean difference (95% CI) | M4 better / worse | p (Holm) | Rank-biserial r |
|---|---|---|---|---|---|
| No repair | coverage | +5.71 pts (+5.46 to +5.97) | 3417 / 0 | 0.0e+00 | +1.00 |
| No repair | unchanged | -4.75 pts (-5.04 to -4.47) | 0 / 1814 | 4.7e-297 | -1.00 |
| No repair | disruption cost | +1.93 (+1.77 to +2.10) | 1239 / 2335 | 1.5e-95 | +0.40 |
| Insert into gaps (EDF) | coverage | +1.97 pts (+1.86 to +2.09) | 1808 / 8 | 1.6e-296 | +1.00 |
| Insert into gaps (EDF) | unchanged | -4.75 pts (-5.04 to -4.47) | 0 / 1814 | 4.7e-297 | -1.00 |
| Insert into gaps (EDF) | disruption cost | +2.13 (+1.98 to +2.29) | 807 / 1697 | 8.4e-178 | +0.66 |
| Arcadia today | coverage | +0.39 pts (+0.36 to +0.43) | 767 / 75 | 9.7e-122 | +0.94 |
| Arcadia today | unchanged | +24.06 pts (+23.44 to +24.68) | 3924 / 138 | 0.0e+00 | +0.98 |
| Arcadia today | disruption cost | -6.64 (-6.87 to -6.40) | 3910 / 341 | 0.0e+00 | -0.90 |
| Full rebuild | coverage | +0.00 pts (-0.01 to +0.01) | 188 / 201 | 4.9e-01 | +0.04 |
| Full rebuild | unchanged | +90.86 pts (+90.52 to +91.20) | 5000 / 0 | 0.0e+00 | +1.00 |
| Full rebuild | disruption cost | -21.02 (-21.30 to -20.75) | 5000 / 0 | 0.0e+00 | -1.00 |

Rank-biserial r > 0 means M4's value is higher than the baseline's (better for coverage and unchanged, worse for disruption cost).


Current Arcadia's rule breaks by kind (scenarios): commitment 185, break 467, late 216

## By workload

| Group | n | Arcadia coverage / unchanged / invalid | Rebuild coverage / unchanged | Repair coverage / unchanged |
|---|---|---|---|---|
| 0.5 | 1000 | 99.76% / 88.8% / 9.2% | 99.97% / 1.0% | 99.98% / 97.7% |
| 0.7 | 1000 | 99.69% / 72.7% / 12.9% | 99.94% / 1.4% | 99.95% / 95.7% |
| 0.85 | 1000 | 99.54% / 62.3% / 15.2% | 99.82% / 1.8% | 99.82% / 93.9% |
| 0.95 | 1000 | 99.13% / 59.9% / 18.3% | 99.51% / 2.3% | 99.50% / 90.5% |
| 1.1 | 1000 | 97.37% / 60.3% / 26.4% | 98.22% / 3.5% | 98.22% / 86.5% |

## By disruption type

| Group | n | Arcadia coverage / unchanged / invalid | Rebuild coverage / unchanged | Repair coverage / unchanged |
|---|---|---|---|---|
| D1 | 833 | 99.22% / 73.8% / 16.4% | 99.51% / 2.1% | 99.50% / 97.6% |
| D2 | 833 | 99.39% / 87.4% / 18.2% | 99.67% / 2.1% | 99.67% / 98.1% |
| D3 | 833 | 99.08% / 64.4% / 12.0% | 99.43% / 1.8% | 99.41% / 89.5% |
| D4 | 833 | 99.43% / 79.0% / 16.8% | 99.63% / 2.0% | 99.65% / 94.7% |
| D5 | 834 | 98.49% / 50.6% / 20.3% | 99.25% / 2.2% | 99.29% / 88.4% |
| D6 | 834 | 99.00% / 57.6% / 14.6% | 99.45% / 1.8% | 99.43% / 88.9% |

## By severity

| Group | n | Arcadia coverage / unchanged / invalid | Rebuild coverage / unchanged | Repair coverage / unchanged |
|---|---|---|---|---|
| heavy | 848 | 98.40% / 47.6% / 18.5% | 99.16% / 2.3% | 99.17% / 81.6% |
| light | 2512 | 99.40% / 83.0% / 14.5% | 99.64% / 1.8% | 99.64% / 98.5% |
| medium | 1640 | 99.00% / 57.9% / 18.2% | 99.43% / 2.1% | 99.43% / 90.0% |

## By clock change in horizon

| Group | n | Arcadia coverage / unchanged / invalid | Rebuild coverage / unchanged | Repair coverage / unchanged |
|---|---|---|---|---|
| false | 4207 | 99.09% / 68.6% / 14.5% | 99.48% / 2.0% | 99.49% / 92.8% |
| true | 793 | 99.14% / 69.6% / 26.5% | 99.52% / 1.9% | 99.52% / 93.3% |
