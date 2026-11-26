// Sound, all synthesized with WebAudio: a propeller engine whose pitch follows the airspeed,
// a two-note chime for a ring flown through, a soft whoosh for a near miss and a dull thud for
// a hit. The context is created on the first user gesture (browsers refuse it sooner) and
// every call is safe when audio is unavailable, as in a headless screenshot run.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineSub = null;
  let engineGain = null;
  let engineFilter = null;

  function ensure() {
    if (ctx !== null) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineSub = ctx.createOscillator();
      engineSub.type = 'square';
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineFilter.Q.value = 2;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineSub.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      engineSub.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function blip(freq, at, dur, type, gain) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  function noise(at, dur, freqFrom, freqTo, gain) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.1;
    filter.frequency.setValueAtTime(freqFrom, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, freqTo), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(at);
  }

  return {
    /** Call from a user gesture: starts the engine loop. */
    unlock() {
      ensure();
    },
    /** Per-frame: pitch and volume follow the flight. Silent unless unlocked. */
    engine(speedRatio, boosting, running) {
      if (ctx === null || engineOsc === null) return;
      const t = ctx.currentTime;
      const freq = 52 + speedRatio * 46 + (boosting ? 14 : 0);
      engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
      engineSub.frequency.setTargetAtTime(freq / 2, t, 0.08);
      engineFilter.frequency.setTargetAtTime(320 + speedRatio * 480, t, 0.1);
      engineGain.gain.setTargetAtTime(running ? 0.045 + speedRatio * 0.02 : 0, t, 0.12);
    },
    ring(streak) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const lift = Math.min(streak, 8) * 40;
      blip(880 + lift, t, 0.16, 'sine', 0.16);
      blip(1318 + lift, t + 0.07, 0.22, 'sine', 0.14);
    },
    nearMiss() {
      if (!ensure()) return;
      noise(ctx.currentTime, 0.28, 500, 2400, 0.1);
    },
    hit() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      noise(t, 0.3, 300, 60, 0.3);
      blip(70, t, 0.3, 'sine', 0.3);
    },
    gust() {
      if (!ensure()) return;
      noise(ctx.currentTime, 1.6, 300, 900, 0.05);
    },
    over() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      blip(392, t, 0.25, 'triangle', 0.14);
      blip(311, t + 0.22, 0.25, 'triangle', 0.14);
      blip(233, t + 0.44, 0.5, 'triangle', 0.16);
    },
  };
}
