/**
 * Spatial Wealth - Cinematic 3D Celestial Visualizer & WebXR
 * Orchestrator: Physical Lighting, Soft Shadows, Dynamic Camera Framing & Bloomberg Spatial HUD
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as TWEEN from '@tweenjs/tween.js';

import {
  portfolioState,
  subscribePortfolio,
  loadPresetProfile,
  addAsset,
  deleteAsset,
  adjustAssetAllocation,
  formatCurrency,
  INDIAN_STOCKS
} from './data.js';
import {
  planetsGroup,
  renderAssetNodes,
  createCentralSun,
  createOrbitPaths,
  createCashFlowStream,
  createExpenseOutflowStream,
  billboardLabels,
  setNodeHoverState,
  setLabelsOcclusionState,
  updateCelestialAnimations
} from './nodes.js';
import { createNebulaBackdropMaterial } from './shaders.js';
import {
  show3DSplineChart,
  render3DCandlestickChart,
  removeCurrentChart,
  getCurrentChart,
  getActiveChartData,
  updateActiveChart,
  updateChartWithRealtimeData,
  applyLiveTickUpdate,
  setChartDisplayMode,
  getChartDisplayMode,
  setCandleHoverState,
  setChartResolutionPreset,
  RESOLUTION_PRESETS
} from './charts.js';
import {
  searchTickers,
  fetchStockCandles,
  subscribeLiveTicks,
  POPULAR_TICKERS
} from './stock-api.js';
import { XRManager, STOCK_CATALOG } from './xr-manager.js';
import { soundFx } from './audio.js';

let activeTickUnsubscribe = null;
let activeLiveSymbol = null;

/* ==========================================================================
   State & Scene Variables
   ========================================================================== */
let scene, camera, renderer, composer, bloomPass, controls;
let xrManager;
let centralSun, nebulaDome, orbitPathsGroup, cashFlowStream, expenseStream;
let dustCloudParticles, dustPositions, dustOriginalY;
let mouseRaycaster, mousePointer;
let hoveredMesh = null;
let hoveredCandleMesh = null;
let selectedPlanetMesh = null;
let currentCategory = 'ALL';
let isAutoOrbiting = true;
let wasOrbitRunning = true;
let currentFlowMode = 'both';
let clock = new THREE.Clock();

function pauseOrbitForChart() {
  wasOrbitRunning = isAutoOrbiting;
  isAutoOrbiting = false;
  const btnAutoOrbit = document.getElementById('btn-auto-orbit');
  if (btnAutoOrbit) {
    btnAutoOrbit.classList.toggle('active', false);
    const span = btnAutoOrbit.querySelector('span');
    if (span) span.textContent = 'Orbit: PAUSED';
  }
  if (xrManager?.updateOrbitStatus) {
    xrManager.updateOrbitStatus(false);
  }
}

function restoreOrbitAfterChart() {
  isAutoOrbiting = wasOrbitRunning;
  const btnAutoOrbit = document.getElementById('btn-auto-orbit');
  if (btnAutoOrbit) {
    btnAutoOrbit.classList.toggle('active', isAutoOrbiting);
    const span = btnAutoOrbit.querySelector('span');
    if (span) span.textContent = isAutoOrbiting ? 'Orbit: ON' : 'Orbit: PAUSED';
  }
  if (xrManager?.updateOrbitStatus) {
    xrManager.updateOrbitStatus(isAutoOrbiting);
  }
}

/* ==========================================================================
   Initialization
   ========================================================================== */
function init() {
  const canvas = document.getElementById('webgl-canvas');

  // 1. Scene & Camera
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020617);
  scene.fog = new THREE.FogExp2(0x020617, 0.011);

  camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 350);
  camera.position.set(0, 16, 26);

  // 2. WebGL Renderer with Physically Correct Soft Shadows & Tone Mapping
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // 3. Post-Processing Bloom Pipeline (Desktop)
  setupPostProcessing();

  // 4. OrbitControls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 3.5;
  controls.maxDistance = 90;
  controls.maxPolarAngle = Math.PI / 2 + 0.06;
  controls.target.set(0, 0, 0);

  // 5. Physical Celestial Lighting & Skybox
  setupPhysicalLighting();
  setupNebulaSkybox();
  setupVolumetricDustCloud();
  setupCosmicStarfield();

  // 6. Photorealistic Celestial Ecosystem
  centralSun = createCentralSun(portfolioState.summary);
  scene.add(centralSun);

  scene.add(planetsGroup);
  renderAssetNodes(portfolioState.assets, 'ALL');

  orbitPathsGroup = createOrbitPaths(portfolioState.assets, 'ALL');
  scene.add(orbitPathsGroup);

  // 7. Budget Cash-Flow Particle Streams (Accretion & Polar Outflow Jets)
  cashFlowStream = createCashFlowStream(scene);
  expenseStream = createExpenseOutflowStream(scene);

  // 8. Raycasting
  mouseRaycaster = new THREE.Raycaster();
  mousePointer = new THREE.Vector2();

  // 8. WebXR Manager Setup
  xrManager = new XRManager(renderer, scene, camera, {
    getInteractiveObjects: () => {
      const objects = [];
      planetsGroup.traverse((child) => {
        if (child.userData?.isAssetNode) objects.push(child);
      });
      const chart = getCurrentChart();
      if (chart) {
        chart.traverse((child) => {
          if (child.userData?.isCloseButton || child.userData?.isChartModeToggle || child.userData?.isCandle || child.userData?.isResolutionPreset || child.userData?.isVRButton || child.userData?.onClick || child.userData?.isInteractive) {
            objects.push(child);
          }
        });
      }
      return objects;
    },
    onSelectNode: (asset, mesh) => selectPlanet(mesh),
    onResetView: () => resetCameraView(),
    onExitVR: () => handleExitVR(),
    onSessionEnd: () => handleExitVR(),
    onCloseChart: () => handleCloseChart(),
    onToggleOrbit: () => toggleAutoOrbit(),
    onToggleFlowMode: () => toggleFlowMode(),
    onToggleAudio: () => toggleAudioEngine(),
    onToggleChart: () => {
      if (getCurrentChart()) {
        handleCloseChart();
      } else if (selectedPlanetMesh) {
        selectPlanet(selectedPlanetMesh);
      } else if (planetsGroup.children.length > 0) {
        const first = planetsGroup.children[0].userData?.primaryMesh || planetsGroup.children[0];
        selectPlanet(first);
      }
    },
    onToggleManageData: () => {
      if (renderer.xr.isPresenting && xrManager) {
        xrManager.toggleSpatialDataPanel();
      } else {
        const modal = document.getElementById('portfolio-modal');
        if (modal) {
          const isOpen = modal.classList.toggle('open');
          if (isOpen) {
            soundFx.playSelectSound();
            renderModalAssetList();
          } else {
            soundFx.playCloseSound();
          }
        }
      }
    },
    onAdjustAsset: (assetId, delta) => {
      adjustAssetAllocation(assetId, delta);
    },
    onFilterCategory: (category) => applyCategoryFilter(category),
    onToggleChartMode: (targetMode) => {
      const currentMode = getChartDisplayMode ? getChartDisplayMode() : 'spline';
      const nextMode = targetMode || (currentMode === 'spline' ? 'candlestick' : 'spline');
      setChartDisplayMode(nextMode);
      if (xrManager?.updateChartMode) xrManager.updateChartMode(nextMode);
    },
    onSelectQuickTicker: (symbol, stockData) => {
      selectStockSymbol(symbol, stockData);
    },
    onSelectStock: (symbol, stockData) => {
      selectStockSymbol(symbol, stockData);
    }
  });

  // 9. DOM Event Listeners
  setupEventListeners();

  // 10. Portfolio Data Subscription
  subscribePortfolio(onPortfolioChanged);

  // 11. Render Loop
  renderer.setAnimationLoop(renderLoop);
}

/* ==========================================================================
   Post-Processing Pipeline
   ========================================================================== */
function setupPostProcessing() {
  const renderPass = new RenderPass(scene, camera);

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.95, // Cinematic bloom strength
    0.35,
    0.82
  );

  const outputPass = new OutputPass();

  composer = new EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);
}

/* ==========================================================================
   Physical Celestial Lighting
   ========================================================================== */
function setupPhysicalLighting() {
  // Deep space ambient fill
  const ambient = new THREE.AmbientLight(0x0f172a, 1.2);
  scene.add(ambient);

  // Central stellar point light with physical inverse-square decay
  const coreLight = new THREE.PointLight(0xfff7ed, 5.2, 85, 1.15);
  coreLight.position.set(0, 0, 0);
  coreLight.castShadow = true;
  coreLight.shadow.mapSize.width = 2048;
  coreLight.shadow.mapSize.height = 2048;
  coreLight.shadow.bias = -0.0005;
  scene.add(coreLight);

  // Distant celestial key light for shadow contrast
  const keyLight = new THREE.DirectionalLight(0x94a3b8, 1.4);
  keyLight.position.set(22, 35, 18);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 1024;
  keyLight.shadow.mapSize.height = 1024;
  scene.add(keyLight);

  // Galactic rim fill light
  const galacticRim = new THREE.DirectionalLight(0x38bdf8, 0.85);
  galacticRim.position.set(-20, -10, -25);
  scene.add(galacticRim);
}

function setupNebulaSkybox() {
  const domeGeo = new THREE.SphereGeometry(220, 32, 32);
  const domeMat = createNebulaBackdropMaterial();
  nebulaDome = new THREE.Mesh(domeGeo, domeMat);
  nebulaDome.name = 'NebulaDome';
  scene.add(nebulaDome);
}

function setupVolumetricDustCloud() {
  const size = 58;
  const count = 52;
  const total = count * count;

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  dustOriginalY = new Float32Array(total);

  const colA = new THREE.Color(0x38bdf8);
  const colB = new THREE.Color(0xa855f7);

  let idx = 0;
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      const u = i / (count - 1);
      const v = j / (count - 1);
      const x = (u - 0.5) * size;
      const z = (v - 0.5) * size;
      const dist = Math.sqrt(x * x + z * z);
      const y = -3.2 + Math.sin(dist * 0.25) * 0.4;

      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;
      dustOriginalY[idx] = y;

      const mixed = colA.clone().lerp(colB, (u + v) * 0.5);
      colors[idx * 3] = mixed.r;
      colors[idx * 3 + 1] = mixed.g;
      colors[idx * 3 + 2] = mixed.b;

      idx++;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.15,
    vertexColors: true,
    transparent: true,
    opacity: 0.48,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  dustCloudParticles = new THREE.Points(geometry, material);
  dustPositions = positions;
  scene.add(dustCloudParticles);
}

function setupCosmicStarfield() {
  const starCount = 1500;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount * 3; i += 3) {
    positions[i] = (Math.random() - 0.5) * 160;
    positions[i + 1] = (Math.random() - 0.5) * 80 + 10;
    positions[i + 2] = (Math.random() - 0.5) * 160;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    size: 0.13,
    color: 0x94a3b8,
    transparent: true,
    opacity: 0.55
  });

  const stars = new THREE.Points(geometry, material);
  scene.add(stars);
}

/**
 * Reactive callback when portfolio data changes.
 */
function onPortfolioChanged() {
  // 1. Re-render photorealistic asset nodes
  renderAssetNodes(portfolioState.assets, currentCategory);

  // 2. Re-create orbit paths
  if (orbitPathsGroup) {
    scene.remove(orbitPathsGroup);
    orbitPathsGroup.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
  }
  orbitPathsGroup = createOrbitPaths(portfolioState.assets, currentCategory);
  scene.add(orbitPathsGroup);

  // 3. Update Central Star Header
  if (centralSun?.userData?.labelNetWorth) {
    centralSun.userData.labelNetWorth.text = `${portfolioState.summary.formattedNetWorth}\nTOTAL NET WORTH`;
    centralSun.userData.labelNetWorth.sync();
  }

  // 4. Update HUD
  const netWorthElem = document.getElementById('hud-net-worth');
  if (netWorthElem) netWorthElem.textContent = portfolioState.summary.formattedNetWorth;

  const inflowElem = document.getElementById('hud-inflow');
  if (inflowElem) inflowElem.textContent = portfolioState.summary.monthlyInflow || '+$6,420';

  const outflowElem = document.getElementById('hud-outflow');
  if (outflowElem) outflowElem.textContent = portfolioState.summary.monthlyOutflow || '-$3,850';

  const netSavingsElem = document.getElementById('hud-net-savings');
  if (netSavingsElem) netSavingsElem.textContent = portfolioState.summary.netMonthlySavings || '+$2,570 / mo';

  // 5. Update WebXR Wrist Holographic Palette Net Worth & Spatial Data Slate
  if (xrManager?.updateNetWorthText) {
    xrManager.updateNetWorthText(portfolioState.summary.formattedNetWorth);
  }
  if (xrManager?.updateSpatialDataPanel) {
    xrManager.updateSpatialDataPanel(portfolioState);
  }

  renderModalAssetList();
}

/* ==========================================================================
   Selection & Chart Viewport Summoning
   ========================================================================== */
export function selectPlanet(planetMesh) {
  if (!planetMesh) return;
  selectedPlanetMesh = planetMesh;

  // Isolate active planet: hide background floating Troika labels
  setLabelsOcclusionState(planetMesh);

  // Auto-pause planetary orbit during chart inspection
  pauseOrbitForChart();

  // Summon High-Tech Holographic Financial HUD directly into user viewport
  const isVR = Boolean(renderer?.xr?.isPresenting);
  const activeCamera = (isVR && renderer?.xr?.getCamera) ? renderer.xr.getCamera() : camera;
  show3DSplineChart(planetMesh, scene, { camera: activeCamera, isVR, renderer });

  // Update HUD Card
  updateHUDCard(planetMesh.userData);
}

export function handleExitVR() {
  const session = renderer?.xr?.getSession ? renderer.xr.getSession() : null;
  if (session) {
    session.end().catch((err) => console.warn('WebXR session end error:', err));
  }

  // Smoothly restore desktop UI visibility
  const hudContainer = document.getElementById('hud-container');
  if (hudContainer) {
    hudContainer.style.opacity = '1';
    hudContainer.style.pointerEvents = 'auto';
  }
  document.body.classList.remove('vr-mode');

  // Reset camera controls back to standard OrbitControls overview
  resetCameraView();
}

export function resetCameraView() {
  soundFx.playCloseSound();

  // Reset VR User Rig
  if (xrManager?.resetRigPosition) {
    xrManager.resetRigPosition();
  }

  const twPos = new TWEEN.Tween(camera.position)
    .to({ x: 0, y: 16, z: 26 }, 950)
    .easing(TWEEN.Easing.Cubic.Out);
  TWEEN.add(twPos);
  twPos.start();

  const twTgt = new TWEEN.Tween(controls.target)
    .to({ x: 0, y: 0, z: 0 }, 950)
    .easing(TWEEN.Easing.Cubic.Out);
  TWEEN.add(twTgt);
  twTgt.start();

  handleCloseChart();
}

function handleCloseChart() {
  if (activeTickUnsubscribe) {
    activeTickUnsubscribe();
    activeTickUnsubscribe = null;
  }
  activeLiveSymbol = null;
  removeCurrentChart(scene);
  setLabelsOcclusionState(null); // Restore all floating planet labels
  const card = document.getElementById('inspector-card');
  if (card) card.classList.remove('visible');
  selectedPlanetMesh = null;
  document.querySelectorAll('.quick-ticker-pill').forEach((p) => p.classList.remove('active'));

  // Restore orbit state after chart inspection
  restoreOrbitAfterChart();
}

export async function selectStockSymbol(symbol, stockMetadata = null) {
  if (!symbol) return;
  const sym = symbol.toUpperCase().trim();
  activeLiveSymbol = sym;

  if (activeTickUnsubscribe) {
    activeTickUnsubscribe();
    activeTickUnsubscribe = null;
  }

  soundFx.playSelectSound();

  // Highlight matching quick ticker pill
  document.querySelectorAll('.quick-ticker-pill').forEach((pill) => {
    pill.classList.toggle('active', pill.getAttribute('data-ticker') === sym);
  });

  // Find if matching planet exists in scene
  let targetPlanet = null;
  planetsGroup.traverse((child) => {
    if (child.userData?.isAssetNode && (child.userData.ticker?.toUpperCase() === sym || child.userData.symbol?.toUpperCase() === sym)) {
      targetPlanet = child;
    }
  });

  // Prepare full stock object
  let stockData = stockMetadata;
  if (!stockData) {
    stockData = STOCK_CATALOG.find((s) => s.symbol.toUpperCase() === sym) ||
                INDIAN_STOCKS.find((s) => s.symbol.toUpperCase() === sym) ||
                (targetPlanet?.userData ? { ...targetPlanet.userData, symbol: sym } : null) ||
                { symbol: sym, ticker: sym, name: sym, price: 100, currency: 'USD', exchange: '' };
  }

  // Ensure consistent fields
  stockData = {
    ...stockData,
    symbol: sym,
    ticker: sym,
    name: stockData.name || sym,
    price: stockData.price ?? 100,
    currency: stockData.currency || (stockData.exchange === 'NSE' || stockData.exchange === 'BSE' || INDIAN_STOCKS.some((s) => s.symbol === sym) ? 'INR' : 'USD'),
    exchange: stockData.exchange || (stockData.currency === 'INR' ? 'NSE' : '')
  };

  if (targetPlanet) {
    selectedPlanetMesh = targetPlanet;
    setLabelsOcclusionState(targetPlanet);
  } else {
    selectedPlanetMesh = null;
    setLabelsOcclusionState(null);
  }

  // Auto-pause planetary orbit during chart inspection
  pauseOrbitForChart();

  // Summon 3D Chart directly to user's viewport without camera fly-to
  const isVR = Boolean(renderer?.xr?.isPresenting);
  const activeCamera = (isVR && renderer?.xr?.getCamera) ? renderer.xr.getCamera() : camera;
  show3DSplineChart(targetPlanet || stockData, scene, { camera: activeCamera, isVR, renderer });

  // Update 2D Inspector Card immediately
  updateHUDCardWithLiveData({
    ...stockData,
    latestPrice: stockData.price,
    changePercent: stockData.returns || 4.5
  });

  // Fetch real-time candle data via Finnhub API service (or synthetic fallback)
  try {
    const liveData = await fetchStockCandles(sym);
    updateChartWithRealtimeData(sym, liveData, scene);

    // Update 2D Inspector Card with live data
    updateHUDCardWithLiveData(liveData);

    // Subscribe to live WebSocket trade ticks stream
    activeTickUnsubscribe = subscribeLiveTicks(sym, (tick) => {
      applyLiveTickUpdate(tick);

      // Dynamically update Inspector card return percentage if open
      const retElem = document.getElementById('card-returns');
      if (retElem && liveData) {
        const firstPrice = liveData.candles[0]?.open || liveData.latestPrice;
        const changePct = Math.round(((tick.price - firstPrice) / firstPrice) * 10000) / 100;
        retElem.textContent = `${changePct >= 0 ? '+' : ''}${changePct}%`;
        retElem.style.color = changePct >= 0 ? 'var(--color-accent-green)' : 'var(--color-danger)';
      }
    });
  } catch (err) {
    console.warn('Failed to load stock data for:', sym, err);
  }
}

function updateHUDCardWithLiveData(liveData) {
  const card = document.getElementById('inspector-card');
  if (!card || !liveData) return;

  const isPositive = (liveData.changePercent ?? 0) >= 0;
  const currency = liveData.currency || (liveData.exchange === 'NSE' || liveData.exchange === 'BSE' ? 'INR' : 'USD');
  const formattedPrice = formatCurrency(liveData.latestPrice, currency);

  document.getElementById('card-ticker').textContent = `${liveData.symbol}${liveData.exchange ? ` (${liveData.exchange})` : ''}`;
  document.getElementById('card-name').textContent = liveData.name || liveData.symbol;
  document.getElementById('card-allocation').textContent = `Live Price: ${formattedPrice}`;
  const returnsElem = document.getElementById('card-returns');
  if (returnsElem) {
    returnsElem.textContent = `${isPositive ? '+' : ''}${liveData.changePercent}%`;
    returnsElem.style.color = isPositive ? 'var(--color-accent-green)' : 'var(--color-danger)';
  }
  document.getElementById('card-sharpe').textContent = liveData.sharpe || '2.45';
  document.getElementById('card-volatility').textContent = (liveData.volatility || 'MED').toUpperCase();
  document.getElementById('card-desc').textContent = `Real-time Finnhub market data feed for ${liveData.name || liveData.symbol}. Live OHLC bars & WebSocket ticks streaming active.`;

  card.classList.add('visible');
}

function updateHUDCard(data) {
  const card = document.getElementById('inspector-card');
  if (!card || !data) return;

  document.getElementById('card-ticker').textContent = data.ticker || 'ASSET';
  document.getElementById('card-name').textContent = data.name || 'Asset Name';
  document.getElementById('card-allocation').textContent = `${data.allocation || 0}% (${data.formattedValue || '$0'})`;
  document.getElementById('card-returns').textContent = data.formattedReturns || '+0%';
  document.getElementById('card-sharpe').textContent = data.metrics?.sharpe || 2.1;
  document.getElementById('card-volatility').textContent = (data.volatility || 'MED').toUpperCase();
  document.getElementById('card-desc').textContent = data.description || 'Photorealistic celestial asset holding.';

  card.classList.add('visible');
}

function toggleAutoOrbit() {
  isAutoOrbiting = !isAutoOrbiting;
  const btnAutoOrbit = document.getElementById('btn-auto-orbit');
  if (btnAutoOrbit) {
    btnAutoOrbit.classList.toggle('active', isAutoOrbiting);
    btnAutoOrbit.querySelector('span').textContent = isAutoOrbiting ? 'Orbit: ON' : 'Orbit: PAUSED';
  }
  if (xrManager?.updateOrbitStatus) {
    xrManager.updateOrbitStatus(isAutoOrbiting);
  }
}

function toggleFlowMode(targetMode = null) {
  const modes = ['both', 'income', 'expenses', 'off'];
  if (targetMode && modes.includes(targetMode)) {
    currentFlowMode = targetMode;
  } else {
    const currentIndex = modes.indexOf(currentFlowMode);
    currentFlowMode = modes[(currentIndex + 1) % modes.length];
  }

  const btnToggleFlow = document.getElementById('btn-toggle-flow-mode');
  const span = btnToggleFlow?.querySelector('span');

  if (currentFlowMode === 'both') {
    if (cashFlowStream) cashFlowStream.setOpacity(1.0, 600);
    if (expenseStream) expenseStream.setOpacity(1.0, 600);
    if (btnToggleFlow) btnToggleFlow.className = 'btn-hud glass-panel interactive active';
    if (span) span.textContent = '⚡ Flow: Both';
    soundFx.playEnergySurgeSound();
  } else if (currentFlowMode === 'income') {
    if (cashFlowStream) cashFlowStream.setOpacity(1.0, 600);
    if (expenseStream) expenseStream.setOpacity(0.0, 600);
    if (btnToggleFlow) btnToggleFlow.className = 'btn-hud glass-panel interactive mode-income';
    if (span) span.textContent = '⚡ Flow: Inflow Only';
    soundFx.playSelectSound();
  } else if (currentFlowMode === 'expenses') {
    if (cashFlowStream) cashFlowStream.setOpacity(0.0, 600);
    if (expenseStream) expenseStream.setOpacity(1.0, 600);
    if (btnToggleFlow) btnToggleFlow.className = 'btn-hud glass-panel interactive mode-expenses';
    if (span) span.textContent = '⚡ Flow: Outflow Only';
    soundFx.playSelectSound();
  } else {
    if (cashFlowStream) cashFlowStream.setOpacity(0.0, 600);
    if (expenseStream) expenseStream.setOpacity(0.0, 600);
    if (btnToggleFlow) btnToggleFlow.className = 'btn-hud glass-panel interactive mode-off';
    if (span) span.textContent = '⚡ Flow: OFF';
    soundFx.playCloseSound();
  }

  if (xrManager?.updateFlowStatus) {
    xrManager.updateFlowStatus(currentFlowMode);
  }
}

function toggleAudioEngine() {
  const isEnabled = soundFx.toggle();
  const btnAudioToggle = document.getElementById('btn-toggle-audio');
  if (btnAudioToggle) {
    btnAudioToggle.classList.toggle('active', isEnabled);
    btnAudioToggle.querySelector('span').textContent = isEnabled ? 'Audio: ON' : 'Audio: MUTE';
  }
  if (xrManager?.updateAudioStatus) {
    xrManager.updateAudioStatus(isEnabled);
  }
  return isEnabled;
}

function applyCategoryFilter(category) {
  currentCategory = category || 'ALL';

  const filterChips = document.querySelectorAll('.category-chip');
  filterChips.forEach((chip) => {
    const chipCat = chip.getAttribute('data-category');
    if ((chipCat || '').toUpperCase() === currentCategory.toUpperCase()) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });

  renderAssetNodes(portfolioState.assets, currentCategory);

  if (orbitPathsGroup) {
    scene.remove(orbitPathsGroup);
    orbitPathsGroup.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
  }
  orbitPathsGroup = createOrbitPaths(portfolioState.assets, currentCategory);
  scene.add(orbitPathsGroup);

  if (xrManager?.updateActiveCategory) {
    xrManager.updateActiveCategory(currentCategory);
  }
}

/* ==========================================================================
   Desktop Mouse & Pointer Raycasting
   ========================================================================== */
function onPointerMove(event) {
  mousePointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  mousePointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  if (renderer.xr.isPresenting) return;

  mouseRaycaster.setFromCamera(mousePointer, camera);

  // 1. Check 3D Candlestick Hover & Floating Micro-HUD Tooltip
  const currentChart = getCurrentChart();
  let candleHit = null;
  if (currentChart) {
    const chartHits = mouseRaycaster.intersectObject(currentChart, true);
    for (const hit of chartHits) {
      if (hit.object.userData?.isCandle) {
        candleHit = hit.object;
        break;
      }
    }
  }

  if (candleHit !== hoveredCandleMesh) {
    if (hoveredCandleMesh) setCandleHoverState(hoveredCandleMesh, false);
    hoveredCandleMesh = candleHit;
    if (hoveredCandleMesh) {
      setCandleHoverState(hoveredCandleMesh, true);
      document.body.style.cursor = 'pointer';
    }
  }

  // 2. Check Planetary Node Hover
  const intersects = mouseRaycaster.intersectObjects(planetsGroup.children, true);

  if (intersects.length > 0) {
    let hit = intersects[0].object;
    while (hit && (!hit.userData || !hit.userData.isAssetNode)) {
      hit = hit.parent;
    }

    if (hit && hit !== hoveredMesh) {
      if (hoveredMesh) setNodeHoverState(hoveredMesh, false);
      hoveredMesh = hit;
      setNodeHoverState(hoveredMesh, true);
      document.body.style.cursor = 'pointer';
    }
  } else {
    if (hoveredMesh) {
      setNodeHoverState(hoveredMesh, false);
      hoveredMesh = null;
      if (!hoveredCandleMesh) document.body.style.cursor = 'default';
    }
  }
}

function onPointerClick(event) {
  if (renderer.xr.isPresenting) return;
  if (event.target.closest('.interactive')) return;

  mouseRaycaster.setFromCamera(mousePointer, camera);

  // Check 3D Chart close button, 3D mode toggles & resolution preset buttons
  const currentChart = getCurrentChart();
  if (currentChart) {
    const chartHits = mouseRaycaster.intersectObject(currentChart, true);
    if (chartHits.length > 0) {
      for (const hit of chartHits) {
        if (hit.object.userData?.isCloseButton) {
          handleCloseChart();
          return;
        }
        if (hit.object.userData?.isChartModeToggle) {
          setChartDisplayMode(hit.object.userData.targetMode);
          return;
        }
        if (hit.object.userData?.isResolutionPreset) {
          setChartResolutionPreset(hit.object.userData.presetId, scene);
          return;
        }
      }
    }
  }

  // Check planets in planetsGroup
  const intersects = mouseRaycaster.intersectObjects(planetsGroup.children, true);
  if (intersects.length > 0) {
    let hit = intersects[0].object;
    while (hit && (!hit.userData || !hit.userData.isAssetNode)) {
      hit = hit.parent;
    }
    if (hit && hit.userData?.isAssetNode) {
      selectPlanet(hit);
    }
  }
}

/* ==========================================================================
   Portfolio Management Modal & UI Binding
   ========================================================================== */
function renderModalAssetList() {
  const listContainer = document.getElementById('modal-asset-list');
  if (!listContainer) return;

  listContainer.innerHTML = '';

  portfolioState.assets.forEach((asset) => {
    const item = document.createElement('div');
    item.className = 'modal-asset-item';
    item.innerHTML = `
      <div class="asset-item-info">
        <span class="asset-color-badge" style="background-color: ${asset.color}; color: ${asset.color};"></span>
        <div class="asset-item-text">
          <strong>${asset.name}</strong> (${asset.ticker})
          <span class="asset-item-sub">${asset.category} • ${asset.formattedValue} (${asset.allocation}%) • ${asset.formattedReturns}</span>
        </div>
      </div>
      <div class="asset-item-actions">
        <button class="btn-delete-asset" data-id="${asset.id}" title="Delete Asset">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;
    listContainer.appendChild(item);
  });

  listContainer.querySelectorAll('.btn-delete-asset').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      soundFx.playCloseSound();
      const id = btn.getAttribute('data-id');
      deleteAsset(id);
    });
  });
}

function setupEventListeners() {
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('click', onPointerClick);

  // Auto Orbit Toggle
  const btnAutoOrbit = document.getElementById('btn-auto-orbit');
  if (btnAutoOrbit) {
    btnAutoOrbit.addEventListener('click', toggleAutoOrbit);
  }

  // Reset View
  const btnResetView = document.getElementById('btn-reset-view');
  if (btnResetView) {
    btnResetView.addEventListener('click', resetCameraView);
  }

  // Dual Cash Flow Streams Multi-Mode Toggle
  const btnToggleFlow = document.getElementById('btn-toggle-flow-mode');
  if (btnToggleFlow) {
    btnToggleFlow.addEventListener('click', () => {
      toggleFlowMode();
    });
  }

  // Audio Toggle
  const btnAudioToggle = document.getElementById('btn-toggle-audio');
  if (btnAudioToggle) {
    btnAudioToggle.addEventListener('click', () => {
      toggleAudioEngine();
    });
  }

  // Inspector Close
  const btnCloseCard = document.getElementById('btn-close-card');
  if (btnCloseCard) {
    btnCloseCard.addEventListener('click', handleCloseChart);
  }

  // Segmented Chart View Mode Toggle [Spline Area | 3D Candlesticks]
  const btnChartSpline = document.getElementById('btn-chart-spline');
  const btnChartCandle = document.getElementById('btn-chart-candlestick');
  if (btnChartSpline) {
    btnChartSpline.addEventListener('click', () => {
      setChartDisplayMode('spline');
      if (xrManager?.updateChartMode) xrManager.updateChartMode('spline');
    });
  }
  if (btnChartCandle) {
    btnChartCandle.addEventListener('click', () => {
      setChartDisplayMode('candlestick');
      if (xrManager?.updateChartMode) xrManager.updateChartMode('candlestick');
    });
  }

  // TradingView Dual-Parameter Timeframe & Resolution Selector (Pills & Dropdown Menu)
  document.querySelectorAll('.resolution-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      const presetId = pill.getAttribute('data-preset');
      if (presetId) {
        setChartResolutionPreset(presetId, scene);
      }
    });
  });

  const btnResDropdown = document.getElementById('btn-resolution-dropdown');
  const resMenu = document.getElementById('resolution-menu');
  if (btnResDropdown && resMenu) {
    btnResDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      resMenu.classList.toggle('active');
      soundFx.playSelectSound();
    });
  }

  document.querySelectorAll('.resolution-item').forEach((item) => {
    item.addEventListener('click', () => {
      const presetId = item.getAttribute('data-preset');
      if (presetId) {
        setChartResolutionPreset(presetId, scene);
        if (resMenu) resMenu.classList.remove('active');
      }
    });
  });

  // Close resolution menu on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.card-resolution-section')) {
      if (resMenu) resMenu.classList.remove('active');
    }
  });

  // Toggle 3D Chart Button
  const btnToggleSpline = document.getElementById('btn-toggle-spline');
  if (btnToggleSpline) {
    btnToggleSpline.addEventListener('click', () => {
      if (getCurrentChart()) {
        removeCurrentChart(scene);
      } else if (selectedPlanetMesh) {
        selectPlanet(selectedPlanetMesh);
      } else if (planetsGroup.children.length > 0) {
        const first = planetsGroup.children[0].userData?.primaryMesh || planetsGroup.children[0];
        selectPlanet(first);
      }
    });
  }

  // Sector Filter Chips
  const filterChips = document.querySelectorAll('.category-chip');
  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const category = chip.getAttribute('data-category');
      applyCategoryFilter(category);
      soundFx.playSelectSound();
    });
  });

  // Real-Time Stock Search Input & Suggestions
  const searchInput = document.getElementById('stock-search-input');
  const suggestionsBox = document.getElementById('stock-search-suggestions');
  const btnClearSearch = document.getElementById('btn-clear-search');
  let searchDebounceTimer = null;

  if (searchInput && suggestionsBox) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value;
      if (btnClearSearch) {
        btnClearSearch.style.display = query ? 'block' : 'none';
      }

      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      if (!query.trim()) {
        suggestionsBox.innerHTML = '';
        suggestionsBox.classList.remove('active');
        return;
      }

      searchDebounceTimer = setTimeout(async () => {
        const results = await searchTickers(query);
        if (!results || results.length === 0) {
          suggestionsBox.innerHTML = '<div class="suggestion-item"><span class="suggestion-desc">No tickers found</span></div>';
          suggestionsBox.classList.add('active');
          return;
        }

        suggestionsBox.innerHTML = results.map((item) => `
          <div class="suggestion-item" data-symbol="${item.symbol}">
            <div class="suggestion-left">
              <span class="suggestion-ticker">${item.symbol}</span>
              <span class="suggestion-desc">${item.description}</span>
            </div>
            <span class="suggestion-tag">${item.type || 'Stock'}</span>
          </div>
        `).join('');

        suggestionsBox.classList.add('active');

        suggestionsBox.querySelectorAll('.suggestion-item').forEach((itemElem) => {
          itemElem.addEventListener('click', () => {
            const sym = itemElem.getAttribute('data-symbol');
            if (sym) {
              searchInput.value = sym;
              suggestionsBox.classList.remove('active');
              const matchItem = results.find((r) => r.symbol === sym);
              selectStockSymbol(sym, matchItem ? { symbol: sym, name: matchItem.description, exchange: matchItem.exchange || '' } : null);
            }
          });
        });
      }, 200);
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = searchInput.value.trim().toUpperCase();
        if (query) {
          suggestionsBox.classList.remove('active');
          const matchCatalog = STOCK_CATALOG.find((s) => s.symbol === query) || INDIAN_STOCKS.find((s) => s.symbol === query);
          selectStockSymbol(query, matchCatalog);
        }
      } else if (e.key === 'Escape') {
        suggestionsBox.classList.remove('active');
      }
    });

    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
        searchInput.value = '';
        btnClearSearch.style.display = 'none';
        suggestionsBox.innerHTML = '';
        suggestionsBox.classList.remove('active');
      });
    }

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.stock-search-box')) {
        suggestionsBox.classList.remove('active');
      }
    });
  }

  // Quick Ticker Pills
  document.querySelectorAll('.quick-ticker-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      const sym = pill.getAttribute('data-ticker');
      if (sym) {
        if (searchInput) searchInput.value = sym;
        if (btnClearSearch) btnClearSearch.style.display = 'block';
        const catalogStock = STOCK_CATALOG.find((s) => s.symbol === sym) || INDIAN_STOCKS.find((s) => s.symbol === sym);
        selectStockSymbol(sym, catalogStock);
      }
    });
  });

  // Modal Open/Close
  const btnOpenModal = document.getElementById('btn-manage-portfolio');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const modal = document.getElementById('portfolio-modal');

  if (btnOpenModal && modal) {
    btnOpenModal.addEventListener('click', () => {
      soundFx.playSelectSound();
      renderModalAssetList();
      modal.classList.add('open');
    });
  }
  if (btnCloseModal && modal) {
    btnCloseModal.addEventListener('click', () => {
      soundFx.playCloseSound();
      modal.classList.remove('open');
    });
  }

  // Preset Selector
  const presetSelect = document.getElementById('preset-select');
  if (presetSelect) {
    presetSelect.addEventListener('change', (e) => {
      soundFx.playEnergySurgeSound();
      loadPresetProfile(e.target.value);
    });
  }

  // Add Asset Form
  const addForm = document.getElementById('add-asset-form');
  if (addForm) {
    addForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('input-asset-name').value.trim();
      const ticker = document.getElementById('input-asset-ticker').value.trim() || 'CUSTOM';
      const category = document.getElementById('input-asset-category').value;
      const valRaw = parseFloat(document.getElementById('input-asset-value').value);
      const retRaw = parseFloat(document.getElementById('input-asset-returns').value);
      const volatility = document.getElementById('input-asset-volatility').value;

      const value = isNaN(valRaw) || valRaw <= 0 ? 50000 : valRaw;
      const returns = isNaN(retRaw) ? 10.0 : retRaw;

      if (name) {
        soundFx.playEnergySurgeSound();
        addAsset({ name, ticker, category, value, returns, volatility });
        addForm.reset();
      }
    });
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  if (composer) {
    composer.setSize(window.innerWidth, window.innerHeight);
  }
}

/* ==========================================================================
   Main Render Loop
   ========================================================================== */
function renderLoop(timestamp, frame) {
  const delta = clock.getDelta();
  const elapsedTime = clock.getElapsedTime();

  // 1. Update Tweens
  TWEEN.update();

  // 2. OrbitControls
  if (!renderer.xr.isPresenting) {
    controls.update();
  }

  // 3. Update Nebula Shader Time
  if (nebulaDome?.material?.uniforms) {
    nebulaDome.material.uniforms.uTime.value = elapsedTime;
  }

  // 4. Animate Volumetric Dust Cloud Floor
  if (dustCloudParticles && dustPositions) {
    const total = dustOriginalY.length;
    for (let i = 0; i < total; i++) {
      const x = dustPositions[i * 3];
      const z = dustPositions[i * 3 + 2];
      const wave = Math.sin(x * 0.16 + elapsedTime * 1.4) * Math.cos(z * 0.16 + elapsedTime * 1.4) * 0.48;
      dustPositions[i * 3 + 1] = dustOriginalY[i] + wave;
    }
    dustCloudParticles.geometry.attributes.position.needsUpdate = true;
  }

  // 5. Animate Celestial Bodies (Solar Core Granulation, Corona Flare, Planetary Rotation, Rings & Asteroid Belts)
  updateCelestialAnimations(delta, elapsedTime, isAutoOrbiting, centralSun);

  // 6. Animate Cash-Flow Accretion & Expense Outflow Streams
  if (cashFlowStream) {
    cashFlowStream.update(delta, elapsedTime, centralSun);
  }
  if (expenseStream) {
    expenseStream.update(delta, elapsedTime);
  }

  // 7. Billboard Text Labels & Smooth Slerp Active Chart to Camera
  const activeCamera = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  billboardLabels(activeCamera, centralSun);
  updateActiveChart(activeCamera, delta);

  // 7. Update WebXR Hand-Tracking, Controllers & Wrist Dock
  if (xrManager) {
    const interactiveObjects = [];
    planetsGroup.traverse((child) => {
      if (child.userData?.isAssetNode) interactiveObjects.push(child);
    });
    const chart = getCurrentChart();
    if (chart) {
      chart.traverse((child) => {
        if (child.userData?.isCloseButton || child.userData?.isChartModeToggle || child.userData?.isCandle || child.userData?.isResolutionPreset || child.userData?.isVRButton || child.userData?.onClick || child.userData?.isInteractive) {
          interactiveObjects.push(child);
        }
      });
    }
    xrManager.update(interactiveObjects, delta);
  }

  // 8. Render Frame (Bloom vs WebXR stereo direct)
  if (renderer.xr.isPresenting) {
    renderer.render(scene, camera);
  } else {
    composer.render();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  init();
});
