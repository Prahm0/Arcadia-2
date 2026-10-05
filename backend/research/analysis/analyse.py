"""
Statistics and figures for one run (PROTOCOL.md section 9).

    python analyse.py <results-folder>

Writes into <results-folder>/analysis/:
  summary.md      tables for the report
  stats.json      every number, machine-readable
  fig1..fig6.png  figures for the report (print, light background)
"""
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy import stats

RUN = Path(sys.argv[1])
OUT = RUN / "analysis"
OUT.mkdir(exist_ok=True)
rng = np.random.default_rng(20261005)

rows = list(csv.DictReader(open(RUN / "results.csv")))
by = defaultdict(list)
for r in rows:
    by[r["method"]].append(r)
for m in by:
    by[m].sort(key=lambda r: int(r["seed"]))
seeds = [int(r["seed"]) for r in by["M4"]]
N = len(seeds)

NAMES = {
    "M0": "No repair",
    "M1": "Insert into gaps (EDF)",
    "M2": "Arcadia today",
    "M3": "Full rebuild",
    "M4": "Stability-budgeted repair",
}
MAIN = ["M0", "M1", "M2", "M3", "M4"]


def col(m, key):
    return np.array([float(r[key]) for r in by[m]])


def boot_ci(x, n=10_000):
    idx = rng.integers(0, len(x), size=(n, len(x)))
    means = x[idx].mean(axis=1)
    return float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def wilcoxon(a, b):
    d = a - b
    nz = d[d != 0]
    if len(nz) == 0:
        return 1.0, 0.0
    p = stats.wilcoxon(a, b, zero_method="wilcox").pvalue
    ranks = stats.rankdata(np.abs(nz))
    rbc = (ranks[nz > 0].sum() - ranks[nz < 0].sum()) / ranks.sum()
    return float(p), float(rbc)


def holm(ps):
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    adj = [0.0] * len(ps)
    running = 0.0
    for k, i in enumerate(order):
        running = max(running, min(1.0, (len(ps) - k) * ps[i]))
        adj[i] = running
    return adj


out = {"run": RUN.name, "scenarios": N, "methods": {}}

# ---- per-method summary ----
for m, R in by.items():
    cov = col(m, "coverage") * 100
    unch = col(m, "unchanged") * 100
    cost = col(m, "cost")
    ms = col(m, "runtime_ms")
    inv = np.array([int(r["violations"]) > 0 for r in R])
    out["methods"][m] = {
        "invalid_pct": float(inv.mean() * 100),
        "coverage_mean": float(cov.mean()), "coverage_ci": boot_ci(cov),
        "fully_prepared_pct": float(col(m, "fully_prepared").mean() * 100),
        "unchanged_mean": float(unch.mean()), "unchanged_ci": boot_ci(unch),
        "cost_mean": float(cost.mean()), "cost_median": float(np.median(cost)), "cost_ci": boot_ci(cost),
        "subject_shortfall_pct": float(col(m, "subject_error").mean() * 100),
        "runtime_median_ms": float(np.median(ms)), "runtime_p95_ms": float(np.percentile(ms, 95)),
        "runtime_max_ms": float(ms.max()), "over_2s": int((ms > 2000).sum()),
    }

bound = col("M4", "coverage_bound") * 100
out["coverage_bound_mean"] = float(bound.mean())
out["valid_plans_above_bound"] = sum(
    1 for r in rows if int(r["violations"]) == 0 and float(r["coverage"]) > float(r["coverage_bound"]) + 1e-4
)
out["certificate_beaten"] = sum(
    1 for r in rows if int(r["violations"]) == 0 and float(r["unmet"]) + 0.5 < float(r["cert_short"])
)
out["proven_short_scenarios"] = int((col("M3", "cert_short") > 0).sum())

# ---- paired tests: M4 against each baseline ----
tests = []
for base in ["M0", "M1", "M2", "M3"]:
    for key, label in [("coverage", "coverage"), ("unchanged", "unchanged"), ("cost", "disruption cost")]:
        a, b = col("M4", key), col(base, key)
        p, rbc = wilcoxon(a, b)
        diff = (a - b) * (100 if key != "cost" else 1)
        tests.append({
            "vs": base, "measure": label, "mean_diff": float(diff.mean()), "diff_ci": boot_ci(diff),
            "M4_better": int(((a > b) if key != "cost" else (a < b)).sum()),
            "M4_worse": int(((a < b) if key != "cost" else (a > b)).sum()),
            "p": p, "rank_biserial": rbc,
        })
for t, padj in zip(tests, holm([t["p"] for t in tests])):
    t["p_holm"] = padj
out["tests"] = tests

# ---- breakdowns ----
def breakdown(key):
    groups = sorted({r[key] for r in by["M4"]})
    res = {}
    for g in groups:
        res[g] = {}
        for m in ["M2", "M3", "M4"]:
            R = [r for r in by[m] if r[key] == g]
            res[g][m] = {
                "n": len(R),
                "coverage": float(np.mean([float(r["coverage"]) for r in R]) * 100),
                "unchanged": float(np.mean([float(r["unchanged"]) for r in R]) * 100),
                "invalid_pct": float(np.mean([int(r["violations"]) > 0 for r in R]) * 100),
            }
    return res

out["by_utilisation"] = breakdown("utilisation_target")
out["by_disruption"] = breakdown("label")
out["by_severity"] = breakdown("severity")
out["by_clock_change"] = breakdown("clock_change")

# M2's violations by kind
kinds = ["v_commitment", "v_sleep", "v_overlap", "v_break", "v_cap", "v_late", "v_release", "v_short", "v_past"]
out["M2_violation_kinds"] = {k: sum(int(r[k]) > 0 for r in by["M2"]) for k in kinds}

json.dump(out, open(OUT / "stats.json", "w"), indent=2)

# ---- figures ----
INK, INK2, MUTED, GRID, SURF = "#0b0b0b", "#52514e", "#8a8984", "#e6e5e0", "#fcfcfb"
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
SERIES = {"M4": BLUE, "M2": ORANGE, "M3": AQUA}
plt.rcParams.update({
    "font.family": "Helvetica Neue", "font.size": 10, "axes.edgecolor": MUTED, "axes.labelcolor": INK2,
    "xtick.color": INK2, "ytick.color": INK2, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8,
    "axes.spines.top": False, "axes.spines.right": False, "figure.facecolor": SURF, "axes.facecolor": SURF,
    "savefig.facecolor": SURF, "axes.titleweight": "bold", "axes.titlesize": 11, "axes.titlecolor": INK,
    "axes.titlelocation": "left",
})


def save(fig, name):
    fig.tight_layout()
    fig.savefig(OUT / name, dpi=220)
    plt.close(fig)


# Fig 1: the frontier. x = share of the existing plan changed (log), y = coverage.
fig, ax = plt.subplots(figsize=(7.2, 4.6))
changed = lambda m: 100 - out["methods"][m]["unchanged_mean"]
budgets = ["M4-b0.5", "M4-b1", "M4-b2", "M4-b4", "M4-b8", "M4"]
xs = [changed(m) for m in budgets]
ys = [out["methods"][m]["coverage_mean"] for m in budgets]
for m, x in zip(budgets, xs):
    lo, hi = out["methods"][m]["coverage_ci"]
    ax.plot([x, x], [lo, hi], color=BLUE, lw=1, alpha=0.6, zorder=2)
ax.plot(xs, ys, color=BLUE, lw=2, marker="o", ms=7, mec=SURF, mew=2, zorder=4)
ax.annotate("Repair, budget 0.5", (xs[0], ys[0]), textcoords="offset points", xytext=(10, -4), fontsize=8.5, color=INK)
ax.annotate("Repair, unlimited budget", (xs[-1], ys[-1]), textcoords="offset points", xytext=(8, -14), fontsize=8.5, color=INK, fontweight="bold")
offsets = {"M0": (-9, -4), "M1": (-9, -4), "M2": (0, -34), "M3": (-8, -16)}
for m in ["M0", "M1", "M2", "M3"]:
    s_ = out["methods"][m]
    x, y = changed(m), s_["coverage_mean"]
    lo, hi = s_["coverage_ci"]
    ax.plot([x, x], [lo, hi], color=MUTED, lw=1, zorder=2)
    ax.plot([x], [y], "o", ms=8, color=MUTED, mec=SURF, mew=2, zorder=3)
    tag = NAMES[m] + (f"\n({s_['invalid_pct']:.0f}% of plans break a rule)" if s_["invalid_pct"] > 0 else "")
    dx, dy = offsets[m]
    ax.annotate(tag, (x, y), textcoords="offset points", xytext=(dx, dy), fontsize=8.5, color=INK2,
                ha="right" if dx < 0 else ("center" if dx == 0 else "left"))
ax.axhline(out["coverage_bound_mean"], color=INK2, lw=1, ls=(0, (4, 3)), zorder=1)
ax.annotate(f"Best possible coverage: {out['coverage_bound_mean']:.2f}%", (1.05, out["coverage_bound_mean"]), xytext=(0, 4),
            textcoords="offset points", fontsize=8.5, color=INK2)
ax.set_xscale("log")
ax.set_xlim(0.7, 130)
ax.set_xticks([1, 2, 5, 10, 20, 50, 100], ["1", "2", "5", "10", "20", "50", "100"])
ax.set_xlabel("Existing study blocks changed by the repair (%, log scale)")
ax.set_ylabel("Deadline preparation covered (%)")
ax.set_axisbelow(True)
ax.set_title(f"Repair matches a full rebuild's coverage while changing ~{changed('M4'):.0f}% of the plan (n = {N})")
save(fig, "fig1_frontier.png")

# Fig 2: plans breaking a hard rule.
fig, ax = plt.subplots(figsize=(7.2, 2.8))
order = ["M0", "M1", "M3", "M4", "M2"]
vals = [out["methods"][m]["invalid_pct"] for m in order]
ax.barh([NAMES[m] for m in order], vals, color=[ORANGE if m == "M2" else MUTED for m in order], height=0.55)
for i, v in enumerate(vals):
    ax.annotate(f"{v:.1f}%", (v, i), xytext=(4, 0), textcoords="offset points", va="center", fontsize=9, color=INK)
ax.set_xlabel("Repaired plans that break at least one hard rule (%)")
ax.set_title("Only the current Arcadia rebuild produces invalid plans")
ax.set_axisbelow(True)
ax.grid(axis="y", visible=False)
save(fig, "fig2_violations.png")

# Fig 3: coverage and stability by workload.
levels = sorted(out["by_utilisation"], key=float)
fig, axes = plt.subplots(1, 2, figsize=(7.6, 3.4))
for ax, key, title in [(axes[0], "coverage", "Coverage (%)"), (axes[1], "unchanged", "Blocks unchanged (%)")]:
    for m in ["M4", "M2", "M3"]:
        ax.plot([float(l) * 100 for l in levels], [out["by_utilisation"][l][m][key] for l in levels], marker="o", ms=6,
                mec=SURF, mew=1.5, lw=2, color=SERIES[m], label=NAMES[m], zorder=4 if m == "M4" else 3,
                ls="-" if m != "M3" else (0, (5, 2)))
    ax.set_title(title)
    ax.set_xlabel("Workload (% of available study time)")
axes[1].legend(frameon=False, fontsize=8.5, loc="center left")
fig.suptitle("Repair keeps rebuild-level coverage at every workload while preserving the plan", x=0.01, ha="left",
             fontweight="bold", fontsize=11, color=INK)
save(fig, "fig3_by_workload.png")

# Fig 4: stability by disruption type.
labels = sorted(out["by_disruption"])
DNAME = {"D1": "Missed block", "D2": "New commitment", "D3": "Rest of day lost", "D4": "Commitment moved",
         "D5": "New task", "D6": "Two at once"}
fig, ax = plt.subplots(figsize=(7.2, 3.4))
w = 0.26
for i, m in enumerate(["M4", "M2", "M3"]):
    ax.bar(np.arange(len(labels)) + (i - 1) * (w + 0.02), [out["by_disruption"][l][m]["unchanged"] for l in labels],
           width=w, color=SERIES[m], label=NAMES[m])
ax.set_xticks(np.arange(len(labels)), [DNAME.get(l, l) for l in labels], fontsize=8.5)
ax.set_ylabel("Blocks unchanged (%)")
ax.legend(frameon=False, fontsize=8.5, ncol=3, loc="upper center", bbox_to_anchor=(0.5, -0.14))
ax.set_title("Share of the plan left untouched, by type of disruption")
ax.set_axisbelow(True)
ax.grid(axis="x", visible=False)
save(fig, "fig4_by_disruption.png")

# Fig 5: ablations, as a dot plot (no truncated bars).
abl = [("M4", "Full algorithm"), ("M4-noNear", "No near-term weighting"), ("M4-noEject", "No bumping"),
       ("M4-fixedWindow", "Fixed 1-day window"), ("M4-noEscalate", "No escalation")]
abl = [(m, n) for m, n in abl if m in out["methods"]]
fig, ax = plt.subplots(figsize=(7.2, 2.9))
for i, (m, n) in enumerate(abl[::-1]):
    s_ = out["methods"][m]
    lo, hi = s_["unchanged_ci"]
    c = BLUE if m == "M4" else MUTED
    ax.plot([lo, hi], [i, i], color=c, lw=1.5, zorder=2)
    ax.plot([s_["unchanged_mean"]], [i], "o", ms=8, color=c, mec=SURF, mew=2, zorder=3)
    ax.annotate(f"{s_['unchanged_mean']:.1f}% unchanged · {s_['coverage_mean']:.2f}% coverage", (hi, i), xytext=(8, 0),
                textcoords="offset points", va="center", fontsize=8.5, color=INK if m == "M4" else INK2)
ax.set_yticks(range(len(abl)), [n for _, n in abl][::-1])
lo_all = min(out["methods"][m]["unchanged_ci"][0] for m, _ in abl)
ax.set_xlim(lo_all - 2, 100 + 16)
ax.set_xticks([x for x in range(70, 101, 5) if x >= lo_all - 2])
ax.set_xlabel("Existing blocks unchanged (%, with 95% CI)")
ax.set_axisbelow(True)
ax.grid(axis="y", visible=False)
ax.set_title("Removing any part leaves more of the plan changed, or less work covered")
save(fig, "fig5_ablations.png")

# Fig 6: run time.
fig, ax = plt.subplots(figsize=(7.2, 3.2))
for m in ["M4", "M2", "M3"]:
    v = np.sort(col(m, "runtime_ms"))
    ax.plot(np.maximum(v, 0.05), np.arange(1, len(v) + 1) / len(v) * 100, lw=2, color=SERIES[m], label=NAMES[m])
ax.axvline(2000, color=INK2, lw=1, ls=(0, (4, 3)))
ax.annotate("2 s limit", (2000, 5), xytext=(-4, 0), textcoords="offset points", ha="right", fontsize=8.5, color=INK2)
ax.set_xscale("log")
ax.set_xlabel("Run time per repair (ms, log scale)")
ax.set_ylabel("Repairs finished (%)")
ax.legend(frameon=False, fontsize=8.5, loc="lower right")
ax.set_title("Every repair finishes well inside the time limit")
save(fig, "fig6_runtime.png")

# ---- summary.md ----
L = [f"# Results: {RUN.name} ({N} scenarios)", ""]
L += ["| Method | Plans breaking a rule | Coverage (95% CI) | Tasks fully prepared | Blocks unchanged (95% CI) | Disruption cost, mean (median) | Run time p95 / max |",
      "|---|---|---|---|---|---|---|"]
for m in MAIN + [x for x in by if x not in MAIN]:
    s = out["methods"][m]
    L.append(f"| {NAMES.get(m, m)} | {s['invalid_pct']:.1f}% | {s['coverage_mean']:.2f}% ({s['coverage_ci'][0]:.2f} to {s['coverage_ci'][1]:.2f}) | "
             f"{s['fully_prepared_pct']:.1f}% | {s['unchanged_mean']:.1f}% ({s['unchanged_ci'][0]:.1f} to {s['unchanged_ci'][1]:.1f}) | "
             f"{s['cost_mean']:.2f} ({s['cost_median']:.2f}) | {s['runtime_p95_ms']:.0f} / {s['runtime_max_ms']:.0f} ms |")
L += ["", f"Best possible coverage (exact bound): {out['coverage_bound_mean']:.2f}%. Valid plans above it: {out['valid_plans_above_bound']}. "
      f"Certificate beaten: {out['certificate_beaten']}. Scenarios proven short of time: {out['proven_short_scenarios']}.", ""]
L += ["## M4 against each baseline (paired Wilcoxon, Holm-corrected)", "",
      "| Against | Measure | Mean difference (95% CI) | M4 better / worse | p (Holm) | Rank-biserial r |", "|---|---|---|---|---|---|"]
for t in tests:
    unit = "" if t["measure"] == "disruption cost" else " pts"
    L.append(f"| {NAMES[t['vs']]} | {t['measure']} | {t['mean_diff']:+.2f}{unit} ({t['diff_ci'][0]:+.2f} to {t['diff_ci'][1]:+.2f}) | "
             f"{t['M4_better']} / {t['M4_worse']} | {t['p_holm']:.1e} | {t['rank_biserial']:+.2f} |")
L += ["", "Rank-biserial r > 0 means M4's value is higher than the baseline's (better for coverage and unchanged, worse for disruption cost).", ""]
L += ["", "Current Arcadia's rule breaks by kind (scenarios): " + ", ".join(f"{k[2:]} {v}" for k, v in out["M2_violation_kinds"].items() if v)]
for key, title in [("by_utilisation", "workload"), ("by_disruption", "disruption type"), ("by_severity", "severity"), ("by_clock_change", "clock change in horizon")]:
    L += ["", f"## By {title}", "", "| Group | n | Arcadia coverage / unchanged / invalid | Rebuild coverage / unchanged | Repair coverage / unchanged |", "|---|---|---|---|---|"]
    for g, v in out[key].items():
        L.append(f"| {g} | {v['M4']['n']} | {v['M2']['coverage']:.2f}% / {v['M2']['unchanged']:.1f}% / {v['M2']['invalid_pct']:.1f}% | "
                 f"{v['M3']['coverage']:.2f}% / {v['M3']['unchanged']:.1f}% | {v['M4']['coverage']:.2f}% / {v['M4']['unchanged']:.1f}% |")
open(OUT / "summary.md", "w").write("\n".join(L) + "\n")
print("wrote", OUT)
