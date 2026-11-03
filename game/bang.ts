let bangAudio: AudioContext | null = null;

export function primeStartSound() {
  const Context = window.AudioContext;
  if (!Context) return;
  bangAudio ??= new Context();
  void bangAudio.resume();
}

/** Inharmonic partials of a struck bell: frequency ratio, level, decay per second. */
const BELL_PARTIALS = [
  [1, 0.5, 4],
  [2.32, 0.3, 6],
  [4.25, 0.18, 9],
  [6.63, 0.1, 13],
  [9.38, 0.06, 18],
] as const;
const BELL_HZ = 880;

export function playBell() {
  const Context = window.AudioContext;
  if (!Context) return;
  bangAudio ??= new Context();
  const ctx = bangAudio;
  void ctx.resume();
  const duration = 1.1;
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.floor(rate * duration), rate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    const time = index / rate;
    let sample = 0;
    for (const [ratio, level, decay] of BELL_PARTIALS) {
      sample += Math.sin(2 * Math.PI * BELL_HZ * ratio * time) * level * Math.exp(-time * decay);
    }
    data[index] = sample;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = 0.8;
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}
