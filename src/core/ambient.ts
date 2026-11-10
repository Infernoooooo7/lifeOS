/**
 * Ambient soundscapes generated with the Web Audio API — nothing is downloaded, so they work
 * offline and add no weight to the app.
 */

export type Sound = 'off' | 'rain' | 'brown' | 'pad';
export const SOUNDS: { value: Sound; label: string }[] = [{ value: 'off', label: 'Off' }, { value: 'rain', label: 'Rain' }, { value: 'brown', label: 'Brown noise' }, { value: 'pad', label: 'Soft pad' }];

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let nodes: AudioNode[] = [];
let current: Sound = 'off';

function noiseBuffer(ac: AudioContext, brown: boolean): AudioBuffer {
  const buffer = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else data[i] = white;
  }
  return buffer;
}

function teardown() {
  for (const n of nodes) {
    try {
      (n as AudioScheduledSourceNode).stop?.();
      n.disconnect();
    } catch {
      /* already stopped */
    }
  }
  nodes = [];
}

/** Must be called from a user gesture the first time (browser autoplay rules). */
export function playAmbient(sound: Sound, volume = 0.5): void {
  current = sound;
  if (sound === 'off') {
    teardown();
    void ctx?.suspend();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx ??= new AC();
  void ctx.resume();
  teardown();
  master = ctx.createGain();
  master.gain.value = volume * 0.5;
  master.connect(ctx.destination);
  nodes.push(master);
  if (sound === 'brown' || sound === 'rain') {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, sound === 'brown');
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    if (sound === 'rain') {
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      filter.Q.value = 0.6;
      // slow swell so the rain is not a flat hiss
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 0.13;
      depth.gain.value = 0.12;
      lfo.connect(depth).connect(master.gain);
      lfo.start();
      nodes.push(lfo, depth);
    } else {
      filter.type = 'lowpass';
      filter.frequency.value = 500;
    }
    src.connect(filter).connect(master);
    src.start();
    nodes.push(src, filter);
  } else {
    for (const [freq, detune] of [[110, -4], [164.8, 3], [220, 5]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      gain.gain.value = 0.16;
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 0.05 + freq / 4000;
      depth.gain.value = 0.08;
      lfo.connect(depth).connect(gain.gain);
      osc.connect(gain).connect(master);
      osc.start();
      lfo.start();
      nodes.push(osc, gain, lfo, depth);
    }
  }
}

export function setAmbientVolume(volume: number): void {
  if (master) master.gain.value = volume * 0.5;
}
export const currentAmbient = (): Sound => current;

/** Short two-note chime when a phase ends. */
export function chime(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx ??= new AC();
    void ctx.resume();
    const t = ctx.currentTime;
    for (const [i, freq] of [660, 880].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.18, t + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + i * 0.18);
      osc.stop(t + i * 0.18 + 0.55);
    }
  } catch {
    /* audio not available */
  }
}
