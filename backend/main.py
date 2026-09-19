from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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
    response = run_backtest(data, request.initial_capital, request.position_size, request.transaction_cost)
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
    return {"asset": asset, "source": "Yahoo Finance" if live else "QuantX simulated fallback", "regimes": grouped, "series": serialize_series(data)}
