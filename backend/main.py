from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import numpy as np
import pandas as pd

try:
    from .backtester import run_backtest
    from .engine import ASSETS, asset_payload, calculate_indicators, fetch_prices, serialize_series, summary
except ImportError:  # pragma: no cover - supports running as a script from backend/
    from backtester import run_backtest
    from engine import ASSETS, asset_payload, calculate_indicators, fetch_prices, serialize_series, summary

app = FastAPI(title="QuantX Intelligence API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


class BacktestRequest(BaseModel):
    asset: str = "gold"
    initial_capital: float = Field(10000, gt=0)
    position_size: float = Field(1.0, gt=0, le=1)
    transaction_cost: float = Field(0.001, ge=0, le=0.1)
    strategy: str = Field("ema", pattern="^(ema|sma|momentum|mean_reversion)$")
    fast_window: int = Field(50, ge=5, le=50)
    slow_window: int = Field(200, ge=30, le=200)


def get_data(asset: str):
    try:
        raw, live = fetch_prices(asset)
        return calculate_indicators(raw), live
    except Exception as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "QuantX Intelligence API"}


@app.get("/api/assets")
def assets():
    cards = []
    for key in ASSETS:
        payload = asset_payload(key, "1y")
        cards.append({"asset": key, "label": payload["label"], "ticker": payload["ticker"], "color": payload["color"], "source": payload["source"], "live": payload["live"], "summary": payload["summary"], "series": payload["series"]})
    return {"assets": cards}


@app.get("/api/assets/{asset}")
def asset(asset: str, period: str = "2y"):
    if asset not in ASSETS:
        raise HTTPException(status_code=404, detail="Asset not found")
    return asset_payload(asset, period)


@app.post("/api/backtest")
def backtest(request: BacktestRequest):
    if request.asset not in ASSETS:
        raise HTTPException(status_code=400, detail="Asset not found")
    data, live = get_data(request.asset)
    response = run_backtest(data, request.initial_capital, request.position_size, request.transaction_cost, strategy=request.strategy, fast_window=request.fast_window, slow_window=request.slow_window)
    response["asset"] = request.asset
    response["source"] = "Yahoo Finance" if live else "QuantX simulated fallback"
    return response


@app.get("/api/correlation")
def correlation():
    streams = {}
    live = True
    for key in ASSETS:
        data, is_live = get_data(key)
        streams[key] = data["Return"]
        live = live and is_live
    frame = __import__("pandas").DataFrame(streams).dropna()
    return {"assets": list(ASSETS.keys()), "labels": [ASSETS[key]["label"] for key in ASSETS], "matrix": frame.corr().round(3).values.tolist(), "source": "Yahoo Finance" if live else "QuantX simulated fallback"}


@app.get("/api/regimes/{asset}")
def regimes(asset: str):
    if asset not in ASSETS:
        raise HTTPException(status_code=404, detail="Asset not found")
    data, live = get_data(asset)
    data["trend"] = data["EMA50"] > data["EMA200"]
    data["vol_median"] = data["Volatility"].rolling(126, min_periods=20).median()
    data["regime"] = "Bull / Low Volatility"
    data.loc[~data["trend"], "regime"] = "Bear / Low Volatility"
    data.loc[data["Volatility"] > data["vol_median"], "regime"] = "Bull / High Volatility"
    data.loc[(~data["trend"]) & (data["Volatility"] > data["vol_median"]), "regime"] = "Bear / High Volatility"
    grouped = []
    for name, group in data.groupby("regime", sort=False):
        grouped.append({"regime": name, "days": int(len(group)), "return": float((1 + group["Return"]).prod() - 1), "volatility": float(group["Volatility"].mean()), "color": {"Bull / Low Volatility": "#42d392", "Bull / High Volatility": "#f5c451", "Bear / Low Volatility": "#7a8da6", "Bear / High Volatility": "#ff6b6b"}.get(name, "#93a4bc")})
    regime_colors = {"Bull / Low Volatility": "#42d392", "Bull / High Volatility": "#f5c451", "Bear / Low Volatility": "#7a8da6", "Bear / High Volatility": "#ff6b6b"}
    timeline = [{"date": index.strftime("%Y-%m-%d"), "regime": row["regime"], "trend": "Bull" if row["trend"] else "Bear", "volatility_state": "High Volatility" if row["Volatility"] > row["vol_median"] else "Low Volatility", "color": regime_colors.get(row["regime"], "#93a4bc")} for index, row in data.tail(520).iterrows()]
    current = timeline[-1] if timeline else {"regime": "Unknown", "color": "#93a4bc"}
    return {"asset": asset, "source": "Yahoo Finance" if live else "QuantX simulated fallback", "current": current, "regimes": grouped, "timeline": timeline, "series": serialize_series(data)}


@app.get("/api/regime-performance/{asset}")
def regime_performance(asset: str, regime: str = "bull"):
    if asset not in ASSETS:
        raise HTTPException(status_code=404, detail="Asset not found")
    regime_labels = {
        "bull": "Bull Market (Expansion)",
        "bear": "Bear Market (Contraction)",
        "high_vol": "High Volatility Shock",
        "low_vol": "Low Volatility Grind",
    }
    data, live = get_data(asset)
    data["trend"] = data["EMA50"] > data["EMA200"]
    data["vol_median"] = data["Volatility"].rolling(126, min_periods=20).median()
    data["regime"] = "Bull / Low Volatility"
    data.loc[~data["trend"], "regime"] = "Bear / Low Volatility"
    data.loc[data["Volatility"] > data["vol_median"], "regime"] = "Bull / High Volatility"
    data.loc[(~data["trend"]) & (data["Volatility"] > data["vol_median"]), "regime"] = "Bear / High Volatility"
    regime = regime if regime in regime_labels else "bull"
    if regime == "bull":
        selected = data[data["trend"]].copy()
    elif regime == "bear":
        selected = data[~data["trend"]].copy()
    elif regime == "high_vol":
        selected = data[data["Volatility"] > data["vol_median"]].copy()
    else:
        selected = data[data["Volatility"] <= data["vol_median"]].copy()
    prices = data["Close"]
    strategies = {"SMA Crossover (20/50)": ("sma", 20, 50), "EMA Trend Following": ("ema", 20, 50), "Momentum Oscillator": ("momentum", 20, 50), "Mean Reversion": ("mean_reversion", 20, 50), "Buy & Hold (Benchmark)": ("hold", 1, 2)}
    comparison = []
    for name, (kind, fast_window, slow_window) in strategies.items():
        if kind == "ema":
            fast = prices.ewm(span=fast_window, adjust=False).mean()
            slow = prices.ewm(span=slow_window, adjust=False).mean()
            signal = (fast > slow).astype(float)
        elif kind == "sma":
            signal = (prices.rolling(fast_window, min_periods=1).mean() > prices.rolling(slow_window, min_periods=1).mean()).astype(float)
        elif kind == "momentum":
            signal = (prices.pct_change(fast_window) > 0).astype(float)
        elif kind == "mean_reversion":
            signal = (prices < prices.rolling(fast_window, min_periods=1).mean()).astype(float)
        else:
            signal = pd.Series(1.0, index=prices.index)
        returns = selected["Return"] if kind == "hold" else (signal.shift(1).reindex(selected.index).fillna(0) * selected["Return"])
        returns = returns.replace([np.inf, -np.inf], np.nan).dropna()
        compounded = float((1 + returns).prod() - 1) if len(returns) else 0.0
        volatility = float(returns.std()) if len(returns) > 1 else 0.0
        sharpe = float((returns.mean() / volatility) * np.sqrt(252)) if volatility else 0.0
        equity = (1 + returns).cumprod()
        drawdown = float((equity / equity.cummax() - 1).min()) if len(equity) else 0.0
        comparison.append({"strategy": name, "period_return": compounded, "sharpe": sharpe, "max_drawdown": drawdown, "trades": int(signal.diff().abs().reindex(selected.index).fillna(0).gt(0).sum())})
    return {"asset": asset, "regime": regime, "regime_label": regime_labels[regime], "source": "Yahoo Finance" if live else "QuantX simulated fallback", "strategies": comparison}
