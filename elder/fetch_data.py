"""Download daily OHLCV for the Elder system universe into elder/data/."""
from pathlib import Path

import yfinance as yf

SYMBOLS = {
    "gold": ["XAUUSD=X", "GC=F"],  # spot first, futures as fallback
    "btc": ["BTC-USD"],
    "dji": ["^DJI"],
    "spx": ["^GSPC"],
    "asx200": ["^AXJO"],
}
OUT = Path(__file__).parent / "data"
OUT.mkdir(exist_ok=True)

for name, tickers in SYMBOLS.items():
    for ticker in tickers:
        df = yf.download(ticker, period="5y", interval="1d", auto_adjust=False, progress=False)
        if df.empty:
            print(f"{name}: {ticker} returned no data")
            continue
        if hasattr(df.columns, "levels"):
            df.columns = df.columns.get_level_values(0)
        df = df[["Open", "High", "Low", "Close", "Volume"]].dropna(subset=["Close"])
        df.index.name = "Date"
        df.round(4).to_csv(OUT / f"{name}.csv")
        (OUT / f"{name}.source").write_text(ticker + "\n")
        print(f"{name}: {ticker} {len(df)} rows, last {df.index[-1].date()}")
        break
