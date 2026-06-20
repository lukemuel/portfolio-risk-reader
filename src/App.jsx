import React, { useState, useCallback } from 'react';
import Papa from 'papaparse';
import {
  AreaChart, Area, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';

const C = {
  bg: '#090b0f',
  surface: '#0f1318',
  surface2: '#141a20',
  hairline: 'rgba(255,255,255,.06)',
  hairlineFaint: 'rgba(255,255,255,.045)',
  text: '#f3efe7',
  dim: '#8d928f',
  positive: '#a8c49a',
  negative: '#c97a82',
  accent: '#c9a25e',
};

const SECTOR_COLORS = ['#c9a25e', '#7e8b99', '#a8c49a', '#c97a82', '#8d7a99', '#9a8a6a', '#6e8a93'];

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

const BENCHMARK_TICKER = 'SPY';
const RISK_FREE_RATE = 0.04;

const HISTORICAL_SCENARIOS = [
  { name: '2008 Financial Crisis', marketShock: -0.57, recoveryMonths: 49 },
  { name: 'COVID Crash', marketShock: -0.34, recoveryMonths: 5 },
  { name: '2022 Rate Shock', marketShock: -0.25, recoveryMonths: 21 },
  { name: 'Tech Correction', marketShock: -0.33, recoveryMonths: 24 },
];

function getSector(ticker) {
  return SECTOR_MAP[ticker.toUpperCase()] || 'Other';
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001';

async function fetchHistory(ticker) {
  const res = await fetch(`${API_BASE}/api/history/${ticker}`);
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

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr) {
  const m = mean(arr);
  const variance = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function covariance(a, b) {
  const ma = mean(a), mb = mean(b);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / a.length;
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx), upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

// ---- formatting helpers ----

function Num({ value, decimals = 2, color }) {
  return <span style={{ fontFamily: 'var(--mono)', color: color || 'inherit' }}>{value.toFixed(decimals)}</span>;
}

function Pct({ value, decimals = 2, color, showSign = false }) {
  const sign = showSign && value > 0 ? '+' : '';
  return (
    <span style={{ fontFamily: 'var(--mono)', color: color || 'inherit' }}>
      {sign}{(value * 100).toFixed(decimals)}<span style={{ fontSize: '0.72em', opacity: 0.75 }}>%</span>
    </span>
  );
}

const fmtUsd = (v) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

// ---- shared UI primitives ----

function SectionLabel({ children, kicker }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 18 }}>
      {kicker && (
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', color: C.accent, textTransform: 'uppercase' }}>
          {kicker}
        </span>
      )}
      <h2 style={{ fontFamily: 'var(--display)', fontSize: 21, fontWeight: 500, color: C.text, letterSpacing: '0.01em' }}>
        {children}
      </h2>
      <div style={{ flex: 1, height: 1, background: C.hairlineFaint }} />
    </div>
  );
}

function Panel({ children, style }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.hairlineFaint}`,
      borderRadius: 7,
      padding: 24,
      position: 'relative',
      ...style,
    }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 7, pointerEvents: 'none',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.025)',
      }} />
      {children}
    </div>
  );
}

function StatBlock({ label, value, sub, note, valueColor }) {
  return (
    <div style={{ padding: '2px 0' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', color: C.dim, textTransform: 'uppercase', marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: valueColor || C.text, lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: C.dim, marginTop: 8 }}>{sub}</div>}
      {note && <div style={{ fontSize: 11.5, color: C.dim, marginTop: 10, lineHeight: 1.6, maxWidth: 320 }}>{note}</div>}
    </div>
  );
}

function RiskBar({ name, pct, max }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: C.text, fontFamily: 'var(--body)' }}>{name}</span>
        <span style={{ fontSize: 12, color: C.dim, fontFamily: 'var(--mono)' }}>{(pct * 100).toFixed(1)}%</span>
      </div>
      <div style={{ height: 5, background: C.hairlineFaint, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(0, pct / max) * 100}%`, background: C.accent, opacity: 0.85, borderRadius: 2 }} />
      </div>
    </div>
  );
}

// ---- instrument-style volatility gauge ----

function VolatilityInstrument({ value, max = 40 }) {
  const cx = 110, cy = 110, r = 86;
  const startAngle = -210, endAngle = 30; // 240 degree sweep
  const sweep = endAngle - startAngle;
  const clamped = Math.max(0, Math.min(value, max));
  const frac = clamped / max;
  const needleAngle = startAngle + frac * sweep;

  const toXY = (angleDeg, radius) => {
    const a = (angleDeg * Math.PI) / 180;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
  };

  const majorTicks = 8;
  const ticks = [];
  for (let i = 0; i <= majorTicks; i++) {
    const a = startAngle + (i / majorTicks) * sweep;
    const [x1, y1] = toXY(a, r - 4);
    const [x2, y2] = toXY(a, r - 14);
    ticks.push({ x1, y1, x2, y2, major: true, val: (i / majorTicks) * max });
  }
  const minorTicks = majorTicks * 4;
  const minor = [];
  for (let i = 0; i <= minorTicks; i++) {
    if (i % 4 === 0) continue;
    const a = startAngle + (i / minorTicks) * sweep;
    const [x1, y1] = toXY(a, r - 4);
    const [x2, y2] = toXY(a, r - 9);
    minor.push({ x1, y1, x2, y2 });
  }

  const [needleX, needleY] = toXY(needleAngle, r - 22);
  const [tailX, tailY] = toXY(needleAngle + 180, 14);

  const arcPath = (a1, a2, radius) => {
    const [x1, y1] = toXY(a1, radius);
    const [x2, y2] = toXY(a2, radius);
    const largeArc = Math.abs(a2 - a1) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  };

  return (
    <svg viewBox="0 0 220 220" style={{ width: '100%', maxWidth: 240, display: 'block', margin: '0 auto' }}>
      <defs>
        <radialGradient id="dialLight" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#1a2128" />
          <stop offset="70%" stopColor="#10151a" />
          <stop offset="100%" stopColor="#0a0d10" />
        </radialGradient>
        <radialGradient id="capLight" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#e6c989" />
          <stop offset="55%" stopColor={C.accent} />
          <stop offset="100%" stopColor="#8a6c3a" />
        </radialGradient>
      </defs>

      <circle cx={cx} cy={cy} r={r + 6} fill="url(#dialLight)" stroke={C.hairline} strokeWidth="1" />

      <path d={arcPath(startAngle, endAngle, r - 1)} stroke={C.hairlineFaint} strokeWidth="1" fill="none" />

      {minor.map((t, i) => (
        <line key={`mn-${i}`} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={C.dim} strokeWidth="0.75" opacity="0.5" />
      ))}
      {ticks.map((t, i) => {
        const [lx, ly] = toXY(startAngle + (i / majorTicks) * sweep, r - 22);
        return (
          <g key={`mj-${i}`}>
            <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={C.text} strokeWidth="1.25" opacity="0.8" />
            <text x={lx} y={ly + 3} textAnchor="middle" fontSize="8" fontFamily="var(--mono)" fill={C.dim}>
              {Math.round(t.val)}
            </text>
          </g>
        );
      })}

      <line x1={tailX} y1={tailY} x2={needleX} y2={needleY} stroke={C.accent} strokeWidth="2" strokeLinecap="round"
        style={{ transition: 'all 320ms cubic-bezier(0.4, 0.0, 0.2, 1)' }} />
      <circle cx={cx} cy={cy} r="7" fill="url(#capLight)" stroke="#6b5328" strokeWidth="0.75" />
      <circle cx={cx} cy={cy} r="2" fill="#3a2d15" />

      <text x={cx} y={cy + 46} textAnchor="middle" fontFamily="var(--mono)" fontSize="20" fontWeight="500" fill={C.text}>
        {value.toFixed(1)}<tspan fontSize="13" opacity="0.7">%</tspan>
      </text>
      <text x={cx} y={cy + 62} textAnchor="middle" fontFamily="var(--mono)" fontSize="9" letterSpacing="2" fill={C.dim}>
        ANNUAL VOL
      </text>
    </svg>
  );
}

// ---- analysis layer: turns computed numbers into analyst-style language ----

function buildIntelligence(r) {
  const vsBenchmarkReturn = r.periodReturn - r.benchmarkPeriodReturn;
  const vsBenchmarkVol = r.annualVol - r.benchmarkVol;
  const topRiskSector = r.riskBySector[0];
  const topRiskSectorAlloc = r.sectorData.find(s => s.name === topRiskSector.name);
  const worstScenario = [...r.stressScenarios].sort((a, b) => a.estimatedDrawdown - b.estimatedDrawdown)[0];

  let concCount = 0, cum = 0;
  for (const h of r.holdingsRisk) {
    cum += h.riskPct;
    concCount++;
    if (cum >= 0.5) break;
  }

  const brief = [
    `This portfolio ${vsBenchmarkReturn >= 0 ? 'outperformed' : 'trailed'} the S&P 500 by ${Math.abs(vsBenchmarkReturn * 100).toFixed(1)} points over the analyzed period while running ${vsBenchmarkVol <= 0 ? 'below-market' : 'above-market'} volatility.`,
    `${topRiskSector.name} contributes approximately ${(topRiskSector.pct * 100).toFixed(0)}% of total portfolio risk${topRiskSectorAlloc ? `, against ${(topRiskSectorAlloc.pct * 100).toFixed(0)}% of invested capital` : ''}.`,
    `Historical stress testing suggests a portfolio with this allocation would have experienced an estimated drawdown near ${Math.abs(worstScenario.estimatedDrawdown * 100).toFixed(0)}% during a ${worstScenario.name.toLowerCase()}-style shock.`,
    `${concCount} holding${concCount === 1 ? '' : 's'} account${concCount === 1 ? 's' : ''} for the majority of portfolio variance.`,
  ];

  const observations = [
    `Despite holding ${r.holdingsTable.length} securities, effective diversification is closer to ${Math.max(1, Math.round(r.effectiveSectors))} independent sector${Math.round(r.effectiveSectors) === 1 ? '' : 's'} because of concentration.`,
    `${r.sharpe !== null && r.benchmarkSharpe !== null
      ? `This portfolio's Sharpe ratio of ${r.sharpe.toFixed(2)} ${r.sharpe >= r.benchmarkSharpe ? 'exceeds' : 'trails'} the S&P 500's ${r.benchmarkSharpe.toFixed(2)} over the selected period, primarily due to ${r.annualVol <= r.benchmarkVol ? 'lower' : 'higher'} realized volatility.`
      : 'Risk-adjusted return could not be benchmarked for this period.'}`,
    `${topRiskSector.name} holdings generate ${(topRiskSector.pct * 100).toFixed(0)}% of total portfolio risk${topRiskSectorAlloc ? ` while representing ${(topRiskSectorAlloc.pct * 100).toFixed(0)}% of invested capital` : ''}.`,
  ];

  return { brief, observations };
}

const COMMENTARY = {
  sharpe: (v) => `A Sharpe ratio of ${v.toFixed(2)} indicates the portfolio generated ${v.toFixed(2)} units of excess return for every unit of volatility absorbed, relative to a ${(RISK_FREE_RATE * 100).toFixed(1)}% risk-free rate.`,
  sortino: (v) => `A Sortino ratio of ${v.toFixed(2)} isolates downside volatility only — it suggests the portfolio's risk-adjusted return looks ${v >= 1 ? 'favorable' : 'modest'} once upside swings are excluded from the risk calculation.`,
  beta: (v) => `A beta of ${v.toFixed(2)} suggests this portfolio has historically moved approximately ${Math.abs((v - 1) * 100).toFixed(0)}% ${v >= 1 ? 'more' : 'less'} than the broad market, ${v >= 1 ? 'amplifying' : 'dampening'} both gains and drawdowns during periods of elevated volatility.`,
  drawdown: (v) => `A maximum drawdown of ${Math.abs(v * 100).toFixed(1)}% reflects the largest peak-to-trough decline realized over the analyzed window — the deepest point an investor would have felt this portfolio's losses.`,
  volatility: (v) => `Annualized volatility of ${(v * 100).toFixed(1)}% measures the typical dispersion of daily returns, scaled to a one-year horizon — higher values imply a wider range of plausible short-term outcomes.`,
  concentration: (n) => `An effective holding count of ${n.toFixed(1)} indicates the portfolio's risk behaves as if it were spread across roughly ${Math.round(n)} equally-weighted, uncorrelated positions, regardless of the nominal number of tickers held.`,
};

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

      setProgress(`Fetching benchmark (${BENCHMARK_TICKER})...`);
      const benchmarkRows = await fetchHistory(BENCHMARK_TICKER);
      if (benchmarkRows && benchmarkRows.length >= 30) {
        seriesMap[BENCHMARK_TICKER] = benchmarkRows.slice(-756);
      }
      const hasBenchmark = !!seriesMap[BENCHMARK_TICKER];

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

      const benchmarkReturns = hasBenchmark ? computeReturns(aligned[BENCHMARK_TICKER]) : null;
      let bcum = 1;

      for (let d = 0; d < nDays; d++) {
        cum *= (1 + portfolioReturns[d]);
        runningMax = Math.max(runningMax, cum);
        const dd = (cum - runningMax) / runningMax;
        maxDrawdown = Math.min(maxDrawdown, dd);
        if (hasBenchmark) bcum *= (1 + benchmarkReturns[d]);
        cumSeries.push({ date: dates[d + 1], value: (cum - 1), benchmark: hasBenchmark ? (bcum - 1) : null });
        drawdownSeries.push({ date: dates[d + 1], value: dd });
      }

      const periodReturn = cum - 1;
      const annualizedReturn = Math.pow(cum, 252 / nDays) - 1;
      const sharpe = annualVol > 0 ? (annualizedReturn - RISK_FREE_RATE) / annualVol : null;

      const downside = portfolioReturns.filter(r => r < 0);
      const downsideDev = downside.length > 0 ? Math.sqrt(mean(downside.map(r => r * r))) * Math.sqrt(252) : 0;
      const sortino = downsideDev > 0 ? (annualizedReturn - RISK_FREE_RATE) / downsideDev : null;

      let beta = null, benchmarkPeriodReturn = 0, benchmarkAnnualizedReturn = 0, benchmarkVol = 0, benchmarkSharpe = null;
      if (hasBenchmark) {
        const varB = std(benchmarkReturns) ** 2;
        beta = varB > 0 ? covariance(portfolioReturns, benchmarkReturns) / varB : null;
        benchmarkPeriodReturn = bcum - 1;
        benchmarkAnnualizedReturn = Math.pow(bcum, 252 / nDays) - 1;
        benchmarkVol = std(benchmarkReturns) * Math.sqrt(252);
        benchmarkSharpe = benchmarkVol > 0 ? (benchmarkAnnualizedReturn - RISK_FREE_RATE) / benchmarkVol : null;
      }

      // risk attribution: each holding's contribution to portfolio variance
      const portfolioVariance = std(portfolioReturns) ** 2;
      const holdingsRiskRaw = holdings.map((h, i) => {
        const cov = covariance(tickerReturns[i], portfolioReturns);
        const contribution = weights[i] * cov;
        return { ticker: h.ticker, sector: getSector(h.ticker), riskPct: portfolioVariance > 0 ? contribution / portfolioVariance : 0 };
      });
      const holdingsRisk = [...holdingsRiskRaw].sort((a, b) => b.riskPct - a.riskPct);

      const riskBySectorMap = {};
      holdingsRiskRaw.forEach(h => { riskBySectorMap[h.sector] = (riskBySectorMap[h.sector] || 0) + h.riskPct; });
      const riskBySector = Object.entries(riskBySectorMap)
        .map(([name, pct]) => ({ name, pct }))
        .sort((a, b) => b.pct - a.pct);
      const maxRiskPct = Math.max(...riskBySector.map(s => s.pct), 0.0001);

      const sectorTotals = {};
      holdings.forEach((h, i) => {
        const sector = getSector(h.ticker);
        sectorTotals[sector] = (sectorTotals[sector] || 0) + values[i];
      });
      const sectorData = Object.entries(sectorTotals).map(([name, value]) => ({
        name, value, pct: value / totalValue,
      })).sort((a, b) => b.value - a.value);

      const effectiveSectors = 1 / sectorData.reduce((s, sec) => s + sec.pct ** 2, 0);

      const stressScenarios = HISTORICAL_SCENARIOS.map(s => {
        const estimatedDrawdown = beta !== null ? s.marketShock * beta : s.marketShock;
        return {
          ...s,
          estimatedDrawdown,
          topContributors: riskBySector.slice(0, 2).map(r => r.name),
          confidence: nDays >= 500 ? 'Moderate' : 'Low',
        };
      });

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
        periodReturn, annualizedReturn, sharpe, sortino, beta,
        benchmarkPeriodReturn, benchmarkAnnualizedReturn, benchmarkVol, benchmarkSharpe, hasBenchmark,
        cumSeries, drawdownSeries, sectorData, holdingsTable, holdingsRisk, riskBySector, maxRiskPct,
        effectiveSectors, stressScenarios,
        days: nDays,
      });
    } catch (e) {
      setError(e.message || 'Something went wrong fetching market data.');
    } finally {
      setLoading(false);
      setProgress('');
    }
  };

  const btnGhost = {
    background: 'transparent', border: `1px solid ${C.hairline}`, color: C.dim,
    padding: '11px 22px', borderRadius: 5, fontSize: 11, letterSpacing: '0.12em',
    textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'var(--mono)',
    transition: 'border-color 160ms ease, color 160ms ease',
  };

  const btnPrimary = {
    background: 'transparent', border: `1px solid ${C.accent}`, color: C.accent,
    padding: '11px 22px', borderRadius: 5, fontSize: 11, letterSpacing: '0.12em',
    textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'var(--mono)',
    transition: 'background 160ms ease',
  };

  const intel = results ? buildIntelligence(results) : null;

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', fontFamily: 'var(--body)' }}>
      <div style={{ maxWidth: 1500, margin: '0 auto', padding: '56px 64px 80px' }}>

        {/* ---- masthead ---- */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `1px solid ${C.hairline}`, paddingBottom: 28, marginBottom: results ? 48 : 96 }}>
          <div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 600, letterSpacing: '0.04em' }}>
              ATLAS
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.22em', color: C.accent, textTransform: 'uppercase', marginTop: 4 }}>
              Institutional Portfolio Intelligence
            </div>
          </div>
          {results && (
            <button onClick={() => { setResults(null); setHoldings([]); }} style={btnGhost}>
              ← New Analysis
            </button>
          )}
        </div>

        {/* ---- landing / upload ---- */}
        {!results && (
          <div style={{ maxWidth: 640 }}>
            <p style={{ fontFamily: 'var(--body)', fontSize: 15, color: C.dim, lineHeight: 1.7, marginBottom: 44 }}>
              Volatility, drawdown, Sharpe ratio, and Value-at-Risk — computed from the
              actual price history of your holdings, not a marketing estimate.
            </p>

            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
              <label style={btnPrimary}>
                Upload Portfolio
                <input type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />
              </label>
              <button onClick={loadSample} style={btnGhost}>
                View Demo
              </button>
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: C.dim, marginTop: 14, letterSpacing: '0.03em' }}>
              CSV columns — ticker, shares, cost_basis (optional)
            </div>

            {holdings.length > 0 && (
              <div style={{ marginTop: 40, borderTop: `1px solid ${C.hairline}`, paddingTop: 28 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em', color: C.dim, textTransform: 'uppercase', marginBottom: 14 }}>
                  {holdings.length} Holdings Loaded
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
                  {holdings.map((h, i) => (
                    <span key={i} style={{
                      border: `1px solid ${C.hairline}`, borderRadius: 4,
                      padding: '5px 12px', fontSize: 11.5, fontFamily: 'var(--mono)', color: C.text,
                    }}>{h.ticker} · {h.shares}sh</span>
                  ))}
                </div>
                <button onClick={runAnalysis} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.55 : 1, cursor: loading ? 'wait' : 'pointer' }}>
                  {loading ? (progress || 'Loading...') : 'Run Analysis'}
                </button>
              </div>
            )}

            {error && (
              <div style={{ marginTop: 20, color: C.negative, fontSize: 12.5, fontFamily: 'var(--mono)', borderLeft: `2px solid ${C.negative}`, paddingLeft: 14 }}>
                {error}
              </div>
            )}
          </div>
        )}

        {/* ---- results ---- */}
        {results && (
          <>
            {/* 01 Portfolio Overview */}
            <SectionLabel kicker="01">Portfolio Overview</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(150px, 1fr))', gap: 36, marginBottom: 56 }}>
              <StatBlock label="Portfolio Value" value={fmtUsd(results.totalValue)} />
              <StatBlock
                label="Total Return"
                value={results.totalReturn !== null ? <Pct value={results.totalReturn} showSign /> : '—'}
                valueColor={results.totalReturn > 0 ? C.positive : results.totalReturn < 0 ? C.negative : C.text}
                sub="since cost basis"
              />
              <StatBlock
                label={`Period Return (${results.days}d)`}
                value={<Pct value={results.periodReturn} showSign />}
                valueColor={results.periodReturn > 0 ? C.positive : C.negative}
              />
              <StatBlock label="Annualized Return" value={<Pct value={results.annualizedReturn} showSign />} />
              <StatBlock
                label="Sharpe Ratio"
                value={results.sharpe !== null ? <Num value={results.sharpe} /> : '—'}
                sub="rf = 4.0%"
              />
            </div>

            {/* 02 Morning Brief */}
            <SectionLabel kicker="02">Morning Brief</SectionLabel>
            <Panel style={{ marginBottom: 56 }}>
              <div style={{ display: 'flex', gap: 48, alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', color: C.dim, textTransform: 'uppercase', marginBottom: 10 }}>
                    Portfolio Value
                  </div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 36, fontWeight: 500, color: C.text }}>
                    {fmtUsd(results.totalValue)}
                  </div>
                </div>
                <div style={{ borderLeft: `1px solid ${C.hairline}`, paddingLeft: 40, flex: 1 }}>
                  {intel.brief.map((line, i) => (
                    <p key={i} style={{ fontFamily: 'var(--body)', fontSize: 14.5, color: i === 0 ? C.text : C.dim, lineHeight: 1.8, margin: '0 0 14px' }}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            </Panel>

            {/* 03 Portfolio Observations */}
            <SectionLabel kicker="03">Portfolio Observations</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 36, marginBottom: 56 }}>
              {intel.observations.map((obs, i) => (
                <div key={i} style={{ borderTop: `1px solid ${C.hairline}`, paddingTop: 16 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', color: C.accent, textTransform: 'uppercase', marginBottom: 12 }}>
                    Observation {String(i + 1).padStart(2, '0')}
                  </div>
                  <div style={{ fontFamily: 'var(--body)', fontSize: 13.5, color: C.text, lineHeight: 1.75 }}>
                    {obs}
                  </div>
                </div>
              ))}
            </div>

            {/* 04 Risk Analysis */}
            <SectionLabel kicker="04">Risk Analysis</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1fr) 2fr', gap: 36, marginBottom: 24 }}>
              <Panel style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <VolatilityInstrument value={results.annualVol * 100} />
                <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.6, marginTop: 18, textAlign: 'center', maxWidth: 200 }}>
                  {COMMENTARY.volatility(results.annualVol)}
                </div>
              </Panel>

              <Panel>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', color: C.dim, textTransform: 'uppercase', marginBottom: 20 }}>
                  Value at Risk — 1 Day Horizon
                </div>
                <div style={{ display: 'flex', gap: 56, marginBottom: 22, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 32, color: C.negative, fontWeight: 500 }}>
                      <Pct value={results.var95} decimals={2} color={C.negative} />
                    </div>
                    <div style={{ fontSize: 10.5, color: C.dim, marginTop: 6, fontFamily: 'var(--mono)' }}>95% confidence</div>
                    <div style={{ fontSize: 10.5, color: C.dim, fontFamily: 'var(--mono)' }}>{fmtUsd(results.var95 * results.totalValue)} exposed</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 32, color: C.negative, fontWeight: 500 }}>
                      <Pct value={results.var99} decimals={2} color={C.negative} />
                    </div>
                    <div style={{ fontSize: 10.5, color: C.dim, marginTop: 6, fontFamily: 'var(--mono)' }}>99% confidence</div>
                    <div style={{ fontSize: 10.5, color: C.dim, fontFamily: 'var(--mono)' }}>{fmtUsd(results.var99 * results.totalValue)} exposed</div>
                  </div>
                  <div style={{ borderLeft: `1px solid ${C.hairline}`, paddingLeft: 28 }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 32, color: C.negative, fontWeight: 500 }}>
                      <Pct value={results.maxDrawdown} decimals={2} color={C.negative} />
                    </div>
                    <div style={{ fontSize: 10.5, color: C.dim, marginTop: 6, fontFamily: 'var(--mono)' }}>max drawdown</div>
                    <div style={{ fontSize: 10.5, color: C.dim, fontFamily: 'var(--mono)' }}>trailing {results.days}d</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.7, maxWidth: 560 }}>
                  {COMMENTARY.drawdown(results.maxDrawdown)}
                </div>
              </Panel>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 36, marginBottom: 56 }}>
              <Panel>
                <StatBlock
                  label="Beta"
                  value={results.beta !== null ? <Num value={results.beta} /> : '—'}
                  sub="vs S&P 500"
                  note={results.beta !== null ? COMMENTARY.beta(results.beta) : 'Benchmark data unavailable.'}
                />
              </Panel>
              <Panel>
                <StatBlock
                  label="Sortino Ratio"
                  value={results.sortino !== null ? <Num value={results.sortino} /> : '—'}
                  sub="downside risk only"
                  note={results.sortino !== null ? COMMENTARY.sortino(results.sortino) : 'Insufficient downside observations.'}
                />
              </Panel>
              <Panel>
                <StatBlock
                  label="Effective Holdings"
                  value={<Num value={results.effectiveSectors} decimals={1} />}
                  sub="sector-weighted"
                  note={COMMENTARY.concentration(results.effectiveSectors)}
                />
              </Panel>
            </div>

            {/* 05 Performance */}
            <SectionLabel kicker="05">Performance</SectionLabel>
            <Panel style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', color: C.dim, textTransform: 'uppercase' }}>
                  Cumulative Return
                </div>
                {results.hasBenchmark && (
                  <div style={{ display: 'flex', gap: 16, fontFamily: 'var(--mono)', fontSize: 10, color: C.dim }}>
                    <span><span style={{ display: 'inline-block', width: 8, height: 2, background: C.accent, marginRight: 6, verticalAlign: 'middle' }} />Portfolio</span>
                    <span><span style={{ display: 'inline-block', width: 8, height: 2, background: C.dim, marginRight: 6, verticalAlign: 'middle' }} />S&P 500</span>
                  </div>
                )}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={results.cumSeries}>
                  <defs>
                    <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.accent} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={C.hairlineFaint} strokeDasharray="0" vertical={false} />
                  <XAxis dataKey="date" hide />
                  <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} stroke={C.dim} fontSize={10} width={44} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: C.surface2, border: `1px solid ${C.hairline}`, fontSize: 11, fontFamily: 'var(--mono)' }}
                    formatter={(v, n) => [`${(v * 100).toFixed(2)}%`, n === 'benchmark' ? 'S&P 500' : 'Portfolio']}
                  />
                  <Area type="monotone" dataKey="value" stroke={C.accent} strokeWidth={1.25} fill="url(#cumGrad)" />
                  {results.hasBenchmark && (
                    <Line type="monotone" dataKey="benchmark" stroke={C.dim} strokeWidth={1} strokeDasharray="3 3" dot={false} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </Panel>

            <Panel style={{ marginBottom: 56 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', color: C.dim, textTransform: 'uppercase', marginBottom: 18 }}>
                Drawdown
              </div>
              <ResponsiveContainer width="100%" height={130}>
                <AreaChart data={results.drawdownSeries}>
                  <defs>
                    <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.negative} stopOpacity={0.04} />
                      <stop offset="100%" stopColor={C.negative} stopOpacity={0.35} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={C.hairlineFaint} strokeDasharray="0" vertical={false} />
                  <XAxis dataKey="date" hide />
                  <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} stroke={C.dim} fontSize={10} width={44} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: C.surface2, border: `1px solid ${C.hairline}`, fontSize: 11, fontFamily: 'var(--mono)' }}
                    formatter={(v) => [`${(v * 100).toFixed(2)}%`, 'Drawdown']}
                  />
                  <Area type="monotone" dataKey="value" stroke={C.negative} strokeWidth={1.25} fill="url(#ddGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>

            {/* 06 Allocation */}
            <SectionLabel kicker="06">Allocation</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 36, marginBottom: 56 }}>
              <Panel>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', color: C.dim, textTransform: 'uppercase', marginBottom: 18 }}>
                  Capital Allocation
                </div>
                <ResponsiveContainer width="100%" height={170}>
                  <PieChart>
                    <Pie data={results.sectorData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={1.5} stroke={C.bg} strokeWidth={1}>
                      {results.sectorData.map((_, i) => <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: C.surface2, border: `1px solid ${C.hairline}`, fontSize: 11, fontFamily: 'var(--mono)' }}
                      formatter={(v, n, p) => [`${(p.payload.pct * 100).toFixed(1)}%`, p.payload.name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
                  {results.sectorData.map((s, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.dim, fontFamily: 'var(--mono)' }}>
                      <span><span style={{ display: 'inline-block', width: 6, height: 6, background: SECTOR_COLORS[i % SECTOR_COLORS.length], borderRadius: 1, marginRight: 8 }} />{s.name}</span>
                      <span style={{ color: C.text }}>{(s.pct * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', color: C.dim, textTransform: 'uppercase', marginBottom: 18 }}>
                  Portfolio Risk Contribution
                </div>
                {results.riskBySector.map((s, i) => (
                  <RiskBar key={i} name={s.name} pct={s.pct} max={results.maxRiskPct} />
                ))}
                <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.6, marginTop: 16 }}>
                  Risk contribution reflects each sector's share of total portfolio variance — not its share of capital. A sector can dominate risk while remaining a minority position.
                </div>
              </Panel>
            </div>

            {/* 07 Holdings */}
            <SectionLabel kicker="07">Holdings</SectionLabel>
            <Panel style={{ padding: 0, marginBottom: 56 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ color: C.dim, textAlign: 'left', borderBottom: `1px solid ${C.hairline}` }}>
                    <th style={{ padding: '14px 24px', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', fontWeight: 400 }}>TICKER</th>
                    <th style={{ padding: '14px 24px', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', fontWeight: 400 }}>SHARES</th>
                    <th style={{ padding: '14px 24px', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', fontWeight: 400 }}>PRICE</th>
                    <th style={{ padding: '14px 24px', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', fontWeight: 400 }}>VALUE</th>
                    <th style={{ padding: '14px 24px', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', fontWeight: 400 }}>WEIGHT</th>
                    <th style={{ padding: '14px 24px', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.1em', fontWeight: 400 }}>GAIN / LOSS</th>
                  </tr>
                </thead>
                <tbody>
                  {results.holdingsTable.map((h, i) => (
                    <tr key={i} style={{ borderBottom: i === results.holdingsTable.length - 1 ? 'none' : `1px solid ${C.hairlineFaint}` }}>
                      <td style={{ padding: '13px 24px', color: C.text, fontFamily: 'var(--mono)', fontWeight: 500 }}>{h.ticker}</td>
                      <td style={{ padding: '13px 24px', color: C.dim, fontFamily: 'var(--mono)' }}>{h.shares}</td>
                      <td style={{ padding: '13px 24px', color: C.dim, fontFamily: 'var(--mono)' }}>${h.price.toFixed(2)}</td>
                      <td style={{ padding: '13px 24px', color: C.text, fontFamily: 'var(--mono)' }}>{fmtUsd(h.value)}</td>
                      <td style={{ padding: '13px 24px', color: C.dim, fontFamily: 'var(--mono)' }}>{(h.weight * 100).toFixed(1)}%</td>
                      <td style={{ padding: '13px 24px', fontFamily: 'var(--mono)' }}>
                        {h.gain === null ? <span style={{ color: C.dim }}>—</span> : <Pct value={h.gain} showSign color={h.gain >= 0 ? C.positive : C.negative} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>

            {/* 08 Stress Testing */}
            <SectionLabel kicker="08">Stress Testing</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, marginBottom: 12 }}>
              {results.stressScenarios.map((s, i) => (
                <Panel key={i}>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 500, color: C.text, marginBottom: 16 }}>
                    {s.name}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', color: C.dim, textTransform: 'uppercase', marginBottom: 4 }}>
                    Expected Drawdown
                  </div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 26, color: C.negative, fontWeight: 500, marginBottom: 14 }}>
                    <Pct value={s.estimatedDrawdown} decimals={1} color={C.negative} />
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.12em', color: C.dim, textTransform: 'uppercase', marginBottom: 4 }}>
                    Largest Contributors
                  </div>
                  <div style={{ fontSize: 12, color: C.text, marginBottom: 14 }}>
                    {s.topContributors.join(', ')}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.dim, fontFamily: 'var(--mono)', borderTop: `1px solid ${C.hairlineFaint}`, paddingTop: 12 }}>
                    <span>Recovery: {s.recoveryMonths}mo</span>
                    <span>{s.confidence}</span>
                  </div>
                </Panel>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.6, marginBottom: 56 }}>
              Estimates are beta-adjusted projections derived from historical market-level shocks and this portfolio's measured sensitivity to the S&P 500 — not a literal replay of historical holding-level performance.
            </div>

            {/* 09 Commentary */}
            <SectionLabel kicker="09">Commentary</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 32, marginBottom: 24 }}>
              {[
                { label: 'Sharpe Ratio', text: results.sharpe !== null ? COMMENTARY.sharpe(results.sharpe) : null },
                { label: 'Sortino Ratio', text: results.sortino !== null ? COMMENTARY.sortino(results.sortino) : null },
                { label: 'Beta', text: results.beta !== null ? COMMENTARY.beta(results.beta) : null },
                { label: 'Maximum Drawdown', text: COMMENTARY.drawdown(results.maxDrawdown) },
                { label: 'Annualized Volatility', text: COMMENTARY.volatility(results.annualVol) },
                { label: 'Concentration', text: COMMENTARY.concentration(results.effectiveSectors) },
              ].filter(c => c.text).map((c, i) => (
                <div key={i} style={{ borderTop: `1px solid ${C.hairline}`, paddingTop: 14 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.14em', color: C.dim, textTransform: 'uppercase', marginBottom: 8 }}>
                    {c.label}
                  </div>
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>
                    {c.text}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
