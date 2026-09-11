export type ControlMode = "foot" | "car" | "bike" | "cinematic";

export type CameraMode = "pursuit" | "shoulder" | "swing" | "cinematic" | "orbit";

export interface InputState {
  moveX: number; // -1..1 (A/D, joystick x)
  moveY: number; // -1..1 (W/S, joystick y)
  sprint: boolean; // Shift
  jumpVault: boolean; // Space (edge-triggered consumed by consumers)
  handbrake: boolean; // Space held while driving
  nitro: boolean; // Shift held while driving
  webSwing: boolean; // Q / right click / touch swing
  drift: boolean; // E
  vehicleAction: boolean; // F (edge-triggered)
  cameraCycle: boolean; // C (edge-triggered)
  trailer: boolean; // V (edge-triggered)
  pause: boolean; // Esc / P (edge-triggered)
}

export interface Vec2 {
  x: number;
  y: number;
}

export type CharacterAnimState =
  | "idle"
  | "walk"
  | "run"
  | "sprint"
  | "swing"
  | "wallrun"
  | "jump"
  | "fall";

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
}

export interface BuildingCollider extends AABB {
  id: number;
  isWall: boolean;
}

export interface VehicleSocket {
  object: import("three").Object3D;
  kind: "car" | "bike";
  occupied: boolean;
}

export interface MinimapEntity {
  x: number;
  z: number;
  kind: "building" | "car" | "bike" | "player";
}

export interface TelemetrySnapshot {
  mode: ControlMode;
  speedKmh: number;
  gear: number;
  nitro01: number;
  drifting: boolean;
  driftScore: number;
  swingReady: boolean;
  nearVehiclePrompt: "car" | "bike" | null;
  paused: boolean;
  trailerActive: boolean;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  carX: number;
  carZ: number;
  bikeX: number;
  bikeZ: number;
  fps: number;
}
