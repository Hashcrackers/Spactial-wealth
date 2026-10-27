import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { soundFx } from './audio.js';

// ============================================================================
// Multi-Window & Close Hitbox Registries
// ============================================================================
export const activeChartWindows = [];
export const closeHitboxRegistry = [];

let currentGlobalScene = null;
export function setChartsScene(scene) {
  currentGlobalScene = scene;
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

// Helper to generate simulated realistic OHLCV candles
function generateCandleData(basePrice = 120, count = 20, volatilityMult = 0.035) {
  const candles = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const delta = (Math.random() - 0.48) * (basePrice * volatilityMult);
    const open = price;
    const close = Math.max(1, open + delta);
    const high = Math.max(open, close) + Math.random() * (basePrice * volatilityMult * 0.55);
    const low = Math.max(0.5, Math.min(open, close) - Math.random() * (basePrice * volatilityMult * 0.55));
    const volume = Math.random() * 0.14 + 0.025;
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
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', 32, 34);
  const tex = new THREE.CanvasTexture(canvas);
  const textMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.045, 0.045),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
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
  // 1. [ 📈 SPLINE ] Toggle Button (Inactive default, dark glass)
  const splineCanvas = document.createElement('canvas');
  splineCanvas.width = 256; splineCanvas.height = 80;
  const sCtx = splineCanvas.getContext('2d');
  sCtx.fillStyle = '#111c30';
  sCtx.roundRect(4, 4, 248, 72, 14);
  sCtx.fill();
  sCtx.strokeStyle = '#334155';
  sCtx.lineWidth = 3;
  sCtx.roundRect(4, 4, 248, 72, 14);
  sCtx.stroke();
  sCtx.fillStyle = '#94a3b8';
  sCtx.font = 'bold 26px "Inter", "Segoe UI", sans-serif';
  sCtx.textAlign = 'center';
  sCtx.textBaseline = 'middle';
  sCtx.fillText('📈 SPLINE', 128, 40);

  const splineTex = new THREE.CanvasTexture(splineCanvas);
  const splinePill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.115, 0.042),
    new THREE.MeshBasicMaterial({ map: splineTex, transparent: true, side: THREE.DoubleSide })
  );
  splinePill.position.set(0.33, 0.32, 0.02);
  splinePill.userData.isChartModeToggle = true;
  splinePill.userData.targetMode = 'spline';
  splinePill.userData.parentWindow = chartWin;
  splinePill.userData.onClick = () => setChartDisplayMode('spline', chartWin);
  chartWin.add(splinePill);
  chartWin.userData.btnSpline = splinePill;

  // 2. [ 📊 CANDLES ] Toggle Button (Active cyan highlight)
  const candleCanvas = document.createElement('canvas');
  candleCanvas.width = 270; candleCanvas.height = 80;
  const cCtx = candleCanvas.getContext('2d');
  cCtx.fillStyle = '#06b6d4';
  cCtx.roundRect(4, 4, 262, 72, 14);
  cCtx.fill();
  cCtx.strokeStyle = '#38bdf8';
  cCtx.lineWidth = 3;
  cCtx.roundRect(4, 4, 262, 72, 14);
  cCtx.stroke();
  cCtx.fillStyle = '#ffffff';
  cCtx.font = 'bold 26px "Inter", "Segoe UI", sans-serif';
  cCtx.textAlign = 'center';
  cCtx.textBaseline = 'middle';
  cCtx.fillText('📊 CANDLES', 135, 40);

  const candleTex = new THREE.CanvasTexture(candleCanvas);
  const candlePill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.125, 0.042),
    new THREE.MeshBasicMaterial({ map: candleTex, transparent: true, side: THREE.DoubleSide })
  );
  candlePill.position.set(0.46, 0.32, 0.02);
  candlePill.userData.isChartModeToggle = true;
  candlePill.userData.targetMode = 'candles';
  candlePill.userData.parentWindow = chartWin;
  candlePill.userData.onClick = () => setChartDisplayMode('candles', chartWin);
  chartWin.add(candlePill);
  chartWin.userData.btnCandles = candlePill;

  // 3. Integrated [ ✕ ] close icon in the top right corner (x = 0.58, y = 0.32, z = 0.02)
  const closeGeo = new THREE.PlaneGeometry(0.055, 0.046);
  const closeMat = new THREE.MeshBasicMaterial({
    color: 0x221318,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide
  });
  const closeBtn = new THREE.Mesh(closeGeo, closeMat);
  closeBtn.position.set(0.58, 0.32, 0.02);
  closeBtn.userData.isCloseButton = true;
  closeBtn.userData.parentWindow = chartWin;
  chartWin.add(closeBtn);
  chartWin.userData.closeBtn = closeBtn;

  // Close Icon text (Clean white ✕ centered inside, z = 0.022m) - Static Mesh Plane (NOT a Sprite)
  const xCanvas = document.createElement('canvas');
  xCanvas.width = 128; xCanvas.height = 128;
  const xCtx = xCanvas.getContext('2d');
  xCtx.fillStyle = '#ffffff';
  xCtx.font = 'bold 64px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  xCtx.textAlign = 'center';
  xCtx.textBaseline = 'middle';
  xCtx.fillText('✕', 64, 64);
  const xTex = new THREE.CanvasTexture(xCanvas);
  const xMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.038, 0.038),
    new THREE.MeshBasicMaterial({ map: xTex, transparent: true, side: THREE.DoubleSide })
  );
  xMesh.position.set(0.58, 0.32, 0.022);
  xMesh.raycast = () => {}; // Non-blocking
  chartWin.add(xMesh);

  // Forward-Facing 3D Hitbox for raycasting (z = 0.05m)
  const hitBoxGeo = new THREE.BoxGeometry(0.12, 0.10, 0.08);
  const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
  const closeHitbox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
  closeHitbox.position.set(0.58, 0.32, 0.05);
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
  // Clone or retain the volume bars at the base so spatial depth is preserved
  const volGroup = new THREE.Group();
  candleData.forEach((c, idx) => {
    const x = startX + idx * stepX;
    const volHeight = Math.max(0.015, (c.volume || 0.05) * 0.8);
    const volGeo = new THREE.BoxGeometry(0.022, volHeight, 0.018);
    const volMat = new THREE.MeshBasicMaterial({
      color: c.close >= c.open ? 0x10b981 : 0xef4444,
      transparent: true,
      opacity: 0.45
    });
    const volMesh = new THREE.Mesh(volGeo, volMat);
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
  if (chartWin.userData.chartContentGroup) {
    chartWin.remove(chartWin.userData.chartContentGroup);
    chartWin.userData.chartContentGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
  }
  if (chartWin.userData.candleGroup) {
    chartWin.remove(chartWin.userData.candleGroup);
    chartWin.userData.candleGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
  }
  if (chartWin.userData.splineGroup) {
    chartWin.remove(chartWin.userData.splineGroup);
    chartWin.userData.splineGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
  }

  const contentGroup = new THREE.Group();
  chartWin.add(contentGroup);
  chartWin.userData.chartContentGroup = contentGroup;

  const candles = generateCandleData(basePrice, candleCount, presetMultiplier);
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

    // 1. Candlestick 3D Box Body (width 0.030m, height bodyHeight, depth 0.035m at z = 0.055m)
    const bodyGeo = new THREE.BoxGeometry(0.030, bodyHeight, 0.035);
    const bodyMat = new THREE.MeshStandardMaterial({
      color,
      emissive: isGreen ? 0x065f46 : 0x991b1b,
      emissiveIntensity: 0.35,
      roughness: 0.25,
      metalness: 0.2,
      transparent: true,
      opacity: 0.95
    });
    const candleMesh = new THREE.Mesh(bodyGeo, bodyMat);
    candleMesh.position.set(xPos, bodyCenterY, 0.055);
    candleMesh.userData = {
      isCandle: true,
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

    // 2. Wick (Slim central cylinder, radius 0.0018m, radialSegments 6 at z = 0.055m)
    const yHigh = mapPriceToY(c.high);
    const yLow = mapPriceToY(c.low);
    const wickHeight = Math.max(0.03, yHigh - yLow);
    const wickGeo = new THREE.CylinderGeometry(0.0018, 0.0018, wickHeight, 6);
    const wickMat = new THREE.MeshStandardMaterial({
      color,
      emissive: isGreen ? 0x065f46 : 0x991b1b,
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.5
    });
    const wick = new THREE.Mesh(wickGeo, wickMat);
    wick.position.set(xPos, (yHigh + yLow) * 0.5, 0.055);
    wick.raycast = () => {}; // Non-blocking
    candleGroup.add(wick);

    // 3. Semi-transparent Volume Pillar at bottom (width 0.026m, depth 0.025m at z = 0.025m)
    const volHeight = Math.max(0.015, c.volume * 0.65);
    const volGeo = new THREE.BoxGeometry(0.026, volHeight, 0.025);
    const volMat = new THREE.MeshStandardMaterial({
      color,
      emissive: isGreen ? 0x065f46 : 0x991b1b,
      emissiveIntensity: 0.18,
      roughness: 0.35,
      metalness: 0.15,
      transparent: true,
      opacity: 0.55
    });
    const vol = new THREE.Mesh(volGeo, volMat);
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
    const pGeo = new THREE.PlaneGeometry(0.09, 0.027);
    const pMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    const pMesh = new THREE.Mesh(pGeo, pMat);
    pMesh.position.set(0.53, levelY, 0.015);
    pMesh.raycast = () => {}; // Non-blocking
    contentGroup.add(pMesh);
  }

  // ==========================================
  // D. Time Axis & Volume Pillars Alignment
  // ==========================================
  // Horizontal time labels above bottom buttons: 09:30 11:00 12:30 14:00 15:30 16:00
  const timeCanvas = document.createElement('canvas');
  timeCanvas.width = 1024;
  timeCanvas.height = 64;
  const tCtx = timeCanvas.getContext('2d');
  tCtx.fillStyle = '#64748b';
  tCtx.font = '22px -apple-system, BlinkMacSystemFont, "Segoe UI", monospace';
  tCtx.textAlign = 'center';
  tCtx.textBaseline = 'middle';

  const timeLabels = ['09:30', '11:00', '12:30', '14:00', '15:30', '16:00'];
  timeLabels.forEach((label, idx) => {
    const fraction = idx / (timeLabels.length - 1);
    const canvasX = 30 + fraction * (1024 - 60);
    tCtx.fillText(label, canvasX, 32);
  });

  const timeTex = new THREE.CanvasTexture(timeCanvas);
  const timeGeo = new THREE.PlaneGeometry(totalChartWidth + 0.06, 0.032);
  const timeMat = new THREE.MeshBasicMaterial({ map: timeTex, transparent: true, side: THREE.DoubleSide });
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

    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 84;
    const ctx = canvas.getContext('2d');

    // Background pill shape
    ctx.fillStyle = isActive ? '#06b6d4' : '#111c30';
    ctx.roundRect(4, 4, 248, 76, 14);
    ctx.fill();

    // Subtle outline border
    ctx.strokeStyle = isActive ? '#38bdf8' : '#334155';
    ctx.lineWidth = 3;
    ctx.roundRect(4, 4, 248, 76, 14);
    ctx.stroke();

    // Preset label text
    ctx.fillStyle = isActive ? '#ffffff' : '#94a3b8';
    ctx.font = 'bold 27px "Inter", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(preset.label, 128, 42);

    const tex = new THREE.CanvasTexture(canvas);
    const geo = new THREE.PlaneGeometry(pillWidth, pillHeight);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
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
// 5. Main Multi-Window Spawner
// ---------------------------------------------------------------------------
export function openOrFocusChart(ticker, assetData = {}, camera = null, scene = null) {
  const targetCam = camera || (typeof window !== 'undefined' ? window.camera : null);
  const targetScene = scene || currentGlobalScene || (typeof window !== 'undefined' ? window.scene : null);
  if (!ticker || !targetCam || !targetScene) return;
  if (targetScene) currentGlobalScene = targetScene;

  // 1. If this ticker is ALREADY open, highlight it and bring forward
  const sym = String(ticker).toUpperCase();
  const existing = activeChartWindows.find(win => win.userData.ticker === ticker || win.userData.ticker === sym);
  if (existing) {
    pulseChartHighlight(existing);
    return existing;
  }

  // 2. Determine an available slot (0: Center, 1: Right, 2: Left)
  const occupiedSlots = activeChartWindows.map(win => win.userData.slotIndex);
  let targetSlot = 0;
  for (let s = 0; s < 3; s++) {
    if (!occupiedSlots.includes(s)) {
      targetSlot = s;
      break;
    }
  }

  // If 3 windows are already open, replace the oldest one cleanly
  if (activeChartWindows.length >= 3) {
    const oldest = activeChartWindows[0];
    closeChartWindow(oldest, targetScene);
  }

  // 3. Create Root Chart Window Group
  const chartWin = new THREE.Group();
  chartWin.userData.ticker = ticker;
  chartWin.userData.slotIndex = targetSlot;
  chartWin.userData.isChartWindow = true;
  chartWin.userData.displayMode = 'candles';
  chartWin.userData.activePresetId = '1M_30m';

  // 4. Arc Positioning around user gaze
  const slotYawAngles = [0, 0.46, -0.46]; // Center (0), Right (~26 deg), Left (~-26 deg)
  const yaw = slotYawAngles[targetSlot] || 0;

  const gaze = new THREE.Vector3();
  if (targetCam.getWorldDirection) {
    targetCam.getWorldDirection(gaze);
  } else if (targetCam.quaternion) {
    gaze.set(0, 0, -1).applyQuaternion(targetCam.quaternion);
  } else {
    gaze.set(0, 0, -1);
  }
  gaze.y = 0;
  if (gaze.lengthSq() < 0.001) gaze.set(0, 0, -1);
  gaze.normalize();

  const spawnVector = gaze.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  if (targetCam.position) {
    chartWin.position.copy(targetCam.position).add(spawnVector.multiplyScalar(1.25));
    chartWin.position.y = (targetCam.position.y || 1.45) + 0.05;
  } else {
    chartWin.position.set(0, 1.5, -1.25);
  }

  if (targetCam.quaternion) {
    chartWin.quaternion.copy(targetCam.quaternion);
  }
  if (yaw !== 0) {
    chartWin.rotateY(-yaw * 0.75); // Angle inward toward the viewer
  }

  // =========================================================================
  // 5. Optical Frosted Glass Slate Base Plate (z = 0.0m) - Spatial HUD Glass
  // =========================================================================
  const bgGeo = new THREE.PlaneGeometry(1.32, 0.82);
  const slateMat = new THREE.MeshPhysicalMaterial({
    color: 0x030712,
    transparent: true,
    opacity: 0.90,
    roughness: 0.15,
    metalness: 0.1,
    transmission: 0.2, // Gives realistic optical glass depth in XR
    ior: 1.4,
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

  // Dedicated Soft Holographic Terminal Lighting inside chartWin (Zero harsh glare)
  // 1. Gentle ambient fill light for 3D candles and volume pillars
  const holoFillLight = new THREE.AmbientLight(0xffffff, 0.50);
  chartWin.add(holoFillLight);

  // 2. Soft cyan rim directional light for 3D depth without center hotspot
  const holoRimLight = new THREE.DirectionalLight(0x06b6d4, 0.40);
  holoRimLight.position.set(0.65, 0.80, 0.60);
  chartWin.add(holoRimLight);

  // 6. Header Section (Top-Left)
  buildHeader(chartWin, ticker, assetData);

  // 7. Top-Right Mode Toggles & Close Button
  buildTopControls(chartWin, targetScene);

  // 7b. Golden Dollar Badge Wolf of Wall Street Easter Egg
  attachWolfEggButton(chartWin);

  // 8. 3D Candlesticks, Volumes & Right Price Axis
  let rawNumeric = assetData.priceNumeric;
  if (!rawNumeric && assetData.price) {
    const cleaned = String(assetData.price).replace(/[^0-9.-]+/g, '');
    rawNumeric = parseFloat(cleaned);
  }
  const basePrice = (rawNumeric && !isNaN(rawNumeric)) ? rawNumeric : 140;
  chartWin.userData.basePrice = basePrice;
  chartWin.userData.currency = String(assetData.price || '').startsWith('₹') ? '₹' : '$';
  renderChartDataContent(chartWin, basePrice, 0.035, 20);

  // 9. Bottom Resolution & Timeframe Pills
  buildTimeframePills(chartWin, '1M_30m');

  targetScene.add(chartWin);
  activeChartWindows.push(chartWin);
  soundFx.playSelectSound();
  console.log(`[Charts] Spawning rich 3D chart window #${activeChartWindows.length} for ${ticker} in slot ${targetSlot}`);
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

  soundFx.playCloseSound();

  // Remove from 3D scene
  const targetScene = scene || currentGlobalScene || chartWin.parent || (typeof window !== 'undefined' ? window.scene : null);
  if (chartWin.parent) chartWin.parent.remove(chartWin);
  else if (targetScene) targetScene.remove(chartWin);

  chartWin.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  });

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
    const updateBtn = (mesh, textStr, isActive) => {
      const canvas = document.createElement('canvas');
      canvas.width = 270; canvas.height = 80;
      const ctx = canvas.getContext('2d');
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
      ctx.fillText(textStr, 135, 40);

      if (mesh.material?.map) mesh.material.map.dispose();
      mesh.material.map = new THREE.CanvasTexture(canvas);
      mesh.material.needsUpdate = true;
    };

    updateBtn(chartWin.userData.btnSpline, '📈 SPLINE', normMode === 'spline');
    updateBtn(chartWin.userData.btnCandles, '📊 CANDLES', isCandle);
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
      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 84;
      const ctx = canvas.getContext('2d');

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
      ctx.fillText(p.label, 128, 42);

      if (mesh.material?.map) mesh.material.map.dispose();
      mesh.material.map = new THREE.CanvasTexture(canvas);
      mesh.material.needsUpdate = true;
    });
  }

  // 2. Regenerate 3D Candlesticks & Spline for this resolution
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

  // Reset previous candle
  if (activeHoveredCandle) {
    if (activeHoveredCandle.material?.color && activeHoveredCandle.userData?.originalColor !== undefined) {
      activeHoveredCandle.material.color.setHex(activeHoveredCandle.userData.originalColor);
      if (activeHoveredCandle.material.emissive) {
        const origIsGreen = activeHoveredCandle.userData.candleData?.close >= activeHoveredCandle.userData.candleData?.open;
        activeHoveredCandle.material.emissive.setHex(origIsGreen ? 0x065f46 : 0x991b1b);
        activeHoveredCandle.material.emissiveIntensity = 0.35;
      }
    }
    activeHoveredCandle.scale.set(1.0, 1.0, 1.0);
  }

  activeHoveredCandle = hitCandle;
  if (!hitCandle) return;

  // Highlight hovered candle
  if (hitCandle.material?.color) {
    hitCandle.material.color.setHex(0x38bdf8); // Bright electric cyan
    if (hitCandle.material.emissive) {
      hitCandle.material.emissive.setHex(0x0284c7);
      hitCandle.material.emissiveIntensity = 0.85;
    }
  }
  hitCandle.scale.set(1.15, 1.05, 1.15);

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
    if (activeHoveredCandle.material?.color && activeHoveredCandle.userData?.originalColor !== undefined) {
      activeHoveredCandle.material.color.setHex(activeHoveredCandle.userData.originalColor);
      if (activeHoveredCandle.material.emissive) {
        const origIsGreen = activeHoveredCandle.userData.candleData?.close >= activeHoveredCandle.userData.candleData?.open;
        activeHoveredCandle.material.emissive.setHex(origIsGreen ? 0x065f46 : 0x991b1b);
        activeHoveredCandle.material.emissiveIntensity = 0.35;
      }
    }
    activeHoveredCandle.scale.set(1.0, 1.0, 1.0);
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
    if (!audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return;
      audioCtx = new AudioCtxClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const now = audioCtx.currentTime;

    // Rhythmic pattern: Thump, Thump, Hummm...
    const beats = [0.0, 0.28, 0.65];
    beats.forEach((timeOffset, idx) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

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
      gain.connect(audioCtx.destination);

      osc.start(now + timeOffset);
      osc.stop(now + timeOffset + (idx < 2 ? 0.2 : 1.25));
    });
  } catch (e) {
    console.warn('[Wolf Egg] Chest thump error:', e);
  }
}

export function speakWolfQuote() {
  try {
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
