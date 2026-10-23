"""Download daily OHLCV for the instruments in config.json into elder/data/."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "data"


def fetch(only=None):
    """Fetch every configured instrument, trying its tickers in order. Returns
    {key: {"ticker", "rows", "last"}} for successes and {key: {"error"}} for failures."""
    import yfinance as yf

    config = json.loads((HERE / "config.json").read_text())
    OUT.mkdir(exist_ok=True)
    result = {}
    for inst in config["instruments"]:
        key = inst["key"]
        if only and key not in only:
            continue
        for ticker in inst["tickers"]:
            try:
                df = yf.download(ticker, period=config["params"]["history"], interval="1d",
                                 auto_adjust=False, progress=False)
            except Exception as e:  # network or Yahoo failure: try the next ticker
                print(f"{key}: {ticker} failed: {e}")
                continue
            if df.empty:
                print(f"{key}: {ticker} returned no data")
                continue
            if hasattr(df.columns, "levels"):
                df.columns = df.columns.get_level_values(0)
            df = df[["Open", "High", "Low", "Close", "Volume"]].dropna(subset=["Close"])
            df.index.name = "Date"
            df.round(4).to_csv(OUT / f"{key}.csv")
            (OUT / f"{key}.source").write_text(ticker + "\n")
            result[key] = {"ticker": ticker, "rows": len(df), "last": str(df.index[-1].date())}
            print(f"{key}: {ticker} {len(df)} rows, last {df.index[-1].date()}")
            break
        else:
            result[key] = {"error": "no ticker returned data"}
    return result


if __name__ == "__main__":
    res = fetch(set(sys.argv[1].split(",")) if len(sys.argv) > 1 else None)
    sys.exit(1 if any("error" in v for v in res.values()) else 0)
