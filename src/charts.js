import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { soundFx } from './audio.js';
import {
  triggerMacroStressTest,
  isStressTestActive,
  getStressProgress,
  onStressTestChange,
  isDefensiveAsset
} from './solar-system.js';

// ============================================================================
// Multi-Window & Close Hitbox Registries
// ============================================================================
export const activeChartWindows = [];
if (typeof window !== 'undefined') {
  window.activeChartWindows = activeChartWindows;
}
export const closeHitboxRegistry = [];

let currentGlobalScene = null;
export function setChartsScene(scene) {
  currentGlobalScene = scene;
}

// Top of src/charts.js (Runs ONCE at startup, 0ms cost on click)
let cachedGridWellMat = null;
function getGridWellMaterial() {
  if (cachedGridWellMat) return cachedGridWellMat;
  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = 256;
  bgCanvas.height = 128;
  const ctx = bgCanvas.getContext('2d');

  const grad = ctx.createRadialGradient(128, 64, 5, 128, 64, 120);
  grad.addColorStop(0, 'rgba(14, 165, 233, 0.16)');
  grad.addColorStop(1, 'rgba(2, 6, 23, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath(); // Batch all grid lines into ONE single draw call!
  for (let x = 0; x <= 256; x += 16) {
    ctx.moveTo(x, 0); ctx.lineTo(x, 128);
  }
  for (let y = 0; y <= 128; y += 16) {
    ctx.moveTo(0, y); ctx.lineTo(256, y);
  }
  ctx.stroke();

  const bgTex = new THREE.CanvasTexture(bgCanvas);
  bgTex.generateMipmaps = false;
  bgTex.minFilter = THREE.LinearFilter;

  cachedGridWellMat = new THREE.MeshBasicMaterial({
    map: bgTex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  return cachedGridWellMat;
}

// ============================================================================
// Resolution & Timeframe Presets
// ============================================================================
export const RESOLUTION_PRESETS = [
  { id: '1D_5m',   label: '1D • 5m',   fullLabel: '1D • 5m',   count: 24, mult: 0.015 },
  { id: '5D_15m',  label: '5D • 15m',  fullLabel: '5D • 15m',  count: 22, mult: 0.025 },
  { id: '1M_30m',  label: '1M • 30m',  fullLabel: '1M • 30m',  count: 20, mult: 0.035 },
  { id: '3M_1h',   label: '3M • 1h',   fullLabel: '3M • 1h',   count: 20, mult: 0.045 },
  { id: '6M_2h',   label: '6M • 2h',   fullLabel: '6M • 2h',   count: 20, mult: 0.055 },
  { id: 'YTD_1D',  label: 'YTD • 1D',  fullLabel: 'YTD • 1D',  count: 20, mult: 0.065 },
  { id: '1Y_1D',   label: '1Y • 1D',   fullLabel: '1Y • 1D',   count: 22, mult: 0.080 },
  { id: 'ALL_1W',  label: 'ALL • 1W',  fullLabel: 'ALL • 1W',  count: 24, mult: 0.110 }
];

// ============================================================================
// Shared Zero-Allocation Asset Pools & Texture Caches
// ============================================================================
const sharedUnitBoxGeo = new THREE.BoxGeometry(1, 1, 1);
sharedUnitBoxGeo.userData = { isShared: true };

const sharedUnitCylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
sharedUnitCylinderGeo.userData = { isShared: true };

// Shared Candle Materials (Zero PBR recompilation overhead, crisp neon styling)
const sharedGreenCandleMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.95 });
sharedGreenCandleMat.userData = { isShared: true };
const sharedRedCandleMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.95 });
sharedRedCandleMat.userData = { isShared: true };

const sharedGreenWickMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
sharedGreenWickMat.userData = { isShared: true };
const sharedRedWickMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
sharedRedWickMat.userData = { isShared: true };

const sharedGreenVolMat = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.55 });
sharedGreenVolMat.userData = { isShared: true };
const sharedRedVolMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.55 });
sharedRedVolMat.userData = { isShared: true };

const hoveredCandleMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
hoveredCandleMat.userData = { isShared: true };

// Texture Cache
const staticTextureCache = new Map();
function getOrCreateCachedTexture(key, width, height, renderFn) {
  if (staticTextureCache.has(key)) return staticTextureCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  renderFn(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.userData = { isShared: true };
  staticTextureCache.set(key, tex);
  return tex;
}

function getSplineBtnTexture(isActive) {
  return getOrCreateCachedTexture(`spline_btn_${isActive}`, 256, 80, (ctx) => {
    ctx.fillStyle = isActive ? '#06b6d4' : '#111c30';
    ctx.roundRect(4, 4, 248, 72, 14);
    ctx.fill();
    ctx.strokeStyle = isActive ? '#38bdf8' : '#334155';
    ctx.lineWidth = 3;
    ctx.roundRect(4, 4, 248, 72, 14);
    ctx.stroke();
    ctx.fillStyle = isActive ? '#ffffff' : '#94a3b8';
    ctx.font = 'bold 26px "Inter", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📈 SPLINE', 128, 40);
  });
}

function getCandlesBtnTexture(isActive) {
  return getOrCreateCachedTexture(`candles_btn_${isActive}`, 270, 80, (ctx) => {
    ctx.fillStyle = isActive ? '#06b6d4' : '#111c30';
    ctx.roundRect(4, 4, 262, 72, 14);
    ctx.fill();
    ctx.strokeStyle = isActive ? '#38bdf8' : '#334155';
    ctx.lineWidth = 3;
    ctx.roundRect(4, 4, 262, 72, 14);
    ctx.stroke();
    ctx.fillStyle = isActive ? '#ffffff' : '#94a3b8';
    ctx.font = 'bold 26px "Inter", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📊 CANDLES', 135, 40);
  });
}

function getStressBtnTexture(isShock) {
  return getOrCreateCachedTexture(`stress_btn_${isShock}`, 240, 80, (ctx) => {
    if (isShock) {
      ctx.fillStyle = '#dc2626';
      ctx.roundRect(4, 4, 232, 72, 14);
      ctx.fill();
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 3;
      ctx.roundRect(4, 4, 232, 72, 14);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px "Inter", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🕳️ SHOCK', 120, 40);
    } else {
      ctx.fillStyle = '#1c1917';
      ctx.roundRect(4, 4, 232, 72, 14);
      ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.roundRect(4, 4, 232, 72, 14);
      ctx.stroke();
      ctx.fillStyle = '#fcd34d';
      ctx.font = 'bold 26px "Inter", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚡ STRESS', 120, 40);
    }
  });
}

function getCloseBtnTexture() {
  return getOrCreateCachedTexture('close_x_btn', 128, 128, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', 64, 64);
  });
}

function getWolfEggTexture() {
  return getOrCreateCachedTexture('wolf_egg_dollar', 64, 64, (ctx) => {
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 32, 34);
  });
}

function getTimeAxisTexture() {
  return getOrCreateCachedTexture('time_axis_labels_unified', 1024, 64, (ctx) => {
    ctx.fillStyle = '#64748b';
    ctx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const timeLabels = ['09:30', '11:00', '12:30', '14:00', '15:30', '16:00'];
    timeLabels.forEach((label, idx) => {
      const fraction = idx / (timeLabels.length - 1);
      const canvasX = 30 + fraction * (1024 - 60);
      ctx.fillText(label, canvasX, 32);
    });
  });
}

function getTimeframePillTexture(preset, isActive) {
  return getOrCreateCachedTexture(`tf_pill_${preset.id}_${isActive}`, 256, 84, (ctx) => {
    ctx.fillStyle = isActive ? '#06b6d4' : '#111c30';
    ctx.roundRect(4, 4, 248, 76, 14);
    ctx.fill();

    ctx.strokeStyle = isActive ? '#38bdf8' : '#334155';
    ctx.lineWidth = 3;
    ctx.roundRect(4, 4, 248, 76, 14);
    ctx.stroke();

    ctx.fillStyle = isActive ? '#ffffff' : '#94a3b8';
    ctx.font = 'bold 27px "Inter", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(preset.label, 128, 42);
  });
}

function getStressBannerTexture(isDefensive) {
  return getOrCreateCachedTexture(`stress_banner_${isDefensive}`, 1024, 70, (ctx) => {
    if (isDefensive) {
      ctx.fillStyle = 'rgba(234, 179, 8, 0.25)';
      ctx.roundRect(4, 4, 1016, 62, 12);
      ctx.fill();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 3;
      ctx.roundRect(4, 4, 1016, 62, 12);
      ctx.stroke();

      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 24px "Inter", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🛡️ DEFENSIVE GOLDEN SHIELD ACTIVE • HEDGED PORTFOLIO LIQUIDITY PRESERVED', 512, 35);
    } else {
      ctx.fillStyle = 'rgba(220, 38, 38, 0.30)';
      ctx.roundRect(4, 4, 1016, 62, 12);
      ctx.fill();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.roundRect(4, 4, 1016, 62, 12);
      ctx.stroke();

      ctx.fillStyle = '#fecaca';
      ctx.font = 'bold 24px "Inter", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚠️ MACRO STRESS-TEST ACTIVE: -35% LIQUIDITY SHOCK & BLACK HOLE COLLAPSE', 512, 35);
    }
  });
}

// Helper to generate simulated realistic OHLCV candles with Macro Stress-Test simulation
function generateCandleData(basePrice = 120, count = 20, volatilityMult = 0.035, isStress = false, isDefensive = false) {
  const candles = [];
  let price = basePrice;
  const stressStartIndex = Math.max(1, Math.floor(count * 0.65));

  for (let i = 0; i < count; i++) {
    let delta = (Math.random() - 0.48) * (basePrice * volatilityMult);

    // If Macro Stress-Test is active, simulate systemic black hole market shock on latter candles
    if (isStress && i >= stressStartIndex) {
      if (isDefensive) {
        // Defensive hedge assets (IVV, TLT, BND, USD Cash) hold value (-1.5% to -2.5% safe-haven preservation)
        delta = (Math.random() - 0.52) * (basePrice * volatilityMult * 0.45);
      } else {
        // High-beta growth tech & crypto experience catastrophic black hole collapse (-35% to -48% drawdown)
        delta = -Math.abs((Math.random() * 0.07 + 0.05) * basePrice);
      }
    }

    const open = price;
    const close = Math.max(1, open + delta);
    const high = Math.max(open, close) + Math.random() * (basePrice * volatilityMult * 0.55);
    const low = Math.max(0.5, Math.min(open, close) - Math.random() * (basePrice * volatilityMult * 0.55));
    const volume = (isStress && i >= stressStartIndex)
      ? Math.random() * 0.42 + 0.28 // Liquidation volume surge during black hole collapse
      : Math.random() * 0.14 + 0.025;
    candles.push({
      open,
      close,
      high,
      low,
      volume,
      isGreen: close >= open,
      isBullish: close >= open
    });
    price = close;
  }
  return candles;
}

// ---------------------------------------------------------------------------
// 1. Top Header Builder
// ---------------------------------------------------------------------------
function buildHeader(chartWin, ticker, assetData) {
  const companyName = assetData.name || ticker;
  const symbol = String(ticker).toUpperCase();

  let formattedPrice = assetData.price;
  if (!formattedPrice && assetData.priceNumeric) {
    formattedPrice = `$${Number(assetData.priceNumeric).toLocaleString()}`;
  } else if (!formattedPrice) {
    formattedPrice = '$124,500';
  } else if (typeof formattedPrice === 'number') {
    formattedPrice = `$${formattedPrice.toLocaleString()}`;
  } else if (!String(formattedPrice).startsWith('$') && !String(formattedPrice).startsWith('₹')) {
    formattedPrice = `$${formattedPrice}`;
  }

  const assetType = assetData.category || 'Core Equity';
  const alloc = assetData.allocation !== undefined ? assetData.allocation : 25;
  const rawRet = assetData.change || (assetData.returns !== undefined ? `${assetData.returns >= 0 ? '+' : ''}${assetData.returns}%` : '+3.4%');
  const ret = String(rawRet).startsWith('+') ? String(rawRet).substring(1) : rawRet;

  // Single unified header canvas (1024 x 160) for retina crispness
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');

  // Title Line: ${companyName} (${ticker})  •  $${price} in crisp bold white (font: bold 44px -apple-system, sans-serif)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${companyName} (${symbol})  •  ${formattedPrice}`, 16, 56);

  // Subtitle Line: ${assetType} • Allocation: ${alloc}% • 24h Return: +${ret}%      TOTAL NET WORTH: $1,245,000 in muted blue-grey (#94a3b8)
  ctx.fillStyle = '#94a3b8';
  ctx.font = '26px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`${assetType} • Allocation: ${alloc}% • 24h Return: +${ret}%      TOTAL NET WORTH: $1,245,000`, 16, 114);

  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  // Pinned flat to the slate at z = 0.015m with THREE.PlaneGeometry (NO SPRITES - stops text sliding)
  const headerGeo = new THREE.PlaneGeometry(0.70, 0.125);
  const headerMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  const headerMesh = new THREE.Mesh(headerGeo, headerMat);
  headerMesh.position.set(-0.20, 0.32, 0.015);
  headerMesh.raycast = () => {}; // Non-blocking
  chartWin.add(headerMesh);
  chartWin.userData.headerMesh = headerMesh;
  chartWin.userData.headerSprite = headerMesh; // Alias for backward compatibility
  chartWin.userData.headerCanvas = canvas;
  chartWin.userData.headerData = { name: companyName, symbol, category: assetType, allocation: alloc, change: rawRet, rawPrice: formattedPrice };

  // Title Dragging Surface (Invisible collider for desktop & VR spatial drag / Easter Egg thump trigger)
  const dragBar = new THREE.Mesh(
    new THREE.PlaneGeometry(0.70, 0.125),
    new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
  );
  dragBar.position.set(-0.20, 0.32, 0.016);
  dragBar.userData.isTitleBar = true;
  dragBar.userData.parentWindow = chartWin;
  chartWin.add(dragBar);
  chartWin.userData.titleBar = dragBar;
}

// ---------------------------------------------------------------------------
// 1b. Robust Visual Trigger Button (Gold Dollar Badge)
// ---------------------------------------------------------------------------
export function attachWolfEggButton(chartWin) {
  const eggBtnGroup = new THREE.Group();
  eggBtnGroup.name = "wolfEggGroup";
  // Place it right between Net Worth text and the Spline button
  eggBtnGroup.position.set(0.18, 0.315, 0.035);

  // 1. Golden Badge Mesh
  const badgeGeo = new THREE.PlaneGeometry(0.065, 0.04);
  const badgeMat = new THREE.MeshBasicMaterial({
    color: 0xeab308,
    side: THREE.DoubleSide
  });
  const badgeMesh = new THREE.Mesh(badgeGeo, badgeMat);
  badgeMesh.userData.isWolfEgg = true;
  badgeMesh.userData.parentChart = chartWin;
  badgeMesh.userData.parentWindow = chartWin;
  badgeMesh.userData.onClick = () => triggerWolfEasterEgg(chartWin);
  eggBtnGroup.add(badgeMesh);

  // 2. Dollar Icon Text
  const textMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.045, 0.045),
    new THREE.MeshBasicMaterial({ map: getWolfEggTexture(), transparent: true })
  );
  textMesh.position.z = 0.005;
  textMesh.raycast = () => {};
  eggBtnGroup.add(textMesh);

  // 3. Forward-facing 3D Hitbox (transparent opacity 0 so raycasting NEVER skips it)
  const hitGeo = new THREE.BoxGeometry(0.09, 0.06, 0.06);
  const hitMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.0,
    depthWrite: false
  });
  const eggHitbox = new THREE.Mesh(hitGeo, hitMat);
  eggHitbox.position.z = 0.02;
  eggHitbox.userData.isWolfEgg = true;
  eggHitbox.userData.parentChart = chartWin;
  eggHitbox.userData.parentWindow = chartWin;
  eggHitbox.userData.onClick = () => triggerWolfEasterEgg(chartWin);
  eggBtnGroup.add(eggHitbox);

  chartWin.add(eggBtnGroup);
  chartWin.userData.eggBtnGroup = eggBtnGroup;
  chartWin.userData.eggHitbox = eggHitbox;

  if (typeof window !== 'undefined') {
    if (!window.activeEggHitboxes) window.activeEggHitboxes = [];
    window.activeEggHitboxes.push(eggHitbox);
    window.activeEggHitboxes.push(badgeMesh);
  }
}

// ---------------------------------------------------------------------------
// 2. Top-Right Mode Toggles & Close Button
// ---------------------------------------------------------------------------
function buildTopControls(chartWin, scene) {
  const currentMode = chartWin.userData.displayMode || 'candles';
  const isCandle = currentMode === 'candles' || currentMode === 'candlestick';

  // 1. [ 📈 SPLINE ] Toggle Button (Inactive default, dark glass)
  const splinePill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.108, 0.042),
    new THREE.MeshBasicMaterial({ map: getSplineBtnTexture(!isCandle), transparent: true, side: THREE.DoubleSide })
  );
  splinePill.position.set(0.275, 0.32, 0.02);
  splinePill.userData.isChartModeToggle = true;
  splinePill.userData.targetMode = 'spline';
  splinePill.userData.parentWindow = chartWin;
  splinePill.userData.onClick = () => setChartDisplayMode('spline', chartWin);
  chartWin.add(splinePill);
  chartWin.userData.btnSpline = splinePill;

  // 2. [ 📊 CANDLES ] Toggle Button (Active cyan highlight)
  const candlePill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.114, 0.042),
    new THREE.MeshBasicMaterial({ map: getCandlesBtnTexture(isCandle), transparent: true, side: THREE.DoubleSide })
  );
  candlePill.position.set(0.392, 0.32, 0.02);
  candlePill.userData.isChartModeToggle = true;
  candlePill.userData.targetMode = 'candles';
  candlePill.userData.parentWindow = chartWin;
  candlePill.userData.onClick = () => setChartDisplayMode('candles', chartWin);
  chartWin.add(candlePill);
  chartWin.userData.btnCandles = candlePill;

  // 3. [ ⚡ STRESS ] Portfolio Macro Stress-Test / Black Hole Shock Button
  const stressPill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.096, 0.042),
    new THREE.MeshBasicMaterial({ map: getStressBtnTexture(isStressTestActive), transparent: true, side: THREE.DoubleSide })
  );
  stressPill.position.set(0.505, 0.32, 0.02);
  stressPill.userData.isStressButton = true;
  stressPill.userData.parentWindow = chartWin;
  const onStressClick = () => triggerMacroStressTest(!isStressTestActive);
  stressPill.userData.onClick = onStressClick;
  chartWin.add(stressPill);
  chartWin.userData.btnStress = stressPill;
  chartWin.userData.redrawStressButton = (active) => {
    stressPill.material.map = getStressBtnTexture(active);
    stressPill.material.needsUpdate = true;
  };

  // 3b. Forward-Facing 3D Hitbox for Stress Raycasting
  const stressHitGeo = new THREE.BoxGeometry(0.10, 0.06, 0.08);
  const stressHitMat = new THREE.MeshBasicMaterial({ visible: false });
  const stressHitbox = new THREE.Mesh(stressHitGeo, stressHitMat);
  stressHitbox.position.set(0.505, 0.32, 0.05);
  stressHitbox.userData.isStressButton = true;
  stressHitbox.userData.parentWindow = chartWin;
  stressHitbox.userData.parentChart = chartWin;
  stressHitbox.userData.onClick = onStressClick;
  chartWin.add(stressHitbox);
  chartWin.userData.stressHitbox = stressHitbox;

  // 4. Integrated [ ✕ ] close icon in the top right corner
  const closeGeo = new THREE.PlaneGeometry(0.046, 0.042);
  const closeMat = new THREE.MeshBasicMaterial({
    color: 0x221318,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
  });
  const closeBtn = new THREE.Mesh(closeGeo, closeMat);
  closeBtn.position.set(0.592, 0.32, 0.02);
  closeBtn.userData.isCloseButton = true;
  closeBtn.userData.parentWindow = chartWin;
  chartWin.add(closeBtn);
  chartWin.userData.closeBtn = closeBtn;

  // Close Icon text (Clean white ✕ centered inside, z = 0.022m)
  const xMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.034, 0.034),
    new THREE.MeshBasicMaterial({ map: getCloseBtnTexture(), transparent: true, side: THREE.DoubleSide })
  );
  xMesh.position.set(0.592, 0.32, 0.022);
  xMesh.raycast = () => {}; // Non-blocking
  chartWin.add(xMesh);

  // Forward-Facing 3D Hitbox for raycasting (z = 0.05m)
  const hitBoxGeo = new THREE.BoxGeometry(0.10, 0.10, 0.08);
  const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
  const closeHitbox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
  closeHitbox.position.set(0.592, 0.32, 0.05);
  closeHitbox.userData.isCloseHitbox = true;
  closeHitbox.userData.isCloseButton = true;
  closeHitbox.userData.parentWindow = chartWin;
  closeHitbox.userData.parentChart = chartWin;
  chartWin.add(closeHitbox);
  chartWin.userData.closeHitbox = closeHitbox;
  closeHitboxRegistry.push(closeHitbox);

  const handleClose = () => closeChartWindow(chartWin, scene);
  closeBtn.userData.onClick = handleClose;
  closeHitbox.userData.onClick = handleClose;
}

// ---------------------------------------------------------------------------
// 2b. Dynamic Floating Stress-Test Alert Banner
// ---------------------------------------------------------------------------
function buildStressAlertBanner(chartWin, assetData = {}) {
  const isDefensive = isDefensiveAsset(assetData);
  const bannerMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.88, 0.052),
    new THREE.MeshBasicMaterial({ map: getStressBannerTexture(isDefensive), transparent: true, side: THREE.DoubleSide })
  );
  bannerMesh.position.set(-0.06, 0.245, 0.02);
  bannerMesh.visible = isStressTestActive;
  bannerMesh.raycast = () => {};
  chartWin.add(bannerMesh);

  chartWin.userData.stressBanner = bannerMesh;
  chartWin.userData.redrawStressBanner = (active) => {
    bannerMesh.material.map = getStressBannerTexture(isDefensive);
    bannerMesh.material.needsUpdate = true;
    bannerMesh.visible = active;
  };
}

// ---------------------------------------------------------------------------
// 3. Robust 3D Spline Builder Function
// ---------------------------------------------------------------------------
export function createSplineGroup(candleData) {
  const splineGroup = new THREE.Group();
  splineGroup.name = "splineGroup";

  if (!candleData || candleData.length < 2) return splineGroup;

  // 1. Calculate price range to normalize strictly within slate boundaries
  const prices = candleData.map(c => c.close);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = Math.max(1, maxPrice - minPrice);

  // Vertical bounds inside the slate (Y: -0.16 to +0.18, height ~0.34m)
  const minY = -0.16;
  const maxY = 0.18;
  const baseY = -0.22;

  // Horizontal bounds (X: -0.48 to +0.42)
  const startX = -0.48;
  const totalWidth = 0.90;
  const stepX = totalWidth / (candleData.length - 1);

  const points = [];
  candleData.forEach((c, idx) => {
    const norm = (c.close - minPrice) / priceRange; // 0.0 to 1.0
    const x = startX + idx * stepX;
    const y = minY + norm * (maxY - minY);
    points.push(new THREE.Vector3(x, y, 0.04));
  });

  // 2. High-Resolution Smooth Spline Curve
  const curve = new THREE.CatmullRomCurve3(points);
  const tubeGeo = new THREE.TubeGeometry(curve, 72, 0.0035, 8, false);
  const tubeMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide
  });
  const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
  tubeMesh.raycast = () => {};
  splineGroup.add(tubeMesh);

  // 3. Subtle Cyan Gradient Area Fill
  const fillVertices = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    // Two triangles per segment forming a vertical strip down to baseY
    fillVertices.push(
      p1.x, p1.y, 0.032,
      p2.x, p2.y, 0.032,
      p1.x, baseY, 0.032,

      p2.x, p2.y, 0.032,
      p2.x, baseY, 0.032,
      p1.x, baseY, 0.032
    );
  }

  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(fillVertices, 3));
  fillGeo.computeVertexNormals();

  const fillMat = new THREE.MeshBasicMaterial({
    color: 0x0284c7,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const fillMesh = new THREE.Mesh(fillGeo, fillMat);
  fillMesh.raycast = () => {};
  splineGroup.add(fillMesh);

  // 4. Volume Bars in Spline Mode:
  const volGroup = new THREE.Group();
  candleData.forEach((c, idx) => {
    const x = startX + idx * stepX;
    const volHeight = Math.max(0.015, (c.volume || 0.05) * 0.8);
    const volMesh = new THREE.Mesh(sharedUnitBoxGeo, c.close >= c.open ? sharedGreenVolMat : sharedRedVolMat);
    volMesh.scale.set(0.022, volHeight, 0.018);
    volMesh.position.set(x, baseY + volHeight * 0.5, 0.03);
    volMesh.raycast = () => {};
    volGroup.add(volMesh);
  });
  splineGroup.add(volGroup);

  return splineGroup;
}

export const buildSplineVisualization = (chartWin, candleData) => {
  return createSplineGroup(candleData || chartWin);
};

// ---------------------------------------------------------------------------
// 4. Candlesticks, Splines, Volume Pillars & Price Scale
// ---------------------------------------------------------------------------
function renderChartDataContent(chartWin, basePrice, presetMultiplier = 0.035, candleCount = 20) {
  // Clear any existing chart content, candleGroup, and splineGroup directly attached to chartWin
  const disposeIfNonShared = (child) => {
    if (child.geometry && !child.geometry.userData?.isShared) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        if (!m.userData?.isShared) {
          if (m.map && !m.map.userData?.isShared) m.map.dispose();
          m.dispose();
        }
      });
    }
  };

  if (chartWin.userData.chartContentGroup) {
    chartWin.remove(chartWin.userData.chartContentGroup);
    chartWin.userData.chartContentGroup.traverse(disposeIfNonShared);
  }
  if (chartWin.userData.candleGroup) {
    chartWin.remove(chartWin.userData.candleGroup);
    chartWin.userData.candleGroup.traverse(disposeIfNonShared);
  }
  if (chartWin.userData.splineGroup) {
    chartWin.remove(chartWin.userData.splineGroup);
    chartWin.userData.splineGroup.traverse(disposeIfNonShared);
  }

  const contentGroup = new THREE.Group();
  chartWin.add(contentGroup);
  chartWin.userData.chartContentGroup = contentGroup;

  const isDef = isDefensiveAsset(chartWin.userData?.headerData || { ticker: chartWin.userData?.ticker });
  const candles = generateCandleData(basePrice, candleCount, presetMultiplier, isStressTestActive, isDef);
  chartWin.userData.candles = candles;

  let minP = Infinity;
  let maxP = -Infinity;
  candles.forEach((c) => {
    if (c.low < minP) minP = c.low;
    if (c.high > maxP) maxP = c.high;
  });
  const rangeP = Math.max(0.001, maxP - minP);
  chartWin.userData.minP = minP;
  chartWin.userData.maxP = maxP;
  chartWin.userData.rangeP = rangeP;

  // Chart area dimensions
  const startX = -0.56;
  const endX = 0.44;
  const totalChartWidth = endX - startX;
  const stepX = totalChartWidth / (candleCount - 1);

  const chartBottomY = -0.12;
  const chartHeight = 0.34;
  const mapPriceToY = (price) => chartBottomY + ((price - minP) / rangeP) * chartHeight;
  chartWin.userData.startX = startX;
  chartWin.userData.endX = endX;
  chartWin.userData.stepX = stepX;
  chartWin.userData.chartBottomY = chartBottomY;
  chartWin.userData.chartHeight = chartHeight;
  chartWin.userData.mapPriceToY = mapPriceToY;

  // ==========================================
  // A. 3D Candlesticks Group & Collider Registry
  // ==========================================
  const candleGroup = new THREE.Group();
  candleGroup.name = 'candleGroup';
  chartWin.add(candleGroup);
  chartWin.userData.candleGroup = candleGroup;

  const candleColliders = [];
  chartWin.userData.candleColliders = candleColliders;

  const candleEntries = [];

  candles.forEach((c, idx) => {
    const xPos = startX + idx * stepX;
    const isGreen = c.isGreen;
    const color = isGreen ? 0x10b981 : 0xef4444;

    const yOpen = mapPriceToY(c.open);
    const yClose = mapPriceToY(c.close);
    const bodyHeight = Math.max(0.014, Math.abs(yClose - yOpen));
    const bodyCenterY = (yOpen + yClose) * 0.5;

    // 1. Candlestick 3D Box Body (Zero-allocation unit geometry + shared material)
    const candleMesh = new THREE.Mesh(sharedUnitBoxGeo, isGreen ? sharedGreenCandleMat : sharedRedCandleMat);
    candleMesh.scale.set(0.030, bodyHeight, 0.035);
    candleMesh.position.set(xPos, bodyCenterY, 0.055);
    candleMesh.userData = {
      isCandle: true,
      baseScale: new THREE.Vector3(
        candleMesh.scale.x,
        candleMesh.scale.y,
        candleMesh.scale.z
      ),
      isGreen,
      candleData: { open: c.open, close: c.close, high: c.high, low: c.low, date: c.date || '12:30' },
      parentChart: chartWin,
      parentWindow: chartWin,
      originalColor: color,
      index: idx,
      posX: xPos,
      topY: mapPriceToY(c.high)
    };
    
    if (!chartWin.userData.candleColliders) chartWin.userData.candleColliders = [];
    chartWin.userData.candleColliders.push(candleMesh);
    candleGroup.add(candleMesh);
    const body = candleMesh;

    // 2. Wick (Zero-allocation cylinder geometry + shared material)
    const yHigh = mapPriceToY(c.high);
    const yLow = mapPriceToY(c.low);
    const wickHeight = Math.max(0.03, yHigh - yLow);
    const wick = new THREE.Mesh(sharedUnitCylinderGeo, isGreen ? sharedGreenWickMat : sharedRedWickMat);
    wick.scale.set(0.0018, wickHeight, 0.0018);
    wick.position.set(xPos, (yHigh + yLow) * 0.5, 0.055);
    wick.raycast = () => {}; // Non-blocking
    candleGroup.add(wick);

    // 3. Semi-transparent Volume Pillar at bottom
    const volHeight = Math.max(0.015, c.volume * 0.65);
    const vol = new THREE.Mesh(sharedUnitBoxGeo, isGreen ? sharedGreenVolMat : sharedRedVolMat);
    vol.scale.set(0.026, volHeight, 0.025);
    vol.position.set(xPos, -0.25 + volHeight * 0.5, 0.025);
    vol.raycast = () => {}; // Non-blocking
    candleGroup.add(vol);

    candleEntries.push({
      posX: xPos,
      posY: bodyCenterY,
      topY: yHigh,
      bodyMesh: body,
      wickMesh: wick,
      volMesh: vol,
      data: c
    });
  });

  chartWin.userData.candleEntries = candleEntries;

  // ==========================================
  // B. 3D Smooth Glowing Spline Group
  // ==========================================
  const splineGroup = createSplineGroup(candles);
  chartWin.add(splineGroup);
  chartWin.userData.splineGroup = splineGroup;

  // Initial display mode visibility (default: 'candles')
  const currentMode = chartWin.userData.displayMode || 'candles';
  const isCandle = currentMode === 'candles' || currentMode === 'candlestick';
  candleGroup.visible = isCandle;
  splineGroup.visible = !isCandle;

  // ==========================================
  // C. Right-Hand Price Axis Scale & Thin Dashed Gridlines
  // ==========================================
  const steps = 3; // 4 price markers (fraction: 0, 1/3, 2/3, 1)
  for (let i = 0; i <= steps; i++) {
    const fraction = i / steps;
    const levelY = chartBottomY + fraction * chartHeight;
    const priceVal = minP + fraction * (maxP - minP);

    // 1. Thin dashed gridline extending faintly across the chart (z = 0.025m)
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(startX - 0.02, levelY, 0.025),
      new THREE.Vector3(endX + 0.02, levelY, 0.025)
    ]);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0x475569,
      dashSize: 0.02,
      gapSize: 0.012,
      transparent: true,
      opacity: 0.45
    });
    const gridLine = new THREE.Line(lineGeo, lineMat);
    gridLine.computeLineDistances();
    gridLine.raycast = () => {}; // Non-blocking
    contentGroup.add(gridLine);

    // 2. Text price marker pinned flat to the slate as a static Mesh Plane (z = 0.015m)
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`$${priceVal.toFixed(1)}`, 8, 24);

    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    const pGeo = new THREE.PlaneGeometry(0.09, 0.027);
    const pMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    const pMesh = new THREE.Mesh(pGeo, pMat);
    pMesh.position.set(0.53, levelY, 0.015);
    pMesh.raycast = () => {}; // Non-blocking
    contentGroup.add(pMesh);
  }

  // ==========================================
  // D. Time Axis & Volume Pillars Alignment (Zero-allocation cached texture)
  // ==========================================
  const timeGeo = new THREE.PlaneGeometry(totalChartWidth + 0.06, 0.032);
  const timeMat = new THREE.MeshBasicMaterial({ map: getTimeAxisTexture(), transparent: true, side: THREE.DoubleSide });
  const timeMesh = new THREE.Mesh(timeGeo, timeMat);
  timeMesh.position.set((startX + endX) * 0.5, -0.275, 0.015);
  timeMesh.raycast = () => {}; // Non-blocking
  contentGroup.add(timeMesh);

  // ==========================================
  // E. Vertical Scrubber Guide Plane & Tooltip
  // ==========================================
  const scrubberLineGeo = new THREE.PlaneGeometry(0.003, 0.46);
  const scrubberLineMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide
  });
  const scrubberLine = new THREE.Mesh(scrubberLineGeo, scrubberLineMat);
  scrubberLine.position.set(0, chartBottomY + chartHeight * 0.5, 0.065);
  scrubberLine.visible = false;
  scrubberLine.raycast = () => {};
  contentGroup.add(scrubberLine);
  chartWin.userData.scrubberLine = scrubberLine;

  // Floating OHLC Tooltip Pill inside chartWin (initially visible = false)
  if (chartWin.userData.tooltipMesh) {
    chartWin.remove(chartWin.userData.tooltipMesh);
    if (chartWin.userData.tooltipMesh.geometry) chartWin.userData.tooltipMesh.geometry.dispose();
    if (chartWin.userData.tooltipMesh.material) chartWin.userData.tooltipMesh.material.dispose();
  }
  const tooltipCanvas = document.createElement('canvas');
  tooltipCanvas.width = 384; tooltipCanvas.height = 96;
  const tooltipTex = new THREE.CanvasTexture(tooltipCanvas);
  tooltipTex.generateMipmaps = false;
  tooltipTex.minFilter = THREE.LinearFilter;
  const tooltipMat = new THREE.MeshBasicMaterial({ map: tooltipTex, transparent: true, depthTest: false });
  const tooltipMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.08), tooltipMat);
  tooltipMesh.position.set(0, 0.22, 0.08);
  tooltipMesh.visible = false;
  tooltipMesh.raycast = () => {};
  chartWin.add(tooltipMesh);
  chartWin.userData.tooltipMesh = tooltipMesh;
  chartWin.userData.tooltipTex = tooltipTex;
  chartWin.userData.tooltipCanvas = tooltipCanvas;
  chartWin.userData.ttMesh = tooltipMesh;
  chartWin.userData.ttSprite = tooltipMesh;
}

// ---------------------------------------------------------------------------
// 4. Bottom Resolution & Timeframe Pills
// ---------------------------------------------------------------------------
function buildTimeframePills(chartWin, activePresetId = '1M_30m') {
  const rowY = -0.34;
  const pillWidth = 0.126;
  const pillHeight = 0.042;
  const gap = 0.016;
  const totalWidth = RESOLUTION_PRESETS.length * pillWidth + (RESOLUTION_PRESETS.length - 1) * gap;
  const startX = -totalWidth * 0.5 + pillWidth * 0.5;

  chartWin.userData.timeframePills = [];

  RESOLUTION_PRESETS.forEach((preset, i) => {
    const xPos = startX + i * (pillWidth + gap);
    const isActive = preset.id === activePresetId || preset.label === activePresetId;

    const geo = new THREE.PlaneGeometry(pillWidth, pillHeight);
    const mat = new THREE.MeshBasicMaterial({
      map: getTimeframePillTexture(preset, isActive),
      transparent: true,
      side: THREE.DoubleSide
    });
    const pillMesh = new THREE.Mesh(geo, mat);
    pillMesh.position.set(xPos, rowY, 0.035);

    // Interactive Raycast Setup
    pillMesh.userData = {
      isResolutionPreset: true,
      isTimeframePill: true,
      presetId: preset.id,
      label: preset.label,
      parentWindow: chartWin,
      onClick: () => setChartResolutionPreset(preset.id, null, chartWin)
    };

    chartWin.add(pillMesh);
    chartWin.userData.timeframePills.push({ mesh: pillMesh, preset });
  });
}

// ---------------------------------------------------------------------------
// 4b. Decorative Sci-Fi Spatial HUD Window Chrome
// ---------------------------------------------------------------------------
const chromeHandleGeo = new THREE.PlaneGeometry(0.24, 0.008);
const chromeHandleMat = new THREE.MeshBasicMaterial({
  color: 0xe2e8f0,
  transparent: true,
  opacity: 0.45,
  side: THREE.DoubleSide
});
const chromeBracketMat = new THREE.MeshBasicMaterial({
  color: 0x38bdf8,
  transparent: true,
  opacity: 0.85,
  side: THREE.DoubleSide
});
const chromeHArmGeo = new THREE.PlaneGeometry(0.06, 0.004);
const chromeVArmGeo = new THREE.PlaneGeometry(0.004, 0.06);
const chromeRailGeo = new THREE.PlaneGeometry(1.22, 0.0025);
const chromeRailMat = new THREE.MeshBasicMaterial({
  color: 0x0ea5e9,
  transparent: true,
  opacity: 0.35,
  side: THREE.DoubleSide
});
const chromeGridWellGeo = new THREE.PlaneGeometry(1.18, 0.50);

function addSpatialWindowChrome(chartWin) {
  const chromeGroup = new THREE.Group();
  chromeGroup.name = "spatialWindowChrome";

  // 1. VisionOS / Quest Style Top Window Grab Bar Pill
  const handleMesh = new THREE.Mesh(chromeHandleGeo, chromeHandleMat);
  handleMesh.position.set(0, 0.425, 0.01);
  handleMesh.raycast = () => {};
  chromeGroup.add(handleMesh);

  // 2. Glowing Cyan HUD Corner Brackets (4 Corners)
  const w = 0.65; // Half-width of slate
  const h = 0.40; // Half-height of slate
  const len = 0.06; // Bracket arm length

  const corners = [
    { x: -w, y: h, sx: 1, sy: -1 },  // Top-Left
    { x: w, y: h, sx: -1, sy: -1 },  // Top-Right
    { x: -w, y: -h, sx: 1, sy: 1 },  // Bottom-Left
    { x: w, y: -h, sx: -1, sy: 1 }   // Bottom-Right
  ];

  corners.forEach(c => {
    // Horizontal arm
    const hArm = new THREE.Mesh(chromeHArmGeo, chromeBracketMat);
    hArm.position.set(c.x + (c.sx * len * 0.5), c.y, 0.012);
    hArm.raycast = () => {};
    chromeGroup.add(hArm);

    // Vertical arm
    const vArm = new THREE.Mesh(chromeVArmGeo, chromeBracketMat);
    vArm.position.set(c.x, c.y + (c.sy * len * 0.5), 0.012);
    vArm.raycast = () => {};
    chromeGroup.add(vArm);
  });

  // 3. Header & Footer Glowing Divider Rails
  const topRail = new THREE.Mesh(chromeRailGeo, chromeRailMat);
  topRail.position.set(0, 0.245, 0.008); // Separates header from chart area
  topRail.raycast = () => {};
  chromeGroup.add(topRail);

  const bottomRail = new THREE.Mesh(chromeRailGeo, chromeRailMat);
  bottomRail.position.set(0, -0.275, 0.008); // Separates chart area from bottom buttons
  bottomRail.raycast = () => {};
  chromeGroup.add(bottomRail);

  // 4. Subtle Holographic Grid & Radial Glow Backdrop inside the Data Well
  const gridWellMesh = new THREE.Mesh(
    chromeGridWellGeo,
    getGridWellMaterial()
  );
  gridWellMesh.position.set(0, -0.015, 0.006);
  gridWellMesh.raycast = () => {};
  chromeGroup.add(gridWellMesh);

  chartWin.add(chromeGroup);
}

// ============================================================================
// Spatial Ergonomics Configuration & Radial Cockpit Arc Math
// ============================================================================
export const ARC_CONFIG = {
  radius: 1.55,           // Distance in meters from headset (comfortable arm's reach)
  elevation: 0.12,        // Slightly elevated above eye level to clear wrist menus
  // Slot angles in radians: Left (-28°), Center (0°), Right (+28°)
  // 28 degrees gives clean ~10cm visual margins between 1.34m wide slates
  slotAngles: [-0.488, 0.0, 0.488] 
};

export function positionChartInSlot(chartWin, slotIndex, camera) {
  const targetCam = camera || (typeof window !== 'undefined' ? window.camera : null);
  if (!chartWin || !targetCam) return;

  const angle = ARC_CONFIG.slotAngles[slotIndex] ?? 0.0;

  // 1. Get current forward and right directions from camera
  const forward = new THREE.Vector3();
  if (targetCam.getWorldDirection) {
    targetCam.getWorldDirection(forward);
  } else if (targetCam.quaternion) {
    forward.set(0, 0, -1).applyQuaternion(targetCam.quaternion);
  } else {
    forward.set(0, 0, -1);
  }
  forward.y = 0;
  if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
  forward.normalize();

  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();

  // 2. Compute position along horizontal circle around camera position
  const camPos = targetCam.position ? targetCam.position.clone() : new THREE.Vector3(0, 1.5, 0);
  
  // Rotate forward vector by 'angle' around world up axis
  const dir = forward.clone().applyAxisAngle(up, -angle);
  
  const targetPos = camPos.clone()
    .add(dir.multiplyScalar(ARC_CONFIG.radius));
  
  // Apply elevation offset
  targetPos.y = camPos.y + ARC_CONFIG.elevation;
  chartWin.position.copy(targetPos);

  // 3. Aim chart precisely at the user's eye level (facing tangent to circle)
  chartWin.lookAt(camPos.x, targetPos.y, camPos.z);

  // Store metadata
  chartWin.userData.slotIndex = slotIndex;
}

export function updateAllChartSlots(camera = null) {
  const targetCam = camera || (typeof window !== 'undefined' ? window.camera : null);
  const chartList = (typeof window !== 'undefined' && window.activeChartWindows)
    ? window.activeChartWindows
    : activeChartWindows;
  if (!chartList || !targetCam) return;
  
  // Filter only visible/active windows
  const openCharts = chartList.filter(w => w && w.visible !== false);

  openCharts.forEach((chartWin, idx) => {
    // Center single charts, split 2 charts into Left & Right, or fill all 3
    let targetSlot = 1; // Default Center
    if (openCharts.length === 2) {
      targetSlot = idx === 0 ? 0 : 2; // Left & Right
    } else if (openCharts.length === 3) {
      targetSlot = idx; // 0: Left, 1: Center, 2: Right
    }
    positionChartInSlot(chartWin, targetSlot, targetCam);
  });
}

export const repositionActiveCharts = updateAllChartSlots;

// ---------------------------------------------------------------------------
// 5. Main Multi-Window Spawner
// ---------------------------------------------------------------------------
export function openOrFocusChart(ticker, assetData = {}, camera = null, scene = null) {
  console.time(`[Chart Open] Total time for ${ticker}`);

  const targetCam = camera || (typeof window !== 'undefined' ? window.camera : null);
  const targetScene = scene || currentGlobalScene || (typeof window !== 'undefined' ? window.scene : null);
  if (!ticker || !targetCam || !targetScene) {
    console.timeEnd(`[Chart Open] Total time for ${ticker}`);
    return;
  }
  if (targetScene) currentGlobalScene = targetScene;

  // 1. If this ticker is ALREADY open, highlight it and bring forward
  const sym = String(ticker).toUpperCase();
  const existing = activeChartWindows.find(win => win.userData.ticker === ticker || win.userData.ticker === sym);
  if (existing) {
    pulseChartHighlight(existing);
    console.timeEnd(`[Chart Open] Total time for ${ticker}`);
    return existing;
  }

  console.time('[Chart Open] 1. Data retrieval');
  // ... data fetch or generation ...
  let rawNumeric = assetData.priceNumeric;
  if (!rawNumeric && assetData.price) {
    const cleaned = String(assetData.price).replace(/[^0-9.-]+/g, '');
    rawNumeric = parseFloat(cleaned);
  }
  const basePrice = (rawNumeric && !isNaN(rawNumeric)) ? rawNumeric : 140;
  console.timeEnd('[Chart Open] 1. Data retrieval');

  console.time('[Chart Open] 2. Geometry & Mesh construction');
  // If 3 windows are already open, replace the oldest one cleanly
  if (activeChartWindows.length >= 3) {
    const oldest = activeChartWindows[0];
    closeChartWindow(oldest, targetScene);
  }

  // 2. Create Root Chart Window Group
  const chartWin = new THREE.Group();
  chartWin.userData.ticker = ticker;
  chartWin.userData.isChartWindow = true;
  chartWin.userData.displayMode = 'candles';
  chartWin.userData.activePresetId = '1M_30m';

  // =========================================================================
  // 3. Optical Frosted Glass Slate Base Plate (z = 0.0m) - Spatial HUD Glass
  // =========================================================================
  const bgGeo = new THREE.PlaneGeometry(1.32, 0.82);
  const slateMat = new THREE.MeshStandardMaterial({
    color: 0x040914,
    roughness: 0.2,
    metalness: 0.3,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide
  });
  const bgMesh = new THREE.Mesh(bgGeo, slateMat);
  bgMesh.position.set(0, 0, 0.0);
  bgMesh.raycast = () => {}; // NEVER block raycasts to planets behind it
  chartWin.add(bgMesh);
  chartWin.userData.bgMesh = bgMesh;

  // Subtle 1px glowing cyan border (color: 0x0ea5e9, opacity: 0.35, z = 0.002m)
  const borderEdges = new THREE.EdgesGeometry(bgGeo);
  const borderMat = new THREE.LineBasicMaterial({
    color: 0x0ea5e9,
    transparent: true,
    opacity: 0.35
  });
  const borderLines = new THREE.LineSegments(borderEdges, borderMat);
  borderLines.position.z = 0.002;
  borderLines.raycast = () => {}; // Non-blocking
  chartWin.add(borderLines);
  chartWin.userData.borderLines = borderLines;

  // 3b. Decorative Sci-Fi Spatial HUD Window Chrome
  addSpatialWindowChrome(chartWin);

  // NOTE: Dedicated lights (AmbientLight/DirectionalLight) were REMOVED from chartWin.
  // Adding dynamic lights to the scene graph forces WebGL to recompile shaders for
  // all materials across the entire scene (planets, star, accretion disk, bloom),
  // causing a massive 1-3s multi-frame freeze.

  // 4. 3D Candlesticks, Volumes & Right Price Axis
  chartWin.userData.basePrice = basePrice;
  chartWin.userData.currency = String(assetData.price || '').startsWith('₹') ? '₹' : '$';
  renderChartDataContent(chartWin, basePrice, 0.035, 20);
  console.timeEnd('[Chart Open] 2. Geometry & Mesh construction');

  console.time('[Chart Open] 3. Text & Canvas texture rasterization');
  // 5. Header Section (Top-Left)
  buildHeader(chartWin, ticker, assetData);

  // 6. Top-Right Mode Toggles & Close Button
  buildTopControls(chartWin, targetScene);

  // 7. Golden Dollar Badge Wolf of Wall Street Easter Egg
  attachWolfEggButton(chartWin);

  // 8. Dynamic Floating Macro Stress-Test Alert Banner
  buildStressAlertBanner(chartWin, assetData);

  // 9. Bottom Resolution & Timeframe Pills
  buildTimeframePills(chartWin, '1M_30m');
  console.timeEnd('[Chart Open] 3. Text & Canvas texture rasterization');

  targetScene.add(chartWin);
  activeChartWindows.push(chartWin);

  // 10. Position all open charts in ergonomic radial cockpit arc
  updateAllChartSlots(targetCam);

  soundFx.playSelectSound();
  console.log(`[Charts] Spawning rich 3D chart window #${activeChartWindows.length} for ${ticker} in slot ${chartWin.userData.slotIndex}`);
  console.timeEnd(`[Chart Open] Total time for ${ticker}`);
  return chartWin;
}

export const spawnOrFocusChart = openOrFocusChart;

// ---------------------------------------------------------------------------
// 6. Window Disposal & Cleanup
// ---------------------------------------------------------------------------
export function closeChartWindow(chartWin, scene = null) {
  if (!chartWin) return;

  // Clean close hitboxes
  const hitboxIdx = closeHitboxRegistry.findIndex(hb => hb.userData.parentWindow === chartWin);
  if (hitboxIdx !== -1) closeHitboxRegistry.splice(hitboxIdx, 1);

  // Clean Wolf egg hitboxes
  if (typeof window !== 'undefined' && window.activeEggHitboxes) {
    const eggIdx = window.activeEggHitboxes.findIndex(hb => hb.userData.parentChart === chartWin || hb.userData.parentWindow === chartWin);
    if (eggIdx !== -1) window.activeEggHitboxes.splice(eggIdx, 1);
  }

  // Remove from active list
  const idx = activeChartWindows.indexOf(chartWin);
  if (idx !== -1) activeChartWindows.splice(idx, 1);

  if (activeHoveredCandle && (activeHoveredCandle.userData?.parentChart === chartWin || activeHoveredCandle.userData?.parentWindow === chartWin)) {
    clearCandleHover();
  }

  soundFx.playCloseSound();

  // Remove from 3D scene
  const targetScene = scene || currentGlobalScene || chartWin.parent || (typeof window !== 'undefined' ? window.scene : null);
  if (chartWin.parent) chartWin.parent.remove(chartWin);
  else if (targetScene) targetScene.remove(chartWin);

  chartWin.traverse((child) => {
    if (child.geometry && !child.geometry.userData?.isShared) {
      child.geometry.dispose();
    }
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => {
          if (!m.userData?.isShared) {
            if (m.map && !m.map.userData?.isShared) m.map.dispose();
            m.dispose();
          }
        });
      } else if (!child.material.userData?.isShared) {
        if (child.material.map && !child.material.map.userData?.isShared) {
          child.material.map.dispose();
        }
        child.material.dispose();
      }
    }
  });

  const activeCam = typeof window !== 'undefined' ? window.camera : null;
  if (activeCam) {
    updateAllChartSlots(activeCam);
  }

  console.log(`[Charts] Closed chart window. Remaining: ${activeChartWindows.length}`);
}

export function removeCurrentChart(scene = null) {
  if (activeChartWindows.length > 0) {
    const latest = activeChartWindows[activeChartWindows.length - 1];
    closeChartWindow(latest, scene);
  }
}

// ---------------------------------------------------------------------------
// 7. Full Mode & Resolution Switchers (NO DUMMY STUBS)
// ---------------------------------------------------------------------------
export function setChartDisplayMode(mode = 'candles', targetChartWin = null) {
  const chartWin = targetChartWin || (activeChartWindows.length > 0 ? activeChartWindows[activeChartWindows.length - 1] : null);
  if (!chartWin || !chartWin.userData) return;

  const isCandle = mode === 'candles' || mode === 'candlestick';
  const normMode = isCandle ? 'candles' : 'spline';
  chartWin.userData.displayMode = normMode;
  soundFx.playSelectSound();

  // Toggle Visibility between 3D Candlesticks and Spline Curve
  if (chartWin.userData.candleGroup) chartWin.userData.candleGroup.visible = isCandle;
  if (chartWin.userData.splineGroup) chartWin.userData.splineGroup.visible = !isCandle;

  // Hide hover tooltip when switching
  if (chartWin.userData.tooltipMesh) chartWin.userData.tooltipMesh.visible = false;
  if (chartWin.userData.tooltipGroup) chartWin.userData.tooltipGroup.visible = false;
  if (chartWin.userData.scrubberLine) chartWin.userData.scrubberLine.visible = false;
  clearCandleHover();

  // Update In-Scene 3D Buttons
  if (chartWin.userData.btnSpline && chartWin.userData.btnCandles) {
    chartWin.userData.btnSpline.material.map = getSplineBtnTexture(normMode === 'spline');
    chartWin.userData.btnSpline.material.needsUpdate = true;
    chartWin.userData.btnCandles.material.map = getCandlesBtnTexture(isCandle);
    chartWin.userData.btnCandles.material.needsUpdate = true;
  }

  // Update 2D DOM segmented controls if present
  const domSpline = document.getElementById('btn-chart-spline');
  const domCandle = document.getElementById('btn-chart-candlestick');
  if (domSpline && domCandle) {
    domSpline.classList.toggle('active', normMode === 'spline');
    domCandle.classList.toggle('active', isCandle);
  }
}

export function getChartDisplayMode(targetChartWin = null) {
  const chartWin = targetChartWin || (activeChartWindows.length > 0 ? activeChartWindows[activeChartWindows.length - 1] : null);
  return chartWin?.userData?.displayMode || 'candles';
}

export function setChartResolutionPreset(presetId, scene = null, targetChartWin = null) {
  const chartWin = targetChartWin || (activeChartWindows.length > 0 ? activeChartWindows[activeChartWindows.length - 1] : null);
  if (!chartWin || !chartWin.userData) return;

  const preset = RESOLUTION_PRESETS.find(p => p.id === presetId || p.label === presetId) || RESOLUTION_PRESETS[2];
  chartWin.userData.activePresetId = preset.id;
  soundFx.playEnergySurgeSound();

  // 1. Update 3D In-Scene Timeframe Pills Visuals
  if (chartWin.userData.timeframePills) {
    chartWin.userData.timeframePills.forEach(({ mesh, preset: p }) => {
      const isActive = p.id === preset.id || p.label === preset.label;
      mesh.material.map = getTimeframePillTexture(p.label, isActive);
      mesh.material.needsUpdate = true;
    });
  }

  // 2. Regenerate 3D Candlesticks & Spline for this resolution
  clearCandleHover();
  const basePrice = chartWin.userData.basePrice || 140;
  renderChartDataContent(chartWin, basePrice, preset.mult, preset.count);

  // 3. Sync 2D DOM controls if present
  const pills = document.querySelectorAll('.resolution-pill');
  pills.forEach((p) => {
    p.classList.toggle('active', p.getAttribute('data-preset') === preset.id || p.getAttribute('data-preset') === preset.label);
  });
  const dropdownLabel = document.getElementById('current-resolution-label');
  if (dropdownLabel) dropdownLabel.textContent = preset.label;
}

// ---------------------------------------------------------------------------
// 8. Hover Highlighting & 3D Interactive Scrubber Engine (NO DUMMY STUBS)
// ---------------------------------------------------------------------------
let activeHoveredCandle = null;

export function updateCandleHover(hitCandle) {
  if (activeHoveredCandle === hitCandle) return;

  // Reset previous candle back to its exact baseScale
  if (activeHoveredCandle) {
    const prevIsGreen = activeHoveredCandle.userData.isGreen;
    activeHoveredCandle.material = prevIsGreen ? sharedGreenCandleMat : sharedRedCandleMat;
    if (activeHoveredCandle.userData?.baseScale) {
      activeHoveredCandle.scale.copy(activeHoveredCandle.userData.baseScale);
    }
  }

  activeHoveredCandle = hitCandle;
  if (!hitCandle) return;

  // Highlight hovered candle: scale up proportionally from its stored baseScale
  hitCandle.material = hoveredCandleMat;
  if (hitCandle.userData?.baseScale) {
    hitCandle.scale.set(
      hitCandle.userData.baseScale.x * 1.18,
      hitCandle.userData.baseScale.y * 1.06,
      hitCandle.userData.baseScale.z * 1.18
    );
  }

  // Update Tooltip Pill text
  const chartWin = hitCandle.userData.parentChart || hitCandle.userData.parentWindow;
  const data = hitCandle.userData.candleData;
  if (chartWin && data) {
    const { tooltipMesh, tooltipCanvas, tooltipTex } = chartWin.userData;
    if (tooltipCanvas && tooltipMesh && tooltipTex) {
      const ctx = tooltipCanvas.getContext('2d');
      ctx.clearRect(0, 0, tooltipCanvas.width, tooltipCanvas.height);

      // Background rounded pill
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.beginPath();
      ctx.roundRect(4, 4, tooltipCanvas.width - 8, tooltipCanvas.height - 8, 12);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.stroke();

      // OHLC Text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(`O: $${data.open.toFixed(1)}   H: $${data.high.toFixed(1)}`, 20, 36);
      ctx.fillStyle = data.close >= data.open ? '#10b981' : '#ef4444';
      ctx.fillText(`L: $${data.low.toFixed(1)}   C: $${data.close.toFixed(1)}`, 20, 72);

      tooltipTex.needsUpdate = true;
      tooltipMesh.position.x = hitCandle.position.x;
      tooltipMesh.position.y = hitCandle.position.y + 0.14;
      tooltipMesh.position.z = 0.095;
      tooltipMesh.visible = true;
    }
  }
}

export function clearCandleHover() {
  if (activeHoveredCandle) {
    const prevIsGreen = activeHoveredCandle.userData.isGreen;
    activeHoveredCandle.material = prevIsGreen ? sharedGreenCandleMat : sharedRedCandleMat;
    if (activeHoveredCandle.userData?.baseScale) {
      activeHoveredCandle.scale.copy(activeHoveredCandle.userData.baseScale);
    }
    const chartWin = activeHoveredCandle.userData.parentChart || activeHoveredCandle.userData.parentWindow;
    if (chartWin?.userData?.tooltipMesh) {
      chartWin.userData.tooltipMesh.visible = false;
    }
    activeHoveredCandle = null;
  }
}

export function setCandleHoverState(candleMesh, isHovered) {
  if (isHovered && candleMesh) {
    updateCandleHover(candleMesh);
  } else {
    clearCandleHover();
  }
}

export function updateCandleScrubber(rayPoint, chartGroup = null, onCandleSnapped = null) {
  const win = chartGroup || (activeChartWindows.length > 0 ? activeChartWindows[activeChartWindows.length - 1] : null);
  if (!win || !win.userData?.candleEntries || win.userData.candleEntries.length === 0) return;

  // Convert ray world hit point into chart local coordinates
  const localHit = win.worldToLocal(rayPoint.clone());

  // Check chart bounds
  if (localHit.x < -0.62 || localHit.x > 0.48) {
    clearCandleHover();
    clearCandleScrubber(win);
    return;
  }

  const entries = win.userData.candleEntries;
  let closest = entries[0];
  let minDiff = Infinity;
  let closestIdx = 0;

  for (let i = 0; i < entries.length; i++) {
    const diff = Math.abs(entries[i].posX - localHit.x);
    if (diff < minDiff) {
      minDiff = diff;
      closest = entries[i];
      closestIdx = i;
    }
  }

  // Update vertical guide line position
  if (win.userData.scrubberLine) {
    win.userData.scrubberLine.position.x = closest.posX;
    win.userData.scrubberLine.visible = true;
  }

  // Highlight candle and display OHLC pill
  if (closest.bodyMesh) {
    updateCandleHover(closest.bodyMesh);
  }

  if (win.userData.lastSnappedIdx !== closestIdx) {
    win.userData.lastSnappedIdx = closestIdx;
    if (onCandleSnapped) {
      onCandleSnapped(closestIdx, closest.data);
    }
  }
}

export function clearCandleScrubber(chartGroup = null) {
  clearCandleHover();
  const targets = chartGroup ? [chartGroup] : activeChartWindows;
  targets.forEach((win) => {
    if (!win || !win.userData) return;
    if (win.userData.scrubberLine) win.userData.scrubberLine.visible = false;
    if (win.userData.tooltipMesh) win.userData.tooltipMesh.visible = false;
    win.userData.lastSnappedIdx = -1;
  });
}

// ---------------------------------------------------------------------------
// 9. Real-Time WebSocket Trade Tick Updates (NO DUMMY STUBS)
// ---------------------------------------------------------------------------
export function applyLiveTickUpdate(tick) {
  if (!tick || !tick.price || activeChartWindows.length === 0) return;

  const targetSymbol = (tick.symbol || '').toUpperCase();
  const chartWin = activeChartWindows.find(w => (w.userData.ticker || '').toUpperCase() === targetSymbol) || activeChartWindows[activeChartWindows.length - 1];
  if (!chartWin || !chartWin.userData?.candles) return;

  const candles = chartWin.userData.candles;
  const lastIdx = candles.length - 1;
  const lastCandle = candles[lastIdx];

  // Update candle price statistics
  lastCandle.close = tick.price;
  lastCandle.high = Math.max(lastCandle.high, tick.price);
  lastCandle.low = Math.min(lastCandle.low, tick.price);
  lastCandle.volume += tick.volume || 100;
  lastCandle.isGreen = lastCandle.close >= lastCandle.open;

  // Flash update on candle body mesh with emissive burst
  const entries = chartWin.userData.candleEntries;
  if (entries && entries[lastIdx]) {
    const entry = entries[lastIdx];
    const minP = chartWin.userData.minP || (tick.price * 0.9);
    const rangeP = chartWin.userData.rangeP || (tick.price * 0.2);
    const chartBottomY = -0.12;
    const chartHeight = 0.34;
    const mapY = (val) => chartBottomY + ((val - minP) / rangeP) * chartHeight;

    const yOpen = mapY(lastCandle.open);
    const yClose = mapY(lastCandle.close);
    const newHeight = Math.max(0.014, Math.abs(yClose - yOpen));
    const newCenterY = (yOpen + yClose) * 0.5;

    entry.bodyMesh.position.y = newCenterY;
    entry.bodyMesh.scale.y = newHeight / 0.034;
    entry.bodyMesh.material.color.setHex(tick.isUp ? 0x38bdf8 : 0xef4444);
    if (entry.bodyMesh.material.emissive) {
      entry.bodyMesh.material.emissive.setHex(tick.isUp ? 0x0284c7 : 0xdc2626);
      entry.bodyMesh.material.emissiveIntensity = 0.95;
    }

    setTimeout(() => {
      if (entry?.bodyMesh?.material) {
        entry.bodyMesh.material.color.setHex(lastCandle.isGreen ? 0x10b981 : 0xef4444);
        if (entry.bodyMesh.material.emissive) {
          entry.bodyMesh.material.emissive.setHex(lastCandle.isGreen ? 0x065f46 : 0x991b1b);
          entry.bodyMesh.material.emissiveIntensity = 0.35;
        }
      }
    }, 280);
  }

  // Update Header text canvas with new price
  const canvas = chartWin.userData.headerCanvas;
  const headerObj = chartWin.userData.headerMesh || chartWin.userData.headerSprite;
  const hd = chartWin.userData.headerData;
  if (canvas && headerObj && hd) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 1024, 160);

    // Title Line: ${companyName} (${ticker})  •  $${price} in crisp bold white
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const curr = chartWin.userData.currency || '$';
    const updatedPrice = `${curr}${Number(tick.price).toFixed(2)}`;
    ctx.fillText(`${hd.name} (${hd.symbol})  •  ${updatedPrice}`, 16, 56);

    // Subtitle Line: ${assetType} • Allocation: ${alloc}% • 24h Return: +${ret}%      TOTAL NET WORTH: $1,245,000
    const rawRet = hd.change || '+3.4%';
    const ret = String(rawRet).startsWith('+') ? String(rawRet).substring(1) : rawRet;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '26px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`${hd.category} • Allocation: ${hd.allocation}% • 24h Return: +${ret}%      TOTAL NET WORTH: $1,245,000`, 16, 114);

    if (headerObj.material?.map) {
      headerObj.material.map.needsUpdate = true;
    }
  }
}

export function updateChartWithRealtimeData(symbol, liveData, targetScene = null) {
  if (!symbol || !liveData) return;
  const chartWin = activeChartWindows.find(w => (w.userData.ticker || '').toUpperCase() === symbol.toUpperCase());
  if (chartWin) {
    const basePrice = liveData.price || liveData.latestPrice || 140;
    renderChartDataContent(chartWin, basePrice, 0.035, 20);
  }
}

// ---------------------------------------------------------------------------
// 9. Interactive "Wolf of Wall Street" Easter Egg (Chest Thump Web Audio Synth)
// ---------------------------------------------------------------------------
let audioCtx = null;

export function safePlayChestThump() {
  try {
    playChestThump();
  } catch (e) {
    console.warn('[Wolf Egg] Audio thump error:', e);
  }
}

export function playChestThump() {
  try {
    if (typeof window === 'undefined') return;
    const ctx = (typeof window.getOrCreateAudioContext === 'function')
      ? window.getOrCreateAudioContext()
      : (window.sharedAudioContext || (audioCtx || (audioCtx = new (window.AudioContext || window.webkitAudioContext)())));
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Rhythmic pattern: Thump, Thump, Hummm...
    const beats = [0.0, 0.28, 0.65];
    beats.forEach((timeOffset, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (idx < 2) {
        // Deep chest thumps (75Hz -> 28Hz drop)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(75, now + timeOffset);
        osc.frequency.exponentialRampToValueAtTime(28, now + timeOffset + 0.18);

        gain.gain.setValueAtTime(0.8, now + timeOffset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + timeOffset + 0.18);
      } else {
        // The Matthew McConaughey hum (~110Hz sustained drone)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(110, now + timeOffset);

        gain.gain.setValueAtTime(0.001, now + timeOffset);
        gain.gain.linearRampToValueAtTime(0.4, now + timeOffset + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + timeOffset + 1.2);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + timeOffset);
      osc.stop(now + timeOffset + (idx < 2 ? 0.2 : 1.25));
    });
  } catch (e) {
    console.warn('[Wolf Egg] Chest thump error:', e);
  }
}

export function playSynthesizedVocalQuote(ctx) {
  if (!ctx) return;
  try {
    const startTime = ctx.currentTime + 0.55;

    // Formant vocalization sequence for:
    // "Fugayzi, fugazi. It's a whazy. It's a woozie. It's fairy dust."
    const syllables = [
      { t: 0.00, dur: 0.16, pitch: 130, f1: 350, f2: 900 },   // Fu-
      { t: 0.18, dur: 0.22, pitch: 165, f1: 530, f2: 1850 },  // gay-
      { t: 0.42, dur: 0.26, pitch: 140, f1: 270, f2: 2300 },  // zi,
      { t: 0.78, dur: 0.16, pitch: 130, f1: 350, f2: 900 },   // fu-
      { t: 0.96, dur: 0.22, pitch: 155, f1: 720, f2: 1150 },  // ga-
      { t: 1.20, dur: 0.28, pitch: 120, f1: 270, f2: 2300 },  // zi.
      { t: 1.60, dur: 0.14, pitch: 140, f1: 450, f2: 1100 },  // It's
      { t: 1.76, dur: 0.12, pitch: 135, f1: 650, f2: 1700 },  // a
      { t: 1.90, dur: 0.22, pitch: 160, f1: 550, f2: 1450 },  // wha-
      { t: 2.14, dur: 0.26, pitch: 130, f1: 270, f2: 2300 },  // zy.
      { t: 2.50, dur: 0.14, pitch: 140, f1: 450, f2: 1100 },  // It's
      { t: 2.66, dur: 0.12, pitch: 135, f1: 650, f2: 1700 },  // a
      { t: 2.80, dur: 0.24, pitch: 168, f1: 320, f2: 850 },   // woo-
      { t: 3.06, dur: 0.28, pitch: 125, f1: 270, f2: 2300 },  // zie.
      { t: 3.44, dur: 0.14, pitch: 135, f1: 450, f2: 1100 },  // It's
      { t: 3.60, dur: 0.24, pitch: 175, f1: 550, f2: 1850 },  // fai-
      { t: 3.86, dur: 0.16, pitch: 150, f1: 400, f2: 1600 },  // ry
      { t: 4.04, dur: 0.45, pitch: 115, f1: 500, f2: 1100 }   // dust.
    ];

    syllables.forEach(({ t, dur, pitch, f1, f2 }) => {
      const sylTime = startTime + t;

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(pitch, sylTime);
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.94, sylTime + dur);

      const f1Filter = ctx.createBiquadFilter();
      f1Filter.type = 'bandpass';
      f1Filter.frequency.setValueAtTime(f1, sylTime);
      f1Filter.Q.setValueAtTime(5.0, sylTime);

      const f2Filter = ctx.createBiquadFilter();
      f2Filter.type = 'bandpass';
      f2Filter.frequency.setValueAtTime(f2, sylTime);
      f2Filter.Q.setValueAtTime(6.0, sylTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, sylTime);
      gain.gain.linearRampToValueAtTime(0.16, sylTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, sylTime + dur);

      osc.connect(f1Filter);
      osc.connect(f2Filter);
      f1Filter.connect(gain);
      f2Filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(sylTime);
      osc.stop(sylTime + dur + 0.02);
    });
  } catch (err) {
    console.warn('[Wolf Egg] Formant voice synth error:', err);
  }
}

export function speakWolfQuote() {
  try {
    const ctx = (typeof window !== 'undefined' && typeof window.getOrCreateAudioContext === 'function')
      ? window.getOrCreateAudioContext()
      : (typeof window !== 'undefined' && window.sharedAudioContext ? window.sharedAudioContext : null);

    // 1. Web Audio Formant Voice Synthesis (Guaranteed audible inside Meta Quest WebXR)
    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      playSynthesizedVocalQuote(ctx);
    }

    // 2. Desktop Browser SpeechSynthesis (where native TTS is available)
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Stop any pending speech
      const utterance = new SpeechSynthesisUtterance(
        "Fugayzi, fugazi. It's a whazy. It's a woozie. It's fairy dust."
      );
      utterance.rate = 0.95; // Slightly deliberate cadence
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  } catch (e) {
    console.warn('[Wolf Egg] Speech synthesis error:', e);
  }
}

export function spawnWolfHoloBanner(chartWin) {
  if (!chartWin) return;
  if (chartWin.userData.wolfBanner) {
    chartWin.remove(chartWin.userData.wolfBanner);
    if (chartWin.userData.wolfBanner.geometry) chartWin.userData.wolfBanner.geometry.dispose();
    if (chartWin.userData.wolfBanner.material?.map) chartWin.userData.wolfBanner.material.map.dispose();
    if (chartWin.userData.wolfBanner.material) chartWin.userData.wolfBanner.material.dispose();
    chartWin.userData.wolfBanner = null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');

  // Background slate: sleek glass with rounded corners
  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(6, 6, 1012, 180, 24);
  } else {
    ctx.rect(6, 6, 1012, 180);
  }
  ctx.fill();

  // Glowing amber / gold border
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Subtle inner border line for luxury glass effect
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.32)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(14, 14, 996, 164, 18);
  } else {
    ctx.rect(14, 14, 996, 164);
  }
  ctx.stroke();

  // Header tag: Wolf of Wall Street badge
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🐺 MARK HANNA • THE WOLF OF WALL STREET 🐺', 512, 42);

  // Main iconic quote in bright warm gold
  ctx.fillStyle = '#fef08a';
  ctx.font = 'italic bold 31px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Georgia, serif';
  ctx.fillText('“Fugayzi, fugazi. It\'s a whazy. It\'s a woozie. It\'s fairy dust.”', 512, 96);

  // Subtitle / footer note
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 19px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('✨ Nobody knows if a stock goes up or down. Number one rule: keep them on the Ferris wheel. ✨', 512, 146);

  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;

  // Plane geometry: width 0.80m, height 0.15m (matches 1024x192 aspect ratio)
  const bannerGeo = new THREE.PlaneGeometry(0.80, 0.15);
  const bannerMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
  bannerMesh.position.set(0, 0.46, 0.05);
  bannerMesh.raycast = () => {};
  chartWin.add(bannerMesh);
  chartWin.userData.wolfBanner = bannerMesh;

  // Gentle float upward animation
  new TWEEN.Tween(bannerMesh.position)
    .to({ y: 0.54 }, 1200)
    .easing(TWEEN.Easing.Cubic.Out)
    .start();

  // Fade in, hold while spoken voice line delivers (~4.5s), then fade out
  new TWEEN.Tween(bannerMat)
    .to({ opacity: 1.0 }, 220)
    .chain(
      new TWEEN.Tween(bannerMat)
        .to({ opacity: 0.0 }, 700)
        .delay(4500)
        .onComplete(() => {
          if (bannerMesh.parent) bannerMesh.parent.remove(bannerMesh);
          bannerGeo.dispose();
          bannerMat.dispose();
          tex.dispose();
          if (chartWin.userData.wolfBanner === bannerMesh) {
            chartWin.userData.wolfBanner = null;
          }
        })
    )
    .start();
}

export function triggerWolfEasterEgg(chartWin = null, controller = null) {
  safePlayChestThump();
  speakWolfQuote();

  if (typeof window !== 'undefined' && window.triggerWolfChestHaptics) {
    window.triggerWolfChestHaptics(controller);
  }

  const targetWin = chartWin || (activeChartWindows.length > 0 ? activeChartWindows[activeChartWindows.length - 1] : null);
  if (!targetWin) return;

  const origScale = targetWin.scale.x || 1.0;

  // Thump 1: Punch at 0.0s
  new TWEEN.Tween(targetWin.scale)
    .to({ x: origScale * 1.045, y: origScale * 1.045, z: origScale * 1.045 }, 80)
    .yoyo(true)
    .repeat(1)
    .easing(TWEEN.Easing.Back.Out)
    .start();

  // Thump 2: Punch at 0.28s
  setTimeout(() => {
    new TWEEN.Tween(targetWin.scale)
      .to({ x: origScale * 1.07, y: origScale * 1.07, z: origScale * 1.07 }, 90)
      .yoyo(true)
      .repeat(1)
      .easing(TWEEN.Easing.Back.Out)
      .start();
  }, 280);

  // Hummm... at 0.65s: Gold border surge & floating 3D quote banner
  setTimeout(() => {
    if (targetWin.userData.borderLines?.material) {
      const origColor = targetWin.userData.borderLines.material.color.getHex();
      targetWin.userData.borderLines.material.color.setHex(0xf59e0b);
      targetWin.userData.borderLines.material.opacity = 0.95;
      setTimeout(() => {
        if (targetWin.userData.borderLines?.material) {
          targetWin.userData.borderLines.material.color.setHex(origColor);
          targetWin.userData.borderLines.material.opacity = 0.35;
        }
      }, 4500);
    }
    spawnWolfHoloBanner(targetWin);
  }, 650);
}

// ---------------------------------------------------------------------------
// 10. Utility & Animation Stubs
// ---------------------------------------------------------------------------
export function pulseChartHighlight(chartWin) {
  if (!chartWin) return;
  soundFx.playSelectSound();
  const tw = new TWEEN.Tween(chartWin.scale)
    .to({ x: 1.05, y: 1.05, z: 1.05 }, 120)
    .yoyo(true)
    .repeat(1)
    .easing(TWEEN.Easing.Cubic.Out);
  TWEEN.add(tw);
  tw.start();
}

export function handleTitleBarClick(chartWin) {
  if (!chartWin) return;
  const now = performance.now();
  if (!chartWin.userData._titleClicks) chartWin.userData._titleClicks = [];
  chartWin.userData._titleClicks = chartWin.userData._titleClicks.filter(t => now - t < 900);
  chartWin.userData._titleClicks.push(now);

  // Triple-click Net Worth / Header triggers Wolf Easter egg; single-click pulses highlight
  if (chartWin.userData._titleClicks.length >= 3) {
    chartWin.userData._titleClicks = [];
    triggerWolfEasterEgg(chartWin);
  } else {
    pulseChartHighlight(chartWin);
  }
}

export function getCurrentChart() {
  return activeChartWindows.length > 0 ? activeChartWindows[activeChartWindows.length - 1] : null;
}

export function getActiveChartData() {
  const cur = getCurrentChart();
  return cur?.userData || null;
}

export function show3DSplineChart(symbol, asset, camera, scene) {
  const chart = openOrFocusChart(symbol, asset, camera, scene);
  if (chart) setChartDisplayMode('spline', chart);
  return chart;
}

export function render3DCandlestickChart(symbol, asset, camera, scene) {
  const chart = openOrFocusChart(symbol, asset, camera, scene);
  if (chart) setChartDisplayMode('candlestick', chart);
  return chart;
}

export function updateActiveChart(camera = null, delta = 0.016) {
  // Update line resolution or billboard orientation if needed
  TWEEN.update();
}

// ============================================================================
// Macro Stress-Test / Risk Simulation Multi-Chart Synchronizer
// ============================================================================
export function updateAllChartsStressState(isActive) {
  activeChartWindows.forEach((win) => {
    if (win.userData?.redrawStressButton) {
      win.userData.redrawStressButton(isActive);
    }
    if (win.userData?.redrawStressBanner) {
      win.userData.redrawStressBanner(isActive);
    }
    if (win.userData?.basePrice) {
      const activePreset =
        RESOLUTION_PRESETS.find((p) => p.id === (win.userData?.currentPresetId || '1M_30m')) ||
        RESOLUTION_PRESETS[2];
      renderChartDataContent(win, win.userData.basePrice, activePreset.mult, activePreset.count);
    }
  });
}

// Auto-sync whenever macro stress test status changes
if (typeof onStressTestChange === 'function') {
  onStressTestChange((isActive) => {
    updateAllChartsStressState(isActive);
  });
}
