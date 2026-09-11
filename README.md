# Port Spider-Azure

A mobile-first 3D open-world action game built with React, TypeScript, Three.js, and Tailwind CSS. Web-swing and wall-run through a procedurally generated night-time city, or drop into a sports car or motorcycle and drift through the streets — all rendered live in WebGL with zero external assets (meshes, textures, and audio are all generated at runtime).

## Getting started

```bash
npm install
npm run dev -- --port 3000
```

Open the printed local URL in a browser. Click/tap once to start (this also unlocks the Web Audio engine).

## Controls

| Key | Driving | On-Foot | Web-Swing |
| --- | --- | --- | --- |
| W/S / Arrows | Throttle / Brake-Reverse | Move | Accelerate / Decelerate |
| A/D / Arrows | Steer | Turn / Strafe | Swing side to side |
| Shift | Nitro | Sprint | Boost release |
| Space | Handbrake | Jump / Vault | Detach |
| E | Drift angle | Vault | — |
| Q / Right-click | — | Web-swing grapple | Re-cast |
| F | Exit vehicle | Enter vehicle | — |
| C | Cycle camera | Cycle camera | Cycle camera |
| V | 12-second cinematic trailer (any mode) |
| Esc / P | Pause |

On touch devices, the lower half of the screen is a virtual joystick (left) plus Gas/Brake/Nitro/Drift/Vault/Web-Swing/Enter/Camera buttons (right).

## Architecture

All gameplay code lives under `src/game/`:

- `Engine.ts` — scene setup, render loop, ACES tone mapping + bloom post-processing, mode switching (foot/car/bike/cinematic)
- `CityBuilder.ts` — procedural districts, roads, buildings (with a custom parallax window shader), streetlights, props, and a spatial-grid collider index
- `Locomotion.ts` / `CharacterRig.ts` — on-foot movement, web-swing pendulum physics, wall-running, vaulting, and a procedural kinematic character rig
- `VehicleController.ts` — shared car/motorcycle planar physics (drift, nitro, wheelie/lean), procedural meshes, skid marks and smoke
- `CameraRig.ts` — pursuit/over-the-shoulder/swing cameras plus the scripted cinematic trailer
- `AudioSynth.ts` — pure Web Audio API engine/tire/wind/whoosh synthesizer
- `Input.ts` — shared keyboard + touch input state

React UI (`src/App.tsx`, `src/components/`) renders a fixed 1080×1920 mobile frame that scales uniformly to any viewport: the top 1080×960 is the live game view + HUD, the bottom is the touch control dashboard.

No physics engine, 3D model files, or audio files are used — collision/traversal use a hand-rolled spatial grid, and all meshes/sounds are generated procedurally at startup.
