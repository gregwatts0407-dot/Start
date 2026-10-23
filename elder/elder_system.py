"""Alexander Elder trading system: Triple Screen + Impulse + SafeZone + Autoenvelope.

Reads daily OHLCV from elder/data/<name>.csv, runs the rules on every instrument,
backtests them under the 2% / 6% risk rules, builds a volatility-scaled analog
forecast from the current Elder state, and writes elder/report.json.

Rules (long side; shorts mirror them):
  Screen 1 (tide, weekly)  Weekly Impulse green permits longs, red permits shorts,
                           blue permits no new trades. Last completed week only.
  Screen 2 (wave, daily)   2-day EMA of Force Index below zero (a pullback against
                           the tide) while the daily Impulse is not red.
  Screen 3 (entry)         Buy stop one tick above the setup bar's high, trailed
                           down each day the setup persists and is not filled.
  Stop                     Lower of the last two lows minus 0.1 ATR ("nick of time"),
                           then trailed up by the SafeZone stop, never lowered.
  Target                   Upper Autoenvelope line (EMA22 + 95% channel half-width).
  Exit                     Target, stop, weekly tide turning against the trade,
                           or 40 bars.
  Money management         Risk 2% of equity per long and 1% per short (shorts have
                           negative expectancy in all five markets over the test);
                           no new trades once realised losses plus open risk reach
                           6% of equity for the month.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).parent
DATA = HERE / "data"

INSTRUMENTS = [
    ("gold", "Gold", "COMEX gold futures (GC=F), proxy for spot XAU/USD", "USD/oz", 0.1, "W-FRI"),
    ("btc", "Bitcoin", "BTC-USD, 24/7 market", "USD", 1.0, "W-SUN"),
    ("dji", "Dow Jones", "Dow Jones Industrial Average (^DJI)", "pts", 1.0, "W-FRI"),
    ("spx", "S&P 500", "S&P 500 index (^GSPC)", "pts", 0.25, "W-FRI"),
    ("asx200", "ASX 200", "S&P/ASX 200 index (^AXJO)", "pts", 1.0, "W-FRI"),
]
AS_OF = pd.Timestamp("2026-10-23")
DROP_TODAY = {"gold", "btc"}  # these trade through today; their last bar is still forming

HORIZON = 30
CHART_BARS = 130
SZ_LOOKBACK, SZ_COEF = 10, 2.5


def ema(s, n):
    return s.ewm(span=n, adjust=False).mean()


def impulse(close):
    e13 = ema(close, 13)
    hist = macd_hist(close)
    up = (e13.diff() > 0) & (hist.diff() > 0)
    dn = (e13.diff() < 0) & (hist.diff() < 0)
    return pd.Series(np.where(up, 1, np.where(dn, -1, 0)), index=close.index)


def macd_hist(close):
    line = ema(close, 12) - ema(close, 26)
    return line - ema(line, 9)


def safezone(df, side):
    """Elder SafeZone stop: average penetration of the prior bar's extreme, times a
    coefficient, measured from the prior extreme; held for 3 bars so it never retreats."""
    if side == "long":
        pen = (df.Low.shift(1) - df.Low).clip(lower=0)
    else:
        pen = (df.High - df.High.shift(1)).clip(lower=0)
    cnt = (pen > 0).astype(float).rolling(SZ_LOOKBACK).sum()
    avg = pen.rolling(SZ_LOOKBACK).sum() / cnt.replace(0, np.nan)
    if side == "long":
        raw = df.Low.shift(1) - SZ_COEF * avg
        return raw.rolling(3).max()
    raw = df.High.shift(1) + SZ_COEF * avg
    return raw.rolling(3).min()


def indicators(df):
    d = df.copy()
    d["ema13"] = ema(d.Close, 13)
    d["ema26"] = ema(d.Close, 26)
    d["ema22"] = ema(d.Close, 22)
    d["hist"] = macd_hist(d.Close)
    d["imp"] = impulse(d.Close)
    vol = d.Volume.replace(0, np.nan).ffill().fillna(1)
    fi = d.Close.diff() * vol
    d["fi2"] = ema(fi, 2)
    d["fi13"] = ema(fi, 13)
    d["bull"] = d.High - d.ema13
    d["bear"] = d.Low - d.ema13
    dev = pd.concat([d.High - d.ema22, d.ema22 - d.Low], axis=1).max(axis=1)
    d["chan"] = dev.rolling(100, min_periods=40).quantile(0.95)
    d["upper"] = d.ema22 + d.chan
    d["lower"] = d.ema22 - d.chan
    tr = pd.concat([d.High - d.Low, (d.High - d.Close.shift()).abs(), (d.Low - d.Close.shift()).abs()], axis=1).max(axis=1)
    d["atr"] = tr.ewm(alpha=1 / 14, adjust=False).mean()
    d["sz_long"] = safezone(d, "long")
    d["sz_short"] = safezone(d, "short")
    d["sigma"] = np.log(d.Close).diff().rolling(20).std()
    return d


def weekly(df, rule):
    w = df.resample(rule).agg({"Open": "first", "High": "max", "Low": "min", "Close": "last", "Volume": "sum"}).dropna()
    w["ema13"] = ema(w.Close, 13)
    w["ema26"] = ema(w.Close, 26)
    w["hist"] = macd_hist(w.Close)
    w["imp"] = impulse(w.Close)
    w["tide"] = w.imp
    return w


def impulse_triggers(close):
    """Closing prices for the next bar that would turn the Impulse green (above) or
    red (below). EMA13 rises iff close > EMA13; MACD-H is linear in the next close."""
    e13 = ema(close, 13).iloc[-1]
    def h(x):
        return macd_hist(pd.concat([close, pd.Series([x])], ignore_index=True)).iloc[-1]
    h0, h1 = h(0.0), h(1.0)
    hist_flat = (macd_hist(close).iloc[-1] - h0) / (h1 - h0)
    return {"green_above": float(max(e13, hist_flat)), "red_below": float(min(e13, hist_flat))}


def attach_tide(d, w, last_complete):
    """Map each daily bar to the tide of the last fully completed week before it."""
    wc = w[w.index <= last_complete]
    wk = wc[["tide", "imp"]].copy()
    wk.index = wk.index + pd.Timedelta(days=1)  # usable from the day after the week closes
    m = pd.merge_asof(d[[]].reset_index(), wk.reset_index().rename(columns={"index": "wdate", "Date": "wdate"}),
                      left_on="Date", right_on="wdate", direction="backward").set_index("Date")
    d["tide"] = m["tide"].fillna(0).astype(int)
    d["wimp"] = m["imp"].fillna(0).astype(int)
    return d


def divergence(d, lookback=90):
    """Elder's strongest signal: MACD-histogram divergence over the last two same-sign
    waves separated by a crossing of zero. Returns +1 bullish, -1 bearish, 0 none."""
    h = d["hist"].iloc[-lookback:]
    sign = np.sign(h).replace(0, np.nan).ffill()
    seg = (sign != sign.shift()).cumsum()
    groups = [(g.index, sign.loc[g.index[0]]) for _, g in h.groupby(seg)]
    if len(groups) < 3:
        return 0, None
    for want, side in ((-1, 1), (1, -1)):
        segs = [ix for ix, s in groups if s == want]
        if len(segs) < 2:
            continue
        a, b = segs[-2], segs[-1]
        if (d.index[-1] - b[-1]).days > 14:
            continue
        if want == -1:
            pa, pb = d.Low.loc[a].min(), d.Low.loc[b].min()
            ha, hb = h.loc[a].min(), h.loc[b].min()
            if pb < pa and hb > ha and h.iloc[-1] > h.loc[b].min():
                return side, {"a": str(d.Low.loc[a].idxmin().date()), "b": str(d.Low.loc[b].idxmin().date())}
        else:
            pa, pb = d.High.loc[a].max(), d.High.loc[b].max()
            ha, hb = h.loc[a].max(), h.loc[b].max()
            if pb > pa and hb < ha and h.iloc[-1] < h.loc[b].max():
                return side, {"a": str(d.High.loc[a].idxmax().date()), "b": str(d.High.loc[b].idxmax().date())}
    return 0, None


def setup(d, i, side):
    r = d.iloc[i]
    if side == 1:
        return r.tide == 1 and r.fi2 < 0 and r.imp != -1
    return r.tide == -1 and r.fi2 > 0 and r.imp != 1


RISK = {1: 0.02, -1: 0.01}


def backtest(d, tick, start=130):
    equity, trades, pending, pos = 100_000.0, [], None, None
    month, month_loss = None, 0.0
    curve = []
    for i in range(start, len(d)):
        r = d.iloc[i]
        if r.name.month != month:
            month, month_loss = r.name.month, 0.0
        if pos:
            s = pos["side"]
            exit_px = None
            if s == 1:
                if r.Low <= pos["stop"]:
                    exit_px, why = min(r.Open, pos["stop"]), "stop"
                elif r.High >= pos["target"]:
                    exit_px, why = max(r.Open, pos["target"]), "target"
            else:
                if r.High >= pos["stop"]:
                    exit_px, why = max(r.Open, pos["stop"]), "stop"
                elif r.Low <= pos["target"]:
                    exit_px, why = min(r.Open, pos["target"]), "target"
            if exit_px is None and (r.tide == -s or i - pos["i"] >= 40):
                exit_px, why = r.Close, "tide" if r.tide == -s else "time"
            if exit_px is not None:
                pnl = (exit_px - pos["entry"]) * s * pos["units"]
                equity += pnl
                if pnl < 0:
                    month_loss += -pnl
                R = (exit_px - pos["entry"]) * s / pos["risk"]
                trades.append({"side": s, "entry_date": str(pos["date"].date()), "exit_date": str(r.name.date()),
                               "entry": pos["entry"], "exit": float(exit_px), "R": float(R), "why": why,
                               "grade": float((exit_px - pos["entry"]) * s / (2 * pos["chan"]))})
                pos = None
            else:
                trail = d.sz_long.iloc[i] if s == 1 else d.sz_short.iloc[i]
                if s == 1 and trail > pos["stop"] and trail < r.Close:
                    pos["stop"] = trail
                if s == -1 and trail < pos["stop"] and trail > r.Close:
                    pos["stop"] = trail
        if pos is None and pending:
            s, px = pending["side"], pending["price"]
            filled = r.High >= px if s == 1 else r.Low <= px
            if filled:
                entry = max(r.Open, px) if s == 1 else min(r.Open, px)
                stop = pending["stop"]
                risk = (entry - stop) * s
                open_risk_ok = month_loss + RISK[s] * equity <= 0.06 * equity
                if risk > 0 and open_risk_ok:
                    pos = {"side": s, "entry": float(entry), "stop": float(stop), "target": pending["target"],
                           "risk": float(risk), "units": RISK[s] * equity / risk, "i": i, "date": r.name,
                           "chan": pending["chan"]}
                pending = None
        if pos is None:
            prev = pending
            pending = None
            for s in (1, -1):
                if setup(d, i, s):
                    lows, highs = d.Low.iloc[i - 1:i + 1], d.High.iloc[i - 1:i + 1]
                    px = r.High + tick if s == 1 else r.Low - tick
                    stop = lows.min() - 0.1 * r.atr if s == 1 else highs.max() + 0.1 * r.atr
                    target = r.upper if s == 1 else r.lower
                    if (target - px) * s > 0:
                        pending = {"side": s, "price": float(px), "stop": float(stop), "target": float(target),
                                   "chan": float(r.chan)}
            if pending is None and prev and setup(d, i, prev["side"]):
                pending = prev
        curve.append((str(r.name.date()), round(equity, 2)))
    return trades, curve


def stats(trades, curve, d, start):
    if not trades:
        return {"n": 0}
    R = np.array([t["R"] for t in trades])
    wins = R[R > 0]
    losses = R[R <= 0]
    eq = np.array([c[1] for c in curve])
    dd = float(((eq - np.maximum.accumulate(eq)) / np.maximum.accumulate(eq)).min())
    years = (d.index[-1] - d.index[start]).days / 365.25
    streak = best = 0
    for x in R:
        streak = streak + 1 if x <= 0 else 0
        best = max(best, streak)
    return {
        "n": len(trades),
        "longs": int(sum(t["side"] == 1 for t in trades)),
        "shorts": int(sum(t["side"] == -1 for t in trades)),
        "win_rate": float(len(wins) / len(R)),
        "avg_R": float(R.mean()),
        "avg_win_R": float(wins.mean()) if len(wins) else 0.0,
        "avg_loss_R": float(losses.mean()) if len(losses) else 0.0,
        "profit_factor": float(wins.sum() / -losses.sum()) if len(losses) and losses.sum() < 0 else None,
        "max_losing_streak": int(best),
        "max_drawdown": dd,
        "cagr": float((eq[-1] / 100_000) ** (1 / years) - 1),
        "a_grade_share": float(np.mean([t["grade"] >= 0.3 for t in trades])),
        "long_avg_R": float(np.mean([t["R"] for t in trades if t["side"] == 1])) if any(t["side"] == 1 for t in trades) else None,
        "short_avg_R": float(np.mean([t["R"] for t in trades if t["side"] == -1])) if any(t["side"] == -1 for t in trades) else None,
        "long_win": float(np.mean([t["R"] > 0 for t in trades if t["side"] == 1])) if any(t["side"] == 1 for t in trades) else None,
        "short_win": float(np.mean([t["R"] > 0 for t in trades if t["side"] == -1])) if any(t["side"] == -1 for t in trades) else None,
        "buy_hold_cagr": float((d.Close.iloc[-1] / d.Close.iloc[start]) ** (1 / years) - 1),
    }


def state_key(r):
    return (int(r.tide), int(r.imp))


def analog_forecast(d, side, entry, stop, target, kind):
    """Volatility-scaled analogs: every past day with the same (weekly tide, daily
    impulse) state contributes its next-30-bar path, measured in units of its own
    20-day sigma and rescaled to today's sigma."""
    key = state_key(d.iloc[-1])
    logc = np.log(d.Close.values)
    sig = d.sigma.values
    paths = []
    for i in range(130, len(d) - HORIZON):
        if state_key(d.iloc[i]) != key or not np.isfinite(sig[i]) or sig[i] == 0:
            continue
        paths.append((logc[i + 1:i + 1 + HORIZON] - logc[i]) / sig[i])
    if len(paths) < 25:  # too few: fall back to tide alone
        tide = int(d.tide.iloc[-1])
        for i in range(130, len(d) - HORIZON):
            if int(d.tide.iloc[i]) == tide and np.isfinite(sig[i]) and sig[i] > 0:
                paths.append((logc[i + 1:i + 1 + HORIZON] - logc[i]) / sig[i])
    P = np.array(paths) * d.sigma.iloc[-1]
    last = d.Close.iloc[-1]
    q = {k: (last * np.exp(np.percentile(P, p, axis=0))).round(4).tolist()
         for k, p in (("p10", 10), ("p25", 25), ("p50", 50), ("p75", 75), ("p90", 90))}
    prices = last * np.exp(P)
    out = {"n": len(paths), "state": list(key), "bands": q,
           "p_up": float((P[:, -1] > 0).mean()),
           "p_up_10": float((P[:, 9] > 0).mean())}
    if side and entry and stop and target:
        up = (side == 1) == (kind == "stop")  # a long stop fills on a rise, a long limit on a dip

        def fills(path):
            return (path >= entry) if up else (path <= entry)
        hit_t = hit_s = 0
        for path in prices:
            reached = np.where(fills(path))[0]
            if len(reached) == 0:
                continue
            rest = path[reached[0]:]
            t = np.where((rest >= target) if side == 1 else (rest <= target))[0]
            s = np.where((rest <= stop) if side == 1 else (rest >= stop))[0]
            t0 = t[0] if len(t) else 10**6
            s0 = s[0] if len(s) else 10**6
            if t0 < s0:
                hit_t += 1
            elif s0 < t0:
                hit_s += 1
        filled = hit_t + hit_s
        out["p_fill"] = float(sum(1 for path in prices if fills(path).any()) / len(prices))
        out["p_target_first"] = float(hit_t / filled) if filled else None
    return out


def current_plan(d, w, last_complete, tick):
    r = d.iloc[-1]
    wk = w.loc[last_complete]
    tide, imp = int(wk.imp), int(r.imp)
    developing = w.iloc[-1] if w.index[-1] > last_complete else None
    plan = {"tide": tide, "daily_impulse": imp, "weekly_impulse": tide,
            "weekly_developing": int(developing.imp) if developing is not None else None,
            "weekly_triggers": impulse_triggers(w.Close[w.index <= last_complete]),
            "daily_triggers": impulse_triggers(d.Close)}
    if tide != 0:
        side, provisional = tide, False
    else:
        side = plan["weekly_developing"] or int(np.sign(wk.ema26 - w.ema26.iloc[-2 if developing is None else -3]))
        provisional = True
    word = "long" if side == 1 else "short"
    pulled_back = (r.fi2 < 0) if side == 1 else (r.fi2 > 0)
    forbidden = imp == -side
    mid = (r.ema13 + r.ema26) / 2
    if pulled_back:
        kind, entry = "stop", (r.High + tick if side == 1 else r.Low - tick)
    else:
        kind = "limit"
        entry = min(mid, r.Close) if side == 1 else max(mid, r.Close)
    if provisional:
        trig = plan["weekly_triggers"]["green_above" if side == 1 else "red_below"]
        plan.update(action="Stand aside",
                    detail=f"Weekly Impulse is blue, so Screen 1 gives no permission. The {word} plan below arms only after a weekly close {'above' if side == 1 else 'below'} {trig:,.2f} turns the weekly Impulse {'green' if side == 1 else 'red'}.")
    elif kind == "stop" and not forbidden:
        plan.update(action="Buy stop" if side == 1 else "Sell stop",
                    detail=f"Tide and wave agree. Enter {word} on a break of today's {'high' if side == 1 else 'low'}; trail the order to each new bar's extreme until filled.")
    elif kind == "stop":
        plan.update(action="Wait",
                    detail=f"The pullback is there but the daily Impulse is {'red' if side == 1 else 'green'}, which forbids a {word}. Arm the order once the daily Impulse turns blue.")
    else:
        at_value = (r.Close <= mid) if side == 1 else (r.Close >= mid)
        plan.update(action=("Buy" if side == 1 else "Sell") + (" at value" if at_value else " in value zone"),
                    detail=(f"Price is already in the value zone. Enter {word} at the market." if at_value else
                            f"The tide favours a {word} but there is no pullback yet. Elder buys value, not strength: place a limit at the middle of the 13/26-day EMA value zone."))
    plan["kind"], plan["side"], plan["provisional"] = kind, side, provisional
    lows, highs = d.Low.iloc[-2:], d.High.iloc[-2:]
    if kind == "limit":
        stop = (min(r.ema26, r.ema13, entry) - r.atr) if side == 1 else (max(r.ema26, r.ema13, entry) + r.atr)
    else:
        stop = lows.min() - 0.1 * r.atr if side == 1 else highs.max() + 0.1 * r.atr
    target = r.upper if side == 1 else r.lower
    if (target - entry) * side < abs(entry - stop):
        target = entry + side * 2 * abs(entry - stop)
        plan["target_note"] = "The channel line is less than 1R away, so the target is set at 2R."
    risk = abs(entry - stop)
    plan.update(entry=float(entry), stop=float(stop), target=float(target),
                rr=float(abs(target - entry) / risk), risk_pct=RISK[side] * 100,
                units_per_100k=float(RISK[side] * 100_000 / risk),
                safezone=float(r.sz_long if side == 1 else r.sz_short))
    return plan, side


def confluence(d, plan, div):
    r = d.iloc[-1]
    side = plan["side"]
    checks = []
    def add(name, ok, note):
        checks.append({"name": name, "ok": bool(ok), "note": note})
    add("Weekly Impulse permits", plan["weekly_impulse"] == side,
        {1: "Green", -1: "Red", 0: "Blue"}[plan["weekly_impulse"]])
    dev = plan["weekly_developing"]
    add("Developing week agrees", dev == side if dev is not None else plan["weekly_impulse"] == side,
        {1: "Green", -1: "Red", 0: "Blue", None: "Week complete"}[dev])
    add("Daily Impulse permits", side != 0 and plan["daily_impulse"] != -side,
        {1: "Green", -1: "Red", 0: "Blue"}[plan["daily_impulse"]])
    add("Force Index pullback", side != 0 and ((r.fi2 < 0) if side == 1 else (r.fi2 > 0)),
        "2-day FI " + ("below" if r.fi2 < 0 else "above") + " zero")
    add("13-day Force Index with tide", side != 0 and np.sign(r.fi13) == side,
        "13-day FI " + ("positive" if r.fi13 > 0 else "negative"))
    in_zone = min(r.ema13, r.ema26) <= r.Close <= max(r.ema13, r.ema26)
    near = abs(r.Close - (r.ema13 + r.ema26) / 2) <= r.atr
    add("Price at value", side != 0 and (in_zone or near), "In value zone" if in_zone else ("Within 1 ATR" if near else "Away from value"))
    if side == 1:
        er = r.bear < 0 and d.bear.iloc[-1] > d.bear.iloc[-2]
        add("Elder-ray", er, "Bear Power negative and rising" if er else "Bear Power not giving a buy")
    elif side == -1:
        er = r.bull > 0 and d.bull.iloc[-1] < d.bull.iloc[-2]
        add("Elder-ray", er, "Bull Power positive and falling" if er else "Bull Power not giving a sell")
    else:
        add("Elder-ray", False, "No tide to trade with")
    add("MACD-H divergence", div == side and side != 0,
        {1: "Bullish divergence", -1: "Bearish divergence", 0: "None"}[div])
    return checks


def run():
    report = {"as_of": str(AS_OF.date()), "instruments": []}
    for key, name, desc, unit, tick, rule in INSTRUMENTS:
        raw = pd.read_csv(DATA / f"{key}.csv", parse_dates=["Date"], index_col="Date")
        raw = raw[~raw.index.duplicated()].sort_index()
        if key in DROP_TODAY:
            raw = raw[raw.index < AS_OF]
        d = indicators(raw)
        w = weekly(raw, rule)
        last_day = d.index[-1]
        last_complete = w.index[w.index <= last_day].max()
        d = attach_tide(d, w, last_complete)
        trades, curve = backtest(d, tick)
        st = stats(trades, curve, d, 130)
        plan, side = current_plan(d, w, last_complete, tick)
        div, div_pts = divergence(d)
        fc = analog_forecast(d, side, plan.get("entry"), plan.get("stop"), plan.get("target"), plan["kind"])
        checks = confluence(d, plan, div)
        score = sum(c["ok"] for c in checks)
        tail = d.iloc[-CHART_BARS:]
        bars = [{"t": str(ix.date()), "o": r.Open, "h": r.High, "l": r.Low, "c": r.Close, "imp": int(r.imp),
                 "e13": r.ema13, "e26": r.ema26, "up": r.upper, "lo": r.lower, "hist": r["hist"], "fi2": r.fi2,
                 "szl": r.sz_long, "szs": r.sz_short}
                for ix, r in tail.iterrows()]
        wt = w.iloc[-60:]
        wbars = [{"t": str(ix.date()), "o": r.Open, "h": r.High, "l": r.Low, "c": r.Close, "imp": int(r.imp),
                  "e26": r.ema26, "done": bool(ix <= last_complete)} for ix, r in wt.iterrows()]
        step = pd.Timedelta(days=1)
        future, t = [], last_day
        while len(future) < HORIZON:
            t += step
            if key == "btc" or t.weekday() < 5:
                future.append(str(t.date()))
        r = d.iloc[-1]
        report["instruments"].append({
            "key": key, "name": name, "desc": desc, "unit": unit, "last_date": str(last_day.date()),
            "last_week": str(last_complete.date()),
            "close": r.Close, "chg": float(r.Close / d.Close.iloc[-2] - 1),
            "levels": {"ema13": r.ema13, "ema26": r.ema26, "upper": r.upper, "lower": r.lower, "atr": r.atr,
                       "sz_long": r.sz_long, "sz_short": r.sz_short, "fi2": r.fi2, "fi13": r.fi13,
                       "bull": r.bull, "bear": r.bear, "hist": r["hist"],
                       "w_ema26": float(w.loc[last_complete, "ema26"]),
                       "w_hist": float(w.loc[last_complete, "hist"])},
            "plan": plan, "divergence": div, "divergence_points": div_pts,
            "checks": checks, "score": score, "forecast": fc, "future_dates": future,
            "stats": st, "recent_trades": trades[-6:], "bars": bars, "weeks": wbars,
        })
        print(f"{name:10s} close {r.Close:,.2f} tide {plan['tide']:+d} imp {plan['daily_impulse']:+d} "
              f"-> {plan['action']} {plan['side']:+d}  score {score}/8  trades {st.get('n')} win {st.get('win_rate', 0):.0%} "
              f"avgR {st.get('avg_R', 0):+.2f}  P(up30) {fc['p_up']:.0%} n={fc['n']} "
              f"P(tgt) {fc.get('p_target_first')}")
    payload = json.dumps(clean(report), allow_nan=False)
    (HERE / "report.json").write_text(payload)
    page = (HERE / "template.html").read_text().replace("/*DATA*/null", payload)
    (HERE / "elder_desk.html").write_text(page)


def clean(o):
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [clean(v) for v in o]
    if isinstance(o, (bool, np.bool_)):
        return bool(o)
    if isinstance(o, (int, np.integer)):
        return int(o)
    if isinstance(o, (float, np.floating)):
        return None if not np.isfinite(o) else round(float(o), 6)
    return o


if __name__ == "__main__":
    run()
