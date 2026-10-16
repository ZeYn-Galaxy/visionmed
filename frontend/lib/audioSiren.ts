// Web Audio API siren & chime for emergency alarm - zero external audio dependencies
let audioCtx: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let sweepInterval: NodeJS.Timeout | null = null;

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
    if (audioCtx && audioCtx.state === 'suspended') {
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
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {}
  };
  window.addEventListener('click', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('touchstart', unlock, { once: true });
}

export function playSiren() {
  if (typeof window === 'undefined') return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    if (oscillator) {
      stopSiren();
    }

    oscillator = ctx.createOscillator();
    gainNode = ctx.createGain();

    oscillator.type = 'sawtooth';
    gainNode.gain.setValueAtTime(0.01, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.08);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start();

    // Frequency sweep 880Hz -> 440Hz every 300ms
    let isHigh = true;
    const triggerSweep = () => {
      if (!ctx || !oscillator) return;
      const targetFreq = isHigh ? 880 : 440;
      try {
        oscillator.frequency.cancelScheduledValues(ctx.currentTime);
        oscillator.frequency.linearRampToValueAtTime(targetFreq, ctx.currentTime + 0.25);
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

export function stopSiren() {
  if (sweepInterval) {
    clearInterval(sweepInterval);
    sweepInterval = null;
  }

  if (gainNode && audioCtx) {
    try {
      gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    } catch {
      // ignore
    }
  }

  setTimeout(() => {
    if (oscillator) {
      try {
        oscillator.stop();
        oscillator.disconnect();
      } catch {
        // ignore
      }
      oscillator = null;
    }
  }, 160);
}

