/**
 * Pure Web Audio API synthesizer. No audio files — every sound (engine,
 * tires, wind, footsteps, UI, web-swing whoosh) is generated with
 * oscillators / filtered noise nodes.
 */
export class AudioSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  // Engine
  private engineOscLow: OscillatorNode | null = null;
  private engineOscMid: OscillatorNode | null = null;
  private engineOscHigh: OscillatorNode | null = null;
  private engineGainLow: GainNode | null = null;
  private engineGainMid: GainNode | null = null;
  private engineGainHigh: GainNode | null = null;
  private engineMasterGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  // Tire squeal
  private tireNoise: AudioBufferSourceNode | null = null;
  private tireFilter: BiquadFilterNode | null = null;
  private tireGain: GainNode | null = null;

  // Wind
  private windNoise: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private brownNoiseBuffer: AudioBuffer | null = null;
  private running = false;

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoiseBuffer("white");
    this.brownNoiseBuffer = this.makeNoiseBuffer("brown");
  }

  async resume() {
    if (!this.ctx) this.init();
    if (this.ctx!.state === "suspended") await this.ctx!.resume();
  }

  private makeNoiseBuffer(kind: "white" | "brown"): AudioBuffer {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === "brown") {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else {
        data[i] = white;
      }
    }
    return buffer;
  }

  startEngine() {
    if (!this.ctx || this.engineOscLow) return;
    const ctx = this.ctx;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = "lowpass";
    this.engineFilter.frequency.value = 2200;
    this.engineMasterGain = ctx.createGain();
    this.engineMasterGain.gain.value = 0;
    this.engineFilter.connect(this.engineMasterGain);
    this.engineMasterGain.connect(this.master!);

    const build = (type: OscillatorType, freq: number) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.engineFilter!);
      osc.start();
      return { osc, gain };
    };

    const low = build("sawtooth", 45);
    const mid = build("sawtooth", 90);
    const high = build("sawtooth", 170);
    this.engineOscLow = low.osc;
    this.engineGainLow = low.gain;
    this.engineOscMid = mid.osc;
    this.engineGainMid = mid.gain;
    this.engineOscHigh = high.osc;
    this.engineGainHigh = high.gain;

    // Tire squeal
    this.tireNoise = ctx.createBufferSource();
    this.tireNoise.buffer = this.brownNoiseBuffer;
    this.tireNoise.loop = true;
    this.tireFilter = ctx.createBiquadFilter();
    this.tireFilter.type = "bandpass";
    this.tireFilter.frequency.value = 1400;
    this.tireFilter.Q.value = 2.2;
    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0;
    this.tireNoise.connect(this.tireFilter);
    this.tireFilter.connect(this.tireGain);
    this.tireGain.connect(this.master!);
    this.tireNoise.start();

    // Wind / nitro
    this.windNoise = ctx.createBufferSource();
    this.windNoise.buffer = this.noiseBuffer;
    this.windNoise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = "highpass";
    this.windFilter.frequency.value = 800;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windNoise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master!);
    this.windNoise.start();

    this.running = true;
  }

  stopEngine() {
    if (!this.running) return;
    [this.engineOscLow, this.engineOscMid, this.engineOscHigh].forEach((o) => {
      try {
        o?.stop();
      } catch {
        /* already stopped */
      }
    });
    [this.tireNoise, this.windNoise].forEach((n) => {
      try {
        n?.stop();
      } catch {
        /* already stopped */
      }
    });
    this.engineOscLow = this.engineOscMid = this.engineOscHigh = null;
    this.tireNoise = this.windNoise = null;
    this.running = false;
  }

  /**
   * Update the engine sound each frame.
   * @param speed01 normalized 0..1 current speed vs top speed
   * @param gear current gear (1-6)
   * @param nitro whether nitro is currently active
   * @param drifting whether tires are currently sliding
   * @param driftIntensity 0..1
   */
  updateEngine(speed01: number, gear: number, nitro: boolean, drifting: boolean, driftIntensity: number) {
    if (!this.ctx || !this.running) return;
    const t = this.ctx.currentTime;
    const rpmPhase = (speed01 * 6) % 1; // 0..1 within current gear band
    const rpm = 900 + rpmPhase * 4300 + gear * 150;

    const baseLow = 40 + rpm * 0.03;
    const baseMid = 80 + rpm * 0.09;
    const baseHigh = 140 + rpm * 0.2;

    this.engineOscLow?.frequency.setTargetAtTime(baseLow, t, 0.05);
    this.engineOscMid?.frequency.setTargetAtTime(baseMid, t, 0.05);
    this.engineOscHigh?.frequency.setTargetAtTime(baseHigh, t, 0.05);

    // crossfade gain by rpm band: low dominant at idle, mid mid-range, high top-end
    const gLow = Math.max(0, 1 - rpmPhase * 2.2);
    const gMid = Math.max(0, 1 - Math.abs(rpmPhase - 0.5) * 2.2);
    const gHigh = Math.max(0, (rpmPhase - 0.4) * 1.8);
    this.engineGainLow?.gain.setTargetAtTime(gLow * 0.5, t, 0.08);
    this.engineGainMid?.gain.setTargetAtTime(gMid * 0.45, t, 0.08);
    this.engineGainHigh?.gain.setTargetAtTime(gHigh * 0.4, t, 0.08);

    this.engineMasterGain?.gain.setTargetAtTime(0.18 + speed01 * 0.28, t, 0.06);
    this.engineFilter?.frequency.setTargetAtTime(1200 + speed01 * 4000, t, 0.08);

    this.tireGain?.gain.setTargetAtTime(drifting ? 0.12 + driftIntensity * 0.35 : 0, t, 0.05);

    const windTarget = Math.min(0.5, speed01 * 0.4 + (nitro ? 0.28 : 0));
    this.windGain?.gain.setTargetAtTime(windTarget, t, 0.15);
    this.windFilter?.frequency.setTargetAtTime(700 + speed01 * 2200 + (nitro ? 900 : 0), t, 0.1);
  }

  /** One-shot whoosh for web-swing launch/release. */
  playSwingWhoosh(release = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(release ? 1800 : 400, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(release ? 300 : 2200, ctx.currentTime + 0.45);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    src.start();
    src.stop(ctx.currentTime + 0.55);
  }

  /** Footstep click, pitch varied by locomotion state. */
  playFootstep(intensity = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 120 + Math.random() * 40;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12 * intensity, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
    osc.connect(gain);
    gain.connect(this.master!);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  playUIClick() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 880;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06);
    osc.connect(gain);
    gain.connect(this.master!);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  }

  playIgnition() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(60, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.3);
    osc.frequency.exponentialRampToValueAtTime(90, ctx.currentTime + 0.5);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(this.master!);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
  }
}

export const audioSynth = new AudioSynth();
