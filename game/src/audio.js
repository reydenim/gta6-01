// audio.js — procedural WebAudio only. Engine hum, sirens, pickups, punch, music loop.
// No audio files, no network. Created on the first user gesture (Play button).
window.SOL = window.SOL || {};
SOL.audio = (() => {
  let ctx = null, master = null, muted = false;
  let engineOsc = null, engineOsc2 = null, engineGain = null, engineFilter = null;
  let sirenOsc = null, sirenGain = null, sirenTimer = 0, sirenHigh = false;
  let musicTimer = null, musicStep = 0;
  const MUSIC_BASS = [55, 0, 55, 0, 65.41, 0, 49, 0, 55, 0, 55, 0, 73.42, 65.41, 49, 0]; // A1 C2 G1 D2...

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    // Engine: two detuned saws through a lowpass, pitch follows speed.
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 60;
    engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'sawtooth'; engineOsc2.frequency.value = 91;
    engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 400;
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    engineOsc.connect(engineFilter); engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain); engineGain.connect(master);
    engineOsc.start(); engineOsc2.start();
    // Siren: square wave that alternates two tones.
    sirenOsc = ctx.createOscillator(); sirenOsc.type = 'square'; sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain); sirenGain.connect(master);
    sirenOsc.start();
  }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = muted ? 0 : 0.5;
  }
  function isMuted() { return muted; }
  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noiseBurst(dur, vol, filterFreq) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
    const g = ctx.createGain(); g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }
  function pickup() { blip(660, 0.09, 'sine', 0.3); blip(880, 0.12, 'sine', 0.3, 0.08); blip(1320, 0.16, 'sine', 0.25, 0.16); }
  function missionDone() { [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.18, 'triangle', 0.3, i * 0.09)); }
  function punch() { noiseBurst(0.12, 0.4, 900); blip(90, 0.14, 'sine', 0.4); }
  function crash() { noiseBurst(0.25, 0.5, 700); blip(60, 0.2, 'sine', 0.4); }
  function busted() { blip(440, 0.15, 'square', 0.2); blip(330, 0.3, 'square', 0.2, 0.15); }
  // Called every frame: engine pitch from speed, siren from nearest police distance.
  function update(speedNorm, driving, nearestPoliceDist) {
    if (!ctx) return;
    const t = ctx.currentTime;
    if (engineGain) {
      const target = driving ? 0.05 + speedNorm * 0.09 : 0.0;
      engineGain.gain.setTargetAtTime(target, t, 0.1);
      const f = 55 + speedNorm * 140;
      engineOsc.frequency.setTargetAtTime(f, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(f * 1.494, t, 0.08);
      engineFilter.frequency.setTargetAtTime(300 + speedNorm * 900, t, 0.1);
    }
    if (sirenGain) {
      const near = nearestPoliceDist != null && nearestPoliceDist < 90;
      const vol = near ? Math.max(0, 0.12 * (1 - nearestPoliceDist / 90)) : 0;
      sirenGain.gain.setTargetAtTime(vol, t, 0.2);
      if (near) {
        sirenTimer -= 1 / 60;
        if (sirenTimer <= 0) {
          sirenTimer = 0.42;
          sirenHigh = !sirenHigh;
          sirenOsc.frequency.setTargetAtTime(sirenHigh ? 950 : 700, t, 0.02);
        }
      }
    }
  }
  function startMusic() {
    if (!ctx || musicTimer) return;
    musicTimer = setInterval(() => {
      if (muted || !ctx) return;
      const step = musicStep % 16;
      const bass = MUSIC_BASS[step];
      if (bass) blip(bass, 0.22, 'triangle', 0.16);
      if (step % 4 === 2) blip(220, 0.05, 'square', 0.05);
      if (step % 2 === 0) noiseBurst(0.03, 0.06, 6000); // hat tick
      musicStep++;
    }, 150);
  }
  function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
  return { init, resume, setMuted, isMuted, pickup, missionDone, punch, crash, busted, update, startMusic, stopMusic };
})();
