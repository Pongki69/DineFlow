// Small interface sounds, synthesised on the fly (no audio files to load).
// Each sound is a short run of soft sine notes: [frequency Hz, seconds].
const TONES = {
  add: [
    [660, 0.06],
    [990, 0.1],
  ],
  tap: [[540, 0.045]],
  remove: [
    [440, 0.05],
    [330, 0.09],
  ],
  open: [[620, 0.05]],
  success: [
    [523, 0.08],
    [659, 0.08],
    [784, 0.16],
  ],
  // Two bright rising pairs: noticeable over kitchen noise.
  newTicket: [
    [880, 0.1],
    [1175, 0.14],
    [880, 0.1],
    [1175, 0.2],
  ],
};
const STORAGE_KEY = "dineflow:sounds";
let context = null;

export function soundsEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundsEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Storage can be blocked; the sound simply stays at its default.
  }
}

/** @param {"add"|"tap"|"remove"|"open"|"success"|"newTicket"} name */
export function playSound(name) {
  const notes = TONES[name];
  if (!notes || !soundsEnabled()) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    context ||= new Audio();
    if (context.state === "suspended") context.resume();
    let at = context.currentTime;
    for (const [frequency, length] of notes) {
      const tone = context.createOscillator();
      const volume = context.createGain();
      tone.type = "sine";
      tone.frequency.value = frequency;
      volume.gain.setValueAtTime(0.0001, at);
      volume.gain.exponentialRampToValueAtTime(
        name === "newTicket" ? 0.22 : 0.09,
        at + 0.012,
      );
      volume.gain.exponentialRampToValueAtTime(0.0001, at + length);
      tone.connect(volume).connect(context.destination);
      tone.start(at);
      tone.stop(at + length + 0.02);
      at += length * 0.8;
    }
  } catch {
    // Audio is a nicety: never let it break a tap.
  }
}
