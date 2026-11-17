// Night Mail's sound, all synthesized with WebAudio: there are no audio files. A soft chime
// that climbs with the combo, a paper thud for a crash, a whoosh for a near miss, small clicks
// for the menus, and a slow pentatonic lullaby that loops under the flight once the player has
// made their first input (browsers keep audio silent until then).

const MELODY = [
  // A gentle A-minor pentatonic pattern, in Hz; 0 is a rest. Two bars of eight slow steps.
  440.0, 0, 523.25, 0, 659.25, 0, 587.33, 523.25,
  440.0, 0, 392.0, 0, 329.63, 0, 392.0, 0,
];
const MELODY_STEP_SECONDS = 0.54;

export function createAudio() {
  let ctx = null;
  let master = null;
  let melodyTimer = null;
  let melodyStep = 0;
  let nextNoteAt = 0;
  let muted = false;

  function ensureContext() {
    if (ctx) return true;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    return true;
  }

  /** Call from a user gesture: creates the context if needed and resumes it. */
  function unlock() {
    if (!ensureContext()) return;
    if (ctx.state === 'suspended') void ctx.resume();
  }

  /** One soft oscillator note with a quick attack and an exponential fade. */
  function tone(freq, { type = 'sine', at = 0, dur = 0.25, vol = 0.16, slideTo = null } = {}) {
    if (!ctx || muted) return;
    const start = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  /** A burst of filtered noise, for paper and wind sounds. */
  function noise({ at = 0, dur = 0.3, vol = 0.2, from = 400, to = 1200 } = {}) {
    if (!ctx || muted) return;
    const start = ctx.currentTime + at;
    const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    source.connect(filter).connect(gain).connect(master);
    source.start(start);
  }

  function scheduleMelody() {
    if (!ctx) return;
    while (nextNoteAt < ctx.currentTime + 0.5) {
      const freq = MELODY[melodyStep % MELODY.length];
      if (freq > 0) {
        const at = Math.max(0, nextNoteAt - ctx.currentTime);
        tone(freq, { type: 'triangle', at, dur: 1.1, vol: 0.045 });
        tone(freq / 2, { type: 'sine', at, dur: 1.3, vol: 0.02 });
      }
      melodyStep += 1;
      nextNoteAt += MELODY_STEP_SECONDS;
    }
  }

  return {
    unlock,
    /** A delivery: two bright notes, the second higher the longer the combo runs. */
    chime(combo) {
      if (!ensureContext()) return;
      const lift = Math.min(combo, 8) * 40;
      tone(1318.5 + lift, { dur: 0.18, vol: 0.14 });
      tone(1760 + lift * 1.5, { at: 0.07, dur: 0.3, vol: 0.12 });
    },
    /** An express letter withdrawn: two notes falling away, the dash wasted. */
    late() {
      if (!ensureContext()) return;
      tone(987.77, { type: 'triangle', dur: 0.16, vol: 0.11 });
      tone(659.25, { type: 'triangle', at: 0.11, dur: 0.26, vol: 0.1 });
    },
    /** A fragile letter breaking on a roof: a small dry crack of noise. */
    crack() {
      if (!ensureContext()) return;
      noise({ dur: 0.09, vol: 0.16, from: 2600, to: 700 });
      tone(220, { type: 'square', dur: 0.07, vol: 0.05 });
    },
    /** A crash: a low thud and a crumple of paper noise. */
    thud() {
      if (!ensureContext()) return;
      tone(150, { type: 'sine', dur: 0.35, vol: 0.3, slideTo: 45 });
      noise({ dur: 0.28, vol: 0.22, from: 900, to: 200 });
    },
    /** A near miss: a quick sweep of air. */
    whoosh() {
      if (!ensureContext()) return;
      noise({ dur: 0.22, vol: 0.1, from: 500, to: 2400 });
    },
    /** A menu click. */
    click() {
      if (!ensureContext()) return;
      tone(880, { type: 'square', dur: 0.06, vol: 0.05 });
    },
    /** A night completed: a small rising arpeggio. */
    fanfare() {
      if (!ensureContext()) return;
      tone(523.25, { type: 'triangle', dur: 0.3, vol: 0.1 });
      tone(659.25, { type: 'triangle', at: 0.1, dur: 0.3, vol: 0.1 });
      tone(783.99, { type: 'triangle', at: 0.2, dur: 0.45, vol: 0.1 });
    },
    /** Start the lullaby loop (idempotent); it stays quiet until unmuted and unlocked. */
    startMelody() {
      if (!ensureContext() || melodyTimer !== null) return;
      melodyStep = 0;
      nextNoteAt = ctx.currentTime + 0.1;
      melodyTimer = window.setInterval(scheduleMelody, 200);
    },
    setMuted(value) {
      muted = value;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.02);
    },
    toggleMuted() {
      this.setMuted(!muted);
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
