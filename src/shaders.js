/**
 * Spatial Wealth - High-Fidelity Custom GLSL Shaders & Materials
 * Balanced Solar Granulation with Deep Amber Contrast, Corona Aura, Rayleigh Atmospheres & Holographic Glass
 */

import * as THREE from 'three';

/**
 * Solar Convective Granulation Shader with deep amber/gold contrast and balanced bloom intensity (1.2).
 */
export function createSolarGranulationMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColorCore: { value: new THREE.Color(0xfffbeb) },
      uColorHot: { value: new THREE.Color(0xf59e0b) },
      uColorFlare: { value: new THREE.Color(0xd97706) },
      uColorDeep: { value: new THREE.Color(0x78350f) }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vViewPosition;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPosition = position;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColorCore;
      uniform vec3 uColorHot;
      uniform vec3 uColorFlare;
      uniform vec3 uColorDeep;

      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec3 vViewPosition;

      // 3D Simplex-like cellular noise approximation
      float cellularNoise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float n = dot(i, vec3(1.0, 57.0, 113.0));
        return mix(
          mix(mix(sin(n + 0.0), sin(n + 1.0), f.x),
              mix(sin(n + 57.0), sin(n + 58.0), f.x), f.y),
          mix(mix(sin(n + 113.0), sin(n + 114.0), f.x),
              mix(sin(n + 170.0), sin(n + 171.0), f.x), f.y), f.z
        );
      }

      void main() {
        vec3 norm = normalize(vNormal);
        vec3 view = normalize(vViewPosition);

        // Turbulent convective boiling cells
        vec3 p = vPosition * 4.2;
        float n1 = cellularNoise(p + vec3(0.0, uTime * 0.7, 0.0));
        float n2 = cellularNoise(p * 2.0 - vec3(uTime * 0.5, 0.0, uTime * 0.3));
        float n3 = cellularNoise(p * 4.0 + vec3(uTime * 0.25, uTime * 0.4, 0.0));
        float convection = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2) * 0.5 + 0.5;

        // Solar limb darkening & hot core emission
        float fresnel = 1.0 - max(0.0, dot(norm, view));
        float coreBrightness = pow(1.0 - fresnel, 1.4);

        vec3 plasma = mix(uColorDeep, uColorFlare, convection);
        plasma = mix(plasma, uColorHot, pow(convection, 1.8));
        plasma = mix(plasma, uColorCore, coreBrightness * 0.65);

        // Balanced intensity (1.2) to prevent blinding bloom saturation
        float flarePulse = 0.96 + 0.04 * sin(uTime * 3.5 + convection * 6.28);
        gl_FragColor = vec4(plasma * 1.2 * flarePulse, 1.0);
      }
    `,
    transparent: false
  });
}

/**
 * Inverted-normal Pulsating Corona Aura Mesh Material.
 */
export function createSolarCoronaAuraMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uGlowColor: { value: new THREE.Color(0xf59e0b) },
      uRimColor: { value: new THREE.Color(0xb45309) }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uGlowColor;
      uniform vec3 uRimColor;

      varying vec3 vNormal;
      varying vec3 vViewPosition;

      void main() {
        vec3 norm = normalize(vNormal);
        vec3 view = normalize(vViewPosition);

        float fresnel = 1.0 - max(0.0, dot(norm, view));
        float aura = pow(fresnel, 2.5);

        float wisp = 0.92 + 0.08 * sin(uTime * 2.8 + norm.x * 6.0);
        vec3 color = mix(uGlowColor, uRimColor, fresnel);

        gl_FragColor = vec4(color * 1.2 * wisp, aura * 0.6);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide
  });
}

/**
 * Rayleigh Atmospheric Scattering Shell for Gas Giants.
 */
export function createRayleighAtmosphereMaterial(colorHex = 0x38bdf8, rimPower = 2.4, opacity = 0.38) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(colorHex) },
      uRimPower: { value: rimPower },
      uOpacity: { value: opacity }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uRimPower;
      uniform float uOpacity;

      varying vec3 vNormal;
      varying vec3 vViewPosition;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);

        float fresnel = 1.0 - max(0.0, dot(normal, viewDir));
        float alpha = pow(fresnel, uRimPower) * uOpacity;

        gl_FragColor = vec4(uColor * 1.25, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide
  });
}

/**
 * Deep Cosmic Emission Nebula & Space Dust backdrop.
 */
export function createNebulaBackdropMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vWorldPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorldPosition;

      void main() {
        vec3 dir = normalize(vWorldPosition);

        float n1 = sin(dir.x * 3.5 + uTime * 0.02) * cos(dir.y * 3.5 + uTime * 0.015) * sin(dir.z * 3.5);
        float n2 = sin(dir.x * 7.0 - uTime * 0.025) * sin(dir.y * 7.0 + uTime * 0.018) * cos(dir.z * 7.0);
        float n3 = cos((dir.x + dir.y) * 12.0) * sin(dir.z * 12.0 + uTime * 0.01);

        vec3 voidSpace = vec3(0.005, 0.008, 0.018);
        vec3 deepBlueNebula = vec3(0.018, 0.06, 0.18);
        vec3 magentaNebula = vec3(0.14, 0.025, 0.12);
        vec3 cyanHaze = vec3(0.01, 0.14, 0.20);

        float m1 = smoothstep(-0.15, 0.65, n1 + n3 * 0.2);
        float m2 = smoothstep(-0.25, 0.75, n2);

        vec3 color = mix(voidSpace, deepBlueNebula, m1);
        color = mix(color, magentaNebula, m2 * 0.55);
        color += cyanHaze * max(0.0, n3 * 0.25);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false
  });
}
