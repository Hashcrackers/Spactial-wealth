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
import { portfolioState, adjustAssetAllocation } from './data.js';

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

    this.initXR();
  }

  /**
   * Smoothly glides the VR User Rig to frame the target planet comfortably (3.5m offset).
   */
  flyToTarget(targetMesh) {
    if (!targetMesh || !this.userRig) return;
    const targetWorldPos = new THREE.Vector3();
    targetMesh.getWorldPosition(targetWorldPos);

    // Calculate a comfortable viewing offset: 3.5m back along the viewing axis, elevated 0.8m
    const sunPos = new THREE.Vector3(0, 0, 0);
    const viewOffset = targetWorldPos.clone().sub(sunPos);
    if (viewOffset.lengthSq() < 0.001) {
      viewOffset.set(0, 0, 1);
    }
    viewOffset.normalize().multiplyScalar(3.5);
    viewOffset.y += 0.8;
    const targetRigPos = targetWorldPos.clone().add(viewOffset);

    if (this.currentRigTween) {
      this.currentRigTween.stop();
    }

    this.currentRigTween = new TWEEN.Tween(this.userRig.position)
      .to({ x: targetRigPos.x, y: targetRigPos.y, z: targetRigPos.z }, 1200)
      .easing(TWEEN.Easing.Cubic.Out);
    TWEEN.add(this.currentRigTween);
    this.currentRigTween.start();
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

    // 4. Row 2: Chart & Data Tools (y = +0.005m | 3 buttons, width 0.076m each)
    const btnChartMode = createPillButton({
      label: '📈 Spline / 📊 Candles',
      x: -0.082,
      y: 0.005,
      w: 0.076,
      h: 0.019,
      fontSize: 0.0058,
      color: 0x0e7490,
      hoverColor: 0x06b6d4,
      emissiveColor: 0x06b6d4,
      emissiveIntensity: 0.35,
      action: 'toggleChartMode'
    });
    this.dockTexts.btnChartMode = btnChartMode.txt;
    this.dockButtons.btnChartMode = btnChartMode.btnMesh;

    const btnToggleChart = createPillButton({
      label: '📊 Toggle Chart',
      x: 0,
      y: 0.005,
      w: 0.076,
      h: 0.019,
      fontSize: 0.0060,
      color: 0x1e293b,
      hoverColor: 0x334155,
      action: 'toggleChart'
    });
    this.dockTexts.btnToggleChart = btnToggleChart.txt;

    const btnManageData = createPillButton({
      label: '📑 Manage Data',
      x: 0.082,
      y: 0.005,
      w: 0.076,
      h: 0.019,
      fontSize: 0.0060,
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
    } else if (action === 'adjustAsset') {
      const { assetId, delta } = buttonMesh.userData;
      if (this.callbacks.onAdjustAsset) {
        this.callbacks.onAdjustAsset(assetId, delta);
      } else {
        adjustAssetAllocation(assetId, delta);
      }
    } else if (action === 'closeChart' && this.callbacks.onCloseChart) {
      this.callbacks.onCloseChart();
    } else if (action === 'filterCategory' && this.callbacks.onFilterCategory) {
      this.callbacks.onFilterCategory(buttonMesh.userData.category);
    }
  }

  /**
   * Processes intersections for raycaster against interactive objects, wrist dock buttons and spatial data panel.
   */
  processRayIntersections(raycaster, source) {
    const interactiveObjects = this.callbacks.getInteractiveObjects
      ? this.callbacks.getInteractiveObjects()
      : [];

    // Include Left-Wrist Holographic Palette buttons if dock is visible
    if (this.spatialDock?.visible) {
      this.dockButtons.forEach((btn) => interactiveObjects.push(btn));
    }

    // Include 3D Spatial Manage Data Slate buttons if panel is visible
    if (this.spatialDataPanel?.visible) {
      this.dataPanelButtons.forEach((btn) => interactiveObjects.push(btn));
    }

    const intersects = raycaster.intersectObjects(interactiveObjects, true);

    if (intersects.length > 0) {
      const hit = intersects[0].object;

      // 1. Check VR Button (Wrist Dock or Spatial Data Panel)
      if (hit.userData?.isVRButton) {
        this.animateButtonPress(hit);
        return;
      }

      // 2. Check 3D Chart Close Button
      if (hit.userData?.isCloseButton) {
        if (this.callbacks.onCloseChart) this.callbacks.onCloseChart();
        return;
      }

      // 3. Check 3D Chart Display Mode Toggle [Spline / Candlestick]
      if (hit.userData?.isChartModeToggle) {
        if (this.callbacks.onToggleChartMode) {
          this.callbacks.onToggleChartMode(hit.userData.targetMode);
        }
        return;
      }

      // 4. Check Planetary Node
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
  update(interactiveObjects = []) {
    if (!this.renderer.xr.isPresenting) return;

    const allInteractive = [...interactiveObjects];
    if (this.spatialDock?.visible) {
      this.dockButtons.forEach((b) => allInteractive.push(b));
    }
    if (this.spatialDataPanel?.visible) {
      this.dataPanelButtons.forEach((b) => allInteractive.push(b));
    }

    let anyHoveredPlanet = null;
    let anyHoveredButton = null;

    // 1. Check Left Hand Wrist / Controller Attachment
    const leftHand = this.hands[0];
    const leftController = this.controllers[0];

    if (leftHand && leftHand.joints?.['wrist']) {
      // If hand tracking with wrist joint is active, reparent to left hand
      if (this.spatialDock.parent !== leftHand) {
        leftHand.add(this.spatialDock);
      }
    } else if (leftController) {
      // Default to left controller for seamless 6-DoF controller and emulator support
      if (this.spatialDock.parent !== leftController) {
        leftController.add(this.spatialDock);
      }
    }

    // Ensure the HUD is always visible whenever XR is presenting
    if (this.spatialDock) {
      this.spatialDock.visible = this.renderer.xr.isPresenting;
    }

    // 2. Proximity Poke Detection (Right Index Tip to Left Wrist Buttons or Spatial Data Slate Buttons)
    const rightHand = this.hands[1];
    if (rightHand && rightHand.joints?.['index-finger-tip']) {
      const rightIndexTip = rightHand.joints['index-finger-tip'];
      rightIndexTip.getWorldPosition(this.tempVecA);

      let closestBtn = null;
      let minDistance = 0.038; // 3.8 cm touch trigger distance

      const pokeCandidates = [];
      if (this.spatialDock?.visible) {
        this.dockButtons.forEach((btn) => pokeCandidates.push(btn));
      }
      if (this.spatialDataPanel?.visible) {
        this.dataPanelButtons.forEach((btn) => pokeCandidates.push(btn));
      }

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
            if (hit.object.userData?.isVRButton) {
              anyHoveredButton = hit.object;
            } else {
              let target = hit.object;
              while (target && (!target.userData || !target.userData.isAssetNode)) {
                target = target.parent;
              }
              if (target?.userData?.isAssetNode) anyHoveredPlanet = target;
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

        if (hit.object.userData?.isVRButton) {
          anyHoveredButton = hit.object;
        } else {
          let target = hit.object;
          while (target && (!target.userData || !target.userData.isAssetNode)) {
            target = target.parent;
          }
          if (target?.userData?.isAssetNode) {
            anyHoveredPlanet = target;
          }
        }
      } else {
        if (reticle) reticle.visible = false;
      }
    }

    // 5. Update Button Hover Highlights
    if (this.hoveredVRButton !== anyHoveredButton) {
      if (this.hoveredVRButton) {
        const base = this.hoveredVRButton.userData.baseColor || 0x1e293b;
        const baseEmissive = this.hoveredVRButton.userData.baseEmissiveIntensity ?? 0.15;
        this.hoveredVRButton.material.color.setHex(base);
        this.hoveredVRButton.material.emissiveIntensity = baseEmissive;
      }
      if (anyHoveredButton) {
        const hover = anyHoveredButton.userData.hoverColor || 0x38bdf8;
        anyHoveredButton.material.color.setHex(hover);
        anyHoveredButton.material.emissiveIntensity = Math.max(0.45, (anyHoveredButton.userData.baseEmissiveIntensity || 0) + 0.2);
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

