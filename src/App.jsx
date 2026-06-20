import React, { useState, useCallback } from 'react';
import Papa from 'papaparse';
import {
  AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

const COLORS = {
  bg: '#0a0c10',
  panel: '#12151b',
  panelBorder: '#23272f',
  text: '#ede6d6',
  dim: '#7c8089',
  amber: '#d9a441',
  rose: '#c2566b',
  steel: '#5c8aa6',
  sage: '#7a9b76',
};

const SECTOR_COLORS = ['#d9a441', '#5c8aa6', '#7a9b76', '#c2566b', '#9b7ab8', '#c9924a', '#6a93a3'];

const SECTOR_MAP = {
  AAPL: 'Technology', MSFT: 'Technology', GOOGL: 'Technology', GOOG: 'Technology',
  META: 'Technology', NVDA: 'Technology', AMD: 'Technology', INTC: 'Technology',
  CRM: 'Technology', ORCL: 'Technology', ADBE: 'Technology', CSCO: 'Technology',
  AMZN: 'Consumer Discretionary', TSLA: 'Consumer Discretionary', HD: 'Consumer Discretionary',
  NKE: 'Consumer Discretionary', SBUX: 'Consumer Discretionary', MCD: 'Consumer Discretionary',
  JPM: 'Financials', BAC: 'Financials', WFC: 'Financials', GS: 'Financials',
  MS: 'Financials', SCHW: 'Financials', V: 'Financials', MA: 'Financials',
  XOM: 'Energy', CVX: 'Energy', COP: 'Energy', SLB: 'Energy',
  JNJ: 'Healthcare', UNH: 'Healthcare', PFE: 'Healthcare', ABBV: 'Healthcare', LLY: 'Healthcare',
  PG: 'Consumer Staples', KO: 'Consumer Staples', PEP: 'Consumer Staples', WMT: 'Consumer Staples', COST: 'Consumer Staples',
  BA: 'Industrials', CAT: 'Industrials', UPS: 'Industrials', HON: 'Industrials', GE: 'Industrials',
  VOO: 'Broad Market', SPY: 'Broad Market', VTI: 'Broad Market', QQQ: 'Broad Market',
  BND: 'Fixed Income', AGG: 'Fixed Income', TLT: 'Fixed Income',
};

function getSector(ticker) {
  return SECTOR_MAP[ticker.toUpperCase()] || 'Other';
}

async function fetchHistory(ticker) {
  const res = await fetch(`http://localhost:5001/api/history/${ticker}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.error) return null;
  return data.rows;
}

function alignSeries(seriesMap) {
  const dateSets = Object.values(seriesMap).map(rows => new Set(rows.map(r => r.date)));
  const common = [...dateSets[0]].filter(d => dateSets.every(s => s.has(d)));
  common.sort();
  const aligned = {};
  for (const ticker in seriesMap) {
    const map = Object.fromEntries(seriesMap[ticker].map(r => [r.date, r.close]));
    aligned[ticker] = common.map(d => map[d]);
  }
  return { dates: common, aligned };
}

function computeReturns(prices) {
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return returns;
}

function std(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx), upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

const fmtPct = (v, d = 2) => `${(v * 100).toFixed(d)}%`;
const fmtUsd = (v) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function RiskGauge({ value, label, max = 40 }) {
  const clamped = Math.min(value, max);
  const angle = (clamped / max) * 180;
  const rad = (angle * Math.PI) / 180;
  const cx = 90, cy = 90, r = 70;
  const needleX = cx - r * Math.cos(rad);
  const needleY = cy - r * Math.sin(rad);

  const arcs = [
    { from: 0, to: 60, color: COLORS.sage },
    { from: 60, to: 120, color: COLORS.amber },
    { from: 120, to: 180, color: COLORS.rose },
  ];

  const polarToCartesian = (angleDeg) => {
    const a = (angleDeg * Math.PI) / 180;
    return [cx - r * Math.cos(a), cy - r * Math.sin(a)];
  };

  return (
    <svg viewBox="0 0 180 110" style={{ width: '100%', maxWidth: 220 }}>
      {arcs.map((arc, i) => {
        const [x1, y1] = polarToCartesian(arc.from);
        const [x2, y2] = polarToCartesian(arc.to);
        return (
          <path
            key={i}
            d={`M ${x1} ${y1} A ${r} ${r} 0 0 0 ${x2} ${y2}`}
            stroke={arc.color}
            strokeWidth="10"
            fill="none"
            opacity="0.85"
            strokeLinecap="round"
          />
        );
      })}
      <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={COLORS.text} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="4" fill={COLORS.text} />
      <text x={cx} y={cy + 26} textAnchor="middle" fill={COLORS.text} fontSize="16" fontFamily="JetBrains Mono, monospace" fontWeight="600">
        {value.toFixed(1)}%
      </text>
      <text x={cx} y={cy + 42} textAnchor="middle" fill={COLORS.dim} fontSize="9" fontFamily="JetBrains Mono, monospace" letterSpacing="1.5">
        {label}
      </text>
    </svg>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 6,
      padding: '16px 18px', flex: 1, minWidth: 140,
    }}>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.15em', color: COLORS.dim, textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 26, fontWeight: 500, color: accent || COLORS.text, lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: COLORS.dim, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export default function App() {
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState('');
  const [results, setResults] = useState(null);

  const handleFile = useCallback((file) => {
    setError(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        try {
          const rows = res.data.map(r => ({
            ticker: (r.ticker || r.Ticker || r.symbol || r.Symbol || '').trim().toUpperCase(),
            shares: parseFloat(r.shares || r.Shares || r.quantity || r.Quantity),
            costBasis: parseFloat(r.cost_basis || r.costBasis || r['Cost Basis'] || r.cost || 0),
          })).filter(r => r.ticker && !isNaN(r.shares));
          if (rows.length === 0) {
            setError('Could not find valid rows. Expected columns: ticker, shares, cost_basis (optional).');
            return;
          }
          setHoldings(rows);
        } catch (e) {
          setError('Could not parse that file. Check the format and try again.');
        }
      },
      error: () => setError('Could not read that file.'),
    });
  }, []);

  const loadSample = () => {
    setHoldings([
      { ticker: 'AAPL', shares: 25, costBasis: 150 },
      { ticker: 'MSFT', shares: 15, costBasis: 280 },
      { ticker: 'JPM', shares: 20, costBasis: 140 },
      { ticker: 'XOM', shares: 30, costBasis: 90 },
      { ticker: 'BND', shares: 40, costBasis: 72 },
    ]);
  };

  const runAnalysis = async () => {
    if (holdings.length === 0) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const seriesMap = {};
      for (let i = 0; i < holdings.length; i++) {
        const h = holdings[i];
        setProgress(`Fetching ${h.ticker}... (${i + 1}/${holdings.length})`);
        const rows = await fetchHistory(h.ticker);
        if (!rows || rows.length < 30) {
          throw new Error(`Could not load enough price history for ${h.ticker}. Check the ticker is correct.`);
        }
        seriesMap[h.ticker] = rows.slice(-756);
      }

      setProgress('Computing analytics...');
      const { dates, aligned } = alignSeries(seriesMap);
      if (dates.length < 30) throw new Error('Not enough overlapping price history across holdings.');

      const latestPrices = {};
      holdings.forEach(h => { latestPrices[h.ticker] = aligned[h.ticker][aligned[h.ticker].length - 1]; });

      const values = holdings.map(h => h.shares * latestPrices[h.ticker]);
      const totalValue = values.reduce((a, b) => a + b, 0);
      const weights = values.map(v => v / totalValue);

      const totalCost = holdings.reduce((a, h) => a + h.shares * (h.costBasis || 0), 0);
      const totalReturn = totalCost > 0 ? (totalValue - totalCost) / totalCost : null;

      const tickerReturns = holdings.map(h => computeReturns(aligned[h.ticker]));
      const nDays = tickerReturns[0].length;
      const portfolioReturns = [];
      for (let d = 0; d < nDays; d++) {
        let r = 0;
        for (let i = 0; i < holdings.length; i++) r += weights[i] * tickerReturns[i][d];
        portfolioReturns.push(r);
      }

      const annualVol = std(portfolioReturns) * Math.sqrt(252);
      const var95 = -percentile(portfolioReturns, 5);
      const var99 = -percentile(portfolioReturns, 1);

      let cum = 1;
      const cumSeries = [];
      let runningMax = 1;
      let maxDrawdown = 0;
      const drawdownSeries = [];
      for (let d = 0; d < nDays; d++) {
        cum *= (1 + portfolioReturns[d]);
        runningMax = Math.max(runningMax, cum);
        const dd = (cum - runningMax) / runningMax;
        maxDrawdown = Math.min(maxDrawdown, dd);
        cumSeries.push({ date: dates[d + 1], value: (cum - 1) });
        drawdownSeries.push({ date: dates[d + 1], value: dd });
      }

      const periodReturn = cum - 1;
      const annualizedReturn = Math.pow(cum, 252 / nDays) - 1;

      const sectorTotals = {};
      holdings.forEach((h, i) => {
        const sector = getSector(h.ticker);
        sectorTotals[sector] = (sectorTotals[sector] || 0) + values[i];
      });
      const sectorData = Object.entries(sectorTotals).map(([name, value]) => ({
        name, value, pct: value / totalValue,
      })).sort((a, b) => b.value - a.value);

      const holdingsTable = holdings.map((h, i) => ({
        ticker: h.ticker,
        shares: h.shares,
        price: latestPrices[h.ticker],
        value: values[i],
        weight: weights[i],
        gain: h.costBasis ? (latestPrices[h.ticker] - h.costBasis) / h.costBasis : null,
      })).sort((a, b) => b.value - a.value);

      setResults({
        totalValue, totalReturn, annualVol, var95, var99, maxDrawdown,
        periodReturn, annualizedReturn, cumSeries, drawdownSeries, sectorData, holdingsTable,
        days: nDays,
      });
    } catch (e) {
      setError(e.message || 'Something went wrong fetching market data.');
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  return (
    <div style={{
      background: COLORS.bg, color: COLORS.text, minHeight: '100vh',
      fontFamily: 'JetBrains Mono, monospace', padding: '32px 24px',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.3em', color: COLORS.amber, textTransform: 'uppercase', marginBottom: 6 }}>
            atlas // portfolio
          </div>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontWeight: 500, fontSize: 32, margin: 0, letterSpacing: '0.01em' }}>
            Portfolio Risk Reader
          </h1>
          <div style={{ color: COLORS.dim, fontSize: 12, marginTop: 6, maxWidth: 560 }}>
            Upload your holdings. See real volatility, drawdown, and value-at-risk — computed from actual market history, not a sales pitch.
          </div>
        </div>

        {!results && (
          <div style={{
            background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 8,
            padding: 28, marginBottom: 24,
          }}>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', color: COLORS.dim, textTransform: 'uppercase', marginBottom: 14 }}>
              1. Upload holdings (CSV: ticker, shares, cost_basis)
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{
                background: 'transparent', border: `1px solid ${COLORS.amber}`, color: COLORS.amber,
                padding: '10px 18px', borderRadius: 4, fontSize: 11, letterSpacing: '0.1em',
                textTransform: 'uppercase', cursor: 'pointer',
              }}>
                Choose CSV file
                <input type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />
              </label>
              <button onClick={loadSample} style={{
                background: 'transparent', border: `1px solid ${COLORS.panelBorder}`, color: COLORS.dim,
                padding: '10px 18px', borderRadius: 4, fontSize: 11, letterSpacing: '0.1em',
                textTransform: 'uppercase', cursor: 'pointer',
              }}>
                Use sample portfolio
              </button>
            </div>

            {holdings.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 10, color: COLORS.dim, marginBottom: 8 }}>{holdings.length} holdings loaded:</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                  {holdings.map((h, i) => (
                    <span key={i} style={{
                      background: COLORS.bg, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 4,
                      padding: '4px 10px', fontSize: 11, color: COLORS.text,
                    }}>{h.ticker} · {h.shares}sh</span>
                  ))}
                </div>
                <button onClick={runAnalysis} disabled={loading} style={{
                  background: COLORS.amber, border: 'none', color: COLORS.bg,
                  padding: '12px 24px', borderRadius: 4, fontSize: 12, letterSpacing: '0.1em',
                  textTransform: 'uppercase', cursor: loading ? 'wait' : 'pointer', fontWeight: 600,
                  opacity: loading ? 0.6 : 1,
                }}>
                  {loading ? (progress || 'Loading...') : 'Run analysis →'}
                </button>
              </div>
            )}

            {error && (
              <div style={{ marginTop: 16, color: COLORS.rose, fontSize: 12, border: `1px solid ${COLORS.rose}`, borderRadius: 4, padding: '10px 14px' }}>
                {error}
              </div>
            )}
          </div>
        )}

        {results && (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              <StatCard label="Portfolio Value" value={fmtUsd(results.totalValue)} />
              <StatCard
                label="Total Return"
                value={results.totalReturn !== null ? fmtPct(results.totalReturn) : '—'}
                accent={results.totalReturn > 0 ? COLORS.sage : results.totalReturn < 0 ? COLORS.rose : COLORS.text}
                sub="since cost basis"
              />
              <StatCard
                label={`Period Return (${results.days}d)`}
                value={fmtPct(results.periodReturn)}
                accent={results.periodReturn > 0 ? COLORS.sage : COLORS.rose}
              />
              <StatCard label="Annualized Return" value={fmtPct(results.annualizedReturn)} />
              <StatCard label="Max Drawdown" value={fmtPct(results.maxDrawdown)} accent={COLORS.rose} />
            </div>

            <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 8, padding: 20, flex: '1 1 240px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.15em', color: COLORS.dim, textTransform: 'uppercase', marginBottom: 8, alignSelf: 'flex-start' }}>Annualized Volatility</div>
                <RiskGauge value={results.annualVol * 100} label="ANNUAL VOL" />
              </div>

              <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 8, padding: 20, flex: '2 1 400px' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.15em', color: COLORS.dim, textTransform: 'uppercase', marginBottom: 14 }}>Value at Risk (1-day)</div>
                <div style={{ display: 'flex', gap: 24 }}>
                  <div>
                    <div style={{ fontFamily: 'Fraunces, serif', fontSize: 24, color: COLORS.rose }}>{fmtPct(results.var95)}</div>
                    <div style={{ fontSize: 10, color: COLORS.dim, marginTop: 4 }}>95% confidence</div>
                    <div style={{ fontSize: 10, color: COLORS.dim }}>{fmtUsd(results.var95 * results.totalValue)} of portfolio</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'Fraunces, serif', fontSize: 24, color: COLORS.rose }}>{fmtPct(results.var99)}</div>
                    <div style={{ fontSize: 10, color: COLORS.dim, marginTop: 4 }}>99% confidence</div>
                    <div style={{ fontSize: 10, color: COLORS.dim }}>{fmtUsd(results.var99 * results.totalValue)} of portfolio</div>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: COLORS.dim, marginTop: 16, lineHeight: 1.5 }}>
                  On a normal day, this portfolio isn't expected to lose more than the 95% figure. The 99% figure captures rarer, sharper drops.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 8, padding: 20, flex: '2 1 480px' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.15em', color: COLORS.dim, textTransform: 'uppercase', marginBottom: 14 }}>Cumulative Return</div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={results.cumSeries}>
                    <defs>
                      <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLORS.amber} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={COLORS.amber} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={COLORS.panelBorder} strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="date" hide />
                    <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} stroke={COLORS.dim} fontSize={10} width={44} />
                    <Tooltip
                      contentStyle={{ background: COLORS.bg, border: `1px solid ${COLORS.panelBorder}`, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                      formatter={(v) => [`${(v * 100).toFixed(2)}%`, 'Return']}
                    />
                    <Area type="monotone" dataKey="value" stroke={COLORS.amber} strokeWidth={1.5} fill="url(#cumGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 8, padding: 20, flex: '1 1 280px' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.15em', color: COLORS.dim, textTransform: 'uppercase', marginBottom: 14 }}>Sector Exposure</div>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={results.sectorData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {results.sectorData.map((_, i) => <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: COLORS.bg, border: `1px solid ${COLORS.panelBorder}`, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                      formatter={(v, n, p) => [`${(p.payload.pct * 100).toFixed(1)}%`, p.payload.name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                  {results.sectorData.map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: COLORS.dim }}>
                      <span><span style={{ display: 'inline-block', width: 8, height: 8, background: SECTOR_COLORS[i % SECTOR_COLORS.length], borderRadius: 2, marginRight: 6 }} />{s.name}</span>
                      <span style={{ color: COLORS.text }}>{(s.pct * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 8, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.15em', color: COLORS.dim, textTransform: 'uppercase', marginBottom: 14 }}>Drawdown</div>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={results.drawdownSeries}>
                  <defs>
                    <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.rose} stopOpacity={0.05} />
                      <stop offset="100%" stopColor={COLORS.rose} stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={COLORS.panelBorder} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="date" hide />
                  <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} stroke={COLORS.dim} fontSize={10} width={44} />
                  <Tooltip
                    contentStyle={{ background: COLORS.bg, border: `1px solid ${COLORS.panelBorder}`, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
                    formatter={(v) => [`${(v * 100).toFixed(2)}%`, 'Drawdown']}
                  />
                  <Area type="monotone" dataKey="value" stroke={COLORS.rose} strokeWidth={1.5} fill="url(#ddGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.panelBorder}`, borderRadius: 8, padding: 20, marginBottom: 24 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.15em', color: COLORS.dim, textTransform: 'uppercase', marginBottom: 14 }}>Holdings</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ color: COLORS.dim, textAlign: 'left', borderBottom: `1px solid ${COLORS.panelBorder}` }}>
                    <th style={{ padding: '6px 8px' }}>Ticker</th>
                    <th style={{ padding: '6px 8px' }}>Shares</th>
                    <th style={{ padding: '6px 8px' }}>Price</th>
                    <th style={{ padding: '6px 8px' }}>Value</th>
                    <th style={{ padding: '6px 8px' }}>Weight</th>
                    <th style={{ padding: '6px 8px' }}>Gain/Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {results.holdingsTable.map((h, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${COLORS.panelBorder}` }}>
                      <td style={{ padding: '8px', color: COLORS.text, fontWeight: 600 }}>{h.ticker}</td>
                      <td style={{ padding: '8px', color: COLORS.dim }}>{h.shares}</td>
                      <td style={{ padding: '8px', color: COLORS.dim }}>${h.price.toFixed(2)}</td>
                      <td style={{ padding: '8px', color: COLORS.text }}>{fmtUsd(h.value)}</td>
                      <td style={{ padding: '8px', color: COLORS.dim }}>{(h.weight * 100).toFixed(1)}%</td>
                      <td style={{ padding: '8px', color: h.gain === null ? COLORS.dim : h.gain >= 0 ? COLORS.sage : COLORS.rose }}>
                        {h.gain === null ? '—' : fmtPct(h.gain)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button onClick={() => { setResults(null); setHoldings([]); }} style={{
              background: 'transparent', border: `1px solid ${COLORS.panelBorder}`, color: COLORS.dim,
              padding: '10px 18px', borderRadius: 4, fontSize: 11, letterSpacing: '0.1em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}>
              ← Start over
            </button>
          </>
        )}
      </div>
    </div>
  );
}
