// High-Phonic Audio Synthesis Engine
// Pure Web Audio API — No external network dependancies or files needed.
// Designed with acoustic hospitality and human psychology in mind to sound warm, calm, and satisfying.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  // Resume context if suspended (security sandbox browser policy)
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Plays a luxurious gentle bell tone.
 * Map steps to beautiful pentatonic notes for harmonious sequence progression.
 */
export function playGentleChime(step: number = 1) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Pentatonic scale notes (C5, D5, E5, G5, A5)
  const notes = [523.25, 587.33, 659.25, 783.99, 880.00];
  const freq = notes[(step - 1) % notes.length] || 523.25;

  // Create nodes
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();

  // Primary note: Triangle for warm warmth
  osc1.type = 'triangle';
  osc1.frequency.setValueAtTime(freq, now);

  // Subharmonic crystal octave: Sine for crystal clarity
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2, now);
  
  // Setup low-pass filter to block harsh harmonics
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1200, now);
  filter.Q.setValueAtTime(1, now);

  // Connection routing
  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  // Soft attack, organic decay envelope
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.08, now + 0.04); // subtle entry
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 1.2); // long natural decay

  // Start & stop schedule
  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 1.3);
  osc2.stop(now + 1.3);
}

/**
 * Plays a rich, swelling, majestic ambient chord indicating launcher dispatch.
 */
export function playLaunchSwell() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // High-fidelity rich major triad chord (C5, E5, G5, C6)
  const frequencies = [523.25, 659.25, 783.99, 1046.50];
  
  const oscs = frequencies.map((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = i % 2 === 0 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    // Subtle vibrato/detune to make it feel organic and rich
    osc.detune.setValueAtTime((i - 1.5) * 4, now);
    return osc;
  });

  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(400, now);
  // Sweet sweeping filter to make it sound warm and comforting
  filter.frequency.exponentialRampToValueAtTime(1400, now + 0.5);
  filter.Q.setValueAtTime(1.5, now);

  oscs.forEach(osc => osc.connect(filter));
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  // Soft rising volume swell, then elegant dissolving fade out
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.12, now + 0.6);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);

  oscs.forEach(osc => {
    osc.start(now);
    osc.stop(now + 2.6);
  });
}

/**
 * Plays a marvelous cascading harp chord wash.
 * Rising major-7th / pentatonic sparkling cascade + celebratory final tones.
 */
export function playVictoryCelebration() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Golden ratio cascading notes sequence (C5, E5, G5, B5, C6, E6, G6, B6, C7)
  const scale = [523.25, 659.25, 783.99, 987.77, 1046.50, 1318.51, 1567.98, 1975.53, 2093.00];

  scale.forEach((freq, idx) => {
    const delay = idx * 0.08; // sequential cascade rate
    
    setTimeout(() => {
      // Create components for this individual droplet Note
      const noteCtx = getAudioContext();
      if (!noteCtx) return;
      
      const t = noteCtx.currentTime;
      const osc = noteCtx.createOscillator();
      const sine = noteCtx.createOscillator();
      const nodeGain = noteCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      
      sine.type = 'triangle';
      sine.frequency.setValueAtTime(freq * 0.5, t); // lower warm support octave

      nodeGain.gain.setValueAtTime(0, t);
      nodeGain.gain.linearRampToValueAtTime(0.04, t + 0.02);
      nodeGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);

      osc.connect(nodeGain);
      sine.connect(nodeGain);
      nodeGain.connect(noteCtx.destination);

      osc.start(t);
      sine.start(t);
      
      osc.stop(t + 0.82);
      sine.stop(t + 0.82);
    }, delay * 1000);
  });
}

/**
 * Plays an ultra-subtle, elegant tactile tap feedback sound.
 * Designed conceptually from sensory response curves with a very short envelope decay.
 */
export function playSoftTap() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, now);
  osc.frequency.exponentialRampToValueAtTime(90, now + 0.04);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(350, now);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  // Extremely transient elegant volume ramp & decay
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.035, now + 0.004);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

  osc.start(now);
  osc.stop(now + 0.07);
}

/**
 * Plays an organic wet popping sound. Used when selecting niches.
 * Volume optimized for clean, beautiful feedback.
 */
export function playSoftBubble() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();

  // Wet bubble frequency sweep
  osc.type = 'sine';
  osc.frequency.setValueAtTime(280, now);
  osc.frequency.exponentialRampToValueAtTime(900, now + 0.06);

  // High Q bandpass sweeps with the sound to filter harmonics beautifully
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(320, now);
  filter.frequency.exponentialRampToValueAtTime(1000, now + 0.06);
  filter.Q.setValueAtTime(4, now);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  gainNode.gain.setValueAtTime(0, now);
  // Lifted from 0.08 to 0.35 to make it louder but identically organic
  gainNode.gain.linearRampToValueAtTime(0.35, now + 0.008);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);

  osc.start(now);
  osc.stop(now + 0.1);
}

/**
 * Plays a bubbly TikTok-like tactile double-pop.
 * Combines two hyper-swift, ascending frequency wave micro-pulses
 * staggered by 45ms to simulate the ultimate physiological dopamine-friendly "like" click.
 */
export function playTiktokLike() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // -- First Tap (Bloop) --
  const osc1 = ctx.createOscillator();
  const filter1 = ctx.createBiquadFilter();
  const gain1 = ctx.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(380, now);
  osc1.frequency.exponentialRampToValueAtTime(1000, now + 0.035);

  filter1.type = 'lowpass';
  filter1.frequency.setValueAtTime(1400, now);

  osc1.connect(filter1);
  filter1.connect(gain1);
  gain1.connect(ctx.destination);

  gain1.gain.setValueAtTime(0, now);
  gain1.gain.linearRampToValueAtTime(0.18, now + 0.003);
  gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

  osc1.start(now);
  osc1.stop(now + 0.05);

  // -- Second Tap (Slightly staggered and higher pitch for the double pop feel) --
  const delaySec = 0.045; // 45ms staggered delay
  const osc2 = ctx.createOscillator();
  const filter2 = ctx.createBiquadFilter();
  const gain2 = ctx.createGain();

  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(480, now + delaySec);
  osc2.frequency.exponentialRampToValueAtTime(1350, now + delaySec + 0.035);

  filter2.type = 'lowpass';
  filter2.frequency.setValueAtTime(1700, now + delaySec);

  osc2.connect(filter2);
  filter2.connect(gain2);
  gain2.connect(ctx.destination);

  gain2.gain.setValueAtTime(0, now + delaySec);
  gain2.gain.linearRampToValueAtTime(0.18, now + delaySec + 0.003);
  gain2.gain.exponentialRampToValueAtTime(0.0001, now + delaySec + 0.045);

  osc2.start(now + delaySec);
  osc2.stop(now + delaySec + 0.05);
}

/**
 * Plays a light crystalline chime glass tone. Used when selecting layout templates.
 */
export function playElegantBell() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();

  // C6 glass harmonic bell
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(1046.50, now);
  
  // High-harmonic sheen
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(2093.00, now);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1800, now);

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.04, now + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + 0.45);
  osc2.stop(now + 0.45);
}

/**
 * Plays a sharp tactile step tick. Used when dragging slider knobs or increments.
 */
export function playSlideTick() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1800, now);
  osc.frequency.setValueAtTime(50, now + 0.01);

  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.015, now + 0.002);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.02);
}

/**
 * Plays a bright, resonant success chime when a user confirms a major action.
 */
export function playConfirmSuccess() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // A bright ascending major chord (C5, E5, G5) played very quickly
  const freqs = [523.25, 659.25, 783.99];
  
  freqs.forEach((freq, idx) => {
    const delay = idx * 0.05;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + delay);
    
    gainNode.gain.setValueAtTime(0, now + delay);
    gainNode.gain.linearRampToValueAtTime(0.1, now + delay + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.4);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now + delay);
    osc.stop(now + delay + 0.45);
  });
}

/**
 * Plays a quick, elegant pop when a modal/dialog opens.
 */
export function playDialogPop() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();

  // Quick upward sweep for spatial "opening" feel
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(440, now + 0.05);

  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.08, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.12);
}

/**
 * Plays a muted, downward tone when an action is canceled.
 */
export function playCancelTone() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();

  // Gentle downward sweep
  osc.type = 'sine';
  osc.frequency.setValueAtTime(300, now);
  osc.frequency.exponentialRampToValueAtTime(150, now + 0.15);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(600, now);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.06, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

  osc.start(now);
  osc.stop(now + 0.25);
}

/**
 * Plays a double warm subharmonic diagnostic alert.
 * Gentle yet clearly warning to trigger when a plan quota error occurs.
 */
export function playElegantError() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Double low pulses (G3 -> Eb3)
  const pulseFreqs = [196.00, 155.56];
  
  pulseFreqs.forEach((freq, idx) => {
    const delay = idx * 0.12;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gainNode = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now + delay);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, now + delay);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    gainNode.gain.setValueAtTime(0, now + delay);
    gainNode.gain.linearRampToValueAtTime(0.08, now + delay + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.22);

  osc.start(now + delay);
  osc.stop(now + delay + 0.25);
  });
}

/**
 * Plays a magic whoosh — ascending triangle sweep for when AI begins
 * generating a template. Feels like a wand cast.
 */
export function playMagicWhoosh() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gainNode = ctx.createGain();

  osc.type = 'triangle';
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(1200, now + 0.22);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(600, now);
  filter.frequency.exponentialRampToValueAtTime(2000, now + 0.22);

  osc.connect(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);

  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(0.06, now + 0.03);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

  osc.start(now);
  osc.stop(now + 0.3);
}

