/**
 * Spatial Wealth - 3D Financial Portfolio & Budget Visualizer
 * Real Diversified Institutional Portfolio Data & Dynamic State Engine
 */

export const CATEGORY_COLORS = {
  'Equities': '#00f0ff',
  'Index Funds': '#8b5cf6',
  'Fixed Income': '#f59e0b',
  'Liquid Cash': '#38bdf8',
  'Crypto & Web3': '#ec4899',
  'Commodities': '#eab308',
  'Real Estate': '#10b981'
};

// Budget Cash-Flow Inflow Stream Metrics ($6,420 / mo total)
export const monthlyIncome = 6420;
export const monthlyExpense = 3850;
export const netMonthlyFlow = 2570; // $6,420 - $3,850

export const cashFlowStreams = [
  {
    id: 'stream-active',
    name: 'Active Income',
    ticker: 'SALARY',
    category: 'Liquid Cash',
    rate: 4200,
    formattedRate: '+$4,200/mo',
    color: '#10b981', // Emerald Green
    description: 'Direct deposits, executive salary, consulting, and operating revenue.'
  },
  {
    id: 'stream-dividends',
    name: 'Dividend Yield',
    ticker: 'DIVIDENDS',
    category: 'Equities',
    rate: 1420,
    formattedRate: '+$1,420/mo',
    color: '#06b6d4', // Cyan
    description: 'Quarterly dividends & distributions from S&P 500 ETF and tech equities.'
  },
  {
    id: 'stream-staking',
    name: 'Staking Rewards',
    ticker: 'STAKING',
    category: 'Crypto & Web3',
    rate: 800,
    formattedRate: '+$800/mo',
    color: '#f59e0b', // Amber
    description: 'Proof-of-Stake validator node yields, DeFi lending, and Web3 staking APY.'
  }
];

export const expenseStreams = [
  {
    id: 'expense-housing',
    name: 'Housing & Rent',
    ticker: 'RENT/MORTGAGE',
    category: 'Real Estate',
    rate: 1800,
    formattedRate: '-$1,800/mo',
    color: '#ef4444', // Crimson Red
    description: 'Primary luxury residence lease, property taxes, HOA & insurance.'
  },
  {
    id: 'expense-living',
    name: 'Living & Food',
    ticker: 'LIVING/GROCERY',
    category: 'Liquid Cash',
    rate: 950,
    formattedRate: '-$950/mo',
    color: '#f97316', // Coral Orange
    description: 'Organic groceries, dining, utilities, wellness & transit.'
  },
  {
    id: 'expense-tech',
    name: 'Tech & Subscriptions',
    ticker: 'SAAS/INFRA',
    category: 'Equities',
    rate: 500,
    formattedRate: '-$500/mo',
    color: '#ec4899', // Hot Magenta
    description: 'Cloud compute instances, Bloomberg Terminal, AI API credits & fiber.'
  },
  {
    id: 'expense-leisure',
    name: 'Discretionary & Leisure',
    ticker: 'LEISURE/TRAVEL',
    category: 'Commodities',
    rate: 600,
    formattedRate: '-$600/mo',
    color: '#8b5cf6', // Violet
    description: 'Travel flights, tech gadgets, entertainment & experimental investments.'
  }
];

export const CASH_FLOW_DATA = {
  monthlyIncome,
  monthlyExpense,
  netMonthlyFlow,
  formattedMonthlyIncome: '+$6,420 / mo',
  formattedMonthlyExpense: '-$3,850 / mo',
  formattedNetMonthlyFlow: '+$2,570 / mo',
  cashFlowStreams,
  expenseStreams
};



// Institutional Real-World Asset List ($1,245,000 Total, 100% Allocation)
export const INSTITUTIONAL_PORTFOLIO = [
  {
    id: 'eq-ivv',
    name: 'S&P 500 Index Fund',
    ticker: 'IVV',
    category: 'Equities',
    value: 435750,
    allocation: 35,
    returns: 21.0,
    volatility: 'medium',
    color: '#00f0ff',
    description: 'iShares Core S&P 500 ETF tracking top US large-cap corporations across all market sectors.',
    metrics: { sharpe: 1.95, dividendYield: '1.45%', beta: 1.00 }
  },
  {
    id: 'eq-nvda',
    name: 'NVIDIA Corp',
    ticker: 'NVDA',
    category: 'Equities',
    value: 161850,
    allocation: 13,
    returns: 188.0,
    volatility: 'high',
    color: '#10b981',
    description: 'Global compute leader in accelerated AI GPU accelerators, data center systems, and CUDA platforms.',
    metrics: { sharpe: 2.85, dividendYield: '0.08%', beta: 1.72 }
  },
  {
    id: 'eq-msft',
    name: 'Microsoft Corp',
    ticker: 'MSFT',
    category: 'Equities',
    value: 124500,
    allocation: 10,
    returns: 26.0,
    volatility: 'medium',
    color: '#38bdf8',
    description: 'Enterprise software, Azure cloud computing platform, OpenAI strategic partnership, and enterprise AI.',
    metrics: { sharpe: 2.10, dividendYield: '0.72%', beta: 1.15 }
  },
  {
    id: 'fi-tlt',
    name: 'US Treasury 20+ Year Bond',
    ticker: 'TLT',
    category: 'Fixed Income',
    value: 186750,
    allocation: 15,
    returns: -1.5,
    volatility: 'low',
    color: '#f59e0b',
    description: 'iShares 20+ Year Treasury Bond ETF offering long-duration sovereign government yield and deflation hedging.',
    metrics: { sharpe: 0.85, dividendYield: '4.65%', beta: 0.22 }
  },
  {
    id: 'fi-bnd',
    name: 'Vanguard Total Bond Market',
    ticker: 'BND',
    category: 'Fixed Income',
    value: 174300,
    allocation: 14,
    returns: 3.0,
    volatility: 'low',
    color: '#fbbf24',
    description: 'Broadly diversified investment-grade US bond market ETF spanning sovereign and corporate credit.',
    metrics: { sharpe: 1.25, dividendYield: '4.35%', beta: 0.15 }
  },
  {
    id: 'alt-btc',
    name: 'Bitcoin Digital Asset',
    ticker: 'BTC',
    category: 'Crypto & Web3',
    value: 74700,
    allocation: 6,
    returns: 120.0,
    volatility: 'high',
    color: '#ec4899',
    description: 'Decentralized digital store of value and macro monetary inflation hedge with fixed 21M supply.',
    metrics: { sharpe: 2.45, dividendYield: '0.00%', beta: 1.85 }
  },
  {
    id: 'alt-eth',
    name: 'Ethereum Network',
    ticker: 'ETH',
    category: 'Crypto & Web3',
    value: 24900,
    allocation: 2,
    returns: 72.0,
    volatility: 'high',
    color: '#8b5cf6',
    description: 'Global decentralized smart contract settlement layer generating proof-of-stake validator yield.',
    metrics: { sharpe: 2.15, dividendYield: '3.40%', beta: 1.95 }
  },
  {
    id: 'cash-usd',
    name: 'USD Cash & Treasury Yield',
    ticker: 'USD',
    category: 'Liquid Cash',
    value: 62250,
    allocation: 5,
    returns: 0.0,
    volatility: 'low',
    color: '#64748b',
    description: 'High-yield money market cash reserve and overnight Treasury repo facility for immediate spatial liquidity.',
    metrics: { sharpe: 3.50, dividendYield: '5.20%', beta: 0.00 }
  }
];

export const PRESET_PROFILES = {
  'institutional': {
    name: 'Institutional Balanced Core',
    description: 'Diversified institutional allocation across US Equities (58%), Fixed Income (29%), Crypto (8%), and Cash (5%).',
    assets: INSTITUTIONAL_PORTFOLIO
  },
  'tech-growth': {
    name: 'Aggressive Tech & AI Growth',
    description: 'Heavy tilt into semiconductor pioneers, large-cap software, and digital infrastructure.',
    assets: [
      { id: 'eq-nvda', name: 'NVIDIA Corp', ticker: 'NVDA', category: 'Equities', value: 450000, returns: 188.0, volatility: 'high', color: '#10b981' },
      { id: 'eq-msft', name: 'Microsoft Corp', ticker: 'MSFT', category: 'Equities', value: 350000, returns: 26.0, volatility: 'medium', color: '#38bdf8' },
      { id: 'eq-ivv', name: 'S&P 500 Index', ticker: 'IVV', category: 'Equities', value: 250000, returns: 21.0, volatility: 'medium', color: '#00f0ff' },
      { id: 'alt-btc', name: 'Bitcoin', ticker: 'BTC', category: 'Crypto & Web3', value: 120000, returns: 120.0, volatility: 'high', color: '#ec4899' },
      { id: 'cash-usd', name: 'USD Yield', ticker: 'USD', category: 'Liquid Cash', value: 75000, returns: 5.0, volatility: 'low', color: '#64748b' }
    ]
  },
  'fixed-income': {
    name: 'Capital Preservation & Income',
    description: 'Preservation-first posture with high-coupon Treasuries, corporate bonds, and index baseline.',
    assets: [
      { id: 'fi-tlt', name: 'US Treasury 20Y', ticker: 'TLT', category: 'Fixed Income', value: 500000, returns: -1.5, volatility: 'low', color: '#f59e0b' },
      { id: 'fi-bnd', name: 'Vanguard Total Bond', ticker: 'BND', category: 'Fixed Income', value: 400000, returns: 3.0, volatility: 'low', color: '#fbbf24' },
      { id: 'eq-ivv', name: 'S&P 500 Core', ticker: 'IVV', category: 'Equities', value: 245000, returns: 21.0, volatility: 'medium', color: '#00f0ff' },
      { id: 'cash-usd', name: 'USD Money Market', ticker: 'USD', category: 'Liquid Cash', value: 100000, returns: 5.2, volatility: 'low', color: '#64748b' }
    ]
  }
};

const listeners = [];

export function subscribePortfolio(callback) {
  listeners.push(callback);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx > -1) listeners.splice(idx, 1);
  };
}

function notifySubscribers() {
  listeners.forEach((fn) => {
    try {
      fn(portfolioState);
    } catch (err) {
      console.error('Error in portfolio subscriber:', err);
    }
  });
}

export let portfolioState = {
  currentPreset: 'institutional',
  assets: [],
  summary: {
    totalNetWorth: 1245000,
    formattedNetWorth: '$1,245,000',
    totalReturns: 43.2,
    formattedReturns: '+43.2% 1Y',
    totalProfitLoss: '+$376,400',
    monthlyInflow: '+$6,420',
    monthlyOutflow: '-$3,850',
    netMonthlySavings: '+$2,570 / mo',
    monthlyCashFlow: '+$2,570 / mo',
    annualYield: '3.85%'
  }
};

/**
 * Procedurally generates realistic 12-month historical price trajectories.
 */
function generateHistoricalPrices(baseReturn, volatility) {
  const history = [100];
  const noiseScale = volatility === 'high' ? 9.0 : volatility === 'medium' ? 4.0 : 1.5;
  const targetEnd = 100 * (1 + baseReturn / 100);
  const stepGrowth = (targetEnd - 100) / 11;

  for (let i = 1; i < 12; i++) {
    const trend = 100 + stepGrowth * i;
    const noise = (Math.sin(i * 1.8) + (Math.random() - 0.5)) * noiseScale;
    history.push(Math.max(10, Math.round((trend + noise) * 10) / 10));
  }
  history[11] = Math.round(targetEnd * 10) / 10;
  return history;
}

/**
 * Strictly recalculates portfolio totals, normalized % allocations, and clean orbit metrics.
 */
export function recalculatePortfolio() {
  const count = portfolioState.assets.length;

  // 1. Strictly sanitize numbers and calculate Total Net Worth
  let totalPortfolioValue = 0;
  portfolioState.assets.forEach((asset) => {
    const parsedVal = parseFloat(asset.value);
    asset.value = isNaN(parsedVal) || parsedVal <= 0 ? 10000 : parsedVal;

    const parsedRet = parseFloat(asset.returns);
    asset.returns = isNaN(parsedRet) ? 0 : parsedRet;

    totalPortfolioValue += asset.value;
  });

  if (totalPortfolioValue <= 0) totalPortfolioValue = 1;

  // 2. Compute normalized allocations and orbital placement
  let weightedReturns = 0;

  portfolioState.assets.forEach((asset, idx) => {
    // Allocation % normalized strictly
    const allocation = (asset.value / totalPortfolioValue) * 100;
    asset.allocation = Math.round(allocation * 10) / 10;

    asset.formattedValue = `$${Math.round(asset.value).toLocaleString()}`;
    asset.formattedReturns = `${asset.returns >= 0 ? '+' : ''}${asset.returns}%`;

    const pnlNum = Math.round(asset.value * (asset.returns / (100 + asset.returns || 1)));
    asset.pnl = `${pnlNum >= 0 ? '+' : ''}$${Math.abs(pnlNum).toLocaleString()}`;

    // Clean non-NaN orbital coordinates (comfortable spread: 5.0 + idx * 2.8)
    asset.orbitRadius = 5.0 + idx * 2.8;
    asset.initialAngle = idx * ((2 * Math.PI) / Math.max(1, count));
    asset.orbitSpeed = 0.35 - idx * 0.03;
    asset.elevation = (idx % 2 === 0 ? 1 : -1) * 0.3;

    if (!asset.history || asset.history.length === 0) {
      asset.history = generateHistoricalPrices(asset.returns, asset.volatility);
    }
    if (!asset.timeLabels) {
      asset.timeLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    }
    if (!asset.metrics) {
      asset.metrics = {
        sharpe: Math.round((1.2 + (asset.returns / 20)) * 100) / 100,
        dividendYield: asset.category === 'Fixed Income' ? '4.5%' : asset.category === 'Liquid Cash' ? '5.2%' : '1.1%',
        beta: asset.volatility === 'high' ? 1.75 : asset.volatility === 'medium' ? 1.05 : 0.25
      };
    }

    weightedReturns += (asset.returns * asset.allocation) / 100;
  });

  const totalReturnsRounded = Math.round(weightedReturns * 10) / 10;
  const totalPnL = Math.round(totalPortfolioValue * (totalReturnsRounded / (100 + totalReturnsRounded || 1)));

  portfolioState.summary = {
    totalNetWorth: totalPortfolioValue,
    formattedNetWorth: `$${Math.round(totalPortfolioValue).toLocaleString()}`,
    totalReturns: totalReturnsRounded,
    formattedReturns: `${totalReturnsRounded >= 0 ? '+' : ''}${totalReturnsRounded}% 1Y`,
    totalProfitLoss: `${totalPnL >= 0 ? '+' : ''}$${Math.abs(totalPnL).toLocaleString()}`,
    monthlyInflow: '+$6,420',
    monthlyOutflow: '-$3,850',
    netMonthlySavings: '+$2,570 / mo',
    monthlyCashFlow: '+$2,570 / mo',
    annualYield: '3.85%'
  };

  notifySubscribers();
  return portfolioState;
}

export function loadPresetProfile(presetKey) {
  const preset = PRESET_PROFILES[presetKey] || PRESET_PROFILES['institutional'];
  portfolioState.currentPreset = presetKey;
  portfolioState.assets = JSON.parse(JSON.stringify(preset.assets));
  return recalculatePortfolio();
}

export function addAsset(assetData) {
  const id = `asset-${Date.now()}`;
  const parsedVal = parseFloat(assetData.value);
  const parsedRet = parseFloat(assetData.returns);

  const newAsset = {
    id,
    name: (assetData.name || 'New Holding').trim(),
    ticker: (assetData.ticker || 'HOLD').trim().toUpperCase(),
    category: assetData.category || 'Equities',
    value: isNaN(parsedVal) || parsedVal <= 0 ? 50000 : parsedVal,
    returns: isNaN(parsedRet) ? 10.0 : parsedRet,
    volatility: assetData.volatility || 'medium',
    color: CATEGORY_COLORS[assetData.category] || '#00f0ff',
    description: (assetData.description || 'Custom institutional asset holding.').trim()
  };

  portfolioState.assets.push(newAsset);
  return recalculatePortfolio();
}

export function updateAsset(id, updatedFields) {
  const asset = portfolioState.assets.find((a) => a.id === id);
  if (!asset) return null;

  if (updatedFields.value !== undefined) {
    const v = parseFloat(updatedFields.value);
    updatedFields.value = isNaN(v) || v <= 0 ? 1000 : v;
  }
  if (updatedFields.returns !== undefined) {
    const r = parseFloat(updatedFields.returns);
    updatedFields.returns = isNaN(r) ? 0 : r;
  }

  Object.assign(asset, updatedFields);
  if (updatedFields.category && CATEGORY_COLORS[updatedFields.category]) {
    asset.color = CATEGORY_COLORS[updatedFields.category];
  }
  return recalculatePortfolio();
}

export function deleteAsset(id) {
  portfolioState.assets = portfolioState.assets.filter((a) => a.id !== id);
  return recalculatePortfolio();
}

export function adjustAssetAllocation(id, deltaPercent = 1) {
  const asset = portfolioState.assets.find((a) => a.id === id);
  if (!asset) return null;

  const totalVal = portfolioState.summary.totalNetWorth || 1245000;
  const deltaVal = (totalVal * deltaPercent) / 100;
  const newVal = Math.max(1000, Math.round(asset.value + deltaVal));
  return updateAsset(id, { value: newVal });
}

export function getAssetById(id) {
  return portfolioState.assets.find((a) => a.id === id) || null;
}

// Initial institutional portfolio load
loadPresetProfile('institutional');

