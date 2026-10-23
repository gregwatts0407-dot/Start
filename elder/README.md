# Elder Triple Screen system

Alexander Elder's Triple Screen, Impulse System, Force Index, Elder-ray, SafeZone
stops and Autoenvelope channels, applied to gold, Bitcoin, the Dow, the S&P 500 and
the ASX 200. Rules and caveats are in the docstring of `elder_system.py` and on the page.

## Rerunning

| How | What it does |
|---|---|
| GitHub → Actions → **Elder system run** → *Run workflow* | Refetches prices, reruns everything and commits the results. Optional inputs choose the instruments and whether to refetch. Needs the workflow on the default branch. |
| Edit `elder/refresh` on GitHub (web or mobile) and commit | Starts the same workflow on that branch. |
| Weekday schedule, 22:17 UTC | The same, after the US close. Default branch only. |
| `/elder-refresh` in Claude Code | Reruns (locally or through the workflow) and republishes the chart page to its existing link. |
| `python elder/run.py --fetch` | Local run. `pip install -r elder/requirements.txt` first. |

`run.py` flags: `--fetch` downloads prices first; `--only gold,spx` limits the run;
`--no-history` skips logging; `--summary` reprints the last table.

## What a run writes

- `data/<key>.csv`: daily OHLCV; `data/<key>.source` names the Yahoo ticker used.
- `report.json`: everything the page shows, plus run metadata.
- `elder_desk.html`: the chart page, self-contained. Open it in a browser, or download it from the workflow run's *elder-desk* artifact.
- `history/signals.csv`: one row per instrument per run, covering Impulse states, action, entry, stop, target, score and forecast probabilities. Use it to track how signals evolve.
- `history/runs.jsonl`: one line per run with the trigger, commit, duration, data dates, freshness and errors.

Each run compares itself with the previous row in `signals.csv` and reports changes, such as a weekly Impulse turning green or an action flipping, on the page and in the Actions job summary.

## Tuning

Instruments (Yahoo tickers tried in order, tick size, week end, session close in UTC) and
system parameters (risk per side, monthly loss limit, SafeZone lookback and coefficient,
forecast horizon, time stop) live in `config.json`. Pushing a change to it starts a run.
A bar dated today is ignored until that instrument's `session_close_utc` has passed.
