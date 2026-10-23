let bangAudio: AudioContext | null = null;

export function primeStartSound() {
  const Context = window.AudioContext;
  if (!Context) return;
  bangAudio ??= new Context();
  void bangAudio.resume();
}

export function playBang() {
  const Context = window.AudioContext;
  if (!Context) return;
  bangAudio ??= new Context();
  const ctx = bangAudio;
  void ctx.resume();
  const duration = 0.22;
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.floor(rate * duration), rate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    const time = index / rate;
    const noise = (Math.random() * 2 - 1) * Math.exp(-time * 22);
    const thump = Math.sin(time * 170) * Math.exp(-time * 16) * 0.7;
    data[index] = noise + thump;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = 0.9;
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}
