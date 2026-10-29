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
  currentMarket,
  switchMarket,
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
  applySectorGhosting,
  createCashFlowStream,
  createExpenseOutflowStream,
  billboardLabels,
  setNodeHoverState,
  setLabelsOcclusionState,
  updateCelestialAnimations
} from './nodes.js';
import { createNebulaBackdropMaterial } from './shaders.js';
import {
  GALAXY_THEMES,
  setGalaxyTheme,
  getCurrentGalaxyTheme,
  registerSceneEnvironment,
  createDynamicCosmicStarfield,
  updateGalaxyEnvironment,
  setSectorThemeSync,
  setPassthroughMode,
  getPassthroughMode,
  tabletopPivot
} from './scene.js';
import {
  createCentralMacroStar,
  triggerMacroStressTest,
  tickStressTest,
  isStressTestActive,
  onStressTestChange
} from './solar-system.js';
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
  updateCandleHover,
  clearCandleHover,
  updateCandleScrubber,
  clearCandleScrubber,
  setChartResolutionPreset,
  RESOLUTION_PRESETS,
  activeChartWindows,
  closeChartWindow,
  closeHitboxRegistry,
  openOrFocusChart,
  spawnOrFocusChart,
  pulseChartHighlight,
  triggerWolfEasterEgg,
  handleTitleBarClick,
  setChartsScene
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
let solarSystemGroup, tabletopBaseDisc, activeTabletopTween;
let isPassthroughMode = false;
let centralSun, nebulaDome, orbitPathsGroup, cashFlowStream, expenseStream;
let ambientLight, coreLight, keyLight, galacticRim, cosmicStarfieldGroup;
let dustCloudParticles, dustPositions, dustOriginalY;
let mouseRaycaster, mousePointer;
let hoveredMesh = null;
let hoveredCandleMesh = null;
let cachedPlanetInteractive = null;
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
    alpha: true,
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
  cosmicStarfieldGroup = createDynamicCosmicStarfield(scene);

  if (typeof window !== 'undefined') {
    window.skyboxMesh = nebulaDome;
    window.spaceParticles = cosmicStarfieldGroup;
    window.baseRingMesh = baseRingMesh;
    window.tabletopPivot = tabletopPivot;
    window.hasAnchoredToTable = false;
    window.scene = scene;
    setChartsScene(scene);
  }

  // 6. Photorealistic Celestial Ecosystem & Tabletop Solar System Root
  solarSystemGroup = new THREE.Group();
  solarSystemGroup.name = 'SolarSystemGroup';
  if (typeof window !== 'undefined') {
    window.solarSystemGroup = solarSystemGroup;
  }
  scene.add(tabletopPivot);
  tabletopPivot.add(solarSystemGroup);

  centralSun = createCentralSun(portfolioState.summary);
  centralSun.userData.isTabletopAnchor = true;
  centralSun.userData.isGrabbable = true;
  solarSystemGroup.add(centralSun);
  if (typeof window !== 'undefined') {
    window.centralSun = centralSun;
  }

  // Central Celestial Benchmark Star & Black Hole Morph Architecture
  const { centralMacroStarGroup, starMesh } = createCentralMacroStar();
  solarSystemGroup.add(centralMacroStarGroup);
  if (typeof window !== 'undefined') {
    window.centralMacroStar = starMesh;
    window.centralMacroStarGroup = centralMacroStarGroup;
  }

  // Futuristic Tabletop Holographic Base Disc (Desk Anchor Dock)
  const baseRingGeo = new THREE.RingGeometry(1.5, 2.7, 64);
  const baseRingMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending
  });
  tabletopBaseDisc = new THREE.Mesh(baseRingGeo, baseRingMat);
  tabletopBaseDisc.rotation.x = Math.PI / 2;
  tabletopBaseDisc.position.y = -0.15;
  tabletopBaseDisc.name = 'TabletopBaseDisc';
  tabletopBaseDisc.userData = { isTabletopAnchor: true, isInteractive: true, isDraggableBase: true };
  if (typeof window !== 'undefined') {
    window.tabletopBaseDisc = tabletopBaseDisc;
  }
  solarSystemGroup.add(tabletopBaseDisc);

  solarSystemGroup.add(planetsGroup);
  renderAssetNodes(portfolioState.assets, 'ALL');

  orbitPathsGroup = createOrbitPaths(portfolioState.assets, 'ALL', getCurrentGalaxyTheme());
  solarSystemGroup.add(orbitPathsGroup);

  // 7. Budget Cash-Flow Particle Streams (Accretion & Polar Outflow Jets)
  cashFlowStream = createCashFlowStream(solarSystemGroup);
  expenseStream = createExpenseOutflowStream(solarSystemGroup);

  // 8. Register Scene Environment with Galaxy Theme Engine
  registerSceneEnvironment({
    scene,
    nebulaDome,
    centralSun,
    ambientLight,
    coreLight,
    keyLight,
    galacticRim,
    starfield: cosmicStarfieldGroup,
    dustCloud: dustCloudParticles
  });
  setGalaxyTheme('US_WALLSTREET', 0);

  // 9. Raycasting
  mouseRaycaster = new THREE.Raycaster();
  mousePointer = new THREE.Vector2();

  // 10. WebXR Manager Setup
  xrManager = new XRManager(renderer, scene, camera, {
    getInteractiveObjects: () => {
      if (!cachedPlanetInteractive && planetsGroup) {
        cachedPlanetInteractive = [];
        planetsGroup.traverse((child) => {
          if (child.userData?.isAssetNode && (child.isMesh || child.userData?.primaryMesh)) {
            cachedPlanetInteractive.push(child);
          }
        });
      }
      const objects = [...(cachedPlanetInteractive || [])];
      activeChartWindows.forEach((win) => {
        if (win.userData?.titleBar) objects.push(win.userData.titleBar);
        if (win.userData?.closeBtn) objects.push(win.userData.closeBtn);
        if (win.userData?.glassPanel) objects.push(win.userData.glassPanel);
        if (win.userData?.registeredButtons) {
          win.userData.registeredButtons.forEach((b) => objects.push(b));
        }
      });
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
    onSetMode: (mode) => handleSetMode(mode),
    onTogglePassthrough: (isActive) => handleSetMode(isActive ? 'MR' : 'VR'),
    onSwitchMarket: (marketKey) => handleSwitchMarket(marketKey),
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
  xrManager.setSolarSystemGroup(solarSystemGroup);

  // 11. DOM Event Listeners
  setupEventListeners();

  // 12. Portfolio Data Subscription
  subscribePortfolio(onPortfolioChanged);

  // 13. Render Loop
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
  ambientLight = new THREE.AmbientLight(0x0b1528, 1.25);
  scene.add(ambientLight);

  // Central stellar point light with physical inverse-square decay
  coreLight = new THREE.PointLight(0xe0f2fe, 5.2, 85, 1.15);
  coreLight.position.set(0, 0, 0);
  coreLight.castShadow = true;
  coreLight.shadow.mapSize.width = 2048;
  coreLight.shadow.mapSize.height = 2048;
  coreLight.shadow.bias = -0.0005;
  scene.add(coreLight);

  // Distant celestial key light for shadow contrast
  keyLight = new THREE.DirectionalLight(0x38bdf8, 1.5);
  keyLight.position.set(22, 35, 18);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 1024;
  keyLight.shadow.mapSize.height = 1024;
  scene.add(keyLight);

  // Galactic rim fill light
  galacticRim = new THREE.DirectionalLight(0x0284c7, 0.95);
  galacticRim.position.set(-20, -10, -25);
  scene.add(galacticRim);
}

function setupNebulaSkybox() {
  const domeGeo = new THREE.SphereGeometry(220, 32, 32);
  const domeMat = createNebulaBackdropMaterial({
    voidColor: 0x020617,
    nebula1: 0x0369a1,
    nebula2: 0x312e81,
    haze: 0x06b6d4,
    speed: 1.2
  });
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

/**
 * Handles switching between country stock markets: India (Bharat) vs US (Wall Street).
 * @param {'IN'|'US'} marketKey
 */
export function handleSwitchMarket(marketKey) {
  const m = (marketKey || 'US').toUpperCase();
  const isIN = m === 'IN' || m === 'BHARAT';

  // 1. Switch Portfolio Preset & Currency
  switchMarket(isIN ? 'IN' : 'US');

  // 2. Switch Galaxy Theme (smooth 800ms transition)
  const targetThemeKey = isIN ? 'IN_BHARAT' : 'US_WALLSTREET';
  const theme = setGalaxyTheme(targetThemeKey, 800);

  // 3. Update Stream Colors if streams exist
  if (cashFlowStream?.setStreamColors && theme?.streams?.inflow) {
    cashFlowStream.setStreamColors(theme.streams.inflow);
  }
  if (expenseStream?.setStreamColors && theme?.streams?.outflow) {
    expenseStream.setStreamColors(theme.streams.outflow);
  }

  // 4. Update Desktop Header Market Switcher Pill buttons
  const btnUs = document.getElementById('btn-market-us');
  const btnIn = document.getElementById('btn-market-in');
  if (btnUs) btnUs.classList.toggle('active', !isIN);
  if (btnIn) btnIn.classList.toggle('active', isIN);

  // 5. Update Preset dropdown if present
  const presetSelect = document.getElementById('preset-select');
  if (presetSelect) {
    presetSelect.value = isIN ? 'india-bluechip' : 'institutional';
  }

  // 6. Update WebXR Wrist HUD
  if (xrManager?.updateMarketStatus) {
    xrManager.updateMarketStatus(isIN ? 'IN' : 'US');
  }

  // 7. Play Sound FX
  soundFx.playEnergySurgeSound();
}

/**
 * Reactive callback when portfolio data changes.
 */
function onPortfolioChanged() {
  // 1. Re-render photorealistic asset nodes
  renderAssetNodes(portfolioState.assets, currentCategory);

  // 2. Re-create orbit paths matching active galaxy theme
  if (orbitPathsGroup) {
    if (solarSystemGroup) {
      solarSystemGroup.remove(orbitPathsGroup);
    } else {
      scene.remove(orbitPathsGroup);
    }
    orbitPathsGroup.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
  }
  orbitPathsGroup = createOrbitPaths(portfolioState.assets, currentCategory, getCurrentGalaxyTheme());
  if (solarSystemGroup) {
    solarSystemGroup.add(orbitPathsGroup);
  } else {
    scene.add(orbitPathsGroup);
  }

  // 3. Update Central Star Header with formatted Net Worth
  if (centralSun?.userData?.labelNetWorth) {
    centralSun.userData.labelNetWorth.text = `${portfolioState.summary.formattedNetWorth}\nTOTAL NET WORTH`;
    centralSun.userData.labelNetWorth.sync();
  }

  // 4. Update HUD
  const netWorthElem = document.getElementById('hud-net-worth');
  if (netWorthElem) netWorthElem.textContent = portfolioState.summary.formattedNetWorth;

  const isINR = (portfolioState.summary.currency || '').toUpperCase() === 'INR';
  const inflowElem = document.getElementById('hud-inflow');
  if (inflowElem) inflowElem.textContent = portfolioState.summary.monthlyInflow || (isINR ? '+₹5,35,000' : '+$6,420');

  const outflowElem = document.getElementById('hud-outflow');
  if (outflowElem) outflowElem.textContent = portfolioState.summary.monthlyOutflow || (isINR ? '-₹3,20,000' : '-$3,850');

  const netSavingsElem = document.getElementById('hud-net-savings');
  if (netSavingsElem) netSavingsElem.textContent = portfolioState.summary.netMonthlySavings || (isINR ? '+₹2,15,000 / mo' : '+$2,570 / mo');

  // 5. Update WebXR Wrist Holographic Palette Net Worth, Market Status & Spatial Data Slate
  if (xrManager?.updateNetWorthText) {
    xrManager.updateNetWorthText(portfolioState.summary.formattedNetWorth);
  }
  if (xrManager?.updateMarketStatus) {
    xrManager.updateMarketStatus(currentMarket);
  }
  if (xrManager?.updateSpatialDataPanel) {
    xrManager.updateSpatialDataPanel(portfolioState);
  }

  renderModalAssetList();
}

/**
 * Switches between Dedicated Visual Modes:
 * - 'VR' (Deep Space VR Mode: Immersive space skybox, starfield, 1.0 full room scale at origin)
 * - 'MR' (Mixed Reality Tabletop Mode: Transparent WebGL background, 0.2 miniature scale at desk height)
 * @param {'VR'|'MR'|boolean} targetMode
 */
export function handleSetMode(targetMode) {
  const isMR = (targetMode === 'MR' || targetMode === 'TABLETOP' || targetMode === true);
  if (typeof window !== 'undefined') {
    window.hasAnchoredToTable = false;
  }
  isPassthroughMode = isMR;
  setPassthroughMode(isPassthroughMode);

  if (isPassthroughMode) {
    renderer.setClearColor(0x000000, 0);
    renderer.setClearAlpha(0);
    const session = renderer?.xr?.getSession ? renderer.xr.getSession() : null;
    if (session && typeof session.requestEnvironmentBlendMode === 'function') {
      session.requestEnvironmentBlendMode('alpha-blend').catch(() => {});
    }
  } else {
    renderer.setClearColor(0x030712, 1);
    renderer.setClearAlpha(1);
    const session = renderer?.xr?.getSession ? renderer.xr.getSession() : null;
    if (session && typeof session.requestEnvironmentBlendMode === 'function') {
      session.requestEnvironmentBlendMode('opaque').catch(() => {});
    }
  }

  // Update XR HUD & Wrist Dock
  if (xrManager?.updateModeStatus) {
    xrManager.updateModeStatus(isMR ? 'MR' : 'VR');
  }

  // Update Desktop Header Pill Buttons
  const btnVR = document.getElementById('btn-mode-vr');
  const btnMR = document.getElementById('btn-mode-mr');
  if (btnVR) btnVR.classList.toggle('active', !isMR);
  if (btnMR) btnMR.classList.toggle('active', isMR);

  const targetPivot = tabletopPivot || solarSystemGroup;
  if (!targetPivot) return;

  if (activeTabletopTween) {
    activeTabletopTween.stop();
  }
  TWEEN.removeAll();

  const isVR = Boolean(renderer?.xr?.isPresenting);
  const activeCamera = (isVR && renderer?.xr?.getCamera) ? renderer.xr.getCamera() : camera;
  const currentPos = targetPivot.position;
  const currentScale = targetPivot.scale.x;

  if (solarSystemGroup && solarSystemGroup.parent === tabletopPivot) {
    solarSystemGroup.scale.set(1.0, 1.0, 1.0);
    solarSystemGroup.position.set(0, 0, 0);
  }

  if (isPassthroughMode) {
    // Miniature Tabletop scale (0.18)
    const targetScale = 0.18;
    let targetX = 0;
    let targetY = -0.15;
    let targetZ = 0;

    if (isVR) {
      const headPos = activeCamera.getWorldPosition(new THREE.Vector3());
      const headDir = new THREE.Vector3();
      activeCamera.getWorldDirection(headDir);
      headDir.y = 0;
      if (headDir.lengthSq() < 0.001) headDir.set(0, 0, -1);
      headDir.normalize();

      // Position 0.85m directly in front of the user at comfortable desk height (camera.y - 0.35)
      targetX = headPos.x + headDir.x * 0.85;
      targetZ = headPos.z + headDir.z * 0.85;
      targetY = headPos.y - 0.35;
    }

    activeTabletopTween = new TWEEN.Tween({
      x: currentPos.x,
      y: currentPos.y,
      z: currentPos.z,
      s: currentScale
    })
      .to({
        x: targetX,
        y: targetY,
        z: targetZ,
        s: targetScale
      }, 600)
      .easing(TWEEN.Easing.Cubic.Out)
      .onUpdate((obj) => {
        targetPivot.position.set(obj.x, obj.y, obj.z);
        targetPivot.scale.set(obj.s, obj.s, obj.s);
      });

    TWEEN.add(activeTabletopTween);
    activeTabletopTween.start();
  } else {
    // Restore full room-scale (1.0) and origin (0, 0, 0)
    activeTabletopTween = new TWEEN.Tween({
      x: currentPos.x,
      y: currentPos.y,
      z: currentPos.z,
      s: currentScale
    })
      .to({
        x: 0,
        y: 0,
        z: 0,
        s: 1.0
      }, 600)
      .easing(TWEEN.Easing.Cubic.Out)
      .onUpdate((obj) => {
        targetPivot.position.set(obj.x, obj.y, obj.z);
        targetPivot.scale.set(obj.s, obj.s, obj.s);
      });

    TWEEN.add(activeTabletopTween);
    activeTabletopTween.start();
  }

  soundFx.playEnergySurgeSound();
}

export function handleTogglePassthrough(isActive) {
  handleSetMode(isActive ? 'MR' : 'VR');
}

/* ==========================================================================
   Selection & Chart Viewport Summoning
   ========================================================================== */
export function selectPlanet(planetMesh) {
  if (!planetMesh) return;
  selectedPlanetMesh = planetMesh;

  // In multi-window mode, keep all planet labels visible so other assets remain identifiable
  setLabelsOcclusionState(null);

  // Auto-pause planetary orbit during chart inspection
  pauseOrbitForChart();

  // Summon High-Tech Holographic Financial HUD directly into user viewport
  const isVR = Boolean(renderer?.xr?.isPresenting);
  const isPassthrough = Boolean(xrManager?.isPassthroughActive || isPassthroughMode);
  const activeCamera = (isVR && renderer?.xr?.getCamera) ? renderer.xr.getCamera() : camera;
  const ticker = planetMesh.userData?.ticker || planetMesh.userData?.symbol;
  if (ticker) {
    const assetData = planetMesh.userData?.assetData || {
      name: planetMesh.userData?.name || ticker,
      price: planetMesh.userData?.price || '$1,200',
      change: planetMesh.userData?.change || '+2.5%',
      returns: planetMesh.userData?.returns || 0,
      color: planetMesh.userData?.color || '#00f0ff',
      currency: planetMesh.userData?.currency || 'USD'
    };
    openOrFocusChart(ticker, assetData, activeCamera, scene);
  } else {
    show3DSplineChart(planetMesh, scene, { camera: activeCamera, isVR, isPassthrough, renderer });
  }

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
    hudContainer.style.display = '';
  }
  document.body.classList.remove('vr-mode');
  document.body.classList.remove('in-xr');

  // Reset camera controls back to standard OrbitControls overview
  resetCameraView();
}

export function resetCameraView() {
  soundFx.playCloseSound();

  // Reset VR User Rig
  if (xrManager?.resetRigPosition) {
    xrManager.resetRigPosition();
  }

  if (!renderer?.xr?.isPresenting) {
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
  }

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
  } else {
    selectedPlanetMesh = null;
  }
  setLabelsOcclusionState(null);

  // Auto-pause planetary orbit during chart inspection
  pauseOrbitForChart();

  // Summon 3D Chart directly to user's viewport without camera fly-to
  const isVR = Boolean(renderer?.xr?.isPresenting);
  const isPassthrough = Boolean(xrManager?.isPassthroughActive || isPassthroughMode);
  const activeCamera = (isVR && renderer?.xr?.getCamera) ? renderer.xr.getCamera() : camera;
  const assetData = (targetPlanet && targetPlanet.userData) ? targetPlanet.userData : stockData;
  openOrFocusChart(sym, assetData, activeCamera, scene);

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

  // 1. Update UI chips in desktop HUD
  const filterChips = document.querySelectorAll('.category-chip');
  filterChips.forEach((chip) => {
    const chipCat = chip.getAttribute('data-category');
    if ((chipCat || '').toUpperCase() === currentCategory.toUpperCase()) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });

  // 2. Smoothly shift skybox nebula tint & orbit colors to sector theme
  const theme = setSectorThemeSync(currentCategory, currentMarket);

  // 3. Update stream colors if theme provides them
  if (cashFlowStream?.setStreamColors && theme?.streams?.inflow) {
    cashFlowStream.setStreamColors(theme.streams.inflow);
  }
  if (expenseStream?.setStreamColors && theme?.streams?.outflow) {
    expenseStream.setStreamColors(theme.streams.outflow);
  }

  // 4. Highlight matching planets while dimming out-of-sector assets to subtle ghost silhouettes (opacity: 0.18)
  applySectorGhosting(currentCategory, 450);

  // 5. Re-create orbit paths with active theme styling
  if (orbitPathsGroup) {
    if (solarSystemGroup) {
      solarSystemGroup.remove(orbitPathsGroup);
    } else {
      scene.remove(orbitPathsGroup);
    }
    orbitPathsGroup.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
  }
  orbitPathsGroup = createOrbitPaths(portfolioState.assets, currentCategory, getCurrentGalaxyTheme());
  if (solarSystemGroup) {
    solarSystemGroup.add(orbitPathsGroup);
  } else {
    scene.add(orbitPathsGroup);
  }

  // 6. Update WebXR wrist dock active category
  if (xrManager?.updateActiveCategory) {
    xrManager.updateActiveCategory(currentCategory);
  }
}


/* ==========================================================================
   Desktop Mouse & Pointer Raycasting
   ========================================================================== */
let desktopDraggedChart = null;
const desktopDragPlane = new THREE.Plane();
const desktopDragOffset = new THREE.Vector3();
const desktopIntersectPoint = new THREE.Vector3();

function onPointerDown(event) {
  if (renderer.xr.isPresenting) return;
  if (event.target.closest('.interactive')) return;

  mousePointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  mousePointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
  mouseRaycaster.setFromCamera(mousePointer, camera);

  for (const win of activeChartWindows) {
    const hits = mouseRaycaster.intersectObject(win, true);
    for (const hit of hits) {
      if (hit.object.userData?.isTitleBar) {
        desktopDraggedChart = win;
        const camDir = camera.getWorldDirection(new THREE.Vector3()).negate();
        desktopDragPlane.setFromNormalAndCoplanarPoint(camDir, hit.point);
        desktopDragOffset.copy(win.position).sub(hit.point);
        if (controls) controls.enabled = false;
        document.body.style.cursor = 'grabbing';
        soundFx.playEnergySurgeSound();
        return;
      }
    }
  }
}

function onPointerUp(event) {
  if (desktopDraggedChart) {
    desktopDraggedChart = null;
    if (controls) controls.enabled = true;
    document.body.style.cursor = 'default';
    soundFx.playHoverSound();
  }
}

function onPointerMove(event) {
  mousePointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  mousePointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  if (renderer.xr.isPresenting) return;

  mouseRaycaster.setFromCamera(mousePointer, camera);

  // If dragging chart window on desktop
  if (desktopDraggedChart) {
    if (mouseRaycaster.ray.intersectPlane(desktopDragPlane, desktopIntersectPoint)) {
      desktopDraggedChart.position.copy(desktopIntersectPoint).add(desktopDragOffset);
    }
    return;
  }

  // 1. Check 3D Candlestick Hover & Scrubber across all open chart windows
  let isOverChart = false;
  const currentDisplayMode = getChartDisplayMode();
  if (currentDisplayMode === 'candles' || currentDisplayMode === 'candlestick') {
    // A. Direct Candle Collider raycasting
    const allCandleColliders = [];
    activeChartWindows.forEach((win) => {
      if (win.userData?.candleColliders && win.userData.candleGroup?.visible !== false) {
        allCandleColliders.push(...win.userData.candleColliders);
      }
    });

    if (allCandleColliders.length > 0) {
      const candleHits = mouseRaycaster.intersectObjects(allCandleColliders, false);
      if (candleHits.length > 0) {
        const hitCandle = candleHits[0].object;
        if (hitCandle.userData?.isCandle) {
          updateCandleHover(hitCandle);
          isOverChart = true;
          hoveredWin = hitCandle.userData.parentChart || hitCandle.userData.parentWindow;
          document.body.style.cursor = 'pointer';
        }
      }
    }

    // B. Check scrubber & window interactive surface fallback
    if (!isOverChart) {
      for (const win of activeChartWindows) {
        const chartHits = mouseRaycaster.intersectObject(win, true);
        if (chartHits.length > 0) {
          const firstHit = chartHits[0];
          if (firstHit.point && !firstHit.object.userData?.isTitleBar && !firstHit.object.userData?.isCloseButton && !firstHit.object.userData?.isCloseHitbox) {
            updateCandleScrubber(firstHit.point, win, () => soundFx.playHoverSound());
            isOverChart = true;
            hoveredWin = win;
            document.body.style.cursor = 'pointer';
            break;
          } else if (firstHit.object.userData?.isTitleBar) {
            document.body.style.cursor = 'grab';
            isOverChart = true;
            break;
          }
        }
      }
    }
  }

  if (!isOverChart) {
    clearCandleHover();
    activeChartWindows.forEach((win) => clearCandleScrubber(win));
  } else if (hoveredWin) {
    activeChartWindows.forEach((win) => {
      if (win !== hoveredWin) clearCandleScrubber(win);
    });
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
      if (!hoveredCandleMesh && !isOverChart) document.body.style.cursor = 'default';
    }
  }
}

function onPointerClick(event) {
  if (renderer.xr.isPresenting) return;
  if (event.target.closest('.interactive')) return;

  mouseRaycaster.setFromCamera(mousePointer, camera);

  // 0. Priority direct check against active close hitboxes & buttons
  const allCloseTargets = [
    ...closeHitboxRegistry,
    ...(typeof window !== 'undefined' && Array.isArray(window.activeCloseHitboxes) ? window.activeCloseHitboxes : []),
    ...(typeof window !== 'undefined' && Array.isArray(window.activeCloseButtons) ? window.activeCloseButtons : [])
  ].filter((b) => b && b.parent);

  if (allCloseTargets.length > 0) {
    const closeHits = mouseRaycaster.intersectObjects(allCloseTargets, true);
    if (closeHits.length > 0) {
      const hitObj = closeHits[0].object;
      const parentWin = hitObj.userData?.parentWindow || hitObj.userData?.parentChart || hitObj.parent;
      if (parentWin) {
        closeChartWindow(parentWin, scene);
        return;
      }
    }
  }

  // 0b. Priority direct check against active Wolf Egg Hitboxes & gold badges
  const allEggTargets = (typeof window !== 'undefined' && Array.isArray(window.activeEggHitboxes) ? window.activeEggHitboxes : []).filter((b) => b && b.parent);
  if (allEggTargets.length > 0) {
    const eggHits = mouseRaycaster.intersectObjects(allEggTargets, true);
    if (eggHits.length > 0) {
      const hitObj = eggHits[0].object;
      const parentWin = hitObj.userData?.parentChart || hitObj.userData?.parentWindow || hitObj.parent;
      if (parentWin) {
        console.log('[Desktop] Wolf Egg Gold [$] Badge Clicked!');
        triggerWolfEasterEgg(parentWin);
        return;
      }
    }
  }

  // Check all active chart windows: close button, mode toggles, resolution presets, title bar, wolf egg
  for (const win of activeChartWindows) {
    const chartHits = mouseRaycaster.intersectObject(win, true);
    if (chartHits.length > 0) {
      for (const hit of chartHits) {
        if (hit.object.userData?.isWolfEgg) {
          triggerWolfEasterEgg(win);
          return;
        }
        if (hit.object.userData?.isCloseButton || hit.object.userData?.isCloseHitbox) {
          closeChartWindow(win, scene);
          return;
        }
        if (hit.object.userData?.isChartModeToggle) {
          setChartDisplayMode(hit.object.userData.targetMode, win);
          return;
        }
        if (hit.object.userData?.isResolutionPreset) {
          setChartResolutionPreset(hit.object.userData.presetId, scene, win);
          return;
        }
        if (hit.object.userData?.isTimeframePill || hit.object.userData?.onClick) {
          if (typeof hit.object.userData.onClick === 'function') {
            hit.object.userData.onClick();
            return;
          }
        }
        if (hit.object.userData?.isTitleBar) {
          handleTitleBarClick(win);
          return;
        }
      }
    }
  }

  // Check Central Macro Star / Black Hole
  if (typeof window !== 'undefined' && window.centralMacroStar) {
    const starHits = mouseRaycaster.intersectObject(window.centralMacroStar, true);
    if (starHits.length > 0) {
      triggerMacroStressTest(!isStressTestActive);
      return;
    }
  }

  // Check planets in planetsGroup (bubble up hierarchy to find ticker or asset node)
  const intersects = mouseRaycaster.intersectObjects(planetsGroup.children, true);
  if (intersects.length > 0) {
    let hit = intersects[0].object;
    while (hit && !hit.userData?.ticker && !hit.userData?.symbol && !hit.userData?.isAssetNode && hit.parent && hit.parent !== scene) {
      hit = hit.parent;
    }
    if (hit && (hit.userData?.isAssetNode || hit.userData?.ticker || hit.userData?.symbol)) {
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
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('click', onPointerClick);

  // Country Market Switcher Buttons (US Wall St vs IN Bharat)
  const btnMarketUS = document.getElementById('btn-market-us');
  const btnMarketIN = document.getElementById('btn-market-in');
  if (btnMarketUS) {
    btnMarketUS.addEventListener('click', () => {
      handleSwitchMarket('US');
    });
  }
  if (btnMarketIN) {
    btnMarketIN.addEventListener('click', () => {
      handleSwitchMarket('IN');
    });
  }

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

  // Macro Stress-Test / Black Hole Risk Simulation Desktop Button
  const btnStressTest = document.getElementById('btn-stress-test');
  if (btnStressTest) {
    btnStressTest.addEventListener('click', () => {
      triggerMacroStressTest(!isStressTestActive);
    });
  }

  onStressTestChange((isActive) => {
    const btn = document.getElementById('btn-stress-test');
    if (btn) {
      btn.classList.toggle('stress-active', isActive);
      const iconSpan = btn.querySelector('.icon');
      const textSpan = btn.querySelector('.btn-label');
      if (iconSpan) iconSpan.textContent = isActive ? '🕳️' : '⚡';
      if (textSpan) textSpan.textContent = isActive ? 'Black Hole: ACTIVE' : 'Stress Test';
    }
  });

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
      setChartDisplayMode('candles');
      if (xrManager?.updateChartMode) xrManager.updateChartMode('candles');
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

  // Desktop Dedicated Visual Mode Buttons
  const btnModeVR = document.getElementById('btn-mode-vr');
  if (btnModeVR) {
    btnModeVR.addEventListener('click', () => {
      handleSetMode('VR');
    });
  }

  const btnModeMR = document.getElementById('btn-mode-mr');
  if (btnModeMR) {
    btnModeMR.addEventListener('click', () => {
      handleSetMode('MR');
    });
  }

  // Keyboard shortcuts: 'V' for Deep Space VR, 'M' / 'P' for MR Tabletop
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) {
      return;
    }
    if (e.code === 'KeyV' || e.key === 'v' || e.key === 'V') {
      handleSetMode('VR');
    } else if (e.code === 'KeyM' || e.key === 'm' || e.key === 'M' || e.code === 'KeyP' || e.key === 'p' || e.key === 'P') {
      handleSetMode('MR');
    }
  });
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

  // 4. Animate Volumetric Dust Cloud Floor (Zero CPU wave overhead in VR)
  if (dustCloudParticles) {
    dustCloudParticles.rotation.y += delta * 0.012;
    if (!renderer.xr.isPresenting && dustPositions) {
      const total = dustOriginalY.length;
      for (let i = 0; i < total; i++) {
        const x = dustPositions[i * 3];
        const z = dustPositions[i * 3 + 2];
        const wave = Math.sin(x * 0.16 + elapsedTime * 1.4) * Math.cos(z * 0.16 + elapsedTime * 1.4) * 0.48;
        dustPositions[i * 3 + 1] = dustOriginalY[i] + wave;
      }
      dustCloudParticles.geometry.attributes.position.needsUpdate = true;
    }
  }

  // 5. Animate Celestial Bodies (Solar Core Granulation, Corona Flare, Planetary Rotation, Rings & Asteroid Belts)
  updateCelestialAnimations(delta, elapsedTime, isAutoOrbiting, centralSun);

  // 5c. Animate Macro Stress-Test / Black Hole Collapse Simulation
  tickStressTest(delta);

  // 5b. Animate Dynamic Galaxy Environment (Cosmic Starfield & Pulsar Flashes)
  updateGalaxyEnvironment(delta, elapsedTime);

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
    if (!cachedPlanetInteractive && planetsGroup) {
      cachedPlanetInteractive = [];
      planetsGroup.traverse((child) => {
        if (child.userData?.isAssetNode && (child.isMesh || child.userData?.primaryMesh)) {
          cachedPlanetInteractive.push(child);
        }
      });
    }

    const interactiveObjects = [
      ...(cachedPlanetInteractive || [])
    ];
    activeChartWindows.forEach((win) => {
      if (win.userData?.titleBar) interactiveObjects.push(win.userData.titleBar);
      if (win.userData?.closeBtn) interactiveObjects.push(win.userData.closeBtn);
      if (win.userData?.closeHitbox) interactiveObjects.push(win.userData.closeHitbox);
      if (win.userData?.glassPanel) interactiveObjects.push(win.userData.glassPanel);
      if (win.userData?.registeredButtons) {
        win.userData.registeredButtons.forEach((b) => interactiveObjects.push(b));
      }
      if (win.userData?.candleColliders) {
        win.userData.candleColliders.forEach((c) => interactiveObjects.push(c));
      }
    });
    xrManager.update(interactiveObjects, delta, frame);
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
