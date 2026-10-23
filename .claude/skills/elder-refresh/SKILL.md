---
name: elder-refresh
description: Rerun the Elder Triple Screen trading system (gold, BTC, Dow, S&P 500, ASX 200) on fresh prices and republish the Elder Triple Screen Desk page. Use when the user asks to rerun, refresh or update the Elder system, its signals, charts or forecasts.
---

# Rerun the Elder system

Arguments, if given, are instrument keys from `elder/config.json` (e.g. `gold,spx`).
A partial run updates the history and prints its table but leaves the page alone.

## 1. Get fresh prices and run

Try locally first:

```bash
pip install -q -r elder/requirements.txt && python3 elder/run.py --fetch ${ARGS:+--only $ARGS}
```

If the fetch can't reach Yahoo Finance (cloud sessions usually block it: errors such
as 403, ENOTFOUND or "no ticker returned data"), run it on GitHub Actions instead:

1. `git fetch origin claude/elder-trading-system && git checkout claude/elder-trading-system && git pull`
   (or `main`, if the `elder/` folder has been merged there).
2. Write the current UTC time to `elder/refresh`, commit it ("Refresh Elder system"),
   and push. The push starts the **Elder system run** workflow.
3. Find the run with the GitHub MCP `actions_list` tool (`list_workflow_runs`, filtered to
   the branch). Wait for it to complete; use Monitor or a check every minute or so,
   not a bare `sleep` loop. If it fails, read the log with `get_job_logs` and report it.
4. `git pull` to get the committed data, report and page.

## 2. Republish the page

Publish `elder/elder_desk.html` with the Artifact tool to the existing page,
`https://claude.ai/artifact/Cs5fd1cNaRXGdeqm1UNzWK`, so the link stays the same.
In a conversation that hasn't read that artifact yet, `read` it first, then publish
with `url` set. Skip this step after a partial (`--only`) run.

## 3. Report

Run `python3 elder/run.py --summary` and show the table. Lead with what changed since
the previous run (the "Changed" column) and any market whose weekly Impulse now gives
permission to trade. Mention stale data if the table flags it.
