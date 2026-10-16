// Web Audio API siren for emergency alarm - zero external audio dependencies
let audioCtx: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let sweepInterval: NodeJS.Timeout | null = null;

export function playSiren() {
  if (typeof window === 'undefined') return;

  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    if (oscillator) {
      stopSiren();
    }

    oscillator = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();

    oscillator.type = 'sawtooth';
    gainNode.gain.setValueAtTime(0.01, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.1);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();

    // Frequency sweep 880Hz -> 440Hz every 500ms
    let isHigh = true;
    const triggerSweep = () => {
      if (!audioCtx || !oscillator) return;
      const targetFreq = isHigh ? 880 : 440;
      oscillator.frequency.cancelScheduledValues(audioCtx.currentTime);
      oscillator.frequency.linearRampToValueAtTime(targetFreq, audioCtx.currentTime + 0.25);
      isHigh = !isHigh;
    };

    triggerSweep();
    sweepInterval = setInterval(triggerSweep, 300);
  } catch (err) {
    console.error('Audio siren error:', err);
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
