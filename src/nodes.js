/**
 * Spatial Wealth - Photorealistic Celestial Body Ecosystem
 * Decluttered Minimal Ticker Labels with Hover Expansion, Spread Orbits (5.0 + i * 2.8),
 * Balanced Amber Sun & Photorealistic Terrestrial/Gas/Asteroid Worlds.
 */

import * as THREE from 'three';
import { Text } from 'troika-three-text';
import * as TWEEN from '@tweenjs/tween.js';
import {
  createSolarGranulationMaterial,
  createSolarCoronaAuraMaterial,
  createRayleighAtmosphereMaterial
} from './shaders.js';
import {
  createGasGiantTexture,
  createRockyPlanetTexture,
  createBumpMap,
  createRingTexture,
  createAsteroidTexture
} from './textures.js';
import { soundFx } from './audio.js';
import { cashFlowStreams, expenseStreams } from './data.js';

// Singleton persistent planets container
export const planetsGroup = new THREE.Group();
planetsGroup.name = 'PlanetsContainerGroup';

/**
 * Creates the central Star with convective solar granulation & balanced amber corona aura.
 */
export function createCentralSun(summaryData = {}) {
  const starGroup = new THREE.Group();
  starGroup.name = 'CentralSunGroup';

  // 1. Convective Granulation Plasma Core (Toned down intensity 1.2)
  const coreGeo = new THREE.SphereGeometry(1.22, 48, 48);
  const coreMat = createSolarGranulationMaterial();
  const starCore = new THREE.Mesh(coreGeo, coreMat);
  starCore.name = 'SolarCore';
  starGroup.add(starCore);

  // 2. Outer Inverted-Normal Corona Aura
  const coronaGeo = new THREE.SphereGeometry(1.56, 36, 36);
  const coronaMat = createSolarCoronaAuraMaterial();
  const starCorona = new THREE.Mesh(coronaGeo, coronaMat);
  starCorona.name = 'SolarCorona';
  starGroup.add(starCorona);

  // 3. Central Stellar Point Light (Physical inverse-square decay, balanced 3.2)
  const starLight = new THREE.PointLight(0xffedd5, 3.2, 75, 1.3);
  starLight.castShadow = true;
  starLight.shadow.mapSize.width = 2048;
  starLight.shadow.mapSize.height = 2048;
  starLight.shadow.bias = -0.0005;
  starGroup.add(starLight);

  // 4. Subtle Photon Sphere Orbit Ring
  const ringGeo = new THREE.RingGeometry(1.92, 1.98, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.35
  });
  const photonRing = new THREE.Mesh(ringGeo, ringMat);
  photonRing.rotation.x = Math.PI / 2;
  starGroup.add(photonRing);

  // 5. Floating 3D Portfolio Net Worth Header
  const labelNetWorth = new Text();
  labelNetWorth.text = `${summaryData.formattedNetWorth || '$1,245,000'}\nTOTAL NET WORTH`;
  labelNetWorth.fontSize = 0.34;
  labelNetWorth.color = 0xffffff;
  labelNetWorth.anchorX = 'center';
  labelNetWorth.anchorY = 'bottom';
  labelNetWorth.position.set(0, 2.2, 0);
  labelNetWorth.textAlign = 'center';
  labelNetWorth.outlineWidth = 0.022;
  labelNetWorth.outlineColor = 0x030712;
  labelNetWorth.sync();
  starGroup.add(labelNetWorth);

  starGroup.userData = {
    starCore,
    coreMat,
    starCorona,
    coronaMat,
    photonRing,
    starLight,
    labelNetWorth
  };

  return starGroup;
}

/**
 * Creates concentric planetary orbit track rings with comfortable spread (5.0 + index * 2.8).
 */
export function createOrbitPaths(items = [], activeCategory = 'ALL') {
  const orbitsGroup = new THREE.Group();
  orbitsGroup.name = 'OrbitPathsGroup';

  const catUpper = (activeCategory || 'ALL').toUpperCase();
  const filtered = catUpper === 'ALL'
    ? items
    : items.filter((i) => (i.category || '').toUpperCase() === catUpper);

  filtered.forEach((item, index) => {
    // Spread orbit radius: 5.0 + index * 2.8
    const orbitR = 5.0 + (index * 2.8);
    const segments = 128;
    const points = [];

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(theta) * orbitR, 0, Math.sin(theta) * orbitR));
    }

    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(item.color || 0x00f0ff),
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending
    });
    const orbitLine = new THREE.Line(lineGeo, lineMat);
    orbitsGroup.add(orbitLine);
  });

  return orbitsGroup;
}

/**
 * Photorealistic Planet Factory: creates gas giants with rings, rocky worlds with polar caps, or asteroid swarms.
 */
export function createPhotorealisticPlanet(item, index, count) {
  const anchor = new THREE.Group();
  anchor.name = `PlanetAnchor_${item.id || index}`;

  const alloc = Number(item.allocation) || 10;
  const radius = Math.max(0.42, Math.min(1.2, (alloc / 100) * 2.4));
  const isGasGiant = alloc >= 12 || (item.category === 'Equities' && alloc >= 10);
  const isCashDebris = item.category === 'Liquid Cash' || item.ticker === 'USD';

  let primaryMesh = null;
  // Spread orbit radius: 5.0 + index * 2.8
  const orbitR = 5.0 + (index * 2.8);
  const angle = (index / Math.max(1, count)) * Math.PI * 2;
  anchor.position.set(Math.cos(angle) * orbitR, 0, Math.sin(angle) * orbitR);

  if (isCashDebris) {
    // 1. Asteroid Belt / Micro-Holding Swarm
    const asteroidGroup = new THREE.Group();
    asteroidGroup.name = `Asteroids_${item.id}`;

    const coreGeo = new THREE.DodecahedronGeometry(radius * 0.55, 1);
    const rockTex = createAsteroidTexture();
    const coreMat = new THREE.MeshStandardMaterial({
      map: rockTex,
      bumpMap: rockTex,
      bumpScale: 0.08,
      roughness: 0.95,
      metalness: 0.2
    });
    primaryMesh = new THREE.Mesh(coreGeo, coreMat);
    primaryMesh.castShadow = true;
    primaryMesh.receiveShadow = true;
    asteroidGroup.add(primaryMesh);

    const asteroidCount = 14;
    const asteroidMat = new THREE.MeshStandardMaterial({
      map: rockTex,
      roughness: 0.95,
      metalness: 0.15
    });

    for (let i = 0; i < asteroidCount; i++) {
      const astGeo = new THREE.DodecahedronGeometry(0.08 + Math.random() * 0.08, 0);
      const astMesh = new THREE.Mesh(astGeo, asteroidMat);
      const theta = (i / asteroidCount) * Math.PI * 2 + Math.random() * 0.4;
      const dist = radius * 1.15 + Math.random() * 0.6;
      const yOffset = (Math.random() - 0.5) * 0.4;
      astMesh.position.set(Math.cos(theta) * dist, yOffset, Math.sin(theta) * dist);
      astMesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      astMesh.castShadow = true;
      asteroidGroup.add(astMesh);
    }

    anchor.add(asteroidGroup);
    anchor.userData.asteroidGroup = asteroidGroup;

  } else if (isGasGiant) {
    // 2. Atmospheric Gas Giant with Storm Bands & Rayleigh Scattering
    const sphereGeo = new THREE.SphereGeometry(radius, 40, 40);

    const baseColor = new THREE.Color(item.color || '#c28b5b');
    const secondaryColor = baseColor.clone().offsetHSL(0.05, -0.2, 0.15);
    const stormColor = baseColor.clone().offsetHSL(-0.08, 0.3, -0.15);

    const gasTexture = createGasGiantTexture(
      `#${baseColor.getHexString()}`,
      `#${secondaryColor.getHexString()}`,
      `#${stormColor.getHexString()}`
    );

    const gasMat = new THREE.MeshStandardMaterial({
      map: gasTexture,
      roughness: 0.82,
      metalness: 0.08,
      emissive: baseColor,
      emissiveIntensity: 0.05
    });

    primaryMesh = new THREE.Mesh(sphereGeo, gasMat);
    primaryMesh.name = `GasGiant_${item.id}`;
    primaryMesh.castShadow = true;
    primaryMesh.receiveShadow = true;
    anchor.add(primaryMesh);

    // Rayleigh Atmospheric Scattering Shell
    const atmosGeo = new THREE.SphereGeometry(radius * 1.08, 32, 32);
    const atmosMat = createRayleighAtmosphereMaterial(item.color || 0x38bdf8, 2.5, 0.38);
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    anchor.add(atmosMesh);
    anchor.userData.atmosMat = atmosMat;

    // Detailed Saturn-like Rings for major allocations
    if (alloc >= 13 || item.ticker === 'IVV' || item.ticker === 'TLT') {
      const innerR = radius * 1.35;
      const outerR = radius * 2.25;
      const ringGeo = new THREE.RingGeometry(innerR, outerR, 48);

      const pos = ringGeo.attributes.position;
      const v3 = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v3.fromBufferAttribute(pos, i);
        const dist = v3.length();
        const u = (dist - innerR) / (outerR - innerR);
        ringGeo.attributes.uv.setXY(i, u, 0.5);
      }

      const ringTexture = createRingTexture(item.color || '#d4af37');
      const ringMat = new THREE.MeshStandardMaterial({
        map: ringTexture,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.88,
        roughness: 0.7,
        metalness: 0.1
      });

      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2.35;
      ringMesh.rotation.y = 0.15;
      ringMesh.castShadow = true;
      ringMesh.receiveShadow = true;
      anchor.add(ringMesh);
      anchor.userData.ringMesh = ringMesh;
    }

  } else {
    // 3. Textured Terrestrial / Rocky Planet with Continents, Polar Caps & Bump Map
    const sphereGeo = new THREE.SphereGeometry(radius, 36, 36);

    const baseColor = new THREE.Color(item.color || '#64748b');
    const accentColor = item.category === 'Crypto & Web3'
      ? new THREE.Color('#ec4899')
      : baseColor.clone().offsetHSL(0.08, 0.2, -0.1);

    const rockyTexture = createRockyPlanetTexture(
      `#${baseColor.getHexString()}`,
      `#${accentColor.getHexString()}`,
      0.7
    );
    const bumpMap = createBumpMap(1.2);

    const rockyMat = new THREE.MeshStandardMaterial({
      map: rockyTexture,
      bumpMap: bumpMap,
      bumpScale: 0.055,
      roughness: 0.86,
      metalness: 0.22,
      emissive: baseColor,
      emissiveIntensity: 0.04
    });

    primaryMesh = new THREE.Mesh(sphereGeo, rockyMat);
    primaryMesh.name = `RockyPlanet_${item.id}`;
    primaryMesh.castShadow = true;
    primaryMesh.receiveShadow = true;
    anchor.add(primaryMesh);
  }

  // 4. Decluttered Minimal Floating Ticker Label (Expanded on Hover/Select)
  const textLabel = new Text();
  textLabel.text = item.ticker || item.name; // Minimal default: just the ticker
  textLabel.fontSize = 0.18;
  textLabel.color = 0xffffff;
  textLabel.anchorX = 'center';
  textLabel.anchorY = 'bottom';
  textLabel.position.set(0, radius + 0.35, 0);
  textLabel.textAlign = 'center';
  textLabel.outlineWidth = 0.015;
  textLabel.outlineColor = 0x030712;
  textLabel.sync();
  anchor.add(textLabel);

  // Store label text variants for dynamic expansion on hover
  textLabel.userData = {
    minimalText: item.ticker || item.name,
    expandedText: `${item.name} (${item.ticker})\n${alloc}% • ${item.formattedReturns || '+0%'}`
  };

  // Interaction metadata
  if (primaryMesh) {
    primaryMesh.userData = {
      ...item,
      isAssetNode: true,
      parentAnchor: anchor,
      radius,
      color: item.color || '#00f0ff',
      textLabel
    };
  }

  anchor.userData = {
    ...item,
    isAssetNode: true,
    orbitR,
    angle,
    speed: 0.14 / (index + 1),
    radius,
    primaryMesh,
    textLabel
  };

  anchor.scale.set(1.0, 1.0, 1.0);
  return { anchor, primaryMesh, textLabel };
}

/**
 * Bulletproof renderer: populates photorealistic planet nodes into singleton planetsGroup.
 */
export function renderAssetNodes(items = [], activeCategory = 'ALL') {
  while (planetsGroup.children.length > 0) {
    const obj = planetsGroup.children[0];
    obj.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
    planetsGroup.remove(obj);
  }

  const catUpper = (activeCategory || 'ALL').toUpperCase();
  const filtered = catUpper === 'ALL'
    ? items
    : items.filter((i) => (i.category || '').toUpperCase() === catUpper);

  const count = filtered.length;
  if (count === 0) return [];

  filtered.forEach((item, index) => {
    const { anchor } = createPhotorealisticPlanet(item, index, count);
    planetsGroup.add(anchor);
  });

  return planetsGroup.children;
}

/**
 * Highlights a planet mesh on hover and expands minimal ticker into detailed metrics.
 */
export function setNodeHoverState(mesh, isHovered) {
  if (!mesh || !mesh.userData) return;

  if (isHovered) soundFx.playHoverSound();

  const targetScale = isHovered ? 1.22 : 1.0;
  const targetEmissive = isHovered ? 0.35 : 0.04;

  const parentAnchor = mesh.userData.parentAnchor || mesh;
  const twScale = new TWEEN.Tween(parentAnchor.scale)
    .to({ x: targetScale, y: targetScale, z: targetScale }, 180)
    .easing(TWEEN.Easing.Cubic.Out);
  TWEEN.add(twScale);
  twScale.start();

  if (mesh.material && mesh.material.emissiveIntensity !== undefined) {
    const twMat = new TWEEN.Tween(mesh.material)
      .to({ emissiveIntensity: targetEmissive }, 180)
      .easing(TWEEN.Easing.Cubic.Out);
    TWEEN.add(twMat);
    twMat.start();
  }

  // Expand / collapse 3D label on hover (only if label is visible / chart not active)
  const label = mesh.userData.textLabel;
  if (label && label.userData && label.visible) {
    label.text = isHovered ? label.userData.expandedText : label.userData.minimalText;
    label.fontSize = isHovered ? 0.22 : 0.18;
    label.color = isHovered ? 0x00f0ff : 0xffffff;
    label.sync();
  }
}

const _tempCamPos = new THREE.Vector3();
const _tempCamQuat = new THREE.Quaternion();

/**
 * Aligns Troika 3D text labels to camera orientation with distance scaling and depth fading.
 */
export function billboardLabels(camera, centralSun) {
  if (!camera) return;

  camera.getWorldPosition(_tempCamPos);
  camera.getWorldQuaternion(_tempCamQuat);

  planetsGroup.children.forEach((anchor) => {
    const label = anchor.userData?.textLabel;
    if (label) {
      // Calculate distance for smooth depth scaling & fading
      const dist = _tempCamPos.distanceTo(anchor.position);
      const alpha = THREE.MathUtils.clamp(1.25 - (dist - 10) / 42, 0.25, 1.0);
      const scale = THREE.MathUtils.clamp(dist * 0.048, 0.75, 1.3);

      label.fillOpacity = alpha;
      label.outlineOpacity = alpha * 0.8;
      label.scale.set(scale, scale, scale);
      label.quaternion.copy(_tempCamQuat);
    }
  });

  if (centralSun?.userData?.labelNetWorth) {
    centralSun.userData.labelNetWorth.quaternion.copy(_tempCamQuat);
  }
}

/**
 * Controls visibility of all planetary floating text labels.
 * When a planet is selected, hides other background labels so they don't bleed through the chart plate.
 * When closed / reset view, restores visibility to all active labels.
 * @param {THREE.Mesh|null} activePlanetMesh The currently inspected planet mesh, or null to restore all
 */
export function setLabelsOcclusionState(activePlanetMesh = null) {
  planetsGroup.children.forEach((anchor) => {
    const label = anchor.userData?.textLabel;
    if (label) {
      if (activePlanetMesh) {
        label.visible = false;
      } else {
        label.visible = true;
      }
    }
  });
}

/**
 * Animates celestial bodies: solar convective granulation, corona pulse, planetary spin, rings & asteroids.
 */
export function updateCelestialAnimations(delta, elapsedTime, isAutoOrbiting = true, centralSun = null) {
  // 1. Update Solar Core & Corona Aura Shaders & Accretion Impact Pulses
  if (centralSun?.userData) {
    if (centralSun.userData.coreMat?.uniforms) {
      centralSun.userData.coreMat.uniforms.uTime.value = elapsedTime;
    }
    if (centralSun.userData.coronaMat?.uniforms) {
      centralSun.userData.coronaMat.uniforms.uTime.value = elapsedTime;
    }
    if (centralSun.userData.photonRing) {
      centralSun.userData.photonRing.rotation.z += delta * 0.2;
    }

    // Solar Radiant Pulse Ripple on Cash Accretion Impact
    const pulse = centralSun.userData.solarPulseIntensity || 0;
    if (pulse > 0.001) {
      centralSun.userData.solarPulseIntensity = pulse * Math.pow(0.08, delta);
      const coreScale = 1.0 + pulse * 0.08;
      const coronaScale = 1.0 + pulse * 0.12;

      if (centralSun.userData.starCore) {
        centralSun.userData.starCore.scale.set(coreScale, coreScale, coreScale);
      }
      if (centralSun.userData.starCorona) {
        centralSun.userData.starCorona.scale.set(coronaScale, coronaScale, coronaScale);
      }
      if (centralSun.userData.photonRing) {
        centralSun.userData.photonRing.material.opacity = 0.35 + pulse * 0.45;
      }
      if (centralSun.userData.starLight) {
        centralSun.userData.starLight.intensity = 3.2 + pulse * 1.8;
      }
    } else if (pulse !== 0) {
      centralSun.userData.solarPulseIntensity = 0;
      if (centralSun.userData.starCore) centralSun.userData.starCore.scale.set(1.0, 1.0, 1.0);
      if (centralSun.userData.starCorona) centralSun.userData.starCorona.scale.set(1.0, 1.0, 1.0);
      if (centralSun.userData.photonRing) centralSun.userData.photonRing.material.opacity = 0.35;
      if (centralSun.userData.starLight) centralSun.userData.starLight.intensity = 3.2;
    }
  }

  // 2. Animate Planetary Orbits, Self-Rotation & Asteroids
  planetsGroup.children.forEach((anchor) => {
    const data = anchor.userData;
    if (!data) return;

    if (isAutoOrbiting && data.orbitR) {
      data.angle += data.speed * delta * 0.7;
      anchor.position.x = Math.cos(data.angle) * data.orbitR;
      anchor.position.z = Math.sin(data.angle) * data.orbitR;
    }

    // Self-spin
    if (data.primaryMesh) {
      data.primaryMesh.rotation.y += delta * 0.4;
    }

    // Asteroid belt Keplerian tumbling
    if (anchor.userData.asteroidGroup) {
      anchor.userData.asteroidGroup.rotation.y += delta * 0.32;
      anchor.userData.asteroidGroup.children.forEach((ast, i) => {
        ast.rotation.x += delta * (0.45 + i * 0.1);
        ast.rotation.y += delta * (0.3 + i * 0.05);
      });
    }

    // Ring tilt drift
    if (anchor.userData.ringMesh) {
      anchor.userData.ringMesh.rotation.z += delta * 0.08;
    }
  });
}

/**
 * Creates and exports the Budget Cash-Flow Gravitational Accretion Particle Stream.
 * Generates logarithmic spiral trajectories for Active Income, Dividend Yield, and Staking Rewards
 * spiraling into the central solar net worth star with shifting plasma color gradients.
 */
export function createCashFlowStream(scene) {
  const streamGroup = new THREE.Group();
  streamGroup.name = 'CashFlowAccretionGroup';

  const particleCount = 270;
  const streamColors = (cashFlowStreams && cashFlowStreams.length > 0)
    ? cashFlowStreams.map((s) => new THREE.Color(s.color || '#00f0ff'))
    : [new THREE.Color('#10b981'), new THREE.Color('#06b6d4'), new THREE.Color('#f59e0b')];
  const plasmaColor = new THREE.Color(0xfbbf24);
  const coreHotColor = new THREE.Color(0xffffff);

  // Instanced micro-sphere geometry
  const sphereGeo = new THREE.SphereGeometry(0.045, 8, 8);
  const streamMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const instancedMesh = new THREE.InstancedMesh(sphereGeo, streamMaterial, particleCount);
  instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (instancedMesh.instanceColor) {
    instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }

  // State arrays for particles
  const particles = [];
  const dummyMatrix = new THREE.Matrix4();
  const dummyPos = new THREE.Vector3();
  const dummyScale = new THREE.Vector3();
  const dummyQuat = new THREE.Quaternion();
  const tempColor = new THREE.Color();

  const numStreams = Math.max(1, streamColors.length);
  const particlesPerStream = Math.floor(particleCount / numStreams);

  for (let i = 0; i < particleCount; i++) {
    const streamIndex = i % numStreams;
    // Disperse progress along spiral trajectory evenly with sub-jitter
    const progress = (Math.floor(i / numStreams) / particlesPerStream) + (Math.random() * 0.05);

    const p = {
      index: i,
      streamIndex,
      progress: progress % 1.0,
      speed: 0.065 + Math.random() * 0.045,
      armAngle: streamIndex * ((2 * Math.PI) / numStreams),
      radiusJitter: (Math.random() - 0.5) * 0.7,
      yJitter: (Math.random() - 0.5) * 0.45,
      angleJitter: (Math.random() - 0.5) * 0.28,
      baseScale: 0.75 + Math.random() * 0.6
    };

    particles.push(p);

    // Initial dummy placement
    dummyMatrix.makeTranslation(0, 0, 0);
    instancedMesh.setMatrixAt(i, dummyMatrix);
    instancedMesh.setColorAt(i, streamColors[streamIndex]);
  }

  instancedMesh.instanceMatrix.needsUpdate = true;
  if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

  streamGroup.add(instancedMesh);
  if (scene) scene.add(streamGroup);

  const streamController = {
    group: streamGroup,
    instancedMesh,
    material: streamMaterial,
    isEnabled: true,
    targetOpacity: 0.85,

    /**
     * Smoothly fades particle stream opacity in or out using Tween.js.
     */
    setOpacity(target, duration = 600) {
      this.targetOpacity = target;
      if (target > 0) {
        streamGroup.visible = true;
        this.isEnabled = true;
      }

      const tw = new TWEEN.Tween(streamMaterial)
        .to({ opacity: target * 0.85 }, duration)
        .easing(TWEEN.Easing.Cubic.Out)
        .onComplete(() => {
          if (target <= 0.001) {
            streamGroup.visible = false;
            this.isEnabled = false;
          }
        });
      TWEEN.add(tw);
      tw.start();
    },

    /**
     * Advances particles along logarithmic spiral trajectories toward central sun.
     */
    update(delta, elapsedTime, centralSun) {
      if (!this.isEnabled && streamMaterial.opacity <= 0.001) return;

      let impactsThisFrame = 0;

      for (let i = 0; i < particleCount; i++) {
        const p = particles[i];
        const t = p.progress;

        // Gravitational acceleration as particle approaches central singularity
        const accel = 1.0 + 3.2 * t * t;
        p.progress += delta * p.speed * accel;

        // Check if particle impacts central sun (r < 0.8 or t >= 1.0)
        if (p.progress >= 1.0) {
          p.progress = p.progress % 1.0;
          p.radiusJitter = (Math.random() - 0.5) * 0.7;
          p.yJitter = (Math.random() - 0.5) * 0.45;
          p.angleJitter = (Math.random() - 0.5) * 0.28;
          impactsThisFrame++;
        }

        // Spiral Coordinates: r ~ 22.0 down to ~ 0.55, y ~ 3.6 down to ~ 0.0
        const progressClamped = THREE.MathUtils.clamp(p.progress, 0, 1);
        const invT = 1.0 - progressClamped;
        const r = 21.5 * Math.pow(invT, 0.88) + 0.55 + p.radiusJitter * invT;
        const theta = p.armAngle + p.angleJitter + (4.2 * Math.PI * progressClamped) + (elapsedTime * 0.08);
        const y = 3.6 * Math.pow(invT, 1.25) * Math.cos(progressClamped * Math.PI * 0.5) + p.yJitter * invT;

        const x = Math.cos(theta) * r;
        const z = Math.sin(theta) * r;

        // Micro scale pulsation & compression
        const scaleMul = p.baseScale * (0.85 + 0.35 * Math.sin(elapsedTime * 4.0 + i)) * (1.0 + progressClamped * 0.5);
        dummyPos.set(x, y, z);
        dummyScale.set(scaleMul, scaleMul, scaleMul);
        dummyMatrix.compose(dummyPos, dummyQuat, dummyScale);
        instancedMesh.setMatrixAt(i, dummyMatrix);

        // Color Gradient: Stream hue -> Warm Solar Plasma -> Incandescent Core Plasma
        const streamCol = streamColors[p.streamIndex];
        if (progressClamped < 0.5) {
          const f = progressClamped / 0.5;
          tempColor.copy(streamCol).lerp(plasmaColor, f * 0.65);
        } else if (progressClamped < 0.82) {
          const f = (progressClamped - 0.5) / 0.32;
          tempColor.copy(streamCol).lerp(plasmaColor, 0.65 + f * 0.35);
        } else {
          const f = (progressClamped - 0.82) / 0.18;
          tempColor.copy(plasmaColor).lerp(coreHotColor, f * 0.9);
        }

        instancedMesh.setColorAt(i, tempColor);
      }

      instancedMesh.instanceMatrix.needsUpdate = true;
      if (instancedMesh.instanceColor) {
        instancedMesh.instanceColor.needsUpdate = true;
      }

      // Trigger solar radiant pulse ripple on central sun if particles impacted
      if (impactsThisFrame > 0 && centralSun?.userData) {
        const currentPulse = centralSun.userData.solarPulseIntensity || 0;
        centralSun.userData.solarPulseIntensity = Math.min(1.6, currentPulse + impactsThisFrame * 0.04);
      }
    }
  };

  return streamController;
}

/**
 * Creates and exports the Expense Outflow Plasma Jets Stream.
 * Generates outward-radiating polar parabolic jets shooting out from the stellar surface (r ~ 0.8)
 * along +Y and -Y polar cones into deep space (r ~ 18.0) across Housing, Living, Tech, and Leisure expense streams.
 */
export function createExpenseOutflowStream(scene) {
  const jetGroup = new THREE.Group();
  jetGroup.name = 'ExpenseOutflowJetGroup';

  const particleCount = 180;
  const streamColors = (expenseStreams && expenseStreams.length > 0)
    ? expenseStreams.map((s) => new THREE.Color(s.color || '#ef4444'))
    : [
        new THREE.Color('#ef4444'),
        new THREE.Color('#f97316'),
        new THREE.Color('#ec4899'),
        new THREE.Color('#8b5cf6')
      ];

  const coreWhiteHotColor = new THREE.Color(0xffffff);
  const coreOrangeColor = new THREE.Color(0xfde047);
  const deepSpaceDissolveColor = new THREE.Color(0x1e1b4b);

  // Instanced micro-sphere geometry elongated along ejection trajectory
  const sphereGeo = new THREE.SphereGeometry(0.045, 8, 8);
  const jetMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const instancedMesh = new THREE.InstancedMesh(sphereGeo, jetMaterial, particleCount);
  instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (instancedMesh.instanceColor) {
    instancedMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }

  const particles = [];
  const dummyMatrix = new THREE.Matrix4();
  const dummyPos = new THREE.Vector3();
  const dummyScale = new THREE.Vector3();
  const dummyQuat = new THREE.Quaternion();
  const tempColor = new THREE.Color();

  const numStreams = Math.max(1, streamColors.length);
  const particlesPerStream = Math.floor(particleCount / numStreams);

  for (let i = 0; i < particleCount; i++) {
    const streamIndex = i % numStreams;
    const progress = (Math.floor(i / numStreams) / particlesPerStream) + (Math.random() * 0.08);
    // Polar direction: alternate +1 (North Pole) and -1 (South Pole)
    const poleSign = (i % 2 === 0) ? 1 : -1;
    const phi = Math.random() * Math.PI * 2;

    const p = {
      index: i,
      streamIndex,
      progress: progress % 1.0,
      speed: 0.085 + Math.random() * 0.055,
      poleSign,
      phi,
      coneAngleSpread: 0.15 + Math.random() * 0.35,
      radialJitter: (Math.random() - 0.5) * 0.4,
      yJitter: (Math.random() - 0.5) * 0.3,
      baseScale: 0.8 + Math.random() * 0.55
    };

    particles.push(p);

    dummyMatrix.makeTranslation(0, 0, 0);
    instancedMesh.setMatrixAt(i, dummyMatrix);
    instancedMesh.setColorAt(i, streamColors[streamIndex]);
  }

  instancedMesh.instanceMatrix.needsUpdate = true;
  if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;

  jetGroup.add(instancedMesh);
  if (scene) scene.add(jetGroup);

  const jetController = {
    group: jetGroup,
    instancedMesh,
    material: jetMaterial,
    isEnabled: true,
    targetOpacity: 0.85,

    /**
     * Smoothly fades expense jet opacity in or out using Tween.js.
     */
    setOpacity(target, duration = 600) {
      this.targetOpacity = target;
      if (target > 0) {
        jetGroup.visible = true;
        this.isEnabled = true;
      }

      const tw = new TWEEN.Tween(jetMaterial)
        .to({ opacity: target * 0.85 }, duration)
        .easing(TWEEN.Easing.Cubic.Out)
        .onComplete(() => {
          if (target <= 0.001) {
            jetGroup.visible = false;
            this.isEnabled = false;
          }
        });
      TWEEN.add(tw);
      tw.start();
    },

    /**
     * Advances particles along outward polar parabolic jet trajectories.
     */
    update(delta, elapsedTime) {
      if (!this.isEnabled && jetMaterial.opacity <= 0.001) return;

      for (let i = 0; i < particleCount; i++) {
        const p = particles[i];
        const t = p.progress;

        // Rapid outward supersonic plasma acceleration
        const accel = 1.0 + 2.4 * t;
        p.progress += delta * p.speed * accel;

        if (p.progress >= 1.0) {
          p.progress = p.progress % 1.0;
          p.phi = Math.random() * Math.PI * 2;
          p.radialJitter = (Math.random() - 0.5) * 0.4;
          p.yJitter = (Math.random() - 0.5) * 0.3;
        }

        const progressClamped = THREE.MathUtils.clamp(p.progress, 0, 1);

        // Parabolic polar expansion:
        // Starts at core surface (r ~ 0.85) -> shoots to y ~ 16.0, r ~ 18.0 in deep space
        const coneRadius = (0.28 + 7.2 * Math.pow(progressClamped, 1.35)) * p.coneAngleSpread + p.radialJitter * progressClamped;
        const currentAngle = p.phi + progressClamped * 1.5 + (elapsedTime * 0.12 * p.poleSign);
        const x = Math.cos(currentAngle) * coneRadius;
        const z = Math.sin(currentAngle) * coneRadius;
        const y = p.poleSign * (0.85 + 14.8 * Math.pow(progressClamped, 0.94) + p.yJitter * progressClamped);

        // Dynamic scale & dissipation factor
        let scaleFactor = 1.0;
        if (progressClamped < 0.12) {
          // Ignition flare up at core surface
          scaleFactor = progressClamped / 0.12;
        } else if (progressClamped > 0.72) {
          // Dissolve smoothly into deep space vacuum
          scaleFactor = 1.0 - (progressClamped - 0.72) / 0.28;
        }

        // Elongate along jet velocity direction (Y-stretched sparks)
        const scaleX = p.baseScale * scaleFactor * 0.85;
        const scaleY = p.baseScale * scaleFactor * (1.6 + 1.2 * progressClamped);
        const scaleZ = scaleX;

        dummyPos.set(x, y, z);
        dummyScale.set(scaleX, scaleY, scaleZ);
        dummyMatrix.compose(dummyPos, dummyQuat, dummyScale);
        instancedMesh.setMatrixAt(i, dummyMatrix);

        // Color shift: White/Yellow hot core -> Expense Stream Hue -> Dissolving Purple/Dark Red
        const streamCol = streamColors[p.streamIndex];
        if (progressClamped < 0.15) {
          const f = progressClamped / 0.15;
          tempColor.copy(coreWhiteHotColor).lerp(coreOrangeColor, f);
        } else if (progressClamped < 0.65) {
          const f = (progressClamped - 0.15) / 0.5;
          tempColor.copy(coreOrangeColor).lerp(streamCol, f);
        } else {
          const f = (progressClamped - 0.65) / 0.35;
          tempColor.copy(streamCol).lerp(deepSpaceDissolveColor, f * 0.75);
        }

        instancedMesh.setColorAt(i, tempColor);
      }

      instancedMesh.instanceMatrix.needsUpdate = true;
      if (instancedMesh.instanceColor) {
        instancedMesh.instanceColor.needsUpdate = true;
      }
    }
  };

  return jetController;
}


