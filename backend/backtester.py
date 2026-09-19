from __future__ import annotations

import numpy as np
import pandas as pd


def run_backtest(data: pd.DataFrame, initial_capital: float = 10000, position_size: float = 1.0, transaction_cost: float = 0.001, risk_free_rate: float = 0.045, strategy: str = "ema", fast_window: int = 50, slow_window: int = 200) -> dict:
    prices = data["Close"].copy()
    fast_window = max(5, min(int(fast_window), 50))
    slow_window = max(fast_window + 1, min(int(slow_window), 200))
    fast = prices.ewm(span=fast_window, adjust=False).mean() if strategy == "ema" else prices.rolling(fast_window, min_periods=1).mean()
    slow = prices.ewm(span=slow_window, adjust=False).mean() if strategy == "ema" else prices.rolling(slow_window, min_periods=1).mean()
    if strategy == "momentum":
        signal = (prices.pct_change(fast_window) > 0).astype(float)
    elif strategy == "mean_reversion":
        signal = (prices < fast).astype(float)
    else:
        signal = (fast > slow).astype(float)
    signal = signal.fillna(0)
    target_exposure = signal.shift(1).fillna(0) * position_size
    turnover = target_exposure.diff().abs().fillna(target_exposure.abs())
    strategy_returns = target_exposure * prices.pct_change().fillna(0) - turnover * transaction_cost
    benchmark_returns = prices.pct_change().fillna(0)
    equity = initial_capital * (1 + strategy_returns).cumprod()
    benchmark = initial_capital * (1 + benchmark_returns).cumprod()
    rolling_peak = equity.cummax()
    drawdowns = equity / rolling_peak - 1
    daily_rf = (1 + risk_free_rate) ** (1 / 252) - 1
    volatility = strategy_returns.std() * np.sqrt(252)
    sharpe = ((strategy_returns - daily_rf).mean() / strategy_returns.std()) * np.sqrt(252) if strategy_returns.std() else 0.0
    trade_count = int(((target_exposure.diff().abs() > 0).sum()))
    curve = [{"date": index.strftime("%Y-%m-%d"), "strategy": round(float(equity.loc[index]), 2), "benchmark": round(float(benchmark.loc[index]), 2)} for index in equity.index]
    trade_rows = []
    for index in turnover[turnover > 0].index:
        exposure = float(target_exposure.loc[index])
        trade_rows.append({
            "date": index.strftime("%Y-%m-%d"),
            "action": "BUY (Long)" if exposure > 0 else "SELL (Exit)",
            "execution_price": round(float(prices.loc[index]), 2),
            "portfolio_value": round(float(equity.loc[index]), 2),
        })
    return {
        "metrics": {
            "total_return": float(equity.iloc[-1] / initial_capital - 1),
            "benchmark_return": float(benchmark.iloc[-1] / initial_capital - 1),
            "sharpe": float(sharpe),
            "max_drawdown": float(drawdowns.min()),
            "final_value": float(equity.iloc[-1]),
            "benchmark_final_value": float(benchmark.iloc[-1]),
            "total_trades": trade_count,
            "annualized_volatility": float(volatility),
        },
        "curve": curve[-520:],
        "trades": trade_rows[-100:],
        "parameters": {"strategy": strategy, "fast_window": fast_window, "slow_window": slow_window, "transaction_cost": transaction_cost},
    }
