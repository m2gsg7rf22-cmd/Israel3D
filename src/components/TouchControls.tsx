import { useRef, useState } from "react";
import { Gauge, Ban, Zap, Disc, ArrowUpFromLine, Wind, KeyRound, RotateCw, Video, Pause } from "lucide-react";
import { input } from "../game/Input";
import type { InputState } from "../game/types";

const JOYSTICK_RADIUS = 65;

function Joystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activePointer = useRef<number | null>(null);

  const updateFromEvent = (e: React.PointerEvent) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > JOYSTICK_RADIUS) {
      dx = (dx / dist) * JOYSTICK_RADIUS;
      dy = (dy / dist) * JOYSTICK_RADIUS;
    }
    setKnob({ x: dx, y: dy });
    input.setJoystick(dx / JOYSTICK_RADIUS, dy / JOYSTICK_RADIUS);
  };

  const onDown = (e: React.PointerEvent) => {
    activePointer.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromEvent(e);
  };
  const onMove = (e: React.PointerEvent) => {
    if (activePointer.current !== e.pointerId) return;
    updateFromEvent(e);
  };
  const onUp = (e: React.PointerEvent) => {
    if (activePointer.current !== e.pointerId) return;
    activePointer.current = null;
    setKnob({ x: 0, y: 0 });
    input.setJoystick(0, 0);
  };

  return (
    <div
      ref={baseRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className="relative rounded-full bg-white/10 border-2 border-white/25 touch-none"
      style={{ width: JOYSTICK_RADIUS * 2 + 20, height: JOYSTICK_RADIUS * 2 + 20 }}
    >
      <div
        className="absolute rounded-full bg-azure-500/70 border border-azure-300 shadow-lg"
        style={{
          width: 64,
          height: 64,
          left: JOYSTICK_RADIUS + 10 - 32 + knob.x,
          top: JOYSTICK_RADIUS + 10 - 32 + knob.y,
        }}
      />
    </div>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onDown?: () => void;
  onUp?: () => void;
  onTap?: () => void;
  colorClass?: string;
}

function ActionButton({ icon, label, onDown, onUp, onTap, colorClass }: ActionButtonProps) {
  const [active, setActive] = useState(false);
  return (
    <button
      className={`flex flex-col items-center justify-center gap-1 rounded-2xl border-2 select-none touch-none transition-colors ${
        active ? "bg-azure-500/60 border-azure-300" : `bg-white/10 border-white/20 ${colorClass ?? ""}`
      }`}
      style={{ width: 92, height: 92 }}
      onPointerDown={(e) => {
        e.preventDefault();
        setActive(true);
        onDown?.();
        onTap?.();
      }}
      onPointerUp={() => {
        setActive(false);
        onUp?.();
      }}
      onPointerLeave={() => {
        if (active) {
          setActive(false);
          onUp?.();
        }
      }}
    >
      {icon}
      <span className="text-[11px] font-semibold text-white/85 leading-none">{label}</span>
    </button>
  );
}

export default function TouchControls() {
  const setBtn = (name: keyof InputState, v: boolean) => input.setButton(name, v);

  return (
    <div className="w-full h-full bg-[#0a0d14] flex flex-col justify-between px-6 py-5" style={{ touchAction: "none" }}>
      <div className="flex items-center justify-between">
        <ActionButton icon={<Pause size={22} />} label="Pause" onTap={() => input.pressEdge("pause")} />
        <ActionButton icon={<Video size={22} />} label="Trailer" onTap={() => input.pressEdge("trailer")} />
        <ActionButton icon={<RotateCw size={22} />} label="Camera" onTap={() => input.pressEdge("cameraCycle")} />
      </div>

      <div className="flex items-end justify-between">
        <Joystick />

        <div className="grid grid-cols-3 gap-3">
          <ActionButton icon={<Gauge size={24} />} label="Gas" onDown={() => { setBtn("sprint", true); input.setThrottle(1); }} onUp={() => { setBtn("sprint", false); input.setThrottle(0); }} />
          <ActionButton icon={<Zap size={24} />} label="Nitro" onDown={() => setBtn("nitro", true)} onUp={() => setBtn("nitro", false)} colorClass="border-cyan-400/40" />
          <ActionButton icon={<KeyRound size={24} />} label="Enter" onTap={() => input.pressEdge("vehicleAction")} />

          <ActionButton icon={<Ban size={24} />} label="Brake" onDown={() => input.setThrottle(-1)} onUp={() => input.setThrottle(0)} />
          <ActionButton icon={<Disc size={24} />} label="Drift" onDown={() => setBtn("handbrake", true)} onUp={() => setBtn("handbrake", false)} colorClass="border-amber-400/40" />
          <ActionButton icon={<ArrowUpFromLine size={24} />} label="Vault" onDown={() => setBtn("jumpVault", true)} onUp={() => setBtn("jumpVault", false)} />

          <div />
          <ActionButton icon={<Wind size={24} />} label="Swing" onDown={() => setBtn("webSwing", true)} onUp={() => setBtn("webSwing", false)} colorClass="border-blue-400/40" />
          <div />
        </div>
      </div>
    </div>
  );
}
