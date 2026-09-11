import { useEffect, useRef, useState } from "react";
import { Engine } from "./game/Engine";
import HUD from "./components/HUD";
import TouchControls from "./components/TouchControls";
import type { MinimapEntity, TelemetrySnapshot } from "./game/types";

const FRAME_W = 1080;
const FRAME_H = 1920;
const GAME_H = 960;

const initialTelemetry: TelemetrySnapshot = {
  mode: "foot",
  speedKmh: 0,
  gear: 1,
  nitro01: 1,
  drifting: false,
  driftScore: 0,
  swingReady: true,
  nearVehiclePrompt: null,
  paused: false,
  trailerActive: false,
  playerX: 0,
  playerZ: 0,
  playerYaw: 0,
  carX: 0,
  carZ: 0,
  bikeX: 0,
  bikeZ: 0,
  fps: 60,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);

  const [scale, setScale] = useState(1);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(initialTelemetry);
  const [buildings, setBuildings] = useState<MinimapEntity[]>([]);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const computeScale = () => {
      setScale(Math.min(window.innerWidth / FRAME_W, window.innerHeight / FRAME_H));
    };
    computeScale();
    window.addEventListener("resize", computeScale);
    return () => window.removeEventListener("resize", computeScale);
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !viewportRef.current) return;
    const engine = new Engine(canvasRef.current, viewportRef.current);
    engineRef.current = engine;
    engine.init({ onTelemetry: setTelemetry });
    setBuildings(engine.getMinimapBuildings());
    engine.start();
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleFirstInteraction = () => {
    engineRef.current?.onUserGesture();
    setStarted(true);
  };

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      <div
        className="relative bg-black shadow-2xl"
        style={{ width: FRAME_W, height: FRAME_H, transform: `scale(${scale})`, transformOrigin: "center center" }}
      >
        <div ref={viewportRef} className="absolute top-0 left-0 overflow-hidden bg-black" style={{ width: FRAME_W, height: GAME_H }}>
          <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
          <HUD telemetry={telemetry} buildings={buildings} />

          {!started && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/85 cursor-pointer"
              onPointerDown={handleFirstInteraction}
            >
              <h1 className="text-5xl font-black text-white tracking-tight">PORT SPIDER-AZURE</h1>
              <p className="text-slate-400 text-lg">Open-world mobile action — tap to begin</p>
              <div className="px-8 py-3 rounded-full bg-azure-500 text-white font-bold text-xl">TAP TO START</div>
            </div>
          )}
        </div>

        <div className="absolute left-0" style={{ top: GAME_H, width: FRAME_W, height: FRAME_H - GAME_H }}>
          <TouchControls />
        </div>
      </div>
    </div>
  );
}
