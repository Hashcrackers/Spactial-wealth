/**
 * Spatial Wealth - Dynamic Multi-Galaxy Celestial Themes Engine
 * Provides stateful, smoothly tweened cosmic environments across:
 * - 'US_WALLSTREET' (Default US: Deep space midnight blue, electric blue sun, calm cosmic starfield, neon cyan technical grid rings)
 * - 'IN_BHARAT' (NSE/BSE India: Warm saffron gold & Vedic emerald nebulas, Surya golden sun, golden double-ring ellipses with dust)
 * - 'CRYPTO_NEBULA' (Crypto & Web3: Pulsing magenta & ultraviolet gas clouds, purple pulsar with rapid flashes, polygon wireframe webs)
 * - 'BONDS_STEADY' (Fixed Income: Warm amber starlight, soothing calm drift, low-risk resonance)
 */

import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';
import { createNebulaBackdropMaterial } from './shaders.js';
import { soundFx } from './audio.js';
import { Text } from 'troika-three-text';

export const GALAXY_THEMES = {
  'US_WALLSTREET': {
    id: 'US_WALLSTREET',
    name: 'Wall Street (NYSE / NASDAQ)',
    market: 'US',
    currency: 'USD',
    currencySymbol: '$',
    accentColor: '#00f0ff',
    secondaryColor: '#38bdf8',
    skybox: {
      voidColor: 0x020617,
      nebula1: 0x0369a1,
      nebula2: 0x312e81,
      haze: 0x06b6d4,
      speed: 1.2
    },
    sun: {
      coreColor: 0xffffff,
      hotColor: 0x00f0ff,
      flareColor: 0x0284c7,
      deepColor: 0x082f49,
      coronaGlow: 0x06b6d4,
      coronaRim: 0x0369a1,
      lightColor: 0xe0f2fe,
      lightIntensity: 3.6,
      photonRingColor: 0x06b6d4,
      photonRingOpacity: 0.45,
      isPulsar: false
    },
    orbits: {
      color: 0x06b6d4,
      secondaryColor: 0x38bdf8,
      type: 'grid',
      opacity: 0.28
    },
    particles: {
      mode: 'calm_stars', // Subtle calm cosmic starfield
      colorA: 0x00f0ff,
      colorB: 0x38bdf8,
      speedMultiplier: 1.0,
      pointSize: 0.14
    },
    lighting: {
      ambientColor: 0x0b1528,
      ambientIntensity: 1.25,
      keyColor: 0x38bdf8,
      keyIntensity: 1.5,
      rimColor: 0x0284c7,
      rimIntensity: 0.95
    },
    streams: {
      inflow: ['#00f0ff', '#38bdf8', '#818cf8'],
      outflow: ['#f43f5e', '#fb7185', '#fda4af']
    }
  },

  'IN_BHARAT': {
    id: 'IN_BHARAT',
    name: 'Bharat Cosmos (NSE / BSE)',
    market: 'IN',
    currency: 'INR',
    currencySymbol: '₹',
    accentColor: '#f97316',
    secondaryColor: '#10b981',
    skybox: {
      voidColor: 0x080410,
      nebula1: 0x9a3412, // Warm saffron gold (#f97316)
      nebula2: 0x065f46, // Vedic emerald (#10b981)
      haze: 0xf59e0b,    // Radiant golden Surya haze
      speed: 0.85
    },
    sun: {
      coreColor: 0xfffbeb, // Radiant Surya star core
      hotColor: 0xf59e0b,  // Golden plasma
      flareColor: 0xe11d48, // Warm orange-red solar flares
      deepColor: 0x78350f,  // Deep amber convection
      coronaGlow: 0xf59e0b, // Warm orange aura
      coronaRim: 0x10b981,  // Vedic emerald rim highlight
      lightColor: 0xffedd5, // Warm radiant daylight
      lightIntensity: 3.8,
      photonRingColor: 0xf59e0b,
      photonRingOpacity: 0.5,
      isPulsar: false
    },
    orbits: {
      color: 0xf59e0b,
      secondaryColor: 0x10b981,
      type: 'double_gold', // Golden double-ring ellipses
      opacity: 0.35
    },
    particles: {
      mode: 'gold_dust', // Micro-particle dust & Vedic sparkles
      colorA: 0xf59e0b,
      colorB: 0x10b981,
      speedMultiplier: 0.9,
      pointSize: 0.15
    },
    lighting: {
      ambientColor: 0x1c1208,
      ambientIntensity: 1.35,
      keyColor: 0xfde047,
      keyIntensity: 1.65,
      rimColor: 0x10b981,
      rimIntensity: 1.05
    },
    streams: {
      inflow: ['#10b981', '#f59e0b', '#06b6d4'],
      outflow: ['#ef4444', '#f97316', '#e11d48']
    }
  },

  'CRYPTO_NEBULA': {
    id: 'CRYPTO_NEBULA',
    name: 'Crypto & Web3 Nebula',
    market: 'CRYPTO',
    currency: 'USD',
    currencySymbol: '$',
    accentColor: '#ec4899',
    secondaryColor: '#8b5cf6',
    skybox: {
      voidColor: 0x050012,
      nebula1: 0xbe185d, // Pulsing magenta (#ec4899)
      nebula2: 0x4c1d95, // Ultraviolet gas clouds
      haze: 0xa855f7,    // Electric violet haze
      speed: 1.7
    },
    sun: {
      coreColor: 0xffffff,
      hotColor: 0xec4899,
      flareColor: 0x7c3aed,
      deepColor: 0x3b0764,
      coronaGlow: 0xec4899,
      coronaRim: 0x9333ea,
      lightColor: 0xf472b6,
      lightIntensity: 4.2,
      photonRingColor: 0xec4899,
      photonRingOpacity: 0.6,
      isPulsar: true, // Rapid rhythmic light flashes
      pulsarFreq: 5.2
    },
    orbits: {
      color: 0xec4899,
      secondaryColor: 0x8b5cf6,
      type: 'polygon_web', // Polygon wireframe webs
      opacity: 0.38
    },
    particles: {
      mode: 'pulsing_void',
      colorA: 0xec4899,
      colorB: 0x8b5cf6,
      speedMultiplier: 1.85,
      pointSize: 0.18
    },
    lighting: {
      ambientColor: 0x19062b,
      ambientIntensity: 1.4,
      keyColor: 0xd946ef,
      keyIntensity: 1.75,
      rimColor: 0x8b5cf6,
      rimIntensity: 1.15
    },
    streams: {
      inflow: ['#ec4899', '#8b5cf6', '#f43f5e'],
      outflow: ['#ef4444', '#d946ef', '#a855f7']
    }
  },

  'BONDS_STEADY': {
    id: 'BONDS_STEADY',
    name: 'Fixed Income Sovereign Shield',
    market: 'BONDS',
    currency: 'USD',
    currencySymbol: '$',
    accentColor: '#f59e0b',
    secondaryColor: '#fbbf24',
    skybox: {
      voidColor: 0x070604,
      nebula1: 0x78350f, // Warm amber starlight
      nebula2: 0x451a03, // Low-risk calm resonance
      haze: 0xd97706,
      speed: 0.45
    },
    sun: {
      coreColor: 0xfffbeb,
      hotColor: 0xf59e0b,
      flareColor: 0xb45309,
      deepColor: 0x451a03,
      coronaGlow: 0xfbbf24,
      coronaRim: 0x92400e,
      lightColor: 0xfef3c7,
      lightIntensity: 2.9,
      photonRingColor: 0xf59e0b,
      photonRingOpacity: 0.35,
      isPulsar: false
    },
    orbits: {
      color: 0xf59e0b,
      secondaryColor: 0xfbbf24,
      type: 'harmonic_ring',
      opacity: 0.24
    },
    particles: {
      mode: 'soothing_drift', // Slow soothing particle drift
      colorA: 0xf59e0b,
      colorB: 0xd97706,
      speedMultiplier: 0.45,
      pointSize: 0.13
    },
    lighting: {
      ambientColor: 0x140e04,
      ambientIntensity: 1.15,
      keyColor: 0xfbbf24,
      keyIntensity: 1.25,
      rimColor: 0xd97706,
      rimIntensity: 0.75
    },
    streams: {
      inflow: ['#f59e0b', '#fbbf24', '#d97706'],
      outflow: ['#ef4444', '#b45309', '#78350f']
    }
  }
};
// Scene References Singleton
export const tabletopPivot = new THREE.Group();
tabletopPivot.name = 'TabletopPivotGroup';

// Interaction Anchor Base Ring for Tabletop Manipulation in MR Passthrough
const baseRingGeo = new THREE.RingGeometry(0.35, 0.42, 64);
const baseRingMat = new THREE.MeshBasicMaterial({
  color: 0x06b6d4,
  transparent: true,
  opacity: 0.35,
  side: THREE.DoubleSide
});
export const baseRingMesh = new THREE.Mesh(baseRingGeo, baseRingMat);
baseRingMesh.name = 'TabletopBaseRingMesh';
baseRingMesh.rotation.x = -Math.PI / 2;
baseRingMesh.position.y = -0.02;
baseRingMesh.userData.isDraggableBase = true;
baseRingMesh.userData.isInteractive = true;
tabletopPivot.add(baseRingMesh);

if (typeof window !== 'undefined') {
  window.baseRingMesh = baseRingMesh;
  window.tabletopPivot = tabletopPivot;
  if (typeof window.hasAnchoredToTable === 'undefined') {
    window.hasAnchoredToTable = false;
  }
}

// Glowing Accent Borders & Rotation Dial Markings for Base Ring
const outerRimPoints = [];
const innerRimPoints = [];
for (let i = 0; i <= 64; i++) {
  const theta = (i / 64) * Math.PI * 2;
  outerRimPoints.push(new THREE.Vector3(Math.cos(theta) * 0.42, 0.001, Math.sin(theta) * 0.42));
  innerRimPoints.push(new THREE.Vector3(Math.cos(theta) * 0.35, 0.001, Math.sin(theta) * 0.35));
}
const rimMat = new THREE.LineBasicMaterial({
  color: 0x00f0ff,
  transparent: true,
  opacity: 0.75,
  blending: THREE.AdditiveBlending
});
const outerRim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(outerRimPoints), rimMat);
const innerRim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(innerRimPoints), rimMat);
baseRingMesh.add(outerRim);
baseRingMesh.add(innerRim);

// Subtle Cardinal Dial Ticks indicating rotational orientation
const ticksGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0.33, 0.002, 0), new THREE.Vector3(0.44, 0.002, 0),
  new THREE.Vector3(-0.33, 0.002, 0), new THREE.Vector3(-0.44, 0.002, 0),
  new THREE.Vector3(0, 0.002, 0.33), new THREE.Vector3(0, 0.002, 0.44),
  new THREE.Vector3(0, 0.002, -0.33), new THREE.Vector3(0, 0.002, -0.44)
]);
const ticksMaterial = new THREE.LineBasicMaterial({
  color: 0x38bdf8,
  transparent: true,
  opacity: 0.8,
  blending: THREE.AdditiveBlending
});
const ticksMesh = new THREE.LineSegments(ticksGeo, ticksMaterial);
baseRingMesh.add(ticksMesh);

/**
 * Updates visual feedback state for the tabletop interaction base ring.
 * @param {'idle'|'hover'|'grab'} state
 */
export function setBaseRingState(state = 'idle') {
  if (!baseRingMesh || !baseRingMesh.material) return;
  if (state === 'grab') {
    baseRingMesh.material.color.setHex(0x10b981);
    baseRingMesh.material.opacity = 0.75;
    rimMat.color.setHex(0x34d399);
    rimMat.opacity = 0.95;
    ticksMaterial.color.setHex(0xa7f3d0);
    ticksMaterial.opacity = 1.0;
  } else if (state === 'hover') {
    baseRingMesh.material.color.setHex(0x00f0ff);
    baseRingMesh.material.opacity = 0.55;
    rimMat.color.setHex(0x38bdf8);
    rimMat.opacity = 0.85;
    ticksMaterial.color.setHex(0x7dd3fc);
    ticksMaterial.opacity = 0.9;
  } else {
    baseRingMesh.material.color.setHex(0x06b6d4);
    baseRingMesh.material.opacity = 0.35;
    rimMat.color.setHex(0x00f0ff);
    rimMat.opacity = 0.75;
    ticksMaterial.color.setHex(0x38bdf8);
    ticksMaterial.opacity = 0.8;
  }
}

// WebXR Plane Detection & Real-World Surface Anchoring Groups (Kept invisible, numerical only)
export const detectedPlanesGroup = new THREE.Group();
detectedPlanesGroup.name = 'DetectedPlanesGroup';
detectedPlanesGroup.visible = false;

export const detectedMeshesGroup = new THREE.Group();
detectedMeshesGroup.name = 'DetectedMeshesGroup';
detectedMeshesGroup.visible = false;

export const surfaceAnchorGizmo = new THREE.Group();
surfaceAnchorGizmo.name = 'SurfaceAnchorGizmo';
surfaceAnchorGizmo.visible = false;

// Active tracking caches for WebXR Scene Understanding (purely numerical tracking, no visible geometry)
const activePlanesMap = new Map();
const activeMeshesMap = new Map();
let isPlanesVisible = false;

export const tabletopAnchorState = {
  isAnchored: false,
  plane: null,
  anchor: null,
  localOffset: new THREE.Vector3(0, 0.008, 0),
  surfaceLabel: '',
  lastAnchorTime: 0,
  scale: 0.18
};

let currentThemeKey = 'US_WALLSTREET';
let sceneRef = null;
let nebulaDomeRef = null;
let centralSunRef = null;
let starfieldParticlesRef = null;
let dustCloudRef = null;
let ambientLightRef = null;
let coreLightRef = null;
let keyLightRef = null;
let galacticRimRef = null;
let activeThemeTweens = [];
let isPulsarActive = false;
let pulsarFreq = 0;
let isPassthroughActive = false;
let savedSceneBackground = null;
let savedSceneFog = null;

/**
 * Registers 3D scene objects with the Galaxy Environment Engine.
 */
export function registerSceneEnvironment(refs = {}) {
  if (refs.scene) {
    sceneRef = refs.scene;
    if (!sceneRef.children.includes(tabletopPivot)) {
      sceneRef.add(tabletopPivot);
    }
    // Do NOT add detectedPlanesGroup or detectedMeshesGroup or surfaceAnchorGizmo to scene
  }
  if (refs.nebulaDome || refs.skyboxMesh || refs.skybox) {
    nebulaDomeRef = refs.nebulaDome || refs.skyboxMesh || refs.skybox;
    if (typeof window !== 'undefined') {
      window.skyboxMesh = nebulaDomeRef;
    }
  }
  if (refs.centralSun) centralSunRef = refs.centralSun;
  if (refs.ambientLight) ambientLightRef = refs.ambientLight;
  if (refs.coreLight) coreLightRef = refs.coreLight;
  if (refs.keyLight) keyLightRef = refs.keyLight;
  if (refs.galacticRim) galacticRimRef = refs.galacticRim;
  if (refs.dustCloud) dustCloudRef = refs.dustCloud;
  if (refs.starfield || refs.cosmicStarfield || refs.spaceParticles) {
    starfieldParticlesRef = refs.starfield || refs.cosmicStarfield || refs.spaceParticles;
    if (typeof window !== 'undefined') {
      window.spaceParticles = starfieldParticlesRef;
    }
  }
}

/**
 * Toggles Mixed Reality Passthrough: hides the space nebula dome, cosmic starfield,
 * and volumetric dust clouds, setting the WebGL scene background and fog to null (transparent).
 * When disabled, restores deep space skybox and fog.
 * @param {boolean} isActive
 */
export function setPassthroughMode(isActive) {
  isPassthroughActive = Boolean(isActive);

  if (!isPassthroughActive && typeof window !== 'undefined') {
    window.hasAnchoredToTable = false;
  }

  if (nebulaDomeRef) {
    nebulaDomeRef.visible = !isPassthroughActive;
  }
  if (starfieldParticlesRef) {
    starfieldParticlesRef.visible = !isPassthroughActive;
  }
  if (dustCloudRef) {
    dustCloudRef.visible = !isPassthroughActive;
  }

  if (typeof window !== 'undefined') {
    if (window.skyboxMesh) window.skyboxMesh.visible = !isPassthroughActive;
    if (window.spaceParticles) window.spaceParticles.visible = !isPassthroughActive;
    if (window.baseRingMesh) window.baseRingMesh.visible = isPassthroughActive;
  }

  if (detectedPlanesGroup) {
    detectedPlanesGroup.visible = false;
  }
  if (detectedMeshesGroup) {
    detectedMeshesGroup.visible = false;
  }
  if (surfaceAnchorGizmo) {
    surfaceAnchorGizmo.visible = false;
  }
  if (baseRingMesh) {
    baseRingMesh.visible = isPassthroughActive;
  }

  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('passthrough-mode', isPassthroughActive);
  }

  if (sceneRef) {
    if (isPassthroughActive) {
      if (sceneRef.background && !savedSceneBackground) savedSceneBackground = sceneRef.background;
      if (sceneRef.fog && !savedSceneFog) savedSceneFog = sceneRef.fog;
      sceneRef.background = null;
      sceneRef.fog = null;
    } else {
      sceneRef.background = savedSceneBackground || new THREE.Color(0x020617);
      sceneRef.fog = savedSceneFog || new THREE.FogExp2(0x020617, 0.011);
    }
  }

  return isPassthroughActive;
}

/**
 * Reads numerical transform data (height, orientation, position) for detected WebXR planes.
 * No visible Three.js line/mesh geometry is added to the scene.
 * @param {Set<XRPlane>} detectedPlanesSet
 * @param {XRFrame} frame
 * @param {XRReferenceSpace} referenceSpace
 */
export function updateDetectedPlanes(detectedPlanesSet, frame, referenceSpace) {
  if (!detectedPlanesSet || !frame || !referenceSpace) return;
  const currentPlanes = new Set();

  for (const plane of detectedPlanesSet) {
    currentPlanes.add(plane);
    const pose = frame.getPose(plane.planeSpace, referenceSpace);
    if (!pose) continue;

    let planeData = activePlanesMap.get(plane);
    if (!planeData) {
      planeData = {
        plane,
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion(),
        scale: new THREE.Vector3(1, 1, 1),
        orientation: plane.orientation,
        semanticLabel: plane.semanticLabel,
        polygon: plane.polygon || [],
        lastChangedTime: plane.lastChangedTime
      };
      activePlanesMap.set(plane, planeData);
    }

    const mat = new THREE.Matrix4().fromArray(pose.transform.matrix);
    mat.decompose(planeData.position, planeData.quaternion, planeData.scale);
    planeData.orientation = plane.orientation;
    planeData.semanticLabel = plane.semanticLabel;
    planeData.polygon = plane.polygon || [];
    planeData.lastChangedTime = plane.lastChangedTime;
  }

  // Remove lost planes
  for (const plane of activePlanesMap.keys()) {
    if (!currentPlanes.has(plane)) {
      activePlanesMap.delete(plane);
      if (tabletopAnchorState.plane === plane && !tabletopAnchorState.anchor) {
        tabletopAnchorState.isAnchored = false;
        tabletopAnchorState.plane = null;
      }
    }
  }
}

/**
 * Room mesh reconstruction visualizer completely disabled.
 * No visible wireframe or occlusion meshes are added to the scene.
 * @param {Set<XRMesh>} detectedMeshesSet
 * @param {XRFrame} frame
 * @param {XRReferenceSpace} referenceSpace
 */
export function updateDetectedMeshes(detectedMeshesSet, frame, referenceSpace) {
  // Completely disabled - room meshes are not added to the scene
}

/**
 * Anchors the miniature tabletop portfolio onto a real-world detected plane with millimeter accuracy.
 * Integrates WebXR Anchors API when supported, falling back to plane-space local offset tracking.
 * @param {XRPlane} plane
 * @param {XRFrame} frame
 * @param {XRReferenceSpace} referenceSpace
 * @param {THREE.Vector3} [targetWorldPos]
 */
export function anchorTabletopToPlane(plane, frame, referenceSpace, targetWorldPos = null) {
  if (!plane) return false;
  const pose = frame?.getPose ? frame.getPose(plane.planeSpace, referenceSpace) : null;
  const planeData = activePlanesMap.get(plane);

  let worldPos = targetWorldPos;
  if (!worldPos) {
    if (pose) {
      worldPos = new THREE.Vector3(
        pose.transform.position.x,
        pose.transform.position.y,
        pose.transform.position.z
      );
    } else if (planeData) {
      worldPos = planeData.position.clone();
    } else {
      worldPos = tabletopPivot.position.clone();
    }
  }

  let localOffset = new THREE.Vector3(0, 0.008, 0);
  if (pose) {
    const planeMatrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
    const invPlaneMatrix = new THREE.Matrix4().copy(planeMatrix).invert();
    localOffset = worldPos.clone().applyMatrix4(invPlaneMatrix);
    localOffset.y = Math.max(localOffset.y, 0.005);
  }

  tabletopAnchorState.isAnchored = true;
  tabletopAnchorState.plane = plane;
  tabletopAnchorState.localOffset.copy(localOffset);
  tabletopAnchorState.userRotationY = tabletopPivot.rotation.y;
  tabletopAnchorState.surfaceLabel = plane.semanticLabel || 'Surface';
  tabletopAnchorState.lastAnchorTime = performance.now();

  if (typeof window !== 'undefined') {
    window.hasAnchoredToTable = true;
  }

  const targetScale = getTabletopScale();
  tabletopAnchorState.scale = targetScale;
  tabletopPivot.scale.set(targetScale, targetScale, targetScale);
  tabletopPivot.position.copy(worldPos);

  if (frame && typeof frame.createAnchor === 'function') {
    try {
      if (typeof XRRigidTransform !== 'undefined') {
        const anchorPose = new XRRigidTransform({
          x: localOffset.x,
          y: localOffset.y,
          z: localOffset.z
        });
        const anchorPromise = plane.createAnchor
          ? plane.createAnchor(anchorPose)
          : frame.createAnchor(anchorPose, plane.planeSpace);

        if (anchorPromise && typeof anchorPromise.then === 'function') {
          anchorPromise.then((anchor) => {
            tabletopAnchorState.anchor = anchor;
          }).catch(() => {});
        }
      }
    } catch (err) {
      // Graceful fallback to plane-space tracking
    }
  }

  if (surfaceAnchorGizmo) {
    surfaceAnchorGizmo.position.copy(worldPos);
    surfaceAnchorGizmo.visible = false;
  }

  soundFx.playEnergySurgeSound();
  return true;
}

/**
 * Continuously tracks and updates the anchored tabletop portfolio against physical headset motion.
 * @param {XRFrame} frame
 * @param {XRReferenceSpace} referenceSpace
 */
export function updateAnchoredTabletop(frame, referenceSpace) {
  if (!tabletopAnchorState.isAnchored || !frame || !referenceSpace) return;

  const anchorScale = tabletopAnchorState.scale || 0.18;

  if (tabletopAnchorState.anchor) {
    const anchorPose = frame.getPose(tabletopAnchorState.anchor.anchorSpace, referenceSpace);
    if (anchorPose) {
      tabletopPivot.matrix.fromArray(anchorPose.transform.matrix);
      tabletopPivot.matrix.decompose(tabletopPivot.position, tabletopPivot.quaternion, tabletopPivot.scale);
      tabletopPivot.scale.set(anchorScale, anchorScale, anchorScale);
      if (typeof tabletopAnchorState.userRotationY === 'number') {
        tabletopPivot.rotation.y = tabletopAnchorState.userRotationY;
      }
      tabletopPivot.updateMatrixWorld(true);
      return;
    }
  }

  if (tabletopAnchorState.plane) {
    const planePose = frame.getPose(tabletopAnchorState.plane.planeSpace, referenceSpace);
    if (planePose) {
      const planeMat = new THREE.Matrix4().fromArray(planePose.transform.matrix);
      const anchoredPos = tabletopAnchorState.localOffset.clone().applyMatrix4(planeMat);
      tabletopPivot.position.copy(anchoredPos);
      tabletopPivot.scale.set(anchorScale, anchorScale, anchorScale);
      if (typeof tabletopAnchorState.userRotationY === 'number') {
        tabletopPivot.rotation.y = tabletopAnchorState.userRotationY;
      }
      tabletopPivot.updateMatrixWorld(true);
    }
  }
}

/**
 * Releases surface anchoring, allowing arbitrary spatial repositioning.
 */
export function unanchorTabletop() {
  if (tabletopAnchorState.anchor && typeof tabletopAnchorState.anchor.delete === 'function') {
    try {
      tabletopAnchorState.anchor.delete();
    } catch (e) {}
  }
  tabletopAnchorState.isAnchored = false;
  tabletopAnchorState.plane = null;
  tabletopAnchorState.anchor = null;
  tabletopAnchorState.surfaceLabel = '';
  // Note: Do NOT reset window.hasAnchoredToTable here, so user manual grab/drag positioning is preserved
  // and the auto-anchor loop does not immediately pull the tabletop back onto a detected plane.
  if (surfaceAnchorGizmo) {
    surfaceAnchorGizmo.visible = false;
  }
}

/**
 * Returns current tabletop anchoring state.
 */
export function getTabletopAnchorState() {
  return tabletopAnchorState;
}

/**
 * Sets the scale of the miniature tabletop solar system, clamped between 0.08 and 0.65.
 * @param {number} scale
 * @returns {number} The clamped scale applied
 */
export function setTabletopScale(scale) {
  const clamped = THREE.MathUtils.clamp(scale, 0.08, 0.65);
  tabletopAnchorState.scale = clamped;
  if (tabletopPivot) {
    tabletopPivot.scale.set(clamped, clamped, clamped);
  }
  return clamped;
}

/**
 * Returns the active scale of the tabletop portfolio.
 * @returns {number}
 */
export function getTabletopScale() {
  return tabletopAnchorState.scale || (tabletopPivot ? tabletopPivot.scale.x : 0.18);
}

/**
 * Finds the optimal physical table or desk plane in front of the user for automatic portfolio anchoring.
 * @param {XRFrame} frame
 * @param {XRReferenceSpace} referenceSpace
 * @param {THREE.Camera} [camera]
 */
export function findBestTablePlane(frame, referenceSpace, camera = null) {
  if (!frame || !referenceSpace || activePlanesMap.size === 0) return null;

  let bestPlane = null;
  let bestScore = -Infinity;

  const camPos = camera ? camera.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 1.6, 0);
  const camDir = new THREE.Vector3();
  if (camera?.getWorldDirection) {
    camera.getWorldDirection(camDir);
  } else if (camera?.quaternion) {
    camDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
  } else {
    camDir.set(0, 0, -1);
  }
  camDir.y = 0;
  if (camDir.lengthSq() < 0.001) camDir.set(0, 0, -1);
  camDir.normalize();

  for (const [plane, planeData] of activePlanesMap.entries()) {
    const orient = (plane.orientation || '').toLowerCase();
    if (orient !== 'horizontal' && orient !== '') continue;

    const label = (plane.semanticLabel || '').toLowerCase();
    const isTable = label === 'table' || label === 'desk';
    const isFloor = label === 'floor';

    const planePos = planeData.position;
    const toPlane = planePos.clone().sub(camPos);
    toPlane.y = 0;
    const dist = toPlane.length();
    const forwardDot = dist > 0.001 ? toPlane.normalize().dot(camDir) : 1;

    let score = 0;
    if (isTable) score += 100;
    if (isFloor) score -= 60;

    score += forwardDot * 35;
    score -= Math.abs(dist - 1.0) * 20;

    const heightRel = planePos.y - (camPos.y - 0.45);
    score -= Math.abs(heightRel) * 25;

    if (score > bestScore) {
      bestScore = score;
      bestPlane = plane;
    }
  }

  return bestPlane;
}

/**
 * Raycasts against detected physical plane surfaces for precise magnetic snapping.
 * Uses pure mathematical plane intersection without adding Three.js meshes to the scene.
 * @param {THREE.Raycaster} raycaster
 */
export function raycastDetectedPlanes(raycaster) {
  if (!raycaster || activePlanesMap.size === 0) return [];

  const hits = [];
  const planeMath = new THREE.Plane();
  const upNormal = new THREE.Vector3();
  const intersectPoint = new THREE.Vector3();

  for (const [plane, planeData] of activePlanesMap.entries()) {
    upNormal.set(0, 1, 0).applyQuaternion(planeData.quaternion);
    planeMath.setFromNormalAndCoplanarPoint(upNormal, planeData.position);

    if (raycaster.ray.intersectPlane(planeMath, intersectPoint)) {
      const dist = raycaster.ray.origin.distanceTo(intersectPoint);
      if (dist > 0 && dist < 10) {
        const distToCenter = intersectPoint.distanceTo(planeData.position);
        if (distToCenter < 3.5) {
          hits.push({
            point: intersectPoint.clone(),
            distance: dist,
            plane: planeData.plane
          });
        }
      }
    }
  }

  hits.sort((a, b) => a.distance - b.distance);
  return hits;
}

/**
 * Clamps a world position so it stays within the physical perimeter boundary of a detected plane.
 * @param {XRPlane} plane
 * @param {THREE.Vector3} worldPoint
 * @param {XRFrame} frame
 * @param {XRReferenceSpace} referenceSpace
 * @param {number} margin Safety inset margin in meters (default 0.04m)
 * @returns {THREE.Vector3} Clamped world point
 */
export function clampPointToPlaneBoundary(plane, worldPoint, frame, referenceSpace, margin = 0.04) {
  if (!plane || !worldPoint || !frame || !referenceSpace) return worldPoint;
  const pose = frame.getPose(plane.planeSpace, referenceSpace);
  if (!pose || !plane.polygon || plane.polygon.length < 3) return worldPoint;

  const planeMatrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
  const invPlaneMatrix = new THREE.Matrix4().copy(planeMatrix).invert();
  const localPos = worldPoint.clone().applyMatrix4(invPlaneMatrix);

  // Compute 2D bounding box of the polygon in plane space
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const pt of plane.polygon) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.z < minZ) minZ = pt.z;
    if (pt.z > maxZ) maxZ = pt.z;
  }

  // Inset by safety margin
  const safeMarginX = Math.min(margin, Math.max(0.01, (maxX - minX) * 0.15));
  const safeMarginZ = Math.min(margin, Math.max(0.01, (maxZ - minZ) * 0.15));
  localPos.x = THREE.MathUtils.clamp(localPos.x, minX + safeMarginX, maxX - safeMarginX);
  localPos.z = THREE.MathUtils.clamp(localPos.z, minZ + safeMarginZ, maxZ - safeMarginZ);
  localPos.y = Math.max(localPos.y, 0.005);

  return localPos.applyMatrix4(planeMatrix);
}

/**
 * Toggles visibility of detected real-world plane wireframes and boundary highlights (Always disabled).
 * @param {boolean} enabled
 */
export function setPlaneVisualization(enabled) {
  isPlanesVisible = false;
  if (detectedPlanesGroup) {
    detectedPlanesGroup.visible = false;
  }
  return false;
}

export function getPlaneVisualization() {
  return false;
}

/**
 * Enforces the tabletop miniature transform (0.18 scale) in Passthrough AR
 * or resets to full room-scale (1.0 scale) at the origin in VR.
 * @param {boolean} isAR
 * @param {THREE.Camera} [camera]
 */
export function enforceTabletopTransform(isAR = true, camera = null) {
  if (!tabletopPivot) return;
  if (isAR) {
    if (typeof window !== 'undefined') {
      window.hasAnchoredToTable = false;
    }
    tabletopPivot.scale.set(0.18, 0.18, 0.18);
    if (camera) {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 0.001) {
        if (camera.quaternion) forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
        forward.y = 0;
      }
      if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
      forward.normalize();
      const headPos = camera.getWorldPosition ? camera.getWorldPosition(new THREE.Vector3()) : camera.position;
      const targetX = headPos.x + forward.x * 0.85;
      const targetZ = headPos.z + forward.z * 0.85;
      const targetY = headPos.y - 0.35;
      tabletopPivot.position.set(targetX, targetY, targetZ);
    }
  } else {
    if (typeof window !== 'undefined') {
      window.hasAnchoredToTable = false;
    }
    tabletopPivot.scale.set(1.0, 1.0, 1.0);
    tabletopPivot.position.set(0, 0, 0);
  }
}

/**
 * Returns current passthrough state.
 */
export function getPassthroughMode() {
  return isPassthroughActive;
}

/**
 * Creates subtle, calm, stationary cosmic starfield points without high-speed streak lines.
 */
export function createDynamicCosmicStarfield(scene) {
  const group = new THREE.Group();
  group.name = 'DynamicCosmicStarfieldGroup';

  // Omnidirectional Starfield (1,800 stars)
  const starCount = 1800;
  const starGeo = new THREE.BufferGeometry();
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);

  const colA = new THREE.Color(0x38bdf8);
  const colB = new THREE.Color(0x818cf8);

  for (let i = 0; i < starCount * 3; i += 3) {
    starPositions[i] = (Math.random() - 0.5) * 190;
    starPositions[i + 1] = (Math.random() - 0.5) * 95 + 10;
    starPositions[i + 2] = (Math.random() - 0.5) * 190;

    const mixed = colA.clone().lerp(colB, Math.random());
    starColors[i] = mixed.r;
    starColors[i + 1] = mixed.g;
    starColors[i + 2] = mixed.b;
  }

  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

  const starMat = new THREE.PointsMaterial({
    size: 0.14,
    vertexColors: true,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const starPoints = new THREE.Points(starGeo, starMat);
  group.add(starPoints);
  starfieldParticlesRef = starPoints;

  if (scene) scene.add(group);
  return group;
}

/**
 * Returns currently active galaxy theme key.
 */
export function getCurrentGalaxyTheme() {
  return currentThemeKey;
}

/**
 * Switches the celestial theme smoothly over the specified duration (default 800ms) with TWEEN.js.
 * @param {string} themeKey 'US_WALLSTREET' | 'IN_BHARAT' | 'CRYPTO_NEBULA' | 'BONDS_STEADY'
 * @param {number} duration Transition duration in milliseconds (default 800)
 */
export function setGalaxyTheme(themeKey, duration = 800) {
  const theme = GALAXY_THEMES[themeKey] || GALAXY_THEMES['US_WALLSTREET'];
  currentThemeKey = themeKey;

  // Cancel any existing theme transitions
  activeThemeTweens.forEach((tw) => tw.stop());
  activeThemeTweens = [];

  // Update Pulsar State
  isPulsarActive = Boolean(theme.sun.isPulsar);
  pulsarFreq = theme.sun.pulsarFreq || 0;

  // 1. Smoothly Interpolate Skybox Nebula Backdrop Shader Uniforms
  if (nebulaDomeRef?.material?.uniforms) {
    const u = nebulaDomeRef.material.uniforms;

    const targetVoid = new THREE.Color(theme.skybox.voidColor);
    const targetNeb1 = new THREE.Color(theme.skybox.nebula1);
    const targetNeb2 = new THREE.Color(theme.skybox.nebula2);
    const targetHaze = new THREE.Color(theme.skybox.haze);

    const twNebula = new TWEEN.Tween({
      voidR: u.uColorVoid.value.r, voidG: u.uColorVoid.value.g, voidB: u.uColorVoid.value.b,
      neb1R: u.uColorNebula1.value.r, neb1G: u.uColorNebula1.value.g, neb1B: u.uColorNebula1.value.b,
      neb2R: u.uColorNebula2.value.r, neb2G: u.uColorNebula2.value.g, neb2B: u.uColorNebula2.value.b,
      hazeR: u.uColorHaze.value.r, hazeG: u.uColorHaze.value.g, hazeB: u.uColorHaze.value.b,
      speed: u.uSpeed.value
    })
      .to({
        voidR: targetVoid.r, voidG: targetVoid.g, voidB: targetVoid.b,
        neb1R: targetNeb1.r, neb1G: targetNeb1.g, neb1B: targetNeb1.b,
        neb2R: targetNeb2.r, neb2G: targetNeb2.g, neb2B: targetNeb2.b,
        hazeR: targetHaze.r, hazeG: targetHaze.g, hazeB: targetHaze.b,
        speed: theme.skybox.speed
      }, duration)
      .easing(TWEEN.Easing.Cubic.InOut)
      .onUpdate((obj) => {
        u.uColorVoid.value.setRGB(obj.voidR, obj.voidG, obj.voidB);
        u.uColorNebula1.value.setRGB(obj.neb1R, obj.neb1G, obj.neb1B);
        u.uColorNebula2.value.setRGB(obj.neb2R, obj.neb2G, obj.neb2B);
        u.uColorHaze.value.setRGB(obj.hazeR, obj.hazeG, obj.hazeB);
        u.uSpeed.value = obj.speed;
      });

    TWEEN.add(twNebula);
    twNebula.start();
    activeThemeTweens.push(twNebula);
  }

  // 2. Smoothly Interpolate Central Sun Plasma Shaders & Corona Aura
  if (centralSunRef?.userData) {
    const { coreMat, coronaMat, starLight, photonRing } = centralSunRef.userData;

    // Solar Core Granulation Uniforms
    if (coreMat?.uniforms) {
      const tgtCore = new THREE.Color(theme.sun.coreColor);
      const tgtHot = new THREE.Color(theme.sun.hotColor);
      const tgtFlare = new THREE.Color(theme.sun.flareColor);
      const tgtDeep = new THREE.Color(theme.sun.deepColor);

      const twCore = new TWEEN.Tween({
        coreR: coreMat.uniforms.uColorCore.value.r, coreG: coreMat.uniforms.uColorCore.value.g, coreB: coreMat.uniforms.uColorCore.value.b,
        hotR: coreMat.uniforms.uColorHot.value.r, hotG: coreMat.uniforms.uColorHot.value.g, hotB: coreMat.uniforms.uColorHot.value.b,
        flareR: coreMat.uniforms.uColorFlare.value.r, flareG: coreMat.uniforms.uColorFlare.value.g, flareB: coreMat.uniforms.uColorFlare.value.b,
        deepR: coreMat.uniforms.uColorDeep.value.r, deepG: coreMat.uniforms.uColorDeep.value.g, deepB: coreMat.uniforms.uColorDeep.value.b
      })
        .to({
          coreR: tgtCore.r, coreG: tgtCore.g, coreB: tgtCore.b,
          hotR: tgtHot.r, hotG: tgtHot.g, hotB: tgtHot.b,
          flareR: tgtFlare.r, flareG: tgtFlare.g, flareB: tgtFlare.b,
          deepR: tgtDeep.r, deepG: tgtDeep.g, deepB: tgtDeep.b
        }, duration)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onUpdate((obj) => {
          coreMat.uniforms.uColorCore.value.setRGB(obj.coreR, obj.coreG, obj.coreB);
          coreMat.uniforms.uColorHot.value.setRGB(obj.hotR, obj.hotG, obj.hotB);
          coreMat.uniforms.uColorFlare.value.setRGB(obj.flareR, obj.flareG, obj.flareB);
          coreMat.uniforms.uColorDeep.value.setRGB(obj.deepR, obj.deepG, obj.deepB);
        });

      TWEEN.add(twCore);
      twCore.start();
      activeThemeTweens.push(twCore);
    }

    // Solar Corona Aura Uniforms
    if (coronaMat?.uniforms) {
      const tgtGlow = new THREE.Color(theme.sun.coronaGlow);
      const tgtRim = new THREE.Color(theme.sun.coronaRim);

      const twCorona = new TWEEN.Tween({
        glowR: coronaMat.uniforms.uGlowColor.value.r, glowG: coronaMat.uniforms.uGlowColor.value.g, glowB: coronaMat.uniforms.uGlowColor.value.b,
        rimR: coronaMat.uniforms.uRimColor.value.r, rimG: coronaMat.uniforms.uRimColor.value.g, rimB: coronaMat.uniforms.uRimColor.value.b
      })
        .to({
          glowR: tgtGlow.r, glowG: tgtGlow.g, glowB: tgtGlow.b,
          rimR: tgtRim.r, rimG: tgtRim.g, rimB: tgtRim.b
        }, duration)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onUpdate((obj) => {
          coronaMat.uniforms.uGlowColor.value.setRGB(obj.glowR, obj.glowG, obj.glowB);
          coronaMat.uniforms.uRimColor.value.setRGB(obj.rimR, obj.rimR, obj.rimB);
        });

      TWEEN.add(twCorona);
      twCorona.start();
      activeThemeTweens.push(twCorona);
    }

    // Central Stellar Point Light
    if (starLight) {
      const tgtLight = new THREE.Color(theme.sun.lightColor);
      const twLight = new TWEEN.Tween({
        r: starLight.color.r, g: starLight.color.g, b: starLight.color.b,
        intensity: starLight.intensity
      })
        .to({
          r: tgtLight.r, g: tgtLight.g, b: tgtLight.b,
          intensity: theme.sun.lightIntensity
        }, duration)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onUpdate((obj) => {
          starLight.color.setRGB(obj.r, obj.g, obj.b);
          starLight.intensity = obj.intensity;
        });

      TWEEN.add(twLight);
      twLight.start();
      activeThemeTweens.push(twLight);
    }

    // Photon Ring Color & Opacity
    if (photonRing?.material) {
      const tgtRingCol = new THREE.Color(theme.sun.photonRingColor);
      const twRing = new TWEEN.Tween({
        r: photonRing.material.color.r, g: photonRing.material.color.g, b: photonRing.material.color.b,
        opacity: photonRing.material.opacity
      })
        .to({
          r: tgtRingCol.r, g: tgtRingCol.g, b: tgtRingCol.b,
          opacity: theme.sun.photonRingOpacity
        }, duration)
        .easing(TWEEN.Easing.Cubic.InOut)
        .onUpdate((obj) => {
          photonRing.material.color.setRGB(obj.r, obj.g, obj.b);
          photonRing.material.opacity = obj.opacity;
        });

      TWEEN.add(twRing);
      twRing.start();
      activeThemeTweens.push(twRing);
    }
  }

  // 3. Smoothly Interpolate Physical Scene Lighting
  if (ambientLightRef) {
    const tgtAmb = new THREE.Color(theme.lighting.ambientColor);
    const twAmb = new TWEEN.Tween({
      r: ambientLightRef.color.r, g: ambientLightRef.color.g, b: ambientLightRef.color.b,
      intensity: ambientLightRef.intensity
    })
      .to({
        r: tgtAmb.r, g: tgtAmb.g, b: tgtAmb.b,
        intensity: theme.lighting.ambientIntensity
      }, duration)
      .easing(TWEEN.Easing.Cubic.InOut)
      .onUpdate((obj) => {
        ambientLightRef.color.setRGB(obj.r, obj.g, obj.b);
        ambientLightRef.intensity = obj.intensity;
      });

    TWEEN.add(twAmb);
    twAmb.start();
    activeThemeTweens.push(twAmb);
  }

  if (keyLightRef) {
    const tgtKey = new THREE.Color(theme.lighting.keyColor);
    const twKey = new TWEEN.Tween({
      r: keyLightRef.color.r, g: keyLightRef.color.g, b: keyLightRef.color.b,
      intensity: keyLightRef.intensity
    })
      .to({
        r: tgtKey.r, g: tgtKey.g, b: tgtKey.b,
        intensity: theme.lighting.keyIntensity
      }, duration)
      .easing(TWEEN.Easing.Cubic.InOut)
      .onUpdate((obj) => {
        keyLightRef.color.setRGB(obj.r, obj.g, obj.b);
        keyLightRef.intensity = obj.intensity;
      });

    TWEEN.add(twKey);
    twKey.start();
    activeThemeTweens.push(twKey);
  }

  if (galacticRimRef) {
    const tgtRim = new THREE.Color(theme.lighting.rimColor);
    const twRim = new TWEEN.Tween({
      r: galacticRimRef.color.r, g: galacticRimRef.color.g, b: galacticRimRef.color.b,
      intensity: galacticRimRef.intensity
    })
      .to({
        r: tgtRim.r, g: tgtRim.g, b: tgtRim.b,
        intensity: theme.lighting.rimIntensity
      }, duration)
      .easing(TWEEN.Easing.Cubic.InOut)
      .onUpdate((obj) => {
        galacticRimRef.color.setRGB(obj.r, obj.g, obj.b);
        galacticRimRef.intensity = obj.intensity;
      });

    TWEEN.add(twRim);
    twRim.start();
    activeThemeTweens.push(twRim);
  }

  // 4. Update Volumetric Dust Cloud Colors
  if (dustCloudRef && dustCloudRef.geometry?.attributes?.color) {
    const colAttr = dustCloudRef.geometry.attributes.color;
    const count = colAttr.count;
    const colA = new THREE.Color(theme.particles.colorA);
    const colB = new THREE.Color(theme.particles.colorB);

    for (let i = 0; i < count; i++) {
      const u = (i % 52) / 51;
      const v = Math.floor(i / 52) / 51;
      const mixed = colA.clone().lerp(colB, (u + v) * 0.5);
      colAttr.setXYZ(i, mixed.r, mixed.g, mixed.b);
    }
    colAttr.needsUpdate = true;
  }

  return theme;
}

/**
 * Synchronizes galaxy environment themes to the active sector or market.
 * Sector filter shifts skybox tint and accent colors over 800ms.
 */
export function setSectorThemeSync(sector, marketKey = 'US') {
  const cat = (sector || 'ALL').toUpperCase();

  if (cat === 'CRYPTO & WEB3' || cat === 'CRYPTO') {
    return setGalaxyTheme('CRYPTO_NEBULA', 800);
  }
  if (cat === 'FIXED INCOME' || cat === 'BONDS') {
    return setGalaxyTheme('BONDS_STEADY', 800);
  }
  if (cat === 'EQUITIES') {
    return setGalaxyTheme(marketKey === 'IN' ? 'IN_BHARAT' : 'US_WALLSTREET', 800);
  }
  if (cat === 'INDEX FUNDS') {
    return setGalaxyTheme(marketKey === 'IN' ? 'IN_BHARAT' : 'US_WALLSTREET', 800);
  }
  if (cat === 'LIQUID CASH') {
    return setGalaxyTheme('BONDS_STEADY', 800);
  }

  // Default 'ALL' returns to active country market galaxy theme
  return setGalaxyTheme(marketKey === 'IN' ? 'IN_BHARAT' : 'US_WALLSTREET', 800);
}

/**
 * Per-frame animation updates for subtle cosmic starfield and pulsar flashes.
 */
export function updateGalaxyEnvironment(delta, elapsedTime) {
  // 1. Animate Shifting Pulsar Flash if active (Crypto Nebula Pulsar Star)
  if (isPulsarActive && centralSunRef?.userData?.starLight) {
    const flash = Math.pow(Math.sin(elapsedTime * (pulsarFreq || 5.2)), 8);
    const baseIntensity = GALAXY_THEMES[currentThemeKey]?.sun?.lightIntensity || 4.2;
    centralSunRef.userData.starLight.intensity = baseIntensity + flash * 2.8;

    if (centralSunRef.userData.starCorona) {
      const pulseScale = 1.0 + flash * 0.18;
      centralSunRef.userData.starCorona.scale.set(pulseScale, pulseScale, pulseScale);
    }
  }

  // 2. Calm, stationary starfield slow cosmic rotation
  if (starfieldParticlesRef) {
    starfieldParticlesRef.rotation.y = elapsedTime * 0.008;
  }
}
