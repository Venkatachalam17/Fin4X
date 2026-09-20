from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd

try:
    import yfinance as yf
except Exception:
    yf = None


ASSETS = {
    "gold": {"label": "Gold", "ticker": "GC=F", "color": "#f5c451", "unit": "USD / oz"},
    "bitcoin": {"label": "Bitcoin", "ticker": "BTC-USD", "color": "#f7931a", "unit": "USD"},
    "nvidia": {"label": "NVIDIA", "ticker": "NVDA", "color": "#76b900", "unit": "USD"},
}


def _mock_prices(key: str, periods: int = 520) -> pd.DataFrame:
    seed = {"gold": 7, "bitcoin": 17, "nvidia": 27}.get(key, 37)
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=periods)
    if len(dates) != periods:
        dates = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=periods + 1)[:periods]

    base = {"gold": 1850.0, "bitcoin": 42000.0, "nvidia": 430.0}.get(key, 100.0)
    beta = {"gold": 0.34, "bitcoin": 1.25, "nvidia": 1.06}.get(key, 0.7)
    drift = {"gold": 0.00012, "bitcoin": 0.0009, "nvidia": 0.0008}.get(key, 0.0004)
    vol = {"gold": 0.0105, "bitcoin": 0.028, "nvidia": 0.020}.get(key, 0.015)

    t = np.arange(periods)
    market_cycle = (
        0.0022 * np.sin(t / 18.0)
        + 0.0018 * np.cos(t / 31.0)
        + rng.normal(0.0003, 0.007, periods)
    )
    common_factor = market_cycle * (0.9 + 0.15 * beta)
    idiosyncratic = rng.normal(drift, vol, periods)
    log_returns = common_factor + idiosyncratic * 0.7
    close = base * np.exp(np.cumsum(log_returns))

    frame = pd.DataFrame({"Close": close}, index=dates)
    frame["Open"] = frame["Close"] * (1 + rng.normal(0, 0.0035, periods))
    frame["High"] = frame[["Open", "Close"]].max(axis=1) * (1 + abs(rng.normal(0, 0.006, periods)))
    frame["Low"] = frame[["Open", "Close"]].min(axis=1) * (1 - abs(rng.normal(0, 0.006, periods)))
    frame["Volume"] = rng.integers(100000, 10000000, periods)
    return frame


def _normalize(frame: pd.DataFrame) -> pd.DataFrame:
    if isinstance(frame.columns, pd.MultiIndex):
        frame.columns = frame.columns.get_level_values(0)
    frame = frame.rename(columns={str(column): str(column).title() for column in frame.columns})
    if "Close" not in frame.columns:
        raise ValueError("Price response did not contain Close")
    frame.index = pd.to_datetime(frame.index).tz_localize(None)
    frame = frame[~frame.index.duplicated(keep="last")].sort_index()
    frame = frame.replace([np.inf, -np.inf], np.nan).dropna(subset=["Close"])
    return frame


def fetch_prices(key: str, period: str = "2y") -> tuple[pd.DataFrame, bool]:
    if key not in ASSETS:
        raise ValueError(f"Unknown asset: {key}")
    if yf is not None:
        try:
            downloaded = yf.download(ASSETS[key]["ticker"], period=period, auto_adjust=True, progress=False, threads=False)
            if not downloaded.empty:
                return _normalize(downloaded), True
        except Exception:
            pass
    return _mock_prices(key), False


def calculate_indicators(frame: pd.DataFrame, risk_free_rate: float = 0.045) -> pd.DataFrame:
    data = frame.copy()
    data["Return"] = data["Close"].pct_change().fillna(0)
    data["CumulativeReturn"] = (1 + data["Return"]).cumprod() - 1
    data["RollingReturn21"] = ((1 + data["Return"]).rolling(21, min_periods=5).apply(np.prod, raw=True) - 1).fillna(0)
    data["EMA50"] = data["Close"].ewm(span=50, adjust=False).mean()
    data["EMA200"] = data["Close"].ewm(span=200, adjust=False).mean()
    data["SMA50"] = data["Close"].rolling(50, min_periods=1).mean()
    data["Volatility"] = data["Return"].rolling(21, min_periods=5).std().fillna(0) * np.sqrt(252)
    data["RollingMax"] = data["Close"].cummax()
    data["Drawdown"] = data["Close"] / data["RollingMax"] - 1
    return data


def summary(data: pd.DataFrame, risk_free_rate: float = 0.045) -> dict[str, float]:
    returns = data["Return"].dropna()
    annual_return = float((1 + returns).prod() ** (252 / max(len(returns), 1)) - 1)
    annual_volatility = float(returns.std() * np.sqrt(252)) if len(returns) > 1 else 0.0
    daily_rf = (1 + risk_free_rate) ** (1 / 252) - 1
    sharpe = float(((returns - daily_rf).mean() / returns.std()) * np.sqrt(252)) if returns.std() else 0.0
    return {
        "price": float(data["Close"].iloc[-1]),
        "daily_change": float(data["Return"].iloc[-1]),
        "cumulative_return": float(data["CumulativeReturn"].iloc[-1]),
        "rolling_return_21d": float(data["RollingReturn21"].iloc[-1]),
        "annual_return": annual_return,
        "annual_volatility": annual_volatility,
        "sharpe": sharpe,
        "max_drawdown": float(data["Drawdown"].min()),
    }


def serialize_series(data: pd.DataFrame, limit: int = 520) -> list[dict[str, Any]]:
    data = data.tail(limit)
    rows = []
    for index, row in data.iterrows():
        rows.append({
            "date": index.strftime("%Y-%m-%d"),
            "close": round(float(row["Close"]), 4),
            "return": round(float(row.get("Return", 0)), 6),
            "cumulative_return": round(float(row.get("CumulativeReturn", 0)), 6),
            "rolling_return_21d": round(float(row.get("RollingReturn21", 0)), 6),
            "sma50": round(float(row.get("SMA50", row["Close"])), 4),
            "ema50": round(float(row.get("EMA50", row["Close"])), 4),
            "ema200": round(float(row.get("EMA200", row["Close"])), 4),
            "volatility": round(float(row.get("Volatility", 0)), 6),
            "drawdown": round(float(row.get("Drawdown", 0)), 6),
        })
    return rows


def asset_payload(key: str, period: str = "2y") -> dict[str, Any]:
    raw, live = fetch_prices(key, period)
    data = calculate_indicators(raw)
    return {
        "asset": key,
        "label": ASSETS[key]["label"],
        "ticker": ASSETS[key]["ticker"],
        "color": ASSETS[key]["color"],
        "unit": ASSETS[key]["unit"],
        "source": "Yahoo Finance" if live else "QuantX simulated fallback",
        "live": live,
        "summary": summary(data),
        "series": serialize_series(data),
    }
