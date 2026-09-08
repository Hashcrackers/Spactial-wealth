/**
 * Spatial Wealth - Photorealistic Procedural Celestial Textures Engine
 * Multi-banded Gas Giants with Storms, Terrestrial Continents with Polar Caps, Specular Ocean Maps & Micro-Ringlets
 */

import * as THREE from 'three';

const textureCache = new Map();

/**
 * Creates a photorealistic Gas Giant texture with turbulent banded storm layers, vortices, and ammonia ice streaks.
 */
export function createGasGiantTexture(primaryHex = '#c28b5b', secondaryHex = '#e0a96d', stormHex = '#8c3a27') {
  const cacheKey = `gas_${primaryHex}_${secondaryHex}_${stormHex}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const pColor = new THREE.Color(primaryHex);
  const sColor = new THREE.Color(secondaryHex);
  const stColor = new THREE.Color(stormHex);
  const whiteIce = new THREE.Color('#f8fafc');

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let y = 0; y < height; y++) {
    const ny = y / height;
    // Harmonic atmospheric bands
    const band1 = Math.sin(ny * 28.0);
    const band2 = Math.sin(ny * 56.0 + Math.cos(ny * 16.0));
    const band3 = Math.sin(ny * 10.0);

    for (let x = 0; x < width; x++) {
      const nx = x / width;

      // Atmospheric shear & convective turbulence
      const turb1 = Math.sin(nx * 20.0 + ny * 36.0 + band1 * 2.5);
      const turb2 = Math.cos(nx * 44.0 - ny * 18.0 + band2 * 1.8);
      const stormSpot = Math.exp(-Math.pow((nx - 0.65) * 14.0, 2) - Math.pow((ny - 0.62) * 20.0, 2));
      const minorSpot = Math.exp(-Math.pow((nx - 0.28) * 22.0, 2) - Math.pow((ny - 0.38) * 30.0, 2));

      // Ammonia ice cloud streaks
      const iceStreak = Math.pow(Math.max(0, Math.sin(nx * 60.0 + ny * 80.0 + turb1 * 2.0)), 6.0) * 0.45;

      const factor = (band1 * 0.4 + band2 * 0.3 + band3 * 0.3 + turb1 * 0.2 + turb2 * 0.15 + 1.0) * 0.5;
      const clamped = Math.max(0, Math.min(1, factor));

      let r = pColor.r * (1 - clamped) + sColor.r * clamped;
      let g = pColor.g * (1 - clamped) + sColor.g * clamped;
      let b = pColor.b * (1 - clamped) + sColor.b * clamped;

      // Great Storm Vortex
      if (stormSpot > 0.04) {
        r = r * (1 - stormSpot) + stColor.r * stormSpot;
        g = g * (1 - stormSpot) + stColor.g * stormSpot;
        b = b * (1 - stormSpot) + stColor.b * stormSpot;
      }
      if (minorSpot > 0.05) {
        r = r * (1 - minorSpot) + whiteIce.r * minorSpot;
        g = g * (1 - minorSpot) + whiteIce.g * minorSpot;
        b = b * (1 - minorSpot) + whiteIce.b * minorSpot;
      }

      // Blend white ice wisps
      r = r * (1 - iceStreak) + whiteIce.r * iceStreak;
      g = g * (1 - iceStreak) + whiteIce.g * iceStreak;
      b = b * (1 - iceStreak) + whiteIce.b * iceStreak;

      const idx = (y * width + x) * 4;
      data[idx] = Math.round(r * 255);
      data[idx + 1] = Math.round(g * 255);
      data[idx + 2] = Math.round(b * 255);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Creates a photorealistic Terrestrial planet texture with continents, basalt basins, cratering & polar ice caps.
 */
export function createRockyPlanetTexture(baseHex = '#4a5568', accentHex = '#9b2c2c', craterDensity = 0.6) {
  const cacheKey = `rocky_${baseHex}_${accentHex}_${craterDensity}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const bColor = new THREE.Color(baseHex);
  const aColor = new THREE.Color(accentHex);
  const darkBasalt = new THREE.Color('#0f172a');
  const polarIce = new THREE.Color('#e2e8f0');

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let y = 0; y < height; y++) {
    const ny = y / height;
    const isPolar = (ny < 0.12 || ny > 0.88);
    const polarBlend = ny < 0.12 ? (0.12 - ny) / 0.12 : ny > 0.88 ? (ny - 0.88) / 0.12 : 0;

    for (let x = 0; x < width; x++) {
      const nx = x / width;

      // Multi-scale tectonic continent synthesis
      const f1 = Math.sin(nx * 14.0) * Math.cos(ny * 14.0);
      const f2 = Math.sin(nx * 28.0 + f1 * 2.0) * Math.cos(ny * 28.0);
      const f3 = Math.sin(nx * 56.0) * Math.sin(ny * 56.0);
      const noise = (f1 * 0.5 + f2 * 0.35 + f3 * 0.15 + 1.0) * 0.5;

      // Crater noise
      const craterNoise = Math.sin(nx * 84.0) * Math.cos(ny * 84.0);
      const isCrater = craterNoise > (1.0 - craterDensity * 0.32);

      let r, g, b;
      if (noise < 0.4) {
        // Deep basalt / ocean trench
        r = darkBasalt.r * 0.8 + bColor.r * 0.2;
        g = darkBasalt.g * 0.8 + bColor.g * 0.2;
        b = darkBasalt.b * 0.8 + bColor.b * 0.2;
      } else if (noise < 0.72) {
        // Continental landmass
        const t = (noise - 0.4) / 0.32;
        r = bColor.r * (1 - t) + aColor.r * t;
        g = bColor.g * (1 - t) + aColor.g * t;
        b = bColor.b * (1 - t) + aColor.b * t;
      } else {
        // Highland ridges / volcanic peaks
        r = aColor.r * 1.25;
        g = aColor.g * 1.15;
        b = aColor.b * 1.1;
      }

      if (isCrater) {
        r *= 0.75;
        g *= 0.75;
        b *= 0.75;
      }

      // Apply Polar Ice Caps
      if (isPolar) {
        r = r * (1 - polarBlend) + polarIce.r * polarBlend;
        g = g * (1 - polarBlend) + polarIce.g * polarBlend;
        b = b * (1 - polarBlend) + polarIce.b * polarBlend;
      }

      const idx = (y * width + x) * 4;
      data[idx] = Math.min(255, Math.round(r * 255));
      data[idx + 1] = Math.min(255, Math.round(g * 255));
      data[idx + 2] = Math.min(255, Math.round(b * 255));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Creates high-detail procedural bump and displacement maps for rocky surfaces.
 */
export function createBumpMap(intensity = 1.0) {
  const cacheKey = `bump_${intensity}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let y = 0; y < height; y++) {
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const n1 = Math.sin(nx * 32.0) * Math.cos(ny * 32.0);
      const n2 = Math.sin(nx * 64.0) * Math.sin(ny * 64.0);
      const n3 = (Math.sin(nx * 128.0) + Math.cos(ny * 128.0)) * 0.5;

      const heightVal = Math.max(0, Math.min(255, Math.round(((n1 * 0.5 + n2 * 0.35 + n3 * 0.15 + 1.0) * 0.5) * 255 * intensity)));
      const idx = (y * width + x) * 4;
      data[idx] = heightVal;
      data[idx + 1] = heightVal;
      data[idx + 2] = heightVal;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Creates semi-transparent, grainy Saturn-like Planetary Ring alpha and color textures with Cassini division and micro-ringlets.
 */
export function createRingTexture(ringColorHex = '#d4af37') {
  const cacheKey = `ring_${ringColorHex}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const width = 512;
  const height = 16;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  const baseCol = new THREE.Color(ringColorHex);
  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let x = 0; x < width; x++) {
    const u = x / width; // Radial distance from inner edge (0) to outer edge (1)

    // Cassini Division gap around u ~ 0.62 to 0.71
    let alpha = 0.88;
    if (u < 0.06 || u > 0.95) {
      alpha = 0.0;
    } else if (u >= 0.62 && u <= 0.70) {
      alpha = 0.04; // Cassini Gap
    } else {
      // Micro-ringlets
      const ripple = Math.sin(u * 180.0) * 0.28 + Math.sin(u * 380.0) * 0.16;
      alpha = Math.max(0.12, Math.min(0.96, 0.76 + ripple));
    }

    const r = Math.round(baseCol.r * 255);
    const g = Math.round(baseCol.g * 255);
    const b = Math.round(baseCol.b * 255);
    const a = Math.round(alpha * 255);

    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Creates rough irregular Asteroid rock texture.
 */
export function createAsteroidTexture() {
  const cacheKey = 'asteroid_rock';
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = (Math.sin(x * 0.22) * Math.cos(y * 0.22) + Math.sin(x * 0.5 + y * 0.5)) * 0.5;
      const val = Math.round((n * 0.5 + 0.5) * 185 + 35);
      const idx = (y * size + x) * 4;
      data[idx] = val;
      data[idx + 1] = Math.round(val * 0.92);
      data[idx + 2] = Math.round(val * 0.85);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  textureCache.set(cacheKey, texture);
  return texture;
}
