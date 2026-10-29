/**
 * Spatial Wealth - Portfolio Macro Stress-Test & Celestial Risk Simulation
 * "Black Hole / Supernova Risk Simulation" Architecture
 *
 * Implements:
 * 1. Central Star & Black Hole Morph Architecture (window.centralMacroStar, accretion disk, void sphere)
 * 2. Defensive Golden Shields (IVV, TLT, BND, USD/Cash, Gold) & Volatile Orbit Decay/Debris
 * 3. Gravitational Sub-Bass Drone & Continuous Meta Quest Haptic Rumble
 */

import * as THREE from 'three';
import { playGravitationalDrone } from './audio.js';

// ============================================================================
// Simulation State Machine & Change Listeners
// ============================================================================
export let isStressTestActive = false;
let stressProgress = 0; // 0.0 = Normal, 1.0 = Total Black Hole Collapse

const stressChangeListeners = new Set();

export function onStressTestChange(callback) {
  if (typeof callback === 'function') {
    stressChangeListeners.add(callback);
  }
  return () => stressChangeListeners.delete(callback);
}

export function getStressProgress() {
  return stressProgress;
}

// ============================================================================
// Asset Classification Helpers (Defensive Hedge vs. Volatile Growth/Crypto)
// ============================================================================

/**
 * Identifies defensive capital preservation assets:
 * Gold, USD Cash, Sovereign Bonds (TLT, BND), Defensive Core Indices (IVV)
 */
export function isDefensiveAsset(item = {}) {
  if (!item) return false;
  const ticker = String(item.ticker || '').toUpperCase();
  const category = String(item.category || '').toLowerCase();
  const name = String(item.name || '').toLowerCase();

  // Explicit defensive tickers
  const defensiveTickers = ['IVV', 'TLT', 'BND', 'USD', 'GLD', 'GOLD', 'CASH', 'SHY', 'IEF', 'BIL', 'VGIT', 'AGG'];
  if (defensiveTickers.includes(ticker)) return true;

  // Categories with defensive flight-to-safety characteristics
  if (
    category.includes('fixed income') ||
    category.includes('cash') ||
    category.includes('commodities') ||
    category.includes('gold') ||
    category.includes('bond')
  ) {
    return true;
  }

  if (name.includes('treasury') || name.includes('bond') || name.includes('gold') || name.includes('cash')) {
    return true;
  }

  if (item.volatility === 'low') return true;

  return false;
}

/**
 * Identifies high-beta, growth tech, and speculative crypto assets vulnerable to macro shock
 */
export function isVolatileAsset(item = {}) {
  if (!item) return false;
  if (isDefensiveAsset(item)) return false;

  const ticker = String(item.ticker || '').toUpperCase();
  const category = String(item.category || '').toLowerCase();

  const volatileTickers = ['NVDA', 'BTC', 'ETH', 'TSLA', 'AAPL', 'MSFT', 'SOL', 'COIN', 'AMD', 'META', 'AMZN'];
  if (volatileTickers.includes(ticker)) return true;

  if (category.includes('crypto') || category.includes('tech') || item.volatility === 'high') {
    return true;
  }

  return true; // Default non-defensive assets experience macro shock in severe stress test
}

// ============================================================================
// 1. Central Star & Black Hole Morph Architecture
// ============================================================================

/**
 * Creates the high-resolution swirling neon orange/violet gradient canvas texture
 * for the black hole accretion disk with realistic Doppler asymmetry and spiral filaments.
 */
export function createAccretionDiskTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const cx = size / 2;
  const cy = size / 2;

  // Clear to transparent black
  ctx.clearRect(0, 0, size, size);

  // Concentric gradient rings with Doppler asymmetry and hot spots
  const maxR = size / 2;
  const minR = size * 0.18;

  // Radial base gradient: inner hot white/amber -> neon orange -> violet/magenta -> transparent edge
  const grad = ctx.createRadialGradient(cx, cy, minR, cx, cy, maxR);
  grad.addColorStop(0.00, 'rgba(255, 255, 255, 0.95)');
  grad.addColorStop(0.12, 'rgba(255, 170, 0, 0.95)');
  grad.addColorStop(0.35, 'rgba(249, 115, 22, 0.90)');
  grad.addColorStop(0.60, 'rgba(236, 72, 153, 0.75)');
  grad.addColorStop(0.82, 'rgba(139, 92, 246, 0.50)');
  grad.addColorStop(0.96, 'rgba(99, 102, 241, 0.20)');
  grad.addColorStop(1.00, 'rgba(15, 23, 42, 0.00)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
  ctx.fill();

  // Swirling logarithmic spiral filament streaks
  ctx.save();
  ctx.translate(cx, cy);
  const spiralArms = 42;
  for (let i = 0; i < spiralArms; i++) {
    const startAngle = (i / spiralArms) * Math.PI * 2;
    ctx.beginPath();
    ctx.lineWidth = 2 + Math.random() * 3.5;
    const isHotStreak = i % 3 === 0;
    ctx.strokeStyle = isHotStreak
      ? 'rgba(255, 220, 100, 0.85)'
      : 'rgba(244, 63, 94, 0.65)';

    for (let r = minR; r < maxR; r += 6) {
      const angle = startAngle + (r / maxR) * 3.2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (r === minR) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // Punch out inner event horizon core void
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, minR * 0.92, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates the central celestial body representing Portfolio Liquidity / Macro Benchmark:
 * - Central Star Group (`centralMacroStarGroup`)
 *   - Star Mesh: SphereGeometry (radius 0.10m), MeshStandardMaterial({ emissive: 0xf59e0b, emissiveIntensity: 1.2, color: 0xffd54f, roughness: 0.1 })
 *   - Dormant Corona Glow: radius 0.14m, color 0xfbbf24, opacity 0.25, transparent
 *   - Swirling Black Hole Accretion Disk (visible = false initially):
 *       textured double-sided RingGeometry (innerRadius: 0.11m, outerRadius: 0.28m) with neon orange/violet gradient
 *   - Inner pitch-black void sphere: radius 0.095m, color 0x000000, roughness 1.0
 */
export function createCentralMacroStar(options = {}) {
  const centralMacroStarGroup = new THREE.Group();
  centralMacroStarGroup.name = 'CentralMacroStarGroup';

  const scale = options.scale || 1.0;

  // 1. Pitch-Black Inner Void Sphere (radius 0.095m)
  const voidGeo = new THREE.SphereGeometry(0.095 * scale, 36, 36);
  const voidMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    roughness: 1.0,
    metalness: 0.0
  });
  const voidSphere = new THREE.Mesh(voidGeo, voidMat);
  voidSphere.name = 'BlackHoleVoidSphere';
  centralMacroStarGroup.add(voidSphere);

  // 2. Star Mesh (SphereGeometry radius 0.10m)
  const starGeo = new THREE.SphereGeometry(0.10 * scale, 48, 48);
  const starMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xffd54f),
    emissive: new THREE.Color(0xf59e0b),
    emissiveIntensity: 1.2,
    roughness: 0.1,
    metalness: 0.05
  });
  const starMesh = new THREE.Mesh(starGeo, starMat);
  starMesh.name = 'CentralMacroStarMesh';
  starMesh.userData.isCentralStar = true;
  starMesh.userData.isInteractive = true;
  starMesh.userData.baseRadius = 0.10 * scale;
  centralMacroStarGroup.add(starMesh);

  // 3. Dormant Corona Glow (radius 0.14m halo)
  const coronaGeo = new THREE.SphereGeometry(0.14 * scale, 32, 32);
  const coronaMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    transparent: true,
    opacity: 0.25,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const coronaGlow = new THREE.Mesh(coronaGeo, coronaMat);
  coronaGlow.name = 'DormantCoronaGlow';
  centralMacroStarGroup.add(coronaGlow);

  // 4. Swirling Black Hole Accretion Disk (inner: 0.11m, outer: 0.28m)
  const diskGeo = new THREE.RingGeometry(0.11 * scale, 0.28 * scale, 64);
  const diskTex = createAccretionDiskTexture();
  const diskMat = new THREE.MeshBasicMaterial({
    map: diskTex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const accretionDisk = new THREE.Mesh(diskGeo, diskMat);
  accretionDisk.name = 'AccretionDisk';
  accretionDisk.rotation.x = Math.PI / 2.35;
  accretionDisk.visible = false;
  centralMacroStarGroup.add(accretionDisk);

  // Wire cross-references for simulation controllers
  starMesh.userData.accretionDisk = accretionDisk;
  starMesh.userData.coronaGlow = coronaGlow;
  starMesh.userData.voidSphere = voidSphere;
  starMesh.userData.centralGroup = centralMacroStarGroup;

  // Register in browser environment for ubiquitous access
  if (typeof window !== 'undefined') {
    window.centralMacroStar = starMesh;
    window.centralMacroStarGroup = centralMacroStarGroup;
  }

  return {
    centralMacroStarGroup,
    starMesh,
    coronaGlow,
    accretionDisk,
    voidSphere
  };
}

// ============================================================================
// 2. Defensive Shield Envelopes & Debris Emitters on Planets
// ============================================================================

/**
 * Attaches defensive golden wireframe shield or volatile orbit decay metadata & debris emitter
 * to a planetary asset node:
 * - Defensive assets (IVV, TLT, BND, USD Cash, Gold):
 *     Attaches a Protective Golden Shield Icosahedron wireframe mesh (color: 0xfacc15, opacity: 0.0 initially).
 * - Volatile growth tech & crypto:
 *     Flags `planetNode.userData.isVolatile = true;` and stores `originalOrbitRadius`.
 *     Attaches micro debris particle emitter for gravitational tidal shredding.
 */
export function attachPlanetStressComponents(planetNode, item = {}, planetRadius = 0.5, orbitRadius = 5.0) {
  if (!planetNode) return planetNode;

  const isDefensive = isDefensiveAsset(item);
  const isVolatile = !isDefensive || isVolatileAsset(item);

  planetNode.userData.originalOrbitRadius = orbitRadius;
  planetNode.userData.currentOrbitRadius = orbitRadius;

  // Defensive golden shield envelope
  if (isDefensive) {
    const shieldGeo = new THREE.IcosahedronGeometry(planetRadius * 1.4, 2);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      wireframe: true,
      transparent: true,
      opacity: 0.0
    });
    const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    shieldMesh.name = `ShieldMesh_${item.ticker || item.id || ''}`;
    planetNode.userData.shieldMesh = shieldMesh;
    planetNode.add(shieldMesh);
  }

  // Volatile assets flag & tidal debris particles
  if (isVolatile) {
    planetNode.userData.isVolatile = true;

    const debrisCount = 20;
    const debrisGeo = new THREE.BufferGeometry();
    const debrisPos = new Float32Array(debrisCount * 3);
    for (let i = 0; i < debrisCount; i++) {
      debrisPos[i * 3] = (Math.random() - 0.5) * planetRadius * 1.6;
      debrisPos[i * 3 + 1] = (Math.random() - 0.5) * planetRadius * 1.6;
      debrisPos[i * 3 + 2] = (Math.random() - 0.5) * planetRadius * 1.6;
    }
    debrisGeo.setAttribute('position', new THREE.BufferAttribute(debrisPos, 3));

    const debrisMat = new THREE.PointsMaterial({
      color: new THREE.Color(item.color || 0xef4444),
      size: Math.max(0.02, planetRadius * 0.08),
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const debrisEmitter = new THREE.Points(debrisGeo, debrisMat);
    debrisEmitter.name = `DebrisEmitter_${item.ticker || item.id || ''}`;
    planetNode.userData.debrisEmitter = debrisEmitter;
    planetNode.add(debrisEmitter);
  }

  return planetNode;
}

// ============================================================================
// 3. Simulation Controller & State Machine
// ============================================================================

/**
 * Triggers the interactive Macro Stress-Test:
 * Collapses the central body into a supermassive black hole with gravitational drone & Quest controller rumble,
 * or smoothly restores cosmic market equilibrium.
 */
export function triggerMacroStressTest(enable = true, controller = null) {
  isStressTestActive = enable;
  console.log(`[Stress Test] ${enable ? 'COLLAPSING INTO BLACK HOLE' : 'RESTORING EQUILIBRIUM'}`);

  // Synthesize Gravitational Sub-Bass Drone using Web Audio
  playGravitationalDrone(enable);

  // Trigger continuous controller rumble on Quest
  if (controller?.userData?.inputSource?.gamepad?.hapticActuators?.[0] && enable) {
    try {
      controller.userData.inputSource.gamepad.hapticActuators[0].pulse(0.7, 400);
    } catch (e) {}
  }

  // Notify registered callbacks (HUD, chart windows, VR wrist dock)
  stressChangeListeners.forEach((listener) => {
    try {
      listener(enable, stressProgress);
    } catch (e) {
      console.warn('[Stress Test] Listener error:', e);
    }
  });

  // Global window event dispatch for decoupled components
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('macro-stress-test', {
        detail: { active: enable, progress: stressProgress }
      })
    );
  }
}

/**
 * Simulation tick loop animation for stress test:
 * - Morphs central body from glowing benchmark star into pitch-black void with swirling accretion disk.
 * - Activates glowing golden wireframe shields on defensive assets.
 * - Simulates jitter shake, tidal debris shedding, and inward orbital decay on volatile tech assets.
 */
export function tickStressTest(delta) {
  const target = isStressTestActive ? 1.0 : 0.0;
  stressProgress += (target - stressProgress) * delta * 2.5;

  // 1. Morph Central Body
  if (window.centralMacroStar) {
    const star = window.centralMacroStar;
    // Shrink and turn pitch-black
    star.material.emissiveIntensity = THREE.MathUtils.lerp(1.2, 0.0, stressProgress);
    star.material.color.lerpColors(new THREE.Color(0xffd54f), new THREE.Color(0x000000), stressProgress);

    // Reveal and rotate swirling accretion disk
    if (star.userData.accretionDisk) {
      star.userData.accretionDisk.visible = stressProgress > 0.05;
      star.userData.accretionDisk.rotation.z += delta * 3.5;
      star.userData.accretionDisk.material.opacity = stressProgress * 0.85;
    }

    // Dim dormant corona glow as it collapses past event horizon
    if (star.userData.coronaGlow) {
      star.userData.coronaGlow.material.opacity = THREE.MathUtils.lerp(0.25, 0.0, stressProgress);
    }
  }

  // Also smoothly morph centralSun if in scene
  if (window.centralSun) {
    const cs = window.centralSun;
    if (cs.userData?.starLight) {
      cs.userData.starLight.intensity = THREE.MathUtils.lerp(3.2, 0.25, stressProgress);
      cs.userData.starLight.color.lerpColors(
        new THREE.Color(0xffedd5),
        new THREE.Color(0x8b5cf6),
        stressProgress
      );
    }
    if (cs.userData?.photonRing) {
      cs.userData.photonRing.material.opacity = THREE.MathUtils.lerp(0.35, 0.0, stressProgress);
    }
    if (cs.userData?.starCorona) {
      cs.userData.starCorona.material.opacity = THREE.MathUtils.lerp(0.85, 0.1, stressProgress);
    }
  }

  // 2. Animate Planets (Defensive shields glow gold, volatile assets decay and jitter)
  const processPlanet = (node) => {
    if (!node || !node.userData) return;

    // Defensive Shields glow gold
    if (node.userData?.shieldMesh) {
      node.userData.shieldMesh.material.opacity = THREE.MathUtils.lerp(0.0, 0.75, stressProgress);
      node.userData.shieldMesh.rotation.y += delta * 1.5;
    }

    // Volatile assets jitter and pull inward toward the black hole
    if (node.userData?.isVolatile && node.userData.originalOrbitRadius) {
      if (stressProgress > 0.1) {
        // Jitter shake
        node.position.x += (Math.random() - 0.5) * 0.008 * stressProgress;
        node.position.y += (Math.random() - 0.5) * 0.008 * stressProgress;
      }
      // Inward orbit decay
      node.userData.currentOrbitRadius = THREE.MathUtils.lerp(
        node.userData.originalOrbitRadius,
        node.userData.originalOrbitRadius * 0.65,
        stressProgress
      );

      // Animate Debris Particle Emitter
      if (node.userData.debrisEmitter) {
        node.userData.debrisEmitter.material.opacity = THREE.MathUtils.lerp(0.0, 0.85, stressProgress);
        node.userData.debrisEmitter.rotation.y += delta * 2.2;
      }
    }
  };

  if (window.solarSystemGroup) {
    window.solarSystemGroup.children.forEach((node) => {
      processPlanet(node);
      if (node.children && node.children.length > 0) {
        node.children.forEach((child) => processPlanet(child));
      }
    });
  }

  if (window.planetsGroup) {
    window.planetsGroup.children.forEach((planetAnchor) => {
      processPlanet(planetAnchor);
    });
  }
}

export { playGravitationalDrone };
