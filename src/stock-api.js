/**
 * Spatial Wealth - Modular Finnhub Real-Time Stock & Crypto API Service
 * Supports REST Search, OHLC Historical Bars & Live WebSocket Streaming with Fallback Engine.
 */

// Default Finnhub API Key (can be customized via setFinnhubApiKey or localStorage)
let FINNHUB_API_KEY = localStorage.getItem('spatial_finnhub_key') || 'sandbox_c890123456789abcdef';

export function getFinnhubApiKey() {
  return FINNHUB_API_KEY;
}

export function setFinnhubApiKey(key) {
  if (key && typeof key === 'string') {
    FINNHUB_API_KEY = key.trim();
    localStorage.setItem('spatial_finnhub_key', FINNHUB_API_KEY);
  }
}

// Curated Popular Market Instruments for Quick Search & Instant Fallback
export const POPULAR_TICKERS = [
  { symbol: 'NVDA', name: 'NVIDIA Corporation', category: 'Equities', basePrice: 128.5, returns: 48.2, volatility: 'HIGH', type: 'Common Stock', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'AAPL', name: 'Apple Inc.', category: 'Equities', basePrice: 232.1, returns: 18.4, volatility: 'MEDIUM', type: 'Common Stock', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', category: 'Equities', basePrice: 448.2, returns: 24.6, volatility: 'LOW', type: 'Common Stock', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'TSLA', name: 'Tesla Inc.', category: 'Equities', basePrice: 254.6, returns: -8.2, volatility: 'HIGH', type: 'Common Stock', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'BTC', name: 'Bitcoin (BINANCE:BTCUSDT)', category: 'Crypto & Web3', basePrice: 64280.0, returns: 62.5, volatility: 'HIGH', type: 'Cryptocurrency', currency: 'USD', exchange: 'BINANCE' },
  { symbol: 'ETH', name: 'Ethereum (BINANCE:ETHUSDT)', category: 'Crypto & Web3', basePrice: 3490.0, returns: 42.0, volatility: 'HIGH', type: 'Cryptocurrency', currency: 'USD', exchange: 'BINANCE' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', category: 'Equities', basePrice: 188.4, returns: 22.8, volatility: 'MEDIUM', type: 'Common Stock', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', category: 'Index Funds', basePrice: 560.2, returns: 16.5, volatility: 'LOW', type: 'ETF', currency: 'USD', exchange: 'NYSE' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', category: 'Equities', basePrice: 178.6, returns: 21.4, volatility: 'MEDIUM', type: 'Common Stock', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'META', name: 'Meta Platforms Inc.', category: 'Equities', basePrice: 520.1, returns: 38.5, volatility: 'HIGH', type: 'Common Stock', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'AMD', name: 'Advanced Micro Devices', category: 'Equities', basePrice: 162.8, returns: 31.2, volatility: 'HIGH', type: 'Common Stock', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'COIN', name: 'Coinbase Global Inc.', category: 'Crypto & Web3', basePrice: 220.5, returns: 54.0, volatility: 'HIGH', type: 'Common Stock', currency: 'USD', exchange: 'NASDAQ' },
  { symbol: 'PLTR', name: 'Palantir Technologies', category: 'Equities', basePrice: 34.8, returns: 75.4, volatility: 'HIGH', type: 'Common Stock', currency: 'USD', exchange: 'NYSE' },
  // Indian Equities & Indices (NSE / BSE)
  { symbol: 'RELIANCE', name: 'Reliance Industries', category: 'Equities', basePrice: 2980.50, returns: 28.5, volatility: 'MEDIUM', type: 'Common Stock', currency: 'INR', exchange: 'NSE' },
  { symbol: 'TCS', name: 'Tata Consultancy Services', category: 'Equities', basePrice: 4210.00, returns: 22.4, volatility: 'LOW', type: 'Common Stock', currency: 'INR', exchange: 'NSE' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', category: 'Equities', basePrice: 1640.25, returns: 18.2, volatility: 'LOW', type: 'Common Stock', currency: 'INR', exchange: 'NSE' },
  { symbol: 'INFY', name: 'Infosys Ltd', category: 'Equities', basePrice: 1890.75, returns: 24.8, volatility: 'MEDIUM', type: 'Common Stock', currency: 'INR', exchange: 'NSE' },
  { symbol: 'NIFTY50', name: 'NIFTY 50 Index', category: 'Index Funds', basePrice: 25150.00, returns: 16.5, volatility: 'LOW', type: 'Index', currency: 'INR', exchange: 'NSE' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', category: 'Equities', basePrice: 1080.30, returns: 52.0, volatility: 'HIGH', type: 'Common Stock', currency: 'INR', exchange: 'NSE' }
];

/**
 * Searches ticker suggestions from Finnhub with instant local fallback filter.
 * @param {string} query Search input string
 * @returns {Promise<Array<{ symbol: string, description: string, type: string, displaySymbol: string, currency?: string, exchange?: string }>>}
 */
export async function searchTickers(query) {
  if (!query || query.trim().length === 0) return [];
  const q = query.trim().toUpperCase();

  // 1. First search local curated quick list
  const localMatches = POPULAR_TICKERS.filter(
    (item) => item.symbol.toUpperCase().includes(q) || item.name.toUpperCase().includes(q)
  ).map((item) => ({
    symbol: item.symbol,
    displaySymbol: item.symbol,
    description: item.name,
    type: item.type || item.category,
    currency: item.currency || 'USD',
    exchange: item.exchange || '',
    isCurated: true
  }));

  // 2. Query Finnhub REST API if network is available
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const url = `https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${FINNHUB_API_KEY}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.result)) {
        const apiMatches = data.result
          .filter((item) => item.symbol && !item.symbol.includes('.')) // clean primary symbols
          .slice(0, 8)
          .map((item) => ({
            symbol: item.symbol,
            displaySymbol: item.displaySymbol || item.symbol,
            description: item.description || item.symbol,
            type: item.type || 'Stock',
            currency: 'USD',
            exchange: '',
            isCurated: false
          }));

        // Merge and deduplicate by symbol
        const merged = [...localMatches];
        apiMatches.forEach((apiItem) => {
          if (!merged.some((m) => m.symbol.toUpperCase() === apiItem.symbol.toUpperCase())) {
            merged.push(apiItem);
          }
        });
        return merged.slice(0, 10);
      }
    }
  } catch (err) {
    // Graceful fallback to local matches
  }

  return localMatches.length > 0 ? localMatches : [
    { symbol: q, displaySymbol: q, description: `${q} Holding`, type: 'Asset', currency: 'USD', exchange: '', isCurated: false }
  ];
}

import { RESOLUTION_PRESETS } from './charts.js';

/**
 * Generates realistic synthetic OHLC candles tailored for a given symbol and resolution preset.
 */
function generateSyntheticCandles(symbol, count = 36, presetId = '1Y_1d') {
  const preset = RESOLUTION_PRESETS.find((p) => p.id === presetId) || RESOLUTION_PRESETS[6];
  const meta = POPULAR_TICKERS.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase()) || {
    symbol,
    name: symbol,
    basePrice: 150.0,
    returns: 12.5,
    volatility: 'MEDIUM'
  };

  const basePrice = meta.basePrice || 150.0;
  const returnVal = meta.returns || 10.0;

  let effectiveReturn = returnVal;
  if (preset.id === '1D_1m') effectiveReturn = returnVal * 0.04 + (Math.random() - 0.48) * 1.8;
  else if (preset.id === '5D_5m') effectiveReturn = returnVal * 0.12 + (Math.random() - 0.48) * 3.5;
  else if (preset.id === '1M_30m') effectiveReturn = returnVal * 0.30 + (Math.random() - 0.48) * 6.0;
  else if (preset.id === '3M_1h') effectiveReturn = returnVal * 0.55;
  else if (preset.id === '6M_2h') effectiveReturn = returnVal * 0.75;
  else if (preset.id === '5Y_1w') effectiveReturn = returnVal * 2.8;
  else if (preset.id === 'ALL_1M') effectiveReturn = returnVal * 4.5;

  const targetEndPrice = basePrice * (1 + effectiveReturn / 100);
  const drift = (targetEndPrice - basePrice) / (count - 1);
  const isVolHigh = (meta.volatility || '').toUpperCase() === 'HIGH';
  const volMult = isVolHigh ? 0.045 : (meta.volatility || '').toUpperCase() === 'LOW' ? 0.015 : 0.028;

  const candles = [];
  let currentPrice = basePrice;
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < count; i++) {
    const expected = basePrice + drift * i;
    const wave = Math.sin(i * 1.4 + effectiveReturn * 0.08) * 0.6 + Math.cos(i * 3.1) * 0.4;
    const noise = (wave + (Math.random() - 0.48) * 1.5) * (basePrice * volMult);

    let close = i === count - 1 ? targetEndPrice : Math.max(basePrice * 0.2, expected + noise);
    if (Math.abs(close - currentPrice) < basePrice * 0.005) {
      close += (Math.random() > 0.5 ? 1 : -1) * basePrice * 0.012;
    }

    const open = currentPrice;
    const spread = Math.abs(noise) * (0.35 + Math.random() * 0.7) + basePrice * 0.008;
    const high = Math.max(open, close) + spread;
    const low = Math.max(basePrice * 0.15, Math.min(open, close) - spread);
    const isBullish = close >= open;

    const baseVol = 45000 + Math.random() * 80000;
    const volSpike = (Math.abs(close - open) / (basePrice * volMult || 1)) * 35000;
    const volume = Math.round(baseVol + volSpike);

    candles.push({
      index: i,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
      timestamp: now - (count - 1 - i) * 3600,
      isBullish
    });

    currentPrice = close;
  }

  const minP = Math.min(...candles.map((c) => c.low));
  const maxP = Math.max(...candles.map((c) => c.high));
  const latestPrice = candles[candles.length - 1].close;
  const firstPrice = candles[0].open;
  const change = latestPrice - firstPrice;
  const changePercent = Math.round((change / firstPrice) * 10000) / 100;

  const currency = meta.currency || (meta.exchange === 'NSE' || meta.exchange === 'BSE' ? 'INR' : 'USD');
  const exchange = meta.exchange || '';

  return {
    symbol: meta.symbol,
    name: meta.name || symbol,
    category: meta.category || 'Equities',
    currency,
    exchange,
    presetId: preset.id,
    interval: preset.interval,
    candles,
    minP,
    maxP,
    range: maxP - minP || 1,
    latestPrice,
    change,
    changePercent,
    isSynthetic: true
  };
}

/**
 * Fetches OHLC historical bars from Finnhub tailored to TradingView resolution preset, or generates realistic fallback.
 * @param {string} symbol Ticker symbol (e.g. 'NVDA', 'AAPL', 'BTC', 'RELIANCE')
 * @param {string} resolution Bar resolution ('D', 'W', '60', etc.)
 * @param {number} days Lookback range in days
 * @param {string} presetId Resolution preset id ('1D_1m', '5D_5m', etc.)
 * @returns {Promise<Object>} Formatted candle package
 */
export async function fetchStockCandles(symbol, resolution = 'D', days = 60, presetId = '1Y_1d') {
  const sym = (symbol || 'NVDA').toUpperCase().trim();
  const preset = RESOLUTION_PRESETS.find((p) => p.id === presetId) || RESOLUTION_PRESETS[6];

  let effectiveDays = typeof days === 'number' ? days : 60;
  if (preset.rangeDays === 'YTD') {
    effectiveDays = Math.max(1, Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86400000));
  } else if (preset.rangeDays === 'ALL') {
    effectiveDays = 3650;
  } else if (typeof preset.rangeDays === 'number') {
    effectiveDays = preset.rangeDays;
  }

  const queryRes = preset.finnhubRes || resolution || 'D';
  const targetCount = preset.candleCount || 36;

  const to = Math.floor(Date.now() / 1000);
  const from = to - effectiveDays * 86400;

  // Format Crypto symbols for Finnhub (e.g. BTC -> BINANCE:BTCUSDT)
  let querySymbol = sym;
  if (sym === 'BTC' || sym === 'BTCUSD') querySymbol = 'BINANCE:BTCUSDT';
  else if (sym === 'ETH' || sym === 'ETHUSD') querySymbol = 'BINANCE:ETHUSDT';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${querySymbol}&resolution=${queryRes}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && data.s === 'ok' && Array.isArray(data.c) && data.c.length > 0) {
        const rawCount = data.c.length;
        const step = Math.max(1, Math.floor(rawCount / targetCount));
        const sampledIndices = [];
        for (let i = 0; i < rawCount; i += step) {
          sampledIndices.push(i);
          if (sampledIndices.length >= targetCount) break;
        }
        if (sampledIndices[sampledIndices.length - 1] !== rawCount - 1) {
          sampledIndices[sampledIndices.length - 1] = rawCount - 1;
        }

        const candles = sampledIndices.map((idx, i) => {
          const open = data.o[idx];
          const high = data.h[idx];
          const low = data.l[idx];
          const close = data.c[idx];
          const volume = data.v ? data.v[idx] : 10000;
          const timestamp = data.t ? data.t[idx] : to - (targetCount - 1 - i) * 86400;

          return {
            index: i,
            open: Math.round(open * 100) / 100,
            high: Math.round(high * 100) / 100,
            low: Math.round(low * 100) / 100,
            close: Math.round(close * 100) / 100,
            volume,
            timestamp,
            isBullish: close >= open
          };
        });

        const minP = Math.min(...candles.map((c) => c.low));
        const maxP = Math.max(...candles.map((c) => c.high));
        const latestPrice = candles[candles.length - 1].close;
        const firstPrice = candles[0].open;
        const change = latestPrice - firstPrice;
        const changePercent = Math.round((change / firstPrice) * 10000) / 100;

        const knownMeta = POPULAR_TICKERS.find((t) => t.symbol.toUpperCase() === sym) || {};
        const currency = knownMeta.currency || (knownMeta.exchange === 'NSE' || knownMeta.exchange === 'BSE' ? 'INR' : 'USD');
        const exchange = knownMeta.exchange || '';

        return {
          symbol: sym,
          name: knownMeta.name || sym,
          category: knownMeta.category || 'Equities',
          currency,
          exchange,
          presetId: preset.id,
          interval: preset.interval,
          candles,
          minP,
          maxP,
          range: maxP - minP || 1,
          latestPrice,
          change,
          changePercent,
          isSynthetic: false
        };
      }
    }
  } catch (err) {
    // API or network failure -> Fallback to synthetic
  }

  // Fallback to high-fidelity synthetic candles
  return generateSyntheticCandles(sym, targetCount, preset.id);
}

/**
 * Subscribes to real-time live trade ticks via Finnhub WebSocket with continuous fallback heartbeat.
 * @param {string} symbol Ticker symbol to stream
 * @param {Function} onTick Callback receiving { price, volume, timestamp, symbol, isUp, currency, exchange }
 * @returns {Function} Unsubscribe function
 */
export function subscribeLiveTicks(symbol, onTick) {
  if (!symbol || !onTick) return () => {};
  const sym = symbol.toUpperCase().trim();

  let wsSymbol = sym;
  if (sym === 'BTC' || sym === 'BTCUSD') wsSymbol = 'BINANCE:BTCUSDT';
  else if (sym === 'ETH' || sym === 'ETHUSD') wsSymbol = 'BINANCE:ETHUSDT';

  let ws = null;
  let isClosed = false;
  let lastPrice = null;
  let fallbackTimer = null;
  let lastWsMsgTime = Date.now();

  try {
    ws = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`);

    ws.onopen = () => {
      if (!isClosed && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'subscribe', symbol: wsSymbol }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'trade' && Array.isArray(msg.data) && msg.data.length > 0) {
          lastWsMsgTime = Date.now();
          const latestTrade = msg.data[msg.data.length - 1];
          const price = Math.round(latestTrade.p * 100) / 100;
          const volume = latestTrade.v || 100;
          const isUp = lastPrice !== null ? price >= lastPrice : true;
          lastPrice = price;

          const known = POPULAR_TICKERS.find((t) => t.symbol.toUpperCase() === sym);
          onTick({
            symbol: sym,
            price,
            currency: known?.currency || 'USD',
            exchange: known?.exchange || '',
            volume,
            timestamp: latestTrade.t || Date.now(),
            isUp,
            source: 'finnhub_ws'
          });
        }
      } catch (err) {
        // Parse error ignore
      }
    };

    ws.onerror = () => {
      // WS error will trigger fallback
    };
  } catch (err) {
    // Connection error
  }

  // Adaptive simulated trade tick generator if WebSocket is quiet or offline
  const scheduleFallbackTick = () => {
    if (isClosed) return;
    const interval = 2400 + Math.random() * 2600; // 2.4s to 5.0s
    fallbackTimer = setTimeout(() => {
      if (isClosed) return;
      // Only fire fallback if WS hasn't sent a tick in the last 4 seconds
      if (Date.now() - lastWsMsgTime > 3800) {
        const known = POPULAR_TICKERS.find((t) => t.symbol.toUpperCase() === sym);
        const refPrice = lastPrice || known?.basePrice || 150.0;
        const deltaPct = (Math.random() - 0.49) * 0.0035; // +/- 0.35%
        const newPrice = Math.round(Math.max(refPrice * 0.5, refPrice * (1 + deltaPct)) * 100) / 100;
        const isUp = newPrice >= refPrice;
        lastPrice = newPrice;

        onTick({
          symbol: sym,
          price: newPrice,
          currency: known?.currency || (known?.exchange === 'NSE' || known?.exchange === 'BSE' ? 'INR' : 'USD'),
          exchange: known?.exchange || '',
          volume: Math.round(250 + Math.random() * 1500),
          timestamp: Date.now(),
          isUp,
          source: 'heartbeat_stream'
        });
      }
      scheduleFallbackTick();
    }, interval);
  };

  scheduleFallbackTick();

  // Return unsubscribe handler
  return () => {
    isClosed = true;
    if (fallbackTimer) clearTimeout(fallbackTimer);
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'unsubscribe', symbol: wsSymbol }));
        } catch (e) {}
      }
      try {
        ws.close();
      } catch (e) {}
    }
  };
}
