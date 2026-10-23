"""Rerun the Elder system end to end.

    python elder/run.py                 analyse the CSVs already in elder/data
    python elder/run.py --fetch         download fresh prices from Yahoo first
    python elder/run.py --only gold,spx limit the run to some instruments
    python elder/run.py --summary       reprint the last run's table without running

Writes elder/report.json and elder/elder_desk.html, appends one row per instrument
to elder/history/signals.csv and one line per run to elder/history/runs.jsonl,
and prints what changed since the previous run. Under GitHub Actions the same
summary goes to the job summary page.
"""
import argparse
import csv
import json
import os
import subprocess
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import elder_system as E  # noqa: E402

HISTORY = HERE / "history"
SIGNALS = HISTORY / "signals.csv"
RUNS = HISTORY / "runs.jsonl"
IMP = {1: "green", -1: "red", 0: "blue"}
FIELDS = ["run_at", "as_of", "key", "last_date", "close", "weekly_impulse", "daily_impulse", "action", "side",
          "provisional", "entry", "stop", "target", "rr", "score", "p_up", "p_fill", "p_target_first"]
STALE_DAYS = {"24:00": 2}  # 24/7 markets go stale faster than ones closed at weekends


def git_sha():
    try:
        return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=HERE, capture_output=True,
                              text=True, check=True).stdout.strip()
    except Exception:
        return None


def previous_signals():
    if not SIGNALS.exists():
        return {}
    last = {}
    with SIGNALS.open() as f:
        for row in csv.DictReader(f):
            last[row["key"]] = row
    return last


def changes(m, prev):
    """Human-readable differences from the previous run's row for this instrument."""
    if not prev:
        return ["first run"]
    p, out = m["plan"], []
    if int(prev["weekly_impulse"]) != p["weekly_impulse"]:
        out.append(f"weekly Impulse {IMP[int(prev['weekly_impulse'])]} → {IMP[p['weekly_impulse']]}")
    if int(prev["daily_impulse"]) != p["daily_impulse"]:
        out.append(f"daily Impulse {IMP[int(prev['daily_impulse'])]} → {IMP[p['daily_impulse']]}")
    if prev["action"] != p["action"]:
        out.append(f"action {prev['action']} → {p['action']}")
    if int(prev["side"]) != p["side"]:
        out.append("bias flipped to " + ("long" if p["side"] == 1 else "short"))
    return out


def signal_row(run_at, m):
    p, f = m["plan"], m["forecast"]
    return {"run_at": run_at, "as_of": m["last_date"], "key": m["key"], "last_date": m["last_date"],
            "close": m["close"], "weekly_impulse": p["weekly_impulse"], "daily_impulse": p["daily_impulse"],
            "action": p["action"], "side": p["side"], "provisional": p["provisional"], "entry": round(p["entry"], 4),
            "stop": round(p["stop"], 4), "target": round(p["target"], 4), "rr": round(p["rr"], 3),
            "score": m["score"], "p_up": f["p_up"], "p_fill": f.get("p_fill"), "p_target_first": f.get("p_target_first")}


def freshness(m, inst, now):
    age = (now.date() - datetime.fromisoformat(m["last_date"]).date()).days
    limit = STALE_DAYS.get(inst["session_close_utc"], 4)
    return {"age_days": age, "stale": age > limit}


def summary_markdown(meta, report, errors):
    lines = [f"### Elder system run {meta['run_at']}",
             f"Trigger: {meta['trigger']} · commit {meta['git_sha'] or 'n/a'} · {meta['duration_s']}s"
             + (" · data refetched" if meta["fetched"] else " · used stored data"), "",
             "| Market | Last bar | Close | Weekly | Daily | Action | Entry | Stop | Target | R:R | Score | P(up 30) | Changed |",
             "|---|---|---:|---|---|---|---:|---:|---:|---:|---:|---:|---|"]
    for m in report["instruments"]:
        p, d = m["plan"], m["decimals"]
        stale = " ⚠ stale" if m["freshness"]["stale"] else ""
        lines.append(f"| {m['name']} | {m['last_date']}{stale} | {m['close']:,.{d}f} | {IMP[p['weekly_impulse']]} | "
                     f"{IMP[p['daily_impulse']]} | {p['action']}{' (' + ('long' if p['side'] == 1 else 'short') + ' bias)' if p['provisional'] else ''} | "
                     f"{p['entry']:,.{d}f} | {p['stop']:,.{d}f} | {p['target']:,.{d}f} | {p['rr']:.2f} | {m['score']}/8 | "
                     f"{m['forecast']['p_up']:.0%} | {'; '.join(m['changes']) or '—'} |")
    for key, err in errors.items():
        lines.append(f"\n**{key} failed:** `{err}`")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fetch", action="store_true", help="download fresh prices before analysing")
    ap.add_argument("--only", help="comma-separated instrument keys, e.g. gold,spx")
    ap.add_argument("--no-history", action="store_true", help="don't append to elder/history")
    ap.add_argument("--summary", action="store_true", help="reprint the last run's table and exit")
    args = ap.parse_args()
    if args.summary:
        report = json.loads((HERE / "report.json").read_text())
        print(summary_markdown(report["run"], report, report["run"].get("errors", {})))
        return 0
    only = set(args.only.split(",")) if args.only else None

    t0, now = time.time(), datetime.now(timezone.utc)
    run_at = now.isoformat(timespec="seconds")
    fetch_result = None
    if args.fetch:
        from fetch_data import fetch
        fetch_result = fetch(only)

    prev = previous_signals()
    report = {"as_of": str(now.date()), "generated_at": run_at, "params": E.P, "instruments": []}
    errors = {}
    for inst in E.CONFIG["instruments"]:
        if only and inst["key"] not in only:
            continue
        try:
            m = E.clean(E.analyse(inst, now))
        except Exception as e:
            errors[inst["key"]] = f"{type(e).__name__}: {e}"
            traceback.print_exc()
            continue
        m["freshness"] = freshness(m, inst, now)
        m["changes"] = changes(m, prev.get(m["key"]))
        report["instruments"].append(m)

    meta = {"run_at": run_at, "trigger": os.environ.get("GITHUB_EVENT_NAME", "local"), "git_sha": git_sha(),
            "fetched": bool(args.fetch), "fetch": fetch_result, "only": sorted(only) if only else None,
            "duration_s": round(time.time() - t0, 1), "errors": errors,
            "data": {m["key"]: {"last_date": m["last_date"], "dropped_forming_bar": m["dropped_forming_bar"],
                                **m["freshness"]} for m in report["instruments"]}}
    report["run"] = meta

    payload = json.dumps(report, allow_nan=False)
    if not only:  # a partial run never overwrites the full report or page
        (HERE / "report.json").write_text(payload)
        page = (HERE / "template.html").read_text().replace("/*DATA*/null", payload)
        (HERE / "elder_desk.html").write_text(page)
    if not args.no_history:
        HISTORY.mkdir(exist_ok=True)
        new = not SIGNALS.exists()
        with SIGNALS.open("a", newline="") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            if new:
                w.writeheader()
            for m in report["instruments"]:
                w.writerow(signal_row(run_at, m))
        with RUNS.open("a") as f:
            f.write(json.dumps(meta) + "\n")

    md = summary_markdown(meta, report, errors)
    print(md)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as f:
            f.write(md)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
