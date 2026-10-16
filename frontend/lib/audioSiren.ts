// Web Audio API siren & chime for emergency alarm - zero external audio dependencies
let audioCtx: AudioContext | null = null;
const activeOscillators = new Set<OscillatorNode>();
const activeGainNodes = new Set<GainNode>();
let sweepInterval: NodeJS.Timeout | null = null;
let isMuted = false;

export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended' && !isMuted) {
      audioCtx.resume().catch(() => {});
    }
  } catch (err) {
    console.warn('Could not initialize AudioContext:', err);
  }
  return audioCtx;
}

// Automatically unlock audio context on first user interaction in browser
if (typeof window !== 'undefined') {
  const unlock = () => {
    try {
      if (!isMuted) {
        const ctx = getAudioContext();
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
      }
    } catch {}
  };
  window.addEventListener('click', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('touchstart', unlock, { once: true });
}

export function playSiren() {
  if (typeof window === 'undefined') return;
  if (isMuted) return; // Do not play if muted

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    // Stop any previously playing siren nodes immediately
    stopSiren();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    activeOscillators.add(osc);
    activeGainNodes.add(gain);

    osc.onended = () => {
      activeOscillators.delete(osc);
      activeGainNodes.delete(gain);
    };

    osc.type = 'sawtooth';
    gain.gain.setValueAtTime(0.01, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();

    // Frequency sweep 880Hz -> 440Hz every 300ms
    let isHigh = true;
    const triggerSweep = () => {
      if (!ctx || isMuted || !activeOscillators.has(osc)) return;
      const targetFreq = isHigh ? 880 : 440;
      try {
        osc.frequency.cancelScheduledValues(ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(targetFreq, ctx.currentTime + 0.25);
        isHigh = !isHigh;
      } catch {}
    };

    triggerSweep();
    if (sweepInterval) clearInterval(sweepInterval);
    sweepInterval = setInterval(triggerSweep, 300);
  } catch (err) {
    console.error('Audio siren error:', err);
  }
}

/**
 * Hospital Medical Alert Chime for Receptionist.
 * Plays a distinct 2-tone chime (E5 659Hz -> A5 880Hz) with smooth exponential decay.
 */
export function playHospitalChime() {
  if (typeof window === 'undefined') return;
  if (isMuted) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Tone 1: E5 (659.25 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    activeOscillators.add(osc1);
    activeGainNodes.add(gain1);
    osc1.onended = () => {
      activeOscillators.delete(osc1);
      activeGainNodes.delete(gain1);
    };

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.01, now);
    gain1.gain.linearRampToValueAtTime(0.35, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.5);

    // Tone 2: A5 (880 Hz) - slightly louder and higher
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    activeOscillators.add(osc2);
    activeGainNodes.add(gain2);
    osc2.onended = () => {
      activeOscillators.delete(osc2);
      activeGainNodes.delete(gain2);
    };

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.2);
    gain2.gain.setValueAtTime(0.01, now + 0.2);
    gain2.gain.linearRampToValueAtTime(0.4, now + 0.24);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.2);
    osc2.stop(now + 0.9);
  } catch (err) {
    console.error('Hospital chime error:', err);
  }
}

/**
 * Instantly, synchronously terminates all siren sound output.
 */
export function stopSiren() {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }

  // 1. Immediately zero out and disconnect all active gain nodes
  activeGainNodes.forEach((gn) => {
    try {
      if (audioCtx) {
        gn.gain.cancelScheduledValues(0);
        gn.gain.setValueAtTime(0, audioCtx.currentTime);
      }
      gn.disconnect();
    } catch {}
  });
  activeGainNodes.clear();

  // 2. Immediately stop and disconnect all active oscillators
  activeOscillators.forEach((osc) => {
    try {
      osc.stop(0);
      osc.disconnect();
    } catch {}
  });
  activeOscillators.clear();

  // 3. Suspend AudioContext to silence any hardware stream instantly
  if (audioCtx && audioCtx.state === 'running') {
    try {
      audioCtx.suspend().catch(() => {});
    } catch {}
  }
}

/**
 * Hard mute: completely stops audio and sets isMuted to true.
 */
export function muteSiren() {
  isMuted = true;
  stopSiren();
}

/**
 * Unmute: allows siren to play again when next triggered.
 */
export function unmuteSiren() {
  isMuted = false;
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
}

export function isSirenMutedState(): boolean {
  return isMuted;
}
