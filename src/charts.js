/**
 * Spatial Wealth - Photorealistic TradingView / Bloomberg Holographic Spatial HUD
 * Dual-Mode: 18-Point Spline Area & 3D Candlestick + Volume Depth Mode.
 * Robust OHLC Coordinate Mapping across [X: -1.5..1.5, Y: -0.65..0.65], Glassmorphism Plate & Interactive Micro-HUD.
 */

import * as THREE from 'three';
import { Text } from 'troika-three-text';
import * as TWEEN from '@tweenjs/tween.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { soundFx } from './audio.js';
import { formatCurrency, INDIAN_STOCKS } from './data.js';
import { fetchStockCandles } from './stock-api.js';
import { registerInteractiveObject, unregisterInteractiveObject } from './xr-manager.js';

let activeChartGroup = null;
let trackedPlanetMesh = null;
let chartTextLabels = [];
let currentChartMode = 'spline'; // 'spline' | 'candlestick'
let hoveredCandleMesh = null;

/**
 * Exact TradingView Dual-Parameter Timeframe & Candle Interval Resolution Configurations
 */
export const RESOLUTION_PRESETS = [
  { id: '1D_1m',  label: '1D · 1m',  fullText: '1 day in 1 minute intervals',    rangeDays: 1,    interval: '1m',  finnhubRes: '1',  candleCount: 30 },
  { id: '5D_5m',  label: '5D · 5m',  fullText: '5 days in 5 minutes intervals',   rangeDays: 5,    interval: '5m',  finnhubRes: '5',  candleCount: 32 },
  { id: '1M_30m', label: '1M · 30m', fullText: '1 month in 30 minutes intervals', rangeDays: 30,   interval: '30m', finnhubRes: '30', candleCount: 30 },
  { id: '3M_1h',  label: '3M · 1h',  fullText: '3 months in 1 hour intervals',    rangeDays: 90,   interval: '1h',  finnhubRes: '60', candleCount: 32 },
  { id: '6M_2h',  label: '6M · 2h',  fullText: '6 months in 2 hours intervals',   rangeDays: 180,  interval: '2h',  finnhubRes: '60', candleCount: 34 },
  { id: 'YTD_1d', label: 'YTD · 1D', fullText: 'Year to date in 1 day intervals', rangeDays: 'YTD',interval: '1d',  finnhubRes: 'D',  candleCount: 32 },
  { id: '1Y_1d',  label: '1Y · 1D',  fullText: '1 year in 1 day intervals',      rangeDays: 365,  interval: '1d',  finnhubRes: 'D',  candleCount: 36 },
  { id: '5Y_1w',  label: '5Y · 1W',  fullText: '5 years in 1 week intervals',    rangeDays: 1825, interval: '1w',  finnhubRes: 'W',  candleCount: 40 },
  { id: 'ALL_1M', label: 'ALL · 1M', fullText: 'All data in 1 month intervals',  rangeDays: 'ALL',interval: '1M',  finnhubRes: 'M',  candleCount: 42 }
];

let currentResolutionPreset = '1Y_1d';

export function getActiveResolutionPreset() {
  return currentResolutionPreset;
}

export function getTimeTicksForPreset(presetId) {
  switch (presetId) {
    case '1D_1m':
      return ['09:30', '11:00', '12:30', '14:00', '15:30', '16:00'];
    case '5D_5m':
      return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    case '1M_30m':
      return ['W1', 'W2', 'W3', 'W4', 'Current'];
    case '3M_1h':
      return ['3M Ago', '2M', '1M', 'Current'];
    case '6M_2h':
      return ['6M Ago', '4M', '2M', 'Current'];
    case 'YTD_1d':
      return ['Jan', 'Apr', 'Jul', 'Oct', 'Current'];
    case '1Y_1d':
      return ['1Y Ago', '9M', '6M', '3M', 'Current'];
    case '5Y_1w':
      return ['2021', '2022', '2023', '2024', '2025', '2026'];
    case 'ALL_1M':
      return ['2015', '2018', '2020', '2023', 'Current'];
    default:
      return ['1Y Ago', '9M', '6M', '3M', 'Current'];
  }
}

/**
 * Builds a planar 2D vertical gradient area fill mesh beneath the spline curve.
 * Top edge traces curve points; bottom edge anchors flat along baseline.
 */
function createAreaGradientMesh(points, baselineY, colorHex) {
  const count = points.length;
  const positions = [];
  const indices = [];

  for (let i = 0; i < count; i++) {
    const pt = points[i];
    // Top vertex (index: 2 * i)
    positions.push(pt.x, pt.y, 0.01);
    // Bottom vertex (index: 2 * i + 1)
    positions.push(pt.x, baselineY, 0.01);

    if (i < count - 1) {
      const topA = 2 * i;
      const btmA = 2 * i + 1;
      const topB = 2 * (i + 1);
      const btmB = 2 * (i + 1) + 1;

      // Triangle 1: topA -> btmA -> topB
      indices.push(topA, btmA, topB);
      // Triangle 2: btmA -> btmB -> topB
      indices.push(btmA, btmB, topB);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const color = new THREE.Color(colorHex);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: color },
      uBaselineY: { value: baselineY },
      uTopY: { value: 0.60 }
    },
    vertexShader: `
      varying float vY;
      void main() {
        vY = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uBaselineY;
      uniform float uTopY;
      varying float vY;

      void main() {
        float factor = clamp((vY - uBaselineY) / (uTopY - uBaselineY), 0.0, 1.0);
        float alpha = mix(0.02, 0.26, pow(factor, 1.25));
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1000;
  return mesh;
}

/**
 * Generates realistic historical prices for Spline curve tailored to timeframe & interval.
 */
export function generateRealistic18PointSeries(assetReturn = 0, volatility = 'medium', basePrice = 100, presetId = '1Y_1d') {
  const preset = RESOLUTION_PRESETS.find((p) => p.id === presetId) || RESOLUTION_PRESETS[6];
  const steps = preset.candleCount || 36;
  const points = [basePrice];

  let effectiveReturn = assetReturn;
  if (preset.id === '1D_1m') effectiveReturn = assetReturn * 0.04 + (Math.random() - 0.45) * 1.8;
  else if (preset.id === '5D_5m') effectiveReturn = assetReturn * 0.12 + (Math.random() - 0.45) * 3.5;
  else if (preset.id === '1M_30m') effectiveReturn = assetReturn * 0.30 + (Math.random() - 0.45) * 6.0;
  else if (preset.id === '3M_1h') effectiveReturn = assetReturn * 0.55;
  else if (preset.id === '6M_2h') effectiveReturn = assetReturn * 0.75;
  else if (preset.id === '5Y_1w') effectiveReturn = assetReturn * 2.8;
  else if (preset.id === 'ALL_1M') effectiveReturn = assetReturn * 4.5;

  const targetEndPrice = basePrice * (1 + effectiveReturn / 100);
  const drift = (targetEndPrice - basePrice) / (steps - 1);

  const volScale = (volatility || '').toLowerCase() === 'high' ? 0.045 : (volatility || '').toLowerCase() === 'low' ? 0.012 : 0.026;

  for (let i = 1; i < steps - 1; i++) {
    const expected = basePrice + drift * i;
    const harmonic1 = Math.sin(i * 1.55 + effectiveReturn * 0.1) * 0.6;
    const harmonic2 = Math.cos(i * 3.2 - effectiveReturn * 0.05) * 0.4;
    const noise = (harmonic1 + harmonic2) * (basePrice * volScale);

    points.push(Math.max(basePrice * 0.25, expected + noise));
  }

  points.push(targetEndPrice);
  return points;
}

/**
 * Generates synthetic OHLC candles tailored to asset returns, volatility, timeframe & resolution preset.
 */
export function generateCandles(assetData = {}, count = 32, basePrice = 100, presetId = '1Y_1d') {
  const preset = RESOLUTION_PRESETS.find((p) => p.id === presetId) || RESOLUTION_PRESETS[6];
  const isVolHigh = (assetData.volatility || '').toUpperCase() === 'HIGH';
  const returnVal = typeof assetData.returns === 'number' ? assetData.returns : parseFloat(assetData.returns) || 0;

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
  const volMult = isVolHigh ? 0.045 : (assetData.volatility || '').toUpperCase() === 'LOW' ? 0.014 : 0.028;

  const candles = [];
  let currentPrice = basePrice;
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < count; i++) {
    const expected = basePrice + drift * i;
    const wave = Math.sin(i * 1.5 + effectiveReturn * 0.08) * 0.6 + Math.cos(i * 3.1) * 0.4;
    const noise = (wave + (Math.random() - 0.48) * 1.6) * (basePrice * volMult);

    let close = i === count - 1 ? targetEndPrice : Math.max(basePrice * 0.2, expected + noise);
    if (Math.abs(close - currentPrice) < basePrice * 0.005) {
      close += (Math.random() > 0.5 ? 1 : -1) * basePrice * 0.012;
    }

    const open = currentPrice;
    const spread = Math.abs(noise) * (0.35 + Math.random() * 0.7) + basePrice * 0.008;
    const high = Math.max(open, close) + spread;
    const low = Math.max(basePrice * 0.15, Math.min(open, close) - spread);
    const isBullish = close >= open;

    const baseVol = 18000 + Math.random() * 26000;
    const volSpike = (Math.abs(close - open) / (basePrice * volMult || 1)) * 14000;
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

  return candles;
}

/**
 * Robust OHLC Candlesticks & Extruded Volume Bars.
 * @param {Object} assetData Asset holding metadata
 * @param {THREE.Group} parentGroup Parent chart group
 * @param {Object} bounds Shared coordinate mapping bounds
 * @returns {THREE.Group} candleGroup
 */
export function renderCandlesticks(assetData = {}, parentGroup, bounds = null) {
  if (!parentGroup) return null;

  // Clear previous candle group if any
  const existing = parentGroup.getObjectByName('candleGroup');
  if (existing) {
    parentGroup.remove(existing);
    existing.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else c.material.dispose();
      }
    });
  }

  const candleGroup = new THREE.Group();
  candleGroup.name = 'candleGroup';
  candleGroup.renderOrder = 1000;

  const preset = RESOLUTION_PRESETS.find((p) => p.id === currentResolutionPreset) || RESOLUTION_PRESETS[6];
  const count = bounds?.candles ? bounds.candles.length : (preset.candleCount || 36);
  const candleWidth = Math.max(0.024, Math.min(0.075, 2.1 / count));
  const candleDepth = 0.04;
  const stepX = 2.8 / Math.max(1, count - 1);
  const startX = -1.4;

  const candles = bounds?.candles || generateCandles(assetData, count, 100, currentResolutionPreset);

  const minP = bounds?.minP ?? Math.min(...candles.map((c) => c.low));
  const maxP = bounds?.maxP ?? Math.max(...candles.map((c) => c.high));
  const range = maxP - minP || 1;

  // Clean, realistic vertical dynamic range mapping into [-0.55, 0.55]
  const mapY = (val) => ((val - minP) / range) * 1.1 - 0.55;
  const maxVol = Math.max(...candles.map((c) => c.volume)) || 1;

  candles.forEach((c, i) => {
    const x = startX + i * stepX;
    const yOpen = mapY(c.open);
    const yClose = mapY(c.close);
    const yHigh = mapY(c.high);
    const yLow = mapY(c.low);

    const isBull = c.close >= c.open;
    const color = isBull ? 0x10b981 : 0xef4444;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 0.38,
      roughness: 0.2,
      metalness: 0.1
    });

    const bodyHeight = Math.max(0.025, Math.abs(yClose - yOpen));
    const bodyCenterY = (yOpen + yClose) / 2;

    // 1. Candle Body Box
    const bodyGeom = new THREE.BoxGeometry(candleWidth, bodyHeight, candleDepth);
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    bodyMesh.position.set(x, bodyCenterY, 0.02);
    bodyMesh.name = `CandleBody_${i}`;
    bodyMesh.renderOrder = 1000;
    bodyMesh.userData = {
      isCandle: true,
      index: i,
      candleData: c,
      posX: x,
      topY: yHigh
    };
    candleGroup.add(bodyMesh);

    // 2. Wick (Thin Cylinder)
    const wickHeight = Math.max(0.04, yHigh - yLow);
    const wickCenterY = (yHigh + yLow) / 2;
    const wickGeom = new THREE.CylinderGeometry(0.004, 0.004, wickHeight, 6);
    const wickMesh = new THREE.Mesh(wickGeom, bodyMat);
    wickMesh.position.set(x, wickCenterY, 0.02);
    wickMesh.renderOrder = 1000;
    candleGroup.add(wickMesh);

    // 3. Extruded Volume Bar at the bottom
    const volHeight = 0.06 + (c.volume / maxVol) * 0.22;
    const volGeom = new THREE.BoxGeometry(candleWidth * 0.85, volHeight, candleDepth * 0.6);
    const volMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.35, depthWrite: false });
    const volMesh = new THREE.Mesh(volGeom, volMat);
    volMesh.position.set(x, -0.75 + volHeight / 2, 0.02);
    volMesh.renderOrder = 1000;
    candleGroup.add(volMesh);
  });

  parentGroup.add(candleGroup);
  return candleGroup;
}

/**
 * Creates and displays a photorealistic TradingView / Bloomberg Holographic Financial HUD.
 * Summons the chart directly into the user's viewport personal space with a glowing laser tether back to the planet.
 * @param {THREE.Mesh | Object} planetMeshOrStockData The selected planet mesh or stock metadata object
 * @param {THREE.Scene} scene The Three.js scene
 * @param {Object} options Optional configuration (camera, isVR, renderer)
 * @returns {THREE.Group}
 */
export function show3DSplineChart(planetMeshOrStockData, scene, options = {}) {
  // Clear any existing active chart
  if (activeChartGroup && scene) {
    if (trackedPlanetMesh?.userData?.textLabel) {
      trackedPlanetMesh.userData.textLabel.visible = true;
    }
    if (activeChartGroup.userData?.registeredButtons) {
      activeChartGroup.userData.registeredButtons.forEach((btn) => unregisterInteractiveObject(btn));
    }
    if (activeChartGroup.userData?.tetherLine) {
      scene.remove(activeChartGroup.userData.tetherLine);
      activeChartGroup.userData.tetherLine.geometry?.dispose();
      activeChartGroup.userData.tetherLine.material?.dispose();
    }
    if (activeChartGroup.userData?.beaconMesh) {
      scene.remove(activeChartGroup.userData.beaconMesh);
      activeChartGroup.userData.beaconMesh.geometry?.dispose();
      activeChartGroup.userData.beaconMesh.material?.dispose();
    }
    scene.remove(activeChartGroup);
    activeChartGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
    activeChartGroup = null;
    trackedPlanetMesh = null;
    chartTextLabels = [];
  }

  if (!planetMeshOrStockData || !scene) return null;

  soundFx.playSelectSound();

  let asset = {};
  let targetPlanet = null;

  if (planetMeshOrStockData.isObject3D) {
    targetPlanet = planetMeshOrStockData;
    asset = planetMeshOrStockData.userData || {};
    if (planetMeshOrStockData.userData?.textLabel) {
      planetMeshOrStockData.userData.textLabel.visible = false;
    }
  } else if (planetMeshOrStockData && typeof planetMeshOrStockData === 'object') {
    asset = planetMeshOrStockData;
    const sym = (asset.symbol || asset.ticker || '').toUpperCase();
    if (sym && scene) {
      scene.traverse((child) => {
        if (child.userData?.isAssetNode && (child.userData.ticker?.toUpperCase() === sym || child.userData.symbol?.toUpperCase() === sym)) {
          targetPlanet = child;
        }
      });
    }
  } else {
    return null;
  }

  trackedPlanetMesh = targetPlanet;

  const chartGroup = new THREE.Group();
  chartGroup.name = 'TradingViewBloombergHUD';

  const symbol = (asset.ticker || asset.symbol || 'AST').toUpperCase();
  const isINR = (asset.currency === 'INR') || (asset.exchange === 'NSE') || (asset.exchange === 'BSE') || INDIAN_STOCKS.some((s) => s.symbol === symbol);
  const currSym = isINR ? '₹' : '$';
  const returnVal = typeof asset.returns === 'number' ? asset.returns : parseFloat(asset.returns) || 0;
  const isPositive = returnVal >= 0;

  // Subdued financial terminal theme: Emerald green for bull, Coral red for bear
  const themeColorHex = isPositive ? 0x10b981 : 0xef4444;

  // Plate Dimensions: width = 3.6, height = 2.25 (to comfortably fit resolution selector bar)
  const panelWidth = 3.6;
  const panelHeight = 2.25;

  // =========================================================================
  // SUMMON CHART DIRECTLY INTO USER'S PERSONAL VIEWPORT SPACE
  // =========================================================================
  const camera = options.camera;
  const isVR = Boolean(options.isVR || options.renderer?.xr?.isPresenting);

  if (isVR && camera) {
    // In VR: Position chart 1.5m directly in front of the viewer's current head pose
    const headPos = camera.getWorldPosition(new THREE.Vector3());
    const headDir = new THREE.Vector3();
    camera.getWorldDirection(headDir);
    headDir.y = 0; // Lock strictly to horizontal plane to guarantee chart stands upright
    if (headDir.lengthSq() < 0.001) headDir.set(0, 0, -1);
    headDir.normalize();

    // Spawn 1.5m in front of user, lifted slightly to clear wrist HUD (+0.15m)
    const targetChartPos = headPos.clone().add(headDir.clone().multiplyScalar(1.5));
    targetChartPos.y = headPos.y + 0.15;
    chartGroup.position.copy(targetChartPos);

    // Billboarding: Ensure chart stands perfectly upright facing the camera
    chartGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), headDir.clone().negate());
    chartGroup.scale.set(0.65, 0.65, 0.65);
  } else {
    // In Desktop: Smoothly bring the chart to (0, 1.8, 4.0) without shifting OrbitControls
    chartGroup.position.set(0, 1.8, 2.2);
    chartGroup.rotation.set(0, 0, 0);
    chartGroup.scale.set(0.70, 0.70, 0.70);

    const tw = new TWEEN.Tween(chartGroup.position)
      .to({ x: 0, y: 1.8, z: 4.0 }, 600)
      .easing(TWEEN.Easing.Cubic.Out);
    TWEEN.add(tw);
    tw.start();
  }

  chartGroup.renderOrder = 10;

  const preset = RESOLUTION_PRESETS.find((p) => p.id === currentResolutionPreset) || RESOLUTION_PRESETS[6];
  const count = preset.candleCount || 36;
  const basePrice = Number(asset.price ?? asset.latestPrice ?? 100);
  const candles = generateCandles(asset, count, basePrice, currentResolutionPreset);
  const history = candles.map((c) => c.close);

  const minP = Math.min(...candles.map((c) => c.low));
  const maxP = Math.max(...candles.map((c) => c.high));
  const range = maxP - minP || 1;

  const stepX = 2.8 / Math.max(1, count - 1);
  const startX = -1.4;
  const baselineY = -0.72;

  // Unified Y-space mapping: dollar value -> [-0.55, 0.55]
  const mapY = (val) => ((val - minP) / range) * 1.1 - 0.55;

  // 1. Sleek Frosted Glassmorphism Backdrop Plate
  const panelGeo = new THREE.PlaneGeometry(panelWidth, panelHeight);
  const panelMat = new THREE.MeshPhysicalMaterial({
    color: 0x050c18,
    transparent: true,
    opacity: 0.86,
    roughness: 0.2,
    metalness: 0.1,
    transmission: 0.85,
    thickness: 0.25,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide
  });

  const glassPanel = new THREE.Mesh(panelGeo, panelMat);
  glassPanel.position.set(0, 0, -0.04);
  glassPanel.renderOrder = 10;
  chartGroup.add(glassPanel);

  // Subtle 0.5px Dark Slate Border (#334155)
  const borderGeo = new THREE.EdgesGeometry(panelGeo);
  const borderMat = new THREE.LineBasicMaterial({
    color: 0x334155,
    transparent: true,
    opacity: 0.75
  });
  const panelBorder = new THREE.LineSegments(borderGeo, borderMat);
  panelBorder.position.set(0, 0, -0.035);
  panelBorder.renderOrder = 10;
  chartGroup.add(panelBorder);

  // 2. Glowing Neon Laser Tether Beam extending from chart bottom back to planet or sun
  const tetherPts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0)
  ];
  const tetherGeo = new THREE.BufferGeometry().setFromPoints(tetherPts);
  const tetherMat = new THREE.LineDashedMaterial({
    color: themeColorHex,
    dashSize: 0.12,
    gapSize: 0.06,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending
  });
  const tetherLine = new THREE.Line(tetherGeo, tetherMat);
  tetherLine.computeLineDistances();
  tetherLine.renderOrder = 998;
  scene.add(tetherLine);

  // Surface Beacon Glow Ring at target
  const beaconGeo = new THREE.RingGeometry(0.04, 0.12, 32);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: themeColorHex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending
  });
  const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
  beaconMesh.rotation.x = Math.PI / 2;
  beaconMesh.renderOrder = 998;
  scene.add(beaconMesh);

  // 3. Financial Support & Resistance Gridlines (4 Horizontal Lines)
  const gridLineCount = 3;
  const priceLabels = [];
  for (let g = 0; g <= gridLineCount; g++) {
    const gy = -0.55 + (g / gridLineCount) * 1.1;
    const gridPts = [
      new THREE.Vector3(-1.4, gy, 0.01),
      new THREE.Vector3(1.4, gy, 0.01)
    ];
    const gridGeo = new THREE.BufferGeometry().setFromPoints(gridPts);
    const gridMat = new THREE.LineDashedMaterial({
      color: 0x334155,
      dashSize: 0.05,
      gapSize: 0.03,
      transparent: true,
      opacity: 0.4
    });
    const gridLine = new THREE.Line(gridGeo, gridMat);
    gridLine.computeLineDistances();
    gridLine.renderOrder = 1000;
    chartGroup.add(gridLine);

    // Right-aligned Price Level Label
    const priceVal = minP + (g / gridLineCount) * range;
    const priceLabel = new Text();
    priceLabel.text = isINR
      ? (priceVal >= 1000 ? `₹${Math.round(priceVal).toLocaleString('en-IN')}` : `₹${priceVal.toFixed(1)}`)
      : (priceVal >= 1000 ? `$${Math.round(priceVal).toLocaleString()}` : `$${priceVal.toFixed(1)}`);
    priceLabel.fontSize = 0.075;
    priceLabel.color = 0x64748b;
    priceLabel.anchorX = 'left';
    priceLabel.anchorY = 'middle';
    priceLabel.position.set(1.45, gy, 0.02);
    priceLabel.renderOrder = 1000;
    priceLabel.sync();
    chartGroup.add(priceLabel);
    chartTextLabels.push(priceLabel);
    priceLabels.push(priceLabel);
  }

  // =========================================================================
  // 4. HIGH-PRECISION SPLINE AREA VECTOR LAYER (Container)
  // =========================================================================
  const splineContainer = new THREE.Group();
  splineContainer.name = 'SplineContainerLayer';
  splineContainer.renderOrder = 1000;

  // 1. Generate smooth Catmull-Rom sampled points across time steps
  const rawPoints3D = [];
  for (let i = 0; i < count; i++) {
    const x = startX + i * stepX;
    const y = mapY(history[i]);
    rawPoints3D.push(new THREE.Vector3(x, y, 0.02));
  }
  const splineCurve = new THREE.CatmullRomCurve3(rawPoints3D, false, 'catmullrom', 0.35);
  const smoothPoints = splineCurve.getPoints(120);

  // 2. Modern 2D Planar Area Gradient Fill (smooth vertical alpha fade)
  const areaMesh = createAreaGradientMesh(smoothPoints, baselineY, themeColorHex);
  splineContainer.add(areaMesh);

  // 3. Razor-Sharp TradingView / Bloomberg Vector Line (Line2 with linewidth: 3.2)
  const linePositions = [];
  smoothPoints.forEach((p) => {
    linePositions.push(p.x, p.y, 0.022);
  });

  const lineGeo = new LineGeometry();
  lineGeo.setPositions(linePositions);

  const vectorLineMat = new LineMaterial({
    color: themeColorHex,
    linewidth: 3.2,
    worldUnits: false,
    resolution: new THREE.Vector2(window.innerWidth || 1920, window.innerHeight || 1080),
    transparent: true,
    opacity: 0.95,
    depthTest: true,
    depthWrite: false
  });

  const vectorLine = new Line2(lineGeo, vectorLineMat);
  vectorLine.computeLineDistances();
  vectorLine.renderOrder = 1000;
  splineContainer.add(vectorLine);

  // 4. Endpoint Marker
  const lastPoint = smoothPoints[smoothPoints.length - 1];

  const ringGeo = new THREE.RingGeometry(0.022, 0.034, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: themeColorHex,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const pulseRing = new THREE.Mesh(ringGeo, ringMat);
  pulseRing.position.set(lastPoint.x, lastPoint.y, 0.024);
  pulseRing.renderOrder = 1000;
  splineContainer.add(pulseRing);

  const dotGeo = new THREE.CircleGeometry(0.015, 32);
  const dotMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const coreDot = new THREE.Mesh(dotGeo, dotMat);
  coreDot.position.set(lastPoint.x, lastPoint.y, 0.025);
  coreDot.renderOrder = 1000;
  splineContainer.add(coreDot);

  // Floating Price Badge Pill
  const pillW = 0.46;
  const pillH = 0.14;
  const pillGeo = new THREE.PlaneGeometry(pillW, pillH);
  const pillMat = new THREE.MeshBasicMaterial({
    color: 0x050c18,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const pillMesh = new THREE.Mesh(pillGeo, pillMat);
  pillMesh.position.set(lastPoint.x - 0.30, lastPoint.y + 0.06, 0.026);
  pillMesh.renderOrder = 1000;
  splineContainer.add(pillMesh);

  const pillBorderGeo = new THREE.EdgesGeometry(pillGeo);
  const pillBorderMat = new THREE.LineBasicMaterial({
    color: themeColorHex,
    transparent: true,
    opacity: 0.75
  });
  const pillBorder = new THREE.LineSegments(pillBorderGeo, pillBorderMat);
  pillBorder.position.set(lastPoint.x - 0.30, lastPoint.y + 0.06, 0.027);
  pillBorder.renderOrder = 1000;
  splineContainer.add(pillBorder);

  const pillText = new Text();
  pillText.text = `${isPositive ? '+' : ''}${returnVal}%`;
  pillText.fontSize = 0.076;
  pillText.color = themeColorHex;
  pillText.anchorX = 'center';
  pillText.anchorY = 'middle';
  pillText.position.set(lastPoint.x - 0.30, lastPoint.y + 0.06, 0.030);
  pillText.renderOrder = 1000;
  pillText.sync();
  splineContainer.add(pillText);
  chartTextLabels.push(pillText);

  chartGroup.add(splineContainer);

  // =========================================================================
  // 5. 3D CANDLESTICK & VOLUME DEPTH LAYER
  // =========================================================================
  const candleGroup = renderCandlesticks(asset, chartGroup, { candles, minP, maxP, range });
  if (candleGroup) {
    candleGroup.visible = (currentChartMode === 'candlestick');
  }

  // =========================================================================
  // 6. FLOATING 3D CANDLESTICK MICRO-HUD TOOLTIP BADGE
  // =========================================================================
  const tooltipGroup = new THREE.Group();
  tooltipGroup.name = 'CandleTooltipBadge';
  tooltipGroup.visible = false;
  tooltipGroup.renderOrder = 1001;

  const ttBgGeo = new THREE.PlaneGeometry(2.1, 0.26);
  const ttBgMat = new THREE.MeshBasicMaterial({
    color: 0x030712,
    transparent: true,
    opacity: 0.94,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const ttBg = new THREE.Mesh(ttBgGeo, ttBgMat);
  ttBg.renderOrder = 1001;
  tooltipGroup.add(ttBg);

  const ttBorderGeo = new THREE.EdgesGeometry(ttBgGeo);
  const ttBorderMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.9 });
  const ttBorder = new THREE.LineSegments(ttBorderGeo, ttBorderMat);
  ttBorder.renderOrder = 1001;
  tooltipGroup.add(ttBorder);

  const ttText = new Text();
  ttText.text = 'O: $0 | H: $0 | L: $0 | C: $0 | Vol: 0';
  ttText.fontSize = 0.068;
  ttText.color = 0x00f0ff;
  ttText.anchorX = 'center';
  ttText.anchorY = 'middle';
  ttText.position.set(0, 0, 0.015);
  ttText.renderOrder = 1001;
  ttText.sync();
  tooltipGroup.add(ttText);
  chartTextLabels.push(ttText);

  chartGroup.add(tooltipGroup);

  // =========================================================================
  // 7. DYNAMIC TIME TICKS ALONG X-AXIS BASELINE
  // =========================================================================
  const timeTicks = getTimeTicksForPreset(currentResolutionPreset);
  const timeTickLabels = [];
  for (let t = 0; t < timeTicks.length; t++) {
    const tx = -1.4 + (t / (timeTicks.length - 1)) * 2.8;
    const tickText = new Text();
    tickText.text = timeTicks[t];
    tickText.fontSize = 0.075;
    tickText.color = 0x64748b;
    tickText.anchorX = 'center';
    tickText.anchorY = 'top';
    tickText.position.set(tx, baselineY - 0.04, 0.02);
    tickText.renderOrder = 1000;
    tickText.sync();
    chartGroup.add(tickText);
    chartTextLabels.push(tickText);
    timeTickLabels.push(tickText);
  }

  // 8. Crisp Bloomberg HUD Header Typography
  const headerTitle = new Text();
  const exchangeTag = asset.exchange ? `:${asset.exchange}` : (isINR ? ':NSE' : '');
  const displayPrice = asset.price ?? asset.latestPrice;
  const formattedPrice = displayPrice !== undefined && displayPrice !== null
    ? (isINR
        ? (displayPrice >= 1000 ? `₹${Number(displayPrice).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `₹${Number(displayPrice).toFixed(2)}`)
        : `$${Number(displayPrice).toFixed(2)}`)
    : (asset.formattedValue || '$0');
  headerTitle.text = `${asset.name || 'Asset'} (${symbol}${exchangeTag})  •  ${formattedPrice}`;
  headerTitle.fontSize = 0.125;
  headerTitle.color = 0xf8fafc;
  headerTitle.anchorX = 'left';
  headerTitle.anchorY = 'top';
  headerTitle.position.set(-panelWidth / 2 + 0.14, panelHeight / 2 - 0.10, 0.03);
  headerTitle.renderOrder = 1000;
  headerTitle.sync();
  chartGroup.add(headerTitle);
  chartTextLabels.push(headerTitle);

  const headerSub = new Text();
  const allocationPart = asset.allocation !== undefined ? `Allocation: ${asset.allocation}%` : `Sector: ${asset.sector || asset.category || 'Equities'}`;
  headerSub.text = `${asset.category || asset.sector || 'Holding'}  •  ${allocationPart}  •  24h Return: ${isPositive ? '+' : ''}${returnVal}%`;
  headerSub.fontSize = 0.082;
  headerSub.color = 0x94a3b8;
  headerSub.anchorX = 'left';
  headerSub.anchorY = 'top';
  headerSub.position.set(-panelWidth / 2 + 0.14, panelHeight / 2 - 0.24, 0.03);
  headerSub.renderOrder = 1000;
  headerSub.sync();
  chartGroup.add(headerSub);
  chartTextLabels.push(headerSub);

  // 9. 3D In-Scene Segmented Toggle Buttons [ 📈 Spline | 📊 Candlestick ]
  const registeredButtons = [];

  const toggleBtnSplineGeo = new THREE.PlaneGeometry(0.56, 0.14);
  const toggleBtnCandleGeo = new THREE.PlaneGeometry(0.66, 0.14);
  const toggleBtnMatActive = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
  const toggleBtnMatInactive = new THREE.MeshBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });

  const btn3DSpline = new THREE.Mesh(toggleBtnSplineGeo, currentChartMode === 'spline' ? toggleBtnMatActive : toggleBtnMatInactive);
  btn3DSpline.position.set(0.55, panelHeight / 2 - 0.15, 0.035);
  btn3DSpline.userData = { isChartModeToggle: true, targetMode: 'spline', isInteractive: true, isVRButton: true };
  btn3DSpline.renderOrder = 1000;
  chartGroup.add(btn3DSpline);
  registerInteractiveObject(btn3DSpline, () => {
    setChartDisplayMode('spline');
  });
  registeredButtons.push(btn3DSpline);

  const txt3DSpline = new Text();
  txt3DSpline.text = '📈 SPLINE';
  txt3DSpline.fontSize = 0.062;
  txt3DSpline.color = currentChartMode === 'spline' ? 0x00f0ff : 0x94a3b8;
  txt3DSpline.anchorX = 'center';
  txt3DSpline.anchorY = 'middle';
  txt3DSpline.position.set(0.55, panelHeight / 2 - 0.15, 0.045);
  txt3DSpline.renderOrder = 1000;
  txt3DSpline.sync();
  chartGroup.add(txt3DSpline);
  chartTextLabels.push(txt3DSpline);

  const btn3DCandle = new THREE.Mesh(toggleBtnCandleGeo, currentChartMode === 'candlestick' ? toggleBtnMatActive : toggleBtnMatInactive);
  btn3DCandle.position.set(1.20, panelHeight / 2 - 0.15, 0.035);
  btn3DCandle.userData = { isChartModeToggle: true, targetMode: 'candlestick', isInteractive: true, isVRButton: true };
  btn3DCandle.renderOrder = 1000;
  chartGroup.add(btn3DCandle);
  registerInteractiveObject(btn3DCandle, () => {
    setChartDisplayMode('candlestick');
  });
  registeredButtons.push(btn3DCandle);

  const txt3DCandle = new Text();
  txt3DCandle.text = '📊 CANDLES';
  txt3DCandle.fontSize = 0.062;
  txt3DCandle.color = currentChartMode === 'candlestick' ? 0x00f0ff : 0x94a3b8;
  txt3DCandle.anchorX = 'center';
  txt3DCandle.anchorY = 'middle';
  txt3DCandle.position.set(1.20, panelHeight / 2 - 0.15, 0.045);
  txt3DCandle.renderOrder = 1000;
  txt3DCandle.sync();
  chartGroup.add(txt3DCandle);
  chartTextLabels.push(txt3DCandle);

  // 10. Minimal Close [X] Button at Top-Right
  const closeBtnGeo = new THREE.PlaneGeometry(0.18, 0.14);
  const closeBtnMat = new THREE.MeshBasicMaterial({
    color: 0x334155,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const closeBtn = new THREE.Mesh(closeBtnGeo, closeBtnMat);
  closeBtn.position.set(panelWidth / 2 - 0.15, panelHeight / 2 - 0.15, 0.035);
  closeBtn.name = 'CloseChartButton';
  closeBtn.userData = { isCloseButton: true, isInteractive: true, isVRButton: true };
  closeBtn.renderOrder = 1000;
  chartGroup.add(closeBtn);
  registerInteractiveObject(closeBtn, () => {
    removeCurrentChart(scene);
  });
  registeredButtons.push(closeBtn);

  const closeText = new Text();
  closeText.text = '✕';
  closeText.fontSize = 0.095;
  closeText.color = 0x94a3b8;
  closeText.anchorX = 'center';
  closeText.anchorY = 'middle';
  closeText.position.set(panelWidth / 2 - 0.15, panelHeight / 2 - 0.15, 0.045);
  closeText.renderOrder = 1000;
  closeText.sync();
  chartGroup.add(closeText);
  chartTextLabels.push(closeText);

  // =========================================================================
  // 11. TRADINGVIEW DUAL-PARAMETER TIMEFRAME & INTERVAL RESOLUTION BAR (9 Pills)
  // =========================================================================
  const resBtnWidth = 0.33;
  const resBtnHeight = 0.11;
  const resBtnGap = 0.035;
  const resStartX = -((RESOLUTION_PRESETS.length - 1) * (resBtnWidth + resBtnGap)) / 2;
  const resBarY = -panelHeight / 2 + 0.12;

  const resolutionButtons = [];

  RESOLUTION_PRESETS.forEach((p, i) => {
    const rx = resStartX + i * (resBtnWidth + resBtnGap);
    const isActive = p.id === currentResolutionPreset;

    const btnGeo = new THREE.PlaneGeometry(resBtnWidth, resBtnHeight);
    const btnMat = new THREE.MeshStandardMaterial({
      color: isActive ? 0x0891b2 : 0x0f172a,
      roughness: 0.3,
      metalness: 0.2,
      emissive: new THREE.Color(isActive ? 0x00f0ff : 0x0f172a),
      emissiveIntensity: isActive ? 0.45 : 0.20,
      transparent: true,
      opacity: 0.90,
      side: THREE.DoubleSide
    });
    const btnMesh = new THREE.Mesh(btnGeo, btnMat);
    btnMesh.position.set(rx, resBarY, 0.035);
    btnMesh.name = `ResBtn_${p.id}`;
    btnMesh.userData = {
      isVRButton: true,
      isResolutionPreset: true,
      action: 'setResolution',
      presetId: p.id,
      isInteractive: true,
      baseColor: isActive ? 0x0891b2 : 0x0f172a,
      hoverColor: 0x06b6d4,
      emissiveColor: 0x06b6d4,
      baseEmissiveIntensity: isActive ? 0.45 : 0.20,
      hoverEmissiveIntensity: 0.80,
      borderColor: isActive ? 0x00f0ff : 0x334155,
      originalZ: 0.035
    };
    btnMesh.renderOrder = 1000;
    chartGroup.add(btnMesh);

    const borderGeo = new THREE.EdgesGeometry(btnGeo);
    const borderMat = new THREE.LineBasicMaterial({
      color: isActive ? 0x00f0ff : 0x334155,
      transparent: true,
      opacity: 0.85
    });
    const border = new THREE.LineSegments(borderGeo, borderMat);
    border.position.set(rx, resBarY, 0.036);
    border.renderOrder = 1000;
    chartGroup.add(border);
    btnMesh.userData.borderMesh = border;

    const txt = new Text();
    txt.text = p.label;
    txt.fontSize = 0.052;
    txt.color = isActive ? 0x00f0ff : 0x94a3b8;
    txt.anchorX = 'center';
    txt.anchorY = 'middle';
    txt.position.set(rx, resBarY, 0.045);
    txt.renderOrder = 1000;
    txt.sync();
    chartGroup.add(txt);
    chartTextLabels.push(txt);

    registerInteractiveObject(btnMesh, () => {
      setChartResolutionPreset(p.id, scene);
    });
    registeredButtons.push(btnMesh);

    resolutionButtons.push({ mesh: btnMesh, border, text: txt, id: p.id });
  });

  // Store metadata on chartGroup for fast mode transitions, realtime updates & tooltips
  chartGroup.userData = {
    splineContainer,
    candleGroup,
    tooltipGroup,
    ttText,
    btn3DSpline,
    txt3DSpline,
    btn3DCandle,
    txt3DCandle,
    toggleBtnMatActive,
    toggleBtnMatInactive,
    vectorLineMat,
    vectorLine,
    areaMesh,
    pulseRing,
    coreDot,
    pillMesh,
    pillBorder,
    pillText,
    headerTitle,
    headerSub,
    priceLabels,
    timeTickLabels,
    resolutionButtons,
    registeredButtons,
    tetherLine,
    beaconMesh,
    isVR,
    activeSymbol: symbol,
    activeName: asset.name || symbol,
    activeExchange: asset.exchange || (isINR ? 'NSE' : ''),
    activeCandles: candles,
    currency: isINR ? 'INR' : 'USD',
    isINR,
    minP,
    maxP,
    range,
    themeColorHex
  };

  scene.add(chartGroup);
  activeChartGroup = chartGroup;

  // Apply initial mode visibility directly
  setChartDisplayMode(currentChartMode);

  return chartGroup;
}

/**
 * Convenience helper to render or switch to 3D candlestick mode directly.
 */
export function render3DCandlestickChart(planetMeshOrStockData, scene, options = {}) {
  const chart = show3DSplineChart(planetMeshOrStockData, scene, options);
  setChartDisplayMode('candlestick');
  return chart;
}

/**
 * Switches the chart's timeframe & candle interval resolution preset (e.g. '1D_1m', '5D_5m', '1M_30m', '1Y_1d', etc.).
 * @param {string} presetId Preset identifier
 * @param {THREE.Scene} scene Optional scene
 */
export function setChartResolutionPreset(presetId, scene = null) {
  const preset = RESOLUTION_PRESETS.find((p) => p.id === presetId);
  if (!preset) return;
  currentResolutionPreset = presetId;
  soundFx.playEnergySurgeSound();

  // 1. Update 2D DOM selector buttons and dropdown labels
  const pills = document.querySelectorAll('.resolution-pill');
  pills.forEach((p) => {
    p.classList.toggle('active', p.getAttribute('data-preset') === presetId);
  });
  const dropdownItems = document.querySelectorAll('.resolution-item');
  dropdownItems.forEach((item) => {
    item.classList.toggle('active', item.getAttribute('data-preset') === presetId);
  });
  const dropdownLabel = document.getElementById('current-resolution-label');
  if (dropdownLabel) {
    dropdownLabel.textContent = preset.label;
  }

  // 2. Update 3D In-Scene Resolution Buttons
  if (activeChartGroup?.userData?.resolutionButtons) {
    activeChartGroup.userData.resolutionButtons.forEach(({ mesh, border, text, id }) => {
      const isActive = id === presetId;
      if (mesh?.material) {
        mesh.userData.baseColor = isActive ? 0x0891b2 : 0x0f172a;
        mesh.userData.baseEmissiveIntensity = isActive ? 0.45 : 0.20;
        mesh.userData.borderColor = isActive ? 0x00f0ff : 0x334155;
        if (mesh.material.color) mesh.material.color.setHex(isActive ? 0x0891b2 : 0x0f172a);
        if (mesh.material.emissive) {
          mesh.material.emissive.setHex(isActive ? 0x00f0ff : 0x0f172a);
          mesh.material.emissiveIntensity = isActive ? 0.45 : 0.20;
        }
      }
      if (border?.material) {
        border.material.color.setHex(isActive ? 0x00f0ff : 0x334155);
      }
      if (text) {
        text.color = isActive ? 0x00f0ff : 0x94a3b8;
        text.sync();
      }
    });
  }

  // 3. Update X-Axis Time Ticks Text in 3D chart
  if (activeChartGroup?.userData?.timeTickLabels) {
    const ticks = getTimeTicksForPreset(presetId);
    activeChartGroup.userData.timeTickLabels.forEach((label, idx) => {
      if (ticks[idx]) {
        label.text = ticks[idx];
        label.visible = true;
        label.sync();
      } else {
        label.visible = false;
        label.sync();
      }
    });
  }

  // 4. Re-fetch or re-generate candles for active asset
  if (activeChartGroup?.userData) {
    const ud = activeChartGroup.userData;
    const sym = ud.activeSymbol;
    if (sym) {
      fetchStockCandles(sym, preset.finnhubRes, preset.rangeDays, presetId).then((liveData) => {
        updateChartWithRealtimeData(sym, liveData, scene);
      });
    }
  }
}

/**
 * Smoothly switches the 3D Analytical Chart between Spline Area and 3D Candlestick + Volume mode.
 * @param {'spline' | 'candlestick'} mode Target display mode
 */
export function setChartDisplayMode(mode = 'spline') {
  currentChartMode = mode;
  if (!activeChartGroup?.userData) return;

  soundFx.playSelectSound();

  const {
    splineContainer,
    btn3DSpline,
    txt3DSpline,
    btn3DCandle,
    txt3DCandle,
    toggleBtnMatActive,
    toggleBtnMatInactive,
    tooltipGroup
  } = activeChartGroup.userData;

  const candleGroup = activeChartGroup.getObjectByName('candleGroup');

  // Update 3D In-Scene Button Visuals
  if (btn3DSpline && btn3DCandle) {
    btn3DSpline.material = mode === 'spline' ? toggleBtnMatActive : toggleBtnMatInactive;
    btn3DCandle.material = mode === 'candlestick' ? toggleBtnMatActive : toggleBtnMatInactive;
    if (txt3DSpline) {
      txt3DSpline.color = mode === 'spline' ? 0x00f0ff : 0x94a3b8;
      txt3DSpline.sync();
    }
    if (txt3DCandle) {
      txt3DCandle.color = mode === 'candlestick' ? 0x00f0ff : 0x94a3b8;
      txt3DCandle.sync();
    }
  }

  // Update 2D Inspector Card Segmented UI Buttons
  const btnSpline = document.getElementById('btn-chart-spline');
  const btnCandle = document.getElementById('btn-chart-candlestick');
  if (btnSpline && btnCandle) {
    btnSpline.classList.toggle('active', mode === 'spline');
    btnCandle.classList.toggle('active', mode === 'candlestick');
  }

  // Direct, uncorrupted visibility switching (no squashing scale.y)
  if (mode === 'candlestick') {
    if (splineContainer) splineContainer.visible = false;
    if (candleGroup) {
      candleGroup.visible = true;
      candleGroup.scale.set(1, 1, 1);
    }
  } else {
    if (tooltipGroup) tooltipGroup.visible = false;
    if (candleGroup) candleGroup.visible = false;
    if (splineContainer) {
      splineContainer.visible = true;
      splineContainer.scale.set(1, 1, 1);
    }
  }
}

/**
 * Returns current chart display mode ('spline' | 'candlestick').
 */
export function getChartDisplayMode() {
  return currentChartMode;
}

/**
 * Handles candle hover highlighting and updates the floating 3D micro-HUD tooltip badge.
 * @param {THREE.Mesh} candleMesh The hovered 3D candle mesh
 * @param {boolean} isHovered Whether pointer is over the candle
 */
export function setCandleHoverState(candleMesh, isHovered) {
  if (!activeChartGroup?.userData) return;
  const { tooltipGroup, ttText } = activeChartGroup.userData;

  if (isHovered && candleMesh?.userData?.isCandle) {
    if (hoveredCandleMesh && hoveredCandleMesh !== candleMesh) {
      setCandleHoverState(hoveredCandleMesh, false);
    }
    hoveredCandleMesh = candleMesh;

    // Scale candle up slightly
    candleMesh.scale.set(1.15, 1.05, 1.2);

    // Position floating 3D tooltip above candle high point (capped safely below panel header)
    const data = candleMesh.userData.candleData;
    if (tooltipGroup && ttText && data) {
      const isINR = activeChartGroup.userData?.isINR || activeChartGroup.userData?.currency === 'INR';
      const currSym = isINR ? '₹' : '$';
      const topY = candleMesh.userData.topY || 0.2;
      tooltipGroup.position.set(candleMesh.userData.posX, Math.min(0.68, topY + 0.18), 0.06);
      ttText.text = `O: ${currSym}${data.open}  |  H: ${currSym}${data.high}  |  L: ${currSym}${data.low}  |  C: ${currSym}${data.close}  |  Vol: ${(data.volume / 1000).toFixed(1)}k`;
      ttText.color = data.isBullish ? 0x10b981 : 0xef4444;
      ttText.sync();
      tooltipGroup.visible = true;
    }
  } else if (!isHovered && candleMesh) {
    if (hoveredCandleMesh === candleMesh) hoveredCandleMesh = null;
    candleMesh.scale.set(1.0, 1.0, 1.0);
    if (tooltipGroup) tooltipGroup.visible = false;
  }
}

/**
 * Dynamically updates active chart billboarding and laser tether line connecting chart to target planet or anchor.
 * @param {THREE.Camera} camera The active rendering camera
 * @param {number} delta Delta time in seconds
 */
export function updateActiveChart(camera, delta = 0.016) {
  if (!activeChartGroup) return;

  // Face camera smoothly in desktop mode
  if (camera && !activeChartGroup.userData?.isVR) {
    activeChartGroup.quaternion.copy(camera.quaternion);
  }

  // Keep Line2 screen resolution in sync
  const vectorLineMat = activeChartGroup.userData?.vectorLineMat;
  if (vectorLineMat && vectorLineMat.resolution) {
    vectorLineMat.resolution.set(window.innerWidth || 1920, window.innerHeight || 1080);
  }

  // Animate terminal pulse ring gently
  const pulseRing = activeChartGroup.userData?.pulseRing;
  if (pulseRing) {
    const pulseScale = 1.0 + 0.14 * Math.sin(Date.now() * 0.006);
    pulseRing.scale.set(pulseScale, pulseScale, 1.0);
  }

  // Dynamic Laser Tether Beam update connecting chart bottom to planet / anchor
  const tetherLine = activeChartGroup.userData?.tetherLine;
  const beaconMesh = activeChartGroup.userData?.beaconMesh;
  if (tetherLine) {
    activeChartGroup.updateMatrixWorld();
    const chartBottomWorld = new THREE.Vector3(0, -1.125, 0).applyMatrix4(activeChartGroup.matrixWorld);
    const targetPos = new THREE.Vector3(0, 0, 0);
    if (trackedPlanetMesh) {
      trackedPlanetMesh.getWorldPosition(targetPos);
    }
    const posAttr = tetherLine.geometry.attributes.position;
    if (posAttr) {
      posAttr.setXYZ(0, chartBottomWorld.x, chartBottomWorld.y, chartBottomWorld.z);
      posAttr.setXYZ(1, targetPos.x, targetPos.y, targetPos.z);
      posAttr.needsUpdate = true;
      tetherLine.computeLineDistances();
    }
    if (beaconMesh) {
      beaconMesh.position.copy(targetPos);
    }
  }
}

/**
 * Removes the currently active 3D analytical chart and restores planet label visibility.
 */
export function removeCurrentChart(scene) {
  if (!activeChartGroup || !scene) return;

  soundFx.playCloseSound();

  if (trackedPlanetMesh?.userData?.textLabel) {
    trackedPlanetMesh.userData.textLabel.visible = true;
  }

  const target = activeChartGroup;
  if (target.userData?.registeredButtons) {
    target.userData.registeredButtons.forEach((btn) => unregisterInteractiveObject(btn));
  }
  if (target.userData?.tetherLine) {
    scene.remove(target.userData.tetherLine);
    target.userData.tetherLine.geometry?.dispose();
    target.userData.tetherLine.material?.dispose();
  }
  if (target.userData?.beaconMesh) {
    scene.remove(target.userData.beaconMesh);
    target.userData.beaconMesh.geometry?.dispose();
    target.userData.beaconMesh.material?.dispose();
  }

  activeChartGroup = null;
  trackedPlanetMesh = null;
  hoveredCandleMesh = null;
  chartTextLabels = [];

  scene.remove(target);
  target.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material.dispose();
    }
  });
}

export function getCurrentChart() {
  return activeChartGroup;
}

export function getActiveChartData() {
  return activeChartGroup?.userData || null;
}

/**
 * Dynamically updates the active 3D Holographic Chart with fetched Finnhub OHLC candle data.
 * Re-normalizes coordinates and smoothly updates candle boxes, wicks, volume bars, and spline curves.
 * @param {string} symbol Ticker symbol
 * @param {Object} liveData Formatted candle and metrics package from stock-api.js
 * @param {THREE.Scene} targetScene Optional Three.js scene
 */
export function updateChartWithRealtimeData(symbol, liveData, targetScene = null) {
  if (!liveData || !liveData.candles || liveData.candles.length === 0) return;

  const count = liveData.candles.length;
  const candles = liveData.candles;
  const minP = liveData.minP ?? Math.min(...candles.map((c) => c.low));
  const maxP = liveData.maxP ?? Math.max(...candles.map((c) => c.high));
  const range = maxP - minP || 1;

  const isPositive = (liveData.changePercent ?? 0) >= 0;
  const themeColorHex = isPositive ? 0x10b981 : 0xef4444;

  if (!activeChartGroup) {
    if (targetScene && trackedPlanetMesh) {
      show3DSplineChart(trackedPlanetMesh, targetScene);
    }
  }

  if (!activeChartGroup?.userData) return;

  const isINR = (liveData.currency === 'INR') || (liveData.exchange === 'NSE') || (liveData.exchange === 'BSE') || INDIAN_STOCKS.some((s) => s.symbol === symbol.toUpperCase());
  const currSym = isINR ? '₹' : '$';

  const ud = activeChartGroup.userData;
  ud.activeSymbol = symbol;
  ud.activeName = liveData.name || symbol;
  ud.activeExchange = liveData.exchange || '';
  ud.activeCandles = candles;
  ud.currency = isINR ? 'INR' : 'USD';
  ud.isINR = isINR;
  ud.minP = minP;
  ud.maxP = maxP;
  ud.range = range;
  ud.themeColorHex = themeColorHex;

  // 1. Update Header Typography
  if (ud.headerTitle) {
    const formattedPrice = liveData.latestPrice >= 1000 
      ? `${currSym}${liveData.latestPrice.toLocaleString(isINR ? 'en-IN' : undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
      : `${currSym}${Number(liveData.latestPrice).toFixed(2)}`;
    const exchangeTag = liveData.exchange ? `:${liveData.exchange}` : '';
    ud.headerTitle.text = `${liveData.name || symbol} (${symbol}${exchangeTag})  •  ${formattedPrice}`;
    ud.headerTitle.sync();
  }

  if (ud.headerSub) {
    const totalVol = candles.reduce((acc, c) => acc + (c.volume || 0), 0);
    const volStr = totalVol > 1000000 ? `${(totalVol / 1000000).toFixed(2)}M` : `${(totalVol / 1000).toFixed(1)}K`;
    ud.headerSub.text = `${liveData.category || 'Asset'}  •  24h: ${isPositive ? '+' : ''}${liveData.changePercent}% (${currSym}${(liveData.change ?? 0) >= 0 ? '+' : ''}${Number(liveData.change ?? 0).toFixed(2)})  •  Vol: ${volStr}`;
    ud.headerSub.sync();
  }

  // 2. Update Grid Price Level Labels
  if (ud.priceLabels && ud.priceLabels.length > 0) {
    const gridLineCount = ud.priceLabels.length - 1 || 3;
    ud.priceLabels.forEach((label, g) => {
      const priceVal = minP + (g / gridLineCount) * range;
      label.text = isINR
        ? (priceVal >= 1000 ? `₹${Math.round(priceVal).toLocaleString('en-IN')}` : `₹${priceVal.toFixed(1)}`)
        : (priceVal >= 1000 ? `$${Math.round(priceVal).toLocaleString()}` : `$${priceVal.toFixed(1)}`);
      label.sync();
    });
  }

  // 3. Re-render 3D Candlesticks & Volume Depth Bars
  renderCandlesticks({ ...liveData, ticker: symbol }, activeChartGroup, { candles, minP, maxP, range });
  const updatedCandleGroup = activeChartGroup.getObjectByName('candleGroup');
  if (updatedCandleGroup) {
    updatedCandleGroup.visible = (currentChartMode === 'candlestick');
    ud.candleGroup = updatedCandleGroup;
  }

  // Sync resolution button visuals if preset was specified
  if (liveData.presetId) {
    currentResolutionPreset = liveData.presetId;
    if (ud.resolutionButtons) {
      ud.resolutionButtons.forEach(({ mesh, border, text, id }) => {
        const isActive = id === currentResolutionPreset;
        if (mesh) {
          mesh.material.color.setHex(isActive ? 0x00f0ff : 0x0f172a);
          mesh.material.opacity = isActive ? 0.35 : 0.65;
        }
        if (border) {
          border.material.color.setHex(isActive ? 0x00f0ff : 0x334155);
        }
        if (text) {
          text.color = isActive ? 0x00f0ff : 0x94a3b8;
          text.sync();
        }
      });
    }
    if (ud.timeTickLabels) {
      const ticks = getTimeTicksForPreset(currentResolutionPreset);
      ud.timeTickLabels.forEach((label, idx) => {
        if (ticks[idx]) {
          label.text = ticks[idx];
          label.visible = true;
          label.sync();
        } else {
          label.visible = false;
          label.sync();
        }
      });
    }
  }

  // 4. Update Spline Curve & Area Gradient Fill
  const stepX = 2.8 / (count - 1);
  const startX = -1.4;
  const mapY = (val) => ((val - minP) / range) * 1.1 - 0.55;

  const rawPoints3D = [];
  for (let i = 0; i < count; i++) {
    const x = startX + i * stepX;
    const y = mapY(candles[i].close);
    rawPoints3D.push(new THREE.Vector3(x, y, 0.02));
  }
  const splineCurve = new THREE.CatmullRomCurve3(rawPoints3D, false, 'catmullrom', 0.35);
  const smoothPoints = splineCurve.getPoints(120);

  // Update Vector Line2
  if (ud.vectorLine) {
    const linePositions = [];
    smoothPoints.forEach((p) => linePositions.push(p.x, p.y, 0.022));
    ud.vectorLine.geometry.setPositions(linePositions);
    ud.vectorLine.material.color.setHex(themeColorHex);
    ud.vectorLine.computeLineDistances();
  }

  // Update Area Gradient
  if (ud.splineContainer && ud.areaMesh) {
    ud.splineContainer.remove(ud.areaMesh);
    if (ud.areaMesh.geometry) ud.areaMesh.geometry.dispose();
    if (ud.areaMesh.material) ud.areaMesh.material.dispose();
    const newAreaMesh = createAreaGradientMesh(smoothPoints, -0.75, themeColorHex);
    ud.splineContainer.add(newAreaMesh);
    ud.areaMesh = newAreaMesh;
  }

  // Update Endpoint Pulse Marker & Pill Badge
  const lastPoint = smoothPoints[smoothPoints.length - 1];
  if (ud.pulseRing) {
    ud.pulseRing.position.set(lastPoint.x, lastPoint.y, 0.024);
    ud.pulseRing.material.color.setHex(themeColorHex);
  }
  if (ud.coreDot) {
    ud.coreDot.position.set(lastPoint.x, lastPoint.y, 0.025);
  }
  if (ud.pillMesh && ud.pillBorder && ud.pillText) {
    ud.pillMesh.position.set(lastPoint.x - 0.30, lastPoint.y + 0.06, 0.026);
    ud.pillBorder.position.set(lastPoint.x - 0.30, lastPoint.y + 0.06, 0.027);
    ud.pillBorder.material.color.setHex(themeColorHex);
    ud.pillText.position.set(lastPoint.x - 0.30, lastPoint.y + 0.06, 0.030);
    ud.pillText.text = `${isPositive ? '+' : ''}${liveData.changePercent}%`;
    ud.pillText.color = themeColorHex;
    ud.pillText.sync();
  }

  // Update Laser Stem & Beacon
  if (ud.stemLine) ud.stemLine.material.color.setHex(themeColorHex);
  if (ud.beaconMesh) ud.beaconMesh.material.color.setHex(themeColorHex);

  soundFx.playEnergySurgeSound();
}

/**
 * Smoothly updates the newest candle and spline endpoint when a real-time WebSocket trade tick arrives.
 * Flashes emissive colors (cyan/emerald on upward, crimson on downward) and tweens heights.
 * @param {Object} tick { symbol, price, volume, isUp }
 */
export function applyLiveTickUpdate(tick) {
  if (!tick || !activeChartGroup?.userData) return;
  const ud = activeChartGroup.userData;

  const currentSym = (ud.activeSymbol || '').toUpperCase();
  const tickSym = (tick.symbol || '').toUpperCase();
  if (currentSym && tickSym && currentSym !== tickSym) {
    return; // Tick is for another symbol
  }

  const candles = ud.activeCandles;
  if (!candles || candles.length === 0) return;

  const lastIdx = candles.length - 1;
  const lastCandle = candles[lastIdx];

  // Update candle stats
  lastCandle.close = tick.price;
  lastCandle.high = Math.max(lastCandle.high, tick.price);
  lastCandle.low = Math.min(lastCandle.low, tick.price);
  lastCandle.volume += tick.volume || 100;
  lastCandle.isBullish = lastCandle.close >= lastCandle.open;

  // Recalculate global price bounds if price breaks current range
  let minP = ud.minP ?? 0;
  let maxP = ud.maxP ?? 1;
  if (tick.price > maxP) maxP = tick.price * 1.01;
  if (tick.price < minP) minP = tick.price * 0.99;
  ud.minP = minP;
  ud.maxP = maxP;
  const range = maxP - minP || 1;
  ud.range = range;

  const mapY = (val) => ((val - minP) / range) * 1.1 - 0.55;

  // Update 3D Candlestick Body & Wick for rightmost candle
  const candleGroup = ud.candleGroup || activeChartGroup.getObjectByName('candleGroup');
  if (candleGroup) {
    const candleMesh = candleGroup.getObjectByName(`CandleBody_${lastIdx}`);
    if (candleMesh) {
      const yOpen = mapY(lastCandle.open);
      const yClose = mapY(lastCandle.close);
      const targetHeight = Math.max(0.04, Math.abs(yClose - yOpen));
      const targetY = (yOpen + yClose) / 2;

      // Smoothly tween candle position and scale
      const twPos = new TWEEN.Tween(candleMesh.position)
        .to({ y: targetY }, 220)
        .easing(TWEEN.Easing.Cubic.Out);
      TWEEN.add(twPos);
      twPos.start();

      const origHeight = candleMesh.geometry?.parameters?.height || targetHeight;
      const targetScaleY = targetHeight / origHeight;
      candleMesh.scale.y = Math.max(0.15, targetScaleY);

      // Flash Emissive color
      const flashColorHex = tick.isUp ? 0x00f0ff : 0xef4444;
      candleMesh.material.emissive.setHex(flashColorHex);
      candleMesh.material.emissiveIntensity = 1.35;

      const twMat = new TWEEN.Tween(candleMesh.material)
        .to({ emissiveIntensity: 0.38 }, 450)
        .easing(TWEEN.Easing.Cubic.Out)
        .onComplete(() => {
          candleMesh.material.emissive.setHex(lastCandle.isBullish ? 0x10b981 : 0xef4444);
        });
      TWEEN.add(twMat);
      twMat.start();
    }
  }

  // Update Spline Curve Endpoint & Pill
  const lastY = mapY(tick.price);
  if (ud.pulseRing) {
    ud.pulseRing.position.y = lastY;
    ud.pulseRing.scale.set(1.4, 1.4, 1.0);
    const twRing = new TWEEN.Tween(ud.pulseRing.scale)
      .to({ x: 1.0, y: 1.0 }, 350)
      .easing(TWEEN.Easing.Cubic.Out);
    TWEEN.add(twRing);
    twRing.start();
  }
  if (ud.coreDot) {
    ud.coreDot.position.y = lastY;
  }
  if (ud.pillMesh && ud.pillBorder && ud.pillText) {
    ud.pillMesh.position.y = lastY + 0.06;
    ud.pillBorder.position.y = lastY + 0.06;
    ud.pillText.position.y = lastY + 0.06;

    const firstPrice = candles[0].open || 1;
    const changePct = Math.round(((tick.price - firstPrice) / firstPrice) * 10000) / 100;
    ud.pillText.text = `${changePct >= 0 ? '+' : ''}${changePct}%`;
    ud.pillText.sync();
  }

  // Update Header Title Price
  if (ud.headerTitle) {
    const isINR = ud.isINR || ud.currency === 'INR';
    const currSym = isINR ? '₹' : '$';
    const formattedPrice = tick.price >= 1000 
      ? `${currSym}${tick.price.toLocaleString(isINR ? 'en-IN' : undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
      : `${currSym}${Number(tick.price).toFixed(2)}`;
    const exchangeTag = ud.activeExchange ? `:${ud.activeExchange}` : '';
    ud.headerTitle.text = `${ud.activeName || tick.symbol} (${ud.activeSymbol || tick.symbol}${exchangeTag})  •  ${formattedPrice}`;
    ud.headerTitle.sync();
  }
}
