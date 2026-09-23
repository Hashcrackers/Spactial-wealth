/**
 * Spatial Wealth - WebXR Manager: Hand Tracking, 6-DoF Controllers & Left-Wrist Holographic Control Palette
 */

import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { Text } from 'troika-three-text';
import * as TWEEN from '@tweenjs/tween.js';
import { setNodeHoverState } from './nodes.js';
import { soundFx } from './audio.js';
import { portfolioState, adjustAssetAllocation, INDIAN_STOCKS, formatCurrency } from './data.js';
import { setChartResolutionPreset } from './charts.js';

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
   * Gracefully exits the active WebXR presentation session and triggers exit callbacks.
   */
  async exitVR() {
    soundFx.playCloseSound();
    const session = this.renderer.xr.getSession();
    if (session) {
      try {
        await session.end();
      } catch (err) {
        console.warn('WebXR session end error:', err);
      }
    }
    if (this.callbacks.onExitVR) {
      this.callbacks.onExitVR();
    }
  }

  initXR() {
    this.renderer.xr.enabled = true;

    // 1. VR Button
    const vrButton = VRButton.createButton(this.renderer);
    vrButton.id = 'VRButton';
    document.body.appendChild(vrButton);

    // 2. Session Start & End Listeners
    this.renderer.xr.addEventListener('sessionstart', () => {
      soundFx.playVrEnterSound();
      if (this.spatialDock) {
        this.spatialDock.visible = true;
        this.spatialDock.scale.set(0.72, 0.72, 0.72);
      }
      if (this.callbacks.onSessionStart) {
        this.callbacks.onSessionStart();
      }
    });

    this.renderer.xr.addEventListener('sessionend', () => {
      if (this.spatialDock) {
        this.spatialDock.visible = false;
      }
      if (this.spatialDataPanel) {
        this.spatialDataPanel.visible = false;
      }
      if (this.quickTickersSlate) {
        this.quickTickersSlate.visible = false;
      }
      if (this.searchPanel) {
        this.searchPanel.visible = false;
      }
      if (this.hoveredObject) {
        setNodeHoverState(this.hoveredObject, false);
        this.hoveredObject = null;
      }
      if (this.callbacks.onSessionEnd) {
        this.callbacks.onSessionEnd();
      }
    });

    // 3. 6-DoF Controller Setup
    const controllerModelFactory = new XRControllerModelFactory();

    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      controller.name = `XR_Controller_${i}`;
      controller.userData = { index: i, isHand: false };

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
    const dockH = 0.20;
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

    createDivider(0.060);
    createDivider(-0.018);

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

    // 2. Header (y = +0.075m): Brand Title, Live Net Worth Badge & High-Visibility Exit VR Button
    const titleText = new Text();
    titleText.text = '🪐 SPATIAL WEALTH';
    titleText.fontSize = 0.0078;
    titleText.color = 0x38bdf8;
    titleText.anchorX = 'left';
    titleText.anchorY = 'middle';
    titleText.whiteSpace = 'nowrap';
    titleText.position.set(-0.114, 0.075, 0.003);
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
    nwPillMesh.position.set(0.010, 0.075, 0.002);
    this.spatialDock.add(nwPillMesh);

    const nwBorderGeo = new THREE.BufferGeometry().setFromPoints(nwPillShape.getPoints(16));
    const nwBorderMat = new THREE.LineBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.55
    });
    const nwBorderLine = new THREE.LineLoop(nwBorderGeo, nwBorderMat);
    nwBorderLine.position.set(0.010, 0.075, 0.0025);
    this.spatialDock.add(nwBorderLine);

    const netWorthText = new Text();
    netWorthText.text = '$1,245,000';
    netWorthText.fontSize = 0.0068;
    netWorthText.color = 0x34d399;
    netWorthText.anchorX = 'center';
    netWorthText.anchorY = 'middle';
    netWorthText.whiteSpace = 'nowrap';
    netWorthText.position.set(0.010, 0.075, 0.0035);
    netWorthText.sync();
    this.spatialDock.add(netWorthText);
    this.dockTexts.netWorth = netWorthText;

    // High-visibility Frosted Crimson [ 🚪 Exit VR ] Button
    const btnExitVR = createPillButton({
      label: '[ 🚪 Exit VR ]',
      x: 0.086,
      y: 0.075,
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

    // 3. Row 1: System Toggles (y = +0.040m | 4 buttons, width 0.056m each)
    const btnOrbit = createPillButton({
      label: '🪐 Orbit',
      x: -0.087,
      y: 0.040,
      w: 0.056,
      h: 0.019,
      fontSize: 0.0062,
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
      x: -0.029,
      y: 0.040,
      w: 0.056,
      h: 0.019,
      fontSize: 0.0062,
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
      x: 0.029,
      y: 0.040,
      w: 0.056,
      h: 0.019,
      fontSize: 0.0062,
      color: 0x0e7490,
      hoverColor: 0x06b6d4,
      emissiveColor: 0x06b6d4,
      emissiveIntensity: 0.4,
      action: 'toggleAudio'
    });
    this.dockTexts.btnAudio = btnAudio.txt;
    this.dockButtons.btnAudio = btnAudio.btnMesh;

    const btnReset = createPillButton({
      label: '🔄 Reset',
      x: 0.087,
      y: 0.040,
      w: 0.056,
      h: 0.019,
      fontSize: 0.0062,
      color: 0x6d28d9,
      hoverColor: 0x8b5cf6,
      emissiveColor: 0x7c3aed,
      emissiveIntensity: 0.3,
      action: 'resetView'
    });
    this.dockTexts.btnReset = btnReset.txt;

    // 4. Row 2: Chart, Ticker Search & Data Tools (y = +0.005m | 4 buttons, width 0.056m each)
    const btnChartMode = createPillButton({
      label: '📈/📊 Mode',
      x: -0.087,
      y: 0.005,
      w: 0.056,
      h: 0.019,
      fontSize: 0.0052,
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
      x: -0.029,
      y: 0.005,
      w: 0.056,
      h: 0.019,
      fontSize: 0.0056,
      color: 0x1e293b,
      hoverColor: 0x334155,
      action: 'toggleChart'
    });
    this.dockTexts.btnToggleChart = btnToggleChart.txt;

    const btnQuickTickers = createPillButton({
      label: '🔍 Search',
      x: 0.029,
      y: 0.005,
      w: 0.056,
      h: 0.019,
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
      x: 0.087,
      y: 0.005,
      w: 0.056,
      h: 0.019,
      fontSize: 0.0056,
      color: 0x1e293b,
      hoverColor: 0x334155,
      action: 'toggleManageData'
    });
    this.dockTexts.btnManageData = btnManageData.txt;

    // 5. Section Header: Sector Filters
    const sectorHeader = new Text();
    sectorHeader.text = '— SECTOR FILTERS —';
    sectorHeader.fontSize = 0.0052;
    sectorHeader.color = 0x64748b;
    sectorHeader.anchorX = 'center';
    sectorHeader.anchorY = 'middle';
    sectorHeader.whiteSpace = 'nowrap';
    sectorHeader.position.set(0, -0.024, 0.002);
    sectorHeader.sync();
    this.spatialDock.add(sectorHeader);

    // 6. Row 3: Sector Filters Top Half (y = -0.042m | 3 buttons, width 0.076m each)
    const btnAll = createPillButton({
      label: 'ALL',
      x: -0.082,
      y: -0.042,
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
      y: -0.042,
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
      y: -0.042,
      w: 0.076,
      h: 0.018,
      fontSize: 0.0058,
      color: 0x1e293b,
      hoverColor: 0x334155,
      action: 'filterCategory',
      data: { category: 'Index Funds' }
    });

    // 7. Row 4: Sector Filters Bottom Half (y = -0.070m | 3 buttons, width 0.076m each)
    const btnFixed = createPillButton({
      label: 'FIXED INC',
      x: -0.082,
      y: -0.070,
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
      y: -0.070,
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
      y: -0.070,
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
    this.triggerHaptic(controller, 0.45, 50);

    this.tempMatrix.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(this.tempMatrix);

    this.processRayIntersections(this.raycaster, controller);
  }

  onSelectStart(event, controller) {
    if (controller.userData.laser) {
      controller.userData.laser.material.color.setHex(0x8b5cf6);
      controller.userData.laser.material.opacity = 0.95;
    }
  }

  onSelectEnd(event, controller) {
    if (controller.userData.laser) {
      controller.userData.laser.material.color.setHex(0x00f0ff);
      controller.userData.laser.material.opacity = 0.75;
    }
  }

  onSqueeze(event, controller) {
    this.triggerHaptic(controller, 0.7, 120);
    soundFx.playCloseSound();
    if (this.callbacks.onResetView) {
      this.callbacks.onResetView();
    }
  }

  /**
   * WebXR Hand-Tracking Pinch Handlers (Index Tip to Thumb Tip Pinch).
   */
  onHandPinchStart(event, hand) {
    hand.userData.isPinching = true;
    soundFx.playHoverSound();

    if (hand.userData.laser) {
      hand.userData.laser.material.color.setHex(0xec4899);
      hand.userData.laser.material.opacity = 1.0;
    }
  }

  onHandPinchEnd(event, hand) {
    hand.userData.isPinching = false;

    if (hand.userData.laser) {
      hand.userData.laser.material.color.setHex(0x38bdf8);
      hand.userData.laser.material.opacity = 0.75;
    }

    // Perform pinch selection along index pointing direction
    this.castRayFromHand(hand, (raycaster) => {
      this.processRayIntersections(raycaster, hand);
    });
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
      if (presetId) {
        setChartResolutionPreset(presetId, this.scene);
      }
    } else if (action === 'filterCategory' && this.callbacks.onFilterCategory) {
      this.callbacks.onFilterCategory(buttonMesh.userData.category);
    }
  }

  /**
   * Processes intersections for raycaster against interactive objects, wrist dock buttons and spatial data panel.
   */
  processRayIntersections(raycaster, source) {
    const interactiveObjectsList = [
      ...interactiveObjects,
      ...(this.callbacks.getInteractiveObjects ? this.callbacks.getInteractiveObjects() : [])
    ];

    // Include Left-Wrist Holographic Palette buttons if dock is visible
    if (this.spatialDock?.visible) {
      this.dockButtons.forEach((btn) => interactiveObjectsList.push(btn));
    }

    // Include 3D Spatial Manage Data Slate buttons if panel is visible
    if (this.spatialDataPanel?.visible) {
      this.dataPanelButtons.forEach((btn) => interactiveObjectsList.push(btn));
    }

    // Include 3D Quick Tickers Slate buttons if slate is visible
    if (this.quickTickersSlate?.visible) {
      this.quickTickerButtons.forEach((btn) => interactiveObjectsList.push(btn));
    }

    // Include 3D Spatial Search Window & Virtual Keyboard buttons if panel is visible
    if (this.searchPanel?.visible) {
      this.searchPanelButtons.forEach((btn) => interactiveObjectsList.push(btn));
    }

    const intersects = raycaster.intersectObjects(interactiveObjectsList, true);

    if (intersects.length > 0) {
      // Find the target object or parent with interactive handler
      let hit = intersects[0].object;
      while (hit && !hit.userData?.onClick && !hit.userData?.isVRButton && !hit.userData?.isResolutionPreset && !hit.userData?.isCloseButton && !hit.userData?.isChartModeToggle && !hit.userData?.isAssetNode && hit.parent && hit !== this.scene) {
        hit = hit.parent;
      }

      if (!hit) hit = intersects[0].object;

      // 1. Direct onClick Callback (registered via registerInteractiveObject)
      if (hit.userData?.onClick) {
        this.animateButtonPress(hit);
        hit.userData.onClick();
        return;
      }

      // 2. Check Resolution Preset
      if (hit.userData?.isResolutionPreset || hit.userData?.action === 'setResolution') {
        this.animateButtonPress(hit);
        const presetId = hit.userData.presetId;
        if (presetId) {
          setChartResolutionPreset(presetId, this.scene);
        }
        return;
      }

      // 3. Check VR Button (Wrist Dock, Spatial Data Panel, Quick Tickers Slate, Search Panel)
      if (hit.userData?.isVRButton) {
        this.animateButtonPress(hit);
        return;
      }

      // 4. Check 3D Chart Close Button
      if (hit.userData?.isCloseButton) {
        if (this.callbacks.onCloseChart) this.callbacks.onCloseChart();
        return;
      }

      // 5. Check 3D Chart Display Mode Toggle [Spline / Candlestick]
      if (hit.userData?.isChartModeToggle) {
        if (this.callbacks.onToggleChartMode) {
          this.callbacks.onToggleChartMode(hit.userData.targetMode);
        }
        return;
      }

      // 6. Check Planetary Node
      let current = hit;
      while (current && (!current.userData || !current.userData.isAssetNode)) {
        current = current.parent;
      }

      if (current?.userData?.isAssetNode) {
        if (this.callbacks.onSelectNode) {
          this.callbacks.onSelectNode(current.userData.assetData || current.userData, current);
        }
      }
    }
  }

  triggerHaptic(controller, intensity = 0.4, duration = 80) {
    const session = this.renderer.xr.getSession();
    if (!session?.inputSources) return;

    for (const source of session.inputSources) {
      if (source.gamepad?.hapticActuators?.length > 0) {
        source.gamepad.hapticActuators[0].pulse(intensity, duration);
      }
    }
  }

  /**
   * Updates Left-Wrist orientation, hand pinch/poke detection, raycasting & hover states.
   */
  update(interactiveObjectsArg = [], delta = 0.016) {
    if (!this.renderer.xr.isPresenting) return;

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

    let anyHoveredPlanet = null;
    let anyHoveredButton = null;

    // 1. Check Left Hand Wrist / Controller Attachment
    const leftHand = this.hands[0];
    const leftController = this.controllers[0];

    if (leftHand && leftHand.joints?.['wrist']) {
      if (this.spatialDock.parent !== leftHand) {
        leftHand.add(this.spatialDock);
      }
    } else if (leftController) {
      if (this.spatialDock.parent !== leftController) {
        leftController.add(this.spatialDock);
      }
    }

    // Ensure the HUD is always visible whenever XR is presenting
    if (this.spatialDock) {
      this.spatialDock.visible = this.renderer.xr.isPresenting;
    }

    // 2. Proximity Poke Detection (Right Index Tip to Buttons)
    const rightHand = this.hands[1];
    if (rightHand && rightHand.joints?.['index-finger-tip']) {
      const rightIndexTip = rightHand.joints['index-finger-tip'];
      rightIndexTip.getWorldPosition(this.tempVecA);

      let closestBtn = null;
      let minDistance = 0.038; // 3.8 cm touch trigger distance

      const pokeCandidates = [...allInteractive];

      pokeCandidates.forEach((btn) => {
        if (!btn || !btn.isObject3D) return;
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
          const hits = ray.intersectObjects(allInteractive, true);
          const reticle = hand.userData.reticle;
          const laser = hand.userData.laser;

          if (hits.length > 0) {
            const hit = hits[0];
            if (reticle) {
              reticle.position.copy(hit.point);
              reticle.quaternion.copy(this.camera.quaternion);
              reticle.visible = true;
            }
            if (laser) {
              laser.visible = true;
              laser.position.copy(ray.ray.origin);
              laser.lookAt(hit.point);
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

      const intersects = this.raycaster.intersectObjects(allInteractive, true);
      const reticle = controller.userData.reticle;

      if (intersects.length > 0) {
        const hit = intersects[0];
        if (reticle) {
          reticle.position.copy(hit.point);
          reticle.quaternion.copy(this.camera.quaternion);
          reticle.visible = true;
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

