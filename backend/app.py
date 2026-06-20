"""
Portfolio Analytics Backend
-------------------------------
Small Flask API that wraps yfinance and serves historical
price data to the React frontend, sidestepping CORS issues
entirely since it's our own server.
"""

from flask import Flask, jsonify
from flask_cors import CORS
import yfinance as yf

app = Flask(__name__)
CORS(app)  # allow requests from the React dev server

@app.route("/api/history/<ticker>")
def history(ticker):
    try:
        data = yf.download(ticker, period="3y", interval="1d", progress=False)
        if data.empty:
            return jsonify({"error": f"No data found for {ticker}"}), 404

        # Flatten multi-index columns if present
        if isinstance(data.columns, type(data.columns)) and hasattr(data.columns, 'get_level_values'):
            try:
                data.columns = data.columns.get_level_values(0)
            except Exception:
                pass

        rows = []
        for date, row in data.iterrows():
            close = row["Close"]
            if hasattr(close, "item"):
                close = close.item()
            rows.append({"date": date.strftime("%Y-%m-%d"), "close": float(close)})

        return jsonify({"ticker": ticker.upper(), "rows": rows})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    app.run(debug=True, port=5001)
