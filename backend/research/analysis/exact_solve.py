"""
Exact optimiser for small repair problems (PROTOCOL.md amendment 6).

    python exact_solve.py problems.json solutions.json [time_limit_seconds]

For each problem it finds, with Google OR-Tools CP-SAT, the repair that
  1. covers the most priority-weighted deadline work, then
  2. keeps the most of the student's original blocks exactly where they were,
under the validator's hard rules: free time only (no sleep, commitments or
fixed study), one block at a time, a full break between separate blocks,
blocks of at least 15 minutes, nothing across midnight, the daily cap,
nothing before a task exists or ending after it is due.
"""
import json
import sys
import time

from ortools.sat.python import cp_model

problems = json.load(open(sys.argv[1]))
limit = float(sys.argv[3]) if len(sys.argv) > 3 else 60.0
out = []

for p in problems:
    t_start = time.time()
    m = cp_model.CpModel()
    n, b = p["n"], p["breakSlots"]
    avail = p["available"]
    tasks = p["tasks"]
    origs = [o for o in p["originals"] if o["keepable"]]

    # x[t][s]: slot s holds new work on task t.
    x = {}
    for ti, t in enumerate(tasks):
        if t["required"] - t["done"] <= 0:
            continue
        for s in range(max(0, t["releaseSlot"]), min(n - 1, t["dueSlot"]) + 1):
            if avail[s]:
                x[ti, s] = m.NewBoolVar(f"x{ti}_{s}")
    # k[o]: keep original block o exactly where it is.
    k = [m.NewBoolVar(f"k{i}") for i in range(len(origs))]
    covering = [[] for _ in range(n)]
    for i, o in enumerate(origs):
        for s in range(o["startSlot"], o["startSlot"] + o["len"]):
            covering[s].append(i)

    occ = []
    for s in range(n):
        terms = [x[ti, s] for ti in range(len(tasks)) if (ti, s) in x] + [k[i] for i in covering[s]]
        v = m.NewBoolVar(f"occ{s}")
        if terms:
            m.Add(sum(terms) == v)  # one thing per slot; occ is whether anything is there
        else:
            m.Add(v == 0)
        occ.append(v)

    def X(ti, s):
        return x.get((ti, s), 0)

    for ti in range(len(tasks)):
        for s in range(n):
            if (ti, s) not in x:
                continue
            nxt = X(ti, s + 1) if s + 1 < n else 0
            prv = X(ti, s - 1) if s > 0 else 0
            # Next slot is the same task or empty (different blocks never touch).
            if s + 1 < n:
                if isinstance(nxt, int):
                    m.Add(occ[s + 1] == 0).OnlyEnforceIf(x[ti, s])
                else:
                    m.Add(occ[s + 1] <= nxt).OnlyEnforceIf(x[ti, s])
            # A run that ends here is followed by a full break.
            for j in range(1, b + 1):
                if s + j < n:
                    if isinstance(nxt, int):
                        m.Add(occ[s + j] == 0).OnlyEnforceIf(x[ti, s])
                    else:
                        m.AddBoolOr([x[ti, s].Not(), nxt, occ[s + j].Not()])
            # A run that starts here lasts at least 15 minutes (3 slots).
            if isinstance(prv, int):
                start = x[ti, s]
                for j in (1, 2):
                    nj = X(ti, s + j) if s + j < n else 0
                    if isinstance(nj, int):
                        m.Add(x[ti, s] == 0)
                    else:
                        m.AddImplication(start, nj)
            else:
                for j in (1, 2):
                    nj = X(ti, s + j) if s + j < n else 0
                    if isinstance(nj, int):
                        m.AddBoolOr([x[ti, s].Not(), prv])
                    else:
                        m.AddBoolOr([x[ti, s].Not(), prv, nj])

    # Kept originals are their own block: a full break on both sides.
    for i, o in enumerate(origs):
        a, e = o["startSlot"], o["startSlot"] + o["len"]
        for s in list(range(max(0, a - b), a)) + list(range(e, min(n, e + b))):
            m.Add(occ[s] == 0).OnlyEnforceIf(k[i])

    # Nothing runs across midnight.
    for s in range(n - 1):
        if p["dayOf"][s] != p["dayOf"][s + 1]:
            m.Add(occ[s] + occ[s + 1] <= 1)

    # Daily cap (5 minutes a slot).
    for d, cap in enumerate(p["capLeft"]):
        slots = [s for s in range(n) if p["dayOf"][s] == d]
        m.Add(5 * sum(occ[s] for s in slots) <= int(cap))

    # Coverage, capped at what each task still needs.
    cov_terms = []
    for ti, t in enumerate(tasks):
        need = max(0, t["required"] - t["done"])
        if need == 0:
            continue
        got = 5 * sum(x[ti, s] for s in range(n) if (ti, s) in x) + sum(
            k[i] * o["len"] * 5 for i, o in enumerate(origs) if o["taskId"] == t["id"])
        c = m.NewIntVar(0, int(need), f"cov{ti}")
        m.Add(c <= got)
        cov_terms.append(t["priority"] * c)

    big = len(origs) + 1
    m.Maximize(big * sum(cov_terms) + sum(k))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = limit
    solver.parameters.num_workers = 8
    status = solver.Solve(m)
    rec = {"seed": p["seed"], "status": solver.StatusName(status), "seconds": round(time.time() - t_start, 2),
           "kept": [], "runs": []}
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        rec["kept"] = [o["id"] for i, o in enumerate(origs) if solver.Value(k[i])]
        for ti, t in enumerate(tasks):
            s = 0
            while s < n:
                if (ti, s) in x and solver.Value(x[ti, s]):
                    e = s
                    while (ti, e + 1) in x and solver.Value(x[ti, e + 1]):
                        e += 1
                    rec["runs"].append({"taskId": t["id"], "startSlot": s, "endSlot": e + 1})
                    s = e + 1
                else:
                    s += 1
        rec["objective"] = solver.ObjectiveValue()
        rec["bound"] = solver.BestObjectiveBound()
    out.append(rec)
    print(p["seed"], rec["status"], rec["seconds"], "s", file=sys.stderr)

json.dump(out, open(sys.argv[2], "w"))
