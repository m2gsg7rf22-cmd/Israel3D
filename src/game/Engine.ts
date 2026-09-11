import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { CityBuilder } from "./CityBuilder";
import { Locomotion } from "./Locomotion";
import { VehicleController } from "./VehicleController";
import { CameraRig } from "./CameraRig";
import { input } from "./Input";
import { audioSynth } from "./AudioSynth";
import type { ControlMode, MinimapEntity, TelemetrySnapshot } from "./types";

export interface EngineCallbacks {
  onTelemetry(snapshot: TelemetrySnapshot): void;
}

const VEHICLE_ENTER_RANGE = 3.3;
const EXIT_SPEED_THRESHOLD_KMH = 15;
const TRAILER_SPRINT_SPEED = 5.6;

interface TrailerStage {
  start: number;
  end: number;
}

const TRAILER: Record<string, TrailerStage> = {
  heroClose: { start: 0, end: 1.2 },
  pursuit: { start: 1.2, end: 5.8 },
  braking: { start: 5.8, end: 7.4 },
  doorOpen: { start: 7.45, end: 8.1 },
  swingCut: { start: 8.1, end: 12.0 },
};

export class Engine {
  private canvas: HTMLCanvasElement;
  private viewport: HTMLElement;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private cameraRig: CameraRig;
  private city: CityBuilder;
  private locomotion = new Locomotion();
  private car!: VehicleController;
  private bike!: VehicleController;
  private mode: ControlMode = "foot";
  private previousMode: ControlMode = "foot";
  private clock = new THREE.Clock();
  private rafId = 0;
  private resizeObserver: ResizeObserver | null = null;
  private callbacks: EngineCallbacks | null = null;
  private paused = false;
  private trailerT = 0;
  private minimapBuildings: MinimapEntity[] = [];
  private fpsSmoothed = 60;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, viewport: HTMLElement) {
    this.canvas = canvas;
    this.viewport = viewport;
    this.cameraRig = new CameraRig(viewport.clientWidth / Math.max(1, viewport.clientHeight));
    this.city = new CityBuilder(this.scene);
  }

  init(callbacks: EngineCallbacks) {
    this.callbacks = callbacks;
    this.setupRenderer();
    this.setupLighting();
    this.city.build();
    this.minimapBuildings = this.city.grid.all
      .filter((c) => c.isWall && c.maxY > 3)
      .map((c) => ({ x: (c.minX + c.maxX) / 2, z: (c.minZ + c.maxZ) / 2, kind: "building" as const }));

    this.locomotion.reset(this.city.spawnPoints.player);
    this.scene.add(this.locomotion.rig.root);

    this.car = new VehicleController(this.scene, "car", this.city.spawnPoints.car);
    this.bike = new VehicleController(this.scene, "bike", this.city.spawnPoints.bike);

    this.cameraRig.snapTo(this.locomotion.position.clone().add(new THREE.Vector3(0, 2, -4)));

    input.start();
    this.handleResize();
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.viewport);
    window.addEventListener("resize", this.handleResize);
  }

  private setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.fog = new THREE.FogExp2(0x263345, 0.0016);

    // Simple vertical gradient night sky.
    const skyGeo = new THREE.SphereGeometry(700, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color(0x0a1230) },
        bottom: { value: new THREE.Color(0x263345) },
      },
      vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y * 0.5 + 0.5;
          gl_FragColor = vec4(mix(bottom, top, h), 1.0);
        }
      `,
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));
    this.scene.background = new THREE.Color(0x0e1626);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.cameraRig.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.28, 1.3);
    this.composer.addPass(this.bloomPass);
  }

  private setupLighting() {
    const ambient = new THREE.AmbientLight(0x1a2438, 0.7);
    this.scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0x5577aa, 0x101018, 0.5);
    this.scene.add(hemi);

    const moon = new THREE.DirectionalLight(0x8fb3ff, 1.15);
    moon.position.set(-120, 180, -80);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.near = 10;
    moon.shadow.camera.far = 500;
    const s = 220;
    moon.shadow.camera.left = -s;
    moon.shadow.camera.right = s;
    moon.shadow.camera.top = s;
    moon.shadow.camera.bottom = -s;
    moon.shadow.bias = -0.0015;
    this.scene.add(moon);
    this.scene.add(moon.target);
  }

  private handleResize = () => {
    const w = this.viewport.clientWidth || 1;
    const h = this.viewport.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloomPass.setSize(w, h);
    this.cameraRig.setAspect(w / h);
  };

  onUserGesture() {
    audioSynth.resume();
  }

  togglePause() {
    this.paused = !this.paused;
  }

  triggerTrailer() {
    if (this.mode === "cinematic") return;
    this.previousMode = this.mode;
    this.preTrailerPlayerPos.copy(this.locomotion.position);
    this.mode = "cinematic";
    this.trailerT = 0;
    if (!this.car.occupied) this.car.enter();
    this.car.position.set(this.city.spawnPoints.car.x, 0, this.city.spawnPoints.car.z - 12);
    this.car.yaw = 0;
    this.car.speed = 0;
  }
  private preTrailerPlayerPos = new THREE.Vector3();

  private endTrailer() {
    this.mode = this.previousMode;
    if (this.mode !== "car") {
      this.car.exit();
    }
    if (this.mode === "foot") {
      this.locomotion.reset(this.preTrailerPlayerPos);
    }
    this.cameraRig.mode = this.mode === "car" ? "pursuit" : "shoulder";
  }

  private nearestVehicle(): { vehicle: VehicleController; kind: "car" | "bike" } | null {
    const dCar = this.car.distanceTo(this.locomotion.position);
    const dBike = this.bike.distanceTo(this.locomotion.position);
    if (dCar <= VEHICLE_ENTER_RANGE && dCar <= dBike) return { vehicle: this.car, kind: "car" };
    if (dBike <= VEHICLE_ENTER_RANGE) return { vehicle: this.bike, kind: "bike" };
    return null;
  }

  private handleVehicleAction() {
    if (this.mode === "foot") {
      const near = this.nearestVehicle();
      if (near && !near.vehicle.occupied) {
        near.vehicle.enter();
        this.locomotion.rig.root.visible = false;
        this.mode = near.kind;
      }
    } else if (this.mode === "car" || this.mode === "bike") {
      const vehicle = this.mode === "car" ? this.car : this.bike;
      const speedKmh = Math.abs(vehicle.speed) * 3.6;
      const exitOffset = new THREE.Vector3(Math.cos(vehicle.yaw), 0, -Math.sin(vehicle.yaw)).multiplyScalar(2.4);
      this.locomotion.position.copy(vehicle.position).add(exitOffset);
      this.locomotion.position.y = 0.9;
      this.locomotion.velocity.set(Math.sin(vehicle.yaw) * Math.min(3, vehicle.speed * 0.4), 0.5, Math.cos(vehicle.yaw) * Math.min(3, vehicle.speed * 0.4));
      this.locomotion.mode = "air";
      this.locomotion.rig.root.visible = true;
      vehicle.exit();
      if (speedKmh > EXIT_SPEED_THRESHOLD_KMH) {
        this.coastingVehicle = vehicle;
      }
      this.mode = "foot";
    }
  }
  private coastingVehicle: VehicleController | null = null;

  private updateTrailer(dt: number) {
    this.trailerT += dt;
    const t = this.trailerT;
    const emptyInput = {
      moveX: 0,
      moveY: 0,
      sprint: false,
      jumpVault: false,
      handbrake: false,
      nitro: false,
      webSwing: false,
      drift: false,
      vehicleAction: false,
      cameraCycle: false,
      trailer: false,
      pause: false,
    };

    if (t <= TRAILER.braking.end) {
      const throttle = t < TRAILER.braking.start ? 1 : -1;
      const nitro = t >= 1.4 && t <= 5.4;
      this.car.update(dt, { ...emptyInput, moveY: throttle, nitro }, this.city.grid);
    } else if (t <= TRAILER.doorOpen.end) {
      this.car.update(dt, { ...emptyInput, moveY: -0.6 }, this.city.grid);
    } else {
      this.car.update(dt, emptyInput, this.city.grid);
    }
    this.bike.update(dt, emptyInput, this.city.grid);

    const carPos = this.car.position;
    const carYaw = this.car.yaw;
    const forward = new THREE.Vector3(Math.sin(carYaw), 0, Math.cos(carYaw));

    if (t <= TRAILER.heroClose.end) {
      const p = carPos.clone().addScaledVector(forward, 3.2);
      p.y = 0.35;
      p.addScaledVector(new THREE.Vector3(forward.z, 0, -forward.x), 0.9);
      this.cameraRig.setPose(p, carPos.clone().addScaledVector(forward, -1), 42);
    } else if (t <= TRAILER.pursuit.end) {
      const side = new THREE.Vector3(forward.z, 0, -forward.x);
      const p = carPos.clone().addScaledVector(forward, -10).addScaledVector(side, 6);
      p.y = 7;
      this.cameraRig.setPose(p, carPos.clone().add(new THREE.Vector3(0, 1, 0)), 62);
    } else if (t <= TRAILER.braking.end) {
      const p = carPos.clone().addScaledVector(forward, -8);
      p.y = 3.4;
      this.cameraRig.setPose(p, carPos.clone(), 55);
    } else if (t <= TRAILER.doorOpen.end) {
      if (!this.car.occupied) this.car.enter();
      this.car.doorTarget = 1.12;
      const side = new THREE.Vector3(forward.z, 0, -forward.x);
      const p = carPos.clone().addScaledVector(side, 3.2);
      p.y = 1.4;
      this.cameraRig.setPose(p, carPos.clone().setY(1), 45);
    } else {
      if (this.car.occupied) this.car.exit();
      if (this.trailerSwingStarted !== true) {
        this.trailerSwingStarted = true;
        const startPos = carPos.clone().addScaledVector(forward, 6);
        startPos.y = 0.9;
        this.locomotion.reset(startPos);
        this.locomotion.rig.root.visible = true;
        this.locomotion.yaw = carYaw;
      }
      const swingT = t - TRAILER.swingCut.start;
      if (swingT < 0.4) {
        this.locomotion.velocity.set(Math.sin(carYaw) * TRAILER_SPRINT_SPEED, 0, Math.cos(carYaw) * TRAILER_SPRINT_SPEED);
        this.locomotion.position.addScaledVector(this.locomotion.velocity, dt);
        this.locomotion.rig.setState("sprint");
        this.locomotion.rig.update(dt, 1.3);
        this.locomotion.rig.root.position.copy(this.locomotion.position);
        this.locomotion.rig.root.rotation.y = carYaw;
      } else if (swingT < 0.7) {
        this.locomotion.velocity.y = 6;
        this.locomotion.position.addScaledVector(this.locomotion.velocity, dt);
        this.locomotion.velocity.y += -18 * dt;
        this.locomotion.rig.setState("jump");
        this.locomotion.rig.update(dt, 1);
        this.locomotion.rig.root.position.copy(this.locomotion.position);
      } else {
        if (this.locomotion.mode !== "swing") {
          this.locomotion.velocity.set(Math.sin(carYaw) * 8, 4, Math.cos(carYaw) * 8);
          const anchor = new THREE.Vector3(this.locomotion.position.x + Math.sin(carYaw) * 30, this.locomotion.position.y + 28, this.locomotion.position.z + Math.cos(carYaw) * 30);
          this.locomotion.swingAnchor = anchor;
          this.locomotion.swingLength = this.locomotion.position.distanceTo(anchor);
          this.locomotion.mode = "swing";
        }
        this.locomotion.update(dt, { ...emptyInput }, this.city.grid, carYaw, false);
      }
      const camPos = this.locomotion.position.clone().addScaledVector(forward, -6);
      camPos.y += 3;
      this.cameraRig.setPose(camPos, this.locomotion.position.clone(), 78);
    }

    if (t >= TRAILER.swingCut.end) {
      this.trailerSwingStarted = false;
      this.endTrailer();
    }
  }
  private trailerSwingStarted = false;

  private tick = () => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;
    this.fpsSmoothed = THREE.MathUtils.lerp(this.fpsSmoothed, dt > 0 ? 1 / dt : 60, 0.05);

    this.city.update(elapsed);

    if (input.wasPressed("pause")) {
      this.togglePause();
    }
    input.consume("pause");

    if (!this.paused) {
      if (input.wasPressed("trailer")) this.triggerTrailer();
      input.consume("trailer");

      if (this.mode === "cinematic") {
        this.updateTrailer(dt);
      } else {
        if (input.wasPressed("cameraCycle")) this.cameraRig.cycle();
        input.consume("cameraCycle");
        if (input.wasPressed("vehicleAction")) this.handleVehicleAction();
        input.consume("vehicleAction");

        if (this.mode === "foot") {
          const near = this.nearestVehicle();
          this.locomotion.update(dt, input.state, this.city.grid, this.cameraRig.yaw, near !== null);
          if (this.locomotion.mode === "swing") {
            this.cameraRig.updateSwing(dt, this.locomotion.position, this.locomotion.velocity, this.locomotion.fovBoost);
          } else {
            this.cameraRig.updateShoulder(dt, this.locomotion.position, this.locomotion.yaw, this.locomotion.fovBoost, this.city.grid);
          }
          this.car.update(dt, input.state, this.city.grid);
          this.bike.update(dt, input.state, this.city.grid);
        } else {
          const active = this.mode === "car" ? this.car : this.bike;
          const idle = this.mode === "car" ? this.bike : this.car;
          const telemetry = active.update(dt, input.state, this.city.grid);
          idle.update(dt, input.state, this.city.grid);
          this.cameraRig.updatePursuit(dt, active.position, active.yaw, active.speed, input.state.nitro, this.city.grid);
          audioSynth.updateEngine(
            Math.min(1, Math.abs(active.speed) / 60),
            telemetry.gear,
            input.state.nitro,
            telemetry.drifting,
            telemetry.driftIntensity,
          );
        }
      }
    }

    if (this.coastingVehicle) {
      this.coastingVehicle.applyExitFriction(dt);
      if (Math.abs(this.coastingVehicle.speed) < 0.2) this.coastingVehicle = null;
    }

    this.telemetryFrameCounter++;
    if (this.telemetryFrameCounter % 3 === 0) this.emitTelemetry();
    input.endFrame();
    this.composer.render();
  };
  private telemetryFrameCounter = 0;

  private emitTelemetry() {
    if (!this.callbacks) return;
    let speedKmh = 0;
    let gear = 1;
    let nitro01 = 1;
    let drifting = false;
    let driftScore = 0;
    if (this.mode === "car" || this.mode === "bike") {
      const v = this.mode === "car" ? this.car : this.bike;
      speedKmh = Math.abs(v.speed) * 3.6;
      gear = Math.max(1, Math.min(6, Math.floor((Math.abs(v.speed) / 95) * 6) + 1));
      nitro01 = v.nitroGauge / 100;
      driftScore = v.driftScore;
    }
    const near = this.mode === "foot" ? this.nearestVehicle() : null;
    this.callbacks.onTelemetry({
      mode: this.mode,
      speedKmh,
      gear,
      nitro01,
      drifting,
      driftScore,
      swingReady: this.mode === "foot" && this.locomotion.mode !== "swing",
      nearVehiclePrompt: near ? near.kind : null,
      paused: this.paused,
      trailerActive: this.mode === "cinematic",
      playerX: this.locomotion.position.x,
      playerZ: this.locomotion.position.z,
      playerYaw: this.locomotion.yaw,
      carX: this.car.position.x,
      carZ: this.car.position.z,
      bikeX: this.bike.position.x,
      bikeZ: this.bike.position.z,
      fps: Math.round(this.fpsSmoothed),
    });
  }

  getMinimapBuildings(): MinimapEntity[] {
    return this.minimapBuildings;
  }

  getVehiclePositions() {
    return { car: this.car.position, bike: this.bike.position };
  }

  start() {
    this.clock.start();
    this.rafId = requestAnimationFrame(this.tick);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    input.stop();
    window.removeEventListener("resize", this.handleResize);
    this.resizeObserver?.disconnect();
    audioSynth.stopEngine();
    this.renderer.dispose();
  }
}
