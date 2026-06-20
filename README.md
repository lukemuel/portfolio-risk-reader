# Portfolio Risk Reader

A web app that turns your actual stock holdings into real risk analytics — volatility, Value-at-Risk, drawdown, and sector exposure — computed from live market data, not a sales pitch.

Upload a CSV of your holdings (ticker, shares, cost basis) and get back the same kind of risk analysis used in professional portfolio management, in plain visual form.

## Why this exists

Built as an extension of an earlier quant project ([portfolio-risk-analysis](https://github.com/lukemuel/portfolio-risk-analysis)) — turning the analytics from a script into something anyone can actually use on their own portfolio.

## Architecture

- **Frontend:** React + Vite, charts via Recharts, CSV parsing via PapaParse
- **Backend:** Small Flask API wrapping `yfinance` to serve historical price data (sidesteps browser CORS restrictions on free market data sources)

## What it computes

- Portfolio value and total return (vs. cost basis)
- Annualized volatility, shown as a radial risk gauge
- 1-day Value-at-Risk at 95% and 99% confidence
- Maximum drawdown and full drawdown history
- Cumulative return over the holding period
- Sector exposure breakdown

## Setup

**Backend:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 app.py
```
Runs on `http://localhost:5001`

**Frontend** (separate terminal):
```bash
npm install
npm run dev
```
Runs on `http://localhost:5173` — open this in your browser.

Both servers need to be running at the same time.

## CSV Format
`cost_basis` is optional — omit it and total-return-vs-cost just won't display.

## Status

✅ Working v1 — real data, real analytics, no backend persistence (everything computed fresh per session).
