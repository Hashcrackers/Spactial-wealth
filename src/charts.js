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

let activeChartGroup = null;
let trackedPlanetMesh = null;
let chartTextLabels = [];
let currentChartMode = 'spline'; // 'spline' | 'candlestick'
let hoveredCandleMesh = null;

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
 * Generates 18 realistic historical prices for Spline curve.
 */
export function generateRealistic18PointSeries(assetReturn = 0, volatility = 'medium', basePrice = 100) {
  const steps = 18;
  const points = [basePrice];
  const targetEndPrice = basePrice * (1 + assetReturn / 100);
  const drift = (targetEndPrice - basePrice) / (steps - 1);

  const volScale = (volatility || '').toLowerCase() === 'high' ? 0.045 : (volatility || '').toLowerCase() === 'low' ? 0.012 : 0.026;

  for (let i = 1; i < steps - 1; i++) {
    const expected = basePrice + drift * i;
    const harmonic1 = Math.sin(i * 1.55 + assetReturn * 0.1) * 0.6;
    const harmonic2 = Math.cos(i * 3.2 - assetReturn * 0.05) * 0.4;
    const noise = (harmonic1 + harmonic2) * (basePrice * volScale);

    points.push(Math.max(basePrice * 0.25, expected + noise));
  }

  points.push(targetEndPrice);
  return points;
}

/**
 * Generates 18 synthetic OHLC candles tailored to asset returns and volatility.
 */
export function generateCandles(assetData = {}, count = 18, basePrice = 100) {
  const isVolHigh = (assetData.volatility || '').toUpperCase() === 'HIGH';
  const returnVal = typeof assetData.returns === 'number' ? assetData.returns : parseFloat(assetData.returns) || 0;
  const targetEndPrice = basePrice * (1 + returnVal / 100);
  const drift = (targetEndPrice - basePrice) / (count - 1);
  const volMult = isVolHigh ? 0.045 : (assetData.volatility || '').toUpperCase() === 'LOW' ? 0.014 : 0.028;

  const candles = [];
  let currentPrice = basePrice;

  for (let i = 0; i < count; i++) {
    const expected = basePrice + drift * i;
    const wave = Math.sin(i * 1.5 + returnVal * 0.08) * 0.6 + Math.cos(i * 3.1) * 0.4;
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

  const count = 18;
  const candleWidth = 0.08;
  const candleDepth = 0.04;
  const stepX = 2.8 / (count - 1);
  const startX = -1.4;

  const candles = bounds?.candles || generateCandles(assetData, count, 100);

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

    const bodyHeight = Math.max(0.04, Math.abs(yClose - yOpen));
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
    const wickHeight = Math.max(0.06, yHigh - yLow);
    const wickCenterY = (yHigh + yLow) / 2;
    const wickGeom = new THREE.CylinderGeometry(0.006, 0.006, wickHeight, 6);
    const wickMesh = new THREE.Mesh(wickGeom, bodyMat);
    wickMesh.position.set(x, wickCenterY, 0.02);
    wickMesh.renderOrder = 1000;
    candleGroup.add(wickMesh);

    // 3. Extruded Volume Bar at the bottom
    const volHeight = 0.08 + (c.volume / maxVol) * 0.24;
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
 * @param {THREE.Mesh} planetMesh The selected planet mesh
 * @param {THREE.Scene} scene The Three.js scene
 * @returns {THREE.Group}
 */
export function show3DSplineChart(planetMesh, scene) {
  // Clear any existing active chart
  if (activeChartGroup && scene) {
    if (trackedPlanetMesh?.userData?.textLabel) {
      trackedPlanetMesh.userData.textLabel.visible = true;
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

  if (!planetMesh || !scene) return null;

  soundFx.playSelectSound();
  trackedPlanetMesh = planetMesh;

  // Hide the planet's 3D text label to prevent visual collision
  if (planetMesh.userData?.textLabel) {
    planetMesh.userData.textLabel.visible = false;
  }

  const chartGroup = new THREE.Group();
  chartGroup.name = 'TradingViewBloombergHUD';

  const asset = planetMesh.userData || {};
  const returnVal = typeof asset.returns === 'number' ? asset.returns : parseFloat(asset.returns) || 0;
  const isPositive = returnVal >= 0;

  // Subdued financial terminal theme: Emerald green for bull, Coral red for bear
  const themeColorHex = isPositive ? 0x10b981 : 0xef4444;
  const themeColor = new THREE.Color(themeColorHex);

  // Position chart anchored 1.6m above planet
  const planetRadius = asset.radius || 0.6;
  const worldPos = new THREE.Vector3();
  planetMesh.getWorldPosition(worldPos);
  chartGroup.position.set(worldPos.x, worldPos.y + planetRadius + 1.6, worldPos.z);
  chartGroup.scale.set(1.0, 1.0, 1.0);
  chartGroup.renderOrder = 999;

  // Plate Dimensions: width = 3.6, height = 2.0
  const panelWidth = 3.6;
  const panelHeight = 2.0;

  // Generate synchronized 18-point data for both Spline and Candlestick layers
  const count = 18;
  const candles = generateCandles(asset, count, 100);
  const history = candles.map((c) => c.close);

  const minP = Math.min(...candles.map((c) => c.low));
  const maxP = Math.max(...candles.map((c) => c.high));
  const range = maxP - minP || 1;

  const stepX = 2.8 / (count - 1);
  const startX = -1.4;
  const baselineY = -0.75;

  // Unified Y-space mapping: dollar value -> [-0.55, 0.55]
  const mapY = (val) => ((val - minP) / range) * 1.1 - 0.55;

  // 1. Sleek Frosted Glassmorphism Backdrop Plate
  const panelGeo = new THREE.PlaneGeometry(panelWidth, panelHeight);
  const panelMat = new THREE.MeshPhysicalMaterial({
    color: 0x050c18,
    transparent: true,
    opacity: 0.84,
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
  glassPanel.renderOrder = 999;
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
  panelBorder.renderOrder = 999;
  chartGroup.add(panelBorder);

  // 2. Glowing Neon Laser Tether Beam connecting chart bottom to planet surface
  const stemHeight = 1.6;
  const stemPts = [
    new THREE.Vector3(0, -panelHeight / 2, 0),
    new THREE.Vector3(0, -(panelHeight / 2 + stemHeight), 0)
  ];
  const stemGeo = new THREE.BufferGeometry().setFromPoints(stemPts);
  const stemMat = new THREE.LineDashedMaterial({
    color: themeColorHex,
    dashSize: 0.08,
    gapSize: 0.04,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending
  });
  const stemLine = new THREE.Line(stemGeo, stemMat);
  stemLine.computeLineDistances();
  stemLine.renderOrder = 999;
  chartGroup.add(stemLine);

  // Surface Beacon Glow Ring at planet surface
  const beaconGeo = new THREE.RingGeometry(0.04, 0.09, 32);
  const beaconMat = new THREE.MeshBasicMaterial({
    color: themeColorHex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending
  });
  const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
  beaconMesh.position.set(0, -(panelHeight / 2 + stemHeight), 0);
  beaconMesh.rotation.x = Math.PI / 2;
  beaconMesh.renderOrder = 999;
  chartGroup.add(beaconMesh);

  // 3. Financial Support & Resistance Gridlines (4 Horizontal Lines at -0.55, -0.18, 0.18, 0.55)
  const gridLineCount = 3;
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
    priceLabel.text = `$${priceVal.toFixed(1)}`;
    priceLabel.fontSize = 0.075;
    priceLabel.color = 0x64748b;
    priceLabel.anchorX = 'left';
    priceLabel.anchorY = 'middle';
    priceLabel.position.set(1.45, gy, 0.02);
    priceLabel.renderOrder = 1000;
    priceLabel.sync();
    chartGroup.add(priceLabel);
    chartTextLabels.push(priceLabel);
  }

  // =========================================================================
  // 4. HIGH-PRECISION SPLINE AREA VECTOR LAYER (Container)
  // =========================================================================
  const splineContainer = new THREE.Group();
  splineContainer.name = 'SplineContainerLayer';
  splineContainer.renderOrder = 1000;

  // 1. Generate smooth Catmull-Rom sampled points across 18 time steps
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

  // 3. Razor-Sharp TradingView / Bloomberg Vector Line (Line2 with linewidth: 3)
  const linePositions = [];
  smoothPoints.forEach((p) => {
    linePositions.push(p.x, p.y, 0.022);
  });

  const lineGeo = new LineGeometry();
  lineGeo.setPositions(linePositions);

  const vectorLineMat = new LineMaterial({
    color: themeColorHex,
    linewidth: 3.2, // crisp vector pixel stroke
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

  // 4. Sleek Terminal Endpoint Marker (Pulsing flat ring + central dot, no bulbous orb)
  const lastPoint = smoothPoints[smoothPoints.length - 1];

  // Outer glowing ring
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

  // Inner solid core dot
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

  // Compact Floating Price Badge Pill (positioned cleanly to the left of the final point)
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

  // Subtle Glowing Border around Pill
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

  // 7. Time Ticks along X-Axis Baseline
  const timeTicks = ['1Y Ago', '9M', '6M', '3M', 'Current'];
  for (let t = 0; t < timeTicks.length; t++) {
    const tx = -1.4 + (t / (timeTicks.length - 1)) * 2.8;
    const tickText = new Text();
    tickText.text = timeTicks[t];
    tickText.fontSize = 0.08;
    tickText.color = 0x64748b;
    tickText.anchorX = 'center';
    tickText.anchorY = 'top';
    tickText.position.set(tx, baselineY - 0.04, 0.02);
    tickText.renderOrder = 1000;
    tickText.sync();
    chartGroup.add(tickText);
    chartTextLabels.push(tickText);
  }

  // 8. Crisp Bloomberg HUD Header Typography
  const headerTitle = new Text();
  headerTitle.text = `${asset.name || 'Asset'} (${asset.ticker || 'AST'})`;
  headerTitle.fontSize = 0.13;
  headerTitle.color = 0xf8fafc;
  headerTitle.anchorX = 'left';
  headerTitle.anchorY = 'top';
  headerTitle.position.set(-panelWidth / 2 + 0.14, panelHeight / 2 - 0.10, 0.03);
  headerTitle.renderOrder = 1000;
  headerTitle.sync();
  chartGroup.add(headerTitle);
  chartTextLabels.push(headerTitle);

  const headerSub = new Text();
  headerSub.text = `${asset.category || 'Holding'}  •  Allocation: ${asset.allocation || 0}% (${asset.formattedValue || '$0'})`;
  headerSub.fontSize = 0.088;
  headerSub.color = 0x94a3b8;
  headerSub.anchorX = 'left';
  headerSub.anchorY = 'top';
  headerSub.position.set(-panelWidth / 2 + 0.14, panelHeight / 2 - 0.24, 0.03);
  headerSub.renderOrder = 1000;
  headerSub.sync();
  chartGroup.add(headerSub);
  chartTextLabels.push(headerSub);

  // 9. 3D In-Scene Segmented Toggle Buttons [ 📈 Spline | 📊 Candlestick ]
  const toggleBtnSplineGeo = new THREE.PlaneGeometry(0.56, 0.14);
  const toggleBtnCandleGeo = new THREE.PlaneGeometry(0.66, 0.14);
  const toggleBtnMatActive = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false });
  const toggleBtnMatInactive = new THREE.MeshBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });

  const btn3DSpline = new THREE.Mesh(toggleBtnSplineGeo, currentChartMode === 'spline' ? toggleBtnMatActive : toggleBtnMatInactive);
  btn3DSpline.position.set(0.55, panelHeight / 2 - 0.15, 0.035);
  btn3DSpline.userData = { isChartModeToggle: true, targetMode: 'spline', isInteractive: true };
  btn3DSpline.renderOrder = 1000;
  chartGroup.add(btn3DSpline);

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
  btn3DCandle.userData = { isChartModeToggle: true, targetMode: 'candlestick', isInteractive: true };
  btn3DCandle.renderOrder = 1000;
  chartGroup.add(btn3DCandle);

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
  closeBtn.userData = { isCloseButton: true, isInteractive: true };
  closeBtn.renderOrder = 1000;
  chartGroup.add(closeBtn);

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

  // Store metadata on chartGroup for fast mode transitions & tooltips
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
    pulseRing
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
export function render3DCandlestickChart(planetMesh, scene) {
  const chart = show3DSplineChart(planetMesh, scene);
  setChartDisplayMode('candlestick');
  return chart;
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
      const topY = candleMesh.userData.topY || 0.2;
      tooltipGroup.position.set(candleMesh.userData.posX, Math.min(0.68, topY + 0.18), 0.06);
      ttText.text = `O: $${data.open}  |  H: $${data.high}  |  L: $${data.low}  |  C: $${data.close}  |  Vol: ${(data.volume / 1000).toFixed(1)}k`;
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
 * Dynamically updates active chart position elevated at y + 1.6 above planet,
 * applies continuous camera billboarding, and scales adaptively based on distance.
 * @param {THREE.Camera} camera The active rendering camera
 * @param {number} delta Delta time in seconds
 */
export function updateActiveChart(camera, delta = 0.016) {
  if (!activeChartGroup || !trackedPlanetMesh) return;

  // 1. Continuously sync chartGroup.position to the selected planet's current world position, anchored 1.6m above surface
  const worldPos = new THREE.Vector3();
  trackedPlanetMesh.getWorldPosition(worldPos);
  const planetRadius = trackedPlanetMesh.userData?.radius || 0.6;
  activeChartGroup.position.set(worldPos.x, worldPos.y + planetRadius + 1.6, worldPos.z);

  // 2. Holographic chart card always faces the camera directly
  if (camera) {
    activeChartGroup.quaternion.copy(camera.quaternion);

    // 3. Adaptive Chart Scale by Distance: keep chart at consistent comfortable visual angle
    const camPos = new THREE.Vector3();
    camera.getWorldPosition(camPos);
    const dist = camPos.distanceTo(activeChartGroup.position);
    const scaleFactor = Math.min(Math.max(dist * 0.18, 0.45), 1.6);
    activeChartGroup.scale.setScalar(scaleFactor);
  }

  // Animate terminal pulse ring gently
  const pulseRing = activeChartGroup.userData?.pulseRing;
  if (pulseRing) {
    const pulseScale = 1.0 + 0.14 * Math.sin(Date.now() * 0.006);
    pulseRing.scale.set(pulseScale, pulseScale, 1.0);
  }

  // Keep Line2 screen resolution in sync
  const vectorLineMat = activeChartGroup.userData?.vectorLineMat;
  if (vectorLineMat && vectorLineMat.resolution) {
    vectorLineMat.resolution.set(window.innerWidth || 1920, window.innerHeight || 1080);
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
