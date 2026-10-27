/**
 * Spatial Wealth - WebXR Manager: Hand Tracking, 6-DoF Controllers & Left-Wrist Holographic Control Palette
 */

import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { Text } from 'troika-three-text';
import * as TWEEN from '@tweenjs/tween.js';
import { setNodeHoverState } from './nodes.js';
import { soundFx } from './audio.js';
import { portfolioState, adjustAssetAllocation, INDIAN_STOCKS, formatCurrency } from './data.js';
import {
  createSplineGroup,
  setChartDisplayMode,
  setChartResolutionPreset,
  updateCandleScrubber,
  clearCandleScrubber,
  updateCandleHover,
  clearCandleHover,
  getChartDisplayMode,
  activeChartWindows,
  closeChartWindow,
  closeHitboxRegistry,
  openOrFocusChart,
  spawnOrFocusChart,
  pulseChartHighlight,
  playChestThump,
  triggerWolfEasterEgg,
  handleTitleBarClick
} from './charts.js';
import {
  setPassthroughMode,
  tabletopPivot,
  baseRingMesh,
  setBaseRingState,
  detectedPlanesGroup,
  detectedMeshesGroup,
  surfaceAnchorGizmo,
  updateDetectedPlanes,
  updateDetectedMeshes,
  updateAnchoredTabletop,
  anchorTabletopToPlane,
  unanchorTabletop,
  findBestTablePlane,
  raycastDetectedPlanes,
  getTabletopAnchorState,
  setPlaneVisualization,
  getPlaneVisualization,
  clampPointToPlaneBoundary,
  setTabletopScale,
  getTabletopScale
} from './scene.js';

let activeXRManagerInstance = null;

export function getActiveXRManager() {
  return activeXRManagerInstance;
}

// ============================================================================
// DEDICATED CONTROLLER ROLES: Dual Squeeze = Scale, Right = Fast Ray Drag, Left = Rotate
// ============================================================================
export let leftController = null;
export let rightController = null;

export let leftSqueezed = false;
export let rightSqueezed = false;

// Legacy interaction state
export let isDragging = false;
export let isRotating = false;
export const dragOffset = new THREE.Vector3();

// Two-hand scaling state
export let initialPinchDist = null;
export let initialPinchScale = 0.18;

// Drag plane state
export let initialTableY = -0.35;
export const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // Horizontal plane at table height
export const raycaster = new THREE.Raycaster();
export const dragIntersection = new THREE.Vector3();
export const dragPlaneOffset = new THREE.Vector3();

// Rotation state
export let initialLeftGripQuat = new THREE.Quaternion();
export let initialLeftGripYaw = 0;
export let initialPivotRotationY = 0;

// Safe WebXR haptics helper
export function triggerHaptic(controller, intensity = 0.5, durationMs = 20) {
  if (!controller) return;
  const gamepad = controller.userData?.inputSource?.gamepad || controller.gamepad;
  if (gamepad?.hapticActuators?.[0]) {
    try {
      gamepad.hapticActuators[0].pulse(intensity, durationMs);
    } catch (e) {}
  } else if (activeXRManagerInstance && typeof activeXRManagerInstance.triggerHaptic === 'function') {
    activeXRManagerInstance.triggerHaptic(controller, intensity, durationMs);
  }
}

// "Wolf of Wall Street" Chest Thump Haptic Rhythm (Thump at 0.0s, Thump at 0.28s, Hummm at 0.65s)
export function triggerWolfChestHaptics(source = null) {
  const targetController = source || rightController;
  triggerHaptic(targetController, 1.0, 160);
  if (leftController && targetController !== leftController) {
    triggerHaptic(leftController, 0.8, 160);
  }

  setTimeout(() => {
    triggerHaptic(targetController, 1.0, 180);
    if (leftController && targetController !== leftController) {
      triggerHaptic(leftController, 0.9, 180);
    }
  }, 280);

  setTimeout(() => {
    triggerHaptic(targetController, 0.45, 750);
    if (leftController && targetController !== leftController) {
      triggerHaptic(leftController, 0.35, 750);
    }
  }, 650);
}

if (typeof window !== 'undefined') {
  window.triggerWolfChestHaptics = triggerWolfChestHaptics;
}

export function handleSqueezeChange(controller, isDown) {
  if (!controller) return;
  const handedness = controller.userData?.handedness || (controller === leftController ? 'left' : (controller === rightController ? 'right' : (controller.userData?.side || (controller.userData?.index === 0 ? 'left' : 'right'))));
  if (!tabletopPivot) return;

  if (handedness === 'left') {
    leftSqueezed = isDown;
    if (!leftController) leftController = controller;
  }
  if (handedness === 'right') {
    rightSqueezed = isDown;
    if (!rightController) rightController = controller;
  }

  if (!isDown && activeXRManagerInstance?.isDraggingChartWindow && activeXRManagerInstance.chartDragSource === controller) {
    activeXRManagerInstance.stopDraggingChartWindow();
    return;
  }

  if (isDown && activeXRManagerInstance) {
    if (activeXRManagerInstance.checkAndStartChartTitleDrag(controller)) {
      return;
    }
  }

  // Update legacy flags
  isDragging = (rightSqueezed && !leftSqueezed) || (leftSqueezed && rightSqueezed);
  isRotating = (leftSqueezed && !rightSqueezed) || (leftSqueezed && rightSqueezed);

  if (isDown) {
    unanchorTabletop();
    if (typeof window !== 'undefined') window.hasAnchoredToTable = true;
    if (activeXRManagerInstance) activeXRManagerInstance.isDraggingTabletop = true;
  }

  // --- CASE A: BOTH CONTROLLERS SQUEEZED -> PINCH SCALE ---
  if (leftSqueezed && rightSqueezed && leftController && rightController) {
    initialPinchDist = leftController.position.distanceTo(rightController.position);
    initialPinchScale = tabletopPivot.scale.x;

    triggerHaptic(leftController, 0.5, 20);
    triggerHaptic(rightController, 0.5, 20);

    if (window.baseRingMesh && window.baseRingMesh.material) {
      window.baseRingMesh.material.color.setHex(0xa855f7); // Electric purple
      window.baseRingMesh.material.opacity = 0.9;
    }
    soundFx.playEnergySurgeSound();
    return;
  }

  // --- CASE B: ONLY RIGHT SQUEEZED -> FAST RAY-ALIGNED DRAG ---
  if (rightSqueezed && !leftSqueezed && rightController) {
    initialTableY = tabletopPivot.position.y;
    tablePlane.constant = -initialTableY; // Set plane at tabletop height

    // Cast ray from right controller forward
    const rayDir = new THREE.Vector3(0, 0, -1).applyQuaternion(rightController.quaternion).normalize();
    const ray = new THREE.Ray(rightController.position, rayDir);

    if (ray.intersectPlane(tablePlane, dragIntersection)) {
      dragPlaneOffset.copy(tabletopPivot.position).sub(dragIntersection);
    } else {
      dragPlaneOffset.set(0, 0, 0);
    }

    triggerHaptic(rightController, 0.5, 20);
    if (window.baseRingMesh && window.baseRingMesh.material) {
      window.baseRingMesh.material.color.setHex(0x10b981); // Emerald green
      window.baseRingMesh.material.opacity = 0.9;
    }
    soundFx.playEnergySurgeSound();
    return;
  }

  // --- CASE C: ONLY LEFT SQUEEZED -> ROTATE ---
  if (leftSqueezed && !rightSqueezed && leftController) {
    initialLeftGripQuat.copy(leftController.quaternion);
    initialPivotRotationY = tabletopPivot.rotation.y;

    triggerHaptic(leftController, 0.5, 20);
    if (window.baseRingMesh && window.baseRingMesh.material) {
      window.baseRingMesh.material.color.setHex(0x3b82f6); // Royal blue
      window.baseRingMesh.material.opacity = 0.9;
    }
    soundFx.playEnergySurgeSound();
    return;
  }

  // --- CASE D: NEITHER SQUEEZED ---
  if (!leftSqueezed && !rightSqueezed) {
    initialPinchDist = null;
    if (typeof window !== 'undefined') window.hasAnchoredToTable = true;
    if (activeXRManagerInstance) activeXRManagerInstance.isDraggingTabletop = false;

    if (window.baseRingMesh && window.baseRingMesh.material) {
      window.baseRingMesh.material.color.setHex(0x06b6d4); // Cyan idle
      window.baseRingMesh.material.opacity = 0.35;
    }
    soundFx.playHoverSound();
  }
}

/**
 * Setup 6-DoF controllers with dynamic handedness detection and dedicated squeeze interactions:
 * - Dual Squeeze: Pinch Scale
 * - Right Controller: Fast Ray-Projected Drag
 * - Left Controller: Yaw Rotation
 * @param {THREE.WebGLRenderer} renderer
 */
export function setupXRControllers(renderer) {
  if (!renderer || !renderer.xr) return;

  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);

    controller.addEventListener('connected', (e) => {
      const handedness = e.data.handedness; // 'left' or 'right'
      controller.userData.handedness = handedness;
      controller.userData.inputSource = e.data;

      if (handedness === 'left') {
        leftController = controller;
        console.log('[WebXR] Left controller mapped');
      } else if (handedness === 'right') {
        rightController = controller;
        console.log('[WebXR] Right controller mapped');
      }
    });

    controller.addEventListener('disconnected', () => {
      if (controller === leftController) {
        leftController = null;
        leftSqueezed = false;
      }
      if (controller === rightController) {
        rightController = null;
        rightSqueezed = false;
      }
    });

    controller.addEventListener('squeezestart', () => {
      handleSqueezeChange(controller, true);
    });

    controller.addEventListener('squeezeend', () => {
      handleSqueezeChange(controller, false);
    });

    controller.addEventListener('select', () => {
      handleControllerSelect(controller);
    });
  }
}

/**
 * Robust Controller Raycast Click Detection with Recursive Parent Search & Fallback.
 */
export function handleControllerSelect(controller) {
  if (!controller) return;
  const manager = activeXRManagerInstance;
  const scene = manager?.scene || (typeof window !== 'undefined' ? window.scene : null);
  const camera = (manager?.renderer?.xr?.isPresenting && manager?.renderer?.xr?.getCamera)
    ? manager.renderer.xr.getCamera()
    : (manager?.camera || (typeof window !== 'undefined' ? window.camera : null));

  if (!scene) {
    console.warn('[WebXR Trigger] Scene not available on select.');
    return;
  }

  const tempMatrix = new THREE.Matrix4();
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  
  const raycaster = new THREE.Raycaster();
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  // If source is a hand with joint tracking, point along index finger
  if (controller.userData?.isHand && manager?.castRayFromHand) {
    const tip = controller.joints?.['index-finger-tip'];
    if (tip) {
      const tipPos = new THREE.Vector3();
      tip.getWorldPosition(tipPos);
      raycaster.ray.origin.copy(tipPos);
    }
  }

  // =========================================================================
  // 1. Priority 1: Raycast closeHitboxRegistry First
  // =========================================================================
  const allCloseTargets = [
    ...closeHitboxRegistry,
    ...(typeof window !== 'undefined' && Array.isArray(window.activeCloseHitboxes) ? window.activeCloseHitboxes : []),
    ...(typeof window !== 'undefined' && Array.isArray(window.activeCloseButtons) ? window.activeCloseButtons : [])
  ].filter((b) => b && b.parent);

  if (allCloseTargets.length > 0) {
    const closeHits = raycaster.intersectObjects(allCloseTargets, true);
    if (closeHits.length > 0) {
      const hitObj = closeHits[0].object;
      const parentWin = hitObj.userData?.parentWindow || hitObj.userData?.parentChart || hitObj.parent;
      if (parentWin) {
        console.log('[WebXR] Priority 1: Direct Close Hitbox Hit!', parentWin?.userData?.ticker);
        closeChartWindow(parentWin, scene);
        return;
      }
    }
  }

  // =========================================================================
  // 1b. Priority 1b: Direct Wolf of Wall Street Gold Dollar Badge Hitbox Check
  // =========================================================================
  const allEggTargets = (typeof window !== 'undefined' && Array.isArray(window.activeEggHitboxes) ? window.activeEggHitboxes : []).filter((b) => b && b.parent);
  if (allEggTargets.length > 0) {
    const eggHits = raycaster.intersectObjects(allEggTargets, true);
    if (eggHits.length > 0) {
      const hitObj = eggHits[0].object;
      const parentWin = hitObj.userData?.parentChart || hitObj.userData?.parentWindow || hitObj.parent;
      if (parentWin) {
        console.log('[WebXR] Direct Wolf Egg Hitbox Hit!', parentWin?.userData?.ticker);
        triggerWolfEasterEgg(parentWin, controller);
        return;
      }
    }
  }

  // =========================================================================
  // 2. Priority 2: Check Interactive Timeframe & Mode Buttons on Active Charts
  // =========================================================================
  const chartInteractives = [];
  activeChartWindows.forEach((win) => {
    win.traverse((c) => {
      if (c.userData?.isResolutionPreset || c.userData?.isChartModeToggle || c.userData?.isTimeframePill || c.userData?.isTitleBar || c.userData?.isWolfEgg || c.userData?.isWolfEasterEgg || (c.userData?.onClick && !c.userData?.isCloseButton && !c.userData?.isCloseHitbox)) {
        chartInteractives.push(c);
      }
    });
  });

  if (chartInteractives.length > 0) {
    const chartBtnHits = raycaster.intersectObjects(chartInteractives, true);
    if (chartBtnHits.length > 0) {
      const hitObj = chartBtnHits[0].object;
      if (hitObj.userData?.isResolutionPreset) {
        const presetId = hitObj.userData.presetId;
        const parentWin = hitObj.userData.parentWindow;
        if (presetId) setChartResolutionPreset(presetId, scene, parentWin);
        return;
      }
      if (hitObj.userData?.isChartModeToggle) {
        const parentWin = hitObj.userData.parentWindow;
        if (hitObj.userData.targetMode) setChartDisplayMode(hitObj.userData.targetMode, parentWin);
        return;
      }
      if (hitObj.userData?.isWolfEgg || hitObj.userData?.isWolfEasterEgg) {
        const parentWin = hitObj.userData.parentChart || hitObj.userData.parentWindow || hitObj.parent;
        triggerWolfEasterEgg(parentWin, controller);
        return;
      }
      if (hitObj.userData?.isTitleBar) {
        const parentWin = hitObj.userData.parentWindow || hitObj.parent;
        if (parentWin) handleTitleBarClick(parentWin);
        return;
      }
      if (typeof hitObj.userData?.onClick === 'function') {
        hitObj.userData.onClick();
        return;
      }
    }
  }

  // =========================================================================
  // 3. Priority 3: ALWAYS Raycast solarSystemGroup.children for Planets
  // =========================================================================
  const solarGroup = manager?.solarSystemGroup || (typeof window !== 'undefined' && window.solarSystemGroup) || scene.getObjectByName('SolarSystemGroup');
  if (solarGroup) {
    const planetHits = raycaster.intersectObjects(solarGroup.children, true);
    if (planetHits.length > 0) {
      for (const ph of planetHits) {
        let node = ph.object;
        while (node && !node.userData?.isAssetNode && !node.userData?.ticker && !node.userData?.symbol && node !== solarGroup && node.parent) {
          node = node.parent;
        }
        if (node && (node.userData?.isAssetNode || node.userData?.ticker || node.userData?.symbol)) {
          const ticker = node.userData.ticker || node.userData.symbol;
          if (ticker) {
            console.log(`[WebXR] Priority 3: Ray selected planet: ${ticker}`);
            const assetData = node.userData.assetData || {
              name: node.userData.name || ticker,
              price: node.userData.price || '$1,200',
              change: node.userData.change || '+2.5%',
              returns: node.userData.returns || 0,
              color: node.userData.color || '#00f0ff',
              currency: node.userData.currency || 'USD',
              category: node.userData.category || 'Core Equity'
            };
            openOrFocusChart(ticker, assetData, camera, scene);
            if (manager?.callbacks?.onSelectNode) {
              manager.callbacks.onSelectNode(assetData, node);
            }
            return;
          }
        }
      }
    }
  }

  // =========================================================================
  // 4. Priority 4: Check Other Interactive Scene Objects (Wrist dock, VR buttons)
  // =========================================================================
  const hits = raycaster.intersectObjects(scene.children, true);
  for (let hit of hits) {
    let ctrlObj = hit.object;
    while (ctrlObj && !ctrlObj.userData?.isVRButton && !ctrlObj.userData?.onClick && ctrlObj.parent && ctrlObj !== scene) {
      ctrlObj = ctrlObj.parent;
    }
    if (ctrlObj?.userData?.onClick) {
      ctrlObj.userData.onClick();
      return;
    }
    if (ctrlObj?.userData?.isVRButton) {
      if (manager && typeof manager.animateButtonPress === 'function') manager.animateButtonPress(ctrlObj);
      return;
    }
  }

  console.log('[WebXR Trigger] Trigger clicked, but no interactive element or planet node was intersected.');
}

export const handleRaySelection = handleControllerSelect;

// Backward compatibility alias for setupControllerSeparation
export function setupControllerSeparation(controllerLeft, controllerRight) {
  if (activeXRManagerInstance?.renderer) {
    setupXRControllers(activeXRManagerInstance.renderer);
  }
}

// ==========================================
// RENDER TICK UPDATE
// ==========================================
export function updateTabletopManipulation(controllerLeft, controllerRight) {
  if (!tabletopPivot) return;

  const left = leftController || controllerLeft;
  const right = rightController || controllerRight;

  // 1. DUAL-HAND PINCH TO SCALE
  if (leftSqueezed && rightSqueezed && left && right && initialPinchDist) {
    const currentDist = left.position.distanceTo(right.position);
    const scaleFactor = currentDist / initialPinchDist;
    let newScale = initialPinchScale * scaleFactor;

    // Clamp between mini desk size (0.06) and large room display (0.75)
    newScale = Math.max(0.06, Math.min(0.75, newScale));
    tabletopPivot.scale.set(newScale, newScale, newScale);
    setTabletopScale(newScale);
    tabletopPivot.updateMatrixWorld(true);
    return;
  }

  // 2. FAST RAY-PROJECTED DRAG (Right Hand)
  if (rightSqueezed && !leftSqueezed && right) {
    const rayDir = new THREE.Vector3(0, 0, -1).applyQuaternion(right.quaternion).normalize();
    const ray = new THREE.Ray(right.position, rayDir);

    if (ray.intersectPlane(tablePlane, dragIntersection)) {
      // Moves directly along the table wherever the laser ray is pointing
      tabletopPivot.position.x = dragIntersection.x + dragPlaneOffset.x;
      tabletopPivot.position.z = dragIntersection.z + dragPlaneOffset.z;
      tabletopPivot.position.y = initialTableY;
      tabletopPivot.updateMatrixWorld(true);
    }
    return;
  }

  // 3. YAW ROTATION (Left Hand)
  if (leftSqueezed && !rightSqueezed && left) {
    const vInit = new THREE.Vector3(0, 0, -1).applyQuaternion(initialLeftGripQuat);
    const vCurr = new THREE.Vector3(0, 0, -1).applyQuaternion(left.quaternion);

    const angleInit = Math.atan2(vInit.x, vInit.z);
    const angleCurr = Math.atan2(vCurr.x, vCurr.z);
    let deltaYaw = angleCurr - angleInit;
    while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
    while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;

    tabletopPivot.rotation.y = initialPivotRotationY + deltaYaw;
    tabletopPivot.updateMatrixWorld(true);
  }
}

/**
 * Hooks an active WebXR session into the presentation pipeline and scene environment.
 * @param {XRSession} session
 * @param {'ar'|'vr'} mode
 */
export async function setupXRSession(session, mode = 'ar') {
  if (activeXRManagerInstance) {
    return activeXRManagerInstance.setupXRSession(session, mode);
  }
  return session;
}

export function setMRTabletopMode() {
  if (activeXRManagerInstance) {
    return activeXRManagerInstance.setMRTabletopMode();
  }
  window.hasAnchoredToTable = false;
  if (tabletopPivot) {
    const s = getTabletopScale() || 0.18;
    setTabletopScale(s);
  }
  if (window.skyboxMesh) window.skyboxMesh.visible = false;
  if (window.spaceParticles) window.spaceParticles.visible = false;
  if (window.baseRingMesh) window.baseRingMesh.visible = true;
  setPassthroughMode(true);
}

export async function startARSession() {
  if (!navigator.xr) return;

  setMRTabletopMode();

  const sessionInit = {
    requiredFeatures: ['local-floor'],
    optionalFeatures: [
      'plane-detection',
      'hit-test',
      'hand-tracking'
    ]
  };

  try {
    const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
    setupXRSession(session, 'ar');
  } catch (err) {
    console.error("Failed to start AR session with plane-detection:", err);
  }
}

/**
 * Curated active stock directory for live type-ahead auto-filtering in VR
 * Includes US Equities, Index Funds, Crypto, Bonds & Top Indian Equities (NSE/BSE)
 */
export const STOCK_CATALOG = [
  { symbol: 'NVDA', name: 'NVIDIA Corp', price: 128.50, currency: 'USD', sector: 'Equities' },
  { symbol: 'AAPL', name: 'Apple Inc', price: 224.20, currency: 'USD', sector: 'Equities' },
  { symbol: 'MSFT', name: 'Microsoft Corp', price: 448.90, currency: 'USD', sector: 'Equities' },
  { symbol: 'AMZN', name: 'Amazon.com Inc', price: 186.40, currency: 'USD', sector: 'Equities' },
  { symbol: 'GOOGL', name: 'Alphabet Inc', price: 179.30, currency: 'USD', sector: 'Equities' },
  { symbol: 'TSLA', name: 'Tesla Inc', price: 210.10, currency: 'USD', sector: 'Equities' },
  { symbol: 'IVV', name: 'S&P 500 Index Fund', price: 545.20, currency: 'USD', sector: 'Index' },
  { symbol: 'BTC', name: 'Bitcoin (USD)', price: 63400, currency: 'USD', sector: 'Crypto' },
  { symbol: 'ETH', name: 'Ethereum (USD)', price: 2720, currency: 'USD', sector: 'Crypto' },
  { symbol: 'BND', name: 'Total Bond Market', price: 72.10, currency: 'USD', sector: 'Bonds' },
  ...INDIAN_STOCKS
];

export const interactiveObjects = [];

export function registerInteractiveObject(obj, onClickCallback) {
  if (!obj) return;
  obj.userData = obj.userData || {};
  if (onClickCallback) {
    obj.userData.onClick = onClickCallback;
  }
  obj.userData.isInteractive = true;
  obj.userData.isVRButton = true;
  if (!interactiveObjects.includes(obj)) {
    interactiveObjects.push(obj);
  }
}

export function unregisterInteractiveObject(obj) {
  const idx = interactiveObjects.indexOf(obj);
  if (idx !== -1) interactiveObjects.splice(idx, 1);
}

export class XRManager {
  constructor(renderer, scene, camera, callbacks = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.callbacks = callbacks;

    // Controllers & Hands
    this.controllers = [];
    this.controllerGrips = [];
    this.hands = [];

    // Interaction State
    this.raycaster = new THREE.Raycaster();
    this.tempMatrix = new THREE.Matrix4();
    this.tempVecA = new THREE.Vector3();
    this.tempVecB = new THREE.Vector3();
    this.tempVecC = new THREE.Vector3();
    this.hoveredObject = null;
    this.hoveredVRButton = null;
    this.pokedVRButton = null;
    this.lastPinchState = [false, false];
    this.currentRigTween = null;

    // Mixed Reality & Tabletop Passthrough State
    this.isPassthroughActive = false;
    this.solarSystemGroup = null;
    this.isDraggingTabletop = false;
    this.tabletopDragSource = null;
    this.initialSourcePos = new THREE.Vector3();
    this.initialGroupPos = new THREE.Vector3();
    this.initialGroupRotY = 0;
    this.initialSourceYaw = 0;
    this.initialSourceQuat = new THREE.Quaternion();
    this.isBaseRingHovered = false;
    this.hitTestSource = null;
    this.lastXRFrame = null;

    // Title-Bar Spatial Dragging State for Chart Windows
    this.draggedChartWindow = null;
    this.chartDragSource = null;
    this.chartDragDistance = 1.15;
    this.isDraggingChartWindow = false;

    // Dual-Grip State Tracking for Pinch-to-Scale and Dual-Hand Drag
    this.grabState = {
      controller0: { active: false, initialPos: new THREE.Vector3() },
      controller1: { active: false, initialPos: new THREE.Vector3() },
      initialHandDistance: null,
      initialPivotScale: 0.18,
      initialPivotPos: new THREE.Vector3(),
      initialMidpoint: new THREE.Vector3(),
      initialDualYaw: 0,
      initialPivotRotY: 0
    };

    this.handGrabState = {
      hand0: { active: false, initialPos: new THREE.Vector3() },
      hand1: { active: false, initialPos: new THREE.Vector3() },
      initialHandDistance: null,
      initialPivotScale: 0.18,
      initialPivotPos: new THREE.Vector3(),
      initialMidpoint: new THREE.Vector3(),
      initialDualYaw: 0,
      initialPivotRotY: 0
    };

    activeXRManagerInstance = this;

    // VR User Rig (Parents camera, controllers, grips, hands for smooth global spatial navigation)
    this.userRig = new THREE.Group();
    this.userRig.name = 'XRUserRig';
    this.userRig.position.set(0, 2.0, 12.0);
    this.scene.add(this.userRig);
    this.userRig.add(this.camera);

    // Left-Wrist Holographic Palette
    this.spatialDock = null;
    this.dockButtons = [];
    this.dockTexts = {};
    this.activeCategory = 'ALL';

    // 3D Spatial Manage Data Slate
    this.spatialDataPanel = null;
    this.dataPanelButtons = [];
    this.dataPanelTexts = {};
    this.assetRowElements = [];

    // 3D Spatial Quick Tickers Slate
    this.quickTickersSlate = null;
    this.quickTickerButtons = [];

    // 3D Spatial Instant Search Panel & Virtual Keyboard
    this.searchPanel = null;
    this.searchPanelButtons = [];
    this.searchSuggestionButtons = [];
    this.searchQuery = '';
    this.searchQueryText = null;
    this.suggestionsContainer = null;
    this.cursorVisible = true;
    this.cursorTimer = 0;

    this.initXR();
  }

  /**
   * Safe no-op to prevent VR motion sickness (camera/rig stays stable in user's chosen viewing space).
   */
  flyToTarget(targetMesh) {
    // Intentionally no-op: chart is summoned into personal space rather than moving the user
    return;
  }

  /**
   * Begins title-bar spatial dragging for a chart window.
   */
  startDraggingChartWindow(chartWin, source, hitDistance) {
    if (!chartWin) return;
    this.draggedChartWindow = chartWin;
    this.chartDragSource = source;
    this.chartDragDistance = Math.max(0.35, hitDistance || (source ? source.position.distanceTo(chartWin.position) : 1.15));
    this.isDraggingChartWindow = true;

    triggerHaptic(source, 0.7, 25);
    soundFx.playEnergySurgeSound();

    const titleBar = chartWin.userData?.titleBar || chartWin.children.find((c) => c.userData?.isTitleBar);
    if (titleBar && titleBar.material) {
      titleBar.material.color.setHex(0x0284c7);
    }
  }

  /**
   * Releases and statically pins the dragged chart window at its new 3D world position.
   */
  stopDraggingChartWindow() {
    if (this.draggedChartWindow) {
      const titleBar = this.draggedChartWindow.userData?.titleBar || this.draggedChartWindow.children.find((c) => c.userData?.isTitleBar);
      if (titleBar && titleBar.material) {
        titleBar.material.color.setHex(0x1e293b);
      }
    }
    if (this.chartDragSource) {
      triggerHaptic(this.chartDragSource, 0.4, 15);
    }
    soundFx.playHoverSound();

    this.draggedChartWindow = null;
    this.chartDragSource = null;
    this.isDraggingChartWindow = false;
  }

  /**
   * Raycasts from a controller or hand to detect if pointing at any chart window's title-bar.
   */
  checkAndStartChartTitleDrag(source) {
    if (!source || activeChartWindows.length === 0) return false;
    const titleBars = [];
    activeChartWindows.forEach((win) => {
      win.traverse((c) => {
        if (c.userData?.isTitleBar) titleBars.push(c);
      });
    });
    if (titleBars.length === 0) return false;

    this.tempMatrix.identity().extractRotation(source.matrixWorld);
    const r = new THREE.Raycaster();
    r.ray.origin.setFromMatrixPosition(source.matrixWorld);
    r.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

    const hits = r.intersectObjects(titleBars, true);
    if (hits.length > 0) {
      const hitObj = hits[0].object;
      const win = hitObj.userData?.parentWindow || hitObj.parent;
      if (win) {
        this.startDraggingChartWindow(win, source, hits[0].distance);
        return true;
      }
    }
    return false;
  }

  /**
   * Smoothly glides the VR User Rig back to the global overview position.
   */
  resetRigPosition() {
    if (!this.userRig) return;
    if (this.currentRigTween) {
      this.currentRigTween.stop();
    }
    this.currentRigTween = new TWEEN.Tween(this.userRig.position)
      .to({ x: 0, y: 2.0, z: 12.0 }, 1200)
      .easing(TWEEN.Easing.Cubic.Out);
    TWEEN.add(this.currentRigTween);
    this.currentRigTween.start();
  }

  /**
   * Gracefully exits the active WebXR presentation session.
   */
  async exitVR() {
    soundFx.playCloseSound();
    const session = this.renderer.xr.getSession() || this.currentSession;
    if (session) {
      try {
        await session.end();
      } catch (err) {
        console.warn('WebXR session end error:', err);
      }
    }
  }

  /**
   * Discovers and configures the dedicated 2D HUD WebXR launch triggers (#btn-enter-vr & #btn-enter-ar).
   */
  setupXRButtons() {
    this.btnEnterVR = document.getElementById('btn-enter-vr');
    this.btnEnterAR = document.getElementById('btn-enter-ar');

    if (!('xr' in navigator)) {
      if (this.btnEnterVR) {
        this.btnEnterVR.textContent = '🌌 WebXR Not Available';
        this.btnEnterVR.disabled = true;
      }
      if (this.btnEnterAR) {
        this.btnEnterAR.textContent = '👁 WebXR Not Available';
        this.btnEnterAR.disabled = true;
      }
      return;
    }

    // Query support for immersive-vr and immersive-ar independently
    Promise.all([
      navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
      navigator.xr.isSessionSupported('immersive-ar').catch(() => false)
    ]).then(([vrSupported, arSupported]) => {
      // 1. Configure Dedicated Deep Space VR Entry Trigger
      if (this.btnEnterVR) {
        if (vrSupported) {
          this.btnEnterVR.textContent = '🌌 Enter Deep Space (VR)';
          this.btnEnterVR.disabled = false;
          this.btnEnterVR.onclick = (e) => {
            e.preventDefault();
            this.toggleSession('immersive-vr');
          };
        } else {
          this.btnEnterVR.textContent = '🌌 VR Not Supported';
          this.btnEnterVR.disabled = true;
        }
      }

      // 2. Configure Dedicated Tabletop Passthrough AR Entry Trigger
      if (this.btnEnterAR) {
        if (arSupported) {
          this.btnEnterAR.textContent = '👁 Enter Tabletop Passthrough (AR)';
          this.btnEnterAR.disabled = false;
          this.btnEnterAR.onclick = (e) => {
            e.preventDefault();
            this.toggleSession('immersive-ar');
          };
        } else {
          this.btnEnterAR.textContent = '👁 AR Not Supported';
          this.btnEnterAR.disabled = true;
        }
      }
    });
  }

  /**
   * Explicit Mode Reset for Mixed Reality Tabletop Passthrough:
   * Whenever AR / Passthrough is triggered, resets flags and applies an immediate
   * fallback position (0.85m in front of current gaze, 0.35m down) at miniature scale (0.18)
   * so the solar system never floats at room scale in the user's face.
   */
  setMRTabletopMode() {
    const camera = (this.renderer?.xr?.isPresenting && this.renderer?.xr?.getCamera)
      ? this.renderer.xr.getCamera()
      : this.camera;
    const renderer = this.renderer;

    const headPos = new THREE.Vector3();
    if (camera && camera.getWorldPosition) {
      camera.getWorldPosition(headPos);
    } else if (camera) {
      headPos.copy(camera.position);
    }

    // Reset anchoring latch
    window.hasAnchoredToTable = false;

    // 1. Instantly force miniature scale
    const targetScale = getTabletopScale() || 0.18;
    setTabletopScale(targetScale);

    // 2. Position it 0.85m in front of current gaze and 0.35m down immediately
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) {
      forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
      forward.y = 0;
    }
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
    forward.normalize();

    tabletopPivot.position.copy(headPos).add(forward.multiplyScalar(0.85));
    tabletopPivot.position.y = headPos.y - 0.35;

    // 3. Clear canvas background for passthrough
    renderer.setClearAlpha(0);
    renderer.setClearColor(0x000000, 0);
    if (window.skyboxMesh) window.skyboxMesh.visible = false;
    if (window.spaceParticles) window.spaceParticles.visible = false;
    if (window.baseRingMesh) window.baseRingMesh.visible = true;

    setPassthroughMode(true);
    this.isPassthroughActive = true;

    if (this.solarSystemGroup) {
      if (this.solarSystemGroup.parent === tabletopPivot) {
        this.solarSystemGroup.scale.set(1.0, 1.0, 1.0);
        this.solarSystemGroup.position.set(0, 0, 0);
      } else {
        this.solarSystemGroup.scale.set(0.18, 0.18, 0.18);
        this.solarSystemGroup.position.copy(tabletopPivot.position);
      }
    }
  }

  /**
   * Enforces exact tabletop miniature transform (0.18) and begins an AR presentation session.
   */
  async startARSession() {
    TWEEN.removeAll();
    this.setMRTabletopMode();
    return this.startSession('immersive-ar');
  }

  /**
   * Enforces full room-scale transform (1.0) and begins a VR presentation session.
   */
  async startVRSession() {
    TWEEN.removeAll();
    window.hasAnchoredToTable = false;
    unanchorTabletop();
    if (tabletopPivot) {
      tabletopPivot.scale.set(1.0, 1.0, 1.0);
      tabletopPivot.position.set(0, 0, 0);
    }
    if (this.solarSystemGroup) {
      this.solarSystemGroup.scale.set(1.0, 1.0, 1.0);
      this.solarSystemGroup.position.set(0, 0, 0);
    }
    if (window.skyboxMesh) window.skyboxMesh.visible = true;
    if (window.spaceParticles) window.spaceParticles.visible = true;
    if (window.baseRingMesh) window.baseRingMesh.visible = false;
    return this.startSession('immersive-vr');
  }

  /**
   * Toggles or switches between WebXR sessions (immersive-vr vs immersive-ar).
   * @param {'immersive-vr'|'immersive-ar'} targetMode
   */
  async toggleSession(targetMode) {
    if (this.currentSession) {
      if (this.currentSessionMode === targetMode) {
        // User clicked active session button -> gracefully exit session
        await this.exitVR();
        return;
      } else {
        // Switch between modes: end current session then request next mode
        try {
          await this.currentSession.end();
        } catch (err) {
          console.warn('Error ending previous session during mode switch:', err);
        }
        await this.startSession(targetMode);
        return;
      }
    }

    await this.startSession(targetMode);
  }

  /**
   * Configures and begins presenting a WebXR session.
   * @param {XRSession} session
   * @param {'ar'|'vr'} mode
   */
  async setupXRSession(session, mode = 'ar') {
    if (!session) return;
    const sessionMode = (mode === 'ar' || mode === 'immersive-ar') ? 'immersive-ar' : 'immersive-vr';
    session.addEventListener('end', () => this.onSessionEnded(sessionMode));
    await this.renderer.xr.setSession(session);
    this.currentSession = session;
    this.currentSessionMode = sessionMode;
    this.onSessionStarted(sessionMode, session);
    return session;
  }

  /**
   * Requests and begins presenting a WebXR session in the specified mode.
   * @param {'immersive-vr'|'immersive-ar'} mode
   */
  async startSession(mode) {
    if (!('xr' in navigator)) return;

    const isAR = mode === 'immersive-ar' || mode === 'ar';
    TWEEN.removeAll();
    if (isAR) {
      this.setMRTabletopMode();
    } else {
      window.hasAnchoredToTable = false;
      unanchorTabletop();
      if (tabletopPivot) {
        tabletopPivot.scale.set(1.0, 1.0, 1.0);
        tabletopPivot.position.set(0, 0, 0);
      }
      if (this.solarSystemGroup) {
        this.solarSystemGroup.scale.set(1.0, 1.0, 1.0);
        this.solarSystemGroup.position.set(0, 0, 0);
      }
      if (window.skyboxMesh) window.skyboxMesh.visible = true;
      if (window.spaceParticles) window.spaceParticles.visible = true;
      if (window.baseRingMesh) window.baseRingMesh.visible = false;
    }

    const sessionInit = isAR
      ? {
          requiredFeatures: ['local-floor'],
          optionalFeatures: [
            'plane-detection',   // WebXR Plane Detection API (numerical tracking only)
            'hit-test',          // Real-world surface hit-testing
            'hand-tracking',     // Meta Quest hand tracking
            'anchors',           // WebXR Anchors API
            'layers',
            'light-estimation'
          ]
        }
      : {
          requiredFeatures: ['local-floor'],
          optionalFeatures: ['bounded-floor', 'hand-tracking', 'layers']
        };

    try {
      const session = await navigator.xr.requestSession(mode, sessionInit);
      await this.setupXRSession(session, isAR ? 'ar' : 'vr');
      return session;
    } catch (err) {
      console.error(`Failed to start WebXR session for mode ${mode}:`, err);
    }
  }

  /**
   * Triggered when a WebXR session successfully starts presenting.
   * @param {'immersive-vr'|'immersive-ar'} mode
   * @param {XRSession} session
   */
  onSessionStarted(mode, session) {
    const isAR = mode === 'immersive-ar' || mode === 'ar';
    soundFx.playVrEnterSound();

    // 1. Prevent 2D DOM desynchronization: Add in-xr class and hide 2D HUD container & modals
    document.body.classList.add('in-xr');
    document.body.classList.add('vr-mode');
    const hudContainer = document.getElementById('hud-container');
    if (hudContainer) {
      hudContainer.style.opacity = '0';
      hudContainer.style.pointerEvents = 'none';
    }
    const modal = document.getElementById('portfolio-modal');
    if (modal) modal.classList.remove('open');

    // 2. Configure Dedicated Visual Environment & Clear Alpha
    if (isAR) {
      // True Passthrough AR Mode: transparent canvas, hide celestial skybox & starfields
      TWEEN.removeAll();
      this.setMRTabletopMode();

      if (session && typeof session.requestEnvironmentBlendMode === 'function') {
        session.requestEnvironmentBlendMode('alpha-blend').catch(() => {});
      }

      // Update dedicated 2D button labels
      if (this.btnEnterAR) {
        this.btnEnterAR.textContent = '🚪 Exit Passthrough (AR)';
        this.btnEnterAR.classList.add('active-session');
      }
      if (this.btnEnterVR) {
        this.btnEnterVR.textContent = '🌌 Switch to VR';
        this.btnEnterVR.classList.remove('active-session');
      }

      this.updateModeStatus('MR');
      if (this.callbacks.onSetMode) this.callbacks.onSetMode('MR');

      // Request WebXR hit-test source for real-world surface intersection
      if (session && session.requestHitTestSource) {
        session.requestReferenceSpace('viewer').then((viewerSpace) => {
          session.requestHitTestSource({ space: viewerSpace }).then((source) => {
            this.hitTestSource = source;
          }).catch((err) => {
            console.warn('Hit test source setup notice:', err);
          });
        }).catch(() => {});
      }
    } else {
      // Deep Space VR Mode: full room scale 1.0, deep space skybox & starfield
      TWEEN.removeAll();
      this.isPassthroughActive = false;
      window.hasAnchoredToTable = false;
      unanchorTabletop();
      this.renderer.setClearColor(0x030712, 1);
      this.renderer.setClearAlpha(1);
      setPassthroughMode(false);
      if (window.skyboxMesh) window.skyboxMesh.visible = true;
      if (window.spaceParticles) window.spaceParticles.visible = true;
      if (window.baseRingMesh) window.baseRingMesh.visible = false;

      if (session && typeof session.requestEnvironmentBlendMode === 'function') {
        session.requestEnvironmentBlendMode('opaque').catch(() => {});
      }

      if (tabletopPivot) {
        tabletopPivot.scale.set(1.0, 1.0, 1.0);
        tabletopPivot.position.set(0, 0, 0);
      }
      if (this.solarSystemGroup) {
        this.solarSystemGroup.scale.set(1.0, 1.0, 1.0);
        this.solarSystemGroup.position.set(0, 0, 0);
      }

      // Update dedicated 2D button labels
      if (this.btnEnterVR) {
        this.btnEnterVR.textContent = '🚪 Exit Deep Space (VR)';
        this.btnEnterVR.classList.add('active-session');
      }
      if (this.btnEnterAR) {
        this.btnEnterAR.textContent = '👁 Switch to AR';
        this.btnEnterAR.classList.remove('active-session');
      }

      this.updateModeStatus('VR');
      if (this.callbacks.onSetMode) this.callbacks.onSetMode('VR');
    }

    // 3. Reveal 3D Left-Wrist Palette
    if (this.spatialDock) {
      this.spatialDock.visible = true;
      this.spatialDock.scale.set(0.72, 0.72, 0.72);
    }

    if (this.callbacks.onSessionStart) {
      this.callbacks.onSessionStart(mode);
    }
  }

  /**
   * Triggered when a WebXR session ends.
   */
  onSessionEnded(mode) {
    this.currentSession = null;
    this.currentSessionMode = null;
    this.isPassthroughActive = false;
    this.isDraggingTabletop = false;
    leftController = null;
    rightController = null;
    leftSqueezed = false;
    rightSqueezed = false;
    initialPinchDist = null;
    isDragging = false;
    isRotating = false;
    this.hoveredSnapPlane = null;
    this.lastXRFrame = null;
    if (this.grabState) {
      this.grabState.controller0.active = false;
      this.grabState.controller1.active = false;
      this.grabState.initialHandDistance = null;
    }
    if (this.handGrabState) {
      this.handGrabState.hand0.active = false;
      this.handGrabState.hand1.active = false;
      this.handGrabState.initialHandDistance = null;
    }
    if (this.hitTestSource) {
      if (typeof this.hitTestSource.cancel === 'function') {
        try { this.hitTestSource.cancel(); } catch (e) {}
      }
      this.hitTestSource = null;
    }
    unanchorTabletop();
    window.hasAnchoredToTable = false;

    TWEEN.removeAll();

    if (tabletopPivot) {
      tabletopPivot.scale.set(1.0, 1.0, 1.0);
      tabletopPivot.position.set(0, 0, 0);
    }
    if (this.solarSystemGroup) {
      this.solarSystemGroup.scale.set(1.0, 1.0, 1.0);
      this.solarSystemGroup.position.set(0, 0, 0);
    }
    if (window.skyboxMesh) window.skyboxMesh.visible = true;
    if (window.spaceParticles) window.spaceParticles.visible = true;
    if (window.baseRingMesh) window.baseRingMesh.visible = false;

    // 1. Restore 2D HTML DOM visibility & state
    document.body.classList.remove('in-xr');
    document.body.classList.remove('vr-mode');
    const hudContainer = document.getElementById('hud-container');
    if (hudContainer) {
      hudContainer.style.opacity = '1';
      hudContainer.style.pointerEvents = 'auto';
      hudContainer.style.display = '';
    }

    // 2. Reset 2D entry button labels and styles
    if (this.btnEnterVR) {
      this.btnEnterVR.textContent = '🌌 Enter Deep Space (VR)';
      this.btnEnterVR.classList.remove('active-session');
    }
    if (this.btnEnterAR) {
      this.btnEnterAR.textContent = '👁 Enter Tabletop Passthrough (AR)';
      this.btnEnterAR.classList.remove('active-session');
    }

    // 3. Hide 3D spatial slates and wrist dock
    if (this.spatialDock) this.spatialDock.visible = false;
    if (this.spatialDataPanel) this.spatialDataPanel.visible = false;
    if (this.quickTickersSlate) this.quickTickersSlate.visible = false;
    if (this.searchPanel) this.searchPanel.visible = false;
    if (this.hoveredObject) {
      setNodeHoverState(this.hoveredObject, false);
      this.hoveredObject = null;
    }

    if (this.callbacks.onSessionEnd) {
      this.callbacks.onSessionEnd();
    }
    if (this.callbacks.onExitVR) {
      this.callbacks.onExitVR();
    }
  }

  initXR() {
    this.renderer.xr.enabled = true;

    // 1. Discover and attach to dedicated 2D HUD WebXR Launch Buttons
    this.setupXRButtons();

    // 2. Session Start & End Listeners
    this.renderer.xr.addEventListener('sessionstart', () => {
      const session = this.renderer.xr.getSession();
      const mode = this.currentSessionMode || (this.isPassthroughActive ? 'immersive-ar' : 'immersive-vr');
      const isAR = mode === 'immersive-ar' || mode === 'ar';
      if (isAR) {
        TWEEN.removeAll();
        this.setMRTabletopMode();
      }
      this.onSessionStarted(mode, session);
    });

    this.renderer.xr.addEventListener('sessionend', () => {
      this.onSessionEnded(this.currentSessionMode);
    });

    // 3. 6-DoF Controller Setup
    const controllerModelFactory = new XRControllerModelFactory();

    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      controller.name = `XR_Controller_${i}`;
      controller.userData = { index: i, isHand: false, side: i === 0 ? 'left' : 'right' };

      controller.addEventListener('connected', (e) => {
        if (e.data) {
          controller.userData.handedness = e.data.handedness;
          controller.userData.inputSource = e.data;
          controller.gamepad = e.data.gamepad || null;
        }
      });

      controller.addEventListener('selectstart', (e) => this.onSelectStart(e, controller));
      controller.addEventListener('selectend', (e) => this.onSelectEnd(e, controller));
      controller.addEventListener('select', (e) => this.onSelect(e, controller));
      controller.addEventListener('squeeze', (e) => this.onSqueeze(e, controller));
      this.userRig.add(controller);
      this.controllers.push(controller);

      // Glowing Laser Pointer for controller
      const laser = this.createLaserPointer();
      controller.add(laser);
      controller.userData.laser = laser;

      // Controller Reticle Dot
      const reticle = this.createReticle();
      this.userRig.add(reticle);
      controller.userData.reticle = reticle;

      // Controller Grip Mesh
      const controllerGrip = this.renderer.xr.getControllerGrip(i);
      controllerGrip.add(controllerModelFactory.createControllerModel(controllerGrip));
      this.userRig.add(controllerGrip);
      this.controllerGrips.push(controllerGrip);
    }

    // Dynamic Handedness Controller Setup: Right = Drag, Left = Rotate
    setupXRControllers(this.renderer);

    // 4. WebXR Hand-Tracking Setup (Left Hand = index 0, Right Hand = index 1)
    const handModelFactory = new XRHandModelFactory();

    for (let i = 0; i < 2; i++) {
      const hand = this.renderer.xr.getHand(i);
      hand.name = `XR_Hand_${i}`;
      hand.userData = {
        index: i,
        isHand: true,
        side: i === 0 ? 'left' : 'right',
        isPinching: false
      };

      // Add animated hand mesh
      const handModel = handModelFactory.createHandModel(hand, 'mesh');
      hand.add(handModel);
      this.userRig.add(hand);
      this.hands.push(hand);

      // Pinch Event Listeners
      hand.addEventListener('pinchstart', (e) => this.onHandPinchStart(e, hand));
      hand.addEventListener('pinchend', (e) => this.onHandPinchEnd(e, hand));

      // Hand Pointer & Reticle (Index fingertip laser pointer for air-pointing)
      const handLaser = this.createLaserPointer(0x38bdf8);
      handLaser.visible = false;
      this.userRig.add(handLaser);

      const handReticle = this.createReticle(0x38bdf8);
      this.userRig.add(handReticle);

      hand.userData.laser = handLaser;
      hand.userData.reticle = handReticle;
    }

    // 5. Build Left-Wrist Holographic Control Palette
    this.buildLeftWristPalette();

    // 6. Build 3D Spatial Manage Data Slate Panel
    this.buildSpatialDataPanel();

    // 7. Build 3D Quick Tickers & Live Stocks Slate
    this.buildQuickTickersSlate();

    // 8. Build 3D Spatial Search Window & Virtual Keyboard
    this.buildSpatialSearchPanel();
  }

  createLaserPointer(colorHex = 0x00f0ff) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -5)
    ]);
    const material = new THREE.LineBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      linewidth: 2
    });
    const line = new THREE.Line(geometry, material);
    line.name = 'LaserPointer';
    return line;
  }

  createReticle(colorHex = 0x00f0ff) {
    const geometry = new THREE.RingGeometry(0.015, 0.038, 32);
    const material = new THREE.MeshBasicMaterial({
      color: colorHex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthTest: false
    });
    const reticle = new THREE.Mesh(geometry, material);
    reticle.visible = false;
    reticle.renderOrder = 999;
    return reticle;
  }

  /**
   * Helper to create 2D rounded rectangle shape for spatial glass plates and button pill chips.
   */
  createRoundedRectShape(width, height, radius) {
    const shape = new THREE.Shape();
    const x = -width / 2;
    const y = -height / 2;
    const r = Math.min(radius, width / 2, height / 2);

    shape.moveTo(x + r, y);
    shape.lineTo(x + width - r, y);
    shape.absarc(x + width - r, y + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(x + width, y + height - r);
    shape.absarc(x + width - r, y + height - r, r, 0, Math.PI / 2, false);
    shape.lineTo(x + r, y + height);
    shape.absarc(x + r, y + height - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(x, y + r);
    shape.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
    return shape;
  }

  /**
   * Builds the Ultra-Clean Floating Glassmorphic Left-Wrist Spatial HUD.
   * Dimensions: 0.26m x 0.20m with 4 unclipped, perfectly spaced rows.
   */
  buildLeftWristPalette() {
    this.spatialDock = new THREE.Group();
    this.spatialDock.name = 'LeftWristGlassHUD';
    // Offset gracefully above left controller / wrist, tilted at a natural 35° reading angle
    this.spatialDock.position.set(0, 0.08, 0.045);
    this.spatialDock.rotation.set(-0.62, 0, 0);
    this.spatialDock.scale.set(1.0, 1.0, 1.0);
    this.spatialDock.visible = false;

    const dockW = 0.26;
    const dockH = 0.22;
    const dockR = 0.012;

    // 1. Frosted Glass Backing Plate (MeshPhysicalMaterial)
    const plateShape = this.createRoundedRectShape(dockW, dockH, dockR);
    const plateGeo = new THREE.ShapeGeometry(plateShape, 24);
    const plateMat = new THREE.MeshPhysicalMaterial({
      color: 0x090d16,
      transmission: 0.88,
      roughness: 0.18,
      metalness: 0.1,
      ior: 1.45,
      transparent: true,
      opacity: 0.88,
      clearcoat: 0.3,
      clearcoatRoughness: 0.1,
      side: THREE.DoubleSide
    });
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    this.spatialDock.add(plateMesh);

    // Glowing Cyan Perimeter Frame LineLoop
    const platePoints = plateShape.getPoints(32);
    const borderGeo = new THREE.BufferGeometry().setFromPoints(platePoints);
    const borderMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });
    const borderLine = new THREE.LineLoop(borderGeo, borderMat);
    borderLine.position.z = 0.001;
    this.spatialDock.add(borderLine);

    // Subtle Glass Divider Lines
    const createDivider = (yPos) => {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.115, yPos, 0.0015),
        new THREE.Vector3(0.115, yPos, 0.0015)
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x334155,
        transparent: true,
        opacity: 0.5
      });
      this.spatialDock.add(new THREE.Line(lineGeo, lineMat));
    };

    createDivider(0.074);
    createDivider(0.046);
    createDivider(-0.016);

    // Helper to create sleek, flat rounded pill buttons
    const createPillButton = (config) => {
      const {
        label,
        x,
        y,
        w = 0.056,
        h = 0.019,
        depth = 0.002,
        radius = 0.004,
        color = 0x1e293b,
        hoverColor = 0x334155,
        activeColor = 0x0891b2,
        emissiveColor = 0x0f172a,
        emissiveIntensity = 0.15,
        borderColor = 0x00f0ff,
        borderOpacity = 0.45,
        opacity = 0.85,
        textColor = 0xf8fafc,
        fontSize = 0.0065,
        action,
        data = {}
      } = config;

      const btnGroup = new THREE.Group();
      btnGroup.position.set(x, y, 0.003);

      const shape = this.createRoundedRectShape(w, h, radius);
      const geo = new THREE.ShapeGeometry(shape, 16);
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.25,
        emissive: new THREE.Color(emissiveColor),
        emissiveIntensity,
        transparent: true,
        opacity,
        side: THREE.DoubleSide
      });
      const btnMesh = new THREE.Mesh(geo, mat);
      btnMesh.userData = {
        isVRButton: true,
        action,
        baseColor: color,
        hoverColor,
        activeColor,
        emissiveColor,
        baseEmissiveIntensity: emissiveIntensity,
        originalZ: 0.003,
        w,
        h,
        depth,
        ...data
      };
      btnGroup.add(btnMesh);
      this.dockButtons.push(btnMesh);

      // Glowing Perimeter Outline
      const borderGeo = new THREE.BufferGeometry().setFromPoints(shape.getPoints(16));
      const borderMat = new THREE.LineBasicMaterial({
        color: borderColor,
        transparent: true,
        opacity: borderOpacity
      });
      const border = new THREE.LineLoop(borderGeo, borderMat);
      border.position.z = 0.0005;
      btnGroup.add(border);
      btnMesh.userData.borderMesh = border;

      // Label Typography
      const txt = new Text();
      txt.text = label;
      txt.fontSize = fontSize;
      txt.color = textColor;
      txt.anchorX = 'center';
      txt.anchorY = 'middle';
      txt.whiteSpace = 'nowrap';
      txt.position.set(0, 0, 0.001);
      txt.sync();
      btnGroup.add(txt);

      btnMesh.userData.labelMesh = txt;
      btnMesh.userData.btnGroup = btnGroup;
      this.spatialDock.add(btnGroup);
      return { btnGroup, btnMesh, txt };
    };

    // 2. Header (y = +0.088m): Brand Title, Live Net Worth Badge & High-Visibility Exit VR Button
    const titleText = new Text();
    titleText.text = '🪐 SPATIAL WEALTH';
    titleText.fontSize = 0.0078;
    titleText.color = 0x38bdf8;
    titleText.anchorX = 'left';
    titleText.anchorY = 'middle';
    titleText.whiteSpace = 'nowrap';
    titleText.position.set(-0.114, 0.088, 0.003);
    titleText.sync();
    this.spatialDock.add(titleText);

    // Live Net Worth Pill Badge
    const nwPillShape = this.createRoundedRectShape(0.066, 0.018, 0.004);
    const nwPillGeo = new THREE.ShapeGeometry(nwPillShape, 16);
    const nwPillMat = new THREE.MeshStandardMaterial({
      color: 0x064e3b,
      roughness: 0.3,
      metalness: 0.2,
      emissive: new THREE.Color(0x059669),
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.85
    });
    const nwPillMesh = new THREE.Mesh(nwPillGeo, nwPillMat);
    nwPillMesh.position.set(0.010, 0.088, 0.002);
    this.spatialDock.add(nwPillMesh);

    const nwBorderGeo = new THREE.BufferGeometry().setFromPoints(nwPillShape.getPoints(16));
    const nwBorderMat = new THREE.LineBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.55
    });
    const nwBorderLine = new THREE.LineLoop(nwBorderGeo, nwBorderMat);
    nwBorderLine.position.set(0.010, 0.088, 0.0025);
    this.spatialDock.add(nwBorderLine);

    const netWorthText = new Text();
    netWorthText.text = '$1,245,000';
    netWorthText.fontSize = 0.0068;
    netWorthText.color = 0x34d399;
    netWorthText.anchorX = 'center';
    netWorthText.anchorY = 'middle';
    netWorthText.whiteSpace = 'nowrap';
    netWorthText.position.set(0.010, 0.088, 0.0035);
    netWorthText.sync();
    this.spatialDock.add(netWorthText);
    this.dockTexts.netWorth = netWorthText;

    // High-visibility Frosted Crimson [ 🚪 Exit VR ] Button
    const btnExitVR = createPillButton({
      label: '[ 🚪 Exit VR ]',
      x: 0.086,
      y: 0.088,
      w: 0.055,
      h: 0.018,
      depth: 0.002,
      fontSize: 0.0052,
      color: 0xef4444,
      hoverColor: 0xdc2626,
      activeColor: 0x991b1b,
      emissiveColor: 0x991b1b,
      emissiveIntensity: 0.4,
      borderColor: 0xf87171,
      borderOpacity: 0.75,
      textColor: 0xffffff,
      opacity: 0.85,
      action: 'exitVR'
    });
    this.dockTexts.btnExitVR = btnExitVR.txt;
    this.dockButtons.btnExitVR = btnExitVR.btnMesh;

    // 3. Row 0: Dedicated Country Market Switcher (y = +0.060m)
    const btnMarketUS = createPillButton({
      label: '🇺🇸 Wall St ($)',
      x: -0.058,
      y: 0.060,
      w: 0.114,
      h: 0.019,
      fontSize: 0.0062,
      color: 0x0e7490,
      hoverColor: 0x06b6d4,
      emissiveColor: 0x06b6d4,
      emissiveIntensity: 0.45,
      borderColor: 0x00f0ff,
      borderOpacity: 0.85,
      textColor: 0xffffff,
      action: 'switchMarket',
      data: { market: 'US' }
    });
    this.dockTexts.btnMarketUS = btnMarketUS.txt;
    this.dockButtons.btnMarketUS = btnMarketUS.btnMesh;

    const btnMarketIN = createPillButton({
      label: '🇮🇳 Bharat (₹)',
      x: 0.058,
      y: 0.060,
      w: 0.114,
      h: 0.019,
      fontSize: 0.0062,
      color: 0x1e293b,
      hoverColor: 0x065f46,
      emissiveColor: 0x0f172a,
      emissiveIntensity: 0.15,
      borderColor: 0x334155,
      borderOpacity: 0.45,
      textColor: 0x94a3b8,
      action: 'switchMarket',
      data: { market: 'IN' }
    });
    this.dockTexts.btnMarketIN = btnMarketIN.txt;
    this.dockButtons.btnMarketIN = btnMarketIN.btnMesh;

    // 4. Row 1: System Controls & Dedicated VR vs MR Mode Buttons (y = +0.033m)
    const btnOrbit = createPillButton({
      label: '🪐 Orbit',
      x: -0.095,
      y: 0.033,
      w: 0.038,
      h: 0.018,
      fontSize: 0.0054,
      color: 0x0e7490,
      hoverColor: 0x06b6d4,
      emissiveColor: 0x06b6d4,
      emissiveIntensity: 0.4,
      action: 'toggleOrbit'
    });
    this.dockTexts.btnOrbit = btnOrbit.txt;
    this.dockButtons.btnOrbit = btnOrbit.btnMesh;

    const btnFlow = createPillButton({
      label: '⚡ Flow',
      x: -0.055,
      y: 0.033,
      w: 0.038,
      h: 0.018,
      fontSize: 0.0054,
      color: 0x047857,
      hoverColor: 0x10b981,
      emissiveColor: 0x10b981,
      emissiveIntensity: 0.4,
      action: 'toggleFlow'
    });
    this.dockTexts.btnFlow = btnFlow.txt;
    this.dockButtons.btnFlow = btnFlow.btnMesh;

    const btnAudio = createPillButton({
      label: '🔊 Audio',
      x: -0.015,
      y: 0.033,
      w: 0.038,
      h: 0.018,
      fontSize: 0.0054,
      color: 0x0e7490,
      hoverColor: 0x06b6d4,
      emissiveColor: 0x06b6d4,
      emissiveIntensity: 0.4,
      action: 'toggleAudio'
    });
    this.dockTexts.btnAudio = btnAudio.txt;
    this.dockButtons.btnAudio = btnAudio.btnMesh;

    // Dedicated Mode Button 1: [ 🌌 Deep Space VR ] (Cobalt Cyan #06b6d4)
    const btnModeVR = createPillButton({
      label: '🌌 Space VR',
      x: 0.033,
      y: 0.033,
      w: 0.054,
      h: 0.018,
      fontSize: 0.0048,
      color: 0x0e7490,
      hoverColor: 0x06b6d4,
      emissiveColor: 0x06b6d4,
      emissiveIntensity: 0.45,
      borderColor: 0x00f0ff,
      borderOpacity: 0.85,
      textColor: 0xffffff,
      action: 'setModeVR'
    });
    this.dockTexts.btnModeVR = btnModeVR.txt;
    this.dockButtons.btnModeVR = btnModeVR.btnMesh;

    // Dedicated Mode Button 2: [ 🪟 MR Tabletop ] (Emerald Green #10b981)
    const btnModeMR = createPillButton({
      label: '🪟 Tabletop',
      x: 0.090,
      y: 0.033,
      w: 0.054,
      h: 0.018,
      fontSize: 0.0048,
      color: 0x1e293b,
      hoverColor: 0x065f46,
      emissiveColor: 0x0f172a,
      emissiveIntensity: 0.15,
      borderColor: 0x334155,
      borderOpacity: 0.45,
      textColor: 0x94a3b8,
      action: 'setModeMR'
    });
    this.dockTexts.btnModeMR = btnModeMR.txt;
    this.dockButtons.btnModeMR = btnModeMR.btnMesh;

    // 5. Row 2: Chart, Ticker Search & Data Tools (y = +0.005m | 5 buttons)
    const btnChartMode = createPillButton({
      label: '📈/📊 Mode',
      x: -0.090,
      y: 0.005,
      w: 0.046,
      h: 0.018,
      fontSize: 0.0050,
      color: 0x0e7490,
      hoverColor: 0x06b6d4,
      emissiveColor: 0x06b6d4,
      emissiveIntensity: 0.35,
      action: 'toggleChartMode'
    });
    this.dockTexts.btnChartMode = btnChartMode.txt;
    this.dockButtons.btnChartMode = btnChartMode.btnMesh;

    const btnToggleChart = createPillButton({
      label: '📊 Chart',
      x: -0.044,
      y: 0.005,
      w: 0.042,
      h: 0.018,
      fontSize: 0.0056,
      color: 0x1e293b,
      hoverColor: 0x334155,
      action: 'toggleChart'
    });
    this.dockTexts.btnToggleChart = btnToggleChart.txt;

    const btnQuickTickers = createPillButton({
      label: '🔍 Search',
      x: 0.000,
      y: 0.005,
      w: 0.042,
      h: 0.018,
      fontSize: 0.0056,
      color: 0x0f766e,
      hoverColor: 0x14b8a6,
      emissiveColor: 0x10b981,
      emissiveIntensity: 0.4,
      action: 'toggleSearchPanel'
    });
    this.dockTexts.btnQuickTickers = btnQuickTickers.txt;
    this.dockButtons.btnQuickTickers = btnQuickTickers.btnMesh;

    const btnManageData = createPillButton({
      label: '📑 Data',
      x: 0.044,
      y: 0.005,
      w: 0.042,
      h: 0.018,
      fontSize: 0.0056,
      color: 0x1e293b,
      hoverColor: 0x334155,
      action: 'toggleManageData'
    });
    this.dockTexts.btnManageData = btnManageData.txt;

    const btnReset = createPillButton({
      label: '🔄 Reset',
      x: 0.090,
      y: 0.005,
      w: 0.044,
      h: 0.018,
      fontSize: 0.0056,
      color: 0x6d28d9,
      hoverColor: 0x8b5cf6,
      emissiveColor: 0x7c3aed,
      emissiveIntensity: 0.3,
      action: 'resetView'
    });
    this.dockTexts.btnReset = btnReset.txt;

    // 6. Section Header: Sector Filters
    const sectorHeader = new Text();
    sectorHeader.text = '— SECTOR FILTERS —';
    sectorHeader.fontSize = 0.0050;
    sectorHeader.color = 0x64748b;
    sectorHeader.anchorX = 'center';
    sectorHeader.anchorY = 'middle';
    sectorHeader.whiteSpace = 'nowrap';
    sectorHeader.position.set(0, -0.022, 0.002);
    sectorHeader.sync();
    this.spatialDock.add(sectorHeader);

    // 7. Row 3: Sector Filters Top Half (y = -0.044m | 3 buttons, width 0.076m each)
    const btnAll = createPillButton({
      label: 'ALL',
      x: -0.082,
      y: -0.044,
      w: 0.076,
      h: 0.018,
      fontSize: 0.0062,
      color: 0x0f766e,
      hoverColor: 0x14b8a6,
      emissiveColor: 0x10b981,
      emissiveIntensity: 0.5,
      action: 'filterCategory',
      data: { category: 'all' }
    });

    const btnEquities = createPillButton({
      label: 'EQUITIES',
      x: 0,
      y: -0.044,
      w: 0.076,
      h: 0.018,
      fontSize: 0.0060,
      color: 0x1e293b,
      hoverColor: 0x334155,
      action: 'filterCategory',
      data: { category: 'Equities' }
    });

    const btnIndex = createPillButton({
      label: 'INDEX FUNDS',
      x: 0.082,
      y: -0.044,
      w: 0.076,
      h: 0.018,
      fontSize: 0.0058,
      color: 0x1e293b,
      hoverColor: 0x334155,
      action: 'filterCategory',
      data: { category: 'Index Funds' }
    });

    // 8. Row 4: Sector Filters Bottom Half (y = -0.072m | 3 buttons, width 0.076m each)
    const btnFixed = createPillButton({
      label: 'FIXED INC',
      x: -0.082,
      y: -0.072,
      w: 0.076,
      h: 0.018,
      fontSize: 0.0060,
      color: 0x1e293b,
      hoverColor: 0x334155,
      action: 'filterCategory',
      data: { category: 'Fixed Income' }
    });

    const btnCrypto = createPillButton({
      label: 'CRYPTO',
      x: 0,
      y: -0.072,
      w: 0.076,
      h: 0.018,
      fontSize: 0.0062,
      color: 0x1e293b,
      hoverColor: 0x334155,
      action: 'filterCategory',
      data: { category: 'Crypto & Web3' }
    });

    const btnCash = createPillButton({
      label: 'LIQUID CASH',
      x: 0.082,
      y: -0.072,
      w: 0.076,
      h: 0.018,
      fontSize: 0.0058,
      color: 0x1e293b,
      hoverColor: 0x334155,
      action: 'filterCategory',
      data: { category: 'Liquid Cash' }
    });


    // Attach dock to Left Controller (controllers[0]) by default, or Left Hand (hands[0])
    if (this.controllers[0]) {
      this.controllers[0].add(this.spatialDock);
    } else if (this.hands[0]) {
      this.hands[0].add(this.spatialDock);
    } else {
      this.scene.add(this.spatialDock);
    }
  }

  /**
   * Builds the Dedicated 3D Spatial "Manage Data" Floating Glass Window.
   * Dimensions: width: 0.9m, height: 0.65m, depth: 0.01m.
   * Material: Frosted dark glass (MeshPhysicalMaterial, transmission: 0.88, roughness: 0.2, color: #0f172a, subtle glowing cyan border).
   */
  buildSpatialDataPanel() {
    this.spatialDataPanel = new THREE.Group();
    this.spatialDataPanel.name = 'SpatialDataPanel';
    this.spatialDataPanel.position.set(0, 1.4, -1.2);
    this.spatialDataPanel.visible = false;

    const panelW = 0.90;
    const panelH = 0.65;
    const panelR = 0.024;

    // 1. Frosted Dark Glass Backing Plate (MeshPhysicalMaterial)
    const plateShape = this.createRoundedRectShape(panelW, panelH, panelR);
    const plateGeo = new THREE.ShapeGeometry(plateShape, 32);
    const plateMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      transmission: 0.88,
      roughness: 0.2,
      metalness: 0.1,
      ior: 1.45,
      transparent: true,
      opacity: 0.88,
      clearcoat: 0.3,
      clearcoatRoughness: 0.1,
      side: THREE.DoubleSide
    });
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    this.spatialDataPanel.add(plateMesh);

    // Glowing Cyan Perimeter Frame LineLoop
    const platePoints = plateShape.getPoints(32);
    const borderGeo = new THREE.BufferGeometry().setFromPoints(platePoints);
    const borderMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });
    const borderLine = new THREE.LineLoop(borderGeo, borderMat);
    borderLine.position.z = 0.001;
    this.spatialDataPanel.add(borderLine);

    // Helper to create subtle divider lines
    const createDivider = (yPos) => {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.41, yPos, 0.0015),
        new THREE.Vector3(0.41, yPos, 0.0015)
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x334155,
        transparent: true,
        opacity: 0.55
      });
      this.spatialDataPanel.add(new THREE.Line(lineGeo, lineMat));
    };

    // Helper to create buttons on the Spatial Data Panel
    this.createPanelButton = (config, parentGroup = this.spatialDataPanel) => {
      const {
        label,
        x,
        y,
        w = 0.038,
        h = 0.024,
        radius = 0.004,
        color = 0x1e293b,
        hoverColor = 0x334155,
        activeColor = 0x0891b2,
        emissiveColor = 0x0f172a,
        emissiveIntensity = 0.2,
        textColor = 0xf8fafc,
        fontSize = 0.012,
        action,
        data = {}
      } = config;

      const btnGroup = new THREE.Group();
      btnGroup.position.set(x, y, 0.003);

      const shape = this.createRoundedRectShape(w, h, radius);
      const geo = new THREE.ShapeGeometry(shape, 16);
      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.25,
        emissive: new THREE.Color(emissiveColor),
        emissiveIntensity,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
      });
      const btnMesh = new THREE.Mesh(geo, mat);
      btnMesh.userData = {
        isVRButton: true,
        action,
        baseColor: color,
        hoverColor,
        activeColor,
        originalZ: 0.003,
        w,
        h,
        ...data
      };
      btnGroup.add(btnMesh);
      this.dataPanelButtons.push(btnMesh);

      // Glowing Perimeter Outline
      const borderGeo = new THREE.BufferGeometry().setFromPoints(shape.getPoints(16));
      const borderMat = new THREE.LineBasicMaterial({
        color: color === 0x7f1d1d ? 0xef4444 : 0x00f0ff,
        transparent: true,
        opacity: 0.55
      });
      const border = new THREE.LineLoop(borderGeo, borderMat);
      border.position.z = 0.0005;
      btnGroup.add(border);
      btnMesh.userData.borderMesh = border;

      // Label Typography
      const txt = new Text();
      txt.text = label;
      txt.fontSize = fontSize;
      txt.color = textColor;
      txt.anchorX = 'center';
      txt.anchorY = 'middle';
      txt.whiteSpace = 'nowrap';
      txt.position.set(0, 0, 0.001);
      txt.sync();
      btnGroup.add(txt);

      btnMesh.userData.labelMesh = txt;
      btnMesh.userData.btnGroup = btnGroup;
      parentGroup.add(btnGroup);
      return { btnGroup, btnMesh, txt };
    };

    // 2. Header (y = +0.278m): Title, Subtitle & Red Close Button [ ✕ Close ]
    const headerTitle = new Text();
    headerTitle.text = '📊 PORTFOLIO ASSET ALLOCATION & CASH FLOW';
    headerTitle.fontSize = 0.016;
    headerTitle.color = 0x38bdf8;
    headerTitle.anchorX = 'left';
    headerTitle.anchorY = 'middle';
    headerTitle.whiteSpace = 'nowrap';
    headerTitle.position.set(-0.41, 0.278, 0.003);
    headerTitle.sync();
    this.spatialDataPanel.add(headerTitle);

    const headerSub = new Text();
    headerSub.text = 'LIVE VR ASSET REBALANCING & LIQUIDITY CONTROL';
    headerSub.fontSize = 0.0085;
    headerSub.color = 0x64748b;
    headerSub.anchorX = 'left';
    headerSub.anchorY = 'middle';
    headerSub.whiteSpace = 'nowrap';
    headerSub.position.set(-0.41, 0.258, 0.003);
    headerSub.sync();
    this.spatialDataPanel.add(headerSub);

    // Red Close Button [ ✕ Close ]
    this.createPanelButton({
      label: '✕ Close',
      x: 0.375,
      y: 0.268,
      w: 0.080,
      h: 0.024,
      fontSize: 0.0085,
      color: 0x7f1d1d,
      hoverColor: 0x991b1b,
      activeColor: 0xdc2626,
      emissiveColor: 0xef4444,
      emissiveIntensity: 0.4,
      action: 'closeDataPanel'
    });

    createDivider(0.242);

    // 3. Monthly Flow Summary Bar (y = +0.208m)
    const flowPillShape = this.createRoundedRectShape(0.83, 0.046, 0.008);
    const flowPillGeo = new THREE.ShapeGeometry(flowPillShape, 20);
    const flowPillMat = new THREE.MeshStandardMaterial({
      color: 0x0b1329,
      roughness: 0.3,
      metalness: 0.2,
      transparent: true,
      opacity: 0.8
    });
    const flowPillMesh = new THREE.Mesh(flowPillGeo, flowPillMat);
    flowPillMesh.position.set(0, 0.208, 0.002);
    this.spatialDataPanel.add(flowPillMesh);

    // Inflow column
    const txtInflowLabel = new Text();
    txtInflowLabel.text = 'MONTHLY INFLOW';
    txtInflowLabel.fontSize = 0.0072;
    txtInflowLabel.color = 0x64748b;
    txtInflowLabel.anchorX = 'center';
    txtInflowLabel.anchorY = 'middle';
    txtInflowLabel.position.set(-0.27, 0.218, 0.003);
    txtInflowLabel.sync();
    this.spatialDataPanel.add(txtInflowLabel);

    const txtInflowVal = new Text();
    txtInflowVal.text = portfolioState.summary.monthlyInflow || '+$6,420';
    txtInflowVal.fontSize = 0.011;
    txtInflowVal.color = 0x10b981;
    txtInflowVal.anchorX = 'center';
    txtInflowVal.anchorY = 'middle';
    txtInflowVal.position.set(-0.27, 0.200, 0.003);
    txtInflowVal.sync();
    this.spatialDataPanel.add(txtInflowVal);
    this.dataPanelTexts.inflow = txtInflowVal;

    // Outflow column
    const txtOutflowLabel = new Text();
    txtOutflowLabel.text = 'MONTHLY OUTFLOW';
    txtOutflowLabel.fontSize = 0.0072;
    txtOutflowLabel.color = 0x64748b;
    txtOutflowLabel.anchorX = 'center';
    txtOutflowLabel.anchorY = 'middle';
    txtOutflowLabel.position.set(0, 0.218, 0.003);
    txtOutflowLabel.sync();
    this.spatialDataPanel.add(txtOutflowLabel);

    const txtOutflowVal = new Text();
    txtOutflowVal.text = portfolioState.summary.monthlyOutflow || '-$3,850';
    txtOutflowVal.fontSize = 0.011;
    txtOutflowVal.color = 0xef4444;
    txtOutflowVal.anchorX = 'center';
    txtOutflowVal.anchorY = 'middle';
    txtOutflowVal.position.set(0, 0.200, 0.003);
    txtOutflowVal.sync();
    this.spatialDataPanel.add(txtOutflowVal);
    this.dataPanelTexts.outflow = txtOutflowVal;

    // Net Savings column
    const txtSavingsLabel = new Text();
    txtSavingsLabel.text = 'NET MONTHLY SAVINGS';
    txtSavingsLabel.fontSize = 0.0072;
    txtSavingsLabel.color = 0x64748b;
    txtSavingsLabel.anchorX = 'center';
    txtSavingsLabel.anchorY = 'middle';
    txtSavingsLabel.position.set(0.27, 0.218, 0.003);
    txtSavingsLabel.sync();
    this.spatialDataPanel.add(txtSavingsLabel);

    const txtSavingsVal = new Text();
    txtSavingsVal.text = portfolioState.summary.netMonthlySavings || '+$2,570 / mo';
    txtSavingsVal.fontSize = 0.011;
    txtSavingsVal.color = 0x38bdf8;
    txtSavingsVal.anchorX = 'center';
    txtSavingsVal.anchorY = 'middle';
    txtSavingsVal.position.set(0.27, 0.200, 0.003);
    txtSavingsVal.sync();
    this.spatialDataPanel.add(txtSavingsVal);
    this.dataPanelTexts.netSavings = txtSavingsVal;

    createDivider(0.174);

    // 4. Table Column Headers (y = +0.158m)
    const createColHeader = (text, x, anchorX) => {
      const txt = new Text();
      txt.text = text;
      txt.fontSize = 0.0082;
      txt.color = 0x94a3b8;
      txt.anchorX = anchorX;
      txt.anchorY = 'middle';
      txt.whiteSpace = 'nowrap';
      txt.position.set(x, 0.158, 0.003);
      txt.sync();
      this.spatialDataPanel.add(txt);
    };

    createColHeader('ASSET & HOLDING', -0.40, 'left');
    createColHeader('ALLOCATION', 0.02, 'center');
    createColHeader('ADJUST (- / +)', 0.165, 'center');
    createColHeader('CURRENT VALUE', 0.40, 'right');

    // 5. Asset Rows Container Group
    this.assetRowsGroup = new THREE.Group();
    this.assetRowsGroup.name = 'AssetRowsGroup';
    this.spatialDataPanel.add(this.assetRowsGroup);

    // Populate initial rows
    this.buildAssetRows(portfolioState.assets);

    // 6. Footer Summary Bar (y = -0.285m)
    createDivider(-0.258);

    const footerText = new Text();
    footerText.text = `TOTAL NET WORTH: ${portfolioState.summary.formattedNetWorth}  •  1Y RETURNS: ${portfolioState.summary.formattedReturns}  •  ALLOCATION: 100%`;
    footerText.fontSize = 0.0088;
    footerText.color = 0x94a3b8;
    footerText.anchorX = 'center';
    footerText.anchorY = 'middle';
    footerText.whiteSpace = 'nowrap';
    footerText.position.set(0, -0.282, 0.003);
    footerText.sync();
    this.spatialDataPanel.add(footerText);
    this.dataPanelTexts.footer = footerText;

    this.scene.add(this.spatialDataPanel);
  }

  /**
   * Dynamically constructs the interactive asset table rows on the Spatial Data Panel.
   */
  buildAssetRows(assets = []) {
    if (!this.assetRowsGroup) return;

    // Remove previous asset rows and old row buttons
    while (this.assetRowsGroup.children.length > 0) {
      const child = this.assetRowsGroup.children[0];
      this.assetRowsGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }

    // Filter out buttons from dataPanelButtons that were row buttons (keep Close button)
    this.dataPanelButtons = this.dataPanelButtons.filter((b) => b.userData.action === 'closeDataPanel');
    this.assetRowElements = [];

    const rowStartY = 0.125;
    const rowStepY = 0.046;
    const maxRows = Math.min(assets.length, 8);

    for (let i = 0; i < maxRows; i++) {
      const asset = assets[i];
      const rowY = rowStartY - i * rowStepY;

      // Row Glass Backing Plate
      const rowShape = this.createRoundedRectShape(0.83, 0.040, 0.006);
      const rowGeo = new THREE.ShapeGeometry(rowShape, 16);
      const rowMat = new THREE.MeshStandardMaterial({
        color: i % 2 === 0 ? 0x0f172a : 0x091122,
        roughness: 0.35,
        metalness: 0.2,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide
      });
      const rowMesh = new THREE.Mesh(rowGeo, rowMat);
      rowMesh.position.set(0, rowY, 0.001);
      this.assetRowsGroup.add(rowMesh);

      // Asset Color Indicator Chip
      const dotShape = this.createRoundedRectShape(0.010, 0.024, 0.003);
      const dotGeo = new THREE.ShapeGeometry(dotShape, 8);
      const dotMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(asset.color || 0x00f0ff),
        side: THREE.DoubleSide
      });
      const dotMesh = new THREE.Mesh(dotGeo, dotMat);
      dotMesh.position.set(-0.398, rowY, 0.002);
      this.assetRowsGroup.add(dotMesh);

      // Asset Name & Ticker
      const nameText = new Text();
      nameText.text = `${asset.name} (${asset.ticker})`;
      nameText.fontSize = 0.0095;
      nameText.color = 0xf8fafc;
      nameText.anchorX = 'left';
      nameText.anchorY = 'middle';
      nameText.whiteSpace = 'nowrap';
      nameText.position.set(-0.380, rowY + 0.006, 0.003);
      nameText.sync();
      this.assetRowsGroup.add(nameText);

      // Category & Returns
      const catText = new Text();
      catText.text = `${asset.category} • Returns: ${asset.formattedReturns}`;
      catText.fontSize = 0.0072;
      catText.color = 0x64748b;
      catText.anchorX = 'left';
      catText.anchorY = 'middle';
      catText.whiteSpace = 'nowrap';
      catText.position.set(-0.380, rowY - 0.007, 0.003);
      catText.sync();
      this.assetRowsGroup.add(catText);

      // Allocation Pill Badge
      const allocPillShape = this.createRoundedRectShape(0.066, 0.022, 0.004);
      const allocPillGeo = new THREE.ShapeGeometry(allocPillShape, 12);
      const allocPillMat = new THREE.MeshStandardMaterial({
        color: 0x0c2136,
        roughness: 0.3,
        metalness: 0.2,
        transparent: true,
        opacity: 0.85
      });
      const allocPillMesh = new THREE.Mesh(allocPillGeo, allocPillMat);
      allocPillMesh.position.set(0.02, rowY, 0.002);
      this.assetRowsGroup.add(allocPillMesh);

      const allocText = new Text();
      allocText.text = `${asset.allocation}%`;
      allocText.fontSize = 0.0095;
      allocText.color = 0x38bdf8;
      allocText.anchorX = 'center';
      allocText.anchorY = 'middle';
      allocText.whiteSpace = 'nowrap';
      allocText.position.set(0.02, rowY, 0.0035);
      allocText.sync();
      this.assetRowsGroup.add(allocText);

      // Stepper [ - ] Button
      this.createPanelButton(
        {
          label: '–',
          x: 0.140,
          y: rowY,
          w: 0.034,
          h: 0.024,
          fontSize: 0.012,
          color: 0x1e293b,
          hoverColor: 0x334155,
          activeColor: 0xef4444,
          action: 'adjustAsset',
          data: { assetId: asset.id, delta: -1 }
        },
        this.assetRowsGroup
      );

      // Stepper [ + ] Button
      this.createPanelButton(
        {
          label: '+',
          x: 0.188,
          y: rowY,
          w: 0.034,
          h: 0.024,
          fontSize: 0.012,
          color: 0x0e7490,
          hoverColor: 0x0284c7,
          activeColor: 0x10b981,
          action: 'adjustAsset',
          data: { assetId: asset.id, delta: +1 }
        },
        this.assetRowsGroup
      );

      // Current Value & PnL
      const valText = new Text();
      valText.text = `${asset.formattedValue}`;
      valText.fontSize = 0.0098;
      valText.color = 0x34d399;
      valText.anchorX = 'right';
      valText.anchorY = 'middle';
      valText.whiteSpace = 'nowrap';
      valText.position.set(0.40, rowY + 0.006, 0.003);
      valText.sync();
      this.assetRowsGroup.add(valText);

      const pnlText = new Text();
      pnlText.text = `${asset.pnl || asset.formattedReturns}`;
      pnlText.fontSize = 0.0072;
      pnlText.color = asset.returns >= 0 ? 0x10b981 : 0xef4444;
      pnlText.anchorX = 'right';
      pnlText.anchorY = 'middle';
      pnlText.whiteSpace = 'nowrap';
      pnlText.position.set(0.40, rowY - 0.007, 0.003);
      pnlText.sync();
      this.assetRowsGroup.add(pnlText);

      this.assetRowElements.push({
        assetId: asset.id,
        nameText,
        catText,
        allocText,
        valText,
        pnlText
      });
    }
  }

  /**
   * Dynamically synchronizes 3D Spatial Data Panel text values in real-time.
   */
  updateSpatialDataPanel(state = portfolioState) {
    if (!this.spatialDataPanel) return;

    if (this.dataPanelTexts.inflow && state.summary) {
      this.dataPanelTexts.inflow.text = state.summary.monthlyInflow || '+$6,420';
      this.dataPanelTexts.inflow.sync();
    }
    if (this.dataPanelTexts.outflow && state.summary) {
      this.dataPanelTexts.outflow.text = state.summary.monthlyOutflow || '-$3,850';
      this.dataPanelTexts.outflow.sync();
    }
    if (this.dataPanelTexts.netSavings && state.summary) {
      this.dataPanelTexts.netSavings.text = state.summary.netMonthlySavings || '+$2,570 / mo';
      this.dataPanelTexts.netSavings.sync();
    }
    if (this.dataPanelTexts.footer && state.summary) {
      this.dataPanelTexts.footer.text = `TOTAL NET WORTH: ${state.summary.formattedNetWorth}  •  1Y RETURNS: ${state.summary.formattedReturns}  •  ALLOCATION: 100%`;
      this.dataPanelTexts.footer.sync();
    }

    // Check if asset count or list of IDs changed
    const currentIds = this.assetRowElements.map((r) => r.assetId);
    const newIds = (state.assets || []).slice(0, 8).map((a) => a.id);
    const hasSameAssets = currentIds.length === newIds.length && currentIds.every((id, i) => id === newIds[i]);

    if (!hasSameAssets) {
      this.buildAssetRows(state.assets);
      return;
    }

    // Update row texts
    this.assetRowElements.forEach((rowElem) => {
      const asset = state.assets.find((a) => a.id === rowElem.assetId);
      if (asset) {
        if (rowElem.nameText) {
          rowElem.nameText.text = `${asset.name} (${asset.ticker})`;
          rowElem.nameText.sync();
        }
        if (rowElem.catText) {
          rowElem.catText.text = `${asset.category} • Returns: ${asset.formattedReturns}`;
          rowElem.catText.sync();
        }
        if (rowElem.allocText) {
          rowElem.allocText.text = `${asset.allocation}%`;
          rowElem.allocText.sync();
        }
        if (rowElem.valText) {
          rowElem.valText.text = `${asset.formattedValue}`;
          rowElem.valText.sync();
        }
        if (rowElem.pnlText) {
          rowElem.pnlText.text = `${asset.pnl || asset.formattedReturns}`;
          rowElem.pnlText.color = asset.returns >= 0 ? 0x10b981 : 0xef4444;
          rowElem.pnlText.sync();
        }
      }
    });
  }

  /**
   * Toggles the 3D Spatial "Manage Data" Window and repositions it 1.2m in front of the viewer.
   */
  toggleSpatialDataPanel(forceState) {
    if (!this.spatialDataPanel) return;

    const nextVisible = forceState !== undefined ? Boolean(forceState) : !this.spatialDataPanel.visible;
    this.spatialDataPanel.visible = nextVisible;

    if (nextVisible) {
      soundFx.playSelectSound();

      // Position 1.2m directly in front of viewer's head orientation
      const activeCamera = this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera;
      const camPos = new THREE.Vector3();
      const camQuat = new THREE.Quaternion();
      activeCamera.getWorldPosition(camPos);
      activeCamera.getWorldQuaternion(camQuat);

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
      const spawnPos = camPos.clone().add(forward.multiplyScalar(1.2));
      this.spatialDataPanel.position.copy(spawnPos);
      this.spatialDataPanel.quaternion.copy(camQuat);

      // Refresh data
      this.updateSpatialDataPanel(portfolioState);
    } else {
      soundFx.playCloseSound();
    }
  }

  /**
   * Builds the 3D Holographic Quick Tickers & Live Stocks Spatial Slate.
   * Floating frosted glass slate displaying popular tickers: NVDA, AAPL, MSFT, TSLA, BTC, ETH, AMZN, SPY.
   */
  buildQuickTickersSlate() {
    this.quickTickersSlate = new THREE.Group();
    this.quickTickersSlate.name = 'QuickTickersSpatialSlate';
    this.quickTickersSlate.position.set(0, 1.6, 10.8);
    this.quickTickersSlate.visible = false;
    this.quickTickerButtons = [];

    const slateW = 0.72;
    const slateH = 0.44;
    const slateR = 0.016;

    // 1. Frosted Cyber Glass Backing Plate
    const plateShape = this.createRoundedRectShape(slateW, slateH, slateR);
    const plateGeo = new THREE.ShapeGeometry(plateShape, 24);
    const plateMat = new THREE.MeshPhysicalMaterial({
      color: 0x050c18,
      transmission: 0.90,
      roughness: 0.18,
      metalness: 0.15,
      ior: 1.45,
      transparent: true,
      opacity: 0.90,
      clearcoat: 0.35,
      side: THREE.DoubleSide
    });
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    this.quickTickersSlate.add(plateMesh);

    // Glowing Neon Cyan Border
    const borderPoints = plateShape.getPoints(32);
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
    const borderMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });
    const borderLine = new THREE.LineLoop(borderGeo, borderMat);
    borderLine.position.z = 0.001;
    this.quickTickersSlate.add(borderLine);

    // 2. Header Bar
    const titleText = new Text();
    titleText.text = '🔍 REAL-TIME STOCKS & QUICK TICKERS';
    titleText.fontSize = 0.0155;
    titleText.color = 0x00f0ff;
    titleText.anchorX = 'left';
    titleText.anchorY = 'middle';
    titleText.position.set(-slateW / 2 + 0.035, slateH / 2 - 0.035, 0.003);
    titleText.sync();
    this.quickTickersSlate.add(titleText);

    const subText = new Text();
    subText.text = 'Tap any symbol to fetch Finnhub live candle data & stream real-time ticks into the 3D chart';
    subText.fontSize = 0.0085;
    subText.color = 0x94a3b8;
    subText.anchorX = 'left';
    subText.anchorY = 'middle';
    subText.position.set(-slateW / 2 + 0.035, slateH / 2 - 0.062, 0.003);
    subText.sync();
    this.quickTickersSlate.add(subText);

    // Close Button [✕]
    const closeShape = this.createRoundedRectShape(0.040, 0.030, 0.005);
    const closeGeo = new THREE.ShapeGeometry(closeShape, 12);
    const closeMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.2,
      emissive: new THREE.Color(0xef4444),
      emissiveIntensity: 0.25,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const closeBtnMesh = new THREE.Mesh(closeGeo, closeMat);
    closeBtnMesh.position.set(slateW / 2 - 0.035, slateH / 2 - 0.035, 0.003);
    closeBtnMesh.userData = {
      isVRButton: true,
      action: 'closeQuickTickersSlate',
      baseColor: 0x1e293b,
      hoverColor: 0xef4444,
      baseEmissiveIntensity: 0.25
    };
    this.quickTickersSlate.add(closeBtnMesh);
    this.quickTickerButtons.push(closeBtnMesh);

    const closeTxt = new Text();
    closeTxt.text = '✕';
    closeTxt.fontSize = 0.014;
    closeTxt.color = 0xf8fafc;
    closeTxt.anchorX = 'center';
    closeTxt.anchorY = 'middle';
    closeTxt.position.set(slateW / 2 - 0.035, slateH / 2 - 0.035, 0.005);
    closeTxt.sync();
    this.quickTickersSlate.add(closeTxt);

    // Divider Line
    const divGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-slateW / 2 + 0.03, slateH / 2 - 0.082, 0.002),
      new THREE.Vector3(slateW / 2 - 0.03, slateH / 2 - 0.082, 0.002)
    ]);
    const divMat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.6 });
    this.quickTickersSlate.add(new THREE.Line(divGeo, divMat));

    // 3. Quick Tickers Grid (2 rows x 4 columns)
    const tickers = [
      { symbol: 'NVDA', name: 'Nvidia Corp', price: '$128.50', ret: '+48.2%', col: 0x00f0ff, cat: 'GPU AI' },
      { symbol: 'AAPL', name: 'Apple Inc.', price: '$232.10', ret: '+18.4%', col: 0x38bdf8, cat: 'Ecosystem' },
      { symbol: 'MSFT', name: 'Microsoft', price: '$448.20', ret: '+24.6%', col: 0x8b5cf6, cat: 'Cloud AI' },
      { symbol: 'TSLA', name: 'Tesla Inc.', price: '$254.60', ret: '-8.2%', col: 0xef4444, cat: 'Autonomy' },
      { symbol: 'BTC', name: 'Bitcoin', price: '$64,280', ret: '+62.5%', col: 0xf59e0b, cat: 'Crypto' },
      { symbol: 'ETH', name: 'Ethereum', price: '$3,490', ret: '+42.0%', col: 0xec4899, cat: 'DeFi Web3' },
      { symbol: 'AMZN', name: 'Amazon.com', price: '$188.40', ret: '+22.8%', col: 0x10b981, cat: 'Cloud AWS' },
      { symbol: 'SPY', name: 'S&P 500 ETF', price: '$560.20', ret: '+16.5%', col: 0x06b6d4, cat: 'Index Fund' }
    ];

    const colCount = 4;
    const btnW = 0.152;
    const btnH = 0.115;
    const startX = -((colCount - 1) * 0.168) / 2;
    const startY = 0.038;
    const rowGapY = 0.138;

    tickers.forEach((t, i) => {
      const colIdx = i % colCount;
      const rowIdx = Math.floor(i / colCount);
      const x = startX + colIdx * 0.168;
      const y = startY - rowIdx * rowGapY;

      const btnGroup = new THREE.Group();
      btnGroup.position.set(x, y, 0.003);

      const bShape = this.createRoundedRectShape(btnW, btnH, 0.008);
      const bGeo = new THREE.ShapeGeometry(bShape, 16);
      const bMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.3,
        metalness: 0.25,
        emissive: new THREE.Color(t.col),
        emissiveIntensity: 0.18,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide
      });
      const bMesh = new THREE.Mesh(bGeo, bMat);
      bMesh.userData = {
        isVRButton: true,
        action: 'selectQuickTicker',
        symbol: t.symbol,
        baseColor: 0x0f172a,
        hoverColor: 0x1e293b,
        emissiveColor: t.col,
        baseEmissiveIntensity: 0.18,
        originalZ: 0.003
      };
      btnGroup.add(bMesh);
      this.quickTickerButtons.push(bMesh);

      // Border outline
      const bBorderGeo = new THREE.BufferGeometry().setFromPoints(bShape.getPoints(16));
      const bBorderMat = new THREE.LineBasicMaterial({ color: t.col, transparent: true, opacity: 0.65 });
      const bBorder = new THREE.LineLoop(bBorderGeo, bBorderMat);
      bBorder.position.z = 0.001;
      btnGroup.add(bBorder);

      // Ticker Label
      const txtSymbol = new Text();
      txtSymbol.text = t.symbol;
      txtSymbol.fontSize = 0.016;
      txtSymbol.color = 0xffffff;
      txtSymbol.anchorX = 'center';
      txtSymbol.anchorY = 'middle';
      txtSymbol.position.set(0, 0.026, 0.003);
      txtSymbol.sync();
      btnGroup.add(txtSymbol);

      // Name & Subtitle
      const txtName = new Text();
      txtName.text = `${t.name}`;
      txtName.fontSize = 0.0076;
      txtName.color = 0x94a3b8;
      txtName.anchorX = 'center';
      txtName.anchorY = 'middle';
      txtName.position.set(0, 0.006, 0.003);
      txtName.sync();
      btnGroup.add(txtName);

      // Price & Returns Pill
      const txtPrice = new Text();
      txtPrice.text = `${t.price} (${t.ret})`;
      txtPrice.fontSize = 0.0080;
      txtPrice.color = t.ret.startsWith('+') ? 0x10b981 : 0xef4444;
      txtPrice.anchorX = 'center';
      txtPrice.anchorY = 'middle';
      txtPrice.position.set(0, -0.016, 0.003);
      txtPrice.sync();
      btnGroup.add(txtPrice);

      // Category Tag
      const txtCat = new Text();
      txtCat.text = `[ ${t.cat} ]`;
      txtCat.fontSize = 0.0065;
      txtCat.color = 0x64748b;
      txtCat.anchorX = 'center';
      txtCat.anchorY = 'middle';
      txtCat.position.set(0, -0.038, 0.003);
      txtCat.sync();
      btnGroup.add(txtCat);

      this.quickTickersSlate.add(btnGroup);
    });

    this.scene.add(this.quickTickersSlate);
  }

  /**
   * Toggles the 3D Quick Ticker Grid Spatial Slate in VR space.
   */
  toggleQuickTickersSlate(forceState) {
    if (!this.quickTickersSlate) return;

    const nextVisible = forceState !== undefined ? Boolean(forceState) : !this.quickTickersSlate.visible;
    this.quickTickersSlate.visible = nextVisible;

    if (nextVisible) {
      soundFx.playSelectSound();

      // Position 1.2m directly in front of viewer's head orientation
      const activeCamera = this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera;
      const camPos = new THREE.Vector3();
      const camQuat = new THREE.Quaternion();
      activeCamera.getWorldPosition(camPos);
      activeCamera.getWorldQuaternion(camQuat);

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
      const spawnPos = camPos.clone().add(forward.multiplyScalar(1.2));
      this.quickTickersSlate.position.copy(spawnPos);
      this.quickTickersSlate.quaternion.copy(camQuat);
    } else {
      soundFx.playCloseSound();
    }
  }

  /**
   * Helper to create interactive VR button on the 3D Spatial Search Window.
   */
  createSearchButton(config, parentGroup = this.searchPanel) {
    const {
      label,
      char,
      action,
      symbol,
      x,
      y,
      w = 0.068,
      h = 0.034,
      radius = 0.005,
      color = 0x1e293b,
      hoverColor = 0x334155,
      activeColor = 0x0891b2,
      emissiveColor = 0x0f172a,
      emissiveIntensity = 0.2,
      borderColor = 0x00f0ff,
      borderOpacity = 0.45,
      textColor = 0xf8fafc,
      fontSize = 0.011,
      data = {}
    } = config;

    const btnGroup = new THREE.Group();
    btnGroup.position.set(x, y, 0.003);

    const shape = this.createRoundedRectShape(w, h, radius);
    const geo = new THREE.ShapeGeometry(shape, 16);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.35,
      metalness: 0.25,
      emissive: new THREE.Color(emissiveColor),
      emissiveIntensity,
      transparent: true,
      opacity: 0.90,
      side: THREE.DoubleSide
    });
    const btnMesh = new THREE.Mesh(geo, mat);
    btnMesh.userData = {
      isVRButton: true,
      action,
      char,
      symbol,
      baseColor: color,
      hoverColor,
      activeColor,
      emissiveColor,
      baseEmissiveIntensity: emissiveIntensity,
      originalZ: 0.003,
      w,
      h,
      ...data
    };
    btnGroup.add(btnMesh);
    this.searchPanelButtons.push(btnMesh);

    // Glowing Perimeter Outline
    const borderGeo = new THREE.BufferGeometry().setFromPoints(shape.getPoints(16));
    const borderMat = new THREE.LineBasicMaterial({
      color: borderColor,
      transparent: true,
      opacity: borderOpacity
    });
    const border = new THREE.LineLoop(borderGeo, borderMat);
    border.position.z = 0.0005;
    btnGroup.add(border);
    btnMesh.userData.borderMesh = border;

    // Label Typography
    const txt = new Text();
    txt.text = label;
    txt.fontSize = fontSize;
    txt.color = textColor;
    txt.anchorX = 'center';
    txt.anchorY = 'middle';
    txt.whiteSpace = 'nowrap';
    txt.position.set(0, 0, 0.001);
    txt.sync();
    btnGroup.add(txt);

    btnMesh.userData.labelMesh = txt;
    btnMesh.userData.btnGroup = btnGroup;
    parentGroup.add(btnGroup);
    return { btnGroup, btnMesh, txt };
  }

  /**
   * Builds the 3D Spatial Instant Search Slate with Frosted Glass & Virtual Keyboard.
   * Dimensions: width: 0.85m, height: 0.65m.
   * Material: Frosted dark glass (transmission: 0.85, roughness: 0.2, color: #0f172a, glowing border).
   */
  buildSpatialSearchPanel() {
    this.searchPanel = new THREE.Group();
    this.searchPanel.name = 'SpatialSearchPanel';
    this.searchPanel.position.set(0, 1.5, 10.9);
    this.searchPanel.visible = false;
    this.searchPanelButtons = [];

    const panelW = 0.85;
    const panelH = 0.65;
    const panelR = 0.024;

    // 1. Frosted Dark Glass Backing Plate (MeshPhysicalMaterial)
    const plateShape = this.createRoundedRectShape(panelW, panelH, panelR);
    const plateGeo = new THREE.ShapeGeometry(plateShape, 32);
    const plateMat = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      transmission: 0.85,
      roughness: 0.20,
      metalness: 0.10,
      ior: 1.45,
      transparent: true,
      opacity: 0.88,
      clearcoat: 0.30,
      clearcoatRoughness: 0.10,
      side: THREE.DoubleSide
    });
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    this.searchPanel.add(plateMesh);

    // Glowing Cyan Perimeter Frame LineLoop
    const platePoints = plateShape.getPoints(32);
    const borderGeo = new THREE.BufferGeometry().setFromPoints(platePoints);
    const borderMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });
    const borderLine = new THREE.LineLoop(borderGeo, borderMat);
    borderLine.position.z = 0.001;
    this.searchPanel.add(borderLine);

    // Helper to create subtle divider lines
    const createDivider = (yPos) => {
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.385, yPos, 0.0015),
        new THREE.Vector3(0.385, yPos, 0.0015)
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x334155,
        transparent: true,
        opacity: 0.55
      });
      this.searchPanel.add(new THREE.Line(lineGeo, lineMat));
    };

    // 2. Header (y = +0.280m): Brand Title & Red Close Button [ ✕ Close ]
    const headerTitle = new Text();
    headerTitle.text = '🔍 REAL-TIME SPATIAL SEARCH & KEYBOARD';
    headerTitle.fontSize = 0.0145;
    headerTitle.color = 0x38bdf8;
    headerTitle.anchorX = 'left';
    headerTitle.anchorY = 'middle';
    headerTitle.whiteSpace = 'nowrap';
    headerTitle.position.set(-0.385, 0.285, 0.003);
    headerTitle.sync();
    this.searchPanel.add(headerTitle);

    const headerSub = new Text();
    headerSub.text = 'LIVE TYPE-AHEAD AUTO-FILTERING • US EQUITIES, INDEX FUNDS & CRYPTO';
    headerSub.fontSize = 0.0072;
    headerSub.color = 0x64748b;
    headerSub.anchorX = 'left';
    headerSub.anchorY = 'middle';
    headerSub.whiteSpace = 'nowrap';
    headerSub.position.set(-0.385, 0.268, 0.003);
    headerSub.sync();
    this.searchPanel.add(headerSub);

    // Close Button [ ✕ Close ]
    this.createSearchButton({
      label: '✕ Close',
      x: 0.345,
      y: 0.278,
      w: 0.075,
      h: 0.024,
      fontSize: 0.0085,
      color: 0x7f1d1d,
      hoverColor: 0x991b1b,
      activeColor: 0xdc2626,
      emissiveColor: 0xef4444,
      emissiveIntensity: 0.4,
      action: 'closeSearchPanel'
    });

    createDivider(0.252);

    // 3. Search Query Display Bar (y = +0.218m)
    const searchBarShape = this.createRoundedRectShape(0.77, 0.044, 0.008);
    const searchBarGeo = new THREE.ShapeGeometry(searchBarShape, 16);
    const searchBarMat = new THREE.MeshStandardMaterial({
      color: 0x071120,
      roughness: 0.3,
      metalness: 0.2,
      transparent: true,
      opacity: 0.90
    });
    const searchBarMesh = new THREE.Mesh(searchBarGeo, searchBarMat);
    searchBarMesh.position.set(0, 0.218, 0.002);
    this.searchPanel.add(searchBarMesh);

    const sbBorderGeo = new THREE.BufferGeometry().setFromPoints(searchBarShape.getPoints(16));
    const sbBorderMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.50
    });
    const sbBorder = new THREE.LineLoop(sbBorderGeo, sbBorderMat);
    sbBorder.position.set(0, 0.218, 0.0025);
    this.searchPanel.add(sbBorder);

    // Search Icon & Prefix Label
    const searchIconText = new Text();
    searchIconText.text = '🔍 SEARCH:';
    searchIconText.fontSize = 0.0095;
    searchIconText.color = 0x38bdf8;
    searchIconText.anchorX = 'left';
    searchIconText.anchorY = 'middle';
    searchIconText.position.set(-0.365, 0.218, 0.0035);
    searchIconText.sync();
    this.searchPanel.add(searchIconText);

    // Live Query Display Text with Blinking Cursor
    this.searchQueryText = new Text();
    this.searchQueryText.text = 'NV|';
    this.searchQueryText.fontSize = 0.0125;
    this.searchQueryText.color = 0xffffff;
    this.searchQueryText.anchorX = 'left';
    this.searchQueryText.anchorY = 'middle';
    this.searchQueryText.whiteSpace = 'nowrap';
    this.searchQueryText.position.set(-0.255, 0.218, 0.0035);
    this.searchQueryText.sync();
    this.searchPanel.add(this.searchQueryText);

    // Search Bar Action Buttons: [ ⌫ Backspace ] & [ ✕ Clear ]
    this.createSearchButton({
      label: '⌫ Del',
      x: 0.258,
      y: 0.218,
      w: 0.062,
      h: 0.028,
      fontSize: 0.0085,
      color: 0x1e293b,
      hoverColor: 0x334155,
      action: 'keyBackspace'
    });

    this.createSearchButton({
      label: '✕ Clear',
      x: 0.332,
      y: 0.218,
      w: 0.062,
      h: 0.028,
      fontSize: 0.0085,
      color: 0x334155,
      hoverColor: 0xef4444,
      action: 'keyClear'
    });

    createDivider(0.180);

    // 4. Instant Search Results Bar / Suggestions (y = +0.130m)
    const suggestionsHeader = new Text();
    suggestionsHeader.text = '— LIVE AUTO-FILTERED SUGGESTIONS & TRENDING TICKERS —';
    suggestionsHeader.fontSize = 0.0068;
    suggestionsHeader.color = 0x64748b;
    suggestionsHeader.anchorX = 'center';
    suggestionsHeader.anchorY = 'middle';
    suggestionsHeader.position.set(0, 0.165, 0.003);
    suggestionsHeader.sync();
    this.searchPanel.add(suggestionsHeader);

    this.suggestionsContainer = new THREE.Group();
    this.suggestionsContainer.name = 'SearchSuggestionsContainer';
    this.searchPanel.add(this.suggestionsContainer);

    createDivider(0.082);

    // 5. Full Virtual Keyboard (y = +0.038m down to -0.178m)
    // Row 1: Numbers (y = +0.040m | 10 keys)
    const numKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
    const numStartX = -0.342;
    const numGap = 0.076;
    numKeys.forEach((key, idx) => {
      this.createSearchButton({
        label: key,
        char: key,
        x: numStartX + idx * numGap,
        y: 0.040,
        w: 0.068,
        h: 0.034,
        fontSize: 0.0115,
        color: 0x141f33,
        hoverColor: 0x0284c7,
        action: 'keyPress'
      });
    });

    // Row 2: QWERTY 1 (y = -0.014m | 10 keys)
    const row1Keys = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
    row1Keys.forEach((key, idx) => {
      this.createSearchButton({
        label: key,
        char: key,
        x: numStartX + idx * numGap,
        y: -0.014,
        w: 0.068,
        h: 0.034,
        fontSize: 0.0115,
        color: 0x0f172a,
        hoverColor: 0x0284c7,
        action: 'keyPress'
      });
    });

    // Row 3: QWERTY 2 (y = -0.068m | 9 keys)
    const row2Keys = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'];
    const row2StartX = -0.336;
    const row2Gap = 0.084;
    row2Keys.forEach((key, idx) => {
      this.createSearchButton({
        label: key,
        char: key,
        x: row2StartX + idx * row2Gap,
        y: -0.068,
        w: 0.076,
        h: 0.034,
        fontSize: 0.0115,
        color: 0x0f172a,
        hoverColor: 0x0284c7,
        action: 'keyPress'
      });
    });

    // Row 4: QWERTY 3 + Backspace (y = -0.122m | 7 keys + Backspace)
    const row3Keys = ['Z', 'X', 'C', 'V', 'B', 'N', 'M'];
    row3Keys.forEach((key, idx) => {
      this.createSearchButton({
        label: key,
        char: key,
        x: row2StartX + idx * row2Gap,
        y: -0.122,
        w: 0.076,
        h: 0.034,
        fontSize: 0.0115,
        color: 0x0f172a,
        hoverColor: 0x0284c7,
        action: 'keyPress'
      });
    });

    // [ ⌫ Backspace ] Key on Row 4
    this.createSearchButton({
      label: '⌫ Backspace',
      x: 0.285,
      y: -0.122,
      w: 0.134,
      h: 0.034,
      fontSize: 0.0090,
      color: 0x450a0a,
      hoverColor: 0xef4444,
      emissiveColor: 0xef4444,
      emissiveIntensity: 0.25,
      borderColor: 0xf87171,
      action: 'keyBackspace'
    });

    // Row 5: Action Bar (y = -0.176m)
    this.createSearchButton({
      label: '✕ Clear',
      x: -0.278,
      y: -0.176,
      w: 0.142,
      h: 0.034,
      fontSize: 0.0090,
      color: 0x334155,
      hoverColor: 0x475569,
      action: 'keyClear'
    });

    this.createSearchButton({
      label: '⎵  SPACE',
      char: ' ',
      x: 0.000,
      y: -0.176,
      w: 0.330,
      h: 0.034,
      fontSize: 0.0090,
      color: 0x1e293b,
      hoverColor: 0x334155,
      action: 'keyPress'
    });

    this.createSearchButton({
      label: '🔍 Search / Enter ⏎',
      x: 0.258,
      y: -0.176,
      w: 0.176,
      h: 0.034,
      fontSize: 0.0090,
      color: 0x0e7490,
      hoverColor: 0x06b6d4,
      emissiveColor: 0x06b6d4,
      emissiveIntensity: 0.35,
      borderColor: 0x38bdf8,
      action: 'keySubmit'
    });

    createDivider(-0.216);

    // 6. Footer Status (y = -0.245m)
    const footerText = new Text();
    footerText.text = '⚡ WebXR Direct Touch & 6-DoF Raycasting  •  Instant Bloomberg / TradingView 3D Chart Sync';
    footerText.fontSize = 0.0075;
    footerText.color = 0x64748b;
    footerText.anchorX = 'center';
    footerText.anchorY = 'middle';
    footerText.whiteSpace = 'nowrap';
    footerText.position.set(0, -0.245, 0.003);
    footerText.sync();
    this.searchPanel.add(footerText);

    this.scene.add(this.searchPanel);

    // Populate initial default suggestions
    this.updateSearchQueryDisplay();
    this.updateSearchSuggestions();
  }

  /**
   * Updates Search Query string typography with blinking cursor.
   */
  updateSearchQueryDisplay() {
    if (!this.searchQueryText) return;
    const cursor = this.cursorVisible ? '|' : ' ';
    if (this.searchQuery.length > 0) {
      this.searchQueryText.text = `${this.searchQuery}${cursor}`;
      this.searchQueryText.color = 0x38bdf8;
    } else {
      this.searchQueryText.text = `Type ticker symbol or name... ${cursor}`;
      this.searchQueryText.color = 0x64748b;
    }
    this.searchQueryText.sync();
  }

  /**
   * Filters STOCK_CATALOG against search query string.
   */
  getFilteredSuggestions() {
    const q = (this.searchQuery || '').trim().toUpperCase();
    if (!q) {
      return STOCK_CATALOG.slice(0, 4);
    }
    const matches = STOCK_CATALOG.filter(
      (s) =>
        s.symbol.toUpperCase().includes(q) ||
        s.name.toUpperCase().includes(q) ||
        (s.sector && s.sector.toUpperCase().includes(q)) ||
        (s.exchange && s.exchange.toUpperCase().includes(q)) ||
        (s.currency && s.currency.toUpperCase().includes(q))
    );
    return matches.slice(0, 4);
  }

  /**
   * Re-renders dynamically matched suggestion chips on the Search Panel.
   */
  updateSearchSuggestions() {
    if (!this.suggestionsContainer) return;

    // Dispose old suggestion children
    while (this.suggestionsContainer.children.length > 0) {
      const child = this.suggestionsContainer.children[0];
      this.suggestionsContainer.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    }

    // Filter out previous suggestion buttons from searchPanelButtons
    this.searchPanelButtons = this.searchPanelButtons.filter(
      (b) => b.userData.action !== 'selectSearchSuggestion'
    );
    this.searchSuggestionButtons = [];

    const suggestions = this.getFilteredSuggestions();

    if (suggestions.length === 0) {
      const noMatchShape = this.createRoundedRectShape(0.42, 0.038, 0.006);
      const noMatchGeo = new THREE.ShapeGeometry(noMatchShape, 16);
      const noMatchMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
      });
      const noMatchMesh = new THREE.Mesh(noMatchGeo, noMatchMat);
      noMatchMesh.position.set(0, 0.130, 0.002);
      this.suggestionsContainer.add(noMatchMesh);

      const noMatchText = new Text();
      noMatchText.text = `No matching tickers found for "${this.searchQuery}"`;
      noMatchText.fontSize = 0.0085;
      noMatchText.color = 0x94a3b8;
      noMatchText.anchorX = 'center';
      noMatchText.anchorY = 'middle';
      noMatchText.position.set(0, 0.130, 0.004);
      noMatchText.sync();
      this.suggestionsContainer.add(noMatchText);
      return;
    }

    const count = suggestions.length;
    const chipW = Math.min(0.182, 0.76 / count - 0.015);
    const chipH = 0.040;
    const totalW = count * chipW + (count - 1) * 0.012;
    const startX = -totalW / 2 + chipW / 2;
    const stepX = chipW + 0.012;

    suggestions.forEach((item, i) => {
      const x = startX + i * stepX;
      const y = 0.130;

      const sectorColors = {
        Equities: 0x00f0ff,
        Crypto: 0xf59e0b,
        Index: 0x10b981,
        Bonds: 0x8b5cf6
      };
      const themeCol = sectorColors[item.sector] || 0x38bdf8;

      const btnGroup = new THREE.Group();
      btnGroup.position.set(x, y, 0.003);

      const shape = this.createRoundedRectShape(chipW, chipH, 0.006);
      const geo = new THREE.ShapeGeometry(shape, 16);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x0b1329,
        roughness: 0.3,
        metalness: 0.2,
        emissive: new THREE.Color(themeCol),
        emissiveIntensity: 0.22,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide
      });
      const btnMesh = new THREE.Mesh(geo, mat);
      btnMesh.userData = {
        isVRButton: true,
        action: 'selectSearchSuggestion',
        symbol: item.symbol,
        stockData: item,
        baseColor: 0x0b1329,
        hoverColor: 0x1e293b,
        emissiveColor: themeCol,
        baseEmissiveIntensity: 0.22,
        originalZ: 0.003
      };
      btnGroup.add(btnMesh);
      this.searchPanelButtons.push(btnMesh);
      this.searchSuggestionButtons.push(btnMesh);

      // Border outline
      const borderGeo = new THREE.BufferGeometry().setFromPoints(shape.getPoints(16));
      const borderMat = new THREE.LineBasicMaterial({
        color: themeCol,
        transparent: true,
        opacity: 0.65
      });
      const border = new THREE.LineLoop(borderGeo, borderMat);
      border.position.z = 0.0005;
      btnGroup.add(border);
      btnMesh.userData.borderMesh = border;

      // Chip Text: [ TICKER (EXCHANGE) | Company Name | Price ]
      const txtTicker = new Text();
      const exchangeTag = item.exchange ? ` (${item.exchange})` : ` (${item.sector})`;
      txtTicker.text = `${item.symbol}${exchangeTag}`;
      txtTicker.fontSize = 0.0078;
      txtTicker.color = themeCol;
      txtTicker.anchorX = 'center';
      txtTicker.anchorY = 'middle';
      txtTicker.position.set(0, 0.008, 0.002);
      txtTicker.sync();
      btnGroup.add(txtTicker);

      const displayName = item.name.length > 13 ? item.name.slice(0, 12) + '…' : item.name;
      const formattedPrice = formatCurrency(item.price, item.currency || 'USD');
      const txtDetails = new Text();
      txtDetails.text = `${displayName} | ${formattedPrice}`;
      txtDetails.fontSize = 0.0068;
      txtDetails.color = 0xf8fafc;
      txtDetails.anchorX = 'center';
      txtDetails.anchorY = 'middle';
      txtDetails.position.set(0, -0.009, 0.002);
      txtDetails.sync();
      btnGroup.add(txtDetails);

      this.suggestionsContainer.add(btnGroup);
    });
  }

  /**
   * Toggles the 3D Spatial Search Window & Virtual Keyboard in front of the VR user.
   */
  toggleSearchPanel(forceState) {
    if (!this.searchPanel) return;

    const nextVisible = forceState !== undefined ? Boolean(forceState) : !this.searchPanel.visible;
    this.searchPanel.visible = nextVisible;

    if (nextVisible) {
      soundFx.playSelectSound();

      // Position 1.1m directly in front of viewer's head orientation
      const activeCamera = this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera;
      const camPos = new THREE.Vector3();
      const camQuat = new THREE.Quaternion();
      activeCamera.getWorldPosition(camPos);
      activeCamera.getWorldQuaternion(camQuat);

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat);
      const spawnPos = camPos.clone().add(forward.multiplyScalar(1.1));
      this.searchPanel.position.copy(spawnPos);
      this.searchPanel.quaternion.copy(camQuat);

      this.updateSearchQueryDisplay();
      this.updateSearchSuggestions();
    } else {
      soundFx.playCloseSound();
    }
  }

  /**
   * Synchronizes Live Portfolio Net Worth on the Wrist Dock.
   */
  updateNetWorthText(text) {
    if (this.dockTexts.netWorth) {
      this.dockTexts.netWorth.text = `${text}`;
      this.dockTexts.netWorth.sync();
    }
  }

  /**
   * Synchronizes Orbit Toggle State.
   */
  updateOrbitStatus(isAutoOrbiting) {
    if (this.dockTexts.btnOrbit) {
      this.dockTexts.btnOrbit.text = isAutoOrbiting ? '🪐 Orbit: ON' : '🪐 Orbit: OFF';
      this.dockTexts.btnOrbit.sync();
    }
    if (this.dockButtons.btnOrbit) {
      this.dockButtons.btnOrbit.material.color.setHex(isAutoOrbiting ? 0x0e7490 : 0x1e293b);
      this.dockButtons.btnOrbit.material.emissive.setHex(isAutoOrbiting ? 0x06b6d4 : 0x0f172a);
      this.dockButtons.btnOrbit.material.emissiveIntensity = isAutoOrbiting ? 0.45 : 0.15;
    }
  }

  /**
   * Synchronizes Cash Flow Mode Status.
   */
  updateFlowStatus(mode) {
    const isOff = mode === 'off';
    if (this.dockTexts.btnFlow) {
      const modeMap = {
        both: '⚡ Flow: BOTH',
        income: '⚡ Flow: IN',
        expenses: '⚡ Flow: OUT',
        off: '⚡ Flow: OFF'
      };
      this.dockTexts.btnFlow.text = modeMap[mode] || '⚡ Flow: ON';
      this.dockTexts.btnFlow.sync();
    }
    if (this.dockButtons.btnFlow) {
      this.dockButtons.btnFlow.material.color.setHex(!isOff ? 0x047857 : 0x1e293b);
      this.dockButtons.btnFlow.material.emissive.setHex(!isOff ? 0x10b981 : 0x0f172a);
      this.dockButtons.btnFlow.material.emissiveIntensity = !isOff ? 0.45 : 0.15;
    }
  }

  /**
   * Synchronizes Audio FX Status.
   */
  updateAudioStatus(isEnabled) {
    if (this.dockTexts.btnAudio) {
      this.dockTexts.btnAudio.text = isEnabled ? '🔊 Audio: ON' : '🔇 Audio: OFF';
      this.dockTexts.btnAudio.sync();
    }
    if (this.dockButtons.btnAudio) {
      this.dockButtons.btnAudio.material.color.setHex(isEnabled ? 0x0e7490 : 0x1e293b);
      this.dockButtons.btnAudio.material.emissive.setHex(isEnabled ? 0x06b6d4 : 0x0f172a);
      this.dockButtons.btnAudio.material.emissiveIntensity = isEnabled ? 0.45 : 0.15;
    }
  }

  /**
   * Sets the Solar System Root Group for tabletop miniature scaling & dragging.
   */
  setSolarSystemGroup(group) {
    this.solarSystemGroup = group;
  }

  /**
   * Switches dedicated visual mode:
   * - 'VR' (Deep Space VR Mode: Immersive skybox, starfield, full room scale 1.0)
   * - 'MR' (Mixed Reality Tabletop Mode: Transparent WebGL background, 0.2 miniature scale at desk height)
   * @param {'VR'|'MR'|boolean} mode
   */
  setMode(mode) {
    const isMR = (mode === 'MR' || mode === 'TABLETOP' || mode === true);
    this.isPassthroughActive = isMR;

    // 1. Configure WebXR Blend Mode & Clear Color
    if (this.isPassthroughActive) {
      this.setMRTabletopMode();
      const session = this.renderer.xr.getSession();
      if (session && typeof session.requestEnvironmentBlendMode === 'function') {
        session.requestEnvironmentBlendMode('alpha-blend').catch(() => {});
      }
    } else {
      window.hasAnchoredToTable = false;
      unanchorTabletop();
      this.renderer.setClearColor(0x030712, 1);
      this.renderer.setClearAlpha(1);
      const session = this.renderer.xr.getSession();
      if (session && typeof session.requestEnvironmentBlendMode === 'function') {
        session.requestEnvironmentBlendMode('opaque').catch(() => {});
      }
      setPassthroughMode(false);
      if (window.skyboxMesh) window.skyboxMesh.visible = true;
      if (window.spaceParticles) window.spaceParticles.visible = true;
      if (window.baseRingMesh) window.baseRingMesh.visible = false;
      if (tabletopPivot) {
        tabletopPivot.scale.set(1.0, 1.0, 1.0);
        tabletopPivot.position.set(0, 0, 0);
      }
      if (this.solarSystemGroup) {
        this.solarSystemGroup.scale.set(1.0, 1.0, 1.0);
        this.solarSystemGroup.position.set(0, 0, 0);
      }
    }

    // 2. Delegate group animation & desktop HUD sync
    if (this.callbacks.onSetMode) {
      this.callbacks.onSetMode(isMR ? 'MR' : 'VR');
    } else if (this.callbacks.onTogglePassthrough) {
      this.callbacks.onTogglePassthrough(this.isPassthroughActive);
    } else {
      TWEEN.removeAll();
      const targetScale = this.isPassthroughActive ? 0.18 : 1.0;
      const targetPivot = tabletopPivot || this.solarSystemGroup;
      if (targetPivot) {
        const twScale = new TWEEN.Tween(targetPivot.scale)
          .to({ x: targetScale, y: targetScale, z: targetScale }, 600)
          .easing(TWEEN.Easing.Cubic.Out);
        TWEEN.add(twScale);
        twScale.start();

        if (this.isPassthroughActive) {
          const activeCamera = (this.renderer.xr.isPresenting && this.renderer.xr.getCamera)
            ? this.renderer.xr.getCamera()
            : this.camera;
          const forward = new THREE.Vector3();
          activeCamera.getWorldDirection(forward);
          forward.y = 0;
          if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
          forward.normalize();

          const headPos = activeCamera.getWorldPosition(new THREE.Vector3());
          const targetX = headPos.x + forward.x * 0.85;
          const targetZ = headPos.z + forward.z * 0.85;
          const targetY = headPos.y - 0.35;

          const twPos = new TWEEN.Tween(targetPivot.position)
            .to({ x: targetX, y: targetY, z: targetZ }, 600)
            .easing(TWEEN.Easing.Cubic.Out);
          TWEEN.add(twPos);
          twPos.start();
        } else {
          const twPos = new TWEEN.Tween(targetPivot.position)
            .to({ x: 0, y: 0, z: 0 }, 600)
            .easing(TWEEN.Easing.Cubic.Out);
          TWEEN.add(twPos);
          twPos.start();
        }
      }
    }

    // 3. Update HUD button state
    this.updateModeStatus(isMR ? 'MR' : 'VR');
    soundFx.playEnergySurgeSound();
    return this.isPassthroughActive;
  }

  /**
   * Toggles between VR and MR modes (backwards-compatible).
   */
  togglePassthrough(forceState) {
    const nextState = forceState !== undefined ? Boolean(forceState) : !this.isPassthroughActive;
    return this.setMode(nextState ? 'MR' : 'VR');
  }

  /**
   * Updates state & glowing highlight colors for the dedicated mode buttons on the left-wrist dock.
   */
  updateModeStatus(mode) {
    const isMR = (mode === 'MR' || mode === 'TABLETOP' || mode === true);
    this.isPassthroughActive = isMR;

    const btnVR = this.dockButtons?.btnModeVR;
    const txtVR = this.dockTexts?.btnModeVR || btnVR?.userData?.labelMesh;
    const btnMR = this.dockButtons?.btnModeMR;
    const txtMR = this.dockTexts?.btnModeMR || btnMR?.userData?.labelMesh;

    if (btnVR) {
      const active = !isMR;
      btnVR.material.color.setHex(active ? 0x0e7490 : 0x1e293b);
      btnVR.material.emissive.setHex(active ? 0x06b6d4 : 0x0f172a);
      btnVR.material.emissiveIntensity = active ? 0.45 : 0.15;
      if (btnVR.userData.borderMesh) {
        btnVR.userData.borderMesh.material.color.setHex(active ? 0x00f0ff : 0x334155);
        btnVR.userData.borderMesh.material.opacity = active ? 0.85 : 0.4;
      }
    }
    if (txtVR) {
      txtVR.color = !isMR ? 0xffffff : 0x94a3b8;
      txtVR.sync();
    }

    if (btnMR) {
      const active = isMR;
      btnMR.material.color.setHex(active ? 0x047857 : 0x1e293b);
      btnMR.material.emissive.setHex(active ? 0x10b981 : 0x0f172a);
      btnMR.material.emissiveIntensity = active ? 0.45 : 0.15;
      if (btnMR.userData.borderMesh) {
        btnMR.userData.borderMesh.material.color.setHex(active ? 0x10b981 : 0x334155);
        btnMR.userData.borderMesh.material.opacity = active ? 0.85 : 0.4;
      }
    }
    if (txtMR) {
      txtMR.color = isMR ? 0xffffff : 0x94a3b8;
      txtMR.sync();
    }
  }

  /**
   * Backward-compatible helper.
   */
  updatePassthroughStatus(isActive) {
    this.updateModeStatus(isActive ? 'MR' : 'VR');
  }

  /**
   * Snaps and anchors the miniature tabletop portfolio onto the best detected real-world table or desk.
   */
  snapToBestTable() {
    if (!this.renderer.xr.isPresenting) return;
    const referenceSpace = this.renderer.xr.getReferenceSpace();
    const frame = this.lastXRFrame;
    if (!frame || !referenceSpace) return;
    const bestTable = findBestTablePlane(frame, referenceSpace, this.camera);
    if (bestTable) {
      anchorTabletopToPlane(bestTable, frame, referenceSpace);
      window.hasAnchoredToTable = true;
      this.triggerHaptic(null, 0.7, 80);
      soundFx.playEnergySurgeSound();
    }
  }

  /**
   * Toggles visibility of detected physical plane boundary wireframes in mixed reality.
   */
  togglePlaneVisualization() {
    const nextVis = !getPlaneVisualization();
    setPlaneVisualization(nextVis);
    return nextVis;
  }

  /**
   * Synchronizes Active Country Market on the Wrist Dock.
   */
  updateMarketStatus(currentMarket) {
    const isIN = (currentMarket || '').toUpperCase() === 'IN' || (currentMarket || '').toUpperCase() === 'BHARAT';

    this.dockButtons.forEach((btn) => {
      if (btn.userData?.action === 'switchMarket') {
        const m = (btn.userData.market || 'US').toUpperCase();
        const isActive = (m === 'IN' && isIN) || (m === 'US' && !isIN);

        const activeCol = m === 'IN' ? 0x065f46 : 0x0e7490;
        const activeEmiss = m === 'IN' ? 0x10b981 : 0x06b6d4;
        const activeBorder = m === 'IN' ? 0xf59e0b : 0x00f0ff;

        btn.material.color.setHex(isActive ? activeCol : 0x1e293b);
        btn.material.emissive.setHex(isActive ? activeEmiss : 0x0f172a);
        btn.material.emissiveIntensity = isActive ? 0.55 : 0.15;

        if (btn.userData.borderMesh) {
          btn.userData.borderMesh.material.color.setHex(isActive ? activeBorder : 0x334155);
          btn.userData.borderMesh.material.opacity = isActive ? 0.95 : 0.4;
        }
        if (btn.userData.labelMesh) {
          btn.userData.labelMesh.color = isActive ? 0xffffff : 0x94a3b8;
          btn.userData.labelMesh.sync();
        }
      }
    });
  }

  /**
   * Synchronizes Active Chart Display Mode on the Wrist Dock.
   */
  updateChartMode(mode) {
    if (this.dockTexts.btnChartMode) {
      this.dockTexts.btnChartMode.text = mode === 'candlestick' ? '📊 Candles Mode' : '📈 Spline Mode';
      this.dockTexts.btnChartMode.sync();
    }
    if (this.dockButtons.btnChartMode) {
      this.dockButtons.btnChartMode.material.color.setHex(0x0e7490);
      this.dockButtons.btnChartMode.material.emissive.setHex(0x06b6d4);
      this.dockButtons.btnChartMode.material.emissiveIntensity = 0.45;
    }
  }

  /**
   * Highlights the active category filter button on the wrist dock.
   */
  updateActiveCategory(category) {
    this.activeCategory = category || 'all';
    const catLower = (this.activeCategory || '').toLowerCase();

    this.dockButtons.forEach((btn) => {
      if (btn.userData.action === 'filterCategory') {
        const btnCatLower = (btn.userData.category || '').toLowerCase();
        const isActive = btnCatLower === catLower;
        btn.material.color.setHex(isActive ? 0x0f766e : 0x1e293b);
        btn.material.emissive.setHex(isActive ? 0x10b981 : 0x0f172a);
        btn.material.emissiveIntensity = isActive ? 0.55 : 0.15;
        if (btn.userData.borderMesh) {
          btn.userData.borderMesh.material.color.setHex(isActive ? 0x10b981 : 0x00f0ff);
          btn.userData.borderMesh.material.opacity = isActive ? 0.9 : 0.4;
        }
        if (btn.userData.labelMesh) {
          btn.userData.labelMesh.color = isActive ? 0xffffff : 0xf8fafc;
          btn.userData.labelMesh.sync();
        }
      }
    });
  }

  /**
   * Controller Raycast Select Trigger (6-DoF Controller).
   */
  onSelect(event, controller) {
    if (this.isDraggingTabletop) return;
    this.triggerHaptic(controller, 0.45, 50);
    handleControllerSelect(controller);
  }

  onSelectStart(event, controller) {
    if (controller.userData.laser) {
      controller.userData.laser.material.color.setHex(0x8b5cf6);
      controller.userData.laser.material.opacity = 0.95;
    }
    if (this.checkAndStartChartTitleDrag(controller)) return;
  }

  onSelectEnd(event, controller) {
    if (controller.userData.laser) {
      controller.userData.laser.material.color.setHex(0x00f0ff);
      controller.userData.laser.material.opacity = 0.75;
    }
    if (this.isDraggingChartWindow && this.chartDragSource === controller) {
      this.stopDraggingChartWindow();
    }
  }

  onGripStart(event, controller) {
    if (this.checkAndStartChartTitleDrag(controller)) return;

    const targetObj = tabletopPivot || this.solarSystemGroup;
    if (!targetObj) return;

    const handedness = controller.userData?.handedness || (controller === rightController ? 'right' : (controller === leftController ? 'left' : (controller.userData?.side || (controller.userData?.index === 1 ? 'right' : 'left'))));
    const dist = controller.position.distanceTo(targetObj.position);

    let rayNearBase = false;
    if (dist < 4.5) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(controller.quaternion).normalize();
      const toPivot = targetObj.position.clone().sub(controller.position);
      const proj = toPivot.dot(fwd);
      if (proj > 0 && proj < 4.5) {
        const rayDist = toPivot.clone().sub(fwd.clone().multiplyScalar(proj)).length();
        if (rayDist < 0.75) rayNearBase = true;
      }
    }
    const canInteract = dist < 1.5 || rayNearBase || this.isBaseRingHovered;

    if (canInteract) {
      if (handedness === 'right') {
        isDragging = true;
        dragOffset.copy(targetObj.position).sub(controller.position);
        unanchorTabletop();
        if (typeof window !== 'undefined') window.hasAnchoredToTable = true;
        this.isDraggingTabletop = true;

        triggerHaptic(controller, 0.6, 25);

        if (window.baseRingMesh && window.baseRingMesh.material) {
          window.baseRingMesh.material.color.setHex(0x10b981); // Emerald Green for move
          window.baseRingMesh.material.opacity = 0.9;
        }
        soundFx.playEnergySurgeSound();
      } else {
        isRotating = true;
        unanchorTabletop();
        if (typeof window !== 'undefined') window.hasAnchoredToTable = true;
        this.isDraggingTabletop = true;

        initialLeftGripQuat.copy(controller.quaternion);
        initialPivotRotationY = targetObj.rotation.y;

        triggerHaptic(controller, 0.6, 25);

        if (window.baseRingMesh && window.baseRingMesh.material) {
          window.baseRingMesh.material.color.setHex(0xa855f7); // Purple for rotation
          window.baseRingMesh.material.opacity = 0.9;
        }
        soundFx.playEnergySurgeSound();
      }
    }
  }

  onGripEnd(event, controller) {
    if (this.isDraggingChartWindow && this.chartDragSource === controller) {
      this.stopDraggingChartWindow();
      return;
    }

    const handedness = controller.userData?.handedness || (controller === rightController ? 'right' : (controller === leftController ? 'left' : (controller.userData?.side || (controller.userData?.index === 1 ? 'right' : 'left'))));
    if (handedness === 'right') {
      if (isDragging) {
        isDragging = false;
        this.isDraggingTabletop = isRotating;
        if (typeof window !== 'undefined') window.hasAnchoredToTable = true;
        soundFx.playHoverSound();
      }
    } else {
      if (isRotating) {
        isRotating = false;
        this.isDraggingTabletop = isDragging;
        if (typeof window !== 'undefined') window.hasAnchoredToTable = true;
        soundFx.playHoverSound();
      }
    }
    if (!isDragging && !isRotating && window.baseRingMesh && window.baseRingMesh.material) {
      window.baseRingMesh.material.color.setHex(0x06b6d4); // Cyan idle
      window.baseRingMesh.material.opacity = 0.35;
    }
  }

  onSqueeze(event, controller) {
    // Squeeze is the grip completion event in WebXR.
    // Tabletop grab/drag is handled via squeezestart / squeezeend.
    // Do NOT trigger onResetView here, as doing so undoes the grab/drag repositioning.
  }

  /**
   * WebXR Hand-Tracking Pinch Handlers (Index Tip to Thumb Tip Pinch).
   */
  onHandPinchStart(event, hand) {
    hand.userData.isPinching = true;
    soundFx.playHoverSound();

    if (this.checkAndStartChartTitleDrag(hand)) return;

    if (hand.userData.laser) {
      hand.userData.laser.material.color.setHex(0xec4899);
      hand.userData.laser.material.opacity = 1.0;
    }

    if (this.isPassthroughActive) {
      const targetObj = tabletopPivot || this.solarSystemGroup;
      if (!targetObj) return;

      const isRight = hand.userData?.side === 'right' || hand.userData?.index === 1;
      const handPos = new THREE.Vector3();
      const indexTip = hand.joints?.['index-finger-tip'];
      if (indexTip) indexTip.getWorldPosition(handPos);
      else hand.getWorldPosition(handPos);
      const dist = handPos.distanceTo(targetObj.position);

      if (dist < 1.35) {
        if (isRight) {
          isDragging = true;
          dragOffset.copy(targetObj.position).sub(handPos);
          unanchorTabletop();
          if (typeof window !== 'undefined') window.hasAnchoredToTable = true;
          this.isDraggingTabletop = true;

          if (window.baseRingMesh && window.baseRingMesh.material) {
            window.baseRingMesh.material.color.setHex(0x10b981); // Emerald Green for move
            window.baseRingMesh.material.opacity = 0.85;
          }
          soundFx.playEnergySurgeSound();
        } else {
          isRotating = true;
          unanchorTabletop();
          if (typeof window !== 'undefined') window.hasAnchoredToTable = true;
          this.isDraggingTabletop = true;

          const wrist = hand.joints?.['wrist'];
          if (indexTip && wrist) {
            const wristPos = new THREE.Vector3();
            wrist.getWorldPosition(wristPos);
            const handDir = handPos.clone().sub(wristPos);
            initialLeftGripYaw = Math.atan2(handDir.x, handDir.z);
          } else {
            initialLeftGripYaw = 0;
          }
          initialPivotRotationY = targetObj.rotation.y;

          if (window.baseRingMesh && window.baseRingMesh.material) {
            window.baseRingMesh.material.color.setHex(0xa855f7); // Purple for rotation
            window.baseRingMesh.material.opacity = 0.85;
          }
          soundFx.playEnergySurgeSound();
        }
      }
    }
  }

  onHandPinchEnd(event, hand) {
    hand.userData.isPinching = false;

    if (this.isDraggingChartWindow && this.chartDragSource === hand) {
      this.stopDraggingChartWindow();
    }

    if (hand.userData.laser) {
      hand.userData.laser.material.color.setHex(0x38bdf8);
      hand.userData.laser.material.opacity = 0.75;
    }

    const isRight = hand.userData?.side === 'right' || hand.userData?.index === 1;
    if (isRight) {
      if (isDragging) {
        isDragging = false;
        this.isDraggingTabletop = isRotating;
        if (typeof window !== 'undefined') window.hasAnchoredToTable = true;
        if (!isRotating && window.baseRingMesh && window.baseRingMesh.material) {
          window.baseRingMesh.material.color.setHex(0x06b6d4); // Cyan idle
          window.baseRingMesh.material.opacity = 0.35;
        }
        soundFx.playHoverSound();
      }
    } else {
      if (isRotating) {
        isRotating = false;
        this.isDraggingTabletop = isDragging;
        if (typeof window !== 'undefined') window.hasAnchoredToTable = true;
        if (!isDragging && window.baseRingMesh && window.baseRingMesh.material) {
          window.baseRingMesh.material.color.setHex(0x06b6d4); // Cyan idle
          window.baseRingMesh.material.opacity = 0.35;
        }
        soundFx.playHoverSound();
      }
    }

    // Perform pinch selection along index pointing direction
    handleControllerSelect(hand);
  }

  /**
   * Casts a ray from the hand's index fingertip pointing direction.
   */
  castRayFromHand(hand, callback) {
    const indexTip = hand.joints?.['index-finger-tip'];
    const indexPhalanx = hand.joints?.['index-finger-phalanx-proximal'] || hand.joints?.['index-finger-metacarpal'];

    if (indexTip) {
      indexTip.getWorldPosition(this.tempVecA);

      if (indexPhalanx) {
        indexPhalanx.getWorldPosition(this.tempVecB);
        this.tempVecC.subVectors(this.tempVecA, this.tempVecB).normalize();
      } else {
        hand.getWorldDirection(this.tempVecC).negate();
      }

      this.raycaster.ray.origin.copy(this.tempVecA);
      this.raycaster.ray.direction.copy(this.tempVecC);
      callback(this.raycaster);
    } else {
      // Fallback to hand center position
      hand.getWorldPosition(this.tempVecA);
      hand.getWorldDirection(this.tempVecC).negate();
      this.raycaster.ray.origin.copy(this.tempVecA);
      this.raycaster.ray.direction.copy(this.tempVecC);
      callback(this.raycaster);
    }
  }

  /**
   * Executes button depression animation and fires corresponding callback.
   */
  animateButtonPress(buttonMesh) {
    if (!buttonMesh) return;
    soundFx.playSelectSound();
    this.triggerClickHaptic();

    // Tactile 3D depression animation (depress 2mm into glass plate)
    const originalZ = buttonMesh.userData.originalZ ?? 0.003;
    const targetZ = originalZ - 0.002;

    const twDown = new TWEEN.Tween(buttonMesh.position)
      .to({ z: targetZ }, 70)
      .easing(TWEEN.Easing.Cubic.Out)
      .onComplete(() => {
        const twUp = new TWEEN.Tween(buttonMesh.position)
          .to({ z: originalZ }, 140)
          .easing(TWEEN.Easing.Bounce.Out);
        TWEEN.add(twUp);
        twUp.start();
      });
    TWEEN.add(twDown);
    twDown.start();

    // Trigger Action
    const action = buttonMesh.userData.action;
    if (action === 'exitVR') {
      this.exitVR();
    } else if (action === 'resetView' && this.callbacks.onResetView) {
      this.callbacks.onResetView();
    } else if (action === 'toggleOrbit' && this.callbacks.onToggleOrbit) {
      this.callbacks.onToggleOrbit();
    } else if (action === 'toggleFlow' && this.callbacks.onToggleFlowMode) {
      this.callbacks.onToggleFlowMode();
    } else if (action === 'toggleAudio' && this.callbacks.onToggleAudio) {
      this.callbacks.onToggleAudio();
    } else if (action === 'setModeVR') {
      this.setMode('VR');
    } else if (action === 'setModeMR') {
      this.setMode('MR');
    } else if (action === 'snapToTable') {
      this.snapToBestTable();
    } else if (action === 'togglePlanes') {
      const vis = getPlaneVisualization();
      setPlaneVisualization(!vis);
      this.triggerClickHaptic();
    } else if (action === 'togglePassthrough') {
      this.togglePassthrough();
    } else if (action === 'toggleChartMode' && this.callbacks.onToggleChartMode) {
      this.callbacks.onToggleChartMode();
    } else if (action === 'toggleChart' && this.callbacks.onToggleChart) {
      this.callbacks.onToggleChart();
    } else if (action === 'toggleManageData' && this.callbacks.onToggleManageData) {
      this.callbacks.onToggleManageData();
    } else if (action === 'closeDataPanel') {
      this.toggleSpatialDataPanel(false);
    } else if (action === 'toggleQuickTickers') {
      this.toggleQuickTickersSlate();
    } else if (action === 'closeQuickTickersSlate') {
      this.toggleQuickTickersSlate(false);
    } else if (action === 'toggleSearchPanel') {
      this.toggleSearchPanel();
    } else if (action === 'closeSearchPanel') {
      this.toggleSearchPanel(false);
    } else if (action === 'keyPress') {
      const char = buttonMesh.userData.char;
      if (char !== undefined) {
        if (this.searchQuery.length < 24) {
          this.searchQuery += char;
          this.cursorVisible = true;
          this.updateSearchQueryDisplay();
          this.updateSearchSuggestions();
        }
      }
    } else if (action === 'keyBackspace') {
      if (this.searchQuery.length > 0) {
        this.searchQuery = this.searchQuery.slice(0, -1);
        this.cursorVisible = true;
        this.updateSearchQueryDisplay();
        this.updateSearchSuggestions();
      }
    } else if (action === 'keyClear') {
      this.searchQuery = '';
      this.cursorVisible = true;
      this.updateSearchQueryDisplay();
      this.updateSearchSuggestions();
    } else if (action === 'keySubmit') {
      const topMatch = this.getFilteredSuggestions()[0];
      const targetSym = topMatch ? topMatch.symbol : (this.searchQuery.trim().toUpperCase() || 'NVDA');
      const stockData = topMatch || STOCK_CATALOG.find((s) => s.symbol === targetSym) || { symbol: targetSym, name: targetSym, price: 100, currency: 'USD' };
      this.toggleSearchPanel(false);
      if (this.callbacks.onSelectStock) {
        this.callbacks.onSelectStock(targetSym, stockData);
      } else if (this.callbacks.onSelectQuickTicker) {
        this.callbacks.onSelectQuickTicker(targetSym, stockData);
      }
    } else if (action === 'selectSearchSuggestion') {
      const sym = buttonMesh.userData.symbol;
      const stockData = buttonMesh.userData.stockData || STOCK_CATALOG.find((s) => s.symbol === sym);
      this.toggleSearchPanel(false);
      if (sym) {
        if (this.callbacks.onSelectStock) {
          this.callbacks.onSelectStock(sym, stockData);
        } else if (this.callbacks.onSelectQuickTicker) {
          this.callbacks.onSelectQuickTicker(sym, stockData);
        }
      }
    } else if (action === 'selectQuickTicker') {
      const sym = buttonMesh.userData.symbol;
      const stockData = STOCK_CATALOG.find((s) => s.symbol === sym);
      this.toggleQuickTickersSlate(false);
      if (sym) {
        if (this.callbacks.onSelectStock) {
          this.callbacks.onSelectStock(sym, stockData);
        } else if (this.callbacks.onSelectQuickTicker) {
          this.callbacks.onSelectQuickTicker(sym, stockData);
        }
      }
    } else if (action === 'adjustAsset') {
      const { assetId, delta } = buttonMesh.userData;
      if (this.callbacks.onAdjustAsset) {
        this.callbacks.onAdjustAsset(assetId, delta);
      } else {
        adjustAssetAllocation(assetId, delta);
      }
    } else if (action === 'closeChart' && this.callbacks.onCloseChart) {
      this.callbacks.onCloseChart();
    } else if (action === 'setResolution') {
      const presetId = buttonMesh.userData.presetId;
      this.triggerClickHaptic();
      if (presetId) {
        setChartResolutionPreset(presetId, this.scene);
      }
    } else if (action === 'switchMarket') {
      const marketKey = buttonMesh.userData.market || 'US';
      this.triggerClickHaptic();
      if (this.callbacks.onSwitchMarket) {
        this.callbacks.onSwitchMarket(marketKey);
      }
      this.updateMarketStatus(marketKey);
    } else if (action === 'filterCategory' && this.callbacks.onFilterCategory) {
      this.triggerClickHaptic();
      this.callbacks.onFilterCategory(buttonMesh.userData.category);
    }
  }

  /**
   * Processes intersections for raycaster against interactive objects, wrist dock buttons and spatial data panel.
   */
  processRayIntersections(raycaster, source) {
    // 0. Priority 1: Raycast closeHitboxRegistry First
    const closeHitboxes = (typeof window !== 'undefined' && Array.isArray(window.activeCloseHitboxes)) ? window.activeCloseHitboxes : [];
    const closeButtons = (typeof window !== 'undefined' && Array.isArray(window.activeCloseButtons)) ? window.activeCloseButtons : [];
    const allCloseTargets = [...closeHitboxRegistry, ...closeHitboxes, ...closeButtons].filter((b) => b && b.parent);

    if (allCloseTargets.length > 0) {
      const closeHits = raycaster.intersectObjects(allCloseTargets, true);
      if (closeHits.length > 0) {
        const hitObj = closeHits[0].object;
        const parentWin = hitObj.userData?.parentChart || hitObj.userData?.parentWindow || hitObj.parent;
        if (parentWin) {
          console.log('[WebXR] Priority 1 Close Hitbox Hit in processRayIntersections!', parentWin?.userData?.ticker);
          closeChartWindow(parentWin, this.scene);
          return;
        }
      }
    }

    // Direct Wolf of Wall Street Gold Dollar Badge Hitbox Check
    const allEggTargets = (typeof window !== 'undefined' && Array.isArray(window.activeEggHitboxes) ? window.activeEggHitboxes : []).filter((b) => b && b.parent);
    if (allEggTargets.length > 0) {
      const eggHits = raycaster.intersectObjects(allEggTargets, true);
      if (eggHits.length > 0) {
        const hitObj = eggHits[0].object;
        const parentWin = hitObj.userData?.parentChart || hitObj.userData?.parentWindow || hitObj.parent;
        if (parentWin) {
          this.animateButtonPress(hitObj);
          triggerWolfEasterEgg(parentWin, controller);
          return;
        }
      }
    }

    // 1. Priority 2: Check Interactive Timeframe & Mode Buttons on Active Charts
    const chartInteractives = [];
    activeChartWindows.forEach((win) => {
      win.traverse((c) => {
        if (c.userData?.isResolutionPreset || c.userData?.isChartModeToggle || c.userData?.isTimeframePill || c.userData?.isTitleBar || c.userData?.isWolfEgg || c.userData?.isWolfEasterEgg || (c.userData?.onClick && !c.userData?.isCloseButton && !c.userData?.isCloseHitbox)) {
          chartInteractives.push(c);
        }
      });
    });

    if (chartInteractives.length > 0) {
      const chartBtnHits = raycaster.intersectObjects(chartInteractives, true);
      if (chartBtnHits.length > 0) {
        const hit = chartBtnHits[0].object;
        if (hit.userData?.isResolutionPreset || hit.userData?.action === 'setResolution') {
          this.animateButtonPress(hit);
          const presetId = hit.userData.presetId;
          const parentWin = hit.userData.parentWindow;
          if (presetId) setChartResolutionPreset(presetId, this.scene, parentWin);
          return;
        }
        if (hit.userData?.isChartModeToggle) {
          const parentWin = hit.userData.parentWindow;
          if (hit.userData.targetMode) setChartDisplayMode(hit.userData.targetMode, parentWin);
          return;
        }
        if (hit.userData?.isWolfEgg || hit.userData?.isWolfEasterEgg) {
          this.animateButtonPress(hit);
          const parentWin = hit.userData.parentChart || hit.userData.parentWindow || hit.parent;
          triggerWolfEasterEgg(parentWin, controller);
          return;
        }
        if (hit.userData?.isTitleBar) {
          const parentWin = hit.userData.parentWindow || hit.parent;
          if (parentWin) handleTitleBarClick(parentWin);
          return;
        }
        if (typeof hit.userData?.onClick === 'function') {
          this.animateButtonPress(hit);
          hit.userData.onClick();
          return;
        }
      }
    }

    // 2. Priority 3: ALWAYS Raycast solarSystemGroup.children for Planets
    const solarGroup = this.solarSystemGroup || (typeof window !== 'undefined' && window.solarSystemGroup) || this.scene.getObjectByName('SolarSystemGroup');
    if (solarGroup) {
      const planetHits = raycaster.intersectObjects(solarGroup.children, true);
      if (planetHits.length > 0) {
        for (const ph of planetHits) {
          let node = ph.object;
          while (node && !node.userData?.isAssetNode && !node.userData?.ticker && !node.userData?.symbol && node !== solarGroup && node.parent) {
            node = node.parent;
          }
          if (node && (node.userData?.isAssetNode || node.userData?.ticker || node.userData?.symbol)) {
            const ticker = node.userData.ticker || node.userData.symbol;
            if (ticker) {
              console.log(`[WebXR] Priority 3 Ray selected planet in processRayIntersections: ${ticker}`);
              const assetData = node.userData.assetData || {
                name: node.userData.name || ticker,
                price: node.userData.price || '$1,200',
                change: node.userData.change || '+2.5%',
                returns: node.userData.returns || 0,
                color: node.userData.color || '#00f0ff',
                currency: node.userData.currency || 'USD',
                category: node.userData.category || 'Core Equity'
              };
              const activeCam = (this.renderer?.xr?.isPresenting && this.renderer?.xr?.getCamera)
                ? this.renderer.xr.getCamera()
                : this.camera;
              openOrFocusChart(ticker, assetData, activeCam, this.scene);
              if (this.callbacks?.onSelectNode) {
                this.callbacks.onSelectNode(assetData, node);
              }
              return;
            }
          }
        }
      }
    }

    // 3. Priority 4: Check Other VR UI Elements (Wrist Dock, Spatial Data Panel, Quick Tickers, Search Panel)
    const otherInteractives = [
      ...interactiveObjects,
      ...(this.callbacks.getInteractiveObjects ? this.callbacks.getInteractiveObjects() : [])
    ];
    if (this.spatialDock?.visible) this.dockButtons.forEach((btn) => otherInteractives.push(btn));
    if (this.spatialDataPanel?.visible) this.dataPanelButtons.forEach((btn) => otherInteractives.push(btn));
    if (this.quickTickersSlate?.visible) this.quickTickerButtons.forEach((btn) => otherInteractives.push(btn));
    if (this.searchPanel?.visible) this.searchPanelButtons.forEach((btn) => otherInteractives.push(btn));

    const intersects = raycaster.intersectObjects(otherInteractives, true);
    if (intersects.length > 0) {
      let hit = intersects[0].object;
      while (hit && !hit.userData?.onClick && !hit.userData?.isVRButton && hit.parent && hit !== this.scene) {
        hit = hit.parent;
      }
      if (!hit) hit = intersects[0].object;

      if (hit.userData?.onClick) {
        this.animateButtonPress(hit);
        hit.userData.onClick();
        return;
      }
      if (hit.userData?.isVRButton) {
        this.animateButtonPress(hit);
        return;
      }
    }
  }

  triggerHaptic(source, intensity = 0.4, duration = 80) {
    const session = this.renderer.xr.getSession();
    if (!session?.inputSources) return;

    const targetHandedness = source?.userData?.side || (source?.userData?.index === 0 ? 'left' : source?.userData?.index === 1 ? 'right' : null);

    let triggered = false;
    for (const inputSource of session.inputSources) {
      if (targetHandedness && inputSource.handedness && inputSource.handedness !== targetHandedness) {
        continue;
      }
      if (inputSource.gamepad?.hapticActuators?.length > 0) {
        try {
          inputSource.gamepad.hapticActuators[0].pulse(intensity, duration);
          triggered = true;
        } catch (e) {}
      }
    }

    if (!triggered) {
      for (const inputSource of session.inputSources) {
        if (inputSource.gamepad?.hapticActuators?.length > 0) {
          try {
            inputSource.gamepad.hapticActuators[0].pulse(intensity, duration);
          } catch (e) {}
        }
      }
    }
  }

  /**
   * Triggers a light tick pulse (pulse(0.2, 10)) whenever the candlestick scrubber snaps to a new candle.
   * @param {Object} source Optional controller or hand input source
   */
  triggerScrubberTickHaptic(source = null) {
    this.triggerHaptic(source, 0.2, 10);
  }

  /**
   * Triggers a crisp tactile click (pulse(0.6, 25)) when clicking timeframe pill buttons, search suggestions or chips.
   * @param {Object} source Optional controller or hand input source
   */
  triggerClickHaptic(source = null) {
    this.triggerHaptic(source, 0.6, 25);
  }

  /**
   * Updates Left-Wrist orientation, hand pinch/poke detection, raycasting & hover states.
   * Handles Meta Quest WebXR Plane Detection, Mesh Detection, and Surface Anchoring.
   * @param {Array} interactiveObjectsArg
   * @param {number} delta
   * @param {XRFrame} [frame]
   */
  update(interactiveObjectsArg = [], delta = 0.016, frame = null) {
    if (!this.renderer.xr.isPresenting) return;

    this.lastXRFrame = frame;
    const referenceSpace = this.renderer.xr.getReferenceSpace();

    // 0. WebXR Plane Detection, Room Mesh Reconstruction & Real-World Surface Anchoring
    if (this.isPassthroughActive && frame && referenceSpace) {
      if (frame.detectedPlanes) {
        updateDetectedPlanes(frame.detectedPlanes, frame, referenceSpace);

        // Auto-anchor to physical table/desk if not yet anchored and not currently dragging
        if (!window.hasAnchoredToTable && !getTabletopAnchorState().isAnchored && !this.isDraggingTabletop) {
          const bestTable = findBestTablePlane(frame, referenceSpace, this.camera);
          if (bestTable) {
            const anchored = anchorTabletopToPlane(bestTable, frame, referenceSpace);
            if (anchored) {
              window.hasAnchoredToTable = true;
            }
          }
        }
      }

      // Room mesh reconstruction visualizer completely disabled - no room wireframes
      updateAnchoredTabletop(frame, referenceSpace);
    }

    // Update Search Panel blinking cursor timer
    if (this.searchPanel?.visible) {
      this.cursorTimer = (this.cursorTimer || 0) + (delta || 0.016);
      if (this.cursorTimer >= 0.53) {
        this.cursorTimer = 0;
        this.cursorVisible = !this.cursorVisible;
        this.updateSearchQueryDisplay();
      }
    }

    const allInteractive = [
      ...interactiveObjects,
      ...interactiveObjectsArg
    ];
    if (this.spatialDock?.visible) {
      this.dockButtons.forEach((b) => allInteractive.push(b));
    }
    if (this.spatialDataPanel?.visible) {
      this.dataPanelButtons.forEach((b) => allInteractive.push(b));
    }
    if (this.quickTickersSlate?.visible) {
      this.quickTickerButtons.forEach((b) => allInteractive.push(b));
    }
    if (this.searchPanel?.visible) {
      this.searchPanelButtons.forEach((b) => allInteractive.push(b));
    }
    if (this.isPassthroughActive) {
      if (baseRingMesh) allInteractive.push(baseRingMesh);
      if (typeof window !== 'undefined' && window.tabletopBaseDisc) {
        allInteractive.push(window.tabletopBaseDisc);
      }
    }
    activeChartWindows.forEach((win) => {
      if (win.userData?.eggHitbox) allInteractive.push(win.userData.eggHitbox);
      if (win.userData?.btnWolf) allInteractive.push(win.userData.btnWolf);
      if (win.userData?.btnSpline) allInteractive.push(win.userData.btnSpline);
      if (win.userData?.btnCandles) allInteractive.push(win.userData.btnCandles);
      if (win.userData?.timeframePills) {
        win.userData.timeframePills.forEach((p) => {
          if (p.mesh) allInteractive.push(p.mesh);
        });
      }
    });

    let anyHoveredPlanet = null;
    let anyHoveredButton = null;
    let isBaseRingRayHovered = false;
    let hoveredChartHitPoint = null;
    let hoveredChartSource = null;
    let hoveredChartWindow = null;

    // 1. Real-time Title-Bar Spatial Dragging for Chart Windows
    if (this.isDraggingChartWindow && this.draggedChartWindow && this.chartDragSource) {
      const source = this.chartDragSource;
      const win = this.draggedChartWindow;

      const sourcePos = new THREE.Vector3();
      source.getWorldPosition(sourcePos);
      const sourceQuat = new THREE.Quaternion();
      source.getWorldQuaternion(sourceQuat);
      const sourceDir = new THREE.Vector3(0, 0, -1).applyQuaternion(sourceQuat).normalize();

      const targetPos = sourcePos.clone().add(sourceDir.clone().multiplyScalar(this.chartDragDistance));
      win.position.copy(targetPos);

      // Keep upright and face the viewer
      const headPos = new THREE.Vector3();
      if (this.camera) {
        this.camera.getWorldPosition(headPos);
      } else if (this.renderer?.xr?.getCamera) {
        this.renderer.xr.getCamera().getWorldPosition(headPos);
      }
      const toHead = headPos.clone().sub(win.position);
      toHead.y = 0;
      if (toHead.lengthSq() > 0.001) {
        win.rotation.set(0, Math.atan2(toHead.x, toHead.z), 0);
      }
      win.updateMatrixWorld(true);
    }

    // 1b. Check Left Hand Wrist / Controller Attachment
    const leftHand = this.hands[0];
    const leftCtrl = this.controllers[0];

    if (leftHand && leftHand.joints?.['wrist']) {
      if (this.spatialDock.parent !== leftHand) {
        leftHand.add(this.spatialDock);
      }
    } else if (leftCtrl) {
      if (this.spatialDock.parent !== leftCtrl) {
        leftCtrl.add(this.spatialDock);
      }
    }

    // Ensure the HUD is always visible whenever XR is presenting
    if (this.spatialDock) {
      this.spatialDock.visible = this.renderer.xr.isPresenting;
    }

    // 1c. Real-time Interactive Tabletop Manipulation (Pinch Scale, Fast Ray Drag, Yaw Rotate)
    updateTabletopManipulation(this.controllers[0], this.controllers[1]);

    // Hand tracking manipulation fallback
    if (this.hands && this.hands.length >= 2 && tabletopPivot) {
      const rightHand = this.hands[1];
      const leftHand = this.hands[0];
      if (isDragging && rightHand?.userData?.isPinching) {
        const handPos = new THREE.Vector3();
        const indexTip = rightHand.joints?.['index-finger-tip'];
        if (indexTip) indexTip.getWorldPosition(handPos);
        else rightHand.getWorldPosition(handPos);
        tabletopPivot.position.copy(handPos).add(dragOffset);
      }
      if (isRotating && leftHand?.userData?.isPinching) {
        const indexTip = leftHand.joints?.['index-finger-tip'];
        const wrist = leftHand.joints?.['wrist'];
        if (indexTip && wrist) {
          const indexPos = new THREE.Vector3();
          const wristPos = new THREE.Vector3();
          indexTip.getWorldPosition(indexPos);
          wrist.getWorldPosition(wristPos);
          const handDir = indexPos.sub(wristPos);
          const currentYaw = Math.atan2(handDir.x, handDir.z);
          let deltaYaw = currentYaw - initialLeftGripYaw;
          while (deltaYaw > Math.PI) deltaYaw -= Math.PI * 2;
          while (deltaYaw < -Math.PI) deltaYaw += Math.PI * 2;
          tabletopPivot.rotation.y = initialPivotRotationY + deltaYaw;
        }
      }
    }

    if (this.callbacks.onTabletopMoved && (leftSqueezed || rightSqueezed || isDragging || isRotating)) {
      const targetObj = tabletopPivot || this.solarSystemGroup;
      if (targetObj) {
        this.callbacks.onTabletopMoved(targetObj.position, targetObj.rotation);
      }
    }

    // 2. Proximity Poke Detection (Right Index Tip to Buttons)
    const rightHand = this.hands[1];
    if (rightHand && rightHand.joints?.['index-finger-tip']) {
      const rightIndexTip = rightHand.joints['index-finger-tip'];
      rightIndexTip.getWorldPosition(this.tempVecA);

      let closestBtn = null;
      let minDistance = 0.038; // 3.8 cm touch trigger distance

      const pokeCandidates = allInteractive.filter((btn) => btn && (btn.userData?.isVRButton || btn.userData?.onClick || btn.userData?.isCloseButton || btn.userData?.isResolutionPreset || btn.userData?.isChartModeToggle || btn.userData?.isWolfEgg));

      pokeCandidates.forEach((btn) => {
        btn.getWorldPosition(this.tempVecB);
        const dist = this.tempVecA.distanceTo(this.tempVecB);
        if (dist < minDistance) {
          closestBtn = btn;
          minDistance = dist;
        }
      });

      if (closestBtn && this.pokedVRButton !== closestBtn) {
        this.pokedVRButton = closestBtn;
        this.animateButtonPress(closestBtn);
        if (closestBtn.userData?.onClick) closestBtn.userData.onClick();
      } else if (!closestBtn) {
        this.pokedVRButton = null;
      }
    }

    // 3. Hand Pinch Real-Time Distance Fallback (Left & Right Hands)
    this.hands.forEach((hand, idx) => {
      if (!hand.visible) return;

      const indexTip = hand.joints?.['index-finger-tip'];
      const thumbTip = hand.joints?.['thumb-tip'];

      if (indexTip && thumbTip) {
        indexTip.getWorldPosition(this.tempVecA);
        thumbTip.getWorldPosition(this.tempVecB);
        const pinchDist = this.tempVecA.distanceTo(this.tempVecB);
        const isPinching = pinchDist < 0.024; // Pinch threshold: 2.4cm

        if (isPinching && !this.lastPinchState[idx]) {
          this.onHandPinchStart({}, hand);
        } else if (!isPinching && this.lastPinchState[idx]) {
          this.onHandPinchEnd({}, hand);
        }
        this.lastPinchState[idx] = isPinching;
      }

      // Update Hand Ray Pointer & Reticle (Right hand pointer)
      if (hand.userData.side === 'right' || idx === 1) {
        this.castRayFromHand(hand, (ray) => {
          // Check candle colliders across active chart windows
          const allCandleColliders = [];
          activeChartWindows.forEach((win) => {
            if (win.userData?.candleColliders && win.userData.candleGroup?.visible !== false) {
              allCandleColliders.push(...win.userData.candleColliders);
            }
          });
          if (allCandleColliders.length > 0) {
            const candleHits = ray.intersectObjects(allCandleColliders, false);
            if (candleHits.length > 0) {
              const hitCandle = candleHits[0].object;
              if (hitCandle.userData?.isCandle) {
                updateCandleHover(hitCandle);
                hoveredChartHitPoint = candleHits[0].point;
                hoveredChartSource = hand;
                hoveredChartWindow = hitCandle.userData.parentChart || hitCandle.userData.parentWindow;
              }
            }
          }

          const hits = ray.intersectObjects(allInteractive, true);
          const reticle = hand.userData.reticle;
          const laser = hand.userData.laser;

          if (hits.length > 0) {
            const hit = hits[0];
            if (reticle) {
              const activeCam = (this.renderer?.xr?.isPresenting && this.renderer?.xr?.getCamera)
                ? this.renderer.xr.getCamera()
                : this.camera;
              reticle.position.copy(hit.point);
              reticle.quaternion.copy(activeCam.quaternion);
              reticle.visible = true;
            }
            if (laser) {
              laser.visible = true;
              laser.position.copy(ray.ray.origin);
              laser.lookAt(hit.point);
              laser.scale.z = Math.max(0.01, hit.distance / 5);
            }

            // Check if hovering over any active 3D candlestick chart board
            let hWinHand = null;
            for (const win of activeChartWindows) {
              let p = hit.object;
              while (p && p !== this.scene) {
                if (p === win || p.userData?.parentWindow === win || p.userData?.isChartWindow) {
                  hWinHand = win;
                  break;
                }
                p = p.parent;
              }
              if (hWinHand) break;
            }
            if (hWinHand) {
              hoveredChartHitPoint = hit.point;
              hoveredChartSource = hand;
              hoveredChartWindow = hWinHand;
            }

            // Check if hovering base ring or draggable base
            if (
              hit.object === baseRingMesh ||
              (typeof window !== 'undefined' && hit.object === window.tabletopBaseDisc) ||
              hit.object?.userData?.isDraggableBase ||
              hit.object?.userData?.isTabletopAnchor ||
              hit.object?.parent === baseRingMesh ||
              hit.object?.parent?.userData?.isDraggableBase
            ) {
              isBaseRingRayHovered = true;
            }

            // Check target
            let targetObj = hit.object;
            while (targetObj && !targetObj.userData?.onClick && !targetObj.userData?.isVRButton && !targetObj.userData?.isResolutionPreset && !targetObj.userData?.isAssetNode && targetObj.parent && targetObj !== this.scene) {
              targetObj = targetObj.parent;
            }
            if (targetObj?.userData?.onClick || targetObj?.userData?.isVRButton || targetObj?.userData?.isResolutionPreset) {
              anyHoveredButton = targetObj;
            } else if (targetObj?.userData?.isAssetNode) {
              anyHoveredPlanet = targetObj;
            }
          } else {
            if (reticle) reticle.visible = false;
            if (laser) laser.visible = false;
          }
        });
      }
    });

    // 4. Update 6-DoF Controllers Raycasting
    for (const controller of this.controllers) {
      if (!controller.visible) continue;

      this.tempMatrix.identity().extractRotation(controller.matrixWorld);
      this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

      // Check candle colliders across active chart windows
      const allCandleColliders = [];
      activeChartWindows.forEach((win) => {
        if (win.userData?.candleColliders && win.userData.candleGroup?.visible !== false) {
          allCandleColliders.push(...win.userData.candleColliders);
        }
      });
      if (allCandleColliders.length > 0) {
        const candleHits = this.raycaster.intersectObjects(allCandleColliders, false);
        if (candleHits.length > 0) {
          const hitCandle = candleHits[0].object;
          if (hitCandle.userData?.isCandle) {
            updateCandleHover(hitCandle);
            this.triggerScrubberTickHaptic(controller);
            hoveredChartHitPoint = candleHits[0].point;
            hoveredChartSource = controller;
            hoveredChartWindow = hitCandle.userData.parentChart || hitCandle.userData.parentWindow;
          }
        }
      }

      const intersects = this.raycaster.intersectObjects(allInteractive, true);
      const reticle = controller.userData.reticle;

      if (intersects.length > 0) {
        const hit = intersects[0];
        if (reticle) {
          const activeCam = (this.renderer?.xr?.isPresenting && this.renderer?.xr?.getCamera)
            ? this.renderer.xr.getCamera()
            : this.camera;
          reticle.position.copy(hit.point);
          reticle.quaternion.copy(activeCam.quaternion);
          reticle.visible = true;
        }
        const laser = controller.userData.laser;
        if (laser) {
          laser.scale.z = Math.max(0.01, hit.distance / 5);
        }

        // Check if hovering over any active 3D candlestick chart board
        let hWinCtrl = null;
        for (const win of activeChartWindows) {
          let p = hit.object;
          while (p && p !== this.scene) {
            if (p === win || p.userData?.parentWindow === win || p.userData?.isChartWindow) {
              hWinCtrl = win;
              break;
            }
            p = p.parent;
          }
          if (hWinCtrl) break;
        }
        if (hWinCtrl) {
          hoveredChartHitPoint = hit.point;
          hoveredChartSource = controller;
          hoveredChartWindow = hWinCtrl;
        }

        // Hover highlight on chart close button
        if (hit.object.userData?.isCloseButton) {
          if (hit.object.material && hit.object.material.color) hit.object.material.color.setHex(0xdc2626);
        }

        // Hover highlight on chart title bar
        if (hit.object.userData?.isTitleBar && !this.isDraggingChartWindow) {
          if (hit.object.material) hit.object.material.color.setHex(0x334155);
        }

        // Check if hovering base ring or draggable base
        if (
          hit.object === baseRingMesh ||
          (typeof window !== 'undefined' && hit.object === window.tabletopBaseDisc) ||
          hit.object?.userData?.isDraggableBase ||
          hit.object?.userData?.isTabletopAnchor ||
          hit.object?.parent === baseRingMesh ||
          hit.object?.parent?.userData?.isDraggableBase
        ) {
          isBaseRingRayHovered = true;
        }

        let targetObj = hit.object;
        while (targetObj && !targetObj.userData?.onClick && !targetObj.userData?.isVRButton && !targetObj.userData?.isResolutionPreset && !targetObj.userData?.isAssetNode && targetObj.parent && targetObj !== this.scene) {
          targetObj = targetObj.parent;
        }

        if (targetObj?.userData?.onClick || targetObj?.userData?.isVRButton || targetObj?.userData?.isResolutionPreset) {
          anyHoveredButton = targetObj;
        } else if (targetObj?.userData?.isAssetNode) {
          anyHoveredPlanet = targetObj;
        }
      } else {
        if (reticle) reticle.visible = false;
        const laser = controller.userData.laser;
        if (laser) {
          laser.scale.z = 1.0;
        }
      }
    }

    // 4b. Update 3D Interactive Candlestick Scrubber Plane & Haptic Pulses
    const activeChartMode = getChartDisplayMode(hoveredChartWindow);
    const isCandleDisplay = activeChartMode === 'candles' || activeChartMode === 'candlestick';
    if (hoveredChartWindow && hoveredChartHitPoint && isCandleDisplay) {
      updateCandleScrubber(hoveredChartHitPoint, hoveredChartWindow, (candleIdx, candleData) => {
        this.triggerScrubberTickHaptic(hoveredChartSource);
        soundFx.playHoverSound();
      });
      activeChartWindows.forEach((win) => {
        if (win !== hoveredChartWindow) clearCandleScrubber(win);
      });
    } else {
      clearCandleHover();
      activeChartWindows.forEach((win) => clearCandleScrubber(win));
    }

    // 4c. Update Tabletop Base Ring Hover Visuals & Sounds
    if (this.isPassthroughActive && !this.isDraggingTabletop) {
      if (isBaseRingRayHovered !== this.isBaseRingHovered) {
        this.isBaseRingHovered = isBaseRingRayHovered;
        setBaseRingState(isBaseRingRayHovered ? 'hover' : 'idle');
        if (isBaseRingRayHovered) {
          soundFx.playHoverSound();
        }
      }
    }

    // 5. Update Button Hover Highlights (0.2 -> 0.8 emissive neon cyan feedback)
    if (this.hoveredVRButton !== anyHoveredButton) {
      if (this.hoveredVRButton) {
        const ud = this.hoveredVRButton.userData;
        const base = ud.baseColor || 0x1e293b;
        const baseEmissive = ud.baseEmissiveIntensity ?? 0.20;
        if (this.hoveredVRButton.material) {
          if (this.hoveredVRButton.material.color) this.hoveredVRButton.material.color.setHex(base);
          if (this.hoveredVRButton.material.emissive) {
            const emissiveCol = ud.emissiveColor || base;
            this.hoveredVRButton.material.emissive.setHex(emissiveCol);
            this.hoveredVRButton.material.emissiveIntensity = baseEmissive;
          }
        }
        if (ud.borderMesh?.material) {
          ud.borderMesh.material.color.setHex(ud.borderColor || 0x334155);
          ud.borderMesh.material.opacity = 0.85;
        }
      }
      if (anyHoveredButton) {
        const ud = anyHoveredButton.userData;
        const hover = ud.hoverColor || 0x06b6d4;
        const hoverEmissive = ud.hoverEmissiveIntensity ?? 0.80;
        if (anyHoveredButton.material) {
          if (anyHoveredButton.material.color) anyHoveredButton.material.color.setHex(hover);
          if (anyHoveredButton.material.emissive) {
            anyHoveredButton.material.emissive.setHex(0x06b6d4);
            anyHoveredButton.material.emissiveIntensity = hoverEmissive;
          }
        }
        if (ud.borderMesh?.material) {
          ud.borderMesh.material.color.setHex(0x00f0ff);
          ud.borderMesh.material.opacity = 1.0;
        }
        soundFx.playHoverSound();
      }
      this.hoveredVRButton = anyHoveredButton;
    }

    // 6. Update Planet Hover Highlights
    if (this.hoveredObject !== anyHoveredPlanet) {
      if (this.hoveredObject) setNodeHoverState(this.hoveredObject, false);
      if (anyHoveredPlanet) setNodeHoverState(anyHoveredPlanet, true);
      this.hoveredObject = anyHoveredPlanet;
    }
  }
}

