import { Zap, Car, Bike as BikeIcon, Pause, Video, Wind } from "lucide-react";
import type { MinimapEntity, TelemetrySnapshot } from "../game/types";

interface HUDProps {
  telemetry: TelemetrySnapshot;
  buildings: MinimapEntity[];
}

const MINIMAP_RANGE = 130; // meters shown edge-to-edge
const MINIMAP_SIZE = 190; // px

function toMiniPos(dx: number, dz: number) {
  const scale = MINIMAP_SIZE / 2 / MINIMAP_RANGE;
  const x = MINIMAP_SIZE / 2 + dx * scale;
  const y = MINIMAP_SIZE / 2 + dz * scale;
  return { x, y };
}

function Minimap({ telemetry, buildings }: HUDProps) {
  const nearby = buildings.filter((b) => {
    const dx = b.x - telemetry.playerX;
    const dz = b.z - telemetry.playerZ;
    return dx * dx + dz * dz < MINIMAP_RANGE * MINIMAP_RANGE;
  });
  const carRel = toMiniPos(telemetry.carX - telemetry.playerX, telemetry.carZ - telemetry.playerZ);
  const bikeRel = toMiniPos(telemetry.bikeX - telemetry.playerX, telemetry.bikeZ - telemetry.playerZ);

  return (
    <div
      className="absolute rounded-full border-2 border-azure-400/60 bg-slate-950/70 overflow-hidden shadow-lg backdrop-blur-sm"
      style={{ width: MINIMAP_SIZE, height: MINIMAP_SIZE, top: 24, right: 24 }}
    >
      {nearby.map((b, i) => {
        const p = toMiniPos(b.x - telemetry.playerX, b.z - telemetry.playerZ);
        return (
          <div
            key={i}
            className="absolute bg-slate-400/70 rounded-sm"
            style={{ width: 6, height: 6, left: p.x - 3, top: p.y - 3 }}
          />
        );
      })}
      <div className="absolute bg-cyan-300 rounded-full" style={{ width: 8, height: 8, left: carRel.x - 4, top: carRel.y - 4 }} />
      <div className="absolute bg-orange-300 rounded-full" style={{ width: 8, height: 8, left: bikeRel.x - 4, top: bikeRel.y - 4 }} />
      <div
        className="absolute"
        style={{
          left: MINIMAP_SIZE / 2 - 7,
          top: MINIMAP_SIZE / 2 - 7,
          width: 0,
          height: 0,
          borderLeft: "7px solid transparent",
          borderRight: "7px solid transparent",
          borderBottom: "14px solid #38bdf8",
          transform: `rotate(${telemetry.playerYaw}rad)`,
          transformOrigin: "50% 65%",
        }}
      />
    </div>
  );
}

export default function HUD({ telemetry, buildings }: HUDProps) {
  const driving = telemetry.mode === "car" || telemetry.mode === "bike";

  return (
    <div className="pointer-events-none absolute inset-0 text-white select-none" style={{ fontFamily: "system-ui, sans-serif" }}>
      <Minimap telemetry={telemetry} buildings={buildings} />

      {/* Top-left status */}
      <div className="absolute top-6 left-6 flex flex-col gap-2">
        {telemetry.mode === "foot" && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${telemetry.swingReady ? "bg-cyan-500/30 text-cyan-200" : "bg-slate-700/40 text-slate-400"}`}>
            <Wind size={16} />
            Web-Swing {telemetry.swingReady ? "Ready" : "Active"}
          </div>
        )}
        {driving && telemetry.driftScore > 0 && (
          <div className="px-3 py-1.5 rounded-full bg-amber-500/30 text-amber-200 text-sm font-bold">
            Drift Score: {Math.round(telemetry.driftScore)}
          </div>
        )}
      </div>

      {/* Vehicle prompt */}
      {telemetry.mode === "foot" && telemetry.nearVehiclePrompt && (
        <div className="absolute left-1/2 -translate-x-1/2 top-24 px-4 py-2 rounded-xl bg-black/60 text-lg font-bold flex items-center gap-2">
          {telemetry.nearVehiclePrompt === "car" ? <Car size={20} /> : <BikeIcon size={20} />}
          Tap Enter to {telemetry.nearVehiclePrompt === "car" ? "drive" : "ride"}
        </div>
      )}

      {/* Speedometer / gear / nitro */}
      {driving && (
        <div className="absolute bottom-8 left-8 flex items-end gap-4">
          <div className="flex flex-col items-start">
            <div className="text-6xl font-black tracking-tight leading-none" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}>
              {Math.round(telemetry.speedKmh)}
            </div>
            <div className="text-sm font-semibold text-slate-300 tracking-widest">KM/H</div>
          </div>
          <div className="flex flex-col items-center bg-black/50 rounded-lg px-3 py-1 mb-1">
            <div className="text-2xl font-bold">{telemetry.gear}</div>
            <div className="text-[10px] text-slate-400 tracking-wide">GEAR</div>
          </div>
          <div className="flex flex-col gap-1 mb-1">
            <div className="flex items-center gap-1 text-xs font-semibold text-cyan-300">
              <Zap size={13} /> NITRO
            </div>
            <div className="w-32 h-3 rounded-full bg-slate-800/70 overflow-hidden border border-cyan-500/40">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-[width]"
                style={{ width: `${telemetry.nitro01 * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Trailer letterbox */}
      {telemetry.trailerActive && (
        <>
          <div className="absolute top-0 left-0 right-0 bg-black" style={{ height: 60 }} />
          <div className="absolute bottom-0 left-0 right-0 bg-black" style={{ height: 60 }} />
          <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Video size={16} /> CINEMATIC MODE
          </div>
        </>
      )}

      {/* Pause overlay */}
      {telemetry.paused && (
        <div className="pointer-events-auto absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
          <Pause size={48} />
          <div className="text-2xl font-bold">PAUSED</div>
          <div className="text-sm text-slate-400">Press Esc / P to resume</div>
        </div>
      )}

      <div className="absolute bottom-2 right-3 text-[10px] text-slate-500">{telemetry.fps} FPS</div>
    </div>
  );
}
